import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { defineCommand } from 'citty'
import { writeAgentFiles } from '../agents'
import { packageDir, packageVersion } from '../dirs'
import { mountPagesInAppComponent, scaffoldBackendFiles, resolveFunctionsDir } from '../scaffold'
import type { BackendInstallationMode } from '../templates'
import { formatPreflightSummary } from '../preflight'
import { BACKEND_ENV_NAMES, nonProductionDeployKey, readEnvFiles, runEnvPush, type EnvPushRunResult } from '../env-push'
import { billing } from './billing'
import { adoptBackendDevScript, dev } from './dev'
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

/** Run a read-only `convex <args>` returning stdout, or null on any failure (CLI absent, no deployment, …). */

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
 * (test/unit/local-install-parity.test.ts): the file an app created from a
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

const init = defineCommand({
  meta: { name: 'init', description: 'Scaffold the backend files, .env.example, and nuxt.config wiring (re-run to restore missing files; --force to reset)' },
  args: {
    ...cwdArg,
    installation: { type: 'string', description: 'Scaffold mode: default | local', default: 'default' },
    force: { type: 'boolean', description: 'Overwrite existing scaffold files', default: false },
    agents: { type: 'boolean', description: 'Write AGENTS.md and .mcp.json for coding agents (--no-agents skips both)', default: true },
  },
  run({ args }) {
    const rootDir = projectRoot(args)
    scaffoldBackendFiles(rootDir, {
      installation: args.installation as BackendInstallationMode,
      force: args.force,
    })

    const envExamplePath = join(rootDir, '.env.example')
    if (args.force || !existsSync(envExamplePath)) {
      writeFileSync(envExamplePath, ENV_EXAMPLE)
      console.log('[nuxt-backend] Created .env.example')
    }

    if (args.agents) {
      for (const message of writeAgentFiles(rootDir, { force: args.force })) console.log(`[nuxt-backend] ${message}`)
    }

    const appComponent = mountPagesInAppComponent(rootDir)
    if (appComponent) {
      console.log(`[nuxt-backend] Replaced <NuxtWelcome /> with <NuxtPage /> in ${appComponent} so the module's pages render`)
    }

    const devScript = adoptBackendDevScript(rootDir)
    if (devScript?.changed) {
      console.log(`[nuxt-backend] Set scripts.dev to \`${devScript.script}\`: one command sets up the deployment, provisions its env and runs Convex beside Nuxt`)
    }
    const start = devScript ? 'npm run dev' : 'npx nuxt-backend dev'

    const convexRange = declareConvexDependency(rootDir)
    if (convexRange) {
      console.log(`[nuxt-backend] Added convex@${convexRange} to dependencies — install once more so it links (\`npx convex dev\` needs the app itself to declare it)`)
    }

    return addModuleToNuxtConfig(rootDir).then((added) => {
      if (added) {
        console.log('[nuxt-backend] Added \'nuxt-backend\' to nuxt.config modules')
      }
      else {
        console.log('[nuxt-backend] Add the module yourself: modules: [\'nuxt-backend\'] in nuxt.config.ts')
      }
      if (args.installation === 'local') {
        console.log('[nuxt-backend] Local install: add \'@convex-dev/resend\' as a direct dependency (pnpm add @convex-dev/resend) so the local component config resolves it.')
      }
      console.log(`
Next steps:
${convexRange ? '  npm install              # links the convex dependency added above\n' : ''}  ${start.padEnd(24)} # the first run sets up your Convex dev deployment (log in
                           # when asked) and provisions its env, then runs Convex and Nuxt
  Sign in at /login — with no EMAIL_API_KEY yet, the OTP code prints in the same terminal.

Later, as you connect services: add EMAIL_API_KEY / BILLING_ACCESS_TOKEN to
.env.local and run \`npx nuxt-backend env push\`.
`)
    })
  },
})

/**
 * `doctor --fix`: restore missing scaffold files (existing files are never
 * touched), replace a `dev` script that stalls on a new deployment, then
 * sync env with the same engine as `nuxt-backend env push`.
 */
