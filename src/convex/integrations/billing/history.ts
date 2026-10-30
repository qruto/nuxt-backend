import { eventsList } from '@polar-sh/sdk/funcs/eventsList.js'
import { ordersGenerateInvoice } from '@polar-sh/sdk/funcs/ordersGenerateInvoice.js'
import { ordersGet } from '@polar-sh/sdk/funcs/ordersGet.js'
import { ordersInvoice } from '@polar-sh/sdk/funcs/ordersInvoice.js'
import { ordersList } from '@polar-sh/sdk/funcs/ordersList.js'
import { refundsCreate } from '@polar-sh/sdk/funcs/refundsCreate.js'
import { ADMIN_WRITE, BILLING_ACCESS, type BillingContext, isProviderNotFound, resolveLimit, resolvePage } from './context.js'
import type { BillingCustomers } from './customers.js'
import type { ProviderCtx } from './types/base.js'
import type { BillingOrder, UsageEvent } from './types/options.js'
import type { CreditMeterConfig } from './types/records.js'
import type { Billing } from './types/surface.js'
import { backendError } from '../../errors.js'
import { logBackend } from '../../log.js'

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
 * Whether an order is a subscription's that charged nothing: a free plan's
 * cycle, a trial's start, or a cycle a full discount brought to nothing.
 * The history lists charges, so these are left out; a one-time order at $0
 * (a claimed gift) stays. The provider has no filter for them, so its
 * pages and counts include them.
 */
function isFreeCycle(order: { totalAmount?: number, billingReason?: string, subscriptionId?: string | null }): boolean {
  return order.totalAmount === 0 && order.subscriptionId != null && String(order.billingReason ?? '').startsWith('subscription')
}

