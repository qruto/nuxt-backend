/**
 * `env push` — sync the backend env contract onto the Convex deployment.
 *
 * `.env.local` is the single write-once place for provider keys; this engine
 * forwards them to the deployment (each value on `convex env set`'s stdin —
 * never an argument, never through a shell), and on `dev:` deployments fills
 * the required gaps so the three-command onboarding needs zero manual
 * `convex env set`:
 * AUTH_SECRET is generated and SITE_URL defaults to localhost. Every
 * deployment also gets its `BACKEND_ENVIRONMENT`, derived from its kind
 * (`development`, `preview` or `production`), which decides the email test
 * mode, the billing sandbox, the local origins trusted and the sign-in codes
 * logged.
 *
 * Split into a pure planner (unit-testable) and a spawning executor, shared
 * by the CLI commands (`nuxt-backend env push`, `dev`). Deployment values are
 * never read — only names via `convex env list` — and existing values are
 * never overwritten.
 */
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { readTextIfPresent } from './source-text'
import { dirname, join } from 'node:path'
import { CONTRACT_ENV_NAMES, DERIVED_DEPLOYMENT_ENV, DEV_ONLY_DEPLOYMENT_ENV, OPTIONAL_DEPLOYMENT_ENV, REQUIRED_DEPLOYMENT_ENV } from './env-registry'
import { type BackendEnvironment, parseBackendEnvironment } from './convex/environment'
import { appMonitoringDsn } from './monitoring'
import { deriveDeploymentUrls, isDevDeploymentId, parseEnvFile } from './deployment'
import { runConvex } from './convex-cli'
import { usesProvenance } from './named-models'
import { envLine, generateProvenanceCredentials } from './provenance-keys'
import { generatePushKeys } from './convex/web-push'
import { isLoopbackUrl } from './convex/loopback'
import { TEST_CHALLENGE_SECRET_KEYS } from './convex/proof'

/** The names `env push` forwards: the deployment's contract, from src/env-registry.ts. */
export const BACKEND_ENV_NAMES = CONTRACT_ENV_NAMES

export interface EnvPushAction {
  name: string
  action:
    /** Local value forwarded to the deployment. */
    | 'forward'
    /** Value invented: a generated secret, a dev or preview default, the deployment's kind. */
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
   * generated and `BACKEND_ENVIRONMENT` is `preview` (mail in test mode,
   * billing in the sandbox), but SITE_URL is the preview's own origin, which
   * only the caller knows.
   */
  preview?: boolean
  /**
   * Names whose deployment value may be replaced by the local one. Rotation is
   * deliberate: a push never overwrites a live secret on its own, because the
   * plan compares presence, not values — it reads names only, so the CLI can
   * never tell a rotated key from an identical one.
   */
  force?: ReadonlySet<string>
  /**
   * Values generated for this push (the content-credentials signing key and
   * certificate, {@link provenanceToGenerate}): provisioned where neither
   * the deployment nor .env.local has one.
   */
  generated?: Readonly<Record<string, string>>
}

/**
 * A name with no value anywhere: what a deployment of this kind gets. Dev and
 * preview deployments are disposable, so a secret is generated for them; dev
 * gets the dev server's origin, a preview waits for its own; anything else
 * never gets a value made up.
 */
function gapAction(name: string, { dev, preview }: { dev: boolean, preview: boolean }): EnvPushAction {
  const required = (REQUIRED_DEPLOYMENT_ENV as readonly string[]).includes(name)
  if (required && (dev || preview) && name === 'AUTH_SECRET') {
    return { name, action: 'provision', value: generateAuthSecret(), detail: `generated (${dev ? 'dev' : 'preview'} deployment)` }
  }
  if (required && dev) return { name, action: 'provision', value: DEV_SITE_URL, detail: 'dev default' }
  if (dev && name in DEV_ONLY_DEPLOYMENT_ENV) return { name, action: 'provision', value: DEV_ONLY_DEPLOYMENT_ENV[name], detail: 'dev default' }
  if (required) {
    return { name, action: 'missing', detail: preview ? 'required — pass the preview\'s own origin with --site-url' : 'required — set it in .env.local (or the dashboard) and push again' }
  }
  return { name, action: 'unset', detail: `optional — ${OPTIONAL_DEPLOYMENT_ENV[name as keyof typeof OPTIONAL_DEPLOYMENT_ENV]}` }
}

