import type { FunctionReference } from 'convex/server'
import { computed, getCurrentInstance, inject, onMounted, ref, toValue, watch, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue'
import { useAction, useQuery, ConvexAuthStateKey } from 'nuxt-convex-module/client'
import { useBackendNamespace } from '../utils/namespace'
import { openProviderUrl } from '../utils/open-url'

/** A billing-provider product (loose — the provider owns the full shape; cast as needed). */
export type BillingProduct = { id: string, name: string } & Record<string, unknown>
/** A billing-provider subscription (loose — the provider owns the full shape; cast as needed). */
export type BillingSubscription = { id: string, status: string, productId: string } & Record<string, unknown>

/**
 * A past charge, as the provider's orders API returns it. Field names mirror
 * the provider `Order` shape so nothing is lost in translation; the index
 * signature keeps the rest reachable without a cast.
 */
export type BillingOrder = {
  id: string
  /** ISO timestamp of the charge. */
  createdAt: string
  status: string
  /** Amount in the currency's minor unit (cents), after discounts and taxes. */
  totalAmount: number
  currency: string
  paid?: boolean
  /** Assigned when the invoice is finalized; `null` on draft orders. */
  invoiceNumber?: string | null
  /** Whether an invoice PDF exists yet — `getInvoiceUrl` needs one. */
  isInvoiceGenerated?: boolean
  billingReason?: string
  productId?: string | null
  subscriptionId?: string | null
  product?: { id: string, name: string } | null
} & Record<string, unknown>

/**
 * One ingested usage event, as the provider's events API returns it — the
 * source of truth for consumption history (this package keeps no local
 * usage ledger). `units` is resolved server-side from the meter's value
 * property and is absent when the meter is unknown.
 */
export type UsageEvent = {
  id: string
  /** ISO timestamp of the event. */
  timestamp: string
  /** The ingested event name (the one the meter filters on). */
  name: string
  units?: number
  metadata?: Record<string, string | number | boolean>
} & Record<string, unknown>

/**
 * A page of provider records. The provider paginates by page number (not
 * cursor), so `pagination` carries the totals rather than a next token.
 */
export interface BillingPage<Item> {
  items: Item[]
  pagination?: { totalCount: number, maxPage: number }
}

/**
 * The subset of the provider's proration behaviours a **client** may choose
 * (`ProrationBehavior` in `nuxt-backend/billing` has all four). `invoice` and
 * `prorate` settle the difference now; `next_period` and `reset` hand over the
 * new plan immediately while deferring or waiving the charge, so they stay
 * server-side — pass them from your own Convex action via
 * `billing.updateSubscription(ctx, …)`, or make one the organization's default.
 */
export type ClientProrationBehavior = 'invoice' | 'prorate'

/** The provider's churn-reason enum, recorded with a cancellation. */
export type CancellationReason
  = | 'customer_service'
    | 'low_quality'
    | 'missing_features'
    | 'switched_service'
    | 'too_complex'
    | 'too_expensive'
    | 'unused'
    | 'other'

/**
 * A scheduled plan change that takes effect next period (the provider's
 * `pendingUpdate`). Seats are deliberately absent — this package does not do
 * per-seat billing.
 */
export interface PendingPlanUpdate {
  id: string
  /** When the change takes effect; `null` when the provider did not say. */
  appliesAt: Date | null
  /** The product the subscription switches to, `null` when unchanged. */
  productId: string | null
}

type EmptyArgs = Record<string, never>
type Query<Result> = FunctionReference<'query', 'public', EmptyArgs, Result>

/** A granted benefit — the unit of feature-gating (`useFeatures().has()`). */
export interface EntitlementBenefit {
  id: string
  benefitId: string
  type: string
  /**
   * The benefit's live provider metadata (not the grant-time snapshot). Set a
   * stable key here (e.g. `{ key: 'premium' }`) to feature-gate by a friendly
   * name — `useFeatures().has('premium')` matches any metadata value.
   */
  metadata?: Record<string, string | number | boolean>
}

/** A prepaid credit-meter balance (`useCredits()`). */
export interface EntitlementMeter {
  meterId: string
  /** The configured friendly name (`setupBilling({ credits })` / catalog key). */
  name?: string
  consumedUnits: number
  creditedUnits: number
  balance: number
  /**
   * The granting subscription's current period (epoch ms), when it has one — a
   * meter has no period of its own in the provider's model, and one bought as
   * a one-time credit pack has no cycle at all.
   */
  cycleStart?: number
  cycleEnd?: number
  /**
   * Whether unspent credited units carry into the next cycle. Only known on
   * the syncs that re-read the granting benefit, so `undefined` means "not
   * said", never "no".
   */
  rollover?: boolean
}

/** Feature-gating state for the current user, as returned by `getFeatures`. */
export interface Features {
  /** Active product ids the user is subscribed to. */
  plans: string[]
  /** Granted benefits. */
  benefits: EntitlementBenefit[]
}

/** Prepaid credit balances for the current user, as returned by `getCredits`. */
export interface Credits {
  meters: EntitlementMeter[]
}

/** Pre-filled customer details for a checkout session (all still editable). */
export interface CheckoutPrefill {
  name?: string
  email?: string
  /** The name that should appear on the invoice, when it differs from `name`. */
  billingName?: string
  billingAddress?: {
    /** ISO 3166-1 alpha-2 country code — the one field the provider requires. */
    country: string
    line1?: string
    line2?: string
    postalCode?: string
    city?: string
    state?: string
  }
  /** VAT / tax identification number. */
  taxId?: string
  /** Bill a business: the provider then requires a full address and name. */
  business?: boolean
}

/** Args of the generated `generateCheckoutLink` action. */
export type CheckoutArgs = {
  productIds: string[]
  origin: string
  successUrl: string
  subscriptionId?: string
  metadata?: Record<string, string>
  trialInterval?: 'day' | 'week' | 'month' | 'year' | null
  trialIntervalCount?: number | null
  locale?: string
  prefill?: CheckoutPrefill
  /** Values for the organization's custom checkout fields, keyed by field slug. */
  customFields?: Record<string, string | number | boolean>
  /** Require the full billing address, not just the country. */
  requireBillingAddress?: boolean
  /** Let the customer type a discount code (default `true`). */
  allowDiscountCodes?: boolean
  /** Pre-apply a discount by id — the only form the provider's checkout takes. */
  discountId?: string
}

/**
 * The billing function references — the result of `setupBilling().api` re-exported
 * from your `backend/billing.ts` (plus the optional `getCurrentSubscription`
 * query). Supplied automatically from the injected `api.billing` namespace;
 * pass `options.api` to override.
 */
export interface BillingApi {
  getConfiguredProducts?: Query<Record<string, BillingProduct | undefined>>
  listAllProducts?: Query<BillingProduct[]>
  listAllSubscriptions?: Query<BillingSubscription[] | null>
  getCurrentSubscription?: Query<BillingSubscription | null>
  generateCheckoutLink?: FunctionReference<'action', 'public', CheckoutArgs, { url: string }>
  generateCustomerPortalUrl?: FunctionReference<'action', 'public', { returnUrl?: string }, { url: string }>
  changeCurrentSubscription?: FunctionReference<'action', 'public', { productId: string }, null>
  cancelCurrentSubscription?: FunctionReference<'action', 'public', { revokeImmediately?: boolean }, null>
  // Every lifecycle action takes an optional `subscriptionId`: the server
  // resolves the caller's own single live subscription without it, and needs
  // it once `multipleSubscriptions` lets one account hold several.
  updateSubscription?: FunctionReference<'action', 'public', { subscriptionId?: string, productId?: string, proration?: ClientProrationBehavior }, null>
  cancelSubscription?: FunctionReference<'action', 'public', { subscriptionId?: string, atPeriodEnd?: boolean, reason?: CancellationReason, comment?: string }, null>
  uncancelSubscription?: FunctionReference<'action', 'public', { subscriptionId?: string }, null>
  pauseSubscription?: FunctionReference<'action', 'public', { subscriptionId?: string, resumesAt?: number }, null>
  resumeSubscription?: FunctionReference<'action', 'public', { subscriptionId?: string }, null>
  getOrders?: FunctionReference<'action', 'public', OrdersArgs, BillingPage<BillingOrder> | BillingOrder[] | null>
  getInvoiceUrl?: FunctionReference<'action', 'public', { orderId: string }, { url: string } | null>
  getUsageHistory?: FunctionReference<'action', 'public', UsageArgs, BillingPage<UsageEvent> | UsageEvent[] | null>
  getFeatures?: Query<Features | null>
  getCredits?: Query<Credits | null>
  syncEntitlements?: FunctionReference<'action', 'public', EmptyArgs, null>
  giftCheckout?: FunctionReference<'action', 'public', GiftCheckoutArgs, { url: string }>
  getReceivedGifts?: Query<ReceivedGift[] | null>
  claimGift?: FunctionReference<'action', 'public', { giftId?: string }, { claimed: number }>
}

/** Args of the `getOrders` action — provider page numbers start at 1. */
export type OrdersArgs = { page?: number, limit?: number }

/** Args of the `getUsageHistory` action (provider event history for one meter). */
export type UsageArgs = {
  /** A configured credit-meter name, or a raw meter id. */
  meter?: string
  page?: number
  limit?: number
  /** Epoch milliseconds — only events at or after this moment. */
  startTimestamp?: number
  /** Epoch milliseconds — only events at or before this moment. */
  endTimestamp?: number
}

/** Args of the `giftCheckout` action (a checkout whose recipient is someone else). */
export type GiftCheckoutArgs = {
  productIds: string[]
  recipientEmail: string
  message?: string
  origin: string
  successUrl: string
  metadata?: Record<string, string>
}

/** A gift addressed to the current user (`getReceivedGifts` shape). */
export interface ReceivedGift {
  id: string
  recipientEmail: string
  purchaserUserId: string
  purchaserEmail?: string
  purchaserName?: string
  productIds: string[]
  message?: string
  /** `'pending'` (awaiting payment) → `'paid'` (claimable) → `'claimed'`. */
  status: string
  createdAt: number
  paidAt?: number
  claimedAt?: number
}

/** Per-call checkout overrides for {@link UseBillingReturn.checkout}. */
export interface CheckoutOptions {
  subscriptionId?: string
  metadata?: Record<string, string>
  trialInterval?: 'day' | 'week' | 'month' | 'year' | null
  trialIntervalCount?: number | null
  locale?: string
  /** Where checkout returns the customer afterwards. Defaults to the current URL. */
  successUrl?: string
  /** Open in the same tab instead of a new one (redirect checkout). */
  redirect?: boolean
  /** Pre-filled customer details — defaults the customer can still change. */
  prefill?: CheckoutPrefill
  /** Values for the organization's custom checkout fields, keyed by field slug. */
  customFields?: Record<string, string | number | boolean>
  /** Require the full billing address, not just the country. */
  requireBillingAddress?: boolean
  /** Let the customer type a discount code (default `true`). */
  allowDiscountCodes?: boolean
  /**
   * Pre-apply a discount by id. Ids only — the provider's checkout payload
   * takes no codes, and its API has no code→id lookup, so a campaign resolves
   * its code once (`billing.discounts.list()`) and stores the id.
   */
  discountId?: string
}

export interface UseBillingOptions {
  /** Override the injected `api.billing` namespace (or individual references). */
  api?: BillingApi
}

/**
 * Which subscription a lifecycle call acts on. Omit for the account's single
 * live subscription; required once the backend runs with
 * `multipleSubscriptions` and one account can hold several at a time (the ids
 * are on {@link UseBillingReturn.subscriptions}).
 */
export interface SubscriptionTargetOptions {
  subscriptionId?: string
}

/** Per-call options for {@link UseBillingReturn.changePlan}. */
export interface ChangePlanOptions extends SubscriptionTargetOptions {
  /**
   * How to settle the mid-period difference. Defaults to the provider setting.
   * Client-selectable behaviours only — see {@link ClientProrationBehavior}.
   */
  proration?: ClientProrationBehavior
}

/** Per-call options for {@link UseBillingReturn.cancel}. */
export interface CancelOptions extends SubscriptionTargetOptions {
  /**
   * Keep access until the period the customer paid for ends (default `true`).
   * `false` revokes immediately — no refund is implied either way.
   */
  atPeriodEnd?: boolean
  /**
   * @deprecated Use `atPeriodEnd` (its inverse). Still honoured — a
   * money-affecting option is never silently ignored — and removed in a later
   * minor. `atPeriodEnd` wins when both are given.
   */
  revokeImmediately?: boolean
  /** Churn reason, recorded on the subscription for the provider's analytics. */
  reason?: CancellationReason
  /** The customer's own words. Visible to them in the provider's portal. */
  comment?: string
}

/** Per-call options for {@link UseBillingReturn.pause}. */
export interface PauseOptions extends SubscriptionTargetOptions {
  /**
   * When the subscription should resume by itself (epoch ms or `Date`). Must be
   * after the current period end; omit to keep it paused until `resume()`.
   */
  resumesAt?: number | Date
}

export interface UseBillingReturn {
  /** Configured products keyed by your product map, or `undefined` while loading. */
  products: ComputedRef<Record<string, BillingProduct | undefined> | undefined>
  /** The current active subscription, `null` when on the free plan, `undefined` while loading. */
  subscription: ComputedRef<BillingSubscription | null | undefined>
  /** Every subscription for the user (incl. ended/expired trials), or `undefined` while loading. */
  subscriptions: ComputedRef<BillingSubscription[] | undefined>
  /** `true` once an active subscription is known. */
  isSubscribed: ComputedRef<boolean>
  /** `true` once it's known the user has no active subscription. */
  isFree: ComputedRef<boolean>
  /** `true` until the subscription state has loaded. */
  isLoading: ComputedRef<boolean>
  /**
   * Provider subscription status (`active`, `trialing`, `past_due`, `paused`,
   * `canceled`, …), `null` on the free plan, `undefined` while loading.
   */
  status: ComputedRef<string | null | undefined>
  /** `true` when the subscription is set to end when the paid period does. */
  cancelAtPeriodEnd: ComputedRef<boolean>
  /**
   * When the subscription was paused, `null` while it is running.
   *
   * Read off the webhook-synced subscription row, whose columns are the
   * provider component's — and that table carries no `paused_at` today, so
   * this reads `null` until it does. Use {@link UseBillingReturn.isPaused},
   * which also derives from `status`, to drive a paused-state UI.
   */
  pausedAt: ComputedRef<Date | null>
  /**
   * When a paused subscription resumes by itself, `null` when nothing is
   * scheduled. Same caveat as {@link UseBillingReturn.pausedAt}: the synced
   * subscription row has no `resumes_at` column yet, so this is `null` until
   * the provider component adds one.
   */
  resumesAt: ComputedRef<Date | null>
  /** End of the trial period, `null` when the plan has no trial. */
  trialEnd: ComputedRef<Date | null>
  /** `true` while the subscription is in its trial period. */
  isTrialing: ComputedRef<boolean>
  /** `true` while the subscription is paused. */
  isPaused: ComputedRef<boolean>
  /**
   * A plan change already scheduled for the next period, `null` when none.
   * Like {@link UseBillingReturn.pausedAt}, this reads off the synced
   * subscription row, which has no `pending_update` column yet — so it is
   * `null` until the provider component syncs one.
   */
  pendingUpdate: ComputedRef<PendingPlanUpdate | null>
  /** Generate a checkout for the given product(s) and open it (returns the URL). */
  checkout: (productIds: string | string[], options?: CheckoutOptions) => Promise<string>
  /** Buy the given product(s) as a gift for someone else (by email). Opens checkout. */
  gift: (productIds: string | string[], options: GiftOptions & { recipientEmail: string }) => Promise<string>
  /** Open the billing customer portal (returns the URL). */
  portal: (options?: { returnUrl?: string, redirect?: boolean }) => Promise<string>
  /** Switch the active subscription to another product (upgrade/downgrade). */
  changePlan: (productId: string, options?: ChangePlanOptions) => Promise<void>
  /** Cancel the active subscription — at period end by default. */
  cancel: (options?: CancelOptions) => Promise<void>
  /** Undo a pending cancellation, putting the subscription back on renewal. */
  uncancel: (options?: SubscriptionTargetOptions) => Promise<void>
  /** Pause the subscription at the end of the current period. */
  pause: (options?: PauseOptions) => Promise<void>
  /** Resume a paused subscription immediately (starts a new billing period). */
  resume: (options?: SubscriptionTargetOptions) => Promise<void>
}

function notConfigured(action: string): never {
  throw new Error(
    `[nuxt-backend] Billing ${action} is unavailable — ensure \`billing.ts\` re-exports the `
    + `setupBilling api and the required BILLING_ACCESS_TOKEN env var is set, or pass \`{ api }\` to useBilling().`,
  )
}

/**
 * Provider timestamps reach the client as ISO strings (the component's cache
 * stores them that way) but as epoch numbers when an action forwards the SDK's
 * `Date` through Convex's JSON wire. Accept both, and never hand a component an
 * `Invalid Date`.
 */
export function toBillingDate(value: unknown): Date | null {
  if (value == null) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Money the way the provider states it — a minor-unit integer plus an ISO
 * currency code — rendered in the visitor's own locale. Unknown currency codes
 * fall back to the bare amount rather than throwing mid-render.
 */
export function formatBillingAmount(amount: number, currency?: string | null): string {
  const value = amount / 100
  if (currency) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        maximumFractionDigits: value % 1 ? 2 : 0,
      }).format(value)
    }
    catch {
      // Unknown currency code — fall through to the bare amount.
    }
  }
  return value % 1 ? value.toFixed(2) : String(value)
}

