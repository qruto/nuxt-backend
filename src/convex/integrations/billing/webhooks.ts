import type { PolarWebhookEvent, WebhookEventHandlers } from '@convex-dev/polar'
import { logBackend } from '../../log.js'
import { reportError } from '../monitoring.js'
import { deliveryIdOf, verifyWebhookSignature } from '../../webhook-signatures.js'
import { handleWebhookDelivery, parseSecretList, type WebhookVerdict } from '../webhook-guard.js'
import { parseBillingEvent, persistProviderRecord } from './provider-events.js'
import type { BillingContext } from './context.js'
import type { BillingEntitlements } from './entitlements.js'
import { ALL_BILLING_EVENTS, FREE_PLAN_NOTE, isFreePlanEvent, refreshesEntitlements, webhookActivity } from './events.js'
import type { BillingCustomers } from './customers.js'
import type { BillingFreePlan, QueueCtx } from './free-plan.js'
import type { BillingGifts } from './gifts.js'
import type { BillingLifecycleOps } from './lifecycle.js'
import type { BillingSubscriptions, SyncedSubscription } from './subscriptions.js'
import type { ProviderCtx, RunWriteCtx } from './types/base.js'
import type { BillingWebhookEventHandlers } from './types/setup.js'
import type { RewardOrders } from './referral-orders.js'

/** A delivery's event as the provider sent it, or nothing for a body that is no JSON object. */
function parseEvent(body: string): { type?: unknown, data?: unknown } {
  try {
    const parsed = JSON.parse(body) as unknown
    return parsed && typeof parsed === 'object' ? parsed as { type?: unknown, data?: unknown } : {}
  }
  catch {
    return {}
  }
}

/**
 * The provider customer a webhook event is about, and the entity it names
 * itself: the customer's external id, else the entity tag in its metadata
 * (on a `customer.*` event the payload is the customer). `entityId` is
 * `null` when it names none; `null` for an event with no customer.
 */
function eventCustomer(event: PolarWebhookEvent): { customerId: string, entityId: string | null } | null {
  const data = event.data as {
    id?: string
    customerId?: string
    externalId?: string | null
    customer?: { id?: string, externalId?: string | null, metadata?: Record<string, unknown> }
    metadata?: Record<string, unknown>
  }
  const customerId = data.customerId ?? data.customer?.id ?? data.id
  if (typeof customerId !== 'string') return null
  const own = String((event as { type?: unknown }).type).startsWith('customer.') ? data : undefined
  const keyed = data.customer?.externalId ?? own?.externalId
  const tagged = data.customer?.metadata?.userId ?? own?.metadata?.userId
  const named = [keyed, tagged].find(value => typeof value === 'string' && value !== '')
  return { customerId, entityId: typeof named === 'string' ? named : null }
}

