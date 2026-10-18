import { customerSessionsCreate } from '@polar-sh/sdk/funcs/customerSessionsCreate.js'
import { actionGeneric, type GenericDataModel, type GenericQueryCtx, internalActionGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import type { BillingContext } from './context.js'
import type { BillingEntitlements } from './entitlements.js'
import type { BillingHistory } from './history.js'
import type { PurchaseRules } from './purchase.js'
import type { BillingSubscriptions } from './subscriptions.js'
import type { ProviderCtx } from './types/base.js'
import type { CurrentSubscriptions } from './types/options.js'
import { backendError } from '../../errors.js'

/** Statuses that count as a live entitlement for the current-subscription reads. */
const LIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due', 'paused'])

/** The registered queries and actions `setupBilling` hands the app as `billing.functions`. */
export function createBillingFunctions(
  { config, products, meterNameById, provider, cache, webhookLog, resolveEntity, requireEntity, requireProviderAccess, unwrapProvider, throttle, requireAdmin }: BillingContext,
  { refreshEntitlements }: BillingEntitlements,
  { updateSubscription, cancelSubscription, uncancelSubscription, pauseSubscription, resumeSubscription }: BillingSubscriptions,
  { getOrders, getInvoiceUrl, getUsageHistory, refundOrder }: BillingHistory,
  { requireTrustedUrl }: PurchaseRules,
) {
  // --- Ready-made reactive functions (re-exported by the consumer's billing.ts) ---

  const resolveUserId = async (ctx: GenericQueryCtx<GenericDataModel>): Promise<string | null> =>
    (await resolveEntity(ctx))?.userId ?? null

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
        return provider.getCurrentSubscription(ctx as unknown as ProviderCtx, { userId })
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
      const enriched = await Promise.all(live.map(async (subscription) => {
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
      return provider.listAllUserSubscriptions(ctx as unknown as ProviderCtx, { userId })
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

  /**
   * Whether the caller passes the admin gate `refundOrder` uses, as a yes or
   * no. A signed-out caller is refused before a custom gate is asked.
   */
  const isAdmin = async (ctx: GenericQueryCtx<GenericDataModel>): Promise<boolean> => {
    if (!(await ctx.auth.getUserIdentity())) return false
    try {
      await requireAdmin(ctx, 'getWebhookDeliveries')
      return true
    }
    catch {
      return false
    }
  }

  // The webhook delivery feed (the DevTools Webhooks and Email pages, the
  // playground's webhook page). Admin-tier, like `refundOrder`: the log is
  // deployment-wide — every account's provider delivery ids, event types,
  // outcomes and handler errors. Anyone else, signed out included, reads
  // `null` rather than an error, so a reactive reader settles on "admins
  // only" instead of retrying a throw.
  const getWebhookDeliveries = queryGeneric({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, { limit }) => {
      if (!(await isAdmin(ctx))) return null
      if (!webhookLog) return []
      return ctx.runQuery(webhookLog.listRecent, { limit })
    },
  })

  const syncEntitlements = actionGeneric({
    args: {},
    handler: async (ctx) => {
      const { userId } = await requireEntity(ctx)
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
  // `useBilling().products`). Internal: it is a deployment bootstrap run from
  // ops — `npx convex run billing:syncProducts`, or `convex deploy`'s
  // `--preview-run` — and the CLI is the only caller the docs ever name. A
  // public one would also mean an identity gate and a throttle around a fan-out
  // to the live provider API; an app that wants a button re-declares it with
  // its own `admin.action` builder.
  const syncProducts = internalActionGeneric({
    args: {},
    handler: async (ctx) => {
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

  // The provider api()'s portal action, replaced: theirs rethrows the SDK's
  // raw error, whose message carries the provider's response body, and
  // takes any return URL. This one goes through the package boundary,
  // refuses by catalog code, and sends the customer back only to the site.
  const generateCustomerPortalUrl = actionGeneric({
    args: { returnUrl: v.optional(v.string()) },
    returns: v.object({ url: v.string() }),
    handler: async (ctx, { returnUrl }) => {
      const { userId } = await requireEntity(ctx)
      requireProviderAccess('portal session')
      requireTrustedUrl(returnUrl, 'returnUrl')
      await throttle(ctx, userId, 'portal sessions')
      const customer = await provider.getCustomerByUserId(ctx as unknown as ProviderCtx, userId)
      if (!customer) {
        throw backendError('not_ready', { reason: 'no_customer' }, '[nuxt-backend] No billing customer yet — the portal opens after a first checkout.')
      }
      const session = unwrapProvider(await customerSessionsCreate(provider.polar, { customerId: customer.id, returnUrl }), 'portal session')
      return { url: session.customerPortalUrl }
    },
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

  return {
    generateCustomerPortalUrl,
    getCurrentSubscription,
    listAllSubscriptions,
    getFeatures,
    getCredits,
    getWebhookDeliveries,
    syncEntitlements,
    syncProducts,
    updateSubscriptionFn,
    cancelSubscriptionFn,
    uncancelSubscriptionFn,
    pauseSubscriptionFn,
    resumeSubscriptionFn,
    getOrdersFn,
    getInvoiceUrlFn,
    getUsageHistoryFn,
    refundOrderFn,
  }
}