/**
 * Why a value `.env(.local)` holds is not one for production, or null when
 * it is: `.env.local` is the dev deployment's. Its `SITE_URL` is a local
 * origin, its proof secret must not be shared with production, and the
 * challenge provider's test secret keys pass every answer.
 */
function notForProduction(name: string, value: string): string | null {
  if (name === 'SITE_URL') {
    const url = URL.canParse(value.trim()) ? new URL(value.trim()) : null
    if (url?.protocol === 'https:' && !isLoopbackUrl(url.href)) return null
    return `required — .env.local's SITE_URL (${value}) is no public https origin: pass production's with --site-url, or set it in the dashboard`
  }
  if (name === 'PROTECTION_PROOF_SECRET') return 'production\'s own, never .env.local\'s: generate one (openssl rand -base64 32) and set it on the deployment and in the host\'s env'
  if (name === 'PROTECTION_CHALLENGE_SECRET_KEY' && TEST_CHALLENGE_SECRET_KEYS.includes(value.trim())) return '.env.local holds the challenge provider\'s test secret key, which passes every answer: set production\'s own key on the deployment'
  return null
}

/**
 * Decide what to do per var. Pure; exported for tests — `runEnvPush` is the
 * flow the CLI and the module call.
 *
 * @internal
 */
export function planEnvPush({ deployedNames, localEnv, dev, preview = false, force, generated }: EnvPushPlanInput): EnvPushAction[] {
  const deployed = new Set(deployedNames)
  const target = { dev, preview, production: !dev && !preview }
  return BACKEND_ENV_NAMES.map((name) => {
    if (DERIVED_DEPLOYMENT_ENV.has(name)) return environmentAction(deployed.has(name), force?.has(name) === true, { dev, preview })
    if (name in DEV_ONLY_DEPLOYMENT_ENV && !dev) {
      return { name, action: 'unset', detail: 'dev deployments only: never pushed here (deploy --sandbox sets it on a sandbox; elsewhere set it by hand where you mean to)' }
    }
    // A web push pair is one deployment's own: .env.local's is the dev deployment's, never production's.
    const local = (PUSH_ENV as readonly string[]).includes(name) && !dev ? undefined : localValue(name, localEnv)
    const value = local === '' ? undefined : local
    if (deployed.has(name)) return deployedAction(name, value, force?.has(name) === true, target.production)
    if (value !== undefined) return localAction(name, value, target.production)
    const made = generated?.[name]
    if (made !== undefined) return { name, action: 'provision', value: made, detail: generatedDetail(name, dev) }
    return gapAction(name, { dev, preview })
  })
}

/** A name the deployment already holds: kept, unless forced with a local value production may take. */
function deployedAction(name: string, local: string | undefined, forced: boolean, production: boolean): EnvPushAction {
  if (!forced || local === undefined) {
    return { name, action: 'skip', detail: forced ? 'no local value to replace it with' : 'already set on the deployment (--force to replace)' }
  }
  const refused = production ? notForProduction(name, local) : null
  if (refused) return { name, action: 'skip', detail: `kept: ${refused}` }
  return { name, action: 'update', value: local, detail: 'replaced from .env(.local)' }
}

/** A name the deployment lacks and `.env(.local)` holds: forwarded, unless it is dev's alone and this is production. */
function localAction(name: string, local: string, production: boolean): EnvPushAction {
  const refused = production ? notForProduction(name, local) : null
  if (refused) return { name, action: (REQUIRED_DEPLOYMENT_ENV as readonly string[]).includes(name) ? 'missing' : 'unset', detail: refused }
  return { name, action: 'forward', value: local, detail: 'forwarded from .env(.local)' }
}

/** What a generated value is, for the plan's detail. */
function generatedDetail(name: string, dev: boolean): string {
  if (!(PUSH_ENV as readonly string[]).includes(name)) return 'generated (a signing key and its certificate, kept in .env.local)'
  return dev ? 'generated (the web push key pair, kept in .env.local)' : 'generated (this deployment\'s own web push key pair: back it up with your other secrets)'
}

/**
 * The value `.env(.local)` holds for a name. `MONITORING_DSN` falls back to
 * the `NEXT_PUBLIC_SENTRY_DSN` Sentry's Vercel integration sets (pulled with
 * `vercel env pull`), so the integration alone is enough.
 */
