// The entitlement, credit and gift records the billing modules pass around.

import type { CatalogInterval } from '../../../catalog.js'

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

/** A single granted benefit (entitlement) in a customer's billing state. */
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
  /** A license key's display key: masked but for its last characters. */
  licenseKey?: string
  /** How many files a download benefit grants. */
  files?: number
  /** The repository a repository benefit opens, as `owner/name`. */
  repository?: string
  /**
   * The benefit's **live** provider metadata (read from the benefit, not the
   * grant-time snapshot in customer state). Lets consumers feature-gate by a
   * friendly key — set e.g. `{ key: 'premium' }` on the benefit and check
   * `useFeatures().has('premium')`.
   */
  metadata?: Record<string, string | number | boolean>
}

/** A credit-meter balance in a customer's billing state (prepaid credits). */
export interface EntitlementMeter {
  meterId: string
  consumedUnits: number
  creditedUnits: number
  balance: number
  /**
   * The granting subscription's current period (epoch ms) — a meter has no
   * period of its own in the provider's model. Absent for meters granted only
   * by one-time credit packs.
   */
  cycleStart?: number
  cycleEnd?: number
  /** Whether unspent credited units carry into the next cycle. */
  rollover?: boolean
}

/**
 * A user's full billing entitlement state — active plans, granted benefits, and
 * credit-meter balances — normalized for caching into the reactive component table.
 */
export interface CustomerEntitlements {
  customerId: string | null
  activeProductIds: string[]
  benefits: EntitlementBenefit[]
  meters: EntitlementMeter[]
}

/**
 * A named credit meter: how a spend by friendly name (`meter: 'credits'`)
 * resolves to the provider meter and its ingestion shape. Declared in
 * `setupBilling({ credits })` or generated into `billing.generated.ts` by
 * `nuxt-backend billing sync`.
 */
export interface CreditMeterConfig {
  /** The provider meter id the balance guard runs against. */
  meterId: string
  /** Event name the meter's filter matches. Defaults to the config key. */
  eventName?: string
  /**
   * For sum-aggregation meters: the metadata property carrying the amount —
   * ingested as `metadata[property] = value`. Omit for count meters (which
   * count events, so each spend is exactly 1 credit).
   */
  property?: string
}

/**
 * A catalog discount as `billing sync` left it at the provider: its id and
 * its terms, which checkout applies by key and `getPricing` shows. Dates
 * are ISO strings, amounts in the currency's smallest unit.
 */
export interface BillingCatalogDiscount {
  /** The provider's discount id. */
  id: string
  /** The name the customer sees at checkout. */
  name: string
  /** Its code: a public promotion. Absent on one only the server applies. */
  code?: string
  /** Percent off, `20` for 20%. */
  percentOff?: number
  /** A fixed amount off per currency, lower-case ISO 4217 code → cents. */
  amountOff?: Record<string, number>
  duration: 'once' | 'forever' | 'repeating'
  /** The months a `repeating` discount lasts. */
  months?: number
  startsAt?: string
  endsAt?: string
  /** The products it applies to: every one a checkout may take it on. */
  productIds: string[]
}

/** A plan's pass products in the generated map, and the length of its reverse trial when it has one. */
export interface CatalogPassIds {
  /** The free pass product that carries the plan's benefits. */
  pass: string
  /** The private purchase product per gift length in months, keyed `'3'`. */
  months: Record<string, string>
  /** Days of the reverse trial every new workspace starts on this pass for (LIFECYCLE). */
  trialDays?: number
}

/** The environment-keyed id map `nuxt-backend billing sync` generates. */
export interface BillingCatalogIds {
  /**
   * Product key → provider product id: packs by their catalog key, a plan's
   * monthly price by the plan's key and its yearly one as `<plan>:year`.
   * A retired plan's products stay listed, so a subscriber's plan still
   * reads back by its key; the checkout never sells them.
   */
  products?: Record<string, string>
  /** Plan key → its product per priced interval, retired plans included. */
  plans?: Record<string, Partial<Record<CatalogInterval, string>>>
  /** The keys of retired plans: archived at the provider, never sold again. */
  retired?: string[]
  /** The catalog keys of `products` that are credit packs: what a gift may buy. */
  packs?: string[]
  /**
   * Pack key → the provider id of its private gift product: the same prices,
   * no benefits, bought by a purchaser for someone else. Never sold on its
   * own, so it is outside `products` and the checkout allow-list.
   */
  gifts?: Record<string, string>
  /**
   * Plan key → its gift as a plan pass: the private purchase product per
   * length in months (`months`, keyed `'3'`) and the one free pass product
   * that carries the plan's benefits (`pass`). Neither is sold on its own.
   * `trialDays` marks the plan whose trial is a reverse trial: every new
   * workspace starts on its pass for that many days (LIFECYCLE).
   */
  passes?: Record<string, CatalogPassIds>
  /** Catalog key → credit meter config. */
  meters?: Record<string, CreditMeterConfig>
  /**
   * Quota key → what it counts, as the catalog's `description` says it:
   * each one is reported by `getFeatures` (as `useFeatures().quota()`
   * reads it), granted or not.
   *
   * @experimental
   */
  quotas?: Record<string, string>
  /**
   * The free plan's key (`plans` holds its product): every billing entity
   * starts on it, and returns to it when a paid plan ends.
   */
  free?: string
  /**
   * The currency a visitor pays in when the catalog does not price theirs,
   * lower-case ISO 4217: written for a catalog that prices more than one.
   */
  currency?: string
  /** Discount key → the discount and its terms. A retired one is left out: nothing applies it again. */
  discounts?: Record<string, BillingCatalogDiscount>
}

