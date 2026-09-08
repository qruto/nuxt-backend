import { v } from 'convex/values'
import { type MutationCtx, mutation, query } from './_generated/server.js'
import { vEntitlementBenefit, vEntitlementMeter } from './schema.js'

/**
 * How long an unsettled spend reservation stays effective. A flow that
 * crashed between `debit` and `settle`/`release` self-heals: its reservation
 * is pruned on the next touch and the balance re-syncs from the provider.
 */
const PENDING_SPEND_TTL_MS = 10 * 60 * 1000

type PendingSpend = {
  meterId: string
  amount: number
  externalId: string
  at: number
  releaseJobId?: string
}

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
 * refresh-and-retry those instead of failing the spend. `allowOverage` opts a
 * spend out of the balance guard entirely (see the arg).
 */
export const debit = mutation({
  args: {
    userId: v.string(),
    meterId: v.string(),
    amount: v.number(),
    externalId: v.string(),
    /**
     * Let the balance go negative instead of refusing the spend — the
     * pay-as-you-go case: a meter with no credit benefit has nothing prepaid
     * to draw down, so every unit is overage the provider invoices at the end
     * of the cycle. Off by default: credits stay strictly prepaid unless the
     * app opts a spend in.
     */
    allowOverage: v.optional(v.boolean()),
  },
  returns: v.object({
    ok: v.boolean(),
    balance: v.number(),
    reason: v.optional(v.union(v.literal('no-row'), v.literal('no-meter'), v.literal('insufficient'))),
  }),
  handler: async (ctx, { userId, meterId, amount, externalId, allowOverage }) => {
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
    if (meter.balance < amount && !allowOverage) {
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

/** What closing a reservation did to the meter — see {@link finalize}. */
type SettleOutcome = {
  settled: boolean
  released: number
  balance: number
  balanceBefore: number
  releaseJobId?: string
}

const NOTHING_SETTLED: SettleOutcome = { settled: false, released: 0, balance: 0, balanceBefore: 0 }

/**
 * Close a reservation at its final amount: drop the entry and hand back the
 * difference between what was reserved and what was actually spent.
 *
 * A token-priced call can only reserve an *estimate*, so the amount that
 * settles is usually lower than the amount that was debited. `finalAmount` is
 * clamped into `[0, reserved]` — settling MORE than was reserved would be a
 * second, unguarded debit, and the reservation is the only thing that made the
 * spend safe against a concurrent one.
 *
 * `balanceBefore` is what the balance would be *without* this spend (what is
 * left plus what this reservation still holds), so a caller can tell whether
 * the spend crossed a low-balance threshold — the crossing, not the level, is
 * what a notification hook fires on. Other in-flight reservations are not
 * added back: each spend's crossing is judged against the balance its own
 * siblings have already committed to.
 */
async function closeReservation(
  ctx: MutationCtx,
  userId: string,
  externalId: string,
  finalAmount?: number,
): Promise<SettleOutcome> {
  const row = await ctx.db
    .query('billingEntitlements')
    .withIndex('userId', q => q.eq('userId', userId))
    .unique()
  if (!row) return NOTHING_SETTLED
  const now = Date.now()
  const pending = activePendings(row.pendingSpends, now)
  const remaining = pending.filter(entry => entry.externalId !== externalId)
  const entry = pending.find(candidate => candidate.externalId === externalId)
  if (!entry) {
    // Already settled, released, or pruned past the TTL: nothing to unwind,
    // but the prune above is still worth persisting (settle always did).
    await ctx.db.patch('billingEntitlements', row._id, { pendingSpends: remaining, updatedAt: now })
    return NOTHING_SETTLED
  }
  const final = Math.min(Math.max(finalAmount ?? entry.amount, 0), entry.amount)
  const released = entry.amount - final
  const index = row.meters.findIndex(meter => meter.meterId === entry.meterId)
  const meter = index === -1 ? undefined : row.meters[index]!
  const meters = [...row.meters]
  if (meter && released !== 0) {
    meters[index] = {
      ...meter,
      balance: meter.balance + released,
      consumedUnits: Math.max(0, meter.consumedUnits - released),
    }
  }
  await ctx.db.patch('billingEntitlements', row._id, { meters, pendingSpends: remaining, updatedAt: now })
  const held = meter?.balance ?? 0
  return {
    settled: true,
    released,
    balance: held + released,
    balanceBefore: held + entry.amount,
    releaseJobId: entry.releaseJobId,
  }
}

/**
 * Drop a reservation after its provider event ingested — balance stays spent.
 * Pass `finalAmount` when the actual cost came in under the reserved estimate
 * and the remainder goes back to the balance in the same transaction.
 *
 * Returns nothing: this is the shape the app-side `settleSpend` calls, and its
 * declared reference (see `BillingComponents` in `integrations/billing.ts`)
 * types the return as `null`. {@link finalize} is the same operation for
 * callers that need the numbers back.
 */
export const settle = mutation({
  args: { userId: v.string(), externalId: v.string(), finalAmount: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, { userId, externalId, finalAmount }) => {
    await closeReservation(ctx, userId, externalId, finalAmount)
    return null
  },
})

/**
 * {@link settle}, reporting what it did: how much of the reservation went back
 * to the balance, where the balance landed, and the auto-release job the
 * caller can now cancel. `setupAi` settles through this one — it needs the
 * balance to fire the low-balance hook and the job id to cancel the abandoned
 * stream timer.
 */
export const finalize = mutation({
  args: { userId: v.string(), externalId: v.string(), finalAmount: v.optional(v.number()) },
  returns: v.object({
    /** `false` when there was nothing to settle (already closed, or pruned). */
    settled: v.boolean(),
    /** Reserved minus actual — credits handed back to the balance. */
    released: v.number(),
    /** The meter's balance after settling. */
    balance: v.number(),
    /** The meter's balance as of before this spend reserved. */
    balanceBefore: v.number(),
    /** The scheduled auto-release recorded by `attachReleaseJob`, if any. */
    releaseJobId: v.optional(v.string()),
  }),
  handler: async (ctx, { userId, externalId, finalAmount }) => {
    return closeReservation(ctx, userId, externalId, finalAmount)
  },
})

/**
 * Record the scheduled auto-release guarding a reservation, so settling it can
 * cancel the job. A no-op when the reservation is already gone — the job it
 * points at is itself a no-op then (see `release`).
 */
export const attachReleaseJob = mutation({
  args: { userId: v.string(), externalId: v.string(), jobId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, externalId, jobId }) => {
    const row = await ctx.db
      .query('billingEntitlements')
      .withIndex('userId', q => q.eq('userId', userId))
      .unique()
    if (!row) return null
    const now = Date.now()
    const pending = activePendings(row.pendingSpends, now)
    if (!pending.some(entry => entry.externalId === externalId)) return null
    await ctx.db.patch('billingEntitlements', row._id, {
      pendingSpends: pending.map(entry =>
        entry.externalId === externalId ? { ...entry, releaseJobId: jobId } : entry),
      updatedAt: now,
    })
    return null
  },
})

/**
 * Undo a reservation whose flow failed before ingestion: re-credit the meter
 * and drop the entry. A failed run never consumes credits.
 *
 * Also the target of the scheduled auto-release an abandoned stream leaves
 * behind ({@link attachReleaseJob}) — hence the deliberate no-op when the
 * reservation is already settled or released: whichever happens first wins.
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
 * Drop every in-flight spend reservation for one entity without re-crediting
 * the meters. Used after a refund: the provider's balance is already the
 * truth, and `upsert`'s re-subtraction of active reservations would push the
 * cache below it. The reserving flows self-heal — their `settle`/`release`
 * finds nothing, and the next sync is authoritative.
 */
export const clearPendingSpends = mutation({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const row = await ctx.db
      .query('billingEntitlements')
      .withIndex('userId', q => q.eq('userId', userId))
      .unique()
    if (!row) return null
    await ctx.db.patch('billingEntitlements', row._id, { pendingSpends: [], updatedAt: Date.now() })
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
 *
 * Reset plumbing, but a registered component function all the same: it stays
 * on the `nuxt-backend/component/billing` surface — the local-install
 * scaffold re-exports it — rather than carrying an internal tag that would
 * strip it from the published declarations.
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
