import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import type { Doc } from './_generated/dataModel.js'
import { type MutationCtx, mutation, query, type QueryCtx } from './_generated/server.js'
import { retierOwner } from './jobs.js'
import { commerceOrderFields, vCommerceOrderStatus, vEntitlementBenefit } from './schema.js'

/**
 * The records a billing provider on the neutral adapters (Stripe Managed
 * Payments, Dodo, Creem) leaves to the app: which customer each billing
 * entity is at the provider, the orders it paid, and its credit grants. On
 * Polar the provider keeps all three (its customers, orders and meters);
 * here no provider meter exists, so the entitlement cache's balance is the
 * record, and every grant lands once by its `externalId`.
 *
 * Public component functions, like the rest of the cache: only the parent
 * app reaches them, through `components.backend.commerce.*`.
 */

const vOrder = v.object({ ...commerceOrderFields, status: vCommerceOrderStatus, refundedAmount: v.number(), createdAt: v.number() })

/** An order's row by its id, or `null`. */
function orderRow(ctx: { db: QueryCtx['db'] }, orderId: string) {
  return ctx.db.query('billingCommerceOrders').withIndex('orderId', q => q.eq('orderId', orderId)).first()
}

/** An order row as the app reads it: without the refund ids and the system fields. */
function orderOf(row: Doc<'billingCommerceOrders'>): typeof vOrder.type {
  const { _id: _ignored, _creationTime: _time, refundIds: _refunds, ...order } = row
  return order
}

/** An order row as the app reads it, or `null` for none. */
function orderOrNull(row: Doc<'billingCommerceOrders'> | null): typeof vOrder.type | null {
  return row ? orderOf(row) : null
}

/** The entity's customer at `provider`, or `null`. */
export const customerOf = query({
  args: { entityId: v.string(), provider: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { entityId, provider }) =>
    (await ctx.db.query('billingCommerceCustomers').withIndex('entityId_provider', q => q.eq('entityId', entityId).eq('provider', provider)).first())?.customerId ?? null,
})

/** The entity a provider customer belongs to, or `null` for one no checkout of the app made. */
export const entityOfCustomer = query({
  args: { provider: v.string(), customerId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { provider, customerId }) =>
    (await ctx.db.query('billingCommerceCustomers').withIndex('provider_customerId', q => q.eq('provider', provider).eq('customerId', customerId)).first())?.entityId ?? null,
})

/**
 * Note the entity's customer at the provider, from a delivery that names
 * both. The latest one wins: a provider that made a second customer for a
 * checkout that named none is the one the portal opens next.
 */
export const linkCustomer = mutation({
  args: { entityId: v.string(), provider: v.string(), customerId: v.string() },
  returns: v.null(),
  handler: async (ctx, { entityId, provider, customerId }) => {
    const existing = await ctx.db.query('billingCommerceCustomers').withIndex('entityId_provider', q => q.eq('entityId', entityId).eq('provider', provider)).first()
    if (!existing) await ctx.db.insert('billingCommerceCustomers', { entityId, provider, customerId })
    else if (existing.customerId !== customerId) await ctx.db.patch('billingCommerceCustomers', existing._id, { customerId })
    return null
  },
})

/** Record a paid order once: `false` for one recorded before (a redelivery). */
export const recordOrder = mutation({
  args: commerceOrderFields,
  returns: v.boolean(),
  handler: async (ctx, order) => {
    const existing = await orderRow(ctx, order.orderId)
    if (existing) return false
    await ctx.db.insert('billingCommerceOrders', { ...order, status: 'paid', refundedAmount: 0, refundIds: [], createdAt: Date.now() })
    return true
  },
})

/** One order by its id, or `null`. */
export const getOrder = query({
  args: { orderId: v.string() },
  returns: v.union(vOrder, v.null()),
  handler: async (ctx, { orderId }) => orderOrNull(await orderRow(ctx, orderId)),
})

