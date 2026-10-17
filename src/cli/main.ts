import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { defineCommand, parseArgs, type ArgsDef } from 'citty'
import { writeAgentFiles, type AgentsMdAction, type McpJsonAction } from '../agents'
import { packageDir, packageVersion } from '../dirs'
import { mountPagesInAppComponent, scaffoldBackendFiles } from '../scaffold'
import { FINDING_SERVICES, type FindingService } from '../findings'
import { doctorReport, formatPreflightSummary } from '../preflight'
import { BACKEND_ENV_NAMES, deployKeyType, nonProductionDeployKey, readEnvFiles, runEnvPush, type EnvPushRunResult } from '../env-push'
import { ENV_DEFAULT_TYPES, runEnvDefaults, type EnvDefaultType } from '../env-defaults'
import { billing } from './billing'
import { progress, withContract } from './contract'
import { adoptBackendDevScript, dev } from './dev'
import { inbox } from './inbox'
import { runDoctorChecks } from '../doctor'

/**
 * Refuse a `--prod` command when the deploy key the Convex CLI will use names
 * a dev or preview deployment (see `nonProductionDeployKey`). True when
 * refused. The key is looked up where the Convex CLI looks: the process env,
 * then `.env.local`, then `.env` — dotenv never overrides a value already
 * set, and `readEnvFiles` lets `.env.local` win over `.env` the same way.
 */
function refuseNonProductionKey(prod: boolean, rootDir: string): boolean {
  if (!prod) return false
  const type = nonProductionDeployKey({ ...readEnvFiles(rootDir), ...process.env })
  if (!type) return false
  console.error(`[nuxt-backend] --prod refused: CONVEX_DEPLOY_KEY is a ${type} deployment key, and the Convex CLI would act on that deployment instead of production. Use the production deploy key (Convex dashboard → Settings, or your host's production environment).`)
  process.exitCode = 1
  return true
}

/**
 * `--force` for `env push`: which already-set deployment values may be
 * replaced by the local ones. Rotation has to be asked for — the plan reads
 * deployment env NAMES only, never values, so it cannot tell a rotated secret
 * from an identical one and must not guess.
 */
function parseForce(raw: unknown): ReadonlySet<string> | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null
  const names = raw.split(',').map(name => name.trim()).filter(Boolean)
  if (names.some(name => name.toLowerCase() === 'all')) return new Set(BACKEND_ENV_NAMES)
  return new Set(names.map(name => name.toUpperCase()))
}

/**
 * The `.env.example` that `init` writes. Exported so the templates and
 * examples can be pinned to it byte for byte
 * (test/unit/scaffold-parity.test.ts): the file an app created from a
 * template ships must be the file `init` would write.
 */
export const ENV_EXAMPLE = `# Local environment, grouped by what each value is for. Names describe what
# they do rather than the service underneath.
#
# Nothing here is required in dev: the backend URLs derive from the deployment
# slug the platform CLI writes, and AUTH_SECRET + SITE_URL are provisioned for
# you on the first run. Add provider keys as you connect services, then sync
# them to the deployment with \`npx nuxt-backend env push\`.

# ── Backend ───────────────────────────────────────────────────────────────────
# Normally derived. Set these only to point at another deployment.
# NUXT_PUBLIC_BACKEND_URL=
# NUXT_PUBLIC_BACKEND_SITE_URL=

# ── Email ─────────────────────────────────────────────────────────────────────
# Unset: sends no-op and OTP codes print in the backend dev console.
# EMAIL_API_KEY=
# EMAIL_FROM=
# EMAIL_TEST_MODE=
# EMAIL_WEBHOOK_SECRET=

# ── Billing ───────────────────────────────────────────────────────────────────
# Unset: billing reads return empty and checkout fails on invocation.
# BILLING_ACCESS_TOKEN=
# BILLING_ENVIRONMENT=
# BILLING_WEBHOOK_SECRET=

# ── Dev only ──────────────────────────────────────────────────────────────────
# Also trust the http://localhost:* origin the dev server runs on, in addition
# to SITE_URL. \`env push\` forwards this to dev deployments, never to production.
# AUTH_TRUST_LOCAL_ORIGINS=1
`

const cwdArg = {
  cwd: { type: 'string' as const, description: 'Project directory', default: '.' },
}

