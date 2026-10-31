import type { Polar } from '@convex-dev/polar'
import type { actionGeneric, Auth, internalActionGeneric, queryGeneric, RegisteredAction, RegisteredQuery, Scheduler } from 'convex/server'
import type { CancellationReason, ProviderSubscription, RunQueryCtx, RunWriteCtx } from './base.js'
import type { RecordBillingEvent } from '../activity.js'
import type { CancelOutcome, BillingConsole, WithdrawalPeriod } from './lifecycle.js'
import type { RevenueInterval, RevenueReport } from './revenue.js'
import type {
  ApplyDiscountOptions,
  BillingDiscounts,
  BillingOrder,
  BillingPage,
  CancelSubscriptionOptions,
  CheckoutOptions,
  FeatureCheckOptions,
  OrdersOptions,
  PauseSubscriptionOptions,
  RefundOrderOptions,
  RefundRecord,
  ServerCheckoutOptions,
  SubscriptionTarget,
  UpdateSubscriptionOptions,
  UsageEvent,
  UsageHistoryOptions,
} from './options.js'
import type { CostReport, CustomerEntitlements, Pricing, QuotaUsage, RefundCreditsEvent, SpendCreditsEvent, SpendReservation } from './records.js'
import type { BillingAccessRule, BillingEntity, BillingEntityCtx, BillingWebhookEventHandlers } from './setup.js'

// What `setupBilling` returns.

/** What an account's erasure hands billing: the account, the workspaces that go with it, and the ones it leaves. */
export interface AccountBillingErasureInput {
  userId: string
  /** The workspaces deleted with the account. */
  deleted: readonly string[]
  /** The workspaces the account leaves, others staying. */
  left: readonly string[]
}

/** See {@link Billing.forgetAccount}. */
export type AccountBillingErasure = (ctx: RunWriteCtx, erasure: AccountBillingErasureInput) => Promise<void>

/** One billing entity's part of an account's export. */
export interface AccountBillingRecord {
  entityId: string
  /** Its subscriptions, as the app synced them from the provider. */
  subscriptions: unknown[]
  /** Its newest orders at the provider; `null` when the provider could not be read. */
  orders: Array<{ id: string, createdAt: string, status: string, productId: string | null, amount: number, currency: string, billingReason: string }> | null
}

/** See {@link Billing.exportAccount}. */
export type AccountBillingExport = (ctx: RunQueryCtx, account: Pick<AccountBillingErasureInput, 'userId' | 'deleted'>) => Promise<AccountBillingRecord[]>

