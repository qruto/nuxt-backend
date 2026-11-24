import { type FunctionReference, makeFunctionReference } from 'convex/server'
import { planCreditUnits } from '../../catalog.js'
import { START_FREE_PLAN_FUNCTION } from '../../constants.js'
import { logBackend } from '../../log.js'
import { handleWebhookDelivery, parseSecretList } from '../webhook-guard.js'
import { createCommerceWebhookHandler } from './commerce-webhooks.js'
import { type CatalogProduct, catalogProductOf } from './commerce.js'
import type { BillingContext } from './context.js'
import type { BillingCustomers } from './customers.js'
import type { BillingEntitlements } from './entitlements.js'
import type { BillingFreePlan, FreePlanStart, QueueCtx } from './free-plan.js'
import type { NeutralBillingEvent, NeutralOrder, NeutralSubscription } from './providers/types.js'
import type { ProviderCtx, RunWriteCtx } from './types/base.js'

// What adapter mode (commerce.ts) does with a provider's verified, neutral
// event: the subscription into the provider component's subscriptions
// table, the paid order into the order ledger with its credits granted,
// a refund or a dispute taking the credits back; then the entity's plan is
// written to the cache again. And the credit cycle the provider does not
// run: the free plan's monthly allowance (and a yearly plan's on a monthly
// meter cycle), granted a month at a time on the scheduler.

/** A subscription row as the provider component keeps it. */
interface SubscriptionRow {
  id: string
  customerId: string
  createdAt: string
  modifiedAt: string | null
  amount: number | null
  currency: string | null
  recurringInterval: string | null
  status: string
  currentPeriodStart: string
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  startedAt: string | null
  endedAt: string | null
  productId: string
  checkoutId: string | null
  metadata: Record<string, unknown>
  canceledAt?: string | null
  endsAt?: string | null
  trialStart?: string | null
  trialEnd?: string | null
}

/** Statuses of a subscription the entity still holds. */
const LIVE_STATUSES = new Set(['active', 'trialing', 'past_due', 'paused'])

/** The month a cycle grant belongs to, `YYYY-MM` in UTC. */
function monthOf(at: number): string {
  return new Date(at).toISOString().slice(0, 7)
}

/** The first moment of the next UTC month: when the next cycle grant runs. */
function nextMonth(at: number): number {
  const date = new Date(at)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
}

/** An ISO time of epoch ms, or `null`. */
function isoOf(at: number | null | undefined): string | null {
  return typeof at === 'number' && Number.isFinite(at) ? new Date(at).toISOString() : null
}

/** Epoch ms of an ISO time, or `undefined`. */
function msOf(at: string | null | undefined): number | undefined {
  const ms = at ? Date.parse(at) : Number.NaN
  return Number.isFinite(ms) ? ms : undefined
}

/** A row's state fields: its status, its period, and when it was canceled, ends, ended or trials. */
type StateFields = Pick<SubscriptionRow, 'status' | 'currentPeriodStart' | 'currentPeriodEnd' | 'cancelAtPeriodEnd' | 'endedAt' | 'canceledAt' | 'endsAt' | 'trialStart' | 'trialEnd'>

/** The period a delivered subscription is in: a later end than the row's starts the next one there. */
function periodOf(subscription: NeutralSubscription, prior: Partial<SubscriptionRow>, now: string): Pick<SubscriptionRow, 'currentPeriodStart' | 'currentPeriodEnd'> {
  const currentPeriodEnd = isoOf(subscription.currentPeriodEnd) ?? prior.currentPeriodEnd ?? null
  const renewed = prior.currentPeriodEnd != null && currentPeriodEnd !== prior.currentPeriodEnd
  return { currentPeriodStart: renewed ? prior.currentPeriodEnd! : prior.currentPeriodStart ?? now, currentPeriodEnd }
}

