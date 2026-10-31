// THE SITE'S EDGE RATE LIMITS: rules the maintainer creates in the Vercel
// Firewall, each matched by an id that server/middleware/0.firewall.ts
// checks with `@vercel/firewall` before the request reaches its handler.
// One place says which requests each rule counts and the budget its
// dashboard rule sets:
//
// - the middleware checks a rule only on Vercel, where the Firewall
//   answers; anywhere else (dev, CI, `nuxt preview`) it passes every
//   request on, and the per-IP limits in nuxt.config.ts stand alone;
// - /docs/ship/deploy/vercel and website/README.md give the dashboard
//   steps, from FIREWALL_RULES, and test/docs/site-vercel.test.ts holds
//   them to it.

import { ASSISTANT_API_PATH, ASSISTANT_RATE_LIMIT } from './assistant'
import { DOCS_MCP_PATH, DOCS_MCP_RATE_LIMIT, DOCS_MCP_ROUTE, isDocsMcpHost } from './docs-mcp'

/** A Firewall rule the site checks: its id, what it counts, and the budget its dashboard rule sets per IP. */
export interface FirewallRule {
  /** The rate limit id: the dashboard rule's `@vercel/firewall` condition names it. */
  id: string
  /** What the rule counts, in the docs' words. */
  counts: string
  /** Requests per window, per IP. */
  requests: number
  /** The window, in seconds (fixed window). */
  window: number
}

/**
 * The rules, by id. The assistant's budget is for people asking questions;
 * the docs MCP's matches the route's own per-IP budget, so the edge holds
 * it across every server instance.
 */
export const FIREWALL_RULES = {
  'docs-assistant': { id: 'docs-assistant', counts: `the docs assistant's chat endpoint, \`${ASSISTANT_API_PATH}\``, requests: ASSISTANT_RATE_LIMIT.tokensPerInterval, window: ASSISTANT_RATE_LIMIT.interval / 1000 },
  'docs-mcp': { id: 'docs-mcp', counts: `the docs MCP: \`${DOCS_MCP_PATH}\` on the docs host, \`mcp.nuxt-backend.dev\`, and its route on the site, \`${DOCS_MCP_ROUTE}\``, requests: DOCS_MCP_RATE_LIMIT.tokensPerInterval, window: DOCS_MCP_RATE_LIMIT.interval / 1000 },
} as const satisfies Record<string, FirewallRule>

/** A Firewall rule's id. */
export type FirewallRuleId = keyof typeof FIREWALL_RULES

/** How long a check waits for the Firewall before it lets the request through, in milliseconds. */
export const FIREWALL_TIMEOUT = 1_000

/**
 * The rule that counts a request, by its path (query and all) and host;
 * `undefined` for every other request. The router ignores a trailing slash
 * (`/__docus__/assistant/` reaches the assistant), so the lookup does too.
 * On the docs host only `/mcp` is the docs MCP: every other path there is
 * sent to the site, which counts it when it arrives.
 */
export function firewallRuleFor(path: string, host: string | undefined): FirewallRuleId | undefined {
  const pathname = path.split('?')[0]!.replace(/\/+$/, '') || '/'
  if (isDocsMcpHost(host)) return pathname === DOCS_MCP_PATH ? 'docs-mcp' : undefined
  if (pathname === DOCS_MCP_ROUTE) return 'docs-mcp'
  if (pathname === ASSISTANT_API_PATH) return 'docs-assistant'
  return undefined
}

/**
 * The request headers a check hands the Firewall: the host it asks, the
 * caller's IP it counts, and what a deny rule matches on. `checkRateLimit`
 * forwards every header it is given, and a rule counts by its id alone, so
 * a caller's cookies and `Authorization` stay behind: of the cookies only
 * `_vercel_jwt`, which a protected preview needs, goes along.
 */
export const FIREWALL_HEADERS = ['host', 'x-real-ip', 'x-forwarded-for', 'x-forwarded-host', 'user-agent'] as const

/** The headers of a request a check hands the Firewall: FIREWALL_HEADERS, and the `_vercel_jwt` cookie. */
export function firewallHeaders(headers: Headers): Headers {
  const handed = new Headers()
  for (const name of FIREWALL_HEADERS) {
    const value = headers.get(name)
    if (value) handed.set(name, value)
  }
  const jwt = headers.get('cookie')?.split(';').map(cookie => cookie.trim()).find(cookie => cookie.startsWith('_vercel_jwt='))
  if (jwt) handed.set('cookie', jwt)
  return handed
}
