// The bare specifier is deliberate: `node:buffer` would make the isolate bundle fail to resolve.
// eslint-disable-next-line unicorn/prefer-node-protocol
import { Buffer as PolyfillBuffer } from 'buffer'
import { Polar, type PolarWebhookEvent, type WebhookEventHandlers } from '@convex-dev/polar'
import { benefitsGet } from '@polar-sh/sdk/funcs/benefitsGet.js'
import { checkoutsCreate } from '@polar-sh/sdk/funcs/checkoutsCreate.js'
import { customersCreate } from '@polar-sh/sdk/funcs/customersCreate.js'
import { customersGetState } from '@polar-sh/sdk/funcs/customersGetState.js'
import { customersList } from '@polar-sh/sdk/funcs/customersList.js'
import { customersUpdate } from '@polar-sh/sdk/funcs/customersUpdate.js'
import { discountsCreate } from '@polar-sh/sdk/funcs/discountsCreate.js'
import { discountsDelete } from '@polar-sh/sdk/funcs/discountsDelete.js'
import { discountsList } from '@polar-sh/sdk/funcs/discountsList.js'
import { eventsIngest } from '@polar-sh/sdk/funcs/eventsIngest.js'
import { eventsList } from '@polar-sh/sdk/funcs/eventsList.js'
import { ordersGenerateInvoice } from '@polar-sh/sdk/funcs/ordersGenerateInvoice.js'
import { ordersGet } from '@polar-sh/sdk/funcs/ordersGet.js'
import { ordersInvoice } from '@polar-sh/sdk/funcs/ordersInvoice.js'
import { ordersList } from '@polar-sh/sdk/funcs/ordersList.js'
import { refundsCreate } from '@polar-sh/sdk/funcs/refundsCreate.js'
import { subscriptionsUpdate } from '@polar-sh/sdk/funcs/subscriptionsUpdate.js'
import {
  actionGeneric,
  type Auth,
  type FunctionReference,
  type GenericActionCtx,
  type GenericDataModel,
  type GenericQueryCtx,
  queryGeneric,
  type RegisteredAction,
} from 'convex/server'
import { guardDelivery, parseSecretList, translateStandardSignature, type WebhookLogRefs, WEBHOOK_BODY_LIMIT } from './webhook-guard.js'
import { v } from 'convex/values'
import type { SendEmailOptions } from './email.js'

// The provider SDK verifies webhook signatures with `Buffer.from(secret)`.
// HTTP actions run in the Convex isolate runtime, which has no `Buffer`, so
// without this every genuine delivery was answered 403 and the provider
// disabled the endpoint. The polyfill is the pure-JS `buffer` package.
if (typeof globalThis.Buffer === 'undefined') {
  (globalThis as { Buffer?: typeof PolyfillBuffer }).Buffer = PolyfillBuffer
}

/**
 * Any query context — the consumer's `currentUserId` resolver runs inside the
 * lib's generic query, but its body uses the consumer's concrete ctx (e.g.
 * `authComponent.getAuthUser(ctx)`). Typing the data model as `any` makes both
 * sides assignable across the library boundary.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQueryCtx = GenericQueryCtx<any>

/** The component reference accepted by the billing-provider client (`components.polar`). */
type PolarComponent = ConstructorParameters<typeof Polar>[0]

/**
 * A minimal Convex context (just `runQuery`) — kept DataModel-independent and
 * decoupled from the Polar package's own (possibly older) ctx typings, so any
 * app query/action ctx is assignable. Cast to Polar's exact type internally.
 */
type RunQueryCtx = Pick<GenericActionCtx<GenericDataModel>, 'runQuery'>
/** A context that can both read and write (sync + upsert the cache). */
type RunWriteCtx = Pick<GenericActionCtx<GenericDataModel>, 'runQuery' | 'runMutation'>
type PolarRunQueryCtx = Parameters<Polar['getCustomerByUserId']>[0]

type EnvHost = typeof globalThis & {
  process?: { env?: Record<string, string | undefined> }
}

function readEnv(name: string) {
  return (globalThis as EnvHost).process?.env?.[name]
}

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
type EventsIngestRequest = Parameters<typeof eventsIngest>[1]
/** Full discount-create payload (derived from the provider SDK) — fixed or percentage. */
export type DiscountInput = Parameters<typeof discountsCreate>[1]
/**
 * The provider's subscription-mutation union (`SubscriptionUpdate`) — one of
 * the product/proration, cancel, revoke, pause or resume shapes. Derived from
 * the installed SDK so the mappings below can never drift from it.
 */
type SubscriptionUpdatePayload = Parameters<typeof subscriptionsUpdate>[1]['subscriptionUpdate']
/** The provider subscription record returned by a lifecycle mutation. */
type ProviderSubscription = Extract<Awaited<ReturnType<typeof subscriptionsUpdate>>, { ok: true }>['value']
/** One discount as the provider's discounts API returns it. */
type ProviderDiscount = Extract<Awaited<ReturnType<typeof discountsList>>, { ok: true }>['value']['result']['items'][number]
/** Full checkout-create payload (derived from the provider SDK). */
type CheckoutCreateInput = Parameters<typeof checkoutsCreate>[1]

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

/** Shared addressing for the subscription-lifecycle operations. */
export interface SubscriptionTarget {
  /**
   * Which subscription to act on. Omit for the account's single live
   * subscription — required once {@link SetupBillingConfig.multipleSubscriptions}
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
 * What `getCurrentSubscription` returns once
 * {@link SetupBillingConfig.multipleSubscriptions} is on: the array leads,
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
 * Everything {@link Billing.api}'s `generateCheckoutLink` accepts. A type
 * alias rather than an interface so it can type the registered action itself
 * (Convex's `DefaultFunctionArgs` needs an implicit index signature, which only
 * aliases get) — that is what makes the wide argument list visible to an app
 * that re-exports `generateCheckoutLink` from the scaffold.
 */
export type CheckoutOptions = {
  productIds: string[]
  /** The origin of the page embedding the checkout (for the iframe handshake). */
  origin: string
  successUrl: string
  /** Upgrade an existing free subscription instead of starting a new one. */
  subscriptionId?: string
  metadata?: Record<string, string>
  trialInterval?: 'day' | 'week' | 'month' | 'year' | null
  trialIntervalCount?: number | null
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
   * (default `true`). That is where a customer-entered code belongs: the
   * provider validates it against the live catalog, so this package never has
   * to.
   */
  allowDiscountCodes?: boolean
  /**
   * Pre-apply a discount by **id** — the only form the provider's checkout
   * payload takes. There is no code→id lookup in the provider's API (its
   * discount list filters by name, not code), so a campaign that knows a code
   * resolves it once with `billing.discounts.list()` and stores the id, rather
   * than making every checkout scan the catalog.
   */
  discountId?: string
}

/**
 * Per-event billing webhook handlers, keyed by the provider's event names
 * (`'order.paid'`, `'subscription.active'`, …). Service-neutral alias for the
 * shape `registerBackendRoutes` mounts at `/billing/events`.
 */
export type BillingWebhookEventHandlers = WebhookEventHandlers

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
  /** Credits required for this spend (default `1`). */
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
 * dispatcher does exactly that).
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
  /** Credits to give back. */
  value: number
  /** Extra event properties. */
  metadata?: Record<string, string | number | boolean>
  /** Idempotency key (defaults to a random UUID). */
  externalId?: string
}

/** The cached entitlement state served by the component (`getByUser` shape). */
type CachedEntitlements = Omit<CustomerEntitlements, 'customerId'> & { customerId: string | null }

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
  claimedAt?: number
}

/** The gift-notification email built by {@link SetupBillingConfig.giftEmail}. */
export interface GiftEmailMessage {
  to: string
  subject: string
  html?: string
  text?: string
}

/** The data available to the gift-notification email template. */
export interface GiftEmailData {
  recipientEmail: string
  purchaserName?: string
  purchaserEmail?: string
  message?: string
  /** The app URL where the recipient signs in (or up) to receive the gift. */
  claimUrl: string
}

/**
 * The component handles `setupBilling` reads from your generated `components`
 * object. Pass the whole object — each key is picked structurally:
 *
 * - `polar` — the upstream billing-provider component (checkout / portal /
 *   webhooks / customer mapping).
 * - `backend` — the package's all-in-one component: `billing` is the reactive
 *   entitlement cache, `gifts` the gift-purchase records, and `email` (optional)
 *   delivers gift notifications.
 */
export interface BillingComponents {
  polar: PolarComponent
  backend: {
    // Component functions always surface to the parent app as `internal`
    // references in the generated `ComponentApi`, regardless of how they are
    // registered inside the component.
    billing: {
      getByUser: FunctionReference<'query', 'internal', { userId: string }, CachedEntitlements | null>
      upsert: FunctionReference<'mutation', 'internal', {
        userId: string
        customerId?: string
        activeProductIds: string[]
        benefits: EntitlementBenefit[]
        meters: EntitlementMeter[]
      }, null>
      userByCustomer: FunctionReference<'query', 'internal', { customerId: string }, string | null>
      debit: FunctionReference<'mutation', 'internal', {
        userId: string
        meterId: string
        amount: number
        externalId: string
        allowOverage?: boolean
      }, { ok: boolean, balance: number, reason?: 'no-row' | 'no-meter' | 'insufficient' }>
      settle: FunctionReference<'mutation', 'internal', { userId: string, externalId: string, finalAmount?: number }, null>
      release: FunctionReference<'mutation', 'internal', { userId: string, externalId: string }, null>
      credit: FunctionReference<'mutation', 'internal', { userId: string, meterId: string, amount: number }, null>
      /**
       * Drop every in-flight spend reservation for one entity, without
       * re-crediting: used after a refund, where the provider's balance is
       * already the truth and re-subtracting local reservations would push the
       * cache below it. Optional so an app pinned to an older component build
       * still type-checks — the refund path then just re-syncs.
       */
      clearPendingSpends?: FunctionReference<'mutation', 'internal', { userId: string }, null>
      /**
       * Delete one entity's entitlement cache row (account erasure). Optional
       * so an app pinned to an older component build still type-checks —
       * `billing.forgetEntity` then throws, naming the missing function.
       */
      deleteByUser?: FunctionReference<'mutation', 'internal', { userId: string }, null>
      getBenefitMetadata: FunctionReference<'query', 'internal', { benefitIds: string[] }, Array<{
        benefitId: string
        metadata: Record<string, string | number | boolean>
        updatedAt: number
      }>>
      upsertBenefitMetadata: FunctionReference<'mutation', 'internal', {
        entries: Array<{ benefitId: string, metadata: Record<string, string | number | boolean> }>
      }, null>
    }
    gifts: {
      create: FunctionReference<'mutation', 'internal', {
        recipientEmail: string
        purchaserUserId: string
        purchaserEmail?: string
        purchaserName?: string
        productIds: string[]
        message?: string
        billingCustomerId: string
      }, string>
      markPaid: FunctionReference<'mutation', 'internal', { giftId: string, billingOrderId?: string }, null>
      markNotified: FunctionReference<'mutation', 'internal', { giftId: string }, boolean>
      markClaimed: FunctionReference<'mutation', 'internal', { giftId: string, userId: string, entityId: string }, null>
      listByEmail: FunctionReference<'query', 'internal', { email: string, status?: string }, GiftRecord[]>
      get: FunctionReference<'query', 'internal', { giftId: string }, GiftRecord | null>
      resolveRecipient: FunctionReference<'query', 'internal', { email: string }, { userId: string, organizationId: string | null } | null>
    }
    email?: {
      send: FunctionReference<'mutation', 'internal', SendEmailOptions, string | null>
    }
    webhooks?: WebhookLogRefs
  }
}

/** The provider component's own customer-mapping functions (structural). */
interface ProviderLibRefs {
  lib: {
    insertCustomer: FunctionReference<'mutation', 'internal', { id: string, userId: string, metadata?: Record<string, unknown> }, unknown>
  }
}