/** The state a delivered subscription sets on its row, keeping each time from `prior` where it was set before: an ended one stays ended. */
function stateFields(subscription: NeutralSubscription, prior: Partial<SubscriptionRow>, now: string): StateFields {
  const period = periodOf(subscription, prior, now)
  const trial = { trialStart: prior.trialStart ?? null, trialEnd: prior.trialEnd ?? null }
  if (subscription.status === 'ended' || prior.endedAt != null) {
    return { status: 'canceled', ...period, cancelAtPeriodEnd: false, endedAt: prior.endedAt ?? now, canceledAt: prior.canceledAt ?? now, endsAt: prior.endsAt ?? now, ...trial }
  }
  const cancelling = subscription.cancelAtPeriodEnd
  return {
    status: subscription.status,
    ...period,
    cancelAtPeriodEnd: cancelling,
    endedAt: null,
    canceledAt: cancelling ? prior.canceledAt ?? now : null,
    endsAt: cancelling ? period.currentPeriodEnd : null,
    ...(subscription.status === 'trialing' ? { trialStart: trial.trialStart ?? now, trialEnd: period.currentPeriodEnd } : trial),
  }
}

/** The provider component's subscription read, which the structural refs leave out. */
type GetSubscription = FunctionReference<'query', 'internal', { id: string }, SubscriptionRow | null>