/** A prepaid-credit consumption event (drawn from the customer's meter balance). */
export interface SpendCreditsEvent {
  /**
   * The billing entity id — the workspace id (`billTo: 'workspace'`, the
   * default) or the auth user id (`billTo: 'user'`). Omit to resolve it from
   * the caller's identity (the active workspace / signed-in user).
   */
  userId?: string
  /**
   * A configured credit meter name (`setupBilling({ credits })` / catalog key)
   * — the preferred spend target: resolves the meter id, event name, and
   * ingestion shape in one word.
   */
  meter?: string
  /** The meter event name. Defaults to the configured meter's `eventName`/key. */
  name?: string
  /**
   * A raw credit meter id to guard against (escape hatch when no named meter
   * config exists). When a meter resolves (by `meter` or `meterId`), the spend
   * is **reserved** against the cached balance first and **blocked** (throws)
   * if it is below `value` — keeping credits strictly prepaid (never billed
   * as overage). The reservation settles after the provider event ingests, or
   * releases on failure, so a failed run never consumes credits.
   */
  meterId?: string
  /**
   * Credits required for this spend (default `1`): a finite number above
   * zero. Anything else is refused before the balance or the provider sees it.
   */
  value?: number
  /**
   * Let the balance go negative instead of refusing the spend — the
   * pay-as-you-go case: the meter has no credit benefit behind it, so every
   * unit is overage the provider invoices at the end of the cycle. Off by
   * default: credits stay strictly prepaid.
   */
  allowOverage?: boolean
  /** Event properties used by the meter's aggregation/filter. */
  metadata?: Record<string, string | number | boolean>
  /** Idempotency key to prevent double-counting (defaults to a random UUID). */
  externalId?: string
  /** Event time (defaults to now). */
  timestamp?: Date
}

/**
 * A credit reservation's addressing data — serializable, so a spend can
 * reserve in one function and settle/release in another (the streaming HTTP
 * dispatcher does exactly that). Being plain data, it is checked again when it
 * settles: a `value` that is not a finite number above zero is refused.
 */
export interface SpendReservation {
  /** The billing entity the spend belongs to. */
  entityId: string
  /** Idempotency key shared by the reservation and the provider event. */
  externalId: string
  /** Whether a meter guard actually reserved cached balance. */
  reserved: boolean
  /** The configured meter name (when reserved via one). */
  meter?: string
  /** The raw meter id (when reserved). */
  meterId?: string
  /** Credits reserved. */
  value: number
}

/** What some work cost the app, for the billing provider's cost insights ({@link Billing.reportCost}). */
export interface CostReport {
  /** The billing entity the work was for. */
  userId: string
  /** The event's name. */
  name: string
  /** Idempotency key: the same report sent twice counts once. */
  externalId: string
  /** The charge this cost belongs to, by its `externalId`. */
  parentId?: string
  /** What the work cost, in US cents; left out when nothing reported a cost. */
  cents?: number
  /** The model the work called, and the tokens it used. */
  llm?: { vendor: string, model: string, inputTokens: number, outputTokens: number, cachedInputTokens?: number }
  /** The member who started the work. */
  memberId?: string
}

/** A prepaid-credit refund (compensating event on a sum meter). */
export interface RefundCreditsEvent {
  /** The billing entity id; omit to resolve from the caller's identity. */
  userId?: string
  /** The configured credit meter name to refund on (must be a sum meter). */
  meter: string
  /** Credits to give back: a finite number above zero. */
  value: number
  /** Extra event properties. */
  metadata?: Record<string, string | number | boolean>
  /** Idempotency key (defaults to a random UUID). */
  externalId?: string
}

