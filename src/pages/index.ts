import type { BackendPageDef } from './define'
import { BACKEND_PAGE_DEFS, type ModulePagesOptions } from './registry'

export { BACKEND_PAGE_DEFS, type ModulePagesOptions } from './registry'
export type { BackendPageDef } from './define'

export type BackendPageKey = keyof ModulePagesOptions

/**
 * `/settings/` → `/settings`; guarantees a leading slash; `''` stays `''`.
 * Exported for tests.
 *
 * @internal
 */
export function normalizePagePath(path: string): string {
  const prefixed = path.startsWith('/') ? path : `/${path}`
  const trimmed = prefixed.replace(/\/+$/, '')
  return trimmed || '/'
}

/**
 * The path for one page key: the configured path, or the default. Only a
 * string is a path: a page turned off (`false`) keeps its default, which a
 * guard still sends a signed-out visitor to when it is `login`, and any
 * other value resolves to the default too, so `doctor` reads such a config
 * without crashing; the module refuses it at startup ({@link pagesOptionProblems}).
 */
export function resolvePagePath(pages: ModulePagesOptions | undefined, key: BackendPageKey): string {
  const def = BACKEND_PAGE_DEFS.find(entry => entry.key === key)!
  const value: unknown = pages?.[key]
  const path = typeof value === 'string' ? value.trim() : ''
  return path ? normalizePagePath(path) : def.defaultPath
}

/** A config value as a message quotes it: `false`, `"/x"`, `null`. */
function quoted(value: unknown): string {
  return `\`${JSON.stringify(value) ?? String(value)}\``
}

/** Whether a page is turned off: `pages.<key>: false`. */
export function isPageOff(pages: ModulePagesOptions | undefined, key: BackendPageKey): boolean {
  return (pages as Record<string, unknown> | undefined)?.[key] === false
}

/**
 * What is wrong with a `pages` option, one sentence per problem; none when
 * every value is a path or `false`. Every page mounts unless its key is
 * `false`; `true` (0.1's way to mount one at its default) and the whole
 * option set to `false` are refused.
 *
 * @internal
 */
export function pagesOptionProblems(pages: unknown): string[] {
  if (pages === undefined) return []
  if (pages === null || typeof pages !== 'object' || Array.isArray(pages)) {
    return [`\`backend.pages\` is ${quoted(pages)}. It takes a path or \`false\` per page key: to replace a page, put an app page at its path.`]
  }
  return BACKEND_PAGE_DEFS.flatMap((def) => {
    const value: unknown = (pages as Record<string, unknown>)[def.key]
    if (value === undefined || value === false || typeof value === 'string') return []
    return [`\`backend.pages.${def.key}\` is ${quoted(value)}. Give it a path to move the page, \`false\` to turn it off, or leave it out; to replace the page, put an app page at its path (\`${def.defaultPath}\` by default).`]
  })
}

/** Every page key with its mount path, `false` for a page turned off: what `runtimeConfig.public.backend.pages` publishes. */
export function publishedBackendPages(pages: ModulePagesOptions | undefined): Record<BackendPageKey, string | false> {
  return Object.fromEntries(
    BACKEND_PAGE_DEFS.map(def => [def.key, isPageOff(pages, def.key) ? false : resolvePagePath(pages, def.key)]),
  ) as Record<BackendPageKey, string | false>
}

/** Every page key with its path, a page turned off at its default. */
export function resolvedBackendPages(pages: ModulePagesOptions | undefined): Record<BackendPageKey, string> {
  return Object.fromEntries(
    BACKEND_PAGE_DEFS.map(def => [def.key, resolvePagePath(pages, def.key)]),
  ) as Record<BackendPageKey, string>
}

/**
 * The mount paths of the pages that ask for a sign-in (`definePageMeta({ auth })`).
 *
 * @internal
 */
export function privatePagePaths(pages: ModulePagesOptions | undefined): string[] {
  return BACKEND_PAGE_DEFS.filter(def => def.auth && !isPageOff(pages, def.key)).map(def => resolvePagePath(pages, def.key))
}

/**
 * The route rules a page's path carries. No page is prerendered: each reads
 * the session or the live catalog when it is requested, and prerendering the
 * sign-in page hung `nuxt build`. A private page is also kept out of search
 * indexes and sitemaps (inert without @nuxtjs/robots and @nuxtjs/sitemap; the
 * noindex plugin's `robots` meta tag stands without them) and out of caches,
 * `cache-control: private, no-store` included: a signed-in render carries the
 * session's token. A public page that reads a token from its link
 * (`noindex`) is kept out of indexes alone; one whose link carries a secret
 * it acts on (`uncached`, the "keep my account" link) gets the private
 * page's rules, though anyone may open it. Nitro matches rules case-sensitively and the
 * router does not, so the exemption holds at the exact path only; a wildcard
 * caching rule over a private page draws a warning at startup
 * ({@link cachingRulesOver}). The rules follow the path, not the component, so
 * an app page at the same path gets them too; a rule the app sets for that
 * exact path wins key by key.
 *
 * @internal
 */
