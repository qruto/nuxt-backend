import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import type { Doc } from './_generated/dataModel.js'
import { type MutationCtx, mutation, query, type QueryCtx } from './_generated/server.js'
import { activePendings } from './billing.js'
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

/** Where an order stands with `amount` more refunded (all of what is left when it names none). */
function refunded(row: Pick<Doc<'billingCommerceOrders'>, 'amount' | 'refundedAmount'>, amount: number | undefined) {
  const refundedAmount = Math.min(row.amount, row.refundedAmount + (amount === undefined || !Number.isFinite(amount) ? row.amount : Math.max(0, amount)))
  return { refundedAmount, status: refundedAmount >= row.amount ? 'refunded' as const : 'partially_refunded' as const }
}

/**
 * Record a paid order once: `false` for one recorded before (a
 * redelivery). The refunds and the dispute held for it, which arrived
 * first, apply as it lands, in the order they came: a dispute keeps the
 * order disputed whatever is refunded with it, so its credits go back.
 */
export const recordOrder = mutation({
  args: commerceOrderFields,
  returns: v.boolean(),
  handler: async (ctx, order) => {
    const existing = await orderRow(ctx, order.orderId)
    if (existing) return false
    let row: Omit<Doc<'billingCommerceOrders'>, '_id' | '_creationTime'> = { ...order, status: 'paid', refundedAmount: 0, refundIds: [], createdAt: Date.now() }
    for await (const reversal of ctx.db.query('billingCommerceReversals').withIndex('orderId', q => q.eq('orderId', order.orderId))) {
      if (reversal.kind === 'dispute') row = { ...row, status: 'disputed' }
      else if (!row.refundIds.includes(reversal.refundId)) {
        const next = refunded(row, reversal.amount)
        row = { ...row, refundedAmount: next.refundedAmount, status: row.status === 'disputed' ? 'disputed' : next.status, refundIds: [...row.refundIds, reversal.refundId] }
      }
      await ctx.db.delete('billingCommerceReversals', reversal._id)
    }
    await ctx.db.insert('billingCommerceOrders', row)
    return true
  },
})

/**
 * Hold a refund or a dispute that names an order not recorded yet, for
 * the order to apply as it lands (`recordOrder`). Answers `false` when the
 * order is recorded by now: the caller moves it as it would any other.
 */
