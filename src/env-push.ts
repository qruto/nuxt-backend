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
 * only names via `npx convex env list` — and existing values are never
 * overwritten.
 */
import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { OPTIONAL_DEPLOYMENT_ENV, REQUIRED_DEPLOYMENT_ENV } from './preflight'
import { deriveDeploymentUrls } from './deployment'

const execFileAsync = promisify(execFile)

export const BACKEND_ENV_NAMES = [
  ...REQUIRED_DEPLOYMENT_ENV,
  ...Object.keys(OPTIONAL_DEPLOYMENT_ENV) as (keyof typeof OPTIONAL_DEPLOYMENT_ENV)[],
] as const

export type BackendEnvName = (typeof BACKEND_ENV_NAMES)[number]

export interface EnvPushAction {
  name: string
  action:
    /** Local value forwarded to the deployment. */
    | 'forward'
    /** Dev-only: value invented (generated secret / localhost default). */
    | 'provision'
    /** Already set on the deployment — never overwritten. */
    | 'skip'
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
  /** Env var names present on the deployment (`npx convex env list`). */
  deployedNames: string[]
  /** Merged local `.env` + `.env.local` values. */
  localEnv: Record<string, string>
  /** Treat as a dev deployment (gap-filling allowed). */
  dev: boolean
}

/** Decide what to do per var. Pure. */
export function planEnvPush({ deployedNames, localEnv, dev }: EnvPushPlanInput): EnvPushAction[] {
  const deployed = new Set(deployedNames)
  const actions: EnvPushAction[] = []

  for (const name of BACKEND_ENV_NAMES) {
    if (deployed.has(name)) {
      actions.push({ name, action: 'skip', detail: 'already set on the deployment' })
      continue
    }
    const local = localEnv[name]
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
    for (const line of readFileSync(path, 'utf-8').split('\n')) {
      const match = line.match(/^([A-Z_]\w*)=(.*)$/i)
      if (match) env[match[1]!] = match[2]!.trim().replace(/^["']|["']$/g, '')
    }
  }
  return env
}

/** Read deployment env var NAMES via `npx convex env list` (values never leave the CLI). */
export async function deploymentEnvNames(rootDir: string): Promise<string[] | null> {
  try {
    // On Windows `npx` is `npx.cmd`; since Node's CVE-2024-27980 hardening,
    // spawning a `.cmd` without a shell throws EINVAL — so use a shell there.
    // Args are static literals (no interpolation), so shelling is injection-safe.
    const { stdout } = await execFileAsync('npx', ['convex', 'env', 'list'], {
      cwd: rootDir,
      encoding: 'utf-8',
      timeout: 30_000,
      shell: process.platform === 'win32',
    })
    return stdout
      .split('\n')
      .map(line => line.split('=')[0]?.trim() ?? '')
      .filter(name => /^[A-Z][A-Z0-9_]*$/.test(name))
  }
  catch {
    return null
  }
}

/**
 * Windows needs a shell for `npx.cmd`, and cmd.exe re-parses argv — so only
 * shell-inert values are pushed there; anything else gets a manual-set hint.
 * On POSIX, values pass as argv with no shell at all.
 */
const WIN32_SAFE_VALUE = /^[\w+/=.:@#-]*$/

export interface EnvPushResult {
  action: EnvPushAction
  outcome: 'set' | 'skipped' | 'planned' | 'failed'
  error?: string
}

export interface ExecuteEnvPushOptions {
  dryRun?: boolean
  /** Injectable spawner for tests. */
  setEnv?: (rootDir: string, name: string, value: string) => Promise<void>
}

async function defaultSetEnv(rootDir: string, name: string, value: string): Promise<void> {
  const useShell = process.platform === 'win32'
  if (useShell && !WIN32_SAFE_VALUE.test(value)) {
    throw new Error('value needs shell quoting on Windows — set it manually: npx convex env set ' + name + ' <value>')
  }
  await execFileAsync('npx', ['convex', 'env', 'set', name, value], {
    cwd: rootDir,
    timeout: 30_000,
    shell: useShell,
  })
}

export async function executeEnvPush(
  rootDir: string,
  actions: EnvPushAction[],
  { dryRun = false, setEnv = defaultSetEnv }: ExecuteEnvPushOptions = {},
): Promise<EnvPushResult[]> {
  const results: EnvPushResult[] = []
  for (const action of actions) {
    if (action.action !== 'forward' && action.action !== 'provision') {
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

/** The whole flow shared by the CLI and the module's dev auto-provision. */
export async function runEnvPush(rootDir: string, options: { prod?: boolean, dryRun?: boolean, setEnv?: ExecuteEnvPushOptions['setEnv'] } = {}): Promise<EnvPushRunResult | null> {
  const deployedNames = await deploymentEnvNames(rootDir)
  if (deployedNames === null) return null

  // Dev-class deployments get required-gap filling: cloud dev (`dev:`) and
  // CLI-managed local (`local:`) deployments — both disposable, never prod.
  // Read the deployment id directly (URL derivation rejects local slugs).
  const deployment = process.env.CONVEX_DEPLOYMENT
    ?? readEnvFiles(rootDir).CONVEX_DEPLOYMENT
    ?? deriveDeploymentUrls(rootDir)?.deployment
    ?? null
  const dev = !options.prod && (deployment?.startsWith('dev:') === true || deployment?.startsWith('local:') === true)
  const actions = planEnvPush({ deployedNames, localEnv: readEnvFiles(rootDir), dev })
  const results = await executeEnvPush(rootDir, actions, { dryRun: options.dryRun, setEnv: options.setEnv })
  return {
    deployment,
    dev,
    results,
    missingRequired: actions.filter(action => action.action === 'missing').map(action => action.name),
  }
}
