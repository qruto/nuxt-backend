import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { defineCommand } from 'citty'
import { packageDir, packageVersion } from '../dirs'
import { runConvex } from '../convex-cli'
import { mountPagesInAppComponent, scaffoldBackendFiles, resolveFunctionsDir } from '../scaffold'
import type { BackendInstallationMode } from '../templates'
import { collectPreflightFindings, DEV_ONLY_DEPLOYMENT_ENV, formatPreflightSummary, OPTIONAL_DEPLOYMENT_ENV, REQUIRED_DEPLOYMENT_ENV, type PreflightFinding } from '../preflight'
import { BACKEND_ENV_NAMES, deploymentEnvNames, isDevDeployment, readEnvFiles, runEnvPush, type EnvPushRunResult } from '../env-push'
import { deriveDeploymentUrls, resolveSiteUrl } from '../deployment'
import type { BillingCatalog } from '../convex/catalog'
import { billing, collectBillingFindings, loadCatalog, readBillingOrganizationState } from './billing'
import { missingContractFunctions } from '../contract'
import { resolvePagePath, type ModulePagesOptions } from '../pages'

/** Run a read-only `convex <args>` returning stdout, or null on any failure (CLI absent, no deployment, …). */
async function convexCli(rootDir: string, args: string[]): Promise<string | null> {
  try {
    return (await runConvex(rootDir, args)).stdout
  }
  catch {
    return null
  }
}

/** Deployed function identifiers (`module:name`), or null when the CLI is unreachable. */
async function deployedFunctionIdentifiers(rootDir: string): Promise<Set<string> | null> {
  const stdout = await convexCli(rootDir, ['function-spec'])
  if (stdout === null) return null
  try {
    const parsed = JSON.parse(stdout) as { functions?: Array<{ identifier?: string }> } | Array<{ identifier?: string }>
    const list = Array.isArray(parsed) ? parsed : parsed.functions ?? []
    return new Set(list
      .map(fn => fn.identifier ?? '')
      .map(id => id.replace(/\.[jt]s:/, ':')))
  }
  catch {
    return null
  }
}

/**
 * The deployment's view of the auth config (`auth:authConfig`): the
 * invitation path, null when workspaces are off. Null when unreadable.
 */
async function deployedAuthConfig(rootDir: string): Promise<{ invitationPath: string | null } | null> {
  const stdout = await convexCli(rootDir, ['run', 'auth:authConfig'])
  if (stdout === null) return null
  try {
    const { invitationPath } = JSON.parse(stdout) as { invitationPath?: string | null }
    return invitationPath === undefined ? null : { invitationPath }
  }
  catch {
    return null
  }
}

/**
 * Verify the composable↔scaffold function contract against the deployment:
 * every name in the contract must exist as a deployed function, or the
 * matching composable silently degrades to undefineds. Workspace functions
 * are only expected while workspaces are on.
 */
function functionContractFindings(identifiers: ReadonlySet<string>, options: { workspaces: boolean }): PreflightFinding[] {
  const missing = missingContractFunctions(identifiers, options)
  return [missing.length === 0
    ? {
        id: 'function-contract',
        title: 'Function contract',
        status: 'pass',
        message: 'All functions the composables bind to are deployed.',
        fixHint: '',
      }
    : {
        id: 'function-contract',
        title: 'Function contract',
        status: 'fail',
        message: `Deployed functions missing: ${missing.join(', ')} — the matching composables (useBilling/useCredits/useGifts/useFeatures/useEmailStatus/useAuth) degrade to undefineds.`,
        fixHint: 'A backend/ file was renamed or its exports trimmed. Restore with `npx nuxt-backend init`, then let `npx convex dev` push.',
      }]
}

/**
 * Cross-check the invitation route: the Convex-side `invitationPath` (what
 * invitation emails link to) and the Nuxt-side `pages.acceptInvitation`
 * (where the page mounts) are declared in two places only doctor can see
 * together.
 */
