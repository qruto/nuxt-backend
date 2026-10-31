import type { FunctionReference } from 'convex/server'
import { computed, inject, type ComputedRef } from 'vue'
import { ConvexAuthStateKey, useMutation } from 'nuxt-convex-module/client'
import { useAuthSession } from '../utils/auth-session'
import { unwrapAuth } from '../utils/auth-result'
import { useActionState } from '../utils/action-state'
import type { BackendError } from '../utils/backend-error'
import { absentQuery, useLiveQuery } from '../utils/live-query'
import { useBackendNamespace } from '../utils/namespace'

/** One of the signed-in user's device sessions (mirrors the `listSessions` query). */
export interface SessionInfo {
  id: string
  userAgent: string | null
  /** When the device signed in, as epoch ms. */
  createdAt: number
  /** When the session was last extended, as epoch ms. */
  updatedAt: number
  /** When the session stops signing anyone in, as epoch ms. */
  expiresAt: number
  /** Whether this is the session this browser is signed in with. */
  current: boolean
  /**
   * A short label for the device, `Chrome · macOS` style, read from its user
   * agent; `null` when nothing in it is recognisable, so the page shows its
   * own wording for an unknown device.
   */
  device: string | null
}

/** A session as `listSessions` answers it: everything but the `device` label, which the browser reads. */
export type SessionRow = Omit<SessionInfo, 'device'>

/** The session functions re-exported from your `backend/auth.ts`. */
export interface SessionsApi {
  listSessions?: FunctionReference<'query', 'public', Record<string, never>, SessionRow[] | null>
  revokeSession?: FunctionReference<'mutation', 'public', { sessionId: string }, null>
}

export interface UseSessionsOptions {
  /** Override the injected `api.auth` namespace. */
  api?: SessionsApi
}

export interface UseSessionsReturn {
  /** Active sessions, live: `[]` when signed out, `undefined` while the session is still being read (during SSR too), until the first read lands and after a failed read. */
  sessions: ComputedRef<SessionInfo[] | undefined>
  /** The session belonging to this browser, once the list is loaded. */
  current: ComputedRef<SessionInfo | undefined>
  /** `true` while the session is still being read and until the first read lands (always `false` when signed out). */
  isLoading: ComputedRef<boolean>
  /** `true` while `revoke` or `revokeOthers` runs. */
  isPending: ComputedRef<boolean>
  /** Why the last action failed, else why the list could not be read, else `null`. An action clears its own failure when the next one starts, and signing out clears it. */
  error: ComputedRef<BackendError | null>
  /** Why the list could not be read, else `null`: the read's own failure, never an action's, for a list that shows why it is empty. */
  listError: ComputedRef<BackendError | null>
  /** Sign a session out by id. The list updates on its own. Rejects with the failure, which `error` also holds. */
  revoke: (id: string) => Promise<void>
  /** Sign out every session except this one. The list updates on its own. Rejects with the failure, which `error` also holds. */
  revokeOthers: () => Promise<void>
}

/**
 * Device-session management: list, revoke one, revoke the rest. The list is
 * a live query over `listSessions` from `backend/auth.ts`, so a session
 * signed out anywhere drops off without a reload; it works for sessions of
 * any age (Better Auth's own `/list-sessions` demands a sign-in from the
 * last ten minutes). Rows carry ids, never session tokens. The list never throws: a
 * failed read shows in `error`. The actions reject on failure and mirror it
 * into `error`.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { sessions, revoke, isPending, error } = useSessions()
 * </script>
 * <template>
 *   <p v-if="error">{{ error.message }}</p>
 *   <ul>
 *     <li v-for="session in sessions" :key="session.id">
 *       {{ session.device ?? 'Unknown device' }}
 *       <button v-if="!session.current" :aria-disabled="isPending || undefined" @click="isPending || revoke(session.id)">Sign out</button>
 *     </li>
 *   </ul>
 * </template>
 * ```
 */
export function useSessions(options: UseSessionsOptions = {}): UseSessionsReturn {
  const { client } = useAuthSession()
  const authApi = useBackendNamespace<SessionsApi>('auth', 'useSessions', options.api)

  // Gate the query on auth state, read via `inject` so the composable still
  // works without the auth integration. While the session is still being
  // read (server rendering included) nobody is signed in yet, but nobody is
  // signed out either: the list is unknown, not empty.
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth == null || !auth.isAuthenticated.value)
  const authLoading = computed(() => auth != null && auth.isLoading.value)

  const read = authApi.listSessions
    ? useLiveQuery(authApi.listSessions, () => (signedOut.value ? 'skip' : {}))
    : absentQuery<SessionRow[] | null>()
  // A query can't read the clock, so the server returns expired rows too.
  const sessions = computed<SessionInfo[] | undefined>(() => {
    if (authLoading.value) return undefined
    if (signedOut.value) return []
    // Without the query deployed there is nothing to list.
    if (!authApi.listSessions) return []
    // Server-side null = claimless caller (auth handshake) — treat as empty.
    if (read.data.value === null) return []
    const now = Date.now()
    return read.data.value?.filter(session => session.expiresAt > now).map(session => ({ ...session, device: describeUserAgent(session.userAgent) }))
  })

  const runRevoke = authApi.revokeSession ? useMutation(authApi.revokeSession) : null
  const { isPending, failure: actionError, run } = useActionState(() => signedOut.value)

  return {
    sessions,
    current: computed(() => sessions.value?.find(session => session.current)),
    isLoading: computed(() => authLoading.value || (!signedOut.value && read.isLoading.value)),
    isPending,
    error: computed(() => (signedOut.value ? null : actionError.value ?? read.error.value)),
    listError: computed(() => (signedOut.value ? null : read.error.value)),
    revoke: id => run(async () => {
      if (!runRevoke) {
        throw new Error(
          '[nuxt-backend] Revoking a session needs `revokeSession` re-exported from setupAuth() in '
          + 'backend/auth.ts, or pass `{ api }` to useSessions().',
        )
      }
      await runRevoke({ sessionId: id })
    }),
    revokeOthers: () => run(async () => {
      unwrapAuth(await client.revokeOtherSessions())
    }),
  }
}

/**
 * The browser and the operating system a user agent names, each `null`
 * when nothing in it is recognisable. Product names, so no language's.
 *
 * @internal
 */
export function parseUserAgent(userAgent?: string | null): { browser: string | null, os: string | null } {
  if (!userAgent) return { browser: null, os: null }
  const browser = /firefox/i.test(userAgent)
    ? 'Firefox'
    : /edg/i.test(userAgent)
      ? 'Edge'
      : /chrome/i.test(userAgent)
        ? 'Chrome'
        : /safari/i.test(userAgent) ? 'Safari' : null
  const os = /mac os/i.test(userAgent)
    ? 'macOS'
    : /windows/i.test(userAgent)
      ? 'Windows'
      : /linux/i.test(userAgent)
        ? 'Linux'
        : /iphone|ipad/i.test(userAgent)
          ? 'iOS'
          : /android/i.test(userAgent) ? 'Android' : null
  return { browser, os }
}

/**
 * A short label for a session's device, `Chrome · macOS` style, from its
 * user agent. `null` when there is no user agent or nothing in it is
 * recognisable, so the page shows its own wording for an unknown device.
 * In English (`Browser · macOS` when only the system is known):
 * `<SecuritySettings>` words it through the `security` labels instead.
 *
 * @internal
 */
export function describeUserAgent(userAgent?: string | null): string | null {
  const { browser, os } = parseUserAgent(userAgent)
  if (browser && os) return `${browser} · ${os}`
  return browser ?? (os ? `Browser · ${os}` : null)
}
