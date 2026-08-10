import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

const user = ref<Record<string, unknown> | null>({ email: 'ada@example.com', emailVerified: false })

const client = {
  passkey: {
    addPasskey: vi.fn(async () => ({})),
    listUserPasskeys: vi.fn(async () => ({ data: [{ id: 'pk1', name: 'Laptop', createdAt: '2026-01-01' }] })),
    updatePasskey: vi.fn(async () => ({})),
    deletePasskey: vi.fn(async () => ({})),
  },
  listSessions: vi.fn(async () => ({
    data: [
      { token: 'current-token', userAgent: 'Chrome Mac OS X', createdAt: '2026-01-01' },
      { token: 'other-token', userAgent: 'Firefox Windows', createdAt: '2026-01-02' },
    ],
  })),
  revokeSession: vi.fn(async () => ({})),
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

vi.mock('nuxt-convex-module/better-auth/client', () => ({
  useAuth: () => ({
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
  it('loads on mount and marks the current session', async () => {
    const sessions = inSetup(() => useSessions())
    await flushPromises()
    expect(sessions.sessions.value).toHaveLength(2)
    expect(sessions.current.value?.token).toBe('current-token')
  })

  it('revoke and revokeOthers unwrap, refresh, and throw on failure', async () => {
    const sessions = inSetup(() => useSessions({ immediate: false }))
    await sessions.revoke('other-token')
    expect(client.revokeSession).toHaveBeenCalledWith({ token: 'other-token' })

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
