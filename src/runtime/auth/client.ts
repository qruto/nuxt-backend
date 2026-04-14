import { createAuthClient } from 'better-auth/vue'
import { convexClient } from '@convex-dev/better-auth/client/plugins'
import { useRuntimeConfig } from '#imports'
import { computed, type ComputedRef, type Ref } from 'vue'

interface ConvexTokenResponse {
  data?: {
    token?: string
  } | null
  error?: unknown
}

type AuthClient = ReturnType<typeof createAuthClient>

export type BackendAuthClient = AuthClient & {
  convex: {
    token: () => Promise<ConvexTokenResponse>
  }
}

interface PublicBackendRuntimeConfig {
  authRoute?: string
}

interface RefSessionState<Data> {
  value: {
    data: Data
    isPending: boolean
  }
}

interface FetchedSessionState<Data> {
  data: Ref<Data>
  isPending: boolean
}

type NormalizableSessionState<Data> = RefSessionState<Data> | FetchedSessionState<Data>

export interface BackendSessionState<Data = unknown> {
  data: ComputedRef<Data>
  isPending: ComputedRef<boolean>
}

export function resolveAuthClientBaseURL(authRoute: string, origin?: string) {
  return origin ? `${origin}${authRoute}` : authRoute
}

export function createBackendAuthClient(baseURL: string): BackendAuthClient {
  return createAuthClient({
    baseURL,
    plugins: [convexClient()],
    fetchOptions: {
      credentials: 'include',
    },
  }) as BackendAuthClient
}

let authClient: BackendAuthClient | undefined

export function normalizeSessionState<Data>(
  session: NormalizableSessionState<Data>,
): BackendSessionState<Data> {
  return {
    data: computed(() => {
      if ('value' in session) {
        return session.value.data
      }
      return session.data.value
    }),
    isPending: computed(() => {
      if ('value' in session) {
        return session.value.isPending
      }
      return session.isPending
    }),
  }
}

export function getAuthClient(): BackendAuthClient {
  if (authClient) {
    return authClient
  }

  const runtimeConfig = useRuntimeConfig()
  const authRoute = (runtimeConfig.public.backend as PublicBackendRuntimeConfig).authRoute || '/api/auth'
  const origin = import.meta.client ? window.location.origin : undefined
  authClient = createBackendAuthClient(resolveAuthClientBaseURL(authRoute, origin))
  return authClient
}