function projectRoot(args: { cwd: string }): string {
  return resolve(process.cwd(), args.cwd)
}

/** Add 'nuxt-backend' to nuxt.config modules via magicast; false when not possible. */
async function addModuleToNuxtConfig(rootDir: string): Promise<boolean> {
  const configPath = ['nuxt.config.ts', 'nuxt.config.js', 'nuxt.config.mjs']
    .map(name => join(rootDir, name))
    .find(existsSync)
  if (!configPath) return false
  try {
    const { loadFile, writeFile } = await import('magicast')
    const { addNuxtModule } = await import('magicast/helpers')
    const config = await loadFile(configPath)
    addNuxtModule(config, 'nuxt-backend')
    await writeFile(config, configPath)
    return true
  }
  catch {
    return false
  }
}

/**
 * Declare `convex` in the app's own manifest when it is missing. It is this
 * package's peer dependency, so a package manager installs it anyway — but
 * `npx convex dev` reads the app's `package.json` and refuses to run until
 * the app lists it itself. The range comes from the copy already installed
 * (a caret on its version, so nothing changes on the next install), else
 * from this package's peer range. Returns the range written, or `undefined`
 * when nothing needed doing.
 */
function declareConvexDependency(rootDir: string): string | undefined {
  const manifestPath = join(rootDir, 'package.json')
  // One read: the same bytes decide, are parsed, and set the formatting.
  let source: string
  let manifest: { dependencies?: Record<string, string>, devDependencies?: Record<string, string> }
  try {
    source = readFileSync(manifestPath, 'utf-8')
    manifest = JSON.parse(source) as typeof manifest
  }
  catch {
    // No manifest, or not JSON — nothing to declare into.
    return undefined
  }
  if (manifest.dependencies?.convex || manifest.devDependencies?.convex) return undefined

  let range: string | undefined
  try {
    const installed = JSON.parse(readFileSync(createRequire(manifestPath).resolve('convex/package.json'), 'utf-8')) as { version: string }
    range = `^${installed.version}`
  }
  catch {
    const own = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf-8')) as { peerDependencies?: Record<string, string> }
    range = own.peerDependencies?.convex
  }
  if (!range) return undefined

  // Keys sorted like a package manager would write them, so the diff is
  // one line.
  const dependencies = Object.fromEntries(
    Object.entries({ ...manifest.dependencies, convex: range }).sort(([a], [b]) => a.localeCompare(b)),
  )
  const indent = /^(\s+)"/m.exec(source)?.[1] ?? '  '
  const eol = source.endsWith('\n') ? '\n' : ''
  writeFileSync(manifestPath, JSON.stringify({ ...manifest, dependencies }, null, indent) + eol)
  return range
}

/** What `init --json` prints. */
export interface InitReport {
  /** The files written, relative to the project: scaffold files, `convex.json`, `.env.example`. */
  created: string[]
  /** What happened to AGENTS.md; null with `--no-agents`. */
  agentsMd: AgentsMdAction | null
  /** What happened to `.mcp.json`; null with `--no-agents`. */
  mcpJson: McpJsonAction | null
  /** The root component whose `<NuxtWelcome />` became `<NuxtPage />`, or null. */
  appComponent: string | null
  /** The `dev` script, when init pointed it at `nuxt-backend dev`; null when it left the script alone. */
  devScript: string | null
  /** The `convex` range added to `dependencies`, or null. */
  convexDependency: string | null
  /** `listed`: `nuxt.config`'s modules hold `'nuxt-backend'`; `manual`: add it by hand. */
  nuxtConfig: 'listed' | 'manual'
  /** The commands to run next, in order. */
  next: string[]
}

