import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, h, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

// ── Controllable composable state ───────────────────────────────────────────

const authed = ref(true)
const user = ref<Record<string, unknown> | null>({ name: 'Ada Lovelace', email: 'ada@example.com', emailVerified: false })

const products = ref<Record<string, { id: string, name: string, prices?: unknown[], trialInterval?: string, trialIntervalCount?: number } | undefined>>({
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
  isFree: computed(() => subscription.value === null),
  isLoading: computed(() => false),
  status: computed(() => subscription.value?.status ?? null),
  cancelAtPeriodEnd: computed(() => subscription.value?.cancelAtPeriodEnd === true),
  pausedAt: computed(() => null),
  resumesAt: computed(() => null),
  trialEnd: computed(() => null),
  isTrialing: computed(() => subscription.value?.status === 'trialing'),
  isPaused: computed(() => false),
  pendingUpdate: computed(() => null),
  checkout: vi.fn(async () => 'https://billing.example/checkout'),
  gift: vi.fn(async () => ''),
  portal: vi.fn(async () => ''),
  changePlan: vi.fn(async () => {}),
  cancel: vi.fn(async () => {}),
  uncancel: vi.fn(async () => {}),
  pause: vi.fn(async () => {}),
  resume: vi.fn(async () => {}),
}

const creditBalance = ref<number | undefined>(42)
const creditsLoading = ref(false)
const credits = {
  balance: computed(() => creditBalance.value),
  credited: computed(() => (creditsLoading.value ? undefined : 50)),
  consumed: computed(() => (creditsLoading.value ? undefined : 8)),
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
    lowCreditsThreshold: 10,
  },
  brand: {},
  labels: {},
}

// Partial mock: the component reads its money/date formatting from the same
// module, and those helpers must stay real or every rendered amount is a stub.
vi.mock('../../src/runtime/vue/composables/use-billing', async importOriginal => ({
  ...(await importOriginal<typeof import('../../src/runtime/vue/composables/use-billing')>()),
  useBilling: () => billing,
}))
vi.mock('../../src/runtime/vue/composables/use-credits', () => ({ useCredits: () => credits }))
const orderList = ref<Array<Record<string, unknown>> | undefined>([
  { id: 'ord_1', createdAt: '2026-08-01T10:00:00.000Z', status: 'paid', totalAmount: 900, currency: 'EUR', isInvoiceGenerated: true, product: { id: 'prod_pro', name: 'Pro' } },
  { id: 'ord_2', createdAt: '2026-07-01T10:00:00.000Z', status: 'refunded', totalAmount: 900, currency: 'EUR', isInvoiceGenerated: false, product: { id: 'prod_pro', name: 'Pro' } },
])
const ordersError = ref<string | null>(null)
const ordersHasMore = ref(true)
const orders = {
  orders: orderList,
  page: ref(1),
  total: computed(() => 2),
  pageCount: computed(() => 2),
  hasMore: computed(() => ordersHasMore.value),
  hasPrevious: computed(() => false),
  isLoading: computed(() => false),
  error: ordersError,
  refresh: vi.fn(async () => {}),
  next: vi.fn(async () => {}),
  previous: vi.fn(async () => {}),
  goTo: vi.fn(async () => {}),
  invoice: vi.fn(async () => 'https://billing.example/invoice.pdf'),
}

const usageEvents = ref<Array<Record<string, unknown>> | undefined>([
  { id: 'evt_1', timestamp: '2026-08-01T10:00:00.000Z', name: 'ai_tokens', units: 12 },
  { id: 'evt_2', timestamp: '2026-08-01T09:00:00.000Z', name: 'ai_tokens' },
])
const usage = {
  events: usageEvents,
  page: ref(1),
  total: computed(() => 2),
  pageCount: computed(() => 1),
  units: computed(() => 12),
  hasMore: computed(() => false),
  hasPrevious: computed(() => false),
  isLoading: computed(() => false),
  error: ref<string | null>(null),
  refresh: vi.fn(async () => {}),
  next: vi.fn(async () => {}),
  previous: vi.fn(async () => {}),
  goTo: vi.fn(async () => {}),
}

vi.mock('../../src/runtime/vue/composables/use-orders', () => ({ useOrders: () => orders }))
vi.mock('../../src/runtime/vue/composables/use-usage', () => ({ useUsage: () => usage }))
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
const { BillingHistory } = await import('../../src/runtime/vue/components/billing-history')
const { UsageHistory } = await import('../../src/runtime/vue/components/usage-history')
const { CreditsLowBanner } = await import('../../src/runtime/vue/components/credits-low-banner')
const { WorkspaceSettings } = await import('../../src/runtime/vue/components/workspace-settings')
const { ProfileSettings } = await import('../../src/runtime/vue/components/profile-settings')
const { SecuritySettings } = await import('../../src/runtime/vue/components/security-settings')
const { safeRedirect } = await import('../../src/runtime/vue/pages/login')

