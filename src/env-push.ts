/**
 * `env push` — sync the backend env contract onto the Convex deployment.
 *
 * `.env.local` is the single write-once place for provider keys; this engine
 * forwards them to the deployment (each value on `convex env set`'s stdin —
 * never an argument, never through a shell), and on `dev:` deployments fills
 * the required gaps so the three-command onboarding needs zero manual
 * `convex env set`:
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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { CONTRACT_ENV_NAMES, DEV_ONLY_DEPLOYMENT_ENV, OPTIONAL_DEPLOYMENT_ENV, REQUIRED_DEPLOYMENT_ENV } from './env-registry'
import { deriveDeploymentUrls, isDevDeploymentId, parseEnvFile } from './deployment'
import { runConvex } from './convex-cli'

/** The names `env push` forwards: the deployment's contract, from src/env-registry.ts. */
export const BACKEND_ENV_NAMES = CONTRACT_ENV_NAMES

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
   * Treat as a preview deployment: disposable like dev, so AUTH_SECRET is
   * generated and mail and billing start safe (`PREVIEW_ENV_DEFAULTS`), but
   * SITE_URL is the preview's own origin, which only the caller knows.
   */
  preview?: boolean
  /**
   * Names whose deployment value may be replaced by the local one. Rotation is
   * deliberate: a push never overwrites a live secret on its own, because the
   * plan compares presence, not values — it reads names only, so the CLI can
   * never tell a rotated key from an identical one.
   */
  force?: ReadonlySet<string>
}

/**
 * A name with no value anywhere: what a deployment of this kind gets. Dev and
 * preview deployments are disposable, so a secret is generated for them; dev
 * gets the dev server's origin, a preview starts mail and billing safe and
 * waits for its own origin; anything else never gets a value made up.
 */
function gapAction(name: string, { dev, preview }: { dev: boolean, preview: boolean }): EnvPushAction {
  const required = (REQUIRED_DEPLOYMENT_ENV as readonly string[]).includes(name)
  if (required && (dev || preview) && name === 'AUTH_SECRET') {
    return { name, action: 'provision', value: generateAuthSecret(), detail: `generated (${dev ? 'dev' : 'preview'} deployment)` }
  }
  if (required && dev) return { name, action: 'provision', value: DEV_SITE_URL, detail: 'dev default' }
  if (required) {
    return { name, action: 'missing', detail: preview ? 'required — pass the preview\'s own origin with --site-url' : 'required — set it in .env.local (or the dashboard) and push again' }
  }
  if (preview && name in PREVIEW_ENV_DEFAULTS) {
    return { name, action: 'provision', value: PREVIEW_ENV_DEFAULTS[name as keyof typeof PREVIEW_ENV_DEFAULTS], detail: 'preview default' }
  }
  return { name, action: 'unset', detail: `optional — ${OPTIONAL_DEPLOYMENT_ENV[name as keyof typeof OPTIONAL_DEPLOYMENT_ENV]}` }
}

/**
 * Decide what to do per var. Pure; exported for tests — `runEnvPush` is the
 * flow the CLI and the module call.
 *
 * @internal
 */
export function planEnvPush({ deployedNames, localEnv, dev, preview = false, force }: EnvPushPlanInput): EnvPushAction[] {
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
    actions.push(gapAction(name, { dev, preview }))
  }

  // Dev without a transport: echo OTP codes to the convex dev console so the
  // very first sign-in works. Left alone once EMAIL_API_KEY exists anywhere.
  const emailKeyAvailable = deployed.has('EMAIL_API_KEY') || Boolean(localEnv.EMAIL_API_KEY)
  if (dev && !emailKeyAvailable && !deployed.has('NUXT_BACKEND_LOG_OTP')) {
    actions.push({ name: 'NUXT_BACKEND_LOG_OTP', action: 'provision', value: '1', detail: 'no email transport — OTP codes print in the convex dev console' })
  }

  return actions
}

/** The SITE_URL a dev deployment gets when nothing else names one: the Nuxt dev server's default origin. */
export const DEV_SITE_URL = 'http://localhost:3000'

/**
 * What a preview deployment starts with when nothing else gives a value: mail
 * in test mode, billing in the sandbox. A preview is reachable by anyone with
 * its URL, so it never sends real mail or takes real money until told to.
 */
export const PREVIEW_ENV_DEFAULTS = { EMAIL_TEST_MODE: 'true', BILLING_ENVIRONMENT: 'sandbox' } as const

