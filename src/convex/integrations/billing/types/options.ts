import type { CancellationReason, DiscountInput, ProrationBehavior, ProviderDiscount, RefundReason } from './base.js'

// What the subscription, order, usage, refund, discount and checkout
// operations take and return.

/** Shared addressing for the subscription-lifecycle operations. */
export interface SubscriptionTarget {
  /**
   * Which subscription to act on. Omit for the account's single live
   * subscription — required once `multipleSubscriptions` ({@link SetupBillingConfig})
   * is on and an entity can hold several at once.
   */
  subscriptionId?: string
}

/** Options for {@link Billing.updateSubscription} (upgrade / downgrade). */
export interface UpdateSubscriptionOptions extends SubscriptionTarget {
  /** The product to switch to. */
  productId?: string
  /** How to settle the mid-period money difference. */
  proration?: ProrationBehavior
}

/** Options for {@link Billing.cancelSubscription}. */
export interface CancelSubscriptionOptions extends SubscriptionTarget {
  /**
   * Keep the subscription running until the period it is paid for ends
   * (default). `false` revokes it immediately — benefits are withdrawn on the
   * spot and the remainder is not refunded.
   */
  atPeriodEnd?: boolean
  /** The customer's own churn reason. */
  reason?: CancellationReason
  /** The customer's own words. Never an internal note — they can read it back. */
  comment?: string
}

/** Options for {@link Billing.pauseSubscription}. */
export interface PauseSubscriptionOptions extends SubscriptionTarget {
  /**
   * When the paused subscription resumes by itself (must be after the current
   * period ends). Omit to pause until it is resumed by hand.
   */
  resumesAt?: Date
}

/**
 * What `getCurrentSubscription` returns once `multipleSubscriptions`
 * ({@link SetupBillingConfig}) is on: the array leads,
 * because with add-ons there is no single "the" subscription. The primary
 * subscription's own fields are spread alongside it, so single-plan consumers
 * (`subscription.productId`, `subscription.status`) keep reading exactly as
 * before. Still `null` when the entity has no live subscription at all — the
 * "null means free plan" contract never changes.
 */
export type CurrentSubscriptions = {
  /** Every live subscription, in the provider's order. */
  subscriptions: Array<Record<string, unknown>>
} & Record<string, unknown>

/** Options for {@link Billing.getOrders}. */
export interface OrdersOptions {
  /** Orders per page (1–100, default 10). */
  limit?: number
  /** An opaque page token from a previous page's `nextCursor`. */
  cursor?: string
  /** The provider's 1-based page number — the raw form of `cursor`. */
  page?: number
}

/**
 * A past charge, normalized for a Convex action's return value: the provider's
 * `Order` fields with every date rendered as an ISO string (Convex cannot
 * serialize `Date`). The index signature keeps every other provider field
 * reachable without a cast.
 */
export type BillingOrder = {
  id: string
  createdAt: string
  status: string
  /** Amount in the currency's minor unit (cents), after discounts and taxes. */
  totalAmount: number
  currency: string
  paid: boolean
  /** Assigned when the invoice is finalized; `null` on draft orders. */
  invoiceNumber: string | null
  /** Whether an invoice PDF exists yet — {@link Billing.getInvoiceUrl} needs one. */
  isInvoiceGenerated: boolean
} & Record<string, unknown>

/** A page of provider records, plus the token that reads the next one. */
export interface BillingPage<Item> {
  items: Item[]
  pagination: { totalCount: number, maxPage: number }
  /** Pass back as `cursor` to read the next page; absent on the last one. */
  nextCursor?: string
}

/** Options for {@link Billing.getUsageHistory}. */
export interface UsageHistoryOptions {
  /**
   * Which meter's consumption to read: a configured credit-meter name
   * (`'credits'`) or a raw meter id. Omit for every ingested event on the
   * account.
   */
  meter?: string
  /** Events per page (1–100, default 10). */
  limit?: number
  /** An opaque page token from a previous page's `nextCursor`. */
  cursor?: string
  /** The provider's 1-based page number — the raw form of `cursor`. */
  page?: number
  /** Only events at or after this moment. */
  startTimestamp?: Date
  /** Only events at or before this moment. */
  endTimestamp?: Date
}

/**
 * One ingested usage event as the provider's events API returns it, normalized
 * for a Convex action's return value (dates as ISO strings). `units` is
 * resolved from the meter's value property — the same property a spend ingests
 * — and is absent when the meter is unknown or counts events rather than
 * summing a property.
 */
export type UsageEvent = {
  id: string
  timestamp: string
  name: string
  units?: number
  metadata?: Record<string, string | number | boolean>
} & Record<string, unknown>

/** Options for {@link Billing.refundOrder}. */
export interface RefundOrderOptions {
  orderId: string
  /**
   * Amount to refund in the currency's minor unit (cents). Omit to refund
   * everything still refundable on the order.
   */
  amount?: number
  reason: RefundReason
  /**
   * Withdraw the order's benefits as well. The provider only allows this for
   * one-time purchases — a subscription's benefits are withdrawn when the
   * subscription itself is revoked.
   */
  revokeBenefits?: boolean
  /** Extra key-value data stored on the refund. */
  metadata?: Record<string, string | number | boolean>
}

