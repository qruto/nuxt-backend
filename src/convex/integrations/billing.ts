import { Polar, type PolarWebhookEvent, type WebhookEventHandlers } from '@convex-dev/polar'
import { benefitsGet } from '@polar-sh/sdk/funcs/benefitsGet.js'
import { checkoutsCreate } from '@polar-sh/sdk/funcs/checkoutsCreate.js'
import { customersCreate } from '@polar-sh/sdk/funcs/customersCreate.js'
import { customersGetState } from '@polar-sh/sdk/funcs/customersGetState.js'
import { customersList } from '@polar-sh/sdk/funcs/customersList.js'
import { customersUpdate } from '@polar-sh/sdk/funcs/customersUpdate.js'
import { discountsCreate } from '@polar-sh/sdk/funcs/discountsCreate.js'
import { eventsIngest } from '@polar-sh/sdk/funcs/eventsIngest.js'
import {
  actionGeneric,
  type Auth,
  type FunctionReference,
  type GenericActionCtx,
  type GenericDataModel,
  type GenericQueryCtx,
  queryGeneric,
} from 'convex/server'
import { guardDelivery, parseSecretList, WEBHOOK_BODY_LIMIT, type WebhookLogRefs } from './webhook-guard'
import { v } from 'convex/values'
import type { SendEmailOptions } from './email'

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
  limit: (
    ctx: RunWriteCtx,
    name: 'billingSync',
    options?: { key?: string, throws?: boolean },
  ) => Promise<{ ok: boolean, retryAfter?: number }>
}