const init = withContract('init', {
  sideEffects: ['writes project files'],
  json: '`{ created, agentsMd, mcpJson, appComponent, devScript, convexDependency, nuxtConfig, next }`; progress goes to stderr',
  exitCodes: {
    0: 'done: every file written, or already in place',
    1: 'a file could not be written',
  },
}, defineCommand({
  meta: { name: 'init', description: 'Scaffold the backend files, .env.example, and nuxt.config wiring (re-run to restore missing files; --force to reset)' },
  args: {
    ...cwdArg,
    force: { type: 'boolean', description: 'Overwrite existing scaffold files', default: false },
    agents: { type: 'boolean', description: 'Write AGENTS.md and .mcp.json for coding agents (--no-agents skips both)', default: true },
    json: { type: 'boolean', description: 'Machine-readable output', default: false },
  },
  async run({ args }) {
    const rootDir = projectRoot(args)
    const print = progress(args.json)
    const created = scaffoldBackendFiles(rootDir, { force: args.force, log: print })

    const envExamplePath = join(rootDir, '.env.example')
    if (args.force || !existsSync(envExamplePath)) {
      writeFileSync(envExamplePath, ENV_EXAMPLE)
      created.push('.env.example')
      print('[nuxt-backend] Created .env.example')
    }

    const agents = args.agents ? writeAgentFiles(rootDir, { force: args.force }) : null
    for (const message of agents?.messages ?? []) print(`[nuxt-backend] ${message}`)

    const appComponent = mountPagesInAppComponent(rootDir) ?? null
    if (appComponent) {
      print(`[nuxt-backend] Replaced <NuxtWelcome /> with <NuxtPage /> in ${appComponent} so the module's pages render`)
    }

    const devScript = adoptBackendDevScript(rootDir)
    if (devScript?.changed) {
      print(`[nuxt-backend] Set scripts.dev to \`${devScript.script}\`: one command sets up the deployment, provisions its env and runs Convex beside Nuxt`)
    }
    const start = devScript ? 'npm run dev' : 'npx nuxt-backend dev'

    const convexRange = declareConvexDependency(rootDir) ?? null
    if (convexRange) {
      print(`[nuxt-backend] Added convex@${convexRange} to dependencies — install once more so it links (\`npx convex dev\` needs the app itself to declare it)`)
    }

    const listed = await addModuleToNuxtConfig(rootDir)
    print(listed
      ? '[nuxt-backend] Added \'nuxt-backend\' to nuxt.config modules'
      : '[nuxt-backend] Add the module yourself: modules: [\'nuxt-backend\'] in nuxt.config.ts')

    if (args.json) {
      const report: InitReport = {
        created,
        agentsMd: agents?.agentsMd ?? null,
        mcpJson: agents?.mcpJson ?? null,
        appComponent,
        devScript: devScript?.changed ? devScript.script : null,
        convexDependency: convexRange,
        nuxtConfig: listed ? 'listed' : 'manual',
        next: [...convexRange ? ['npm install'] : [], start],
      }
      console.log(JSON.stringify(report, null, 2))
      return
    }
    console.log(`
Next steps:
${convexRange ? '  npm install              # links the convex dependency added above\n' : ''}  ${start.padEnd(24)} # the first run sets up your Convex dev deployment (log in
                           # when asked) and provisions its env, then runs Convex and Nuxt
  Sign in at /login — with no EMAIL_API_KEY yet, the OTP code prints in the same terminal.

Later, as you connect services: add EMAIL_API_KEY / BILLING_ACCESS_TOKEN to
.env.local and run \`npx nuxt-backend env push\`.
`)
  },
}))

/**
 * `doctor --fix`: restore missing scaffold files (existing files are never
 * touched), replace a `dev` script that stalls on a new deployment, then
 * sync env with the same engine as `nuxt-backend env push`. `print` takes
 * every progress line: stderr under `--json`, so stdout stays one document.
 * Resolves with the deployment's env names after the push — the ones it
 * listed and the ones it set — or `null` when no deployment was reachable,
 * so the checks that follow need not list them again.
 */
async function repairProject(rootDir: string, prod: boolean, print: (line: string) => void): Promise<string[] | null> {
  scaffoldBackendFiles(rootDir, { log: print })
  const devScript = adoptBackendDevScript(rootDir, { onlyCombined: true })
  if (devScript?.changed) print(`[nuxt-backend] doctor --fix: scripts.dev → \`${devScript.script}\``)
  const run = await runEnvPush(rootDir, { prod })
  if (!run) {
    print('[nuxt-backend] doctor --fix: no deployment reachable — env not pushed.')
    return null
  }
  print(`[nuxt-backend] doctor --fix: env push → ${run.deployment ?? 'deployment'}`)
  reportEnvPush(run, { json: false, dryRun: false, print })
  const set = run.results.filter(result => result.outcome === 'set').map(result => result.action.name)
  return [...new Set([...run.deployedNames, ...set])]
}

