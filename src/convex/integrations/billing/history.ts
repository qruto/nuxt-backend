import { eventsList } from '@polar-sh/sdk/funcs/eventsList.js'
import { ordersGenerateInvoice } from '@polar-sh/sdk/funcs/ordersGenerateInvoice.js'
import { ordersGet } from '@polar-sh/sdk/funcs/ordersGet.js'
import { ordersInvoice } from '@polar-sh/sdk/funcs/ordersInvoice.js'
import { ordersList } from '@polar-sh/sdk/funcs/ordersList.js'
import { refundsCreate } from '@polar-sh/sdk/funcs/refundsCreate.js'
import { type BillingContext, resolveLimit, resolvePage } from './context.js'
import type { ProviderCtx } from './types/base.js'
import type { BillingOrder, UsageEvent } from './types/options.js'
import type { CreditMeterConfig } from './types/records.js'
import type { Billing } from './types/surface.js'
import { backendError } from '../../errors.js'

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

/** Orders, invoices, usage and refunds: live provider reads — no local ledger. */
export function createHistory({
  accessToken,
  creditMeters,
  provider,
  requireEntity,
  resolveMeter,
  requireProviderAccess,
  unwrapProvider,
  throttle,
  requireAdmin,
}: BillingContext) {
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
    if (!accessToken) return null
    const { userId } = await requireEntity(ctx)
    await throttle(ctx, userId, 'order reads')
    const customer = await provider.getCustomerByUserId(ctx as unknown as ProviderCtx, userId)
    // No provider customer yet = nothing has ever been charged. An empty page
    // is the honest answer; `null` is reserved for "billing isn't configured".
    if (!customer) return { items: [], pagination: { totalCount: 0, maxPage: 0 } }
    const page = resolvePage(options)
    const result = await ordersList(provider.polar, {
      customerId: customer.id,
      page,
      limit: resolveLimit(options.limit),
      sorting: ['-created_at'],
    })
    const { items, pagination } = unwrapProvider(result, 'order read').result
    return {
      items: items.map(order => toConvexValue(order) as unknown as BillingOrder),
      pagination,
      ...(page < pagination.maxPage ? { nextCursor: String(page + 1) } : {}),
    }
  }

  const getInvoiceUrl: Billing['getInvoiceUrl'] = async (ctx, orderId) => {
    if (!accessToken) return null
    const { userId } = await requireEntity(ctx)
    await throttle(ctx, userId, 'invoice reads')
    const customer = await provider.getCustomerByUserId(ctx as unknown as ProviderCtx, userId)
    const notOwner = () => backendError('forbidden', { reason: 'not_owner' }, '[nuxt-backend] getInvoiceUrl: that order is not on this billing account.')
    const found = await ordersGet(provider.polar, { id: orderId })
    // An order that does not exist refuses like someone else's, so the answer
    // never tells a caller which order ids are real.
    if (!found.ok && (found.error as { statusCode?: unknown } | null)?.statusCode === 404) throw notOwner()
    const order = unwrapProvider(found, 'invoice read')
    // Ownership is the authorization: the order id is guessable-ish and the
    // invoice carries a name and address, so it never leaves its own account.
    if (!customer || order.customerId !== customer.id) throw notOwner()
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
    if (!accessToken) return null
    const { userId } = await requireEntity(ctx)
    await throttle(ctx, userId, 'usage reads')
    const customer = await provider.getCustomerByUserId(ctx as unknown as ProviderCtx, userId)
    // No provider customer = nothing was ever metered. An empty page is the
    // honest answer; `null` is reserved for "billing isn't configured".
    if (!customer) return { items: [], pagination: { totalCount: 0, maxPage: 0 } }
    // A friendly meter name resolves to its id; an unconfigured raw id passes
    // straight through, so an app can read a meter it never named.
    const meter = options.meter
      ? (creditMeters[options.meter] ? resolveMeter({ meter: options.meter }) : resolveMeter({ meterId: options.meter }))
      : null
    const page = resolvePage(options)
    const result = await eventsList(provider.polar, {
      customerId: customer.id,
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
    requireProviderAccess('refund')
    await requireAdmin(ctx, 'refundOrder')
    const order = unwrapProvider(await ordersGet(provider.polar, { id: options.orderId }), 'refund')
    // The provider requires an explicit amount; default to everything still
    // refundable rather than making every caller read the order first.
    const amount = options.amount ?? order.refundableAmount
    if (!(amount > 0)) {
      throw backendError('invalid_input', { field: 'amount' }, `[nuxt-backend] refundOrder: order ${options.orderId} has nothing left to refund.`)
    }
    const result = await refundsCreate(provider.polar, {
      orderId: options.orderId,
      reason: options.reason,
      amount,
      revokeBenefits: options.revokeBenefits,
      metadata: options.metadata,
    })
    const refund = unwrapProvider(result, 'refund')
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
