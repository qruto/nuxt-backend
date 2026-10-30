import { configuredDeployment, deploymentEnvNames, isDevDeployment } from '../env-push'
import { CAPABILITY_NAMES, type CapabilityName } from '../capabilities'
import { doctorReport, type PreflightFinding } from '../preflight'
import { envTier, resolveBackendSource, type DevtoolsLastDoctorRun } from './info'
import type { AnalyzeReport } from '../analyze/types'
import type { DevtoolsBackendHealth, DevtoolsBundles, DevtoolsCatalogSummary, DevtoolsDeploymentEnv, DevtoolsDoctorRun, DevtoolsEmailPreviews, DevtoolsEmailPreviewSend, DevtoolsServerInfo, ServerFunctions } from './rpc-types'

/** How long one read of the deployment's env names is reused. */
export const DEPLOYMENT_ENV_TTL_MS = 60_000

export interface DevtoolsRpcContext {
  rootDir: string
  functionsDir: string
  /** The `getInfo` payload, given the last read of the deployment env and the doctor runs since the env last changed. */
  buildInfo(deploymentEnv: DevtoolsDeploymentEnv | null, doctor: DevtoolsLastDoctorRun | null): DevtoolsServerInfo
  /** Called after each read of the deployment env, so the panel can be told. */
  onDeploymentEnvRead?(): void
  /** Called after each doctor run, whose findings the capability console reads. */
  onDoctorRun?(): void
  /** The Convex CLI's env name listing; injectable for tests. */
  listDeploymentEnvNames?(rootDir: string): Promise<string[] | null>
  /** The doctor checks and the catalog reader; injectable for tests. */
  runDoctorChecks?(rootDir: string, only?: string[]): Promise<DevtoolsDoctorRun['findings']>
  readCatalogSummary?(rootDir: string): Promise<DevtoolsCatalogSummary>
  /** The mounts and maintenance reader; injectable for tests. */
  readBackendHealth?(rootDir: string): Promise<DevtoolsBackendHealth>
  /** The email previews and their test send, through the Convex CLI; injectable for tests. */
  readEmailPreviews?(rootDir: string, locale?: string): Promise<DevtoolsEmailPreviews>
  sendEmailPreview?(rootDir: string, options: { key: string, locale?: string }): Promise<DevtoolsEmailPreviewSend>
  /** The last `analyze` run, and a new measurement of the Convex bundle; injectable for tests. */
  readLastBundles?(rootDir: string): Promise<AnalyzeReport | null>
  measureBundles?(rootDir: string): Promise<AnalyzeReport>
  now?(): number
}

export interface DevtoolsRpc {
  functions: ServerFunctions
  /** Drop the cached deployment env read and the doctor runs' findings (an env file changed). */
  invalidate(): void
}

/**
 * The server half of the panel's RPC. `getInfo` stays synchronous and cheap;
 * the one slow fact, the deployment's env names (a Convex CLI spawn), comes
 * from `getDeploymentEnv` — cached for a minute, one read in flight at a
 * time, and only ever against a dev deployment.
 */
