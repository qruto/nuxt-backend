import { ConvexClient } from 'convex/browser'
import { defineNuxtPlugin, useRuntimeConfig } from '#app'
import { authClient } from '../auth/client'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const client = new ConvexClient(config.public.backend.url)

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
