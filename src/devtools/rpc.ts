import { configuredDeployment, deploymentEnvNames, isDevDeployment } from '../env-push'
import type { FindingService } from '../findings'
import { doctorReport } from '../preflight'
import { envTier, resolveBackendSource } from './info'
import type { DevtoolsCatalogSummary, DevtoolsDeploymentEnv, DevtoolsDoctorRun, DevtoolsServerInfo, ServerFunctions } from './rpc-types'

/** How long one read of the deployment's env names is reused. */
export const DEPLOYMENT_ENV_TTL_MS = 60_000

export interface DevtoolsRpcContext {
  rootDir: string
  functionsDir: string
  /** The `getInfo` payload, given the last read of the deployment env. */
  buildInfo(deploymentEnv: DevtoolsDeploymentEnv | null): DevtoolsServerInfo
  /** Called after each read of the deployment env, so the panel can be told. */
  onDeploymentEnvRead?(): void
  /** The Convex CLI's env name listing; injectable for tests. */
  listDeploymentEnvNames?(rootDir: string): Promise<string[] | null>
  /** The doctor checks and the catalog reader; injectable for tests. */
  runDoctorChecks?(rootDir: string, only?: string[]): Promise<DevtoolsDoctorRun['findings']>
  readCatalogSummary?(rootDir: string): Promise<DevtoolsCatalogSummary>
  now?(): number
}

export interface DevtoolsRpc {
  functions: ServerFunctions
  /** Drop the cached deployment env read (an env file changed). */
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
  // Loaded on first use: the checks pull in the billing SDK, and the catalog
  // reader imports the app's own modules.
  const runChecks = context.runDoctorChecks
    ?? (async (rootDir: string, only?: string[]) => (await import('../doctor')).runDoctorChecks(rootDir, { prod: false, ...(only ? { only: only as FindingService[] } : {}) }))
  const readCatalog = context.readCatalogSummary
    ?? (async (rootDir: string) => (await import('./catalog')).readCatalogSummary(rootDir))

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
    getInfo: () => context.buildInfo(cached),
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
        .then(findings => ({ ranAt: now(), findings, report: JSON.stringify(doctorReport(findings), null, 2) }))
        .catch((error: unknown) => ({ ranAt: now(), findings: [], error: error instanceof Error ? error.message : String(error) }))
        .finally(() => {
          doctorRuns.delete(key)
        })
      doctorRuns.set(key, run)
      return run
    },
    getCatalog: () => readCatalog(context.rootDir),
    resolveBackendSource: file => resolveBackendSource(context.rootDir, context.functionsDir, file),
  }

  return {
    functions,
    invalidate() {
      cached = null
    },
  }
}
