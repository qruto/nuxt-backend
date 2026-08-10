import { computed, getCurrentInstance, onMounted, ref, type ComputedRef, type Ref } from 'vue'
import { useAuth } from './use-auth'
import { unwrapAuth } from '../utils/auth-result'

/** An active device session (loose — the full shape is Better Auth's). */
export interface SessionInfo {
  token: string
  userAgent?: string | null
  ipAddress?: string | null
  createdAt: string | Date
}

export interface UseSessionsOptions {
  /** Load the session list on mount. Default `true`. */
  immediate?: boolean
}

export interface UseSessionsReturn {
  /** Active sessions — `undefined` until the first (client-only) load. */
  sessions: Ref<SessionInfo[] | undefined>
  /** The session belonging to this browser, once the list is loaded. */
  current: ComputedRef<SessionInfo | undefined>
  /** Whether a list load is in flight. */
  isLoading: ComputedRef<boolean>
  /** Message of the last failed call; cleared when the next call starts. */
  error: Ref<string | null>
  /** Reload the list. */
  refresh: () => Promise<void>
  /** Sign a session out by token, then reload. Throws on failure. */
  revoke: (token: string) => Promise<void>
  /** Sign out every session except this one, then reload. Throws on failure. */
  revokeOthers: () => Promise<void>
}

/**
 * Device-session management over the Better Auth client — list, revoke one,
 * revoke the rest. Every method unwraps the client's `{ data, error }`
 * envelope and throws a plain `Error` on failure (mirrored into `error`).
 * The list only loads in the browser (it needs the session cookie), starting
 * as `undefined` during SSR.
 */
export function useSessions(options: UseSessionsOptions = {}): UseSessionsReturn {
  const { client, session } = useAuth()
  const sessionClient = client as unknown as {
    listSessions: () => Promise<unknown>
    revokeSession: (args: { token: string }) => Promise<unknown>
    revokeOtherSessions: () => Promise<unknown>
  }

  const sessions = ref<SessionInfo[] | undefined>()
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function run<T>(call: () => Promise<unknown>): Promise<T> {
    error.value = null
    try {
      return unwrapAuth<T>(await call())
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : 'Request failed'
      throw e
    }
  }

  async function refresh() {
    loading.value = true
    try {
      sessions.value = (await run<SessionInfo[]>(() => sessionClient.listSessions())) ?? []
    }
    finally {
      loading.value = false
    }
  }

  if ((options.immediate ?? true) && getCurrentInstance()) {
    onMounted(() => refresh().catch(() => {}))
  }

  const currentToken = computed(() =>
    (session.value.data as { session?: { token?: string } } | null | undefined)?.session?.token)

  return {
    sessions,
    current: computed(() => sessions.value?.find(entry => entry.token === currentToken.value)),
    isLoading: computed(() => loading.value),
    error,
    refresh,
    revoke: async (token) => {
      await run(() => sessionClient.revokeSession({ token }))
      await refresh()
    },
    revokeOthers: async () => {
      await run(() => sessionClient.revokeOtherSessions())
      await refresh()
    },
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
