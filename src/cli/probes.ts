import { HEALTH_ROUTE } from '../convex/constants'
import { finding, type FindingGroup, type FindingId, type PreflightFinding } from '../findings'

// doctor --prod's live half: anonymous requests to production's own site,
// the origin its SITE_URL names, the way a visitor, an agent or an uptime
// check makes them. Each sends nothing a visitor could not and reads only
// the answer's status, headers and public body: HTTPS with HSTS, the
// security headers' content security policy and the backend it lets the
// browser reach, a gated page sending an anonymous visitor to sign in, the
// health endpoint's public shape, and the docs for agents where the app
// serves them.

/** What the probes need to know of the app. */
export interface SiteProbeInput {
  /** The https origin production's SITE_URL names (a plain HTTP one is `site-url-origin`'s, and never probed). */
  origin: string
  /** Production's deployment URL (`https://<slug>.convex.cloud`); `null` when unknown. */
  backendUrl: string | null
  /** A page behind the sign-in gate, and the sign-in page it sends visitors to. */
  gatedPath: string
  loginPath: string
  /** The same-origin auth proxy's route (`backend.authRoute`), `/api/auth` by default. */
  authRoute: string
  /** The app declares docs for agents (`llms.txt`), so it should serve them. */
  llms: boolean
  /** Whether a finding group is checked (`doctor --only`). */
  wants: (group: FindingGroup) => boolean
}

/** How long one probe waits for an answer. */
const PROBE_TIMEOUT_MS = 8000

/** The least HSTS lifetime that counts, in seconds: a day. */
export const HSTS_MIN_AGE = 86_400

/** One anonymous request to the site; `null` when nothing answered. */
async function probe(url: string, init: RequestInit = {}, fetcher: typeof fetch = fetch): Promise<Response | null> {
  try {
    // fallow-ignore-next-line security-sink -- the doctor probes production's own site, the origin its SITE_URL names, with anonymous requests; verified 2026-10-19
    return await fetcher(url, { redirect: 'manual', ...init, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
  }
  catch {
    return null
  }
}

/** A response's body as text; empty when it has none. */
async function textOf(response: Response): Promise<string> {
  return response.text().catch(() => '')
}

/** A response's body as a JSON object; `null` when it is not one. */
async function jsonOf(response: Response): Promise<Record<string, unknown> | null> {
  const body: unknown = await response.json().catch(() => null)
  return typeof body === 'object' && body !== null && !Array.isArray(body) ? body as Record<string, unknown> : null
}

// --- HTTPS and HSTS ----------------------------------------------------------

/** The `max-age` of an HSTS header, in seconds; `null` without one. */
export function hstsMaxAge(header: string | null): number | null {
  const match = header ? /max-age\s*=\s*"?(\d+)"?/i.exec(header) : null
  return match ? Number(match[1]) : null
}

/** The site over HTTPS, keeping browsers on it with HSTS, at the origin SITE_URL names. */
function httpsFinding(origin: string, root: Response): PreflightFinding {
  const landed = root.url ? new URL(root.url).origin : origin
  if (landed.startsWith('http:')) {
    return finding('site-https', 'fail', `${landed === origin ? `${origin} is served` : `${origin} redirects to ${landed}`} over plain HTTP: sessions and sign-in codes cross the network in the clear.`, `Serve the app over HTTPS at ${origin}, and drop any redirect to plain HTTP (the app host's or a proxy's).`)
  }
  if (landed !== origin) return finding('site-https', 'warn', `${origin} redirects to ${landed}: the browser lands on an origin auth does not trust, and passkeys and sessions belong to the other.`, `Set SITE_URL to the origin that serves the app (${landed}), or serve it at ${origin}.`)
  if (root.status >= 500) return finding('site-https', 'warn', `${origin} answered ${root.status}.`, 'Check the app host\'s logs.')
  const age = hstsMaxAge(root.headers.get('strict-transport-security'))
  if (age === null) return finding('site-https', 'warn', `${origin} answers over HTTPS without HSTS (Strict-Transport-Security): a browser may still try plain HTTP first.`, 'Keep the security headers on (nuxt-security, which the module registers): `security: false`, or a headers option of your own, turned them off.')
  if (age < HSTS_MIN_AGE) return finding('site-https', 'warn', `${origin} sends HSTS with a max-age of ${age} seconds: browsers forget it within a day.`, 'Give Strict-Transport-Security a max-age of months: the security headers\' default is 180 days.')
  return finding('site-https', 'pass', `${origin} answers over HTTPS with HSTS (max-age ${age} seconds).`)
}

// --- Content security policy -------------------------------------------------

/** A policy's directives by name, each with its sources. */
export function parseCsp(header: string): Map<string, string[]> {
  const directives = new Map<string, string[]>()
  for (const part of header.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/)
    if (name && !directives.has(name.toLowerCase())) directives.set(name.toLowerCase(), sources)
  }
  return directives
}

/** The schemes a scheme of a source also allows: http(s) to https, ws(s) to wss. */
const UPGRADES: Record<string, string[]> = { 'http:': ['http:', 'https:'], 'ws:': ['ws:', 'wss:'] }

/** Whether one source of a directive lets a connection to `target` through. */
function sourceAllows(source: string, target: URL, self: URL): boolean {
  const lower = source.toLowerCase()
  if (lower === '*') return ['http:', 'https:', 'ws:', 'wss:'].includes(target.protocol)
  if (lower === '\'self\'') return target.host === self.host
  if (/^[a-z][a-z0-9+.-]*:$/.test(lower)) return (UPGRADES[lower] ?? [lower]).includes(target.protocol)
  const match = /^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*\.)?([^/:]+)(?::(\d+|\*))?/.exec(lower)
  if (!match) return false
  const [, scheme, wildcard, host, port] = match
  if (scheme && !(UPGRADES[`${scheme}:`] ?? [`${scheme}:`]).includes(target.protocol)) return false
  const hostMatches = wildcard ? target.hostname.endsWith(`.${host}`) : target.hostname === host
  return hostMatches && (!port || port === '*' || port === target.port)
}

