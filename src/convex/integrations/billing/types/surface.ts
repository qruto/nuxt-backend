import type { Polar } from '@convex-dev/polar'
import type { actionGeneric, Auth, internalActionGeneric, queryGeneric, RegisteredAction } from 'convex/server'
import type { ProviderSubscription, RunQueryCtx, RunWriteCtx } from './base.js'
import type {
  BillingDiscounts,
  BillingOrder,
  BillingPage,
  CancelSubscriptionOptions,
  CheckoutOptions,
  OrdersOptions,
  PauseSubscriptionOptions,
  RefundOrderOptions,
  RefundRecord,
  SubscriptionTarget,
  UpdateSubscriptionOptions,
  UsageEvent,
  UsageHistoryOptions,
} from './options.js'
import type { CustomerEntitlements, RefundCreditsEvent, SpendCreditsEvent, SpendReservation } from './records.js'
import type { BillingWebhookEventHandlers } from './setup.js'

// What `setupBilling` returns.

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
   * after checkout / top-up, an **internal** `syncProducts` action to pull
   * the provider's product catalog into the reactive products table (fresh
   * deployments render empty pricing until `npx convex run
   * billing:syncProducts` runs once — webhooks keep it fresh afterwards), and
   * the gift queries/claim action.
   */
  functions: {
    getCurrentSubscription: ReturnType<typeof queryGeneric>
    getFeatures: ReturnType<typeof queryGeneric>
    getCredits: ReturnType<typeof queryGeneric>
    syncEntitlements: ReturnType<typeof actionGeneric>
    /** Ops-only (internal): `npx convex run billing:syncProducts`. */
    syncProducts: ReturnType<typeof internalActionGeneric>
    getReceivedGifts: ReturnType<typeof queryGeneric>
    claimGift: ReturnType<typeof actionGeneric>
    /**
     * The webhook delivery log, newest first — admin-tier, like `refundOrder`
     * (see `requireAdmin` on {@link SetupBillingConfig}): `null` for anyone
     * else, signed out included.
     */
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
    /** Refund an order — admin-tier (see `requireAdmin` on {@link SetupBillingConfig}). */
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
   * outcome recorded in the component's delivery log.
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
   * Refund an order — admin-tier, gated by `requireAdmin`
   * ({@link SetupBillingConfig}). Omit `amount` to refund whatever
   * is still refundable.
   *
   * Credits are **not** reversed here: meter credits come from the provider's
   * own benefit grants, so the refund's `order.refunded` webhook is what
   * reverses them. This package only drops the entity's in-flight spend
   * reservations and re-reads the provider's balance.
   */
  refundOrder: (ctx: RunWriteCtx & { auth?: Auth }, options: RefundOrderOptions) => Promise<RefundRecord>
}
