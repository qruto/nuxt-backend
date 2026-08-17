import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, h, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

// ── Controllable composable state ───────────────────────────────────────────

const authed = ref(true)
const user = ref<Record<string, unknown> | null>({ name: 'Ada Lovelace', email: 'ada@example.com', emailVerified: false })

const products = ref<Record<string, { id: string, name: string, prices?: unknown[] } | undefined>>({
  pro: { id: 'prod_pro', name: 'Pro', prices: [{ priceAmount: 900, priceCurrency: 'EUR' }] },
  starter: { id: 'prod_starter', name: 'Starter', prices: [{ priceAmount: 0 }] },
  credits100: { id: 'prod_pack', name: '100 credits', prices: [{ priceAmount: 500, priceCurrency: 'EUR' }] },
})
const subscription = ref<{ id: string, status: string, productId: string, currentPeriodEnd?: string, cancelAtPeriodEnd?: boolean } | null>(null)

const billing = {
  products: computed(() => products.value),
  subscription: computed(() => subscription.value),
  subscriptions: computed(() => []),
  isSubscribed: computed(() => subscription.value != null),
  isLoading: computed(() => false),
  checkout: vi.fn(async () => 'https://billing.example/checkout'),
  gift: vi.fn(async () => ''),
  portal: vi.fn(async () => ''),
  changePlan: vi.fn(async () => {}),
  cancel: vi.fn(async () => {}),
}

const credits = {
  balance: computed(() => 42),
  credited: computed(() => 50),
  consumed: computed(() => 8),
  meterId: computed(() => 'meter_1'),
  isLoading: computed(() => false),
  topUp: vi.fn(async () => 'https://billing.example/topup'),
  gift: vi.fn(async () => ''),
  refresh: vi.fn(async () => {}),
}

const workspaces = ref([
  { id: 'ws1', name: 'Personal', slug: 'personal', createdAt: 1 },
  { id: 'ws2', name: 'Acme', slug: 'acme', createdAt: 2 },
])
const organization = {
  organizations: computed(() => workspaces.value),
  current: computed(() => ({ id: 'ws1', name: 'Personal', slug: 'personal' })),
  member: computed(() => null),
  role: computed(() => 'owner'),
  members: computed(() => []),
  isLoading: computed(() => false),
  setActive: vi.fn(async () => {}),
  create: vi.fn(async () => ({ data: { id: 'ws3' } })),
  invite: vi.fn(),
  leave: vi.fn(),
  acceptInvitation: vi.fn(),
  declineInvitation: vi.fn(),
  cancelInvitation: vi.fn(),
  getInvitation: vi.fn(),
  listReceivedInvitations: vi.fn(async () => []),
}

const auth = {
  isAuthenticated: computed(() => authed.value),
  isLoading: computed(() => false),
  user: computed(() => user.value),
  role: computed(() => 'user'),
  banned: computed(() => false),
  client: {},
  session: ref({ data: null, isPending: false }),
  updateUser: vi.fn(async () => ({})),
  changeEmail: vi.fn(async () => ({})),
  sendVerificationEmail: vi.fn(async () => ({})),
  deleteAccount: vi.fn(async () => ({})),
  signOut: vi.fn(async () => ({})),
  registerPasskey: vi.fn(async () => ({})),
}

const passkeys = {
  passkeys: ref([{ id: 'pk1', name: 'Laptop', createdAt: '2026-01-01' }]),
  isLoading: computed(() => false),
  error: ref<string | null>(null),
  refresh: vi.fn(async () => {}),
  add: vi.fn(async () => {}),
  rename: vi.fn(async () => {}),
  remove: vi.fn(async () => {}),
}

const sessions = {
  sessions: ref([
    { token: 'tok-current', userAgent: 'Chrome Mac OS X', createdAt: '2026-01-01' },
    { token: 'tok-other', userAgent: 'Firefox Windows', createdAt: '2026-01-02' },
  ]),
  current: computed(() => ({ token: 'tok-current', userAgent: 'Chrome Mac OS X', createdAt: '2026-01-01' })),
  isLoading: computed(() => false),
  error: ref<string | null>(null),
  refresh: vi.fn(async () => {}),
  revoke: vi.fn(async () => {}),
  revokeOthers: vi.fn(async () => {}),
}

