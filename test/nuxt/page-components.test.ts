import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, h, nextTick, reactive, ref, toValue, type MaybeRefOrGetter } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ConvexError } from 'convex/values'
import type { PricedPack, PricedPlan, PricedPlanPrice, PricedPromotion, PricedTrial } from '../../src/convex/integrations/billing/types/records'

// ── Controllable composable state ───────────────────────────────────────────

const authed = ref(true)
const user = ref<Record<string, unknown> | null>({ name: 'Ada Lovelace', email: 'ada@example.com', emailVerified: false })

const products = ref<Record<string, { id: string, name: string, prices?: unknown[], trialInterval?: string, trialIntervalCount?: number } | undefined>>({
  pro: { id: 'prod_pro', name: 'Pro', prices: [{ priceAmount: 900, priceCurrency: 'EUR' }] },
  starter: { id: 'prod_starter', name: 'Starter', prices: [{ priceAmount: 0 }] },
  credits100: { id: 'prod_pack', name: '100 credits', prices: [{ priceAmount: 500, priceCurrency: 'EUR' }] },
})
const subscription = ref<{ id: string, status: string, productId: string, currentPeriodEnd?: string, cancelAtPeriodEnd?: boolean, endsAt?: string, free?: true } | null | undefined>(null)
/** What useBilling().error holds: here, a failed getCurrentSubscription read. */
const billingError = ref<{ code: string, data: Record<string, unknown>, message: string } | null>(null)
const productsFailure = ref<{ code: string, data: Record<string, unknown>, message: string } | null | undefined>(undefined)
// Whether the caller manages the workspace's billing (its owner or an admin).
const canManage = ref(true)
// A return from checkout being finished, and a plan change scheduled for the period's end.
const finishingCheckout = ref(false)
const pendingChange = ref<{ productId: string, appliesAt: Date } | null>(null)
// What the plan grants, as useFeatures reads it.
const grantedBenefits = ref<Array<Record<string, unknown>>>([])
const features = {
  plans: computed(() => []),
  benefits: computed(() => grantedBenefits.value),
  isLoading: computed(() => false),
  error: computed(() => null),
  has: () => false,
  hasPlan: () => false,
}

const billing = {
  products: computed(() => products.value),
  subscription: computed(() => subscription.value),
  subscriptions: computed(() => []),
  plan: computed(() => null),
  isSubscribed: computed(() => subscription.value != null && subscription.value.free !== true),
  isFree: computed(() => subscription.value === null || subscription.value?.free === true),
  isLoading: computed(() => false),
  status: computed(() => subscription.value?.status ?? null),
  cancelAtPeriodEnd: computed(() => subscription.value?.cancelAtPeriodEnd === true),
  resumesAt: computed(() => null),
  trialEnd: computed(() => null),
  isTrialing: computed(() => subscription.value?.status === 'trialing'),
  isPaused: computed(() => subscription.value?.status === 'paused'),
  isPastDue: computed(() => subscription.value?.status === 'past_due'),
  isFinishingCheckout: computed(() => finishingCheckout.value),
  pendingChange: computed(() => pendingChange.value),
  isPending: computed(() => false),
  canManage: computed(() => canManage.value),
  error: computed(() => billingError.value),
  // The products read's own failure: the failure while there are no products, unless a test says otherwise.
  productsError: computed(() => (productsFailure.value !== undefined ? productsFailure.value : products.value === undefined ? billingError.value : null)),
  checkout: vi.fn(async () => 'https://billing.example/checkout'),
  pass: computed(() => null),
  portal: vi.fn(async () => ''),
  changePlan: vi.fn(async () => {}),
  cancel: vi.fn(async () => {}),
  uncancel: vi.fn(async () => {}),
  cancelPendingChange: vi.fn(async () => {}),
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
  refresh: vi.fn(async () => {}),
}

// ── The live pricing, as usePricing reads getPricing ──────────────────────

/** One price of a plan at an interval. */
function priceOf(productId: string, amount: number, interval: 'month' | 'year', extra: { trial?: PricedTrial, credits?: number, savings?: number, retired?: boolean } = {}): PricedPlanPrice {
  return {
    productId,
    amount,
    currency: 'eur',
    monthly: interval === 'year' ? amount / 12 : amount,
    ...(extra.savings === undefined ? {} : { savings: extra.savings }),
    ...(extra.credits === undefined ? {} : { credits: { meter: 'credits', units: extra.credits, rollover: false } }),
    ...(extra.trial ? { trial: extra.trial } : {}),
    // A retired plan's prices are archived, as getPricing marks them.
    ...(extra.retired ? { archived: true as const } : {}),
  }
}

/** A plan as getPricing reads it: its monthly price, and a yearly one when given. */
function planOf(key: string, name: string, month: number | undefined, extra: { year?: number, savings?: number, trial?: PricedTrial, credits?: number, retired?: boolean, features?: string[] } = {}): PricedPlan {
  return {
    key,
    name,
    description: null,
    retired: extra.retired ?? false,
    features: extra.features ?? [],
    featureKeys: [],
    prices: {
      ...(month === undefined ? {} : { month: priceOf(`prod_${key}`, month, 'month', extra) }),
      ...(extra.year === undefined ? {} : { year: priceOf(`prod_${key}_year`, extra.year, 'year', { ...extra, credits: extra.credits === undefined ? undefined : extra.credits * 12, savings: extra.savings }) }),
    },
  }
}

const defaultPlans = (): PricedPlan[] => [planOf('starter', 'Starter', 0), planOf('pro', 'Pro', 900)]
const defaultPacks = (): PricedPack[] => [
  { key: 'credits100', productId: 'prod_pack', name: '100 credits', description: null, amount: 500, currency: 'eur', credits: { meter: 'credits', units: 100, rollover: true }, isBestValue: false },
]
const pricingPlans = ref<PricedPlan[] | undefined>(defaultPlans())
const pricingPacks = ref<PricedPack[] | undefined>(defaultPacks())
const pricingError = ref<{ code: string, data: Record<string, unknown>, message: string } | null>(null)
// The currency the pricing reads in, and every one the catalog prices: none named until a test names them.
const pricingCurrency = ref<string | undefined>(undefined)
const pricingCurrencies = ref<string[]>([])
// The promotion getPricing was asked for, when a test names one.
const pricingPromotion = ref<PricedPromotion | undefined>(undefined)
const pricing = {
  plans: computed(() => pricingPlans.value),
  packs: computed(() => pricingPacks.value),
  currency: computed(() => pricingCurrency.value),
  currencies: computed(() => pricingCurrencies.value),
  promotion: computed(() => pricingPromotion.value),
  setCurrency: vi.fn((currency: string) => {
    pricingCurrency.value = currency
  }),
  intervals: computed(() => (['month', 'year'] as const).filter(interval => (pricingPlans.value ?? []).some(plan => !plan.retired && plan.prices[interval]))),
  isLoading: computed(() => pricingPlans.value === undefined && pricingError.value === null),
  error: computed(() => pricingError.value),
  packFor: (units: number) => {
    const sorted = [...pricingPacks.value ?? []].sort((a, b) => a.credits!.units - b.credits!.units)
    return sorted.find(pack => pack.credits!.units >= units) ?? sorted.at(-1)
  },
  refresh: vi.fn(async () => {}),
}

// The address the page was opened at, as useRoute() reads it.
const route = reactive<{ fullPath: string, query: Record<string, string> }>({ fullPath: '/pricing', query: {} })

const workspaces = ref([
  { id: 'ws1', name: 'Personal', slug: 'personal', createdAt: 1 },
  { id: 'ws2', name: 'Acme', slug: 'acme', createdAt: 2 },
])
const activeWorkspace = ref<{ id: string, name: string, slug: string }>({ id: 'ws1', name: 'Personal', slug: 'personal' })
const organization = {
  workspaces: computed(() => workspaces.value),
  current: computed(() => activeWorkspace.value),
  member: computed(() => null),
  role: computed(() => 'owner'),
  members: computed(() => []),
  isLoading: computed(() => false),
  setActive: vi.fn(async () => {}),
  create: vi.fn(async () => ({ id: 'ws3', name: 'New', slug: 'new', createdAt: 3 })),
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
  client: {
    emailOtp: {
      requestEmailChange: vi.fn(async () => ({})),
      changeEmail: vi.fn(async () => ({})),
    },
  },
  session: ref({ data: null, isPending: false, refetch: vi.fn(async () => {}) }),
  // The composable's actions: they resolve with data, or reject.
  updateUser: vi.fn(async () => {}),
  sendOtp: vi.fn(async () => {}),
  deleteAccount: vi.fn(async () => {}),
  isImpersonating: computed(() => false),
  signOut: vi.fn(async () => {}),
  registerPasskey: vi.fn(async () => ({ id: 'pk2', createdAt: '2026-02-01' })),
}

const accountData = {
  latestExport: computed(() => null),
  exportsLeft: computed(() => 3),
  confirmation: computed(() => 'ada@example.com'),
  isLoading: computed(() => false),
  isPending: computed(() => false),
  error: computed(() => null),
  exportData: vi.fn(async () => ({ url: 'https://files.example.com/export.json', createdAt: 0, expiresAt: 3_600_000, parts: [] })),
  deleteAccount: vi.fn(async () => {}),
  deletion: computed(() => null),
  cancelDeletion: vi.fn(async () => true),
}

const passkeys = {
  passkeys: ref([{ id: 'pk1', name: 'Laptop', createdAt: '2026-01-01' }]),
  isLoading: computed(() => false),
  isPending: computed(() => false),
  error: ref<{ code: string, data: Record<string, unknown>, message: string } | null>(null),
  refresh: vi.fn(async () => {}),
  add: vi.fn(async () => ({ id: 'pk2', createdAt: '2026-02-01' })),
  rename: vi.fn(async () => {}),
  remove: vi.fn(async () => {}),
  capabilities: computed(() => null),
  passkeyOnly: ref(false),
  setPasskeyOnly: vi.fn(async (on: boolean) => ({ recoveryCode: on ? '7K2QM-ABCDE-FGHJK-MNPQR' : null })),
}

const sessions = {
  sessions: ref([
    { id: 's-current', userAgent: 'Chrome Mac OS X', createdAt: Date.parse('2026-01-01'), current: true },
    { id: 's-other', userAgent: 'Firefox Windows', createdAt: Date.parse('2026-01-02'), current: false },
  ]),
  current: computed(() => ({ id: 's-current', userAgent: 'Chrome Mac OS X', createdAt: Date.parse('2026-01-01'), current: true })),
  isLoading: ref(false),
  isPending: computed(() => false),
  error: ref<{ code: string, data: Record<string, unknown>, message: string } | null>(null),
  listError: ref<{ code: string, data: Record<string, unknown>, message: string } | null>(null),
  revoke: vi.fn(async () => {}),
  revokeOthers: vi.fn(async () => {}),
}

