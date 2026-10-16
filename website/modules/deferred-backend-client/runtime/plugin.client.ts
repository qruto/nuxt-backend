import { addRouteMiddleware, defineNuxtPlugin, useRuntimeConfig } from '#app'
import { needsBackendClient } from './routes'

/**
 * Stands in for nuxt-convex-module's client plugin (see ../index.ts): it
 * runs that plugin on demand. A global route middleware awaits it before a
 * route that needs the client renders, and `$loadBackendClient` lets a
 * <DeferredBackend> block ask for it.
 */
export default defineNuxtPlugin({
  name: 'website:deferred-backend-client',
  setup(nuxtApp) {
    let loading: Promise<void> | undefined
    const loadBackendClient = (): Promise<void> => {
      loading ??= import('#deferred-backend-client/plugin')
        .then(({ default: plugin }) => nuxtApp.runWithContext(() => plugin(nuxtApp)))
        .then(() => undefined, (error: unknown) => {
          // A failed chunk load may succeed on the next navigation.
          loading = undefined
          throw error
        })
      return loading
    }

    const pages = Object.values((useRuntimeConfig().public.backend as { pages?: Record<string, string> } | undefined)?.pages ?? {})
    addRouteMiddleware('backend-client', to => needsBackendClient(to.path, pages) ? loadBackendClient() : undefined, { global: true })

    return { provide: { loadBackendClient } }
  },
})
