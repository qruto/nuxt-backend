import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

/**
 * Webhook delivery log — a capped ring buffer (never a source of truth):
 * every inbound delivery on `/billing/events` and `/email/events` records one
 * row with its outcome, which powers redelivery dedupe (`find`), the doctor's
 * "last webhook received", the DevTools feed, and the playground's webhook
 * page. Rows are pruned oldest-first past {@link RING_CAP}.
 */

const RING_CAP = 200

export const vDeliveryOutcome = v.union(
  v.literal('ok'),
  v.literal('invalid_signature'),
  v.literal('unknown_type'),
  v.literal('handler_error'),
  v.literal('duplicate'),
  v.literal('oversized'),
  v.literal('missing_secret'),
)

export const record = mutation({
  args: {
    service: v.string(),
    deliveryId: v.string(),
    type: v.optional(v.string()),
    outcome: vDeliveryOutcome,
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert('webhookDeliveries', {
      ...args,
      note: args.note?.slice(0, 500),
      receivedAt: Date.now(),
    })
    // Amortized ring trim: delete oldest overflow (usually 0 or 1 rows).
    const excess = await ctx.db
      .query('webhookDeliveries')
      .withIndex('receivedAt')
      .order('asc')
      .take(RING_CAP + 10)
    if (excess.length > RING_CAP) {
      for (const row of excess.slice(0, excess.length - RING_CAP)) {
        await ctx.db.delete('webhookDeliveries', row._id)
      }
    }
    return null
  },
})

/** Was this delivery id already fully processed? (Dedupe peek — `ok` only.) */
export const find = query({
  args: { service: v.string(), deliveryId: v.string() },
  returns: v.union(v.object({ outcome: vDeliveryOutcome, receivedAt: v.number() }), v.null()),
  handler: async (ctx, { service, deliveryId }) => {
    const rows = await ctx.db
      .query('webhookDeliveries')
      .withIndex('service_deliveryId', q => q.eq('service', service).eq('deliveryId', deliveryId))
      .collect()
    const ok = rows.find(row => row.outcome === 'ok')
    if (ok) return { outcome: ok.outcome, receivedAt: ok.receivedAt }
    const last = rows.at(-1)
    return last ? { outcome: last.outcome, receivedAt: last.receivedAt } : null
  },
})

/** Recent deliveries, newest first (the DevTools / playground feed). */
export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db
      .query('webhookDeliveries')
      .withIndex('receivedAt')
      .order('desc')
      .take(Math.min(limit ?? 50, RING_CAP))
    return rows.map(({ service, deliveryId, type, outcome, note, receivedAt }) =>
      ({ service, deliveryId, type, outcome, note, receivedAt }))
  },
})
