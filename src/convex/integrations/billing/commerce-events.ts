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

/** A day in ms. */
const DAY_MS = 24 * 60 * 60 * 1000

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
  const renewed = prior.currentPeriodEnd != null && currentPeriodEnd !== null && Date.parse(currentPeriodEnd) > Date.parse(prior.currentPeriodEnd)
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

/** Whether a product is a yearly plan whose credits come a month at a time. */
function monthlyCycleOf(product: CatalogProduct): boolean {
  return product?.kind === 'plan' && product.interval === 'year' && product.plan.meterCycle === 'month' && !!product.plan.credits && !product.plan.credits.once
}

/** The months from `from` through `to`, `YYYY-MM` in UTC, at most 13: the cycle grants a year's order can have made. */
function monthsBetween(from: number, to: number): string[] {
  const months: string[] = []
  for (let at = from; at <= to && months.length < 13; at = nextMonth(at)) months.push(monthOf(at))
  return months
}

/** A grant's cycle, from the period its subscription row is in: each bound where the row has it. */
function periodBounds(subscription: Pick<SubscriptionRow, 'currentPeriodStart' | 'currentPeriodEnd'> | null): { cycleStart?: number, cycleEnd?: number } {
  const cycleStart = msOf(subscription?.currentPeriodStart)
  const cycleEnd = msOf(subscription?.currentPeriodEnd)
  return { ...(cycleStart === undefined ? {} : { cycleStart }), ...(cycleEnd === undefined ? {} : { cycleEnd }) }
}

/**
 * Where the period an order pays for starts: its subscription's period
 * start while that period holds the order, else a day before the order.
 * The subscription's own delivery can start the cycle first, so its first
 * month can be the one before the order's.
 */
function periodStartOf(subscription: Pick<SubscriptionRow, 'currentPeriodStart'> | null, orderedAt: number): number {
  const start = msOf(subscription?.currentPeriodStart)
  return start !== undefined && start <= orderedAt ? start : orderedAt - DAY_MS
}

