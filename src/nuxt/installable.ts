import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { addPlugin, addServerHandler, hasNuxtModule, type Resolver } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { appBrandOf } from '../brand-file'
import { logger } from './logger'
import { APPLE_TOUCH_ICON, type InstallableOptions, installableGaps, installIcons, MANIFEST_MODULES, MANIFEST_ROUTE, maskableIcons, namedIconWarnings, ownsManifest, themeColorMeta, webAppManifest } from '../installable'
import { PUSH_WORKER_URL } from '../convex/web-push'

/**
 * Web push and the installable app, on the app's side:
 * - the push service worker at `/_backend/push/worker.js`, which Chromium,
 *   Firefox and earlier Safari show push notifications through;
 * - once `public/` holds the two icons and app.config names the brand, a
 *   web app manifest at `/manifest.webmanifest`, linked from every page,
 *   with the Apple tags iOS reads and, with `installable.themeColor`, the
 *   `theme-color` meta tags. The `installable` option adds colours, a
 *   description, other icon paths and maskable icons; `false` serves none.
 *   An app that ships a manifest of its own (a PWA module, or a file in
 *   `public/`) gets none;
 * - the install events, kept for `useInstallPrompt()` whoever serves the
 *   manifest, and with `installable.browserBanner: false` the listener
 *   that stops Chrome's own install banner.
 */
export function registerInstallable(resolver: Resolver, nuxt: Nuxt, options: InstallableOptions | false = {}): void {
  addServerHandler({ route: PUSH_WORKER_URL, method: 'get', handler: { nuxt: resolver.resolve('./runtime/server/push-worker') } })
  // useInstallPrompt() reads the install events from the app's start, whoever serves the manifest.
  addPlugin({ src: resolver.resolve('./runtime/vue/plugins/install-prompt.client'), mode: 'client' })
  if (options === false) return
  // Only a listener that runs as `beforeinstallprompt` fires can stop the banner: never a component, once it mounts.
  if (options.browserBanner === false) addPlugin({ src: resolver.resolve('./runtime/vue/plugins/install-banner.client'), mode: 'client' })
  const publicDir = resolve(nuxt.options.rootDir, nuxt.options.dir?.public ?? 'public')
  nuxt.hook('modules:done', async () => {
    if (ownsManifest(publicDir, MANIFEST_MODULES.filter(name => hasNuxtModule(name, nuxt)), nuxt.options.app.head.link ?? [])) return
    // A path the option names that public/ lacks is said here; a missing default is doctor's to name.
    for (const warning of namedIconWarnings(publicDir, options)) logger.warn(warning)
    const brand = await appBrandOf(nuxt.options as never)
    if (!brand?.name || installableGaps(publicDir, brand, options).length > 0) return
    const icons = installIcons(publicDir, options)
    ;(nuxt.options.runtimeConfig as Record<string, unknown>).backendManifest = webAppManifest(brand.name, { ...options, icons, maskable: maskableIcons(publicDir, options) })
    addServerHandler({ route: MANIFEST_ROUTE, method: 'get', handler: { nuxt: resolver.resolve('./runtime/server/manifest') } })
    const head = nuxt.options.app.head
    const touchIcon = existsSync(join(publicDir, APPLE_TOUCH_ICON.slice(1))) ? APPLE_TOUCH_ICON : icons[192]
    head.link = [
      ...(head.link ?? []),
      { rel: 'manifest', href: MANIFEST_ROUTE },
      { rel: 'apple-touch-icon', href: touchIcon },
    ]
    const tags: Array<[string, string]> = [['mobile-web-app-capable', 'yes'], ['apple-mobile-web-app-capable', 'yes'], ['apple-mobile-web-app-title', brand.name]]
    head.meta = [...(head.meta ?? []), ...tags.map(([tag, content]) => ({ name: tag, content })), ...themeColorMeta(options.themeColor)]
  })
}