export interface Billing {
  /**
   * Every client-callable function billing gives your app, the one bag to
   * re-export from `backend/billing.ts`: the composables call each by name.
   * The checkout, portal, price-list and gift functions first. Of the provider's own `api()` only
   * `getConfiguredProducts` (the product of each catalog key) is kept; the
   * rest are this package's, and refuse with catalog codes (see `backendError`):
   *
   * - `getPricing` is the catalog as a pricing page shows it — plans with
   *   their monthly and yearly prices, packs with their price per credit,
   *   and a public promotion when asked for one (`discount`, its key or
   *   code) — public, so `/pricing` renders on the server for any visitor.
   * - `generateCheckoutLink` sells only the app's catalog, returns only to
   *   the site (`SITE_URL` or `trustedOrigins`), refuses the metadata keys
   *   the package reads back, and takes a discount code, a public promotion
   *   by key and campaign attribution; the trial, a promotion without a code
   *   and a discount by id are {@link Billing.checkout}'s.
   * - `generateCustomerPortalUrl` returns only to the site.
   * - `giftCheckout` gifts a catalog credit pack by its key, or a plan as
   *   a pass by its key and a length in months; `deliverAt` dates it.
   * - `getSentGifts`, `resendGift`, `changeGiftRecipient`,
   *   `rescheduleGift` and `cancelGift` are the purchaser's side of a gift
   *   until it is claimed (a cancel refunds the purchase, behind a recent
   *   sign-in); `runGiftSweep` is internal, woken by the component's cron.
   * - `listAllSubscriptions` resolves the billing entity like the reactive
   *   reads do: `null` instead of a throw for claimless callers.
   */
  api: Pick<ReturnType<Polar['api']>, 'getConfiguredProducts'> & {
    getPricing: RegisteredQuery<'public', { currency?: string, discount?: string }, Promise<Pricing>>
    listAllSubscriptions: ReturnType<typeof queryGeneric>
    giftCheckout: ReturnType<typeof actionGeneric>
    generateCheckoutLink: RegisteredAction<'public', CheckoutOptions, Promise<{ url: string }>>
    generateCustomerPortalUrl: RegisteredAction<'public', { returnUrl?: string }, Promise<{ url: string }>>
    // Then the reactive current-subscription, feature-gating and
    // credit-balance queries, `syncEntitlements` to refresh the cache after
    // checkout or a top-up, the internal `syncProducts` that pulls the
    // provider's product catalog into the products table (webhooks keep it
    // fresh afterwards), the gifts, the lifecycle and the history.
    getCurrentSubscription: ReturnType<typeof queryGeneric>
    getFeatures: ReturnType<typeof queryGeneric>
    getCredits: ReturnType<typeof queryGeneric>
    /**
     * Whether the caller may buy and manage the billing entity's billing,
     * `{ canManage }`, decided as checkout, the portal and the plan's
     * lifecycle decide it: behind `useBilling().canManage`. `null` for a
     * caller who may not read the entity's billing.
     */
    getBillingAccess: ReturnType<typeof queryGeneric>
    syncEntitlements: ReturnType<typeof actionGeneric>
    /** Ops-only (internal): `npx convex run billing:syncProducts`. */
    syncProducts: ReturnType<typeof internalActionGeneric>
    /**
     * Internal: put one billing entity on the catalog's free plan
     * (`{ entityId }`), once — what the free plan's queue runs. Without an
     * `entityId` it queues every existing entity, a page at a time: the
     * backfill, `npx convex run billing:startFreePlan '{}'`. Exported from
     * `billing.ts`, where the queue finds it by name.
     */
    startFreePlan: ReturnType<typeof internalActionGeneric>
    getReceivedGifts: ReturnType<typeof queryGeneric>
    claimGift: ReturnType<typeof actionGeneric>
    getSentGifts: ReturnType<typeof queryGeneric>
    resendGift: ReturnType<typeof actionGeneric>
    changeGiftRecipient: ReturnType<typeof actionGeneric>
    rescheduleGift: ReturnType<typeof actionGeneric>
    cancelGift: ReturnType<typeof actionGeneric>
    /**
     * Internal: the gift sweep. The component's cron wakes it to deliver the
     * gifts that are due, send the one reminder and follow the plan passes;
     * a gift dated for later is scheduled on it. Exported from `billing.ts`,
     * where both find it by name.
     */
    runGiftSweep: ReturnType<typeof internalActionGeneric>
    /**
     * The admin console's Billing tab: the save offers the cancel flow
     * made, the EU withdrawals and the confirmed renewal consent proofs,
     * newest first, the latest 50 of each; `{ entityId }` for one billing
     * entity's. Admin-tier, like `refundOrder` (see `requireAdmin` on
     * {@link SetupBillingConfig}): `null` for
     * anyone else.
     */
    getBillingConsole: RegisteredQuery<'public', { entityId?: string }, Promise<BillingConsole | null>>
    /** Switch the caller's subscription to another product. */
    updateSubscription: ReturnType<typeof actionGeneric>
    /**
     * Cancel at period end (default) or revoke immediately — or answer with
     * the save offer for the reason first, where `lifecycle.saveOffers`
     * names one (`{ offer }`; `offer: false` cancels past it).
     */
    cancelSubscription: RegisteredAction<'public', { subscriptionId?: string, atPeriodEnd?: boolean, reason?: CancellationReason, comment?: string, offer?: false }, Promise<CancelOutcome>>
    /** Apply the save offer the cancel flow made, by its id (LIFECYCLE). */
    acceptSaveOffer: RegisteredAction<'public', { offerId: string }, Promise<null>>
    /** The caller's purchase inside its EU withdrawal period, for the withdrawal button (`period`, `null` without one); `null` for anyone who may not manage the billing (LIFECYCLE). */
    getWithdrawal: RegisteredQuery<'public', Record<string, never>, Promise<{ period: WithdrawalPeriod | null } | null>>
    /** Withdraw from a purchase inside its 14 days: it ends at once, and a receipt goes out (LIFECYCLE). */
    withdraw: RegisteredAction<'public', { subscriptionId?: string }, Promise<{ withdrawnAt: number }>>
    /** Undo a scheduled cancellation. */
    uncancelSubscription: ReturnType<typeof actionGeneric>
    /** Undo a plan change scheduled for the next period. */
    cancelPendingChange: ReturnType<typeof actionGeneric>
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
    /**
     * The billing provider's live metrics over a window, for the admin
     * console's Revenue view: recurring revenue, subscriptions, churn and
     * cancellations per reason, checkouts, lifetime value, costs and margin,
     * and usage per catalog meter. Administrators in person only, the role
     * read fresh; nothing is stored.
     */
    getRevenue: RegisteredAction<'public', { since: number, until?: number, interval?: RevenueInterval }, Promise<RevenueReport>>
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
   * A checkout for the caller's billing entity, from server code — the
   * `generateCheckoutLink` checks, plus what only the server chooses: a
   * `trial` of at most 30 days (or `false` to remove the product's own), a
   * `discount` of the catalog by key (one without a code included) and a
   * `discountId`. Call it from your own action, after deciding the caller
   * qualifies. A discount the provider no longer redeems is refused as
   * `invalid_input` (`discount`): check out again without it to sell at the
   * regular price.
   *
   * @example
   * ```ts
   * // A 30-day trial for people who came through a partner. The product is
   * // still checked against the catalog, and the URLs against the site.
   * export const partnerCheckout = action({
   *   args: { productId: v.string(), origin: v.string(), successUrl: v.string() },
   *   handler: async (ctx, { productId, ...urls }) => {
   *     if (!(await cameThroughPartner(ctx))) throw backendError('forbidden', { reason: 'permission' })
   *     return billing.checkout(ctx, { productIds: [productId], ...urls, trial: { interval: 'day', count: 30 } })
   *   },
   * })
   * ```
   */
  checkout: (ctx: RunWriteCtx & { auth?: Auth }, options: ServerCheckoutOptions) => Promise<{ url: string }>
  /**
   * A customer-portal session for the caller's billing entity, from server
   * code — what `generateCustomerPortalUrl` returns. With workspaces the
   * session is the caller's own member of the workspace's billing customer,
   * and only its owner or a billing manager gets one: anyone else is
   * `forbidden` (reason `not_billing_manager`). An entity that never paid
   * is `not_ready` (reason `no_customer`). `returnUrl` must be on the
   * site's own origin or a `trustedOrigins` entry.
   *
   * @example
   * ```ts
   * export const openBilling = action({
   *   args: {},
   *   handler: ctx => billing.portal(ctx, { returnUrl: `${process.env.SITE_URL}/app/billing` }),
   * })
   * ```
   */
  portal: (ctx: RunWriteCtx & { auth?: Auth }, options?: { returnUrl?: string }) => Promise<{ url: string }>
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
   * `hold`, in ms, keeps the reservation that long instead of ten minutes
   * (a week at most): a queued job's credits, held until it starts.
   */
  reserveCredits: (ctx: RunWriteCtx & { auth?: Auth }, event: SpendCreditsEvent & { allowRefresh?: boolean, hold?: number }) => Promise<SpendReservation>
  /** Ingest the provider event for a reservation and finalize the spend. */
  settleSpend: (ctx: RunWriteCtx, reservation: SpendReservation, options?: { name?: string, metadata?: Record<string, string | number | boolean>, timestamp?: Date, finalAmount?: number }) => Promise<void>
  /** Undo a reservation whose work failed — nothing is charged. */
  releaseSpend: (ctx: RunWriteCtx, reservation: SpendReservation) => Promise<void>
  /**
   * Send what some work cost you to the billing provider's cost insights:
   * one event for the billing entity, with the cost in US cents (sub-cent
   * precision kept) and the model and tokens it used, as a child of the
   * charge it belongs to (`parentId`, that charge's `externalId`). It
   * moves no credits. The job queue sends one per finished job.
   */
  reportCost: (ctx: RunWriteCtx, event: CostReport) => Promise<void>
  /**
   * Resolve the caller's billing entity the way every billing function does:
   * `setupBilling`'s `resolveEntity` when given, else identity claims — the
   * active workspace (`billTo: 'workspace'`) or the signed-in user.
   * `null` when signed out. Any query, mutation or action context will do.
   * It checks nobody: to act for the entity, check the caller with
   * {@link Billing.requireEntity}.
   */
  resolveEntity: (ctx: BillingEntityCtx) => Promise<BillingEntity | null>
  /**
   * The caller's billing entity, checked the way the package's own
   * functions check it, for a function of yours: signed in, an account not
   * banned, a member of the workspace that pays, its owner or an admin for
   * `access: 'manage'` — each read fresh, once per call (`reread: true`
   * reads again) — and no impersonated session where the rule refuses one.
   * Throws the refusal:
   * `unauthenticated`, `no_workspace`, or `forbidden` with reason
   * `banned`, `not_member`, `not_billing_manager` or `impersonating`.
   *
   * @example
   * ```ts
   * // Only the billing managers of the workspace that pays set its invoice
   * // address, and only in person.
   * export const setInvoiceAddress = mutation({
   *   args: { address: v.string() },
   *   handler: async (ctx, { address }) => {
   *     const { userId: workspaceId } = await billing.requireEntity(ctx, { access: 'manage', impersonation: 'refused' })
   *     await ctx.db.insert('invoiceAddresses', { workspaceId, address })
   *   },
   * })
   * ```
   */
  requireEntity: (ctx: BillingEntityCtx, rule: BillingAccessRule) => Promise<BillingEntity>
  /**
   * Queue the catalog's free plan for one billing entity: a real
   * subscription at the provider, started through the scaffold's workpool
   * (else the scheduler) by `billing:startFreePlan`. Nothing happens for
   * an entity that holds a plan already, or when the catalog has no free
   * plan. Every workspace (or user, with `billTo: 'user'`) the auth layer
   * makes is queued — through `registerBackendRoutes` where the auth routes
   * are mounted, by the function's name anywhere else — and a subscription
   * that ends queues it again; call it yourself for a billing entity the
   * auth layer did not make (one your own code writes, or a migration's),
   * or run the backfill, `npx convex run billing:startFreePlan '{}'`.
   *
   * @guarantee
   * - Runs: in the mutation or action that calls it; the start runs later, as an internal action
   * - Delivery: through the scaffold's workpool, retried up to five attempts until the provider takes it; without one, once through the scheduler (re-run the backfill for any it missed)
   * - Order: after the entity exists; whether it holds a plan is read from the provider, never from the synced table a late webhook leaves behind
   * - When it throws: only when the queue can't be written to; the caller's work is not undone by a failed start
   * - Idempotency: safe to repeat; an entity on a plan, free or paid, is left as it is
   */
  startFreePlan: (ctx: RunWriteCtx & { scheduler: Scheduler }, entityId: string) => Promise<void>
  /**
   * Queue the free plan for a workspace or an account the auth layer just
   * made, when it is the kind of entity billing bills: what
   * `registerBackendRoutes` connects to the auth routes.
   *
   * @internal
   */
  entityCreated: (ctx: RunWriteCtx & { scheduler: Scheduler }, entity: { kind: 'workspace' | 'user', id: string }) => Promise<void>
  /**
   * Why the auth layer may not delete a workspace (or, with `billTo:
   * 'user'`, an account) now, or `null`: `paid_subscription` while it holds
   * a paid subscription set to renew. What `registerBackendRoutes` connects
   * to the workspace delete route, which refuses it (`forbidden`).
   *
   * @internal
   */
  deletionRefusal: (ctx: RunQueryCtx, entity: { kind: 'workspace' | 'user', id: string }) => Promise<'paid_subscription' | null>
  /**
   * Record a billing event for one billing entity on the shared event
   * path, never failing the caller: what `setupAi` records a credit
   * balance's crossing through.
   *
   * @internal
   */
  recordEvent: RecordBillingEvent
  /**
   * Whether the billing entity's plan grants `feature`: its catalog key
   * (the `key` in a benefit's metadata), or the benefit id of a benefit
   * that has no key — the one match `useFeatures().has()` makes, read from
   * the same entitlement cache. In any query, mutation or action. Without
   * `userId` it checks the caller's entity, and answers `false` for a
   * caller with none (signed out, no workspace, no member of it) instead of
   * refusing: for a function that shows more to a plan that has more. An
   * empty `feature` is none: `false`.
   *
   * @example
   * ```ts
   * export const report = workspace.query({
   *   args: {},
   *   handler: async ctx => ({
   *     totals: await totalsOf(ctx),
   *     breakdown: await billing.hasFeature(ctx, 'reports') ? await breakdownOf(ctx) : null,
   *   }),
   * })
   * ```
   */
  hasFeature: (ctx: RunQueryCtx & { auth?: Auth }, feature: string, options?: FeatureCheckOptions) => Promise<boolean>
  /**
   * Refuse the call unless the billing entity's plan grants `feature`
   * (matched as {@link Billing.hasFeature} matches it): `feature_required`,
   * whose `plans` names the catalog plans on sale that include it, in
   * pricing order, for `<UpgradePrompt :plans>` to offer. Without
   * `userId` the caller is checked first, as `requireEntity` checks a
   * member, and refused as it refuses. An empty `feature` is refused as
   * `invalid_input` (field `feature`). The `withFeature(key)` tier of
   * `createFunctions` runs it for a whole function.
   *
   * @guarantee Reads the entitlement cache and the products table only: no provider call, on any path.
   * @guarantee A caller who may not read the entity's billing is refused for that, never as `feature_required`.
   *
   * @example
   * ```ts
   * export const exportReport = action({
   *   args: {},
   *   handler: async (ctx) => {
   *     await billing.requireFeature(ctx, 'reports')
   *     return await buildExport(ctx)
   *   },
   * })
   * ```
   */
  requireFeature: (ctx: RunQueryCtx & { auth?: Auth }, feature: string, options?: FeatureCheckOptions) => Promise<void>
  /**
   * The catalog plan keys the billing entity is subscribed to now (`pro`,
   * never `pro:year`), read from the entitlement cache: retired plans
   * included, products outside the catalog left out. In any query,
   * mutation or action. Without `userId` it reads the caller's entity,
   * checked as `hasFeature` checks it, and answers `[]` for a caller with
   * none instead of refusing. What a feature flag's plan targets match
   * (`setupFlags({ billing })`).
   *
   * @guarantee Reads the entitlement cache only: no provider call.
   */
  activePlans: (ctx: RunQueryCtx & { auth?: Auth }, options?: FeatureCheckOptions) => Promise<string[]>
  /**
   * How many of `quota` the billing entity's plan allows, and how many it
   * holds: the most any of its grants allows (`0` when none names it,
   * `'unlimited'` when one says so), and the count `requireQuota` and
   * `releaseQuota` keep. In any query, mutation or action. Without
   * `userId` it reads the caller's entity, and answers `{ limit: 0, used: 0 }`
   * for a caller with none instead of refusing, as `hasFeature` answers
   * `false`. A quota that counts people (members, seats, users, …) is a
   * `TypeError`: no plan here is priced per seat.
   *
   * @experimental
   * @guarantee Reads the entitlement cache and the counter only: no provider call.
   */
  getQuota: (ctx: RunQueryCtx & { auth?: Auth }, quota: string, options?: FeatureCheckOptions) => Promise<QuotaUsage>
  /**
   * Count `amount` (default 1) against the billing entity's `quota`, or
   * refuse the call when it does not fit what the plan allows:
   * `quota_exceeded`, with the `limit`, how many are `used`, the `amount`
   * asked for, and the catalog plans on sale that allow enough (`plans`, in
   * pricing order, for `<UpgradePrompt :plans>` to offer). Call it in the
   * mutation that makes the thing, before writing it: the check, the count
   * and the write are one transaction, so a refused call, or one that fails
   * after it, counts nothing, and two calls at once never overshoot the
   * limit. A quota no grant names allows none. Without `userId` the caller
   * is checked first, as `requireEntity` checks a member. Resolves with the
   * quota as it now stands.
   *
   * Refuses any context but a mutation's with a `TypeError` (an action's
   * read and write could not be one transaction, and a query writes
   * nothing); an empty `quota` or an `amount` that is not a whole number
   * above zero is `invalid_input`.
   *
   * @experimental
   * @guarantee Reads the entitlement cache, the products table and the counter only: no provider call.
   * @guarantee Counts nothing on a refusal, and a limit is never overshot by calls at once.
   *
   * @example
   * ```ts
   * export const createProject = workspace.mutation({
   *   args: { name: v.string() },
   *   handler: async (ctx, { name }) => {
   *     await billing.requireQuota(ctx, 'projects')
   *     return ctx.db.insert('projects', { name, workspaceId: ctx.workspace.id })
   *   },
   * })
   * ```
   */
  requireQuota: (ctx: RunWriteCtx & { auth?: Auth }, quota: string, amount?: number, options?: FeatureCheckOptions) => Promise<QuotaUsage>
  /**
   * Give back `amount` (default 1) of the billing entity's `quota`, in the
   * mutation that removes the thing: the count never goes below zero.
   * Checked like {@link Billing.requireQuota}; resolves with the quota as it
   * now stands.
   *
   * @experimental
   *
   * @example
   * ```ts
   * export const deleteProject = workspace.mutation({
   *   args: { projectId: v.id('projects') },
   *   handler: async (ctx, { projectId }) => {
   *     await ctx.db.delete(projectId)
   *     await billing.releaseQuota(ctx, 'projects')
   *   },
   * })
   * ```
   */
  releaseQuota: (ctx: RunWriteCtx & { auth?: Auth }, quota: string, amount?: number, options?: FeatureCheckOptions) => Promise<QuotaUsage>
  /**
   * The plans on sale whose quota allows `needed`, by catalog key, in
   * pricing order: what a `quota_exceeded` offers. `setupStorage` names
   * them when a file does not fit a catalog quota it counts itself.
   *
   * @internal
   */
  plansAllowing: (ctx: RunQueryCtx, quota: string, needed: number) => Promise<string[]>
  /**
   * Forget a billing entity: drop its cached entitlements (plans, benefits,
   * credit balances, in-flight reservations) and its quota counts. The
   * provider's customer record is untouched — this is the app-side erasure
   * step, e.g. from the `onUserDeleted` auth hook with the deleted user's id
   * (`billTo: 'user'`) or a dissolved workspace's id. A no-op for an
   * unknown entity.
   */
  forgetEntity: (ctx: RunWriteCtx, userId: string) => Promise<void>
  /**
   * Billing's part of an account's erasure, which `setupAccount` runs in
   * the app: the provider customer of every billing entity that goes with
   * the account (its personal workspace and any it was the only member
   * of, or the account itself with `billTo: 'user'`) is deleted and
   * anonymized at the provider, which keeps its orders for its books, and
   * its quota counts and cache are forgotten; in a workspace the account
   * leaves, only its member of the team customer is removed. Safe to run
   * again: a customer or a member already gone is fine.
   */
  forgetAccount: AccountBillingErasure
  /**
   * Billing's part of an account's export, which `setupAccount` runs: the
   * subscriptions and the newest orders of every billing entity the
   * account owns alone. `orders` is `null` when the provider could not
   * be read.
   */
  exportAccount: AccountBillingExport
  /**
   * Discount (coupon) management: `create`, `list`, `remove`. Server-side by
   * design — minting discounts is privileged, so wire it through an
   * `internalAction` or your own admin-tier action.
   */
  discounts: BillingDiscounts
  /**
   * Put a catalog discount on a billing entity's subscription, by key, from
   * server code that decided the entity qualifies: a win-back offer, a
   * referral reward, a code a subscriber redeems in your own UI. The
   * provider takes it off from the next payment, replacing any discount the
   * subscription had (one at a time; `null` removes it). It checks the
   * dates, the total cap and the plan, never the per-customer limit: keep
   * your own record of who got it. A `once` discount, or one of 12 months
   * or less, covers a whole yearly payment, and a discount follows the
   * subscription across plan changes. Refused as `invalid_input`: a key
   * the catalog does not have or one that does not apply to the plan
   * (`discount`), and the free plan (`subscriptionId`, reason
   * `free_plan`). Call from an action; no client can reach it.
   *
   * @example
   * ```ts
   * export const winBack = internalAction({
   *   args: { workspaceId: v.string() },
   *   handler: (ctx, { workspaceId }) => billing.applyDiscount(ctx, { entityId: workspaceId, discount: 'winback' }),
   * })
   * ```
   */
  applyDiscount: (ctx: RunWriteCtx, options: ApplyDiscountOptions) => Promise<ProviderSubscription>
  /**
   * Switch a subscription to another product (upgrade / downgrade), optionally
   * choosing how the mid-period difference is settled. A switch from a
   * yearly price to a monthly one is scheduled for the paid year's end
   * (`next_period`) whatever `proration` says: the yearly price granted the
   * year's credits up front, so an immediate switch would refund most of the
   * year while those credits stay spent. Call from an **action**; the
   * ready-made `updateSubscription` function does it for the caller.
   */
  updateSubscription: (ctx: RunWriteCtx & { auth?: Auth }, options?: UpdateSubscriptionOptions) => Promise<ProviderSubscription>
  /**
   * Cancel a subscription — at period end by default, immediately with
   * `atPeriodEnd: false`. The reason and comment are the customer's own words
   * and are visible to them; the comment is trimmed and refused as
   * `invalid_input` (`comment`) over 500 characters. A period-end cancel of
   * a subscription already set to cancel is refused as `invalid_input`
   * (`subscriptionId`, reason `cancel_scheduled`) before the provider,
   * which takes one cancellation per period, is asked.
   */
  cancelSubscription: (ctx: RunWriteCtx & { auth?: Auth }, options?: CancelSubscriptionOptions) => Promise<ProviderSubscription>
  /**
   * Undo a scheduled cancellation, putting the subscription back on renewal.
   * Refused as `invalid_input` (`subscriptionId`, reason
   * `no_cancel_scheduled`) when none is scheduled.
   */
  uncancelSubscription: (ctx: RunWriteCtx & { auth?: Auth }, options?: SubscriptionTarget) => Promise<ProviderSubscription>
  /**
   * Undo a plan change scheduled for the start of the next period, so the
   * subscription renews on the plan it has. Refused as `invalid_input`
   * (`subscriptionId`, reason `no_change_scheduled`) when none is scheduled.
   */
  cancelPendingChange: (ctx: RunWriteCtx & { auth?: Auth }, options?: SubscriptionTarget) => Promise<ProviderSubscription>
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
   * The history lists charges: a subscription's order that charged nothing
   * (a free plan's cycle, a trial's start, a cycle a full discount brought
   * to nothing) is left out, while the provider's pages and `pagination`
   * still count it, so a page may list fewer than `limit`.
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
