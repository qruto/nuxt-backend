/**
 * `nuxt-backend doctor`'s checks, as data: every finding the command prints,
 * collected without printing, so the CLI and the DevTools panel run the same
 * checks. Local files and env first, then what the Convex CLI can read from
 * the deployment (env names only, the function spec, the auth config), the
 * webhook route probes, and the billing catalog cross-checks; under
 * `--prod`, production's posture (the values its env names alone cannot
 * say) and live probes of its site. Each half degrades to no finding when
 * what it needs is unreachable. `only` names the
 * app capabilities to check: a check of another capability never runs, so its
 * deployment reads, probes and provider calls are skipped too.
 */
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { runConvex } from './convex-cli'
import { emailSyncFindings, runEmailSync } from './cli/email'
import { computeDeployment, deriveDeploymentUrls, isLocalDeploymentId, resolveSiteUrl } from './deployment'
import { configuredDeployment, deploymentEnvNames, deploymentFlags, deploymentFunctionSpec, readEnvFiles } from './env-push'
import { projectEnvDefaultNames } from './env-defaults'
import { BACKEND_ENV, OPTIONAL_DEPLOYMENT_ENV, REMOVED_DEPLOYMENT_ENV, REQUIRED_DEPLOYMENT_ENV } from './env-registry'
import { billingEnvironment, parseBackendEnvironment } from './convex/environment'
import { applyProductionPosture, deploymentEnvId, finding, type FindingGroup, type FindingId, type PreflightFinding } from './findings'
import { GATEWAY_KEY_FIX, GATEWAY_ORDER_UNREAD, gatewayKeyIsTheFix } from './capabilities/gateway-route'
import { capabilityOfGroup, type CapabilityName } from './capabilities'
import { billingWebhookSecretHint, collectPreflightFindings } from './preflight'
import { resolveFunctionsDir } from './scaffold'
import { missingContractFunctions } from './contract'
import type { ModulePagesOptions } from './pages'
import { BACKEND_PATH_KEYS, type BackendPaths } from './convex/paths'
import { backendPathsOf, pathOption, pathsSourceOf } from './paths-file'
import { pathsFileFinding } from './paths-sync'
import { appBrandOf } from './brand-file'
import { brandFileFinding } from './brand-sync'
import { installableFinding, type InstallableOptions } from './installable'
import type { BillingCatalog } from './convex/catalog'
import { collectBillingFindings, loadCatalog, readBillingOrganizationState } from './cli/billing'
import { productionCatalogFindings, providerSdkFindings } from './cli/billing/doctor'
import { billingEndpointFindings, billingProviderTarget, providerClient, readProviderEndpoint } from './cli/billing/settings'
import { checkMappedCustomers, customerMappingFindings, readMappedCustomers } from './cli/billing/mappings'
import { metricsAccessFindings } from './cli/billing/metrics'
import { activationFindings } from './cli/analytics/activation'
import { devScriptFinding } from './cli/dev'
import { agentFilesFinding, installedVersion } from './agents'
import { bundleDuplicatesFindings } from './bundle-duplicates'
import { nameCollisionFinding } from './name-collisions'
import { convexConfigFinding } from './convex-config'
import { aiFeatures, checksImages, chosenGateways, chosenRoutes, moderationProviders, mountsComponent, type NamedModerationProvider, namesModerationModel, type NamedGateway, namedModels, pinnedRegion, usesProvenance } from './named-models'
import { DEFAULT_MODERATION_MODEL, routeKeyFor } from './convex/integrations/ai/model-id'
import { consentFindings } from './cli/consents'
import { protectionFindings, type ProtectionDoctorInput } from './cli/protection'
import { monitoringDsnFinding, monitoringFindings, readUsageLimits, usageAlertsFinding } from './monitoring'
import { devInboxFinding, emailPostureFindings, probedOrigin, productionEnvFinding, readProductionPosture, siteOriginFinding, unprobedReason, type ProductionPosture } from './cli/posture'

import { siteProbeFindings, unprobedSiteFindings } from './cli/probes'
import { adminBootstrapFindings, deploymentHasAdmin } from './cli/admin'

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
  return { identifiers: spec?.identifiers ?? null, authConfig, probeSiteUrl, deploymentUrl: spec?.url ?? null }
}

/** What doctor reads of the app's nuxt.config: the module's pages, and whether it serves docs for agents. */
interface AppConfig {
  backend?: { pages?: ModulePagesOptions, authRoute?: string, installable?: InstallableOptions | false }
  /** nuxt-llms' options: set when the app (or a layer it extends, such as Docus) serves `llms.txt`. */
  llms?: unknown
  modules?: unknown[]
}

/**
 * The app's resolved nuxt.config, loaded once per run however many checks
 * read it; `null` when it does not load.
 */
function appConfigLoader(rootDir: string): () => Promise<AppConfig | null> {
  let loading: Promise<AppConfig | null> | undefined
  return () => loading ??= (async () => {
    try {
      const { loadNuxtConfig } = await import('@nuxt/kit')
      return await loadNuxtConfig({ cwd: rootDir }) as AppConfig
    }
    catch {
      return null
    }
  })()
}

/** nuxt.config's options for the module once the config loaded, inline ones over its `backend` key (empty when it sets none); `null` when it did not. */
async function loadedBackendOptions(appConfig: () => Promise<AppConfig | null>): Promise<NonNullable<AppConfig['backend']> | null> {
  const config = await appConfig()
  return config ? pathsSourceOf(config) : null
}

/** The files the module generates, against what nuxt.config and app.config declare: the paths file and the brand file, with codegen. */
async function generatedFileFindings(rootDir: string, appConfig: () => Promise<AppConfig | null>): Promise<PreflightFinding[]> {
  return [codegenFinding(rootDir), ...pathsFileFinding(rootDir, await loadedBackendOptions(appConfig)), ...brandFileFinding(rootDir, await appBrandOf(await appConfig() as never))]
}

/** The installable app's check, from nuxt.config's public directory, modules and `installable` option and app.config's brand; nothing when nuxt.config does not load. */
async function installableFindings(rootDir: string, appConfig: () => Promise<AppConfig | null>, { wanted, pushKeys }: { wanted: boolean, pushKeys: boolean }): Promise<PreflightFinding[]> {
  const config = wanted ? await appConfig() : null
  if (!config) return []
  const modules = (config.modules ?? []).flatMap((entry) => {
    const name = Array.isArray(entry) ? entry[0] : entry
    return typeof name === 'string' ? [name] : []
  })
  const publicDir = join(rootDir, (config as { dir?: { public?: string } }).dir?.public ?? 'public')
  const options = (pathsSourceOf(config) as { installable?: InstallableOptions | false }).installable
  const links = (config as { app?: { head?: { link?: unknown[] } } }).app?.head?.link ?? []
  return installableFinding(publicDir, await appBrandOf(config as never), { modules, pushKeys, options, links })
}

/** Whether the app serves docs for agents: nuxt-llms is configured, or listed as a module. */
function servesAgentDocs(config: AppConfig | null): boolean {
  return config?.llms !== undefined || (config?.modules ?? []).some(entry => (Array.isArray(entry) ? entry[0] : entry) === 'nuxt-llms')
}

/** The paths the deployment links to and serves on, as `auth:authConfig` reports them. */
type DeployedAuthConfig = Partial<BackendPaths>

/**
 * The deployment's view of the auth config (`auth:authConfig`): the paths
 * it links to and serves on. Null when unreadable.
 */