/** Orders, invoices, usage and refunds: live provider reads — no local ledger. */
export function createHistory(
  {
    components,
    accessToken,
    creditMeters,
    provider,
    requireEntity,
    resolveMeter,
    requireProviderAccess,
    unwrapProvider,
    throttle,
    requireAdmin,
    recordEvent,
  }: BillingContext,
  { keyedCustomer }: Pick<BillingCustomers, 'keyedCustomer'>,
) {
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

  const getOrders: Billing['getOrders'] = async (ctx, options = {}) => {
    // Who is asking first: a signed-out caller is refused, configured or not.
    const { userId } = await requireEntity(ctx, BILLING_ACCESS.records)
    if (!accessToken) return null
    await throttle(ctx, userId, 'order reads')
    // No provider customer yet = nothing has ever been charged. An empty page
    // is the honest answer; `null` is reserved for "billing isn't configured".
    // The orders are read by the entity's id, so a customer from before 0.2
    // is keyed first, and one another entity holds shows nothing.
    if (!await keyedCustomer(ctx, userId, 'order read')) return { items: [], pagination: { totalCount: 0, maxPage: 0 } }
    const page = resolvePage(options)
    const result = await ordersList(provider.polar, {
      externalCustomerId: userId,
      page,
      limit: resolveLimit(options.limit),
      sorting: ['-created_at'],
    })
    const { items, pagination } = unwrapProvider(result, 'order read').result
    return {
      // A page may list fewer than `limit`, and `pagination` counts them: the provider's pages include the $0 cycles left out.
      items: items.filter(order => !isFreeCycle(order)).map(order => toConvexValue(order) as unknown as BillingOrder),
      pagination,
      ...(page < pagination.maxPage ? { nextCursor: String(page + 1) } : {}),
    }
  }

  const getInvoiceUrl: Billing['getInvoiceUrl'] = async (ctx, orderId) => {
    const { userId } = await requireEntity(ctx, BILLING_ACCESS.records)
    if (!accessToken) return null
    await throttle(ctx, userId, 'invoice reads')
    // The mapped customer vouches for an order only once it is keyed to this
    // entity: a mapping left over from the old email lookup can point at a
    // customer keyed to another entity, whose orders are not this one's.
    const customer = await keyedCustomer(ctx, userId, 'invoice read')
      ? await provider.getCustomerByUserId(ctx as unknown as ProviderCtx, userId)
      : null
    const notOwner = () => backendError('forbidden', { reason: 'not_owner' }, '[nuxt-backend] getInvoiceUrl: that order is not on this billing account.')
    const found = await ordersGet(provider.polar, { id: orderId })
    // An order that does not exist refuses like someone else's, so the answer
    // never tells a caller which order ids are real.
    if (!found.ok && isProviderNotFound(found.error)) throw notOwner()
    const order = unwrapProvider(found, 'invoice read')
    // Ownership is the authorization: the order id is guessable-ish and the
    // invoice carries a name and address, so it never leaves its own account.
    // The entity's own: keyed by its id, or on the customer the component maps it to.
    const own = order.customer?.externalId === userId || (customer != null && order.customerId === customer.id)
    if (!own) throw notOwner()
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
    const { userId } = await requireEntity(ctx, BILLING_ACCESS.read)
    if (!accessToken) return null
    await throttle(ctx, userId, 'usage reads')
    // No provider customer = nothing was ever metered. An empty page is the
    // honest answer; `null` is reserved for "billing isn't configured".
    // Read by the entity's id, as orders are: a customer from before 0.2 is keyed first.
    if (!await keyedCustomer(ctx, userId, 'usage read')) return { items: [], pagination: { totalCount: 0, maxPage: 0 } }
    // A friendly meter name resolves to its id; an unconfigured raw id passes
    // straight through, so an app can read a meter it never named.
    const meter = options.meter
      ? (creditMeters[options.meter] ? resolveMeter({ meter: options.meter }) : resolveMeter({ meterId: options.meter }))
      : null
    const page = resolvePage(options)
    const result = await eventsList(provider.polar, {
      externalCustomerId: userId,
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

  const refundOrder: Billing['refundOrder'] = async (ctx, options) => {
    // Who is asking first: an admin in person, the role read fresh.
    await requireAdmin(ctx, 'refundOrder', ADMIN_WRITE)
    requireProviderAccess('refund')
    const order = unwrapProvider(await ordersGet(provider.polar, { id: options.orderId }), 'refund')
    // The provider requires an explicit amount; default to everything still
    // refundable rather than making every caller read the order first.
    const amount = options.amount ?? order.refundableAmount
    if (!(amount > 0)) {
      throw backendError('invalid_input', { field: 'amount' }, `[nuxt-backend] refundOrder: order ${options.orderId} has nothing left to refund.`)
    }
    // A gift's purchase refunded after its claim takes the money back, not
    // the credits: the provider can't revoke what a $0 order granted.
    const giftId = order.metadata?.giftId
    if (typeof giftId === 'string' && order.metadata?.phase !== 'claim') {
      const gift = await ctx.runQuery(components.backend.gifts.get, { giftId })
      if (gift?.status === 'claimed') {
        logBackend('warn', 'billing.gift_refunded_after_claim', 'refundOrder is refunding a gift purchase its recipient already claimed; the credits stay with them.')
      }
    }
    const result = await refundsCreate(provider.polar, {
      orderId: options.orderId,
      reason: options.reason,
      amount,
      revokeBenefits: options.revokeBenefits,
      metadata: options.metadata,
    })
    const refund = unwrapProvider(result, 'refund')
    // The administrator acted, on the entity whose customer the order is.
    const entityId = order.customer?.externalId
    if (entityId) {
      await recordEvent(ctx, entityId, {
        type: 'billing.refund_issued',
        targetId: order.id,
        data: { reason: String(refund.reason), ...(options.amount === undefined ? {} : { amount: refund.amount }) },
      })
    }
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

  return { getOrders, getInvoiceUrl, getUsageHistory, refundOrder }
}

export type BillingHistory = ReturnType<typeof createHistory>
