import { useRuntimeConfig } from 'nuxt/server'

/** The part of the Nitro app the plugin uses: nuxt-security's hook, which Nitro's own types do not name. */
interface SecurityNitroApp {
  hooks: { hook: (name: 'nuxt-security:routeRules', run: (rules: Record<string, unknown>) => void) => unknown }
}

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

/** A directive's sources, from the array or the space-separated string nuxt-security takes; `null` when unset. */
function sourcesOf(value: unknown): string[] | null {
  if (Array.isArray(value)) return value.map(String)
  return typeof value === 'string' ? value.split(/\s+/).filter(Boolean) : null
}

/**
 * Let the challenge's origin through one directive: added to the first
 * directive of its chain the policy sets, so it applies where the browser
 * looks. When that is a fallback (`default-src`), the directive itself is
 * written, from the fallback's sources and the origin, so nothing else
 * the fallback governs is opened. A chain the policy never sets already
 * allows it.
 */
function allow(policy: Record<string, unknown>, chain: readonly string[]): void {
  const [own] = chain
  for (const name of chain) {
    const sources = sourcesOf(policy[name])
    if (!sources) continue
    if (sources.includes(CHALLENGE_ORIGIN)) return
    // `'none'` stands alone: with an origin beside it, it would be ignored anyway.
    policy[name === 'child-src' ? name : own!] = [...sources.filter(source => source !== '\'none\''), CHALLENGE_ORIGIN]
    return
  }
}

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
    const csp = (rules['/**'] as { headers?: { contentSecurityPolicy?: unknown } } | undefined)?.headers?.contentSecurityPolicy
    if (!siteKey || typeof csp !== 'object' || csp === null) return
    for (const chain of DIRECTIVES) allow(csp as Record<string, unknown>, chain)
  })
}
