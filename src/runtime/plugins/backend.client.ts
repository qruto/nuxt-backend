import { ConvexClient } from 'convex/browser'
import { watch } from 'vue'
import { defineNuxtPlugin, useRuntimeConfig, useState } from '#app'
import { authClient } from '../auth/client'

/**
 * Client-side plugin that:
 * 1. Creates a ConvexClient with WebSocket support
 * 2. Hydrates the initial token from SSR (useState)
 * 3. Uses authClient.convex.token() for JWT fetching
 * 4. Re-triggers setAuth when session changes (mirrors React useMemo pattern)
 */
export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const client = new ConvexClient(config.public.backend.url)
  const tokenState = useState<string | null>('backend:token', () => null)

  let cachedToken: string | null = tokenState.value
  let initialTokenUsed = false
  let pendingTokenPromise: Promise<string | null> | null = null

  const session = authClient.useSession()

  function createFetchToken() {
    return async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      // Use SSR-hydrated token on first call (avoids extra round-trip)
      if (!initialTokenUsed && cachedToken && !forceRefreshToken) {
        initialTokenUsed = true
        return cachedToken
      }
      initialTokenUsed = true

      // Return cached token if not forcing refresh
      if (cachedToken && !forceRefreshToken) {
        return cachedToken
      }

      // Deduplicate concurrent token requests
      if (!forceRefreshToken && pendingTokenPromise) {
        return pendingTokenPromise
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pendingTokenPromise = (authClient as any).convex
        .token({ fetchOptions: { throw: false } })
        .then(({ data }: { data: { token?: string } | null }) => {
          const token = data?.token || null
          cachedToken = token
          tokenState.value = token
          return token
        })
        .catch(() => {
          cachedToken = null
          tokenState.value = null
          return null
        })
        .finally(() => {
          pendingTokenPromise = null
        })

      return pendingTokenPromise
    }
  }

  // Initial auth setup
  client.setAuth(createFetchToken())

  // Re-trigger setAuth when session changes (login/logout/switch user).
  // This mirrors the React provider's useMemo([sessionId]) pattern —
  // a new fetchToken callback forces ConvexClient to re-authenticate.
  watch(
    () => session.data.value?.session?.id,
    () => {
      cachedToken = null
      pendingTokenPromise = null
      client.setAuth(createFetchToken())
    },
  )

  window.addEventListener('beforeunload', () => {
    client.close()
  })

  return {
    provide: {
      backend: client,
    },
  }
})
