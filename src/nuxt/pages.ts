import { extendPages, extendRouteRules, type Resolver } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { DEFAULT_AUTH_ROUTE } from '../convex/constants'
import { BACKEND_PAGE_DEFS, collectExistingPagePaths, pageRouteRules, resolvedBackendPages } from '../pages'
import { computeDevtoolsPages } from '../devtools/info'
import type { DevtoolsPageInfo } from '../devtools/rpc-types'
import type { ModuleOptions } from '../module'
import { logger } from './logger'

// The ready-made pages: where each mounts, the route rules it carries, and
// the agent-consent page's own headers.

/**
 * Mount the ready-made pages (see the `pages` module option). Detect-and-skip
 * instead of route-precedence games: vue-router resolves tied scores
 * first-in-array, so ordering tricks are fragile — when the app already has a
 * page at the path, the module simply doesn't mount its own and logs the
 * override. The resolved paths are published to
 * `runtimeConfig.public.backend.pages` for cross-links between the pages.
 *
 * Returns a holder the DevTools `getInfo()` reads lazily: `extendPages` runs
 * during build, after module setup, so the shadowed-page list is filled in
 * place rather than returned by value.
 */
export function registerModulePages(options: ModuleOptions, resolver: Resolver, nuxt: Nuxt): { list: DevtoolsPageInfo[] } {
  const resolved = resolvedBackendPages(options.pages)
  const info: { list: DevtoolsPageInfo[] } = { list: [] }

  const runtimeConfig = nuxt.options.runtimeConfig
  runtimeConfig.public.backend = {
    ...(runtimeConfig.public.backend as Record<string, unknown> | undefined),
    pages: resolved,
    authRoute: options.authRoute ?? DEFAULT_AUTH_ROUTE,
  }

  // Each page's path carries its route rules (pageRouteRules): never
  // prerendered, and a private page never indexed or cached.
  for (const def of BACKEND_PAGE_DEFS) {
    extendRouteRules(resolved[def.key], pageRouteRules(def) as Parameters<typeof extendRouteRules>[1])
  }
  // The consent page decides what an agent may do as this person: no page may
  // frame it (a clickjacked "Approve"), and nothing it loads learns its URL.
  // Plain headers for apps without nuxt-security, the same values through
  // nuxt-security's per-route config for apps with it (it sets these headers
  // itself, so a plain header alone would be overwritten).
  extendRouteRules(resolved.agentConsent, {
    headers: { 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' },
    security: {
      headers: {
        referrerPolicy: 'no-referrer',
        xFrameOptions: 'DENY',
        contentSecurityPolicy: { 'frame-ancestors': '\'none\'' },
      },
    },
  } as Parameters<typeof extendRouteRules>[1])

  extendPages((pages) => {
    const taken = collectExistingPagePaths(pages)
    info.list = computeDevtoolsPages(resolved, taken)
    for (const def of BACKEND_PAGE_DEFS) {
      const path = resolved[def.key]
      if (taken.has(path)) {
        logger.info(`App page at \`${path}\` overrides the built-in ${def.key} page`)
        continue
      }
      pages.push({
        name: `backend-${def.file}`,
        path,
        file: resolver.resolve(`./runtime/vue/pages/${def.file}`),
        meta: def.auth ? { middleware: 'auth' } : undefined,
      })
    }
  })

  return info
}
