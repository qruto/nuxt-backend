import { computed, effectScope, inject, shallowRef, watch, type ComputedRef, type ShallowRef } from 'vue'
import type { BetterAuthUser, UseBetterAuthReturn } from 'nuxt-convex-module/better-auth/client'
import { ConvexAuthStateKey } from 'nuxt-convex-module/client'
import { useState } from '#imports'
import { authClient } from './auth-client'
import { useAuthToken } from './bindings'

// What `nuxt-convex-module/better-auth/client` resolves to in a Convex Auth
// app: the session the package's composables read (`useBetterAuth`), the
// auth client and its loader, the same names and shapes as the base
// module's Better Auth entry, so the composables run unchanged. The session
// is the auth client's (`useSession`, answered by the deployment), read for
// as long as Convex Auth holds a session, and asked again each time its
// access token changes: a sign-in, a refresh (the claims a workspace switch
// changed), a sign-out.

type SessionState = UseBetterAuthReturn['session']['value']

/** The key the base module seeds the render's access token under. */
const INITIAL_TOKEN_KEY = 'convex:initialToken'

/** The auth client, loaded: here it loads with this module. */
export function loadAuthClient(): Promise<typeof authClient> {
  return Promise.resolve(authClient)
}

export { authClient }

/** The redirect a sign-in may go to: a same-origin path, else `fallback`. The base module's rule. */
export function resolveAuthRedirect(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string' || value === '' || !value.startsWith('/')) return fallback
  const sentinel = 'http://redirect.invalid'
  try {
    const url = new URL(value, sentinel)
    if (url.origin !== sentinel) return fallback
    const path = `${url.pathname}${url.search}${url.hash}`
    return new URL(path, sentinel).origin === sentinel ? path : fallback
  }
  catch {
    return fallback
  }
}

const pendingState = (): SessionState => ({ data: null, error: null, isPending: true, isRefetching: false, refetch: async () => {} } as unknown as SessionState)

let browserSession: ShallowRef<SessionState> | undefined
let followingToken = false

/** The browser's one session, the auth client's own store. */
function clientSession(): ShallowRef<SessionState> {
  if (import.meta.server) return shallowRef(pendingState())
  if (browserSession) return browserSession
  const scope = effectScope(true)
  browserSession = scope.run(() => {
    const session = shallowRef(pendingState())
    watch(authClient.useSession(), (state) => {
      session.value = state as unknown as SessionState
    }, { immediate: true, flush: 'sync' })
    return session
  })!
  return browserSession
}

/** Ask for the session again whenever Convex Auth's token changes. Once per app. */
function followToken(token: ComputedRef<string | null>): void {
  if (import.meta.server || followingToken) return
  followingToken = true
  effectScope(true).run(() => {
    watch(token, () => authClient.$store.notify('$sessionSignal'))
  })
}

/**
 * The session in a Convex Auth app, as the base module's `useBetterAuth`
 * hands it: `isAuthenticated` once the auth client knows the person, the
 * render's token counting until it has answered, as there.
 */
export function useBetterAuth(): UseBetterAuthReturn {
  const token = useAuthToken()
  followToken(token)
  const initialToken = useState<string | null>(INITIAL_TOKEN_KEY, () => null)
  const convexAuth = inject(ConvexAuthStateKey, undefined)
  const session = clientSession()
  // A session the auth client still holds after Convex Auth ended its own is no session.
  const signedOut = () => !import.meta.server && convexAuth !== undefined && !convexAuth.isLoading.value && !convexAuth.isAuthenticated.value && token.value === null
  const data = computed(() => signedOut() ? null : session.value.data)
  const serverToken = () => session.value.isPending && initialToken.value !== null
  const authVersion = computed(() => {
    const current = data.value as { session?: { id?: string }, user?: { id?: string } } | null
    const id = current?.session?.id ?? current?.user?.id ?? null
    return id === null && session.value.isPending ? undefined : id
  })
  return {
    isLoading: computed(() => session.value.isPending && !serverToken()),
    isAuthenticated: computed(() => !!data.value || serverToken()),
    fetchAccessToken: async () => token.value ?? initialToken.value,
    client: authClient as unknown as UseBetterAuthReturn['client'],
    session: computed(() => signedOut() ? { ...session.value, data: null } : session.value) as unknown as UseBetterAuthReturn['session'],
    user: computed(() => ((data.value as { user?: BetterAuthUser } | null)?.user ?? null)),
    authVersion,
  } as UseBetterAuthReturn
}

export type { BetterAuthSession, BetterAuthUser, UseBetterAuthReturn } from 'nuxt-convex-module/better-auth/client'
