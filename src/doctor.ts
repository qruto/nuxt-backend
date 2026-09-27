/**
 * `nuxt-backend doctor`'s checks, as data: every finding the command prints,
 * collected without printing, so the CLI and the DevTools panel run the same
 * checks. Local files and env first, then what the Convex CLI can read from
 * the deployment (env names only, the function spec, the auth config), the
 * webhook route probes, and the billing catalog cross-checks. Each half
 * degrades to no finding when what it needs is unreachable.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { runConvex } from './convex-cli'
import { deriveDeploymentUrls, resolveSiteUrl } from './deployment'
import { deploymentEnvNames, deploymentFlags, isDevDeployment, readEnvFiles } from './env-push'
import { collectPreflightFindings, DEV_ONLY_DEPLOYMENT_ENV, OPTIONAL_DEPLOYMENT_ENV, REQUIRED_DEPLOYMENT_ENV, type PreflightFinding } from './preflight'
import { resolveFunctionsDir } from './scaffold'
import { missingContractFunctions } from './contract'
import { resolvePagePath, type ModulePagesOptions } from './pages'
import type { BillingCatalog } from './convex/catalog'
import { collectBillingFindings, loadCatalog, readBillingOrganizationState } from './cli/billing'
import { devScriptFinding } from './cli/dev'

async function convexCli(rootDir: string, args: string[]): Promise<string | null> {
  try {
    return (await runConvex(rootDir, args)).stdout
  }
  catch {
    return null
  }
}

/**
 * The deployment's function spec: its client URL and the deployed function
 * identifiers (`module:name`). Null when the CLI is unreachable.
 */
