import { ConvexHttpClient } from 'convex/browser'
import { defineNuxtPlugin, useRuntimeConfig, useRequestHeaders } from '#app'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const url = config.public.backend.url
  if (!url) {
    console.warn('[nuxt-backend] No Convex URL configured for server plugin.')
    return
  }

  const client = new ConvexHttpClient(url)

  // SSR token hydration: read session token from cookies
  const headers = useRequestHeaders(['cookie'])
  const cookies = headers.cookie || ''
  const tokenMatch = cookies.match(/better-auth\.session_token=([^;]+)/)
  if (tokenMatch && tokenMatch[1]) {
    client.setAuth(tokenMatch[1])
  }

  return {
    provide: {
      backend: client,
    },
  }
})