async function deployedAuthConfig(rootDir: string, prod: boolean): Promise<DeployedAuthConfig | null> {
  try {
    const { stdout } = await runConvex(rootDir, ['run', ...deploymentFlags({ prod }), 'auth:authConfig'])
    const parsed = JSON.parse(stdout) as { paths?: Record<string, unknown> }
    const config: DeployedAuthConfig = {}
    for (const key of BACKEND_PATH_KEYS) {
      const value = parsed.paths?.[key]
      if (typeof value === 'string') config[key] = value
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

/** What a path the deployment holds apart from nuxt.config breaks. */
const BROKEN_BY: Readonly<Record<keyof BackendPaths, string>> = {
  authRoute: 'the auth proxy forwards to routes the deployment does not serve, so nobody signs in',
  acceptInvitation: 'invitees land on a 404',
  keepAccount: 'the "keep my account" link of a scheduled deletion lands on a 404',
  security: 'a recovered passkey-only account\'s notice links to a 404',
  waitlist: 'a waitlist confirmation\'s status link lands on a 404',
  login: 'an admitted person\'s "You\'re in" email links to a 404',
  unsubscribe: 'a topic email\'s unsubscribe and confirmation links land on a 404',
  report: 'a statement of reasons\' appeal link lands on a 404',
  settings: 'the billing emails\' manage links land on a 404',
  privacy: 'an access invitation email\'s privacy link lands on a 404',
}

/**
 * Cross-check each path the deployment links to or serves on against what
 * nuxt.config declares: they differ when the deployed code does not carry
 * the generated paths file (an old push, or an auth.ts or account.ts that
 * does not pass `paths` on). A path the deployment does not report is not
 * checked; nothing when nuxt.config does not load.
 */
async function pagePathFindings(appConfig: () => Promise<AppConfig | null>, deployed: DeployedAuthConfig): Promise<PreflightFinding[]> {
  const source = await loadedBackendOptions(appConfig)
  if (!source) return []
  const wanted = backendPathsOf(source)
  const keys = BACKEND_PATH_KEYS.filter(key => deployed[key] !== undefined)
  if (keys.length === 0) return []
  const apart = keys.filter(key => deployed[key] !== wanted[key])
  if (apart.length === 0) return [finding('page-paths', 'pass', 'The deployment serves on and links to the paths nuxt.config declares.')]
  return [finding(
    'page-paths',
    'fail',
    `The deployment's paths differ from nuxt.config's: ${apart.map(key => `${key} is ${deployed[key]} there and ${wanted[key]} in ${pathOption(key)}, so ${BROKEN_BY[key]}`).join('; ')}.`,
    'Pass the `paths` of paths.generated.ts to defineBackendAuthConfig (auth.config.ts), setupAuth (auth.ts) and setupAccount (account.ts), then let `npx convex dev` push or deploy.',
  )]
}

/**
 * Doctor's billing half: load the declared catalog, read the provider's
 * organization settings with whatever token is visible here, and cross-check
 * the two. Local env only — the deployment may hold a token this machine does not, in
 * which case the provider checks simply do not run.
 *
 * @internal
 */
export async function billingCatalogFindings(rootDir: string, env: Record<string, string | undefined>): Promise<PreflightFinding[]> {
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
  // The sandbox, unless the env this run reads says it is production's.
  const environment = billingEnvironment(parseBackendEnvironment(env.BACKEND_ENVIRONMENT))
  const state = accessToken ? await readBillingOrganizationState({ accessToken, environment }) : null
  return collectBillingFindings(catalog, state, { tokenPresent: Boolean(accessToken) })
}

/**
 * What a webhook route answers an unsigned, empty POST: `mounted` (a 4xx
 * that is no 404 or 503: the signature check refused the probe, as it
 * should), `missing` (404), `fail-closed` (503: no secret), `unexpected`,
 * or `unreachable`. No secret is involved.
 *
 * @internal
 */
export async function probeWebhookRoute(url: string): Promise<{ state: 'mounted' | 'missing' | 'fail-closed' | 'unexpected' | 'unreachable', status?: number }> {
  try {
    // The destination is the deployment's HTTP-actions origin, read from the
    // project's own env files (from the CLI's output under --prod), and the
    // probe sends an empty body: the one thing from a file in the request
    // is that origin, which is where the probe has to go. A local or
    // self-hosted deployment's site port is known from nowhere else.
    // fallow-ignore-next-line security-sink -- the doctor probes the project's own SITE_URL (its env file), from the developer's machine; verified 2026-09-17
    const response = await fetch(
      // codeql[js/file-access-to-http] The URL is the project's own deployment origin from its env file; the body is empty. Reviewed 2026-10-18.
      url,
      { method: 'POST', body: '', signal: AbortSignal.timeout(5000) },
    )
    const status = response.status
    if (status === 404) return { state: 'missing', status }
    if (status === 503) return { state: 'fail-closed', status }
    if (status >= 400 && status < 500) return { state: 'mounted', status }
    return { state: 'unexpected', status }
  }
  catch {
    return { state: 'unreachable' }
  }
}

/**
 * Probe the deployment's webhook routes with an empty-body POST (no secrets
 * involved): 404 means the route isn't mounted in `http.ts`; any other 4xx
 * means it is (signature verification correctly rejected the empty probe).
 */
async function webhookRouteFindings(siteUrl: string, { ai, wants, prod }: { ai: boolean, wants: (group: FindingGroup) => boolean, prod: boolean }): Promise<PreflightFinding[]> {
  // `group` is also the route group registerBackendRoutes takes.
  const routes: Array<{ id: 'billing-webhook-route' | 'email-webhook-route' | 'ai-stream-route', path: string, group: FindingGroup, secret: string | null }> = [
    { id: 'billing-webhook-route', path: '/billing/events', group: 'billing', secret: 'BILLING_WEBHOOK_SECRET' },
    { id: 'email-webhook-route', path: '/email/events', group: 'email', secret: 'EMAIL_WEBHOOK_SECRET' },
    // The stream route only matters once setupAi is deployed; a project
    // without an `ai` module has nothing to mount. It has no secret.
    ...(ai ? [{ id: 'ai-stream-route', path: '/ai/stream', group: 'ai', secret: null } as const] : []),
  ]
  return Promise.all(routes.filter(route => wants(route.group)).map(async (route): Promise<PreflightFinding> => {
    const url = `${siteUrl.replace(/\/+$/, '')}${route.path}`
    const { state, status } = await probeWebhookRoute(url)
    if (state === 'missing') {
      return finding(route.id, 'fail', `${route.path} is not mounted on the deployment.`, `Pass \`${route.group}\` to registerBackendRoutes in http.ts and deploy.`)
    }
    if (state === 'fail-closed' && route.secret) {
      // The same designed degradation the *_WEBHOOK_SECRET findings report:
      // fine on a dev deployment that has no provider webhooks yet, a
      // failure under production posture (escalated with the rest).
      return finding(
        route.id,
        'warn',
        `${route.path} is mounted but fail-closed — its webhook secret is not set, so every delivery is rejected (503).`,
        route.secret === 'BILLING_WEBHOOK_SECRET'
          ? billingWebhookSecretHint(prod)
          : `Add ${route.secret} to .env.local and run \`npx nuxt-backend env push${prod ? ' --prod' : ''}\`.`,
      )
    }
    if (state === 'mounted') {
      return finding(route.id, 'pass', `${route.path} is mounted (the unsigned probe was rejected, as expected).`)
    }
    if (state === 'unreachable') {
      return finding(route.id, 'warn', `${url} is unreachable (offline, or the deployment is not running).`, 'Run `npx convex dev` (or deploy), then re-run doctor.')
    }
    return finding(route.id, 'warn', `${route.path} answered with unexpected status ${status}.`, 'Check the deployment logs.')
  }))
}

/**
 * The deployment's webhook endpoint at the billing provider: still
 * delivering, and subscribed to every event the package handles. Read with
 * the token visible here; nothing without one, or when the deployment has
 * no endpoint yet (`billing-webhook-secret` says so).
 */
async function billingEndpointCheck(env: Record<string, string | undefined>, { prod, siteUrl }: { prod: boolean, siteUrl: string }): Promise<PreflightFinding[]> {
  const target = billingProviderTarget(env, prod)
  if (!target) return []
  const url = `${siteUrl.replace(/\/+$/, '')}/billing/events`
  return billingEndpointFindings(await readProviderEndpoint(providerClient(target.accessToken, target.environment), url), url)
}

/**
 * Whether the provider knows the customers the deployment maps billing
 * entities onto, with the token `doctor` reaches it with: a page of the
 * mapped ids, read off the provider's component, then each asked for. No
 * finding without a token, or when either side cannot be read.
 */
async function customerMappingCheck(rootDir: string, env: Record<string, string | undefined>, { prod }: { prod: boolean }): Promise<PreflightFinding[]> {
  const target = billingProviderTarget(env, prod)
  if (!target) return []
  const ids = await readMappedCustomers(rootDir, { prod })
  if (!ids) return []
  return customerMappingFindings(await checkMappedCustomers(providerClient(target.accessToken, target.environment), ids), { prod })
}

/**
 * The deployment as the billing provider sees it: the webhook endpoint at
 * its site, and the customers it maps billing entities onto.
 */
async function billingProviderFindings(rootDir: string, env: Record<string, string | undefined>, { prod, reachable, siteUrl }: { prod: boolean, reachable: boolean, siteUrl: string | undefined }): Promise<PreflightFinding[]> {
  const [endpoint, mappings] = await Promise.all([
    siteUrl ? billingEndpointCheck(env, { prod, siteUrl }) : [],
    reachable ? customerMappingCheck(rootDir, env, { prod }) : [],
  ])
  return [...endpoint, ...mappings]
}

/** The email setup as the deployment's own email sync reads it, as a dry run; nothing when it cannot run, or the deployment has no `email:syncEmail`. */
async function emailSetupFindings(rootDir: string, { prod, reachable, identifiers }: { prod: boolean, reachable: boolean, identifiers: ReadonlySet<string> | null | undefined }): Promise<PreflightFinding[]> {
  if (!reachable || !identifiers?.has('email:syncEmail')) return []
  try {
    const report = await runEmailSync(rootDir, { prod, dryRun: true })
    return report ? emailSyncFindings(report, { prod }) : []
  }
  catch {
    return []
  }
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
 * An optional var reports its designed degradation when unset.
 * `BACKEND_ENVIRONMENT` is derived, so its fix is the push, not a value.
 */
function optionalDeploymentEnvFinding(name: string, degradation: string, isSet: boolean, { prod }: { prod: boolean }): PreflightFinding {
  const id = deploymentEnvId(name)
  const flag = prod ? ' --prod' : ''
  if (isSet) return finding(id, 'pass', `${name} is set on the deployment.`)
  const fixHint = name === 'BILLING_WEBHOOK_SECRET'
    ? billingWebhookSecretHint(prod)
    : name === 'BACKEND_ENVIRONMENT'
      ? `Run \`npx nuxt-backend env push${flag}\`: it derives ${name} from the deployment's kind.`
      : `Add ${name} to .env.local and run \`npx nuxt-backend env push${flag}\`.`
  return finding(id, 'warn', `${name} is not set (optional): ${degradation}.`, fixHint)
}

/**
 * Variables an earlier preview read that `0.2.0` removed, still set on the
 * deployment: nothing reads them, and they say what no longer decides the
 * mode. The ones `BACKEND_ENVIRONMENT` replaced are the point; the rest are
 * leftovers.
 */
function removedEnvFinding(deployed: readonly string[], { prod }: { prod: boolean }): PreflightFinding {
  const left = REMOVED_DEPLOYMENT_ENV.filter(name => deployed.includes(name))
  if (left.length === 0) return finding('deployment-removed-env', 'pass', 'No variable `0.2.0` removed is still set on the deployment.')
  return finding(
    'deployment-removed-env',
    'warn',
    `${left.join(', ')} ${left.length === 1 ? 'is' : 'are'} still set on the deployment, and nothing reads ${left.length === 1 ? 'it' : 'them'} any more: BACKEND_ENVIRONMENT decides the modes they once set.`,
    left.map(name => `npx convex env remove${prod ? ' --prod' : ''} ${name}`).join('; '),
  )
}

/** `a`, `a and b`, `a, b and c`. */
function listed(names: readonly string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/** The provider package model ids reach the Convex AI Gateway through. */
const CONVEX_GATEWAY_PROVIDER = '@convex-dev/ai-sdk-provider'

/** The fix that sets the gateway key: `.env.local` and env push in dev, production's own key under `--prod`. */
const keyFix = (flag: string): string => flag ? GATEWAY_KEY_FIX.prod : GATEWAY_KEY_FIX.dev

/** Whether routes may send some model through the Convex AI Gateway: ones doctor cannot read may. */
const routesNameConvex = (routes: Readonly<Record<string, readonly NamedGateway[]>> | 'unread' | undefined): boolean =>
  routes === 'unread' || Object.values(routes ?? {}).some(order => order.includes('convex'))

/** Whether an order may send calls through the Convex AI Gateway: the default one, one doctor cannot read, or one that names it. */
const namesConvex = (order: readonly NamedGateway[] | 'unread' | undefined): boolean => order === undefined || order === 'unread' || order.includes('convex')

/** The spending limit the Convex AI Gateway counts against, and how to set it. */
const SPENDING_LIMIT = 'Cap its spend with `npx convex deployment usage-limits set` (the `aiGatewayCostDollars` limit).'

/** Whether the app installs the provider package the Convex AI Gateway is called through. */
function convexGatewayProviderInstalled(rootDir: string): boolean {
  try {
    createRequire(join(rootDir, 'package.json')).resolve(`${CONVEX_GATEWAY_PROVIDER}/package.json`)
    return true
  }
  catch {
    return false
  }
}

/**
 * The route on Convex Cloud: the Convex AI Gateway with the provider
 * installed (a free plan falls back on the key, when it is set), the Vercel
 * AI Gateway with the key alone, else none.
 */
function cloudRouteFinding(id: FindingId, models: readonly string[], { keyed, provider, flag }: { keyed: boolean, provider: boolean, flag: string }): PreflightFinding {
  if (provider) {
    const fallback = keyed
      ? 'where the plan has none (a free plan), they go through the Vercel AI Gateway with AI_GATEWAY_API_KEY'
      : 'a free plan refuses it (AiGatewayDisabled), and with no AI_GATEWAY_API_KEY to fall back on, those calls are refused'
    return finding(id, 'pass', `${listed(models)} go through the Convex AI Gateway, which bills the team; ${fallback}. ${SPENDING_LIMIT}`)
  }
  if (keyed) {
    return finding(id, 'pass', `AI_GATEWAY_API_KEY is set on the deployment: ${listed(models)} go through the Vercel AI Gateway. Install ${CONVEX_GATEWAY_PROVIDER} to go through the Convex AI Gateway first.`)
  }
  return finding(
    id,
    'warn',
    `The backend names ${listed(models)}, but no model route is ready on the deployment: ${CONVEX_GATEWAY_PROVIDER} is not installed and AI_GATEWAY_API_KEY is not set, so those model calls are refused.`,
    `${keyFix(flag)} Or install ${CONVEX_GATEWAY_PROVIDER} (\`pnpm add ${CONVEX_GATEWAY_PROVIDER}\`) to use the Convex AI Gateway on a paid plan.`,
  )
}

/**
 * The route through the Convex AI Gateway, where the order leaves it alone
 * (`setupAi({ gateway: 'convex' })`) or where the Vercel AI Gateway before it
 * has no key: on Convex Cloud with the provider installed, a paid plan has it
 * and a free plan refuses it; a local deployment linked to a project has it
 * the same way, through that project's team; an anonymous local deployment
 * and a self-hosted one never do. No key is read.
 */
function convexRouteFinding(id: FindingId, models: readonly string[], { cloud, linked, local, provider, keyed, alone, flag }: RouteFacts & { alone: boolean }): PreflightFinding {
  const how = alone
    ? `setupAi({ gateway: 'convex' }) sends ${listed(models)} through the Convex AI Gateway alone`
    : `AI_GATEWAY_API_KEY is not set on the deployment, so ${listed(models)} go through the Convex AI Gateway, next in setupAi({ gateway })`
  const elsewhere = alone
    ? `Add 'vercel' to setupAi({ gateway }), then: ${keyFix(flag)}`
    : keyFix(flag)
  const install = `Install ${CONVEX_GATEWAY_PROVIDER} (\`pnpm add ${CONVEX_GATEWAY_PROVIDER}\`)`
  if (!provider) {
    // Where the key is a fix, it leads: status reads it as what the models lack.
    return finding(id, 'warn', `${how}, but ${CONVEX_GATEWAY_PROVIDER} is not installed: those model calls are refused.`, alone ? `${install}, or: ${elsewhere}` : `${elsewhere} Or: ${install}.`)
  }
  if (cloud || linked) {
    const unused = alone && keyed ? ' AI_GATEWAY_API_KEY is set on the deployment and never read.' : ''
    const whose = cloud ? 'the team' : 'the team of the project this local deployment is linked to'
    return finding(id, 'pass', `${how}, which bills ${whose}; a free plan refuses it (AiGatewayDisabled), and no other gateway is tried.${unused} ${SPENDING_LIMIT}`)
  }
  if (local) {
    const login = 'Run `npx convex login` to link the local deployment to a project on a paid plan, then restart `npx nuxt-backend dev`.'
    return finding(id, 'warn', `${how}, which an anonymous local deployment cannot reach: those model calls are refused.`, alone ? `${login} Or: ${elsewhere}` : `${elsewhere} Or: ${login}`)
  }
  return finding(id, 'warn', `${how}, which a self-hosted deployment never has: those model calls are refused.`, elsewhere)
}

/** What doctor knows of the route a model id takes: the backend's ids, and the deployment's kind. */
interface ModelRouteInput {
  models: readonly string[]
  local: boolean
  /** A local deployment linked to a project (`local:`, not `anonymous:`): it reaches the Convex AI Gateway on that team's plan. */
  linked: boolean
  /** Convex Cloud (dev, preview or production), where a paid plan has the Convex AI Gateway. */
  cloud: boolean
  /** The app installs the Convex AI Gateway's provider package. */
  provider: boolean
  prod: boolean
  /** The region `setupAi({ inferenceRegion })` pins every call to: only the Vercel AI Gateway serves it. */
  region?: string
  /** The order `setupAi({ gateway })` names as a literal; the default order (`['convex', 'vercel']`) without one; `unread` when it is no literal doctor reads. */
  gateways?: readonly NamedGateway[] | 'unread'
  /** The orders `setupAi({ routes })` gives some models, as a literal map; `unread` when it is no literal doctor reads. */
  routes?: Readonly<Record<string, readonly NamedGateway[]>> | 'unread'
}

/**
 * The route the backend's `provider/model` ids take, through the order
 * `setupAi({ gateway })` names. By default: the Convex AI Gateway, on Convex
 * Cloud with the provider package installed (a paid plan has it; a free plan
 * refuses it when called); the Vercel AI Gateway with `AI_GATEWAY_API_KEY`;
 * anywhere else those models are refused when called. Unset with none named,
 * nothing needs a route.
 */
function gatewayKeyFinding(deployed: readonly string[], { models, local, linked, cloud, provider, prod, region, gateways = ['convex', 'vercel'], routes }: ModelRouteInput): PreflightFinding {
  const id = deploymentEnvId('AI_GATEWAY_API_KEY')
  const flag = prod ? ' --prod' : ''
  const keyed = deployed.includes('AI_GATEWAY_API_KEY')
  if (models.length === 0) {
    return finding(id, 'pass', keyed ? 'AI_GATEWAY_API_KEY is set on the deployment.' : 'AI_GATEWAY_API_KEY is not set, and no backend file names a provider/model id that needs a model route.')
  }
  if (gateways === 'unread' || routes === 'unread') return unreadOrderFinding(id, models, routes === 'unread' ? 'routes' : 'gateway')
  const routeless = Object.entries(routes ?? {}).find(([, order]) => !order.includes('vercel'))?.[0]
  if (region) return regionRouteFinding(id, models, { region, keyed, vercel: gateways.includes('vercel'), routeless, flag })
  const facts = { keyed, cloud, linked, local, provider, flag }
  const groups = routedGroups(models, gateways, routes)
  if (groups.length === 1 && groups[0]!.key === undefined) return orderRouteFinding(id, models, { gateways, ...facts })
  return routesFinding(id, groups.map(group => ({ group, found: orderRouteFinding(id, group.models, { gateways: group.order, ...facts }) })))
}

/**
 * The route of an order doctor cannot read: `gateway` or `routes` from a
 * variable or a shorthand, an empty list, a computed key, options spread
 * in, or two `setupAi` calls that differ. Nothing is assumed, so nothing
 * is checked.
 */
function unreadOrderFinding(id: FindingId, models: readonly string[], option: 'gateway' | 'routes'): PreflightFinding {
  const literal = option === 'gateway' ? '\'convex\', \'vercel\' or a list of them' : 'a map of quoted model ids or patterns to \'convex\', \'vercel\' or a list of them'
  return finding(
    id,
    'warn',
    `${GATEWAY_ORDER_UNREAD}: setupAi({ ${option} }) is no literal it reads (a variable, the shorthand { ${option} }, ${option === 'gateway' ? 'an empty list' : 'a computed key'}, spread options, or two setupAi calls that differ), so the route of ${listed(models)} is not checked.`,
    `Write \`${option}\` in setupAi as ${literal}, in one setupAi call, then run doctor again.`,
  )
}

/** The models one order sends: `setupAi({ gateway })`'s, or a route's (`key`). */
interface RouteGroup { key?: string, order: readonly NamedGateway[], models: string[] }

/** The named models by the order each takes: its `routes` key's, else `setupAi({ gateway })`'s. */
function routedGroups(models: readonly string[], gateways: readonly NamedGateway[], routes: Readonly<Record<string, readonly NamedGateway[]>> | undefined): RouteGroup[] {
  const groups = new Map<string | undefined, RouteGroup>()
  for (const model of models) {
    const key = routes ? routeKeyFor(model, routes) : undefined
    const group = groups.get(key) ?? { key, order: key === undefined ? gateways : routes![key]!, models: [] }
    group.models.push(model)
    groups.set(key, group)
  }
  return [...groups.values()]
}

const STATUS_RANK = { pass: 0, warn: 1, fail: 2 } as const

/**
 * The route finding under `setupAi({ routes })`: each route beside the
 * order, with the finding of the models it sends, worded for the route; the
 * worst of them decides. A route to the Convex AI Gateway alone says the key
 * is never read for its models.
 */
function routesFinding(id: FindingId, parts: ReadonlyArray<{ group: RouteGroup, found: PreflightFinding }>): PreflightFinding {
  const routed = (text: string, key: string) => text.replace(/setupAi\(\{ gateway(?:: '[a-z]+')? \}\)/g, `its route '${key}' in setupAi({ routes })`)
  const said = parts.map(({ group, found }) => {
    if (group.key === undefined) return { ...found, message: `Under setupAi({ gateway })'s order: ${found.message}` }
    const unread = group.order.length === 1 && group.order[0] === 'convex' ? ` AI_GATEWAY_API_KEY is never read for ${listed(group.models)}.` : ''
    return { ...found, message: `Routed by '${group.key}' (${group.order.join(', then ')}): ${routed(found.message, group.key)}${unread}`, fixHint: routed(found.fixHint, group.key) }
  })
  const worst = said.reduce((a, b) => STATUS_RANK[b.status] > STATUS_RANK[a.status] ? b : a)
  // The key's own fix leads, as status reads the first hint to tell a missing key from a route that never reads it.
  const hints = [...new Set(said.map(part => part.fixHint).filter(Boolean))].sort((a, b) => Number(gatewayKeyIsTheFix({ fixHint: b })) - Number(gatewayKeyIsTheFix({ fixHint: a })))
  return finding(id, worst.status, said.map(part => part.message).join(' '), hints.join(' '))
}

/** What each route finding knows of the deployment: its kind, the provider package, the key, and the `--prod` flag a fix names. */
interface RouteFacts { cloud: boolean, linked: boolean, local: boolean, provider: boolean, keyed: boolean, flag: string }

/**
 * The route through `setupAi({ gateway })`'s order, with no region pinned:
 * the Vercel AI Gateway alone, the Convex AI Gateway alone, the Vercel one
 * first, or the default order.
 */
function orderRouteFinding(id: FindingId, models: readonly string[], { gateways, ...facts }: RouteFacts & { gateways: readonly NamedGateway[] }): PreflightFinding {
  const vercelFirst = gateways[0] === 'vercel'
  if (!gateways.includes('convex')) return vercelRouteFinding(id, models, facts)
  if (vercelFirst && facts.keyed) return finding(id, 'pass', `AI_GATEWAY_API_KEY is set on the deployment: ${listed(models)} go through the Vercel AI Gateway, first in setupAi({ gateway }).`)
  if (vercelFirst || !gateways.includes('vercel')) return convexRouteFinding(id, models, { ...facts, alone: !vercelFirst })
  return defaultRouteFinding(id, models, facts)
}

/** The route through the Vercel AI Gateway alone (`setupAi({ gateway: 'vercel' })`): the key decides. */
function vercelRouteFinding(id: FindingId, models: readonly string[], { keyed, flag }: RouteFacts): PreflightFinding {
  if (keyed) return finding(id, 'pass', `AI_GATEWAY_API_KEY is set on the deployment: ${listed(models)} go through the Vercel AI Gateway (setupAi({ gateway: 'vercel' })).`)
  return finding(id, 'warn', `setupAi({ gateway: 'vercel' }) sends ${listed(models)} through the Vercel AI Gateway alone, but AI_GATEWAY_API_KEY is not set on the deployment: those model calls are refused.`, keyFix(flag))
}

/** The route through the default order: the Convex AI Gateway, then the Vercel one with the key. */
function defaultRouteFinding(id: FindingId, models: readonly string[], { cloud, linked, local, provider, keyed, flag }: RouteFacts): PreflightFinding {
  // A local deployment linked to a project reaches the Convex AI Gateway as Convex Cloud does.
  if (cloud || linked) return cloudRouteFinding(id, models, { keyed, provider, flag })
  if (keyed) return finding(id, 'pass', `AI_GATEWAY_API_KEY is set on the deployment: ${listed(models)} go through the Vercel AI Gateway.`)
  return finding(
    id,
    'warn',
    `The backend names ${listed(models)}, but AI_GATEWAY_API_KEY is not set on the deployment${local && provider ? ', and an anonymous local deployment cannot reach the Convex AI Gateway: those model calls are refused' : ': those model calls are refused'}.`,
    local && provider ? `${keyFix(flag)} Or run \`npx convex login\` to link the local deployment to a project on a paid plan.` : keyFix(flag),
  )
}

/**
 * The route of calls pinned to a region (`setupAi({ inferenceRegion })`):
 * only the Vercel AI Gateway serves one, so the key decides, and an order
 * without `'vercel'` is refused by `setupAi` itself.
 */
function regionRouteFinding(id: FindingId, models: readonly string[], { region, keyed, vercel, routeless, flag }: { region: string, keyed: boolean, vercel: boolean, routeless?: string, flag: string }): PreflightFinding {
  if (!vercel) {
    return finding(id, 'warn', `The backend pins its model calls to the '${region}' inference region, which only the Vercel AI Gateway serves, but setupAi({ gateway }) does not name 'vercel': setupAi refuses the pin, and the push fails.`, 'Add \'vercel\' to setupAi({ gateway }), or drop inferenceRegion.')
  }
  if (routeless) {
    return finding(id, 'warn', `The backend pins its model calls to the '${region}' inference region, which only the Vercel AI Gateway serves, but the route for '${routeless}' in setupAi({ routes }) does not name 'vercel': setupAi refuses the pin, and the push fails.`, `Add 'vercel' to the route for '${routeless}', or drop inferenceRegion.`)
  }
  if (keyed) return finding(id, 'pass', `AI_GATEWAY_API_KEY is set on the deployment: ${listed(models)} go through the Vercel AI Gateway, pinned to the '${region}' inference region.`)
  return finding(id, 'warn', `The backend pins its model calls to the '${region}' inference region, which only the Vercel AI Gateway serves, but AI_GATEWAY_API_KEY is not set on the deployment: ${listed(models)} are refused.`, keyFix(flag))
}

/**
 * The content-credentials signing pair, once the backend turns provenance on
 * (`setupAi({ provenance })` or a `ctx.storeImage` call): without both,
 * generated images carry the IPTC source type and no signed manifest, which
 * production cannot ship with.
 */
function provenanceKeyFinding(name: 'PROVENANCE_PRIVATE_KEY' | 'PROVENANCE_CERTIFICATE', deployed: readonly string[], { on, prod }: { on: boolean, prod: boolean }): PreflightFinding {
  const id = deploymentEnvId(name)
  if (!on) return finding(id, 'pass', `${name} is not needed: no backend file turns provenance on.`)
  if (deployed.includes(name)) return finding(id, 'pass', `${name} is set on the deployment: generated images carry signed content credentials.`)
  const flag = prod ? ' --prod' : ''
  return finding(
    id,
    'warn',
    `The backend turns provenance on, but ${name} is not set on the deployment: generated images are stored with the IPTC source type only, no signed C2PA manifest (ai.provenance_unsigned).`,
    `Run \`npx nuxt-backend env push${flag}\`: it generates a signing key and its certificate when .env.local has none, keeps them there and sets them on the deployment.`,
  )
}

/**
 * `ai.chat` needs Convex's Agent component and `ai.knowledge` its RAG
 * component, each mounted by the app in `convex.config.ts`: without the
 * mount, every call is refused (`unavailable`).
 */
function aiComponentsFinding(rootDir: string): PreflightFinding {
  const { chat, knowledge } = aiFeatures(rootDir)
  const missing = [
    ...chat && !mountsComponent(rootDir, '@convex-dev/agent') ? [{ call: 'ai.chat', pkg: '@convex-dev/agent', name: 'agent' }] : [],
    ...knowledge && !mountsComponent(rootDir, '@convex-dev/rag') ? [{ call: 'ai.knowledge', pkg: '@convex-dev/rag', name: 'rag' }] : [],
  ]
  if (missing.length === 0) {
    return finding('ai-components', 'pass', chat || knowledge ? 'The components the chats and knowledge stores run on are mounted.' : 'No backend file declares a chat or a knowledge store.')
  }
  return finding(
    'ai-components',
    'warn',
    `The backend declares ${listed(missing.map(entry => entry.call))}, but convex.config.ts does not mount ${listed(missing.map(entry => entry.pkg))}: every call is refused.`,
    missing.map(entry => `\`pnpm add ${entry.pkg}\`, then \`import ${entry.name} from '${entry.pkg}/convex.config'\` and \`app.use(${entry.name})\` in convex.config.ts`).join('; '),
  )
}

/**
 * A job queue open to signed-out visitors needs PROTECTION_PROOF_SECRET on
 * the deployment: the visitor's cookie and the proof that names it are
 * signed with it, and without it every guest job is refused.
 */
function guestJobsFinding(rootDir: string, deployed: readonly string[], { prod }: { prod: boolean }): PreflightFinding[] {
  if (!aiFeatures(rootDir).guestJobs) return []
  if (deployed.includes('PROTECTION_PROOF_SECRET')) return [finding('protection-guest-jobs', 'pass', 'Guest jobs are on, and PROTECTION_PROOF_SECRET signs the visitor cookie and proof they need.')]
  return [finding(
    'protection-guest-jobs',
    'warn',
    'A job queue lets signed-out visitors start jobs (`guest`), but PROTECTION_PROOF_SECRET is not set on the deployment: no proof names a visitor, so every guest job is refused.',
    `Add PROTECTION_PROOF_SECRET to .env.local and run \`npx nuxt-backend env push${prod ? ' --prod' : ''}\`; the Nuxt server needs the same value.`,
  )]
}

/** What the backend declares against what it needs mounted or set: the chat and knowledge components, guest jobs' proof secret. */
function declaredFeatureFindings(rootDir: string, { wants, deployed, prod }: { wants: (group: FindingGroup) => boolean, deployed: string[] | null, prod: boolean }): PreflightFinding[] {
  return [
    ...wants('ai') ? [aiComponentsFinding(rootDir)] : [],
    ...wants('protection') && deployed ? guestJobsFinding(rootDir, deployed, { prod }) : [],
  ]
}

/**
 * Where model calls run, by the deployment's kind: Convex Cloud (dev,
 * preview, production) may have the Convex AI Gateway, and so may a local
 * deployment linked to a project (`local:`), on that team's plan; an
 * anonymous one (`anonymous:`) never does. Under --prod the deployment is
 * production's, whatever .env.local names, and on Convex Cloud unless it is
 * self-hosted.
 */
function deploymentRoute(kind: ReturnType<typeof computeDeployment>['kind'], prod: boolean): { local: boolean, linked: boolean, cloud: boolean } {
  if (prod) return { local: false, linked: false, cloud: kind !== 'self-hosted' }
  return { local: ['local', 'anonymous'].includes(kind), linked: kind === 'local', cloud: ['cloud-dev', 'preview', 'production'].includes(kind) }
}

/**
 * Deployment-side env presence (names only — values never read). Two tiers:
 * AUTH_SECRET + SITE_URL are required (fail); the rest are optional and
 * report the designed degradation (warn). The gateway key is needed only
 * once the backend names a model, so it reports on what does. Under
 * --prod, the two switches and the sender report by their values
 * (`posture`): left at a default production cannot run with, they fail.
 */
function deploymentEnvFindings(rootDir: string, deployed: string[] | null, { prod, local, linked, cloud, posture }: { prod: boolean, local: boolean, linked: boolean, cloud: boolean, posture: ProductionPosture | null }): PreflightFinding[] {
  // A sandbox production that re-exports the dev inbox's reader publishes it on purpose: unset, its demo reads no code.
  const sandboxInbox = prod && posture?.environment === 'sandbox' && reExportsName(rootDir, 'getSandboxInbox')
  if (!deployed) {
    return [finding('deployment-env', 'warn', 'Could not read the deployment env (no deployment configured, or `npx convex env list` failed).', 'Run `npx convex dev` once to provision, then re-run doctor.')]
  }
  return [
    ...REQUIRED_DEPLOYMENT_ENV.map(name => requiredDeploymentEnvFinding(name, deployed.includes(name), prod)),
    // Bot protection reports its own names, either of which protects (protectionFindings).
    // A name with no finding of its own (the marketing sender, the region) reports nothing yet.
    // The dev inbox's opt-in reports only once it is set: unset is every app's state, and nothing to say.
    ...Object.entries(OPTIONAL_DEPLOYMENT_ENV).filter(([name]) => !name.startsWith('PROTECTION_') && BACKEND_ENV[name as keyof typeof BACKEND_ENV].findings.length > 0 && (name !== 'EMAIL_DEV_INBOX' || deployed.includes(name) || sandboxInbox)).map(([name, degradation]) => {
      if (name === 'AI_GATEWAY_API_KEY') return gatewayKeyFinding(deployed, { models: namedModels(rootDir), local, linked, cloud, provider: convexGatewayProviderInstalled(rootDir), prod, region: pinnedRegion(rootDir), gateways: chosenGateways(rootDir), routes: chosenRoutes(rootDir) })
      if (name === 'PROVENANCE_PRIVATE_KEY' || name === 'PROVENANCE_CERTIFICATE') return provenanceKeyFinding(name, deployed, { on: usesProvenance(rootDir), prod })
      if (isModerationKey(name)) return moderationKeyFinding(name, moderationProviders(rootDir), deployed, { prod })
      // Unset in dev is the designed state: the local error log stands in.
      if (name === 'MONITORING_DSN') return monitoringDsnFinding(deployed.includes(name), { prod })
      // Opted into outside production; warns only when left set on production.
      if (name === 'EMAIL_DEV_INBOX') return devInboxFinding({ prod, posture, set: deployed.includes(name) })
      // Under --prod, the switches and the sender by their values.
      const valued = posture ? productionEnvFinding(name, deployed, posture) : null
      if (valued) return valued
      return optionalDeploymentEnvFinding(name, degradation, deployed.includes(name), { prod })
    }),
    removedEnvFinding(deployed, { prod }),
    moderationImagesFinding(rootDir, deployed, { cloud, linked, prod }),
    moderationProvidersFinding(rootDir),
  ]
}

/** The Azure regions in the EU, where an app that pins its processing there keeps its moderation too. */
const EU_AZURE_REGIONS = new Set(['austriaeast', 'belgiumcentral', 'denmarkeast', 'francecentral', 'francesouth', 'germanynorth', 'germanywestcentral', 'italynorth', 'northeurope', 'polandcentral', 'spaincentral', 'swedencentral', 'swedensouth', 'westeurope'])

/**
 * The moderation providers the backend names (`setupAi({ moderation })`):
 * a known-abuse match beside image checks, and an Azure region in the EU
 * where the app pins its processing there. Each key has its own finding
 * ({@link moderationKeyFinding}).
 */
function moderationProvidersFinding(rootDir: string): PreflightFinding {
  const id = 'ai-moderation-providers'
  const providers = moderationProviders(rootDir)
  if (providers.length === 0) return finding(id, 'pass', 'The backend names no moderation provider: its safety classifier checks content alone.')
  const knownAbuse = providers.some(provider => provider.id === 'arachnid-shield')
  const problems = [unmatchedImages(rootDir, knownAbuse), regionOutsideEu(rootDir, providers)].filter(problem => problem !== undefined)
  // No image provider the package ships judges minors in an image.
  const minors = checksImages(rootDir) ? ` ${MINORS_NOTE}` : ''
  if (problems.length === 0) return finding(id, 'pass', `The backend names ${listed(providers.map(provider => provider.id))}${knownAbuse ? ', a known-abuse match first' : ''}.${minors}`)
  return finding(id, 'warn', `${problems.map(problem => problem.message).join(' ')}${minors}`, problems.map(problem => problem.fix).join(' '))
}

/** Where new abuse material in an image is caught, when no image provider judges minors: the classifier, or `sexual`. */
const MINORS_NOTE = 'No image provider judges minors in an image: child sexual abuse material no hash list knows is caught as `S4` by a classifier that reads images (Llama Guard 4), and otherwise only as `sexual`, which `block` covers.'

/** What one check of the moderation providers found wrong, and its fix. */
interface ProviderProblem { message: string, fix: string }

/** The keys the moderation providers read on the deployment. */
const MODERATION_KEYS = new Set<string>(['CONTENT_SAFETY_ENDPOINT', 'CONTENT_SAFETY_KEY', 'SECOND_OPINION_KEY', 'KNOWN_ABUSE_KEY'])

/** Whether `name` is a key a moderation provider reads. */
function isModerationKey(name: string): boolean {
  return MODERATION_KEYS.has(name)
}

/**
 * A moderation provider's key, once the backend names a provider that reads
 * it: without it, the provider refuses every check, and the content it would
 * check is refused as unchecked.
 */
function moderationKeyFinding(name: string, providers: readonly NamedModerationProvider[], deployed: readonly string[], { prod }: { prod: boolean }): PreflightFinding {
  const id = deploymentEnvId(name)
  const readers = providers.filter(provider => provider.env.includes(name)).map(provider => provider.id)
  if (readers.length === 0) return finding(id, 'pass', `${name} is not needed: no backend file names a moderation provider that reads it.`)
  if (deployed.includes(name)) return finding(id, 'pass', `${name} is set on the deployment: ${listed(readers)} can check content.`)
  return finding(
    id,
    'warn',
    `The backend names ${listed(readers)}, but ${name} is not set on the deployment: every check it is asked for is refused, and the content is refused as unchecked.`,
    `Add ${name} to .env.local and run \`npx nuxt-backend env push${prod ? ' --prod' : ''}\`.`,
  )
}

/** Image checks with no known-abuse match before them. */
function unmatchedImages(rootDir: string, knownAbuse: boolean): ProviderProblem | undefined {
  if (knownAbuse || !checksImages(rootDir)) return undefined
  return { message: 'The backend checks images with no known-abuse match: no hash list stands between an upload of known child sexual abuse material and the other providers.', fix: 'Add `knownAbuse: arachnidShield()` to setupAi({ moderation }) (free once your organization is vetted).' }
}

/** An Azure resource outside the EU, where the app pins its processing to the EU. */
function regionOutsideEu(rootDir: string, providers: readonly NamedModerationProvider[]): ProviderProblem | undefined {
  const azure = providers.find(provider => provider.id === 'azure-content-safety')
  if (pinnedRegion(rootDir) !== 'eu' || azure === undefined || EU_AZURE_REGIONS.has(azure.region ?? '')) return undefined
  const named = azure.region ? `'${azure.region}'` : 'no region'
  return { message: `The backend pins its model calls to the EU, but azureContentSafety() names ${named}, which is no EU region: images it checks are processed outside the EU.`, fix: 'Create the Content Safety resource in an EU region, such as francecentral, and name it in azureContentSafety({ region }).' }
}

/** Which gateway answers first, in an order, on what doctor knows of the deployment: `undefined` when neither can. */
function answeringGateway(order: readonly NamedGateway[], { keyed, convex }: { keyed: boolean, convex: boolean }): NamedGateway | undefined {
  return order.find(gateway => gateway === 'vercel' ? keyed : convex)
}

/**
 * Whether the backend's image checks can run: the default classifier
 * follows the gateway that answers, and the Vercel AI Gateway serves none
 * that reads images (gpt-oss-safeguard reads text only), so a check with
 * images there is refused as unchecked. A classifier the app names is its
 * own call; a backend that checks no images needs nothing.
 */
function moderationImagesFinding(rootDir: string, deployed: readonly string[], { cloud, linked, prod }: { cloud: boolean, linked: boolean, prod: boolean }): PreflightFinding {
  const id = 'ai-moderation-images'
  if (!checksImages(rootDir)) return finding(id, 'pass', 'No backend file checks images with the safety classifier.')
  if (namesModerationModel(rootDir)) return finding(id, 'pass', 'The backend checks images with the classifier it names in setupAi({ moderation: { model } }).')
  const order = chosenGateways(rootDir)
  const routes = chosenRoutes(rootDir)
  if (order === 'unread' || routes === 'unread') return finding(id, 'pass', `${GATEWAY_ORDER_UNREAD}, so which classifier checks the backend's images is not known.`)
  const pinned = pinnedRegion(rootDir) !== undefined
  const convex = (cloud || linked || prod) && convexGatewayProviderInstalled(rootDir)
  // A route for the default classifier's id goes before setupAi({ gateway })'s order.
  const routed = routes ? routeKeyFor(DEFAULT_MODERATION_MODEL, routes) : undefined
  const classifierOrder = routed === undefined ? order ?? ['convex', 'vercel'] : routes![routed]!
  const answers = pinned ? 'vercel' : answeringGateway(classifierOrder, { keyed: deployed.includes('AI_GATEWAY_API_KEY'), convex })
  if (answers !== 'vercel') return finding(id, 'pass', 'The backend checks images with Llama Guard 4, through the Convex AI Gateway, which reads them.')
  return finding(
    id,
    'warn',
    `The backend checks images, but its default safety classifier goes through the Vercel AI Gateway here${pinned ? ' (inference is pinned to a region)' : ''}, which serves none that reads images: openai/gpt-oss-safeguard-20b reads text only, so every check with images is refused as unchecked.`,
    'Route moderation through the Convex AI Gateway (a paid Convex plan, @convex-dev/ai-sdk-provider installed, and \'convex\' first in setupAi({ gateway })), or name a classifier that reads images in setupAi({ moderation: { model } }).',
  )
}

/**
 * Whether a new preview deployment starts with the required env: `convex
 * deploy` creates a preview and pushes to it in one run, and the push fails
 * unless the project's preview env defaults hold AUTH_SECRET and SITE_URL or
 * the build's `--cmd` sets them in between. No finding when the defaults
 * cannot be read (a deployment with no cloud project behind it).
 */
async function envDefaultsFindings(rootDir: string): Promise<PreflightFinding[]> {
  const names = await projectEnvDefaultNames(rootDir, 'preview')
  if (!names) return []
  const missing = REQUIRED_DEPLOYMENT_ENV.filter(name => !names.includes(name))
  return [missing.length === 0
    ? finding('env-defaults', 'pass', 'New preview deployments start with AUTH_SECRET and SITE_URL (project env defaults).')
    : finding(
        'env-defaults',
        'warn',
        `New preview deployments start without ${missing.join(' and ')}: unless the build sets them (\`nuxt-backend env push --preview\` in \`convex deploy --cmd\`), their first push fails.`,
        'Run: npx nuxt-backend env push --defaults preview --site-url <the origin new previews start with>',
      )]
}

/** Whether the app's `backend/email.ts` re-exports `name`: `submitContactMessage` makes it a contact form, `getSandboxInbox` publishes the dev inbox. */
function reExportsName(rootDir: string, name: string): boolean {
  const file = join(rootDir, 'backend', 'email.ts')
  try {
    return existsSync(file) && readFileSync(file, 'utf8').includes(name)
  }
  catch {
    return false
  }
}

/**
 * What the bot protection checks read. Under --prod, .env.local holds dev's
 * values: only the process env (a `vercel env pull`, CI) speaks for
 * production's app, and .env.local is what it must not share. A Vercel
 * link (or a run on Vercel) says the app's server signs proofs.
 */
function protectionInput(rootDir: string, { prod, deployed, env, local, siteUrl }: { prod: boolean, deployed: string[] | null, env: Record<string, string | undefined>, local: boolean, siteUrl: string | undefined }): ProtectionDoctorInput {
  return {
    env: prod ? process.env : env,
    ...(prod ? { devEnv: readEnvFiles(rootDir) } : {}),
    deployed,
    prod,
    local,
    vercel: process.env.VERCEL === '1' || existsSync(join(rootDir, '.vercel', 'project.json')),
    waitlist: existsSync(join(rootDir, 'backend', 'waitlist.ts')),
    contact: reExportsName(rootDir, 'submitContactMessage'),
    ...(siteUrl ? { siteUrl } : {}),
  }
}

/**
 * Under --prod, the live site at production's SITE_URL, probed the way a
 * visitor, an agent or an uptime check reaches it (src/cli/probes.ts),
 * once production's posture says where it is. Without an https site to
 * probe, nothing is asked, and a run whose own findings do not say why
 * (`doctor --only auth`, say) gets one warning on its first probe, so a
 * scoped run never looks clean.
 */
async function liveSiteFindings(posture: Promise<ProductionPosture | null>, { appConfig, deploymentUrl, wants }: { appConfig: () => Promise<AppConfig | null>, deploymentUrl: string | null, wants: (group: FindingGroup) => boolean }): Promise<PreflightFinding[]> {
  const read = await posture
  const origin = read ? probedOrigin(read) : null
  if (!origin) {
    // What says why otherwise: auth's site-url-origin or deployment-site-url,
    // or deployment-env when production's names could not be read.
    const explained = read ? wants('auth') : wants('deployment')
    const reason = explained ? null : unprobedReason(read)
    return reason ? unprobedSiteFindings(reason.why, reason.fixHint, wants) : []
  }
  const config = await appConfig()
  const paths = backendPathsOf(config ? pathsSourceOf(config) : undefined)
  return siteProbeFindings({
    origin,
    backendUrl: deploymentUrl,
    gatedPath: paths.settings,
    loginPath: paths.login,
    authRoute: paths.authRoute,
    llms: servesAgentDocs(config),
    wants,
  })
}

/**
 * Deployment-reachable reads that need the convex CLI; each degrades to
 * null (and its checks to no finding) when the deployment is unreachable.
 * A read only happens when a wanted check needs it. Under --prod, the live
 * site is probed beside the rest, once `posture` says where it is.
 */
async function deployedSurfaceFindings(rootDir: string, { prod, deployed, env, local, siteUrl, wants, posture, appConfig }: { prod: boolean, deployed: string[] | null, env: Record<string, string | undefined>, local: boolean, siteUrl: string | undefined, wants: (group: FindingGroup) => boolean, posture: Promise<ProductionPosture | null>, appConfig: () => Promise<AppConfig | null> }): Promise<PreflightFinding[]> {
  const reachable = deployed !== null
  const probes = wants('billing') || wants('email') || wants('ai')
  const { identifiers, authConfig, probeSiteUrl, deploymentUrl } = await readSurface(rootDir, { prod, reachable, siteUrl, wants, probes })
  // Webhook routes must actually be mounted — a missing route silently
  // drops billing/email events. The site URL is derivable from the
  // deployment slug, so this probe usually needs no configuration at all.
  // The probes and the page-path cross-checks (which load nuxt.config, and
  // report nothing when it is unreadable) run side by side.
  // Bot protection: the deployment's names, the keys visible here, and a
  // proof signed with the secret here, which the deployment takes or not.
  const [routes, pages, protection, site, admins, email, billing] = await Promise.all([
    probes && probeSiteUrl
      ? webhookRouteFindings(probeSiteUrl, { ai: identifiers ? [...identifiers].some(id => id.startsWith('ai:')) : true, wants, prod })
      : [],
    authConfig ? pagePathFindings(appConfig, authConfig) : [],
    wants('protection') ? protectionFindings(protectionInput(rootDir, { prod, deployed, env, local, siteUrl: probeSiteUrl })) : [],
    prod ? liveSiteFindings(posture, { appConfig, deploymentUrl, wants }) : [],
    // The first administrator, read off the deployment's auth tables.
    reachable && wants('auth') ? deploymentHasAdmin(rootDir, { prod }).then(hasAdmin => adminBootstrapFindings(hasAdmin, { prod })) : [],
    // The topics, the webhook's events and the key's reach, as the deployment's own email sync reads them (a dry run).
    emailSetupFindings(rootDir, { prod, reachable: reachable && wants('email'), identifiers }),
    wants('billing') ? billingProviderFindings(rootDir, env, { prod, reachable, siteUrl: probeSiteUrl }) : [],
  ])
  return [
    ...routes,
    ...billing,
    ...protection,
    // The composable function contract.
    ...identifiers && wants('scaffold') ? functionContractFindings(identifiers) : [],
    ...pages,
    ...admins,
    ...email,
    ...site,
  ]
}

/** What the surface checks read off the deployment: only what a wanted capability checks. */
function readSurface(rootDir: string, { prod, reachable, siteUrl, wants, probes }: { prod: boolean, reachable: boolean, siteUrl: string | undefined, wants: (group: FindingGroup) => boolean, probes: boolean }) {
  return readDeployment(rootDir, {
    prod,
    reachable,
    localSiteUrl: siteUrl,
    // The function spec names the deployed functions (the contract, and
    // whether `ai` is deployed) and, under --prod, the site to probe and
    // the deployment the live site must talk to.
    spec: wants('scaffold') || probes || (prod && (wants('protection') || wants('site'))),
    // The auth config reports the paths the deployment uses; read only when
    // auth, whose check it feeds, is wanted.
    authConfig: wants('auth'),
  })
}

/** Where production bills, as its posture read it: the provider's production only on `production`, its sandbox for every other kind. */
function productionBillsIn({ environment }: ProductionPosture): 'sandbox' | 'production' | 'unset' | 'unread' {
  return environment === 'unset' || environment === 'unread' ? environment : billingEnvironment(environment)
}

/**
 * Under --prod, what production's posture says beyond the presence of its
 * names: its site's origin, its own email facts, and whether the catalog
 * can sell there. The environment and the sender report through their
 * deployment findings ({@link deploymentEnvFindings}).
 */
async function productionPostureFindings(rootDir: string, posture: ProductionPosture | null, wants: (group: FindingGroup) => boolean): Promise<PreflightFinding[]> {
  if (!posture) return []
  return [
    ...wants('auth') ? siteOriginFinding(posture) : [],
    ...wants('email') ? emailPostureFindings(posture) : [],
    ...wants('billing') ? await productionCatalogFindings(rootDir, productionBillsIn(posture)) : [],
    ...wants('ai') ? aiSpendLimitFinding(rootDir, posture) : [],
  ]
}

/**
 * A sandbox production, a public demo anyone may sign up to, refuses every
 * model call (`not_ready`, reason `no_budget`) until `setupAi` names a
 * `spendLimit`. No finding off a sandbox, or for a backend with no AI.
 */
function aiSpendLimitFinding(rootDir: string, posture: ProductionPosture): PreflightFinding[] {
  if (posture.environment !== 'sandbox') return []
  const { setupAi, spendLimit } = aiFeatures(rootDir)
  if (!setupAi) return []
  if (spendLimit) return [finding('ai-spend-limit', 'pass', 'Production is a sandbox, and setupAi sets a daily spendLimit: AI pauses itself once a day costs that much.')]
  return [finding(
    'ai-spend-limit',
    'warn',
    'Production is a sandbox (BACKEND_ENVIRONMENT=sandbox), and setupAi sets no spendLimit: every metered call, stream, job and chat reply is refused (not_ready, reason no_budget).',
    'Pass `spendLimit: { usdPerDay }` to setupAi in backend/ai.ts: once a UTC day costs that much, pause_ai turns on until the day ends.',
  )]
}

/** The scaffold's own checks, on local files only: the generated files, the dev script, the mounts and routes, the agent files and name collisions. */
async function scaffoldFindings(rootDir: string, appConfig: () => Promise<AppConfig | null>): Promise<PreflightFinding[]> {
  return [
    ...await generatedFileFindings(rootDir, appConfig),
    ...devScriptFinding(rootDir),
    await convexConfigFinding(rootDir),
    agentFilesFinding(rootDir, installedVersion(rootDir)),
    nameCollisionFinding(rootDir),
    ...bundleDuplicatesFindings(rootDir),
  ]
}

/** The capabilities' checks that read local files and env names, each when its capability is wanted. */
async function localFeatureFindings(rootDir: string, { env, wants, deployed, prod, appConfig }: { env: Record<string, string | undefined>, wants: (group: FindingGroup) => boolean, deployed: string[] | null, prod: boolean, appConfig: () => Promise<AppConfig | null> }): Promise<PreflightFinding[]> {
  return [
    ...wants('billing') ? providerSdkFindings(rootDir) : [],
    ...wants('monitoring') ? monitoringFindings(rootDir, { env, deployed, prod }) : [],
    ...declaredFeatureFindings(rootDir, { wants, deployed, prod }),
    // Production's own usage warnings: Convex emails the team; the deployment cannot read its usage itself.
    ...wants('monitoring') && prod ? [usageAlertsFinding(await readUsageLimits(rootDir), { convexGateway: convexGatewayProviderInstalled(rootDir) && (namesConvex(chosenGateways(rootDir)) || routesNameConvex(chosenRoutes(rootDir))) })] : [],
    ...wants('auth') ? await consentFindings(rootDir, { prod }) : [],
    // The installable app iPhone and iPad take web push from: the brand and the two icons.
    ...await installableFindings(rootDir, appConfig, { wanted: wants('notifications'), pushKeys: Boolean(env.PUSH_PUBLIC_KEY) || (deployed ?? []).includes('PUSH_PUBLIC_KEY') }),
  ]
}

/**
 * Run the doctor checks against the project in `rootDir` and its deployment
 * (production with `prod`), returning the findings with production posture
 * applied. `only` limits the run to those app capabilities. `deployedNames` is the
 * deployment's env names when the caller has just listed them — `doctor --fix`
 * after its push; `null` when that listing failed — so they are not listed
 * twice. `posture` is production's posture when the caller reads it too
 * (`status --prod`, for its switches), so it is read once.
 */
export async function runDoctorChecks(rootDir: string, { prod, only, deployedNames, posture: given }: { prod: boolean, only?: readonly CapabilityName[], deployedNames?: string[] | null, posture?: Promise<ProductionPosture | null> }): Promise<PreflightFinding[]> {
  const wantsCapability = (capability: CapabilityName) => !only || only.length === 0 || only.includes(capability)
  // A check is tagged with its finding group; the group's capability decides.
  const wants = (group: FindingGroup) => wantsCapability(capabilityOfGroup(group))
  const env = { ...readEnvFiles(rootDir), ...process.env } as Record<string, string | undefined>
  // nuxt.config, loaded once for every check that reads it.
  const appConfig = appConfigLoader(rootDir)

  const siteUrl = resolveSiteUrl({ env, derived: deriveDeploymentUrls(rootDir, env) })
  const [{ deployed, surface, posture }, catalog, metrics] = await Promise.all([
    (async () => {
      // The deployment's env names (never values) first, so a variable set
      // there but not visible here counts as set instead of warning next to
      // the deployment-side finding that says it is.
      const names = deployedNames !== undefined ? deployedNames : await deploymentEnvNames(rootDir, { prod })
      // Under --prod, the values production's names alone cannot say: read
      // beside the surface reads, which probe the site it names.
      const posture = given ?? (prod && names ? readProductionPosture(rootDir, names, wants) : Promise.resolve(null))
      // Preview defaults are the project's, read with the dev deployment's
      // login: not part of a production check.
      const [surface, defaults, read] = await Promise.all([
        deployedSurfaceFindings(rootDir, { prod, deployed: names, env, local: !prod && isLocalDeploymentId(configuredDeployment(rootDir)), siteUrl, wants, posture, appConfig }),
        names !== null && !prod && wants('deployment') ? envDefaultsFindings(rootDir) : [],
        posture,
      ])
      return { deployed: names, surface: [...surface, ...defaults, ...await productionPostureFindings(rootDir, read, wants)], posture: read }
    })(),
    // Billing catalog cross-checks: what backend/billing.catalog.ts declares
    // against the organization's own subscription + portal settings. Every
    // half degrades on its own — no catalog file, no findings; no readable
    // provider, only the catalog-only checks (see collectBillingFindings).
    // Local files and the provider only, so they run beside the deployment
    // reads.
    wants('billing') ? billingCatalogFindings(rootDir, env) : [],
    // The funnel's activation kind, recorded by a backend file; then the
    // Revenue view's metrics read, with the token visible here (analytics).
    wants('analytics') ? Promise.resolve(activationFindings(rootDir)) : [],
    wants('analytics') ? metricsAccessFindings({ accessToken: env.BILLING_ACCESS_TOKEN, environment: billingEnvironment(parseBackendEnvironment(env.BACKEND_ENVIRONMENT)) }) : [],
  ])
  const findings: PreflightFinding[] = [
    ...collectPreflightFindings({
      env,
      siteUrlConfigured: Boolean(siteUrl),
      ...(deployed ? { deployedNames: new Set(deployed) } : {}),
    }),
    ...wants('scaffold') ? await scaffoldFindings(rootDir, appConfig) : [],
    // Under --prod the deployment is production's, whatever .env.local names.
    ...deploymentEnvFindings(rootDir, deployed, { prod, ...deploymentRoute(computeDeployment(rootDir, env).kind, prod), posture }),
    ...await localFeatureFindings(rootDir, { env, wants, deployed, prod, appConfig }),
    ...surface,
    ...catalog,
    ...metrics,
  ].filter(reported => wantsCapability(reported.capability))
  // With production's own value read, `BACKEND_ENVIRONMENT` has settled its status: a `sandbox` warns on purpose.
  return prod ? applyProductionPosture(findings, posture ? new Set(['deployment-backend-environment']) : undefined) : findings
}