/** Full event-ingest payload (derived from the provider SDK). */
type EventsIngestRequest = Parameters<typeof eventsIngest>[1]
/** Full discount-create payload (derived from the provider SDK) — fixed or percentage. */
export type DiscountInput = Parameters<typeof discountsCreate>[1]

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
      }, { ok: boolean, balance: number, reason?: 'no-row' | 'no-meter' | 'insufficient' }>
      settle: FunctionReference<'mutation', 'internal', { userId: string, externalId: string }, null>
      release: FunctionReference<'mutation', 'internal', { userId: string, externalId: string }, null>
      credit: FunctionReference<'mutation', 'internal', { userId: string, meterId: string, amount: number }, null>
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
   * Throttle `syncEntitlements` per billing entity. Pass your
   * `setupRateLimiter(...)` limiter and each authenticated sync is checked
   * against the `billingSync` limit (10/min, keyed by the workspace/user), so a
   * caller can't loop it to amplify the live provider fan-out. Omit to leave
   * the action unthrottled.
   */
  rateLimiter?: BillingRateLimiter
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
export { type BillingCatalog, BILLING_WEBHOOK_PROVISION_EVENTS, type CatalogCreditGrant, type CatalogFeature, type CatalogMeter, type CatalogPack, type CatalogPlan, defineBillingCatalog } from '../catalog'

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
   * reactive queries subscribe in).
   */
  api: Omit<ReturnType<Polar['api']>, 'listAllSubscriptions'> & {
    listAllSubscriptions: ReturnType<typeof queryGeneric>
    giftCheckout: ReturnType<typeof actionGeneric>
  }
  /**
   * Ready-made, client-callable functions to re-export from your `billing.ts`
   * so `useBilling` / `useFeatures` / `useCredits` / `useGifts` work with zero
   * hand-wiring: the reactive current-subscription, feature-gating and
   * credit-balance queries, a `syncEntitlements` action to refresh the cache
   * after checkout / top-up, and the gift queries/claim action.
   */
  functions: {
    getCurrentSubscription: ReturnType<typeof queryGeneric>
    getFeatures: ReturnType<typeof queryGeneric>
    getCredits: ReturnType<typeof queryGeneric>
    syncEntitlements: ReturnType<typeof actionGeneric>
    getReceivedGifts: ReturnType<typeof queryGeneric>
    claimGift: ReturnType<typeof actionGeneric>
    getWebhookDeliveries: ReturnType<typeof queryGeneric>
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
  settleSpend: (ctx: RunWriteCtx, reservation: SpendReservation, options?: { name?: string, metadata?: Record<string, string | number | boolean>, timestamp?: Date }) => Promise<void>
  /** Undo a reservation whose work failed — nothing is charged. */
  releaseSpend: (ctx: RunWriteCtx, reservation: SpendReservation) => Promise<void>
  /**
   * Resolve the billing entity from the caller's identity claims — the active
   * workspace (`billTo: 'organization'`) or the signed-in user. `null` when
   * signed out.
   */
  resolveEntity: (ctx: { auth?: Auth }) => Promise<{ userId: string, email: string } | null>
  /**
   * Create a discount / coupon (provider `discounts.create`). Call from an
   * **action**. Accepts the full discount-create shape (fixed or percentage).
   */
  createDiscount: (discount: DiscountInput) => Promise<{ id: string, code: string | null }>
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

  const getCustomerState: Billing['getCustomerState'] = async (ctx, { userId }) => {
    const customer = await provider.getCustomerByUserId(ctx as unknown as PolarRunQueryCtx, userId)
    if (!customer) {
      return { customerId: null, activeProductIds: [], benefits: [], meters: [] }
    }
    const result = await customersGetState(provider.polar, { id: customer.id })
    if (!result.ok) throw result.error
    const state = result.value as {
      activeSubscriptions?: Array<{ productId: string }>
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
    await Promise.all(
      staleBenefitIds.map(async (benefitId) => {
        const benefit = await benefitsGet(provider.polar, { id: benefitId })
        if (benefit.ok) {
          const metadata = benefit.value.metadata ?? {}
          metadataByBenefit.set(benefitId, metadata)
          fetched.push({ benefitId, metadata })
        }
      }),
    )
    if (fetched.length > 0 && 'runMutation' in ctx) {
      await (ctx as RunWriteCtx).runMutation(cache.upsertBenefitMetadata, { entries: fetched })
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
    let result = await ctx.runMutation(cache.debit, { userId: entityId, meterId: meter.meterId, amount: value, externalId })
    if (!result.ok && (result.reason === 'no-row' || result.reason === 'no-meter') && event.allowRefresh !== false) {
      // Cold cache (granted but never synced) — self-heal once, then retry.
      // Needs an action ctx (the provider read fetches); mutation callers pass
      // `allowRefresh: false` and surface the sync hint instead.
      await refreshEntitlements(ctx as RunWriteCtx, entityId)
      result = await ctx.runMutation(cache.debit, { userId: entityId, meterId: meter.meterId, amount: value, externalId })
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
    try {
      const customer = await provider.getCustomerByUserId(ctx as unknown as PolarRunQueryCtx, reservation.entityId)
      if (!customer) {
        throw new Error(`[nuxt-backend] No billing customer for ${reservation.entityId}. Start a checkout first.`)
      }
      const metadata = meter?.property
        ? { ...options.metadata, [meter.property]: reservation.value }
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
    if (reservation.reserved) await ctx.runMutation(cache.settle, { userId: reservation.entityId, externalId: reservation.externalId })
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
    const result = await discountsCreate(provider.polar, discount)
    if (!result.ok) throw result.error
    return { id: result.value.id, code: result.value.code ?? null }
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

  const getCurrentSubscription = queryGeneric({
    args: {},
    handler: async (ctx) => {
      const userId = await resolveUserId(ctx)
      if (!userId) return null
      return provider.getCurrentSubscription(ctx as unknown as PolarRunQueryCtx, { userId })
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
      const userId = await resolveUserId(ctx)
      if (!userId) return null
      const row = await ctx.runQuery(cache.getByUser, { userId })
      const benefits = row?.benefits ?? []
      // Join live benefit metadata at read time: a `benefit.updated` webhook
      // patches one snapshot row and every subscriber updates reactively.
      const benefitIds = [...new Set(benefits.map(benefit => benefit.benefitId))]
      const snapshots = benefitIds.length > 0
        ? await ctx.runQuery(cache.getBenefitMetadata, { benefitIds })
        : []
      const metadataById = new Map(snapshots.map(s => [s.benefitId, s.metadata]))
      return {
        plans: row?.activeProductIds ?? [],
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
      const userId = await resolveUserId(ctx)
      if (!userId) return null
      const row = await ctx.runQuery(cache.getByUser, { userId })
      // Meters carry their configured friendly name so `useCredits('credits')`
      // resolves without the client ever seeing provider ids.
      return {
        meters: (row?.meters ?? []).map(meter => ({
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
      if (config.rateLimiter) {
        const { ok } = await config.rateLimiter.limit(ctx, 'billingSync', { key: userId })
        if (!ok) throw new Error('[nuxt-backend] Too many entitlement syncs — try again shortly.')
      }
      await refreshEntitlements(ctx, userId)
      return null
    },
  })

  // --- Webhook handlers: keep the cache fresh as billing state changes ---

  // Handlers run inside an httpAction at runtime, so we can refresh inline.
  const handleRefreshEvent = async (ctx: RunWriteCtx, event: PolarWebhookEvent): Promise<void> => {
    const data = event.data as {
      id?: string
      customerId?: string
      customer?: { id?: string, metadata?: Record<string, unknown> }
      metadata?: Record<string, unknown>
    }
    const customerId = data.customerId ?? data.customer?.id ?? data.id
    if (typeof customerId !== 'string') return
    // Resolve the auth user: prefer the provider customer metadata (set at
    // checkout, so first-time webhooks self-bootstrap), then fall back to the
    // synced cache. Gift orders carry no `userId` metadata until claimed, so
    // they skip here and are handled by the gift branch instead.
    const metaUserId = data.customer?.metadata?.userId ?? data.metadata?.userId
    const userId = typeof metaUserId === 'string'
      ? metaUserId
      : await ctx.runQuery(cache.userByCustomer, { customerId })
    if (!userId) return
    await refreshEntitlements(ctx, userId)
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

    let lastForbidden: Response | null = null
    for (const handler of capturedHandlers) {
      const attempt = new Request(request.url, { method: 'POST', headers: request.headers, body })
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

  return {
    provider,
    api: { ...provider.api(), listAllSubscriptions, giftCheckout },
    functions: {
      getCurrentSubscription,
      getFeatures,
      getCredits,
      syncEntitlements,
      getReceivedGifts,
      claimGift,
      getWebhookDeliveries,
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
    createDiscount,
  }
}