async function invitationPathFindings(rootDir: string, deployedPath: string | null): Promise<PreflightFinding[]> {
  let pagesOption: ModulePagesOptions | false | undefined
  try {
    const { loadNuxtConfig } = await import('@nuxt/kit')
    const config = await loadNuxtConfig({ cwd: rootDir })
    pagesOption = (config as { backend?: { pages?: ModulePagesOptions | false } }).backend?.pages
  }
  catch {
    return []
  }
  const nuxtPath = resolvePagePath(pagesOption, 'acceptInvitation')

  const aligned = deployedPath === null ? true : nuxtPath === deployedPath
  return [aligned
    ? {
        id: 'invitation-path',
        title: 'Invitation route',
        status: 'pass',
        message: deployedPath === null
          ? 'Workspaces are disabled — no invitation route to check.'
          : `Invitation emails and the mounted page agree on ${deployedPath}.`,
        fixHint: '',
      }
    : {
        id: 'invitation-path',
        title: 'Invitation route',
        status: 'fail',
        message: `Invitation emails link to ${deployedPath}, but the page mounts at ${nuxtPath ?? 'nowhere (disabled)'} — invitees get a 404.`,
        fixHint: 'Align `organization.invitationPath` (backend/auth.ts) with `backend.pages.acceptInvitation` (nuxt.config).',
      }]
}

/**
 * Doctor's billing half: load the declared catalog, read the provider's
 * organization settings with whatever token is visible here, and cross-check
 * the two. Local env only — the deployment may hold a token this machine
 * does not, in which case the provider checks simply do not run.
 */