type PolarConfig = ConstructorParameters<typeof Polar>[1]

/**
 * Billing configuration. Service-neutral at the package boundary: the access
 * token, environment, and webhook secret default to the required
 * `BILLING_ACCESS_TOKEN` / `BILLING_ENVIRONMENT` / `BILLING_WEBHOOK_SECRET`
 * env vars, so `setupBilling(components)` needs no env plumbing. Product maps
 * and other provider passthrough config are accepted as-is, plus `billTo`.
 *
 * The billing entity resolves from identity claims out of the box — the
 * active workspace (`billTo: 'organization'`, the default) or the signed-in
 * user (`billTo: 'user'`) — so `getUserInfo` / `currentUserId` are optional
 * overrides, not required wiring.
 */
export type SetupBillingConfig = Omit<PolarConfig, 'getUserInfo' | 'organizationToken' | 'server' | 'webhookSecret'> & {
  /** Provider access token. Defaults to the required `BILLING_ACCESS_TOKEN` env var. */
  accessToken?: string
  /** Provider environment. Defaults to the required `BILLING_ENVIRONMENT` env var (`'sandbox'` otherwise). */
  environment?: 'sandbox' | 'production'
  /** Webhook signature secret. Defaults to the required `BILLING_WEBHOOK_SECRET` env var. */
  webhookSecret?: string
  /**
   * Who owns subscriptions and credits: the active workspace (`'organization'`,
   * the default — members share the workspace's plan and credits) or the
   * individual user (`'user'`, for B2C apps without shared billing).
   */
  billTo?: 'organization' | 'user'
  /**
   * Override the billing-entity resolution for **action** contexts (checkout /
   * portal / sync). Only consulted with `billTo: 'user'`; the default reads
   * the signed-in user from identity claims.
   */
  getUserInfo?: PolarConfig['getUserInfo']
  /**
   * Override the billing-entity resolution for **query** contexts (the
   * reactive `getCurrentSubscription` / `getFeatures` / `getCredits` reads).
   * Only consulted with `billTo: 'user'`; the default reads identity claims.
   * Return `null` when signed out so reads degrade gracefully.
   */
  currentUserId?: (ctx: AnyQueryCtx) => Promise<string | null>
  /**
   * Throttle every client-callable function that reaches the live provider —
   * `syncEntitlements`, `syncProducts`, checkout, the subscription-lifecycle
   * actions, order history and invoices. Pass your `setupRateLimiter(...)`
   * limiter and each authenticated call is checked against the `billingSync`
   * limit (10/min, keyed by the workspace/user), so a caller can't loop one to
   * amplify the provider fan-out. Omit to leave them unthrottled.
   */
  rateLimiter?: BillingRateLimiter
  /**
   * Let one billing entity hold several live subscriptions at once (a plan
   * plus add-ons, say). The upstream single-subscription read throws the
   * moment a second one exists, so this switches `getCurrentSubscription` to
   * the subscriptions-array-first shape ({@link CurrentSubscriptions}) and
   * makes `subscriptionId` the way lifecycle actions pick their target.
   */
  multipleSubscriptions?: boolean
  /**
   * Gate the admin-tier billing actions (`refundOrder` — moving real money).
   * Throw from here to refuse. The default requires an `admin` role claim on
   * the caller's identity (the admin plugin's role, carried on the JWT);
   * supply your own to check permissions, a workspace role, or an allowlist.
   */
  requireAdmin?: (ctx: { auth?: Auth }) => Promise<void>
  /**
   * React to billing webhook events, keyed by the provider's own event names
   * (`'order.paid'`, `'subscription.active'`, …). Your handler runs **after**
   * the built-in entitlement-cache refresh (and gift fulfilment), so
   * features/credits read fresh inside it. Events outside the built-in refresh
   * set are mounted too.
   */
  events?: Partial<BillingWebhookEventHandlers>
  /**
   * Restyle the gift-notification email sent to the recipient once their gift
   * is paid. The default is a minimal, dependency-free template linking to
   * `SITE_URL` (where signing in claims the gift automatically).
   */
  giftEmail?: (data: GiftEmailData) => GiftEmailMessage
  /**
   * Named credit meters: spend by friendly name (`spendCredits({ meter:
   * 'credits' })`, `useCredits('credits')`) instead of provider meter ids.
   * Usually supplied via {@link SetupBillingConfig.catalog}; explicit entries
   * here win.
   */
  credits?: Record<string, CreditMeterConfig>
  /**
   * The environment-keyed id map generated by `nuxt-backend billing sync`
   * (`backend/billing.generated.ts`): fills `products` and `credits` for the
   * active `BILLING_ENVIRONMENT`, so provider UUIDs live in exactly one
   * generated file. Explicit `products`/`credits` config wins.
   */
  catalog?: Partial<Record<'sandbox' | 'production', BillingCatalogIds | undefined>>
  /**
   * Maximum age of a cached benefit-metadata snapshot before an entitlement
   * sync re-reads it live (ms, default 15 minutes). The `benefit.updated`
   * webhook patches snapshots immediately regardless.
   */
  benefitMetadataTtlMs?: number
  /**
   * Called for an **authentic** (signature-verified) webhook event whose type
   * this package's provider SDK cannot parse — e.g. an event newer than the
   * installed package. The delivery is acknowledged with 202 either way, so
   * unknown types can never put the endpoint into a retry loop.
   */
  onUnknownEvent?: (ctx: RunWriteCtx, event: { type?: string, payload: unknown }) => Promise<void>
  /**
   * Record every inbound webhook delivery in the component's capped ring
   * buffer (powers redelivery dedupe, doctor's "last webhook received", and
   * the DevTools feed). `false` disables the log — and with it dedupe.
   */
  deliveryLog?: boolean
}

/** Webhook events that signal a customer's plans / benefits / credits may have changed. */
// Catalog-as-code authoring surface (billing.catalog.ts / `billing sync`).
export { type BillingCatalog, BILLING_WEBHOOK_PROVISION_EVENTS, type CatalogCreditGrant, type CatalogFeature, type CatalogMeter, type CatalogPack, type CatalogPlan, defineBillingCatalog } from '../catalog.js'

const REFRESH_EVENTS = [
  'customer.state_changed',
  'order.created',
  'order.paid',
  'order.refunded',
  'subscription.created',
  'subscription.updated',
  'subscription.active',
  'subscription.canceled',
  'subscription.uncanceled',
  'subscription.past_due',
  'subscription.revoked',
  'refund.created',
  'refund.updated',
  'benefit_grant.created',
  'benefit_grant.updated',
  'benefit_grant.cycled',
  'benefit_grant.revoked',
] as const satisfies ReadonlyArray<keyof WebhookEventHandlers>

/** Internal: lets tests pin the provision list against the refresh set. */
export const BILLING_REFRESH_EVENTS: readonly string[] = REFRESH_EVENTS

/**
 * The provider's full webhook catalog. The composed handler map covers every
 * one of these, so any verified delivery gets logging, dedupe, and consumer
 * dispatch — events outside it (a newer provider than this package) land in
 * `onUnknownEvent` with a 202 instead of an error loop.
 */
export const ALL_BILLING_EVENTS = [
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
  // SDK-known, not yet live on the provider API — composed into the handler
  // map (harmless) but excluded from the provisioning list.
  'subscription.paused',
  'subscription.resumed',
] as const

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c] ?? c
  ))
}

/**
 * Subscription statuses the provider considers finished. Everything else —
 * including `past_due` and `paused` — is still manageable, so lifecycle
 * operations stay available on it. Deliberately a deny-list: the provider owns
 * the status vocabulary and adds to it, and refusing an unknown status here
 * would lock customers out of cancelling.
 */
const ENDED_SUBSCRIPTION_STATUSES = new Set(['canceled', 'incomplete_expired'])

/** Statuses that count as a live entitlement for the current-subscription reads. */
const LIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due', 'paused'])

/**
 * Provider payloads carry `Date` objects and `undefined` holes that Convex
 * cannot serialize back to a browser. Render dates as ISO strings and drop the
 * holes so a live provider read can be returned straight out of an action.
 */
function toConvexValue<T>(value: T): T {
  if (value instanceof Date) return value.toISOString() as unknown as T
  if (Array.isArray(value)) return value.map(entry => toConvexValue(entry)) as unknown as T
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry === undefined) continue
      result[key] = toConvexValue(entry)
    }
    return result as T
  }
  return value
}

/**
 * The provider paginates by page number, so the opaque `cursor` this package
 * hands out is just that number as a string — kept opaque at the boundary so
 * the pagination scheme can change without a breaking argument change.
 */
function resolvePage(options: { cursor?: string, page?: number }): number {
  const fromCursor = options.cursor === undefined ? Number.NaN : Number(options.cursor)
  const page = Number.isInteger(fromCursor) ? fromCursor : options.page
  // A malformed cursor or page reads as "the first page" rather than an error:
  // pagination tokens are opaque, so a stale one should not break the view.
  return Number.isFinite(page) ? Math.max(1, Math.trunc(page!)) : 1
}

/** Clamp a page size to the provider's accepted 1–100 window. */
function resolveLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return 10
  return Math.min(Math.max(Math.trunc(limit!), 1), 100)
}

function safeJsonParse(body: string): unknown {
  try {
    return JSON.parse(body)
  }
  catch {
    return body
  }
}

/** Guard stand-in when the delivery log is disabled — statuses stay fail-closed. */
function noopGuard(secretsConfigured: boolean, bodyLength: number): { rejection: Response | null, record: () => Promise<void> } {
  const rejection = !secretsConfigured
    ? new Response('Webhook secret not configured', { status: 503 })
    : bodyLength > WEBHOOK_BODY_LIMIT
      ? new Response('Payload too large', { status: 413 })
      : null
  return { rejection, record: async () => {} }
}

/**
 * The packaged default gift-notification email — minimal, dependency-free.
 * Used when {@link SetupBillingConfig.giftEmail} is not supplied; exported so
 * apps can preview it or build their override on top of it.
 */
export function defaultGiftEmail(data: GiftEmailData): GiftEmailMessage {
  const from = data.purchaserName || data.purchaserEmail || 'Someone'
  const intro = `${from} sent you a gift! Sign in to receive it.`
  const safeUrl = escapeHtml(data.claimUrl)
  return {
    to: data.recipientEmail,
    subject: `${from} sent you a gift 🎁`,
    text: `${intro}${data.message ? `\n\n“${data.message}”` : ''}\n\n${data.claimUrl}`,
    html: `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5">`
      + `<p>${escapeHtml(intro)}</p>`
      + (data.message ? `<blockquote style="margin:0 0 12px;padding:8px 12px;border-left:3px solid #ddd;color:#444">${escapeHtml(data.message)}</blockquote>` : '')
      + `<p><a href="${safeUrl}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;border-radius:8px;text-decoration:none">Receive your gift</a></p>`
      + `<p style="color:#666">Or paste this link into your browser:<br>${safeUrl}</p>`
      + `</div>`,
  }
}