/**
 * Print an env-push run as a summary table (values never printed), or JSON.
 * Returns whether anything failed / was missing.
 */
function reportEnvPush(run: EnvPushRunResult, { json, dryRun, print = console.log }: { json: boolean, dryRun: boolean, print?: (line: string) => void }): boolean {
  const failed = run.results.filter(result => result.outcome === 'failed')
  if (json) {
    console.log(JSON.stringify({
      deployment: run.deployment,
      dev: run.dev,
      results: run.results.map(({ action, outcome, error }) => ({ name: action.name, action: action.action, detail: action.detail, outcome, error })),
      missingRequired: run.missingRequired,
    }, null, 2))
  }
  else {
    const label = { set: dryRun ? 'would set' : 'set', planned: 'would set', skipped: '·', failed: '✗' } as const
    for (const { action, outcome, error } of run.results) {
      const verb = action.action === 'skip' ? 'skipped' : action.action === 'unset' ? 'unset' : action.action === 'missing' ? 'MISSING' : label[outcome]
      print(`  ${verb.padEnd(9)} ${action.name.padEnd(24)} ${error ?? action.detail}`)
    }
    if (run.missingRequired.length > 0) {
      print(`\nRequired env missing: ${run.missingRequired.join(', ')} — see the line above for where each comes from, then push again.`)
    }
  }
  return failed.length > 0 || run.missingRequired.length > 0
}

/**
 * The branch a CI build is for, read the way `convex deploy` reads it to name
 * the preview deployment it creates: `--preview` without a name means that
 * preview. Null outside a CI build that names one.
 */
function ciBranch(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.VERCEL) return env.VERCEL_GIT_COMMIT_REF ?? null
  if (env.NETLIFY) return env.HEAD ?? null
  if (env.CF_PAGES || env.WORKERS_CI) return env.CF_PAGES_BRANCH ?? env.WORKERS_CI_BRANCH ?? null
  if (env.CI) return env.GITHUB_HEAD_REF ?? env.CI_COMMIT_REF_NAME ?? null
  return null
}

/** What `env push` writes, once its flags have been checked. */
type EnvPushTarget
  = | { kind: 'deployment', prod: boolean }
    | { kind: 'preview', name: string }
    | { kind: 'defaults', type: EnvDefaultType }

interface EnvPushFlags {
  'prod': boolean
  'preview'?: string
  'defaults'?: string
  'site-url'?: string
}

/** `--preview [name]` and `--defaults <type>`, checked: the target, or why the flags are refused. */
function envPushTarget(args: EnvPushFlags): EnvPushTarget | { refusal: string } {
  const preview = args.preview
  const defaults = args.defaults
  if ([args.prod, preview !== undefined, defaults !== undefined].filter(Boolean).length > 1) {
    return { refusal: 'env push takes one target: --prod, --preview or --defaults.' }
  }
  if (defaults !== undefined) {
    if (!(ENV_DEFAULT_TYPES as readonly string[]).includes(defaults)) {
      return { refusal: `--defaults takes ${ENV_DEFAULT_TYPES.join(' or ')}${defaults.startsWith('prod') ? ': production never starts from generated values' : ''}.` }
    }
    return { kind: 'defaults', type: defaults as EnvDefaultType }
  }
  if (preview !== undefined) {
    const name = preview || ciBranch()
    if (!name) return { refusal: '--preview needs the preview deployment\'s name: the branch `convex deploy` named it after (outside a CI build that names one, pass it: --preview <name>).' }
    return { kind: 'preview', name }
  }
  return { kind: 'deployment', prod: args.prod }
}

/** `--site-url`: an http(s) URL, without a trailing slash. Undefined when not given; null (with the error printed) when malformed. */
function parseSiteUrl(raw: string | undefined): string | undefined | null {
  if (raw === undefined || raw.trim() === '') return undefined
  try {
    const url = new URL(raw.trim())
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href.replace(/\/+$/, '')
  }
  catch {
    // reported below
  }
  console.error(`[nuxt-backend] --site-url must be an http(s) URL, such as https://my-branch.example.app — got "${raw}".`)
  process.exitCode = 1
  return null
}

