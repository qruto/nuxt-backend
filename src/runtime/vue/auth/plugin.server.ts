import { defineNuxtPlugin, useState, useRequestEvent } from '#app'
import { backendAuth } from '../../nuxt/auth/server'

/**
 * Server-side Better Auth bootstrap.
 *
 * Mirrors the Next.js parity layer that calls `getToken()` from the root
 * server layout and passes it as `initialToken` to `ConvexBetterAuthProvider`.
 *
 * The token is stashed into a Nuxt `useState('backend:initialToken')` so the
 * client plugin can hand it to `useAuth(initialToken)` before the first
 * Convex `setAuth` call — avoiding an extra Better Auth round-trip on first
 * paint.
 */
export default defineNuxtPlugin(async () => {
  const initialToken = useState<string | null>('backend:initialToken', () => null)

  const event = useRequestEvent()
  if (!event) return

  try {
    const token = await backendAuth(event).getToken()
    initialToken.value = token ?? null
  }
  catch (error) {
    console.warn('[nuxt-backend] Failed to prefetch auth token for SSR:', error)
  }
})