const backendConfig = {
  billing: {
    plans: [
      { key: 'starter', credits: 50, blurb: 'Start here.' },
      { key: 'pro', credits: 200, features: ['premium'], highlight: true },
    ],
    packs: [{ key: 'credits100', credits: 100 }],
  },
  brand: {},
  labels: {},
}

vi.mock('../../src/runtime/vue/composables/use-billing', () => ({ useBilling: () => billing }))
vi.mock('../../src/runtime/vue/composables/use-credits', () => ({ useCredits: () => credits }))
vi.mock('../../src/runtime/vue/composables/use-organization', () => ({ useOrganization: () => organization }))
vi.mock('../../src/runtime/vue/composables/use-auth', () => ({ useAuth: () => auth }))
vi.mock('../../src/runtime/vue/composables/use-passkeys', () => ({ usePasskeys: () => passkeys }))
vi.mock('../../src/runtime/vue/composables/use-sessions', () => ({
  useSessions: () => sessions,
  describeUserAgent: (ua?: string | null) => ua ?? 'unknown device',
}))
vi.mock('../../src/runtime/vue/composables/use-backend-config', () => ({ useBackendConfig: () => backendConfig }))

// Runtime config is NOT mocked — the components fall back to the default page
// paths ('/login', '/pricing') when `public.backend.pages` is absent, which is
// exactly what the assertions below expect.
const { PricingTable } = await import('../../src/runtime/vue/components/pricing-table')
const { WorkspaceSettings } = await import('../../src/runtime/vue/components/workspace-settings')
const { ProfileSettings } = await import('../../src/runtime/vue/components/profile-settings')
const { SecuritySettings } = await import('../../src/runtime/vue/components/security-settings')
const { safeRedirect } = await import('../../src/runtime/vue/pages/login')

beforeEach(() => {
  vi.clearAllMocks()
  authed.value = true
  subscription.value = null
  user.value = { name: 'Ada Lovelace', email: 'ada@example.com', emailVerified: false }
})

// ── PricingTable ─────────────────────────────────────────────────────────────

describe('PricingTable', () => {
  it('renders the app.config catalog with live names and prices', () => {
    const wrapper = mount(PricingTable)
    const cards = wrapper.findAll('[data-pricing="plan"]')
    expect(cards).toHaveLength(2)
    expect(cards[0]!.find('[data-pricing="plan-name"]').text()).toContain('Starter')
    expect(cards[1]!.text()).toContain('Pro')
    expect(cards[1]!.text()).toContain('€9')
    expect(cards[1]!.attributes('data-highlight')).toBeDefined()
    expect(wrapper.findAll('[data-pricing="pack"]')).toHaveLength(1)
  })

  it('marks the current plan and offers cancel', () => {
    subscription.value = { id: 'sub1', status: 'active', productId: 'prod_pro' }
    const wrapper = mount(PricingTable)
    const current = wrapper.find('[data-pricing="plan"][data-current]')
    expect(current.exists()).toBe(true)
    expect(current.text()).toContain('Pro')
    expect(current.find('[data-pricing="plan-action"]').attributes('data-intent')).toBe('cancel')
  })

  it('subscribe runs checkout and switch changes plan', async () => {
    const wrapper = mount(PricingTable)
    await wrapper.find('[data-pricing="plan-action"][data-intent="subscribe"]').trigger('click')
    await flushPromises()
    expect(billing.checkout).toHaveBeenCalledWith('prod_starter', { redirect: true })

    subscription.value = { id: 'sub1', status: 'active', productId: 'prod_pro' }
    const switching = mount(PricingTable)
    await switching.find('[data-pricing="plan-action"][data-intent="switch"]').trigger('click')
    await flushPromises()
    expect(billing.changePlan).toHaveBeenCalledWith('prod_starter')
    expect(switching.emitted('plan-changed')).toBeTruthy()
  })

  it('signed-out visitors get a sign-in link instead of checkout', () => {
    authed.value = false
    const wrapper = mount(PricingTable)
    const action = wrapper.find('[data-pricing="plan-action"][data-intent="sign-in"]')
    expect(action.exists()).toBe(true)
    expect(action.attributes('href')).toContain('/login')
    expect(billing.checkout).not.toHaveBeenCalled()
  })

  it('slot overrides receive the full context', () => {
    const wrapper = mount(PricingTable, {
      slots: {
        'plan-action': (ctx: { plan: { key: string }, pending: string | null }) =>
          h('button', { 'data-test': `custom-${ctx.plan.key}` }, 'go'),
      },
    })
    expect(wrapper.find('[data-test="custom-pro"]').exists()).toBe(true)
    expect(wrapper.find('[data-pricing="plan-action"]').exists()).toBe(false)
  })

  it('shows the empty state when no products are configured', () => {
    const saved = products.value
    products.value = {}
    const wrapper = mount(PricingTable)
    expect(wrapper.find('[data-pricing="empty"]').exists()).toBe(true)
    products.value = saved
  })
})

