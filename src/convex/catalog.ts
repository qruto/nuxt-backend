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
}

/** A one-time credit pack. */
export interface CatalogPack {
  name: string
  description?: string
  /** Price in cents. */
  price: number
  /** Credits granted once at purchase. */
  credits: CatalogCreditGrant
}

/** A feature benefit, gate-checked client-side via `useFeatures().has(key)`. */
export interface CatalogFeature {
  description: string
}

export interface BillingCatalog {
  meters?: Record<string, CatalogMeter>
  plans?: Record<string, CatalogPlan>
  packs?: Record<string, CatalogPack>
  features?: Record<string, CatalogFeature>
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
 *       credits: { meter: 'credits', units: 500 }, features: ['priority_support'] },
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
