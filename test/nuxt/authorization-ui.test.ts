import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useNuxtApp } from '#imports'

// The base package resolves `#convex/auth-client` (a Nuxt alias) at module
// scope — mock it (and the Convex client) so these tests run standalone.
const user = ref<Record<string, unknown> | null>(null)
const isLoading = ref(false)
const fetchAccessToken = vi.fn(async () => 'token')

type AuthRead<T> = { data: T | null, isPending: boolean, error?: Record<string, unknown> | null }
const organizationList = ref<AuthRead<Array<Record<string, unknown>>>>({ data: [], isPending: false })
const activeOrganization = ref<AuthRead<Record<string, unknown>>>({ data: null, isPending: false })
const activeMember = ref<AuthRead<Record<string, unknown>>>({ data: null, isPending: false })

// The auth client's answers as better-fetch shapes them: `{ data, error }`.
type Answer = { data?: unknown, error?: Record<string, unknown> | null }
const ok = (data: unknown = { success: true }): Answer => ({ data, error: null })
const ada = { id: 'u1', name: 'Ada', email: 'ada@example.com' }
const member = { id: 'm2', organizationId: 'org-2', userId: 'u1', role: 'member' }
/** The membership as `useWorkspace()` resolves it: the workspace's id under its own name. */
const joined = { id: 'm2', workspaceId: 'org-2', userId: 'u1', role: 'member' }

const client = {
  signOut: vi.fn(async (): Promise<Answer> => ok()),
  emailOtp: { sendVerificationOtp: vi.fn(async (): Promise<Answer> => ok()) },
  signIn: {
    emailOtp: vi.fn(async (): Promise<Answer> => ok({ token: 't', user: ada })),
    passkey: vi.fn(async (): Promise<Answer> => ok({ session: { id: 's1' }, user: ada })),
  },
  passkey: { addPasskey: vi.fn(async (): Promise<Answer> => ok({ id: 'pk1', name: 'Laptop', createdAt: '2026-10-01' })) },
  updateUser: vi.fn(async (): Promise<Answer> => ok({ status: true })),
  deleteUser: vi.fn(async (): Promise<Answer> => ok()),
  admin: {
    checkRolePermission: vi.fn(({ role }: { role: string }) => role === 'admin'),
  },
  useListOrganizations: () => organizationList,
  useActiveOrganization: () => activeOrganization,
  useActiveMember: () => activeMember,
  organization: {
    create: vi.fn(async (): Promise<Answer> => ok({ id: 'org-2', name: 'Beta', slug: 'beta', createdAt: 1 })),
    setActive: vi.fn(async (): Promise<Answer> => ok({ id: 'org-2' })),
    inviteMember: vi.fn(async (): Promise<Answer> => ok({ id: 'inv-1', email: 'new@example.com', role: 'member', status: 'pending', organizationId: 'org-1', inviterId: 'u1', expiresAt: 1 })),
    leave: vi.fn(async (): Promise<Answer> => ok({ id: 'm1' })),
    acceptInvitation: vi.fn(async (): Promise<Answer> => ok({ invitation: { id: 'inv-1' }, member })),
    rejectInvitation: vi.fn(async (): Promise<Answer> => ok({ invitation: { id: 'inv-1' } })),
    cancelInvitation: vi.fn(async (): Promise<Answer> => ok({ id: 'inv-1' })),
    getInvitation: vi.fn(async (): Promise<Answer> => ok({ id: 'inv-1', organizationName: 'Beta' })),
    listUserInvitations: vi.fn(async (): Promise<Answer> => ok([{ id: 'inv-1' }])),
  },
}

const setAuth = vi.fn()
const sessionState = ref<{ data: unknown, isPending: boolean }>({ data: null, isPending: false })

vi.mock('nuxt-convex-module/better-auth/client', () => ({
  useBetterAuth: () => ({
    isLoading: computed(() => isLoading.value),
    isAuthenticated: computed(() => user.value !== null),
    fetchAccessToken,
    client,
    session: sessionState,
    user: computed(() => user.value),
    authVersion: computed(() => (user.value ? 'session-1' : null)),
  }),
}))
vi.mock('nuxt-convex-module/client', () => ({
  useConvex: () => ({ setAuth }),
}))

