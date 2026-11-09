import { extendPages, extendRouteRules, hasNuxtModule, type Resolver } from '@nuxt/kit'
import type { Nuxt, NuxtPage } from '@nuxt/schema'
import { defu } from 'defu'
import { DEFAULT_AUTH_ROUTE } from '../convex/constants'
import { adoptChildPages, BACKEND_PAGE_DEFS, cachingRulesOver, collectExistingPagePaths, isPageOff, pagePathShape, pageRouteRules, privatePagePaths, publishedBackendPages, resolvedBackendPages, type BackendPageDef } from '../pages'
import { computeDevtoolsPages } from '../devtools/info'
import type { DevtoolsPageInfo } from '../devtools/rpc-types'
import type { ModuleOptions } from '../module'
import { logger } from './logger'
import { REGISTERED_UI } from '../ui/registry'

// The ready-made pages: where each mounts, the route rules it carries, the
// and the warning for an app-wide cache rule.

/** Where the docs explain the private pages' cache exemption, and where it ends. */
const CACHES_DOCS_URL = 'https://nuxt-backend.dev/docs/build/ui/pages#caches'

/**
 * Warn when a wildcard route rule (`'/**': { swr: 60 }`) would cache a
 * private page. The page's own rules keep its exact path out of every cache,
 * and the exact path is all they cover: Nitro matches paths case-sensitively
 * where the router does not, so `/SETTINGS` renders the settings page under
 * the wildcard's cache, and a signed-in render carries the session's token.
 * Read when Nitro starts, with every module's rules in and normalized (`swr`
 * then also shows as `cache`, so only `swr` is named).
 */
export function warnOnCachedPrivatePages(nuxt: Nuxt, paths: readonly string[]): void {
  nuxt.hook('nitro:init', (nitro) => {
    const warning = cachedPrivatePagesWarning(nitro.options.routeRules, paths)
    if (warning) logger.warn(warning)
  })
}

/** The warning {@link warnOnCachedPrivatePages} gives for these paths, or `null` when no wildcard caches one. */
function cachedPrivatePagesWarning(routeRules: Record<string, unknown>, paths: readonly string[]): string | null {
  const covering = cachingRulesOver(routeRules, paths)
  if (covering.length === 0) return null
  const rules = covering.map(({ pattern, keys, paths: covered }) => {
    const named = keys.includes('swr') ? keys.filter(key => key !== 'cache') : keys
    return `\`routeRules['${pattern}']\` (${named.join(', ')}) covers ${covered.join(', ')}`
  })
  const sample = covering[0]!.paths[0]!
  return `A wildcard cache rule covers the private pages: ${rules.join('; ')}. Their own rules keep those exact paths out of every cache, but Nitro matches paths case-sensitively and the router does not: ${sample.toUpperCase()} renders the page at ${sample} under the wildcard's cache, and a signed-in render carries the session's token.`
    + `\n  ↳ Scope \`swr\`, \`isr\` and \`cache\` rules to the public pages they are for (\`'/blog/**'\`, \`'/'\`): ${CACHES_DOCS_URL}`
}

/** The route rules a page carries at every path it answers on: its own (pageRouteRules). */
function rulesFor(def: Pick<BackendPageDef, 'auth' | 'key' | 'noindex' | 'uncached'>): Record<string, unknown> {
  return pageRouteRules(def)
}

/** Every route of the tree with its absolute path, children joined onto their parent. */
function flattenRoutes(pages: NuxtPage[], parent = ''): Array<{ path: string, file?: string }> {
  return pages.flatMap((page) => {
    const path = page.path.startsWith('/') ? page.path : `${parent}/${page.path}`
    return [{ path, file: page.file }, ...flattenRoutes(page.children ?? [], path)]
  })
}

/** Route rules for one path a resolved page answers at, and whether the page is private. */
interface ResolvedPageRules {
  path: string
  rules: Record<string, unknown>
  private: boolean
}

/**
 * Give route rules to paths only known once the pages resolve, each time they
 * do: the app's table and, since pages resolve after Nitro starts, Nitro's
 * own, where a rule the app set for the path still wins key by key. A
 * wildcard cache rule over a private one draws the startup warning, once.
 * Registered once every module has set up, so a router module (@nuxtjs/i18n)
 * has copied the routes when it runs, whichever order the modules are listed in.
 */