/** The events, the credit cycle and the webhook edge of adapter mode. */
export function createCommerceEvents(
  context: BillingContext,
  { refreshEntitlements }: Pick<BillingEntitlements, 'refreshEntitlements'>,
  { recordTrial }: Pick<BillingCustomers, 'recordTrial'>,
  freePlan: Pick<BillingFreePlan, 'restartAfterRevoke'>,
) {
  const { provider, providerLib, components, webhookLog, webhookSecret, recordEvent, entityDeleting } = context
  const commerce = context.commerce!
  const { refs, name, config: { definition } } = commerce
  /** The merchant of record, as the log names it. */
  const merchant = name
  const getSubscription = (components.polar as unknown as { lib: { getSubscription: GetSubscription } }).lib.getSubscription
  // The scaffold's `startFreePlan`, which runs the cycle for `{ entityId }`.
  const cycleReference = makeFunctionReference<'action', { entityId?: string }>(START_FREE_PLAN_FUNCTION)

  /** The product an id sells, by the ids in force. */
  const productOf = (productId: string | null | undefined): CatalogProduct => catalogProductOf(definition, commerce.ids, productId)

  /**
   * The entity an event is for: the one the checkout named in its metadata,
   * else the one the customer was linked to, else the one its subscription
   * was synced for (the subscription row's customer is the entity).
   */
  const entityOf = async (ctx: RunWriteCtx, ids: { entityId: string | null, customerId: string | null, subscriptionId?: string | null }): Promise<string | null> => {
    if (ids.entityId) return ids.entityId
    if (ids.customerId) {
      const linked = await ctx.runQuery(refs.entityOfCustomer, { provider: name, customerId: ids.customerId })
      if (linked) return linked
    }
    return ids.subscriptionId ? (await ctx.runQuery(getSubscription, { id: ids.subscriptionId }))?.customerId ?? null : null
  }

  /** Note who the entity is at the provider, and map it in the provider component, whose rows read by it. */
  const linkEntity = async (ctx: RunWriteCtx, entityId: string, customerId: string | null): Promise<void> => {
    if (customerId) await ctx.runMutation(refs.linkCustomer, { entityId, provider: name, customerId })
    await ctx.runMutation(providerLib.insertCustomer, { id: entityId, userId: entityId })
  }

  /** The plan's price at its interval, in the catalog's currency. */
  const priceOf = (product: CatalogProduct): { amount: number, currency: string } | null => {
    if (product?.kind !== 'plan') return null
    const prices = product.plan.prices as Record<string, unknown>
    const own = prices[product.interval]
    if (typeof own === 'number') return { amount: own, currency: definition.currency?.toLowerCase() ?? 'usd' }
    const [currency, amounts] = Object.entries(prices)[0] ?? []
    const amount = (amounts as Record<string, unknown> | undefined)?.[product.interval]
    return currency && typeof amount === 'number' ? { amount, currency: currency.toLowerCase() } : null
  }

  /** The row a delivered subscription becomes, from what the table held: an ended one stays ended. */
  const subscriptionRow = (subscription: NeutralSubscription, entityId: string, existing: SubscriptionRow | null): SubscriptionRow => {
    const now = new Date().toISOString()
    const prior: Partial<SubscriptionRow> = existing ?? {}
    const productId = subscription.productId ?? prior.productId ?? ''
    const product = productOf(productId)
    const price = priceOf(product)
    return {
      id: subscription.id,
      customerId: entityId,
      createdAt: prior.createdAt ?? now,
      modifiedAt: now,
      amount: price?.amount ?? prior.amount ?? null,
      currency: price?.currency ?? prior.currency ?? null,
      recurringInterval: product?.kind === 'plan' ? product.interval : prior.recurringInterval ?? null,
      startedAt: prior.startedAt ?? now,
      productId,
      checkoutId: prior.checkoutId ?? null,
      metadata: subscription.metadata,
      ...stateFields(subscription, prior, now),
    }
  }

  const onSubscription = async (ctx: RunWriteCtx, subscription: NeutralSubscription): Promise<void> => {
    const entityId = await entityOf(ctx, { ...subscription, subscriptionId: subscription.id })
    if (!entityId) {
      logBackend('warn', 'billing.commerce_unknown_entity', `A ${merchant} subscription delivery named no billing entity the app knows; it was acknowledged and left out.`)
      return
    }
    if (await entityDeleting(ctx, entityId)) return
    await linkEntity(ctx, entityId, subscription.customerId)
    const existing = await ctx.runQuery(getSubscription, { id: subscription.id })
    const row = subscriptionRow(subscription, entityId, existing)
    await ctx.runMutation(providerLib.updateSubscription, { subscription: row as unknown as Record<string, unknown> })
    if (row.trialStart && !existing?.trialStart) await recordTrial(ctx, entityId)
    await refreshEntitlements(ctx, entityId)
    if (row.endedAt && !existing?.endedAt) {
      // Back on the free plan, which starts its credit cycle again.
      await freePlan.restartAfterRevoke(ctx as QueueCtx, entityId, { id: row.id, customerDeleted: false })
    }
    await recordEvent(ctx, entityId, { type: 'billing.subscription_updated', actor: null, targetId: row.id, data: { productId: row.productId, status: row.status } })
  }

  /** The subscription row an order renews, if it renews one. */
  const subscriptionOf = async (ctx: RunWriteCtx, subscriptionId: string | null): Promise<SubscriptionRow | null> =>
    subscriptionId ? await ctx.runQuery(getSubscription, { id: subscriptionId }) : null

  /**
   * Grant what a paid order buys, under the order's key: a pack's credits,
   * which keep; a plan's for its period, which lapse at the next unless the
   * catalog rolls them over. A yearly plan on a monthly meter cycle starts
   * the monthly cycle instead.
   */
  const grantOrder = async (ctx: RunWriteCtx, entityId: string, order: NeutralOrder, product: CatalogProduct): Promise<void> => {
    if (product?.kind === 'pack') {
      const pack = definition.packs![product.key]!
      await ctx.runMutation(refs.grantCredits, { userId: entityId, meterId: pack.credits.meter, amount: pack.credits.units, externalId: `order:${order.id}`, source: 'pack', rollover: pack.credits.rollover ?? true })
      return
    }
    const credits = product?.kind === 'plan' ? product.plan.credits : undefined
    if (product?.kind !== 'plan' || !credits || credits.once) return
    if (product.interval === 'year' && product.plan.meterCycle === 'month') {
      await (ctx as QueueCtx).scheduler.runAfter(0, cycleReference, { entityId })
      return
    }
    const units = planCreditUnits(credits, product.interval)
    if (!units) return
    const subscription = await subscriptionOf(ctx, order.subscriptionId)
    await ctx.runMutation(refs.grantCredits, {
      userId: entityId,
      meterId: credits.meter,
      amount: units,
      externalId: `order:${order.id}`,
      source: 'plan',
      rollover: credits.rollover ?? false,
      ...(msOf(subscription?.currentPeriodStart) === undefined ? {} : { cycleStart: msOf(subscription?.currentPeriodStart) }),
      ...(msOf(subscription?.currentPeriodEnd) === undefined ? {} : { cycleEnd: msOf(subscription?.currentPeriodEnd) }),
    })
  }

  const onOrderPaid = async (ctx: RunWriteCtx, order: NeutralOrder): Promise<void> => {
    const entityId = await entityOf(ctx, order)
    if (!entityId) {
      logBackend('warn', 'billing.commerce_unknown_entity', `A ${merchant} order named no billing entity the app knows; it was acknowledged and left out.`)
      return
    }
    if (await entityDeleting(ctx, entityId)) return
    await linkEntity(ctx, entityId, order.customerId)
    const productId = order.productId ?? (await subscriptionOf(ctx, order.subscriptionId))?.productId ?? null
    const recorded = await ctx.runMutation(refs.recordOrder, {
      orderId: order.id,
      provider: name,
      entityId,
      ...(productId ? { productId } : {}),
      ...(order.subscriptionId ? { subscriptionId: order.subscriptionId } : {}),
      amount: order.amount,
      ...(order.taxAmount === null ? {} : { taxAmount: order.taxAmount }),
      currency: order.currency,
    })
    // A redelivered order granted its credits the first time.
    if (!recorded) return
    const product = productOf(productId)
    await grantOrder(ctx, entityId, order, product)
    await refreshEntitlements(ctx, entityId)
    await recordEvent(ctx, entityId, { type: 'billing.order_paid', actor: null, targetId: order.id, data: { amount: order.amount, currency: order.currency, ...(product?.kind === 'plan' ? { interval: product.interval } : {}) } })
  }

  /** A refunded or disputed order's credits taken back, as many as the balance still holds. */
  const takeBack = async (ctx: RunWriteCtx, entityId: string, orderId: string): Promise<void> => {
    await ctx.runMutation(refs.revokeGrant, { userId: entityId, externalId: `order:${orderId}` })
  }

  const onRefund = async (ctx: RunWriteCtx, event: Extract<NeutralBillingEvent, { type: 'order.refunded' }>): Promise<void> => {
    const { refund } = event
    // A refund pending or failed moves nothing: its `succeeded` delivery does.
    if (refund.status !== 'succeeded' || !refund.orderId) return
    const counted = await ctx.runMutation(refs.refundOrder, { orderId: refund.orderId, refundId: refund.id, ...(refund.amount === null ? {} : { amount: refund.amount }) })
    if (!counted?.counted) return
    const { order } = counted
    // A whole refund takes the order's credits back; a partial one keeps them.
    if (order.status === 'refunded') await takeBack(ctx, order.entityId, order.orderId)
    await refreshEntitlements(ctx, order.entityId)
    await recordEvent(ctx, order.entityId, { type: 'billing.order_refunded', actor: null, targetId: order.orderId, data: { amount: refund.amount ?? order.amount, currency: refund.currency ?? order.currency } })
  }

  const onDispute = async (ctx: RunWriteCtx, orderId: string | null): Promise<void> => {
    if (!orderId) return
    const order = await ctx.runMutation(refs.disputeOrder, { orderId })
    if (!order) return
    await takeBack(ctx, order.entityId, order.orderId)
    await refreshEntitlements(ctx, order.entityId)
  }

  /** What the package does with a verified event, then the app's own `commerce.onEvent`. */
  const onEvent = async (ctx: RunWriteCtx, event: NeutralBillingEvent, delivery: { id: string }): Promise<void> => {
    if (event.type === 'subscription.updated') await onSubscription(ctx, event.subscription)
    else if (event.type === 'order.paid') await onOrderPaid(ctx, event.order)
    else if (event.type === 'order.refunded') await onRefund(ctx, event)
    else if (event.type === 'order.disputed') await onDispute(ctx, event.orderId)
    if (commerce.config.onEvent) await commerce.config.onEvent(ctx, event, delivery)
  }

  /** The entity's live subscription, if it holds one. */
  const liveSubscription = async (ctx: RunWriteCtx, entityId: string): Promise<{ productId: string } | null> => {
    const all = await provider.listAllUserSubscriptions(ctx as unknown as ProviderCtx, { userId: entityId }) as Array<{ productId: string, status: string, endedAt?: string | null }>
    return all.find(subscription => subscription.endedAt == null && LIVE_STATUSES.has(subscription.status)) ?? null
  }

  /** The plan credits a month of the cycle grants the entity, with the plan's key; `null` where the provider's invoices grant them. */
  const monthlyCredits = async (ctx: RunWriteCtx, entityId: string) => {
    const live = await liveSubscription(ctx, entityId)
    const productId = live ? live.productId : context.catalogIds?.free ? context.freePlan?.productId : undefined
    const product = productOf(productId)
    if (product?.kind !== 'plan') return null
    const credits = product.plan.credits
    const monthly = live === null || (product.interval === 'year' && product.plan.meterCycle === 'month')
    const units = monthly && credits && !credits.once ? planCreditUnits(credits, 'month') : 0
    return units ? { key: product.key, meter: credits!.meter, units, rollover: credits!.rollover ?? false } : null
  }

  /**
   * One month of the credit cycle the provider does not run, for one
   * entity: the free plan's allowance while it holds no subscription, a
   * yearly plan's monthly one on a monthly meter cycle, once per month by
   * its key. A month newly granted schedules the next; a second chain for
   * the same entity meets the same key and stops. Answers what the free
   * plan's start answers: `started` the first time, else `subscribed`.
   */
  const cycle = async (ctx: RunWriteCtx, entityId: string, first: () => Promise<void>): Promise<FreePlanStart> => {
    const isNew = (await ctx.runQuery(context.cache.getByUser, { userId: entityId })) === null
    await refreshEntitlements(ctx, entityId)
    if (isNew) await first()
    const month = await monthlyCredits(ctx, entityId)
    if (month) {
      const now = Date.now()
      const granted = await ctx.runMutation(refs.grantCredits, {
        userId: entityId,
        meterId: month.meter,
        amount: month.units,
        externalId: `cycle:${entityId}:${month.key}:${monthOf(now)}`,
        source: 'plan',
        rollover: month.rollover,
        cycleStart: Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1),
        cycleEnd: nextMonth(now),
      })
      if (granted.granted) await (ctx as QueueCtx).scheduler.runAt(nextMonth(now), cycleReference, { entityId })
    }
    return isNew ? 'started' : 'subscribed'
  }

  const webhookSecrets = parseSecretList(webhookSecret)

  /**
   * `/billing/events` on an adapter provider: its verifier and its neutral
   * events behind the guarded edge. Without an API key the adapter can't be
   * built, and the delivery is answered 503 so the provider sends it again.
   */
  const webhookHandler = async (ctx: RunWriteCtx, request: Request): Promise<Response> => {
    if (!context.accessToken) {
      return handleWebhookDelivery(ctx, webhookLog, { service: 'billing', deliveryId: null, request, secretsConfigured: false, verify: async () => ({ outcome: 'invalid_signature' }) })
    }
    return createCommerceWebhookHandler<RunWriteCtx>({ provider: commerce.client(), secrets: webhookSecrets, webhookLog, onEvent })(ctx, request)
  }

  return { onEvent, cycle, webhookHandler }
}
