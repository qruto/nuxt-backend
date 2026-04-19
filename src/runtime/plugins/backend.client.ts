import { ConvexClient } from 'convex/browser'
import { defineNuxtPlugin, useRuntimeConfig } from '#app'
import { ConvexClientKey } from '../vue/client'
import { authClient } from '../auth/client'

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()
  const client = new ConvexClient(config.public.backend.url)

  // Provide the client via Vue's inject system so that the Vue-layer
  // composables (useConvex, useQuery, etc.) can access it without
  // depending on Nuxt-specific APIs.
  nuxtApp.vueApp.provide(ConvexClientKey, client)

  // Wire Better Auth JWT into the Convex client
  const session = authClient.useSession()
  client.setAuth(async () => {
    const token = session.data.value?.session?.token
    return token ?? null
  })

  // Close WebSocket connection on page unload
  window.addEventListener('beforeunload', () => {
    client.close()
  })

  return {
    provide: {
      backend: client,
    },
  }
})