/** An entity's orders, newest first, a page at a time. */
export const listOrders = query({
  args: { entityId: v.string(), paginationOpts: paginationOptsValidator },
  returns: v.object({ page: v.array(vOrder), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, { entityId, paginationOpts }) => {
    const read = await ctx.db.query('billingCommerceOrders').withIndex('entityId_createdAt', q => q.eq('entityId', entityId)).order('desc').paginate(paginationOpts)
    return { page: read.page.map(orderOf), isDone: read.isDone, continueCursor: read.continueCursor }
  },
})

/**
 * Count a refund against its order, once per refund id. Answers the order
 * as it now stands and whether this refund was new; `null` for an order
 * the app never recorded.
 */
export const refundOrder = mutation({
  args: { orderId: v.string(), refundId: v.string(), amount: v.optional(v.number()) },
  returns: v.union(v.object({ order: vOrder, counted: v.boolean() }), v.null()),
  handler: async (ctx, { orderId, refundId, amount }) => {
    const row = await orderRow(ctx, orderId)
    if (!row) return null
    if (row.refundIds.includes(refundId)) return { order: orderOf(row), counted: false }
    // A refund that names no amount refunds what is left of the order.
    const refundedAmount = Math.min(row.amount, row.refundedAmount + (amount === undefined || !Number.isFinite(amount) ? row.amount : Math.max(0, amount)))
    const status = refundedAmount >= row.amount ? 'refunded' as const : 'partially_refunded' as const
    await ctx.db.patch('billingCommerceOrders', row._id, { refundedAmount, status, refundIds: [...row.refundIds, refundId] })
    return { order: { ...orderOf(row), refundedAmount, status }, counted: true }
  },
})

/** Mark an order disputed (a chargeback opened): `null` for one the app never recorded. */
export const disputeOrder = mutation({
  args: { orderId: v.string() },
  returns: v.union(vOrder, v.null()),
  handler: async (ctx, { orderId }) => {
    const row = await orderRow(ctx, orderId)
    if (!row) return null
    await ctx.db.patch('billingCommerceOrders', row._id, { status: 'disputed' })
    return { ...orderOf(row), status: 'disputed' as const }
  },
})

/** The entity's entitlement row, made empty when it has none: a grant needs a row to land on. */
async function entitlementRow(ctx: MutationCtx, userId: string): Promise<Doc<'billingEntitlements'>> {
  const row = await ctx.db.query('billingEntitlements').withIndex('userId', q => q.eq('userId', userId)).unique()
  if (row) return row
  const id = await ctx.db.insert('billingEntitlements', { userId, activeProductIds: [], benefits: [], meters: [], updatedAt: Date.now() })
  return (await ctx.db.get('billingEntitlements', id))!
}

/**
 * Write an entity's plan, its products and benefits, as the catalog grants
 * them, keeping its meters and reservations as they are: on an adapter
 * provider the balance is the record, never a provider's read, so `upsert`
 * (which takes the meters from the read) is not the call.
 */
export const setPlanState = mutation({
  args: {
    userId: v.string(),
    customerId: v.optional(v.string()),
    activeProductIds: v.array(v.string()),
    benefits: v.array(vEntitlementBenefit),
  },
  returns: v.null(),
  handler: async (ctx, { userId, customerId, activeProductIds, benefits }) => {
    const row = await entitlementRow(ctx, userId)
    await ctx.db.patch('billingEntitlements', row._id, { ...(customerId === undefined ? {} : { customerId }), activeProductIds, benefits, updatedAt: Date.now() })
    // A plan that changed moves the owner's waiting jobs up a tier, never down.
    await retierOwner(ctx, userId)
    return null
  },
})

/** What a plan grant that does not roll over still holds: its amount less what the meter consumed since. */
function remainingOf(grant: Doc<'billingCreditGrants'>, consumed: number): number {
  return Math.max(0, grant.amount - Math.max(0, consumed - grant.consumedAtGrant))
}

type MeterState = Doc<'billingEntitlements'>['meters'][number]

/** The fields of `values` that are set. */
function pick<T extends Record<string, unknown>>(values: T): Partial<T> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as Partial<T>
}

/**
 * Close the meter's open plan grants that do not roll over, each with what
 * is left of it, as far as the balance still holds it. Answers how many
 * credits lapsed.
 */
async function lapsePlanGrants(ctx: MutationCtx, userId: string, meter: MeterState): Promise<number> {
  let lapsed = 0
  const grants = ctx.db.query('billingCreditGrants').withIndex('userId_meterId', q => q.eq('userId', userId).eq('meterId', meter.meterId))
  for await (const grant of grants) {
    if (grant.source !== 'plan' || grant.rollover || grant.closed !== undefined) continue
    const closed = Math.min(remainingOf(grant, meter.consumedUnits), Math.max(0, meter.balance - lapsed))
    lapsed += closed
    await ctx.db.patch('billingCreditGrants', grant._id, { closed })
  }
  return lapsed
}

/**
 * Grant credits once per `externalId`, on a meter the row may not list yet.
 * A plan's grant (`source: 'plan'`) first lapses what is left of the
 * meter's earlier plan grants that do not roll over: a month's allowance
 * ends where the next begins, and what was spent since it landed came out
 * of it first. Answers whether the grant was new, and the balance.
 */
