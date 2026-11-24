import { backendError } from '../../errors.js'
import { commerceCall, polarOnly } from './commerce.js'
import { ADMIN_WRITE, BILLING_ACCESS, type BillingContext, resolveLimit } from './context.js'
import type { BillingOrder } from './types/options.js'
import type { Billing } from './types/surface.js'

// The order history, the invoices and the refunds of adapter mode
// (commerce.ts): the orders from the app's ledger, which the provider's
// paid-order deliveries fill, and the invoice and the refund through the
// adapter. The provider, the merchant of record, issues the invoice and
// keeps the tax; usage history is Polar's (its events API) for now.

/** A ledger order as `getOrders` lists one, in the shape `<BillingHistory>` reads. */
function orderOf(order: { orderId: string, createdAt: number, status: string, amount: number, currency: string, productId?: string, subscriptionId?: string, taxAmount?: number, refundedAmount: number }): BillingOrder {
  return {
    id: order.orderId,
    createdAt: new Date(order.createdAt).toISOString(),
    status: order.status,
    totalAmount: order.amount,
    currency: order.currency,
    paid: true,
    // The provider numbers its invoices; the ledger keeps none.
    invoiceNumber: null,
    isInvoiceGenerated: true,
    refundedAmount: order.refundedAmount,
    ...(order.taxAmount === undefined ? {} : { taxAmount: order.taxAmount }),
    productId: order.productId ?? null,
    subscriptionId: order.subscriptionId ?? null,
  }
}

/** The history of one `setupBilling` call in adapter mode, in the shape {@link createHistory} returns. */
export function createCommerceHistory({ commerce, accessToken, requireEntity, requireAdmin, requireProviderAccess, throttle, recordEvent }: BillingContext) {
  const mode = commerce!

  const getOrders: Billing['getOrders'] = async (ctx, options = {}) => {
    const { userId } = await requireEntity(ctx, BILLING_ACCESS.records)
    if (!accessToken) return null
    await throttle(ctx, userId, 'order reads')
    // The ledger pages by its own cursor, opaque at the boundary like the provider's page number.
    const read = await ctx.runQuery(mode.refs.listOrders, { entityId: userId, paginationOpts: { cursor: options.cursor ?? null, numItems: resolveLimit(options.limit) } })
    const items = read.page.map(orderOf)
    return {
      items,
      // The ledger counts no total: what this page holds, and one more page while there is one.
      pagination: { totalCount: items.length, maxPage: read.isDone ? 1 : 2 },
      ...(read.isDone ? {} : { nextCursor: read.continueCursor }),
    }
  }

  /** The order, when it is the entity's own; refused like someone else's when it is not there. */
  const ownOrder = async (ctx: Parameters<Billing['getInvoiceUrl']>[0], userId: string, orderId: string) => {
    const order = await ctx.runQuery(mode.refs.getOrder, { orderId })
    if (order?.entityId === userId) return order
    throw backendError('forbidden', { reason: 'not_owner' }, '[nuxt-backend] getInvoiceUrl: that order is not on this billing account.')
  }

  const getInvoiceUrl: Billing['getInvoiceUrl'] = async (ctx, orderId) => {
    const { userId } = await requireEntity(ctx, BILLING_ACCESS.records)
    if (!accessToken) return null
    await throttle(ctx, userId, 'invoice reads')
    await ownOrder(ctx, userId, orderId)
    const invoice = await commerceCall('invoice read', () => mode.client().invoice(orderId))
    if (invoice.kind === 'url') return { url: invoice.url }
    // A provider that answers the PDF itself (Dodo): kept in file storage, for a URL to it.
    const storage = (ctx as { storage?: { store: (blob: Blob) => Promise<string>, getUrl: (id: string) => Promise<string | null> } }).storage
    if (!storage) throw polarOnly(mode.name, 'an invoice PDF outside an action')
    const url = await storage.getUrl(await storage.store(new Blob([invoice.bytes], { type: 'application/pdf' })))
    return url ? { url } : null
  }

  const getUsageHistory: Billing['getUsageHistory'] = async (ctx) => {
    await requireEntity(ctx, BILLING_ACCESS.read)
    throw polarOnly(mode.name, 'usage history')
  }

  const refundOrder: Billing['refundOrder'] = async (ctx, options) => {
    await requireAdmin(ctx, 'refundOrder', ADMIN_WRITE)
    requireProviderAccess('refund')
    const order = await ctx.runQuery(mode.refs.getOrder, { orderId: options.orderId })
    if (!order) throw backendError('invalid_input', { field: 'orderId' }, `[nuxt-backend] refundOrder: order ${options.orderId} is not in the order ledger.`)
    const amount = options.amount ?? order.amount - order.refundedAmount
    if (!(amount > 0)) {
      throw backendError('invalid_input', { field: 'amount' }, `[nuxt-backend] refundOrder: order ${options.orderId} has nothing left to refund.`)
    }
    const refund = await commerceCall('refund', () => mode.client().refundOrder({
      orderId: order.orderId,
      ...(options.amount === undefined ? {} : { amount }),
      ...(options.reason ? { reason: String(options.reason) } : {}),
      idempotencyKey: `refund:${order.orderId}:${amount}:${order.refundedAmount}`,
    }))
    // The refund's delivery counts it on the ledger and takes the credits back.
    await recordEvent(ctx, order.entityId, {
      type: 'billing.refund_issued',
      targetId: order.orderId,
      data: { reason: String(options.reason ?? 'customer_request'), ...(options.amount === undefined ? {} : { amount }) },
    })
    return {
      id: refund.id,
      orderId: refund.orderId ?? order.orderId,
      status: refund.status,
      reason: String(options.reason ?? 'customer_request'),
      amount: refund.amount ?? amount,
      currency: refund.currency ?? order.currency,
      revokeBenefits: true,
    }
  }

  return { getOrders, getInvoiceUrl, getUsageHistory, refundOrder }
}