function localValue(name: string, localEnv: Record<string, string>): string | undefined {
  if (name === 'MONITORING_DSN') return appMonitoringDsn(localEnv)
  if (name === 'SITE_URL') return localSiteUrl(localEnv)
  return localEnv[name]
}

/**
 * The app's origin as the env here names it: `SITE_URL`, else the origin of
 * `NUXT_SITE_URL`, the name Nuxt's site config (and the SEO modules on it)
 * reads, so an app that already names its site once is not asked twice. A
 * `NUXT_SITE_URL` that is no URL is passed as it is, for the check to name.
 */
export function localSiteUrl(env: Readonly<Record<string, string | undefined>>): string | undefined {
  if (env.SITE_URL !== undefined) return env.SITE_URL
  const site = env.NUXT_SITE_URL?.trim()
  if (!site) return undefined
  try {
    return new URL(site).origin
  }
  catch {
    return site
  }
}

/**
 * The kind of deployment, by what is being pushed to: `development` for a
 * dev deployment (cloud or local), `preview` for a preview, and
 * `production` for any other. A `sandbox` is the one value set by hand.
 */
export function deploymentEnvironment({ dev, preview }: { dev: boolean, preview: boolean }): Exclude<BackendEnvironment, 'sandbox'> {
  return dev ? 'development' : preview ? 'preview' : 'production'
}

/**
 * `BACKEND_ENVIRONMENT`: derived from the deployment's kind, never a value
 * from .env.local, which holds the dev deployment's. Set once, it is left
 * alone unless forced, so a `sandbox` set by hand stays.
 */
function environmentAction(deployed: boolean, forced: boolean, kind: { dev: boolean, preview: boolean }): EnvPushAction {
  const name = 'BACKEND_ENVIRONMENT'
  if (deployed && !forced) return { name, action: 'skip', detail: 'already set on the deployment (--force to replace)' }
  return { name, action: deployed ? 'update' : 'provision', value: deploymentEnvironment(kind), detail: 'derived from the deployment\'s kind' }
}

/** The SITE_URL a dev deployment gets when nothing else names one: the Nuxt dev server's default origin. */
export const DEV_SITE_URL = 'http://localhost:3000'

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
 * Why a push to the dev deployment (no `--prod`, no `--preview`) must not
 * run. The Convex CLI follows a deploy key whatever the flags say, so with
 * any key but a dev one the push lands on the deployment that key selects —
 * production, a preview, or the one a project key picks — and the dev
 * gap-filling would put a generated AUTH_SECRET, a localhost SITE_URL,
 * `development` BACKEND_ENVIRONMENT (echoed sign-in codes, the trusted
 * loopback origins) there. Null when no key is set, or for a dev key. The key is read
 * where the Convex CLI reads it: the process env, then `.env.local`, then
 * `.env`.
 */
