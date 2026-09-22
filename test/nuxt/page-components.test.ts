import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, h, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

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
const ordersLoading = ref(false)
const orders = {
  orders: orderList,
  page: ref(1),
  total: computed(() => 2),
  pageCount: computed(() => 2),
  hasMore: computed(() => ordersHasMore.value),
  hasPrevious: computed(() => false),
  isLoading: computed(() => ordersLoading.value),
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
const usageLoading = ref(false)
const usageError = ref<string | null>(null)
const usage = {
  events: usageEvents,
  page: ref(1),
  total: computed(() => 2),
  pageCount: computed(() => 1),
  units: computed(() => 12),
  hasMore: computed(() => false),
  hasPrevious: computed(() => false),
  isLoading: computed(() => usageLoading.value),
  error: usageError,
  refresh: vi.fn(async () => {}),
  next: vi.fn(async () => {}),
  previous: vi.fn(async () => {}),
  goTo: vi.fn(async () => {}),
}

vi.mock('../../src/runtime/vue/composables/use-orders', () => ({ useOrders: () => orders }))
vi.mock('../../src/runtime/vue/composables/use-usage', () => ({ useUsage: () => usage }))

const giftList = ref<Array<Record<string, unknown>>>([])
const giftClaiming = ref(false)
const gifts = {
  received: computed(() => giftList.value),
  unclaimed: computed(() => giftList.value),
  isLoading: computed(() => false),
  isClaiming: computed(() => giftClaiming.value),
  claim: vi.fn(async () => 1),
}
vi.mock('../../src/runtime/vue/composables/use-gifts', () => ({ useGifts: () => gifts }))
vi.mock('../../src/runtime/vue/composables/use-organization', () => ({ useOrganization: () => organization }))
vi.mock('../../src/runtime/vue/composables/use-auth', () => ({ useAuth: () => auth }))
vi.mock('../../src/runtime/vue/composables/use-passkeys', () => ({ usePasskeys: () => passkeys }))
vi.mock('../../src/runtime/vue/composables/use-sessions', () => ({
  useSessions: () => sessions,
  describeUserAgent: (ua?: string | null) => ua ?? 'unknown device',
}))
vi.mock('../../src/runtime/vue/composables/use-backend-config', () => ({ useBackendConfig: () => backendConfig }))
// The shipped pages set the document title through the auto-imported useHead.
const { useHead } = vi.hoisted(() => ({ useHead: vi.fn() }))
mockNuxtImport('useHead', () => useHead)

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
const { AcceptInvitation } = await import('../../src/runtime/vue/components/accept-invitation')
const { GiftClaimBanner } = await import('../../src/runtime/vue/components/gift-claim-banner')
const { safeRedirect } = await import('../../src/runtime/vue/pages/login')
const { default: PricingPage } = await import('../../src/runtime/vue/pages/pricing')
const { default: SettingsPage } = await import('../../src/runtime/vue/pages/settings')
const { default: ProfilePage } = await import('../../src/runtime/vue/pages/profile')
const { default: SecurityPage } = await import('../../src/runtime/vue/pages/security')

beforeEach(() => {
  vi.clearAllMocks()
  authed.value = true
  subscription.value = null
  user.value = { name: 'Ada Lovelace', email: 'ada@example.com', emailVerified: false }
  creditBalance.value = 42
  ordersError.value = null
  ordersHasMore.value = true
  backendConfig.brand = {}
  backendConfig.labels = {}
  ordersLoading.value = false
  usageLoading.value = false
  usageError.value = null
  giftList.value = []
  giftClaiming.value = false
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

  it('surfaces a failed action as an alert and the empty catalog as a status', async () => {
    billing.checkout.mockRejectedValueOnce(new Error('Card declined'))
    const wrapper = mount(PricingTable)
    await wrapper.find('[data-pricing="plan-action"][data-intent="subscribe"]').trigger('click')
    await flushPromises()
    const error = wrapper.find('[data-pricing="error"]')
    expect(error.text()).toBe('Card declined')
    expect(error.attributes('role')).toBe('alert')
    expect(wrapper.emitted('error')).toEqual([['Card declined']])

    const saved = products.value
    products.value = {}
    try {
      const empty = mount(PricingTable).find('[data-pricing="empty"]')
      expect(empty.attributes('role')).toBe('status')
      expect(empty.attributes('aria-live')).toBe('polite')
    }
    finally {
      products.value = saved
    }
  })

  it('is busy while an action is in flight', async () => {
    let release!: () => void
    billing.checkout.mockImplementationOnce(() => new Promise<string>((resolve) => {
      release = () => resolve('')
    }))
    const wrapper = mount(PricingTable)
    const table = () => wrapper.find('[data-pricing="table"]').attributes('aria-busy')
    expect(table()).toBeUndefined()
    await wrapper.find('[data-pricing="plan-action"][data-intent="subscribe"]').trigger('click')
    expect(table()).toBe('true')
    release()
    await flushPromises()
    expect(table()).toBeUndefined()
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

  it('reads as busy while loading and as a polite status while empty', () => {
    const saved = orderList.value
    try {
      ordersLoading.value = true
      orderList.value = undefined
      const loading = mount(BillingHistory)
      expect(loading.find('[data-history="root"]').attributes('aria-busy')).toBe('true')
      const note = loading.find('[data-history="loading"]')
      expect(note.attributes('role')).toBe('status')
      expect(note.attributes('aria-live')).toBe('polite')

      ordersLoading.value = false
      orderList.value = []
      const empty = mount(BillingHistory)
      expect(empty.find('[data-history="root"]').attributes('aria-busy')).toBeUndefined()
      expect(empty.find('[data-history="empty"]').attributes('role')).toBe('status')
      expect(empty.find('[data-history="empty"]').attributes('aria-live')).toBe('polite')
    }
    finally {
      orderList.value = saved
    }
  })

  it('is busy while an invoice is being fetched', async () => {
    let release!: () => void
    orders.invoice.mockImplementationOnce(() => new Promise<string>((resolve) => {
      release = () => resolve('')
    }))
    const wrapper = mount(BillingHistory)
    const root = () => wrapper.find('[data-history="root"]').attributes('aria-busy')
    await wrapper.find('[data-history="invoice"]').trigger('click')
    expect(root()).toBe('true')
    release()
    await flushPromises()
    expect(root()).toBeUndefined()
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

  it('reads as busy while loading, as a polite status while empty, as an alert on failure', () => {
    const saved = usageEvents.value
    try {
      usageLoading.value = true
      usageEvents.value = undefined
      const loading = mount(UsageHistory)
      expect(loading.find('[data-usage="root"]').attributes('aria-busy')).toBe('true')
      const note = loading.find('[data-usage="loading"]')
      expect(note.attributes('role')).toBe('status')
      expect(note.attributes('aria-live')).toBe('polite')

      usageLoading.value = false
      usageEvents.value = []
      const empty = mount(UsageHistory).find('[data-usage="empty"]')
      expect(empty.attributes('role')).toBe('status')
      expect(empty.attributes('aria-live')).toBe('polite')

      usageError.value = 'Meter unavailable'
      const error = mount(UsageHistory).find('[data-usage="error"]')
      expect(error.text()).toBe('Meter unavailable')
      expect(error.attributes('role')).toBe('alert')
    }
    finally {
      usageEvents.value = saved
    }
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

  it('is a polite live region, busy while a top-up starts', async () => {
    creditBalance.value = 3
    let release!: () => void
    credits.topUp.mockImplementationOnce(() => new Promise<string>((resolve) => {
      release = () => resolve('')
    }))
    const wrapper = mount(CreditsLowBanner, { props: { threshold: 10, pack: 'credits100' } })
    const banner = () => wrapper.find('[data-credits="banner"]')
    expect(banner().attributes('role')).toBe('status')
    expect(banner().attributes('aria-live')).toBe('polite')
    expect(banner().attributes('aria-busy')).toBeUndefined()
    // The one symbol-only control: its name is the action, not the glyph.
    expect(wrapper.find('[data-credits="dismiss"]').attributes('aria-label')).toBe('Dismiss')

    await wrapper.find('[data-credits="action"]').trigger('click')
    expect(banner().attributes('aria-busy')).toBe('true')
    release()
    await flushPromises()
    expect(banner().attributes('aria-busy')).toBeUndefined()
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

  it('names the create-workspace field with a real label', () => {
    const wrapper = mount(WorkspaceSettings)
    const label = wrapper.find('label[data-settings="label-create"]')
    expect(label.text()).toContain('Workspace name')
    // Wrapping association: the input is the label's descendant, so no
    // `for`/`id` plumbing is needed — and a placeholder is not its only name.
    expect(label.find('input[data-settings="input-name"]').exists()).toBe(true)
    expect(label.find('input').attributes('placeholder')).toBeUndefined()
  })

  it('is busy while an action runs, then announces the outcome by tone', async () => {
    let release!: () => void
    organization.create.mockImplementationOnce(() => new Promise<{ data: { id: string } }>((resolve) => {
      release = () => resolve({ data: { id: 'ws3' } })
    }))
    const wrapper = mount(WorkspaceSettings)
    const root = () => wrapper.find('[data-settings="root"]').attributes('aria-busy')
    await wrapper.find('[data-settings="input-name"]').setValue('Team')
    await wrapper.find('[data-settings="create-form"]').trigger('submit')
    expect(root()).toBe('true')
    release()
    await flushPromises()
    expect(root()).toBeUndefined()
    const ok = wrapper.find('[data-settings="message"]')
    expect(ok.attributes('data-tone')).toBe('ok')
    expect(ok.attributes('role')).toBe('status')
    expect(ok.attributes('aria-live')).toBe('polite')

    organization.create.mockRejectedValueOnce(new Error('Slug taken'))
    await wrapper.find('[data-settings="input-name"]').setValue('Team')
    await wrapper.find('[data-settings="create-form"]').trigger('submit')
    await flushPromises()
    const error = wrapper.find('[data-settings="message"]')
    expect(error.text()).toBe('Slug taken')
    expect(error.attributes('data-tone')).toBe('error')
    expect(error.attributes('role')).toBe('alert')
    expect(error.attributes('aria-live')).toBeUndefined()
  })

  it('marks the credits section busy until the balance lands', () => {
    creditBalance.value = undefined
    creditsLoading.value = true
    try {
      expect(mount(WorkspaceSettings).find('[data-settings="section-credits"]').attributes('aria-busy')).toBe('true')
    }
    finally {
      creditsLoading.value = false
    }
    creditBalance.value = 42
    expect(mount(WorkspaceSettings).find('[data-settings="section-credits"]').attributes('aria-busy')).toBeUndefined()
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

  it('marks the identity chrome busy until it mounts', async () => {
    const wrapper = mount(ProfileSettings)
    // The first paint is server-shaped — no session yet — so the placeholder
    // stands in for the chrome and says it is still loading.
    expect(wrapper.find('[data-profile="identity"]').attributes('aria-busy')).toBe('true')
    await flushPromises()
    expect(wrapper.find('[data-profile="identity"]').attributes('aria-busy')).toBeUndefined()
  })

  it('is busy while a save runs, then announces the outcome by tone', async () => {
    let release!: () => void
    auth.updateUser.mockImplementationOnce(() => new Promise<object>((resolve) => {
      release = () => resolve({})
    }))
    const wrapper = mount(ProfileSettings, { props: { validateEmail: () => 'Test inboxes only.' } })
    const root = () => wrapper.find('[data-profile="root"]').attributes('aria-busy')
    await wrapper.find('[data-profile="input-name"]').setValue('Ada L.')
    await wrapper.find('[data-profile="section-name"]').trigger('submit')
    expect(root()).toBe('true')
    release()
    await flushPromises()
    expect(root()).toBeUndefined()
    const ok = wrapper.find('[data-profile="message"]')
    expect(ok.attributes('data-tone')).toBe('ok')
    expect(ok.attributes('role')).toBe('status')
    expect(ok.attributes('aria-live')).toBe('polite')

    await wrapper.find('[data-profile="input-email"]').setValue('stranger@example.com')
    await wrapper.find('[data-profile="section-email"]').trigger('submit')
    await flushPromises()
    const error = wrapper.find('[data-profile="message"]')
    expect(error.attributes('data-tone')).toBe('error')
    expect(error.attributes('role')).toBe('alert')
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

  it('names the inline rename field and marks verification busy until mount', async () => {
    const wrapper = mount(SecuritySettings)
    expect(wrapper.find('[data-security="section-verification"]').attributes('aria-busy')).toBe('true')
    await flushPromises()
    expect(wrapper.find('[data-security="section-verification"]').attributes('aria-busy')).toBeUndefined()
    await wrapper.find('[data-security="rename"]').trigger('click')
    // The field replaces the name it edits — no room for a visible label in the row.
    expect(wrapper.find('[data-security="input-passkey-name"]').attributes('aria-label')).toBe('Passkey name')
  })

  it('is busy while an action runs, then announces the outcome by tone', async () => {
    let release!: () => void
    passkeys.add.mockImplementationOnce(() => new Promise<void>((resolve) => {
      release = () => resolve()
    }))
    const wrapper = mount(SecuritySettings)
    await flushPromises()
    const root = () => wrapper.find('[data-security="root"]').attributes('aria-busy')
    await wrapper.find('[data-security="add-passkey"]').trigger('click')
    expect(root()).toBe('true')
    release()
    await flushPromises()
    expect(root()).toBeUndefined()
    const ok = wrapper.find('[data-security="message"]')
    expect(ok.attributes('data-tone')).toBe('ok')
    expect(ok.attributes('role')).toBe('status')
    expect(ok.attributes('aria-live')).toBe('polite')

    passkeys.add.mockRejectedValueOnce(new Error('Ceremony cancelled'))
    await wrapper.find('[data-security="add-passkey"]').trigger('click')
    await flushPromises()
    const error = wrapper.find('[data-security="message"]')
    expect(error.text()).toBe('Ceremony cancelled')
    expect(error.attributes('data-tone')).toBe('error')
    expect(error.attributes('role')).toBe('alert')
  })
})

// ── AcceptInvitation ─────────────────────────────────────────────────────────

describe('AcceptInvitation', () => {
  const invitation = { id: 'inv1', organizationName: 'Acme', inviterEmail: 'grace@example.com', role: 'member' }

  it('is busy with a polite status while loading, then describes the invitation', async () => {
    let release!: () => void
    organization.getInvitation.mockImplementationOnce(() => new Promise((resolve) => {
      release = () => resolve(invitation)
    }))
    const wrapper = mount(AcceptInvitation, { props: { invitationId: 'inv1' } })
    expect(wrapper.find('[data-invitation="loading"]').attributes('aria-busy')).toBe('true')
    const loading = wrapper.find('[data-invitation="message"]')
    expect(loading.attributes('role')).toBe('status')
    expect(loading.attributes('aria-live')).toBe('polite')

    release()
    await flushPromises()
    const ready = wrapper.find('[data-invitation="ready"]')
    expect(ready.attributes('aria-busy')).toBeUndefined()
    expect(ready.find('[data-invitation="message"]').text()).toBe('grace@example.com invited you to join Acme as member.')
    expect(ready.find('[data-invitation="message"]').attributes('role')).toBe('status')
  })

  it('accepts, is busy meanwhile, and announces the outcome politely', async () => {
    organization.getInvitation.mockResolvedValueOnce(invitation)
    let release!: () => void
    organization.acceptInvitation.mockImplementationOnce(() => new Promise<void>((resolve) => {
      release = () => resolve()
    }))
    const wrapper = mount(AcceptInvitation, { props: { invitationId: 'inv1' } })
    await flushPromises()
    await wrapper.find('[data-invitation="accept"]').trigger('click')
    expect(wrapper.find('[data-invitation="ready"]').attributes('aria-busy')).toBe('true')
    expect(wrapper.find('[data-invitation="accept"]').attributes('disabled')).toBeDefined()
    release()
    await flushPromises()
    expect(organization.acceptInvitation).toHaveBeenCalledWith('inv1', { activate: true })
    const done = wrapper.find('[data-invitation="accepted"] [data-invitation="message"]')
    expect(done.attributes('role')).toBe('status')
    expect(done.text()).toContain('You joined Acme')
    // The party popper is decoration, hidden from the accessible name.
    expect(done.find('[aria-hidden="true"]').text()).toBe('🎉')
    expect(wrapper.emitted('accepted')).toEqual([[invitation]])
  })

  it('raises an alert for a dead link and for a failed load', async () => {
    organization.getInvitation.mockResolvedValueOnce(null)
    const missing = mount(AcceptInvitation, { props: { invitationId: 'gone' } })
    await flushPromises()
    expect(missing.find('[data-invitation="missing"] [data-invitation="message"]').attributes('role')).toBe('alert')

    organization.getInvitation.mockRejectedValueOnce(new Error('Network down'))
    const failed = mount(AcceptInvitation, { props: { invitationId: 'inv1' } })
    await flushPromises()
    const alert = failed.find('[data-invitation="error"] [data-invitation="message"]')
    expect(alert.attributes('role')).toBe('alert')
    expect(alert.text()).toContain('Network down')
    expect(failed.emitted('error')).toEqual([['Network down']])
  })
})

// ── GiftClaimBanner ──────────────────────────────────────────────────────────

describe('GiftClaimBanner', () => {
  it('renders nothing without gifts, then a polite live region with one row per gift', () => {
    expect(mount(GiftClaimBanner).find('[data-gift="banner"]').exists()).toBe(false)

    giftList.value = [{ id: 'g1', status: 'paid', purchaserName: 'Grace', message: 'Enjoy!' }]
    const wrapper = mount(GiftClaimBanner)
    const banner = wrapper.find('[data-gift="banner"]')
    expect(banner.attributes('role')).toBe('status')
    expect(banner.attributes('aria-live')).toBe('polite')
    expect(banner.attributes('aria-busy')).toBeUndefined()
    expect(wrapper.find('[data-gift="message"]').text()).toContain('Grace sent you a gift: “Enjoy!”')
    // The gift emoji is decoration, hidden from the accessible name.
    expect(wrapper.find('[data-gift="message"] [aria-hidden="true"]').exists()).toBe(true)
  })

  it('is busy while a claim is in flight, and claims the clicked gift', async () => {
    giftList.value = [{ id: 'g1', status: 'paid', purchaserEmail: 'grace@example.com' }]
    giftClaiming.value = true
    const wrapper = mount(GiftClaimBanner)
    expect(wrapper.find('[data-gift="banner"]').attributes('aria-busy')).toBe('true')
    expect(wrapper.find('[data-gift="claim"]').attributes('disabled')).toBeDefined()

    giftClaiming.value = false
    await flushPromises()
    expect(wrapper.find('[data-gift="banner"]').attributes('aria-busy')).toBeUndefined()
    await wrapper.find('[data-gift="claim"]').trigger('click')
    await flushPromises()
    expect(gifts.claim).toHaveBeenCalledWith('g1')
    expect(wrapper.emitted('claimed')).toEqual([[1]])
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

// ── The shipped pages ────────────────────────────────────────────────────────

describe('the shipped pages', () => {
  const pages = [
    { name: 'pricing', Page: PricingPage, family: 'pricing', fallback: 'Pricing', selector: '[data-pricing="header"]' },
    { name: 'settings', Page: SettingsPage, family: 'settings', fallback: 'Settings', selector: '[data-settings="title"]' },
    { name: 'profile', Page: ProfilePage, family: 'profile', fallback: 'Profile', selector: '[data-profile="title"]' },
    { name: 'security', Page: SecurityPage, family: 'security', fallback: 'Security', selector: '[data-security="title"]' },
  ] as const

  it.each(pages)('/$name renders an h1 and sets the document title', ({ Page, fallback, selector }) => {
    const wrapper = mount(Page)
    const heading = wrapper.find(selector)
    expect(heading.element.tagName).toBe('H1')
    expect(heading.text()).toBe(fallback)
    expect(useHead).toHaveBeenCalledWith({ title: fallback })
  })

  it.each(pages)('/$name takes its heading from appConfig.backend.labels', ({ Page, family, selector }) => {
    // The second rung of the customization ladder, on the page most apps rename.
    ;(backendConfig.labels as Record<string, { title: string }>)[family] = { title: 'Renamed' }
    const wrapper = mount(Page)
    expect(wrapper.find(selector).text()).toBe('Renamed')
    expect(useHead).toHaveBeenCalledWith({ title: 'Renamed' })
  })

  it('an embedded <PricingTable> keeps its h2 under the page heading', () => {
    // Only the shipped page promotes the title to h1.
    const wrapper = mount(PricingTable, { props: { title: 'Plans' } })
    expect(wrapper.find('[data-pricing="header"]').element.tagName).toBe('H2')
  })
})
