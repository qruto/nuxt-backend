import { productsList } from '@polar-sh/sdk/funcs/productsList.js'
import { actionGeneric, type GenericDataModel, type GenericQueryCtx, internalActionGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import { ADMIN_READ, BILLING_ACCESS, type BillingContext } from './context.js'
import type { BillingCustomers } from './customers.js'
import type { BillingFreePlan, QueueCtx } from './free-plan.js'
import { benefitKindOf, type BillingEntitlements } from './entitlements.js'
import type { BillingHistory } from './history.js'
import type { BillingLifecycleOps } from './lifecycle.js'
import { productRecord } from './provider-events.js'
import type { BillingQuotas } from './quotas.js'
import type { BillingRevenue } from './revenue.js'
import { REVENUE_INTERVALS } from './types/revenue.js'
import type { BillingSubscriptions } from './subscriptions.js'
import type { ProviderCtx } from './types/base.js'
import type { CurrentSubscriptions } from './types/options.js'

/** A running plan pass, as a subscription row carries it: the plan, the months it was gifted for, and when it ends. */
interface GiftedPass { plan: string, months?: number, startedAt: number, endsAt: number, trial?: true }

/** A save offer on the wire (types/lifecycle.ts `SaveOffer`). */
const vReason = v.union(...(['customer_service', 'low_quality', 'missing_features', 'switched_service', 'too_complex', 'too_expensive', 'unused', 'other'] as const).map(reason => v.literal(reason)))
const vSaveOffer = v.union(
  v.object({ id: v.string(), reason: vReason, kind: v.literal('pause'), months: v.number(), resumesAt: v.number(), plan: v.union(v.string(), v.null()) }),
  v.object({ id: v.string(), reason: vReason, kind: v.literal('downgrade'), plan: v.string(), appliesAt: v.union(v.number(), v.null()) }),
  v.object({
    id: v.string(),
    reason: vReason,
    kind: v.literal('discount'),
    discount: v.string(),
    name: v.string(),
    percentOff: v.optional(v.number()),
    amountOff: v.optional(v.record(v.string(), v.number())),
    duration: v.union(v.literal('once'), v.literal('forever'), v.literal('repeating')),
    months: v.optional(v.number()),
  }),
)

/** Statuses that count as a live entitlement for the current-subscription reads. */
const LIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due', 'paused'])

/** The registered queries and actions `setupBilling` hands the app in `billing.api`. */
export function createBillingFunctions(
  { components, config, products, meterNameById, provider, providerLib, cache, allowedEntity, requireEntity, throttle, requireAdmin, requireProviderAccess, unwrapProvider }: BillingContext,
  { refreshEntitlements }: BillingEntitlements,
  { withChanges, updateSubscription, uncancelSubscription, cancelPendingChange, pauseSubscription, resumeSubscription }: BillingSubscriptions,
  { getOrders, getInvoiceUrl, getUsageHistory, refundOrder }: BillingHistory,
  { portal }: BillingCustomers,
  { readQuotas }: Pick<BillingQuotas, 'readQuotas'>,
  freePlan: Pick<BillingFreePlan, 'start' | 'backfill' | 'isFreeProduct'>,
  lifecycle: BillingLifecycleOps,
  { getRevenue }: BillingRevenue,
) {
  /**
   * Subscription rows marked `free: true` when on a free plan's product
   * (the catalog's, or a retired one at $0): what `useBilling().isFree`
   * and the pricing table read, since the free plan is a subscription too.
   */
  const markFree = async <Row extends { id?: string, productId: string }>(ctx: GenericQueryCtx<GenericDataModel>, rows: Row[], entityId: string): Promise<Array<Row & { free?: true, pass?: GiftedPass }>> => {
    // A plan pass is a plan the workspace holds, gifted until its end date: it reads as that, not as the free plan.
    const pass = rows.length > 0 ? await ctx.runQuery(components.backend.gifts.activePass, { entityId }) : null
    return Promise.all(rows.map(async (row) => {
      if (pass && row.id !== undefined && row.id === pass.subscriptionId) return { ...row, pass: { plan: pass.plan, ...(pass.months === undefined ? {} : { months: pass.months }), startedAt: pass.startedAt, endsAt: pass.endsAt, ...(pass.trial ? { trial: true as const } : {}) } }
      return await freePlan.isFreeProduct(ctx, row.productId) ? { ...row, free: true as const } : row
    }))
  }

  // --- Ready-made reactive functions (re-exported by the consumer's billing.ts) ---

  // The reactive reads answer `null` for whoever may not read the entity's
  // billing: signed out, no member of the workspace any more (read fresh,
  // not from the token), or no entity at all.
  const resolveUserId = async (ctx: GenericQueryCtx<GenericDataModel>): Promise<string | null> =>
    (await allowedEntity(ctx, BILLING_ACCESS.read))?.userId ?? null

  /** The caller's entitlement snapshot row, or `null` for a caller who may not read it. */
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
      // Every row carries `pendingChange` and `resumesAt` from the side
      // table: the synced subscriptions table has neither.
      if (!config.multipleSubscriptions) {
        const current = await provider.getCurrentSubscription(ctx as unknown as ProviderCtx, { userId })
        return current ? (await markFree(ctx, await withChanges(ctx, [current]), userId))[0]! : null
      }
      // Array-first: with add-ons there is no single "the" subscription, and
      // the upstream single-subscription read is a `.unique()` that would
      // throw here. `paused` counts as live — the provider's pause events are
      // not confirmed on this deployment, so a paused plan must not silently
      // read as the free plan.
      const all = await provider.listAllUserSubscriptions(ctx as unknown as ProviderCtx, { userId })
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
      const enriched = await Promise.all((await markFree(ctx, await withChanges(ctx, live), userId)).map(async (subscription) => {
        const product = await provider.getProduct(ctx as unknown as ProviderCtx, {
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
  // through the entity resolver and therefore throws for claimless callers. Reactive
  // clients subscribe during every auth handshake and websocket reconnect, and
  // Convex retries a throwing query — degrading to `null` keeps the logs clean.
  const listAllSubscriptions = queryGeneric({
    args: {},
    handler: async (ctx) => {
      const userId = await resolveUserId(ctx)
      if (!userId) return null
      return markFree(ctx, await withChanges(ctx, await provider.listAllUserSubscriptions(ctx as unknown as ProviderCtx, { userId })), userId)
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
      const snapshotById = new Map(snapshots.map(s => [s.benefitId, s]))
      // Each benefit in neutral words (`kind`) and by its name at the
      // provider, joined live like its metadata.
      const live = benefits.map((benefit) => {
        const snapshot = snapshotById.get(benefit.benefitId)
        return {
          ...benefit,
          kind: benefitKindOf(benefit.type),
          ...(snapshot?.description === undefined ? {} : { name: snapshot.description }),
          metadata: snapshot?.metadata ?? benefit.metadata,
        }
      })
      return {
        plans: resolved.row?.activeProductIds ?? [],
        benefits: live,
        // What the plan allows of each quota and how many are held: every
        // quota the catalog declares, and every one a grant names.
        quotas: await readQuotas(ctx, resolved.userId, live),
      }
    },
  })

  const getCredits = queryGeneric({
    args: {},
    handler: async (ctx) => {
      const resolved = await resolveUserRow(ctx)
      if (!resolved) return null
      // Meters carry their configured friendly name so
      // `useCredits({ meter: 'credits' })` resolves without the client ever
      // seeing provider ids.
      //
      // Configured meters come first. The provider reports every meter a
      // customer has ever been credited on — a retired one from an earlier
      // catalog included — and a client asking for "the balance" (no meter
      // name) takes the first. Ordering here means that is always a meter
      // this app declares, whatever order the provider lists them in.
      const meters = (resolved.row?.meters ?? []).map(meter => ({
        ...meter,
        name: meterNameById.get(meter.meterId),
      }))
      return {
        meters: [...meters.filter(meter => meter.name !== undefined), ...meters.filter(meter => meter.name === undefined)],
      }
    },
  })

  // Whether the caller may buy and manage the entity's billing — checkout,
  // the portal, the plan's lifecycle — as those calls decide it, with the
  // same fresh reads: what `useBilling().canManage` shows. `null` for a
  // caller who may not read the entity's billing at all. With
  // `billTo: 'user'` every account manages its own.
  const getBillingAccess = queryGeneric({
    args: {},
    handler: async (ctx) => {
      if (!(await allowedEntity(ctx, BILLING_ACCESS.read))) return null
      // `saveOffers`: the cancel flow has an offer for some reason, so the billing section opens `<CancelFlow>` (LIFECYCLE).
      // `softOptIn`: a paid checkout joins topics with `softOptIn`, so a checkout shows the notice and its box.
      return {
        canManage: (await allowedEntity(ctx, BILLING_ACCESS.portal)) !== null,
        saveOffers: Object.values(config.lifecycle?.saveOffers ?? {}).some(Boolean),
        softOptIn: Object.values(config.email.preferences?.topics ?? {}).some(topic => topic.softOptIn === true),
      }
    },
  })

  /**
   * Whether the caller passes the admin gate `refundOrder` uses (the role
   * read fresh), as a yes or no. A signed-out caller is refused before a
   * custom gate is asked. Reading the log is no write: an admin's
   * impersonated session may.
   */
  const isAdmin = async (ctx: GenericQueryCtx<GenericDataModel>): Promise<boolean> => {
    if (!(await ctx.auth.getUserIdentity())) return false
    try {
      await requireAdmin(ctx, 'getBillingConsole', ADMIN_READ)
      return true
    }
    catch {
      return false
    }
  }

  // The admin console's Billing tab (LIFECYCLE): the save offers, the EU
  // withdrawals and the renewal consent proofs, newest first, all of them
  // or one billing entity's. Admin-tier like the webhook log, and `null`
  // for anyone else, signed out included. An impersonated session may read.
  const getBillingConsole = queryGeneric({
    args: { entityId: v.optional(v.string()) },
    handler: async (ctx, { entityId }) => {
      if (!(await isAdmin(ctx))) return null
      return lifecycle.consoleOf(ctx, entityId?.trim() ? entityId.trim().slice(0, 200) : undefined)
    },
  })

  const syncEntitlements = actionGeneric({
    args: {},
    handler: async (ctx) => {
      const { userId } = await requireEntity(ctx, BILLING_ACCESS.read)
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
  // `useBilling().products`). Internal: it is a deployment bootstrap run from
  // ops — `npx convex run billing:syncProducts`, or `convex deploy`'s
  // `--preview-run` — and the CLI is the only caller the docs ever name. A
  // public one would also mean an identity gate and a throttle around a fan-out
  // to the live provider API; an app that wants a button re-declares it with
  // its own `admin.action` builder.
  //
  // Each product is stored as a `product.*` delivery stores it
  // (`productRecord`), not through the component's own sync: its converter
  // keeps a usage price's whole meter, which the products table refuses, so
  // a catalog with a usage price would fail the sync outright.
  const syncProducts = internalActionGeneric({
    args: {},
    handler: async (ctx) => {
      requireProviderAccess('product sync')
      for (let page = 1, maxPage = 1; page <= maxPage; page++) {
        const listed = unwrapProvider(await productsList(provider.polar, { page, limit: 100 }), 'product sync')
        maxPage = listed.result.pagination.maxPage
        for (const product of listed.result.items) await ctx.runMutation(providerLib.updateProduct, { product: productRecord(product) })
      }
      return null
    },
  })

  // The free plan's queue runs this for each billing entity (registerBackendRoutes
  // queues it as a workspace, or a user, is created; the auth layer queues it
  // by name, with the entity's `kind`, where billing is not connected; a
  // revoked subscription queues it again). Internal, as `syncProducts` is.
  // Without `entityId` it is the backfill: `npx convex run
  // billing:startFreePlan '{}'` queues the free plan for every existing
  // entity, a page at a time.
  const startFreePlan = internalActionGeneric({
    args: { entityId: v.optional(v.string()), kind: v.optional(v.union(v.literal('workspace'), v.literal('user'))), cursor: v.optional(v.string()) },
    handler: async (ctx, { entityId, kind, cursor }) => {
      if (entityId !== undefined) return await freePlan.start(ctx, entityId, kind)
      await freePlan.backfill(ctx as unknown as QueueCtx, cursor ?? null)
      return null
    },
  })

  // --- Ready-made subscription-lifecycle / order actions ---
  //
  // Registered so `useBilling()` reaches them by name. Each one resolves the
  // billing entity itself, so a client can only ever act on its own
  // subscription — the ids never come from the caller except as a filter
  // checked against that entity — and only a billing manager of it, in
  // person: a member and an impersonating administrator are
  // refused (BILLING_ACCESS.change).

  const subscriptionTargetArgs = { subscriptionId: v.optional(v.string()) }

  // The provider api()'s portal action, replaced: theirs rethrows the SDK's
  // raw error, whose message carries the provider's response body, and
  // takes any return URL. This one goes through the package boundary,
  // refuses by catalog code, and sends the customer back only to the site.
  const generateCustomerPortalUrl = actionGeneric({
    args: { returnUrl: v.optional(v.string()) },
    returns: v.object({ url: v.string() }),
    handler: (ctx, { returnUrl }) => portal(ctx, { returnUrl }),
  })

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
      reason: v.optional(vReason),
      comment: v.optional(v.string()),
      // `false`: cancel now, past any save offer the reason has.
      offer: v.optional(v.literal(false)),
    },
    returns: v.union(
      v.object({ offer: vSaveOffer }),
      v.object({ canceled: v.literal(true), endsAt: v.union(v.number(), v.null()) }),
    ),
    // Cancelling takes one step: the save offer for the reason, where
    // `setupBilling({ lifecycle: { saveOffers } })` names one, else the
    // cancellation (lifecycle.ts).
    handler: (ctx, args) => lifecycle.cancel(ctx, args),
  })

  // The cancel flow's offer, taken: the server finds what it made by the id.
  const acceptSaveOfferFn = actionGeneric({
    args: { offerId: v.string() },
    returns: v.null(),
    handler: async (ctx, args) => {
      await lifecycle.acceptOffer(ctx, args)
      return null
    },
  })

  // The withdrawal button's read: a purchase inside its 14 days, for a billing manager.
  const getWithdrawal = queryGeneric({
    args: {},
    returns: v.union(v.null(), v.object({ period: v.union(v.null(), v.object({ subscriptionId: v.string(), plan: v.union(v.string(), v.null()), startedAt: v.number(), endsAt: v.number() })) })),
    handler: ctx => lifecycle.getWithdrawal(ctx),
  })

  const withdrawFn = actionGeneric({
    args: subscriptionTargetArgs,
    returns: v.object({ withdrawnAt: v.number() }),
    handler: (ctx, args) => lifecycle.withdraw(ctx, args),
  })

  const uncancelSubscriptionFn = actionGeneric({
    args: subscriptionTargetArgs,
    handler: async (ctx, args) => {
      await uncancelSubscription(ctx, args)
      return null
    },
  })

  const cancelPendingChangeFn = actionGeneric({
    args: subscriptionTargetArgs,
    handler: async (ctx, args) => {
      await cancelPendingChange(ctx, args)
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

  // The Revenue view's read (analytics): the provider's metrics over a
  // window, for an administrator in person. An action: it calls the provider.
  const getRevenueFn = actionGeneric({
    args: {
      since: v.number(),
      until: v.optional(v.number()),
      interval: v.optional(v.union(...REVENUE_INTERVALS.map(interval => v.literal(interval)))),
    },
    handler: (ctx, args) => getRevenue(ctx, args),
  })

  return {
    generateCustomerPortalUrl,
    getCurrentSubscription,
    listAllSubscriptions,
    getFeatures,
    getCredits,
    getBillingAccess,
    getBillingConsole,
    syncEntitlements,
    syncProducts,
    startFreePlan,
    updateSubscriptionFn,
    cancelSubscriptionFn,
    acceptSaveOfferFn,
    getWithdrawal,
    withdrawFn,
    uncancelSubscriptionFn,
    cancelPendingChangeFn,
    pauseSubscriptionFn,
    resumeSubscriptionFn,
    getOrdersFn,
    getInvoiceUrlFn,
    getUsageHistoryFn,
    refundOrderFn,
    getRevenueFn,
  }
}