async function deployedFunctionSpec(rootDir: string, prod: boolean): Promise<{ url: string | null, identifiers: Set<string> } | null> {
  const stdout = await convexCli(rootDir, ['function-spec', ...deploymentFlags({ prod })])
  if (stdout === null) return null
  try {
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
 * What doctor reads from the deployment it checks, beyond env names: the
 * deployed functions, the auth config, and the site URL whose routes it
 * probes. Locally that site is the one .env.local names; under --prod it is
 * production's, which the function spec reports — an explicit site URL in the
 * process env (a custom domain) still wins, while .env.local's points at dev.
 */
async function readDeployment(rootDir: string, options: { prod: boolean, reachable: boolean, localSiteUrl: string | undefined }) {
  const spec = options.reachable ? await deployedFunctionSpec(rootDir, options.prod) : null
  const authConfig = options.reachable ? await deployedAuthConfig(rootDir, options.prod) : null
  const probeSiteUrl = options.prod
    ? resolveSiteUrl({ env: process.env, derived: null, ...(spec?.url ? { url: spec.url } : {}) })
    : options.localSiteUrl
  return { identifiers: spec?.identifiers ?? null, authConfig, probeSiteUrl }
}

/**
 * The deployment's view of the auth config (`auth:authConfig`): the
 * invitation path, null when workspaces are off. Null when unreadable.
 */
async function deployedAuthConfig(rootDir: string, prod: boolean): Promise<{ invitationPath: string | null } | null> {
  const stdout = await convexCli(rootDir, ['run', ...deploymentFlags({ prod }), 'auth:authConfig'])
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

/**
 * Run every doctor check against the project in `rootDir` and its
 * deployment (production with `prod`), returning the findings with
 * production posture applied.
 */
/** Filesystem check the startup preflight can't do: has codegen run? */
function codegenFinding(rootDir: string): PreflightFinding {
  const functionsDir = resolveFunctionsDir(rootDir)
  const hasGenerated = existsSync(join(rootDir, functionsDir, '_generated'))
  return {
    id: 'convex-codegen',
    title: 'Convex codegen',
    status: hasGenerated ? 'pass' : 'warn',
    message: hasGenerated
      ? `${functionsDir}/_generated present.`
      : `${functionsDir}/_generated missing — Convex features no-op until codegen runs.`,
    fixHint: hasGenerated ? '' : 'Run: npx convex dev',
  }
}

function deploymentEnvId(name: string): string {
  return `deployment-${name.toLowerCase().replace(/_/g, '-')}`
}

function requiredDeploymentEnvFinding(name: string, isSet: boolean): PreflightFinding {
  return {
    id: deploymentEnvId(name),
    title: `Deployment ${name}`,
    status: isSet ? 'pass' : 'fail',
    message: isSet ? `${name} is set on the deployment.` : `${name} is not set on the Convex deployment (required — a deploy fails without it).`,
    fixHint: isSet ? '' : 'Run `npx nuxt-backend env push` (dev fills it in), or: npx convex env set ' + name + ' ...',
  }
}

/**
 * Dev-only vars: unset is the healthy state; set on a non-dev deployment is
 * a misconfiguration worth flagging. Every other optional var reports its
 * designed degradation when unset.
 */
function optionalDeploymentEnvFinding(name: string, degradation: string, isSet: boolean, devDeployment: boolean): PreflightFinding {
  const id = deploymentEnvId(name)
  const title = `Deployment ${name}`
  if (DEV_ONLY_DEPLOYMENT_ENV.has(name)) {
    const leaked = isSet && !devDeployment
    return {
      id,
      title,
      status: leaked ? 'warn' : 'pass',
      message: leaked
        ? `${name} is set on a non-dev deployment — loopback origins are trusted there.`
        : isSet ? `${name} is set on the dev deployment.` : `${name} is not set (dev-only): ${degradation}.`,
      fixHint: leaked ? `Remove it: npx convex env remove ${name}` : '',
    }
  }
  return {
    id,
    title,
    status: isSet ? 'pass' : 'warn',
    message: isSet ? `${name} is set on the deployment.` : `${name} is not set (optional): ${degradation}.`,
    fixHint: isSet ? '' : `Add ${name} to .env.local and run \`npx nuxt-backend env push\`.`,
  }
}

/**
 * Deployment-side env presence (names only — values never read). Two tiers:
 * AUTH_SECRET + SITE_URL are required (fail); the rest are optional and
 * report the designed degradation (warn).
 */
function deploymentEnvFindings(rootDir: string, deployed: string[] | null, prod: boolean): PreflightFinding[] {
  if (!deployed) {
    return [{
      id: 'deployment-env',
      title: 'Deployment env',
      status: 'warn',
      message: 'Could not read the deployment env (no deployment configured, or `npx convex env list` failed).',
      fixHint: 'Run `npx convex dev` once to provision, then re-run doctor.',
    }]
  }
  // Under --prod the deployment read above is production, whatever
  // .env.local names.
  const devDeployment = !prod && isDevDeployment(rootDir)
  return [
    ...REQUIRED_DEPLOYMENT_ENV.map(name => requiredDeploymentEnvFinding(name, deployed.includes(name))),
    ...Object.entries(OPTIONAL_DEPLOYMENT_ENV).map(([name, degradation]) =>
      optionalDeploymentEnvFinding(name, degradation, deployed.includes(name), devDeployment)),
  ]
}

/**
 * Deployment-reachable reads that need the convex CLI; each degrades to
 * null (and its checks to no finding) when the deployment is unreachable.
 */
async function deployedSurfaceFindings(rootDir: string, { prod, reachable, siteUrl }: { prod: boolean, reachable: boolean, siteUrl: string | undefined }): Promise<PreflightFinding[]> {
  const findings: PreflightFinding[] = []
  const { identifiers, authConfig, probeSiteUrl } = await readDeployment(rootDir, { prod, reachable, localSiteUrl: siteUrl })
  // Webhook routes must actually be mounted — a missing route silently
  // drops billing/email events. The site URL is derivable from the
  // deployment slug, so this probe usually needs no configuration at all.
  if (probeSiteUrl) {
    const ai = identifiers ? [...identifiers].some(id => id.startsWith('ai:')) : true
    findings.push(...await webhookRouteFindings(probeSiteUrl, { ai }))
  }
  // The composable function contract and the invitation-route cross-check
  // (no finding when nuxt.config is unreadable).
  if (identifiers) {
    findings.push(...functionContractFindings(identifiers, { workspaces: authConfig ? authConfig.invitationPath !== null : true }))
  }
  if (authConfig) {
    findings.push(...await invitationPathFindings(rootDir, authConfig.invitationPath))
  }
  return findings
}

/**
 * Production posture: the optional tier's designed degradations are fine in
 * dev, but a live product without email transport has broken sign-in —
 * escalate those warns to failures.
 */
function applyProductionPosture(findings: PreflightFinding[]): PreflightFinding[] {
  return findings.map(finding => PROD_ESCALATED_FINDINGS.has(finding.id) && finding.status === 'warn'
    ? { ...finding, status: 'fail' as const, message: `${finding.message} (production posture: failure)` }
    : finding)
}

export async function runDoctorChecks(rootDir: string, { prod }: { prod: boolean }): Promise<PreflightFinding[]> {
  const env = { ...readEnvFiles(rootDir), ...process.env } as Record<string, string | undefined>

  const siteUrl = resolveSiteUrl({ env, derived: deriveDeploymentUrls(rootDir, env) })
  // The deployment's env names (never values) first, so a variable set there
  // but not visible here counts as set instead of warning next to the
  // deployment-side finding that says it is.
  const deployed = await deploymentEnvNames(rootDir, { prod })
  const findings: PreflightFinding[] = [
    ...collectPreflightFindings({
      env,
      siteUrlConfigured: Boolean(siteUrl),
      ...(deployed ? { deployedNames: new Set(deployed) } : {}),
    }),
    codegenFinding(rootDir),
    ...devScriptFinding(rootDir),
    ...deploymentEnvFindings(rootDir, deployed, prod),
    ...await deployedSurfaceFindings(rootDir, { prod, reachable: deployed !== null, siteUrl }),
    // Billing catalog cross-checks: what backend/billing.catalog.ts declares
    // against the organization's own subscription + portal settings. Every
    // half degrades on its own — no catalog file, no findings; no readable
    // provider, only the catalog-only checks (see collectBillingFindings).
    ...await billingCatalogFindings(rootDir, env),
  ]
  return prod ? applyProductionPosture(findings) : findings
}