export function devPushRefusal(rootDir: string): string | null {
  const type = deployKeyType({ ...readEnvFiles(rootDir), ...process.env })
  if (type === null || type === 'dev') return null
  return `CONVEX_DEPLOY_KEY is a ${type} deploy key, and the Convex CLI follows it whatever the flags say, so a push to the dev deployment would put dev values (a generated AUTH_SECRET, a localhost SITE_URL, echoed sign-in codes) on the deployment that key selects. Unset it to push to the dev deployment CONVEX_DEPLOYMENT names in .env.local, or run with --prod to push production.`
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

/**
 * The deployment's `BACKEND_ENVIRONMENT` (`convex env get`): with `SITE_URL`'s
 * origin ({@link deploymentSiteOrigin}), the only values the package reads off
 * a deployment, all non-secret. It is only ever compared, never printed; the
 * origin is public and `doctor` prints it. `null` when it could not be read
 * or is none of the four kinds, which the backend treats as unset (test mode,
 * the sandbox). Read it only when the deployment lists the name.
 */
export async function deploymentBackendEnvironment(rootDir: string, options: DeploymentTarget = {}): Promise<BackendEnvironment | null> {
  try {
    const { stdout } = await runConvex(rootDir, ['env', 'get', ...deploymentFlags(options), 'BACKEND_ENVIRONMENT'])
    return parseBackendEnvironment(stdout) ?? null
  }
  catch {
    return null
  }
}

/**
 * The origin of the deployment's `SITE_URL` (`convex env get`): the app's
 * public origin, which every emailed link already names, so no secret, and
 * the site `doctor --prod` probes. Only its origin is kept, `malformed`
 * when it is no http(s) URL; null when it could not be read. Read it only
 * when the deployment lists the name.
 */
export async function deploymentSiteOrigin(rootDir: string, options: DeploymentTarget = {}): Promise<{ origin: string } | 'malformed' | null> {
  let value: string
  try {
    value = (await runConvex(rootDir, ['env', 'get', ...deploymentFlags(options), 'SITE_URL'])).stdout.trim()
  }
  catch {
    return null
  }
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? { origin: url.origin } : 'malformed'
  }
  catch {
    return 'malformed'
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

/** What a dev push provisions, as a number: raise it when `planEnvPush` provisions a new name (2: the stand-in marker; 3: the deployment's environment; 4: BACKEND_ENVIRONMENT in place of the mode variables; 5: EMAIL_DEV_INBOX; 6: the content-credentials signing key; 7: the web push key pair). */
const PROVISION_VERSION = 7

/**
 * The marker a clean `env push` leaves on a dev deployment: once it exists,
 * the module's dev-startup auto-provision and `nuxt-backend dev` skip the
 * `convex env list` spawn for that deployment. A run with a failed `set`
 * leaves no marker, so the next start retries. Its name carries
 * {@link PROVISION_VERSION}, so a deployment provisioned before a release that
 * provisions more is pushed once again.
 */
function envProvisionedMarker(rootDir: string, deployment: string): string {
  return join(rootDir, 'node_modules/.cache/nuxt-backend', `env-ok-${PROVISION_VERSION}-${deployment.replace(/[^\w-]/g, '_')}`)
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

/**
 * The deployment a push lands on, and what kind it is. Dev-class deployments
 * get required-gap filling. Under --prod
 * the target is the project's production deployment, whatever .env.local
 * names; under --preview, that preview.
 */
function pushTarget(rootDir: string, options: RunEnvPushOptions): { deployment: string | null, dev: boolean, preview: boolean } {
  const preview = !options.prod && options.preview !== undefined
  const deployment = options.prod ? 'production' : preview ? `preview:${options.preview}` : configuredDeployment(rootDir)
  const dev = !options.prod && !preview && isDevDeployment(rootDir)
  return { deployment, dev, preview }
}

/**
 * The whole flow shared by the CLI and the module's dev auto-provision. A
 * push to the dev deployment with a deploy key that selects another one
 * throws ({@link devPushRefusal}) before the Convex CLI is asked anything:
 * the commands refuse it first, with their own words.
 */
export async function runEnvPush(rootDir: string, options: RunEnvPushOptions = {}): Promise<EnvPushRunResult | null> {
  const target = { prod: options.prod, preview: options.preview }
  const refusal = !options.prod && options.preview === undefined ? devPushRefusal(rootDir) : null
  if (refusal) throw new Error(`[nuxt-backend] env push refused: ${refusal}`)
  const deployedNames = await deploymentEnvNames(rootDir, target)
  if (deployedNames === null) return null

  const { deployment, dev, preview } = pushTarget(rootDir, options)
  const localEnv = readEnvFiles(rootDir)
  // A SITE_URL in .env(.local) is the dev app's origin, never a preview's.
  if (preview) delete localEnv.SITE_URL
  if (options.siteUrl) localEnv.SITE_URL = options.siteUrl
  const force = options.siteUrl ? new Set([...options.force ?? [], 'SITE_URL']) : options.force
  const generated = await generatedEnv(rootDir, deployedNames, localEnv, { dev, dryRun: options.dryRun === true })
  const actions = planEnvPush({ deployedNames, localEnv, dev, preview, ...(force ? { force } : {}), ...(generated ? { generated } : {}) })
  const results = await executeEnvPush(rootDir, actions, { dryRun: options.dryRun, ...target, ...(options.setEnv ? { setEnv: options.setEnv } : {}) })
  return {
    deployment,
    dev,
    deployedNames,
    results,
    missingRequired: actions.filter(action => action.action === 'missing').map(action => action.name),
  }
}

/**
 * The values a push generates where the deployment has none: the
 * content-credentials pair and the web push pair. Kept in .env.local
 * (outside a dry run): the provenance pair always, the push pair only for
 * the dev deployment, whose pair it is.
 */
async function generatedEnv(rootDir: string, deployedNames: readonly string[], localEnv: Readonly<Record<string, string>>, { dev, dryRun }: { dev: boolean, dryRun: boolean }): Promise<Record<string, string> | null> {
  const provenance = provenanceToGenerate(rootDir, deployedNames, localEnv)
  if (provenance && !dryRun) writeLocalEnv(rootDir, provenance)
  const push = await pushKeysToGenerate(deployedNames, localEnv, { dev })
  if (push && dev && !dryRun) writeLocalEnv(rootDir, push, PUSH_KEYS_COMMENT)
  return provenance || push ? { ...provenance, ...push } : null
}

/** The web push (VAPID) key pair: `setupNotifications` signs and encrypts every push with it. */
export const PUSH_ENV = ['PUSH_PUBLIC_KEY', 'PUSH_PRIVATE_KEY'] as const

/** The comment above the pair in .env.local. */
const PUSH_KEYS_COMMENT = '# Web push (setupNotifications): the dev deployment\'s key pair, generated by `nuxt-backend env push`. Keep it: new keys orphan every subscribed device.'

/**
 * A new web push key pair, when the deployment has neither name: for the dev
 * deployment the pair .env.local holds, else a new one written there; for
 * production or a preview a pair of its own, never .env.local's. `null`
 * when the deployment has one: a push never replaces it, since a browser
 * binds its subscription to the public key.
 */
export async function pushKeysToGenerate(deployedNames: readonly string[], localEnv: Readonly<Record<string, string>>, { dev }: { dev: boolean }): Promise<Record<string, string> | null> {
  if (PUSH_ENV.some(name => deployedNames.includes(name))) return null
  if (dev && PUSH_ENV.every(name => localEnv[name])) return null
  const { publicKey, privateKey } = await generatePushKeys()
  return { PUSH_PUBLIC_KEY: publicKey, PUSH_PRIVATE_KEY: privateKey }
}

/** The content-credentials signing pair: `setupAi({ provenance })` reads both. */
export const PROVENANCE_ENV = ['PROVENANCE_PRIVATE_KEY', 'PROVENANCE_CERTIFICATE'] as const

/**
 * A new signing key and certificate for content credentials, when the
 * backend turns provenance on and neither the deployment nor .env.local
 * has either name; null otherwise. The signer is named after the app's
 * package.
 */
export function provenanceToGenerate(rootDir: string, deployedNames: readonly string[], localEnv: Readonly<Record<string, string>>): Record<string, string> | null {
  if (PROVENANCE_ENV.some(name => deployedNames.includes(name) || localEnv[name])) return null
  if (!usesProvenance(rootDir)) return null
  const { privateKey, certificate } = generateProvenanceCredentials(appName(rootDir))
  return { PROVENANCE_PRIVATE_KEY: privateKey, PROVENANCE_CERTIFICATE: certificate }
}

/** The app's name, from its package.json: what a generated certificate names as its signer. */
function appName(rootDir: string): string {
  try {
    const name = (JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')) as { name?: unknown }).name
    if (typeof name === 'string' && name.trim()) return name.trim()
  }
  catch {
    // No readable package.json: the generic name.
  }
  return 'nuxt-backend app'
}

/**
 * Keep generated values in .env.local, so the next push (production's
 * included) forwards the same key: ahead of the platform's own group when
 * the file has one, else at its end.
 */
export function writeLocalEnv(rootDir: string, values: Readonly<Record<string, string>>, comment = '# Content credentials (setupAi({ provenance })): generated by `nuxt-backend env push`. Replace both with a certificate from a CA on the C2PA trust list for a named signer.'): void {
  const path = join(rootDir, '.env.local')
  const text = readTextIfPresent(path) ?? ''
  const block = [
    comment,
    ...Object.entries(values).map(([name, value]) => envLine(name, value)),
    '',
  ].join('\n')
  const lines = text.split('\n')
  const platform = lines.findIndex(line => /^# Deployment used by|^CONVEX_DEPLOYMENT=/.test(line))
  const next = platform === -1
    ? `${text}${text && !text.endsWith('\n') ? '\n' : ''}${text ? '\n' : ''}${block}`
    : [...lines.slice(0, platform), block, ...lines.slice(platform)].join('\n')
  writeFileSync(path, next)
}
