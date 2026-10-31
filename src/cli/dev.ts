/**
 * `nuxt-backend dev` — Convex and Nuxt from one command.
 *
 * The scaffold's `convex.config.ts` requires AUTH_SECRET and SITE_URL on the
 * deployment. `convex dev --start "nuxt dev"` alone never starts Nuxt on a new
 * deployment: its first push fails without them, Convex starts the child only
 * after a successful push, and the values come from this package's env
 * provisioning, which otherwise runs inside Nuxt. So this command puts them
 * there first:
 *
 * 1. scaffold `backend/` when the app has no functions directory yet — or
 *    Convex would create `convex/`, and the scaffold would follow it there;
 * 2. `convex dev --once` when no deployment is configured (the login and
 *    project prompts happen here, before anything else prints);
 * 3. `env push` on a dev deployment not yet provisioned (the same engine and
 *    marker as the module's dev-startup auto-provision);
 * 4. `convex dev --start "nuxt dev …"`: the first push now succeeds, codegen
 *    runs before Nuxt starts, and Convex owns the Nuxt process.
 *
 * `--anonymous` runs both Convex steps with `CONVEX_AGENT_MODE=anonymous` in
 * their env, so step 2 creates an account-free local deployment without a
 * login or a question. Set from Node rather than the shell, it works the same
 * on macOS, Linux and Windows.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { delimiter, join, resolve } from 'node:path'
import { defineCommand } from 'citty'
import { spawnConvex } from '../convex-cli'
import { isDevDeploymentId } from '../deployment'
import { configuredDeployment, devPushRefusal, isEnvProvisioned, markEnvProvisioned, runEnvPush, type EnvPushRunResult } from '../env-push'
import { finding, type PreflightFinding } from '../findings'
import { resolveFunctionsDir, scaffoldBackendFiles } from '../scaffold'
import { withContract } from './contract'

/** The side effects `runDev` performs, injectable for tests. */
export interface DevSteps {
  /** `convex <args>` with the terminal attached; resolves with its exit code. */
  convex: (args: string[], env: NodeJS.ProcessEnv) => Promise<number>
  /** The `env push` engine against the configured deployment. */
  envPush: () => Promise<EnvPushRunResult | null>
  log: (line: string) => void
}

/** Quote one argument for the shell `convex dev --start` runs its command in. */
export function shellQuote(arg: string): string {
  if (/^[\w@%+=:,./-]+$/.test(arg)) return arg
  return `"${arg.replace(/(["\\$`])/g, '\\$1')}"`
}

/** `nuxt dev` with the arguments this command was given, as one command line. */
export function nuxtDevCommand(args: readonly string[]): string {
  return ['nuxt', 'dev', ...args].map(shellQuote).join(' ')
}

/** Split this command's own `--cwd` and `--anonymous` off the raw arguments; the rest go to `nuxt dev`. */
export function splitDevArgs(rawArgs: readonly string[]): { cwd: string, anonymous: boolean, nuxtArgs: string[] } {
  let cwd = '.'
  let anonymous = false
  const nuxtArgs: string[] = []
  for (let index = 0; index < rawArgs.length; index++) {
    const arg = rawArgs[index]!
    if (arg === '--cwd' && index + 1 < rawArgs.length) cwd = rawArgs[++index]!
    else if (arg.startsWith('--cwd=')) cwd = arg.slice('--cwd='.length)
    else if (arg === '--anonymous') anonymous = true
    else nuxtArgs.push(arg)
  }
  return { cwd, anonymous, nuxtArgs }
}

/** What the Convex CLI reads to set up an account-free local deployment without asking. */
const CONVEX_ANONYMOUS = { CONVEX_AGENT_MODE: 'anonymous' } as const

