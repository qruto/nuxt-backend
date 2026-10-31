import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { defineCommand, type ArgsDef } from 'citty'
import { installedVersion, type AgentsMdAction, type McpJsonAction, type SkillsReport } from '../agents'
import { packageVersion } from '../dirs'
import { CAPABILITY_NAMES, type CapabilityName } from '../capabilities'
import { formatNextSteps, nextCommands, setUpAgentFiles, setUpProject, type ProjectSetup } from '../setup'
import { doctorReport, formatPreflightSummary } from '../preflight'
import { deployKeyType, devPushRefusal, nonProductionDeployKey, readEnvFiles, runEnvPush, type EnvPushRunResult } from '../env-push'
import { ENV_DEFAULT_TYPES, runEnvDefaults, type EnvDefaultType } from '../env-defaults'
import { bootstrapAdmin } from './admin'
import { askOnTerminal } from './ask'
import { changeConfirmation, fixProviderSettings } from './provider-fix'
import { envRotate } from './rotate'
import { analyze } from './analyze'
import { billing } from './billing'
import { progress, withContract } from './contract'
import { deploy } from './deploy'
import { dev } from './dev'
import { forceRefusal, parseEnvPushArgs, parseForce } from './env-push-args'
import { email, runEmailSyncCommand } from './email'
import { repairProjectFiles } from './repair'
import { inbox } from './inbox'
import { mcp } from './mcp'
import { collectStatus, formatStatus, terminalShowsColor } from './status'
import { ejectCommand } from './eject'
import { upgrade } from './upgrade'
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
 * Refuse `doctor --fix` without `--prod`, a push to the dev deployment,
 * when the deploy key the Convex CLI will use selects another deployment
 * (see `devPushRefusal`; `env push` asks it through `deployKeyRefusal`).
 * True when refused.
 */
function refuseDevFixKey(rootDir: string): boolean {
  const refusal = devPushRefusal(rootDir)
  if (!refusal) return false
  console.error(`[nuxt-backend] doctor --fix refused: ${refusal}`)
  process.exitCode = 1
  return true
}

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

/** What `init --agents --json` prints: what happened to each agent file. */
export interface AgentFilesReport {
  agentsMd: AgentsMdAction
  mcpJson: McpJsonAction
  /** What happened to the agent skills, by name: installed, refreshed, removed, and stale ones left. */
  skills: SkillsReport
  /** The `@modelcontextprotocol/sdk` range added to `devDependencies`, or null when the app lists it already. */
  mcpSdkDependency: string | null
}

/**
 * `init --agents`: rewrite the agent files for the app's installed version,
 * and nothing else. The section of AGENTS.md is replaced (text around it
 * stays), `.mcp.json` gains the developer MCP server (or, with it there, takes the installed version's), the
 * skills in `.agents/skills` become the installed version's, and the MCP
 * SDK the server runs on joins devDependencies when it is missing. An
 * AGENTS.md whose markers don't pair up is refused and left untouched.
 */
function refreshAgentFiles(rootDir: string, json: boolean, print: (line: string) => void): void {
  const { agentsMd, mcpJson, skills, messages, mcpSdkDependency } = setUpAgentFiles(rootDir, true, print)
  if (agentsMd === 'malformed') process.exitCode = 1
  if (messages.length === 0 && !mcpSdkDependency) print(`[nuxt-backend] AGENTS.md, .mcp.json and the agent skills are current for nuxt-backend ${installedVersion(rootDir)}`)
  if (mcpSdkDependency) print(`[nuxt-backend] Run \`npm install\` to link it, then restart your agent.`)
  if (json) {
    const report: AgentFilesReport = { agentsMd, mcpJson, skills, mcpSdkDependency }
    console.log(JSON.stringify(report, null, 2))
  }
}

/** What `init --json` prints: the setup (agent fields null with `--no-agents`), plus the module's place in `nuxt.config`. */
export interface InitReport extends Omit<ProjectSetup, 'start'> {
  /** `listed`: `nuxt.config`'s modules hold `'nuxt-backend'`; `manual`: add it by hand. */
  nuxtConfig: 'listed' | 'manual'
  /** The commands to run next, in order. */
  next: string[]
}

