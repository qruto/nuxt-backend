import { addRouteMiddleware, defineNuxtPlugin, type NuxtApp, reloadNuxtApp, useRuntimeConfig } from '#app'
import { joinURL } from 'ufo'
import { backendClientMiddleware, type BackendClientStatus, createBackendClientLoader } from './loader'

/**
 * Stands in for nuxt-convex-module's client plugin (see ../index.ts): it
 * runs that plugin on demand. A global route middleware awaits it before a
 * route that needs the client renders, and `$loadBackendClient` lets a
 * <DeferredBackend> block ask for it. `$backendClientStatus` tells the
 * block, without loading anything, whether this build has a client to load
 * and whether it has loaded already.
 */
/**
 * nuxt-convex-module's client plugin, as this one runs it. Typed here: its
 * inferred type reads the app's provides, this plugin's among them, and
 * TypeScript cannot infer through that loop.
 */
type ClientPlugin = (nuxtApp: NuxtApp) => unknown

export default defineNuxtPlugin({
  name: 'website:deferred-backend-client',
  setup(nuxtApp): { provide: { loadBackendClient: () => Promise<void>, backendClientStatus: () => BackendClientStatus } } {
    const config = useRuntimeConfig()
    const url = config.public.convex?.url
    const loadBackendClient = createBackendClientLoader<ClientPlugin>({
      url,
      load: () => import('#deferred-backend-client/plugin') as Promise<{ default: ClientPlugin }>,
      run: plugin => nuxtApp.runWithContext(() => plugin(nuxtApp)),
    })

    addRouteMiddleware('backend-client', backendClientMiddleware({
      available: Boolean(url),
      load: loadBackendClient,
      reload: path => reloadNuxtApp({ path: joinURL(config.app.baseURL, path), persistState: true }),
    }), { global: true })

    return { provide: { loadBackendClient, backendClientStatus: loadBackendClient.status } }
  },
})
