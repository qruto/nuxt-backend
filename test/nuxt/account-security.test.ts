import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, ref, toValue, type MaybeRefOrGetter } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

const user = ref<Record<string, unknown> | null>({ email: 'ada@example.com', emailVerified: false })

const client = {
  passkey: {
    addPasskey: vi.fn(async () => ({})),
    listUserPasskeys: vi.fn(async () => ({ data: [{ id: 'pk1', name: 'Laptop', createdAt: '2026-01-01' }] })),
    updatePasskey: vi.fn(async () => ({})),
    deletePasskey: vi.fn(async () => ({})),
  },
  revokeOtherSessions: vi.fn(async () => ({})),
  updateUser: vi.fn(async () => ({})),
  sendVerificationEmail: vi.fn(async () => ({})),
  changeEmail: vi.fn(async () => ({})),
  deleteUser: vi.fn(async () => ({})),
  signOut: vi.fn(async () => ({})),
  emailOtp: { sendVerificationOtp: vi.fn(async () => ({})) },
  signIn: { emailOtp: vi.fn(async () => ({})), passkey: vi.fn(async () => ({})) },
  admin: { checkRolePermission: vi.fn(() => false) },
}

// The live session list: what the `listSessions` query returns, and the
// `revokeSession` mutation. Everything else in the client module stays real.
const DAY = 86_400_000
const sessionRows = ref<Array<Record<string, unknown>> | null | undefined>()
const revokeSessionMutation = vi.fn(async (_args: { sessionId: string }): Promise<null> => null)
const sessionsApi = { listSessions: 'auth:listSessions', revokeSession: 'auth:revokeSession' } as never

vi.mock('nuxt-convex-module/client', async original => ({
  ...await original<Record<string, unknown>>(),
  useQuery: (_ref: unknown, args: MaybeRefOrGetter<unknown>) =>
    computed(() => (toValue(args) === 'skip' ? undefined : sessionRows.value)),
  useMutation: () => revokeSessionMutation,
}))

vi.mock('nuxt-convex-module/better-auth/client', () => ({
  useBetterAuth: () => ({
    isLoading: computed(() => false),
    isAuthenticated: computed(() => user.value !== null),
    fetchAccessToken: vi.fn(async () => 'token'),
    client,
    session: ref({ data: { session: { token: 'current-token' } }, isPending: false, refetch: vi.fn() }),
    user: computed(() => user.value),
    authVersion: computed(() => null),
  }),
}))

const { useAuth } = await import('../../src/runtime/vue/composables/use-auth')
const { usePasskeys } = await import('../../src/runtime/vue/composables/use-passkeys')
const { useSessions, describeUserAgent } = await import('../../src/runtime/vue/composables/use-sessions')
const { unwrapAuth } = await import('../../src/runtime/vue/utils/auth-result')
const { ConvexAuthStateKey } = await import('nuxt-convex-module/client')

function inSetup<T>(runner: () => T): T {
  let result: T
  mount(defineComponent({
    setup() {
      result = runner()
      return () => h('div')
    },
  }))
  return result!
}

beforeEach(() => {
  vi.clearAllMocks()
  user.value = { email: 'ada@example.com', emailVerified: false }
})

describe('unwrapAuth', () => {
  it('returns data and throws on error envelopes', () => {
    expect(unwrapAuth<number>({ data: 41 })).toBe(41)
    expect(() => unwrapAuth({ error: { message: 'nope' } })).toThrow('nope')
    expect(() => unwrapAuth({ error: { statusText: 'Bad Request' } })).toThrow('Bad Request')
    expect(() => unwrapAuth({ error: {} })).toThrow('Request failed')
  })
})

describe('usePasskeys', () => {
  it('loads on mount and exposes the list', async () => {
    const passkeys = inSetup(() => usePasskeys())
    await flushPromises()
    expect(client.passkey.listUserPasskeys).toHaveBeenCalled()
    expect(passkeys.passkeys.value).toEqual([{ id: 'pk1', name: 'Laptop', createdAt: '2026-01-01' }])
  })

  it('skips the mount load with immediate: false', async () => {
    const passkeys = inSetup(() => usePasskeys({ immediate: false }))
    await flushPromises()
    expect(client.passkey.listUserPasskeys).not.toHaveBeenCalled()
    expect(passkeys.passkeys.value).toBeUndefined()
  })

  it('rename unwraps, refreshes, and throws on an error envelope', async () => {
    const passkeys = inSetup(() => usePasskeys({ immediate: false }))
    await passkeys.rename('pk1', 'Desk key')
    expect(client.passkey.updatePasskey).toHaveBeenCalledWith({ id: 'pk1', name: 'Desk key' })
    expect(client.passkey.listUserPasskeys).toHaveBeenCalled()

    client.passkey.deletePasskey.mockResolvedValueOnce({ error: { message: 'denied' } })
    await expect(passkeys.remove('pk1')).rejects.toThrow('denied')
    expect(passkeys.error.value).toBe('denied')
  })

  it('add registers a passkey then refreshes', async () => {
    const passkeys = inSetup(() => usePasskeys({ immediate: false }))
    await passkeys.add()
    expect(client.passkey.addPasskey).toHaveBeenCalled()
    expect(client.passkey.listUserPasskeys).toHaveBeenCalled()
  })
})

