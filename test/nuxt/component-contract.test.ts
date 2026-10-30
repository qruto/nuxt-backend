import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, h, nextTick, reactive, ref, watch, type Component } from 'vue'
import { config as testUtils, flushPromises, mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import type { PricedPack, PricedPlan, PricedPromotion } from '../../src/convex/integrations/billing/types/records'
import { COMPONENT_CONTRACT, type ContractState, type ContractedComponent } from './component-contract'
import { backendError } from '../../src/convex/errors'

// The component contract (component-contract.ts), held against every
// component of the package's own: each is rendered in every state its row
// lists, with the composables behind it standing in, and its markup checked
// the same way:
// - the declaration: typed slots, a typed `emits` object with the row's
//   events, a `labels` prop when it has a label group;
// - the state: what the row's state shows is on screen, with its role (a
//   polite status for loading and empty, an alert for a failure, `aria-busy`
//   while something loads or runs);
// - the family: every element it renders carries `data-<family>`;
// - the names: every control has an accessible name with a word in it, a
//   name given by `aria-label` starts with the words the control shows, two
//   enabled buttons share a name only inside differently named groups or
//   with different descriptions, and every id an `aria-describedby` names
//   exists;
// - busy: a button pressed into a pending state keeps focus, is
//   `aria-disabled`, says something other than it said before, and a
//   second press of it starts nothing;
// - refused: no control the caller may not use (`absent`);
// - the slots: each slot the row lists renders in at least one state.

// A notification links through NuxtLink, which resolves the router's link: stood in here.
testUtils.global.components = { ...testUtils.global.components, RouterLink: RouterLinkStub }
// The test app has no router: a link is the anchor `NuxtLink` renders.
testUtils.global.stubs = { ...testUtils.global.stubs, NuxtLink: { props: ['to'], setup: (props: Record<string, unknown>, { slots }: { slots: { default?: () => unknown } }) => () => h('a', { href: props.to as string }, slots.default?.() as never) } }

// ── The world the composables read ─────────────────────────────────────────

type Failure = { code: string, data: Record<string, unknown>, message: string }
const failure = (code = 'unavailable'): Failure => ({ code, data: { service: 'billing', reason: 'provider_refused' }, message: 'The provider refused.' })
/** An action that never settles: the component stays in its pending state. */
const never = () => new Promise<never>(() => {})

const PRODUCTS = {
  starter: { id: 'prod_starter', name: 'Starter', prices: [{ priceAmount: 500, priceCurrency: 'EUR' }] },
  pro: { id: 'prod_pro', name: 'Pro', prices: [{ priceAmount: 900, priceCurrency: 'EUR' }] },
  credits100: { id: 'prod_pack', name: '100 credits', prices: [{ priceAmount: 500, priceCurrency: 'EUR' }] },
  credits500: { id: 'prod_pack_500', name: '500 credits', prices: [{ priceAmount: 2000, priceCurrency: 'EUR' }] },
}
/** The live pricing, as getPricing reads it: Starter by the month, Pro at both intervals. */
const price = (productId: string, amount: number, interval: 'month' | 'year') => ({ productId, amount, currency: 'eur', monthly: interval === 'year' ? amount / 12 : amount })
const PLANS: PricedPlan[] = [
  { key: 'starter', name: 'Starter', description: null, retired: false, features: [], featureKeys: [], quotas: { projects: 3 }, prices: { month: price('prod_starter', 500, 'month') } },
  { key: 'pro', name: 'Pro', description: null, retired: false, features: [], featureKeys: ['reports'], quotas: { projects: 'unlimited' }, prices: { month: price('prod_pro', 900, 'month'), year: { ...price('prod_pro_year', 9000, 'year'), savings: 16 } } },
]
const PACKS: PricedPack[] = [
  { key: 'credits100', productId: 'prod_pack', name: '100 credits', description: null, amount: 500, currency: 'eur', credits: { units: 100, rollover: true }, perCredit: 5, isBestValue: false },
  { key: 'credits500', productId: 'prod_pack_500', name: '500 credits', description: null, amount: 2000, currency: 'eur', credits: { units: 500, rollover: true }, perCredit: 4, lessPerCredit: 20, isBestValue: true },
]
// Two workspaces share a name, so only their slugs tell their rows apart.
const WORKSPACES = [
  { id: 'ws1', name: 'Personal', slug: 'personal', createdAt: 1 },
  { id: 'ws2', name: 'Acme', slug: 'acme', createdAt: 2 },
  { id: 'ws3', name: 'Acme', slug: 'acme-labs', createdAt: 3 },
]

const world = {
  authed: ref(true),
  authLoading: ref(false),
  role: ref('admin'),
  products: ref<Record<string, unknown> | undefined>(PRODUCTS),
  plans: ref<PricedPlan[] | undefined>(PLANS),
  packs: ref<PricedPack[] | undefined>(PACKS),
  pricingError: ref<Failure | null>(null),
  // The currencies the catalog prices in: two make the currency switch.
  currencies: ref<string[]>(['usd']),
  // A promotion getPricing was asked for: its terms, and the prices it applies to carry their offer.
  promotion: ref<PricedPromotion | undefined>(undefined),
  subscription: ref<Record<string, unknown> | null | undefined>(null),
  pendingChange: ref<{ productId: string, appliesAt: Date } | null>(null),
  benefits: ref<Array<Record<string, unknown>>>([]),
  billingLoading: ref(false),
  billingError: ref<Failure | null>(null),
  canManage: ref(true),
  balance: ref<number | undefined>(42),
  workspaces: ref(WORKSPACES),
  currentWorkspace: ref<Record<string, unknown> | null>({ id: 'ws1', name: 'Personal', slug: 'personal' }),
  workspacesLoading: ref(false),
  orders: ref<Array<Record<string, unknown>> | undefined>(undefined),
  ordersLoading: ref(false),
  ordersError: ref<Failure | null>(null),
  events: ref<Array<Record<string, unknown>> | undefined>(undefined),
  eventsLoading: ref(false),
  eventsError: ref<Failure | null>(null),
  activity: ref<Array<Record<string, unknown>> | undefined>(undefined),
  activityLoading: ref(false),
  activityError: ref<Failure | null>(null),
  activityRefused: ref(false),
  accountExport: ref<Record<string, unknown> | null>(null),
  accountLoading: ref(false),
  exportFails: ref(false),
  adminUsers: ref<unknown[] | undefined>(undefined),
  adminWorkspaces: ref<unknown[] | undefined>(undefined),
  adminLoading: ref(false),
  adminError: ref<Failure | null>(null),
  adminRefused: ref(false),
  impersonating: ref(false),
  maintenance: ref<{ message: string } | null>(null),
  deletion: ref<{ requestedAt: number, deletesAt: number } | null>(null),
  authPending: ref(false),
  authError: ref<Failure | null>(null),
  gifts: ref<Array<Record<string, unknown>>>([]),
  announcements: ref<Array<{ id: string, message: string, expiresAt: number, publishedAt: number, link?: { url: string } }>>([]),
  // The referral card: what its reads are doing.
  referral: ref<'ready' | 'loading' | 'error'>('ready'),
  giftPending: ref(false),
  featuresLoading: ref(false),
  featuresError: ref<Failure | null>(null),
  granted: ref(true),
  loginStep: ref('choose'),
  // The consent ledger: the kinds asked, what is missing, the required kinds a sign-in form names, and the storage question.
  consentAsks: ref<Array<Record<string, unknown>>>([{ kind: 'terms', version: '2026-10-01', title: 'Terms', url: '/terms', required: true, changed: false }]),
  consentMissing: ref<string[]>(['terms']),
  consentTerms: ref<Array<Record<string, unknown>>>([]),
  consentStorage: ref<Record<string, boolean>>({}),
  consentAsking: ref(false),
  consentPending: ref(false),
  consentError: ref<Failure | null>(null),
  // The inbox: its notifications, the first page read, a failure, marking read in flight, and whether the caller has an inbox.
  notifications: ref<Array<Record<string, unknown>>>([]),
  notificationsLoading: ref(false),
  notificationsError: ref<Failure | null>(null),
  notificationsPending: ref(false),
  // The upload field's two calls: the upload to storage, then the app's claim. `hang` never settles.
  uploadOutcome: ref<'hang' | 'ok' | 'fail'>('hang'),
  claimOutcome: ref<'hang' | 'ok' | 'refuse'>('hang'),
  // The contact form's one call: `hang` never settles.
  contactOutcome: ref<'hang' | 'ok' | 'refuse' | 'fail'>('hang'),
  // The first run's one call (finishing it) and the activation checklist's read and dismissal. `hang` never settles.
  onboardingOutcome: ref<'hang' | 'ok' | 'fail'>('hang'),
  activation: ref<Record<string, unknown> | undefined>(undefined),
  activationLoading: ref(false),
  activationOutcome: ref<'hang' | 'ok'>('hang'),
  // "How did you hear about us?": answered before, signed out, read in flight, saving, and how the save goes. `hang` never settles.
  sourceAnswered: ref(false),
  sourceSignedOut: ref(false),
  sourceLoading: ref(false),
  sourcePending: ref(false),
  sourceError: ref<Failure | null>(null),
  sourceOutcome: ref<'hang' | 'ok' | 'fail'>('hang'),
  // The waitlist form's step, its place once the code checked, and whether its join is on its way.
  waitlistStep: ref('join'),
  waitlistPlace: ref<Record<string, unknown> | undefined>(undefined),
  waitlistPending: ref(false),
  waitlistError: ref<Failure | null>(null),
  // How this browser last signed in: the method whose button carries the mark.
  loginLastMethod: ref<string | null>('passkey'),
  loginPending: ref(false),
  loginError: ref<Failure | null>(null),
  emailStep: ref('enter-email'),
  emailPending: ref(false),
  emailError: ref<Failure | null>(null),
  sessionsList: ref<Array<Record<string, unknown>> | undefined>(undefined),
  sessionsLoading: ref(false),
  sessionsError: ref<Failure | null>(null),
  reauthRequired: ref(false),
  reauthStep: ref('choose'),
  reauthPending: ref(false),
  reauthError: ref<Failure | null>(null),
  online: ref(true),
  socket: ref<Record<string, unknown>>({ isWebSocketConnected: true, hasEverConnected: true, connectionRetries: 0, inflightMutations: 0 }),
}

const billing = {
  products: computed(() => world.products.value),
  subscription: computed(() => world.subscription.value),
  subscriptions: computed(() => []),
  isSubscribed: computed(() => world.subscription.value != null),
  isFree: computed(() => world.subscription.value === null),
  isLoading: computed(() => world.billingLoading.value),
  isPending: computed(() => false),
  canManage: computed(() => world.canManage.value),
  error: computed(() => world.billingError.value),
  productsError: computed(() => (world.products.value === undefined ? world.billingError.value : null)),
  status: computed(() => (world.subscription.value?.status as string | undefined) ?? null),
  cancelAtPeriodEnd: computed(() => world.subscription.value?.cancelAtPeriodEnd === true),
  resumesAt: computed(() => (world.subscription.value?.resumesAt ? new Date(world.subscription.value.resumesAt as string) : null)),
  trialEnd: computed(() => (world.subscription.value?.trialEnd ? new Date(world.subscription.value.trialEnd as string) : null)),
  isTrialing: computed(() => world.subscription.value?.status === 'trialing'),
  isPaused: computed(() => world.subscription.value?.status === 'paused'),
  isPastDue: computed(() => world.subscription.value?.status === 'past_due'),
  isFinishingCheckout: computed(() => false),
  pendingChange: computed(() => world.pendingChange.value),
  checkout: vi.fn(never),
  pass: computed(() => null),
  portal: vi.fn(never),
  changePlan: vi.fn(never),
  cancel: vi.fn(never),
  acceptOffer: vi.fn(never),
  saveOffers: computed(() => false),
  uncancel: vi.fn(never),
  cancelPendingChange: vi.fn(never),
  pause: vi.fn(never),
  resume: vi.fn(never),
}
// The consent ledger: what <ConsentPrompt> is asked to ask, and the consent manager's question.
const consents = {
  consents: computed(() => ({})),
  missing: computed(() => world.consentMissing.value),
  terms: computed(() => world.consentTerms.value),
  minimumAge: computed(() => null),
  asks: () => world.consentAsks.value,
  grant: vi.fn(() => {
    world.consentPending.value = true
    return never()
  }),
  withdraw: vi.fn(never),
  isPending: computed(() => world.consentPending.value),
  error: computed(() => world.consentError.value),
  storage: computed(() => world.consentStorage.value),
  allowStorage: vi.fn(never),
  isAsking: computed(() => world.consentAsking.value),
}
const accountData = {
  latestExport: computed(() => world.accountExport.value),
  exportsLeft: computed(() => 3),
  confirmation: computed(() => 'ada@example.com'),
  isLoading: computed(() => world.accountLoading.value),
  isPending: computed(() => false),
  error: computed(() => null),
  exportData: vi.fn(() => (world.exportFails.value ? Promise.reject(Object.assign(new Error('refused'), failure('rate_limited'))) : never())),
  deleteAccount: vi.fn(never),
  deletion: computed(() => world.deletion.value),
  cancelDeletion: vi.fn(never),
}
// The deletion notice's seam: the scheduled deletion, as the account reads it.
const deletionNotice = {
  deletion: computed(() => world.deletion.value),
  kept: computed(() => false),
  visible: computed(() => world.deletion.value !== null),
  message: computed(() => 'Your account will be deleted on 31 January 2027. Until then you can keep it.'),
  isPending: computed(() => false),
  error: computed(() => null),
  announcement: computed(() => ''),
  keep: vi.fn(never),
  bind: {
    root: computed(() => ({ 'data-deletion': 'notice', 'aria-label': 'Account deletion' })),
    message: computed(() => ({ 'data-deletion': 'message' })),
    keep: computed(() => ({ 'type': 'button', 'data-deletion': 'keep' })),
    error: computed(() => ({ 'role': 'alert', 'data-deletion': 'error' })),
    status: computed(() => ({ 'role': 'status', 'aria-live': 'polite', 'data-deletion': 'status' })),
  },
}
const credits = {
  balance: computed(() => world.balance.value),
  credited: computed(() => (world.balance.value === undefined ? undefined : 50)),
  consumed: computed(() => (world.balance.value === undefined ? undefined : 8)),
  meterId: computed(() => 'meter_1'),
  isLoading: computed(() => world.balance.value === undefined),
  topUp: vi.fn(never),
  refresh: vi.fn(never),
}
const auth = {
  isImpersonating: computed(() => world.impersonating.value),
  impersonatedBy: computed(() => (world.impersonating.value ? 'u_root' : null)),
  isPending: computed(() => world.authPending.value),
  error: computed(() => world.authError.value),
  stopImpersonating: vi.fn(() => {
    world.authPending.value = true
    return never()
  }),
  isAuthenticated: computed(() => world.authed.value),
  isLoading: computed(() => world.authLoading.value),
  user: computed(() => (world.authed.value ? { name: 'Ada Lovelace', email: 'ada@example.com', emailVerified: true } : null)),
  role: computed(() => world.role.value),
  banned: computed(() => false),
  hasRole: (role: string | string[]) => [role].flat().includes(world.role.value),
  can: () => world.role.value === 'admin',
  session: ref({ data: null, isPending: false, refetch: vi.fn() }),
  updateUser: vi.fn(never),
  deleteAccount: vi.fn(never),
  signOut: vi.fn(never),
}
const admin = {
  users: computed(() => world.adminUsers.value),
  workspaces: computed(() => world.adminWorkspaces.value),
  page: computed(() => 1),
  hasMore: computed(() => true),
  hasPrevious: computed(() => false),
  user: computed(() => undefined),
  workspace: computed(() => undefined),
  isLoading: computed(() => world.adminLoading.value),
  isRefused: computed(() => world.adminRefused.value),
  isPending: computed(() => false),
  error: computed(() => world.adminError.value),
  next: vi.fn(never),
  previous: vi.fn(never),
  reset: vi.fn(),
  setRole: vi.fn(never),
  ban: vi.fn(never),
  unban: vi.fn(never),
  revokeSessions: vi.fn(never),
  impersonate: vi.fn(never),
}
const organization = {
  workspaces: computed(() => world.workspaces.value),
  current: computed(() => world.currentWorkspace.value),
  isLoading: computed(() => world.workspacesLoading.value),
  role: computed(() => 'owner'),
  members: computed(() => []),
  setActive: vi.fn(never),
  create: vi.fn(never),
  getInvitation: vi.fn(),
  acceptInvitation: vi.fn(),
  declineInvitation: vi.fn(),
  listReceivedInvitations: vi.fn(async () => []),
  isPending: computed(() => false),
  error: computed(() => null),
  rename: vi.fn(never),
  invite: vi.fn(never),
}
const orders = {
  orders: world.orders,
  hasMore: computed(() => world.orders.value !== undefined && world.orders.value.length > 0),
  hasPrevious: computed(() => false),
  isLoading: computed(() => world.ordersLoading.value),
  error: world.ordersError,
  next: vi.fn(),
  previous: vi.fn(),
  invoice: vi.fn(never),
}
const usage = {
  events: world.events,
  hasMore: computed(() => world.events.value !== undefined && world.events.value.length > 0),
  hasPrevious: computed(() => false),
  isLoading: computed(() => world.eventsLoading.value),
  error: world.eventsError,
  // A page turn: the list loads until it settles, which it never does here.
  next: vi.fn(() => {
    world.eventsLoading.value = true
    return never()
  }),
  previous: vi.fn(),
}
const auditLog = {
  events: world.activity,
  page: computed(() => 1),
  hasMore: computed(() => world.activity.value !== undefined && world.activity.value.length > 0),
  hasPrevious: computed(() => false),
  isLoading: computed(() => world.activityLoading.value),
  isRefused: computed(() => world.activityRefused.value),
  error: world.activityError,
  // A page turn: the list loads until it settles, which it never does here.
  next: vi.fn(() => {
    world.activityLoading.value = true
    return never()
  }),
  previous: vi.fn(),
  reset: vi.fn(),
}
const gifts = {
  received: computed(() => world.gifts.value),
  unclaimed: computed(() => world.gifts.value),
  isLoading: computed(() => false),
  isPending: computed(() => world.giftPending.value),
  claim: vi.fn(never),
}
// A person's referral link and what it earned, as useReferrals reads them.
const referrals = {
  code: ref('ABCD2345'),
  link: computed(() => 'https://app.example/r/ABCD2345'),
  shareText: computed(() => 'Try this app with my link. You get 25% off. I earn 100 credits when you become a customer.'),
  program: ref({ referred: { kind: 'discount', name: 'A friend\'s welcome' }, referrer: { kind: 'pack', name: '100 credits' }, holdDays: 30, caps: { perReferrer: null, perMonth: null } }),
  referrals: computed(() => ({ claimed: 1, held: 1, rewarded: 2, referrals: [] })),
  sharePages: ref(true),
  isLoading: computed(() => world.referral.value === 'loading'),
  isPending: computed(() => false),
  error: computed(() => (world.referral.value === 'error' ? failure() : null)),
  canShare: ref(true),
  copied: ref(false),
  copy: vi.fn(async () => true),
  share: vi.fn(async () => true),
  setSharePages: vi.fn(async () => undefined),
}
const features = {
  plans: computed(() => []),
  benefits: computed(() => world.benefits.value),
  isLoading: computed(() => world.featuresLoading.value),
  error: computed(() => world.featuresError.value),
  has: () => world.granted.value,
  hasPlan: () => world.granted.value,
  // A quota of 3, all used once the plan grants no more.
  quota: () => ({ limit: 3, used: world.granted.value ? 1 : 3 }),
  remaining: () => (world.granted.value ? 2 : 0),
}
const loginFlow = {
  step: world.loginStep,
  lastMethod: computed(() => world.loginLastMethod.value),
  email: ref('ada@example.com'),
  name: ref(''),
  otp: ref(''),
  recoveryCode: ref(''),
  inviteCode: ref(''),
  waitlist: ref<{ position: number, total: number, token: string } | null>(null),
  passkeyRequired: computed(() => false),
  isPending: computed(() => world.loginPending.value),
  error: world.loginError,
  retryAfter: ref(null),
  emailValid: computed(() => true),
  signInWithPasskey: vi.fn(never),
  sendCode: vi.fn(never),
  verifyCode: vi.fn(never),
  // The step a press starts: the flow is busy until it settles, which it never does here.
  addPasskey: vi.fn(() => {
    world.loginPending.value = true
    return never()
  }),
  skipPasskey: vi.fn(async () => {}),
  recover: vi.fn(never),
  redeemInviteCode: vi.fn(never),
  age: ref(''),
  submitAge: vi.fn(never),
  goTo: vi.fn(),
  reset: vi.fn(),
}
const waitlistFlow = {
  step: world.waitlistStep,
  questions: computed(() => ({ role: ['Writer', 'Illustrator'] })),
  email: ref('mo@panels.example'),
  answers: reactive<Record<string, string>>({}),
  launchNews: ref(false),
  code: ref(''),
  ref: ref<string | null>(null),
  dropReferral: vi.fn(),
  place: computed(() => world.waitlistPlace.value),
  isLoading: computed(() => false),
  signedIn: ref(false),
  // The step a press starts: the flow is busy until it settles, which it never does here.
  join: vi.fn(() => {
    world.waitlistPending.value = true
    return never()
  }),
  verify: vi.fn(never),
  status: vi.fn(),
  leave: vi.fn(never),
  back: vi.fn(),
  isPending: computed(() => world.waitlistPending.value),
  error: world.waitlistError,
  retryAfter: ref(null),
  bind: {
    get emailInput() { return { 'type': 'email', 'name': 'email', 'autocomplete': 'email', 'required': true, 'aria-invalid': world.waitlistError.value?.data.field === 'email' || undefined, 'value': waitlistFlow.email.value, 'onInput': () => {} } },
    get codeInput() { return { 'type': 'text', 'name': 'otp', 'inputmode': 'numeric', 'autocomplete': 'one-time-code', 'required': true, 'aria-invalid': undefined, 'value': waitlistFlow.code.value, 'onInput': () => {} } },
    get launchNewsInput() { return { type: 'checkbox', name: 'launchNews', checked: waitlistFlow.launchNews.value, onChange: () => {} } },
    answerInput: (key: string) => ({ 'name': key, 'value': '', 'aria-invalid': undefined, 'onChange': () => {} }),
  },
}
const emailChange = {
  step: world.emailStep,
  newEmail: ref('grace@example.com'),
  otp: ref(''),
  isPending: computed(() => world.emailPending.value),
  error: world.emailError,
  retryAfter: ref(null),
  emailValid: computed(() => true),
  start: vi.fn(() => {
    world.emailPending.value = true
    return never()
  }),
  confirmCurrent: vi.fn(never),
  verifyNew: vi.fn(never),
  reset: vi.fn(),
}
const passkeys = {
  passkeys: ref([{ id: 'pk1', name: 'Laptop', createdAt: '2026-01-01' }]),
  isLoading: computed(() => false),
  isPending: computed(() => false),
  error: ref(null),
  add: vi.fn(never),
  rename: vi.fn(never),
  remove: vi.fn(never),
  capabilities: computed(() => null),
  passkeyOnly: computed(() => false),
  setPasskeyOnly: vi.fn(never),
}
const sessions = {
  sessions: world.sessionsList,
  isLoading: world.sessionsLoading,
  isPending: computed(() => false),
  error: world.sessionsError,
  listError: world.sessionsError,
  revoke: vi.fn(never),
  revokeOthers: vi.fn(never),
}
const reauthentication = {
  isRequired: computed(() => world.reauthRequired.value),
  step: world.reauthStep,
  email: computed(() => 'ada@example.com'),
  otp: ref(''),
  isPending: computed(() => world.reauthPending.value),
  error: world.reauthError,
  retryAfter: ref(null),
  withPasskey: vi.fn(never),
  // The step a press starts: the dialog is busy until it settles, which it never does here.
  sendCode: vi.fn(() => {
    world.reauthPending.value = true
    return never()
  }),
  verifyCode: vi.fn(never),
  back: vi.fn(),
  cancel: vi.fn(),
  reauthenticate: vi.fn(never),
  withReauthentication: vi.fn(<T>(action: () => Promise<T>) => action()),
}
const pricing = {
  plans: computed(() => world.plans.value),
  packs: computed(() => world.packs.value),
  intervals: computed(() => (['month', 'year'] as const).filter(interval => (world.plans.value ?? []).some(plan => plan.prices[interval]))),
  isLoading: computed(() => world.plans.value === undefined && world.pricingError.value === null),
  error: computed(() => world.pricingError.value),
  currency: computed(() => world.currencies.value[0]),
  currencies: computed(() => world.currencies.value),
  promotion: computed(() => world.promotion.value),
  setCurrency: vi.fn(),
  packFor: () => world.packs.value?.[0],
  refresh: vi.fn(async () => {}),
}
const config = {
  billing: {
    plans: [{ key: 'starter' }, { key: 'pro', highlight: true }],
    packs: [{ key: 'credits100' }, { key: 'credits500' }],
    contact: { name: 'Enterprise', features: ['Volume pricing'], href: 'mailto:sales@example.com' },
    lowCreditsThreshold: 10,
  },
  brand: {},
  labels: {},
}
const checkoutLink = vi.fn(never)
const portalSession = vi.fn(never)
// The base module's upload, as <UploadField> drives it: the outcome the world says.
const uploader = {
  progress: ref(0.4),
  error: ref<Error | null>(null),
  cancel: vi.fn(),
  upload: vi.fn(async (): Promise<string | null> => {
    if (world.uploadOutcome.value === 'hang') return never()
    if (world.uploadOutcome.value === 'fail') {
      uploader.error.value = new Error('The upload failed.')
      return null
    }
    return 'kg2upload'
  }),
}
/** The app's claim of an uploaded file, as the world says it goes. */
const claimFile = async (): Promise<void> => {
  if (world.claimOutcome.value === 'hang') return never()
  if (world.claimOutcome.value === 'refuse') throw backendError('invalid_input', { field: 'file', reason: 'unsupported_type' }, 'Not that type.')
}
/** The contact form's call, as the world says it goes; its reference stands for `api.email.submitContactMessage`. */
const contactRef = { name: 'submitContactMessage' }
const submitContact = vi.fn(async (): Promise<{ sent: true }> => {
  if (world.contactOutcome.value === 'hang') return never()
  if (world.contactOutcome.value === 'refuse') throw backendError('rate_limited', { limit: 'contact', retryAfter: 60_000 }, 'Too many messages.')
  if (world.contactOutcome.value === 'fail') throw backendError('unavailable', { service: 'email', reason: 'provider_refused' }, 'The provider refused.')
  return { sent: true }
})
/** Write a message the way a visitor does: the fields change. */
const fillContact = async (wrapper: VueWrapper) => {
  await wrapper.find('[data-contact="input-name"]').setValue('Mo')
  await wrapper.find('[data-contact="input-email"]').setValue('mo@example.com')
  await wrapper.find('[data-contact="input-message"]').setValue('Where do I find my invoices?')
}
/** Fill the form in and send it. */
const sendContact = async (wrapper: VueWrapper) => {
  await fillContact(wrapper)
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}
/** Pick a file the way a person does: the hidden input changes. */
const chooseFile = async (wrapper: VueWrapper) => {
  const input = wrapper.find('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [new File(['x'], 'panel.jpg', { type: 'image/jpeg' })], configurable: true })
  await input.trigger('change')
  await flushPromises()
}

/** The inbox's data, as `useNotifications` reads it: the world's notifications, newest first. */
const notifications = {
  items: computed(() => world.notifications.value),
  unreadCount: computed(() => world.notifications.value.filter(item => !item.read).length),
  hasMoreUnread: computed(() => false),
  isSignedIn: computed(() => world.authed.value),
  hasInbox: computed(() => world.authed.value && !world.impersonating.value),
  isLoading: computed(() => world.authLoading.value || world.notificationsLoading.value),
  isPending: computed(() => world.notificationsPending.value),
  isLoadingMore: computed(() => false),
  canLoadMore: computed(() => world.notifications.value.length > 1),
  error: computed(() => world.notificationsError.value),
  markRead: vi.fn(() => {
    world.notificationsPending.value = true
    return never()
  }),
  markAllRead: vi.fn(() => {
    world.notificationsPending.value = true
    return never()
  }),
  loadMore: vi.fn(),
}

/** The first run's finishing, and the checklist's dismissal, as the world says they go; their references stand for `api.account.completeOnboarding` and `api.audit.dismissActivation`. */
const completeRef = { name: 'completeOnboarding' }
const dismissRef = { name: 'dismissActivation' }
const activationRef = { name: 'getActivation' }
const completeOnboarding = vi.fn(async (): Promise<{ onboardedAt: number }> => {
  if (world.onboardingOutcome.value === 'hang') return never()
  if (world.onboardingOutcome.value === 'fail') throw backendError('unavailable', { service: 'backend', reason: 'down' }, 'It failed.')
  return { onboardedAt: 1 }
})
const dismissActivation = vi.fn(async (): Promise<null> => {
  if (world.activationOutcome.value === 'hang') return never()
  return null
})
/** The checklist as `getActivation` answers: two of three tasks done, an open one with a link. */
const ACTIVATION = {
  tasks: [
    { key: 'photo', label: 'Upload a photo', to: '/studio/photos', scope: 'person', done: true, doneAt: 1 },
    { key: 'strip', label: 'Generate your first strip', to: '/studio/new', scope: 'person', done: false, doneAt: null },
    { key: 'publish', label: 'Publish a strip', to: null, scope: 'person', done: false, doneAt: null },
  ],
  done: 1,
  total: 3,
  progress: 1 / 3,
  isComplete: false,
  isDismissed: false,
  readOnly: false,
}

/** The question's state, as `useHowDidYouHear` keeps it, driven by the world. */
const sourceDone = ref(false)
async function keepSource(): Promise<null> {
  world.sourcePending.value = true
  if (world.sourceOutcome.value === 'hang') return never()
  world.sourcePending.value = false
  if (world.sourceOutcome.value === 'fail') {
    world.sourceError.value = failure()
    throw Object.assign(new Error('failed'), failure())
  }
  sourceDone.value = true
  return null
}
const sourceQuestion = {
  options: computed(() => ['friend', 'ai-assistant', 'other']),
  chosen: ref<string | null>('ai-assistant'),
  detail: ref(''),
  detailMax: 100,
  isAnswered: computed(() => world.sourceAnswered.value),
  isDone: sourceDone,
  isSignedOut: computed(() => world.sourceSignedOut.value),
  isLoading: computed(() => world.sourceLoading.value),
  isPending: computed(() => world.sourcePending.value),
  error: computed(() => world.sourceError.value),
  submit: vi.fn(keepSource),
  skip: vi.fn(keepSource),
}

/** Every action a component can start, each a mock: a second press of a busy button must call none of them. */
const ACTIONS = [notifications, billing, credits, auth, admin, organization, orders, usage, gifts, loginFlow, waitlistFlow, consents, emailChange, passkeys, sessions, reauthentication, sourceQuestion]
  .flatMap(composable => Object.entries(composable as Record<string, unknown>))
  .concat([['checkoutLink', checkoutLink], ['portalSession', portalSession], ['submitContact', submitContact], ['completeOnboarding', completeOnboarding], ['dismissActivation', dismissActivation]])
  .filter((entry): entry is [string, ReturnType<typeof vi.fn>] => vi.isMockFunction(entry[1]))

vi.mock('../../src/runtime/vue/composables/use-billing', async importOriginal => ({
  ...(await importOriginal<typeof import('../../src/runtime/vue/composables/use-billing')>()),
  useBilling: () => billing,
}))
vi.mock('../../src/runtime/vue/composables/use-notifications', () => ({ useNotifications: () => notifications }))
vi.mock('../../src/runtime/vue/composables/use-credits', () => ({ useCredits: () => credits }))
vi.mock('../../src/runtime/vue/composables/use-pricing', () => ({ usePricing: () => pricing }))
// The pricing table's sign-in link and campaign read the address.
mockNuxtImport('useRoute', () => () => ({ fullPath: '/pricing', query: {} }))
vi.mock('../../src/runtime/vue/utils/auth-session', () => ({ useAuthSession: () => auth }))
vi.mock('../../src/runtime/vue/composables/use-workspace', () => ({ useWorkspace: () => organization }))
vi.mock('../../src/runtime/vue/composables/use-orders', () => ({ useOrders: () => orders }))
vi.mock('../../src/runtime/vue/composables/use-usage', () => ({ useUsage: () => usage }))
vi.mock('../../src/runtime/vue/composables/use-audit-log', () => ({ useAuditLog: () => auditLog }))
vi.mock('../../src/runtime/vue/composables/use-account', () => ({ useAccount: () => accountData }))
vi.mock('../../src/runtime/vue/composables/use-consents', () => ({ useConsents: () => consents }))
vi.mock('../../src/runtime/vue/composables/use-deletion-notice', async (importOriginal) => {
  const { useLabels } = await import('../../src/runtime/vue/composables/use-labels')
  return { ...await importOriginal<Record<string, unknown>>(), useDeletionNotice: () => ({ ...deletionNotice, labels: useLabels('deletion') }) }
})
vi.mock('../../src/runtime/vue/composables/use-admin', () => ({ useAdmin: () => admin }))
vi.mock('../../src/runtime/vue/composables/use-gifts', () => ({ useGifts: () => gifts }))
// The announcement notice of <BackendNotices>: what an administrator published.
vi.mock('../../src/runtime/vue/composables/use-announcements', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  useAnnouncements: () => ({
    announcements: computed(() => world.announcements.value),
    isPending: computed(() => false),
    error: computed(() => null),
    dismiss: async () => {},
    linkOf: (item: { link?: { url: string } }) => (item.link ? { href: item.link.url, external: false } : null),
  }),
}))
vi.mock('../../src/runtime/vue/composables/use-referrals', () => ({ useReferrals: () => referrals }))
vi.mock('../../src/runtime/vue/composables/use-how-did-you-hear', () => ({ useHowDidYouHear: () => sourceQuestion }))
vi.mock('../../src/runtime/vue/composables/use-features', () => ({ useFeatures: () => features }))
vi.mock('../../src/runtime/vue/composables/use-login-flow', () => ({ useLoginFlow: () => loginFlow }))
vi.mock('../../src/runtime/vue/composables/use-waitlist', () => ({ useWaitlist: () => waitlistFlow }))
vi.mock('../../src/runtime/vue/composables/use-email-change', () => ({ useEmailChange: () => emailChange }))
vi.mock('../../src/runtime/vue/composables/use-passkeys', () => ({ usePasskeys: () => passkeys }))
vi.mock('../../src/runtime/vue/composables/use-sessions', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  useSessions: () => sessions,
}))
vi.mock('../../src/runtime/vue/composables/use-reauthentication', () => ({
  useReauthentication: () => reauthentication,
  useDialogTurn: () => ({ active: computed(() => true), outcome: () => null }),
}))
vi.mock('../../src/runtime/vue/composables/use-backend-config', () => ({ useBackendConfig: () => config }))
// The maintenance notice of <BackendNotices>: the switch, as getFlags reads it.
vi.mock('../../src/runtime/vue/composables/use-flags', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  useMaintenanceNotice: () => computed(() => world.maintenance.value),
}))
// The billing links' own seams: the namespace, who may manage, the checkout and the portal action.
vi.mock('../../src/runtime/vue/utils/namespace', () => ({
  useBackendNamespace: () => ({ generateCustomerPortalUrl: {}, generateUploadUrl: {}, submitContactMessage: contactRef }),
  // The shell's seams: finishing the first run, the checklist, and a catalog that sells a plan.
  useApiNamespace: (name: string) => ({ account: { completeOnboarding: completeRef }, audit: { getActivation: activationRef, dismissActivation: dismissRef }, billing: { getPricing: {} } } as Record<string, unknown>)[name],
}))
// The checklist's live read: what the world says it is.
vi.mock('../../src/runtime/vue/utils/live-query', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  useLiveQuery: () => ({ data: computed(() => world.activation.value), isLoading: computed(() => world.activationLoading.value), error: computed(() => null) }),
}))
// The contact form asks for a bot-check token before it sends: this app checks no one.
vi.mock('../../src/runtime/vue/composables/use-human-check', () => ({ useHumanCheck: () => ({ token: async () => null }) }))
vi.mock('../../src/runtime/vue/utils/billing-access', () => ({
  useCanManage: () => computed(() => world.canManage.value),
  useBillingAccess: () => ({ canManage: computed(() => world.canManage.value), saveOffers: computed(() => false), softOptIn: computed(() => false) }),
}))
vi.mock('../../src/runtime/vue/composables/billing-provider', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  createCheckout: () => checkoutLink,
}))
// <ConnectionStatus>: the live connection, on a client that has opened it,
// and the browser's online state.
vi.mock('../../src/runtime/vue/composables/base-aliases', () => ({
  useBackendClient: () => ({
    cachedSync: {},
    connectionState: () => world.socket.value,
    subscribeToConnectionState: (callback: (state: unknown) => void) => watch(world.socket, callback, { flush: 'sync' }),
  }),
}))
vi.mock('@vueuse/core', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  useOnline: () => computed(() => world.online.value),
}))
vi.mock('nuxt-convex-module/client', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  useAction: (reference: unknown) => (reference === contactRef ? submitContact : portalSession),
  useMutation: (reference: unknown) => (reference === completeRef ? completeOnboarding : dismissActivation),
  useUpload: () => uploader,
}))

