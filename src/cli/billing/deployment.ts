import { siteFromCloudUrl } from '../../convex/urls'
import { billingEnvironment } from '../../convex/environment'
import { deploymentBackendEnvironment, deploymentEnvNames, deploymentFunctionSpec } from '../../env-push'
import { isHttpUrl } from '../../preflight'
import type { Environment } from './provider'

// Where `billing sync` writes: the deployment the Convex CLI acts on, read
// before anything is written; the webhook endpoint that belongs to it; and
// whether it can load the products the sync pushed.

/** What `billing sync` reads from the deployment it writes, before writing anything. */
export interface SyncDeployment {
  /**
   * The client URL of the deployment `convex env set` and `convex run` act
   * on, as `convex function-spec` reports it with the same flags and env —
   * a deploy key in effect included. Null when it could not be read.
   */
  url: string | null
  /** Its env names (never values); null when they could not be read. */
  envNames: string[] | null
  /**
   * The billing environment it runs in: `production` when its
   * `BACKEND_ENVIRONMENT` says so, `sandbox` for any other kind and when
   * unset (the backend's default), null when unknown. The one value billing
   * sync reads — the kind of deployment, never a secret — and only when the
   * name is set.
   */
  billingEnvironment: Environment | null
}

/** Read {@link SyncDeployment}: the function spec and the env names side by side. */
export async function readSyncDeployment(rootDir: string, prod: boolean): Promise<SyncDeployment> {
  const [spec, envNames] = await Promise.all([
    deploymentFunctionSpec(rootDir, { prod }),
    deploymentEnvNames(rootDir, { prod }),
  ])
  return {
    url: spec?.url ?? null,
    envNames,
    billingEnvironment: envNames === null ? null : await deployedBillingEnvironment(rootDir, prod, envNames),
  }
}

async function deployedBillingEnvironment(rootDir: string, prod: boolean, envNames: string[]): Promise<Environment | null> {
  if (!envNames.includes('BACKEND_ENVIRONMENT')) return 'sandbox'
  const environment = await deploymentBackendEnvironment(rootDir, { prod })
  // A value that is none of the four kinds is read as unset by the backend: the sandbox.
  return environment === null ? null : billingEnvironment(environment)
}

