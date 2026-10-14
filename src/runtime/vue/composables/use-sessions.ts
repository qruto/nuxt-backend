import type { FunctionReference } from 'convex/server'
import { computed, inject, ref, type ComputedRef, type Ref } from 'vue'
import { ConvexAuthStateKey, useMutation, useQuery } from 'nuxt-convex-module/client'
import { useAuth } from './use-auth'
import { unwrapAuth } from '../utils/auth-result'
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
  /** Active sessions, live — `undefined` until the first read (and during SSR). */
  sessions: ComputedRef<SessionInfo[] | undefined>
  /** The session belonging to this browser, once the list is loaded. */
  current: ComputedRef<SessionInfo | undefined>
  /** `true` until the first read lands (always `false` when signed out). */
  isLoading: ComputedRef<boolean>
  /** Message of the last failed action; cleared when the next one starts. */
  error: Ref<string | null>
  /** Sign a session out by id. The list updates on its own. Throws on failure. */
  revoke: (id: string) => Promise<void>
  /** Sign out every session except this one. The list updates on its own. Throws on failure. */
  revokeOthers: () => Promise<void>
}

/** The readable message of a failed call: a `ConvexError`'s string data, else the error's message. */
function messageOf(error: unknown): string {
  const data = (error as { data?: unknown } | null)?.data
  if (typeof data === 'string') return data
  return error instanceof Error ? error.message : 'Request failed'
}

/**
 * Device-session management — list, revoke one, revoke the rest. The list is
 * a live query over `listSessions` from `backend/auth.ts`, so a session
 * signed out anywhere drops off without a reload; it works for sessions of
 * any age (Better Auth's own `/list-sessions` demands a sign-in from the
 * last day). Rows carry ids, never session tokens. Actions throw a plain
 * `Error` on failure and mirror its message into `error`.
 */
export function useSessions(options: UseSessionsOptions = {}): UseSessionsReturn {
  const { client } = useAuth()
  const authApi = useBackendNamespace<SessionsApi>('auth', 'useSessions', options.api)
  const sessionClient = client as unknown as { revokeOtherSessions: () => Promise<unknown> }

  // Gate the query on auth state, read via `inject` so the composable still
  // works without the auth integration.
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth == null || !auth.isAuthenticated.value)

  const rows = authApi.listSessions
    ? useQuery(authApi.listSessions, () => (signedOut.value ? 'skip' : {}))
    : computed<SessionInfo[] | null | undefined>(() => null)
  // A query can't read the clock, so the server returns expired rows too.
  const sessions = computed<SessionInfo[] | undefined>(() => {
    if (signedOut.value) return []
    // Server-side null = claimless caller (auth handshake) — treat as empty.
    if (rows.value === null) return []
    const now = Date.now()
    return rows.value?.filter(session => session.expiresAt > now)
  })

  const runRevoke = authApi.revokeSession ? useMutation(authApi.revokeSession) : null
  const error = ref<string | null>(null)

  async function run(call: () => Promise<unknown>): Promise<void> {
    error.value = null
    try {
      await call()
    }
    catch (e) {
      error.value = messageOf(e)
      throw new Error(error.value, { cause: e })
    }
  }

  return {
    sessions,
    current: computed(() => sessions.value?.find(session => session.current)),
    isLoading: computed(() => !signedOut.value && sessions.value === undefined),
    error,
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

/** 'Chrome · macOS'-style label from a user-agent string. */
export function describeUserAgent(userAgent?: string | null): string {
  if (!userAgent) return 'unknown device'
  const browser = /firefox/i.test(userAgent)
    ? 'Firefox'
    : /edg/i.test(userAgent)
      ? 'Edge'
      : /chrome/i.test(userAgent)
        ? 'Chrome'
        : /safari/i.test(userAgent) ? 'Safari' : 'Browser'
  const os = /mac os/i.test(userAgent)
    ? 'macOS'
    : /windows/i.test(userAgent)
      ? 'Windows'
      : /linux/i.test(userAgent)
        ? 'Linux'
        : /iphone|ipad/i.test(userAgent)
          ? 'iOS'
          : /android/i.test(userAgent) ? 'Android' : ''
  return os ? `${browser} · ${os}` : browser
}