/** Whether a recorded order was taken back whole: refunded in full or disputed. */
function reversed(order: { status: string }): boolean {
  return order.status === 'refunded' || order.status === 'disputed'
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
  const { provider, providerLib, components, webhookLog, webhookSecret, recordEvent, entityDeleting, cache } = context
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

  /**
   * Keep a plan change scheduled for the next period past a delivery of its
   * subscription, which no adapter's delivery names: recorded again at the
   * row's new time while it is still to come and the row still on the old
   * product, dropped once the row moved to it.
   */
  const keepScheduledChange = async (ctx: RunWriteCtx, entityId: string, row: SubscriptionRow): Promise<void> => {
    const [change] = await ctx.runQuery(cache.subscriptionChanges, { subscriptionIds: [row.id] })
    const pending = change?.pendingChange
    if (!pending) return
    const kept = pending.appliesAt > Date.now() && pending.productId !== row.productId && !row.endedAt
    await ctx.runMutation(cache.recordSubscriptionChange, { subscriptionId: row.id, userId: entityId, pendingChange: kept ? pending : null, resumesAt: change.resumesAt, modifiedAt: Date.parse(row.modifiedAt ?? '') || Date.now() })
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
    await keepScheduledChange(ctx, entityId, row)
    if (row.trialStart && !existing?.trialStart) await recordTrial(ctx, entityId)
    await refreshEntitlements(ctx, entityId)
    // The month's grant goes by its key, so this and the order's start grant it once.
    if (!row.endedAt && LIVE_STATUSES.has(row.status) && monthlyCycleOf(productOf(row.productId))) await (ctx as QueueCtx).scheduler.runAfter(0, cycleReference, { entityId })
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
   * the monthly cycle instead, once its subscription is synced: before
   * that, the subscription's own delivery starts it.
   */
  const grantOrder = async (ctx: RunWriteCtx, entityId: string, order: NeutralOrder, product: CatalogProduct): Promise<void> => {
    if (product?.kind === 'pack') {
      const pack = definition.packs![product.key]!
      await ctx.runMutation(refs.grantCredits, { userId: entityId, meterId: pack.credits.meter, amount: pack.credits.units, externalId: `order:${order.id}`, source: 'pack', rollover: pack.credits.rollover ?? true, orderId: order.id })
      return
    }
    const credits = product?.kind === 'plan' ? product.plan.credits : undefined
    if (product?.kind !== 'plan' || !credits || credits.once) return
    const subscription = await subscriptionOf(ctx, order.subscriptionId)
    if (monthlyCycleOf(product)) {
      // The months of its period the cycle granted before the order arrived are the order's to take back.
      const months = monthsBetween(periodStartOf(subscription, Date.now()), Date.now())
      await ctx.runMutation(refs.linkGrants, { userId: entityId, orderId: order.id, externalIds: months.map(month => `cycle:${entityId}:${product.key}:${month}`) })
      if (subscription && subscription.endedAt == null) await (ctx as QueueCtx).scheduler.runAfter(0, cycleReference, { entityId })
      return
    }
    const units = planCreditUnits(credits, product.interval)
    if (units) await ctx.runMutation(refs.grantCredits, { userId: entityId, meterId: credits.meter, amount: units, externalId: `order:${order.id}`, source: 'plan', rollover: credits.rollover ?? false, orderId: order.id, ...periodBounds(subscription) })
  }

  /** A subscription's order that arrived before the subscription it renews: failed, the provider delivers it again. */
  const beforeItsSubscription = () => new Error(`[nuxt-backend] A ${merchant} order arrived before its subscription; the provider delivers it again.`)

  const onOrderPaid = async (ctx: RunWriteCtx, order: NeutralOrder): Promise<void> => {
    const entityId = await entityOf(ctx, order)
    // An order that names only its subscription waits for that subscription's own delivery.
    if (!entityId && order.subscriptionId && !await subscriptionOf(ctx, order.subscriptionId)) throw beforeItsSubscription()
    if (!entityId) {
      logBackend('warn', 'billing.commerce_unknown_entity', `A ${merchant} order named no billing entity the app knows; it was acknowledged and left out.`)
      return
    }
    if (await entityDeleting(ctx, entityId)) return
    await linkEntity(ctx, entityId, order.customerId)
    const productId = order.productId ?? (await subscriptionOf(ctx, order.subscriptionId))?.productId ?? null
    // A subscription's order that names no product waits for the subscription's own delivery too.
    if (!productId && order.subscriptionId) throw beforeItsSubscription()
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
    // A redelivered order grants again what an earlier attempt may not have: each grant lands once by its key.
    const product = productOf(productId)
    await grantOrder(ctx, entityId, order, product)
    await settleRecorded(ctx, entityId, order, product, recorded)
  }

  /**
   * The rest of a paid order's delivery once its grants landed: a refund or
   * a dispute that came before it, applied as it was recorded, takes them
   * back at once; then the plan is written again, and a first delivery
   * goes on the activity trail.
   */
  const settleRecorded = async (ctx: RunWriteCtx, entityId: string, order: NeutralOrder, product: CatalogProduct, recorded: boolean): Promise<void> => {
    const stored = await ctx.runQuery(refs.getOrder, { orderId: order.id })
    if (stored && reversed(stored)) await takeBack(ctx, stored)
    await refreshEntitlements(ctx, entityId)
    if (!recorded) return
    await recordEvent(ctx, entityId, { type: 'billing.order_paid', actor: null, targetId: order.id, data: { amount: order.amount, currency: order.currency, ...(product?.kind === 'plan' ? { interval: product.interval } : {}) } })
    if (stored?.refundedAmount) await recordEvent(ctx, entityId, { type: 'billing.order_refunded', actor: null, targetId: order.id, data: { amount: stored.refundedAmount, currency: order.currency } })
  }

  /**
   * A refunded or disputed order's credits taken back, as many as the
   * balance still holds: every grant it paid for, its own and a yearly
   * plan's months on a monthly cycle. Each closes once, so a second attempt
   * takes nothing twice.
   */
  const takeBack = async (ctx: RunWriteCtx, order: { entityId: string, orderId: string }): Promise<void> => {
    await ctx.runMutation(refs.revokeOrderGrants, { userId: order.entityId, orderId: order.orderId })
  }

  /**
   * Whether a refund or a dispute moves its order now: not while the
   * order's entity is being erased, nor before the order is recorded, when
   * it is held for the order to apply as it lands.
   */
  const movesNow = async (ctx: RunWriteCtx, orderId: string, reversal: { kind: 'refund' | 'dispute', refundId?: string, amount?: number }): Promise<boolean> => {
    const order = await ctx.runQuery(refs.getOrder, { orderId })
    if (order) return !await entityDeleting(ctx, order.entityId)
    return !await ctx.runMutation(refs.holdReversal, { orderId, ...reversal })
  }

  const onRefund = async (ctx: RunWriteCtx, event: Extract<NeutralBillingEvent, { type: 'order.refunded' }>): Promise<void> => {
    const { refund } = event
    // A refund pending or failed moves nothing: its `succeeded` delivery does.
    if (refund.status !== 'succeeded' || !refund.orderId) return
    if (!await movesNow(ctx, refund.orderId, { kind: 'refund', refundId: refund.id, ...(refund.amount === null ? {} : { amount: refund.amount }) })) return
    const counted = await ctx.runMutation(refs.refundOrder, { orderId: refund.orderId, refundId: refund.id, ...(refund.amount === null ? {} : { amount: refund.amount }) })
    if (!counted) return
    const { order } = counted
    // A whole refund takes the order's credits back; a partial one keeps them. A redelivery finishes a take-back that failed.
    if (order.status === 'refunded') await takeBack(ctx, order)
    await refreshEntitlements(ctx, order.entityId)
    if (counted.counted) await recordEvent(ctx, order.entityId, { type: 'billing.order_refunded', actor: null, targetId: order.orderId, data: { amount: refund.amount ?? order.amount, currency: refund.currency ?? order.currency } })
  }

  const onDispute = async (ctx: RunWriteCtx, orderId: string | null): Promise<void> => {
    if (!orderId || !await movesNow(ctx, orderId, { kind: 'dispute' })) return
    const order = await ctx.runMutation(refs.disputeOrder, { orderId })
    if (!order) return
    await takeBack(ctx, order)
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

  /** The entity's live subscriptions. */
  const liveSubscriptions = async (ctx: RunWriteCtx, entityId: string): Promise<SubscriptionRow[]> => {
    const all = await provider.listAllUserSubscriptions(ctx as unknown as ProviderCtx, { userId: entityId }) as SubscriptionRow[]
    return all.filter(subscription => subscription.endedAt == null && LIVE_STATUSES.has(subscription.status))
  }

  /** The month of credits one plan grants, with its key; `null` for none. */
  const monthOfPlan = (product: CatalogProduct) => {
    const credits = product?.kind === 'plan' ? product.plan.credits : undefined
    const units = credits && !credits.once ? planCreditUnits(credits, 'month') : 0
    return units && product ? { key: product.key, meter: credits!.meter, units, rollover: credits!.rollover ?? false } : null
  }

  /**
   * The plan credits a month of the cycle grants the entity, one per plan
   * by its key: each live yearly plan's on a monthly meter cycle, or the
   * free plan's while it holds no subscription. The provider's invoices
   * grant the rest.
   */
  const monthlyCredits = async (ctx: RunWriteCtx, entityId: string): Promise<Array<NonNullable<ReturnType<typeof monthOfPlan>> & { orderId?: string }>> => {
    const live = await liveSubscriptions(ctx, entityId)
    if (live.length === 0) {
      const free = context.catalogIds?.free ? monthOfPlan(productOf(context.freePlan?.productId)) : null
      return free ? [free] : []
    }
    const cycling = live.filter(subscription => monthlyCycleOf(productOf(subscription.productId)))
    if (cycling.length === 0) return []
    const { page: orders } = await ctx.runQuery(refs.listOrders, { entityId, paginationOpts: { numItems: 20, cursor: null } })
    return cycling.flatMap((subscription) => {
      const month = monthOfPlan(productOf(subscription.productId))
      // The order that paid for the period: the latest of the subscription's while the period holds it, none before it arrives.
      const start = periodStartOf(subscription, Date.now())
      const order = orders.find(order => order.subscriptionId === subscription.id && order.createdAt >= start - DAY_MS)
      // A period whose order was taken back whole grants no more months.
      if (!month || (order && reversed(order))) return []
      return [{ ...month, ...(order ? { orderId: order.orderId } : {}) }]
    })
  }

  /**
   * One month of the credit cycle the provider does not run, for one
   * entity: the free plan's allowance while it holds no subscription, a
   * yearly plan's monthly one on a monthly meter cycle, once per month by
   * its key. The next month is scheduled before the grants, so a run that
   * stops between them still has a successor; a run that grants nothing
   * new (a second chain for the same entity meets the same keys) takes its
   * successor back. Answers what the free plan's start answers: `started`
   * the first time, else `subscribed`.
   */
  const cycle = async (ctx: RunWriteCtx, entityId: string, first: () => Promise<void>): Promise<FreePlanStart> => {
    const isNew = (await ctx.runQuery(context.cache.getByUser, { userId: entityId })) === null
    await refreshEntitlements(ctx, entityId)
    if (isNew) await first()
    const months = await monthlyCredits(ctx, entityId)
    if (months.length > 0) {
      const now = Date.now()
      const { scheduler } = ctx as QueueCtx
      const successor = await scheduler.runAt(nextMonth(now), cycleReference, { entityId })
      const cycleStart = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1)
      const keyOf = (month: { key: string }) => `cycle:${entityId}:${month.key}:${monthOf(now)}`
      let granted = false
      for (const month of months) {
        const grant = await ctx.runMutation(refs.grantCredits, {
          userId: entityId,
          meterId: month.meter,
          amount: month.units,
          externalId: keyOf(month),
          source: 'plan',
          rollover: month.rollover,
          cycleStart,
          cycleEnd: nextMonth(now),
          // Each plan's month lapses the months before it, never another live plan's of this one.
          keep: months.map(keyOf),
          ...(month.orderId ? { orderId: month.orderId } : {}),
        })
        granted ||= grant.granted
      }
      if (!granted) await scheduler.cancel(successor)
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