/** The `/billing/events` edge: the per-event handler map and the guarded handler that runs it. */
export function createWebhooks(
  { config, webhookSecret, webhookLog, provider, providerLib, cache, accessToken, recordEvent, entityDeleting, syncProducts }: BillingContext,
  { refreshEntitlements }: BillingEntitlements,
  { handleGiftOrderPaid, handleGiftOrderRefunded, passes }: BillingGifts,
  { recordTrial }: BillingCustomers,
  { recordChange }: BillingSubscriptions,
  { restartAfterRevoke, isFreeProduct }: Pick<BillingFreePlan, 'restartAfterRevoke' | 'isFreeProduct'>,
  lifecycle: Pick<BillingLifecycleOps, 'confirmConsent' | 'remindRenewal' | 'abandonCheckout' | 'softOptIn'>,
  referralOrders: RewardOrders,
) {
  // --- Webhook handlers: keep the cache fresh as billing state changes ---

  // Handlers run inside an httpAction at runtime, so we can refresh inline.
  /**
   * The billing entity a webhook event belongs to, from its provider
   * customer: the customer's external id first (every customer this package
   * creates is keyed by its entity's id), then the entity tag in the
   * customer's own metadata, then the entity the cache last synced it for.
   * Only the customer counts: an order's or a subscription's metadata is
   * copied from its checkout, which a buyer filled in, so a `userId` there
   * could name any entity. On a `customer.*` event the payload is the
   * customer itself. A customer found by its key or tag is mapped in the
   * component too, so its synced subscriptions read back for the entity even
   * when it was created outside a checkout of this package. An entity an
   * account's erasure is deleting is none: the deliveries its customer's
   * deletion sets off map, refresh and record nothing of it again.
   */
  const resolveEventEntity = async (ctx: RunWriteCtx, event: PolarWebhookEvent): Promise<string | null> => {
    const customer = eventCustomer(event)
    if (!customer) return null
    const { customerId, entityId } = customer
    const resolved = entityId ?? await ctx.runQuery(cache.userByCustomer, { customerId })
    if (resolved === null || await entityDeleting(ctx, resolved)) return null
    if (entityId === null) return resolved
    if (!await provider.getCustomerByUserId(ctx as unknown as ProviderCtx, entityId)) {
      await ctx.runMutation(providerLib.insertCustomer, { id: customerId, userId: entityId })
    }
    return entityId
  }

  /**
   * A subscription changed: when it is a running plan pass now on another
   * product, the workspace kept the plan, and the pass is over (its
   * scheduled return cleared). A failure is logged, never the delivery's:
   * the sweep follows the same pass on its next run.
   */
  const followPass = async (ctx: RunWriteCtx, event: PolarWebhookEvent): Promise<void> => {
    try {
      await passes.onSubscriptionChanged(ctx, await resolveEventEntity(ctx, event), event.data as { id?: string, productId?: string })
    }
    catch (error) {
      logBackend('error', 'billing.gift_sweep_task_failed', 'A plan pass could not be followed on a subscription change; the next sweep tries it again.', error)
    }
  }

  const handleRefreshEvent = async (ctx: RunWriteCtx, event: PolarWebhookEvent): Promise<void> => {
    const userId = await resolveEventEntity(ctx, event)
    if (!userId) return
    if (String((event as { type?: unknown }).type).startsWith('subscription.')) {
      // A subscription that started a trial spends its owner's one trial, for good.
      const subscription = event.data as { trialStart?: unknown }
      if (subscription.trialStart != null) await recordTrial(ctx, userId)
      // Its scheduled plan change and resume date, which the synced table lacks.
      await recordChange(ctx, userId, event.data)
    }
    await refreshEntitlements(ctx, userId)
  }

  /**
   * A subscription ended: the entity goes back on the free plan, unless it
   * holds another plan or no longer exists, or the provider deleted its
   * customer. Queued, never run inline: the delivery answers before the
   * provider is asked again.
   */
  const handleSubscriptionRevoked = async (ctx: RunWriteCtx, event: PolarWebhookEvent): Promise<void> => {
    const userId = await resolveEventEntity(ctx, event)
    const subscription = event.data as { id?: unknown, customer?: { deletedAt?: unknown } }
    if (!userId || typeof subscription.id !== 'string') return
    await restartAfterRevoke(ctx as QueueCtx, userId, { id: subscription.id, customerDeleted: subscription.customer?.deletedAt != null })
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
    const userId = await resolveEventEntity(ctx, event)
    if (!userId) return
    await ctx.runMutation(cache.clearPendingSpends, { userId })
  }

  // A benefit's metadata or name changed — patch the snapshot so friendly-key
  // feature gating (`has('premium')`) and the benefit's name in the billing
  // section update reactively for every entity holding it.
  const handleBenefitUpdated = async (ctx: RunWriteCtx, event: PolarWebhookEvent): Promise<void> => {
    const data = event.data as { id?: string, metadata?: Record<string, string | number | boolean>, description?: unknown }
    if (typeof data.id !== 'string') return
    await ctx.runMutation(cache.upsertBenefitMetadata, {
      entries: [{ benefitId: data.id, metadata: data.metadata ?? {}, ...(typeof data.description === 'string' ? { description: data.description } : {}) }],
    })
  }

  /**
   * Reload the products table after a benefit changed: a product row embeds
   * its benefits (a pack's credits, a plan's features), and the provider
   * sends no `product.updated` for a benefit edited in its dashboard, so
   * pricing would keep the old units. A deployment with no access
   * token yet has nothing to read them with. A
   * refresh that fails is logged and reported, never the delivery's
   * failure: the benefit itself is recorded already, the app's hook still
   * runs, and the next product event or `billing:syncProducts` catches up.
   */
  const resyncProducts = async (ctx: RunWriteCtx): Promise<void> => {
    try {
      if (accessToken && 'runAction' in ctx) await syncProducts(ctx)
    }
    catch (error) {
      logBackend('warn', 'billing.product_resync_failed', 'A benefit changed but the products table could not be re-synced, so pricing shows the old figures until the next product event or billing:syncProducts.', error)
      await reportError(error, { function: 'billing webhook' })
    }
  }

  /**
   * Whether a benefit grant came with the free plan: its subscription is
   * on a free product, as the synced table reads it. The free plan grants
   * its credits again every cycle, for every entity: the trail keeps none.
   */
  const grantedByFreePlan = async (ctx: RunWriteCtx, entityId: string, event: PolarWebhookEvent): Promise<boolean> => {
    const grant = event.data as { subscriptionId?: unknown }
    if (typeof grant.subscriptionId !== 'string') return false
    const subscriptions = await provider.listAllUserSubscriptions(ctx as unknown as ProviderCtx, { userId: entityId }) as Array<{ id: string, productId: string }>
    const subscription = subscriptions.find(entry => entry.id === grant.subscriptionId)
    return subscription ? await isFreeProduct(ctx, subscription.productId) : false
  }

  /**
   * Record what a delivery stands for on the shared event path, for the
   * entity its customer belongs to: the app acted. A free plan's own
   * lifecycle records nothing, and nor does an event of a customer no
   * entity is known by. Never the delivery's failure: `recordEvent` logs
   * one it could not record.
   */
  /**
   * The billing lifecycle's part of a delivery (LIFECYCLE): a subscription
   * a checkout started or upgraded, and the order it paid, confirm the
   * checkout's consent proof; an update (a new period among them) may
   * bring the annual renewal reminder, and an expired checkout is handed to
   * the abandoned-checkout email, and a paid sale may join its customer to
   * the soft opt-in's topics. A failure is logged and never fails the
   * delivery: the provider's own state is already right.
   */
  const handleLifecycle = async (ctx: RunWriteCtx, type: string, event: PolarWebhookEvent): Promise<void> => {
    try {
      const data = event.data as { id?: unknown, checkoutId?: unknown, subscriptionId?: unknown, createdAt?: unknown, modifiedAt?: unknown }
      if (type === 'subscription.created') await lifecycle.confirmConsent(ctx, { subscriptionId: data.id, checkoutId: data.checkoutId, at: data.createdAt })
      // An upgrade of the free plan's subscription in place: the update carries the checkout that bought the plan.
      if (type === 'subscription.updated') await lifecycle.confirmConsent(ctx, { subscriptionId: data.id, checkoutId: data.checkoutId, at: data.modifiedAt })
      if (type === 'order.paid') await lifecycle.confirmConsent(ctx, { subscriptionId: data.subscriptionId, checkoutId: data.checkoutId, at: data.createdAt })
      if (type === 'subscription.updated') {
        const entityId = await resolveEventEntity(ctx, event)
        if (entityId) await lifecycle.remindRenewal(ctx, entityId, event.data as unknown as SyncedSubscription)
      }
      if (type === 'checkout.expired') await lifecycle.abandonCheckout(ctx, event.data as Record<string, unknown> as never)
      // A sale whose checkout showed the soft opt-in's box joins the topics that take it.
      if (type === 'order.paid') await lifecycle.softOptIn(ctx, event.data as Record<string, unknown>)
    }
    catch (error) {
      logBackend('error', 'billing.lifecycle_step_failed', `The billing lifecycle could not act on a ${type} delivery; the delivery itself was accepted.`, error)
    }
  }

  /**
   * A paid order may be the first one of a person a referral brought: it
   * starts the hold (REF). A refund of the order a referral holds voids it.
   * A failure is logged and never fails the delivery: the provider's state is
   * already right, and the program's sweep checks the order again at the end
   * of the hold.
   */
  const handleReferralOrder = async (ctx: RunWriteCtx, type: 'order.paid' | 'order.refunded', event: PolarWebhookEvent): Promise<void> => {
    try {
      await referralOrders(ctx, type, event.data as Parameters<RewardOrders>[2], () => resolveEventEntity(ctx, event))
    }
    catch (error) {
      logBackend('error', 'billing.referral_step_failed', `The referral program could not act on an ${type} delivery; the delivery itself was accepted.`, error)
    }
  }

  const recordActivity = async (ctx: RunWriteCtx, event: PolarWebhookEvent): Promise<void> => {
    const activity = webhookActivity(event as { type?: unknown, data?: unknown })
    if (!activity) return
    const entityId = await resolveEventEntity(ctx, event)
    if (!entityId) return
    if (activity.type.startsWith('billing.benefit_') && await grantedByFreePlan(ctx, entityId, event)) return
    await recordEvent(ctx, entityId, { ...activity, actor: null })
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
      const refreshes = refreshesEntitlements(type)
      const consumerHandler = consumerEvents[type as keyof WebhookEventHandlers]
      return [type, async (ctx: RunWriteCtx, event: PolarWebhookEvent) => {
        // Reservations are dropped *before* the refresh, so the refreshed
        // cache is exactly what the provider now says.
        if (type === 'order.refunded') await handleOrderRefunded(ctx, event)
        if (type === 'order.refunded') await handleGiftOrderRefunded(ctx, event)
        if (refreshes) await handleRefreshEvent(ctx, event)
        if (type === 'subscription.revoked') await handleSubscriptionRevoked(ctx, event)
        if (type === 'benefit.updated') await handleBenefitUpdated(ctx, event)
        if (type === 'benefit.updated') await resyncProducts(ctx)
        if (type === 'order.paid') await handleGiftOrderPaid(ctx, event)
        if (type === 'subscription.updated' || type === 'subscription.active') await followPass(ctx, event)
        await handleLifecycle(ctx, type, event)
        if (type === 'order.paid' || type === 'order.refunded') await handleReferralOrder(ctx, type, event)
        await recordActivity(ctx, event)
        if (consumerHandler) await (consumerHandler as (ctx: RunWriteCtx, event: PolarWebhookEvent) => Promise<void>)(ctx, event)
      }]
    }),
  ) as BillingWebhookEventHandlers

  // --- The guarded webhook edge (mounted by registerBackendRoutes) ---
  //
  // The package's own handlers, behind the shared webhook edge: the one
  // verifier checks the signature (Standard Webhooks, and Polar's legacy key
  // for a secret created before 2026-09-08) against every secret of the
  // comma-separated rotation list, then the event is parsed into the
  // provider SDK's typed shape, the provider component's tables are kept in
  // step (subscriptions and products, as its own route would), and the event
  // map runs. The edge adds missing-secret 503, the 1 MiB cap, webhook-id
  // dedupe, authentic-unknown-type 202 and outcome logging.
  const webhookSecrets = parseSecretList(webhookSecret)

  const verify = async (ctx: RunWriteCtx, request: Request, body: string): Promise<WebhookVerdict> => {
    if (!verifyWebhookSignature(webhookSecrets, body, request.headers, { legacyKey: true })) return { outcome: 'invalid_signature' }
    let event: PolarWebhookEvent
    try {
      event = parseBillingEvent(body)
    }
    catch (error) {
      // Authentic (the signature passed) but unparseable by the installed
      // SDK — a type newer than it, say — acknowledged instead of 500-looping.
      if ((error as { name?: string })?.name === 'SDKValidationError') return { outcome: 'unknown_type' }
      throw error
    }
    await persistProviderRecord(ctx, providerLib, event)
    const handler = webhookEvents[event.type as keyof typeof webhookEvents] as ((ctx: RunWriteCtx, event: PolarWebhookEvent) => Promise<void>) | undefined
    if (handler) await handler(ctx, event)
    // A free plan's delivery is marked, so DevTools folds a run of them into one row.
    return { outcome: 'ok', response: new Response('Accepted', { status: 202 }), ...(isFreePlanEvent(parseEvent(body)) ? { note: FREE_PLAN_NOTE } : {}) }
  }

  const webhookHandler = async (ctx: RunWriteCtx, request: Request): Promise<Response> => {
    return handleWebhookDelivery(ctx, webhookLog, {
      service: 'billing',
      deliveryId: deliveryIdOf(request.headers),
      request,
      secretsConfigured: webhookSecrets.length > 0,
      verify: (_event, body) => verify(ctx, request, body),
      onUnknownEvent: config.onUnknownEvent,
    })
  }

  return { webhookEvents, webhookHandler }
}
