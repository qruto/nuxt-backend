import { checkRateLimit } from '@vercel/firewall'
import { defineEventHandler, getRequestHost, type H3Event, setResponseHeader, setResponseStatus } from 'h3'
import { FIREWALL_RULES, FIREWALL_TIMEOUT, firewallHeaders, firewallRuleFor } from '../../shared/firewall'
import { onVercel } from '../../shared/vercel'

// The site's edge rate limits (shared/firewall.ts): the docs assistant's
// chat endpoint, `/mcp` on the docs host and the docs MCP's route, each
// counted against a rule the maintainer creates in the Vercel Firewall,
// matched by its id. First in the file order, so the docs host's `/mcp` is
// counted before docs-mcp-host.ts hands it on.
//
// A request the server makes to itself is not counted again: the docs
// host's hand-off to the docs MCP's route, and the assistant's calls to it,
// were counted as the request that made them.
//
// Off Vercel it does nothing: the Firewall answers only there, and
// `checkRateLimit` in a production build elsewhere would call the request's
// own host. The per-IP limits in nuxt.config.ts hold everywhere.
//
// It fails open. Until the maintainer creates a rule, the Firewall answers
// that the id is unknown, and the request goes on; a Firewall that errs or
// takes longer than FIREWALL_TIMEOUT lets it go on too, as an outage of the
// limiter must not take the docs down with it.

/** A Firewall that never answered in time. */
const TIMED_OUT = Symbol('timed out')

let warned = false

/**
 * Whether the server made this request to itself, through Nitro's
 * `localFetch` (`event.fetch`, `$fetch` of a path, a proxy to a path): its
 * request is a stand-in, which carries `__unenv__`, never a socket's.
 */
function inProcess(event: H3Event): boolean {
  return '__unenv__' in event.node.req
}

/** Ask the Firewall about one request, giving up after FIREWALL_TIMEOUT. */
async function ask(rule: string, headers: Headers): Promise<Awaited<ReturnType<typeof checkRateLimit>> | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), FIREWALL_TIMEOUT)
  })
  try {
    return await Promise.race([checkRateLimit(rule, { headers: firewallHeaders(headers) }), timeout])
  }
  finally {
    clearTimeout(timer)
  }
}

export default defineEventHandler(async (event) => {
  if (!onVercel(process.env) || inProcess(event)) return
  const id = firewallRuleFor(event.path, getRequestHost(event, { xForwardedHost: true }))
  if (!id) return
  let verdict: Awaited<ReturnType<typeof ask>>
  try {
    verdict = await ask(id, event.headers)
  }
  catch (error) {
    if (!warned) console.warn(`[firewall] the rate limit check for "${id}" failed, so requests go on unchecked:`, error)
    warned = true
    return
  }
  if (verdict === TIMED_OUT || !verdict.rateLimited) return
  // The Firewall blocked the caller outright: a deny rule, not a budget.
  if (verdict.error === 'blocked') {
    setResponseStatus(event, 403)
    return { error: 'forbidden', message: 'This request was blocked.' }
  }
  // The window's length: the most a caller waits for a fixed window to reopen.
  const { window } = FIREWALL_RULES[id]
  setResponseStatus(event, 429)
  setResponseHeader(event, 'retry-after', window)
  return { error: 'rate_limited', message: `Too many requests. Try again in ${window} seconds.` }
})