/**
 * Build a `checkout(productIds, options)` action over a billing namespace —
 * shared by {@link useBilling} (subscriptions) and {@link useCredits} (top-ups),
 * since a credit-pack top-up is just a checkout for a one-time product. Must be
 * called during component setup (it sets up the underlying action).
 */
export function createCheckout(billing: BillingApi) {
  const runCheckout = billing.generateCheckoutLink ? useAction(billing.generateCheckoutLink) : null
  return async (productIds: string | string[], opts: CheckoutOptions = {}): Promise<string> => {
    if (!runCheckout) notConfigured('checkout')
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const successUrl = opts.successUrl ?? (typeof window !== 'undefined' ? window.location.href : '')
    const { url } = await runCheckout({
      productIds: Array.isArray(productIds) ? productIds : [productIds],
      origin,
      successUrl,
      subscriptionId: opts.subscriptionId,
      metadata: opts.metadata,
      trialInterval: opts.trialInterval,
      trialIntervalCount: opts.trialIntervalCount,
      locale: opts.locale,
      prefill: opts.prefill,
      customFields: opts.customFields,
      requireBillingAddress: opts.requireBillingAddress,
      allowDiscountCodes: opts.allowDiscountCodes,
      discountId: opts.discountId,
    })
    openProviderUrl(url, opts.redirect)
    return url
  }
}

