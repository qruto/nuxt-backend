/**
 * Billing catalog-as-code: the app declares its meters, plans, packs, and
 * feature benefits once in `backend/billing.catalog.ts`, and `nuxt-backend
 * billing sync` pushes them to the billing provider (find-or-create, tagged
 * with `metadata.managedBy`), writing the resulting id map to
 * `backend/billing.generated.ts` — the only place provider UUIDs live.
 *
 * Granting stays fully provider-native: "the Pro plan includes 500
 * credits/month" is a meter-credit benefit attached to the subscription
 * product, granted by the provider every billing cycle (once at purchase for
 * one-time packs). This package only pushes the catalog and reads the
 * balances.
 *
 * Pure types + an identity helper — no runtime dependencies, importable from
 * both Convex code and the CLI.
 */

/** A credit grant a plan or pack carries (a provider meter-credit benefit). */
export interface CatalogCreditGrant {
  /** The catalog meter key the credits land on. */
  meter: string
  /** Units granted (per cycle for plans, once for packs). */
  units: number
  /**
   * Carry unused credits into the next cycle. Defaults to `false` for plan
   * grants (use-it-or-lose-it monthly allowances) and `true` for packs
   * (purchased credits keep).
   */
  rollover?: boolean
}

/** A usage meter, keyed by the event name spends use (`spendCredits({ meter })`). */
export interface CatalogMeter {
  /**
   * How events aggregate: `'sum'` (default) sums `property` across events —
   * multi-credit spends in one event; `'count'` counts events (1 credit per
   * event, not refundable).
   */
  aggregation?: 'sum' | 'count'
  /** The metadata property summed by `'sum'` meters. Default `'amount'`. */
  property?: string
  /** Event name the meter filters on. Defaults to the catalog key. */
  eventName?: string
}

/**
 * How a price is taxed. `'location'` (the default) lets the provider decide
 * from the customer's location and the organization's setting.
 */
export type CatalogTaxBehavior = 'inclusive' | 'exclusive' | 'location'

/** A free trial the plan grants before its first charge. */
export interface CatalogTrial {
  interval: 'day' | 'week' | 'month' | 'year'
  /** Number of intervals. Defaults to 1. */
  count?: number
}

/**
 * A metered price billed on top of the plan's fixed price — pay-as-you-go
 * overage, charged at the end of each cycle for what the meter recorded.
 *
 * This is the *other* way to sell a meter: `credits` prepays an allowance the
 * provider grants per cycle, `usage` bills whatever is spent. A plan can do
 * both (an included allowance, then overage) because the provider settles the
 * metered price against the meter's remaining balance.
 */
export interface CatalogUsagePrice {
  /** The catalog meter key this price bills. */
  meter: string
  /**
   * Price per unit in cents. Pass a string for sub-cent precision (up to 12
   * decimal places) — a number would lose it.
   */
  unitAmount: number | string
  /** Never charge more than this many cents per cycle, however much is used. */
  cap?: number
}

/**
 * A field the checkout collects and stores on the order/subscription — the
 * answers ride along to the provider dashboard and the webhook payloads.
 */
export interface CatalogCustomField {
  /** Input type. `'select'` needs {@link CatalogCustomField.options}. */
  type: 'text' | 'number' | 'checkbox' | 'date' | 'select'
  /** Label shown at checkout. Defaults to the catalog key. */
  name?: string
  /** Key the answer is stored under. Defaults to the catalog key. */
  slug?: string
  /** Checkout refuses to submit without an answer. Defaults to `false`. */
  required?: boolean
  /** Choices for `type: 'select'`. */
  options?: Array<{ value: string, label: string }>
}