/**
 * The policies a `Content-Security-Policy` value holds: a response that
 * sends the header twice (the app's and the host's or a proxy's) reads as
 * one value joined by commas, and browsers enforce each policy.
 */
export function parseCspList(header: string): Array<Map<string, string[]>> {
  return header.split(',').map(parseCsp).filter(policy => policy.size > 0)
}

/** Whether a policy lets the browser connect to `target`: through `connect-src`, else `default-src`, else unrestricted. */
export function cspAllows(policy: Map<string, string[]>, target: string, self: string): boolean {
  const sources = policy.get('connect-src') ?? policy.get('default-src')
  if (!sources) return true
  const url = new URL(target)
  return sources.some(source => sourceAllows(source, url, new URL(self)))
}

/**
 * Whether every policy lets the browser reach `target`. A WebSocket counts
 * through its https (or http) twin too when `twins` is set: the WebSockets
 * standard checks the policy against the URL it fetches, so current browsers
 * let `wss://host` through an `https://host` source, though older engines
 * do not.
 */
function policiesAllow(policies: ReadonlyArray<Map<string, string[]>>, target: string, self: string, { twins = false } = {}): boolean {
  const fetched = twins ? target.replace(/^ws(s?):/, 'http$1:') : target
  return policies.every(policy => cspAllows(policy, target, self) || cspAllows(policy, fetched, self))
}

/** A deployment URL's WebSocket twin, the origin its realtime queries connect to. */
function socketOf(url: string): string {
  const parsed = new URL(url)
  return `${parsed.protocol === 'https:' ? 'wss:' : 'ws:'}//${parsed.host}`
}

/** Where a policy that blocks the deployment comes from: the module only ever adds the deployment to the `/**` rule's connect-src. */
const CSP_FIX = 'The module adds the deployment the page talks to (its runtime config) to connect-src of the security headers\' /** rule, so the gap comes from elsewhere: a policy the app host or a proxy adds (browsers enforce each one), a route rule more specific than /** that sets its own connect-src, or the module\'s policy turned off (contentSecurityPolicy: false) with one set elsewhere. Add the deployment\'s https:// and wss:// origins there.'