describe('useSessions', () => {
  const now = Date.now()
  const rows = [
    { id: 's-current', userAgent: 'Chrome Mac OS X', createdAt: now - DAY * 3, updatedAt: now - DAY, expiresAt: now + DAY * 6, current: true },
    { id: 's-other', userAgent: 'Firefox Windows', createdAt: now - DAY * 2, updatedAt: now - DAY, expiresAt: now + DAY * 5, current: false },
    { id: 's-expired', userAgent: 'Safari iPhone', createdAt: now - DAY * 30, updatedAt: now - DAY * 23, expiresAt: now - DAY * 16, current: false },
  ]

  function withSessions() {
    let result!: ReturnType<typeof useSessions>
    mount(defineComponent({
      setup() {
        result = useSessions({ api: sessionsApi })
        return () => h('div')
      },
    }), {
      global: {
        provide: {
          [ConvexAuthStateKey as symbol]: {
            isLoading: computed(() => false),
            isAuthenticated: computed(() => user.value !== null),
            isRefreshing: computed(() => false),
          },
        },
      },
    })
    return result
  }

  beforeEach(() => {
    sessionRows.value = rows
  })

  it('lists live sessions of any age, drops expired ones and marks the current one', () => {
    const sessions = withSessions()
    expect(sessions.sessions.value?.map(session => session.id)).toEqual(['s-current', 's-other'])
    expect(sessions.current.value?.id).toBe('s-current')
    expect(sessions.isLoading.value).toBe(false)
    expect(sessions.sessions.value?.[0]).not.toHaveProperty('token')
  })

  it('is loading until the first read, and empty for a claimless reply', () => {
    sessionRows.value = undefined
    const sessions = withSessions()
    expect(sessions.isLoading.value).toBe(true)
    sessionRows.value = null
    expect(sessions.sessions.value).toEqual([])
    expect(sessions.isLoading.value).toBe(false)
  })

  it('is empty without querying when signed out', () => {
    user.value = null
    const sessions = withSessions()
    expect(sessions.sessions.value).toEqual([])
    expect(sessions.isLoading.value).toBe(false)
  })

  it('revokes by id and surfaces the message of a refusal', async () => {
    const sessions = withSessions()
    await sessions.revoke('s-other')
    expect(revokeSessionMutation).toHaveBeenCalledWith({ sessionId: 's-other' })

    revokeSessionMutation.mockRejectedValueOnce(Object.assign(new Error('[CONVEX M(auth:revokeSession)] Uncaught ConvexError'), { data: 'Session not found.' }))
    await expect(sessions.revoke('s-gone')).rejects.toThrow('Session not found.')
    expect(sessions.error.value).toBe('Session not found.')
  })

  it('revokeOthers goes through the auth client and throws on failure', async () => {
    const sessions = withSessions()
    await sessions.revokeOthers()
    expect(client.revokeOtherSessions).toHaveBeenCalled()

    client.revokeOtherSessions.mockResolvedValueOnce({ error: { message: 'nope' } })
    await expect(sessions.revokeOthers()).rejects.toThrow('nope')
    expect(sessions.error.value).toBe('nope')
  })
})

describe('describeUserAgent', () => {
  it('labels browser and platform', () => {
    expect(describeUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120 Safari/537')).toBe('Chrome · macOS')
    expect(describeUserAgent('Mozilla/5.0 (Windows NT 10.0) Gecko Firefox/121')).toBe('Firefox · Windows')
    expect(describeUserAgent(null)).toBe('unknown device')
  })
})

describe('useAuth account additions', () => {
  it('updateUser forwards profile fields', async () => {
    const auth = inSetup(() => useAuth())
    await auth.updateUser({ name: 'Ada L.' })
    expect(client.updateUser).toHaveBeenCalledWith({ name: 'Ada L.' })
  })

  it('sendVerificationEmail targets the signed-in address', async () => {
    const auth = inSetup(() => useAuth())
    await auth.sendVerificationEmail('/security')
    expect(client.sendVerificationEmail).toHaveBeenCalledWith({ email: 'ada@example.com', callbackURL: '/security' })
  })

  it('sendVerificationEmail rejects when signed out', async () => {
    user.value = null
    const auth = inSetup(() => useAuth())
    await expect(auth.sendVerificationEmail()).rejects.toThrow('No signed-in user')
  })
})
