import { addTypeTemplate, createResolver, defineNuxtModule } from '@nuxt/kit'
import type { NuxtPage } from '@nuxt/schema'
import { joinURL } from 'ufo'
import { BACKEND_CLIENT_META, needsBackendClient } from './runtime/routes'

// THE BACKEND CLIENT, ONLY WHERE A PAGE USES IT. nuxt-convex-module's client
// plugin builds the Convex client and Better Auth's session store at startup
// on every page: better-auth/vue, its plugins and convex/browser sit in the
// entry chunk, and every docs visit asks for a session. This swaps that
// plugin for one that imports it on demand, in its place in the plugin order:
//
// - before the page renders, on the routes that need the client from the
//   start: /playground/** and the module's pages
//   (`runtimeConfig.public.backend.pages`), marked here at build;
// - on a docs page with `demo: true`, when a <DeferredBackend> block scrolls
//   into view;
// - nowhere else: never on the homepage. scripts/check-website-bundle.mjs
//   fails CI when a prerendered page's scripts reach the client up front,
//   call for it at mount, or prefetch it.
//
// Its chunks are kept out of every page's prefetch hints too, and the links
// into the playground prefetch on intent (test/docs/homepage.test.ts): an
// idle page downloads none of it.
//
// The server plugin stays: server rendering keeps its client and auth state.

/** nuxt-convex-module's client plugin, wherever the package is installed. */
export const CLIENT_PLUGIN = /nuxt-convex-module\/dist\/runtime\/better-auth\/vue\/plugin\.client(?:\.m?js)?$/

/** A chunk in the client manifest, as far as prefetching goes. */
interface ManifestChunk {
  isEntry?: boolean
  imports?: string[]
  dynamicImports?: string[]
  prefetch?: boolean
}

/** Mark, in place, every page that renders with the backend client from the start. */
export function markBackendClientPages(pages: NuxtPage[], backendPages: readonly string[], parent = '/'): void {
  for (const page of pages) {
    const path = page.path.startsWith('/') ? page.path : joinURL(parent, page.path)
    if (needsBackendClient(path, backendPages)) page.meta = { ...page.meta, [BACKEND_CLIENT_META]: true }
    if (page.children?.length) markBackendClientPages(page.children, backendPages, path)
  }
}

/**
 * Keep the backend client's own chunks out of every page's prefetch hints.
 * vue-bundle-renderer prefetches what the entry may import later, and the
 * client plugin is such an import: every docs page downloaded Better Auth and
 * convex/browser while idle. The chunks only the client needs (its static
 * imports, less what the entry loads anyway) are never prefetched, whichever
 * route leads to them; they load when a page asks for the client. Returns
 * them.
 */
export function deferClientChunks(manifest: Record<string, ManifestChunk>, pluginKey: string): string[] {
  const closure = (start: string[]) => {
    const seen = new Set<string>()
    const queue = [...start]
    while (queue.length > 0) {
      const key = queue.pop()!
      if (seen.has(key) || !manifest[key]) continue
      seen.add(key)
      queue.push(...manifest[key].imports ?? [])
    }
    return seen
  }
  const entries = Object.keys(manifest).filter(key => manifest[key]!.isEntry)
  const loaded = closure(entries)
  const deferred = [...closure([pluginKey])].filter(key => !loaded.has(key))
  for (const key of deferred) manifest[key]!.prefetch = false
  for (const key of entries) {
    const entry = manifest[key]!
    if (entry.dynamicImports) entry.dynamicImports = entry.dynamicImports.filter(id => id !== pluginKey)
  }
  return deferred
}

export default defineNuxtModule({
  meta: { name: 'deferred-backend-client' },
  setup(_options, nuxt) {
    const { resolve } = createResolver(import.meta.url)
    nuxt.hook('app:resolve', (app) => {
      const index = app.plugins.findIndex(plugin => CLIENT_PLUGIN.test(plugin.src.replaceAll('\\', '/')))
      if (index === -1) {
        throw new Error('[deferred-backend-client] nuxt-convex-module\'s client plugin is not in the app: update CLIENT_PLUGIN in website/modules/deferred-backend-client.')
      }
      nuxt.options.alias['#deferred-backend-client/plugin'] = app.plugins[index]!.src
      app.plugins.splice(index, 1, { src: resolve('./runtime/plugin.client'), mode: 'client' })
    })
    // After every module has added its pages: the module's own mount here.
    nuxt.hook('pages:resolved', (pages) => {
      const backend = nuxt.options.runtimeConfig.public.backend as { pages?: Record<string, string> } | undefined
      markBackendClientPages(pages, Object.values(backend?.pages ?? {}).filter(Boolean))
    })
    nuxt.hook('build:manifest', (manifest) => {
      if (nuxt.options.dev) return
      const key = Object.keys(manifest).find(id => CLIENT_PLUGIN.test(id))
      if (!key) {
        throw new Error('[deferred-backend-client] nuxt-convex-module\'s client plugin has no chunk in the client manifest: update CLIENT_PLUGIN in website/modules/deferred-backend-client.')
      }
      deferClientChunks(manifest, key)
    })
    addTypeTemplate({
      filename: 'types/deferred-backend-client.d.ts',
      getContents: () => [
        'declare module \'#deferred-backend-client/plugin\' {',
        '  const plugin: import(\'#app\').Plugin',
        '  export default plugin',
        '}',
        'declare module \'#app\' {',
        '  interface NuxtApp {',
        '    /** Load the backend client (once); resolves when its plugin has run. */',
        '    $loadBackendClient: () => Promise<void>',
        '  }',
        '}',
        'export {}',
        '',
      ].join('\n'),
    })
  },
})