const { useAuthSession: useAuth } = await import('../../src/runtime/vue/utils/auth-session')
const { useWorkspace } = await import('../../src/runtime/vue/composables/use-workspace')
const { useLoginFlow } = await import('../../src/runtime/vue/composables/use-login-flow')
const { useActionState } = await import('../../src/runtime/vue/utils/action-state')
const { getBackendError } = await import('../../src/runtime/vue/utils/backend-error')
const { takeLocalSignOut } = await import('../../src/runtime/vue/utils/local-sign-out')
const { registerComponents } = await import('../helpers/register-components')
await registerComponents('Gate')
const { default: Gate } = await import('../../src/runtime/vue/components/shell/Gate.vue')
const { useAuth: usePublicAuth } = await import('../../src/runtime/vue/composables/use-auth')

/**
 * Mount a boundary as the browser hydrates a server render of it: what its
 * first render shows (the one hydration compares to the server's markup),
 * after which it must show `then` once mounted.
 */
async function firstRenderWhileHydrating(mountIt: () => ReturnType<typeof mount>, then: string): Promise<string> {
  const nuxtApp = useNuxtApp()
  nuxtApp.isHydrating = true
  try {
    const wrapper = mountIt()
    const first = wrapper.find('#pending').exists() ? 'pending' : wrapper.html()
    nuxtApp.isHydrating = false
    await nextTick()
    expect(wrapper.find(then).exists()).toBe(true)
    return first
  }
  finally {
    nuxtApp.isHydrating = false
  }
}

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
  user.value = null
  isLoading.value = false
  organizationList.value = { data: [], isPending: false }
  activeOrganization.value = { data: null, isPending: false }
  activeMember.value = { data: null, isPending: false }
})