function onResolvedPages(nuxt: Nuxt, collect: (pages: NuxtPage[]) => ResolvedPageRules[]): void {
  let nitro: { options: { routeRules: Record<string, unknown> } } | undefined
  nuxt.hook('nitro:init', (instance) => {
    nitro = instance as unknown as typeof nitro
  })
  const warned = new Set<string>()
  nuxt.hook('modules:done', () => {
    nuxt.hook('pages:resolved', (pages) => {
      const resolved = collect(pages)
      for (const { path, rules } of resolved) {
        extendRouteRules(path, rules as Parameters<typeof extendRouteRules>[1])
        if (nitro) nitro.options.routeRules[path] = defu(nitro.options.routeRules[path] as Record<string, unknown> | undefined, rules)
      }
      const privatePaths = resolved.filter(entry => entry.private).map(entry => entry.path)
      const warning = nitro && privatePaths.length ? cachedPrivatePagesWarning(nitro.options.routeRules, privatePaths) : null
      if (warning && !warned.has(warning)) {
        warned.add(warning)
        logger.warn(warning)
      }
    })
  })
}

/**
 * The ready-made pages again, at every path a router module gave them: a
 * locale prefix from @nuxtjs/i18n (`/fr/profile`), or a localized path of
 * its own. Each carries the rules of the path it was mounted at, and a
 * wildcard cache rule over one gets the same warning.
 */
function followLocalizedPages(nuxt: Nuxt, files: Map<string, BackendPageDef>, mounted: Set<string>): void {
  onResolvedPages(nuxt, pages => localizedCopies(pages, files, mounted)
    .map(({ path, def }) => ({ path, rules: rulesFor(def), private: Boolean(def.auth) })))
}

/**
 * A route path as a route rule pattern, a segment that is one whole
 * parameter (`:id`, `:id(\\d+)`) as `*`; `null` for an optional, repeated or
 * partial parameter (`:id?`, `:slug(.*)*`), which no pattern covers exactly.
 */
function rulePattern(path: string): string | null {
  const segments = path.split('/').slice(1).map(segment => (!segment.includes(':') ? segment : /^:\w+(?:\([^/]*\))?$/.test(segment) ? '*' : null))
  if (segments.includes(null)) return null
  return `/${segments.join('/')}`.replace(/(.)\/$/, '$1')
}

/** Whether a page's `auth` meta asks for anything, the way the page guard reads it. */
const hasAccessRules = (auth: unknown): boolean => auth !== undefined && auth !== null && auth !== false

/** Every route path with `auth` rules of its own or a parent's. */
function guardedPaths(pages: NuxtPage[], parent = '', guarded = false): string[] {
  return pages.flatMap((page) => {
    const path = page.path.startsWith('/') ? page.path : `${parent}/${page.path}`
    const own = guarded || hasAccessRules(page.meta?.auth)
    return [...(own ? [path] : []), ...guardedPaths(page.children ?? [], path, own)]
  })
}

/** The guarded routes as route rule patterns; one no pattern covers is named in a warning. */
function guardedPatterns(pages: NuxtPage[]): string[] {
  return [...new Set(guardedPaths(pages).flatMap((path) => {
    const pattern = rulePattern(path)
    if (pattern) return [pattern]
    logger.warn(`The page at \`${path}\` has \`auth\` rules, and route rules cannot follow its path: keep it out of caches with a rule of your own (${CACHES_DOCS_URL}).`)
    return []
  }))]
}

/**
 * An app's pages with `auth` rules (`definePageMeta({ auth })`) carry the
 * rules of a private ready-made page (pageRouteRules): a render for one
 * signed-in person is never prerendered, cached or indexed, and a wildcard
 * cache rule over one draws the same warning. Without them an app-wide `swr`
 * rule would cache an admin's render for the next visitor, whose browser
 * trusts the server's decision while the page hydrates. A pattern stands for
 * a page with parameters (`/admin/users/*`). The rules are read at build
 * time, so Nuxt extracts the `auth` key from `definePageMeta`
 * (`experimental.extraPageMetaExtractionKeys`): a literal is read, a value
 * only known at runtime is not.
 */
