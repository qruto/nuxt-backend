import RENAME_MAP from '../../../skills/nuxt-backend/references/renames.json'
import LOOKUPS from './lookups.generated.json'

// What the docs MCP's lookup tools answer, as plain functions over two
// generated files: lookups.generated.json (`pnpm docs:lookups` writes it from the
// registries the reference pages are generated from) and the core skill's
// rename map (`references/renames.json`, which `pnpm agents:generate`
// writes). No Nitro: the tools in ./tools.ts call these with the site's
// origin, and test/docs/docs-mcp.test.ts calls them directly.

/** The lookups a name is found in. */
export type LookupKind = 'diagnostics' | 'env' | 'composables' | 'components'

/** What a lookup says when it finds nothing: why, and the closest names it has. */
export interface NotFound {
  found: false
  message: string
  suggestions: string[]
}

/** What a lookup finds: the name as the docs spell it, its record, and absolute URLs. */
export type Found<T> = { found: true, name: string } & T

/** One record of lookups.generated.json, with its URL made absolute. */
type LookupRecord<K extends LookupKind> = Omit<(typeof LOOKUPS)[K][keyof (typeof LOOKUPS)[K]], 'url'> & { url: string }

/** The Upgrade page, which every rename points into. */
const UPGRADE_PAGE = '/docs/ship/releases/upgrade'

/** What each kind is called in a message, and the page that lists every one. */
const KINDS: { [K in LookupKind]: { what: string, page: string } } = {
  diagnostics: { what: 'doctor finding id', page: '/docs/reference/cli/diagnostics' },
  env: { what: 'environment variable', page: '/docs/reference/configuration/environment-variables' },
  composables: { what: 'composable or auto-imported helper', page: '/docs/reference/nuxt/composables' },
  components: { what: 'component', page: '/docs/reference/components' },
}

/**
 * A name as an agent may write it, reduced to the form the docs key it by:
 * a short link or a docs URL to its id, `process.env.X` or `$X` to `X`, a
 * call to its name, a tag to its component.
 */
export function normalizeName(kind: LookupKind, raw: string): string {
  let name = raw.trim().replace(/^`|`$/g, '')
  if (kind === 'diagnostics') {
    name = name.replace(/^.*\/d\//, '').replace(/^.*#/, '').toLowerCase()
  }
  else if (kind === 'env') {
    name = name.replace(/^process\.env\./, '').replace(/^\$\{?/, '').replace(/\}$/, '').replace(/=.*$/, '').toUpperCase()
  }
  else if (kind === 'composables') {
    name = name.replace(/\(.*$/, '')
  }
  else {
    name = name.replace(/^<\/?|\s*\/?>$/g, '')
    // A kebab-case tag is the same component: `pricing-table` is `PricingTable`.
    if (name.includes('-')) name = name.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('')
  }
  return name
}

/** The edit distance between two names, stopping early past `max`. */
function distance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    previous = current
  }
  return previous[b.length]!
}

/** The names closest to one that is not there: those that hold it or that it holds, then the near misses. */
export function suggest(names: readonly string[], name: string, limit = 5): string[] {
  const needle = name.toLowerCase()
  if (!needle) return []
  const scored = names.map((candidate) => {
    const lower = candidate.toLowerCase()
    const overlap = lower.includes(needle) || needle.includes(lower)
    return { candidate, score: overlap ? 0 : distance(lower, needle) }
  })
  return scored.filter(({ score }) => score <= 3).sort((a, b) => a.score - b.score || a.candidate.localeCompare(b.candidate)).slice(0, limit).map(({ candidate }) => candidate)
}

/** An absolute URL on the site: a route as it is, a full URL left alone. */
const absolute = (site: string, route: string) => /^https?:\/\//.test(route) ? route : `${site.replace(/\/$/, '')}${route}`

/** Every name a lookup holds, in the order its reference page lists them. */
export function lookupNames(kind: LookupKind): string[] {
  return Object.keys(LOOKUPS[kind])
}

/** One name's record from a lookup, or why there is none and what is close. */
export function lookUp<K extends LookupKind>(kind: K, raw: string, site: string): Found<LookupRecord<K>> | NotFound {
  const table = LOOKUPS[kind] as { [name: string]: { url: string } }
  const wanted = normalizeName(kind, raw)
  // Own keys only: a plain object also answers `constructor`, `toString` and `__proto__`.
  const name = Object.hasOwn(table, wanted) ? wanted : Object.keys(table).find(candidate => candidate.toLowerCase() === wanted.toLowerCase())
  if (name) {
    const record = table[name]!
    return { found: true, name, ...record, url: absolute(site, record.url) } as Found<LookupRecord<K>>
  }
  const { what, page } = KINDS[kind]
  return {
    found: false,
    message: `nuxt-backend has no ${what} named "${raw.trim()}". Every one is listed on ${absolute(site, page)}.`,
    suggestions: suggest(Object.keys(table), wanted),
  }
}

/** One entry of the rename map. */
export type Rename = (typeof RENAME_MAP)['renames'][number]

/**
 * The upgrade guide: with a name, every rename it is the old or the new
 * side of (an exact match first, then the entries that mention it); without
 * one, the Upgrade page's sections with how many names each one moves.
 */
export function upgradeGuide(raw: string | undefined, site: string) {
  const guide = absolute(site, UPGRADE_PAGE)
  const renames: readonly Rename[] = RENAME_MAP.renames
  const name = raw?.trim().replace(/^`|`$/g, '')
  if (!name) {
    const sections = new Map<string, { section: string, url: string, names: number }>()
    for (const rename of renames) {
      const entry = sections.get(rename.section) ?? { section: rename.section, url: rename.url, names: 0 }
      entry.names += 1
      sections.set(rename.section, entry)
    }
    return { guide, total: renames.length, sections: [...sections.values()] }
  }
  const needle = name.toLowerCase()
  const exact = renames.filter(rename => rename.from.toLowerCase() === needle || rename.to?.toLowerCase() === needle)
  const mentions = renames.filter(rename => !exact.includes(rename) && [rename.from, rename.to ?? ''].some(side => side.toLowerCase().includes(needle)))
  const matches = [...exact, ...mentions]
  if (matches.length) return { guide, name, renames: matches }
  return {
    guide,
    name,
    renames: [],
    message: `No release renamed, reshaped or removed "${name}": it is either current or never was a nuxt-backend name. Check it against ${absolute(site, '/.well-known/skills/nuxt-backend/references/surface.json')}.`,
    suggestions: suggest([...new Set(renames.map(rename => rename.from))], name),
  }
}