const backendConfig = {
  billing: {
    plans: [
      { key: 'starter', blurb: 'Start here.' },
      { key: 'pro', features: ['premium'], highlight: true },
    ] as Array<{ key: string, blurb?: string, features?: string[], highlight?: boolean }>,
    packs: [{ key: 'credits100' }] as Array<{ key: string }>,
    contact: undefined as { name: string, href: string, blurb?: string, features?: string[], label?: string } | undefined,
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
// Each usePricing call's options: whether a read is on the server, and when it is enabled.
const pricingReads: Array<{ server?: boolean, enabled?: MaybeRefOrGetter<boolean>, discount?: MaybeRefOrGetter<string | undefined> }> = []
vi.mock('../../src/runtime/vue/composables/use-pricing', () => ({ usePricing: (options: { server?: boolean, enabled?: MaybeRefOrGetter<boolean>, discount?: MaybeRefOrGetter<string | undefined> } = {}) => {
  pricingReads.push(options)
  return pricing
} }))
vi.mock('../../src/runtime/vue/composables/use-features', () => ({ useFeatures: () => features }))
const orderList = ref<Array<Record<string, unknown>> | undefined>([
  { id: 'ord_1', createdAt: '2026-08-01T10:00:00.000Z', status: 'paid', totalAmount: 900, currency: 'EUR', isInvoiceGenerated: true, product: { id: 'prod_pro', name: 'Pro' } },
  { id: 'ord_2', createdAt: '2026-07-01T10:00:00.000Z', status: 'refunded', totalAmount: 900, currency: 'EUR', isInvoiceGenerated: false, product: { id: 'prod_pro', name: 'Pro' } },
])
type Failure = { code: string, data: Record<string, unknown>, message: string }
/** A load failure as the composables hold it. */
const failure = (message: string): Failure => ({ code: 'unavailable', data: { service: 'billing', reason: 'provider_refused' }, message })
const ordersError = ref<Failure | null>(null)
const ordersHasMore = ref(true)
const ordersHasPrevious = ref(false)
const ordersLoading = ref(false)
const orders = {
  orders: orderList,
  page: ref(1),
  total: computed(() => 2),
  pageCount: computed(() => 2),
  hasMore: computed(() => ordersHasMore.value),
  hasPrevious: computed(() => ordersHasPrevious.value),
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
const usageError = ref<Failure | null>(null)
const usageHasMore = ref(false)
const usageHasPrevious = ref(false)
const usage = {
  events: usageEvents,
  page: ref(1),
  total: computed(() => 2),
  pageCount: computed(() => 1),
  units: computed(() => 12),
  hasMore: computed(() => usageHasMore.value),
  hasPrevious: computed(() => usageHasPrevious.value),
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
  isPending: computed(() => giftClaiming.value),
  claim: vi.fn(async () => true),
}
vi.mock('../../src/runtime/vue/composables/use-gifts', () => ({ useGifts: () => gifts }))
vi.mock('../../src/runtime/vue/composables/use-workspace', () => ({ useWorkspace: () => organization }))
vi.mock('../../src/runtime/vue/utils/auth-session', () => ({ useAuthSession: () => auth }))
// The frame's banner region reads the session as the base module holds it: a person's own, here.
vi.mock('nuxt-convex-module/better-auth/client', async () => ({
  // The real redirect check: the module itself would pull in the app's auth client.
  resolveAuthRedirect: (await import('../../node_modules/nuxt-convex-module/dist/runtime/better-auth/vue/redirect.js')).resolveAuthRedirect,
  useBetterAuth: () => ({ session: computed(() => ({ data: null })) }),
}))
vi.mock('../../src/runtime/vue/composables/use-passkeys', () => ({ usePasskeys: () => passkeys }))
vi.mock('../../src/runtime/vue/composables/use-account', () => ({ useAccount: () => accountData }))
vi.mock('../../src/runtime/vue/composables/use-sessions', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  useSessions: () => sessions,
}))
vi.mock('../../src/runtime/vue/composables/use-backend-config', () => ({ useBackendConfig: () => backendConfig }))
// The Alerts section's list: the latest sign-ins from a new device.
const signInAlerts = ref<Array<Record<string, unknown>> | undefined>([])
vi.mock('../../src/runtime/vue/components/account/security-alerts', () => ({
  useSignInAlertsState: () => ({ alerts: computed(() => signInAlerts.value), isLoading: computed(() => false), error: computed(() => null) }),
}))
// The shipped pages set the document title through the auto-imported useHead.
const { useHead, navigateTo } = vi.hoisted(() => ({ useHead: vi.fn(), navigateTo: vi.fn() }))
mockNuxtImport('useHead', () => useHead)
// Only the security page navigates (after a sign-out made on it).
mockNuxtImport('navigateTo', () => navigateTo)
// The pricing table's sign-in link and campaign read the address.
mockNuxtImport('useRoute', () => () => route)

// Runtime config is NOT mocked — the components fall back to the default page
// paths ('/login', '/pricing') when `public.backend.pages` is absent, which is
// exactly what the assertions below expect.
const { registerComponents } = await import('../helpers/register-components')
await registerComponents('PricingTable', 'BillingHistory', 'UsageHistory', 'NoticeLowCredits', 'WorkspaceSettings', 'ProfileSettings', 'SecuritySettings', 'AcceptInvitation', 'NoticeGift', 'page:pricing', 'page:settings', 'page:profile', 'page:security')
const { default: PricingTable } = await import('../../src/runtime/vue/components/billing/PricingTable.vue')
const { default: BillingHistory } = await import('../../src/runtime/vue/components/billing/BillingHistory.vue')
const { default: UsageHistory } = await import('../../src/runtime/vue/components/billing/UsageHistory.vue')
const { default: CreditsLowBanner } = await import('../../src/runtime/vue/components/shell/NoticeLowCredits.vue')
const { default: WorkspaceSettings } = await import('../../src/runtime/vue/components/workspaces/WorkspaceSettings.vue')
const { default: ProfileSettings } = await import('../../src/runtime/vue/components/account/ProfileSettings.vue')
type UseEmailChangeReturn = import('../../src/runtime/vue/composables/use-email-change').UseEmailChangeReturn
const { default: SecuritySettings } = await import('../../src/runtime/vue/components/account/SecuritySettings.vue')
const { default: AcceptInvitation } = await import('../../src/runtime/vue/components/workspaces/AcceptInvitation.vue')
const { default: GiftClaimBanner } = await import('../../src/runtime/vue/components/shell/NoticeGift.vue')
const { default: PricingPage } = await import('../../src/runtime/vue/pages/pricing.vue')
const { default: SettingsPage } = await import('../../src/runtime/vue/pages/settings.vue')
const { default: ProfilePage } = await import('../../src/runtime/vue/pages/profile.vue')
const { default: SecurityPage } = await import('../../src/runtime/vue/pages/security.vue')

beforeEach(() => {
  vi.clearAllMocks()
  authed.value = true
  subscription.value = null
  billingError.value = null
  productsFailure.value = undefined
  activeWorkspace.value = { id: 'ws1', name: 'Personal', slug: 'personal' }
  canManage.value = true
  user.value = { name: 'Ada Lovelace', email: 'ada@example.com', emailVerified: false }
  creditBalance.value = 42
  ordersError.value = null
  ordersHasMore.value = true
  ordersHasPrevious.value = false
  usageHasMore.value = false
  usageHasPrevious.value = false
  backendConfig.brand = {}
  backendConfig.labels = {}
  ordersLoading.value = false
  usageLoading.value = false
  usageError.value = null
  giftList.value = []
  giftClaiming.value = false
  finishingCheckout.value = false
  pendingChange.value = null
  grantedBenefits.value = []
  pricingPlans.value = defaultPlans()
  pricingPacks.value = defaultPacks()
  pricingError.value = null
  pricingCurrency.value = undefined
  pricingCurrencies.value = []
  pricingPromotion.value = undefined
  backendConfig.billing.contact = undefined
  route.fullPath = '/pricing'
  route.query = {}
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
    pricingPlans.value = [planOf('starter', 'Starter', 0, { trial: { interval: 'day', count: 7 } }), planOf('pro', 'Pro', 900)]
    const wrapper = mount(PricingTable)
    const card = wrapper.findAll('[data-pricing="plan"]')[0]!
    expect(card.attributes('data-trial')).toBeDefined()
    expect(card.find('[data-pricing="plan-trial"]').text()).toBe('7-day free trial')
    expect(card.find('[data-pricing="plan-action"]').text()).toBe('7-day free trial')
  })

  it('offers no first subscription or trial while the subscription could not be read, and says why', async () => {
    pricingPlans.value = [planOf('starter', 'Starter', 0, { trial: { interval: 'day', count: 7 } }), planOf('pro', 'Pro', 900)]
    // A failed getCurrentSubscription: no subscription known, the reason in error.
    subscription.value = undefined
    billingError.value = { code: 'unavailable', data: { service: 'backend', reason: 'unexpected' }, message: 'Something went wrong.' }
    const wrapper = mount(PricingTable)
    const actions = wrapper.findAll('[data-pricing="plan-action"]')
    expect(actions.length).toBeGreaterThan(0)
    for (const action of actions) {
      expect(action.attributes('disabled')).toBeDefined()
      expect(action.attributes('data-trial')).toBeUndefined()
      expect(action.text()).toBe('Subscribe')
    }
    expect(wrapper.find('[data-pricing="plan-trial"]').exists()).toBe(false)
    expect(wrapper.find('[data-pricing="error"]').text()).toBe('Something went wrong.')
    await actions[0]!.trigger('click')
    expect(billing.checkout).not.toHaveBeenCalled()
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

  it('cancels the current plan in one step, from the keyboard', async () => {
    subscription.value = { id: 'sub1', status: 'active', productId: 'prod_pro', currentPeriodEnd: '2026-09-01T00:00:00.000Z' }
    const wrapper = mount(PricingTable, { attachTo: document.body })
    const toggle = wrapper.find<HTMLButtonElement>('[data-pricing="plan"][data-current] [data-intent="cancel"]')
    toggle.element.focus()
    await toggle.trigger('click')
    // Pressing it cancels nothing yet: it opens one group, named, with what ends when and one button.
    expect(billing.cancel).not.toHaveBeenCalled()
    const group = wrapper.find('[data-pricing="cancel-confirm"]')
    expect(toggle.attributes()).toMatchObject({ 'aria-expanded': 'true', 'aria-controls': group.attributes('id') })
    expect(group.attributes('role')).toBe('group')
    expect(wrapper.find(`#${group.attributes('aria-labelledby')}`).text()).toBe('Cancel the plan')
    expect(group.find('[data-pricing="confirm-ends"]').text()).toMatch(/^The plan ends on .+\. Everything it includes stays until then\.$/)
    expect(group.findAll('button, input, select, textarea').map(control => control.attributes('data-pricing'))).toEqual(['confirm-cancel'])

    // Escape closes it, focus back on the button that opened it.
    const confirm = group.find<HTMLButtonElement>('[data-pricing="confirm-cancel"]')
    confirm.element.focus()
    await confirm.trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(wrapper.find('[data-pricing="cancel-confirm"]').exists()).toBe(false)
    expect(document.activeElement).toBe(toggle.element)

    await toggle.trigger('click')
    await wrapper.find('[data-pricing="confirm-cancel"]').trigger('click')
    await flushPromises()
    expect(billing.cancel).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('canceled')).toHaveLength(1)
    expect(wrapper.find('[data-pricing="cancel-confirm"]').exists()).toBe(false)
    // Focus stays on the current plan's button, not on the page.
    expect(document.activeElement).toBe(wrapper.find('[data-pricing="plan"][data-current] [data-pricing="plan-action"]').element)
    wrapper.unmount()
  })

  it('keeps a cancellation on its way open and deaf to a second press', async () => {
    subscription.value = { id: 'sub1', status: 'active', productId: 'prod_pro' }
    billing.cancel.mockImplementationOnce(() => new Promise(() => {}))
    const wrapper = mount(PricingTable, { attachTo: document.body })
    const toggle = wrapper.find('[data-pricing="plan"][data-current] [data-intent="cancel"]')
    await toggle.trigger('click')
    const confirm = wrapper.find<HTMLButtonElement>('[data-pricing="confirm-cancel"]')
    confirm.element.focus()
    await confirm.trigger('click')
    expect(confirm.attributes('aria-disabled')).toBe('true')
    expect(confirm.text()).toBe('Canceling…')
    expect(document.activeElement).toBe(confirm.element)
    await confirm.trigger('click')
    // Nor does another plan's button start anything meanwhile.
    await wrapper.find('[data-intent="downgrade"]').trigger('click')
    await confirm.trigger('keydown', { key: 'Escape' })
    await toggle.trigger('click')
    expect(billing.cancel).toHaveBeenCalledTimes(1)
    expect(billing.changePlan).not.toHaveBeenCalled()
    expect(wrapper.find('[data-pricing="cancel-confirm"]').exists()).toBe(true)
    wrapper.unmount()
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

  it('shows the empty state when no plan is on sale', () => {
    pricingPlans.value = []
    const wrapper = mount(PricingTable)
    expect(wrapper.find('[data-pricing="empty"]').exists()).toBe(true)
  })

  it('shows a refusal\'s own sentence, which production keeps, not the platform\'s wrapper', async () => {
    const message = 'Your email already pays for another workspace.'
    billing.checkout.mockRejectedValueOnce(Object.assign(
      new ConvexError({ code: 'forbidden', reason: 'customer_taken', message }),
      { message: '[CONVEX A(billing:generateCheckoutLink)] Server Error' },
    ))
    const wrapper = mount(PricingTable)
    await wrapper.find('[data-pricing="plan-action"][data-intent="subscribe"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-pricing="error"]').text()).toBe(message)
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

    pricingPlans.value = []
    const empty = mount(PricingTable).find('[data-pricing="empty"]')
    expect(empty.attributes('role')).toBe('status')
    expect(empty.attributes('aria-live')).toBe('polite')
  })

  it('offers a member who manages no billing no button the server would refuse, and says who does', () => {
    canManage.value = false
    subscription.value = { id: 'sub1', status: 'active', productId: 'prod_pro' }
    const wrapper = mount(PricingTable, { props: { showPortal: true } })
    expect(wrapper.findAll('[data-pricing="plan"]')).toHaveLength(2)
    expect(wrapper.find('[data-pricing="plan-action"]').exists()).toBe(false)
    expect(wrapper.find('[data-pricing="pack-action"]').exists()).toBe(false)
    expect(wrapper.find('[data-pricing="portal"]').exists()).toBe(false)
    expect(wrapper.find('[data-pricing="managed"]').text()).toBe('Your workspace\'s owner and admins manage its plan and buy its credits.')

    backendConfig.labels = { pricing: { managed: 'Ask Ada to upgrade.' } }
    expect(mount(PricingTable).find('[data-pricing="managed"]').text()).toBe('Ask Ada to upgrade.')

    // A signed-out visitor is offered the sign-in, whatever a stale role said.
    authed.value = false
    const visitor = mount(PricingTable)
    expect(visitor.find('[data-pricing="plan-action"][data-intent="sign-in"]').exists()).toBe(true)
    expect(visitor.find('[data-pricing="managed"]').exists()).toBe(false)
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

describe('PricingTable states', () => {
  it('says the plans are loading, not that none are configured, until the pricing lands', async () => {
    pricingPlans.value = undefined
    const wrapper = mount(PricingTable)
    expect(wrapper.find('[data-pricing="loading"]').attributes('role')).toBe('status')
    expect(wrapper.find('[data-pricing="empty"]').exists()).toBe(false)
    expect(wrapper.find('[data-pricing="table"]').attributes('aria-busy')).toBe('true')
    // A failed pricing read is no longer loading: the alert says why.
    pricingError.value = failure('Provider down')
    await flushPromises()
    expect(wrapper.find('[data-pricing="loading"]').exists()).toBe(false)
    expect(wrapper.find('[data-pricing="error"]').attributes('role')).toBe('alert')
    expect(wrapper.find('[data-pricing="error"]').text()).toBe('Provider down')
  })

  it('keeps loading the plans while only the subscription read failed', () => {
    pricingPlans.value = undefined
    subscription.value = undefined
    billingError.value = failure('Subscription down')
    const wrapper = mount(PricingTable)
    expect(wrapper.find('[data-pricing="loading"]').exists()).toBe(true)
  })

  it('names each card by its plan or pack, which describes its buttons, whatever the buttons say', () => {
    backendConfig.labels = { pricing: { subscribe: 'Get started' } } as never
    const wrapper = mount(PricingTable)
    const cards = wrapper.findAll('[data-pricing="plan"]')
    const names = cards.map(card => wrapper.find(`#${card.attributes('aria-labelledby')}`).text())
    expect(names).toEqual(['Starter', 'Pro'])
    for (const card of cards) {
      const button = card.find('[data-pricing="plan-action"]')
      // The accessible name is what the button shows: an override or a translation renames it whole.
      expect(button.text()).toBe('Get started')
      expect(button.attributes('aria-label')).toBeUndefined()
      expect(button.attributes('aria-describedby')).toBe(card.attributes('aria-labelledby'))
    }
    const pack = wrapper.find('[data-pricing="pack"]')
    expect(wrapper.find(`#${pack.attributes('aria-labelledby')}`).text()).toBe('100 credits')
  })

  it('keeps focus on a busy button, and announces what it waits for', async () => {
    billing.checkout.mockImplementationOnce(() => new Promise(() => {}))
    const wrapper = mount(PricingTable, { attachTo: document.body })
    const button = () => wrapper.findAll('[data-pricing="plan-action"]')[1]!
    ;(button().element as HTMLElement).focus()
    await button().trigger('click')
    expect(button().text()).toBe('Opening checkout…')
    expect(button().attributes('aria-disabled')).toBe('true')
    expect(button().attributes('disabled')).toBeUndefined()
    expect(document.activeElement).toBe(button().element)
    expect(wrapper.find('[data-pricing="status"]').text()).toBe('Opening checkout…')
    // A second press starts nothing.
    await button().trigger('click')
    expect(billing.checkout).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})

describe('PricingTable: the free plan and the currency', () => {
  /** The catalog's free plan beside Pro: getPricing marks it `free`. */
  const withFree = () => [{ ...planOf('free', 'Free', 0, { credits: 10 }), free: true as const }, planOf('pro', 'Pro', 900, { credits: 200 })]
  beforeEach(() => {
    backendConfig.billing.plans = [{ key: 'free' }, { key: 'pro' }]
    pricingPlans.value = withFree()
  })

  it('marks the free plan current with no button while the workspace is on it, and checks out a plan instead', async () => {
    subscription.value = { id: 'sub_free', status: 'active', productId: 'prod_free', free: true }
    const wrapper = mount(PricingTable)
    const [free, pro] = wrapper.findAll('[data-pricing="plan"]')
    expect(free!.attributes('data-free')).toBeDefined()
    expect(free!.attributes('data-current')).toBeDefined()
    expect(free!.find('[data-pricing="current-badge"]').exists()).toBe(true)
    // Nothing to cancel, change or pause: the free plan stays until a paid one replaces it.
    expect(free!.find('[data-pricing="plan-action"]').exists()).toBe(false)
    expect(free!.find('[data-pricing="plan-price"]').text()).toBe('€0/mo')
    // A plan is a first checkout, which upgrades the free subscription on the server.
    const subscribe = pro!.find('[data-pricing="plan-action"]')
    expect(subscribe.attributes('data-intent')).toBe('subscribe')
    await subscribe.trigger('click')
    await flushPromises()
    expect(billing.checkout).toHaveBeenCalledWith('prod_pro', { redirect: true })
    // No portal for the free plan: there is nothing to manage there.
    expect(wrapper.find('[data-pricing="portal"]').exists()).toBe(false)
  })

  it('tells a paid subscriber the free plan is theirs again when the plan ends, and a visitor to sign up for it', () => {
    subscription.value = { id: 'sub_pro', status: 'active', productId: 'prod_pro' }
    const free = mount(PricingTable).find('[data-pricing="plan"][data-free]')
    expect(free.find('[data-pricing="plan-action"]').exists()).toBe(false)
    expect(free.find('[data-pricing="plan-returns"]').text()).toBe('Yours again when your plan ends')
    authed.value = false
    expect(mount(PricingTable).find('[data-pricing="plan"][data-free] [data-intent="sign-in"]').text()).toBe('Sign up for free')
  })

  /** The pricing read again in `currency`, as getPricing answers once the visitor switched: `only` stays in euros, priced in nothing else. */
  function repriced(currency: string, only: string[] = []) {
    const priced = <T extends { currency: string }>(price: T, key: string): T => (only.includes(key) ? price : { ...price, currency })
    pricingPlans.value = withFree().map(plan => ({ ...plan, prices: Object.fromEntries(Object.entries(plan.prices).map(([interval, price]) => [interval, priced(price!, plan.key)])) }))
    pricingPacks.value = defaultPacks().map(pack => priced(pack, pack.key))
  }
  afterEach(() => {
    pricingCurrency.value = undefined
    pricingCurrencies.value = []
    pricingPacks.value = defaultPacks()
  })

  it('switches the currency with a select of the catalog\'s currencies, and checks out in it', async () => {
    expect(mount(PricingTable).find('[data-pricing="currency"]').exists()).toBe(false)
    pricingCurrency.value = 'eur'
    pricingCurrencies.value = ['eur', 'usd']
    // The switch re-reads the pricing in the currency picked.
    pricing.setCurrency.mockImplementationOnce((currency: string) => {
      pricingCurrency.value = currency
      repriced(currency)
    })
    const wrapper = mount(PricingTable)
    const select = wrapper.find<HTMLSelectElement>('[data-pricing="currency"] select')
    expect(wrapper.find('[data-pricing="currency-legend"]').text()).toBe('Currency')
    expect(select.findAll('option').map(option => option.text())).toEqual(['Euro (EUR)', 'US Dollar (USD)'])
    expect(select.element.value).toBe('eur')
    await select.setValue('usd')
    expect(pricing.setCurrency).toHaveBeenCalledWith('usd')
    await wrapper.findAll('[data-pricing="plan-action"][data-intent="subscribe"]')[0]!.trigger('click')
    await flushPromises()
    expect(billing.checkout).toHaveBeenCalledWith('prod_pro', { redirect: true, currency: 'usd' })
    await wrapper.find('[data-pricing="pack-action"]').trigger('click')
    await flushPromises()
    expect(credits.topUp).toHaveBeenCalledWith('prod_pack', { redirect: true, currency: 'usd' })
  })

  it('checks out each card in the currency its price shows: one priced in a single currency pays in it', async () => {
    pricingCurrency.value = 'usd'
    pricingCurrencies.value = ['eur', 'usd']
    // Pro and the pack are priced in euros only, whatever the page's currency.
    repriced('usd', ['pro', 'credits100'])
    const wrapper = mount(PricingTable)
    const pro = wrapper.findAll('[data-pricing="plan"]')[1]!
    expect(pro.find('[data-pricing="plan-price"]').text()).toBe('€9/mo')
    await pro.find('[data-pricing="plan-action"]').trigger('click')
    await flushPromises()
    expect(billing.checkout).toHaveBeenCalledWith('prod_pro', { redirect: true, currency: 'eur' })
    await wrapper.find('[data-pricing="pack-action"]').trigger('click')
    await flushPromises()
    expect(credits.topUp).toHaveBeenCalledWith('prod_pack', { redirect: true, currency: 'eur' })
  })

  it('names no currency for a catalog priced in one: the provider\'s own stands', async () => {
    pricingCurrency.value = 'eur'
    pricingCurrencies.value = ['eur']
    const wrapper = mount(PricingTable)
    await wrapper.findAll('[data-pricing="plan-action"][data-intent="subscribe"]')[0]!.trigger('click')
    await flushPromises()
    expect(billing.checkout).toHaveBeenCalledWith('prod_pro', { redirect: true })
  })
})

describe('PricingTable: yearly prices, retired plans, campaign links', () => {
  /** Pro and Ultra at both intervals, Starter by the month alone. */
  const yearly = () => [
    planOf('starter', 'Starter', 500, { credits: 50 }),
    planOf('pro', 'Pro', 900, { year: 9000, savings: 16, credits: 200 }),
    planOf('ultra', 'Ultra', 1900, { year: 19000, savings: 16, credits: 500 }),
  ]
  beforeEach(() => {
    backendConfig.billing.plans = [{ key: 'starter' }, { key: 'pro', features: ['premium'] }, { key: 'ultra' }]
  })

  it('switches between monthly and yearly prices with a radio group, and says what a year saves', async () => {
    pricingPlans.value = yearly()
    const wrapper = mount(PricingTable, { attachTo: document.body })
    const group = wrapper.find('fieldset[data-pricing="interval"]')
    expect(group.find('legend').text()).toBe('Billing period')
    // One name, so the arrow keys move between them and the browser announces the choice.
    const radios = group.findAll<HTMLInputElement>('input[type="radio"]')
    expect(radios.map(radio => radio.attributes('value'))).toEqual(['month', 'year'])
    expect(new Set(radios.map(radio => radio.attributes('name'))).size).toBe(1)
    expect(radios[0]!.element.checked).toBe(true)
    expect(group.find('[data-interval="year"] [data-pricing="interval-savings"]').text()).toBe('Save 16%')
    const pro = () => wrapper.findAll('[data-pricing="plan"]')[1]!
    expect(pro().find('[data-pricing="plan-price"]').text()).toBe('€9/mo')
    expect(pro().find('[data-feature="credits"]').text()).toBe('200 credits / month')

    radios[1]!.element.focus()
    await radios[1]!.setValue(true)
    expect(wrapper.emitted('update:interval')).toEqual([['year']])
    expect(pro().attributes('data-interval')).toBe('year')
    expect(pro().find('[data-pricing="plan-price"]').text()).toBe('€90/yr')
    expect(pro().find('[data-pricing="plan-savings"]').text()).toBe('Save 16%')
    expect(pro().find('[data-feature="credits"]').text()).toBe('2400 credits / year')
    // A plan with no yearly price keeps showing its monthly one.
    expect(wrapper.findAll('[data-pricing="plan"]')[0]!.find('[data-pricing="plan-price"]').text()).toBe('€5/mo')
    await flushPromises()
    await pro().find('[data-intent="subscribe"]').trigger('click')
    await flushPromises()
    expect(billing.checkout).toHaveBeenCalledWith('prod_pro_year', { redirect: true })
    wrapper.unmount()
  })

  it('follows v-model:interval, and shows no switch for plans priced at one interval', () => {
    pricingPlans.value = yearly()
    const wrapper = mount(PricingTable, { props: { interval: 'year' } })
    expect(wrapper.find<HTMLInputElement>('input[value="year"]').element.checked).toBe(true)
    expect(wrapper.findAll('[data-pricing="plan"]')[2]!.find('[data-pricing="plan-price"]').text()).toBe('€190/yr')
    pricingPlans.value = defaultPlans()
    expect(mount(PricingTable).find('[data-pricing="interval"]').exists()).toBe(false)
  })

  it('names the direction by the price per month, and offers a subscriber their own plan at the other interval', async () => {
    pricingPlans.value = yearly()
    // On Pro yearly: €7.50 a month, against Starter's €5 and Ultra's €19.
    subscription.value = { id: 'sub1', status: 'active', productId: 'prod_pro_year' }
    const wrapper = mount(PricingTable)
    const [starter, pro, ultra] = wrapper.findAll('[data-pricing="plan"]')
    expect(starter!.find('[data-pricing="plan-action"]').attributes('data-intent')).toBe('downgrade')
    expect(ultra!.find('[data-pricing="plan-action"]').attributes('data-intent')).toBe('upgrade')
    expect(pro!.attributes('data-current')).toBeDefined()
    const own = pro!.find('[data-pricing="plan-action"]')
    expect(own.attributes('data-intent')).toBe('switch')
    expect(own.text()).toBe('Switch to monthly billing')
    await own.trigger('click')
    await flushPromises()
    expect(billing.changePlan).toHaveBeenCalledWith('prod_pro')
  })

  it('shows a retired plan to its subscribers alone, and switches nobody to it', () => {
    pricingPlans.value = [...defaultPlans(), planOf('legacy', 'Legacy', 400, { year: 4000, retired: true })]
    backendConfig.billing.plans = [{ key: 'starter' }, { key: 'pro' }, { key: 'legacy' }]
    expect(mount(PricingTable).findAll('[data-pricing="plan"]').map(card => card.find('[data-pricing="plan-name"]').text())).toEqual(['Starter', 'Pro'])
    // Its monthly subscriber sees it, marked, and can cancel it — at the other interval, no switch to it.
    subscription.value = { id: 'sub1', status: 'active', productId: 'prod_legacy' }
    const subscriber = mount(PricingTable)
    const card = subscriber.find('[data-pricing="plan"][data-retired]')
    expect(card.find('[data-pricing="retired-badge"]').text()).toBe('No longer offered')
    expect(card.find('[data-pricing="plan-action"]').attributes('data-intent')).toBe('cancel')
    // With the yearly prices shown too: their card is the price they pay, with its cancel button.
    const yearlyCard = mount(PricingTable, { props: { interval: 'year' } }).find('[data-pricing="plan"][data-retired]')
    expect(yearlyCard.attributes('data-interval')).toBe('month')
    expect(yearlyCard.find('[data-pricing="plan-action"]').attributes('data-intent')).toBe('cancel')
    // With nothing configured, every plan on sale, in catalog order, the retired one left out.
    backendConfig.billing.plans = []
    subscription.value = null
    expect(mount(PricingTable).findAll('[data-pricing="plan"]')).toHaveLength(2)
  })

  it('offers a price archived in the dashboard to nobody new, and keeps it for its subscriber', () => {
    const plans = yearly()
    plans[1]!.prices.year!.archived = true
    pricingPlans.value = plans
    // At yearly, Pro shows the monthly price it still sells.
    const pro = mount(PricingTable, { props: { interval: 'year' } }).findAll('[data-pricing="plan"]')[1]!
    expect(pro.attributes('data-interval')).toBe('month')
    expect(pro.find('[data-pricing="plan-action"]').attributes('data-intent')).toBe('subscribe')
    // Its subscriber still sees the yearly price as theirs.
    subscription.value = { id: 'sub1', status: 'active', productId: 'prod_pro_year' }
    const own = mount(PricingTable, { props: { interval: 'year' } }).findAll('[data-pricing="plan"]')[1]!
    expect(own.attributes('data-interval')).toBe('year')
    expect(own.find('[data-pricing="plan-action"]').attributes('data-intent')).toBe('cancel')
  })

  it('says when a scheduled switch starts, on the price it moves to, instead of offering it again', () => {
    pricingPlans.value = yearly()
    subscription.value = { id: 'sub1', status: 'active', productId: 'prod_pro_year' }
    pendingChange.value = { productId: 'prod_pro', appliesAt: new Date('2027-10-19T12:00:00Z') }
    const pro = mount(PricingTable).findAll('[data-pricing="plan"]')[1]!
    expect(pro.find('[data-pricing="plan-action"]').exists()).toBe(false)
    expect(pro.find('[data-pricing="plan-scheduled"]').text()).toBe('Starts on Oct 19, 2027')
  })

  it('checks out without a campaign code the provider refuses, keeping the attribution and saying nothing', async () => {
    route.query = { discount: 'EXPIRED1', utm_source: 'newsletter' }
    billing.checkout.mockRejectedValueOnce(new ConvexError({ code: 'invalid_input', field: 'discountCode', message: 'The provider refused the discount code.' }))
    const wrapper = mount(PricingTable)
    await wrapper.find('[data-pricing="plan-action"][data-intent="subscribe"]').trigger('click')
    await flushPromises()
    expect(billing.checkout).toHaveBeenNthCalledWith(1, 'prod_starter', { redirect: true, discountCode: 'EXPIRED1', utm: { source: 'newsletter' } })
    expect(billing.checkout).toHaveBeenNthCalledWith(2, 'prod_starter', { redirect: true, utm: { source: 'newsletter' } })
    expect(wrapper.find('[data-pricing="error"]').exists()).toBe(false)
    // Any other refusal is still the table's to show, and opens nothing again.
    billing.checkout.mockRejectedValueOnce(new ConvexError({ code: 'invalid_input', field: 'productIds', message: 'Not in the catalog.' }))
    await wrapper.find('[data-pricing="plan-action"][data-intent="subscribe"]').trigger('click')
    await flushPromises()
    expect(billing.checkout).toHaveBeenCalledTimes(3)
    expect(wrapper.find('[data-pricing="error"]').exists()).toBe(true)
  })

  it('marks the plan a ?plan= link asks for, as <UpgradePrompt> links to it', () => {
    route.query = { plan: 'pro' }
    const cards = mount(PricingTable).findAll('[data-pricing="plan"]')
    expect(cards.filter(card => card.attributes('data-requested') !== undefined).map(card => card.find('[data-pricing="plan-name"]').text())).toEqual(['Pro'])
    route.query = {}
    expect(mount(PricingTable).find('[data-pricing="plan"][data-requested]').exists()).toBe(false)
  })

  it('signs a visitor in back to this very address, campaign and all', () => {
    authed.value = false
    route.fullPath = '/pricing?discount=LAUNCH20&utm_source=newsletter'
    const action = mount(PricingTable).find('[data-pricing="plan-action"][data-intent="sign-in"]')
    expect(action.attributes('href')).toBe('/login?redirect=%2Fpricing%3Fdiscount%3DLAUNCH20%26utm_source%3Dnewsletter')
  })

  it('carries a campaign link\'s discount code and attribution into checkout and top-up', async () => {
    route.query = { discount: 'LAUNCH20', utm_source: 'newsletter', utm_campaign: 'autumn' }
    const wrapper = mount(PricingTable)
    await wrapper.find('[data-pricing="plan-action"][data-intent="subscribe"]').trigger('click')
    await flushPromises()
    expect(billing.checkout).toHaveBeenCalledWith('prod_starter', { redirect: true, discountCode: 'LAUNCH20', utm: { source: 'newsletter', campaign: 'autumn' } })
    await wrapper.find('[data-pricing="pack-action"]').trigger('click')
    await flushPromises()
    expect(credits.topUp).toHaveBeenCalledWith('prod_pack', { redirect: true, discountCode: 'LAUNCH20', utm: { source: 'newsletter', campaign: 'autumn' } })
    // The code itself is never shown, and one no provider could issue never travels.
    expect(wrapper.text()).not.toContain('LAUNCH20')
    route.query = { discount: 'not-a-code!' }
    await wrapper.find('[data-pricing="plan-action"][data-intent="subscribe"]').trigger('click')
    await flushPromises()
    expect(billing.checkout).toHaveBeenLastCalledWith('prod_starter', { redirect: true })
  })

  /** Pro's monthly price and the pack carrying a promotion's offer, as getPricing answers when asked for one. */
  function withPromotion(promotion: Partial<PricedPromotion> = {}) {
    pricingPromotion.value = { key: 'launch', name: 'Launch offer', percentOff: 20, duration: 'repeating', months: 3, endsAt: '2099-12-31T12:00:00.000Z', ...promotion }
    pricingPlans.value = defaultPlans().map(plan => plan.key === 'pro' ? { ...plan, prices: { month: { ...plan.prices.month!, promotion: { amount: 720, off: 180 } } } } : plan)
    pricingPacks.value = defaultPacks().map(pack => ({ ...pack, promotion: { amount: 400, off: 100 } }))
  }

  it('says a promotion\'s real terms, the regular price after it and its end date, on the prices it applies to', () => {
    withPromotion()
    const wrapper = mount(PricingTable, { props: { discount: 'launch' } })
    // The page asked getPricing for it.
    expect(toValue(pricingReads.at(-1)?.discount)).toBe('launch')
    const [starter, pro] = wrapper.findAll('[data-pricing="plan"]')
    expect(starter!.find('[data-pricing="plan-promotion"]').exists()).toBe(false)
    expect(pro!.attributes('data-promotion')).toBeDefined()
    expect(pro!.find('[data-pricing="plan-promotion"]').text()).toBe('Launch offer 20% off for 3 months, then €9/mo Offer ends Dec 31, 2099')
    // The regular price stays the price shown: nothing struck through, no countdown.
    expect(pro!.find('[data-pricing="plan-price"]').text()).toBe('€9/mo')
    expect(wrapper.find('s, del').exists()).toBe(false)
    expect(wrapper.find('[data-pricing="pack-promotion"]').text()).toBe('Launch offer 20% off: €4 at checkout Offer ends Dec 31, 2099')
  })

  it('words each duration, and a fixed amount in the price\'s currency', () => {
    withPromotion({ duration: 'once', months: undefined })
    expect(mount(PricingTable, { props: { discount: 'launch' } }).find('[data-pricing="plan-promotion"]').text()).toContain('20% off the first payment, then €9/mo')
    withPromotion({ duration: 'forever', months: undefined, percentOff: undefined, endsAt: undefined })
    expect(mount(PricingTable, { props: { discount: 'launch' } }).find('[data-pricing="plan-promotion"]').text()).toBe('Launch offer €1.80 off for as long as the subscription lasts')
  })

  it('shows a promotion only between its start and its end, by the page\'s clock', () => {
    withPromotion({ endsAt: '2020-01-01T00:00:00.000Z' })
    expect(mount(PricingTable, { props: { discount: 'launch' } }).find('[data-pricing="plan-promotion"]').exists()).toBe(false)
    withPromotion({ startsAt: '2099-01-01T00:00:00.000Z' })
    expect(mount(PricingTable, { props: { discount: 'launch' } }).find('[data-pricing="plan-promotion"]').exists()).toBe(false)
  })

  it('checks out with the promotion on a price it applies to, and without it once the server refuses it', async () => {
    withPromotion()
    route.query = { utm_source: 'newsletter' }
    const wrapper = mount(PricingTable, { props: { discount: 'launch' } })
    const [starter, pro] = wrapper.findAll('[data-pricing="plan"] [data-intent="subscribe"]')
    // Starter carries no offer: its checkout names no promotion.
    await starter!.trigger('click')
    await flushPromises()
    expect(billing.checkout).toHaveBeenLastCalledWith('prod_starter', { redirect: true, utm: { source: 'newsletter' } })
    billing.checkout.mockRejectedValueOnce(new ConvexError({ code: 'invalid_input', field: 'discount', message: 'The provider refused it.' }))
    await pro!.trigger('click')
    await flushPromises()
    expect(billing.checkout).toHaveBeenNthCalledWith(2, 'prod_pro', { redirect: true, discount: 'launch', utm: { source: 'newsletter' } })
    expect(billing.checkout).toHaveBeenNthCalledWith(3, 'prod_pro', { redirect: true, utm: { source: 'newsletter' } })
    expect(wrapper.find('[data-pricing="error"]').exists()).toBe(false)
  })

  it('keeps a campaign link\'s own code on a price the table\'s promotion is not for, one discount per checkout', async () => {
    withPromotion()
    route.query = { discount: 'PARTNER5' }
    const wrapper = mount(PricingTable, { props: { discount: 'launch' } })
    // The table's promotion is the one shown.
    expect(toValue(pricingReads.at(-1)?.discount)).toBe('launch')
    const [starter, pro] = wrapper.findAll('[data-pricing="plan"] [data-intent="subscribe"]')
    await starter!.trigger('click')
    await flushPromises()
    expect(billing.checkout).toHaveBeenLastCalledWith('prod_starter', { redirect: true, discountCode: 'PARTNER5' })
    await pro!.trigger('click')
    await flushPromises()
    expect(billing.checkout).toHaveBeenLastCalledWith('prod_pro', { redirect: true, discount: 'launch' })
  })

  it('reads a campaign link\'s code as the promotion to show, and offers none to a paying subscriber', () => {
    route.query = { discount: 'LAUNCH20' }
    withPromotion()
    const wrapper = mount(PricingTable)
    expect(toValue(pricingReads.at(-1)?.discount)).toBe('LAUNCH20')
    expect(wrapper.find('[data-pricing="plan-promotion"]').exists()).toBe(true)
    subscription.value = { id: 'sub1', status: 'active', productId: 'prod_pro' }
    expect(mount(PricingTable).find('[data-pricing="plan"][data-current] [data-pricing="plan-promotion"]').exists()).toBe(false)
    // A plan change takes no discount: a Starter subscriber's Pro card says none.
    subscription.value = { id: 'sub1', status: 'active', productId: 'prod_starter' }
    const switching = mount(PricingTable)
    expect(switching.find('[data-intent="upgrade"]').exists()).toBe(true)
    expect(switching.find('[data-pricing="plan-promotion"]').exists()).toBe(false)
  })

  it('compares the packs credit for credit, and marks the best value', () => {
    pricingPacks.value = [
      { key: 'credits100', productId: 'prod_100', name: '100 credits', description: null, amount: 1000, currency: 'eur', credits: { meter: 'credits', units: 100, rollover: true }, perCredit: 10, isBestValue: false },
      { key: 'credits500', productId: 'prod_500', name: '500 credits', description: null, amount: 4000, currency: 'eur', credits: { meter: 'credits', units: 500, rollover: true }, perCredit: 8, lessPerCredit: 20, isBestValue: true },
    ]
    backendConfig.billing.packs = []
    const [small, big] = mount(PricingTable).findAll('[data-pricing="pack"]')
    expect(small!.find('[data-pricing="pack-credits"]').text()).toBe('100 credits')
    expect(small!.find('[data-pricing="pack-per-credit"]').text()).toBe('€0.10 per credit')
    expect(small!.attributes('data-best-value')).toBeUndefined()
    expect(big!.attributes('data-best-value')).toBeDefined()
    expect(big!.find('[data-pricing="best-value"]').text()).toBe('Best value')
    expect(big!.find('[data-pricing="pack-saving"]').text()).toBe('20% less per credit')
    backendConfig.billing.packs = [{ key: 'credits100' }]
  })

  it('adds the contact card after the plans: a link, never a checkout', () => {
    backendConfig.billing.contact = { name: 'Enterprise', blurb: 'Custom limits.', features: ['SSO'], href: 'mailto:sales@example.com' }
    const wrapper = mount(PricingTable)
    const card = wrapper.find('[data-pricing="plans"] [data-pricing="contact"]')
    expect(wrapper.find(`#${card.attributes('aria-labelledby')}`).text()).toBe('Enterprise')
    expect(card.find('[data-pricing="contact-action"]').attributes('href')).toBe('mailto:sales@example.com')
    expect(card.find('[data-pricing="contact-action"]').text()).toBe('Contact us')
    expect(mount(PricingTable, { props: { contact: null } }).find('[data-pricing="contact"]').exists()).toBe(false)
  })
})

describe('CreditsLowBanner: the pack that covers the shortfall', () => {
  const packs = (): PricedPack[] => [
    { key: 'credits100', productId: 'prod_100', name: '100 credits', description: null, amount: 1000, currency: 'eur', credits: { meter: 'credits', units: 100, rollover: true }, isBestValue: false },
    { key: 'credits500', productId: 'prod_500', name: '500 credits', description: null, amount: 4000, currency: 'eur', credits: { meter: 'credits', units: 500, rollover: true }, isBestValue: true },
  ]

  it('preselects the smallest pack that covers what the refused call needed', async () => {
    pricingPacks.value = packs()
    creditBalance.value = 3
    // An insufficient_credits refusal: 3 left, 300 needed — 100 credits would not do.
    const wrapper = mount(CreditsLowBanner, { props: { need: 300 } })
    const action = wrapper.find('[data-credits="action"]')
    expect(action.attributes('data-pack')).toBe('credits500')
    expect(action.text()).toBe('Buy 500 credits')
    await action.trigger('click')
    await flushPromises()
    expect(credits.topUp).toHaveBeenCalledWith('prod_500', { redirect: true })
    // Needing less, the small pack covers it.
    expect(mount(CreditsLowBanner, { props: { need: 50 } }).find('[data-credits="action"]').attributes('data-pack')).toBe('credits100')
  })

  it('shows while the balance is short of the need, even above the threshold', () => {
    pricingPacks.value = packs()
    creditBalance.value = 42
    expect(mount(CreditsLowBanner).find('[data-credits="banner"]').exists()).toBe(false)
    expect(mount(CreditsLowBanner, { props: { need: 60 } }).find('[data-credits="banner"]').exists()).toBe(true)
  })

  it('reads the pricing in the browser, and only while it would preselect a pack', () => {
    pricingPacks.value = packs()
    pricingReads.length = 0
    creditBalance.value = 42
    mount(CreditsLowBanner)
    const read = pricingReads.at(-1)!
    expect(read.server).toBe(false)
    // A healthy balance holds no read open.
    expect(toValue(read.enabled)).toBe(false)
    creditBalance.value = 3
    expect(toValue(read.enabled)).toBe(true)
    // Nor for a member who buys no credits, or with a pack named.
    canManage.value = false
    expect(toValue(read.enabled)).toBe(false)
    canManage.value = true
    mount(CreditsLowBanner, { props: { pack: 'credits100' } })
    expect(toValue(pricingReads.at(-1)!.enabled)).toBe(false)
  })

  it('links a member who buys no credits to the plans instead', () => {
    pricingPacks.value = packs()
    creditBalance.value = 3
    canManage.value = false
    expect(mount(CreditsLowBanner, { props: { need: 300 } }).find('[data-credits="action"]').attributes('href')).toBe('/pricing')
  })
})

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

  it('keeps focus on the pager while a page loads, and ignores a second press', async () => {
    const wrapper = mount(BillingHistory, { attachTo: document.body })
    const older = wrapper.find('[data-history="older"]')
    ;(older.element as HTMLElement).focus()
    await older.trigger('click')
    ordersLoading.value = true
    await flushPromises()
    expect(older.attributes('aria-disabled')).toBe('true')
    expect(older.attributes('disabled')).toBeUndefined()
    expect(document.activeElement).toBe(older.element)
    await older.trigger('click')
    expect(orders.next).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('says the page loads, and moves focus to the newer button once the last page is in', async () => {
    let finish!: () => void
    orders.next.mockImplementationOnce(() => new Promise<void>((resolve) => {
      ordersLoading.value = true
      finish = () => {
        ordersLoading.value = false
        ordersHasMore.value = false
        ordersHasPrevious.value = true
        resolve()
      }
    }))
    const wrapper = mount(BillingHistory, { attachTo: document.body })
    const older = wrapper.find('[data-history="older"]')
    ;(older.element as HTMLElement).focus()
    await older.trigger('click')
    await flushPromises()
    expect(older.text()).toBe('Loading the page…')
    expect(wrapper.find('[data-history="status"]').text()).toBe('Loading the page…')
    finish()
    await flushPromises()
    // No page is left that way: the button is unavailable, and focus did not drop to the page.
    expect(older.attributes('disabled')).toBeDefined()
    expect(older.text()).toBe('Older')
    expect(wrapper.find('[data-history="status"]').text()).toBe('')
    expect(document.activeElement).toBe(wrapper.find('[data-history="newer"]').element)
    wrapper.unmount()
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
    ordersError.value = failure('Provider unreachable')
    const wrapper = mount(BillingHistory)
    const error = wrapper.find('[data-history="error"]')
    expect(error.text()).toBe('Provider unreachable')
    expect(error.attributes('role')).toBe('alert')
  })

  it('words a failed invoice as useOrders holds it, and emits that sentence', async () => {
    // useOrders mirrors a failed invoice into its `error` before rejecting.
    orders.invoice.mockImplementationOnce(async () => {
      ordersError.value = failure('That order is not on this billing account.')
      throw new Error('[CONVEX A(billing:getInvoiceUrl)] Server Error')
    })
    const wrapper = mount(BillingHistory)
    await wrapper.find('[data-history="invoice"]').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('error')).toEqual([['That order is not on this billing account.']])
    expect(wrapper.find('[data-history="error"]').text()).toBe('That order is not on this billing account.')
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

  it('keeps focus on the pager button pressed while its page loads, saying so, and ignores a second press', async () => {
    usageHasMore.value = true
    let finish!: () => void
    usage.next.mockImplementationOnce(() => new Promise<void>((resolve) => {
      usageLoading.value = true
      finish = () => {
        usageLoading.value = false
        usageHasMore.value = false
        usageHasPrevious.value = true
        resolve()
      }
    }))
    const wrapper = mount(UsageHistory, { attachTo: document.body })
    const older = wrapper.find('[data-usage="older"]')
    const status = wrapper.find('[data-usage="status"]')
    expect(status.attributes('role')).toBe('status')
    expect(status.text()).toBe('')
    ;(older.element as HTMLElement).focus()
    await older.trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-usage="root"]').attributes('aria-busy')).toBe('true')
    expect(older.attributes('aria-disabled')).toBe('true')
    expect(older.attributes('disabled')).toBeUndefined()
    expect(older.text()).toBe('Loading the page…')
    expect(status.text()).toBe('Loading the page…')
    expect(document.activeElement).toBe(older.element)
    await older.trigger('click')
    expect(usage.next).toHaveBeenCalledTimes(1)
    finish()
    await flushPromises()
    expect(older.attributes('disabled')).toBeDefined()
    expect(status.text()).toBe('')
    expect(document.activeElement).toBe(wrapper.find('[data-usage="newer"]').element)
    wrapper.unmount()
  })

  it('leaves focus alone after a page turn that keeps the button pressed available', async () => {
    usageHasMore.value = true
    const wrapper = mount(UsageHistory, { attachTo: document.body })
    const older = wrapper.find('[data-usage="older"]')
    ;(older.element as HTMLElement).focus()
    await older.trigger('click')
    usageHasPrevious.value = true
    await flushPromises()
    expect(document.activeElement).toBe(older.element)
    wrapper.unmount()
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

      usageError.value = failure('Meter unavailable')
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

  it('appears under the threshold and links to the plans when no pack is on sale', () => {
    creditBalance.value = 3
    pricingPacks.value = []
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

  it('keeps focus where the banner was once it is dismissed', async () => {
    creditBalance.value = 3
    const wrapper = mount(CreditsLowBanner, { props: { threshold: 10 }, attachTo: document.body })
    const dismiss = wrapper.find('[data-credits="dismiss"]')
    ;(dismiss.element as HTMLElement).focus()
    await dismiss.trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-credits="banner"]').exists()).toBe(false)
    // Not dropped to the page: on the banner's region, where the next Tab carries on.
    const region = wrapper.find('[data-credits="region"]')
    expect(document.activeElement).toBe(region.element)
    expect(region.attributes('tabindex')).toBe('-1')
    wrapper.unmount()
  })

  it('leaves focus alone when the banner is dismissed from elsewhere', async () => {
    creditBalance.value = 3
    const outside = document.body.appendChild(document.createElement('button'))
    const wrapper = mount(CreditsLowBanner, {
      props: { threshold: 10 },
      slots: { dismiss: ({ dismiss }: { dismiss: () => void }) => h('i', { 'data-credits': 'probe', 'onClick': dismiss }) },
      attachTo: document.body,
    })
    outside.focus()
    await wrapper.find('[data-credits="probe"]').trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(outside)
    wrapper.unmount()
    outside.remove()
  })

  it('falls back to the app-config threshold', () => {
    creditBalance.value = 3
    // The mocked app config carries no threshold, so the package default (10)
    // applies — a balance of 3 is low, 42 is not.
    expect(mount(CreditsLowBanner).find('[data-credits="banner"]').exists()).toBe(true)
  })

  it('appears inside a live region that was there all along, so it is announced', async () => {
    const wrapper = mount(CreditsLowBanner, { props: { threshold: 10 } })
    const live = wrapper.find('[data-credits="live"]')
    expect(live.attributes('role')).toBe('status')
    expect(live.text()).toBe('')
    creditBalance.value = 3
    await flushPromises()
    // The same element, now holding the banner: a region inserted with its content may go unread.
    expect(wrapper.find('[data-credits="live"]').element).toBe(live.element)
    expect(live.find('[data-credits="banner"]').exists()).toBe(true)
  })

  it('says why a top-up failed, as an alert beside the banner', async () => {
    creditBalance.value = 3
    credits.topUp.mockRejectedValueOnce(new Error('boom'))
    const wrapper = mount(CreditsLowBanner, { props: { threshold: 10, pack: 'credits100' } })
    await wrapper.find('[data-credits="action"]').trigger('click')
    await flushPromises()
    const alert = wrapper.find('[data-credits="error"]')
    expect(alert.attributes('role')).toBe('alert')
    expect(wrapper.emitted('error')?.[0]).toEqual([alert.text()])
    expect(wrapper.find('[data-credits="live"] [data-credits="error"]').exists()).toBe(false)
  })

  it('is busy while a top-up starts, keeping focus on its button', async () => {
    creditBalance.value = 3
    let release!: () => void
    credits.topUp.mockImplementationOnce(() => new Promise<string>((resolve) => {
      release = () => resolve('')
    }))
    const wrapper = mount(CreditsLowBanner, { props: { threshold: 10, pack: 'credits100' }, attachTo: document.body })
    const banner = () => wrapper.find('[data-credits="banner"]')
    expect(banner().attributes('aria-busy')).toBeUndefined()
    // The one symbol-only control: its name is the action, not the glyph.
    expect(wrapper.find('[data-credits="dismiss"]').attributes('aria-label')).toBe('Dismiss')

    const action = wrapper.find('[data-credits="action"]')
    ;(action.element as HTMLElement).focus()
    await action.trigger('click')
    expect(banner().attributes('aria-busy')).toBe('true')
    expect(action.attributes('aria-disabled')).toBe('true')
    expect(document.activeElement).toBe(action.element)
    release()
    await flushPromises()
    expect(banner().attributes('aria-busy')).toBeUndefined()
    wrapper.unmount()
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

  it('offers every pack on sale when the app names none', async () => {
    const before = products.value
    products.value = {
      pro: { id: 'prod_pro', name: 'Pro', isRecurring: true },
      credits100: { id: 'prod_pack', name: '100 credits', isRecurring: false },
      credits500: { id: 'prod_500', name: '500 credits', isRecurring: false },
      old: { id: 'prod_old', name: 'Old pack', isRecurring: false, isArchived: true },
    } as typeof products.value
    backendConfig.billing.packs = []
    const wrapper = mount(WorkspaceSettings)
    expect(wrapper.findAll('[data-settings="topup-pack"]').map(button => button.text())).toEqual(['Buy 100 credits', 'Buy 500 credits'])
    await wrapper.findAll('[data-settings="topup-pack"]')[1]!.trigger('click')
    await flushPromises()
    expect(credits.topUp).toHaveBeenCalledWith('prod_500', { redirect: true })
    backendConfig.billing.packs = [{ key: 'credits100' }]
    products.value = before
  })

  it('offers a member who manages no billing neither cancel nor a credit pack', () => {
    canManage.value = false
    subscription.value = { id: 'sub1', status: 'active', productId: 'prod_pro', currentPeriodEnd: '2026-09-01', cancelAtPeriodEnd: false }
    const wrapper = mount(WorkspaceSettings)
    expect(wrapper.find('[data-settings="plan-name"]').text()).toBe('Pro')
    expect(wrapper.find('[data-settings="cancel"]').exists()).toBe(false)
    expect(wrapper.find('[data-settings="topup-pack"]').exists()).toBe(false)
  })

  it('never claims the free plan while the subscription could not be read', () => {
    subscription.value = undefined
    billingError.value = { code: 'unauthenticated', data: {}, message: 'Sign in to continue.' }
    const wrapper = mount(WorkspaceSettings)
    expect(wrapper.find('[data-settings="plan-name"]').text()).toBe('—')
    const error = wrapper.find('[data-settings="plan-error"]')
    expect(error.text()).toBe('Sign in to continue.')
    expect(error.attributes('role')).toBe('alert')
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

  it('moves focus to the workspace switched to once the session says it is active, after setActive resolved', async () => {
    // The auth client refetches the session after `setActive` resolves: the
    // active workspace changes a moment later, not when the call returns. The
    // test makes that moment come after its first look, not after a timer.
    const becomeActive = () => {
      activeWorkspace.value = { id: 'ws2', name: 'Acme', slug: 'acme' }
    }
    organization.setActive.mockImplementationOnce(async () => {})
    const wrapper = mount(WorkspaceSettings, { attachTo: document.body })
    const button = wrapper.find('[data-settings="switch"]')
    ;(button.element as HTMLElement).focus()
    await button.trigger('click')
    await flushPromises()
    // Resolved, not yet active: focus has not moved to a row that is not the target.
    expect(wrapper.find('[data-settings="workspace"][data-active]').attributes('data-workspace-id')).toBe('ws1')
    expect(document.activeElement).not.toBe(wrapper.find('[data-workspace-id="ws1"]').element)
    becomeActive()
    await vi.waitFor(() => expect(document.activeElement).toBe(wrapper.find('[data-workspace-id="ws2"]').element))
    expect(wrapper.find('[data-workspace-id="ws2"]').attributes('aria-current')).toBe('true')
    wrapper.unmount()
  })

  it('leaves focus alone when the switch failed', async () => {
    organization.setActive.mockRejectedValueOnce(new Error('Not a member'))
    const wrapper = mount(WorkspaceSettings, { attachTo: document.body })
    const button = wrapper.find('[data-settings="switch"]')
    ;(button.element as HTMLElement).focus()
    await button.trigger('click')
    await flushPromises()
    activeWorkspace.value = { id: 'ws2', name: 'Acme', slug: 'acme' }
    await flushPromises()
    expect(document.activeElement).not.toBe(wrapper.find('[data-workspace-id="ws2"]').element)
    wrapper.unmount()
  })

  it('names each row by its workspace, which describes its switch button, and keeps focus on a busy one', async () => {
    let release!: () => void
    organization.setActive.mockImplementationOnce(() => new Promise<void>((resolve) => {
      release = resolve
    }))
    const wrapper = mount(WorkspaceSettings, { attachTo: document.body })
    const row = wrapper.find('[data-workspace-id="ws2"]')
    const named = row.attributes('aria-labelledby')!
    expect(named.split(' ').map(id => wrapper.find(`#${id}`).text())).toEqual(['Acme', 'acme'])
    const button = () => row.find('[data-settings="switch"]')
    expect(button().attributes('aria-label')).toBeUndefined()
    expect(button().attributes('aria-describedby')).toBe(named)
    ;(button().element as HTMLElement).focus()
    await button().trigger('click')
    expect(button().text()).toBe('Switching…')
    expect(button().attributes('aria-disabled')).toBe('true')
    expect(document.activeElement).toBe(button().element)
    expect(wrapper.find('[data-settings="status"]').text()).toBe('Switching…')
    release()
    await flushPromises()
    wrapper.unmount()
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
    organization.create.mockImplementationOnce(() => new Promise<{ id: string, name: string, slug: string, createdAt: number }>((resolve) => {
      release = () => resolve({ id: 'ws3', name: 'New', slug: 'new', createdAt: 3 })
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
    // Shown here, read out once by the status region that is always there.
    expect(ok.attributes('role')).toBeUndefined()
    expect(wrapper.find('[data-settings="status"]').text()).toBe(ok.text())

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

describe('WorkspaceSettings billing section', () => {
  const plan = (fields: Partial<NonNullable<typeof subscription.value>> = {}) => {
    subscription.value = { id: 'sub1', status: 'active', productId: 'prod_pro', currentPeriodEnd: '2026-09-01T00:00:00.000Z', ...fields }
  }
  const state = (wrapper: ReturnType<typeof mount>) => wrapper.find('[data-settings="plan-status"]')

  it.each([
    ['active', {}, 'Active · renews', 'ok', 'cancel'],
    ['trialing', { status: 'trialing' }, 'On trial', 'ok', 'cancel'],
    ['past_due', { status: 'past_due' }, 'Payment failed', 'error', 'portal'],
    ['paused', { status: 'paused' }, 'Paused', 'warn', 'resume'],
    ['canceling', { cancelAtPeriodEnd: true, endsAt: '2026-09-01T00:00:00.000Z' }, 'Cancels at period end · ends', 'warn', 'uncancel'],
  ] as const)('reads the %s state in words, with the action it calls for', (key, fields, words, tone, action) => {
    plan(fields)
    const wrapper = mount(WorkspaceSettings)
    expect(state(wrapper).attributes()).toMatchObject({ 'data-state': key, 'data-tone': tone })
    expect(state(wrapper).text()).toContain(words)
    expect(wrapper.find(`[data-settings="${action}"]`).exists()).toBe(true)
  })

  it('asks for a new payment method on a failed payment, in the portal', async () => {
    plan({ status: 'past_due' })
    const wrapper = mount(WorkspaceSettings)
    expect(wrapper.find('[data-settings="plan-hint"]').text()).toContain('Update the payment method')
    const portal = wrapper.find('[data-settings="portal"]')
    expect(portal.text()).toBe('Update payment method')
    await portal.trigger('click')
    await flushPromises()
    expect(billing.portal).toHaveBeenCalledWith({ redirect: true })
  })

  it('resumes a paused plan, keeps one set to end, and cancels a scheduled change, each announcing how it went', async () => {
    plan({ status: 'paused' })
    const paused = mount(WorkspaceSettings)
    // A paused plan has nothing to cancel at the period's end.
    expect(paused.find('[data-settings="cancel"]').exists()).toBe(false)
    await paused.find('[data-settings="resume"]').trigger('click')
    await flushPromises()
    expect(billing.resume).toHaveBeenCalled()
    expect(paused.emitted('plan-resumed')).toHaveLength(1)
    expect(paused.find('[data-settings="status"]').text()).toBe('The plan runs again.')

    plan({ cancelAtPeriodEnd: true })
    const canceling = mount(WorkspaceSettings)
    await canceling.find('[data-settings="uncancel"]').trigger('click')
    await flushPromises()
    expect(billing.uncancel).toHaveBeenCalled()
    expect(canceling.emitted('plan-uncanceled')).toHaveLength(1)

    plan()
    pendingChange.value = { productId: 'prod_starter', appliesAt: new Date('2026-09-01T00:00:00.000Z') }
    const changing = mount(WorkspaceSettings)
    expect(state(changing).text()).toMatch(/Plan change scheduled · switches to Starter on/)
    await changing.find('[data-settings="cancel-change"]').trigger('click')
    await flushPromises()
    expect(billing.cancelPendingChange).toHaveBeenCalled()
    expect(changing.emitted('change-canceled')).toHaveLength(1)
    expect(changing.find('[data-settings="status"]').text()).toBe('The plan change is canceled.')
  })

  it('cancels in one step: what ends when and one button, with no offer, question or field in the way', async () => {
    plan()
    const wrapper = mount(WorkspaceSettings, { attachTo: document.body })
    const toggle = wrapper.find('[data-settings="cancel"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    await toggle.trigger('click')
    const confirm = wrapper.find('[data-settings="cancel-confirm"]')
    expect(toggle.attributes()).toMatchObject({ 'aria-expanded': 'true', 'aria-controls': confirm.attributes('id') })
    // Named by its heading; the one control in it is the button that cancels.
    expect(wrapper.find(`#${confirm.attributes('aria-labelledby')}`).text()).toBe('Cancel the plan')
    expect(confirm.findAll('button, input, select, textarea').map(control => control.attributes('data-settings'))).toEqual(['confirm-cancel'])
    expect(confirm.find('[data-settings="confirm-ends"]').text()).toMatch(/^The plan ends on .+\. Everything it includes stays until then\.$/)

    await confirm.find('[data-settings="confirm-cancel"]').trigger('click')
    await flushPromises()
    // No reason and no words: the confirmation asked for none.
    expect(billing.cancel).toHaveBeenCalledWith({ reason: undefined, comment: undefined })
    expect(wrapper.emitted('plan-canceled')).toHaveLength(1)
    expect(wrapper.find('[data-settings="cancel-confirm"]').exists()).toBe(false)
    // The button pressed went with the step: focus is on the plan's state.
    expect(document.activeElement).toBe(state(wrapper).element)
    expect(wrapper.find('[data-settings="status"]').text()).toBe('Subscription set to cancel at period end.')
    wrapper.unmount()
  })

  it('passes a reason and words a slot of the app gathered, with the cancellation itself', async () => {
    plan()
    const wrapper = mount(WorkspaceSettings, {
      props: { sections: ['billing'] },
      slots: { billing: ({ cancelPlan }: { cancelPlan: (options: { reason: 'too_expensive', comment: string }) => Promise<void> }) => h('button', { 'data-app': 'cancel', 'onClick': () => cancelPlan({ reason: 'too_expensive', comment: '  Over budget  ' }) }) },
    })
    await wrapper.find('[data-app="cancel"]').trigger('click')
    await flushPromises()
    expect(billing.cancel).toHaveBeenCalledWith({ reason: 'too_expensive', comment: 'Over budget' })
  })

  it('works from the keyboard: Escape closes the cancellation and gives focus back, a busy confirm keeps focus and starts nothing twice', async () => {
    plan()
    billing.cancel.mockImplementationOnce(() => new Promise(() => {}))
    const wrapper = mount(WorkspaceSettings, { attachTo: document.body })
    const toggle = wrapper.find<HTMLButtonElement>('[data-settings="cancel"]')
    toggle.element.focus()
    await toggle.trigger('click')
    const opened = wrapper.find<HTMLButtonElement>('[data-settings="confirm-cancel"]')
    opened.element.focus()
    await opened.trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(wrapper.find('[data-settings="cancel-confirm"]').exists()).toBe(false)
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(toggle.element)

    // The same button opens and closes it.
    await toggle.trigger('click')
    await toggle.trigger('click')
    expect(wrapper.find('[data-settings="cancel-confirm"]').exists()).toBe(false)

    await toggle.trigger('click')
    const confirm = wrapper.find<HTMLButtonElement>('[data-settings="confirm-cancel"]')
    confirm.element.focus()
    await confirm.trigger('click')
    expect(confirm.attributes('aria-disabled')).toBe('true')
    expect(confirm.text()).toBe('Canceling…')
    expect(document.activeElement).toBe(confirm.element)
    await confirm.trigger('click')
    expect(billing.cancel).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-settings="status"]').text()).toBe('Canceling…')
    // While it is on its way, neither Escape nor the opening button takes the outcome's place away.
    expect(toggle.attributes('aria-disabled')).toBe('true')
    await confirm.trigger('keydown', { key: 'Escape' })
    await toggle.trigger('click')
    expect(wrapper.find('[data-settings="cancel-confirm"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('runs one action at a time: a cancellation pressed while the portal opens starts nothing', async () => {
    plan()
    billing.portal.mockImplementationOnce(() => new Promise(() => {}))
    const wrapper = mount(WorkspaceSettings)
    await wrapper.find('[data-settings="portal"]').trigger('click')
    await wrapper.find('[data-settings="cancel"]').trigger('click')
    await wrapper.find('[data-settings="confirm-cancel"]').trigger('click')
    await flushPromises()
    expect(billing.cancel).not.toHaveBeenCalled()
    expect(wrapper.find('[data-settings="status"]').text()).toBe('Opening the portal…')
  })

  it('offers the way back on a failed payment set to end, and no second cancellation', () => {
    plan({ status: 'past_due', cancelAtPeriodEnd: true, endsAt: '2026-09-01T00:00:00.000Z' })
    const wrapper = mount(WorkspaceSettings)
    // It reads as the failed payment it is, and says when it ends.
    expect(state(wrapper).attributes('data-state')).toBe('past_due')
    expect(state(wrapper).text()).toMatch(/^Payment failed · ends /)
    const buttons = wrapper.findAll('[data-settings="plan-actions"] button').map(button => button.attributes('data-settings'))
    // The portal first, its own action, then Keep plan; nothing to cancel again.
    expect(buttons).toEqual(['portal', 'uncancel'])

    plan({ status: 'past_due' })
    pendingChange.value = { productId: 'prod_starter', appliesAt: new Date('2026-09-01T00:00:00.000Z') }
    const changing = mount(WorkspaceSettings)
    expect(changing.findAll('[data-settings="plan-actions"] button').map(button => button.attributes('data-settings'))).toEqual(['portal', 'cancel-change', 'cancel'])
  })

  it('lists what the plan includes in neutral words, and points a manager at the portal for keys and files', () => {
    plan()
    grantedBenefits.value = [
      { id: 'g1', benefitId: 'b1', type: 'license_keys', kind: 'license_key', name: 'Desktop license', licenseKey: '****-0A1B2C' },
      { id: 'g2', benefitId: 'b2', type: 'downloadables', kind: 'download', name: 'Templates', files: 3 },
      { id: 'g3', benefitId: 'b3', type: 'github_repository', kind: 'repository', repository: 'acme/app' },
      { id: 'g4', benefitId: 'b4', type: 'a_newer_type' },
    ]
    const wrapper = mount(WorkspaceSettings)
    const list = wrapper.find('[data-settings="benefit-list"]')
    expect(wrapper.find(`#${list.attributes('aria-labelledby')}`).text()).toBe('Included')
    expect(list.findAll('[data-settings="benefit"]').map(row => [row.attributes('data-kind'), row.text()])).toEqual([
      ['license_key', 'Desktop licenseLicense key****-0A1B2C'],
      ['download', 'TemplatesDownloads3 files'],
      // No name yet: what it gives names it.
      ['repository', 'Repository accessacme/app'],
      ['other', 'Benefit'],
    ])
    expect(wrapper.find('[data-settings="benefits-portal"]').exists()).toBe(true)
    canManage.value = false
    const member = mount(WorkspaceSettings)
    expect(member.find('[data-settings="benefit-list"]').exists()).toBe(true)
    expect(member.find('[data-settings="benefits-portal"]').exists()).toBe(false)
    expect(member.find('[data-settings="managed"]').text()).toBe('Your workspace\'s owner and admins manage its plan.')
  })

  it('says a return from checkout is being finished, busy until the new plan reads back', () => {
    finishingCheckout.value = true
    const wrapper = mount(WorkspaceSettings)
    expect(wrapper.find('[data-settings="section-billing"]').attributes('aria-busy')).toBe('true')
    expect(wrapper.find('[data-settings="finishing"]').text()).toBe('Finishing your purchase…')
    expect(wrapper.find('[data-settings="status"]').text()).toBe('Finishing your purchase…')
    const table = mount(PricingTable)
    expect(table.find('[data-pricing="table"]').attributes('aria-busy')).toBe('true')
    expect(table.find('[data-pricing="status"]').text()).toBe('Finishing your purchase…')
  })
})

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

  it('sends one code however often the email form is submitted while it sends', async () => {
    let release!: () => void
    auth.sendOtp.mockImplementationOnce(() => new Promise<void>((resolve) => {
      release = resolve
    }))
    const wrapper = mount(ProfileSettings, { attachTo: document.body })
    await wrapper.find('[data-profile="input-email"]').setValue('new@example.com')
    const submit = wrapper.find('[data-profile="section-email"] [data-profile="submit"]')
    ;(submit.element as HTMLElement).focus()
    await wrapper.find('[data-profile="section-email"]').trigger('submit')
    expect(submit.attributes('aria-disabled')).toBe('true')
    expect(submit.attributes('disabled')).toBeUndefined()
    expect(document.activeElement).toBe(submit.element)
    await wrapper.find('[data-profile="section-email"]').trigger('submit')
    expect(auth.sendOtp).toHaveBeenCalledTimes(1)
    release()
    await flushPromises()
    wrapper.unmount()
  })

  it('saves the name once however often it is submitted while it saves', async () => {
    let release!: () => void
    auth.updateUser.mockImplementationOnce(() => new Promise<void>((resolve) => {
      release = resolve
    }))
    const wrapper = mount(ProfileSettings)
    await wrapper.find('[data-profile="input-name"]').setValue('Ada L.')
    await wrapper.find('[data-profile="section-name"]').trigger('submit')
    await wrapper.find('[data-profile="section-name"]').trigger('submit')
    expect(auth.updateUser).toHaveBeenCalledTimes(1)
    release()
    await flushPromises()
  })

  it('gates the new email through validateEmail', async () => {
    const wrapper = mount(ProfileSettings, {
      props: { validateEmail: () => 'Test inboxes only.' },
    })
    await wrapper.find('[data-profile="input-email"]').setValue('stranger@example.com')
    await wrapper.find('[data-profile="section-email"]').trigger('submit')
    await flushPromises()
    expect(auth.sendOtp).not.toHaveBeenCalled()
    expect(wrapper.find('[data-profile="message"]').text()).toBe('Test inboxes only.')
  })

  it('changes the email with a code from the current address, then one from the new address', async () => {
    const wrapper = mount(ProfileSettings)
    const submit = async () => {
      await wrapper.find('[data-profile="section-email"]').trigger('submit')
      await flushPromises()
    }
    await wrapper.find('[data-profile="input-email"]').setValue('new@example.com')
    await submit()
    expect(auth.sendOtp).toHaveBeenCalledWith(user.value!.email, 'email-verification')
    expect(wrapper.find('[data-profile="section-email"]').attributes('data-step')).toBe('confirm-current')

    await wrapper.find('[data-profile="input-code"]').setValue('111111')
    await submit()
    expect(auth.client.emailOtp.requestEmailChange).toHaveBeenCalledWith({ newEmail: 'new@example.com', otp: '111111' })
    expect(wrapper.find('[data-profile="label-code"]').text()).toContain('new@example.com')

    await wrapper.find('[data-profile="input-code"]').setValue('222222')
    await submit()
    expect(auth.client.emailOtp.changeEmail).toHaveBeenCalledWith({ newEmail: 'new@example.com', otp: '222222' })
    expect(wrapper.emitted('email-changed')).toEqual([['new@example.com']])
    expect(wrapper.find('[data-profile="message"]').text()).toBe('Your email address is now new@example.com.')
    // Ready for another change.
    expect(wrapper.find('[data-profile="input-email"]').exists()).toBe(true)
  })

  it('backs out of a code step with cancel', async () => {
    const wrapper = mount(ProfileSettings)
    await wrapper.find('[data-profile="input-email"]').setValue('new@example.com')
    await wrapper.find('[data-profile="section-email"]').trigger('submit')
    await flushPromises()
    await wrapper.find('[data-profile="cancel"]').trigger('click')
    expect(wrapper.find('[data-profile="input-email"]').exists()).toBe(true)
    expect(auth.client.emailOtp.requestEmailChange).not.toHaveBeenCalled()
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
    auth.updateUser.mockImplementationOnce(() => new Promise<void>((resolve) => {
      release = () => resolve()
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

describe('ProfileSettings accessibility', () => {
  it('marks a refused address invalid, described by its hint and the refusal', async () => {
    const wrapper = mount(ProfileSettings)
    const input = () => wrapper.find('[data-profile="input-email"]')
    const hintId = wrapper.find('[data-profile="hint"]').attributes('id')
    expect(input().attributes('aria-describedby')).toBe(hintId)
    await input().setValue('ada@example.com')
    await wrapper.find('[data-profile="section-email"]').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-profile="message"]').text()).toBe('That is already your email address.')
    expect(input().attributes('aria-invalid')).toBe('true')
    expect(input().attributes('aria-describedby')).toBe(`${hintId} ${wrapper.find('[data-profile="message"]').attributes('id')}`)
  })

  it('refuses an address the app\'s check turns down with the field\'s label', async () => {
    const wrapper = mount(ProfileSettings, { props: { validateEmail: () => false } })
    await wrapper.find('[data-profile="input-email"]').setValue('not-an-address')
    await wrapper.find('[data-profile="section-email"]').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-profile="message"]').text()).toBe('Enter a valid email address.')
  })

  it('checks the new address\'s shape without a validateEmail of the app\'s, before any code goes out', async () => {
    let change!: UseEmailChangeReturn
    mount(ProfileSettings, { slots: { email: (context: { emailChange: UseEmailChangeReturn }) => {
      change = context.emailChange
      return h('i')
    } } })
    change.newEmail.value = 'foo'
    expect(change.emailValid.value).toBe(false)
    await change.start()
    expect(auth.sendOtp).not.toHaveBeenCalled()
    expect(change.error.value).toMatchObject({ code: 'invalid_input', data: { field: 'email' } })
    change.newEmail.value = 'new@example.com'
    expect(change.emailValid.value).toBe(true)
  })

  // A refused address or code leaves the step where it was: the button the
  // person pressed keeps focus, and nothing is sent twice.
  it('keeps focus on a busy button, ignores another submit, and keeps focus once the step fails', async () => {
    let refuse!: () => void
    auth.sendOtp.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => {
      refuse = () => reject(new ConvexError({ code: 'rate_limited', retryAfter: 5000 }))
    }))
    const wrapper = mount(ProfileSettings, { attachTo: document.body })
    try {
      await wrapper.find('[data-profile="input-email"]').setValue('new@example.com')
      const form = wrapper.find('[data-profile="section-email"]')
      const submit = form.find('[data-profile="submit"]')
      ;(submit.element as HTMLElement).focus()
      await form.trigger('submit')
      expect(submit.attributes('aria-disabled')).toBe('true')
      expect(submit.attributes('disabled')).toBeUndefined()
      expect(document.activeElement).toBe(submit.element)
      await form.trigger('submit')
      expect(auth.sendOtp).toHaveBeenCalledOnce()

      refuse()
      await flushPromises()
      expect(wrapper.find('[data-profile="message"]').attributes('role')).toBe('alert')
      expect(submit.attributes('aria-disabled')).toBeUndefined()
      expect(document.activeElement).toBe(submit.element)
    }
    finally {
      wrapper.unmount()
    }
  })

  it('moves focus to the code once the person asked for it', async () => {
    const wrapper = mount(ProfileSettings, { attachTo: document.body })
    try {
      await wrapper.find('[data-profile="input-email"]').setValue('new@example.com')
      await wrapper.find('[data-profile="section-email"]').trigger('submit')
      await flushPromises()
      await vi.waitFor(() => expect(document.activeElement).toBe(wrapper.find('[data-profile="input-code"]').element))
    }
    finally {
      wrapper.unmount()
    }
  })

  it('names the step it is waiting on', async () => {
    let release!: () => void
    auth.updateUser.mockImplementationOnce(() => new Promise<void>((resolve) => {
      release = () => resolve()
    }))
    const wrapper = mount(ProfileSettings)
    await wrapper.find('[data-profile="section-name"]').trigger('submit')
    expect(wrapper.find('[data-profile="save"]').text()).toBe('Saving…')
    release()
    await flushPromises()
    expect(wrapper.find('[data-profile="save"]').text()).toBe('Save name')
  })
})

describe('SecuritySettings accessibility', () => {
  it('names each row button after the passkey or the session it acts on', () => {
    const wrapper = mount(SecuritySettings)
    const passkey = wrapper.find('[data-security="passkey"]')
    expect(passkey.find('[data-security="rename"]').attributes('aria-label')).toBe('Rename passkey Laptop')
    expect(passkey.find('[data-security="remove"]').attributes('aria-label')).toBe('Remove passkey Laptop')
    const revoke = wrapper.find('[data-security="revoke"]')
    expect(revoke.text()).toBe('Revoke')
    // The accessible name starts with the visible word, so speech input finds the button by it.
    expect(revoke.attributes('aria-label')).toMatch(/^Revoke Firefox · Windows, signed in /)
    // A system without a browser it knows, in words; the passkey's kind too.
    expect(wrapper.findAll('[data-security="session-name"]').map(name => name.text())).toEqual(['Chrome · macOS', 'Firefox · Windows'])
  })

  it('takes its copy from the labels prop', () => {
    const wrapper = mount(SecuritySettings, { props: { labels: { passkeys: 'Your passkeys', removeNamed: 'Delete {name}' } } })
    expect(wrapper.find('[data-security="section-passkeys"] h3').text()).toBe('Your passkeys')
    expect(wrapper.find('[data-security="remove"]').attributes('aria-label')).toBe('Delete Laptop')
  })
})

describe('values the server names, in words', () => {
  it('words a device, a passkey\'s kind, an order\'s status and a role, and shows one it has no words for as it came', async () => {
    const before = { passkeys: passkeys.passkeys.value, sessions: sessions.sessions.value }
    passkeys.passkeys.value = [{ id: 'pk1', name: 'Laptop', createdAt: '2026-01-01', deviceType: 'multiDevice' } as never, { id: 'pk2', name: 'Key', createdAt: '2026-01-02', deviceType: 'roaming' } as never]
    sessions.sessions.value = [...before.sessions, { id: 's-mac', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)', createdAt: Date.parse('2026-01-03'), current: false }]
    try {
      const security = mount(SecuritySettings)
      const meta = security.findAll('[data-security="passkey-meta"]').map(entry => entry.text())
      expect(meta[0]).toMatch(/^Synced · /)
      expect(meta[1]).toMatch(/^roaming · /)
      expect(security.findAll('[data-security="session-name"]').at(-1)!.text()).toBe('Browser · macOS')
    }
    finally {
      passkeys.passkeys.value = before.passkeys
      sessions.sessions.value = before.sessions
    }

    const orders = orderList.value
    orderList.value = [{ id: 'o1', createdAt: '2026-08-01', status: 'partially_refunded', totalAmount: 900, currency: 'EUR', isInvoiceGenerated: false }, { id: 'o2', createdAt: '2026-08-02', status: 'void', totalAmount: 0, currency: 'EUR', isInvoiceGenerated: false }]
    expect(mount(BillingHistory).findAll('[data-history="order-status"]').map(entry => entry.text())).toEqual(['Partly refunded', 'void'])
    orderList.value = orders

    const profile = mount(ProfileSettings)
    await flushPromises()
    expect(profile.findAll('[data-profile="badge"]')[1]!.text()).toBe('Role: User')
  })
})

// ── SecuritySettings ─────────────────────────────────────────────────────────

describe('SecuritySettings', () => {
  it('lists the latest new-device sign-ins in its Alerts section, each signing its session out while it lasts', async () => {
    signInAlerts.value = [
      { at: Date.parse('2026-01-03'), browser: 'Firefox', os: 'Windows', recovery: false, sessionId: 's-other' },
      { at: Date.parse('2026-01-02'), recovery: true, sessionId: 's-gone' },
      { at: Date.parse('2026-01-01'), browser: 'Chrome', os: 'macOS', recovery: false, sessionId: 's-current' },
    ]
    sessions.revoke.mockClear()
    const wrapper = mount(SecuritySettings, { attachTo: document.body })
    await flushPromises()
    const alerts = wrapper.findAll('[data-security="alert"]')
    expect(alerts.map(alert => alert.attributes('data-state'))).toEqual(['new-device', 'recovery', 'new-device'])
    expect(alerts[0]!.find('[data-security="alert-text"]').text()).toMatch(/^New sign-in from Firefox · Windows, /)
    expect(alerts[1]!.find('[data-security="alert-text"]').text()).toMatch(/^Recovery code used on Unknown device, /)
    // A session since signed out has no button; this browser's own is marked.
    expect(alerts.map(alert => alert.find('[data-security="alert-revoke"]').exists())).toEqual([true, false, false])
    expect(alerts[2]!.find('[data-security="current-badge"]').exists()).toBe(true)
    await alerts[0]!.find('[data-security="alert-revoke"]').trigger('click')
    await flushPromises()
    expect(sessions.revoke).toHaveBeenCalledWith('s-other')
    signInAlerts.value = []
    await flushPromises()
    expect(wrapper.find('[data-security="alerts-empty"]').text()).toBe('No new device has signed in to your account.')
    wrapper.unmount()
  })

  it('turns passkey-only on and shows the recovery code once, then lets codes back in', async () => {
    const wrapper = mount(SecuritySettings, { attachTo: document.body })
    await flushPromises()
    expect(wrapper.find('[data-security="passkey-only"]').attributes('data-state')).toBe('off')
    await wrapper.find('[data-security="passkey-only-on"]').trigger('click')
    await flushPromises()
    expect(passkeys.setPasskeyOnly).toHaveBeenCalledWith(true)
    expect(wrapper.find('[data-security="recovery-code"]').text()).toContain('7K2QM-ABCDE-FGHJK-MNPQR')

    passkeys.passkeyOnly.value = true
    await flushPromises()
    expect(wrapper.find('[data-security="passkey-only"]').attributes('data-state')).toBe('on')
    await wrapper.find('[data-security="passkey-only-off"]').trigger('click')
    await flushPromises()
    expect(passkeys.setPasskeyOnly).toHaveBeenLastCalledWith(false)
    expect(wrapper.find('[data-security="recovery-code"]').exists()).toBe(false)
    passkeys.passkeyOnly.value = false
    wrapper.unmount()
  })

  it('runs each action once however often it is pressed, even after another started', async () => {
    const releases: Array<() => void> = []
    const held = () => new Promise<void>((resolve) => {
      releases.push(resolve)
    })
    passkeys.remove.mockImplementationOnce(held)
    auth.signOut.mockImplementationOnce(held)
    const confirm = vi.fn(async () => true)
    const wrapper = mount(SecuritySettings, { props: { confirm }, attachTo: document.body })
    await flushPromises()
    const remove = wrapper.find('[data-security="remove"]')
    const out = wrapper.find('[data-security="sign-out"]')
    await remove.trigger('click')
    await flushPromises()
    expect(remove.attributes('aria-disabled')).toBe('true')
    // Another action starts while the first runs: the first still refuses a second press.
    await out.trigger('click')
    await flushPromises()
    await remove.trigger('click')
    await out.trigger('click')
    await flushPromises()
    expect(passkeys.remove).toHaveBeenCalledTimes(1)
    expect(auth.signOut).toHaveBeenCalledTimes(1)
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(remove.attributes('aria-disabled')).toBe('true')
    expect(out.attributes('aria-disabled')).toBe('true')
    for (const release of releases) release()
    await flushPromises()
    expect(remove.attributes('aria-disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('asks once, however often a destructive button is pressed while the question is open', async () => {
    let answer!: (yes: boolean) => void
    const confirm = vi.fn(() => new Promise<boolean>((resolve) => {
      answer = resolve
    }))
    const wrapper = mount(SecuritySettings, { props: { confirm } })
    await flushPromises()
    await wrapper.find('[data-security="remove"]').trigger('click')
    await wrapper.find('[data-security="remove"]').trigger('click')
    expect(confirm).toHaveBeenCalledTimes(1)
    answer(true)
    await flushPromises()
    expect(passkeys.remove).toHaveBeenCalledTimes(1)
  })

  it('moves focus to the outcome once the other sessions are signed out, leaving the button with nothing to do', async () => {
    const rows = sessions.sessions.value
    sessions.revokeOthers.mockImplementationOnce(async () => {
      sessions.sessions.value = rows.filter(row => row.current)
    })
    try {
      const wrapper = mount(SecuritySettings, { attachTo: document.body })
      await flushPromises()
      const others = wrapper.find('[data-security="revoke-others"]')
      ;(others.element as HTMLElement).focus()
      await others.trigger('click')
      await flushPromises()
      expect(others.attributes('disabled')).toBeDefined()
      const outcome = wrapper.find('[data-security="message"]')
      expect(outcome.attributes('role')).toBe('status')
      expect(outcome.attributes('tabindex')).toBe('-1')
      expect(document.activeElement).toBe(outcome.element)
      wrapper.unmount()
    }
    finally {
      sessions.sessions.value = rows
    }
  })

  it('moves focus on to the next button of its section once a revoked session\'s row goes', async () => {
    const rows = sessions.sessions.value
    const extra = { id: 's-third', userAgent: 'Safari iPhone OS', createdAt: Date.parse('2026-01-03'), current: false }
    sessions.sessions.value = [...rows, extra]
    sessions.revoke.mockImplementationOnce(async () => {
      sessions.sessions.value = [rows[0]!, extra]
    })
    try {
      const wrapper = mount(SecuritySettings, { attachTo: document.body })
      await flushPromises()
      const revoke = wrapper.find('[data-security="revoke"]')
      ;(revoke.element as HTMLElement).focus()
      await revoke.trigger('click')
      await flushPromises()
      expect(revoke.element.isConnected).toBe(false)
      const next = wrapper.find('[data-security="revoke"]')
      expect(next.attributes('aria-label')).toContain('Safari')
      expect(document.activeElement).toBe(next.element)
      wrapper.unmount()
    }
    finally {
      sessions.sessions.value = rows
    }
  })

  it('hands its slots isPending and the running action\'s key', async () => {
    let release!: () => void
    auth.signOut.mockImplementationOnce(() => new Promise<void>((resolve) => {
      release = resolve
    }))
    const seen: Array<Record<string, unknown>> = []
    const wrapper = mount(SecuritySettings, {
      slots: {
        footer: (slotContext: object) => {
          const context = slotContext as Record<string, unknown>
          seen.push({ isPending: context.isPending, pendingAction: context.pendingAction, pending: context.pending })
          return h('button', { id: 'out', onClick: context.signOut as () => void })
        },
      },
    })
    expect(seen.at(-1)).toEqual({ isPending: false, pendingAction: null, pending: undefined })
    await wrapper.find('#out').trigger('click')
    expect(seen.at(-1)).toEqual({ isPending: true, pendingAction: 'sign-out', pending: undefined })
    release()
    await flushPromises()
    expect(seen.at(-1)).toMatchObject({ isPending: false, pendingAction: null })
  })

  // A sign-out made here is the page's to follow, and never with a way back
  // into this account's private page for whoever signs in next.
  it('the security page goes to sign-in, with no ?redirect=, after a sign-out made on it', async () => {
    navigateTo.mockClear()
    const page = mount(SecurityPage)
    await page.find('[data-security="sign-out"]').trigger('click')
    await flushPromises()
    expect(navigateTo).toHaveBeenCalledWith('/login')
  })

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

  it('names each session\'s device, and words one it cannot describe', async () => {
    sessions.sessions.value = [...sessions.sessions.value, { id: 's-agent', userAgent: null as unknown as string, createdAt: Date.parse('2026-01-03'), current: false }]
    try {
      const wrapper = mount(SecuritySettings)
      await flushPromises()
      expect(wrapper.findAll('[data-security="session-name"]').map(name => name.text())).toEqual(['Chrome · macOS', 'Firefox · Windows', 'Unknown device'])
    }
    finally {
      sessions.sessions.value = sessions.sessions.value.slice(0, 2)
    }
  })

  it('says why the session list did not load, and that it is loading', async () => {
    const rows = sessions.sessions.value
    try {
      sessions.sessions.value = undefined as never
      sessions.isLoading.value = true
      const wrapper = mount(SecuritySettings)
      await flushPromises()
      expect(wrapper.find('[data-security="sessions-loading"]').exists()).toBe(true)
      expect(wrapper.find('[data-security="section-sessions"]').attributes('aria-busy')).toBe('true')

      sessions.isLoading.value = false
      sessions.listError.value = { code: 'unauthenticated', data: {}, message: 'Sign in to continue.' }
      sessions.error.value = sessions.listError.value
      await flushPromises()
      expect(wrapper.find('[data-security="sessions-loading"]').exists()).toBe(false)
      const failed = wrapper.find('[data-security="sessions-error"]')
      expect(failed.text()).toBe('Sign in to continue.')
      expect(failed.attributes('role')).toBe('alert')
    }
    finally {
      sessions.sessions.value = rows
      sessions.isLoading.value = false
      sessions.error.value = null
      sessions.listError.value = null
    }
  })

  // A revoke refused earlier still heads `error` when the live read fails
  // later: the list says why it did not load, not why the revoke was refused.
  it('says why the list did not load with the read\'s own failure, never an earlier action\'s', async () => {
    const rows = sessions.sessions.value
    try {
      sessions.sessions.value = undefined as never
      sessions.error.value = { code: 'rate_limited', data: {}, message: 'Too many requests. Try again in a moment.' }
      sessions.listError.value = { code: 'unavailable', data: { service: 'backend', reason: 'unexpected' }, message: 'Something went wrong.' }
      const wrapper = mount(SecuritySettings)
      await flushPromises()
      expect(wrapper.find('[data-security="sessions-error"]').text()).toBe('Something went wrong.')
    }
    finally {
      sessions.sessions.value = rows
      sessions.error.value = null
      sessions.listError.value = null
    }
  })

  it('words a failed revoke as useSessions does: the refusal, or "Something went wrong."', async () => {
    const wrapper = mount(SecuritySettings)
    await flushPromises()
    sessions.revoke.mockRejectedValueOnce(new Error('[CONVEX M(auth:revokeSession)] Server Error'))
    await wrapper.find('[data-security="revoke"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-security="message"]').text()).toBe('Something went wrong.')
    expect(wrapper.emitted('error')?.at(-1)).toEqual(['Something went wrong.'])
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
    await flushPromises()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(passkeys.remove).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    await wrapper.find('[data-security="remove"]').trigger('click')
    await flushPromises()
    expect(passkeys.remove).toHaveBeenCalledWith('pk1')
    expect(wrapper.emitted('passkey-removed')).toBeTruthy()
    // Deleting the account is <AccountData>'s, not this component's.
    expect(wrapper.find('[data-security="delete-account"]').exists()).toBe(false)
  })

  it('asks in its own dialog without a confirm prop: Cancel removes nothing, Confirm removes, focus comes back', async () => {
    const dialog = () => document.querySelector<HTMLDialogElement>('dialog[data-confirm="dialog"]')
    const wrapper = mount(SecuritySettings, { attachTo: document.body })
    await flushPromises()
    const remove = wrapper.find<HTMLButtonElement>('[data-security="remove"]')
    remove.element.focus()
    await remove.trigger('click')
    await flushPromises()
    expect(dialog()!.open).toBe(true)
    expect(dialog()!.querySelector('[data-confirm="text"]')!.textContent!.trim()).toBe('Remove passkey “Laptop”?')
    expect(document.activeElement).toBe(dialog()!.querySelector('[data-confirm="cancel"]'))
    dialog()!.querySelector<HTMLButtonElement>('[data-confirm="cancel"]')!.click()
    await flushPromises()
    expect(dialog()).toBeNull()
    expect(passkeys.remove).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(remove.element)

    await remove.trigger('click')
    await flushPromises()
    dialog()!.querySelector<HTMLButtonElement>('[data-confirm="accept"]')!.click()
    await flushPromises()
    expect(passkeys.remove).toHaveBeenCalledWith('pk1')
    wrapper.unmount()
  })

  it('revokes the other session, and has nothing left to verify', async () => {
    const wrapper = mount(SecuritySettings)
    await flushPromises()
    await wrapper.find('[data-security="revoke"]').trigger('click')
    await flushPromises()
    expect(sessions.revoke).toHaveBeenCalledWith('s-other')
    expect(wrapper.emitted('session-revoked')?.[0]).toEqual(['s-other'])
    // The code that signs a person in verifies their address.
    expect(wrapper.find('[data-security="section-verification"]').exists()).toBe(false)
  })

  it('names the inline rename field', async () => {
    const wrapper = mount(SecuritySettings)
    await flushPromises()
    await wrapper.find('[data-security="rename"]').trigger('click')
    // The field replaces the name it edits — no room for a visible label in the row.
    expect(wrapper.find('[data-security="input-passkey-name"]').attributes('aria-label')).toBe('Passkey name')
  })

  it('is busy while an action runs, then announces the outcome by tone', async () => {
    let release!: () => void
    passkeys.add.mockImplementationOnce(() => new Promise<{ id: string, createdAt: string }>((resolve) => {
      release = () => resolve({ id: 'pk2', createdAt: '2026-02-01' })
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

    // What an auth call rejects with: the envelope's error as the cause.
    passkeys.add.mockRejectedValueOnce(new Error('Ceremony cancelled', { cause: { message: 'Ceremony cancelled', status: 400, statusText: 'Bad Request' } }))
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
  const invitation = { id: 'inv1', workspaceName: 'Acme', inviterEmail: 'grace@example.com', role: 'member' }

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
    // Busy, not disabled: the button keeps focus, and a second press (either answer) does nothing.
    expect(wrapper.find('[data-invitation="accept"]').attributes('aria-disabled')).toBe('true')
    expect(wrapper.find('[data-invitation="accept"]').attributes('disabled')).toBeUndefined()
    await wrapper.find('[data-invitation="accept"]').trigger('click')
    await wrapper.find('[data-invitation="decline"]').trigger('click')
    expect(organization.acceptInvitation).toHaveBeenCalledTimes(1)
    expect(organization.declineInvitation).not.toHaveBeenCalled()
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

    organization.getInvitation.mockRejectedValueOnce(new Error('Network down', { cause: { message: 'Network down', status: 503, statusText: 'Service Unavailable' } }))
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
  it('keeps an empty live region, then shows one group per gift inside it', async () => {
    const wrapper = mount(GiftClaimBanner)
    const live = wrapper.find('[data-gift="live"]')
    expect(live.attributes('role')).toBe('status')
    expect(live.find('[data-gift="banner"]').exists()).toBe(false)

    giftList.value = [{ id: 'g1', status: 'paid', purchaserName: 'Grace', message: 'Enjoy!', createdAt: Date.parse('2026-08-01') }]
    await flushPromises()
    // The same region, now holding the banner: a region inserted with its content may go unread.
    expect(wrapper.find('[data-gift="live"]').element).toBe(live.element)
    expect(wrapper.find('[data-gift="banner"]').attributes('aria-busy')).toBeUndefined()
    expect(wrapper.find('[data-gift="message"]').text()).toContain('Grace sent you a gift: “Enjoy!”')
    // The gift emoji is decoration, hidden from the accessible name.
    expect(wrapper.find('[data-gift="message"] [aria-hidden="true"]').exists()).toBe(true)
  })

  it('tells two gifts from one sender apart by their date, which describes each button', () => {
    giftList.value = [
      { id: 'g1', status: 'paid', purchaserName: 'Grace', createdAt: Date.parse('2026-08-01T12:00:00Z') },
      { id: 'g2', status: 'paid', purchaserName: 'Grace', createdAt: Date.parse('2026-09-01T12:00:00Z') },
    ]
    const wrapper = mount(GiftClaimBanner)
    const labelOf = (ids: string) => ids.split(' ').map(id => wrapper.find(`#${id}`).text()).join(' ')
    const items = wrapper.findAll('[data-gift="item"]')
    expect(items.map(item => item.attributes('role'))).toEqual(['group', 'group'])
    const names = items.map(item => labelOf(item.attributes('aria-labelledby')!))
    expect(new Set(names).size).toBe(2)
    for (const item of items) {
      const button = item.find('[data-gift="claim"]')
      expect(button.text()).toBe('Receive gift')
      expect(button.attributes('aria-describedby')).toBe(item.attributes('aria-labelledby'))
    }
  })

  it('is busy while a claim is in flight, keeps focus, then announces the claim', async () => {
    giftList.value = [{ id: 'g1', status: 'paid', purchaserName: 'Grace', createdAt: 1 }]
    let release!: (value: boolean) => void
    gifts.claim.mockImplementationOnce(() => new Promise<boolean>((resolve) => {
      release = resolve
    }))
    const wrapper = mount(GiftClaimBanner, { attachTo: document.body })
    const button = wrapper.find('[data-gift="claim"]')
    ;(button.element as HTMLElement).focus()
    await button.trigger('click')
    expect(wrapper.find('[data-gift="banner"]').attributes('aria-busy')).toBe('true')
    expect(button.attributes('aria-disabled')).toBe('true')
    expect(button.text()).toBe('Receiving…')
    expect(document.activeElement).toBe(button.element)
    await button.trigger('click')
    expect(gifts.claim).toHaveBeenCalledTimes(1)
    release(true)
    await flushPromises()
    expect(gifts.claim).toHaveBeenCalledWith('g1')
    expect(wrapper.emitted('claimed')).toEqual([[1]])
    expect(wrapper.find('[data-gift="live"] [data-gift="claimed"]').text()).toContain('Gift received')
    wrapper.unmount()
  })

  it('moves focus to the gift that takes the claimed one\'s place, or the one before it after the last', async () => {
    giftList.value = [
      { id: 'g1', status: 'paid', purchaserName: 'Grace', createdAt: 1 },
      { id: 'g2', status: 'paid', purchaserName: 'Ada', createdAt: 2 },
      { id: 'g3', status: 'paid', purchaserName: 'Alan', createdAt: 3 },
    ]
    const wrapper = mount(GiftClaimBanner, { attachTo: document.body })
    const claimAt = async (index: number) => {
      const button = wrapper.findAll('[data-gift="claim"]')[index]!
      ;(button.element as HTMLElement).focus()
      await button.trigger('click')
      await flushPromises()
      giftList.value = giftList.value.filter((_, at) => at !== index)
      await flushPromises()
    }
    const focused = () => (document.activeElement as HTMLElement).getAttribute('aria-describedby') ?? ''
    // The middle one: the one after it moves up into its place.
    await claimAt(1)
    expect(focused()).toContain('g3')
    // The last one: the one before it.
    await claimAt(1)
    expect(focused()).toContain('g1')
    wrapper.unmount()
  })

  it('moves focus on when another gift arrives in the same update the claimed one leaves', async () => {
    giftList.value = [
      { id: 'g1', status: 'paid', purchaserName: 'Grace', createdAt: 1 },
      { id: 'g2', status: 'paid', purchaserName: 'Ada', createdAt: 2 },
    ]
    const wrapper = mount(GiftClaimBanner, { attachTo: document.body })
    const button = wrapper.find('[data-gift="claim"]')
    ;(button.element as HTMLElement).focus()
    await button.trigger('click')
    await flushPromises()
    // One gift leaves and one arrives: the count stays at two.
    giftList.value = [giftList.value[1]!, { id: 'g3', status: 'paid', purchaserName: 'Alan', createdAt: 3 }]
    await flushPromises()
    expect((document.activeElement as HTMLElement).getAttribute('aria-describedby')).toContain('g2')
    wrapper.unmount()
  })

  it('moves focus to the next gift once a claimed one leaves the list', async () => {
    giftList.value = [
      { id: 'g1', status: 'paid', purchaserName: 'Grace', createdAt: 1 },
      { id: 'g2', status: 'paid', purchaserName: 'Ada', createdAt: 2 },
    ]
    const wrapper = mount(GiftClaimBanner, { attachTo: document.body })
    const first = wrapper.find('[data-gift="claim"]')
    ;(first.element as HTMLElement).focus()
    await first.trigger('click')
    await flushPromises()
    // The read catches up after the claim returned: the claimed gift leaves the list.
    giftList.value = giftList.value.slice(1)
    await flushPromises()
    const next = wrapper.find('[data-gift="claim"]')
    expect(next.attributes('aria-describedby')).toContain('g2')
    expect(document.activeElement).toBe(next.element)
    wrapper.unmount()
  })

  it('moves focus to the note that the gift arrived once the last one is claimed', async () => {
    giftList.value = [{ id: 'g1', status: 'paid', purchaserName: 'Grace', createdAt: 1 }]
    // The read caught up before the claim returned: the gift is gone already.
    gifts.claim.mockImplementationOnce(async () => {
      giftList.value = []
      await nextTick()
      return true
    })
    const wrapper = mount(GiftClaimBanner, { attachTo: document.body })
    const button = wrapper.find('[data-gift="claim"]')
    ;(button.element as HTMLElement).focus()
    await button.trigger('click')
    await flushPromises()
    const claimed = wrapper.find('[data-gift="claimed"]')
    expect(claimed.text()).toContain('Gift received')
    expect(claimed.attributes('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(claimed.element)
    wrapper.unmount()
  })

  it('keeps the place of someone who moved on while the claim ran', async () => {
    giftList.value = [{ id: 'g1', status: 'paid', purchaserName: 'Grace', createdAt: 1 }]
    const outside = document.body.appendChild(document.createElement('button'))
    let release!: (value: boolean) => void
    gifts.claim.mockImplementationOnce(() => new Promise<boolean>((resolve) => {
      release = resolve
    }))
    const wrapper = mount(GiftClaimBanner, { attachTo: document.body })
    const button = wrapper.find('[data-gift="claim"]')
    ;(button.element as HTMLElement).focus()
    await button.trigger('click')
    outside.focus()
    release(true)
    giftList.value = []
    await flushPromises()
    expect(document.activeElement).toBe(outside)
    wrapper.unmount()
    outside.remove()
  })

  it('says why a claim failed, as an alert', async () => {
    giftList.value = [{ id: 'g1', status: 'paid', purchaserName: 'Grace', createdAt: 1 }]
    gifts.claim.mockRejectedValueOnce(new Error('boom'))
    const wrapper = mount(GiftClaimBanner)
    await wrapper.find('[data-gift="claim"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-gift="error"]').attributes('role')).toBe('alert')
    expect(wrapper.emitted('error')).toHaveLength(1)
  })

  it('says nothing was claimed yet when the claim opened the provider\'s checkout', async () => {
    giftList.value = [{ id: 'g1', status: 'paid', purchaserName: 'Grace', createdAt: 1 }]
    gifts.claim.mockResolvedValueOnce(false)
    const wrapper = mount(GiftClaimBanner)
    await wrapper.find('[data-gift="claim"]').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('claimed')).toBeUndefined()
    expect(wrapper.find('[data-gift="claimed"]').exists()).toBe(false)
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

  /** The document title the page's frame last set (a computed, so it follows the label). */
  const documentTitle = () => toValue((useHead.mock.calls.at(-1)?.[0] as { title?: MaybeRefOrGetter<string> } | undefined)?.title)

  it.each(pages)('/$name renders an h1 and sets the document title', ({ Page, fallback, selector }) => {
    const wrapper = mount(Page)
    const heading = wrapper.find(selector)
    expect(heading.element.tagName).toBe('H1')
    expect(heading.text()).toBe(fallback)
    expect(documentTitle()).toBe(fallback)
  })

  it.each(pages)('/$name takes its heading from appConfig.backend.labels', ({ Page, family, selector }) => {
    // The second rung of the customization ladder, on the page most apps rename.
    ;(backendConfig.labels as Record<string, { title: string }>)[family] = { title: 'Renamed' }
    const wrapper = mount(Page)
    expect(wrapper.find(selector).text()).toBe('Renamed')
    expect(documentTitle()).toBe('Renamed')
  })

  it('/settings shows the history under the plan: charges to whoever manages the billing, usage to every member', () => {
    const manager = mount(SettingsPage)
    expect(manager.find('[data-history="root"]').exists()).toBe(true)
    expect(manager.find('[data-usage="root"]').exists()).toBe(true)
    canManage.value = false
    const member = mount(SettingsPage)
    expect(member.find('[data-history="root"]').exists()).toBe(false)
    expect(member.find('[data-usage="root"]').exists()).toBe(true)
  })

  it('an embedded <PricingTable> keeps its h2 under the page heading', () => {
    // Only the shipped page promotes the title to h1.
    const wrapper = mount(PricingTable, { props: { title: 'Plans' } })
    expect(wrapper.find('[data-pricing="header"]').element.tagName).toBe('H2')
  })
})