export interface Billing {
  /**
   * The underlying billing-provider component client (an advanced escape hatch
   * — use `provider.polar` for the raw SDK). Needed by `registerBackendRoutes`
   * to mount the webhook.
   */
  provider: Polar
  /**
   * The ready-made checkout / portal / subscription functions to re-export from
   * your Convex module (the result of the provider's `api()`), plus
   * `giftCheckout`. `listAllSubscriptions` is wrapped to resolve the billing
   * entity like the reactive reads do — it returns `null` instead of throwing
   * for claimless callers (signed out, or the auth-handshake / reconnect window
   * reactive queries subscribe in). `generateCheckoutLink` is replaced by this
   * package's superset (prefill, custom fields, billing address, discount id),
   * and is re-declared here so the scaffold's `export const {
   * generateCheckoutLink } = billing.api` hands the app the wide argument type
   * rather than upstream's narrow one.
   */
  api: Omit<ReturnType<Polar['api']>, 'listAllSubscriptions' | 'generateCheckoutLink'> & {
    listAllSubscriptions: ReturnType<typeof queryGeneric>
    giftCheckout: ReturnType<typeof actionGeneric>
    generateCheckoutLink: RegisteredAction<'public', CheckoutOptions, Promise<{ url: string }>>
  }
  /**
   * Ready-made, client-callable functions to re-export from your `billing.ts`
   * so `useBilling` / `useFeatures` / `useCredits` / `useGifts` work with zero
   * hand-wiring: the reactive current-subscription, feature-gating and
   * credit-balance queries, a `syncEntitlements` action to refresh the cache
   * after checkout / top-up, a `syncProducts` action to pull the provider's
   * product catalog into the reactive products table (fresh deployments render
   * empty pricing until it runs once — webhooks keep it fresh afterwards), and
   * the gift queries/claim action.
   */
  functions: {
    getCurrentSubscription: ReturnType<typeof queryGeneric>
    getFeatures: ReturnType<typeof queryGeneric>
    getCredits: ReturnType<typeof queryGeneric>
    syncEntitlements: ReturnType<typeof actionGeneric>
    syncProducts: ReturnType<typeof actionGeneric>
    getReceivedGifts: ReturnType<typeof queryGeneric>
    claimGift: ReturnType<typeof actionGeneric>
    getWebhookDeliveries: ReturnType<typeof queryGeneric>
    /** Switch the caller's subscription to another product. */
    updateSubscription: ReturnType<typeof actionGeneric>
    /** Cancel at period end (default) or revoke immediately. */
    cancelSubscription: ReturnType<typeof actionGeneric>
    /** Undo a scheduled cancellation. */
    uncancelSubscription: ReturnType<typeof actionGeneric>
    /** Pause at period end. */
    pauseSubscription: ReturnType<typeof actionGeneric>
    /** Resume a paused subscription immediately. */
    resumeSubscription: ReturnType<typeof actionGeneric>
    /** The caller's order history, read live from the provider. */
    getOrders: ReturnType<typeof actionGeneric>
    /** A signed invoice URL for one of the caller's orders. */
    getInvoiceUrl: ReturnType<typeof actionGeneric>
    /** The caller's metered consumption history, read live from the provider. */
    getUsageHistory: ReturnType<typeof actionGeneric>
    /** Refund an order — admin-tier (see {@link SetupBillingConfig.requireAdmin}). */
    refundOrder: ReturnType<typeof actionGeneric>
  }
  /**
   * Typed billing webhook handlers for `registerBackendRoutes` (mounted at
   * `/billing/events`) that keep the reactive cache fresh (subscriptions,
   * benefit grants, credit balances) and fulfil paid gifts.
   */
  webhookEvents: BillingWebhookEventHandlers
  /**
   * The guarded `/billing/events` endpoint `registerBackendRoutes` mounts:
   * fail-closed (503 while the secret is unset, 413 over the size cap,
   * 403 on bad signatures across the rotation list, 200 on redeliveries of
   * processed ids, 202 for authentic-but-unknown types) with every delivery
   * outcome recorded in the component's ring buffer.
   */
  webhookHandler: (ctx: RunWriteCtx, request: Request) => Promise<Response>
  /**
   * Resolve a user's full billing entitlement state (active plans, benefits, and
   * credit-meter balances) live from the provider. Call from an **action**; the
   * ready-made `syncEntitlements` already caches the result for you.
   */
  getCustomerState: (ctx: RunQueryCtx, args: { userId: string }) => Promise<CustomerEntitlements>
  /**
   * Spend prepaid credits — call from your own **server** action when a
   * metered feature is used. The billing entity (workspace or user, per
   * `billTo`) resolves from the caller's identity; pass `userId` to spend for
   * a specific entity. With a configured `meter` (or raw `meterId`), the
   * spend reserves against the cached balance atomically (strictly prepaid —
   * two concurrent spends can never both pass), ingests the provider event,
   * then settles; a failed run releases the reservation and consumes nothing.
   */
  spendCredits: (ctx: RunWriteCtx & { auth?: Auth }, event: SpendCreditsEvent) => Promise<void>
  /**
   * Give credits back on a **sum** meter (compensating negative-value event +
   * optimistic cache re-credit). Count meters cannot be refunded.
   */
  refundCredits: (ctx: RunWriteCtx & { auth?: Auth }, event: RefundCreditsEvent) => Promise<void>
  /**
   * The reserve step of a spend, alone — for flows that run work between the
   * guard and the charge (`setupAi().meteredAction` / streaming). Atomically
   * reserves against the cached balance (throws when insufficient) and
   * returns serializable addressing data for {@link Billing.settleSpend} /
   * {@link Billing.releaseSpend}. `allowRefresh: false` skips the cold-cache
   * self-heal (required from mutation contexts — the refresh fetches).
   */
  reserveCredits: (ctx: RunWriteCtx & { auth?: Auth }, event: SpendCreditsEvent & { allowRefresh?: boolean }) => Promise<SpendReservation>
  /** Ingest the provider event for a reservation and finalize the spend. */
  settleSpend: (ctx: RunWriteCtx, reservation: SpendReservation, options?: { name?: string, metadata?: Record<string, string | number | boolean>, timestamp?: Date, finalAmount?: number }) => Promise<void>
  /** Undo a reservation whose work failed — nothing is charged. */
  releaseSpend: (ctx: RunWriteCtx, reservation: SpendReservation) => Promise<void>
  /**
   * Resolve the billing entity from the caller's identity claims — the active
   * workspace (`billTo: 'organization'`) or the signed-in user. `null` when
   * signed out.
   */
  resolveEntity: (ctx: { auth?: Auth }) => Promise<{ userId: string, email: string } | null>
  /**
   * Forget a billing entity: drop its cached entitlements (plans, benefits,
   * credit balances, in-flight reservations). The provider's customer record
   * is untouched — this is the app-side erasure step, e.g. from the
   * `onUserDeleted` auth hook with the deleted user's id (`billTo: 'user'`)
   * or a dissolved workspace's id. A no-op for an unknown entity.
   */
  forgetEntity: (ctx: RunWriteCtx, userId: string) => Promise<void>
  /**
   * Create a discount / coupon (provider `discounts.create`). Call from an
   * **action**. Accepts the full discount-create shape (fixed or percentage).
   *
   * @deprecated Use `discounts.create` instead — the discount surface grew a
   * `list` and a `remove`, so it reads as one object. This alias keeps working
   * for at least one minor release (see STABILITY.md).
   */
  createDiscount: (discount: DiscountInput) => Promise<{ id: string, code: string | null }>
  /**
   * Discount (coupon) management: `create`, `list`, `remove`. Server-side by
   * design — minting discounts is privileged, so wire it through an
   * `internalAction` or your own admin-tier action.
   */
  discounts: BillingDiscounts
  /**
   * Switch a subscription to another product (upgrade / downgrade), optionally
   * choosing how the mid-period difference is settled. Call from an **action**;
   * the ready-made `updateSubscription` function does it for the caller.
   */
  updateSubscription: (ctx: RunWriteCtx & { auth?: Auth }, options?: UpdateSubscriptionOptions) => Promise<ProviderSubscription>
  /**
   * Cancel a subscription — at period end by default, immediately with
   * `atPeriodEnd: false`. The reason and comment are the customer's own words
   * and are visible to them.
   */
  cancelSubscription: (ctx: RunWriteCtx & { auth?: Auth }, options?: CancelSubscriptionOptions) => Promise<ProviderSubscription>
  /** Undo a scheduled cancellation, putting the subscription back on renewal. */
  uncancelSubscription: (ctx: RunWriteCtx & { auth?: Auth }, options?: SubscriptionTarget) => Promise<ProviderSubscription>
  /**
   * Pause a subscription at the end of the current period, optionally with an
   * automatic resume date.
   *
   * Pause/resume are newer than the rest of the lifecycle: the provider's
   * `subscription.paused` / `subscription.resumed` webhooks are known to the
   * installed SDK but not confirmed live here, so entitlement reads treat a
   * paused subscription as still live rather than assuming an event will
   * arrive to say so.
   */
  pauseSubscription: (ctx: RunWriteCtx & { auth?: Auth }, options?: PauseSubscriptionOptions) => Promise<ProviderSubscription>
  /** Resume a paused subscription immediately, starting a new billing period. */
  resumeSubscription: (ctx: RunWriteCtx & { auth?: Auth }, options?: SubscriptionTarget) => Promise<ProviderSubscription>
  /**
   * The billing entity's order history, read **live** from the provider — this
   * package keeps no local order table (that would be a ledger, and the
   * provider already is one). `null` when no access token is configured.
   */
  getOrders: (ctx: RunWriteCtx & { auth?: Auth }, options?: OrdersOptions) => Promise<BillingPage<BillingOrder> | null>
  /**
   * A URL to one of the entity's own invoices. `null` when no access token is
   * configured, and `null` while the provider is still generating the PDF (the
   * call asks for generation, then the next call returns the URL). Throws if
   * the order belongs to a different billing account.
   */
  getInvoiceUrl: (ctx: RunWriteCtx & { auth?: Auth }, orderId: string) => Promise<{ url: string } | null>
  /**
   * The billing entity's metered consumption history, read **live** from the
   * provider's events API. There is no local usage ledger by design: the
   * events this package ingests when it spends credits *are* the record, and
   * the provider bills from them. `null` when no access token is configured.
   */
  getUsageHistory: (ctx: RunWriteCtx & { auth?: Auth }, options?: UsageHistoryOptions) => Promise<BillingPage<UsageEvent> | null>
  /**
   * Refund an order — admin-tier, gated by
   * {@link SetupBillingConfig.requireAdmin}. Omit `amount` to refund whatever
   * is still refundable.
   *
   * Credits are **not** reversed here: meter credits come from the provider's
   * own benefit grants, so the refund's `order.refunded` webhook is what
   * reverses them. This package only drops the entity's in-flight spend
   * reservations and re-reads the provider's balance.
   */
  refundOrder: (ctx: RunWriteCtx & { auth?: Auth }, options: RefundOrderOptions) => Promise<RefundRecord>
}

/**
 * Configure billing for subscriptions, discounts, prepaid credits, and gift
 * purchases — linked to your auth users and cached reactively inside the
 * `backend` component (so consumers add nothing to their own schema).
 *
 * Subscription / feature / credit reads return `null`/empty until the provider
 * has synced, so a mid-configuration deployment degrades gracefully; checkout /
 * portal / credit / discount operations need the required
 * `BILLING_ACCESS_TOKEN` env var.
 *
 * Billing follows the tenant: with the default `billTo: 'organization'` the
 * active workspace owns the subscription and credits (every member shares
 * them); with `billTo: 'user'` each user is their own customer. Either way
 * the entity resolves from identity claims — zero wiring.
 *
 * @example
 * ```ts
 * import { setupBilling } from 'nuxt-backend/billing'
 * import { components } from './_generated/api'
 *
 * const billing = setupBilling(components)
 *
 * export const { provider } = billing
 * export const { generateCheckoutLink, generateCustomerPortalUrl, giftCheckout } = billing.api
 * export const {
 *   getCurrentSubscription, getFeatures, getCredits, syncEntitlements,
 *   getReceivedGifts, claimGift,
 * } = billing.functions
 * ```
 */
