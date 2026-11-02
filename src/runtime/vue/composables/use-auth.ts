import { computed, type ComputedRef, inject } from 'vue'
import type { BetterAuthSession, BetterAuthUser } from 'nuxt-convex-module/better-auth/client'
import { ConvexAuthStateKey } from 'nuxt-convex-module/client'
import { useAuthSession } from '../utils/auth-session'

/** The signed-in account, as the session carries it: `id`, `email`, `name`, `role`, `banned`, `image`, `locale`, … */
export type BackendUser = BetterAuthUser & {
  /** Whether the account is banned. */
  banned?: boolean | null
}

/** The session this browser holds: its `id`, `expiresAt`, the active workspace, and who opened it. */
export type BackendSession = NonNullable<NonNullable<BetterAuthSession['value']['data']>['session']>

/** What `useAuth()` returns: the session, the role, an administrator's visit, and signing out. */
export interface UseAuthReturn {
  /** The signed-in account, or `null` when signed out or still loading. */
  user: ComputedRef<BackendUser | null>
  /** The session this browser holds, or `null`. */
  session: ComputedRef<BackendSession | null>
  /** The app-wide role; `'user'` when signed out or unset. */
  role: ComputedRef<string>
  /** Whether the account holds the app-wide role, or any one of several. */
  hasRole: (role: string | string[]) => boolean
  /** Whether someone is signed in, read from the base module's auth state. */
  isSignedIn: ComputedRef<boolean>
  /**
   * Whether a signed-in read can go: someone is signed in, and the backend
   * connection holds their token. On every page load `isSignedIn` turns
   * `true` a moment sooner, from the session, while the token is still on
   * its way, and a query of a signed-in tier (`authed`, `workspace`,
   * `admin`) started in that moment is refused `unauthenticated`. Skip
   * such a query until this is `true`:
   * `useQuery(api.strips.list, () => (isReady.value ? {} : 'skip'))`.
   */
  isReady: ComputedRef<boolean>
  /** `true` while the session is still resolving. */
  isLoading: ComputedRef<boolean>
  /**
   * `true` while an administrator is visiting the account: `user` is the
   * account visited, and every sensitive action is refused. The
   * `impersonation` notice of `<BackendNotices>` says so on every page, and
   * `useAdmin().stopImpersonating()` ends the visit.
   */
  impersonating: ComputedRef<boolean>
  /**
   * Sign this browser out. Rejects on failure. The app navigates after it on
   * its own: a sign-out made here never sends the person to the sign-in page
   * with `?redirect=`, as a session that ends elsewhere does.
   */
  signOut: () => Promise<void>
}

/**
 * Who is signed in: the session, the app-wide role, whether an
 * administrator is visiting, and signing out. Nothing else: sign-in is
 * `useLoginFlow`'s, passkeys are `usePasskeys`', the profile, the export and
 * the deletion are `useAccount`'s, and ending a visit is `useAdmin`'s.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { user, isSignedIn, isReady, hasRole, signOut } = useAuth()
 * // A read of your own signed-in functions waits for the backend to hold the token.
 * const strips = useQuery(api.strips.list, () => (isReady.value ? {} : 'skip'))
 * </script>
 *
 * <template>
 *   <p v-if="isSignedIn">
 *     {{ user?.name }}
 *     <NuxtLink v-if="hasRole('admin')" to="/admin">Admin</NuxtLink>
 *     <button @click="signOut().then(() => navigateTo('/'))">Sign out</button>
 *   </p>
 * </template>
 * ```
 */
export function useAuth(): UseAuthReturn {
  const auth = useAuthSession()
  // The backend connection's own state: whether the client holds the session's token.
  const connection = inject(ConvexAuthStateKey, null)
  return {
    user: computed(() => auth.user.value as BackendUser | null),
    session: computed(() => (auth.session.value.data?.session ?? null) as BackendSession | null),
    role: auth.role,
    hasRole: auth.hasRole,
    isSignedIn: auth.isAuthenticated,
    isReady: computed(() => auth.isAuthenticated.value && (connection ? connection.isAuthenticated.value : !auth.isLoading.value)),
    isLoading: auth.isLoading,
    impersonating: auth.isImpersonating,
    signOut: auth.signOut,
  }
}