/**
 * A deploy key the Convex CLI would follow somewhere other than the target.
 * A preview is reached with the developer's login or a preview key; project
 * defaults are never written with a production key in hand.
 */
function deployKeyRefusal(target: EnvPushTarget, rootDir: string): string | null {
  const type = deployKeyType({ ...readEnvFiles(rootDir), ...process.env })
  if (target.kind === 'preview' && type !== null && type !== 'preview') {
    return `--preview refused: CONVEX_DEPLOY_KEY is a ${type} deploy key, and the Convex CLI would act on that deployment instead of the preview. Use a preview deploy key, or unset it to use your login.`
  }
  if (target.kind === 'defaults' && type === 'prod') {
    return '--defaults refused: CONVEX_DEPLOY_KEY is a production deploy key. Write project env defaults with your login, or a dev or preview key.'
  }
  return null
}

/**
 * A string flag given without a value — last, or followed by another flag —
 * as `--flag=`: the flag parser would otherwise take the next flag for its
 * value (`--preview --json`).
 */
function bareFlag(rawArgs: readonly string[], flag: string): string[] {
  return rawArgs.map((arg, index) => {
    const next = rawArgs[index + 1]
    return arg === flag && (next === undefined || next.startsWith('-')) ? `${flag}=` : arg
  })
}

const envPushArgs = {
  ...cwdArg,
  'prod': { type: 'boolean', description: 'Act on the production deployment; never invent values; fail on missing required env', default: false },
  'preview': { type: 'string', description: 'Act on the preview deployment of this name (empty: the branch the CI build names, as convex deploy does); fills AUTH_SECRET, test-mode email and sandbox billing' },
  'defaults': { type: 'string', description: 'Write the project env defaults new deployments of this type start with: preview or dev' },
  'site-url': { type: 'string', description: 'The SITE_URL to write, replacing the one already set (a preview\'s own origin)' },
  'dry-run': { type: 'boolean', description: 'Print the plan without setting anything', default: false },
  'force': { type: 'string', description: 'Replace values already on the deployment: a comma-separated list of names, or "all"' },
  'json': { type: 'boolean', description: 'Machine-readable output', default: false },
} satisfies ArgsDef

const envPush = withContract('env push', {
  sideEffects: ['writes the dev deployment'],
  byFlag: {
    '--prod': ['writes production'],
    '--preview': ['writes a preview deployment'],
    '--defaults': ['writes project env defaults'],
    '--dry-run': ['reads only'],
  },
  json: '`{ deployment, dev, results: [{ name, action, detail, outcome, error }], missingRequired }`: `deployment` names what was written (`dev:<slug>`, `production`, `preview:<name>`, `defaults:<type>`); values never appear',
  exitCodes: {
    0: 'every value set, or nothing to set',
    1: 'refused, no deployment (or project defaults) reachable, a set failed, or required env is missing',
  },
}, defineCommand({
  meta: { name: 'push', description: 'Sync backend env from .env(.local) to the Convex deployment (dev deployments also get AUTH_SECRET/SITE_URL provisioned)' },
  args: envPushArgs,
  async run({ rawArgs }) {
    // Parsed again, with a bare `--preview` read as one without a name.
    const args = parseArgs<typeof envPushArgs>(bareFlag(rawArgs, '--preview'), envPushArgs)
    const rootDir = projectRoot(args)
    const target = envPushTarget(args)
    const siteUrl = parseSiteUrl(args['site-url'])
    if (siteUrl === null) return
    const refusal = 'refusal' in target ? target.refusal : deployKeyRefusal(target, rootDir)
    if (refusal || 'refusal' in target) {
      console.error(`[nuxt-backend] ${refusal}`)
      process.exitCode = 1
      return
    }
    const resolved: EnvPushTarget = target
    if (resolved.kind === 'deployment' && refuseNonProductionKey(resolved.prod, rootDir)) return
    const force = parseForce(args.force)
    const common = { dryRun: args['dry-run'], ...(force ? { force } : {}), ...(siteUrl ? { siteUrl } : {}) }
    const run = resolved.kind === 'defaults'
      ? await runEnvDefaults(rootDir, { type: resolved.type, ...common })
      : await runEnvPush(rootDir, { ...common, ...(resolved.kind === 'preview' ? { preview: resolved.name } : { prod: resolved.prod }) })
    if (!run) {
      console.error(resolved.kind === 'defaults'
        ? '[nuxt-backend] Could not read the project\'s env defaults: they exist for cloud projects, with your Convex login or a deploy key. Run `npx convex dev` once with a cloud deployment, then push again.'
        : '[nuxt-backend] No Convex deployment reachable — run `npx convex dev` once, then push again.')
      process.exitCode = 1
      return
    }
    if (!args.json) {
      const label = resolved.kind === 'defaults' ? `project env defaults for new ${resolved.type} deployments` : run.deployment ?? 'deployment'
      console.log(`[nuxt-backend] env push → ${label}${run.dev ? ' (dev)' : ''}${args['dry-run'] ? ' — dry run' : ''}`)
    }
    const problems = reportEnvPush(run, { json: args.json, dryRun: args['dry-run'] })
    if (problems) process.exitCode = 1
  },
}))

