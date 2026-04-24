import { computed, ref } from 'vue'
import type { AuthTokenFetcher } from 'convex/browser'
import { authClient } from '../client'

/**
 * Module-level state, shared across all `useAuth()` calls in the Nuxt app.
 *
 * The cached JWT and in-flight token promise are kept at module scope so
 * concurrent `fetchAccessToken()` callers share the same Better Auth round-trip.
 */
const cachedToken = ref<string | null>(null)
let cachedTokenVersion: string | null = null
let pendingToken: Promise<string | null> | null = null
let pendingTokenVersion: string | null = null
let initialTokenUsed = false

const PENDING_AUTH_VERSION = '__pending__'

type ConvexAuthClient = typeof authClient & {
  convex?: {
    token: (opts: { fetchOptions: { throw: boolean } }) => Promise<{
      data?: { token?: string | null } | null
    }>
  }
}

type BetterAuthSessionData = {
  session?: {
    id?: string | null
  } | null
  user?: {
    id?: string | null
  } | null
} | null

/**
 * Reactive Better Auth state wired up for Convex.
 *
 * Returns a shape compatible with {@link provideConvexAuth}:
 * - `isAuthenticated` / `isLoading` reflect the Better Auth session.
 * - `fetchAccessToken` obtains a Convex-compatible JWT via the
 *   `@convex-dev/better-auth` client plugin, caching the result and
 *   de-duplicating concurrent refresh attempts.
 *
 * The Nuxt module wires Convex <-> Better Auth together in a client plugin,
 * so consumers can just read auth state via `useConvexAuth()` / `useAuth()`
 * without any manual setup.
 *
 * @param initialToken - Optional preloaded token, used once per app lifetime
 *   to avoid a round-trip on initial load (e.g. from SSR).
 */
export function useAuth(initialToken?: string | null) {
  if (!initialTokenUsed && initialToken) {
    cachedToken.value = initialToken
    cachedTokenVersion = PENDING_AUTH_VERSION
    initialTokenUsed = true
  }

  const session = authClient.useSession()
  const client = authClient as ConvexAuthClient

  const authVersion = computed(() => {
    const data = session.value.data as BetterAuthSessionData | undefined
    return data?.session?.id ?? data?.user?.id ?? null
  })

  const currentAuthVersion = () => authVersion.value ?? (session.value.isPending ? PENDING_AUTH_VERSION : null)

  const fetchAccessToken: AuthTokenFetcher = async ({ forceRefreshToken }) => {
    const version = currentAuthVersion()

    if (version === null) {
      cachedToken.value = null
      cachedTokenVersion = null
      pendingToken = null
      pendingTokenVersion = null
      return null
    }

    if (
      cachedToken.value
      && cachedTokenVersion === version
      && !forceRefreshToken
    ) {
      return cachedToken.value
    }

    if (
      !forceRefreshToken
      && pendingToken
      && pendingTokenVersion === version
    ) {
      return pendingToken
    }

    const request = (async () => {
      try {
        const result = await client.convex?.token({ fetchOptions: { throw: false } })
        const token = result?.data?.token ?? null
        cachedToken.value = token
        cachedTokenVersion = version
        return token
      }
      catch {
        cachedToken.value = null
        cachedTokenVersion = version
        return null
      }
    })()

    pendingTokenVersion = version
    pendingToken = request.finally(() => {
      pendingToken = null
      pendingTokenVersion = null
    })
    return pendingToken
  }

  return {
    isAuthenticated: computed(
      () => !!session.value.data || (session.value.isPending && cachedToken.value !== null),
    ),
    isLoading: computed(
      () => session.value.isPending && cachedToken.value === null,
    ),
    fetchAccessToken,
    authVersion,
  }
}

/** Reset module-level token cache — intended for tests only. */
export function __resetUseAuthForTests() {
  cachedToken.value = null
  cachedTokenVersion = null
  pendingToken = null
  pendingTokenVersion = null
  initialTokenUsed = false
}
