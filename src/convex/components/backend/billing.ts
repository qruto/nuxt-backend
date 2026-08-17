import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { vEntitlementBenefit, vEntitlementMeter } from './schema'

/**
 * How long an unsettled spend reservation stays effective. A flow that
 * crashed between `debit` and `settle`/`release` self-heals: its reservation
 * is pruned on the next touch and the balance re-syncs from the provider.
 */
const PENDING_SPEND_TTL_MS = 10 * 60 * 1000

type PendingSpend = { meterId: string, amount: number, externalId: string, at: number }

function activePendings(pendings: PendingSpend[] | undefined, now: number): PendingSpend[] {
  return (pendings ?? []).filter(pending => now - pending.at < PENDING_SPEND_TTL_MS)
}

/**
 * Reactive billing-entitlement cache served by the `backend` component itself
 * (the `billingEntitlements` table lives in this component's schema). Consumers
 * get feature-gating + credit balances out of the box without adding anything to
 * their own schema — the app-level `setupBilling` (see
 * `src/convex/integrations/billing.ts`) syncs Polar's customer state into this
 * cache and reads it back reactively.
 *
 * These are `public` component functions so the parent app can call them via
 * `components.backend.billing.*`. Component functions are only reachable through
 * the parent — never directly by browser clients — so a public cache mutation is
 * safe here (the same pattern as `email.send`).
 */

/** The current user's cached entitlement state, or `null` if never synced. */
export const getByUser = query({
  args: { userId: v.string() },
  returns: v.union(
    v.object({
      customerId: v.union(v.string(), v.null()),
      activeProductIds: v.array(v.string()),
      benefits: v.array(vEntitlementBenefit),
      meters: v.array(vEntitlementMeter),
    }),
    v.null(),
  ),
  handler: async (ctx, { userId }) => {
    const row = await ctx.db
      .query('billingEntitlements')
      .withIndex('userId', q => q.eq('userId', userId))
      .unique()
    if (!row) return null
    return {
      customerId: row.customerId ?? null,
      activeProductIds: row.activeProductIds,
      benefits: row.benefits,
      meters: row.meters,
    }
  },
})

/**
 * Upsert a user's entitlement cache (called after a Polar sync). Freshly
 * synced provider state does not know about in-flight local reservations, so
 * still-active `pendingSpends` are re-subtracted — otherwise a webhook-driven
 * refresh landing between `debit` and the event's ingestion would resurrect
 * balance that is being spent. Invariant: cache = last provider state − active
 * reservations.
 */
export const upsert = mutation({
  args: {
    userId: v.string(),
    customerId: v.optional(v.string()),
    activeProductIds: v.array(v.string()),
    benefits: v.array(vEntitlementBenefit),
    meters: v.array(vEntitlementMeter),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('billingEntitlements')
      .withIndex('userId', q => q.eq('userId', args.userId))
      .unique()
    const now = Date.now()
    const pending = activePendings(existing?.pendingSpends, now)
    const meters = args.meters.map((meter) => {
      const reserved = pending
        .filter(entry => entry.meterId === meter.meterId)
        .reduce((sum, entry) => sum + entry.amount, 0)
      if (reserved === 0) return meter
      return {
        ...meter,
        balance: meter.balance - reserved,
        consumedUnits: meter.consumedUnits + reserved,
      }
    })
    const doc = { ...args, meters, pendingSpends: pending, updatedAt: now }
    if (existing) await ctx.db.patch('billingEntitlements', existing._id, doc)
    else await ctx.db.insert('billingEntitlements', doc)
    return null
  },
})

/**
 * Atomically reserve credits against the cached balance (reserve → run →
 * settle). Convex mutations are serializable, so two concurrent spends of the
 * same entity serialize here — the second sees the decremented balance.
 * Re-reserving an already-pending `externalId` succeeds idempotently.
 *
 * `reason` distinguishes a genuinely insufficient balance from a cache that
 * has never synced (`no-row`) or lacks the meter (`no-meter`) — callers
 * refresh-and-retry those instead of failing the spend.
 */
export const debit = mutation({
  args: {
    userId: v.string(),
    meterId: v.string(),
    amount: v.number(),
    externalId: v.string(),
  },
  returns: v.object({
    ok: v.boolean(),
    balance: v.number(),
    reason: v.optional(v.union(v.literal('no-row'), v.literal('no-meter'), v.literal('insufficient'))),
  }),
  handler: async (ctx, { userId, meterId, amount, externalId }) => {
    const row = await ctx.db
      .query('billingEntitlements')
      .withIndex('userId', q => q.eq('userId', userId))
      .unique()
    if (!row) return { ok: false, balance: 0, reason: 'no-row' as const }
    const index = row.meters.findIndex(meter => meter.meterId === meterId)
    if (index === -1) return { ok: false, balance: 0, reason: 'no-meter' as const }
    const now = Date.now()
    const pending = activePendings(row.pendingSpends, now)
    if (pending.some(entry => entry.externalId === externalId)) {
      return { ok: true, balance: row.meters[index]!.balance }
    }
    const meter = row.meters[index]!
    if (meter.balance < amount) {
      return { ok: false, balance: meter.balance, reason: 'insufficient' as const }
    }
    const meters = [...row.meters]
    meters[index] = {
      ...meter,
      balance: meter.balance - amount,
      consumedUnits: meter.consumedUnits + amount,
    }
    await ctx.db.patch('billingEntitlements', row._id, {
      meters,
      pendingSpends: [...pending, { meterId, amount, externalId, at: now }],
      updatedAt: now,
    })
    return { ok: true, balance: meters[index]!.balance }
  },
})

