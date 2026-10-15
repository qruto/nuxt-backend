/**
 * `nuxt-backend doctor`'s checks, as data: every finding the command prints,
 * collected without printing, so the CLI and the DevTools panel run the same
 * checks. Local files and env first, then what the Convex CLI can read from
 * the deployment (env names only, the function spec, the auth config), the
 * webhook route probes, and the billing catalog cross-checks. Each half
 * degrades to no finding when what it needs is unreachable. `only` names the
 * services to check: a check for another service never runs, so its
 * deployment reads, probes and provider calls are skipped too.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { runConvex } from './convex-cli'
import { deriveDeploymentUrls, resolveSiteUrl } from './deployment'
import { deploymentEnvNames, deploymentFlags, deploymentFunctionSpec, isDevDeployment, readEnvFiles } from './env-push'
import { DEV_ONLY_DEPLOYMENT_ENV, OPTIONAL_DEPLOYMENT_ENV, REQUIRED_DEPLOYMENT_ENV } from './env-registry'
import { applyProductionPosture, deploymentEnvId, finding, type FindingService, type PreflightFinding } from './findings'
import { collectPreflightFindings } from './preflight'
import { resolveFunctionsDir } from './scaffold'
import { missingContractFunctions } from './contract'
import { resolvePagePath, type BackendPageKey, type ModulePagesOptions } from './pages'
import type { BillingCatalog } from './convex/catalog'
import { collectBillingFindings, loadCatalog, readBillingOrganizationState } from './cli/billing'
import { devScriptFinding } from './cli/dev'

/**
 * What doctor reads from the deployment it checks, beyond env names: the
 * deployed functions, the auth config, and the site URL whose routes it
 * probes. Locally that site is the one .env.local names; under --prod it is
 * production's, which the function spec reports — an explicit site URL in the
 * process env (a custom domain) still wins, while .env.local's points at dev.
 * The two reads are independent, so they run side by side.
 */
async function readDeployment(rootDir: string, options: { prod: boolean, reachable: boolean, localSiteUrl: string | undefined, spec: boolean, authConfig: boolean }) {
  const [spec, authConfig] = await Promise.all([
    options.reachable && options.spec ? deploymentFunctionSpec(rootDir, { prod: options.prod }) : null,
    options.reachable && options.authConfig ? deployedAuthConfig(rootDir, options.prod) : null,
  ])
  const probeSiteUrl = options.prod
    ? resolveSiteUrl({ env: process.env, derived: null, ...(spec?.url ? { url: spec.url } : {}) })
    : options.localSiteUrl
  return { identifiers: spec?.identifiers ?? null, authConfig, probeSiteUrl }
}

/** The page paths the deployment links to, as `auth:authConfig` reports them. */
type DeployedAuthConfig = Partial<Record<'invitationPath' | 'agentLoginPath' | 'agentConsentPath', string>>

/**
 * The deployment's view of the auth config (`auth:authConfig`): the paths
 * of the pages it sends people to. Null when unreadable.
 */
async function deployedAuthConfig(rootDir: string, prod: boolean): Promise<DeployedAuthConfig | null> {
  try {
    const { stdout } = await runConvex(rootDir, ['run', ...deploymentFlags({ prod }), 'auth:authConfig'])
    const parsed = JSON.parse(stdout) as Record<string, unknown>
    const config: DeployedAuthConfig = {}
    for (const field of ['invitationPath', 'agentLoginPath', 'agentConsentPath'] as const) {
      if (typeof parsed[field] === 'string') config[field] = parsed[field]
    }
    return Object.keys(config).length > 0 ? config : null
  }
  catch {
    return null
  }
}

/**
 * Verify the composable↔scaffold function contract against the deployment:
 * every name in the contract must exist as a deployed function, or the
 * matching composable silently degrades to undefineds.
 */
function functionContractFindings(identifiers: ReadonlySet<string>): PreflightFinding[] {
  const missing = missingContractFunctions(identifiers)
  return [missing.length === 0
    ? finding('function-contract', 'pass', 'All functions the composables bind to are deployed.')
    : finding(
        'function-contract',
        'fail',
        `Deployed functions missing: ${missing.join(', ')} — the matching composables (useBilling/useCredits/useGifts/useFeatures/useEmailStatus/useAuth) degrade to undefineds.`,
        'A backend/ file was renamed or its exports trimmed. Restore with `npx nuxt-backend init`, then let `npx convex dev` push.',
      )]
}

