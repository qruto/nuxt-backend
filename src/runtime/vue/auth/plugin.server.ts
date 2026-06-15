import { defineNuxtPlugin, useRuntimeConfig, useState, useRequestEvent } from '#app'
import { ConvexVueClient, ConvexClientKey } from '../client'
import { backendAuth } from '../../nuxt/auth/server'
import { ConvexAuthStateKey, type ConvexAuthState } from './index'

type ConvexNuxtInjection = {
  convex?: ConvexVueClient
}

function buildProvide(ssrClient?: ConvexVueClient): { provide: ConvexNuxtInjection } {
  return ssrClient ? { provide: { convex: ssrClient } } : { provide: {} }
}

async function prefetchAuthToken(
  event: ReturnType<typeof useRequestEvent>,
  initialToken: ReturnType<typeof useState<string | null>>,
) {
  try {
    const token = await backendAuth(event!).getToken()
    initialToken.value = token ?? null
  }
  catch (error) {
    console.warn('[nuxt-backend] Failed to prefetch auth token for SSR:', error)
  }
}

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
export default defineNuxtPlugin<ConvexNuxtInjection>(async (nuxtApp) => {
  const initialToken = useState<string | null>('backend:initialToken', () => null)

  // Provide a Convex client on SSR so composables like `useMutation` /
  // `useAction` that call `useConvex()` during component setup don't throw.
  // The WebSocket is opened lazily on first subscription — `usePreloadedQuery`
  // and `usePreloadedAuthQuery` short-circuit on the server, so no
  // subscriptions are created during SSR.
  const url = useRuntimeConfig().public.backend.url
  const ssrClient = url ? new ConvexVueClient(url) : undefined
  if (ssrClient) {
    nuxtApp.vueApp.provide(ConvexClientKey, ssrClient)
  }

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
  if (event) {
    await prefetchAuthToken(event, initialToken)
  }

  return buildProvide(ssrClient)
})
