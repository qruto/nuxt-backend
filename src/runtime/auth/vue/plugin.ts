import { defineNuxtPlugin, useRuntimeConfig } from '#app'
import { ConvexVueClient, ConvexClientKey } from '../../vue/client'
import { ConvexAuthStateKey, createScopedConvexAuthState } from '../../vue/auth'
import { useAuth } from './useAuth'
import { authClient } from '../client'

type CrossDomainAuthClient = typeof authClient & {
  crossDomain?: {
    oneTimeToken?: {
      verify: (args: { token: string }) => Promise<{
        data?: { session?: { token?: string } | null } | null
      }>
    }
    updateSession?: () => void
  }
}

/**
 * Exchange a `?ott=...` one-time token (set by the Better Auth cross-domain
 * plugin when redirecting from an auth origin) for a full session in Nuxt.
 */
export async function consumeCrossDomainOneTimeToken() {
  if (typeof window === 'undefined' || !window.location?.href) return

  const url = new URL(window.location.href)
  const token = url.searchParams.get('ott')
  if (!token) return

  url.searchParams.delete('ott')
  window.history.replaceState({}, '', url)

  const client = authClient as CrossDomainAuthClient
  const verify = client.crossDomain?.oneTimeToken?.verify
  if (!verify) return

  try {
    const result = await verify({ token })
    const sessionToken = result?.data?.session?.token
    if (!sessionToken) return
    await authClient.getSession({
      fetchOptions: {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      },
    })
    client.crossDomain?.updateSession?.()
  }
  catch (error) {
    console.warn('[nuxt-backend] failed to consume cross-domain one-time token', error)
  }
}

export default defineNuxtPlugin(async (nuxtApp) => {
  const config = useRuntimeConfig()
  const url = config.public.backend.url

  if (!url) {
    console.warn('[nuxt-backend] No Convex URL configured for client plugin.')
    return
  }

  const client = new ConvexVueClient(url)

  // Provide the client via Vue's provide/inject for composables.
  nuxtApp.vueApp.provide(ConvexClientKey, client)
  nuxtApp.provide('convex', client)

  // Handle a cross-domain OTT exchange before wiring up auth so the session
  // is hydrated by the time Convex asks for a token.
  await consumeCrossDomainOneTimeToken()

  // Auto-wire Better Auth <-> Convex so `useConvexAuth` works out of the box.
  const { state, scope } = createScopedConvexAuthState({
    client,
    useAuth: () => useAuth(),
  })
  nuxtApp.vueApp.provide(ConvexAuthStateKey, state)

  // Close WebSocket connection and dispose auth watchers on page unload.
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      scope.stop()
      client.close()
    })
  }
})
