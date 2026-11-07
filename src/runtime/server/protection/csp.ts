import { useRuntimeConfig } from 'nuxt/server'
import { allowOrigin, appPolicy, type SecurityNitroApp } from '../csp'

/** Where the challenge's script and frame come from. */
const CHALLENGE_ORIGIN = 'https://challenges.cloudflare.com'

/**
 * Each directive the challenge needs, with the directives it falls back to
 * when the policy leaves it unset, nearest first (CSP's own fallback chain):
 * the script loads under `script-src`, the frame under `frame-src`, which
 * falls back to `child-src`, then to `default-src`.
 */
const DIRECTIVES = [
  ['script-src', 'default-src'],
  ['frame-src', 'child-src', 'default-src'],
] as const

/**
 * With a challenge site key, the security headers' policy lets the
 * challenge's script and frame in: its origin joins `script-src` and
 * `frame-src`, or the directive they fall back to (`child-src` for frames),
 * and a policy that restricts only `default-src` gains its own `script-src`
 * and `frame-src` from it. The same hook the base module adds the
 * deployment's origins through. `nuxt/server` is its only server import, so
 * the same file runs on Nitro 2 and Nitro 3.
 */
export default function protectionSecurityPlugin(nitroApp: SecurityNitroApp): void {
  nitroApp.hooks.hook('nuxt-security:routeRules', (rules) => {
    const siteKey = (useRuntimeConfig().public.backend as { challengeSiteKey?: string } | undefined)?.challengeSiteKey
    const csp = appPolicy(rules)
    if (!siteKey || !csp) return
    for (const chain of DIRECTIVES) allowOrigin(csp, chain, CHALLENGE_ORIGIN)
  })
}