// ── WorkspaceSettings ────────────────────────────────────────────────────────

describe('WorkspaceSettings', () => {
  it('lists workspaces with the active badge and switches on click', async () => {
    const wrapper = mount(WorkspaceSettings)
    const rows = wrapper.findAll('[data-settings="workspace"]')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.attributes('data-active')).toBeDefined()
    expect(rows[0]!.find('[data-settings="active-badge"]').exists()).toBe(true)

    await rows[1]!.find('[data-settings="switch"]').trigger('click')
    await flushPromises()
    expect(organization.setActive).toHaveBeenCalledWith('ws2')
    expect(wrapper.emitted('workspace-switched')).toEqual([['ws2']])
  })

  it('creates a workspace with a slugified name', async () => {
    const wrapper = mount(WorkspaceSettings)
    await wrapper.find('[data-settings="input-name"]').setValue('My New Team!')
    await wrapper.find('[data-settings="create-form"]').trigger('submit')
    await flushPromises()
    expect(organization.create).toHaveBeenCalledWith({ name: 'My New Team!', slug: 'my-new-team' })
    expect(wrapper.emitted('workspace-created')).toBeTruthy()
    expect(wrapper.find('[data-settings="message"]').attributes('data-tone')).toBe('ok')
  })

  it('summarizes plan and credits, linking to pricing', () => {
    subscription.value = { id: 'sub1', status: 'active', productId: 'prod_pro', currentPeriodEnd: '2026-09-01', cancelAtPeriodEnd: false }
    const wrapper = mount(WorkspaceSettings)
    expect(wrapper.find('[data-settings="plan-name"]').text()).toBe('Pro')
    expect(wrapper.find('[data-settings="plan-status"]').attributes('data-tone')).toBe('ok')
    expect(wrapper.find('[data-settings="pricing-link"]').attributes('href')).toBe('/pricing')
    expect(wrapper.find('[data-settings="balance"]').text()).toContain('42')
  })

  it('renders only the requested sections', () => {
    const wrapper = mount(WorkspaceSettings, { props: { sections: ['credits'] } })
    expect(wrapper.find('[data-settings="section-credits"]').exists()).toBe(true)
    expect(wrapper.find('[data-settings="section-workspaces"]').exists()).toBe(false)
    expect(wrapper.find('[data-settings="section-billing"]').exists()).toBe(false)
  })
})

// ── ProfileSettings ──────────────────────────────────────────────────────────

