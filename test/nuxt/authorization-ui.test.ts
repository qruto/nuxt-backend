import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'

// The base package resolves `#convex/auth-client` (a Nuxt alias) at module
// scope — mock it (and the Convex client) so these tests run standalone.
const user = ref<Record<string, unknown> | null>(null)
const isLoading = ref(false)
const fetchAccessToken = vi.fn(async () => 'token')

const organizationList = ref<{ data: Array<Record<string, unknown>> | null, isPending: boolean }>({ data: [], isPending: false })
const activeOrganization = ref<{ data: Record<string, unknown> | null, isPending: boolean }>({ data: null, isPending: false })
const activeMember = ref<{ data: Record<string, unknown> | null, isPending: boolean }>({ data: null, isPending: false })

const client = {
  signOut: vi.fn(async () => ({})),
  emailOtp: { sendVerificationOtp: vi.fn(async () => ({})) },
  signIn: { emailOtp: vi.fn(async () => ({})), passkey: vi.fn(async () => ({})) },
  passkey: { addPasskey: vi.fn(async () => ({})) },
  changeEmail: vi.fn(async () => ({})),
  deleteUser: vi.fn(async () => ({})),
  admin: {
    checkRolePermission: vi.fn(({ role }: { role: string }) => role === 'admin'),
  },
  useListOrganizations: () => organizationList,
  useActiveOrganization: () => activeOrganization,
  useActiveMember: () => activeMember,
  organization: {
    create: vi.fn(async () => ({})),
    setActive: vi.fn(async () => ({})),
    inviteMember: vi.fn(async () => ({})),
    leave: vi.fn(async () => ({})),
  },
}

const setAuth = vi.fn()

vi.mock('nuxt-convex-module/better-auth/client', () => ({
  useAuth: () => ({
    isLoading: computed(() => isLoading.value),
    isAuthenticated: computed(() => user.value !== null),
    fetchAccessToken,
    client,
    session: ref({ data: null, isPending: false }),
    user: computed(() => user.value),
    authVersion: computed(() => (user.value ? 'session-1' : null)),
  }),
}))
vi.mock('nuxt-convex-module/client', () => ({
  useConvex: () => ({ setAuth }),
}))

const { useAuth } = await import('../../src/runtime/vue/composables/use-auth')
const { useOrganization } = await import('../../src/runtime/vue/composables/use-organization')
const { RoleBoundary } = await import('../../src/runtime/vue/components/role-boundary')
const { OrganizationBoundary } = await import('../../src/runtime/vue/components/organization-boundary')

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
  it('wraps the passwordless flows over the client', async () => {
    const auth = inSetup(() => useAuth())
    await auth.sendOtp('ada@example.com')
    expect(client.emailOtp.sendVerificationOtp).toHaveBeenCalledWith({ email: 'ada@example.com', type: 'sign-in' })
    await auth.signInWithOtp({ email: 'ada@example.com', otp: '123456' })
    expect(client.signIn.emailOtp).toHaveBeenCalled()
    await auth.signInWithPasskey()
    expect(client.signIn.passkey).toHaveBeenCalled()
    await auth.registerPasskey('ctx')
    expect(client.passkey.addPasskey).toHaveBeenCalledWith({ context: 'ctx' })
    await auth.changeEmail('new@example.com')
    await auth.deleteAccount()
    await auth.signOut()
    expect(client.signOut).toHaveBeenCalled()
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

  it('checks permissions per comma-separated role via the admin client', () => {
    user.value = { id: 'u1', role: 'support,admin' }
    const auth = inSetup(() => useAuth())
    expect(auth.can({ user: ['ban'] })).toBe(true)
    expect(client.admin.checkRolePermission).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'support' }),
    )
  })
})

