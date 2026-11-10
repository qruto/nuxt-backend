/** The part of the Nitro app a policy plugin uses: nuxt-security's hook, which Nitro's own types do not name. */
export interface SecurityNitroApp {
  hooks: { hook: (name: 'nuxt-security:routeRules', run: (rules: Record<string, unknown>) => void) => unknown }
}

/** The app-wide policy nuxt-security holds in its `/**` rule; `null` when the app turned it off or wrote none. */
export function appPolicy(rules: Record<string, unknown>): Record<string, unknown> | null {
  const csp = (rules['/**'] as { headers?: { contentSecurityPolicy?: unknown } } | undefined)?.headers?.contentSecurityPolicy
  return typeof csp === 'object' && csp !== null ? csp as Record<string, unknown> : null
}

/** A directive's sources, from the array or the space-separated string nuxt-security takes; `null` when unset. */
function sourcesOf(value: unknown): string[] | null {
  if (Array.isArray(value)) return value.map(String)
  return typeof value === 'string' ? value.split(/\s+/).filter(Boolean) : null
}

/**
 * Let an origin through one directive: added to the first directive of its
 * chain (the directive, then what CSP falls back to, nearest first) the
 * policy sets, so it applies where the browser looks. When that is a
 * fallback (`default-src`), the directive itself is written, from the
 * fallback's sources and the origin, so nothing else the fallback governs
 * is opened. `child-src` takes the origin in place, unless `ownDirective`
 * asks for the directive itself there too: frames and workers both fall
 * back to it, so a source only workers need stays out of frames. A chain
 * the policy never sets already allows it.
 */
export function allowOrigin(policy: Record<string, unknown>, chain: readonly string[], origin: string, { ownDirective = false }: { ownDirective?: boolean } = {}): void {
  const [own] = chain
  for (const name of chain) {
    const sources = sourcesOf(policy[name])
    if (!sources) continue
    if (new Set(sources).has(origin)) return
    // `'none'` stands alone: with an origin beside it, it would be ignored anyway.
    policy[name === 'child-src' && !ownDirective ? name : own!] = [...sources.filter(source => source !== '\'none\''), origin]
    return
  }
}