/** A plain `nuxt dev` script, the one the Nuxt starter ships, and its arguments. */
const PLAIN_NUXT_DEV = /^(?:npx )?(?:nuxt|nuxi) dev(?<args>(?: [^&|;'"]*)?)$/
/**
 * What the base module rewrites that script to: `convex dev --start "nuxt dev …"`
 * (single quotes before nuxt-convex-module 0.11, so both match).
 */
const COMBINED_NUXT_DEV = /^convex dev --start (['"])(?:npx )?(?:nuxt|nuxi) dev(?<args>(?: [^&|;'"]*)?)\1$/

/**
 * The `dev` script this command should replace, as `nuxt-backend dev` with the
 * same arguments: a missing one, a plain `nuxt dev`, or the base module's
 * `convex dev --start "nuxt dev"`, which never starts Nuxt on a new
 * deployment. `null` for any other script: one the app wrote stays its own.
 */
export function backendDevScript(script: string | undefined): string | null {
  if (script === undefined) return 'nuxt-backend dev'
  const match = PLAIN_NUXT_DEV.exec(script.trim()) ?? COMBINED_NUXT_DEV.exec(script.trim())
  return match ? `nuxt-backend dev${match.groups?.args ?? ''}` : null
}

interface Manifest {
  source: string
  manifest: { scripts?: Record<string, string> }
}

function readManifest(rootDir: string): Manifest | null {
  try {
    const source = readFileSync(join(rootDir, 'package.json'), 'utf-8')
    return { source, manifest: JSON.parse(source) as Manifest['manifest'] }
  }
  catch {
    return null
  }
}

/** Whether a `dev` script is the base module's `convex dev --start "nuxt dev"`. */
function isCombinedDevScript(script: string | undefined): script is string {
  return script !== undefined && COMBINED_NUXT_DEV.test(script.trim())
}

/**
 * Point the app's `dev` script at `nuxt-backend dev` (see `backendDevScript`),
 * keeping the manifest's formatting. Returns the script now in place when it
 * runs this command, `null` when the app keeps a script of its own. With
 * `onlyCombined`, only the base module's `convex dev --start` script is
 * replaced: what `doctor --fix` repairs.
 */
export function adoptBackendDevScript(rootDir: string, { onlyCombined = false } = {}): { script: string, changed: boolean } | null {
  const read = readManifest(rootDir)
  if (!read) return null
  const { source, manifest } = read
  const current = manifest.scripts?.dev
  if (current?.trim().startsWith('nuxt-backend dev')) return { script: current, changed: false }
  if (onlyCombined && !isCombinedDevScript(current)) return null
  const script = backendDevScript(current)
  if (!script) return null
  const indent = /^(\s+)"/m.exec(source)?.[1] ?? '  '
  const eol = source.endsWith('\n') ? '\n' : ''
  writeFileSync(join(rootDir, 'package.json'), JSON.stringify({ ...manifest, scripts: { ...manifest.scripts, dev: script } }, null, indent) + eol)
  return { script, changed: true }
}

/**
 * `doctor`'s check of the `dev` script: the base module's
 * `convex dev --start "nuxt dev"` works only once AUTH_SECRET and SITE_URL
 * are on the deployment, and on a new one it waits for them forever. Empty for
 * any other script.
 */
export function devScriptFinding(rootDir: string): PreflightFinding[] {
  const script = readManifest(rootDir)?.manifest.scripts?.dev
  if (!isCombinedDevScript(script)) return []
  return [finding(
    'dev-script',
    'warn',
    `\`dev\` runs \`${script}\`, which never starts Nuxt on a new deployment: its first push needs AUTH_SECRET and SITE_URL, and those are provisioned from inside Nuxt.`,
    'Run: npx nuxt-backend doctor --fix (points dev at nuxt-backend dev)',
  )]
}

/** What `convex` exits with when SIGINT stopped it: a Ctrl-C, or a stop this process passed on. */
const INTERRUPTED = 130

/**
 * The configured deployment, set up with `convex dev --once` when there is
 * none yet (the login and project prompts happen there). `null` when that
 * run ended without one, `INTERRUPTED` when it was stopped.
 */
async function attachDeployment(rootDir: string, env: NodeJS.ProcessEnv, steps: DevSteps, anonymous: boolean): Promise<string | null | typeof INTERRUPTED> {
  const configured = configuredDeployment(rootDir)
  if (configured) {
    if (anonymous && !configured.startsWith('anonymous:')) {
      steps.log(`--anonymous: CONVEX_DEPLOYMENT already names ${configured}, and this run uses it. Remove it from .env.local to start on an account-free local deployment instead.`)
    }
    return configured
  }
  steps.log(anonymous
    ? 'No Convex deployment yet: `convex dev --once` starts an account-free local one. `npx convex login` moves it into your account later.'
    : 'No Convex deployment yet: `convex dev --once` sets one up. Log in and pick a project when it asks.')
  // On a new deployment this push fails on the env it has not been given
  // yet. That is expected: the deployment exists and CONVEX_DEPLOYMENT is in
  // .env.local by then, which is all this step is for.
  const code = await steps.convex(['dev', '--once', '--typecheck', 'disable'], env)
  // Asked to stop: provisioning and starting now would undo that.
  if (code === INTERRUPTED) return INTERRUPTED
  return configuredDeployment(rootDir)
}

/**
 * `env push` on a dev deployment, once: a clean run leaves the shared marker.
 * One refused because a deploy key selects another deployment says why and
 * leaves no marker.
 */
async function provisionEnv(rootDir: string, deployment: string, steps: DevSteps): Promise<void> {
  if (!isDevDeploymentId(deployment) || isEnvProvisioned(rootDir, deployment)) return
  const refusal = devPushRefusal(rootDir)
  if (refusal) {
    steps.log(`env push skipped: ${refusal}`)
    return
  }
  const run = await steps.envPush().catch((error: unknown) => {
    steps.log(`env push failed: ${error instanceof Error ? error.message : String(error)}`)
    return null
  })
  if (!run) return
  for (const { action, outcome, error } of run.results) {
    if (outcome === 'set') steps.log(`env push: ${action.name} — ${action.detail}`)
    else if (outcome === 'failed') steps.log(`env push: ${action.name} failed — ${error}`)
  }
  if (run.results.every(result => result.outcome !== 'failed')) markEnvProvisioned(rootDir, deployment)
}

/** Run the four steps (see the file header); resolves with the exit code to pass on. */
export async function runDev(rootDir: string, nuxtArgs: readonly string[], steps: DevSteps, { anonymous = false } = {}): Promise<number> {
  // `nuxt` for the command Convex starts, whether this runs from a package
  // script (which already has it on PATH) or straight from a terminal.
  const env = {
    ...process.env,
    ...(anonymous ? CONVEX_ANONYMOUS : {}),
    PATH: [join(rootDir, 'node_modules/.bin'), process.env.PATH].filter(Boolean).join(delimiter),
  }

  if (!existsSync(join(rootDir, resolveFunctionsDir(rootDir)))) {
    scaffoldBackendFiles(rootDir, { log: steps.log })
  }

  const deployment = await attachDeployment(rootDir, env, steps, anonymous)
  if (deployment === INTERRUPTED) return INTERRUPTED
  if (!deployment) {
    steps.log('No deployment is configured, so there is nothing to start against. Run `npx convex dev` once to set one up, then run this again.')
    return 1
  }
  await provisionEnv(rootDir, deployment, steps)
  return steps.convex(['dev', '--start', nuxtDevCommand(nuxtArgs)], env)
}

export const dev = withContract('dev', {
  sideEffects: ['writes project files', 'writes the dev deployment'],
  json: 'none: it runs until stopped, with Convex and Nuxt printing to the terminal',
  exitCodes: {
    0: 'Convex and Nuxt stopped cleanly',
    1: 'no deployment could be set up, or Convex failed (its own exit code is passed on)',
    130: 'stopped by Ctrl-C, SIGINT or SIGTERM',
  },
}, defineCommand({
  meta: {
    name: 'dev',
    description: 'Run Convex and Nuxt together: set up the dev deployment on the first run, provision its env, then `convex dev --start "nuxt dev"` (other arguments go to nuxt dev)',
  },
  args: {
    cwd: { type: 'string', description: 'Project directory', default: '.' },
    anonymous: { type: 'boolean', description: 'Start on an account-free local deployment, with no Convex login and no question, on every OS', default: false },
  },
  async run({ rawArgs }) {
    const { cwd, anonymous, nuxtArgs } = splitDevArgs(rawArgs)
    const rootDir = resolve(process.cwd(), cwd)
    // While Convex runs, a stop signal sent here is passed on to it and this
    // process waits for it to clean up (spawnConvex). On Windows a console
    // Ctrl-C reaches Convex, and through it Nuxt, on its own, and the child
    // cannot be stopped gracefully from here, so this process only waits.
    if (process.platform === 'win32') process.on('SIGINT', () => {})
    const log = (line: string) => console.log(`[nuxt-backend] ${line}`)
    process.exitCode = await runDev(rootDir, nuxtArgs, {
      convex: (args, env) => spawnConvex(rootDir, args, { env }),
      envPush: () => runEnvPush(rootDir, {}),
      log,
    }, { anonymous })
  },
}))