const init = withContract('init', {
  sideEffects: ['writes project files'],
  json: '`{ created, agentsMd, mcpJson, skills, appComponent, devScript, convexDependency, mcpSdkDependency, nuxtConfig, next }`, or `{ agentsMd, mcpJson, skills, mcpSdkDependency }` with `--agents`, where `skills` is `{ installed, refreshed, removed, stale }`, each a list of skill names; progress goes to stderr',
  exitCodes: {
    0: 'done: every file written, or already in place',
    1: 'a file could not be written, or AGENTS.md was refused: its nuxt-backend markers don\'t pair up',
  },
}, defineCommand({
  meta: { name: 'init', description: 'Scaffold the backend files, .env.example, and nuxt.config wiring (re-run to restore missing files; --force to reset)' },
  args: {
    ...cwdArg,
    force: { type: 'boolean', description: 'Overwrite existing scaffold files and .env.example, replace AGENTS.md\'s nuxt-backend section, and replace or remove agent skill copies another version wrote', default: false },
    // No default: a bare `init` writes the agent files beside the scaffold, `--agents` refreshes only them, `--no-agents` skips them.
    agents: { type: 'boolean', description: 'Coding-agent files: --agents rewrites only AGENTS.md\'s nuxt-backend section, .mcp.json and the agent skills in .agents/skills for the installed version, and adds the MCP SDK to devDependencies when missing; --no-agents skips them all' },
    json: { type: 'boolean', description: 'Machine-readable output', default: false },
  },
  async run({ args }) {
    const rootDir = projectRoot(args)
    const print = progress(args.json)
    if (args.agents === true) {
      refreshAgentFiles(rootDir, args.json, print)
      return
    }
    const { start, ...setup } = setUpProject(rootDir, { force: args.force, agents: args.agents !== false, print })
    if (setup.agentsMd === 'malformed') process.exitCode = 1

    const listed = await addModuleToNuxtConfig(rootDir)
    print(listed
      ? '[nuxt-backend] Added \'nuxt-backend\' to nuxt.config modules'
      : '[nuxt-backend] Add the module yourself: modules: [\'nuxt-backend\'] in nuxt.config.ts')

    if (args.json) {
      const report: InitReport = { ...setup, nuxtConfig: listed ? 'listed' : 'manual', next: nextCommands({ ...setup, start }) }
      console.log(JSON.stringify(report, null, 2))
      return
    }
    console.log(`\n${formatNextSteps({ ...setup, start })}\n`)
  },
}))

/**
 * `doctor --fix`: the file repairs ({@link repairProjectFiles}), then sync
 * env with the same engine as `nuxt-backend env push`. `print` takes
 * every progress line: stderr under `--json`, so stdout stays one document.
 * Resolves with the deployment's env names after the push — the ones it
 * listed and the ones it set — or `null` when no deployment was reachable,
 * so the checks that follow need not list them again.
 */
async function repairProject(rootDir: string, prod: boolean, print: (line: string) => void, { interactive, yes, only }: { interactive: boolean, yes: boolean, only: readonly CapabilityName[] | undefined }): Promise<string[] | null> {
  await repairProjectFiles(rootDir, print)
  const run = await runEnvPush(rootDir, { prod })
  if (!run) {
    print('[nuxt-backend] doctor --fix: no deployment reachable — env not pushed.')
    return null
  }
  print(`[nuxt-backend] doctor --fix: env push → ${run.deployment ?? 'deployment'}`)
  reportEnvPush(run, { json: false, dryRun: false, print })
  // The first administrator, when the deployment has none: asked only of a
  // person at a terminal, never of a script or CI.
  if (interactive) await bootstrapAdmin(rootDir, { prod, ask: askOnTerminal, print })
  // The email topics, the accounts' segment and the webhook's events, as `email sync` makes them; a deployment without it is skipped.
  print('[nuxt-backend] doctor --fix: email sync')
  await runEmailSyncCommand(rootDir, { prod }, print)
  // The settings the billing findings recommend, and both providers' webhook endpoints: each change confirmed first.
  const wanted = (capability: CapabilityName) => !only || only.length === 0 || only.includes(capability)
  if (wanted('billing') || wanted('email')) {
    print('[nuxt-backend] doctor --fix: provider settings')
    await fixProviderSettings(rootDir, { prod, confirm: changeConfirmation({ yes, interactive, ask: askOnTerminal, print }), print, billing: wanted('billing'), email: wanted('email') })
  }
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
 * defaults are never written with a production key in hand; the dev
 * deployment is pushed to with no key or a dev one (`devPushRefusal`).
 */
function deployKeyRefusal(target: EnvPushTarget, rootDir: string): string | null {
  const type = deployKeyType({ ...readEnvFiles(rootDir), ...process.env })
  if (target.kind === 'preview' && type !== null && type !== 'preview') {
    return `--preview refused: CONVEX_DEPLOY_KEY is a ${type} deploy key, and the Convex CLI would act on that deployment instead of the preview. Use a preview deploy key, or unset it to use your login.`
  }
  if (target.kind === 'defaults' && type === 'prod') {
    return '--defaults refused: CONVEX_DEPLOY_KEY is a production deploy key. Write project env defaults with your login, or a dev or preview key.'
  }
  if (target.kind === 'deployment' && !target.prod) {
    const refusal = devPushRefusal(rootDir)
    if (refusal) return `env push refused: ${refusal}`
  }
  return null
}

const envPushArgs = {
  ...cwdArg,
  'prod': { type: 'boolean', description: 'Act on the production deployment; never invent values; fail on missing required env', default: false },
  'preview': { type: 'string', description: 'Act on the preview deployment of this name (empty: the branch the CI build names, as convex deploy does); fills AUTH_SECRET, test-mode email and sandbox billing' },
  'defaults': { type: 'string', description: 'Write the project env defaults new deployments of this type start with: preview or dev' },
  'site-url': { type: 'string', description: 'The SITE_URL to write, replacing the one already set (a preview\'s own origin)' },
  'dry-run': { type: 'boolean', description: 'Print the plan without setting anything', default: false },
  'force': { type: 'string', description: 'Replace values already on the deployment with the local ones: a comma-separated list of names, or every name but BACKEND_ENVIRONMENT when bare (or "all"), which --prod refuses' },
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
    // Parsed again, with a bare `--preview` read as one without a name, and a bare `--force` as every name.
    const args = parseEnvPushArgs(rawArgs, envPushArgs)
    const rootDir = projectRoot(args)
    const target = envPushTarget(args)
    const siteUrl = parseSiteUrl(args['site-url'])
    if (siteUrl === null) return
    const refusal = 'refusal' in target ? target.refusal : deployKeyRefusal(target, rootDir) ?? forceRefusal(args.force, { prod: target.kind === 'deployment' && target.prod })
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
  subCommands: { push: envPush, rotate: envRotate },
})

