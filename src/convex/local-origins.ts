/**
 * An origin a development server on this machine answers on: `localhost`,
 * `127.0.0.1` or `[::1]` on any port, over `http` or `https`, or any name
 * under `.localhost` over `https` (`https://nuxt-backend.localhost`, what a
 * local HTTPS proxy such as portless serves).
 *
 * `localhost` itself always comes from the hosts file. A name under it is
 * meant to resolve to the loopback address without asking DNS (RFC 6761
 * §6.3), and current browsers do so, but the rule is a SHOULD: a client that
 * forwards one to a hostile resolver could reach another host. Over `https`
 * that host would also need a certificate the browser trusts for the name,
 * which only the local proxy's own authority issues, so plain `http` is
 * trusted for the loopback names only.
 *
 * What a `development` `BACKEND_ENVIRONMENT` trusts beside `SITE_URL`: as a
 * browser origin for auth, and as a buyer's return origin for billing.
 */
const LOOPBACK_ORIGIN = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/
const LOCALHOST_NAME_ORIGIN = /^https:\/\/(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+localhost(?::\d{1,5})?$/

/** Whether `origin` (scheme, host and port, no path) is a local development origin. */
export function isLocalOrigin(origin: string): boolean {
  const lower = origin.toLowerCase()
  return LOOPBACK_ORIGIN.test(lower) || LOCALHOST_NAME_ORIGIN.test(lower)
}