export const grantCredits = mutation({
  args: {
    userId: v.string(),
    meterId: v.string(),
    amount: v.number(),
    externalId: v.string(),
    source: v.union(v.literal('plan'), v.literal('pack'), v.literal('grant')),
    rollover: v.boolean(),
    cycleStart: v.optional(v.number()),
    cycleEnd: v.optional(v.number()),
  },
  returns: v.object({ granted: v.boolean(), balance: v.number() }),
  handler: async (ctx, { userId, meterId, amount, externalId, source, rollover, cycleStart, cycleEnd }) => {
    if (!Number.isFinite(amount) || amount <= 0) throw new Error(`[nuxt-backend] commerce.grantCredits: \`amount\` must be a finite number above zero (got ${amount}).`)
    const row = await entitlementRow(ctx, userId)
    const index = row.meters.findIndex(meter => meter.meterId === meterId)
    const meter = index === -1 ? { meterId, consumedUnits: 0, creditedUnits: 0, balance: 0 } : row.meters[index]!
    if (await ctx.db.query('billingCreditGrants').withIndex('externalId', q => q.eq('externalId', externalId)).first()) {
      return { granted: false, balance: meter.balance }
    }
    const lapsed = source === 'plan' ? await lapsePlanGrants(ctx, userId, meter) : 0
    const now = Date.now()
    await ctx.db.insert('billingCreditGrants', { userId, meterId, externalId, amount, source, rollover, consumedAtGrant: meter.consumedUnits, at: now })
    const next = {
      ...meter,
      balance: meter.balance - lapsed + amount,
      creditedUnits: meter.creditedUnits - lapsed + amount,
      ...(source === 'plan' ? { ...pick({ cycleStart, cycleEnd }), rollover } : {}),
    }
    const meters = index === -1 ? [...row.meters, next] : row.meters.map((entry, at) => at === index ? next : entry)
    await ctx.db.patch('billingEntitlements', row._id, { meters, updatedAt: now })
    return { granted: true, balance: next.balance }
  },
})

/**
 * Take a grant back, once: a refunded or disputed order's credits, as many
 * of them as the balance still holds (what was spent stays spent). Answers
 * how many left the balance; `0` for a grant never made or already closed.
 */
export const revokeGrant = mutation({
  args: { userId: v.string(), externalId: v.string() },
  returns: v.number(),
  handler: async (ctx, { userId, externalId }) => {
    const grant = await ctx.db.query('billingCreditGrants').withIndex('externalId', q => q.eq('externalId', externalId)).first()
    if (!grant || grant.userId !== userId || grant.closed !== undefined) return 0
    const row = await ctx.db.query('billingEntitlements').withIndex('userId', q => q.eq('userId', userId)).unique()
    const index = row ? row.meters.findIndex(meter => meter.meterId === grant.meterId) : -1
    const meter = index === -1 ? undefined : row!.meters[index]!
    const taken = meter ? Math.min(grant.amount, Math.max(0, meter.balance)) : 0
    await ctx.db.patch('billingCreditGrants', grant._id, { closed: taken })
    if (meter && taken > 0) {
      const meters = row!.meters.map((entry, at) => at === index ? { ...entry, balance: entry.balance - taken, creditedUnits: entry.creditedUnits - taken } : entry)
      await ctx.db.patch('billingEntitlements', row!._id, { meters, updatedAt: Date.now() })
    }
    return taken
  },
})

/** Whether a grant was made under `externalId`. */
export const hasGrant = query({
  args: { externalId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { externalId }) =>
    (await ctx.db.query('billingCreditGrants').withIndex('externalId', q => q.eq('externalId', externalId)).first()) !== null,
})

/**
 * Forget a billing entity's records here (an account's erasure): its
 * customers, orders and grants. The provider, the merchant of record,
 * keeps what tax law has it keep.
 */
export const forgetEntity = mutation({
  args: { entityId: v.string() },
  returns: v.null(),
  handler: async (ctx, { entityId }) => {
    for await (const row of ctx.db.query('billingCommerceCustomers').withIndex('entityId_provider', q => q.eq('entityId', entityId))) {
      await ctx.db.delete('billingCommerceCustomers', row._id)
    }
    for await (const row of ctx.db.query('billingCommerceOrders').withIndex('entityId_createdAt', q => q.eq('entityId', entityId))) {
      await ctx.db.delete('billingCommerceOrders', row._id)
    }
    for await (const row of ctx.db.query('billingCreditGrants').withIndex('userId_meterId', q => q.eq('userId', entityId))) {
      await ctx.db.delete('billingCreditGrants', row._id)
    }
    return null
  },
})
