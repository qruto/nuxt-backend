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

/** The mount path for one page key: the configured path, or the default. */
export function resolvePagePath(pages: ModulePagesOptions | undefined, key: BackendPageKey): string {
  const def = BACKEND_PAGE_DEFS.find(entry => entry.key === key)!
  const value = pages?.[key]?.trim()
  return value ? normalizePagePath(value) : def.defaultPath
}

/** Every page key with its mount path. Published to `runtimeConfig.public.backend.pages`. */
export function resolvedBackendPages(pages: ModulePagesOptions | undefined): Record<BackendPageKey, string> {
  return Object.fromEntries(
    BACKEND_PAGE_DEFS.map(def => [def.key, resolvePagePath(pages, def.key)]),
  ) as Record<BackendPageKey, string>
}

/**
 * The mount paths of the pages that sit behind the `auth` middleware.
 *
 * @internal
 */
export function privatePagePaths(pages: ModulePagesOptions | undefined): string[] {
  return BACKEND_PAGE_DEFS.filter(def => def.auth).map(def => resolvePagePath(pages, def.key))
}

/**
 * The route rules a page's path carries. No page is prerendered: each reads
 * the session or the live catalog when it is requested, and prerendering the
 * sign-in page hung `nuxt build`. A private page is also kept out of search
 * indexes and sitemaps (inert without @nuxtjs/robots and @nuxtjs/sitemap) and
 * out of every cache, so an app-wide `swr` or `isr` rule never serves one
 * person's page to another. The rules follow the path, not the component, so
 * an app page at the same path gets them too; a rule the app sets for that
 * exact path wins key by key.
 *
 * @internal
 */
export function pageRouteRules(def: Pick<BackendPageDef, 'auth'>): Record<string, unknown> {
  if (!def.auth) return { prerender: false }
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
