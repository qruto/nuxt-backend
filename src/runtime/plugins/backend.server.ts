import { ConvexHttpClient } from 'convex/browser'
import { defineNuxtPlugin, useRuntimeConfig, useState } from '#app'
import { getToken } from '../server/utils/auth'

export default defineNuxtPlugin(async () => {
  const config = useRuntimeConfig()
  const url = config.public.backend.url
  const authToken = useState<string | null>('backend:token', () => null)
  if (!url) {
    console.warn('[nuxt-backend] No Convex URL configured for server plugin.')
    authToken.value = null
    return {}
  }

  const client = new ConvexHttpClient(url)

  try {
    authToken.value = await getToken()
  }
  catch (error) {
    authToken.value = null
    console.warn(
      `[nuxt-backend] Failed to resolve SSR auth token: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  if (authToken.value) {
    client.setAuth(authToken.value)
  }

  return {
    provide: {
      backend: client,
    },
  }
})
