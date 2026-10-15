import type { Polar, WebhookEventHandlers } from '@convex-dev/polar'
import type { Auth, FunctionReference, GenericActionCtx, GenericDataModel } from 'convex/server'
import type { Email } from '../../email.js'
import type { WebhookLogRefs } from '../../webhook-guard.js'
import type { AnyQueryCtx, BillingRateLimiter, PolarComponent, RunWriteCtx } from './base.js'
import type {
  BillingCatalogIds,
  CachedEntitlements,
  CreditMeterConfig,
  EntitlementBenefit,
  EntitlementMeter,
  GiftRecord,
} from './records.js'

// What `setupBilling` takes: the component handles and the configuration.

/**
 * Per-event billing webhook handlers, keyed by the provider's event names
 * (`'order.paid'`, `'subscription.active'`, …). Service-neutral alias for the
 * shape `registerBackendRoutes` mounts at `/billing/events`.
 */
export type BillingWebhookEventHandlers = WebhookEventHandlers

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
      markPaid: FunctionReference<'mutation', 'internal', { giftId: string, billingOrderId?: string, billingCustomerId?: string }, null>
      markNotified: FunctionReference<'mutation', 'internal', { giftId: string }, boolean>
      markClaimed: FunctionReference<'mutation', 'internal', { giftId: string, userId: string, entityId: string }, null>
      listByEmail: FunctionReference<'query', 'internal', { email: string, status?: string }, GiftRecord[]>
      get: FunctionReference<'query', 'internal', { giftId: string }, GiftRecord | null>
      resolveRecipient: FunctionReference<'query', 'internal', { email: string }, { userId: string, organizationId: string | null } | null>
    }
    webhooks: WebhookLogRefs
  }
}

/** The provider component's own customer-mapping functions (structural). */
export interface ProviderLibRefs {
  lib: {
    insertCustomer: FunctionReference<'mutation', 'internal', { id: string, userId: string, metadata?: Record<string, unknown> }, unknown>
  }
}

export type PolarConfig = ConstructorParameters<typeof Polar>[1]

/** What billing sends its email through: the app's `setupEmail` instance. */
export type BillingEmail = Pick<Email, 'sendTemplate'>

/**
 * Billing configuration. Service-neutral at the package boundary: the access
 * token, environment, and webhook secret default to the required
 * `BILLING_ACCESS_TOKEN` / `BILLING_ENVIRONMENT` / `BILLING_WEBHOOK_SECRET`
 * env vars, so `setupBilling(components, { email })` needs no env plumbing.
 * Product maps and other provider passthrough config are accepted as-is,
 * plus `billTo`.
 *
 * The billing entity resolves from identity claims out of the box — the
 * active workspace (`billTo: 'organization'`, the default) or the signed-in
 * user (`billTo: 'user'`) — so `getUserInfo` / `currentUserId` are optional
 * overrides, not required wiring.
 */
export type SetupBillingConfig = Omit<PolarConfig, 'getUserInfo' | 'organizationToken' | 'server' | 'webhookSecret'> & {
  /**
   * The app's `setupEmail` instance. A gift's recipient hears of it through
   * its `gift` template once the purchase is paid; restyle it there, with
   * `setupEmail(components, { templates: { gift } })`. Checked when
   * `setupBilling` runs: an import cycle through `email.ts` can hand it over
   * as `undefined` despite the type, and that fails the deploy instead of the
   * first paid gift.
   */
  email: BillingEmail
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
   * amplify the provider fan-out. `giftCheckout` burns the same limit keyed by
   * the purchaser. Omit to leave them unthrottled.
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
   * Decide who may receive a gift, before `giftCheckout` creates a billing
   * customer for the recipient — only addresses on your own domain, say, or
   * only sandbox addresses on a public demo. Return `true` to allow, or a
   * refusal whose `message` `giftCheckout` throws as a `ConvexError`, so it
   * reaches the purchaser even where production redacts other errors
   * (default: "This address can't receive gifts."). Called with the action
   * ctx, so it can read your own tables; `recipientEmail` is lower-cased.
   */
  canGift?: (
    ctx: GenericActionCtx<GenericDataModel>,
    input: { recipientEmail: string, purchaserUserId: string },
  ) => Promise<true | { allowed: false, message?: string }> | true | { allowed: false, message?: string }
  /**
   * Named credit meters: spend by friendly name (`spendCredits({ meter:
   * 'credits' })`, `useCredits('credits')`) instead of provider meter ids.
   * Usually supplied via `catalog`; explicit entries here win.
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
   * Called for an **authentic** (signature-verified) webhook event whose type
   * this package's provider SDK cannot parse — e.g. an event newer than the
   * installed package. The delivery is acknowledged with 202 either way, so
   * unknown types can never put the endpoint into a retry loop.
   */
  onUnknownEvent?: (ctx: RunWriteCtx, event: { type?: string, payload: unknown }) => Promise<void>
}
