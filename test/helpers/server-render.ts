import { createSSRApp, ssrContextKey, type Component } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { useNuxtApp } from '#app'
import { backendMockProvides } from '../../src/runtime/test-utils'

/**
 * `component` rendered the way a server renders it, over the backend mock
 * and the test's Nuxt app: setup runs once, a watcher that is not
 * immediate never fires, an async setup is awaited, and the HTML comes
 * back. Compare it with a mount of the same component to prove a server
 * render and its hydration agree.
 */
export async function serverRender(component: Component): Promise<string> {
  const app = createSSRApp(component)
  const nuxtApp = useNuxtApp()
  Object.assign(app, { $nuxt: nuxtApp })
  const mock = backendMockProvides()
  for (const key of Object.getOwnPropertySymbols(mock)) app.provide(key, mock[key])
  // What runs in the Nuxt app's own context (its shared queries) reads the render's context there.
  const context = {}
  const provides = nuxtApp.vueApp._context.provides as Record<symbol, unknown>
  provides[ssrContextKey] = context
  try {
    return await nuxtApp.runWithContext(() => renderToString(app, context))
  }
  finally {
    Reflect.deleteProperty(provides, ssrContextKey)
  }
}