// Imported after the mocks above, so the components see them; registered by
// name too, as Nuxt registers them, so a parent finds its parts.
const { registerComponents } = await import('../helpers/register-components')
const COMPONENTS = await registerComponents(...Object.keys(COMPONENT_CONTRACT)) as Record<ContractedComponent, Component>

const ORDERS = [
  { id: 'ord_1', createdAt: '2026-08-01T10:00:00.000Z', status: 'paid', totalAmount: 900, currency: 'EUR', isInvoiceGenerated: true, product: { id: 'prod_pro', name: 'Pro' } },
  { id: 'ord_2', createdAt: '2026-07-01T10:00:00.000Z', status: 'refunded', totalAmount: 900, currency: 'EUR', isInvoiceGenerated: true, product: { id: 'prod_pro', name: 'Pro' } },
]
const EVENTS = [{ id: 'evt_1', timestamp: '2026-08-01T10:00:00.000Z', name: 'ai_tokens', units: 12 }]
// Who did what: a sign-in of the reader's own, and a role change in a workspace.
const ACTIVITY = [
  { id: 'ev_1', type: 'auth.signed_in', at: Date.parse('2026-08-01T10:00:00.000Z'), actor: { kind: 'you', id: 'u1', name: 'Ada' }, subject: { kind: 'you', id: 'u1', name: 'Ada' }, workspace: null, agent: null, impersonated: false, targetId: 's1', data: { method: 'passkey' } },
  { id: 'ev_2', type: 'workspace.member_role_changed', at: Date.parse('2026-07-01T10:00:00.000Z'), actor: { kind: 'user', id: 'u2', name: 'Grace' }, subject: { kind: 'you', id: 'u1', name: 'Ada' }, workspace: { id: 'w1', name: 'Acme' }, agent: null, impersonated: false, targetId: 'm1', data: { role: 'admin' } },
]
// A role change by a colleague, unread, and a payment, read: their titles tell the rows apart.
const NOTIFICATIONS = [
  { id: 'n_1', type: 'workspace.member_role_changed', title: 'Your role in Acme changed', body: 'You are now admin.', link: '/settings', at: Date.parse('2026-08-02T10:00:00.000Z'), read: false, actor: { kind: 'user', name: 'Grace' }, workspace: { id: 'w1', name: 'Acme' }, data: { role: 'admin' } },
  { id: 'n_2', type: 'billing.order_paid', title: 'Payment received', body: null, link: null, at: Date.parse('2026-08-01T10:00:00.000Z'), read: false, actor: { kind: 'app', name: null }, workspace: null, data: { amount: 900, currency: 'usd' } },
  { id: 'n_3', type: 'auth.passkey_added', title: 'A passkey was added', body: null, link: '/security', at: Date.parse('2026-07-01T10:00:00.000Z'), read: true, actor: { kind: 'you', name: 'Ada' }, workspace: null, data: {} },
]
// Two gifts from one sender: their sentences and dates tell them apart.
const GIFTS = [
  { id: 'gift_1', status: 'paid', purchaserName: 'Grace Hopper', createdAt: Date.parse('2026-08-01T10:00:00.000Z') },
  { id: 'gift_2', status: 'paid', purchaserName: 'Grace Hopper', createdAt: Date.parse('2026-09-01T10:00:00.000Z') },
]
const SESSIONS = [
  { id: 's-current', userAgent: 'Chrome Mac OS X', createdAt: Date.parse('2026-01-01'), current: true },
  { id: 's-other', userAgent: 'Firefox Windows', createdAt: Date.parse('2026-01-02'), current: false },
]
// Two accounts and two workspaces: their names tell their "View" buttons apart.
const ADMIN_USERS = [
  { id: 'u1', email: 'ada@example.com', name: 'Ada', image: null, role: 'user', administrator: false, banned: false, banReason: null, banExpires: null, emailVerified: true, lastSignInMethod: 'passkey', createdAt: Date.parse('2026-08-01') },
  { id: 'u2', email: 'grace@example.com', name: 'Grace', image: null, role: 'admin', administrator: true, banned: true, banReason: null, banExpires: null, emailVerified: true, lastSignInMethod: null, createdAt: Date.parse('2026-07-01') },
]
const ADMIN_WORKSPACES = [
  { id: 'w1', name: 'Acme', slug: 'acme', logo: null, createdAt: Date.parse('2026-08-01') },
  { id: 'w2', name: 'Globex', slug: 'globex', logo: null, createdAt: Date.parse('2026-07-01') },
]
const INVITATION = { id: 'inv_1', workspaceName: 'Acme', inviterEmail: 'grace@example.com', role: 'member', status: 'pending' }