/** Drop a reservation after its provider event ingested — balance stays spent. */
export const settle = mutation({
  args: { userId: v.string(), externalId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, externalId }) => {
    const row = await ctx.db
      .query('billingEntitlements')
      .withIndex('userId', q => q.eq('userId', userId))
      .unique()
    if (!row) return null
    const now = Date.now()
    const pending = activePendings(row.pendingSpends, now)
      .filter(entry => entry.externalId !== externalId)
    await ctx.db.patch('billingEntitlements', row._id, { pendingSpends: pending, updatedAt: now })
    return null
  },
})

/**
 * Undo a reservation whose flow failed before ingestion: re-credit the meter
 * and drop the entry. A failed run never consumes credits.
 */
export const release = mutation({
  args: { userId: v.string(), externalId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, externalId }) => {
    const row = await ctx.db
      .query('billingEntitlements')
      .withIndex('userId', q => q.eq('userId', userId))
      .unique()
    if (!row) return null
    const now = Date.now()
    const pending = activePendings(row.pendingSpends, now)
    const entry = pending.find(candidate => candidate.externalId === externalId)
    if (!entry) return null
    const meters = row.meters.map(meter => meter.meterId === entry.meterId
      ? {
          ...meter,
          balance: meter.balance + entry.amount,
          consumedUnits: Math.max(0, meter.consumedUnits - entry.amount),
        }
      : meter)
    await ctx.db.patch('billingEntitlements', row._id, {
      meters,
      pendingSpends: pending.filter(candidate => candidate.externalId !== externalId),
      updatedAt: now,
    })
    return null
  },
})

/**
 * Optimistically re-credit a meter after a refund event ingested (sum meters
 * only — see `refundCredits`). The next provider sync overwrites with truth.
 */
export const credit = mutation({
  args: { userId: v.string(), meterId: v.string(), amount: v.number() },
  returns: v.null(),
  handler: async (ctx, { userId, meterId, amount }) => {
    const row = await ctx.db
      .query('billingEntitlements')
      .withIndex('userId', q => q.eq('userId', userId))
      .unique()
    if (!row) return null
    const meters = row.meters.map(meter => meter.meterId === meterId
      ? {
          ...meter,
          balance: meter.balance + amount,
          consumedUnits: Math.max(0, meter.consumedUnits - amount),
        }
      : meter)
    await ctx.db.patch('billingEntitlements', row._id, { meters, updatedAt: Date.now() })
    return null
  },
})

/** Read the live-metadata snapshot for a set of benefits (feature gating join). */
export const getBenefitMetadata = query({
  args: { benefitIds: v.array(v.string()) },
  returns: v.array(v.object({
    benefitId: v.string(),
    metadata: v.record(v.string(), v.union(v.string(), v.number(), v.boolean())),
    updatedAt: v.number(),
  })),
  handler: async (ctx, { benefitIds }) => {
    const rows = await Promise.all(benefitIds.map(benefitId =>
      ctx.db
        .query('billingBenefitMetadata')
        .withIndex('benefitId', q => q.eq('benefitId', benefitId))
        .unique(),
    ))
    return rows
      .filter(row => row !== null)
      .map(row => ({ benefitId: row.benefitId, metadata: row.metadata, updatedAt: row.updatedAt }))
  },
})

/** Upsert benefit-metadata snapshots (post-sync, or from a benefit.updated webhook). */
export const upsertBenefitMetadata = mutation({
  args: {
    entries: v.array(v.object({
      benefitId: v.string(),
      metadata: v.record(v.string(), v.union(v.string(), v.number(), v.boolean())),
    })),
  },
  returns: v.null(),
  handler: async (ctx, { entries }) => {
    const now = Date.now()
    for (const entry of entries) {
      const existing = await ctx.db
        .query('billingBenefitMetadata')
        .withIndex('benefitId', q => q.eq('benefitId', entry.benefitId))
        .unique()
      if (existing) await ctx.db.patch('billingBenefitMetadata', existing._id, { metadata: entry.metadata, updatedAt: now })
      else await ctx.db.insert('billingBenefitMetadata', { ...entry, updatedAt: now })
    }
    return null
  },
})

/**
 * Wipe the entitlement cache — derived data that resyncs from the billing
 * provider, so this is safe for test/dev resets (`pnpm run db:reset`) and never
 * loses source truth.
 */
export const clear = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    for await (const row of ctx.db.query('billingEntitlements')) {
      await ctx.db.delete('billingEntitlements', row._id)
    }
    return null
  },
})

/** Resolve a billing-provider customer id back to its auth user id (used by webhooks). */
export const userByCustomer = query({
  args: { customerId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { customerId }) => {
    const row = await ctx.db
      .query('billingEntitlements')
      .withIndex('customerId', q => q.eq('customerId', customerId))
      .first()
    return row?.userId ?? null
  },
})