/**
 * One page of provider history, however the deployed function spells it: a
 * bare array (a backend that dropped the envelope) reads as a single page with
 * unknown totals.
 */
function normalizePage<Item>(result: BillingPage<Item> | Item[] | null | undefined): BillingPage<Item> {
  if (!result) return { items: [] }
  if (Array.isArray(result)) return { items: result }
  return { items: result.items ?? [], pagination: result.pagination }
}

/** Fetches one page from a provider-history action. */
export type PageFetcher<Item> = (args: { page: number, limit?: number }) => Promise<BillingPage<Item> | Item[] | null>

/** Reactive paging over a provider history endpoint (see {@link createProviderPager}). */
export interface ProviderPager<Item> {
  /** The current page's records — `undefined` until the first load resolves. */
  items: Ref<Item[] | undefined>
  /** The page being shown; provider page numbers start at 1. */
  page: Ref<number>
  /** Total records across all pages, when the provider reported it. */
  total: ComputedRef<number | undefined>
  /** Number of pages, when the provider reported it. */
  pageCount: ComputedRef<number | undefined>
  /** Whether a further page exists. */
  hasMore: ComputedRef<boolean>
  /** Whether an earlier page exists. */
  hasPrevious: ComputedRef<boolean>
  /** Whether a load is in flight. */
  isLoading: ComputedRef<boolean>
  /** Message of the last failed load, `null` otherwise. Loads never reject. */
  error: Ref<string | null>
  /** Reload the current page. */
  refresh: () => Promise<void>
  /** Load the next page (no-op at the end). */
  next: () => Promise<void>
  /** Load the previous page (no-op on page 1). */
  previous: () => Promise<void>
  /** Jump to a page number. */
  goTo: (page: number) => Promise<void>
}