function reset(): void {
  vi.clearAllMocks()
  world.authed.value = true
  world.authLoading.value = false
  world.referral.value = 'ready'
  world.role.value = 'admin'
  world.products.value = PRODUCTS
  world.plans.value = PLANS
  world.packs.value = PACKS
  world.pricingError.value = null
  world.currencies.value = ['usd']
  world.promotion.value = undefined
  config.billing.contact = { name: 'Enterprise', features: ['Volume pricing'], href: 'mailto:sales@example.com' }
  world.subscription.value = null
  world.pendingChange.value = null
  world.benefits.value = []
  world.billingLoading.value = false
  world.billingError.value = null
  world.canManage.value = true
  world.balance.value = 42
  world.currentWorkspace.value = { id: 'ws1', name: 'Personal', slug: 'personal' }
  world.workspacesLoading.value = false
  world.orders.value = ORDERS
  world.ordersLoading.value = false
  world.ordersError.value = null
  world.events.value = EVENTS
  world.eventsLoading.value = false
  world.activity.value = ACTIVITY
  world.activityLoading.value = false
  world.activityError.value = null
  world.activityRefused.value = false
  world.accountExport.value = null
  world.accountLoading.value = false
  world.exportFails.value = false
  world.adminUsers.value = ADMIN_USERS
  world.adminWorkspaces.value = ADMIN_WORKSPACES
  world.adminLoading.value = false
  world.adminError.value = null
  world.adminRefused.value = false
  world.impersonating.value = false
  world.maintenance.value = null
  world.deletion.value = null
  world.authPending.value = false
  world.authError.value = null
  world.eventsError.value = null
  world.gifts.value = []
  world.announcements.value = []
  world.giftPending.value = false
  world.featuresLoading.value = false
  world.featuresError.value = null
  world.granted.value = true
  world.loginStep.value = 'choose'
  world.notifications.value = NOTIFICATIONS
  world.notificationsLoading.value = false
  world.notificationsError.value = null
  world.notificationsPending.value = false
  world.uploadOutcome.value = 'hang'
  world.claimOutcome.value = 'hang'
  world.onboardingOutcome.value = 'hang'
  world.activation.value = ACTIVATION
  world.activationLoading.value = false
  world.activationOutcome.value = 'hang'
  world.sourceAnswered.value = false
  world.sourceSignedOut.value = false
  world.sourceLoading.value = false
  world.sourcePending.value = false
  world.sourceError.value = null
  world.sourceOutcome.value = 'hang'
  sourceDone.value = false
  sourceQuestion.chosen.value = 'ai-assistant'
  world.waitlistStep.value = 'join'
  world.waitlistPlace.value = undefined
  world.waitlistPending.value = false
  world.waitlistError.value = null
  world.loginLastMethod.value = 'passkey'
  world.loginPending.value = false
  world.loginError.value = null
  world.consentAsks.value = [{ kind: 'terms', version: '2026-10-01', title: 'Terms', url: '/terms', required: true, changed: false }]
  world.consentMissing.value = ['terms']
  world.consentTerms.value = []
  world.consentStorage.value = {}
  world.consentAsking.value = false
  world.consentPending.value = false
  world.consentError.value = null
  world.emailStep.value = 'enter-email'
  world.emailPending.value = false
  world.emailError.value = null
  world.sessionsList.value = SESSIONS
  world.sessionsLoading.value = false
  world.sessionsError.value = null
  world.reauthRequired.value = false
  world.reauthStep.value = 'choose'
  world.reauthPending.value = false
  world.reauthError.value = null
  world.online.value = true
  world.socket.value = { isWebSocketConnected: true, hasEverConnected: true, connectionRetries: 0, inflightMutations: 0 }
  organization.getInvitation.mockResolvedValue(INVITATION)
  organization.acceptInvitation.mockImplementation(never)
  organization.declineInvitation.mockImplementation(never)
  billing.cancel.mockImplementation(never)
}

