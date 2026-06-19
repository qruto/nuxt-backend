import type { AuthTokenFetcher } from 'convex/browser'
import { computed, ref, type ComputedRef } from 'vue'
import { authClient, type AuthClient } from './client'

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

type BetterAuthSessionData = {
  session?: {
    id?: string | null
  } | null
  user?: {
    id?: string | null
  } | null
} | null

const useClientSession = () => authClient.useSession()

export type AuthSession = ReturnType<typeof useClientSession>

/** The signed-in user (loose — exact fields depend on your auth schema). */
export type AuthUser = { id: string, email: string, name: string } & Record<string, unknown>

export interface UseAuthService {
  client: AuthClient
  session: AuthSession
  /** The current user, or `null` when signed out / still loading. */
  user: ComputedRef<AuthUser | null>
  isAuthenticated: ComputedRef<boolean>
  isLoading: ComputedRef<boolean>
  fetchAccessToken: AuthTokenFetcher
  authVersion: ComputedRef<string | null>
  /** Sign the current user out. */
  signOut: () => Promise<unknown>
  /** Send a sign-in / verification OTP code to an email. */
  sendOtp: (email: string, type?: 'sign-in' | 'email-verification' | 'forget-password') => Promise<unknown>
  /** Complete sign-in (or passwordless sign-up) with an emailed OTP code. */
  signInWithOtp: (args: { email: string, otp: string, name?: string }) => Promise<unknown>
  /** Sign in with a passkey (WebAuthn). */
  signInWithPasskey: () => Promise<unknown>
  /** Register a passkey — pass `{ email, name }` (JSON) for pre-auth registration. */
  registerPasskey: (context?: string) => Promise<unknown>
  /** Change the account email (confirmed via email). */
  changeEmail: (newEmail: string, callbackURL?: string) => Promise<unknown>
  /** Delete the account (confirmed via email). */
  deleteAccount: () => Promise<unknown>
}

/**
 * Unified Better Auth service for the Vue/Nuxt runtime.
 *
 * Returns the full Better Auth client, the reactive session wrapper, and the
 * Convex-compatible auth state used by the packaged auth plugin.
 *
 * @param initialToken - Optional preloaded token, used once per app lifetime
 *   to avoid a round-trip on initial load (e.g. from SSR).
 */
export function useAuth(initialToken?: string | null): UseAuthService {
  if (!initialTokenUsed && initialToken) {
    cachedToken.value = initialToken
    cachedTokenVersion = PENDING_AUTH_VERSION
    initialTokenUsed = true
  }

  const session = useClientSession()
  const client = authClient

  const authVersion = computed<string | null>(() => {
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

  // Thin ergonomic wrappers over the Better Auth client. The client is fully
  // typed and remains exposed for everything else; these cover the common flows.
  const c = client as unknown as {
    signOut: () => Promise<unknown>
    emailOtp: { sendVerificationOtp: (args: { email: string, type: string }) => Promise<unknown> }
    signIn: {
      emailOtp: (args: { email: string, otp: string, name?: string }) => Promise<unknown>
      passkey: () => Promise<unknown>
    }
    passkey: { addPasskey: (args: { context?: string }) => Promise<unknown> }
    changeEmail: (args: { newEmail: string, callbackURL?: string }) => Promise<unknown>
    deleteUser: (args: Record<string, never>) => Promise<unknown>
  }

  return {
    client,
    session,
    user: computed<AuthUser | null>(() => {
      const data = session.value.data as { user?: AuthUser } | null | undefined
      return data?.user ?? null
    }),
    isAuthenticated: computed(
      () => !!session.value.data || (session.value.isPending && cachedToken.value !== null),
    ),
    isLoading: computed(
      () => session.value.isPending && cachedToken.value === null,
    ),
    fetchAccessToken,
    authVersion,
    signOut: () => c.signOut(),
    sendOtp: (email, type = 'sign-in') => c.emailOtp.sendVerificationOtp({ email, type }),
    signInWithOtp: args => c.signIn.emailOtp(args),
    signInWithPasskey: () => c.signIn.passkey(),
    registerPasskey: context => c.passkey.addPasskey({ context }),
    changeEmail: (newEmail, callbackURL) => c.changeEmail({ newEmail, callbackURL }),
    deleteAccount: () => c.deleteUser({}),
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