/** Options for {@link createProviderPager}. */
export interface ProviderPagerOptions {
  /** Records per page. Reactive — changing it reloads from page 1. */
  limit?: MaybeRefOrGetter<number | undefined>
  /** Load the first page on mount. Default `true`. */
  immediate?: boolean
  /** While this is `false` the pager stays empty and never calls out. */
  enabled?: () => boolean
  /** Extra reactive inputs that should reload from page 1 when they change. */
  watchSources?: () => unknown
}

/**
 * The reactive paging both provider-history composables need — `useOrders`
 * and `useUsage` differ only in what they fetch. Provider history lives behind
 * page numbers rather than a cursor, so this tracks a page and its totals.
 *
 * Loads run in the browser only (they need a Convex client and the signed-in
 * identity), never reject — a failure lands in `error` so a permanently
 * mounted history panel cannot break a page — and stay put when `fetchPage` is
 * `null`, which is how an undeployed backend function degrades. Must be called
 * during component setup.
 */
export function createProviderPager<Item>(
  fetchPage: PageFetcher<Item> | null,
  options: ProviderPagerOptions = {},
): ProviderPager<Item> {
  const items = ref<Item[] | undefined>() as Ref<Item[] | undefined>
  const page = ref(1)
  const total = ref<number | undefined>()
  const pageCount = ref<number | undefined>()
  const error = ref<string | null>(null)

  const instance = getCurrentInstance()
  const immediate = (options.immediate ?? true) && instance != null
  // A mount-time load starts the state as loading, so the first paint is the
  // loading state rather than a flash of "nothing here" that immediately fills
  // in — and so a server render matches the client's first frame.
  const loading = ref(Boolean(fetchPage) && immediate)

  const enabled = () => (options.enabled ? options.enabled() : true)

  async function load(target: number): Promise<void> {
    if (!fetchPage || !enabled()) {
      items.value = []
      total.value = undefined
      pageCount.value = undefined
      loading.value = false
      return
    }
    loading.value = true
    error.value = null
    try {
      const result = normalizePage(await fetchPage({ page: target, limit: toValue(options.limit) }))
      items.value = result.items
      total.value = result.pagination?.totalCount
      pageCount.value = result.pagination?.maxPage
      page.value = target
    }
    catch (failure) {
      error.value = failure instanceof Error ? failure.message : 'Could not load billing history'
      items.value ??= []
    }
    finally {
      loading.value = false
    }
  }

  if (instance) {
    if (immediate) onMounted(() => load(page.value))
    // A page size or filter change invalidates the position, not just the data.
    watch(
      () => [toValue(options.limit), options.watchSources?.(), enabled()],
      () => load(1),
      { flush: 'post' },
    )
  }

  return {
    items,
    page,
    total: computed(() => total.value),
    pageCount: computed(() => pageCount.value),
    // Without provider totals, a full page is the only "there may be more"
    // signal there is; a short page is certainly the last one.
    hasMore: computed(() => {
      if (pageCount.value != null) return page.value < pageCount.value
      const limit = toValue(options.limit)
      return limit != null && (items.value?.length ?? 0) >= limit
    }),
    hasPrevious: computed(() => page.value > 1),
    isLoading: computed(() => loading.value),
    error,
    refresh: () => load(page.value),
    next: async () => {
      if (pageCount.value != null && page.value >= pageCount.value) return
      await load(page.value + 1)
    },
    previous: async () => {
      if (page.value <= 1) return
      await load(page.value - 1)
    },
    goTo: target => load(Math.max(1, Math.trunc(target))),
  }
}

