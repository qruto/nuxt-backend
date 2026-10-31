import { v } from 'convex/values'
import { mutation, type MutationCtx, query, type QueryCtx } from './_generated/server.js'

/**
 * Web push devices: the component's half of `setupNotifications`' push
 * channel. A row is one device a person allowed notifications on, as its
 * browser subscribed it: the push service's address for it and the keys a
 * message to it is encrypted with. A device belongs to the account that
 * subscribed it last, so a shared computer stops notifying the last person
 * once the next one subscribes it. Every function trusts its caller, the
 * app, which decides who may call it.
 */

/** The most devices one person keeps: the oldest goes when one more subscribes. */
export const PUSH_DEVICES_MAX = 20

const vDevice = v.object({ id: v.string(), endpoint: v.string(), p256dh: v.string(), auth: v.string() })

async function devicesOf(ctx: QueryCtx, userId: string) {
  return ctx.db.query('pushSubscriptions').withIndex('userId', q => q.eq('userId', userId)).take(PUSH_DEVICES_MAX + 1)
}

/**
 * Keep a device for a person: a new one, or one subscribed before (by
 * another account too) with its keys renewed. Past the most a person
 * keeps, their oldest device goes.
 */
export const subscribe = mutation({
  args: { userId: v.string(), endpoint: v.string(), p256dh: v.string(), auth: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, endpoint, p256dh, auth }) => {
    const at = Date.now()
    const existing = await ctx.db.query('pushSubscriptions').withIndex('endpoint', q => q.eq('endpoint', endpoint)).first()
    if (existing) await ctx.db.patch('pushSubscriptions', existing._id, { userId, p256dh, auth, at })
    else await ctx.db.insert('pushSubscriptions', { userId, endpoint, p256dh, auth, at })
    const devices = await devicesOf(ctx, userId)
    if (devices.length > PUSH_DEVICES_MAX) {
      const oldest = devices.reduce((first, device) => (device.at < first.at ? device : first))
      await ctx.db.delete('pushSubscriptions', oldest._id)
    }
    return null
  },
})

/** Forget one of a person's devices, by its push address; another account's is left alone. Whether one went. */
export const unsubscribe = mutation({
  args: { userId: v.string(), endpoint: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { userId, endpoint }) => {
    const existing = await ctx.db.query('pushSubscriptions').withIndex('endpoint', q => q.eq('endpoint', endpoint)).first()
    if (!existing || existing.userId !== userId) return false
    await ctx.db.delete('pushSubscriptions', existing._id)
    return true
  },
})

/** Whether a push address is one of a person's devices: `usePushSubscription`'s `isSubscribed`. */
export const has = query({
  args: { userId: v.string(), endpoint: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { userId, endpoint }) => (await ctx.db.query('pushSubscriptions').withIndex('endpoint', q => q.eq('endpoint', endpoint)).first())?.userId === userId,
})

/** A person's devices, as a delivery sends to them. */
export const devices = query({
  args: { userId: v.string() },
  returns: v.array(vDevice),
  handler: async (ctx, { userId }) => (await devicesOf(ctx, userId)).slice(0, PUSH_DEVICES_MAX)
    .map(({ _id, endpoint, p256dh, auth }) => ({ id: _id as string, endpoint, p256dh, auth })),
})

/** Drop a device its push service said is gone (`404`, `410`). */
export const drop = mutation({
  args: { id: v.string() },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const row = ctx.db.normalizeId('pushSubscriptions', id)
    if (row && await ctx.db.get('pushSubscriptions', row)) await ctx.db.delete('pushSubscriptions', row)
    return null
  },
})

/** An account's part of an erasure, one batch: its devices. Whether rows may be left. */
export async function erasePushSubscriptions(ctx: MutationCtx, userId: string | undefined, budget: number): Promise<boolean> {
  if (!userId) return false
  const rows = await ctx.db.query('pushSubscriptions').withIndex('userId', q => q.eq('userId', userId)).take(budget)
  for (const row of rows) await ctx.db.delete('pushSubscriptions', row._id)
  return rows.length >= budget
}

/** A person's devices for their export: the push service each one is reached through, and since when; never the address or the keys. */
export async function exportPushSubscriptions(ctx: QueryCtx, userId: string) {
  const rows = await devicesOf(ctx, userId)
  return { pushDevices: rows.map(row => ({ service: new URL(row.endpoint).host, at: row.at })) }
}
