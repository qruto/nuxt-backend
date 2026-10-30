import type { FunctionReference } from 'convex/server'
import { computed, inject, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue'
import { useAction, ConvexAuthStateKey } from 'nuxt-convex-module/client'
import { useActionState } from '../utils/action-state'
import { useBillingAccess } from '../utils/billing-access'
import { finishingCheckout } from '../utils/checkout-return'
import type { BackendError } from '../utils/backend-error'
import { absentQuery, diagnostics, useLiveQuery } from '../utils/live-query'
import { useBackendNamespace } from '../utils/namespace'
import type { QuotaUsage } from '../../../convex/integrations/billing/types/records.js'
import type { CancelOutcome, SaveOffer, WithdrawalPeriod } from '../../../convex/integrations/billing/types/lifecycle.js'
import { openProviderUrl } from '../utils/open-url'
import { toBillingDate } from './billing-format'
import { createCheckout, notConfigured } from './billing-provider'

export type { CancelOutcome, SaveOffer, WithdrawalPeriod }

// The helpers the billing composables and components share live in
// billing-format.ts and billing-provider.ts, re-exported here and documented
// on this module's reference page. TypeDoc lists a page's symbols by
// declaring file, then position, and `useBilling` is the page's last
// function: the functions moved to files that sort before this one (a
// file under utils/ would sort after it), and every type stayed.
export { formatBillingAmount, toBillingDate } from './billing-format'
export { createCheckout, createProviderPager } from './billing-provider'

/** A billing-provider product (loose — the provider owns the full shape; cast as needed). */
export type BillingProduct = { id: string, name: string } & Record<string, unknown>
/**
 * A billing-provider subscription (loose — the provider owns the full shape;
 * cast as needed). `free` marks the catalog's free plan, a subscription
 * too; `productKey` is its product's catalog key (`pro`, `pro:year`).
 */
export type BillingSubscription = { id: string, status: string, productId: string, free?: true, productKey?: string, pass?: { plan: string, months?: number, startedAt: number, endsAt: number, trial?: true } } & Record<string, unknown>

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
 * A plan change scheduled for the start of the next period. Seats are
 * deliberately absent: this package does not do per-seat billing.
 */
export interface PendingPlanChange {
  /** The product the subscription switches to. */
  productId: string
  /** When the change takes effect. */
  appliesAt: Date
}

type EmptyArgs = Record<string, never>
type Query<Result> = FunctionReference<'query', 'public', EmptyArgs, Result>

/**
 * What a granted benefit gives, in the package's own words rather than the
 * provider's benefit types: a license key, file downloads, a role in a
 * community server, access to a code repository, a shared chat channel, a
 * perk you deliver yourself (`custom`), prepaid credits, a feature of the
 * catalog, or `other` for a type newer than the package.
 */
export type BenefitKind
  = | 'license_key'
    | 'download'
    | 'community'
    | 'repository'
    | 'shared_channel'
    | 'custom'
    | 'credits'
    | 'feature'
    | 'other'

/** A granted benefit — the unit of feature-gating (`useFeatures().has()`). */
export interface EntitlementBenefit {
  /** The grant's id. */
  id: string
  benefitId: string
  /** The provider's own benefit type; `kind` says the same in neutral words. */
  type: string
  /** What the benefit gives (see {@link BenefitKind}). */
  kind?: BenefitKind
  /** The benefit's name, as the provider lists it to the customer. Absent until the benefit was read once. */
  name?: string
  /** When it was granted (epoch ms). */
  grantedAt?: number
  /** A license key's display key: masked but for its last characters. The whole key is in the billing portal. */
  licenseKey?: string
  /** How many files a download benefit grants; the files are in the billing portal. */
  files?: number
  /** The repository a repository benefit opens, as `owner/name`. */
  repository?: string
  /**
   * The benefit's live provider metadata (not the grant-time snapshot). Set a
   * stable `key` here (e.g. `{ key: 'premium' }`) to gate on it:
   * `useFeatures().has('premium')` and `billing.requireFeature` match the
   * `key`, else the benefit id, and no other value.
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
  /**
   * Every quota the catalog declares or a grant names, by key. Absent from
   * a backend older than plan quotas. Experimental.
   */
  quotas?: Record<string, QuotaUsage>
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
  /** The currency to pay in, one the catalog prices (`usePricing().currencies`). */
  currency?: string
  prefill?: CheckoutPrefill
  /** Values for the organization's custom checkout fields, keyed by field slug. */
  customFields?: Record<string, string | number | boolean>
  /** Require the full billing address, not just the country. */
  requireBillingAddress?: boolean
  /** Let the customer type a discount code (default `true`). */
  allowDiscountCodes?: boolean
  /** A discount code to apply up front (a campaign link's), checked by the provider. */
  discountCode?: string
  /** A public promotion of the catalog, by its key. */
  discount?: string
  /** The visitor's IP address, for the provider's local pricing: read from `/api/backend/visitor-ip`. */
  customerIpAddress?: string
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
  cancelSubscription?: FunctionReference<'action', 'public', { subscriptionId?: string, atPeriodEnd?: boolean, reason?: CancellationReason, comment?: string, offer?: false }, CancelOutcome | null>
  acceptSaveOffer?: FunctionReference<'action', 'public', { offerId: string }, null>
  getWithdrawal?: Query<{ period: WithdrawalPeriod | null } | null>
  withdraw?: FunctionReference<'action', 'public', { subscriptionId?: string }, { withdrawnAt: number }>
  uncancelSubscription?: FunctionReference<'action', 'public', { subscriptionId?: string }, null>
  cancelPendingChange?: FunctionReference<'action', 'public', { subscriptionId?: string }, null>
  pauseSubscription?: FunctionReference<'action', 'public', { subscriptionId?: string, resumesAt?: number }, null>
  resumeSubscription?: FunctionReference<'action', 'public', { subscriptionId?: string }, null>
  getOrders?: FunctionReference<'action', 'public', OrdersArgs, BillingPage<BillingOrder> | BillingOrder[] | null>
  getInvoiceUrl?: FunctionReference<'action', 'public', { orderId: string }, { url: string } | null>
  getUsageHistory?: FunctionReference<'action', 'public', UsageArgs, BillingPage<UsageEvent> | UsageEvent[] | null>
  getFeatures?: Query<Features | null>
  getCredits?: Query<Credits | null>
  getBillingAccess?: Query<{ canManage: boolean } | null>
  syncEntitlements?: FunctionReference<'action', 'public', EmptyArgs, null>
  giftCheckout?: FunctionReference<'action', 'public', GiftCheckoutArgs, { url: string }>
  getReceivedGifts?: Query<ReceivedGift[] | null>
  claimGift?: FunctionReference<'action', 'public', { giftId: string, successUrl?: string, workspaceId?: string }, { url: string | null }>
  getSentGifts?: Query<SentGift[] | null>
  resendGift?: FunctionReference<'action', 'public', { giftId: string }, null>
  changeGiftRecipient?: FunctionReference<'action', 'public', { giftId: string, recipientEmail: string }, null>
  rescheduleGift?: FunctionReference<'action', 'public', { giftId: string, deliverAt: number }, null>
  cancelGift?: FunctionReference<'action', 'public', { giftId: string }, null>
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

/**
 * Args of the `giftCheckout` action: the purchaser's own checkout of a gift
 * for someone else: a credit pack by its catalog key, or a plan as a pass by
 * its key and a length in months.
 */
export type GiftCheckoutArgs = {
  /** The credit pack's catalog key (`credits500`). */
  pack?: string
  /** A plan's catalog key, with its `months`: a plan pass. */
  plan?: string
  months?: number
  recipientEmail: string
  message?: string
  /** When the notice goes out and the recipient may claim it, epoch milliseconds, up to a year ahead. */
  deliverAt?: number
  origin: string
  successUrl: string
  metadata?: Record<string, string>
  /** The currency to pay in, one the pack's gift is priced in. */
  currency?: string
}

/**
 * A gift addressed to the current user (`getReceivedGifts` shape): paid and
 * claimed ones only, with the sender's name but never their email or a
 * billing id.
 */
export interface ReceivedGift {
  id: string
  /** The sender's name, at most 40 characters with no links. */
  purchaserName?: string
  /** The credit pack's catalog key. */
  pack?: string
  /** For a plan pass, the plan's catalog key and how many months it lasts. */
  plan?: string
  months?: number
  productIds: string[]
  /** The sender's plain-text message, shown only inside the app. */
  message?: string
  /** `'paid'` (claimable) → `'claimed'`. */
  status: string
  createdAt: number
  paidAt?: number
  /** When the gift was delivered: from then it is listed and claimable. */
  deliveredAt?: number
  claimedAt?: number
}

/** A plan pass a workspace holds: gifted until `endsAt`, with no card and no renewal. */
export interface GiftedPass {
  /** The plan's catalog key. */
  plan: string
  /** How many months it was given for. */
  months?: number
  startedAt: Date
  endsAt: Date
  /** A reverse trial's pass (LIFECYCLE): the workspace started on it, nobody gave it. */
  trial?: true
}

/** Where a gift the signed-in person sent stands. */
export type SentGiftStatus = 'scheduled' | 'delivered' | 'claimed' | 'refunded'

/**
 * A gift the current user sent (`getSentGifts` shape): what it is, who it
 * goes to, and where it stands. Never a billing id.
 */
export interface SentGift {
  id: string
  /** The gift's catalog key: the pack's, or the plan's for a pass. */
  item: string
  /** For a plan pass, the plan and its length in months. */
  plan?: string
  months?: number
  recipientEmail: string
  message?: string
  status: SentGiftStatus
  createdAt: number
  /** The date the notice goes out (the payment's own moment when no date was chosen). */
  deliverAt?: number
  paidAt?: number
  deliveredAt?: number
  claimedAt?: number
}

/**
 * Per-call checkout overrides for {@link UseBillingReturn.checkout}. The
 * trial is the plan's own (the catalog's `trial`): a different one, a
 * promotion without a code, or a discount by id, is the server's choice —
 * see `billing.checkout`.
 */
export interface CheckoutOptions {
  subscriptionId?: string
  /** Your own keys: the server refuses the ones the package reads back. */
  metadata?: Record<string, string>
  locale?: string
  /**
   * The currency to pay in, lower-case ISO 4217: one the catalog prices the
   * product in (`usePricing().currencies`); the server refuses any other
   * as `invalid_input` (`currency`). Omit for the catalog's own.
   */
  currency?: string
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
  /**
   * A public promotion of the catalog to apply, by its key (`'launch'`): a
   * discount with a code, for a product it applies to. Any other key, or
   * one the provider no longer redeems (ended, used up), rejects the
   * checkout as `invalid_input` (`discount`): check out again without it
   * to sell at the regular price. Not beside `discountCode`.
   */
  discount?: string
  /** Campaign attribution (a campaign link's UTM parameters), stored as `utm_*` metadata. */
  utm?: CampaignAttribution
  /**
   * The EU soft opt-in's box, where your checkout shows one
   * (`useBilling().softOptIn`): `true` when the person ticked "Don't email
   * me", `false` when they left it. Omit it where no box shows: the paid
   * order then joins no topic.
   */
  emailOptOut?: boolean
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
  /**
   * `false` cancels now, past the save offer the reason may have
   * (`setupBilling({ lifecycle: { saveOffers } })`): "Cancel my plan" on the
   * offer's screen.
   */
  offer?: false
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
  /**
   * Configured products keyed by your product map: `undefined` while they
   * load and after a failed read (`productsError` says why), `{}` on a
   * backend that exports no `getConfiguredProducts`.
   */
  products: ComputedRef<Record<string, BillingProduct | undefined> | undefined>
  /** Why the products could not be read, or `null`: the products read's own part of `error`. */
  productsError: ComputedRef<BackendError | null>
  /**
   * The current active subscription, `undefined` while loading. With a
   * free plan in the catalog, the free plan is a subscription too, marked
   * `free: true`; `null` when there is none at all (no free plan, or
   * not started yet).
   */
  subscription: ComputedRef<BillingSubscription | null | undefined>
  /** Every subscription for the user (incl. ended/expired trials), or `undefined` while loading. */
  subscriptions: ComputedRef<BillingSubscription[] | undefined>
  /**
   * The catalog key of the current plan (`'free'`, `'pro'` — a yearly
   * price reads as its plan's key), `null` without one, `undefined`
   * while loading or for a product the catalog does not name.
   */
  plan: ComputedRef<string | null | undefined>
  /** `true` once a paid subscription is known: one that is not the free plan. */
  isSubscribed: ComputedRef<boolean>
  /** `true` once it's known the user is on the free plan, or on no subscription at all. */
  isFree: ComputedRef<boolean>
  /**
   * The plan pass the workspace holds, gifted for a time: the plan's catalog
   * key, how many months it was given for, and when it started and ends.
   * `null` when there is none. A pass reads as a plan held, not as the free
   * plan: `isSubscribed` is `true` and `isFree` `false` while it runs.
   */
  pass: ComputedRef<GiftedPass | null>
  /** `true` until the subscription state has loaded (always `false` when signed out, and once a read failed). */
  isLoading: ComputedRef<boolean>
  /** `true` while an action (checkout, portal, a lifecycle change, …) runs. */
  isPending: ComputedRef<boolean>
  /**
   * Whether the caller may buy and manage the billing — check out, change,
   * cancel, pause or resume the plan, open the portal — as the server
   * decides it (the scaffolded `getBillingAccess`), with the same fresh
   * reads: a workspace's owner and admins may, its other members read the
   * plan and spend the credits, an administrator impersonating someone may
   * not, and with `billTo: 'user'` every account manages its own. `true`
   * while that is not known (signed out, loading), so a pricing page still
   * shows its plans to a visitor; the server refuses whoever it must either
   * way (`forbidden`, reason `not_billing_manager`).
   */
  canManage: ComputedRef<boolean>
  /**
   * Whether the cancel flow has a save offer for some reason
   * (`setupBilling({ lifecycle: { saveOffers } })`): the billing section of
   * `/settings` then opens `<CancelFlow>` for "Cancel plan". `false` until
   * known.
   */
  saveOffers: ComputedRef<boolean>
  /**
   * Whether a paid checkout joins the topics with `softOptIn` (the EU soft
   * opt-in, `setupEmail({ topics })`): `<PricingTable>` and
   * `<BillingCheckoutLink>` then show the notice and its "Don't email me"
   * box, and a checkout of yours should too (`checkout(id, { emailOptOut })`).
   * `false` until known.
   */
  softOptIn: ComputedRef<boolean>
  /**
   * Why the last action failed, else why the subscription, the subscription
   * list or the products could not be read, else `null`. An action clears
   * its own failure when the next one starts.
   */
  error: ComputedRef<BackendError | null>
  /**
   * Provider subscription status (`active`, `trialing`, `past_due`, `paused`,
   * `canceled`, …): the free plan's (`active`) when it is a subscription,
   * `null` without any subscription, `undefined` while loading.
   */
  status: ComputedRef<string | null | undefined>
  /** `true` when the subscription is set to end when the paid period does. */
  cancelAtPeriodEnd: ComputedRef<boolean>
  /**
   * When a paused subscription resumes by itself, `null` when nothing is
   * scheduled. Kept from the subscription's webhooks and from the response
   * of `pause`, so it reads back as soon as the pause call returns: since
   * `pause` takes effect at the end of the period, it is set while
   * `isPaused` is still `false`.
   */
  resumesAt: ComputedRef<Date | null>
  /** End of the trial period, `null` when the plan has no trial. */
  trialEnd: ComputedRef<Date | null>
  /** `true` while the subscription is in its trial period. */
  isTrialing: ComputedRef<boolean>
  /** `true` while the subscription is paused (its `status` is `paused`). */
  isPaused: ComputedRef<boolean>
  /**
   * `true` while a payment failed and the provider retries it (the
   * `status` is `past_due`): the plan still runs, and the customer updates
   * the payment method in the portal (`portal()`).
   */
  isPastDue: ComputedRef<boolean>
  /**
   * `true` while the page refreshes the entitlements after the customer came
   * back from checkout: the checkout-return plugin found the checkout's id
   * on the address, took it off and is syncing once. The new plan reads
   * back as soon as it is `false` again.
   */
  isFinishingCheckout: ComputedRef<boolean>
  /**
   * The plan change scheduled for the start of the next period, `null` when
   * none. Kept from the subscription's webhooks and from the response of a
   * plan change, so it reads back as soon as `changePlan` returns.
   */
  pendingChange: ComputedRef<PendingPlanChange | null>
  /** Generate a checkout for the given product(s) and open it (returns the URL). */
  checkout: (productIds: string | string[], options?: CheckoutOptions) => Promise<string>
  /** Open the billing customer portal (returns the URL). */
  portal: (options?: { returnUrl?: string, redirect?: boolean }) => Promise<string>
  /**
   * Switch the active subscription to another product (upgrade/downgrade).
   * From a yearly price to a monthly one the switch waits for the paid
   * year's end, whatever `proration` says: it reads back as `pendingChange`.
   */
  changePlan: (productId: string, options?: ChangePlanOptions) => Promise<void>
  /**
   * Cancel the active subscription — at period end by default, with the
   * customer's optional reason and comment, which go with the cancellation
   * itself. Where the reason has a save offer
   * (`setupBilling({ lifecycle: { saveOffers } })`) and nothing bars one, it
   * answers `{ offer }` instead, and cancels nothing: the next call, or one
   * with `offer: false`, cancels. Otherwise `{ canceled: true, endsAt }`
   * (epoch ms, when the plan ends). Rejects as `invalid_input` (reason
   * `cancel_scheduled`) when it is already set to cancel: the provider takes
   * one cancellation per period.
   */
  cancel: (options?: CancelOptions) => Promise<CancelOutcome>
  /**
   * Accept the save offer `cancel` answered with: the server applies what it
   * made (a pause, a downgrade at the period's end, a discount), once.
   * Rejects as `invalid_input` (`offer`) for an offer it did not make, one
   * already taken, or one no longer open.
   */
  acceptOffer: (offer: SaveOffer | string) => Promise<void>
  /**
   * Undo a pending cancellation, putting the subscription back on renewal.
   * Rejects as `invalid_input` (reason `no_cancel_scheduled`) when none is set.
   */
  uncancel: (options?: SubscriptionTargetOptions) => Promise<void>
  /**
   * Undo the plan change scheduled for the next period (`pendingChange`),
   * so the subscription renews on the plan it has. Rejects as
   * `invalid_input` (reason `no_change_scheduled`) when none is scheduled.
   */
  cancelPendingChange: (options?: SubscriptionTargetOptions) => Promise<void>
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
  /** Why the last load failed (see `failureOf`), `null` otherwise. Loads never reject. */
  error: ComputedRef<BackendError | null>
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
  /**
   * Who reads (the account and its active workspace): when it changes, the
   * history on screen is another billing entity's, so it clears at once,
   * not only once the new reader's first page arrives.
   */
  reader?: () => unknown
}

/** Per-call options for `useGifts().send`. */
export interface GiftOptions {
  /** A plain-text note of at most 500 characters, no links, shown to the recipient inside the app. */
  message?: string
  metadata?: Record<string, string>
  /** Where the purchaser returns after paying. Defaults to the current URL. */
  successUrl?: string
  /** Open in the same tab instead of a new one (redirect checkout). */
  redirect?: boolean
  /**
   * The currency to pay in, lower-case ISO 4217: one the catalog prices the
   * pack in (`usePricing().currencies`); one it does not is refused as
   * `invalid_input` (`currency`). Omit for the catalog's own.
   */
  currency?: string
}

/**
 * Reactive billing state plus the full subscription lifecycle — checkout,
 * gift, portal, plan change and undoing a scheduled one, cancel/uncancel,
 * pause/resume — linked to your
 * auth user. Works with no arguments via the auto-provided `api.billing`
 * namespace; pass `{ api }` to override.
 *
 * Follows the composable conventions: the reads never throw (a failed read
 * shows in `error`), and every action resolves or rejects with the error the
 * call threw, mirrors it into `error` and counts toward `isPending`. Lifecycle
 * reads (`status`, `cancelAtPeriodEnd`, `trialEnd`, `resumesAt`,
 * `pendingChange`, …) come off the subscription record, and an action whose
 * function the backend has not deployed rejects only when it is called.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { isSubscribed, checkout, isPending, error } = useBilling()
 * </script>
 * <template>
 *   <p v-if="isSubscribed">Pro</p>
 *   <p v-if="error">{{ error.message }}</p>
 *   <button :aria-disabled="isPending || undefined" @click="isPending || checkout(productId, { utm: { source: 'newsletter' } })">
 *     Upgrade
 *   </button>
 * </template>
 * ```
 */
export function useBilling(options: UseBillingOptions = {}): UseBillingReturn {
  const billing = useBackendNamespace<BillingApi>('billing', 'useBilling', options.api)

  const products = billing.getConfiguredProducts
    ? useLiveQuery(billing.getConfiguredProducts, {})
    : absentQuery<Record<string, BillingProduct | undefined>>()
  if (!billing.getConfiguredProducts && diagnostics.enabled) {
    console.warn('[nuxt-backend] useBilling(): the backend exports no `getConfiguredProducts`, so there are no products to show. Export it from backend/billing.ts (npx nuxt-backend doctor checks the billing exports).')
  }

  // The user-scoped subscription queries resolve the current user server-side
  // and return `null` for claimless callers (signed out, or the auth-handshake /
  // reconnect window). Additionally gate them on auth state, read via `inject`
  // (not `useConvexAuth`, which throws) so `useBilling` still works without the
  // auth integration. When signed out, the user is simply on the free plan.
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth != null && !auth.isAuthenticated.value)
  const userScopedArgs = () => (signedOut.value ? 'skip' as const : {})

  const listRead = billing.listAllSubscriptions
    ? useLiveQuery(billing.listAllSubscriptions, userScopedArgs)
    : absentQuery<BillingSubscription[] | null>()
  const subscriptions = computed<BillingSubscription[] | undefined>(() => {
    if (signedOut.value) return []
    // Server-side null = no billing entity yet — same as having no subscriptions.
    return listRead.data.value === null ? [] : listRead.data.value
  })

  // Prefer an explicit `getCurrentSubscription` query; otherwise derive the
  // active subscription from the full list.
  const currentRead = billing.getCurrentSubscription
    ? useLiveQuery(billing.getCurrentSubscription, userScopedArgs)
    : null
  const currentSubscription = computed<BillingSubscription | null | undefined>(() => {
    if (signedOut.value) return null
    if (currentRead) return currentRead.data.value
    const all = subscriptions.value
    if (all === undefined) return undefined
    return all.find(s => s.status === 'active' || s.status === 'trialing') ?? null
  })
  // What the subscription state waits on: the current read, else the list.
  const stateRead = currentRead ?? listRead

  // Lifecycle fields live on the subscription record. Anything a record does
  // not carry simply reads as "not set" instead of breaking the UI — the same
  // degradation as a missing function.
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
  const resumesAt = field(subscription => toBillingDate(subscription.resumesAt))

  // Who may buy and manage, as the server decides it on every billing call.
  const { canManage, saveOffers, softOptIn } = useBillingAccess(billing.getBillingAccess)

  const { isPending, failure, run } = useActionState(() => signedOut.value)
  const checkout = createCheckout(billing)
  const runPortal = billing.generateCustomerPortalUrl ? useAction(billing.generateCustomerPortalUrl) : null
  const runUpdate = billing.updateSubscription ? useAction(billing.updateSubscription) : null
  const runCancelSubscription = billing.cancelSubscription ? useAction(billing.cancelSubscription) : null
  const runUncancel = billing.uncancelSubscription ? useAction(billing.uncancelSubscription) : null
  const runCancelChange = billing.cancelPendingChange ? useAction(billing.cancelPendingChange) : null
  const runPause = billing.pauseSubscription ? useAction(billing.pauseSubscription) : null
  const runResume = billing.resumeSubscription ? useAction(billing.resumeSubscription) : null
  const runAcceptOffer = billing.acceptSaveOffer ? useAction(billing.acceptSaveOffer) : null

  return {
    // A backend without the products query has none to offer: `{}`, not
    // `undefined`, which reads as still loading.
    products: billing.getConfiguredProducts ? products.data : computed(() => ({})),
    productsError: products.error,
    subscription: computed(() => currentSubscription.value),
    subscriptions,
    plan: computed(() => {
      const subscription = currentSubscription.value
      if (subscription == null) return subscription
      return typeof subscription.productKey === 'string' ? subscription.productKey.replace(/:year$/, '') : undefined
    }),
    // The free plan is a subscription too, and still free.
    isSubscribed: computed(() => currentSubscription.value != null && currentSubscription.value.free !== true),
    isFree: computed(() => currentSubscription.value === null || currentSubscription.value?.free === true),
    pass: computed(() => {
      const pass = currentSubscription.value?.pass
      return pass ? { plan: pass.plan, ...(pass.months === undefined ? {} : { months: pass.months }), startedAt: new Date(pass.startedAt), endsAt: new Date(pass.endsAt), ...(pass.trial ? { trial: true as const } : {}) } : null
    }),
    isLoading: computed(() => !signedOut.value && stateRead.isLoading.value),
    isPending,
    canManage,
    saveOffers,
    softOptIn,
    // The last action's failure, else the first read that failed. A skipped
    // read (signed out) never fails.
    error: computed(() => failure.value ?? currentRead?.error.value ?? listRead.error.value ?? products.error.value),
    status,
    cancelAtPeriodEnd: computed(() => currentSubscription.value?.cancelAtPeriodEnd === true),
    resumesAt: computed(() => resumesAt.value ?? null),
    trialEnd: computed(() => trialEnd.value ?? null),
    // The cache can lag a status transition, so an unexpired `trialEnd` counts
    // as trialing too — the affordance a trial banner needs either way.
    isTrialing: computed(() => status.value === 'trialing'
      || (status.value === 'active' && (trialEnd.value?.getTime() ?? 0) > Date.now())),
    isPaused: computed(() => status.value === 'paused'),
    isPastDue: computed(() => status.value === 'past_due'),
    isFinishingCheckout: computed(() => finishingCheckout.value),
    pendingChange: computed(() => {
      const change = currentSubscription.value?.pendingChange as Record<string, unknown> | null | undefined
      const appliesAt = toBillingDate(change?.appliesAt)
      if (!change || typeof change.productId !== 'string' || !appliesAt) return null
      return { productId: change.productId, appliesAt }
    }),
    checkout: (productIds, opts) => run(() => checkout(productIds, opts)),
    portal: (opts = {}) => run(async () => {
      if (!runPortal) notConfigured('portal')
      const { url } = await runPortal({ returnUrl: opts.returnUrl })
      openProviderUrl(url, opts.redirect)
      return url
    }),
    changePlan: (productId, opts = {}) => run(async () => {
      if (!runUpdate) notConfigured('changePlan')
      await runUpdate({ subscriptionId: opts.subscriptionId, productId, proration: opts.proration })
    }),
    cancel: opts => run(async () => {
      if (!runCancelSubscription) notConfigured('cancel')
      const outcome = await runCancelSubscription({
        subscriptionId: opts?.subscriptionId,
        atPeriodEnd: opts?.atPeriodEnd ?? true,
        reason: opts?.reason,
        comment: opts?.comment,
        ...(opts?.offer === false ? { offer: false as const } : {}),
      })
      // A backend from before save offers answers nothing: it cancelled.
      return outcome ?? { canceled: true as const, endsAt: null }
    }),
    acceptOffer: offer => run(async () => {
      if (!runAcceptOffer) notConfigured('acceptOffer')
      await runAcceptOffer({ offerId: typeof offer === 'string' ? offer : offer.id })
    }),
    uncancel: (opts = {}) => run(async () => {
      if (!runUncancel) notConfigured('uncancel')
      await runUncancel({ subscriptionId: opts.subscriptionId })
    }),
    cancelPendingChange: (opts = {}) => run(async () => {
      if (!runCancelChange) notConfigured('cancelPendingChange')
      await runCancelChange({ subscriptionId: opts.subscriptionId })
    }),
    pause: (opts = {}) => run(async () => {
      if (!runPause) notConfigured('pause')
      const resumesAt = opts.resumesAt instanceof Date ? opts.resumesAt.getTime() : opts.resumesAt
      await runPause({ subscriptionId: opts.subscriptionId, resumesAt })
    }),
    resume: (opts = {}) => run(async () => {
      if (!runResume) notConfigured('resume')
      await runResume({ subscriptionId: opts.subscriptionId })
    }),
  }
}