/** A new AUTH_SECRET: 32 random bytes, base64. */
export function generateAuthSecret(): string {
  return randomBytes(32).toString('base64')
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
 * The deployment a Convex CLI call acts on: the one `.env.local` names by
 * default, the project's production deployment with `prod`, or the preview
 * deployment of that name with `preview`.
 */
export interface DeploymentTarget {
  prod?: boolean
  /** A preview deployment's name: the branch `convex deploy` named it after. */
  preview?: string
}

/**
 * The Convex CLI flags that select the deployment to act on. `--prod` is
 * explicit because the ambient selection is not production: `.env.local`
 * names a dev deployment, and without the flag every `env` / `run` /
 * `function-spec` call acts on it. Only `convex deploy` implies production
 * on its own. A deploy key for one deployment (`CONVEX_DEPLOY_KEY`) selects
 * that deployment instead; the CLI then ignores `--prod`, so passing it is
 * harmless. A preview is selected by name (`--preview-name`), with the
 * developer's login or a preview deploy key.
 */
export function deploymentFlags(options: DeploymentTarget = {}): string[] {
  if (options.prod) return ['--prod']
  return options.preview !== undefined ? ['--preview-name', options.preview] : []
}

/**
 * The deployment type of the deploy key the Convex CLI would use, from `env`
 * (`CONVEX_DEPLOY_KEY`, else `CONVEX_DEPLOYMENT_TOKEN`): `prod`, `dev`,
 * `preview` or `project`. A legacy key with no type prefix is a production
 * key. Null when no key is set.
 *
 * Only the prefix before the first `:` is read — the same parse as the
 * Convex CLI's `deploymentTypeFromAdminKey`; the secret after `|` is not.
 */
export function deployKeyType(env: Record<string, string | undefined> = process.env): string | null {
  const key = env.CONVEX_DEPLOY_KEY || env.CONVEX_DEPLOYMENT_TOKEN
  // The Convex CLI's own "no key here" placeholder.
  if (!key || key === '<ignore_deploy_key>') return null
  const separator = key.indexOf(':')
  return separator === -1 ? 'prod' : key.slice(0, separator)
}

/**
 * The deployment type of the deploy key in `env`, when it is one a
 * production command must not act on. The Convex CLI follows
 * `CONVEX_DEPLOY_KEY` and ignores `--prod`, so with a dev or preview key a
 * `--prod` command would silently act on that deployment instead. Null when
 * no key is set, or the key can reach production: a `prod:` key, a
 * `project:` key (`--prod` then picks the project's production), or a
 * legacy key with no type prefix.
 */
export function nonProductionDeployKey(env: Record<string, string | undefined> = process.env): string | null {
  const type = deployKeyType(env)
  return type === 'prod' || type === 'project' ? null : type
}

/**
 * Read deployment env var NAMES via `convex env list --names-only`: the
 * values are never requested, so a production secret never reaches this
 * process. (`--names-only` arrived in convex 1.42; the peer range starts
 * at 1.46.)
 */
export async function deploymentEnvNames(rootDir: string, options: DeploymentTarget = {}): Promise<string[] | null> {
  try {
    const { stdout } = await runConvex(rootDir, ['env', 'list', '--names-only', ...deploymentFlags(options)])
    return envNames(stdout)
  }
  catch {
    return null
  }
}

/** The variable names in a `--names-only` listing (or a `NAME=value` one, whose values are dropped). */
export function envNames(listing: string): string[] {
  return listing
    .split('\n')
    .map(line => line.split('=')[0]?.trim() ?? '')
    .filter(name => /^[A-Z][A-Z0-9_]*$/.test(name))
}

/**
 * The deployment's function spec (`convex function-spec`, with the same
 * selection as every other call here): its client URL — which deployment the
 * Convex CLI acts on — and the deployed function identifiers (`module:name`).
 * Null when the CLI cannot read it.
 */
export async function deploymentFunctionSpec(rootDir: string, options: { prod?: boolean } = {}): Promise<{ url: string | null, identifiers: Set<string> } | null> {
  try {
    const { stdout } = await runConvex(rootDir, ['function-spec', ...deploymentFlags(options)])
    const parsed = JSON.parse(stdout) as { url?: string, functions?: Array<{ identifier?: string }> } | Array<{ identifier?: string }>
    const list = Array.isArray(parsed) ? parsed : parsed.functions ?? []
    return {
      url: Array.isArray(parsed) ? null : parsed.url ?? null,
      identifiers: new Set(list
        .map(fn => fn.identifier ?? '')
        .map(id => id.replace(/\.[jt]s:/, ':'))),
    }
  }
  catch {
    return null
  }
}

/**
 * `convex env set [--prod] NAME`, the value written to its stdin. A value is
 * never an argument: a process's arguments are visible to every user of the
 * machine (`ps`) for as long as it runs, and a failed command's error would
 * quote them. The Convex CLI reads a value it was not given from stdin when
 * stdin is not a terminal (since convex 1.27).
 */
export async function setDeploymentEnv(rootDir: string, name: string, value: string, options: DeploymentTarget = {}): Promise<void> {
  await runConvex(rootDir, ['env', 'set', ...deploymentFlags(options), name], { input: value })
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
  /** Set on the preview deployment of this name (`convex env set --preview-name`). */
  preview?: string
  /** Injectable spawner for tests. */
  setEnv?: (rootDir: string, name: string, value: string) => Promise<void>
}

/**
 * Apply a plan (`planEnvPush`) to the deployment. Exported for tests (the
 * `convex env set` spawner is injectable). A failure is reported by the
 * error's message, which never carries the value: the default spawner passes
 * it on stdin (`setDeploymentEnv`).
 *
 * @internal
 */
export async function executeEnvPush(
  rootDir: string,
  actions: EnvPushAction[],
  { dryRun = false, prod = false, preview, setEnv = (dir, name, value) => setDeploymentEnv(dir, name, value, { prod, preview }) }: ExecuteEnvPushOptions = {},
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
  /**
   * What was written: the deployment `.env.local` names (`dev:<slug>`),
   * `production`, `preview:<name>`, or a type's project env defaults
   * (`defaults:preview`).
   */
  deployment: string | null
  dev: boolean
  /** The names the deployment held before the push (`convex env list`). */
  deployedNames: string[]
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

/**
 * The marker a clean `env push` leaves on a dev deployment: once it exists,
 * the module's dev-startup auto-provision and `nuxt-backend dev` skip the
 * `convex env list` spawn for that deployment. A run with a failed `set`
 * leaves no marker, so the next start retries.
 */
function envProvisionedMarker(rootDir: string, deployment: string): string {
  return join(rootDir, 'node_modules/.cache/nuxt-backend', `env-ok-${deployment.replace(/[^\w-]/g, '_')}`)
}

/** Whether a clean `env push` has already provisioned this deployment. */
export function isEnvProvisioned(rootDir: string, deployment: string): boolean {
  return existsSync(envProvisionedMarker(rootDir, deployment))
}

/** Record that `env push` provisioned this deployment without a failure. */
export function markEnvProvisioned(rootDir: string, deployment: string): void {
  const marker = envProvisionedMarker(rootDir, deployment)
  mkdirSync(dirname(marker), { recursive: true })
  writeFileSync(marker, new Date().toISOString())
}

/**
 * The required names a clean `env push` has put on the configured dev
 * deployment (its marker says so), for the preflight to count as set;
 * `undefined` when that is not known.
 */
export function provisionedEnvNames(rootDir: string): ReadonlySet<string> | undefined {
  const deployment = configuredDeployment(rootDir)
  return isDevDeploymentId(deployment) && isEnvProvisioned(rootDir, deployment)
    ? new Set(REQUIRED_DEPLOYMENT_ENV)
    : undefined
}

export interface RunEnvPushOptions extends DeploymentTarget {
  dryRun?: boolean
  force?: ReadonlySet<string>
  /**
   * The SITE_URL to write, over any other: replaces the one on the deployment
   * (giving it is asking for it), and is a preview's only source of one.
   */
  siteUrl?: string
  setEnv?: ExecuteEnvPushOptions['setEnv']
}

/** The whole flow shared by the CLI and the module's dev auto-provision. */
export async function runEnvPush(rootDir: string, options: RunEnvPushOptions = {}): Promise<EnvPushRunResult | null> {
  const target = { prod: options.prod, preview: options.preview }
  const deployedNames = await deploymentEnvNames(rootDir, target)
  if (deployedNames === null) return null

  // Dev-class deployments get required-gap filling. Under --prod the target is
  // the project's production deployment, whatever .env.local names; under
  // --preview, that preview.
  const preview = !options.prod && options.preview !== undefined
  const deployment = options.prod ? 'production' : preview ? `preview:${options.preview}` : configuredDeployment(rootDir)
  const dev = !options.prod && !preview && isDevDeployment(rootDir)
  const localEnv = readEnvFiles(rootDir)
  // A SITE_URL in .env(.local) is the dev app's origin, never a preview's.
  if (preview) delete localEnv.SITE_URL
  if (options.siteUrl) localEnv.SITE_URL = options.siteUrl
  const force = options.siteUrl ? new Set([...options.force ?? [], 'SITE_URL']) : options.force
  const actions = planEnvPush({ deployedNames, localEnv, dev, preview, ...(force ? { force } : {}) })
  const results = await executeEnvPush(rootDir, actions, { dryRun: options.dryRun, ...target, ...(options.setEnv ? { setEnv: options.setEnv } : {}) })
  return {
    deployment,
    dev,
    deployedNames,
    results,
    missingRequired: actions.filter(action => action.action === 'missing').map(action => action.name),
  }
}