/** The cached entitlement state served by the component (`getByUser` shape). */
export type CachedEntitlements = Omit<CustomerEntitlements, 'customerId'> & { customerId: string | null }

/**
 * A gift purchase record, as stored by the `backend` component
 * (`components.backend.gifts.*`).
 */
export interface GiftRecord {
  id: string
  recipientEmail: string
  purchaserUserId: string
  /** Before 0.2 only: gifts no longer keep the purchaser's email. */
  purchaserEmail?: string
  purchaserName?: string
  /** The credit pack's provider product: what the recipient's claim grants. */
  productIds: string[]
  message?: string
  /**
   * `'pending'` (the purchaser's checkout is open) → `'paid'` (the purchase
   * is paid and claimable) → `'claimed'`, or `'refunded'` when the purchase
   * was refunded before the claim.
   */
  status: string
  /** Before 0.2 only: the customer keyed by the recipient's email that the purchase was billed to. */
  billingCustomerId?: string
  /** The purchase order, on the purchaser's own customer. */
  billingOrderId?: string
  /** The billing entity that paid. */
  purchaserEntityId?: string
  /** The pack's catalog key. */
  pack?: string
  /** The private gift product the purchaser bought. */
  giftProductId?: string
  /** What the purchase charged, in the currency's smallest unit. */
  amount?: number
  currency?: string
  /** The single-use 100% discount the recipient claims the pack with. */
  discountId?: string
  claimingEntityId?: string
  claimingUserId?: string
  claimOrderId?: string
  claimedByUserId?: string
  claimedEntityId?: string
  createdAt: number
  paidAt?: number
  /** When the recipient's notification email went out — stamped only after the send succeeded. */
  notifiedAt?: number
  claimedAt?: number
  refundedAt?: number
  /** A plan pass: the plan's catalog key, and the months the purchaser paid for. */
  plan?: string
  months?: number
  /** The date the purchaser chose for the notice (the payment's own moment when none), and when it went out: the recipient sees and claims the gift from then. */
  deliverAt?: number
  deliveredAt?: number
  /** The last notice sent (the first, the reminder or a resend), and how many. */
  noticedAt?: number
  noticeCount?: number
  /** How many times the purchaser changed the address: each address's notices carry their own idempotency keys. */
  recipientChanges?: number
  /** The one reminder, a week after delivery. */
  remindedAt?: number
  /** A claimed pass: the subscription it switched, its start and end, and the steps taken toward the end. */
  passSubscriptionId?: string
  passStartedAt?: number
  passEndsAt?: number
  passReturnScheduledAt?: number
  passNoticedAt?: number
  passEndedAt?: number
  /** A reverse trial's pass (LIFECYCLE), which nobody bought: the workspace started on it. */
  reverseTrial?: boolean
}

/** A task the gift sweep found due. */
export interface GiftTask {
  kind: 'deliver' | 'remind' | 'schedule_return' | 'end_pass' | 'pass_notice'
  giftId: string
}

/** Credits a price grants, from the live product's meter-credit benefit. */
export interface PricedCredits {
  /** The catalog meter they land on; absent for a meter the catalog does not name. */
  meter?: string
  /** Units per billing cycle (a plan), or once (a pack). */
  units: number
  /** Whether unspent units carry over into the next cycle. */
  rollover: boolean
}

/** A free trial a plan's price opens with, as the provider holds it. */
export interface PricedTrial {
  /** `day` | `week` | `month` | `year`. */
  interval: string
  count: number
}

/** One of a plan's prices: its product, at one billing interval. */
export interface PricedPlanPrice {
  productId: string
  /** What one interval costs, in the currency's smallest unit: in {@link Pricing.currency} when the product is priced in it. */
  amount: number
  /** Lower-case ISO 4217 code. */
  currency: string
  /** The same price per month (a year's divided by twelve, unrounded), so plans compare across intervals. */
  monthly: number
  /**
   * How many percent a yearly price saves against twelve monthly ones of
   * the same plan and currency, rounded down; absent when it saves nothing.
   */
  savings?: number
  credits?: PricedCredits
  trial?: PricedTrial
  /**
   * This price's product is archived, or its plan retired: sold to nobody
   * new. Listed so the people on it still see their card; nothing offers
   * it to anyone else. Absent on a price that sells.
   */
  archived?: true
  /** The asked-for promotion ({@link Pricing.promotion}) on this price, when it applies to it. */
  promotion?: PricedOffer
}