/**
 * `--only billing,email`: the capabilities to check, or `undefined` for all.
 * Null (with the error printed) when a name isn't a capability.
 */
function parseOnly(raw: unknown): CapabilityName[] | undefined | null {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined
  const names = raw.split(',').map(name => name.trim().toLowerCase()).filter(Boolean)
  const unknown = names.filter(name => !(CAPABILITY_NAMES as string[]).includes(name))
  if (unknown.length > 0) {
    console.error(`[nuxt-backend] doctor --only: ${unknown.join(', ')} is not a capability. Capabilities: ${CAPABILITY_NAMES.join(', ')}.`)
    process.exitCode = 1
    return null
  }
  return names as CapabilityName[]
}

const doctor = withContract('doctor', {
  sideEffects: ['reads only'],
  byFlag: {
    '--fix': ['writes project files', 'writes the dev deployment', 'writes provider accounts'],
    '--fix --prod': ['writes project files', 'writes production', 'writes provider accounts'],
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
    fix: { type: 'boolean', description: 'Repair what doctor can: restore missing scaffold files, add missing mounts and routes, push env (`env push`), at a terminal make the first administrator, and apply the provider settings the billing findings recommend and turn a webhook endpoint back on, each after you confirm it', default: false },
    yes: { type: 'boolean', description: 'With --fix: apply the provider changes without asking (for a script or CI)', default: false },
    prod: { type: 'boolean', description: 'Check the production deployment: missing email/billing config becomes a failure, its switches and email are read, and its live site is probed', default: false },
    only: { type: 'string', description: `Check only these capabilities, comma-separated: ${CAPABILITY_NAMES.join(', ')}` },
  },
  async run({ args }) {
    const rootDir = projectRoot(args)
    const only = parseOnly(args.only)
    if (only === null) return
    if (refuseNonProductionKey(args.prod, rootDir)) return
    if (args.fix && !args.prod && refuseDevFixKey(rootDir)) return

    const interactive = !args.json && Boolean(process.stdin.isTTY)
    const deployedNames = args.fix ? await repairProject(rootDir, args.prod, progress(args.json), { interactive, yes: args.yes, only }) : undefined

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

const status = withContract('status', {
  sideEffects: ['reads only'],
  json: '`{ deployment, status, capabilities: [{ name, title, state, reason, providers, missingEnv, findings, top, docsUrl, devtools }], summary }`: `state` is `live`, `test`, `missing` or `failing`, `status` is `ok`, `degraded` or `failing`',
  exitCodes: {
    0: 'no capability is failing (missing and test capabilities allowed)',
    1: 'a capability is failing, or --prod was refused',
  },
}, defineCommand({
  meta: { name: 'status', description: 'Show each capability\'s state — live, test, missing or failing — with its providers, unset env and most pressing finding' },
  args: {
    ...cwdArg,
    json: { type: 'boolean', description: 'Machine-readable output', default: false },
    prod: { type: 'boolean', description: 'The production deployment\'s capabilities, under doctor\'s production posture and its live probes', default: false },
  },
  async run({ args }) {
    const rootDir = projectRoot(args)
    if (refuseNonProductionKey(args.prod, rootDir)) return
    const report = await collectStatus(rootDir, { prod: args.prod })
    if (args.json) console.log(JSON.stringify(report, null, 2))
    else console.log(formatStatus(report, { prod: args.prod, color: terminalShowsColor() }).join('\n'))
    if (report.status === 'failing') process.exitCode = 1
  },
}))

export const main = defineCommand({
  meta: {
    name: 'nuxt-backend',
    version: packageVersion(),
    description: 'The complete backend for a Nuxt app on Convex — scaffold and check your project',
  },
  subCommands: { init, dev, doctor, status, env, billing, email, inbox, upgrade, eject: ejectCommand, deploy, analyze, mcp },
})
