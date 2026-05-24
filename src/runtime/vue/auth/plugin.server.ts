import { defineNuxtPlugin, useState, useRequestEvent } from '#app'
import { backendAuth } from '../../nuxt/auth/server'
import { ConvexAuthStateKey, type ConvexAuthState } from './index'

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
export default defineNuxtPlugin(async (nuxtApp) => {
  const initialToken = useState<string | null>('backend:initialToken', () => null)

  // Provide a stub auth state for SSR so components calling `useConvexAuth`
  // (e.g. via `usePreloadedAuthQuery`) don't throw. `isLoading: true` makes
  // preloaded query helpers return the server-prefetched value during SSR
  // and defer the live query to the client plugin.
  const ssrAuthState: ConvexAuthState = {
    isLoading: true,
    isAuthenticated: false,
  }
  nuxtApp.vueApp.provide(ConvexAuthStateKey, ssrAuthState)

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