export function protectGuardedPages(nuxt: Nuxt): void {
  const experimental = nuxt.options.experimental as { extraPageMetaExtractionKeys?: string[] }
  experimental.extraPageMetaExtractionKeys = [...new Set([...(experimental.extraPageMetaExtractionKeys ?? []), 'auth'])]
  const rules = pageRouteRules({ auth: true })
  onResolvedPages(nuxt, pages => guardedPatterns(pages).map(path => ({ path, rules, private: true })))
}

/**
 * The routes that mount a ready-made page at a path of their own: every
 * route whose file is a page's, at a path the module did not mount it at.
 * A pattern path (`/:locale(fr|de)/profile`) cannot carry exact-path rules,
 * so it is named in a warning instead.
 */
function localizedCopies(pages: NuxtPage[], files: Map<string, BackendPageDef>, mounted: Set<string>): Array<{ path: string, def: BackendPageDef }> {
  return flattenRoutes(pages).flatMap((route) => {
    const def = readyMadePage(files, route)
    if (!def || mounted.has(route.path)) return []
    if (route.path.includes(':')) {
      logger.warn(`The ${def.key} page answers at \`${route.path}\`, a pattern route rules cannot follow: give that path its page's rules (${CACHES_DOCS_URL}).`)
      return []
    }
    return [{ path: route.path, def }]
  })
}

/**
 * The app's admin tabs (`definePageMeta({ adminTab })`) are read at run time
 * from the router, so Nuxt extracts the key like `auth`. A page below the
 * console that names `adminTab` without a label would be left out of the tab
 * bar without a word, so development names it.
 */
function watchAdminTabs(nuxt: Nuxt, adminPath: string): void {
  const experimental = nuxt.options.experimental as { extraPageMetaExtractionKeys?: string[] }
  experimental.extraPageMetaExtractionKeys = [...new Set([...(experimental.extraPageMetaExtractionKeys ?? []), 'adminTab'])]
  nuxt.hook('pages:resolved', (pages) => {
    for (const route of tabbedRoutes(pages)) {
      if (!route.path.startsWith(`${adminPath}/`)) continue
      const tab = route.meta as { label?: unknown }
      if (typeof tab.label !== 'string' || !tab.label.trim()) logger.warn(`The page at \`${route.path}\` names \`adminTab\` without a \`label\`, so the admin console's tab bar leaves it out: \`definePageMeta({ adminTab: { label: 'Featured' } })\`.`)
      else if (route.path.includes(':')) logger.warn(`The page at \`${route.path}\` has a parameter in its path, so it has no one address for a tab to open: the admin console's tab bar leaves it out.`)
    }
  })
}

/** Every route of the tree whose page meta names an `adminTab`, with its absolute path and that value. */
function tabbedRoutes(pages: NuxtPage[], parent = ''): Array<{ path: string, meta: unknown }> {
  return pages.flatMap((page) => {
    const path = page.path.startsWith('/') ? page.path : `${parent}/${page.path}`
    const tab = (page.meta as { adminTab?: unknown } | undefined)?.adminTab
    const meta = tab && typeof tab === 'object' ? tab : {}
    return [...(tab === undefined ? [] : [{ path, meta }]), ...tabbedRoutes(page.children ?? [], path)]
  })
}

/** The ready-made page a route mounts, by its file; `undefined` for a page of the app's. */
function readyMadePage(files: Map<string, BackendPageDef>, route: { file?: string }): BackendPageDef | undefined {
  return route.file ? files.get(route.file.replace(/\.(?:vue|[cm]?[jt]s)$/, '')) : undefined
}

/** Where the docs say what the path of a private page an app page replaces keeps. */
const REPLACED_DOCS_URL = 'https://nuxt-backend.dev/docs/build/ui/pages#search-engines'

/** The route rule keys that keep a page out of search: what a private page's path gives up to a public page of the app's. */
const INDEX_KEYS = ['robots', 'sitemap'] as const

/** A private ready-made page's path: where its rules went (`ruleKey`), and the index keys the app set there itself. */
interface PrivatePagePath {
  def: BackendPageDef
  path: string
  ruleKey: string
  own: ReadonlySet<string>
}

