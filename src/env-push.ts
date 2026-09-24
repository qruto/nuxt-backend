/**
 * `env push` — sync the backend env contract onto the Convex deployment.
 *
 * `.env.local` is the single write-once place for provider keys; this engine
 * forwards them to the deployment (values pass as argv, never through a
 * shell), and on `dev:` deployments fills the required gaps so the
 * three-command onboarding needs zero manual `convex env set`:
 * AUTH_SECRET is generated, SITE_URL defaults to localhost, and OTP codes are
 * echoed to the convex dev console until a real email transport exists.
 *
 * Split into a pure planner (unit-testable) and a spawning executor, shared
 * by the CLI command (`nuxt-backend env push`) and the module's dev-startup
 * auto-provision (`backend.autoEnv`). Deployment values are never read —
 * only names via `convex env list` — and existing values are never
 * overwritten.
 */
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEV_ONLY_DEPLOYMENT_ENV, OPTIONAL_DEPLOYMENT_ENV, REQUIRED_DEPLOYMENT_ENV } from './preflight'
import { deriveDeploymentUrls, isDevDeploymentId, parseEnvFile } from './deployment'
import { runConvex } from './convex-cli'

export const BACKEND_ENV_NAMES = [
  ...REQUIRED_DEPLOYMENT_ENV,
  ...Object.keys(OPTIONAL_DEPLOYMENT_ENV) as (keyof typeof OPTIONAL_DEPLOYMENT_ENV)[],
] as const

export interface EnvPushAction {
  name: string
  action:
    /** Local value forwarded to the deployment. */
    | 'forward'
    /** Dev-only: value invented (generated secret / localhost default). */
    | 'provision'
    /** Already set on the deployment — left alone unless forced. */
    | 'skip'
    /** Already set, and replaced with the local value because it was forced. */
    | 'update'
    /** Required var with no source — blocks a production push. */
    | 'missing'
    /** Optional var with no source — informational only. */
    | 'unset'
  /** Value to set for forward/provision (never printed). */
  value?: string
  /** Human line for the summary table. */
  detail: string
}

export interface EnvPushPlanInput {
  /** Env var names present on the deployment (`convex env list`). */
  deployedNames: string[]
  /** Merged local `.env` + `.env.local` values. */
  localEnv: Record<string, string>
  /** Treat as a dev deployment (gap-filling allowed). */
  dev: boolean
  /**
   * Names whose deployment value may be replaced by the local one. Rotation is
   * deliberate: a push never overwrites a live secret on its own, because the
   * plan compares presence, not values — it reads names only, so the CLI can
   * never tell a rotated key from an identical one.
   */
  force?: ReadonlySet<string>
}

/**
 * Decide what to do per var. Pure; exported for tests — `runEnvPush` is the
 * flow the CLI and the module call.
 *
 * @internal
 */
export function planEnvPush({ deployedNames, localEnv, dev, force }: EnvPushPlanInput): EnvPushAction[] {
  const deployed = new Set(deployedNames)
  const actions: EnvPushAction[] = []

  for (const name of BACKEND_ENV_NAMES) {
    const local = localEnv[name]
    if (deployed.has(name)) {
      const replaceable = force?.has(name) && local !== undefined && local !== ''
      if (!replaceable) {
        actions.push({
          name,
          action: 'skip',
          detail: force?.has(name)
            ? 'no local value to replace it with'
            : 'already set on the deployment (--force to replace)',
        })
        continue
      }
      // A dev-only var still never reaches a non-dev deployment, forced or not.
      if (!dev && DEV_ONLY_DEPLOYMENT_ENV.has(name)) {
        actions.push({ name, action: 'unset', detail: 'dev-only — not forwarded to a non-dev deployment' })
        continue
      }
      actions.push({ name, action: 'update', value: local, detail: 'replaced from .env(.local)' })
      continue
    }
    // Dev-only vars (loopback origin trust) never leave the workstation for a
    // non-dev deployment, even when .env.local carries them.
    if (!dev && DEV_ONLY_DEPLOYMENT_ENV.has(name)) {
      actions.push({ name, action: 'unset', detail: local ? 'dev-only — not forwarded to a non-dev deployment' : 'dev-only — not applicable to a non-dev deployment' })
      continue
    }
    if (local !== undefined && local !== '') {
      actions.push({ name, action: 'forward', value: local, detail: 'forwarded from .env(.local)' })
      continue
    }
    const required = (REQUIRED_DEPLOYMENT_ENV as readonly string[]).includes(name)
    if (required && dev) {
      actions.push(name === 'AUTH_SECRET'
        ? { name, action: 'provision', value: randomBytes(32).toString('base64'), detail: 'generated (dev deployment)' }
        : { name, action: 'provision', value: 'http://localhost:3000', detail: 'dev default' })
    }
    else if (required) {
      actions.push({ name, action: 'missing', detail: 'required — set it in .env.local (or the dashboard) and push again' })
    }
    else {
      actions.push({ name, action: 'unset', detail: `optional — ${OPTIONAL_DEPLOYMENT_ENV[name as keyof typeof OPTIONAL_DEPLOYMENT_ENV]}` })
    }
  }

  // Dev without a transport: echo OTP codes to the convex dev console so the
  // very first sign-in works. Left alone once EMAIL_API_KEY exists anywhere.
  const emailKeyAvailable = deployed.has('EMAIL_API_KEY') || Boolean(localEnv.EMAIL_API_KEY)
  if (dev && !emailKeyAvailable && !deployed.has('NUXT_BACKEND_LOG_OTP')) {
    actions.push({ name: 'NUXT_BACKEND_LOG_OTP', action: 'provision', value: '1', detail: 'no email transport — OTP codes print in the convex dev console' })
  }

  return actions
}