// ── How to bring each component into each state ────────────────────────────

interface Arrangement {
  /** Set the world before mounting. */
  before?: () => void
  /** Drive the mounted component on: a click on an action that never settles, a step taken. */
  after?: (wrapper: VueWrapper) => Promise<void>
  /** Make the busy button pressable first: a box ticked, a field filled. */
  prepare?: (wrapper: VueWrapper) => Promise<void>
  /** What this state shows: a selector, or `null` when the component renders nothing at all. */
  shows: string | null
  /** What this state must not show: the controls a refused caller may not use. */
  absent?: string[]
  /**
   * The button pressed into this pending state: it is focused before the
   * press, and must keep focus, be `aria-disabled` and say something new.
   */
  busy?: string
}

interface Staging {
  props?: Record<string, unknown>
  /** Slots it always needs: the words of a link, the content a boundary guards. */
  slots?: Record<string, (props: Record<string, unknown>) => unknown>
  states: Partial<Record<ContractState, Arrangement>>
}

const click = (selector: string) => async (wrapper: VueWrapper) => {
  await wrapper.find(selector).trigger('click')
  await nextTick()
}
const marker = (name: string) => () => h('i', { 'data-slot': name })
/** The app's own content in a shell slot: it carries the shell's hook, as the app's markup around it does not need to. */
const shellMarker = (name: string) => () => h('i', { 'data-slot': name, 'data-shell': 'slot' })
/** Skip the first run's steps the way a person does: Skip this step, `count` times. */
const skipSteps = (count: number) => async (wrapper: VueWrapper) => {
  for (let step = 0; step < count; step++) {
    await wrapper.find('[data-onboarding="skip"]').trigger('click')
    await flushPromises()
  }
}
/** The checklist with every task done, which it congratulates once. */
const finished = () => ({ ...ACTIVATION, tasks: ACTIVATION.tasks.map(task => ({ ...task, done: true, doneAt: 1 })), done: 3, progress: 1, isComplete: true })
const subscribed = (fields: Record<string, unknown> = {}) => {
  world.subscription.value = { id: 'sub_1', status: 'active', productId: 'prod_pro', currentPeriodEnd: '2026-09-01T00:00:00.000Z', ...fields }
}
// What a plan grants, in neutral words: two with the same kind tell apart by their names.
const BENEFITS = [
  { id: 'grant_1', benefitId: 'ben_1', type: 'license_keys', kind: 'license_key', name: 'Desktop license', licenseKey: '****-0A1B2C' },
  { id: 'grant_2', benefitId: 'ben_2', type: 'downloadables', kind: 'download', name: 'Templates', files: 3 },
  { id: 'grant_3', benefitId: 'ben_3', type: 'feature_flag', kind: 'feature' },
]

