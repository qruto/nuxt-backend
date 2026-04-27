import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

const sessionRef = ref<{ data: unknown, isPending: boolean }>({
  data: null,
  isPending: true,
})

const tokenMock = vi.fn<
  (opts: { fetchOptions: { throw: boolean } }) => Promise<{ data?: { token?: string | null } | null }>
>()

const mockAuthClient = {
  useSession: () => sessionRef,
  get convex() {
    return { token: tokenMock }
  },
}

vi.mock('../../../../src/runtime/vue/auth/client', () => ({
  authClient: mockAuthClient,
}))

async function loadUseAuth() {
  const mod = await import('../../../../src/runtime/vue/auth/use-auth')
  mod.__resetUseAuthForTests()
  return mod
}

describe('useAuth (Better Auth + Convex)', () => {
  beforeEach(() => {
    sessionRef.value = { data: null, isPending: true }
    tokenMock.mockReset()
  })

  it('exposes the Better Auth client and session from one service', async () => {
    const { useAuth } = await loadUseAuth()

    const auth = useAuth()

    expect(auth.client).toBe(mockAuthClient)
    expect(auth.session).toBe(sessionRef)
  })

  it('caches tokens across calls and dedups concurrent fetches', async () => {
    const { useAuth } = await loadUseAuth()
    tokenMock.mockResolvedValue({ data: { token: 'jwt-1' } })

    const { fetchAccessToken, isAuthenticated } = useAuth()

    const [a, b] = await Promise.all([
      fetchAccessToken({ forceRefreshToken: false }),
      fetchAccessToken({ forceRefreshToken: false }),
    ])
    expect(a).toBe('jwt-1')
    expect(b).toBe('jwt-1')
    expect(tokenMock).toHaveBeenCalledTimes(1)
    expect(isAuthenticated.value).toBe(true)

    await fetchAccessToken({ forceRefreshToken: false })
    expect(tokenMock).toHaveBeenCalledTimes(1)
  })

  it('refetches when forceRefreshToken is true', async () => {
    const { useAuth } = await loadUseAuth()
    tokenMock.mockResolvedValueOnce({ data: { token: 'jwt-1' } })
    tokenMock.mockResolvedValueOnce({ data: { token: 'jwt-2' } })

    const { fetchAccessToken } = useAuth()

    expect(await fetchAccessToken({ forceRefreshToken: false })).toBe('jwt-1')
    expect(await fetchAccessToken({ forceRefreshToken: true })).toBe('jwt-2')
    expect(tokenMock).toHaveBeenCalledTimes(2)
  })

  it('returns null and resets cache when the token fetch fails', async () => {
    const { useAuth } = await loadUseAuth()
    tokenMock.mockRejectedValue(new Error('boom'))

    const { fetchAccessToken, isAuthenticated } = useAuth()
    expect(await fetchAccessToken({ forceRefreshToken: false })).toBeNull()
    expect(isAuthenticated.value).toBe(false)
  })

  it('reflects session state for isAuthenticated / isLoading', async () => {
    const { useAuth } = await loadUseAuth()
    sessionRef.value = { data: { user: { id: '1' } }, isPending: false }

    const { isAuthenticated, isLoading } = useAuth()
    expect(isAuthenticated.value).toBe(true)
    expect(isLoading.value).toBe(false)

    sessionRef.value = { data: null, isPending: true }
    expect(isAuthenticated.value).toBe(false)
    expect(isLoading.value).toBe(true)
  })

  it('accepts an initialToken and uses it exactly once across the app lifetime', async () => {
    const { useAuth } = await loadUseAuth()

    const first = useAuth('preloaded-token')
    expect(first.isAuthenticated.value).toBe(true)
    expect(await first.fetchAccessToken({ forceRefreshToken: false })).toBe('preloaded-token')
    expect(tokenMock).not.toHaveBeenCalled()

    tokenMock.mockResolvedValue({ data: { token: 'fresh' } })
    const second = useAuth('ignored')
    expect(await second.fetchAccessToken({ forceRefreshToken: true })).toBe('fresh')
  })

  it('treats a settled missing session as unauthenticated even with a stale cached token', async () => {
    const { useAuth } = await loadUseAuth()
    sessionRef.value = {
      data: { session: { id: 'session-1' }, user: { id: 'user-1' } },
      isPending: false,
    }
    tokenMock.mockResolvedValue({ data: { token: 'jwt-1' } })

    const { fetchAccessToken, isAuthenticated } = useAuth()

    expect(await fetchAccessToken({ forceRefreshToken: false })).toBe('jwt-1')
    expect(isAuthenticated.value).toBe(true)

    sessionRef.value = { data: null, isPending: false }
    await nextTick()

    expect(isAuthenticated.value).toBe(false)
    expect(await fetchAccessToken({ forceRefreshToken: false })).toBeNull()
    expect(tokenMock).toHaveBeenCalledTimes(1)
  })

  it('invalidates the cached token when the Better Auth session changes', async () => {
    const { useAuth } = await loadUseAuth()
    sessionRef.value = {
      data: { session: { id: 'session-1' }, user: { id: 'user-1' } },
      isPending: false,
    }
    tokenMock.mockResolvedValueOnce({ data: { token: 'jwt-1' } })
    tokenMock.mockResolvedValueOnce({ data: { token: 'jwt-2' } })

    const { fetchAccessToken } = useAuth()

    expect(await fetchAccessToken({ forceRefreshToken: false })).toBe('jwt-1')

    sessionRef.value = {
      data: { session: { id: 'session-2' }, user: { id: 'user-2' } },
      isPending: false,
    }
    await nextTick()

    expect(await fetchAccessToken({ forceRefreshToken: false })).toBe('jwt-2')
    expect(tokenMock).toHaveBeenCalledTimes(2)
  })
})