const CLOUD_URL = /^https:\/\/([a-z0-9-]+)\.convex\.cloud\/?$/
const CLOUD_SITE_URL = /^https:\/\/([a-z0-9-]+)\.convex\.site(?:[/?#]|$)/

/**
 * How output names the deployment written: `deployment happy-otter-123` for
 * a cloud one, its URL otherwise.
 */
export function deploymentLabel(url: string | null, prod: boolean): string {
  const kind = prod ? 'production deployment' : 'deployment'
  if (!url) return `the ${kind}`
  const slug = CLOUD_URL.exec(url)?.[1]
  return slug ? `${kind} ${slug}` : `the ${kind} at ${url}`
}

/** Whether the provider could never deliver to `url`: it is on this machine. */
function isLoopback(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '[::1]' || hostname === '0.0.0.0' || /^127\./.test(hostname)
  }
  catch {
    return false
  }
}

/**
 * What becomes of the webhook: an endpoint to provision at `url` (the
 * deployment holds a secret already when `secretSet`), a step left out this
 * run for the reason given, or a refusal before anything is written.
 */
export type WebhookPlan
  = | { url: string, secretSet: boolean }
    | { skip: string }
    | { refusal: string }

/**
 * The webhook endpoint `billing sync` provisions, or why it does not:
 * `--webhook <url>` as given, nothing for `--webhook off`, else
 * `<site>/billing/events` of the deployment its secret is stored on — an
 * explicit site URL first (a custom domain, a tunnel), then the one that
 * deployment's own client URL maps to. Under production the explicit site
 * comes from the process env only: `.env.local`'s URLs are the dev
 * deployment's.
 *
 * Without what it needs — the deployment, a site URL the provider can reach,
 * the deployment's env names — a sandbox sync leaves the webhook alone and
 * says why; a production sync stops, since production without its webhook
 * misses every billing event. An endpoint on one deployment whose secret
 * would land on another is refused either way.
 */
export function planWebhook(option: string | undefined, { prod, deployment, env }: { prod: boolean, deployment: SyncDeployment, env: Record<string, string | undefined> }): WebhookPlan {
  if (option === 'off') return { skip: 'Webhook left alone (--webhook off).' }
  if (option && !isHttpUrl(option)) return { refusal: '--webhook takes an http(s) URL, or off.' }
  const flag = prod ? ' --prod' : ''
  const unavailable = ({ reason, remedy }: Unavailable): WebhookPlan => prod
    ? { refusal: `--env production refused: ${reason} ${remedy}, or pass --webhook off to leave the webhook alone.` }
    : { skip: `Webhook skipped: ${reason} ${remedy}.` }

  const target = option ? { url: option } : derivedWebhookUrl(deployment, env, flag)
  if (!('url' in target)) return unavailable(target)
  const mismatch = deploymentMismatch(target.url, deployment.url, flag)
  if (mismatch) return { refusal: mismatch }
  if (deployment.envNames === null) {
    return unavailable({
      reason: `the deployment's env could not be read (\`npx convex env list${flag}\` failed), so where the endpoint's secret goes could not be checked.`,
      remedy: 'Make the deployment reachable and run billing sync again',
    })
  }
  return { url: target.url, secretSet: deployment.envNames.includes('BILLING_WEBHOOK_SECRET') }
}

/** Why no endpoint URL can be had, and what to do instead. */
interface Unavailable {
  reason: string
  remedy: string
}

/**
 * `<site>/billing/events`: an explicit site URL, else the deployment's own
 * `.convex.site` origin — one the provider can deliver to, which nothing on
 * this machine is.
 */
function derivedWebhookUrl(deployment: SyncDeployment, env: Record<string, string | undefined>, flag: string): { url: string } | Unavailable {
  const passUrl = 'Pass --webhook <url>'
  const tunnel = `${passUrl} — a public tunnel to it`
  const site = env.NUXT_PUBLIC_CONVEX_SITE_URL || (deployment.url ? siteFromCloudUrl(deployment.url) : null)
  if (site) {
    const url = `${site.replace(/\/+$/, '')}/billing/events`
    return isLoopback(url) ? { reason: `the site URL is on this machine (${site}), where the provider cannot deliver.`, remedy: tunnel } : { url }
  }
  if (!deployment.url) return { reason: `the deployment could not be read (\`npx convex function-spec${flag}\` failed), so its site URL is unknown.`, remedy: passUrl }
  if (isLoopback(deployment.url)) return { reason: `the deployment runs on this machine (${deployment.url}), where the provider cannot deliver.`, remedy: tunnel }
  return { reason: `no site URL derives from the deployment's own (${deployment.url}).`, remedy: 'Set NUXT_PUBLIC_CONVEX_SITE_URL, or pass --webhook <url>' }
}

/**
 * A `.convex.site` endpoint belongs to one deployment, so its secret has to
 * be stored on that one: the refusal when it would go to another.
 */
function deploymentMismatch(url: string, deploymentUrl: string | null, flag: string): string | null {
  const endpointSlug = CLOUD_SITE_URL.exec(url)?.[1]
  const deploymentSlug = deploymentUrl ? CLOUD_URL.exec(deploymentUrl)?.[1] : undefined
  if (!endpointSlug || !deploymentSlug || endpointSlug === deploymentSlug) return null
  return `The webhook URL ${url} is deployment ${endpointSlug}'s, but its secret would be stored on ${deploymentSlug}, the deployment \`convex env set${flag}\` writes. Pass --webhook with ${deploymentSlug}'s URL, or correct the site URL in the env.`
}

/**
 * Why the deployment cannot load the products this sync pushed, and what to
 * run instead — or null when it can. It reads them with its own access
 * token, from its own billing environment; an environment that differs from
 * the sync's would load the other catalog.
 */
export function productsRefreshBlocker(deployment: SyncDeployment, environment: Environment, prod: boolean): string | null {
  const flag = prod ? ' --prod' : ''
  const refresh = `\`npx convex run${flag} billing:syncProducts\``
  const where = deploymentLabel(deployment.url, prod)
  if (deployment.envNames === null) return `the deployment's env could not be read. Once it is reachable, run ${refresh}.`
  if (!deployment.envNames.includes('BILLING_ACCESS_TOKEN')) {
    return prod
      ? `${where} has no BILLING_ACCESS_TOKEN, so it cannot read the products. Set the production organization token there (\`npx convex env set --prod BILLING_ACCESS_TOKEN\` asks for it), then run ${refresh}.`
      : `${where} has no BILLING_ACCESS_TOKEN yet, so it cannot read the products. Forward it from .env.local with \`npx nuxt-backend env push\`, then run ${refresh}.`
  }
  if (deployment.billingEnvironment !== null && deployment.billingEnvironment !== environment) {
    const why = deployment.envNames.includes('BACKEND_ENVIRONMENT') ? 'BACKEND_ENVIRONMENT says so' : 'BACKEND_ENVIRONMENT is unset'
    const fix = environment === 'production' ? `Run \`npx convex env set${flag} BACKEND_ENVIRONMENT production\`` : `Set BACKEND_ENVIRONMENT to development, preview or sandbox (\`npx convex env set${flag} BACKEND_ENVIRONMENT sandbox\`)`
    return `${where} runs the ${deployment.billingEnvironment} billing environment (${why}), not ${environment}, so it would load the other catalog. ${fix}, then ${refresh}.`
  }
  return null
}