const STAGING: Record<ContractedComponent, Staging> = {
  AuthForm: {
    states: {
      'ready': { shows: '[data-auth="step-choose"]' },
      'request-code': { before: () => (world.loginStep.value = 'request-code'), shows: '[data-auth="step-request-code"]' },
      'verify-code': { before: () => (world.loginStep.value = 'verify-code'), shows: '[data-auth="step-verify-code"] [role="status"]' },
      'passkey-offer': { before: () => (world.loginStep.value = 'passkey-offer'), shows: '[data-auth="step-add-passkey"] [role="status"]' },
      'recover': { before: () => (world.loginStep.value = 'recover'), shows: '[data-auth="step-recover"] [data-auth="input-recovery-code"]' },
      'waitlisted': { before: () => (world.loginStep.value = 'waitlisted'), shows: '[data-auth="step-waitlisted"] [role="status"]' },
      'invite-code': { before: () => (world.loginStep.value = 'invite-code'), shows: '[data-auth="step-invite-code"] [data-auth="input-invite-code"]' },
      'age': { before: () => (world.loginStep.value = 'age'), shows: '[data-auth="step-age"] [data-auth="input-age"]' },
      'undeliverable': { before: () => (world.loginStep.value = 'undeliverable'), shows: '[data-auth="step-undeliverable"] [role="alert"]' },
      'pending': { before: () => (world.loginStep.value = 'passkey-offer'), busy: '[data-auth="passkey-add"]', shows: '[data-auth="form"][aria-busy="true"]' },
      'error': { before: () => (world.loginError.value = failure('rate_limited')), shows: '[data-auth="error"]' },
    },
  },
  WaitlistForm: {
    states: {
      'ready': { shows: '[data-waitlist="join"] [data-waitlist="label-news"] [data-waitlist="input-news"]' },
      'verify-code': { before: () => (world.waitlistStep.value = 'verify'), shows: '[data-waitlist="verify"] [data-waitlist="sent-note"][role="status"]' },
      'waitlisted': {
        before: () => {
          world.waitlistStep.value = 'status'
          world.waitlistPlace.value = { status: 'waiting', position: 48, total: 1204, friends: 0, cap: 10, shareCode: 'ABCD2345', launchNews: false }
        },
        shows: '[data-waitlist="place"] [data-waitlist="position"][role="status"]',
      },
      'pending': { busy: '[data-waitlist="submit"]', shows: '[data-waitlist="root"][aria-busy="true"]' },
      'error': { before: () => (world.waitlistError.value = failure('rate_limited')), shows: '[data-waitlist="error"]' },
    },
  },
  ProfileSettings: {
    states: {
      'ready': { shows: '[data-profile="section-email"]' },
      'confirm-current': { before: () => (world.emailStep.value = 'confirm-current'), shows: '[data-profile="input-code"]' },
      'pending': { busy: '[data-profile="save"]', shows: '[data-profile="root"][aria-busy="true"]' },
      'error': {
        after: async () => {
          world.emailError.value = { code: 'invalid_input', data: { field: 'email' }, message: '' }
          await nextTick()
        },
        shows: '[data-profile="message"]',
      },
    },
  },
  SecuritySettings: {
    props: { confirm: () => true },
    states: {
      ready: { shows: '[data-security="session"]' },
      loading: { before: () => (world.sessionsLoading.value = true), shows: '[data-security="sessions-loading"][role="status"]' },
      pending: { busy: '[data-security="revoke"]', shows: '[data-security="root"][aria-busy="true"]' },
      error: {
        before: () => {
          world.sessionsList.value = undefined
          world.sessionsError.value = failure()
        },
        shows: '[data-security="sessions-error"]',
      },
    },
  },
  AcceptInvitation: {
    props: { invitationId: 'inv_1' },
    states: {
      loading: { before: () => organization.getInvitation.mockImplementation(never), shows: '[data-invitation="loading"] [role="status"]' },
      ready: { shows: '[data-invitation="ready"]' },
      pending: { busy: '[data-invitation="accept"]', shows: '[data-invitation="ready"][aria-busy="true"]' },
      accepted: { before: () => organization.acceptInvitation.mockResolvedValue(undefined), after: click('[data-invitation="accept"]'), shows: '[data-invitation="accepted"] [role="status"]' },
      declined: { before: () => organization.declineInvitation.mockResolvedValue(undefined), after: click('[data-invitation="decline"]'), shows: '[data-invitation="declined"] [role="status"]' },
      missing: { before: () => organization.getInvitation.mockResolvedValue(null), shows: '[data-invitation="missing"] [role="alert"]' },
      error: { before: () => organization.getInvitation.mockRejectedValue(failure()), shows: '[data-invitation="error"]' },
    },
  },
  PricingTable: {
    props: { title: 'Plans' },
    states: {
      'loading': { before: () => (world.plans.value = undefined), shows: '[data-pricing="loading"]' },
      'empty': {
        before: () => {
          world.plans.value = []
          config.billing.contact = undefined as never
        },
        shows: '[data-pricing="empty"]',
      },
      'ready': { shows: '[data-pricing="plan"] [data-intent="subscribe"]' },
      // The switch to yearly prices, from the keyboard's radio group.
      'yearly': {
        after: async (wrapper) => {
          await wrapper.find('input[type="radio"][value="year"]').setValue(true)
          await nextTick()
        },
        shows: '[data-pricing="plan"][data-interval="year"] [data-pricing="plan-savings"]',
      },
      // A catalog priced in two currencies: the switch, a select named by its label.
      'currencies': { before: () => (world.currencies.value = ['usd', 'eur']), shows: '[data-pricing="currency"] select[data-pricing="currency-select"]' },
      // A promotion on Pro's monthly price and the big pack: its terms and its real end, no countdown.
      'promotion': {
        before: () => {
          world.promotion.value = { key: 'launch', name: 'Launch offer', percentOff: 20, duration: 'repeating', months: 3, endsAt: '2099-01-31T23:59:59.000Z' }
          world.plans.value = PLANS.map(plan => plan.key === 'pro' ? { ...plan, prices: { ...plan.prices, month: { ...plan.prices.month!, promotion: { amount: 720, off: 180 } } } } : plan)
          world.packs.value = PACKS.map(pack => pack.key === 'credits500' ? { ...pack, promotion: { amount: 1600, off: 400 } } : pack)
        },
        shows: '[data-pricing="plan"][data-promotion] [data-pricing="plan-promotion"] [data-pricing="promotion-ends"]',
      },
      'pending': { before: subscribed, busy: '[data-intent="downgrade"]', shows: '[data-pricing="table"][aria-busy="true"]' },
      // Cancelling the current plan opens one group before anything is sent.
      'confirm-cancel': {
        before: subscribed,
        after: click('[data-intent="cancel"]'),
        shows: '[data-pricing="cancel-confirm"][role="group"]',
      },
      'error': {
        before: () => {
          world.plans.value = undefined
          world.pricingError.value = failure()
        },
        shows: '[data-pricing="error"]',
      },
      'refused': { before: () => (world.canManage.value = false), shows: '[data-pricing="managed"]', absent: ['[data-pricing="plan-action"]', '[data-pricing="pack-action"]', '[data-pricing="portal"]'] },
    },
  },
  BillingCheckoutLink: {
    props: { productIds: ['prod_pro'] },
    slots: { default: ({ pending }) => (pending ? 'Opening checkout…' : 'Upgrade') },
    states: {
      ready: { shows: 'a[data-billing="checkout-link"]' },
      pending: { busy: 'a', shows: 'a[aria-busy="true"]' },
      refused: { before: () => (world.canManage.value = false), shows: null },
    },
  },
  BillingPortalLink: {
    slots: { default: ({ pending }) => (pending ? 'Opening the portal…' : 'Manage billing') },
    states: {
      ready: { shows: 'a[data-billing="portal-link"]' },
      pending: { busy: 'a', shows: 'a[aria-busy="true"]' },
      refused: { before: () => (world.canManage.value = false), shows: null },
    },
  },
  BillingHistory: {
    states: {
      loading: {
        before: () => {
          world.orders.value = undefined
          world.ordersLoading.value = true
        },
        shows: '[data-history="loading"]',
      },
      empty: { before: () => (world.orders.value = []), shows: '[data-history="empty"]' },
      ready: { shows: '[data-history="invoice"]' },
      pending: { busy: '[data-history="invoice"]', shows: '[data-history="root"][aria-busy="true"]' },
      error: {
        before: () => {
          world.orders.value = undefined
          world.ordersError.value = failure()
        },
        shows: '[data-history="error"]',
      },
    },
  },
  UsageHistory: {
    states: {
      loading: {
        before: () => {
          world.events.value = undefined
          world.eventsLoading.value = true
        },
        shows: '[data-usage="loading"]',
      },
      empty: { before: () => (world.events.value = []), shows: '[data-usage="empty"]' },
      ready: { shows: '[data-usage="event"]' },
      pending: { busy: '[data-usage="older"]', shows: '[data-usage="root"][aria-busy="true"]' },
      error: {
        before: () => {
          world.events.value = undefined
          world.eventsError.value = failure()
        },
        shows: '[data-usage="error"]',
      },
    },
  },
  ConsentPrompt: {
    states: {
      ready: { shows: '[data-consent="dialog"][open] [data-consent="checkbox"]' },
      age: {
        before: () => {
          world.consentAsks.value = []
          world.consentMissing.value = ['age']
        },
        shows: '[data-consent="dialog"] [data-consent="age-input"]',
      },
      storage: {
        before: () => {
          world.consentAsks.value = []
          world.consentMissing.value = []
          world.consentStorage.value = { preferences: false, analytics: false }
          world.consentAsking.value = true
        },
        shows: '[data-consent="storage"] [data-consent="allow"]',
      },
      pending: {
        // The required box ticked, Accept starts the save, which never settles here.
        prepare: async (wrapper) => {
          await wrapper.find('[data-consent="checkbox"]').setValue(true)
        },
        busy: '[data-consent="submit"]',
        shows: '[data-consent="dialog"][aria-busy="true"]',
      },
      error: { before: () => (world.consentError.value = failure('rate_limited')), shows: '[data-consent="error"][role="alert"]' },
    },
  },
  UploadField: {
    props: { claim: claimFile },
    states: {
      ready: { shows: '[data-upload="field"][data-state="ready"] [data-upload="choose"]' },
      // The file on its way to storage: its progress and the way to cancel.
      uploading: { after: chooseFile, shows: '[data-upload="field"][data-state="uploading"][aria-busy="true"] [data-upload="cancel"]' },
      // Uploaded; the app's claim checks it.
      claiming: { before: () => (world.uploadOutcome.value = 'ok'), after: chooseFile, shows: '[data-upload="field"][data-state="claiming"]' },
      done: {
        before: () => {
          world.uploadOutcome.value = 'ok'
          world.claimOutcome.value = 'ok'
        },
        after: chooseFile,
        shows: '[data-upload="field"][data-state="done"]',
      },
      // The claim refused the file: an alert says why.
      refused: {
        before: () => {
          world.uploadOutcome.value = 'ok'
          world.claimOutcome.value = 'refuse'
        },
        after: chooseFile,
        shows: '[data-upload="field"][data-state="refused"] [data-upload="error"][role="alert"]',
      },
      error: { before: () => (world.uploadOutcome.value = 'fail'), after: chooseFile, shows: '[data-upload="field"][data-state="error"] [data-upload="error"]' },
    },
  },
  NotificationInbox: {
    states: {
      ready: { shows: '[data-notifications="root"][data-state="ready"] [data-notifications="item"][data-state="unread"] [data-notifications="title"]' },
      loading: {
        before: () => {
          world.notifications.value = []
          world.notificationsLoading.value = true
        },
        shows: '[data-notifications="loading"]',
      },
      empty: { before: () => (world.notifications.value = []), shows: '[data-notifications="empty"]' },
      error: {
        before: () => {
          world.notifications.value = []
          world.notificationsError.value = failure()
        },
        shows: '[data-notifications="error"]',
      },
      pending: {
        busy: '[data-notifications="mark-all"]',
        shows: '[data-notifications="root"][aria-busy="true"]',
      },
      // A visitor with no account has no inbox: nothing to press.
      refused: { before: () => (world.authed.value = false), shows: null },
    },
  },
  ContactForm: {
    states: {
      ready: { shows: '[data-contact="form"][data-state="ready"] [data-contact="submit"]' },
      // The message is on its way: the button says so and keeps focus.
      pending: { prepare: fillContact, busy: '[data-contact="submit"]', shows: '[data-contact="form"][data-state="pending"][aria-busy="true"]' },
      sent: { before: () => (world.contactOutcome.value = 'ok'), after: sendContact, shows: '[data-contact="root"][data-state="sent"] [data-contact="done"] [data-contact="another"]' },
      // The deployment said no (a limit, the bot check, a field): an alert says what to do.
      refused: { before: () => (world.contactOutcome.value = 'refuse'), after: sendContact, shows: '[data-contact="root"][data-state="refused"] [data-contact="error"][role="alert"]' },
      error: { before: () => (world.contactOutcome.value = 'fail'), after: sendContact, shows: '[data-contact="root"][data-state="error"] [data-contact="error"][role="alert"]' },
    },
  },
  AppShell: {
    slots: { brand: shellMarker('brand'), nav: shellMarker('nav'), actions: shellMarker('actions'), default: shellMarker('default') },
    states: {
      ready: { shows: '[data-shell="header"] [data-shell="switcher"] ~ [data-shell="account"] [data-shell="account-button"]' },
      // The session is still read: the shell says so in a polite status and is busy.
      loading: {
        before: () => {
          world.authed.value = false
          world.authLoading.value = true
        },
        shows: '[data-shell="root"][aria-busy="true"] > [data-shell="status"]',
        absent: ['[data-shell="account"]', '[data-shell="sign-in"]'],
      },
      // Signed out: the brand, the links and a way in; nothing of an account's.
      refused: { before: () => (world.authed.value = false), shows: '[data-shell="header"] [data-shell="sign-in"]', absent: ['[data-shell="account"]', '[data-shell="switcher"]'] },
    },
  },
  OnboardingFlow: {
    slots: {},
    states: {
      ready: { shows: '[data-onboarding="steps"] [aria-current="step"] ~ [data-onboarding="step-name"] + [data-onboarding="step-name"] + [data-onboarding="step-name"]', absent: ['[data-onboarding="back"]'] },
      workspace: { after: skipSteps(1), shows: '[data-onboarding="step"][data-step="workspace"] [data-onboarding="input-workspace"]' },
      teammates: { after: skipSteps(2), shows: '[data-onboarding="step"][data-step="teammates"] [data-onboarding="input-email"]' },
      plan: { after: skipSteps(3), shows: '[data-onboarding="step"][data-step="plan"] [data-pricing="plan"]' },
      // Skipping the setup waits on the deployment: the button says so and keeps focus.
      pending: { busy: '[data-onboarding="skip-all"]', shows: '[data-onboarding="root"][data-state="pending"][aria-busy="true"]' },
      done: { before: () => (world.onboardingOutcome.value = 'ok'), after: click('[data-onboarding="skip-all"]'), shows: '[data-onboarding="root"][data-state="done"] [data-onboarding="finished"]' },
      error: { before: () => (world.onboardingOutcome.value = 'fail'), after: click('[data-onboarding="skip-all"]'), shows: '[data-onboarding="error"][role="alert"]' },
    },
  },
  ActivationChecklist: {
    states: {
      ready: { shows: '[data-activation="task"][data-state="done"] ~ [data-activation="task"][data-state="open"] [data-activation="link"]' },
      loading: {
        before: () => {
          world.activation.value = undefined
          world.activationLoading.value = true
        },
        shows: '[data-activation="wrapper"][aria-busy="true"] [data-activation="status"]',
      },
      // An app with no checklist: nothing to show, and the live region alone.
      empty: { before: () => (world.activation.value = { ...ACTIVATION, tasks: [], done: 0, total: 0, progress: 0 }), shows: '[data-activation="status"]', absent: ['[data-activation="root"]'] },
      pending: { busy: '[data-activation="dismiss"]', shows: '[data-activation="wrapper"][aria-busy="true"]' },
      done: {
        before: () => {
          world.activation.value = finished()
          world.activationOutcome.value = 'ok'
        },
        shows: '[data-activation="congratulations"]',
      },
      // An administrator looking at the account: the progress, and no way to dismiss it.
      refused: { before: () => (world.activation.value = { ...ACTIVATION, readOnly: true }), shows: '[data-activation="read-only"]', absent: ['[data-activation="dismiss"]'] },
    },
  },
  HowDidYouHear: {
    states: {
      ready: { shows: '[data-source="root"][data-state="open"] [data-source="question"] [data-source="choice"]' },
      loading: { before: () => (world.sourceLoading.value = true), shows: '[data-source="root"][aria-busy="true"] [data-source="status"]', absent: ['[data-source="submit"]'] },
      pending: { busy: '[data-source="submit"]', shows: '[data-source="root"][aria-busy="true"]' },
      error: { before: () => (world.sourceOutcome.value = 'fail'), after: click('[data-source="submit"]'), shows: '[data-source="error"][role="alert"]' },
      done: { before: () => (world.sourceOutcome.value = 'ok'), after: click('[data-source="submit"]'), shows: '[data-source="root"][data-state="done"] [data-source="status"]', absent: ['[data-source="submit"]'] },
      // Answered or skipped before: nobody is asked twice.
      answered: { before: () => (world.sourceAnswered.value = true), shows: '[data-source="root"][data-state="answered"] [data-source="status"]', absent: ['[data-source="submit"]', '[data-source="skip"]'] },
      // Signed out: there is nobody to ask, and nothing renders.
      refused: { before: () => (world.sourceSignedOut.value = true), shows: null },
    },
  },
  AccountData: {
    states: {
      ready: {
        before: () => (world.accountExport.value = { url: 'https://files.example.com/export.json', createdAt: 0, expiresAt: 3_600_000 }),
        shows: '[data-account="export-link"]',
      },
      loading: { before: () => (world.accountLoading.value = true), shows: '[data-account="root"][aria-busy="true"]' },
      pending: { busy: '[data-account="export"]', shows: '[data-account="root"][aria-busy="true"]' },
      error: {
        before: () => (world.exportFails.value = true),
        after: click('[data-account="export"]'),
        shows: '[data-account="error"]',
      },
      // A deletion waits out its grace period: its date and the way to keep the account.
      scheduled: { before: () => (world.deletion.value = { requestedAt: 0, deletesAt: 2_592_000_000 }), shows: '[data-account="section-delete"][data-state="scheduled"] [data-account="keep"]', absent: ['[data-account="confirm-input"]'] },
      // An administrator acting as the account: neither control is theirs.
      refused: { before: () => (world.impersonating.value = true), shows: '[data-account="refused"]', absent: ['[data-account="export"]', '[data-account="delete"]', '[data-account="confirm-input"]'] },
    },
  },
  AuditLog: {
    states: {
      loading: {
        before: () => {
          world.activity.value = undefined
          world.activityLoading.value = true
        },
        shows: '[data-audit="loading"]',
      },
      empty: { before: () => (world.activity.value = []), shows: '[data-audit="empty"]' },
      ready: { shows: '[data-audit="event"] time' },
      pending: { busy: '[data-audit="older"]', shows: '[data-audit="root"][aria-busy="true"]' },
      error: {
        before: () => {
          world.activity.value = undefined
          world.activityError.value = failure()
        },
        shows: '[data-audit="error"]',
      },
      // A member reading the workspace's activity, which is its managers' alone: nothing renders.
      refused: { before: () => (world.activityRefused.value = true), shows: null },
    },
  },
  AdminUsers: {
    props: { confirm: () => true },
    states: {
      loading: {
        before: () => {
          world.adminUsers.value = undefined
          world.adminLoading.value = true
        },
        shows: '[data-admin="loading"]',
      },
      empty: { before: () => (world.adminUsers.value = []), shows: '[data-admin="empty"]' },
      ready: { shows: '[data-admin="view"]' },
      pending: { busy: '[data-admin="older"]', shows: '[data-admin][aria-busy="true"]' },
      error: {
        before: () => {
          world.adminUsers.value = undefined
          world.adminError.value = failure()
        },
        shows: '[data-admin="error"]',
      },
      // Someone who is no administrator: nothing renders.
      refused: { before: () => (world.adminRefused.value = true), shows: null },
    },
  },
  AdminWorkspaces: {
    states: {
      loading: {
        before: () => {
          world.adminWorkspaces.value = undefined
          world.adminLoading.value = true
        },
        shows: '[data-admin="loading"]',
      },
      empty: { before: () => (world.adminWorkspaces.value = []), shows: '[data-admin="empty"]' },
      ready: { shows: '[data-admin="view"]' },
      pending: { busy: '[data-admin="older"]', shows: '[data-admin][aria-busy="true"]' },
      error: {
        before: () => {
          world.adminWorkspaces.value = undefined
          world.adminError.value = failure()
        },
        shows: '[data-admin="error"]',
      },
      // Someone who is no administrator: nothing renders.
      refused: { before: () => (world.adminRefused.value = true), shows: null },
    },
  },
  CancelFlow: {
    states: {
      ready: { shows: '[data-cancel-flow="reasons"] [data-cancel-flow="reason-input"]' },
      pending: { busy: '[data-cancel-flow="continue"]', shows: '[data-cancel-flow="root"][aria-busy="true"]' },
      offered: {
        before: () => billing.cancel.mockImplementation(async () => ({ offer: { id: 'offer_1', reason: 'too_expensive', kind: 'discount', discount: 'stay30', name: 'Stay', percentOff: 30, duration: 'repeating', months: 3 } }) as never),
        after: click('[data-cancel-flow="continue"]'),
        shows: '[data-cancel-flow="offer-terms"][role="status"]',
      },
      done: {
        before: () => billing.cancel.mockImplementation(async () => ({ canceled: true, endsAt: Date.UTC(2026, 8, 1) }) as never),
        after: click('[data-cancel-flow="cancel"]'),
        shows: '[data-cancel-flow="ends"][role="status"]',
      },
      error: {
        before: () => billing.cancel.mockImplementation(() => Promise.reject(Object.assign(new Error('refused'), failure('unavailable')))),
        after: click('[data-cancel-flow="continue"]'),
        shows: '[data-cancel-flow="error"][role="alert"]',
      },
    },
  },
  ReferralCard: {
    states: {
      ready: { shows: '[data-referral="link"][readonly]' },
      loading: { before: () => (world.referral.value = 'loading'), shows: '[data-referral="root"][aria-busy="true"] [data-referral="loading"][role="status"]' },
      error: { before: () => (world.referral.value = 'error'), shows: '[data-referral="error"][role="alert"]' },
      // A signed-out visitor has no link: nothing renders.
      refused: { before: () => (world.authed.value = false), shows: null },
    },
  },
  WithdrawalButton: {
    states: {
      // Outside the withdrawal period, or with it off: nothing renders.
      refused: { shows: null },
    },
  },
  UpgradePrompt: {
    props: { feature: 'reports' },
    states: {
      loading: { before: () => (world.plans.value = undefined), shows: '[data-upgrade="root"][aria-busy="true"] [data-upgrade="message"][role="status"]' },
      ready: { shows: '[data-upgrade="action"][href="/pricing?plan=pro"]' },
      refused: { before: () => (world.canManage.value = false), shows: '[data-upgrade="note"]', absent: ['[data-upgrade="action"]'] },
    },
  },
  WorkspaceSettings: {
    states: {
      'ready': {
        before: () => {
          subscribed()
          world.benefits.value = BENEFITS
        },
        shows: '[data-settings="workspace"][aria-current="true"]',
      },
      'trialing': { before: () => subscribed({ status: 'trialing', trialEnd: '2026-09-01T00:00:00.000Z' }), shows: '[data-settings="plan-status"][data-state="trialing"]' },
      'past-due': { before: () => subscribed({ status: 'past_due' }), busy: '[data-settings="portal"]', shows: '[data-settings="plan-status"][data-state="past_due"]' },
      'paused': { before: () => subscribed({ status: 'paused', resumesAt: '2026-10-01T00:00:00.000Z' }), busy: '[data-settings="resume"]', shows: '[data-settings="plan-status"][data-state="paused"]', absent: ['[data-settings="cancel"]'] },
      'canceling': { before: () => subscribed({ cancelAtPeriodEnd: true }), busy: '[data-settings="uncancel"]', shows: '[data-settings="plan-status"][data-state="canceling"]', absent: ['[data-settings="cancel"]'] },
      'changing': {
        before: () => {
          subscribed()
          world.pendingChange.value = { productId: 'prod_starter', appliesAt: new Date('2026-09-01T00:00:00.000Z') }
        },
        busy: '[data-settings="cancel-change"]',
        shows: '[data-settings="plan-status"][data-state="changing"]',
      },
      'confirm-cancel': {
        before: () => subscribed(),
        after: click('[data-settings="cancel"]'),
        shows: '[data-settings="cancel-confirm"][role="group"]',
      },
      'loading': {
        before: () => {
          world.subscription.value = undefined
          world.balance.value = undefined
        },
        shows: '[data-settings="section-credits"][aria-busy="true"]',
      },
      'pending': { busy: '[data-settings="switch"]', shows: '[data-settings="root"][aria-busy="true"]' },
      'error': {
        before: () => {
          world.subscription.value = undefined
          world.billingError.value = failure()
        },
        shows: '[data-settings="plan-error"]',
      },
      'refused': {
        before: () => {
          subscribed()
          world.canManage.value = false
        },
        shows: '[data-settings="section-billing"] [data-settings="managed"]',
        absent: ['[data-settings="cancel"]', '[data-settings="portal"]', '[data-settings="topup-pack"]'],
      },
    },
  },
  BackendNotices: {
    states: {
      // No notice applies: the region alone.
      empty: { shows: '[data-notices="region"]', absent: ['[data-impersonation="banner"]', '[data-maintenance="banner"]', '[data-past-due="banner"]', '[data-deletion="notice"]', '[data-credits="banner"]', '[data-gift="banner"]', '[data-announcement="banner"]'] },
      // Every notice at once, the visit first and the announcements last: an administrator's visit, the maintenance switch, a failed renewal, a scheduled deletion, low credits, gifts and an announcement.
      ready: {
        before: () => {
          world.impersonating.value = true
          world.maintenance.value = { message: 'Back at noon.' }
          subscribed({ status: 'past_due' })
          world.deletion.value = { requestedAt: 0, deletesAt: 2_592_000_000 }
          world.balance.value = 3
          world.gifts.value = GIFTS
          world.announcements.value = [{ id: 'a1', message: 'Boards are here.', expiresAt: Date.now() + 3_600_000, publishedAt: 0, link: { url: '/boards' } }]
        },
        shows: '[data-notices="region"] [data-gift="region"] ~ [data-announcement="region"]',
      },
    },
  },
  Gate: {
    props: { quota: 'projects' },
    slots: { default: marker('default') },
    states: {
      loading: { before: () => (world.featuresLoading.value = true), shows: '[data-quota="loading"][role="status"][aria-busy="true"]' },
      ready: { shows: '[data-slot="default"]' },
      refused: { before: () => (world.granted.value = false), shows: '[data-quota="root"] [data-quota="message"][role="status"] + [data-quota="action"][href="/pricing?plan=pro"]' },
      error: { before: () => (world.featuresError.value = failure()), shows: '[data-quota="error"][role="alert"]' },
    },
  },
  AccessDenied: {
    // The page guard's 403 for a workspace role: every way on is offered.
    props: { error: { status: 403, data: { reason: 'workspace', path: '/team/admin' } } },
    states: {
      ready: { shows: '[data-access="root"] [data-access="switch-workspace"]' },
      pending: { busy: '[data-access="switch-account"]', shows: '[data-access="root"][aria-busy="true"]' },
      error: {
        before: () => auth.signOut.mockRejectedValueOnce(failure()),
        after: click('[data-access="switch-account"]'),
        shows: '[data-access="error"]',
      },
    },
  },
  ReauthenticateDialog: {
    states: {
      // Nothing on the page until a sensitive action asks.
      'empty': { shows: null },
      'ready': { before: () => (world.reauthRequired.value = true), shows: '[data-reauthenticate="dialog"][aria-labelledby] [data-reauthenticate="step-choose"]' },
      'verify-code': {
        before: () => {
          world.reauthRequired.value = true
          world.reauthStep.value = 'verify-code'
        },
        shows: '[data-reauthenticate="step-verify-code"] [data-reauthenticate="sent-note"][role="status"]',
      },
      // A browser without WebAuthn (this one) is offered the code alone.
      'pending': { before: () => (world.reauthRequired.value = true), busy: '[data-reauthenticate="send-code"]', shows: '[data-reauthenticate="dialog"][aria-busy="true"]', absent: ['[data-reauthenticate="passkey"]'] },
      'error': {
        before: () => {
          world.reauthRequired.value = true
          world.reauthError.value = { code: 'forbidden', data: { reason: 'other_account' }, message: 'That sign-in belongs to another account.' }
        },
        shows: '[data-reauthenticate="error"]',
      },
    },
  },
  AiLabel: {
    states: {
      ready: { shows: '[data-ai-label="root"][data-state="label"] [data-ai-label="text"]', absent: ['[data-ai-label="trigger"]'] },
      done: {
        prepare: async (wrapper) => {
          await wrapper.setProps({ provenance: { models: ['google/gemini-3.1-flash-image-preview'], finishedAt: Date.UTC(2026, 9, 25), inputs: ['strip_1'] }, src: 'https://example.com/panel-1.png' })
        },
        shows: '[data-ai-label="root"][data-state="details"] [data-ai-label="details"][role="dialog"] [data-ai-label="verify"]',
      },
    },
  },
  ConnectionStatus: {
    states: {
      empty: { shows: '[data-connection="status"][role="status"]', absent: ['[data-connection="message"]'] },
      ready: {
        before: () => {
          world.online.value = false
          world.socket.value = { isWebSocketConnected: false, hasEverConnected: true, connectionRetries: 2, inflightMutations: 2 }
        },
        shows: '[data-connection="status"][role="status"] [data-connection="message"]',
      },
    },
  },
}