describe('extended useAuth', () => {
  it('resolves each passwordless action with its data, not the client\'s envelope', async () => {
    const auth = inSetup(() => useAuth())
    await expect(auth.sendOtp('ada@example.com')).resolves.toBeUndefined()
    expect(client.emailOtp.sendVerificationOtp).toHaveBeenCalledWith({ email: 'ada@example.com', type: 'sign-in' })
    await expect(auth.signInWithOtp({ email: 'ada@example.com', otp: '123456' })).resolves.toEqual(ada)
    await expect(auth.signInWithPasskey()).resolves.toEqual(ada)
    await expect(auth.registerPasskey({ name: 'Laptop' })).resolves.toMatchObject({ id: 'pk1', name: 'Laptop' })
    expect(client.passkey.addPasskey).toHaveBeenCalledWith({ name: 'Laptop' })
    await expect(auth.updateUser({ name: 'Ada L.' })).resolves.toBeUndefined()
    await expect(auth.deleteAccount('ada@example.com')).resolves.toBeUndefined()
    // The typed confirmation rides in the body, where the request guard checks it.
    expect(client.deleteUser).toHaveBeenCalledWith({ confirmation: 'ada@example.com' })
    await expect(auth.signOut()).resolves.toBeUndefined()
    expect(client.signOut).toHaveBeenCalled()
    expect(auth.error.value).toBeNull()
  })

  // The client resolves a refusal as `{ data: null, error }`: an action that
  // passed it on would report a refused sign-in as done.
  it('rejects every action the server refuses, keeping the failure in error', async () => {
    const auth = inSetup(() => useAuth())
    const refused: Answer = { data: null, error: { status: 403, code: 'BANNED_USER', message: 'Banned', statusText: 'Forbidden' } }
    const calls = [
      [client.emailOtp.sendVerificationOtp, () => auth.sendOtp('ada@example.com')],
      [client.signIn.emailOtp, () => auth.signInWithOtp({ email: 'ada@example.com', otp: '1' })],
      [client.signIn.passkey, () => auth.signInWithPasskey()],
      [client.passkey.addPasskey, () => auth.registerPasskey()],
      [client.updateUser, () => auth.updateUser({ name: 'x' })],
      [client.deleteUser, () => auth.deleteAccount('ada@example.com')],
      [client.signOut, () => auth.signOut()],
    ] as const
    for (const [call, action] of calls) {
      call.mockResolvedValueOnce(refused)
      const rejection = await action().then(() => null, (cause: unknown) => cause)
      // What the call threw, as it threw it: an Error carrying the envelope's error.
      expect(rejection).toBeInstanceOf(Error)
      expect((rejection as Error).cause).toBe(refused.error)
      expect(auth.error.value).toMatchObject({ code: 'forbidden', data: { reason: 'banned' } })
    }
  })

  it('is pending while an action runs, and the next action clears the last failure', async () => {
    const auth = inSetup(() => useAuth())
    client.emailOtp.sendVerificationOtp.mockResolvedValueOnce({ data: null, error: { status: 429, retryAfter: 2000, statusText: 'Too Many Requests' } })
    await expect(auth.sendOtp('ada@example.com')).rejects.toThrow()
    expect(auth.error.value).toMatchObject({ code: 'rate_limited', data: { retryAfter: 2000 } })

    let release!: () => void
    client.emailOtp.sendVerificationOtp.mockImplementationOnce(() => new Promise<Answer>((resolve) => {
      release = () => resolve(ok())
    }))
    const sending = auth.sendOtp('ada@example.com')
    expect(auth.isPending.value).toBe(true)
    expect(auth.error.value).toBeNull()
    release()
    await sending
    expect(auth.isPending.value).toBe(false)
  })

  // The session-ended watch leaves a sign-out this tab made to the app,
  // which navigates on its own: never to sign-in with the last path.
  it('marks its own sign-out for the session-ended watch, and forgets a sign-out that failed', async () => {
    sessionState.value = { data: { session: { id: 'session-1' }, user: ada }, isPending: false }
    const auth = inSetup(() => useAuth())
    await auth.signOut()
    expect(takeLocalSignOut('session-1')).toBe(true)
    expect(takeLocalSignOut('session-1')).toBe(false)

    client.signOut.mockResolvedValueOnce({ data: null, error: { status: 500, message: 'Down', statusText: 'Internal Server Error' } })
    await expect(auth.signOut()).rejects.toThrow('Down')
    expect(takeLocalSignOut('session-1')).toBe(false)
    sessionState.value = { data: null, isPending: false }
  })

  it('forwards every addPasskey option registerPasskey takes', async () => {
    const auth = inSetup(() => useAuth())
    await auth.registerPasskey({ name: 'Key', authenticatorAttachment: 'cross-platform', useAutoRegister: true, context: 'onboarding' })
    expect(client.passkey.addPasskey).toHaveBeenCalledWith({ name: 'Key', authenticatorAttachment: 'cross-platform', useAutoRegister: true, context: 'onboarding' })
  })

  it('drops a failure once the session ends', async () => {
    user.value = ada
    const auth = inSetup(() => useAuth())
    client.updateUser.mockResolvedValueOnce({ data: null, error: { status: 400, message: 'Bad name', statusText: 'Bad Request' } })
    await expect(auth.updateUser({ name: '' })).rejects.toThrow('Bad name')
    expect(auth.error.value?.message).toBe('Bad name')
    user.value = null
    await nextTick()
    expect(auth.error.value).toBeNull()
  })

  it('reads role/banned from the session user, defaulting to "user"', () => {
    const auth = inSetup(() => useAuth())
    expect(auth.role.value).toBe('user')
    expect(auth.banned.value).toBe(false)

    user.value = { id: 'u1', role: 'admin,editor', banned: true }
    expect(auth.role.value).toBe('admin,editor')
    expect(auth.hasRole('editor')).toBe(true)
    expect(auth.hasRole(['owner'])).toBe(false)
    expect(auth.banned.value).toBe(true)
  })

  it('hands an app only the session, the role, the visit and signing out', () => {
    user.value = { id: 'u1', role: 'support,admin', banned: false }
    const auth = inSetup(() => usePublicAuth())
    expect(Object.keys(auth).sort()).toEqual(['hasRole', 'impersonating', 'isLoading', 'isSignedIn', 'role', 'session', 'signOut', 'user'])
    expect(auth.hasRole('admin')).toBe(true)
    expect(auth.isSignedIn.value).toBe(true)
    expect(auth.impersonating.value).toBe(false)
    expect(auth.user.value).toMatchObject({ id: 'u1', banned: false })
  })
})