export function pageRouteRules(def: Pick<BackendPageDef, 'auth' | 'noindex' | 'uncached'>): Record<string, unknown> {
  if (!def.auth && !def.uncached) return def.noindex ? { prerender: false, robots: false } : { prerender: false }
  return {
    prerender: false,
    cache: false,
    swr: false,
    isr: false,
    robots: false,
    sitemap: false,
    headers: { 'cache-control': 'private, no-store' },
  }
}

/** The route rule keys that put a response in a cache: Nitro's own, and a platform's ISR. */
const CACHING_KEYS = ['swr', 'isr', 'cache'] as const

/** A route rule segment that matches more than its own spelling: `*`, `**`, `:name`, `**:name`. */
const isDynamicSegment = (segment: string): boolean => segment.startsWith('*') || segment.startsWith(':')

/**
 * Whether a route rule pattern matches `path` the way Nitro's matcher reads
 * it: `**` is the rest of the path (nothing included), `*` and `:name` are
 * one segment, and any other segment matches its exact spelling, case
 * included.
 */
function patternMatches(pattern: string, path: string): boolean {
  const wanted = pattern.split('/').slice(1)
  const given = path.split('/').slice(1)
  for (const [index, segment] of wanted.entries()) {
    if (segment.startsWith('**')) return true
    const actual = given[index]
    if (actual === undefined || (isDynamicSegment(segment) ? !actual : segment !== actual)) return false
  }
  return wanted.length === given.length
}

/**
 * The wildcard route rules that would cache a response at one of `paths`:
 * each pattern with the paths it covers and the keys that turn caching on.
 * A rule for the exact path is not one of them; it is the exemption.
 *
 * @internal
 */
export function cachingRulesOver(routeRules: Record<string, unknown>, paths: readonly string[]): Array<{ pattern: string, paths: string[], keys: string[] }> {
  return Object.entries(routeRules).flatMap(([pattern, rule]) => {
    if (!pattern.split('/').some(isDynamicSegment) || !rule || typeof rule !== 'object') return []
    const keys = CACHING_KEYS.filter(key => Boolean((rule as Record<string, unknown>)[key]))
    const covered = paths.filter(path => patternMatches(pattern, path))
    return keys.length && covered.length ? [{ pattern, paths: covered, keys }] : []
  })
}

interface PageLike {
  path: string
  children?: PageLike[]
}

/**
 * Every absolute path an app already registered, children included (relative
 * child paths joined onto the parent), trailing slashes normalized — the set
 * the module checks before mounting a default page, so app pages always
 * shadow module pages.
 */
export function collectExistingPagePaths(pages: PageLike[], parent = ''): Set<string> {
  const paths = new Set<string>()
  for (const page of pages) {
    const absolute = page.path.startsWith('/')
      ? page.path
      : `${parent}/${page.path}`
    const normalized = normalizePagePath(absolute)
    paths.add(normalized)
    if (page.children?.length) {
      for (const child of collectExistingPagePaths(page.children, normalized === '/' ? '' : normalized)) {
        paths.add(child)
      }
    }
  }
  return paths
}

/**
 * Move the pages below `parentPath` into `parent` as its children, so the
 * page mounted there is the frame of everything under it: the admin console
 * and the app's own admin tabs (`app/pages/admin/featured.vue`). Nuxt
 * nests a page only under a page file of the app's (`admin.vue`), so one
 * the module mounts is the parent of nothing until this runs. A page's path
 * becomes relative to the parent's; its name, meta and children stay. Returns
 * the paths it moved.
 *
 * @internal
 */
export function adoptChildPages<T extends PageLike & { children?: T[] }>(pages: T[], parent: T, parentPath: string): string[] {
  const base = normalizePagePath(parentPath)
  if (base === '/') return []
  const moved: string[] = []
  for (const page of [...pages]) {
    if (page === parent || !page.path.startsWith('/')) continue
    const absolute = normalizePagePath(page.path)
    if (!absolute.startsWith(`${base}/`)) continue
    pages.splice(pages.indexOf(page), 1)
    parent.children = [...(parent.children ?? []), { ...page, path: absolute.slice(base.length + 1) }]
    moved.push(absolute)
  }
  return moved
}
