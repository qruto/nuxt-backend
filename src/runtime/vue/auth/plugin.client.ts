import { defineNuxtPlugin, useRuntimeConfig, useState } from '#app'
import { ConvexVueClient, ConvexClientKey } from '../client'
import { ConvexAuthStateKey, createScopedConvexAuthState } from './index'
import { useAuth } from './use-auth'
import { consumeCrossDomainOneTimeToken } from './cross-domain'

export default defineNuxtPlugin(async (nuxtApp) => {
  const url = useRuntimeConfig().public.backend.url

  if (!url) {
    console.warn('[nuxt-backend] No Convex URL configured for client plugin.')
    return
  }

  const client = new ConvexVueClient(url)
  nuxtApp.vueApp.provide(ConvexClientKey, client)
  nuxtApp.provide('convex', client)

  // Hydrate the session before wiring auth so Convex sees a valid token
  // on the very first `setAuth()` call after a cross-domain redirect.
  await consumeCrossDomainOneTimeToken()

  // Read the SSR-prefetched token from the Nuxt payload. Mirrors the React
  // integration's `initialToken={await getToken()}` prop.
  const initialToken = useState<string | null>('backend:initialToken', () => null)

  const { state, scope } = createScopedConvexAuthState({
    client,
    useAuth: () => useAuth(initialToken.value),
  })
  nuxtApp.vueApp.provide(ConvexAuthStateKey, state)

  window.addEventListener('beforeunload', () => {
    scope.stop()
    client.close()
  })
})