/** A price with a promotion: what one payment costs while it applies. */
export interface PricedOffer {
  /** What one payment costs with it, in the price's currency: never below zero. */
  amount: number
  /** What it takes off one payment, in the price's currency. */
  off: number
}

/**
 * A public promotion as a pricing page shows it: the catalog discount's
 * real terms, from what `billing sync` pushed. Never its code, and never
 * a countdown: the end is a date.
 */
export interface PricedPromotion {
  /** The catalog key. */
  key: string
  /** The name the customer sees at checkout. */
  name: string
  /** Percent off, `20` for 20%; absent on a fixed amount off. */
  percentOff?: number
  duration: 'once' | 'forever' | 'repeating'
  /** The months a `repeating` promotion lasts. */
  months?: number
  /** When it can first be redeemed (ISO); a page shows it from then on. */
  startsAt?: string
  /** When it can no longer be redeemed (ISO): the offer's real end. */
  endsAt?: string
}

/** A plan as a pricing page shows it, from its live products. */
export interface PricedPlan {
  /** The catalog key. */
  key: string
  /** The product's name at the provider. */
  name: string
  description: string | null
  /**
   * A retired plan: archived, sold to nobody new. Listed so its
   * subscribers' card still shows; `<PricingTable>` shows it to them alone.
   */
  retired: boolean
  /**
   * The catalog's free plan: every billing entity is on it until it buys
   * another, and back on it when that one ends. Never checked out.
   */
  free?: true
  /** One entry per interval the plan is priced at. */
  prices: Partial<Record<CatalogInterval, PricedPlanPrice>>
  /**
   * The names of the feature benefits the plan grants, at the provider. A
   * benefit that carries quotas is listed in {@link PricedPlan.quotas}
   * instead.
   */
  features: string[]
  /**
   * The key of every benefit the plan grants, its credits included: what
   * `billing.requireFeature`, `useFeatures().has()` and `<UpgradePrompt>`
   * match a feature by (its `key` metadata, else its benefit id). From the
   * prices that still sell, or from all of them for a retired plan.
   */
  featureKeys: string[]
  /**
   * How many of each quota the plan allows, by quota key: a whole number,
   * or `'unlimited'`. A quota the plan does not name allows none. From the
   * live benefits' metadata, as the gate reads it, and from the prices that
   * still sell (all of them for a retired plan). Absent from a backend
   * older than plan quotas.
   *
   * @experimental
   */
  quotas?: Record<string, number | 'unlimited'>
}

/** A credit pack as a pricing page shows it, from its live product. */
export interface PricedPack {
  key: string
  productId: string
  name: string
  description: string | null
  amount: number
  currency: string
  credits?: PricedCredits
  /**
   * What one credit costs, in the currency's smallest unit (unrounded).
   * Absent for a pack the comparison skips: no single credit benefit, a
   * custom or $0 price, or credits that do not roll over.
   */
  perCredit?: number
  /**
   * How many percent less per credit than the costliest pack on the same
   * meter and currency, rounded down; absent when it is no cheaper.
   */
  lessPerCredit?: number
  /** The one pack whose credits cost least, among two or more comparable ones. */
  isBestValue: boolean
  /** The asked-for promotion ({@link Pricing.promotion}) on this pack, when it applies to it. */
  promotion?: PricedOffer
}

/**
 * One quota of a billing entity: how many its plan allows and how many it
 * holds. `limit` is the most any grant allows — `0` when none names the
 * quota, so a quota fails closed — or `'unlimited'`.
 *
 * @experimental
 */
export interface QuotaUsage {
  limit: number | 'unlimited'
  /** How many are counted: what `requireQuota` claimed, less what `releaseQuota` gave back. */
  used: number
  /**
   * What the quota counts, as the catalog's `description` says it
   * (`'projects'`): absent for a quota the catalog does not declare, which
   * only a grant names.
   */
  description?: string
}

/** What `getPricing` answers: the plans and packs on sale, in catalog order. */
export interface Pricing {
  plans: PricedPlan[]
  packs: PricedPack[]
  /**
   * The currency the prices are in, lower-case ISO 4217: the one asked
   * for when the catalog prices it, else the catalog's own. A product with
   * no price in it shows its price in the catalog's.
   */
  currency?: string
  /** Every currency the catalog prices its products in, its own first: what a currency switch offers. */
  currencies?: string[]
  /**
   * The public promotion `getPricing` was asked for (`discount`: its key
   * or its code), when the catalog has one by that name; each price and
   * pack it applies to carries its {@link PricedOffer}. Shown only between
   * its `startsAt` and `endsAt`, which the page compares with its own clock.
   */
  promotion?: PricedPromotion
}