describe('ProfileSettings', () => {
  it('shows identity chrome after mount', async () => {
    const wrapper = mount(ProfileSettings)
    await flushPromises()
    expect(wrapper.find('[data-profile="avatar"]').text()).toBe('AL')
    expect(wrapper.find('[data-profile="identity-name"]').text()).toBe('Ada Lovelace')
    expect(wrapper.find('[data-profile="badge"][data-tone="warn"]').text()).toContain('unverified')
  })

  it('saves the display name', async () => {
    const wrapper = mount(ProfileSettings)
    await wrapper.find('[data-profile="input-name"]').setValue('Ada L.')
    await wrapper.find('[data-profile="section-name"]').trigger('submit')
    await flushPromises()
    expect(auth.updateUser).toHaveBeenCalledWith({ name: 'Ada L.' })
    expect(wrapper.emitted('name-saved')).toEqual([['Ada L.']])
  })

  it('gates the new email through validateEmail', async () => {
    const wrapper = mount(ProfileSettings, {
      props: { validateEmail: () => 'Test inboxes only.' },
    })
    await wrapper.find('[data-profile="input-email"]').setValue('stranger@example.com')
    await wrapper.find('[data-profile="section-email"]').trigger('submit')
    await flushPromises()
    expect(auth.changeEmail).not.toHaveBeenCalled()
    expect(wrapper.find('[data-profile="message"]').text()).toBe('Test inboxes only.')
  })

  it('requests the two-step email change when allowed', async () => {
    const wrapper = mount(ProfileSettings, { props: { callbackPath: '/profile' } })
    await wrapper.find('[data-profile="input-email"]').setValue('new@example.com')
    await wrapper.find('[data-profile="section-email"]').trigger('submit')
    await flushPromises()
    expect(auth.changeEmail).toHaveBeenCalledWith('new@example.com', '/profile')
    expect(wrapper.emitted('email-change-requested')).toEqual([['new@example.com']])
  })
})

// ── SecuritySettings ─────────────────────────────────────────────────────────

describe('SecuritySettings', () => {
  it('renders passkeys and sessions with the current-device badge', async () => {
    const wrapper = mount(SecuritySettings)
    await flushPromises()
    expect(wrapper.findAll('[data-security="passkey"]')).toHaveLength(1)
    const sessionRows = wrapper.findAll('[data-security="session"]')
    expect(sessionRows).toHaveLength(2)
    expect(sessionRows[0]!.attributes('data-current')).toBeDefined()
    expect(sessionRows[0]!.find('[data-security="current-badge"]').exists()).toBe(true)
    expect(sessionRows[1]!.find('[data-security="revoke"]').exists()).toBe(true)
  })

  it('renames a passkey inline', async () => {
    const wrapper = mount(SecuritySettings)
    await flushPromises()
    await wrapper.find('[data-security="rename"]').trigger('click')
    const input = wrapper.find('[data-security="input-passkey-name"]')
    expect(input.exists()).toBe(true)
    await input.setValue('Desk key')
    await wrapper.find('[data-security="rename"]').trigger('click')
    await flushPromises()
    expect(passkeys.rename).toHaveBeenCalledWith('pk1', 'Desk key')
  })

  it('routes destructive actions through the confirm prop', async () => {
    const confirm = vi.fn(() => false)
    const wrapper = mount(SecuritySettings, { props: { confirm } })
    await flushPromises()
    await wrapper.find('[data-security="remove"]').trigger('click')
    await wrapper.find('[data-security="delete-account"]').trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(passkeys.remove).not.toHaveBeenCalled()
    expect(auth.deleteAccount).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    await wrapper.find('[data-security="delete-account"]').trigger('click')
    await flushPromises()
    expect(auth.deleteAccount).toHaveBeenCalled()
    expect(wrapper.emitted('delete-requested')).toBeTruthy()
  })

  it('revokes the other session and offers verification for unverified emails', async () => {
    const wrapper = mount(SecuritySettings)
    await flushPromises()
    await wrapper.find('[data-security="revoke"]').trigger('click')
    await flushPromises()
    expect(sessions.revoke).toHaveBeenCalledWith('tok-other')

    await wrapper.find('[data-security="send-verification"]').trigger('click')
    await flushPromises()
    expect(auth.sendVerificationEmail).toHaveBeenCalled()
    expect(wrapper.emitted('verification-sent')).toBeTruthy()
  })
})

// ── Login page redirect sanitizer ────────────────────────────────────────────

describe('safeRedirect', () => {
  it('accepts only same-origin paths', () => {
    expect(safeRedirect('/app')).toBe('/app')
    expect(safeRedirect('/app?tab=1')).toBe('/app?tab=1')
    expect(safeRedirect('//evil.com')).toBeNull()
    expect(safeRedirect('https://evil.com')).toBeNull()
    expect(safeRedirect(['/a'])).toBeNull()
    expect(safeRedirect(undefined)).toBeNull()
  })
})