describe('the backend:error hook', () => {
  const refused = { data: null, error: { status: 500, statusText: 'Internal Server Error', message: 'boom' } }

  /** What the app's `backend:error` listeners heard while `act` ran. */
  async function heard(act: () => Promise<unknown>): Promise<unknown[]> {
    const calls: unknown[] = []
    const unhook = useNuxtApp().hook('backend:error', (context) => {
      calls.push(context)
    })
    try {
      await act().catch(() => {})
    }
    finally {
      unhook()
    }
    return calls
  }

  it('hears a failed action', async () => {
    const auth = inSetup(() => useAuth())
    client.updateUser.mockResolvedValueOnce(refused)
    expect(await heard(() => auth.updateUser({ name: 'Ada' }))).toHaveLength(1)
  })

  it('never hears a read, even one run as an action', async () => {
    const organization = inSetup(() => useWorkspace())
    client.organization.getInvitation.mockResolvedValueOnce(refused)
    client.organization.listUserInvitations.mockResolvedValueOnce(refused)
    expect(await heard(() => organization.getInvitation('inv-1'))).toEqual([])
    expect(await heard(() => organization.listReceivedInvitations())).toEqual([])
    // Each still rejected: the read failed, it just was not an action's failure.
    client.organization.getInvitation.mockResolvedValueOnce(refused)
    await expect(organization.getInvitation('inv-1')).rejects.toThrow()
  })

  it('never hears a step machine\'s calls, which show in its own error', async () => {
    const flow = inSetup(() => useLoginFlow())
    flow.email.value = 'ada@example.com'
    client.emailOtp.sendVerificationOtp.mockResolvedValueOnce(refused)
    expect(await heard(() => flow.sendCode())).toEqual([])
    expect(flow.error.value).not.toBeNull()
  })

  it('never hears a run marked silent', async () => {
    const { run } = inSetup(() => useActionState())
    expect(await heard(() => run(() => Promise.reject(new Error('read failed')), { silent: true }))).toEqual([])
    expect(await heard(() => run(() => Promise.reject(new Error('action failed'))))).toHaveLength(1)
  })
})

describe('<Gate role>', () => {
  const slots = {
    default: () => h('div', { id: 'granted' }, 'granted'),
    fallback: () => h('div', { id: 'denied' }, 'denied'),
    placeholder: () => h('div', { id: 'pending' }, 'pending'),
  }

  it('renders placeholder while loading, fallback when signed out', () => {
    isLoading.value = true
    const loading = mount(Gate, { props: { role: 'admin' }, slots })
    expect(loading.find('#pending').exists()).toBe(true)

    isLoading.value = false
    const signedOut = mount(Gate, { props: { role: 'admin' }, slots })
    expect(signedOut.find('#denied').exists()).toBe(true)
  })

  it('gates by role, and by a sign-in alone', () => {
    user.value = { id: 'u1', role: 'admin' }
    expect(mount(Gate, { props: { role: 'admin' }, slots }).find('#granted').exists()).toBe(true)
    expect(mount(Gate, { props: { role: ['owner', 'admin'] }, slots }).find('#granted').exists()).toBe(true)
    expect(mount(Gate, { props: { role: 'owner' }, slots }).find('#denied').exists()).toBe(true)
    expect(mount(Gate, { props: { signedIn: true }, slots }).find('#granted').exists()).toBe(true)
    user.value = null
    expect(mount(Gate, { props: { signedIn: true }, slots }).find('#denied').exists()).toBe(true)
  })

  it('denies banned users regardless of role', () => {
    user.value = { id: 'u1', role: 'admin', banned: true }
    expect(mount(Gate, { props: { role: 'admin' }, slots }).find('#denied').exists()).toBe(true)
  })

  // The server always renders the placeholder (the session is still loading
  // there), while the browser may hold a settled session as it hydrates.
  it('renders the placeholder while the page hydrates, as the server did, then decides', async () => {
    user.value = { id: 'u1', role: 'admin' }
    expect(await firstRenderWhileHydrating(() => mount(Gate, { props: { role: 'admin' }, slots }), '#granted')).toBe('pending')
  })
})

