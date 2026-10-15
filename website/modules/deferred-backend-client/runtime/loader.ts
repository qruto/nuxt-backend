import { routeNeedsBackendClient } from './routes'

/** The client's chunk could not be fetched: a deploy replaced it, or the network failed. */
export class BackendClientChunkError extends Error {
  constructor(cause: unknown) {
    super('[deferred-backend-client] The backend client\'s chunk could not be fetched.', { cause })
    this.name = 'BackendClientChunkError'
  }
}

/**
 * Load the backend client once: import nuxt-convex-module's client plugin
 * and run it. A build without a deployment URL rejects without importing:
 * the plugin would provide no client there, and a live block would crash on
 * its first query instead of showing its fallback. A failed load is retried
 * on the next call.
 */
export function createBackendClientLoader<Plugin>(options: {
  url: string | undefined
  load: () => Promise<{ default: Plugin }>
  run: (plugin: Plugin) => unknown
}): () => Promise<void> {
  let loading: Promise<void> | undefined
  return () => {
    if (!options.url) return Promise.reject(new Error('[deferred-backend-client] This build has no backend URL to connect to.'))
    loading ??= options.load()
      .catch((cause: unknown) => {
        throw new BackendClientChunkError(cause)
      })
      .then(({ default: plugin }) => options.run(plugin))
      .then(() => undefined, (error: unknown) => {
        loading = undefined
        throw error
      })
    return loading
  }
}

/**
 * The global route middleware: a page that needs the client waits for it
 * before it renders. When the client's chunk cannot be fetched (an open tab
 * outlived the deploy that renamed it), `reload` loads the target fresh from
 * the current build: Nuxt's reloadNuxtApp, which skips a path it reloaded in
 * the last ten seconds, so a chunk that stays missing does not loop. Nuxt's
 * own chunk reload never sees this failure: the router wraps the error a
 * middleware throws in a new one, which its reload does not recognise.
 *
 * Without a backend URL there is nothing to load, and the page renders as it
 * would have.
 */
export function backendClientMiddleware(options: {
  available: boolean
  load: () => Promise<void>
  reload: (path: string) => void
}) {
  return (to: { fullPath: string, matched: ReadonlyArray<{ meta: Record<string, unknown> }> }): Promise<void> | undefined => {
    if (!options.available || !routeNeedsBackendClient(to)) return
    return options.load().catch((error: unknown) => {
      if (error instanceof BackendClientChunkError) options.reload(to.fullPath)
      throw error
    })
  }
}