describe('RoleBoundary', () => {
  const slots = {
    default: () => h('div', { id: 'granted' }, 'granted'),
    fallback: () => h('div', { id: 'denied' }, 'denied'),
    placeholder: () => h('div', { id: 'pending' }, 'pending'),
  }

  it('renders placeholder while loading, fallback when signed out', () => {
    isLoading.value = true
    const loading = mount(RoleBoundary, { props: { role: 'admin' }, slots })
    expect(loading.find('#pending').exists()).toBe(true)

    isLoading.value = false
    const signedOut = mount(RoleBoundary, { props: { role: 'admin' }, slots })
    expect(signedOut.find('#denied').exists()).toBe(true)
  })

  it('gates by role and permission', () => {
    user.value = { id: 'u1', role: 'admin' }
    expect(mount(RoleBoundary, { props: { role: 'admin' }, slots }).find('#granted').exists()).toBe(true)
    expect(mount(RoleBoundary, { props: { role: 'owner' }, slots }).find('#denied').exists()).toBe(true)
    expect(mount(RoleBoundary, { props: { permission: { user: ['ban'] } }, slots }).find('#granted').exists()).toBe(true)

    user.value = { id: 'u1', role: 'user' }
    expect(mount(RoleBoundary, { props: { permission: { user: ['ban'] } }, slots }).find('#denied').exists()).toBe(true)
  })

  it('denies banned users regardless of role', () => {
    user.value = { id: 'u1', role: 'admin', banned: true }
    expect(mount(RoleBoundary, { props: { role: 'admin' }, slots }).find('#denied').exists()).toBe(true)
  })
})

describe('useOrganization', () => {
  const workspace = { id: 'org-1', name: 'Acme', slug: 'acme', createdAt: 1, members: [], invitations: [] }

  it('exposes workspaces, the active one, and the workspace role', () => {
    user.value = { id: 'u1' }
    organizationList.value = { data: [workspace], isPending: false }
    activeOrganization.value = { data: workspace, isPending: false }
    activeMember.value = { data: { id: 'm1', organizationId: 'org-1', userId: 'u1', role: 'owner' }, isPending: false }

    const organization = inSetup(() => useOrganization())
    expect(organization.organizations.value).toHaveLength(1)
    expect(organization.current.value?.id).toBe('org-1')
    expect(organization.role.value).toBe('owner')
    expect(organization.isLoading.value).toBe(false)
  })

  it('setActive switches workspace, refreshes the token, and re-authenticates Convex', async () => {
    user.value = { id: 'u1' }
    const organization = inSetup(() => useOrganization())

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
    const organization = inSetup(() => useOrganization())

    await organization.invite({ email: 'new@example.com' })
    expect(client.organization.inviteMember).toHaveBeenCalledWith({ email: 'new@example.com', role: 'member', organizationId: undefined })

    await organization.leave()
    expect(client.organization.leave).toHaveBeenCalledWith({ organizationId: 'org-1' })
  })
})

describe('OrganizationBoundary', () => {
  const slots = {
    default: (props: { workspace: { name: string } }) => h('div', { id: 'inside' }, props.workspace.name),
    fallback: () => h('div', { id: 'no-workspace' }),
    placeholder: () => h('div', { id: 'pending' }),
  }

  it('renders fallback without an active workspace and the slot with one', () => {
    user.value = { id: 'u1' }
    expect(mount(OrganizationBoundary, { slots }).find('#no-workspace').exists()).toBe(true)

    activeOrganization.value = {
      data: { id: 'org-1', name: 'Acme', slug: 'acme', createdAt: 1, members: [], invitations: [] },
      isPending: false,
    }
    const inside = mount(OrganizationBoundary, { slots })
    expect(inside.find('#inside').text()).toBe('Acme')
  })

  it('renders placeholder while workspace state loads', () => {
    user.value = { id: 'u1' }
    activeOrganization.value = { data: null, isPending: true }
    expect(mount(OrganizationBoundary, { slots }).find('#pending').exists()).toBe(true)
  })
})
