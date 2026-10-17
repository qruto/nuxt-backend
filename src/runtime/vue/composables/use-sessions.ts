import type { FunctionReference } from 'convex/server'
import { computed, inject, ref, watch, type ComputedRef } from 'vue'
import { ConvexAuthStateKey, useMutation } from 'nuxt-convex-module/client'
import { useAuth } from './use-auth'
import { unwrapAuth } from '../utils/auth-result'
import { type BackendError, failureOf } from '../utils/backend-error'
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
}

/** The session functions re-exported from your `backend/auth.ts`. */
export interface SessionsApi {
  listSessions?: FunctionReference<'query', 'public', Record<string, never>, SessionInfo[] | null>
  revokeSession?: FunctionReference<'mutation', 'public', { sessionId: string }, null>
}

export interface UseSessionsOptions {
  /** Override the injected `api.auth` namespace. */
  api?: SessionsApi
}

export interface UseSessionsReturn {
  /** Active sessions, live: `[]` when signed out, `undefined` until the first read lands (and during SSR) and after a failed read. */
  sessions: ComputedRef<SessionInfo[] | undefined>
  /** The session belonging to this browser, once the list is loaded. */
  current: ComputedRef<SessionInfo | undefined>
  /** `true` until the first read lands (always `false` when signed out). */
  isLoading: ComputedRef<boolean>
  /** `true` while `revoke` or `revokeOthers` runs. */
  isPending: ComputedRef<boolean>
  /** Why the last action failed, else why the list could not be read, else `null`. An action clears its own failure when the next one starts, and signing out clears it. */
  error: ComputedRef<BackendError | null>
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
 * last day). Rows carry ids, never session tokens. The list never throws: a
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
 *       {{ describeUserAgent(session.userAgent) ?? 'Unknown device' }}
 *       <button v-if="!session.current" :disabled="isPending" @click="revoke(session.id)">Sign out</button>
 *     </li>
 *   </ul>
 * </template>
 * ```
 */
export function useSessions(options: UseSessionsOptions = {}): UseSessionsReturn {
  const { client } = useAuth()
  const authApi = useBackendNamespace<SessionsApi>('auth', 'useSessions', options.api)
  const sessionClient = client as unknown as { revokeOtherSessions: () => Promise<unknown> }

  // Gate the query on auth state, read via `inject` so the composable still
  // works without the auth integration.
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth == null || !auth.isAuthenticated.value)

  const read = authApi.listSessions
    ? useLiveQuery(authApi.listSessions, () => (signedOut.value ? 'skip' : {}))
    : absentQuery<SessionInfo[] | null>()
  // A query can't read the clock, so the server returns expired rows too.
  const sessions = computed<SessionInfo[] | undefined>(() => {
    if (signedOut.value) return []
    // Without the query deployed there is nothing to list.
    if (!authApi.listSessions) return []
    // Server-side null = claimless caller (auth handshake) — treat as empty.
    if (read.data.value === null) return []
    const now = Date.now()
    return read.data.value?.filter(session => session.expiresAt > now)
  })

  const runRevoke = authApi.revokeSession ? useMutation(authApi.revokeSession) : null
  const actionError = ref<BackendError | null>(null)
  const pending = ref(0)
  // A failure belongs to the session it happened in: signing out drops it.
  watch(signedOut, (out) => {
    if (out) actionError.value = null
  })

  async function run(call: () => Promise<unknown>): Promise<void> {
    actionError.value = null
    pending.value++
    try {
      await call()
    }
    catch (cause) {
      actionError.value = failureOf(cause)
      throw cause
    }
    finally {
      pending.value--
    }
  }

  return {
    sessions,
    current: computed(() => sessions.value?.find(session => session.current)),
    isLoading: computed(() => !signedOut.value && read.isLoading.value),
    isPending: computed(() => pending.value > 0),
    error: computed(() => (signedOut.value ? null : actionError.value ?? read.error.value)),
    revoke: id => run(async () => {
      if (!runRevoke) {
        throw new Error(
          '[nuxt-backend] Revoking a session needs `revokeSession` re-exported from setupAuth() in '
          + 'backend/auth.ts, or pass `{ api }` to useSessions().',
        )
      }
      await runRevoke({ sessionId: id })
    }),
    revokeOthers: () => run(async () => unwrapAuth(await sessionClient.revokeOtherSessions())),
  }
}

/**
 * A short label for a session's device, `Chrome · macOS` style, from its
 * user agent. `null` when there is no user agent or nothing in it is
 * recognisable, so the page shows its own wording for an unknown device.
 */
export function describeUserAgent(userAgent?: string | null): string | null {
  if (!userAgent) return null
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
  if (browser && os) return `${browser} · ${os}`
  return browser ?? (os ? `Browser · ${os}` : null)
}