// ── The checks ─────────────────────────────────────────────────────────────

/** A button pressed into its pending state: the element, what it said before, and the actions a second press of it started. */
interface Pressed {
  element: HTMLElement
  text: string
  again: string[]
}

/** Mount a component in one state, with the slots given on top of the ones it always needs. */
async function render(name: ContractedComponent, state: ContractState, slots: Staging['slots'] = {}): Promise<{ wrapper: VueWrapper, pressed?: Pressed }> {
  const staging = STAGING[name]
  const arrangement = staging.states[state]!
  reset()
  arrangement.before?.()
  const wrapper = mount(COMPONENTS[name], { props: staging.props, slots: { ...staging.slots, ...slots } as never, attachTo: document.body })
  await flushPromises()
  await arrangement.prepare?.(wrapper)
  // A person presses the busy button: it has focus as they do.
  const button = arrangement.busy ? wrapper.find<HTMLElement>(arrangement.busy) : undefined
  const pressed: Pressed | undefined = button?.exists() ? { element: button.element, text: button.text(), again: [] } : undefined
  if (button?.exists()) {
    button.element.focus()
    await button.trigger('click')
  }
  await arrangement.after?.(wrapper)
  await flushPromises()
  if (pressed) {
    // The person presses again while it is busy: nothing new starts.
    const calls = new Map(ACTIONS.map(([, mock]) => [mock, mock.mock.calls.length]))
    pressed.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await flushPromises()
    pressed.again = ACTIONS.filter(([, mock]) => mock.mock.calls.length !== calls.get(mock)).map(([action]) => action)
  }
  return { wrapper, pressed }
}