/**
 * The pages the deployment sends people to, each declared twice: the path
 * the Convex side links to and the page the Nuxt side mounts.
 */
const PAGE_PATH_CHECKS = [
  {
    id: 'invitation-path',
    service: 'workspaces',
    field: 'invitationPath',
    page: 'acceptInvitation',
    sender: 'Invitation emails link to',
    agree: 'Invitation emails and the mounted page agree on',
    broken: 'invitees get a 404',
    fixHint: 'Align `organization.invitationPath` (backend/auth.ts) with `backend.pages.acceptInvitation` (nuxt.config).',
  },
  {
    id: 'agent-login-path',
    service: 'agents',
    field: 'agentLoginPath',
    page: 'login',
    sender: 'An agent\'s authorization sends people to sign in at',
    agree: 'Agent authorizations and the sign-in page agree on',
    broken: 'nobody can authorize an agent',
    fixHint: 'Align `mcp.loginPath` (backend/auth.ts) with `backend.pages.login` (nuxt.config).',
  },
  {
    id: 'agent-consent-path',
    service: 'agents',
    field: 'agentConsentPath',
    page: 'agentConsent',
    sender: 'An agent\'s authorization asks for consent at',
    agree: 'Agent authorizations and the consent page agree on',
    broken: 'nobody can approve an agent',
    fixHint: 'Align `mcp.consentPath` (backend/auth.ts) with `backend.pages.agentConsent` (nuxt.config).',
  },
] as const satisfies ReadonlyArray<{ id: 'invitation-path' | 'agent-login-path' | 'agent-consent-path', service: FindingService, field: keyof DeployedAuthConfig, page: BackendPageKey } & Record<string, string>>

/**
 * Cross-check each path the deployment links to against the page the Nuxt
 * side mounts there — declared in two places only doctor can see together.
 * A path the deployment does not report is not checked.
 */
