import { ConvexHttpClient } from 'convex/browser'
import { defineNuxtPlugin, useRuntimeConfig, useRequestHeaders, useState } from '#app'

/** Session cookie name used by Better Auth */
const SESSION_COOKIE_NAME = 'better-auth.session_token'
/** Secure cookie variant (HTTPS in production) */
const SECURE_SESSION_COOKIE_NAME = '__Secure-better-auth.session_token'

function extractCookie(cookieHeader: string, name: string): string | undefined {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]+)`))
  return match?.[1]
}

/**
 * Server-side plugin that:
 * 1. Reads session cookie from the request
 * 2. Exchanges it for a JWT via the Convex site's `/api/auth/convex/token` endpoint
 * 3. Stores the JWT in useState for client hydration
 * 4. Sets auth on ConvexHttpClient for authenticated SSR queries
 */
export default defineNuxtPlugin(async () => {
  const config = useRuntimeConfig()
  const url = config.public.backend.url
  if (!url) {
    console.warn('[nuxt-backend] No Convex URL configured for server plugin.')
    return
  }

  const client = new ConvexHttpClient(url)

  // Initialize hydration state (must always exist for client hydration)
  const tokenState = useState<string | null>('backend:token', () => null)

  const siteUrl = config.backend.siteUrl
  if (!siteUrl) {
    return { provide: { backend: client } }
  }

  // Read session cookie from incoming request
  const headers = useRequestHeaders(['cookie'])
  const cookieHeader = headers.cookie || ''
  const sessionToken = extractCookie(cookieHeader, SECURE_SESSION_COOKIE_NAME)
    || extractCookie(cookieHeader, SESSION_COOKIE_NAME)

  if (sessionToken) {
    try {
      // Exchange session cookie for a JWT via the Convex site
      const response = await fetch(`${siteUrl}/api/auth/convex/token`, {
        headers: { Cookie: cookieHeader },
      })

      if (response.ok) {
        const data = await response.json() as { token?: string }
        if (data?.token) {
          tokenState.value = data.token
          client.setAuth(data.token)
        }
      }
    }
    catch (error) {
      if (import.meta.dev) {
        console.warn(`[nuxt-backend] Token exchange failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }
  }

  return {
    provide: {
      backend: client,
    },
  }
})
