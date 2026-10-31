import { resolve } from 'node:path'
import { addServerHandler, hasNuxtModule, type Resolver } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { appBrandOf } from '../brand-file'
import { installableGaps, MANIFEST_MODULES, MANIFEST_ROUTE, ownsManifest, webAppManifest } from '../installable'
import { PUSH_WORKER_URL } from '../convex/web-push'

/**
 * Web push and the installable app, on the app's side:
 * - the push service worker at `/_backend/push/worker.js`, which Chromium,
 *   Firefox and earlier Safari show push notifications through;
 * - once `public/` holds `icon-192.png` and `icon-512.png` and app.config
 *   names the brand, a web app manifest at `/manifest.webmanifest`, linked
 *   from every page, with the Apple tags iOS reads. An app that ships a
 *   manifest of its own (a PWA module, or a file in `public/`) gets none.
 */
export function registerInstallable(resolver: Resolver, nuxt: Nuxt): void {
  addServerHandler({ route: PUSH_WORKER_URL, method: 'get', handler: { nuxt: resolver.resolve('./runtime/server/push-worker') } })
  const publicDir = resolve(nuxt.options.rootDir, nuxt.options.dir?.public ?? 'public')
  nuxt.hook('modules:done', async () => {
    if (ownsManifest(publicDir, MANIFEST_MODULES.filter(name => hasNuxtModule(name, nuxt)))) return
    const brand = await appBrandOf(nuxt.options as never)
    if (!brand?.name || installableGaps(publicDir, brand).length > 0) return
    ;(nuxt.options.runtimeConfig as Record<string, unknown>).backendManifest = webAppManifest(brand.name)
    addServerHandler({ route: MANIFEST_ROUTE, method: 'get', handler: { nuxt: resolver.resolve('./runtime/server/manifest') } })
    const head = nuxt.options.app.head
    head.link = [
      ...(head.link ?? []),
      { rel: 'manifest', href: MANIFEST_ROUTE },
      { rel: 'apple-touch-icon', href: '/icon-192.png' },
    ]
    const tags: Array<[string, string]> = [['mobile-web-app-capable', 'yes'], ['apple-mobile-web-app-capable', 'yes'], ['apple-mobile-web-app-title', brand.name]]
    head.meta = [...(head.meta ?? []), ...tags.map(([tag, content]) => ({ name: tag, content }))]
  })
}