/** What a button pressed into its pending state must still be: focused, `aria-disabled`, saying something new, deaf to a second press. */
function busyViolations(pressed: Pressed | undefined, busy: string | undefined): string[] {
  if (!busy) return []
  if (!pressed) return [`no ${busy} to press`]
  const found: string[] = []
  if (document.activeElement !== pressed.element) found.push(`${busy} lost focus while busy`)
  if (pressed.element.getAttribute('aria-disabled') !== 'true') found.push(`${busy} is not aria-disabled while busy`)
  if (pressed.element.hasAttribute('disabled')) found.push(`${busy} is disabled while busy, which drops focus`)
  if (pressed.element.textContent?.trim() === pressed.text.trim()) found.push(`${busy} still says "${pressed.text}" while busy`)
  if (pressed.again.length) found.push(`a second press of ${busy} while busy started ${pressed.again.join(', ')}`)
  return found
}

/** The root elements a wrapper rendered: none when it rendered nothing. */
const roots = (wrapper: VueWrapper): Element[] => {
  const node = wrapper.element as Node
  return node.nodeType === Node.ELEMENT_NODE ? [node as Element] : []
}

/** Text a person sees in an element: everything but what is hidden from assistive technology. */
function visibleText(element: Element): string {
  const copy = element.cloneNode(true) as Element
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove()
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** An accessible name, as far as the packaged markup needs: labelledby, aria-label, a wrapping label, the content. */
function accessibleName(element: Element): string {
  const labelledBy = element.getAttribute('aria-labelledby')
  if (labelledBy) return labelledBy.split(/\s+/).map(id => visibleText(element.ownerDocument.getElementById(id)!)).join(' ')
  const label = element.getAttribute('aria-label')
  if (label) return label.trim()
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)) {
    const wrapping = element.closest('label')
    return wrapping ? visibleText(wrapping) : ''
  }
  return visibleText(element)
}

