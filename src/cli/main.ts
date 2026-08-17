import { existsSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { defineCommand } from 'citty'
import { scaffoldBackendFiles, resolveFunctionsDir } from '../scaffold'
import type { BackendInstallationMode } from '../templates'
import { collectPreflightFindings, formatPreflightSummary, OPTIONAL_DEPLOYMENT_ENV, REQUIRED_DEPLOYMENT_ENV, type PreflightFinding } from '../preflight'
import { deploymentEnvNames, readEnvFiles, runEnvPush, type EnvPushRunResult } from '../env-push'
import { deriveDeploymentUrls } from '../deployment'
import { billing } from './billing'
import { REQUIRED_FUNCTION_EXPORTS } from '../contract'
import { resolvePagePath, type ModulePagesOptions } from '../pages'

/** Run a read-only `npx convex <args>` returning stdout, or null on any failure. */
async function convexCli(rootDir: string, args: string[]): Promise<string | null> {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  try {
    const { stdout } = await promisify(execFile)('npx', ['convex', ...args], {
      cwd: rootDir,
      encoding: 'utf-8',
      timeout: 30_000,
      // Windows npx is npx.cmd (needs a shell post-CVE-2024-27980); args are
      // static literals, so shelling stays injection-safe.
      shell: process.platform === 'win32',
    })
    return stdout
  }
  catch {
    return null
  }
}

/**
 * Verify the composable↔scaffold function contract against the deployment:
 * every name in {@link REQUIRED_FUNCTION_EXPORTS} must exist as a deployed
 * function, or the matching composable silently degrades to undefineds.
 */
async function functionContractFindings(rootDir: string): Promise<PreflightFinding[]> {
  const stdout = await convexCli(rootDir, ['function-spec'])
  if (stdout === null) return []
  let identifiers: Set<string>
  try {
    const parsed = JSON.parse(stdout) as { functions?: Array<{ identifier?: string }> } | Array<{ identifier?: string }>
    const list = Array.isArray(parsed) ? parsed : parsed.functions ?? []
    identifiers = new Set(list
      .map(fn => fn.identifier ?? '')
      .map(id => id.replace(/\.[jt]s:/, ':')))
  }
  catch {
    return []
  }
  const missing: string[] = []
  for (const [module, names] of Object.entries(REQUIRED_FUNCTION_EXPORTS)) {
    for (const name of names) {
      if (!identifiers.has(`${module}:${name}`)) missing.push(`${module}:${name}`)
    }
  }
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
async function invitationPathFindings(rootDir: string): Promise<PreflightFinding[]> {
  const stdout = await convexCli(rootDir, ['run', 'auth:authConfig'])
  if (stdout === null) return []
  let deployedPath: string | null | undefined
  try {
    deployedPath = (JSON.parse(stdout) as { invitationPath?: string | null }).invitationPath
  }
  catch {
    return []
  }
  if (deployedPath === undefined) return []

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

const ENV_EXAMPLE = `# Everything here is optional in dev — \`npm run dev\` derives the Convex URLs
# from CONVEX_DEPLOYMENT (written by \`npx convex dev\`) and provisions the
# required deployment env for you.
#
# Add provider keys here as you connect services, then sync them to the
# deployment with \`npx nuxt-backend env push\`:
#   EMAIL_API_KEY           transactional email (EMAIL_FROM, EMAIL_TEST_MODE optional)
#   EMAIL_WEBHOOK_SECRET    delivery events for /email/events
#   BILLING_ACCESS_TOKEN    billing (BILLING_ENVIRONMENT defaults to sandbox)
#   BILLING_WEBHOOK_SECRET  billing events for /billing/events
#
# Explicit overrides (rarely needed — derived in dev):
# NUXT_PUBLIC_BACKEND_URL=https://your-deployment.convex.cloud
# NUXT_PUBLIC_BACKEND_SITE_URL=https://your-deployment.convex.site
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
    'json': { type: 'boolean', description: 'Machine-readable output', default: false },
  },
  async run({ args }) {
    const rootDir = projectRoot(args)
    const run = await runEnvPush(rootDir, { prod: args.prod, dryRun: args['dry-run'] })
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
async function webhookRouteFindings(siteUrl: string): Promise<PreflightFinding[]> {
  const routes = [
    { id: 'billing-webhook-route', title: 'Billing webhook route', path: '/billing/events', service: 'billing' },
    { id: 'email-webhook-route', title: 'Email webhook route', path: '/email/events', service: 'email' },
    { id: 'ai-stream-route', title: 'AI stream route', path: '/ai/stream', service: 'ai' },
  ]
  return Promise.all(routes.map(async (route): Promise<PreflightFinding> => {
    const url = `${siteUrl.replace(/\/+$/, '')}${route.path}`
    try {
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
        return {
          id: route.id,
          title: route.title,
          status: 'fail',
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

/** Optional-tier findings a production app cannot actually live without. */
const PROD_ESCALATED_FINDINGS = new Set([
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

    const findings: PreflightFinding[] = collectPreflightFindings({
      env,
      siteUrlConfigured: Boolean(env.NUXT_PUBLIC_CONVEX_SITE_URL ?? env.NUXT_PUBLIC_BACKEND_SITE_URL),
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
      for (const [name, degradation] of Object.entries(OPTIONAL_DEPLOYMENT_ENV)) {
        findings.push({
          id: `deployment-${name.toLowerCase().replace(/_/g, '-')}`,
          title: `Deployment ${name}`,
          status: deployed.includes(name) ? 'pass' : 'warn',
          message: deployed.includes(name) ? `${name} is set on the deployment.` : `${name} is not set (optional): ${degradation}.`,
          fixHint: deployed.includes(name) ? '' : `Add ${name} to .env.local and run \`npx nuxt-backend env push\`.`,
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
    const siteUrl = env.NUXT_PUBLIC_CONVEX_SITE_URL
      ?? env.NUXT_PUBLIC_BACKEND_SITE_URL
      ?? deriveDeploymentUrls(rootDir, env)?.siteUrl
    if (siteUrl) {
      findings.push(...await webhookRouteFindings(siteUrl))
    }

    // Deployment-reachable checks that need the convex CLI: the composable
    // function contract and the invitation-route cross-check. Both degrade to
    // no finding when the deployment (or nuxt.config) is unreachable.
    if (deployed) {
      findings.push(...await functionContractFindings(rootDir))
      findings.push(...await invitationPathFindings(rootDir))
    }

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
    description: 'All-in-one SaaS backend for Nuxt on Convex — scaffold and check your project',
  },
  subCommands: { init, doctor, env, billing },
})
