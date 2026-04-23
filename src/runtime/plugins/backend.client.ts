import { defineNuxtPlugin, useRuntimeConfig } from '#app'
import { ConvexVueClient, ConvexClientKey } from '../vue/client'

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()
  const url = config.public.backend.url

  if (!url) {
    console.warn('[nuxt-backend] No Convex URL configured for client plugin.')
    return
  }

  const client = new ConvexVueClient(url)

  // Provide the client via Vue's provide/inject for composables.
  nuxtApp.vueApp.provide(ConvexClientKey, client)

  // Close WebSocket connection on page unload.
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      client.close()
    })
  }

  return {
    provide: {
      convex: client,
    },
  }
})