/** The policy lets the browser reach the backend the page talks to, and its WebSocket. */
function cspFinding(origin: string, root: Response, backend: string | null): PreflightFinding {
  const header = root.headers.get('content-security-policy')
  if (!header) return finding('site-csp', 'warn', `${origin} sends no content security policy: the security headers' policy is off.`, 'Keep nuxt-security on, with the Convex-aware policy the module adds (`security: false`, or `contentSecurityPolicy: false`, turns it off), or set one at the app host.')
  if (!backend) return finding('site-csp', 'pass', `${origin} sends a content security policy (the backend it must let through is unknown here).`)
  const policies = parseCspList(header)
  const targets = [new URL(backend).origin, socketOf(backend)]
  const blocked = targets.filter(target => !policiesAllow(policies, target, origin, { twins: true }))
  if (blocked.length > 0) {
    return finding('site-csp', 'fail', `${origin}'s content security policy does not let the browser reach ${blocked.join(' and ')} (connect-src): its queries and realtime updates are blocked.`, CSP_FIX)
  }
  const socket = targets[1]!
  if (!policiesAllow(policies, socket, origin)) {
    return finding('site-csp', 'warn', `${origin}'s content security policy lets ${socket} through only by its https origin: current browsers connect, some older engines block the realtime updates.`, `Name ${socket} in connect-src too, as the module's own policy does. ${CSP_FIX}`)
  }
  return finding('site-csp', 'pass', `${origin}'s content security policy lets the browser reach ${new URL(backend).origin} and its WebSocket.`)
}

// --- The backend the site talks to -------------------------------------------