async function repairProject(rootDir: string, prod: boolean): Promise<void> {
  const functionsDir = resolveFunctionsDir(rootDir)
  const installation: BackendInstallationMode
    = existsSync(join(rootDir, functionsDir, 'components/backend')) ? 'local' : 'default'
  scaffoldBackendFiles(rootDir, { installation })
  const devScript = adoptBackendDevScript(rootDir, { onlyCombined: true })
  if (devScript?.changed) console.log(`[nuxt-backend] doctor --fix: scripts.dev → \`${devScript.script}\``)
  const run = await runEnvPush(rootDir, { prod })
  if (run) {
    console.log(`[nuxt-backend] doctor --fix: env push → ${run.deployment ?? 'deployment'}`)
    reportEnvPush(run, { json: false, dryRun: false })
  }
  else {
    console.log('[nuxt-backend] doctor --fix: no deployment reachable — env not pushed.')
  }
}

/**
 * Print an env-push run as a summary table (values never printed), or JSON.
 * Returns whether anything failed / was missing.
 */
function reportEnvPush(run: EnvPushRunResult, { json, dryRun }: { json: boolean, dryRun: boolean }): boolean {
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
      console.log(`  ${verb.padEnd(9)} ${action.name.padEnd(24)} ${error ?? action.detail}`)
    }
    if (run.missingRequired.length > 0) {
      console.log(`\nRequired env missing: ${run.missingRequired.join(', ')} — add them to .env.local and push again.`)
    }
  }
  return failed.length > 0 || run.missingRequired.length > 0
}

const envPush = defineCommand({
  meta: { name: 'push', description: 'Sync backend env from .env(.local) to the Convex deployment (dev deployments also get AUTH_SECRET/SITE_URL provisioned)' },
  args: {
    ...cwdArg,
    'prod': { type: 'boolean', description: 'Act on the production deployment; never invent values; fail on missing required env', default: false },
    'dry-run': { type: 'boolean', description: 'Print the plan without setting anything', default: false },
    'force': { type: 'string', description: 'Replace values already on the deployment: a comma-separated list of names, or "all"' },
    'json': { type: 'boolean', description: 'Machine-readable output', default: false },
  },
  async run({ args }) {
    const rootDir = projectRoot(args)
    if (refuseNonProductionKey(args.prod, rootDir)) return
    const run = await runEnvPush(rootDir, { prod: args.prod, dryRun: args['dry-run'], ...(parseForce(args.force) ? { force: parseForce(args.force)! } : {}) })
    if (!run) {
      console.error('[nuxt-backend] No Convex deployment reachable — run `npx convex dev` once, then push again.')
      process.exitCode = 1
      return
    }
    if (!args.json) {
      console.log(`[nuxt-backend] env push → ${run.deployment ?? 'deployment'}${run.dev ? ' (dev)' : ''}${args['dry-run'] ? ' — dry run' : ''}`)
    }
    const problems = reportEnvPush(run, { json: args.json, dryRun: args['dry-run'] })
    if (problems) process.exitCode = 1
  },
})

const env = defineCommand({
  meta: { name: 'env', description: 'Deployment environment helpers' },
  subCommands: { push: envPush },
})

const doctor = defineCommand({
  meta: { name: 'doctor', description: 'Check the project + deployment configuration' },
  args: {
    ...cwdArg,
    json: { type: 'boolean', description: 'Machine-readable output', default: false },
    fix: { type: 'boolean', description: 'Repair what doctor can: restore missing scaffold files, push env (`env push`)', default: false },
    prod: { type: 'boolean', description: 'Check the production deployment; missing email/billing config becomes a failure', default: false },
  },
  async run({ args }) {
    const rootDir = projectRoot(args)
    if (refuseNonProductionKey(args.prod, rootDir)) return

    if (args.fix) await repairProject(rootDir, args.prod)

    const reported = await runDoctorChecks(rootDir, { prod: args.prod })

    if (args.json) {
      console.log(JSON.stringify({ findings: reported, summary: formatPreflightSummary(reported) }, null, 2))
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
})

export const main = defineCommand({
  meta: {
    name: 'nuxt-backend',
    version: packageVersion(),
    description: 'All-in-one SaaS backend for Nuxt on Convex — scaffold and check your project',
  },
  subCommands: { init, dev, doctor, env, billing },
})