/** Minimal .env parser — enough for KEY=VALUE lines (dotenv-style). */
export function readEnvFiles(rootDir: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const name of ['.env', '.env.local']) {
    const path = join(rootDir, name)
    if (!existsSync(path)) continue
    // One parser for both readers (deployment.ts), so an inline comment is
    // dropped here too — `CONVEX_DEPLOYMENT=dev:<slug> # team: …` as written.
    Object.assign(env, parseEnvFile(readFileSync(path, 'utf-8')))
  }
  return env
}

/**
 * The Convex CLI flags that select the deployment to act on. `--prod` is
 * explicit because the ambient selection is not production: `.env.local`
 * names a dev deployment, and without the flag every `env` / `run` /
 * `function-spec` call acts on it. Only `convex deploy` implies production
 * on its own. A deploy key for one deployment (`CONVEX_DEPLOY_KEY`) selects
 * that deployment instead; the CLI then ignores `--prod`, so passing it is
 * harmless.
 */
export function deploymentFlags(options: { prod?: boolean } = {}): string[] {
  return options.prod ? ['--prod'] : []
}

/**
 * Read deployment env var NAMES via `convex env list --names-only`: the
 * values are never requested, so a production secret never reaches this
 * process. (`--names-only` arrived in convex 1.42; the peer range starts
 * at 1.43.)
 */
export async function deploymentEnvNames(rootDir: string, options: { prod?: boolean } = {}): Promise<string[] | null> {
  try {
    const { stdout } = await runConvex(rootDir, ['env', 'list', '--names-only', ...deploymentFlags(options)])
    return stdout
      .split('\n')
      .map(line => line.split('=')[0]?.trim() ?? '')
      .filter(name => /^[A-Z][A-Z0-9_]*$/.test(name))
  }
  catch {
    return null
  }
}

export interface EnvPushResult {
  action: EnvPushAction
  outcome: 'set' | 'skipped' | 'planned' | 'failed'
  error?: string
}

export interface ExecuteEnvPushOptions {
  dryRun?: boolean
  /** Set on the production deployment (`convex env set --prod`). */
  prod?: boolean
  /** Injectable spawner for tests. */
  setEnv?: (rootDir: string, name: string, value: string) => Promise<void>
}

/** Values pass as argv with no shell, on every platform. */
async function defaultSetEnv(rootDir: string, name: string, value: string, prod: boolean): Promise<void> {
  await runConvex(rootDir, ['env', 'set', ...deploymentFlags({ prod }), name, value])
}

/**
 * Apply a plan (`planEnvPush`) to the deployment. Exported for tests (the
 * `convex env set` spawner is injectable).
 *
 * @internal
 */
export async function executeEnvPush(
  rootDir: string,
  actions: EnvPushAction[],
  { dryRun = false, prod = false, setEnv = (dir, name, value) => defaultSetEnv(dir, name, value, prod) }: ExecuteEnvPushOptions = {},
): Promise<EnvPushResult[]> {
  const results: EnvPushResult[] = []
  for (const action of actions) {
    if (action.action !== 'forward' && action.action !== 'provision' && action.action !== 'update') {
      results.push({ action, outcome: 'skipped' })
      continue
    }
    if (dryRun) {
      results.push({ action, outcome: 'planned' })
      continue
    }
    try {
      await setEnv(rootDir, action.name, action.value ?? '')
      results.push({ action, outcome: 'set' })
    }
    catch (error) {
      results.push({ action, outcome: 'failed', error: error instanceof Error ? error.message : String(error) })
    }
  }
  return results
}

export interface EnvPushRunResult {
  deployment: string | null
  dev: boolean
  results: EnvPushResult[]
  /** Required vars with no source on a non-dev push. */
  missingRequired: string[]
}

/**
 * The configured deployment id (`CONVEX_DEPLOYMENT`): process env over
 * `.env(.local)`. Read directly rather than via URL derivation, which has
 * nothing to say about a local backend whose URLs were not written.
 */
export function configuredDeployment(rootDir: string): string | null {
  return process.env.CONVEX_DEPLOYMENT
    ?? readEnvFiles(rootDir).CONVEX_DEPLOYMENT
    ?? deriveDeploymentUrls(rootDir)?.deployment
    ?? null
}

/**
 * Whether the configured deployment is dev-class — cloud dev (`dev:`), a
 * CLI-managed local (`local:`) or an anonymous local (`anonymous:`)
 * deployment: all disposable, never prod.
 */
export function isDevDeployment(rootDir: string): boolean {
  return isDevDeploymentId(configuredDeployment(rootDir))
}

/** The whole flow shared by the CLI and the module's dev auto-provision. */
export async function runEnvPush(rootDir: string, options: { prod?: boolean, dryRun?: boolean, force?: ReadonlySet<string>, setEnv?: ExecuteEnvPushOptions['setEnv'] } = {}): Promise<EnvPushRunResult | null> {
  const deployedNames = await deploymentEnvNames(rootDir, { prod: options.prod })
  if (deployedNames === null) return null

  // Dev-class deployments get required-gap filling. Under --prod the target is
  // the project's production deployment, whatever .env.local names.
  const deployment = options.prod ? 'production' : configuredDeployment(rootDir)
  const dev = !options.prod && isDevDeployment(rootDir)
  const actions = planEnvPush({ deployedNames, localEnv: readEnvFiles(rootDir), dev, ...(options.force ? { force: options.force } : {}) })
  const results = await executeEnvPush(rootDir, actions, { dryRun: options.dryRun, prod: options.prod, ...(options.setEnv ? { setEnv: options.setEnv } : {}) })
  return {
    deployment,
    dev,
    results,
    missingRequired: actions.filter(action => action.action === 'missing').map(action => action.name),
  }
}