async function pagePathFindings(rootDir: string, deployed: DeployedAuthConfig, wants: (service: FindingService) => boolean): Promise<PreflightFinding[]> {
  const checks = PAGE_PATH_CHECKS.filter(check => wants(check.service))
  if (checks.length === 0) return []
  let backend: { pages?: ModulePagesOptions } | undefined
  try {
    const { loadNuxtConfig } = await import('@nuxt/kit')
    backend = (await loadNuxtConfig({ cwd: rootDir }) as { backend?: typeof backend }).backend
  }
  catch {
    return []
  }
  return checks.flatMap((check): PreflightFinding[] => {
    const deployedPath = deployed[check.field]
    if (!deployedPath) return []
    const nuxtPath = resolvePagePath(backend?.pages, check.page)
    return [nuxtPath === deployedPath
      ? finding(check.id, 'pass', `${check.agree} ${deployedPath}.`)
      : finding(check.id, 'fail', `${check.sender} ${deployedPath}, but the page mounts at ${nuxtPath} — ${check.broken}.`, check.fixHint)]
  })
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
async function webhookRouteFindings(siteUrl: string, { ai, wants }: { ai: boolean, wants: (service: FindingService) => boolean }): Promise<PreflightFinding[]> {
  const routes: Array<{ id: 'billing-webhook-route' | 'email-webhook-route' | 'ai-stream-route', path: string, service: FindingService, secret: string | null }> = [
    { id: 'billing-webhook-route', path: '/billing/events', service: 'billing', secret: 'BILLING_WEBHOOK_SECRET' },
    { id: 'email-webhook-route', path: '/email/events', service: 'email', secret: 'EMAIL_WEBHOOK_SECRET' },
    // The stream route only matters once setupAi is deployed; a project
    // without an `ai` module has nothing to mount. It has no secret.
    ...(ai ? [{ id: 'ai-stream-route', path: '/ai/stream', service: 'ai', secret: null } as const] : []),
  ]
  return Promise.all(routes.filter(route => wants(route.service)).map(async (route): Promise<PreflightFinding> => {
    const url = `${siteUrl.replace(/\/+$/, '')}${route.path}`
    try {
      // fallow-ignore-next-line security-sink -- the doctor probes the project's own SITE_URL (its env file), from the developer's machine; verified 2026-09-17
      const response = await fetch(url, { method: 'POST', body: '', signal: AbortSignal.timeout(5000) })
      if (response.status === 404) {
        return finding(route.id, 'fail', `${route.path} is not mounted on the deployment.`, `Pass \`${route.service}\` to registerBackendRoutes in http.ts and deploy.`)
      }
      if (response.status === 503 && route.secret) {
        // The same designed degradation the *_WEBHOOK_SECRET findings report:
        // fine on a dev deployment that has no provider webhooks yet, a
        // failure under production posture (escalated with the rest).
        return finding(
          route.id,
          'warn',
          `${route.path} is mounted but fail-closed — its webhook secret is not set, so every delivery is rejected (503).`,
          `Add ${route.secret} to .env.local and run \`npx nuxt-backend env push\`.`,
        )
      }
      if (response.status >= 400 && response.status < 500) {
        return finding(route.id, 'pass', `${route.path} is mounted (the unsigned probe was rejected, as expected).`)
      }
      return finding(route.id, 'warn', `${route.path} answered with unexpected status ${response.status}.`, 'Check the deployment logs.')
    }
    catch {
      return finding(route.id, 'warn', `${url} is unreachable (offline, or the deployment is not running).`, 'Run `npx convex dev` (or deploy), then re-run doctor.')
    }
  }))
}

/** Filesystem check the startup preflight can't do: has codegen run? */
function codegenFinding(rootDir: string): PreflightFinding {
  const functionsDir = resolveFunctionsDir(rootDir)
  const hasGenerated = existsSync(join(rootDir, functionsDir, '_generated'))
  return hasGenerated
    ? finding('convex-codegen', 'pass', `${functionsDir}/_generated present.`)
    : finding('convex-codegen', 'warn', `${functionsDir}/_generated missing — Convex features no-op until codegen runs.`, 'Run: npx convex dev')
}

/**
 * A required var's presence. Set by hand, a generated secret is piped in, so
 * it never sits in the process list or the shell history; under --prod every
 * command names production.
 */
function requiredDeploymentEnvFinding(name: string, isSet: boolean, prod: boolean): PreflightFinding {
  if (isSet) return finding(deploymentEnvId(name), 'pass', `${name} is set on the deployment.`)
  const flag = prod ? ' --prod' : ''
  const byHand = name === 'AUTH_SECRET'
    ? `openssl rand -base64 32 | npx convex env set${flag} AUTH_SECRET`
    : `npx convex env set${flag} ${name} ...`
  return finding(
    deploymentEnvId(name),
    'fail',
    `${name} is not set on the Convex deployment (required — a deploy fails without it).`,
    prod ? `Add it to .env.local and run \`npx nuxt-backend env push --prod\`, or: ${byHand}` : `Run \`npx nuxt-backend env push\` (dev fills it in), or: ${byHand}`,
  )
}

/**
 * Dev-only vars: unset is the healthy state; set on a non-dev deployment is
 * a misconfiguration worth flagging. Every other optional var reports its
 * designed degradation when unset.
 */
function optionalDeploymentEnvFinding(name: string, degradation: string, isSet: boolean, { devDeployment, prod }: { devDeployment: boolean, prod: boolean }): PreflightFinding {
  const id = deploymentEnvId(name)
  const flag = prod ? ' --prod' : ''
  if (DEV_ONLY_DEPLOYMENT_ENV.has(name)) {
    if (isSet && !devDeployment) {
      return finding(id, 'warn', `${name} is set on a non-dev deployment — loopback origins are trusted there.`, `Remove it: npx convex env remove${flag} ${name}`)
    }
    return finding(id, 'pass', isSet ? `${name} is set on the dev deployment.` : `${name} is not set (dev-only): ${degradation}.`)
  }
  return isSet
    ? finding(id, 'pass', `${name} is set on the deployment.`)
    : finding(id, 'warn', `${name} is not set (optional): ${degradation}.`, `Add ${name} to .env.local and run \`npx nuxt-backend env push${flag}\`.`)
}

/**
 * Deployment-side env presence (names only — values never read). Two tiers:
 * AUTH_SECRET + SITE_URL are required (fail); the rest are optional and
 * report the designed degradation (warn).
 */
function deploymentEnvFindings(rootDir: string, deployed: string[] | null, prod: boolean): PreflightFinding[] {
  if (!deployed) {
    return [finding('deployment-env', 'warn', 'Could not read the deployment env (no deployment configured, or `npx convex env list` failed).', 'Run `npx convex dev` once to provision, then re-run doctor.')]
  }
  // Under --prod the deployment read above is production, whatever
  // .env.local names.
  const devDeployment = !prod && isDevDeployment(rootDir)
  return [
    ...REQUIRED_DEPLOYMENT_ENV.map(name => requiredDeploymentEnvFinding(name, deployed.includes(name), prod)),
    ...Object.entries(OPTIONAL_DEPLOYMENT_ENV).map(([name, degradation]) =>
      optionalDeploymentEnvFinding(name, degradation, deployed.includes(name), { devDeployment, prod })),
  ]
}

/**
 * Deployment-reachable reads that need the convex CLI; each degrades to
 * null (and its checks to no finding) when the deployment is unreachable.
 * A read only happens when a wanted check needs it.
 */
async function deployedSurfaceFindings(rootDir: string, { prod, reachable, siteUrl, wants }: { prod: boolean, reachable: boolean, siteUrl: string | undefined, wants: (service: FindingService) => boolean }): Promise<PreflightFinding[]> {
  const probes = wants('billing') || wants('email') || wants('ai')
  const { identifiers, authConfig, probeSiteUrl } = await readDeployment(rootDir, {
    prod,
    reachable,
    localSiteUrl: siteUrl,
    // The function spec names the deployed functions (the contract, and
    // whether `ai` is deployed) and, under --prod, the site to probe.
    spec: wants('scaffold') || probes,
    // The auth config reports the page paths; read only when a service
    // whose page it checks is wanted.
    authConfig: PAGE_PATH_CHECKS.some(check => wants(check.service)),
  })
  // Webhook routes must actually be mounted — a missing route silently
  // drops billing/email events. The site URL is derivable from the
  // deployment slug, so this probe usually needs no configuration at all.
  // The probes and the page-path cross-checks (which load nuxt.config, and
  // report nothing when it is unreadable) run side by side.
  const [routes, pages] = await Promise.all([
    probes && probeSiteUrl
      ? webhookRouteFindings(probeSiteUrl, { ai: identifiers ? [...identifiers].some(id => id.startsWith('ai:')) : true, wants })
      : [],
    authConfig ? pagePathFindings(rootDir, authConfig, wants) : [],
  ])
  return [
    ...routes,
    // The composable function contract.
    ...identifiers && wants('scaffold') ? functionContractFindings(identifiers) : [],
    ...pages,
  ]
}

/**
 * Run the doctor checks against the project in `rootDir` and its deployment
 * (production with `prod`), returning the findings with production posture
 * applied. `only` limits the run to those services. `deployedNames` is the
 * deployment's env names when the caller has just listed them — `doctor --fix`
 * after its push; `null` when that listing failed — so they are not listed
 * twice.
 */
export async function runDoctorChecks(rootDir: string, { prod, only, deployedNames }: { prod: boolean, only?: readonly FindingService[], deployedNames?: string[] | null }): Promise<PreflightFinding[]> {
  const wants = (service: FindingService) => !only || only.length === 0 || only.includes(service)
  const env = { ...readEnvFiles(rootDir), ...process.env } as Record<string, string | undefined>

  const siteUrl = resolveSiteUrl({ env, derived: deriveDeploymentUrls(rootDir, env) })
  const [{ deployed, surface }, catalog] = await Promise.all([
    (async () => {
      // The deployment's env names (never values) first, so a variable set
      // there but not visible here counts as set instead of warning next to
      // the deployment-side finding that says it is.
      const names = deployedNames !== undefined ? deployedNames : await deploymentEnvNames(rootDir, { prod })
      return { deployed: names, surface: await deployedSurfaceFindings(rootDir, { prod, reachable: names !== null, siteUrl, wants }) }
    })(),
    // Billing catalog cross-checks: what backend/billing.catalog.ts declares
    // against the organization's own subscription + portal settings. Every
    // half degrades on its own — no catalog file, no findings; no readable
    // provider, only the catalog-only checks (see collectBillingFindings).
    // Local files and the provider only, so they run beside the deployment
    // reads.
    wants('billing') ? billingCatalogFindings(rootDir, env) : [],
  ])
  const findings: PreflightFinding[] = [
    ...collectPreflightFindings({
      env,
      siteUrlConfigured: Boolean(siteUrl),
      ...(deployed ? { deployedNames: new Set(deployed) } : {}),
    }),
    ...wants('scaffold') ? [codegenFinding(rootDir), ...devScriptFinding(rootDir)] : [],
    ...deploymentEnvFindings(rootDir, deployed, prod),
    ...surface,
    ...catalog,
  ].filter(reported => wants(reported.service))
  return prod ? applyProductionPosture(findings) : findings
}