/** Per-call options for {@link UseBillingReturn.gift}. */
export interface GiftOptions {
  /** A note shown to the recipient in the gift email. */
  message?: string
  metadata?: Record<string, string>
  /** Where the purchaser returns after paying. Defaults to the current URL. */
  successUrl?: string
  /** Open in the same tab instead of a new one (redirect checkout). */
  redirect?: boolean
}

/**
 * Build a `gift(productIds, { recipientEmail, ... })` action over a billing
 * namespace — shared by {@link useBilling} and {@link useCredits} (gifting a
 * credit pack is just a gift checkout of a one-time product). The purchaser
 * pays; the recipient (by email) receives the entitlement — attached
 * automatically if they have an account, claimable on first sign-in otherwise.
 * Must be called during component setup.
 */
export function createGiftCheckout(billing: BillingApi) {
  const runGiftCheckout = billing.giftCheckout ? useAction(billing.giftCheckout) : null
  return async (
    productIds: string | string[],
    opts: GiftOptions & { recipientEmail: string },
  ): Promise<string> => {
    if (!runGiftCheckout) notConfigured('gift')
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const successUrl = opts.successUrl ?? (typeof window !== 'undefined' ? window.location.href : '')
    const { url } = await runGiftCheckout({
      productIds: Array.isArray(productIds) ? productIds : [productIds],
      recipientEmail: opts.recipientEmail,
      message: opts.message,
      origin,
      successUrl,
      metadata: opts.metadata,
    })
    openProviderUrl(url, opts.redirect)
    return url
  }
}