/** The index keys an app's own rule for this path sets, read before the module adds its own. */
function ownIndexKeys(nuxt: Nuxt, ruleKey: string): ReadonlySet<string> {
  const rule = nuxt.options.routeRules?.[ruleKey] as Record<string, unknown> | undefined
  return new Set(INDEX_KEYS.filter(key => rule && key in rule))
}

/**
 * A private ready-made page's rules follow its path (pageRouteRules), so an
 * app page that replaces it there would carry them whatever it is: a public
 * shop at `/gifts` kept out of search indexes and sitemaps. The app's page
 * decides instead, once the pages resolve with their meta. One with `auth`
 * rules of its own or a parent's (`definePageMeta({ auth: true })`) keeps
 * every private rule, as protectGuardedPages would give it. A public one
 * is indexable again (`robots` and `sitemap` off its path), and development
 * names the path; it keeps the cache exemption (`cache-control: private,
 * no-store`), since its render for a signed-in visitor still carries the
 * session's token. A key the app set for the path itself is never touched.
 * Decided again each time the pages resolve, so a page that gains or loses
 * its `auth` rules in development takes its path's rules with it.
 */
function decideReplacedPrivatePages(nuxt: Nuxt, files: Map<string, BackendPageDef>, paths: readonly PrivatePagePath[]): void {
  if (paths.length === 0) return
  let nitro: { options: { routeRules: Record<string, unknown> } } | undefined
  nuxt.hook('nitro:init', (instance) => {
    nitro = instance as unknown as typeof nitro
  })
  const warned = new Set<string>()
  nuxt.hook('pages:resolved', (pages) => {
    const routes = flattenRoutes(pages)
    const guarded = new Set(guardedPaths(pages).map(pagePathShape))
    // The app's table, and Nitro's, which copied it when Nitro started, before the pages resolved.
    const tables = [nuxt.options.routeRules, nitro?.options.routeRules] as Array<Record<string, unknown> | undefined>
    for (const entry of paths) {
      const shape = pagePathShape(entry.path)
      const here = routes.filter(route => pagePathShape(route.path) === shape)
      // The ready-made page itself, nothing at all, or a page of the app's with `auth` rules: the private rules stand.
      const isPublic = here.length > 0 && !here.some(route => readyMadePage(files, route) === entry.def) && !guarded.has(shape)
      for (const table of tables) {
        if (table) setIndexRules(table, entry, isPublic)
      }
      if (isPublic && nuxt.options.dev && !warned.has(entry.path)) {
        warned.add(entry.path)
        logger.warn(`The app page at \`${entry.path}\` replaces the ready-made ${entry.def.key} page, which asks for a sign-in, and has no \`auth\` rules: it is public, so search engines may index it and sitemaps list it, and it stays out of caches (\`cache-control: private, no-store\`).`
          + `\n  ↳ If only signed-in people may open it, add \`definePageMeta({ auth: true })\`, and the path keeps the private page's rules: ${REPLACED_DOCS_URL}`)
      }
    }
  })
}

/**
 * Take the private page's index rules off one rule table's entry for its
 * path, or give them back: the app's own keys stay as they are either way,
 * and a value that is not the module's (`false`) is the app's too.
 */
function setIndexRules(table: Record<string, unknown>, entry: PrivatePagePath, indexable: boolean): void {
  const rule = table[entry.ruleKey] as Record<string, unknown> | undefined
  if (!indexable) {
    table[entry.ruleKey] = defu(rule, rulesFor(entry.def))
    return
  }
  if (!rule) return
  const released = (key: string) => (INDEX_KEYS as readonly string[]).includes(key) && !entry.own.has(key) && rule[key] === false
  table[entry.ruleKey] = Object.fromEntries(Object.entries(rule).filter(([key]) => !released(key)))
}

/** The SEO modules whose presence turns on the pricing page's Open Graph tags and structured data. */
const SEO_MODULES = ['@nuxtjs/seo', 'nuxt-schema-org', 'nuxt-seo-utils']