export const holdReversal = mutation({
  args: { orderId: v.string(), kind: v.union(v.literal('refund'), v.literal('dispute')), refundId: v.optional(v.string()), amount: v.optional(v.number()) },
  returns: v.boolean(),
  handler: async (ctx, { orderId, kind, refundId, amount }) => {
    if (await orderRow(ctx, orderId)) return false
    const id = kind === 'dispute' ? 'dispute' : refundId ?? 'refund'
    for await (const held of ctx.db.query('billingCommerceReversals').withIndex('orderId', q => q.eq('orderId', orderId))) {
      if (held.refundId === id) return true
    }
    await ctx.db.insert('billingCommerceReversals', { orderId, kind, refundId: id, ...(amount === undefined ? {} : { amount }), at: Date.now() })
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
    const { refundedAmount, status } = refunded(row, amount)
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

type MeterState = Doc<'billingEntitlements'>['meters'][number]

/** The fields of `values` that are set. */
function pick<T extends Record<string, unknown>>(values: T): Partial<T> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as Partial<T>
}

/** How many of a meter's latest plan grants a lapse reads: years of monthly grants. */
const PLAN_GRANTS_READ = 200

/**
 * Close the meter's open plan grants that do not roll over, each with what
 * is left of it, as far as the balance still holds it, but those `keep`
 * names. What the meter consumed is taken once, from the oldest grant open
 * at the time: each stretch between two grants' landings goes to the grants
 * landed by then, oldest first. A grant already closed took what it was
 * spent of before it closed, so the open ones are not charged for it again.
 * Answers how many credits lapsed.
 */
async function lapsePlanGrants(ctx: MutationCtx, userId: string, meter: MeterState, keep: readonly string[] = []): Promise<number> {
  // The meter's latest plan grants, oldest first, whatever packs landed between them: far more than the months any open grant shares.
  const plans: Array<Doc<'billingCreditGrants'>> = []
  const grants = ctx.db.query('billingCreditGrants').withIndex('userId_meterId', q => q.eq('userId', userId).eq('meterId', meter.meterId)).order('desc')
  for await (const grant of grants) {
    if (grant.source !== 'plan' || grant.rollover) continue
    plans.unshift(grant)
    if (plans.length === PLAN_GRANTS_READ) break
  }
  const left = plans.map(grant => grant.amount - (grant.closed ?? 0))
  plans.forEach((grant, landed) => {
    let stretch = Math.max(0, (plans[landed + 1]?.consumedAtGrant ?? meter.consumedUnits) - grant.consumedAtGrant)
    for (let at = 0; at <= landed && stretch > 0; at++) {
      const taken = Math.min(left[at]!, stretch)
      left[at]! -= taken
      stretch -= taken
    }
  })
  let lapsed = 0
  for (const [at, grant] of plans.entries()) {
    if (grant.closed !== undefined || keep.includes(grant.externalId)) continue
    const closed = Math.min(left[at]!, Math.max(0, meter.balance - lapsed))
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
 * of it first. `keep` names the grants that stay open: the monthly cycle's
 * other plans' of the same month. Answers whether the grant was new, and
 * the balance.
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
    keep: v.optional(v.array(v.string())),
    orderId: v.optional(v.string()),
    /**
     * A yearly plan's month: the subscription whose order pays for it, and
     * since when that order can have been recorded (its period's start).
     * Read in this same transaction, so a refund or an order landing
     * meanwhile is never missed; a period whose order was taken back whole
     * grants nothing.
     */
    paidBy: v.optional(v.object({ subscriptionId: v.string(), since: v.number() })),
  },
  returns: v.object({ granted: v.boolean(), balance: v.number() }),
  handler: async (ctx, { userId, meterId, amount, externalId, source, rollover, cycleStart, cycleEnd, keep, orderId, paidBy }) => {
    if (!Number.isFinite(amount) || amount <= 0) throw new Error(`[nuxt-backend] commerce.grantCredits: \`amount\` must be a finite number above zero (got ${amount}).`)
    const row = await entitlementRow(ctx, userId)
    const index = row.meters.findIndex(meter => meter.meterId === meterId)
    const meter = index === -1 ? { meterId, consumedUnits: 0, creditedUnits: 0, balance: 0 } : row.meters[index]!
    if (await ctx.db.query('billingCreditGrants').withIndex('externalId', q => q.eq('externalId', externalId)).first()) {
      return { granted: false, balance: meter.balance }
    }
    const paying = paidBy ? await payingOrder(ctx, paidBy) : orderId === undefined ? null : { orderId, status: 'paid' as const }
    if (paying && (paying.status === 'refunded' || paying.status === 'disputed')) return { granted: false, balance: meter.balance }
    const lapsed = source === 'plan' ? await lapsePlanGrants(ctx, userId, meter, keep) : 0
    const now = Date.now()
    await ctx.db.insert('billingCreditGrants', { userId, meterId, externalId, amount, source, rollover, consumedAtGrant: meter.consumedUnits, ...(paying ? { orderId: paying.orderId } : {}), at: now })
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
 * of them as the balance still holds, the meter's open reservations
 * counted in (what was spent stays spent). A reservation held when the
 * grant goes is reclaimed with it: released, it brings the balance back to
 * where the grant left it; settled, the meter stays short by that spend
 * until the next grant. Answers how many left the balance; `0` for a grant
 * never made or already closed.
 */
export const revokeGrant = mutation({
  args: { userId: v.string(), externalId: v.string() },
  returns: v.number(),
  handler: async (ctx, { userId, externalId }) => {
    const grant = await ctx.db.query('billingCreditGrants').withIndex('externalId', q => q.eq('externalId', externalId)).first()
    return grant && grant.userId === userId ? await revoke(ctx, grant) : 0
  },
})

/**
 * Take back every grant an order paid for, each once as `revokeGrant`
 * takes one: its own, and a yearly plan's months. Answers how many left
 * the balance.
 */
export const revokeOrderGrants = mutation({
  args: { userId: v.string(), orderId: v.string() },
  returns: v.number(),
  handler: async (ctx, { userId, orderId }) => {
    let taken = 0
    for (const grant of await ctx.db.query('billingCreditGrants').withIndex('userId_orderId', q => q.eq('userId', userId).eq('orderId', orderId)).collect()) {
      taken += await revoke(ctx, grant)
    }
    return taken
  },
})

/**
 * Tie the grants under `externalIds` that no order paid for yet to
 * `orderId`: a yearly plan's months the cycle granted before the order
 * that pays for them arrived.
 */
export const linkGrants = mutation({
  args: { userId: v.string(), orderId: v.string(), externalIds: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { userId, orderId, externalIds }) => {
    for (const externalId of externalIds) {
      const grant = await ctx.db.query('billingCreditGrants').withIndex('externalId', q => q.eq('externalId', externalId)).first()
      if (grant && grant.userId === userId && grant.orderId === undefined) await ctx.db.patch('billingCreditGrants', grant._id, { orderId })
    }
    return null
  },
})

/** The latest order of a subscription recorded since `since`: the one paying for its period, `null` before it arrives. */
function payingOrder(ctx: { db: QueryCtx['db'] }, { subscriptionId, since }: { subscriptionId: string, since: number }) {
  return ctx.db.query('billingCommerceOrders').withIndex('subscriptionId_createdAt', q => q.eq('subscriptionId', subscriptionId).gte('createdAt', since)).order('desc').first()
}

/** Close one grant, as many of its credits as the balance still holds: `0` for one already closed. */
async function revoke(ctx: MutationCtx, grant: Doc<'billingCreditGrants'>): Promise<number> {
  if (grant.closed !== undefined) return 0
  const row = await ctx.db.query('billingEntitlements').withIndex('userId', q => q.eq('userId', grant.userId)).unique()
  const index = row ? row.meters.findIndex(meter => meter.meterId === grant.meterId) : -1
  const meter = index === -1 ? undefined : row!.meters[index]!
  const held = activePendings(row?.pendingSpends, Date.now()).filter(entry => entry.meterId === grant.meterId).reduce((sum, entry) => sum + entry.amount, 0)
  // Of what open reservations hold, only as much as this grant still has unspent: settled spends since it landed came out of it first.
  const settledSince = Math.max(0, (meter?.consumedUnits ?? 0) - held - grant.consumedAtGrant)
  const heldOfIt = Math.min(held, Math.max(0, grant.amount - settledSince))
  const taken = meter ? Math.min(grant.amount, Math.max(0, meter.balance + heldOfIt)) : 0
  await ctx.db.patch('billingCreditGrants', grant._id, { closed: taken })
  if (meter && taken > 0) {
    const meters = row!.meters.map((entry, at) => at === index ? { ...entry, balance: entry.balance - taken, creditedUnits: entry.creditedUnits - taken } : entry)
    await ctx.db.patch('billingEntitlements', row!._id, { meters, updatedAt: Date.now() })
  }
  return taken
}

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
