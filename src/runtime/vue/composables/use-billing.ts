import type { FunctionReference } from 'convex/server'
import { computed, inject, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue'
import { useAction, useQuery, ConvexAuthStateKey } from 'nuxt-convex-module/client'
import { useBackendNamespace } from '../utils/namespace'
import { openProviderUrl } from '../utils/open-url'
import { toBillingDate } from './billing-format'
import { createCheckout, createGiftCheckout, notConfigured } from './billing-provider'

// The helpers the billing composables and components share live in
// billing-format.ts and billing-provider.ts, re-exported here and documented
// on this module's reference page. TypeDoc lists a page's symbols by
// declaring file, then position, and `useBilling` is the page's last
// function: the functions moved to files that sort before this one (a
// file under utils/ would sort after it), and every type stayed.
export { formatBillingAmount, toBillingDate } from './billing-format'
export { createCheckout, createProviderPager, createGiftCheckout } from './billing-provider'

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

/**
 * Campaign attribution, as a campaign link's UTM parameters: stored on the
 * order or subscription as `utm_*` metadata, each value cut to 100
 * characters.
 */
export interface CampaignAttribution {
  source?: string
  medium?: string
  campaign?: string
  term?: string
  content?: string
}

/**
 * Args of the generated `generateCheckoutLink` action. The server sells
 * only the app's catalog and returns only to the site; the trial is the
 * product's own, and a discount by id is the server's to apply.
 */
export type CheckoutArgs = {
  productIds: string[]
  origin: string
  successUrl: string
  subscriptionId?: string
  metadata?: Record<string, string>
  locale?: string
  prefill?: CheckoutPrefill
  /** Values for the organization's custom checkout fields, keyed by field slug. */
  customFields?: Record<string, string | number | boolean>
  /** Require the full billing address, not just the country. */
  requireBillingAddress?: boolean
  /** Let the customer type a discount code (default `true`). */
  allowDiscountCodes?: boolean
  /** A discount code to apply up front (a campaign link's), checked by the provider. */
  discountCode?: string
  /** Campaign attribution, stored as `utm_*` metadata. */
  utm?: CampaignAttribution
}

/**
 * The billing function references — the result of `setupBilling().api` re-exported
 * from your `backend/billing.ts` (plus the optional `getCurrentSubscription`
 * query). Supplied automatically from the injected `api.billing` namespace;
 * pass `options.api` to override.
 */
export interface BillingApi {
  getConfiguredProducts?: Query<Record<string, BillingProduct | undefined>>
  listAllSubscriptions?: Query<BillingSubscription[] | null>
  getCurrentSubscription?: Query<BillingSubscription | null>
  generateCheckoutLink?: FunctionReference<'action', 'public', CheckoutArgs, { url: string }>
  generateCustomerPortalUrl?: FunctionReference<'action', 'public', { returnUrl?: string }, { url: string }>
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
  /** The credit pack's catalog key (`credits500`): gifts are packs only. */
  pack: string
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

/**
 * Per-call checkout overrides for {@link UseBillingReturn.checkout}. The
 * trial is the plan's own (the catalog's `trial`): a different one, or a
 * discount by id, is the server's choice — see `billing.checkout`.
 */
export interface CheckoutOptions {
  subscriptionId?: string
  /** Your own keys: the server refuses the ones the package reads back. */
  metadata?: Record<string, string>
  locale?: string
  /** Where checkout returns the customer afterwards, on the site's own origin. Defaults to the current URL. */
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
   * A discount code to apply up front — a campaign link's, say. The
   * provider checks it like one the customer typed; one it refuses rejects
   * the checkout as `invalid_input` (`discountCode`).
   */
  discountCode?: string
  /** Campaign attribution (a campaign link's UTM parameters), stored as `utm_*` metadata. */
  utm?: CampaignAttribution
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
  /** Buy a credit pack, by its catalog key, as a gift for someone else (by email). Opens checkout. */
  gift: (pack: string, options: GiftOptions & { recipientEmail: string }) => Promise<string>
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
 *   <button @click="billing.checkout(productId, { utm: { source: 'newsletter' } })">
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
  const runCancelSubscription = billing.cancelSubscription ? useAction(billing.cancelSubscription) : null
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
    changePlan: async (productId, opts = {}) => {
      if (!runUpdate) notConfigured('changePlan')
      await runUpdate({ subscriptionId: opts.subscriptionId, productId, proration: opts.proration })
    },
    cancel: async (opts = {}) => {
      if (!runCancelSubscription) notConfigured('cancel')
      await runCancelSubscription({
        subscriptionId: opts.subscriptionId,
        atPeriodEnd: opts.atPeriodEnd ?? true,
        reason: opts.reason,
        comment: opts.comment,
      })
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