/** The deployment URLs a page names (its inlined runtime config), as origins. */
export function deploymentOrigins(html: string): string[] {
  const unescaped = html.replace(/\\u002F/gi, '/').replace(/\\\//g, '/')
  // A deployment in a region other than the default carries it as a label: `https://<slug>.<region>.convex.cloud`.
  return [...new Set([...unescaped.matchAll(/https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.convex\.cloud/gi)].map(([origin]) => origin.toLowerCase()))]
}

/** The site's page talks to production's deployment, not dev's or another. */
function backendFinding(origin: string, html: string, backend: string): PreflightFinding {
  const expected = new URL(backend).origin
  const named = deploymentOrigins(html)
  if (named.includes(expected) || html.includes(expected)) return finding('site-backend-url', 'pass', `${origin} talks to production's deployment, ${expected}.`)
  if (named.length > 0) {
    return finding('site-backend-url', 'fail', `${origin} talks to ${named.join(', ')}, not production's deployment ${expected}: it was built (or its NUXT_PUBLIC_BACKEND_URL set) against another deployment.`, `Build the app against production: set NUXT_PUBLIC_BACKEND_URL in the app host's production env to ${expected}, or build with npx convex deploy --cmd 'npm run build' --cmd-url-env-var-name NUXT_PUBLIC_BACKEND_URL; then redeploy the app.`)
  }
  return finding('site-backend-url', 'warn', `${origin}'s page names no deployment URL doctor can read, so whether it talks to production's ${expected} is unknown (a custom domain for the deployment?).`, 'Open the site and check the deployment its requests go to.')
}

/** The site's own answers: HTTPS and HSTS, the policy, the backend its page names. */
async function rootFindings(input: SiteProbeInput, root: Response): Promise<PreflightFinding[]> {
  const html = input.wants('site') && input.backendUrl ? await textOf(root) : ''
  return input.wants('site')
    ? [
        httpsFinding(input.origin, root),
        cspFinding(input.origin, root, input.backendUrl ? backendOf(html, input.backendUrl) : null),
        ...input.backendUrl ? [backendFinding(input.origin, html, input.backendUrl)] : [],
      ]
    : []
}

/**
 * The backend the page talks to: production's, when the page names it; the
 * deployment it names instead, when it names another; `null` when it names
 * none (a custom domain for the deployment), so the policy is not checked
 * against a URL the browser never asks for.
 */
function backendOf(html: string, production: string): string | null {
  const expected = new URL(production).origin
  const named = deploymentOrigins(html)
  if (named.includes(expected) || html.includes(expected)) return production
  return named[0] ?? null
}

// --- A gated page --------------------------------------------------------------

/** Headers that say a response came out of a cache, or was rendered at build time. */
const CACHE_HEADERS: Array<[string, RegExp]> = [['x-vercel-cache', /^(?:hit|stale|prerender)$/i], ['cf-cache-status', /^hit$/i], ['x-nitro-prerender', /./], ['age', /^[1-9]/]]

/** An anonymous visit to a page behind the sign-in gate goes to sign in, never a page someone else's session rendered. */
async function gatedPageFinding(input: SiteProbeInput, fetcher: typeof fetch): Promise<PreflightFinding> {
  const url = `${input.origin}${input.gatedPath}`
  const response = await probe(url, { headers: { accept: 'text/html' } }, fetcher)
  if (!response) return finding('site-gated-page', 'warn', `${url} did not answer.`, 'Check the app host\'s logs.')
  const location = response.headers.get('location')
  if (response.status >= 300 && response.status < 400 && location) {
    let to: URL
    try {
      to = new URL(location, input.origin)
    }
    catch {
      return finding('site-gated-page', 'warn', `${input.gatedPath} redirects an anonymous visitor to a location no browser can read (${location}).`, 'Check the app host\'s and any proxy\'s redirects for that path.')
    }
    return to.origin === input.origin && to.pathname === input.loginPath
      ? finding('site-gated-page', 'pass', `${input.gatedPath} sends an anonymous visitor to sign in (${input.loginPath}).`)
      : finding('site-gated-page', 'warn', `${input.gatedPath} sends an anonymous visitor to ${to.href}, not the sign-in page ${input.loginPath}.`, 'Check the `auth` route middleware and `backend.pages.login` in nuxt.config.')
  }
  if (response.status === 200) {
    const cached = CACHE_HEADERS.find(([name, pattern]) => pattern.test(response.headers.get(name) ?? ''))
    return cached
      ? finding('site-gated-page', 'fail', `${input.gatedPath} answered an anonymous visitor 200 from a cache (${cached[0]}: ${response.headers.get(cached[0])}): a private page rendered once is served to everyone.`, 'Drop the swr, isr, cache or prerender route rule that reaches it; the module keeps private pages out of caches at their exact paths only.')
      : finding('site-gated-page', 'warn', `${input.gatedPath} answered an anonymous visitor 200, not a redirect to sign in: it renders only in the browser, or it is not behind the gate.`, 'Keep server rendering on for private pages, so the gate redirects before any of the page is sent.')
  }
  return finding('site-gated-page', 'warn', `${input.gatedPath} answered ${response.status}${response.status === 404 ? ': no page is mounted there' : ''}.`, 'Check `backend.pages` in nuxt.config, and the app host\'s logs.')
}

// --- The sign-in proxy -----------------------------------------------------------

/**
 * The same-origin auth proxy reaches the deployment: Better Auth's own
 * `GET <authRoute>/ok`, answered through it. The proxy forwards to the
 * deployment's HTTP routes origin, which the build bakes in from the backend
 * URL it knows; a build that knew none (the URL set only on the host, at
 * runtime) leaves it empty, and every sign-in request fails with a 500 until
 * the host also sets `NUXT_PUBLIC_CONVEX_SITE_URL`.
 */
async function authProxyFinding(input: SiteProbeInput, fetcher: typeof fetch): Promise<PreflightFinding> {
  const url = `${input.origin}${input.authRoute}/ok`
  const response = await probe(url, { headers: { accept: 'application/json' } }, fetcher)
  if (!response) return finding('site-auth-proxy', 'warn', `${url} did not answer.`, 'Check the app host\'s logs.')
  if (response.status === 200 && (await jsonOf(response))?.ok === true) {
    return finding('site-auth-proxy', 'pass', `${input.authRoute} reaches the deployment: ${url} answers ok.`)
  }
  if (response.status >= 500) {
    return finding('site-auth-proxy', 'fail', `${url} answered ${response.status}: the sign-in proxy cannot reach the deployment, so no one can sign in. A build that did not know the backend URL leaves the proxy without the deployment's HTTP routes origin.`, 'Set NUXT_PUBLIC_CONVEX_SITE_URL on the app\'s host to the deployment\'s https://<name>.convex.site URL (a custom domain in front of the HTTP routes goes there too), then redeploy; or set NUXT_PUBLIC_BACKEND_URL where the build runs, so the build derives it.')
  }
  return finding('site-auth-proxy', 'warn', `${url} answered ${response.status}${response.status === 404 ? ': no auth proxy is mounted there' : ''}.`, 'Check `backend.authRoute` in nuxt.config, and the app host\'s rewrites for that path.')
}

// --- The docs for agents ---------------------------------------------------------

/** The docs for agents, where the app serves them: `/llms.txt`, as text. */
async function docsFinding(input: SiteProbeInput, fetcher: typeof fetch): Promise<PreflightFinding[]> {
  const url = `${input.origin}/llms.txt`
  const response = await probe(url, { headers: { accept: 'text/plain, text/markdown' } }, fetcher)
  const type = response?.headers.get('content-type') ?? ''
  const served = response?.status === 200 && !type.includes('html') && (await textOf(response)).trimStart().startsWith('#')
  if (served) return [finding('agent-docs', 'pass', `${url} serves the docs for agents.`)]
  if (!input.llms) return []
  return [finding('agent-docs', 'warn', `The app declares docs for agents (llms), and ${url} answered ${response?.status ?? 'nothing'}${response?.status === 200 ? ' with no text document' : ''}.`, 'Check the llms options in nuxt.config, and that the build ran its module.')]
}

// --- The health endpoint ---------------------------------------------------------

/** The states a capability can be in, as the health endpoint names them. */
const STATES = new Set(['live', 'test', 'missing', 'failing'])

/** The health endpoint answers its coarse shape to anyone: the states, never the detail. */
async function healthFinding(input: SiteProbeInput, fetcher: typeof fetch): Promise<PreflightFinding> {
  const url = `${input.origin}${HEALTH_ROUTE}`
  const response = await probe(url, { headers: { accept: 'application/json' } }, fetcher)
  if (!response) return finding('monitoring-health', 'warn', `${url} did not answer.`, 'Check the app host\'s logs.')
  if (response.status === 404) return finding('monitoring-health', 'warn', `${url} is not served (404): an uptime check has nothing to ask.`, 'Check that the app was built with this package.')
  const body = response.status === 200 || response.status === 503 ? await jsonOf(response) : null
  const capabilities = body?.capabilities
  const shaped = body && ['ok', 'degraded', 'failing'].includes(body.status as string) && typeof capabilities === 'object' && capabilities !== null
    && Object.values(capabilities).every(state => STATES.has(state as string))
  if (!shaped) return finding('monitoring-health', 'warn', `${url} answered ${response.status} without the health's shape ({ status, capabilities }).`, 'A route of your own shadows it, or a proxy rewrote the answer.')
  if ('detail' in body) return finding('monitoring-health', 'fail', `${url} shows the capabilities' detail to an anonymous caller: their env names and findings.`, 'Production names itself development (BACKEND_ENVIRONMENT), which shows the detail to everyone: name it production with npx nuxt-backend env push --prod --force BACKEND_ENVIRONMENT (env push leaves a value already set unless forced).')
  const failing = Object.entries(capabilities as Record<string, string>).filter(([, state]) => state === 'failing').map(([name]) => name)
  if (body.status === 'failing') return finding('monitoring-health', 'warn', `${url} answers its public shape, and reports the app failing (${failing.join(', ') || 'the backend unreachable'}).`, 'npx nuxt-backend status --prod says why.')
  return finding('monitoring-health', 'pass', `${url} answers its public shape: ${body.status as string}, ${Object.keys(capabilities as object).length} capabilities, no detail.`)
}

// --- All of them ---------------------------------------------------------------------

/**
 * The first finding a wanted probe reports, in this order: a site that was
 * not probed at all is one warning, on the first of them the run checks.
 */
const PROBE_IDS: Array<[FindingGroup, FindingId]> = [['site', 'site-https'], ['auth', 'site-gated-page'], ['monitoring', 'monitoring-health']]

/**
 * The one warning of a live site that was not probed, on the first wanted
 * probe's finding; nothing when no probe is wanted. `why` is the reason,
 * a sentence that ends before `so the live site was not probed`.
 */
export function unprobedSiteFindings(why: string, fixHint: string, wants: (group: FindingGroup) => boolean): PreflightFinding[] {
  const first = PROBE_IDS.find(([group]) => wants(group))
  return first ? [finding(first[1], 'warn', `${why}, so the live site was not probed.`, fixHint)] : []
}

/**
 * Probe production's live site: its root first, then, side by side, the
 * pages and endpoints of every wanted group. A site that does not answer
 * at all is one warning, on the first wanted probe, and nothing else is
 * asked.
 */
export async function siteProbeFindings(input: SiteProbeInput, fetcher: typeof fetch = fetch): Promise<PreflightFinding[]> {
  if (!PROBE_IDS.some(([group]) => input.wants(group))) return []
  const root = await probe(`${input.origin}/`, { redirect: 'follow', headers: { accept: 'text/html' } }, fetcher)
  if (!root) return unprobedSiteFindings(`${input.origin} is unreachable`, 'Check that the app is deployed at the origin production\'s SITE_URL names, then run npx nuxt-backend doctor --prod again.', input.wants)
  const results = await Promise.all([
    rootFindings(input, root),
    input.wants('auth') ? gatedPageFinding(input, fetcher) : [],
    input.wants('auth') ? authProxyFinding(input, fetcher) : [],
    input.wants('site') ? docsFinding(input, fetcher) : [],
    input.wants('monitoring') ? healthFinding(input, fetcher) : [],
  ])
  return results.flat()
}