const env = defineCommand({
  meta: { name: 'env', description: 'Deployment environment helpers' },
  subCommands: { push: envPush },
})

/**
 * `--only billing,email`: the services to check, or `undefined` for all.
 * Null (with the error printed) when a name isn't a service.
 */
function parseOnly(raw: unknown): FindingService[] | undefined | null {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined
  const names = raw.split(',').map(name => name.trim().toLowerCase()).filter(Boolean)
  const unknown = names.filter(name => !(FINDING_SERVICES as string[]).includes(name))
  if (unknown.length > 0) {
    console.error(`[nuxt-backend] doctor --only: ${unknown.join(', ')} is not a service. Services: ${FINDING_SERVICES.join(', ')}.`)
    process.exitCode = 1
    return null
  }
  return names as FindingService[]
}

const doctor = withContract('doctor', {
  sideEffects: ['reads only'],
  byFlag: {
    '--fix': ['writes project files', 'writes the dev deployment'],
    '--fix --prod': ['writes project files', 'writes production'],
  },
  json: '`{ $schema, findings, summary }`, described by https://nuxt-backend.dev/schemas/doctor.json; with `--fix`, the repair\'s progress goes to stderr',
  exitCodes: {
    0: 'no finding failed (warnings allowed)',
    1: 'a finding failed, or the flags were refused',
  },
}, defineCommand({
  meta: { name: 'doctor', description: 'Check the project + deployment configuration' },
  args: {
    ...cwdArg,
    json: { type: 'boolean', description: 'Machine-readable output', default: false },
    fix: { type: 'boolean', description: 'Repair what doctor can: restore missing scaffold files, push env (`env push`)', default: false },
    prod: { type: 'boolean', description: 'Check the production deployment; missing email/billing config becomes a failure', default: false },
    only: { type: 'string', description: `Check only these services, comma-separated: ${FINDING_SERVICES.join(', ')}` },
  },
  async run({ args }) {
    const rootDir = projectRoot(args)
    const only = parseOnly(args.only)
    if (only === null) return
    if (refuseNonProductionKey(args.prod, rootDir)) return

    const deployedNames = args.fix ? await repairProject(rootDir, args.prod, progress(args.json)) : undefined

    const reported = await runDoctorChecks(rootDir, { prod: args.prod, ...(only ? { only } : {}), ...(deployedNames !== undefined ? { deployedNames } : {}) })

    if (args.json) {
      console.log(JSON.stringify(doctorReport(reported), null, 2))
    }
    else {
      const icon = { pass: '✓', warn: '⚠', fail: '✗' } as const
      for (const finding of reported) {
        console.log(`${icon[finding.status]} ${finding.title}: ${finding.message}${finding.fixHint ? `\n    ↳ ${finding.fixHint}` : ''}`)
      }
      console.log(`\n${formatPreflightSummary(reported)}`)
    }
    if (reported.some(finding => finding.status === 'fail')) {
      process.exitCode = 1
    }
  },
}))

export const main = defineCommand({
  meta: {
    name: 'nuxt-backend',
    version: packageVersion(),
    description: 'All-in-one SaaS backend for Nuxt on Convex — scaffold and check your project',
  },
  subCommands: { init, dev, doctor, env, billing, inbox },
})
