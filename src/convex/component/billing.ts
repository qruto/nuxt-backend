import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { vEntitlementBenefit, vEntitlementMeter } from './schema'

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

/** Upsert a user's entitlement cache (called after a Polar sync). */
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
    const doc = { ...args, updatedAt: Date.now() }
    if (existing) await ctx.db.patch(existing._id, doc)
    else await ctx.db.insert('billingEntitlements', doc)
    return null
  },
})

/** Resolve a Polar customer id back to its auth user id (used by webhooks). */
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