const CONTROLS = 'button, a[href], input:not([type="hidden"]), select, textarea'
/** Text-level elements inside a hooked element, which carry no hook of their own. */
const PHRASING = new Set(['STRONG', 'EM', 'CODE', 'B', 'I'])
const WORD = /\p{L}/u

/** Every way the rendered markup breaks the contract, as readable lines. */
function violations(name: ContractedComponent, wrapper: VueWrapper): string[] {
  const { family } = COMPONENT_CONTRACT[name] as { family: string | null }
  const found: string[] = []
  const elements = roots(wrapper).flatMap(root => [root, ...root.querySelectorAll('*')])
  if (family) {
    for (const element of elements) {
      // A contracted component inside this one (the notices, the connection status, the consent dialog, the pricing table) is held to its own row.
      if (PHRASING.has(element.tagName) || element.hasAttribute(`data-${family}`) || element.closest('[data-notices], [data-connection], [data-consent], [data-pricing]')) continue
      found.push(`<${element.tagName.toLowerCase()}> without data-${family}: ${element.outerHTML.slice(0, 120)}`)
    }
  }
  const named = new Map<string, Element>()
  /** What tells a control apart from another of the same name: its named group, and its description. */
  const context = (control: Element): string => {
    const group = control.parentElement?.closest('[aria-labelledby]')
    const described = control.getAttribute('aria-describedby')?.split(/\s+/).map(id => visibleText(control.ownerDocument.getElementById(id) ?? control.ownerDocument.createElement('i'))).join(' ') ?? ''
    return `${group ? accessibleName(group) : ''}|${described}`
  }
  for (const control of elements.filter(element => element.matches(CONTROLS))) {
    const accessible = accessibleName(control)
    const tag = `<${control.tagName.toLowerCase()} ${[...control.attributes].filter(a => a.name.startsWith('data-')).map(a => `${a.name}="${a.value}"`).join(' ')}>`
    if (!WORD.test(accessible)) found.push(`${tag} has no name in words: "${accessible}"`)
    const shown = visibleText(control)
    if (control.hasAttribute('aria-label') && WORD.test(shown) && !accessible.toLowerCase().startsWith(shown.toLowerCase())) {
      found.push(`${tag} is named "${accessible}", which does not start with what it shows: "${shown}"`)
    }
    if (control.tagName === 'BUTTON' && !control.hasAttribute('type')) found.push(`${tag} has no type`)
    const key = `${accessible}|${context(control)}`
    const clash = named.get(key)
    const sameLink = clash?.tagName === 'A' && control.tagName === 'A' && clash.getAttribute('href') === control.getAttribute('href')
    if (clash && !sameLink && !control.hasAttribute('disabled') && !clash.hasAttribute('disabled')) {
      found.push(`${tag} shares its name "${accessible}" with another control, in the same group and with the same description`)
    }
    named.set(key, control)
  }
  for (const element of elements.filter(element => element.hasAttribute('aria-describedby'))) {
    for (const id of element.getAttribute('aria-describedby')!.split(/\s+/)) {
      if (!element.ownerDocument.getElementById(id)) found.push(`aria-describedby names a missing element: #${id}`)
    }
  }
  return found
}

/** What every component with markup of its own must show in a core state. */
function roleViolations(name: ContractedComponent, state: ContractState, wrapper: VueWrapper): string[] {
  if (!COMPONENT_CONTRACT[name].family) return []
  const all = (selector: string) => roots(wrapper).flatMap(root => [root, ...root.querySelectorAll('*')].filter(element => element.matches(selector)))
  const has = (selector: string) => all(selector).length > 0
  const rendered = roots(wrapper).length > 0
  const family = COMPONENT_CONTRACT[name].family
  switch (state) {
    case 'loading':
      return [
        ...(has('[aria-busy="true"]') ? [] : ['loading, and nothing is aria-busy']),
        ...(all('[role="status"]').some(status => WORD.test(status.textContent ?? '')) ? [] : ['loading, and no status says so in words']),
      ]
    case 'pending':
      return has('[aria-busy="true"]') ? [] : ['an action runs, and nothing is aria-busy']
    case 'error':
      return [
        ...(has('[role="alert"]') ? [] : ['a failure, and no alert says why']),
        ...(has(`[data-${family}="empty"]`) ? ['a failure, and an empty note beside its alert'] : []),
      ]
    case 'empty':
      return !rendered || has('[role="status"]') ? [] : ['empty, and no status says so']
    default:
      return []
  }
}

const rows = Object.entries(COMPONENT_CONTRACT) as Array<[ContractedComponent, (typeof COMPONENT_CONTRACT)[ContractedComponent]]>

describe('the component contract', () => {
  beforeEach(reset)

  describe.each(rows)('<%s>', (name, row) => {
    const component = COMPONENTS[name] as { emits?: Record<string, unknown>, props?: Record<string, unknown> }

    it('declares its slots and events, typed, and takes its labels as a prop', () => {
      // `defineSlots<…>()` types the slots; test/types/component-contract.test-d.ts
      // checks the names it types.
      if (row.emits.length) {
        expect(Array.isArray(component.emits), 'emits is an object of validators').toBe(false)
        expect(Object.keys(component.emits ?? {})).toEqual(row.emits)
      }
      else {
        expect(component.emits ?? {}).toEqual({})
      }
      expect('labels' in (component.props ?? {}), 'labels prop').toBe(row.labels !== null)
    })

    it('stages every state its row lists, and no other', () => {
      expect(Object.keys(STAGING[name].states).sort()).toEqual([...row.states].sort())
    })

    it.each(row.states as readonly ContractState[])('%s: shows the state with its role, its family on every element, and every control named', async (state) => {
      const { wrapper, pressed } = await render(name, state)
      const { shows, absent = [], busy } = STAGING[name].states[state]!
      const present = (selector: string) => roots(wrapper).some(root => root.matches(selector) || root.querySelector(selector) !== null)
      if (shows === null) expect(roots(wrapper), 'renders nothing').toEqual([])
      else expect(present(shows), `shows ${shows}`).toBe(true)
      expect([
        ...violations(name, wrapper),
        ...roleViolations(name, state, wrapper),
        ...busyViolations(pressed, busy),
        ...absent.filter(present).map(selector => `shows ${selector}, which this caller may not use`),
      ]).toEqual([])
      wrapper.unmount()
    })

    it('renders each slot it declares in some state', async () => {
      const rendered = new Set<string>()
      for (const slot of row.slots) {
        for (const state of row.states as readonly ContractState[]) {
          const { wrapper } = await render(name, state, { [slot]: marker(`probe-${slot}`) })
          const found = wrapper.find(`[data-slot="probe-${slot}"]`).exists()
          wrapper.unmount()
          if (found) {
            rendered.add(slot)
            break
          }
        }
      }
      expect([...rendered].sort()).toEqual([...row.slots].sort())
    })
  })
})
