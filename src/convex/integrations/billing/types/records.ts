// The entitlement, credit and gift records the billing modules pass around.

/** A single granted benefit (entitlement) in a customer's billing state. */
export interface EntitlementBenefit {
  id: string
  benefitId: string
  type: string
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

/** The environment-keyed id map `nuxt-backend billing sync` generates. */
export interface BillingCatalogIds {
  /** Catalog key → provider product id (plans and packs). */
  products?: Record<string, string>
  /** Catalog key → credit meter config. */
  meters?: Record<string, CreditMeterConfig>
}

/** A prepaid-credit consumption event (drawn from the customer's meter balance). */
export interface SpendCreditsEvent {
  /**
   * The billing entity id — the workspace id (`billTo: 'organization'`, the
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
  purchaserEmail?: string
  purchaserName?: string
  productIds: string[]
  message?: string
  /** `'pending'` (checkout created) → `'paid'` (order webhook) → `'claimed'`. */
  status: string
  billingCustomerId: string
  billingOrderId?: string
  claimedByUserId?: string
  claimedEntityId?: string
  createdAt: number
  paidAt?: number
  /** When the recipient's notification email went out — stamped only after the send succeeded. */
  notifiedAt?: number
  claimedAt?: number
}
