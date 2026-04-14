import { ConvexClient } from 'convex/browser'
import { defineNuxtPlugin, useRuntimeConfig, useState } from '#app'
import { watch } from 'vue'
import { getAuthClient, normalizeSessionState } from '../auth/client'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const url = config.public.backend.url
  if (!url) {
    console.warn('[nuxt-backend] No Convex URL configured for client plugin.')
    return
  }

  const client = new ConvexClient(url)
  const authClient = getAuthClient()
  const authToken = useState<string | null>('backend:token', () => null)
  const session = normalizeSessionState<{
    session?: {
      id?: string
    } | null
  } | null>(authClient.useSession())
  let pendingToken: Promise<string | null> | null = null

  const resetToken = () => {
    authToken.value = null
  }

  watch(() => session.data.value?.session?.id ?? null, (sessionId, previousSessionId) => {
    if (sessionId !== previousSessionId) {
      resetToken()
    }
  })

  client.setAuth(async ({ forceRefreshToken }) => {
    if (!forceRefreshToken && authToken.value) {
      return authToken.value
    }

    if (pendingToken) {
      return pendingToken
    }

    pendingToken = authClient.convex.token()
      .then((response) => {
        const token = response.data?.token ?? null
        authToken.value = token
        return token
      })
      .catch(() => {
        resetToken()
        return null
      })
      .finally(() => {
        pendingToken = null
      })

    return pendingToken
  }, (isAuthenticated) => {
    if (!isAuthenticated) {
      resetToken()
    }
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