/**
 * Mount the ready-made pages (see the `pages` module option). Detect-and-skip
 * instead of route-precedence games: vue-router resolves tied scores
 * first-in-array, so ordering tricks are fragile — when the app already has a
 * page at the path, the module simply doesn't mount its own and logs the
 * override. The resolved paths are published to
 * `runtimeConfig.public.backend.pages` for cross-links between the pages,
 * and the `redirects` option beside them.
 *
 * Returns a holder the DevTools `getInfo()` reads lazily: `extendPages` runs
 * during build, after module setup, so the shadowed-page list is filled in
 * place rather than returned by value.
 */
export function registerModulePages(options: ModuleOptions, resolver: Resolver, nuxt: Nuxt): { list: DevtoolsPageInfo[] } {
  const resolved = resolvedBackendPages(options.pages)
  const info: { list: DevtoolsPageInfo[] } = { list: [] }

  const runtimeConfig = nuxt.options.runtimeConfig
  // The monitoring layer adds its DSN beside these (src/nuxt/monitoring.ts).
  runtimeConfig.public.backend = {
    // The bot check's keys, which registerProtection sets right after.
    botDetection: false,
    challengeSiteKey: '',
    ...(runtimeConfig.public.backend as Record<string, unknown> | undefined),
    pages: publishedBackendPages(options.pages),
    authRoute: options.authRoute ?? DEFAULT_AUTH_ROUTE,
    redirects: { afterSignIn: options.redirects?.afterSignIn ?? '/' },
    // Whether the shell has a bell to show: the package's inbox component is registered once notifications are built.
    notificationInbox: REGISTERED_UI.some(entry => entry.name === 'NotificationInbox'),
    // With an SEO module the pricing page adds Open Graph tags and its
    // plans as schema.org products; without one it keeps to its description.
    seo: SEO_MODULES.some(name => hasNuxtModule(name, nuxt)),
  } as unknown as typeof runtimeConfig.public.backend

  // Each page's path carries its route rules (pageRouteRules): never
  // prerendered, and a private page kept out of indexes and caches, at that
  // exact path, which is why an app-wide cache rule is worth a warning.
  // A page turned off (`pages.<key>: false`) mounts nothing and carries no rules.
  const mounting = BACKEND_PAGE_DEFS.filter(def => !isPageOff(options.pages, def.key))
  const privatePaths: PrivatePagePath[] = []
  for (const def of mounting) {
    // A page with a parameter in its path (`/r/:code`) carries its rules as a pattern.
    const ruleKey = rulePattern(resolved[def.key]) ?? resolved[def.key]
    if (def.auth) privatePaths.push({ def, path: resolved[def.key], ruleKey, own: ownIndexKeys(nuxt, ruleKey) })
    extendRouteRules(ruleKey, rulesFor(def) as Parameters<typeof extendRouteRules>[1])
  }
  warnOnCachedPrivatePages(nuxt, privatePagePaths(options.pages))
  watchAdminTabs(nuxt, resolved.admin)
  // The same rules wherever a router module mounts the pages again.
  const files = new Map(mounting.map(def => [resolver.resolve(`./runtime/vue/pages/${def.file}`), def as BackendPageDef]))
  followLocalizedPages(nuxt, files, new Set(mounting.map(def => resolved[def.key])))
  // A private page's path follows the app's page that replaces it.
  decideReplacedPrivatePages(nuxt, files, privatePaths)

  extendPages((pages) => {
    const taken = collectExistingPagePaths(pages)
    info.list = computeDevtoolsPages(resolved, taken)
    for (const def of mounting) {
      const path = resolved[def.key]
      if (taken.has(pagePathShape(path))) {
        logger.info(`App page at \`${path}\` overrides the built-in ${def.key} page`)
        continue
      }
      const page: NuxtPage = {
        name: `backend-${def.file}`,
        path,
        file: resolver.resolve(`./runtime/vue/pages/${def.file}.vue`),
        // The page guard asks for the sign-in, and holds a page with rules of
        // its own (the admin console's role, and its 404) to them.
        meta: def.auth ? { auth: def.access ?? true } : undefined,
      }
      pages.push(page)
      // The admin console is the frame of every page below its path: the
      // app's own admin tabs are its children, so its guard holds for them.
      if (def.key === 'admin') adoptChildPages(pages, page, path)
    }
  })

  return info
}
