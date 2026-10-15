import type { Polar } from '@convex-dev/polar'
import type { checkoutsCreate } from '@polar-sh/sdk/funcs/checkoutsCreate.js'
import type { discountsCreate } from '@polar-sh/sdk/funcs/discountsCreate.js'
import type { discountsList } from '@polar-sh/sdk/funcs/discountsList.js'
import type { eventsIngest } from '@polar-sh/sdk/funcs/eventsIngest.js'
import type { subscriptionsUpdate } from '@polar-sh/sdk/funcs/subscriptionsUpdate.js'
import type { GenericActionCtx, GenericDataModel, GenericQueryCtx } from 'convex/server'

// The context shapes and the provider-derived vocabulary every other billing
// type and module builds on.

/**
 * Any query context — the consumer's `currentUserId` resolver runs inside the
 * lib's generic query, but its body uses the consumer's concrete ctx (e.g.
 * `authComponent.getAuthUser(ctx)`). Typing the data model as `any` makes both
 * sides assignable across the library boundary.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyQueryCtx = GenericQueryCtx<any>

/** The component reference accepted by the billing-provider client (`components.polar`). */
export type PolarComponent = ConstructorParameters<typeof Polar>[0]

/**
 * A minimal Convex context (just `runQuery`) — kept DataModel-independent and
 * decoupled from the Polar package's own (possibly older) ctx typings, so any
 * app query/action ctx is assignable. Cast to Polar's exact type internally.
 */
export type RunQueryCtx = Pick<GenericActionCtx<GenericDataModel>, 'runQuery'>
/** A context that can both read and write (sync + upsert the cache). */
export type RunWriteCtx = Pick<GenericActionCtx<GenericDataModel>, 'runQuery' | 'runMutation'>
export type PolarRunQueryCtx = Parameters<Polar['getCustomerByUserId']>[0]

/**
 * A structural rate limiter for throttling `syncEntitlements` — satisfied by
 * `setupRateLimiter(...)` from `nuxt-backend/rate-limit`, which seeds the
 * `billingSync` limit by default. Kept structural (rather than importing the
 * rate-limiter's own type) so any compatible limiter is assignable.
 */
export interface BillingRateLimiter {
  // A method signature, not a function-typed property: methods are compared
  // bivariantly, so a limiter whose `ctx` is upstream's own union of
  // mutation and action contexts still assigns to this shape.
  limit(
    ctx: RunWriteCtx,
    name: 'billingSync',
    options?: { key?: string, throws?: boolean },
  ): Promise<{ ok: boolean, retryAfter?: number }>
}

/** Full event-ingest payload (derived from the provider SDK). */
export type EventsIngestRequest = Parameters<typeof eventsIngest>[1]
/** Full discount-create payload (derived from the provider SDK) — fixed or percentage. */
export type DiscountInput = Parameters<typeof discountsCreate>[1]
/**
 * The provider's subscription-mutation union (`SubscriptionUpdate`) — one of
 * the product/proration, cancel, revoke, pause or resume shapes. Derived from
 * the installed SDK so the mappings below can never drift from it.
 */
export type SubscriptionUpdatePayload = Parameters<typeof subscriptionsUpdate>[1]['subscriptionUpdate']
/** The provider subscription record returned by a lifecycle mutation. */
export type ProviderSubscription = Extract<Awaited<ReturnType<typeof subscriptionsUpdate>>, { ok: true }>['value']
/** One discount as the provider's discounts API returns it. */
export type ProviderDiscount = Extract<Awaited<ReturnType<typeof discountsList>>, { ok: true }>['value']['result']['items'][number]
/** Full checkout-create payload (derived from the provider SDK). */
export type CheckoutCreateInput = Parameters<typeof checkoutsCreate>[1]

/**
 * How the provider settles the money difference when a subscription switches
 * product mid-period (`proration_behavior`). Omit to use the organization's
 * configured default.
 */
export type ProrationBehavior = 'invoice' | 'prorate' | 'next_period' | 'reset'

/**
 * The subset of {@link ProrationBehavior} a **client** may choose. `invoice`
 * and `prorate` both settle the difference now; `next_period` and `reset`
 * hand over the new plan's credits and features immediately while deferring
 * (or waiving) the charge, so letting a caller pick one is letting them
 * upgrade themselves for free. Those two stay server-side: pass them from
 * app code through `billing.updateSubscription(ctx, …)`, or make them the
 * organization's configured default.
 */
export type ClientProrationBehavior = 'invoice' | 'prorate'

/**
 * The provider's churn-reason enum, recorded with a cancellation. Only set it
 * when the customer actually told you — it surfaces to them in their purchases
 * library, so it is their words, not an internal note.
 */
export type CancellationReason
  = | 'customer_service'
    | 'low_quality'
    | 'missing_features'
    | 'switched_service'
    | 'too_complex'
    | 'too_expensive'
    | 'unused'
    | 'other'

/** Why an order was refunded (provider `refunds.create` reason). */
export type RefundReason
  = | 'duplicate'
    | 'fraudulent'
    | 'customer_request'
    | 'service_disruption'
    | 'satisfaction_guarantee'
    | 'other'