export function setupBilling(
  components: BillingComponents,
  config: SetupBillingConfig = {},
): Billing {
  const billTo = config.billTo ?? 'organization'
  // Service-neutral config: explicit values win, then the BILLING_* env vars
  // — passed explicitly to the provider client so its own service-named env
  // fallbacks never engage.
  const accessToken = config.accessToken ?? readEnv('BILLING_ACCESS_TOKEN')
  const environment = config.environment
    ?? (readEnv('BILLING_ENVIRONMENT') as 'sandbox' | 'production' | undefined)
    ?? 'sandbox'
  const webhookSecret = config.webhookSecret ?? readEnv('BILLING_WEBHOOK_SECRET')

  // The generated catalog (billing.generated.ts) supplies the environment's
  // product ids and named credit meters; explicit config wins over it.
  const catalogIds = config.catalog?.[environment]
  const products = config.products ?? catalogIds?.products
  const creditMeters: Record<string, CreditMeterConfig> = { ...catalogIds?.meters, ...config.credits }
  const meterNameById = new Map(Object.entries(creditMeters).map(([key, meter]) => [meter.meterId, key]))

  /**
   * How many credits one ingested event represents, for the history read: the
   * meter's value property for a sum meter, exactly one for a count meter, and
   * "unknown" when no meter was resolved — never a made-up zero.
   */
  const meterUnits = (
    meter: (CreditMeterConfig & { key?: string }) | null,
    metadata: Record<string, unknown> | undefined,
  ): number | undefined => {
    if (!meter) return undefined
    if (!meter.property) return 1
    const raw = metadata?.[meter.property]
    return typeof raw === 'number' ? raw : undefined
  }

  /** Resolve a spend's target meter from its friendly name or raw meter id. */
  const resolveMeter = (event: Pick<SpendCreditsEvent, 'meter' | 'meterId'>): (CreditMeterConfig & { key?: string }) | null => {
    if (event.meter) {
      const found = creditMeters[event.meter]
      if (!found) {
        throw new Error(
          `[nuxt-backend] Unknown credit meter '${event.meter}' — declare it in setupBilling({ credits }) `
          + 'or generate it with `nuxt-backend billing sync`.',
        )
      }
      return { key: event.meter, ...found }
    }
    if (event.meterId) {
      const key = meterNameById.get(event.meterId)
      return key ? { key, ...creditMeters[key]! } : { meterId: event.meterId }
    }
    return null
  }

  /**
   * Resolve the billing entity from identity claims: the active workspace
   * (org mode) or the signed-in user (user mode). Claims carry `email` and
   * `activeOrganizationId` via this package's JWT payload.
   */
  const entityFromIdentity = async (ctx: { auth?: Auth }): Promise<{ userId: string, email: string } | null> => {
    const identity = await ctx.auth?.getUserIdentity()
    if (!identity) return null
    const claims = identity as unknown as Record<string, unknown>
    const entityId = billTo === 'organization'
      ? (typeof claims.activeOrganizationId === 'string' ? claims.activeOrganizationId : null)
      : identity.subject
    if (!entityId) return null
    return { userId: entityId, email: typeof claims.email === 'string' ? claims.email : '' }
  }

  // The provider requires a `getUserInfo`; wrap the entity resolution (or the
  // consumer's override in user mode) with a clear failure for billing
  // operations that need a signed-in entity.
  const getUserInfo: NonNullable<PolarConfig['getUserInfo']> = async (ctx) => {
    if (billTo === 'user' && config.getUserInfo) return config.getUserInfo(ctx)
    const entity = await entityFromIdentity(ctx as unknown as { auth?: Auth })
    if (!entity) {
      throw new Error(billTo === 'organization'
        ? '[nuxt-backend] Billing needs an active workspace — sign in (a personal workspace is created automatically) or activate one.'
        : '[nuxt-backend] Billing needs a signed-in user.')
    }
    return entity
  }

  const provider = new Polar(components.polar, {
    ...config,
    products,
    getUserInfo,
    organizationToken: accessToken,
    server: environment,
    // Primary secret only — the raw value may be a comma-separated rotation
    // list; per-secret verification happens in the captured webhook handlers.
    webhookSecret: parseSecretList(webhookSecret)[0],
  })
  const cache = components.backend.billing
  const gifts = components.backend.gifts
  const providerLib = (components.polar as unknown as ProviderLibRefs).lib

  /**
   * Operations that *write* at the provider fail loudly without a token —
   * silently doing nothing with someone's money would be worse than an error.
   * Reads degrade to `null` instead (see `getOrders` / `getInvoiceUrl`), so a
   * mid-configuration deployment still renders.
   */
  const requireProviderAccess = (operation: string): void => {
    if (accessToken) return
    throw new Error(
      `[nuxt-backend] Billing ${operation} needs the BILLING_ACCESS_TOKEN env var — `
      + 'set it on the deployment (`npx nuxt-backend doctor` lists what is missing).',
    )
  }

  /**
   * Unwrap a provider SDK result at the package boundary. Rethrowing the raw
   * SDK error would put the provider's own words — HTTP status, response body,
   * sometimes an expired-token hint — in front of a visitor: `<BillingHistory>`
   * renders `orders.error` verbatim. The detail is logged instead, where it is
   * a debugging aid rather than a leak, and the caller sees the same
   * package-shaped message a missing token produces.
   */
  const unwrapProvider = <T>(
    result: { ok: true, value: T } | { ok: false, error: unknown },
    operation: string,
  ): T => {
    if (result.ok) return result.value
    console.error(`[nuxt-backend] Billing ${operation} failed at the provider:`, result.error)
    throw new Error(
      `[nuxt-backend] Billing is temporarily unavailable — the provider refused the ${operation}. Try again shortly.`,
    )
  }

  /**
   * Throttle one live provider fan-out per billing entity against the shared
   * `billingSync` limit. A no-op until a limiter is configured, so the
   * zero-config scaffold behaves exactly as before.
   */
  const throttle = async (ctx: RunWriteCtx, userId: string, what: string): Promise<void> => {
    if (!config.rateLimiter) return
    const { ok } = await config.rateLimiter.limit(ctx, 'billingSync', { key: userId })
    if (!ok) throw new Error(`[nuxt-backend] Too many ${what} — try again shortly.`)
  }

  const getCustomerState: Billing['getCustomerState'] = async (ctx, { userId }) => {
    const customer = await provider.getCustomerByUserId(ctx as unknown as PolarRunQueryCtx, userId)
    if (!customer) {
      return { customerId: null, activeProductIds: [], benefits: [], meters: [] }
    }
    const result = await customersGetState(provider.polar, { id: customer.id })
    if (!result.ok) throw result.error
    const state = result.value as {
      activeSubscriptions?: Array<{
        productId: string
        currentPeriodStart?: Date
        currentPeriodEnd?: Date
        meters?: Array<{ meterId: string }>
      }>
      grantedBenefits?: Array<{ id: string, benefitId: string, benefitType: string }>
      activeMeters?: Array<{ meterId: string, consumedUnits: number, creditedUnits: number, balance: number }>
    }
    const grants = state.grantedBenefits ?? []
    // Customer-state `benefitMetadata` is a grant-time snapshot (not updated
    // when a benefit's metadata changes). Live metadata is kept in the
    // component's own snapshot table (patched instantly by the
    // `benefit.updated` webhook) — only missing/stale entries hit the provider
    // API here, so steady-state syncs make zero benefit reads.
    const distinctBenefitIds = [...new Set(grants.map(g => g.benefitId))]
    const snapshots = distinctBenefitIds.length > 0
      ? await ctx.runQuery(cache.getBenefitMetadata, { benefitIds: distinctBenefitIds })
      : []
    const now = Date.now()
    const ttl = config.benefitMetadataTtlMs ?? 15 * 60 * 1000
    const metadataByBenefit = new Map<string, Record<string, string | number | boolean>>(
      snapshots.filter(s => now - s.updatedAt < ttl).map(s => [s.benefitId, s.metadata]),
    )
    const staleBenefitIds = distinctBenefitIds.filter(id => !metadataByBenefit.has(id))
    const fetched: Array<{ benefitId: string, metadata: Record<string, string | number | boolean> }> = []
    // Rollover lives on the meter-credit *benefit*, not on customer state — so
    // it is only known on the reads this loop already makes. Absent between
    // reads (the metadata TTL), which is why `rollover` is optional all the way
    // out to `useCredits()`: the UI degrades to "no expiry shown", never lies.
    const rolloverByMeter = new Map<string, boolean>()
    await Promise.all(
      staleBenefitIds.map(async (benefitId) => {
        const benefit = await benefitsGet(provider.polar, { id: benefitId })
        if (benefit.ok) {
          const metadata = benefit.value.metadata ?? {}
          metadataByBenefit.set(benefitId, metadata)
          fetched.push({ benefitId, metadata })
          if (benefit.value.type === 'meter_credit') {
            rolloverByMeter.set(benefit.value.properties.meterId, benefit.value.properties.rollover)
          }
        }
      }),
    )
    if (fetched.length > 0 && 'runMutation' in ctx) {
      await (ctx as RunWriteCtx).runMutation(cache.upsertBenefitMetadata, { entries: fetched })
    }
    // A meter's cycle is its granting subscription's billing period: the
    // provider models the period on the subscription, and the subscription
    // lists the meters it covers. A meter granted only by a one-time pack has
    // no subscription and therefore no cycle — hence the optional fields.
    const cycleByMeter = new Map<string, { cycleStart?: number, cycleEnd?: number }>()
    for (const subscription of state.activeSubscriptions ?? []) {
      for (const subscriptionMeter of subscription.meters ?? []) {
        cycleByMeter.set(subscriptionMeter.meterId, {
          cycleStart: subscription.currentPeriodStart?.getTime(),
          cycleEnd: subscription.currentPeriodEnd?.getTime(),
        })
      }
    }
    return {
      customerId: customer.id,
      activeProductIds: (state.activeSubscriptions ?? []).map(s => s.productId),
      benefits: grants.map(b => ({
        id: b.id,
        benefitId: b.benefitId,
        type: b.benefitType,
        metadata: metadataByBenefit.get(b.benefitId) ?? {},
      })),
      meters: (state.activeMeters ?? []).map(m => ({
        meterId: m.meterId,
        consumedUnits: m.consumedUnits,
        creditedUnits: m.creditedUnits,
        balance: m.balance,
        ...cycleByMeter.get(m.meterId),
        ...(rolloverByMeter.has(m.meterId) ? { rollover: rolloverByMeter.get(m.meterId) } : {}),
      })),
    }
  }

  /** Sync a user's live billing state into the reactive component cache. */
  const refreshEntitlements = async (ctx: RunWriteCtx, userId: string): Promise<void> => {
    const state = await getCustomerState(ctx, { userId })
    await ctx.runMutation(cache.upsert, {
      userId,
      customerId: state.customerId ?? undefined,
      activeProductIds: state.activeProductIds,
      benefits: state.benefits,
      meters: state.meters,
    })
  }

  // Reserve → ingest → settle. The cached balance is the guard: `debit` is an
  // atomic conditional decrement (Convex mutations serialize), so two
  // concurrent spends can never both pass, and there is no live provider read
  // on the spend path at all. The provider event remains the only durable
  // record; a failed ingest releases the reservation, so a failed run never
  // consumes credits. Split into reserve/settle/release so `setupAi` (and the
  // streaming HTTP dispatcher, which settles in a different function than it
  // reserved in) compose the same semantics — `spendCredits` is the one-call
  // form.
  const reserveCredits: Billing['reserveCredits'] = async (ctx, event) => {
    const entityId = event.userId
      ?? (await entityFromIdentity(ctx as { auth?: Auth }))?.userId
    if (!entityId) {
      throw new Error('[nuxt-backend] spendCredits: no billing entity — pass `userId` or call from an authenticated context.')
    }
    const meter = resolveMeter(event)
    const value = event.value ?? 1
    const externalId = event.externalId ?? crypto.randomUUID()

    if (!meter) {
      return { entityId, externalId, reserved: false, value }
    }
    // Configured count meters count events — one event is one credit, so a
    // multi-credit spend has no representable event shape. Raw `meterId`
    // spends skip this: the caller owns the event shape there.
    if (meter.key && !meter.property && value !== 1) {
      throw new Error(
        `[nuxt-backend] spendCredits: meter '${meter.key}' counts events (no \`property\` configured) — `
        + 'spend value must be 1 per event, or configure a sum meter with a `property`.',
      )
    }
    const debitArgs = { userId: entityId, meterId: meter.meterId, amount: value, externalId, allowOverage: event.allowOverage }
    let result = await ctx.runMutation(cache.debit, debitArgs)
    if (!result.ok && (result.reason === 'no-row' || result.reason === 'no-meter') && event.allowRefresh !== false) {
      // Cold cache (granted but never synced) — self-heal once, then retry.
      // Needs an action ctx (the provider read fetches); mutation callers pass
      // `allowRefresh: false` and surface the sync hint instead.
      await refreshEntitlements(ctx as RunWriteCtx, entityId)
      result = await ctx.runMutation(cache.debit, debitArgs)
    }
    if (!result.ok) {
      throw new Error(
        result.reason === 'insufficient'
          ? `[nuxt-backend] Insufficient credits — balance ${result.balance}, need ${value}. Top up to continue.`
          : `[nuxt-backend] Credit balance not synced yet for ${entityId} — call syncEntitlements (or open a billing view) and retry.`,
      )
    }
    return { entityId, externalId, reserved: true, meter: meter.key, meterId: meter.meterId, value }
  }

  const settleSpend: Billing['settleSpend'] = async (ctx, reservation, options = {}) => {
    const meter = resolveMeter(reservation)
    const name = options.name ?? meter?.eventName ?? meter?.key
    if (!name) {
      throw new Error('[nuxt-backend] settleSpend: pass `name`, or a configured `meter` whose key/eventName names the event.')
    }
    // The estimate is the ceiling: settling above it would be a second,
    // unguarded debit — the reservation is what made the spend safe against a
    // concurrent one.
    const value = Math.min(Math.max(options.finalAmount ?? reservation.value, 0), reservation.value)
    try {
      const customer = await provider.getCustomerByUserId(ctx as unknown as PolarRunQueryCtx, reservation.entityId)
      if (!customer) {
        throw new Error(`[nuxt-backend] No billing customer for ${reservation.entityId}. Start a checkout first.`)
      }
      const metadata = meter?.property
        ? { ...options.metadata, [meter.property]: value }
        : options.metadata
      const events: EventsIngestRequest['events'] = [{
        name,
        customerId: customer.id,
        metadata,
        externalId: reservation.externalId,
        timestamp: options.timestamp,
      }]
      const result = await eventsIngest(provider.polar, { events })
      if (!result.ok) throw result.error
    }
    catch (error) {
      if (reservation.reserved) await ctx.runMutation(cache.release, { userId: reservation.entityId, externalId: reservation.externalId })
      throw error
    }
    if (reservation.reserved) await ctx.runMutation(cache.settle, { userId: reservation.entityId, externalId: reservation.externalId, finalAmount: value })
  }

  const releaseSpend: Billing['releaseSpend'] = async (ctx, reservation) => {
    if (!reservation.reserved) return
    await ctx.runMutation(cache.release, { userId: reservation.entityId, externalId: reservation.externalId })
  }

  const spendCredits: Billing['spendCredits'] = async (ctx, event) => {
    const reservation = await reserveCredits(ctx, event)
    await settleSpend(ctx, reservation, { name: event.name, metadata: event.metadata, timestamp: event.timestamp })
  }

  /**
   * Give credits back on a sum meter (e.g. a generation the user rejected):
   * ingests a compensating negative-value event, then optimistically
   * re-credits the cache. Count meters cannot be compensated — their events
   * only count up.
   */
  const refundCredits: Billing['refundCredits'] = async (ctx, event) => {
    const entityId = event.userId
      ?? (await entityFromIdentity(ctx as { auth?: Auth }))?.userId
    if (!entityId) {
      throw new Error('[nuxt-backend] refundCredits: no billing entity — pass `userId` or call from an authenticated context.')
    }
    const meter = resolveMeter({ meter: event.meter })
    if (!meter?.property) {
      throw new Error(
        `[nuxt-backend] refundCredits: meter '${event.meter}' has no \`property\` (count meter) — only sum meters can be refunded.`,
      )
    }
    const customer = await provider.getCustomerByUserId(ctx as unknown as PolarRunQueryCtx, entityId)
    if (!customer) {
      throw new Error(`[nuxt-backend] No billing customer for ${entityId}.`)
    }
    const result = await eventsIngest(provider.polar, {
      events: [{
        name: meter.eventName ?? meter.key ?? event.meter,
        customerId: customer.id,
        metadata: { ...event.metadata, [meter.property]: -event.value },
        externalId: event.externalId ?? crypto.randomUUID(),
      }],
    })
    if (!result.ok) throw result.error
    await ctx.runMutation(cache.credit, { userId: entityId, meterId: meter.meterId, amount: event.value })
  }

  const createDiscount: Billing['createDiscount'] = async (discount) => {
    requireProviderAccess('discount creation')
    const result = await discountsCreate(provider.polar, discount)
    if (!result.ok) throw result.error
    return { id: result.value.id, code: result.value.code ?? null }
  }

  const listDiscounts: BillingDiscounts['list'] = async (options = {}) => {
    requireProviderAccess('discount listing')
    const page = resolvePage(options)
    const result = await discountsList(provider.polar, {
      query: options.query,
      page,
      limit: resolveLimit(options.limit),
    })
    if (!result.ok) throw result.error
    const { items, pagination } = result.value.result
    return {
      items,
      pagination,
      ...(page < pagination.maxPage ? { nextCursor: String(page + 1) } : {}),
    }
  }

  const discounts: BillingDiscounts = {
    create: createDiscount,
    list: listDiscounts,
    remove: async (discountId) => {
      requireProviderAccess('discount deletion')
      const result = await discountsDelete(provider.polar, { id: discountId })
      if (!result.ok) throw result.error
    },
  }

  // --- Subscription lifecycle ---

  /**
   * The subscription a lifecycle operation acts on, read from the component's
   * synced table. Never the upstream single-subscription read: that one is a
   * `.unique()` and throws the moment an entity holds two live subscriptions,
   * which is exactly the case `multipleSubscriptions` exists for.
   */
  const resolveSubscription = async (
    ctx: RunQueryCtx,
    userId: string,
    subscriptionId?: string,
  ): Promise<{ id: string, status: string }> => {
    const all = await provider.listAllUserSubscriptions(ctx as unknown as PolarRunQueryCtx, { userId })
    if (subscriptionId) {
      const found = all.find(subscription => subscription.id === subscriptionId)
      if (!found) {
        throw new Error(`[nuxt-backend] Subscription ${subscriptionId} is not on this billing account.`)
      }
      return found
    }
    const live = all.filter(subscription =>
      subscription.endedAt == null && !ENDED_SUBSCRIPTION_STATUSES.has(subscription.status))
    if (live.length === 0) {
      throw new Error('[nuxt-backend] No subscription to change — this billing account has none running.')
    }
    if (live.length > 1) {
      throw new Error(
        '[nuxt-backend] This billing account has several running subscriptions — pass `subscriptionId` to say which one.',
      )
    }
    return live[0]!
  }

  /**
   * One provider `subscriptions.update` call, behind the shared guards: token
   * present, entity resolved, rate limit checked, subscription addressed. Every
   * lifecycle operation is the same call with a different arm of the SDK's
   * `SubscriptionUpdate` union.
   */
  const applySubscriptionUpdate = async (
    ctx: RunWriteCtx & { auth?: Auth },
    operation: string,
    options: SubscriptionTarget,
    update: SubscriptionUpdatePayload,
  ): Promise<ProviderSubscription> => {
    requireProviderAccess(operation)
    const { userId } = await getUserInfo(ctx as unknown as PolarRunQueryCtx)
    await throttle(ctx, userId, `${operation}s`)
    const subscription = await resolveSubscription(ctx, userId, options.subscriptionId)
    const result = await subscriptionsUpdate(provider.polar, {
      id: subscription.id,
      subscriptionUpdate: update,
    })
    return unwrapProvider(result, operation)
  }

  const updateSubscription: Billing['updateSubscription'] = async (ctx, options = {}) => {
    if (!options.productId && !options.proration) {
      throw new Error('[nuxt-backend] updateSubscription: pass `productId` (the plan to switch to) and/or `proration`.')
    }
    return applySubscriptionUpdate(ctx, 'plan change', options, {
      productId: options.productId,
      prorationBehavior: options.proration,
    })
  }

  const cancelSubscription: Billing['cancelSubscription'] = (ctx, options = {}) => {
    // The provider's cancel and revoke arms carry the same customer-supplied
    // churn fields; only the timing differs.
    const churn = {
      customerCancellationReason: options.reason,
      customerCancellationComment: options.comment,
    }
    return applySubscriptionUpdate(
      ctx,
      'cancellation',
      options,
      options.atPeriodEnd === false ? { ...churn, revoke: true } : { ...churn, cancelAtPeriodEnd: true },
    )
  }

  // The provider models "undo the scheduled cancellation" as the cancel arm
  // with the flag flipped off — there is no separate uncancel endpoint.
  const uncancelSubscription: Billing['uncancelSubscription'] = (ctx, options = {}) =>
    applySubscriptionUpdate(ctx, 'uncancellation', options, { cancelAtPeriodEnd: false })

  const pauseSubscription: Billing['pauseSubscription'] = (ctx, options = {}) =>
    applySubscriptionUpdate(ctx, 'pause', options, {
      pauseAtPeriodEnd: true,
      resumesAt: options.resumesAt,
    })

  const resumeSubscription: Billing['resumeSubscription'] = (ctx, options = {}) =>
    applySubscriptionUpdate(ctx, 'resume', options, { resume: true })

  // --- Orders, invoices & refunds (live provider reads — no local ledger) ---

  const getOrders: Billing['getOrders'] = async (ctx, options = {}) => {
    if (!accessToken) return null
    const { userId } = await getUserInfo(ctx as unknown as PolarRunQueryCtx)
    await throttle(ctx, userId, 'order reads')
    const customer = await provider.getCustomerByUserId(ctx as unknown as PolarRunQueryCtx, userId)
    // No provider customer yet = nothing has ever been charged. An empty page
    // is the honest answer; `null` is reserved for "billing isn't configured".
    if (!customer) return { items: [], pagination: { totalCount: 0, maxPage: 0 } }
    const page = resolvePage(options)
    const result = await ordersList(provider.polar, {
      customerId: customer.id,
      page,
      limit: resolveLimit(options.limit),
      sorting: ['-created_at'],
    })
    const { items, pagination } = unwrapProvider(result, 'order read').result
    return {
      items: items.map(order => toConvexValue(order) as unknown as BillingOrder),
      pagination,
      ...(page < pagination.maxPage ? { nextCursor: String(page + 1) } : {}),
    }
  }

  const getInvoiceUrl: Billing['getInvoiceUrl'] = async (ctx, orderId) => {
    if (!accessToken) return null
    const { userId } = await getUserInfo(ctx as unknown as PolarRunQueryCtx)
    await throttle(ctx, userId, 'invoice reads')
    const customer = await provider.getCustomerByUserId(ctx as unknown as PolarRunQueryCtx, userId)
    const order = unwrapProvider(await ordersGet(provider.polar, { id: orderId }), 'invoice read')
    // Ownership is the authorization: the order id is guessable-ish and the
    // invoice carries a name and address, so it never leaves its own account.
    if (!customer || order.customerId !== customer.id) {
      throw new Error('[nuxt-backend] getInvoiceUrl: that order belongs to a different billing account.')
    }
    if (!order.isInvoiceGenerated) {
      // Generation is asynchronous at the provider. Ask for it and report "not
      // yet" — the next call returns the URL.
      const generated = await ordersGenerateInvoice(provider.polar, { id: orderId })
      unwrapProvider(generated, 'invoice generation')
      return null
    }
    const invoice = await ordersInvoice(provider.polar, { id: orderId })
    return { url: unwrapProvider(invoice, 'invoice read').url }
  }

  const getUsageHistory: Billing['getUsageHistory'] = async (ctx, options = {}) => {
    if (!accessToken) return null
    const { userId } = await getUserInfo(ctx as unknown as PolarRunQueryCtx)
    await throttle(ctx, userId, 'usage reads')
    const customer = await provider.getCustomerByUserId(ctx as unknown as PolarRunQueryCtx, userId)
    // No provider customer = nothing was ever metered. An empty page is the
    // honest answer; `null` is reserved for "billing isn't configured".
    if (!customer) return { items: [], pagination: { totalCount: 0, maxPage: 0 } }
    // A friendly meter name resolves to its id; an unconfigured raw id passes
    // straight through, so an app can read a meter it never named.
    const meter = options.meter
      ? (creditMeters[options.meter] ? resolveMeter({ meter: options.meter }) : resolveMeter({ meterId: options.meter }))
      : null
    const page = resolvePage(options)
    const result = await eventsList(provider.polar, {
      customerId: customer.id,
      // The provider applies the meter's own filter clause, so the page holds
      // exactly the events that meter bills from — not merely same-named ones.
      meterId: meter?.meterId,
      startTimestamp: options.startTimestamp,
      endTimestamp: options.endTimestamp,
      page,
      limit: resolveLimit(options.limit),
      sorting: ['-timestamp'],
    })
    // Unlike the other list endpoints, the events response IS the list
    // resource (no `result` envelope), and its pagination has two shapes.
    const { items, pagination } = unwrapProvider(result, 'usage read')
    // Page-number pagination is what this package's pagers expect; the
    // provider's cursor shape carries only `hasNextPage`, so the totals stay
    // absent rather than being invented.
    const totals = 'maxPage' in pagination
      ? pagination
      : { totalCount: items.length, maxPage: pagination.hasNextPage ? page + 1 : page }
    return {
      items: items.map((event) => {
        const normalized = toConvexValue(event) as unknown as UsageEvent
        const units = meterUnits(meter, event.metadata as Record<string, unknown> | undefined)
        return units === undefined ? normalized : { ...normalized, units }
      }),
      pagination: totals,
      ...(page < totals.maxPage ? { nextCursor: String(page + 1) } : {}),
    }
  }

  /**
   * The default admin gate for `refundOrder`: an `admin` role claim on the
   * caller's identity. Better Auth's admin plugin stores roles as a
   * comma-separated string, so the claim is split before matching.
   */
  const requireAdmin = async (ctx: { auth?: Auth }): Promise<void> => {
    if (config.requireAdmin) {
      await config.requireAdmin(ctx)
      return
    }
    const identity = await ctx.auth?.getUserIdentity()
    const role = (identity as unknown as { role?: unknown } | null)?.role
    const roles = typeof role === 'string' ? role.split(',').map(entry => entry.trim()) : []
    if (!roles.includes('admin')) {
      throw new Error(
        '[nuxt-backend] refundOrder is admin-only — sign in as an admin, '
        + 'or pass `requireAdmin` to setupBilling to define your own gate.',
      )
    }
  }

  const refundOrder: Billing['refundOrder'] = async (ctx, options) => {
    requireProviderAccess('refund')
    await requireAdmin(ctx)
    const order = unwrapProvider(await ordersGet(provider.polar, { id: options.orderId }), 'refund')
    // The provider requires an explicit amount; default to everything still
    // refundable rather than making every caller read the order first.
    const amount = options.amount ?? order.refundableAmount
    if (!(amount > 0)) {
      throw new Error(`[nuxt-backend] refundOrder: order ${options.orderId} has nothing left to refund.`)
    }
    const result = await refundsCreate(provider.polar, {
      orderId: options.orderId,
      reason: options.reason,
      amount,
      revokeBenefits: options.revokeBenefits,
      metadata: options.metadata,
    })
    const refund = unwrapProvider(result, 'refund')
    return {
      id: refund.id,
      orderId: refund.orderId,
      status: String(refund.status),
      reason: String(refund.reason),
      amount: refund.amount,
      currency: refund.currency,
      revokeBenefits: refund.revokeBenefits,
    }
  }

  // --- Gifts ---

  /**
   * Attach a paid gift's billing customer to the recipient's billing entity:
   * insert the provider's customer↔entity mapping (unless already mapped), tag
   * the customer with the entity id so future webhooks self-resolve, mark the
   * gift claimed, and refresh the entitlement cache. Idempotent.
   */
  const attachGift = async (ctx: RunWriteCtx, gift: GiftRecord, userId: string, entityId: string): Promise<void> => {
    const existing = await provider.getCustomerByUserId(ctx as unknown as PolarRunQueryCtx, entityId)
    if (existing && existing.id !== gift.billingCustomerId) {
      // The entity already bills through another provider customer (e.g. the
      // recipient subscribed under a different email than the gift was sent
      // to). Entitlements can't move between provider customers — documented
      // limitation; the purchaser can re-gift to the recipient's billing email.
      throw new Error(
        '[nuxt-backend] This gift is attached to a different billing profile than your account uses. '
        + 'Ask the sender to re-send it to your billing email.',
      )
    }
    if (!existing) {
      await ctx.runMutation(providerLib.insertCustomer, { id: gift.billingCustomerId, userId: entityId })
    }
    // Tag the provider customer so future webhooks resolve the entity directly.
    const updated = await customersUpdate(provider.polar, {
      id: gift.billingCustomerId,
      customerUpdate: { metadata: { userId: entityId } },
    })
    if (!updated.ok) throw updated.error
    await ctx.runMutation(gifts.markClaimed, { giftId: gift.id, userId, entityId })
    await refreshEntitlements(ctx, entityId)
  }

  // --- Checkout ---

  /**
   * Find-or-create the provider customer for a billing entity and keep the
   * component's entity↔customer mapping in step. Matching on email first means
   * a customer who already paid (through a gift, say) keeps one billing
   * profile instead of sprouting a second.
   */
  const resolveCheckoutCustomer = async (ctx: RunWriteCtx, userId: string, email: string): Promise<string> => {
    const mapped = await provider.getCustomerByUserId(ctx as unknown as PolarRunQueryCtx, userId)
    if (mapped) return mapped.id
    const existing = await customersList(provider.polar, { email, limit: 1 })
    if (!existing.ok) throw existing.error
    let customerId = existing.value.result.items[0]?.id
    if (!customerId) {
      // The `userId` metadata is what lets the very first webhook resolve its
      // entity before any sync has run.
      const created = await customersCreate(provider.polar, { email, metadata: { userId } })
      if (!created.ok) throw created.error
      customerId = created.value.id
    }
    await ctx.runMutation(providerLib.insertCustomer, { id: customerId, userId })
    return customerId
  }

  /**
   * Build the provider checkout payload from this package's options. Only
   * fields the installed `CheckoutCreate` actually has are set — `prefill`
   * maps onto the `customer*` fields, `customFields` onto `customFieldData`.
   */
  const buildCheckoutPayload = (options: CheckoutOptions, customerId: string): CheckoutCreateInput => {
    const prefill = options.prefill ?? {}
    return {
      products: options.productIds,
      customerId,
      embedOrigin: options.origin,
      successUrl: options.successUrl,
      subscriptionId: options.subscriptionId,
      metadata: options.metadata,
      trialInterval: options.trialInterval,
      trialIntervalCount: options.trialIntervalCount,
      locale: options.locale,
      allowDiscountCodes: options.allowDiscountCodes ?? true,
      discountId: options.discountId,
      requireBillingAddress: options.requireBillingAddress,
      customFieldData: options.customFields,
      customerName: prefill.name,
      customerEmail: prefill.email,
      customerBillingName: prefill.billingName,
      // The SDK types `country` as a closed alpha-2 enum; the value is a plain
      // string at this boundary, validated by the provider on submit.
      customerBillingAddress: prefill.billingAddress as CheckoutCreateInput['customerBillingAddress'],
      customerTaxId: prefill.taxId,
      isBusinessCustomer: prefill.business,
    }
  }

  /**
   * Replaces the provider api()'s `generateCheckoutLink` with a superset: the
   * same arguments plus prefill, custom fields, billing-address and discount
   * control. Upstream appends `locale` as a URL query parameter; the payload
   * has a real `locale` field, so it is passed properly here.
   */
  const generateCheckoutLink = actionGeneric({
    args: {
      productIds: v.array(v.string()),
      origin: v.string(),
      successUrl: v.string(),
      subscriptionId: v.optional(v.string()),
      metadata: v.optional(v.record(v.string(), v.string())),
      trialInterval: v.optional(v.union(v.string(), v.null())),
      trialIntervalCount: v.optional(v.union(v.number(), v.null())),
      locale: v.optional(v.string()),
      prefill: v.optional(v.object({
        name: v.optional(v.string()),
        email: v.optional(v.string()),
        billingName: v.optional(v.string()),
        billingAddress: v.optional(v.object({
          country: v.string(),
          line1: v.optional(v.string()),
          line2: v.optional(v.string()),
          postalCode: v.optional(v.string()),
          city: v.optional(v.string()),
          state: v.optional(v.string()),
        })),
        taxId: v.optional(v.string()),
        business: v.optional(v.boolean()),
      })),
      customFields: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
      requireBillingAddress: v.optional(v.boolean()),
      allowDiscountCodes: v.optional(v.boolean()),
      discountId: v.optional(v.string()),
    },
    returns: v.object({ url: v.string() }),
    handler: async (ctx, args) => {
      requireProviderAccess('checkout')
      const { userId, email } = await getUserInfo(ctx as unknown as PolarRunQueryCtx)
      await throttle(ctx, userId, 'checkouts')
      const customerId = await resolveCheckoutCustomer(ctx, userId, email)
      const payload = buildCheckoutPayload(
        { ...args, trialInterval: args.trialInterval as CheckoutOptions['trialInterval'] },
        customerId,
      )
      const checkout = await checkoutsCreate(provider.polar, payload)
      return { url: unwrapProvider(checkout, 'checkout').url }
    },
  })

  const giftCheckout = actionGeneric({
    args: {
      productIds: v.array(v.string()),
      recipientEmail: v.string(),
      message: v.optional(v.string()),
      origin: v.string(),
      successUrl: v.string(),
      metadata: v.optional(v.record(v.string(), v.string())),
    },
    handler: async (ctx, args) => {
      const identity = await ctx.auth.getUserIdentity()
      if (!identity) {
        throw new Error('[nuxt-backend] giftCheckout: sign in to send a gift.')
      }
      const claims = identity as unknown as Record<string, unknown>
      const purchaserUserId = identity.subject
      const purchaserEmail = typeof claims.email === 'string' ? claims.email : undefined
      const purchaserName = typeof claims.name === 'string' ? claims.name : undefined
      const recipientEmail = args.recipientEmail.trim().toLowerCase()
      if (!recipientEmail || !recipientEmail.includes('@')) {
        throw new Error('[nuxt-backend] giftCheckout: a valid recipient email is required.')
      }
      // Find-or-create the provider customer keyed by the recipient's email —
      // reusing an existing customer means a recipient who already subscribed
      // receives the gift on their existing billing profile. Deliberately no
      // `userId` metadata yet: that's set at claim time.
      const existing = await customersList(provider.polar, { email: recipientEmail, limit: 1 })
      const found = existing.ok ? existing.value.result.items[0] : undefined
      let billingCustomerId = found?.id
      if (!billingCustomerId) {
        const created = await customersCreate(provider.polar, {
          email: recipientEmail,
          metadata: { giftRecipient: 'true' },
        })
        if (!created.ok) throw created.error
        billingCustomerId = created.value.id
      }
      const giftId = await ctx.runMutation(gifts.create, {
        recipientEmail,
        purchaserUserId,
        purchaserEmail,
        purchaserName,
        productIds: args.productIds,
        message: args.message,
        billingCustomerId,
      })
      const checkout = await checkoutsCreate(provider.polar, {
        customerId: billingCustomerId,
        products: args.productIds,
        embedOrigin: args.origin,
        successUrl: args.successUrl,
        allowDiscountCodes: true,
        metadata: {
          ...args.metadata,
          gift: 'true',
          giftId,
          recipientEmail,
          purchaserUserId,
        },
      })
      if (!checkout.ok) throw checkout.error
      return { url: checkout.value.url }
    },
  })

  /** Claim one gift (by id) or every paid gift addressed to the caller's email. */
  const claimGift = actionGeneric({
    args: { giftId: v.optional(v.string()) },
    handler: async (ctx, { giftId }) => {
      const identity = await ctx.auth.getUserIdentity()
      if (!identity) {
        throw new Error('[nuxt-backend] claimGift: sign in to receive a gift.')
      }
      const claims = identity as unknown as Record<string, unknown>
      const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : null
      if (!email) {
        throw new Error('[nuxt-backend] claimGift: the signed-in identity has no email claim.')
      }
      const entity = await entityFromIdentity(ctx)
      if (!entity) {
        throw new Error('[nuxt-backend] claimGift: no billing entity — sign in (a personal workspace is created automatically).')
      }
      // Email ownership is proven by the OTP sign-in flow, so matching the
      // identity's email against the gift's recipient is the authorization.
      const candidates: GiftRecord[] = giftId
        ? [await ctx.runQuery(gifts.get, { giftId })].filter((g): g is GiftRecord => g !== null)
        : await ctx.runQuery(gifts.listByEmail, { email, status: 'paid' })
      let claimed = 0
      for (const gift of candidates) {
        if (gift.recipientEmail !== email) {
          throw new Error('[nuxt-backend] claimGift: this gift is addressed to a different email.')
        }
        if (gift.status !== 'paid') continue
        await attachGift(ctx, gift, identity.subject, entity.userId)
        claimed++
      }
      return { claimed }
    },
  })

  const getReceivedGifts = queryGeneric({
    args: {},
    handler: async (ctx) => {
      const identity = await ctx.auth.getUserIdentity()
      if (!identity) return null
      const claims = identity as unknown as Record<string, unknown>
      const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : null
      if (!email) return null
      return await ctx.runQuery(gifts.listByEmail, { email })
    },
  })

  /**
   * Gift fulfilment on `order.paid`: mark the gift paid, auto-attach it when
   * the recipient already has an account (and, in org mode, a workspace), and
   * email the recipient — the same notification doubles as an invite to sign
   * up when the email has no account yet (claiming then happens on first
   * sign-in via `useGifts`).
   */
  const handleGiftOrderPaid = async (ctx: RunWriteCtx, event: PolarWebhookEvent): Promise<void> => {
    const data = event.data as { id?: string, metadata?: Record<string, unknown> }
    const meta = data.metadata ?? {}
    if (meta.gift !== 'true' || typeof meta.giftId !== 'string') return
    await ctx.runMutation(gifts.markPaid, {
      giftId: meta.giftId,
      billingOrderId: typeof data.id === 'string' ? data.id : undefined,
    })
    const gift = await ctx.runQuery(gifts.get, { giftId: meta.giftId })
    if (!gift || gift.status === 'claimed') return
    const recipient = await ctx.runQuery(gifts.resolveRecipient, { email: gift.recipientEmail })
    if (recipient) {
      const entityId = billTo === 'organization' ? recipient.organizationId : recipient.userId
      if (entityId) {
        try {
          await attachGift(ctx, gift, recipient.userId, entityId)
        }
        catch (error) {
          // Leave the gift `paid` — the recipient can still claim from the app.
          console.warn('[nuxt-backend] Gift auto-attach failed; the recipient can claim it on sign-in.', error)
        }
      }
    }
    const sendEmail = components.backend.email?.send
    if (sendEmail) {
      // Status-guarded stamp: webhook redeliveries of `order.paid` (retries,
      // manual replays) must never email the recipient twice.
      const shouldNotify = await ctx.runMutation(gifts.markNotified, { giftId: gift.id })
      if (shouldNotify) {
        const claimUrl = readEnv('SITE_URL') ?? ''
        const template = config.giftEmail ?? defaultGiftEmail
        const message = template({
          recipientEmail: gift.recipientEmail,
          purchaserName: gift.purchaserName,
          purchaserEmail: gift.purchaserEmail,
          message: gift.message,
          claimUrl,
        })
        await ctx.runMutation(sendEmail, message)
      }
    }
    else {
      // Never fail the webhook — the gift stays claimable in-app — but don't
      // be silent about the recipient not hearing of it.
      console.warn('[nuxt-backend] Gift notification not sent — the backend component has no email module.')
    }
  }

  // --- Ready-made reactive functions (re-exported by the consumer's billing.ts) ---

  const resolveUserId = async (ctx: GenericQueryCtx<GenericDataModel>): Promise<string | null> => {
    if (billTo === 'user' && config.currentUserId) return config.currentUserId(ctx)
    return (await entityFromIdentity(ctx))?.userId ?? null
  }

  /** The caller's entitlement snapshot row, or `null` when nobody is signed in. */
  const resolveUserRow = async (ctx: GenericQueryCtx<GenericDataModel>) => {
    const userId = await resolveUserId(ctx)
    if (!userId) return null
    return { userId, row: await ctx.runQuery(cache.getByUser, { userId }) }
  }

  const getCurrentSubscription = queryGeneric({
    args: {},
    handler: async (ctx) => {
      const userId = await resolveUserId(ctx)
      if (!userId) return null
      if (!config.multipleSubscriptions) {
        return provider.getCurrentSubscription(ctx as unknown as PolarRunQueryCtx, { userId })
      }
      // Array-first: with add-ons there is no single "the" subscription, and
      // the upstream single-subscription read is a `.unique()` that would
      // throw here. `paused` counts as live — the provider's pause events are
      // not confirmed on this deployment, so a paused plan must not silently
      // read as the free plan.
      const all = await provider.listAllUserSubscriptions(ctx as unknown as PolarRunQueryCtx, { userId })
      const now = new Date().toISOString()
      const live = all.filter(subscription =>
        subscription.endedAt == null
        && LIVE_SUBSCRIPTION_STATUSES.has(subscription.status)
        // The subscriptions table is webhook-synced, so it lags the trial-end
        // transition. Upstream's single-subscription read drops a trial already
        // past its end for exactly that reason; both branches have to agree on
        // what counts as subscribed, or a config flag would change the meaning
        // of `isSubscribed`.
        && !(subscription.status === 'trialing' && subscription.trialEnd != null && subscription.trialEnd <= now))
      // `null` keeps meaning "on the free plan" for every existing consumer.
      if (live.length === 0) return null
      // Join each subscription to its product exactly as upstream's single read
      // does: `<PricingTable>` and feature copy read `product` / `productKey`,
      // so the two branches must return the same shape.
      const enriched = await Promise.all(live.map(async (subscription) => {
        const product = await provider.getProduct(ctx as unknown as PolarRunQueryCtx, {
          productId: subscription.productId,
        })
        const productKey = products
          ? Object.keys(products).find(key => products[key] === subscription.productId)
          : undefined
        return { ...subscription, productKey, product }
      }))
      // The array leads; the primary subscription's fields ride alongside so
      // `subscription.productId` / `.status` keep reading unchanged.
      return { subscriptions: enriched, ...enriched[0] } as CurrentSubscriptions
    },
  })

  // Replaces the provider api()'s generated query, which resolves the caller
  // via `getUserInfo` and therefore throws for claimless callers. Reactive
  // clients subscribe during every auth handshake and websocket reconnect, and
  // Convex retries a throwing query — degrading to `null` keeps the logs clean.
  const listAllSubscriptions = queryGeneric({
    args: {},
    handler: async (ctx) => {
      const userId = await resolveUserId(ctx)
      if (!userId) return null
      return provider.listAllUserSubscriptions(ctx as unknown as PolarRunQueryCtx, { userId })
    },
  })

  const getFeatures = queryGeneric({
    args: {},
    handler: async (ctx) => {
      const resolved = await resolveUserRow(ctx)
      if (!resolved) return null
      const benefits = resolved.row?.benefits ?? []
      // Join live benefit metadata at read time: a `benefit.updated` webhook
      // patches one snapshot row and every subscriber updates reactively.
      const benefitIds = [...new Set(benefits.map(benefit => benefit.benefitId))]
      const snapshots = benefitIds.length > 0
        ? await ctx.runQuery(cache.getBenefitMetadata, { benefitIds })
        : []
      const metadataById = new Map(snapshots.map(s => [s.benefitId, s.metadata]))
      return {
        plans: resolved.row?.activeProductIds ?? [],
        benefits: benefits.map(benefit => ({
          ...benefit,
          metadata: metadataById.get(benefit.benefitId) ?? benefit.metadata,
        })),
      }
    },
  })

  const getCredits = queryGeneric({
    args: {},
    handler: async (ctx) => {
      const resolved = await resolveUserRow(ctx)
      if (!resolved) return null
      // Meters carry their configured friendly name so `useCredits('credits')`
      // resolves without the client ever seeing provider ids.
      return {
        meters: (resolved.row?.meters ?? []).map(meter => ({
          ...meter,
          name: meterNameById.get(meter.meterId),
        })),
      }
    },
  })

  // The webhook delivery feed (doctor's "last webhook received", the DevTools
  // Overview card, the playground's webhook page). Identity-gated: delivery
  // rows carry event types and provider ids.
  const getWebhookDeliveries = queryGeneric({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, { limit }) => {
      if (!(await ctx.auth.getUserIdentity())) return null
      if (!webhookLog) return []
      return ctx.runQuery(webhookLog.listRecent, { limit })
    },
  })

  const syncEntitlements = actionGeneric({
    args: {},
    handler: async (ctx) => {
      const { userId } = await getUserInfo(ctx as unknown as PolarRunQueryCtx)
      if (!userId) return null
      // Guard the live provider fan-out: throttle per billing entity so a caller
      // can't loop this to burn the access token's quota / trip provider limits.
      await throttle(ctx, userId, 'entitlement syncs')
      await refreshEntitlements(ctx, userId)
      return null
    },
  })

  // Pull the provider's product catalog into the component's reactive products
  // table. A fresh deployment has never seen a product webhook, so configured
  // products resolve empty until this runs once (checkout links, pricing pages,
  // `useBilling().products`). Identity-gated and throttled like
  // `syncEntitlements` — it fans out to the live provider API.
  const syncProducts = actionGeneric({
    args: {},
    handler: async (ctx) => {
      const { userId } = await getUserInfo(ctx as unknown as PolarRunQueryCtx)
      if (!userId) return null
      await throttle(ctx, userId, 'product syncs')
      await provider.syncProducts(ctx as never)
      return null
    },
  })

  // --- Ready-made subscription-lifecycle / order actions ---
  //
  // Registered so `useBilling()` reaches them by name. Each one resolves the
  // billing entity itself, so a client can only ever act on its own
  // subscription — the ids never come from the caller except as a filter
  // checked against that entity.

  const subscriptionTargetArgs = { subscriptionId: v.optional(v.string()) }

  const updateSubscriptionFn = actionGeneric({
    args: {
      ...subscriptionTargetArgs,
      productId: v.optional(v.string()),
      // Deliberately narrower than `ProrationBehavior`: see
      // {@link ClientProrationBehavior}. `next_period` / `reset` would let any
      // signed-in customer take an immediate upgrade that is not invoiced
      // until the next cycle, so they never come off the wire.
      proration: v.optional(v.union(v.literal('invoice'), v.literal('prorate'))),
    },
    handler: async (ctx, args) => {
      await updateSubscription(ctx, args)
      return null
    },
  })

  const cancelSubscriptionFn = actionGeneric({
    args: {
      ...subscriptionTargetArgs,
      atPeriodEnd: v.optional(v.boolean()),
      reason: v.optional(v.union(
        v.literal('customer_service'),
        v.literal('low_quality'),
        v.literal('missing_features'),
        v.literal('switched_service'),
        v.literal('too_complex'),
        v.literal('too_expensive'),
        v.literal('unused'),
        v.literal('other'),
      )),
      comment: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
      await cancelSubscription(ctx, args)
      return null
    },
  })

  const uncancelSubscriptionFn = actionGeneric({
    args: subscriptionTargetArgs,
    handler: async (ctx, args) => {
      await uncancelSubscription(ctx, args)
      return null
    },
  })

  const pauseSubscriptionFn = actionGeneric({
    // Epoch milliseconds on the wire — Convex has no date value.
    args: { ...subscriptionTargetArgs, resumesAt: v.optional(v.number()) },
    handler: async (ctx, args) => {
      await pauseSubscription(ctx, {
        subscriptionId: args.subscriptionId,
        resumesAt: args.resumesAt === undefined ? undefined : new Date(args.resumesAt),
      })
      return null
    },
  })

  const resumeSubscriptionFn = actionGeneric({
    args: subscriptionTargetArgs,
    handler: async (ctx, args) => {
      await resumeSubscription(ctx, args)
      return null
    },
  })

  const getOrdersFn = actionGeneric({
    args: {
      limit: v.optional(v.number()),
      cursor: v.optional(v.string()),
      page: v.optional(v.number()),
    },
    handler: (ctx, args) => getOrders(ctx, args),
  })

  const getInvoiceUrlFn = actionGeneric({
    args: { orderId: v.string() },
    handler: (ctx, { orderId }) => getInvoiceUrl(ctx, orderId),
  })

  const getUsageHistoryFn = actionGeneric({
    args: {
      meter: v.optional(v.string()),
      limit: v.optional(v.number()),
      cursor: v.optional(v.string()),
      page: v.optional(v.number()),
      // Epoch milliseconds on the wire — Convex has no date value.
      startTimestamp: v.optional(v.number()),
      endTimestamp: v.optional(v.number()),
    },
    handler: (ctx, args) => getUsageHistory(ctx, {
      ...args,
      startTimestamp: args.startTimestamp === undefined ? undefined : new Date(args.startTimestamp),
      endTimestamp: args.endTimestamp === undefined ? undefined : new Date(args.endTimestamp),
    }),
  })

  const refundOrderFn = actionGeneric({
    args: {
      orderId: v.string(),
      amount: v.optional(v.number()),
      reason: v.union(
        v.literal('duplicate'),
        v.literal('fraudulent'),
        v.literal('customer_request'),
        v.literal('service_disruption'),
        v.literal('satisfaction_guarantee'),
        v.literal('other'),
      ),
      revokeBenefits: v.optional(v.boolean()),
    },
    handler: (ctx, args) => refundOrder(ctx, args),
  })

  // --- Webhook handlers: keep the cache fresh as billing state changes ---

  // Handlers run inside an httpAction at runtime, so we can refresh inline.
  /**
   * The billing entity a webhook event belongs to. Prefers the provider
   * customer metadata (set at checkout, so first-time webhooks self-bootstrap)
   * and falls back to the synced cache. Gift orders carry no `userId` metadata
   * until claimed, so they resolve to `null` here and are handled by the gift
   * branch instead.
   */
  const resolveEventEntity = async (ctx: RunWriteCtx, event: PolarWebhookEvent): Promise<string | null> => {
    const data = event.data as {
      id?: string
      customerId?: string
      customer?: { id?: string, metadata?: Record<string, unknown> }
      metadata?: Record<string, unknown>
    }
    const customerId = data.customerId ?? data.customer?.id ?? data.id
    if (typeof customerId !== 'string') return null
    const metaUserId = data.customer?.metadata?.userId ?? data.metadata?.userId
    if (typeof metaUserId === 'string') return metaUserId
    return await ctx.runQuery(cache.userByCustomer, { customerId })
  }

  const handleRefreshEvent = async (ctx: RunWriteCtx, event: PolarWebhookEvent): Promise<void> => {
    const userId = await resolveEventEntity(ctx, event)
    if (!userId) return
    await refreshEntitlements(ctx, userId)
  }

  /**
   * A refund landed. Credit reversal itself is **provider-driven** — meter
   * credits come from the provider's benefit grants, so the refund revokes
   * them there and the refresh below simply reads the new truth.
   *
   * What this package must do is drop the entity's in-flight spend
   * reservations: the cache invariant is `provider state − reservations`, and
   * re-subtracting reservations from an already-reduced balance would leave
   * the cache below what the provider says. The reserving flows self-heal —
   * their `settle`/`release` finds nothing and the next sync is authoritative.
   */
  const handleOrderRefunded = async (ctx: RunWriteCtx, event: PolarWebhookEvent): Promise<void> => {
    const clearPendingSpends = cache.clearPendingSpends
    if (!clearPendingSpends) return
    const userId = await resolveEventEntity(ctx, event)
    if (!userId) return
    await ctx.runMutation(clearPendingSpends, { userId })
  }

  // A benefit's metadata changed — patch the snapshot so friendly-key feature
  // gating (`has('premium')`) updates reactively for every entity holding it.
  const handleBenefitUpdated = async (ctx: RunWriteCtx, event: PolarWebhookEvent): Promise<void> => {
    const data = event.data as { id?: string, metadata?: Record<string, string | number | boolean> }
    if (typeof data.id !== 'string') return
    await ctx.runMutation(cache.upsertBenefitMetadata, {
      entries: [{ benefitId: data.id, metadata: data.metadata ?? {} }],
    })
  }

  // One handler per event type over the provider's FULL catalog — every
  // verified delivery gets built-in behavior (cache refresh for the refresh
  // set, snapshot patching, gift fulfilment) and then the consumer's hook,
  // which therefore reads fresh entitlements. Covering everything means no
  // authentic event is ever silently invisible.
  const consumerEvents = config.events ?? {}
  const eventTypes = new Set<string>([...ALL_BILLING_EVENTS, ...Object.keys(consumerEvents)])
  const webhookEvents = Object.fromEntries(
    [...eventTypes].map((type) => {
      const refreshes = (REFRESH_EVENTS as readonly string[]).includes(type)
      const consumerHandler = consumerEvents[type as keyof WebhookEventHandlers]
      return [type, async (ctx: RunWriteCtx, event: PolarWebhookEvent) => {
        // Reservations are dropped *before* the refresh, so the refreshed
        // cache is exactly what the provider now says.
        if (type === 'order.refunded') await handleOrderRefunded(ctx, event)
        if (refreshes) await handleRefreshEvent(ctx, event)
        if (type === 'benefit.updated') await handleBenefitUpdated(ctx, event)
        if (type === 'order.paid') await handleGiftOrderPaid(ctx, event)
        if (consumerHandler) await (consumerHandler as (ctx: RunWriteCtx, event: PolarWebhookEvent) => Promise<void>)(ctx, event)
      }]
    }),
  ) as BillingWebhookEventHandlers

  // --- The guarded webhook edge (mounted by registerBackendRoutes) ---
  //
  // Upstream verification + built-in persistence are kept byte-for-byte, but
  // the public route is OURS: the upstream handlers are captured through a
  // shim router (one per accepted secret — comma-separated rotation list) and
  // invoked behind the shared fail-closed guard. This adds: missing-secret
  // 503, 1 MiB cap, webhook-id dedupe, authentic-unknown-type 202 (instead of
  // an unparseable event 500-looping the endpoint), and outcome logging.
  const webhookSecrets = parseSecretList(webhookSecret)
  const webhookLog = components.backend.webhooks
  const capturedHandlers: Array<(ctx: RunWriteCtx, request: Request) => Promise<Response>> = []
  for (const secret of webhookSecrets) {
    const handlerProvider = secret === webhookSecrets[0]
      ? provider
      : new Polar(components.polar, { ...config, products, getUserInfo, organizationToken: accessToken, server: environment, webhookSecret: secret })
    const shim = {
      route: (spec: { handler: unknown }) => {
        // Registered http actions carry their implementation on `_handler`
        // (the same seam convex-test drives) — pinned by a unit test, with the
        // documented fallback of single-secret direct mounting.
        const handler = (spec.handler as { _handler?: (ctx: RunWriteCtx, request: Request) => Promise<Response> })._handler
        if (handler) capturedHandlers.push(handler)
      },
    }
    handlerProvider.registerRoutes(shim as never, { path: '/billing/events', events: webhookEvents })
  }

  const webhookHandler = async (ctx: RunWriteCtx, request: Request): Promise<Response> => {
    const body = await request.text()
    const logRefs = config.deliveryLog === false ? undefined : webhookLog
    const guard = logRefs
      ? await guardDelivery(ctx as never, logRefs, {
          service: 'billing',
          deliveryId: request.headers.get('webhook-id'),
          bodyLength: body.length,
          secretsConfigured: webhookSecrets.length > 0,
        })
      : noopGuard(webhookSecrets.length > 0, body.length)
    if (guard.rejection) return guard.rejection

    const parsedType = ((): string | undefined => {
      try {
        const parsed = JSON.parse(body) as { type?: unknown }
        return typeof parsed.type === 'string' ? parsed.type : undefined
      }
      catch {
        return undefined
      }
    })()

    // The provider signs with Standard Webhooks semantics; the SDK verifies a
    // different reading of the same secret (see translateStandardSignature).
    const headers = translateStandardSignature(request.headers, body, webhookSecrets)
    let lastForbidden: Response | null = null
    for (const handler of capturedHandlers) {
      const attempt = new Request(request.url, { method: 'POST', headers, body })
      try {
        const response = await handler(ctx, attempt)
        if (response.status === 403) {
          // Signature mismatch — try the next accepted secret (verification
          // has no side effects).
          lastForbidden = response
          continue
        }
        await guard.record('ok', { type: parsedType })
        return response
      }
      catch (error) {
        if ((error as { name?: string })?.name === 'SDKValidationError') {
          // Authentic (signature passed before parsing) but unparseable by
          // the installed SDK — acknowledge instead of 500-looping.
          if (config.onUnknownEvent) {
            await config.onUnknownEvent(ctx, { type: parsedType, payload: safeJsonParse(body) })
          }
          await guard.record('unknown_type', { type: parsedType })
          return new Response('Accepted (unknown event type)', { status: 202 })
        }
        await guard.record('handler_error', {
          type: parsedType,
          note: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    }
    await guard.record('invalid_signature')
    return lastForbidden ?? new Response('Invalid signature', { status: 403 })
  }

  const forgetEntity: Billing['forgetEntity'] = async (ctx, userId) => {
    if (!cache.deleteByUser) throw new Error('[nuxt-backend] components.backend.billing.deleteByUser is missing — redeploy the backend component (or update the local install) to forget billing entities.')
    await ctx.runMutation(cache.deleteByUser, { userId })
  }

  return {
    provider,
    api: { ...provider.api(), listAllSubscriptions, generateCheckoutLink, giftCheckout },
    functions: {
      getCurrentSubscription,
      getFeatures,
      getCredits,
      syncEntitlements,
      syncProducts,
      getReceivedGifts,
      claimGift,
      getWebhookDeliveries,
      updateSubscription: updateSubscriptionFn,
      cancelSubscription: cancelSubscriptionFn,
      uncancelSubscription: uncancelSubscriptionFn,
      pauseSubscription: pauseSubscriptionFn,
      resumeSubscription: resumeSubscriptionFn,
      getOrders: getOrdersFn,
      getInvoiceUrl: getInvoiceUrlFn,
      getUsageHistory: getUsageHistoryFn,
      refundOrder: refundOrderFn,
    },
    webhookEvents,
    webhookHandler,
    getCustomerState,
    spendCredits,
    refundCredits,
    reserveCredits,
    settleSpend,
    releaseSpend,
    resolveEntity: entityFromIdentity,
    forgetEntity,
    createDiscount,
    discounts,
    updateSubscription,
    cancelSubscription,
    uncancelSubscription,
    pauseSubscription,
    resumeSubscription,
    getOrders,
    getInvoiceUrl,
    getUsageHistory,
    refundOrder,
  }
}