beforeEach(() => {
  vi.clearAllMocks()
  authed.value = true
  subscription.value = null
  user.value = { name: 'Ada Lovelace', email: 'ada@example.com', emailVerified: false }
  creditBalance.value = 42
  ordersError.value = null
  ordersHasMore.value = true
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

  it('subscribe runs checkout and switching names the direction', async () => {
    const wrapper = mount(PricingTable)
    await wrapper.find('[data-pricing="plan-action"][data-intent="subscribe"]').trigger('click')
    await flushPromises()
    expect(billing.checkout).toHaveBeenCalledWith('prod_starter', { redirect: true })

    // On Pro (€9), the free Starter plan is a downgrade — and says so.
    subscription.value = { id: 'sub1', status: 'active', productId: 'prod_pro' }
    const switching = mount(PricingTable)
    const down = switching.find('[data-pricing="plan-action"][data-intent="downgrade"]')
    expect(down.text()).toContain('Downgrade to Starter')
    await down.trigger('click')
    await flushPromises()
    expect(billing.changePlan).toHaveBeenCalledWith('prod_starter')
    expect(switching.emitted('plan-changed')).toBeTruthy()
  })

  it('calls the other direction an upgrade', () => {
    subscription.value = { id: 'sub1', status: 'active', productId: 'prod_starter' }
    const wrapper = mount(PricingTable)
    const up = wrapper.find('[data-pricing="plan-action"][data-intent="upgrade"]')
    expect(up.text()).toContain('Upgrade to Pro')
  })

  it('announces a plan trial on the card and its button', () => {
    const saved = products.value
    products.value = {
      ...products.value,
      starter: { id: 'prod_starter', name: 'Starter', prices: [{ priceAmount: 0 }], trialInterval: 'day', trialIntervalCount: 7 },
    }
    const wrapper = mount(PricingTable)
    const card = wrapper.findAll('[data-pricing="plan"]')[0]!
    expect(card.attributes('data-trial')).toBeDefined()
    expect(card.find('[data-pricing="plan-trial"]').text()).toBe('7-day free trial')
    expect(card.find('[data-pricing="plan-action"]').text()).toBe('7-day free trial')
    products.value = saved
  })

  it('offers the way back on a plan set to cancel', async () => {
    subscription.value = { id: 'sub1', status: 'active', productId: 'prod_pro', cancelAtPeriodEnd: true }
    const wrapper = mount(PricingTable)
    const current = wrapper.find('[data-pricing="plan"][data-current]')
    expect(current.attributes('data-canceling')).toBeDefined()
    const action = current.find('[data-pricing="plan-action"]')
    expect(action.attributes('data-intent')).toBe('uncancel')

    await action.trigger('click')
    await flushPromises()
    expect(billing.uncancel).toHaveBeenCalled()
    expect(wrapper.emitted('uncanceled')).toBeTruthy()
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

// ── BillingHistory ───────────────────────────────────────────────────────────

describe('BillingHistory', () => {
  it('lists charges with formatted amounts and an invoice link', async () => {
    const wrapper = mount(BillingHistory, { props: { title: 'Billing history' } })
    expect(wrapper.find('[data-history="header"]').text()).toBe('Billing history')
    const rows = wrapper.findAll('[data-history="order"]')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.attributes('data-status')).toBe('paid')
    expect(rows[0]!.find('[data-history="order-description"]').text()).toBe('Pro')
    expect(rows[0]!.find('[data-history="order-amount"]').text()).toBe('€9')
    // Only the finalized invoice is offered — the other order has no PDF yet.
    expect(rows[0]!.find('[data-history="invoice"]').exists()).toBe(true)
    expect(rows[1]!.find('[data-history="invoice"]').exists()).toBe(false)

    await rows[0]!.find('[data-history="invoice"]').trigger('click')
    await flushPromises()
    expect(orders.invoice).toHaveBeenCalledWith('ord_1', { redirect: false })
    expect(wrapper.emitted('invoice')).toEqual([['https://billing.example/invoice.pdf']])
  })

  it('pages through the history', async () => {
    const wrapper = mount(BillingHistory)
    const older = wrapper.find('[data-history="older"]')
    expect(wrapper.find('[data-history="newer"]').attributes('disabled')).toBeDefined()
    await older.trigger('click')
    expect(orders.next).toHaveBeenCalled()
  })

  it('shows the empty state instead of an error when there is nothing to show', () => {
    const saved = orderList.value
    orderList.value = []
    ordersHasMore.value = false
    const wrapper = mount(BillingHistory)
    expect(wrapper.find('[data-history="empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-history="pager"]').exists()).toBe(false)
    orderList.value = saved
  })

  it('surfaces a load failure as an alert', () => {
    ordersError.value = 'Provider unreachable'
    const wrapper = mount(BillingHistory)
    const error = wrapper.find('[data-history="error"]')
    expect(error.text()).toBe('Provider unreachable')
    expect(error.attributes('role')).toBe('alert')
  })

  it('hands the order slot the full context', () => {
    const wrapper = mount(BillingHistory, {
      slots: { order: (ctx: { order: { id: string } }) => h('div', { 'data-test': `row-${ctx.order.id}` }) },
    })
    expect(wrapper.find('[data-test="row-ord_1"]').exists()).toBe(true)
    expect(wrapper.find('[data-history="order"]').exists()).toBe(false)
  })
})

// ── UsageHistory ─────────────────────────────────────────────────────────────

describe('UsageHistory', () => {
  it('lists metered events, with units only where the meter priced them', () => {
    const wrapper = mount(UsageHistory, { props: { meter: 'credits' } })
    const rows = wrapper.findAll('[data-usage="event"]')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.find('[data-usage="event-name"]').text()).toBe('ai_tokens')
    expect(rows[0]!.find('[data-usage="event-units"]').text()).toBe('12 credits')
    expect(rows[1]!.find('[data-usage="event-units"]').exists()).toBe(false)
  })

  it('shows the empty state when nothing has been metered', () => {
    const saved = usageEvents.value
    usageEvents.value = []
    const wrapper = mount(UsageHistory)
    expect(wrapper.find('[data-usage="empty"]').exists()).toBe(true)
    usageEvents.value = saved
  })
})

// ── CreditsLowBanner ─────────────────────────────────────────────────────────

describe('CreditsLowBanner', () => {
  it('stays out of the way while the balance is healthy or unknown', () => {
    expect(mount(CreditsLowBanner).find('[data-credits="banner"]').exists()).toBe(false)
    creditBalance.value = undefined
    expect(mount(CreditsLowBanner, { props: { threshold: 50 } }).find('[data-credits="banner"]').exists()).toBe(false)
  })

  it('appears under the threshold and links to the plans', () => {
    creditBalance.value = 3
    const wrapper = mount(CreditsLowBanner, { props: { threshold: 10 } })
    expect(wrapper.find('[data-credits="balance"]').text()).toBe('3')
    expect(wrapper.find('[data-credits="message"]').text()).toContain('credits left')
    expect(wrapper.find('[data-credits="action"]').attributes('href')).toBe('/pricing')
  })

  it('tops up the named pack instead of linking out', async () => {
    creditBalance.value = 3
    const wrapper = mount(CreditsLowBanner, { props: { threshold: 10, pack: 'credits100' } })
    await wrapper.find('[data-credits="action"]').trigger('click')
    await flushPromises()
    expect(credits.topUp).toHaveBeenCalledWith('prod_pack', { redirect: true })
    expect(wrapper.emitted('topped-up')).toBeTruthy()
  })

  it('can be dismissed for the session', async () => {
    creditBalance.value = 3
    const wrapper = mount(CreditsLowBanner, { props: { threshold: 10 } })
    await wrapper.find('[data-credits="dismiss"]').trigger('click')
    expect(wrapper.find('[data-credits="banner"]').exists()).toBe(false)
    expect(wrapper.emitted('dismissed')).toBeTruthy()
  })

  it('falls back to the app-config threshold', () => {
    creditBalance.value = 3
    // The mocked app config carries no threshold, so the package default (10)
    // applies — a balance of 3 is low, 42 is not.
    expect(mount(CreditsLowBanner).find('[data-credits="banner"]').exists()).toBe(true)
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

  it('reads as loading, not as an empty account, before the balance lands', () => {
    // Seen live: the first paint said "— credits · 0 credited · 0 used" while
    // 50 granted credits were in flight. Zeros there are indistinguishable
    // from a real empty balance.
    const previous = creditBalance.value
    creditBalance.value = undefined
    creditsLoading.value = true
    try {
      const wrapper = mount(WorkspaceSettings)
      expect(wrapper.find('[data-settings="balance"]').text()).toContain('—')
      expect(wrapper.find('[data-settings="usage"]').text()).toBe('— credited · — used')
    }
    finally {
      creditBalance.value = previous
      creditsLoading.value = false
    }
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