/** A subscription plan (recurring product). */
export interface CatalogPlan {
  name: string
  description?: string
  /** Billing interval. */
  interval: 'month' | 'year'
  /** Price in cents. */
  price: number
  /** Credits included with the plan, granted every cycle. */
  credits?: CatalogCreditGrant
  /** Feature-benefit keys (from {@link BillingCatalog.features}) this plan grants. */
  features?: string[]
  /** Free trial before the first charge. */
  trial?: CatalogTrial
  /** Metered prices charged on top of `price` (pay-as-you-go overage). */
  usage?: CatalogUsagePrice[]
  /** Tax treatment of the price. Defaults to the organization's setting. */
  taxBehavior?: CatalogTaxBehavior
  /** Checkout field keys (from {@link BillingCatalog.customFields}) to collect. */
  customFields?: string[]
}

/** A one-time credit pack. */
export interface CatalogPack {
  name: string
  description?: string
  /** Price in cents. */
  price: number
  /** Credits granted once at purchase. */
  credits: CatalogCreditGrant
  /** Tax treatment of the price. Defaults to the organization's setting. */
  taxBehavior?: CatalogTaxBehavior
  /** Checkout field keys (from {@link BillingCatalog.customFields}) to collect. */
  customFields?: string[]
}

/**
 * A feature benefit, gate-checked client-side via `useFeatures().has(key)`.
 * Pushed as the provider's native feature-flag benefit; the catalog key rides
 * along in the benefit metadata, which is what the gate matches on.
 */
export interface CatalogFeature {
  description: string
}

export interface BillingCatalog {
  /**
   * ISO 4217 currency every `price` is created in, lowercase (`'usd'`,
   * `'eur'`). Defaults to the organization's default presentment currency,
   * which the provider requires on every product.
   */
  currency?: string
  meters?: Record<string, CatalogMeter>
  plans?: Record<string, CatalogPlan>
  packs?: Record<string, CatalogPack>
  features?: Record<string, CatalogFeature>
  /** Checkout fields plans and packs can collect, keyed by catalog key. */
  customFields?: Record<string, CatalogCustomField>
}

/**
 * Declare the billing catalog (typed identity). Push it with
 * `npx nuxt-backend billing sync`.
 *
 * @example
 * ```ts
 * export default defineBillingCatalog({
 *   meters: { credits: {} },
 *   plans: {
 *     pro: { name: 'Pro', interval: 'month', price: 2900,
 *       credits: { meter: 'credits', units: 500 }, features: ['priority_support'],
 *       trial: { interval: 'day', count: 14 },
 *       usage: [{ meter: 'credits', unitAmount: 5 }] },
 *   },
 *   packs: {
 *     credits500: { name: '500 credits', price: 2000, credits: { meter: 'credits', units: 500 } },
 *   },
 *   features: { priority_support: { description: 'Priority support' } },
 * })
 * ```
 */
export function defineBillingCatalog(catalog: BillingCatalog): BillingCatalog {
  return catalog
}

/**
 * The webhook event set `billing sync --webhook` subscribes the provider
 * endpoint to: the provider's full live catalog — the composed handler map
 * covers every one of these (logging, dedupe, consumer dispatch), and
 * anything newer lands in `onUnknownEvent` with a 202. Lives here —
 * dependency-free — so the CLI can import it without pulling Convex runtime
 * code. A unit test pins it against the runtime's refresh set.
 */
export const BILLING_WEBHOOK_PROVISION_EVENTS = [
  'checkout.created',
  'checkout.updated',
  'checkout.expired',
  'customer.created',
  'customer.updated',
  'customer.deleted',
  'customer.state_changed',
  'customer_seat.assigned',
  'customer_seat.claimed',
  'customer_seat.revoked',
  'member.created',
  'member.updated',
  'member.deleted',
  'order.created',
  'order.updated',
  'order.paid',
  'order.refunded',
  'subscription.created',
  'subscription.updated',
  'subscription.active',
  'subscription.canceled',
  'subscription.uncanceled',
  'subscription.revoked',
  'subscription.past_due',
  'refund.created',
  'refund.updated',
  'product.created',
  'product.updated',
  'benefit.created',
  'benefit.updated',
  'benefit_grant.created',
  'benefit_grant.cycled',
  'benefit_grant.updated',
  'benefit_grant.revoked',
  'organization.updated',
] as const