/**
 * Reactive billing state plus the full subscription lifecycle — checkout,
 * gift, portal, plan change, cancel/uncancel, pause/resume — linked to your
 * auth user. Works with no arguments via the auto-provided `api.billing`
 * namespace; pass `{ api }` to override.
 *
 * Lifecycle reads (`status`, `cancelAtPeriodEnd`, `trialEnd`, `pausedAt`,
 * `pendingUpdate`, …) come straight off the provider's subscription record,
 * and every action degrades on its own: a backend that has not deployed the
 * matching function reads as "not set" and throws only when actually called.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const billing = useBilling()
 * </script>
 * <template>
 *   <p v-if="billing.isSubscribed.value">Pro</p>
 *   <button @click="billing.checkout(productId, { trialInterval: 'day', trialIntervalCount: 7 })">
 *     Upgrade
 *   </button>
 * </template>
 * ```
 */
export function useBilling(options: UseBillingOptions = {}): UseBillingReturn {
  const billing = useBackendNamespace<BillingApi>('billing', 'useBilling', options.api)

  const products = billing.getConfiguredProducts
    ? useQuery(billing.getConfiguredProducts)
    : computed(() => undefined)

  // The user-scoped subscription queries resolve the current user server-side
  // and return `null` for claimless callers (signed out, or the auth-handshake /
  // reconnect window). Additionally gate them on auth state, read via `inject`
  // (not `useConvexAuth`, which throws) so `useBilling` still works without the
  // auth integration. When signed out, the user is simply on the free plan.
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth != null && !auth.isAuthenticated.value)
  const userScopedArgs = () => (signedOut.value ? 'skip' : {})

  const rawSubscriptions = billing.listAllSubscriptions
    ? useQuery(billing.listAllSubscriptions, userScopedArgs)
    : computed<BillingSubscription[] | null | undefined>(() => undefined)
  const subscriptions = computed<BillingSubscription[] | undefined>(() => {
    if (signedOut.value) return []
    // Server-side null = no billing entity yet — same as having no subscriptions.
    return rawSubscriptions.value === null ? [] : rawSubscriptions.value
  })

  // Prefer an explicit `getCurrentSubscription` query; otherwise derive the
  // active subscription from the full list.
  const rawCurrentSubscription = billing.getCurrentSubscription
    ? useQuery(billing.getCurrentSubscription, userScopedArgs)
    : computed<BillingSubscription | null | undefined>(() => {
        const all = subscriptions.value
        if (all === undefined) return undefined
        return all.find(s => s.status === 'active' || s.status === 'trialing') ?? null
      })
  const currentSubscription = computed<BillingSubscription | null | undefined>(() =>
    signedOut.value ? null : rawCurrentSubscription.value,
  )

  // Lifecycle fields live on the provider's subscription record. The
  // component's cache stores a subset of them, so anything it does not carry
  // (pause state, pending updates) simply reads as "not set" instead of
  // breaking the UI — the same degradation as a missing function.
  const field = <T>(read: (subscription: BillingSubscription) => T): ComputedRef<T | undefined> =>
    computed(() => {
      const subscription = currentSubscription.value
      return subscription ? read(subscription) : undefined
    })

  const status = computed<string | null | undefined>(() => {
    const subscription = currentSubscription.value
    return subscription === undefined ? undefined : subscription === null ? null : subscription.status
  })
  const trialEnd = field(subscription => toBillingDate(subscription.trialEnd))
  const pausedAt = field(subscription => toBillingDate(subscription.pausedAt))
  const resumesAt = field(subscription => toBillingDate(subscription.resumesAt))

  const checkout = createCheckout(billing)
  const gift = createGiftCheckout(billing)
  const runPortal = billing.generateCustomerPortalUrl ? useAction(billing.generateCustomerPortalUrl) : null
  const runUpdate = billing.updateSubscription ? useAction(billing.updateSubscription) : null
  const runChange = billing.changeCurrentSubscription ? useAction(billing.changeCurrentSubscription) : null
  const runCancelSubscription = billing.cancelSubscription ? useAction(billing.cancelSubscription) : null
  const runCancel = billing.cancelCurrentSubscription ? useAction(billing.cancelCurrentSubscription) : null
  const runUncancel = billing.uncancelSubscription ? useAction(billing.uncancelSubscription) : null
  const runPause = billing.pauseSubscription ? useAction(billing.pauseSubscription) : null
  const runResume = billing.resumeSubscription ? useAction(billing.resumeSubscription) : null

  return {
    products,
    subscription: computed(() => currentSubscription.value),
    subscriptions,
    isSubscribed: computed(() => currentSubscription.value != null),
    isFree: computed(() => currentSubscription.value === null),
    isLoading: computed(() => currentSubscription.value === undefined),
    status,
    cancelAtPeriodEnd: computed(() => currentSubscription.value?.cancelAtPeriodEnd === true),
    pausedAt: computed(() => pausedAt.value ?? null),
    resumesAt: computed(() => resumesAt.value ?? null),
    trialEnd: computed(() => trialEnd.value ?? null),
    // The cache can lag a status transition, so an unexpired `trialEnd` counts
    // as trialing too — the affordance a trial banner needs either way.
    isTrialing: computed(() => status.value === 'trialing'
      || (status.value === 'active' && (trialEnd.value?.getTime() ?? 0) > Date.now())),
    isPaused: computed(() => status.value === 'paused' || pausedAt.value != null),
    pendingUpdate: computed(() => {
      const update = currentSubscription.value?.pendingUpdate as Record<string, unknown> | null | undefined
      if (!update || typeof update.id !== 'string') return null
      return {
        id: update.id,
        appliesAt: toBillingDate(update.appliesAt),
        productId: typeof update.productId === 'string' ? update.productId : null,
      }
    }),
    checkout,
    gift,
    portal: async (opts = {}) => {
      if (!runPortal) notConfigured('portal')
      const { url } = await runPortal({ returnUrl: opts.returnUrl })
      openProviderUrl(url, opts.redirect)
      return url
    },
    // `updateSubscription` is the full-fidelity call; `changeCurrentSubscription`
    // is the older product-only one. Prefer the first, fall back to the second
    // so an app that has not redeployed its backend keeps working (it just
    // cannot choose a proration behavior).
    changePlan: async (productId, opts = {}) => {
      if (runUpdate) {
        await runUpdate({ subscriptionId: opts.subscriptionId, productId, proration: opts.proration })
        return
      }
      if (!runChange) notConfigured('changePlan')
      await runChange({ productId })
    },
    cancel: async (opts = {}) => {
      // `revokeImmediately` is the retired spelling of `!atPeriodEnd`. It is
      // still honoured rather than ignored: silently flipping a caller's
      // "revoke now" into "cancel at period end" would be the wrong answer on
      // a money-affecting action.
      const atPeriodEnd = opts.atPeriodEnd
        ?? (opts.revokeImmediately === undefined ? true : !opts.revokeImmediately)
      if (runCancelSubscription) {
        await runCancelSubscription({
          subscriptionId: opts.subscriptionId,
          atPeriodEnd,
          reason: opts.reason,
          comment: opts.comment,
        })
        return
      }
      if (!runCancel) notConfigured('cancel')
      await runCancel({ revokeImmediately: !atPeriodEnd })
    },
    uncancel: async (opts = {}) => {
      if (!runUncancel) notConfigured('uncancel')
      await runUncancel({ subscriptionId: opts.subscriptionId })
    },
    pause: async (opts = {}) => {
      if (!runPause) notConfigured('pause')
      const resumesAt = opts.resumesAt instanceof Date ? opts.resumesAt.getTime() : opts.resumesAt
      await runPause({ subscriptionId: opts.subscriptionId, resumesAt })
    },
    resume: async (opts = {}) => {
      if (!runResume) notConfigured('resume')
      await runResume({ subscriptionId: opts.subscriptionId })
    },
  }
}