describe('useWorkspace', () => {
  const workspace = { id: 'org-1', name: 'Acme', slug: 'acme', createdAt: 1, members: [], invitations: [] }

  it('exposes workspaces, the active one, and the workspace role', () => {
    user.value = { id: 'u1' }
    organizationList.value = { data: [workspace], isPending: false }
    activeOrganization.value = { data: workspace, isPending: false }
    activeMember.value = { data: { id: 'm1', organizationId: 'org-1', userId: 'u1', role: 'owner' }, isPending: false }

    const organization = inSetup(() => useWorkspace())
    expect(organization.workspaces.value).toHaveLength(1)
    expect(organization.current.value?.id).toBe('org-1')
    expect(organization.role.value).toBe('owner')
    expect(organization.isLoading.value).toBe(false)
  })

  it('setActive switches workspace, refreshes the token, and re-authenticates Convex', async () => {
    user.value = { id: 'u1' }
    const organization = inSetup(() => useWorkspace())

    await organization.setActive('org-2')

    expect(client.organization.setActive).toHaveBeenCalledWith({ organizationId: 'org-2' })
    expect(fetchAccessToken).toHaveBeenCalledWith({ forceRefreshToken: true })
    expect(setAuth).toHaveBeenCalledWith(fetchAccessToken)
    // Ordering matters: the fresh token must be cached before re-auth reads it.
    expect(fetchAccessToken.mock.invocationCallOrder[0]!)
      .toBeLessThan(setAuth.mock.invocationCallOrder[0]!)
  })

  it('invite defaults to the member role; leave defaults to the active workspace', async () => {
    user.value = { id: 'u1' }
    activeOrganization.value = { data: workspace, isPending: false }
    const organization = inSetup(() => useWorkspace())

    await organization.invite({ email: 'new@example.com' })
    expect(client.organization.inviteMember).toHaveBeenCalledWith({ email: 'new@example.com', role: 'member', organizationId: undefined })

    await organization.leave()
    expect(client.organization.leave).toHaveBeenCalledWith({ organizationId: 'org-1' })
  })

  // The client resolves a refusal as `{ error }`: an action that resolved it
  // would report a refused invitation as sent, or a refused one as accepted.
  it('rejects every action the server refuses, and leaves the workspace claim alone', async () => {
    user.value = { id: 'u1' }
    activeOrganization.value = { data: workspace, isPending: false }
    const organization = inSetup(() => useWorkspace())
    const refused = { data: null, error: { status: 403, message: 'Not allowed' } }
    const { inviteMember, setActive, create, leave, acceptInvitation, rejectInvitation, cancelInvitation } = client.organization
    for (const call of [inviteMember, setActive, create, leave, acceptInvitation, rejectInvitation, cancelInvitation]) call.mockResolvedValueOnce(refused)

    // In the package's words, never the auth library's: its refusal stays the cause.
    const actions = [
      () => organization.invite({ email: 'new@example.com' }),
      () => organization.setActive('org-2'),
      () => organization.create({ name: 'Beta', slug: 'beta' }),
      () => organization.leave(),
      () => organization.acceptInvitation('inv-1', { activate: true }),
      () => organization.declineInvitation('inv-1'),
      () => organization.cancelInvitation('inv-1'),
    ]
    for (const action of actions) {
      const rejection = await action().then(() => null, (cause: unknown) => cause as Error)
      expect(rejection?.message).toBe('Something went wrong.')
      expect((rejection?.cause as Error).message).toBe('Not allowed')
    }
    expect(fetchAccessToken).not.toHaveBeenCalled()
    expect(setAuth).not.toHaveBeenCalled()
  })

  it('rejects a rate-limited invitation with the wait', async () => {
    user.value = { id: 'u1' }
    const organization = inSetup(() => useWorkspace())
    client.organization.inviteMember.mockResolvedValueOnce({ data: null, error: { status: 429, retryAfter: 30_000, statusText: 'Too Many Requests' } })
    const rejection = await organization.invite({ email: 'new@example.com' }).catch((cause: unknown) => cause)
    expect(getBackendError(rejection)).toMatchObject({ code: 'rate_limited', data: { retryAfter: 30_000 } })
    expect(organization.error.value).toMatchObject({ code: 'rate_limited', data: { retryAfter: 30_000 } })
  })

  it('resolves each action with its data', async () => {
    user.value = { id: 'u1' }
    activeOrganization.value = { data: workspace, isPending: false }
    const organization = inSetup(() => useWorkspace())

    await expect(organization.create({ name: 'Beta', slug: 'beta' })).resolves.toMatchObject({ id: 'org-2', slug: 'beta' })
    await expect(organization.invite({ email: 'new@example.com' })).resolves.toMatchObject({ id: 'inv-1', status: 'pending' })
    await expect(organization.declineInvitation('inv-1')).resolves.toBeUndefined()
    await expect(organization.cancelInvitation('inv-1')).resolves.toBeUndefined()
    await expect(organization.getInvitation('inv-1')).resolves.toMatchObject({ workspaceName: 'Beta' })
    await expect(organization.getInvitation('inv-1')).resolves.not.toHaveProperty('organizationName')
    await expect(organization.listReceivedInvitations()).resolves.toEqual([{ id: 'inv-1' }])
  })

  it('accepting resolves with the membership and, asked to, switches to its workspace', async () => {
    user.value = { id: 'u1' }
    const organization = inSetup(() => useWorkspace())

    await expect(organization.acceptInvitation('inv-1', { activate: true })).resolves.toEqual(joined)
    expect(client.organization.setActive).toHaveBeenCalledWith({ organizationId: 'org-2' })
    expect(setAuth).toHaveBeenCalled()
  })

  it('resolves an accepted invitation even when the switch to its workspace fails, keeping that failure in error', async () => {
    user.value = { id: 'u1' }
    const organization = inSetup(() => useWorkspace())
    client.organization.setActive.mockResolvedValueOnce({ data: null, error: { status: 403, code: 'NOT_A_MEMBER', message: 'Not a member', statusText: 'Forbidden' } })

    await expect(organization.acceptInvitation('inv-1', { activate: true })).resolves.toEqual(joined)
    expect(organization.error.value).toMatchObject({ code: 'forbidden', data: { reason: 'not_a_member' }, message: 'You don\'t have access to this.' })
  })

  it('reads a missing invitation as null and rejects any other refusal', async () => {
    user.value = { id: 'u1' }
    const organization = inSetup(() => useWorkspace())
    // What Better Auth answers for an unknown, expired or answered invitation: a bare 400.
    client.organization.getInvitation.mockResolvedValueOnce({ data: null, error: { status: 400, message: 'Invitation not found!', statusText: 'BAD_REQUEST' } })
    await expect(organization.getInvitation('gone')).resolves.toBeNull()
    expect(organization.error.value).toBeNull()

    // A 400 that names what is wrong is no missing invitation: it rejects,
    // in the package's words, the auth library's refusal as its cause.
    for (const code of ['ORGANIZATION_NOT_FOUND', 'INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION', 'VALIDATION_ERROR']) {
      client.organization.getInvitation.mockResolvedValueOnce({ data: null, error: { status: 400, code, message: code, statusText: 'BAD_REQUEST' } })
      const rejected = await organization.getInvitation('inv-1').catch((error: Error) => error)
      expect((rejected as Error).message, code).not.toContain(code)
      expect(getBackendError((rejected as Error).cause), code).toBeNull()
    }

    client.organization.getInvitation.mockResolvedValueOnce({ data: null, error: { status: 403, code: 'YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION', message: 'You are not the recipient of the invitation', statusText: 'Forbidden' } })
    await expect(organization.getInvitation('theirs')).rejects.toThrow('You don\'t have access to this.')
    expect(organization.error.value).toMatchObject({ code: 'forbidden', data: { reason: 'you_are_not_the_recipient_of_the_invitation' } })

    client.organization.listUserInvitations.mockResolvedValueOnce({ data: null, error: { status: 401, message: 'Unauthorized', statusText: 'Unauthorized' } })
    await expect(organization.listReceivedInvitations()).rejects.toThrow('Sign in to continue.')
  })

  it('shows a failed read of the workspace state in error, never while signed out', async () => {
    user.value = { id: 'u1' }
    activeOrganization.value = { data: null, isPending: false, error: { status: 500, message: 'Database down', statusText: 'Internal Server Error' } }
    const organization = inSetup(() => useWorkspace())
    expect(organization.error.value).toMatchObject({ code: 'unavailable', message: 'Database down' })

    // An action's failure goes over the read's.
    client.organization.setActive.mockResolvedValueOnce({ data: null, error: { status: 403, code: 'NOT_A_MEMBER', message: 'Not a member', statusText: 'Forbidden' } })
    await expect(organization.setActive('org-9')).rejects.toThrow('You don\'t have access to this.')
    expect(organization.error.value).toMatchObject({ code: 'forbidden', data: { reason: 'not_a_member' }, message: 'You don\'t have access to this.' })

    user.value = null
    await nextTick()
    expect(organization.error.value).toBeNull()
  })
})