/** The outcome of {@link Billing.refundOrder}, JSON-normalized. */
export interface RefundRecord {
  id: string
  orderId: string
  status: string
  reason: string
  /** Refunded amount in the currency's minor unit (cents). */
  amount: number
  currency: string
  revokeBenefits: boolean
}

/** Filters for {@link BillingDiscounts.list}. */
export interface DiscountListOptions {
  /** Match against the discount's name. */
  query?: string
  /** Discounts per page (1–100, default 10). */
  limit?: number
  /** The provider's 1-based page number. */
  page?: number
}

/**
 * Discount (coupon) management. Privileged by design — a public action that
 * mints discounts would let anyone create a 100%-off code — so these are
 * server-side methods, not registered functions: call them from an
 * `internalAction` or an admin-tier action of your own.
 */
export interface BillingDiscounts {
  /** Create a discount / coupon. Accepts the full provider shape (fixed or percentage). */
  create: (discount: DiscountInput) => Promise<{ id: string, code: string | null }>
  /** List discounts (newest provider order), one page at a time. */
  list: (options?: DiscountListOptions) => Promise<BillingPage<ProviderDiscount>>
  /** Permanently delete a discount. Redemptions already applied stay applied. */
  remove: (discountId: string) => Promise<void>
}

/**
 * Pre-filled customer details for a checkout session. Every field is only a
 * default the customer can still change — the provider owns the form.
 */
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
  /**
   * Bill a business rather than an individual. Turning this on makes the
   * provider require a full billing address and billing name.
   */
  business?: boolean
}

/**
 * Campaign attribution a checkout carries, as a campaign link's UTM
 * parameters. Stored on the order or subscription as flat `utm_source`,
 * `utm_medium`, … metadata, the way the provider's own checkout links store
 * it; each value is trimmed and cut to 100 characters.
 */
export interface CampaignAttribution {
  source?: string
  medium?: string
  campaign?: string
  term?: string
  content?: string
}

/**
 * A trial the server grants at checkout in place of the product's own: 1 to
 * 30 days, in days or weeks. No months: the provider counts a month as a
 * calendar month, up to 31 days.
 */
export interface CheckoutTrial {
  interval: 'day' | 'week'
  /** Number of intervals. Defaults to 1. */
  count?: number
}

/**
 * Everything {@link Billing.api}'s `generateCheckoutLink` accepts from a
 * client. A type alias rather than an interface so it can type the
 * registered action itself (Convex's `DefaultFunctionArgs` needs an implicit
 * index signature, which only aliases get).
 *
 * What is bought and where the buyer lands are checked on the server: every
 * product must be in the app's catalog, and `origin` and `successUrl` on
 * the site's own origin (`SITE_URL`) or one of `trustedOrigins`. The trial
 * is the product's own, and a discount is the code the customer types or
 * `discountCode`: a different trial or a discount by id is the server's
 * choice, through {@link Billing.checkout}.
 */
export type CheckoutOptions = {
  /** Provider product ids, each one from the app's catalog. */
  productIds: string[]
  /** The origin of the page embedding the checkout (for the iframe handshake). */
  origin: string
  /** Where the buyer lands after paying. */
  successUrl: string
  /** Upgrade one of the entity's own free subscriptions instead of starting a new one. */
  subscriptionId?: string
  /** The app's own keys: none the package reads back (see `RESERVED_METADATA_KEYS`). */
  metadata?: Record<string, string>
  /** BCP-47 language tag for the checkout UI. */
  locale?: string
  /** Pre-filled customer details. */
  prefill?: CheckoutPrefill
  /** Values for the organization's custom checkout fields, keyed by field slug. */
  customFields?: Record<string, string | number | boolean>
  /** Require the full billing address, not just the country. */
  requireBillingAddress?: boolean
  /**
   * Let the customer type a discount code into the provider's own checkout
   * (default `true`). The provider validates it against the live catalog.
   */
  allowDiscountCodes?: boolean
  /**
   * A discount code to apply up front: a campaign link's code, say. The
   * provider checks it like one the customer typed, and a code it does not
   * know refuses the checkout as `invalid_input` (`discountCode`).
   */
  discountCode?: string
  /** Campaign attribution, stored as `utm_*` metadata. */
  utm?: CampaignAttribution
}

/**
 * What {@link Billing.checkout} takes from server code: everything a client
 * may send, plus what only the server chooses.
 */
export type ServerCheckoutOptions = CheckoutOptions & {
  /**
   * The trial for this checkout: `false` removes the product's own, an
   * override grants at most 30 days. Omit to keep the product's own trial.
   */
  trial?: CheckoutTrial | false
  /**
   * Pre-apply a discount by **id** — the form the provider's checkout
   * payload takes, and the server's to choose: a 100% discount minted for
   * one claim must never be a client's to name.
   */
  discountId?: string
}