export function createDevtoolsRpc(context: DevtoolsRpcContext): DevtoolsRpc {
  const now = context.now ?? Date.now
  const listNames = context.listDeploymentEnvNames ?? ((rootDir: string) => deploymentEnvNames(rootDir))
  let cached: DevtoolsDeploymentEnv | null = null
  let inflight: Promise<DevtoolsDeploymentEnv> | null = null
  const doctorRuns = new Map<string, Promise<DevtoolsDoctorRun>>()
  // The doctor runs' findings, by id: a run replaces every finding of the
  // capabilities it covered (all of them without `only`), so a check it no longer
  // reports goes too. An env change drops them all.
  const doctorFindings = new Map<string, PreflightFinding>()
  let doctorRanAt: number | null = null
  // Loaded on first use: the checks pull in the billing SDK, and the catalog
  // reader imports the app's own modules.
  const runChecks = context.runDoctorChecks
    ?? (async (rootDir: string, only?: string[]) => (await import('../doctor')).runDoctorChecks(rootDir, { prod: false, ...(only ? { only: only as CapabilityName[] } : {}) }))
  const readCatalog = context.readCatalogSummary
    ?? (async (rootDir: string) => (await import('./catalog')).readCatalogSummary(rootDir))
  // Loaded on first use too: it parses the app's files and spawns the CLI.
  const readHealth = context.readBackendHealth
    ?? (async (rootDir: string) => (await import('./health')).readBackendHealth(rootDir, now))
  // Loaded on first use: they spawn the CLI against the dev deployment.
  const readPreviews = context.readEmailPreviews
    ?? (async (rootDir: string, locale?: string) => (await import('./email-previews')).readEmailPreviews(rootDir, locale, now))
  const sendPreview = context.sendEmailPreview
    ?? (async (rootDir: string, options: { key: string, locale?: string }) => (await import('./email-previews')).sendEmailPreview(rootDir, options))
  // Loaded on first use: the analysis pulls in the bundler.
  const readBundles = context.readLastBundles
    ?? (async (rootDir: string) => (await import('../analyze/report')).readLastRun(rootDir))
  const measureBundles = context.measureBundles
    ?? (async (rootDir: string) => (await import('../analyze/run')).runAnalyze(rootDir, { only: 'convex' }))
  let bundlesInflight: Promise<DevtoolsBundles> | null = null
  let health: DevtoolsBackendHealth | null = null
  let healthInflight: Promise<DevtoolsBackendHealth> | null = null

  const unavailable = (reason: string): DevtoolsDeploymentEnv => ({ status: 'unavailable', reason, readAt: now() })

  async function read(): Promise<DevtoolsDeploymentEnv> {
    if (!configuredDeployment(context.rootDir)) return unavailable('No deployment is configured yet (CONVEX_DEPLOYMENT).')
    if (!isDevDeployment(context.rootDir)) {
      return unavailable('The panel reads only a dev deployment. For production, run npx nuxt-backend doctor --prod.')
    }
    try {
      const names = await listNames(context.rootDir)
      if (!names) return unavailable('The Convex CLI could not list the deployment env.')
      const set = new Set(names)
      return { status: 'ok', readAt: now(), names: envTier(name => set.has(name)) }
    }
    catch (error) {
      return unavailable(error instanceof Error ? error.message : String(error))
    }
  }

  const functions: ServerFunctions = {
    getInfo: () => context.buildInfo(cached, doctorRanAt === null ? null : { ranAt: doctorRanAt, findings: [...doctorFindings.values()] }),
    getDeploymentEnv({ refresh = false } = {}) {
      if (!refresh && cached && now() - cached.readAt < DEPLOYMENT_ENV_TTL_MS) return Promise.resolve(cached)
      inflight ??= read()
        .then((result) => {
          cached = result
          context.onDeploymentEnvRead?.()
          return result
        })
        .finally(() => {
          inflight = null
        })
      return inflight
    },
    runDoctor({ only } = {}) {
      // Doctor's reads are read-only, but the panel still never points them
      // at a deployment that is not a dev one.
      if (configuredDeployment(context.rootDir) && !isDevDeployment(context.rootDir)) {
        return Promise.resolve({ ranAt: now(), findings: [], error: 'The panel runs doctor against a dev deployment only. For production, run npx nuxt-backend doctor --prod.' })
      }
      const key = only?.join(',') ?? ''
      const running = doctorRuns.get(key)
      if (running) return running
      const run = runChecks(context.rootDir, only)
        .then((findings) => {
          const covered = new Set<string>(only?.length ? only : CAPABILITY_NAMES)
          for (const [id, finding] of doctorFindings) if (covered.has(finding.capability)) doctorFindings.delete(id)
          for (const finding of findings) doctorFindings.set(finding.id, finding as PreflightFinding)
          doctorRanAt = now()
          context.onDoctorRun?.()
          return { ranAt: doctorRanAt, findings, report: JSON.stringify(doctorReport(findings), null, 2) }
        })
        .catch((error: unknown) => ({ ranAt: now(), findings: [], error: error instanceof Error ? error.message : String(error) }))
        .finally(() => {
          doctorRuns.delete(key)
        })
      doctorRuns.set(key, run)
      return run
    },
    getHealth({ refresh = false } = {}) {
      if (!refresh && health && now() - health.readAt < DEPLOYMENT_ENV_TTL_MS) return Promise.resolve(health)
      healthInflight ??= readHealth(context.rootDir)
        .then((result) => {
          health = result
          return result
        })
        .finally(() => {
          healthInflight = null
        })
      return healthInflight
    },
    getCatalog: () => readCatalog(context.rootDir),
    async getBundles() {
      const report = await readBundles(context.rootDir)
      return report ? { status: 'ok', report } : { status: 'empty' }
    },
    runBundles() {
      bundlesInflight ??= measureBundles(context.rootDir)
        .then((report): DevtoolsBundles => report.failures.length > 0 && report.bundles.length === 0
          ? { status: 'unavailable', reason: report.failures.map(failure => failure.message).join(' ') }
          : { status: 'ok', report })
        .catch((error: unknown): DevtoolsBundles => ({ status: 'unavailable', reason: error instanceof Error ? error.message : String(error) }))
        .finally(() => {
          bundlesInflight = null
        })
      return bundlesInflight
    },
    // Never cached: a preview is the deployment's rendering of the app's
    // templates and messages, which change as the app is edited.
    getEmailPreviews: ({ locale } = {}) => readPreviews(context.rootDir, locale),
    sendEmailPreview: options => sendPreview(context.rootDir, options),
    resolveBackendSource: file => resolveBackendSource(context.rootDir, context.functionsDir, file),
  }

  return {
    functions,
    invalidate() {
      cached = null
      health = null
      doctorFindings.clear()
      doctorRanAt = null
    },
  }
}