describe('<Gate workspace>', () => {
  const slots = {
    default: (props: { workspace?: { name: string } }) => h('div', { id: 'inside' }, props.workspace?.name),
    fallback: () => h('div', { id: 'no-workspace' }),
    placeholder: () => h('div', { id: 'pending' }),
  }

  it('renders fallback without an active workspace and the slot with one', () => {
    user.value = { id: 'u1' }
    expect(mount(Gate, { props: { workspace: true }, slots }).find('#no-workspace').exists()).toBe(true)

    activeOrganization.value = {
      data: { id: 'org-1', name: 'Acme', slug: 'acme', createdAt: 1, members: [], invitations: [] },
      isPending: false,
    }
    const inside = mount(Gate, { props: { workspace: true }, slots })
    expect(inside.find('#inside').text()).toBe('Acme')
  })

  it('lets in only the built-in roles it names, in the active workspace', () => {
    user.value = { id: 'u1' }
    activeOrganization.value = { data: { id: 'org-1', name: 'Acme', slug: 'acme', createdAt: 1, members: [], invitations: [] }, isPending: false }
    activeMember.value = { data: { id: 'm1', organizationId: 'org-1', userId: 'u1', role: 'owner' }, isPending: false }
    expect(mount(Gate, { props: { workspace: 'owner' }, slots }).find('#inside').text()).toBe('Acme')
    expect(mount(Gate, { props: { workspace: ['owner', 'admin'] }, slots }).find('#inside').exists()).toBe(true)
    expect(mount(Gate, { props: { workspace: 'admin' }, slots }).find('#no-workspace').exists()).toBe(true)
  })

  it('renders placeholder while workspace state loads', () => {
    user.value = { id: 'u1' }
    activeOrganization.value = { data: null, isPending: true }
    expect(mount(Gate, { props: { workspace: true }, slots }).find('#pending').exists()).toBe(true)
  })

  it('renders the placeholder while the page hydrates, as the server did, then decides', async () => {
    user.value = { id: 'u1' }
    activeOrganization.value = { data: { id: 'org-1', name: 'Acme', slug: 'acme', createdAt: 1, members: [], invitations: [] }, isPending: false }
    expect(await firstRenderWhileHydrating(() => mount(Gate, { props: { workspace: true }, slots }), '#inside')).toBe('pending')
  })
})