async function billingCatalogFindings(rootDir: string, env: Record<string, string | undefined>): Promise<PreflightFinding[]> {
  let catalog: BillingCatalog | null
  try {
    catalog = (await loadCatalog(rootDir))?.catalog ?? null
  }
  catch {
    // A catalog that will not import is `billing sync`'s error to report, not
    // a reason for doctor to crash.
    return []
  }
  if (!catalog) return []
  const accessToken = env.BILLING_ACCESS_TOKEN
  const environment = env.BILLING_ENVIRONMENT === 'production' ? 'production' : 'sandbox'
  const state = accessToken ? await readBillingOrganizationState({ accessToken, environment }) : null
  return collectBillingFindings(catalog, state, { tokenPresent: Boolean(accessToken) })
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

const ENV_EXAMPLE = `# Local environment, grouped by what each value is for. Names describe what
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
  if (!existsSync(manifestPath)) return undefined
  let manifest: { dependencies?: Record<string, string>, devDependencies?: Record<string, string> }
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as typeof manifest
  }
  catch {
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
  const source = readFileSync(manifestPath, 'utf-8')
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

    const appComponent = mountPagesInAppComponent(rootDir)
    if (appComponent) {
      console.log(`[nuxt-backend] Replaced <NuxtWelcome /> with <NuxtPage /> in ${appComponent} so the module's pages render`)
    }

    const convexRange = declareConvexDependency(rootDir)
    if (convexRange) {
      console.log(`[nuxt-backend] Added convex@${convexRange} to dependencies (\`npx convex dev\` needs it declared by the app)`)
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
  1. npx convex dev        # provisions the deployment + codegen (terminal 1)
  2. npm run dev           # derives URLs, provisions dev env, mounts /login (terminal 2)
  3. Sign in — with no EMAIL_API_KEY yet, the OTP code prints in the convex dev console.

Later, as you connect services: add EMAIL_API_KEY / BILLING_ACCESS_TOKEN to
.env.local and run \`npx nuxt-backend env push\`.
`)
    })
  },
})

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
    'prod': { type: 'boolean', description: 'Never invent values; fail on missing required env', default: false },
    'dry-run': { type: 'boolean', description: 'Print the plan without setting anything', default: false },
    'force': { type: 'string', description: 'Replace values already on the deployment: a comma-separated list of names, or "all"' },
    'json': { type: 'boolean', description: 'Machine-readable output', default: false },
  },
  async run({ args }) {
    const rootDir = projectRoot(args)
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

/**
 * Probe the deployment's webhook routes with an empty-body POST (no secrets
 * involved): 404 means the route isn't mounted in `http.ts`; any other 4xx
 * means it is (signature verification correctly rejected the empty probe).
 */
async function webhookRouteFindings(siteUrl: string, { ai }: { ai: boolean }): Promise<PreflightFinding[]> {
  const routes = [
    { id: 'billing-webhook-route', title: 'Billing webhook route', path: '/billing/events', service: 'billing' },
    { id: 'email-webhook-route', title: 'Email webhook route', path: '/email/events', service: 'email' },
    // The stream route only matters once setupAi is deployed; a project
    // without an `ai` module has nothing to mount.
    ...(ai ? [{ id: 'ai-stream-route', title: 'AI stream route', path: '/ai/stream', service: 'ai' }] : []),
  ]
  return Promise.all(routes.map(async (route): Promise<PreflightFinding> => {
    const url = `${siteUrl.replace(/\/+$/, '')}${route.path}`
    try {
      // fallow-ignore-next-line security-sink -- the doctor probes the project's own SITE_URL (its env file), from the developer's machine; verified 2026-09-17
      const response = await fetch(url, { method: 'POST', body: '', signal: AbortSignal.timeout(5000) })
      if (response.status === 404) {
        return {
          id: route.id,
          title: route.title,
          status: 'fail',
          message: `${route.path} is not mounted on the deployment.`,
          fixHint: `Pass \`${route.service}\` to registerBackendRoutes in http.ts and deploy.`,
        }
      }
      if (response.status === 503) {
        // The same designed degradation the *_WEBHOOK_SECRET findings report:
        // fine on a dev deployment that has no provider webhooks yet, a
        // failure under production posture (escalated with the rest).
        return {
          id: route.id,
          title: route.title,
          status: 'warn',
          message: `${route.path} is mounted but fail-closed — its webhook secret is not set, so every delivery is rejected (503).`,
          fixHint: `Add the ${route.service.toUpperCase()}_WEBHOOK_SECRET to .env.local and run \`npx nuxt-backend env push\`.`,
        }
      }
      if (response.status >= 400 && response.status < 500) {
        return {
          id: route.id,
          title: route.title,
          status: 'pass',
          message: `${route.path} is mounted (the unsigned probe was rejected, as expected).`,
          fixHint: '',
        }
      }
      return {
        id: route.id,
        title: route.title,
        status: 'warn',
        message: `${route.path} answered with unexpected status ${response.status}.`,
        fixHint: 'Check the deployment logs.',
      }
    }
    catch {
      return {
        id: route.id,
        title: route.title,
        status: 'warn',
        message: `${url} is unreachable (offline, or the deployment is not running).`,
        fixHint: 'Run `npx convex dev` (or deploy), then re-run doctor.',
      }
    }
  }))
}

/**
 * Optional-tier findings a production app cannot actually live without —
 * plus the dev-only loopback trust flag, which must not be set there.
 */
const PROD_ESCALATED_FINDINGS = new Set([
  'deployment-auth-trust-local-origins',
  'billing-webhook-route',
  'email-webhook-route',
  'email-transport',
  'email-webhook-secret',
  'billing-access',
  'billing-webhook-secret',
  'deployment-email-api-key',
  'deployment-email-webhook-secret',
  'deployment-billing-access-token',
  'deployment-billing-webhook-secret',
])

const doctor = defineCommand({
  meta: { name: 'doctor', description: 'Check the project + deployment configuration' },
  args: {
    ...cwdArg,
    json: { type: 'boolean', description: 'Machine-readable output', default: false },
    fix: { type: 'boolean', description: 'Repair what doctor can: restore missing scaffold files, push env (`env push`)', default: false },
    prod: { type: 'boolean', description: 'Production posture: missing email/billing config becomes a failure', default: false },
  },
  async run({ args }) {
    const rootDir = projectRoot(args)

    if (args.fix) {
      // Restore missing scaffold files (existing files are never touched),
      // then sync env — the same engine as `nuxt-backend env push`.
      const functionsDir = resolveFunctionsDir(rootDir)
      const installation: BackendInstallationMode
        = existsSync(join(rootDir, functionsDir, 'components/backend')) ? 'local' : 'default'
      scaffoldBackendFiles(rootDir, { installation })
      const run = await runEnvPush(rootDir, { prod: args.prod })
      if (run) {
        console.log(`[nuxt-backend] doctor --fix: env push → ${run.deployment ?? 'deployment'}`)
        reportEnvPush(run, { json: false, dryRun: false })
      }
      else {
        console.log('[nuxt-backend] doctor --fix: no deployment reachable — env not pushed.')
      }
    }

    const env = { ...readEnvFiles(rootDir), ...process.env } as Record<string, string | undefined>

    const siteUrl = resolveSiteUrl({ env, derived: deriveDeploymentUrls(rootDir, env) })
    const findings: PreflightFinding[] = collectPreflightFindings({
      env,
      siteUrlConfigured: Boolean(siteUrl),
    })

    // Filesystem checks the startup preflight can't do.
    const functionsDir = resolveFunctionsDir(rootDir)
    const hasGenerated = existsSync(join(rootDir, functionsDir, '_generated'))
    findings.push({
      id: 'convex-codegen',
      title: 'Convex codegen',
      status: hasGenerated ? 'pass' : 'warn',
      message: hasGenerated
        ? `${functionsDir}/_generated present.`
        : `${functionsDir}/_generated missing — Convex features no-op until codegen runs.`,
      fixHint: hasGenerated ? '' : 'Run: npx convex dev',
    })

    // Deployment-side env presence (names only — values never read). Two
    // tiers: AUTH_SECRET + SITE_URL are required (fail); the rest are optional
    // and report the designed degradation (warn).
    const deployed = await deploymentEnvNames(rootDir)
    if (deployed) {
      for (const name of REQUIRED_DEPLOYMENT_ENV) {
        findings.push({
          id: `deployment-${name.toLowerCase().replace(/_/g, '-')}`,
          title: `Deployment ${name}`,
          status: deployed.includes(name) ? 'pass' : 'fail',
          message: deployed.includes(name) ? `${name} is set on the deployment.` : `${name} is not set on the Convex deployment (required — a deploy fails without it).`,
          fixHint: deployed.includes(name) ? '' : 'Run `npx nuxt-backend env push` (dev fills it in), or: npx convex env set ' + name + ' ...',
        })
      }
      const devDeployment = isDevDeployment(rootDir)
      for (const [name, degradation] of Object.entries(OPTIONAL_DEPLOYMENT_ENV)) {
        const id = `deployment-${name.toLowerCase().replace(/_/g, '-')}`
        const isSet = deployed.includes(name)
        // Dev-only vars: unset is the healthy state; set on a non-dev
        // deployment is a misconfiguration worth flagging.
        if (DEV_ONLY_DEPLOYMENT_ENV.has(name)) {
          const leaked = isSet && !devDeployment
          findings.push({
            id,
            title: `Deployment ${name}`,
            status: leaked ? 'warn' : 'pass',
            message: leaked
              ? `${name} is set on a non-dev deployment — loopback origins are trusted there.`
              : isSet ? `${name} is set on the dev deployment.` : `${name} is not set (dev-only): ${degradation}.`,
            fixHint: leaked ? `Remove it: npx convex env remove ${name}` : '',
          })
          continue
        }
        findings.push({
          id,
          title: `Deployment ${name}`,
          status: isSet ? 'pass' : 'warn',
          message: isSet ? `${name} is set on the deployment.` : `${name} is not set (optional): ${degradation}.`,
          fixHint: isSet ? '' : `Add ${name} to .env.local and run \`npx nuxt-backend env push\`.`,
        })
      }
    }
    else {
      findings.push({
        id: 'deployment-env',
        title: 'Deployment env',
        status: 'warn',
        message: 'Could not read the deployment env (no deployment configured, or `npx convex env list` failed).',
        fixHint: 'Run `npx convex dev` once to provision, then re-run doctor.',
      })
    }

    // Webhook routes must actually be mounted — a missing route silently
    // drops billing/email events. The site URL is derivable from the
    // deployment slug, so this probe usually needs no configuration at all.
    // Deployment-reachable reads that need the convex CLI; each degrades to
    // null (and its checks to no finding) when the deployment is unreachable.
    const identifiers = deployed ? await deployedFunctionIdentifiers(rootDir) : null
    const authConfig = deployed ? await deployedAuthConfig(rootDir) : null

    if (siteUrl) {
      const ai = identifiers ? [...identifiers].some(id => id.startsWith('ai:')) : true
      findings.push(...await webhookRouteFindings(siteUrl, { ai }))
    }

    // The composable function contract and the invitation-route cross-check
    // (no finding when nuxt.config is unreadable).
    if (identifiers) {
      findings.push(...functionContractFindings(identifiers, { workspaces: authConfig ? authConfig.invitationPath !== null : true }))
    }
    if (authConfig) {
      findings.push(...await invitationPathFindings(rootDir, authConfig.invitationPath))
    }

    // Billing catalog cross-checks: what backend/billing.catalog.ts declares
    // against the organization's own subscription + portal settings. Every
    // half degrades on its own — no catalog file, no findings; no readable
    // provider, only the catalog-only checks (see collectBillingFindings).
    findings.push(...await billingCatalogFindings(rootDir, env))

    // Production posture: the optional tier's designed degradations are fine
    // in dev, but a live product without email transport has broken sign-in —
    // escalate those warns to failures.
    const reported = args.prod
      ? findings.map(finding => PROD_ESCALATED_FINDINGS.has(finding.id) && finding.status === 'warn'
          ? { ...finding, status: 'fail' as const, message: `${finding.message} (production posture: failure)` }
          : finding)
      : findings

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
  subCommands: { init, doctor, env, billing },
})
