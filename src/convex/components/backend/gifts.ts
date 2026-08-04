import { v } from 'convex/values'
import type { Doc } from './_generated/dataModel'
import { mutation, query } from './_generated/server'
import { vGift } from './schema'

/**
 * Gift purchases: one user pays for products that a recipient (identified by
 * email) receives. This module owns the `billingGifts` lifecycle; the payment
 * itself and the entitlement attachment run at the app level in `setupBilling`
 * (see `src/convex/integrations/billing.ts`), which calls these functions via
 * `components.backend.gifts.*`.
 *
 * Lifecycle: `create` (checkout started, status `pending`) → `markPaid` (order
 * webhook) → `markClaimed` (entitlement attached to the recipient's billing
 * entity — automatically when the recipient already has an account, otherwise
 * on their first sign-in).
 *
 * These are `public` component functions, only reachable through the parent app
 * — never directly by browser clients (the same pattern as `billing.*`).
 */

function toWire(row: Doc<'billingGifts'>) {
  return {
    id: row._id as string,
    recipientEmail: row.recipientEmail,
    purchaserUserId: row.purchaserUserId,
    purchaserEmail: row.purchaserEmail,
    purchaserName: row.purchaserName,
    productIds: row.productIds,
    message: row.message,
    status: row.status,
    billingCustomerId: row.billingCustomerId,
    billingOrderId: row.billingOrderId,
    claimedByUserId: row.claimedByUserId,
    claimedEntityId: row.claimedEntityId,
    createdAt: row.createdAt,
    paidAt: row.paidAt,
    claimedAt: row.claimedAt,
  }
}

/** Record a gift at checkout time (status `pending` until the order webhook). */
export const create = mutation({
  args: {
    recipientEmail: v.string(),
    purchaserUserId: v.string(),
    purchaserEmail: v.optional(v.string()),
    purchaserName: v.optional(v.string()),
    productIds: v.array(v.string()),
    message: v.optional(v.string()),
    billingCustomerId: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const id = await ctx.db.insert('billingGifts', {
      ...args,
      recipientEmail: args.recipientEmail.toLowerCase(),
      status: 'pending',
      createdAt: Date.now(),
    })
    return id as string
  },
})

/** Mark a gift paid once the billing provider confirms the order. Idempotent. */
export const markPaid = mutation({
  args: { giftId: v.id('billingGifts'), billingOrderId: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { giftId, billingOrderId }) => {
    const gift = await ctx.db.get('billingGifts', giftId)
    if (!gift || gift.status !== 'pending') return null
    await ctx.db.patch('billingGifts', giftId, { status: 'paid', billingOrderId, paidAt: Date.now() })
    return null
  },
})

/** Mark a gift claimed after its entitlement attached to an entity. Idempotent. */
export const markClaimed = mutation({
  args: { giftId: v.id('billingGifts'), userId: v.string(), entityId: v.string() },
  returns: v.null(),
  handler: async (ctx, { giftId, userId, entityId }) => {
    const gift = await ctx.db.get('billingGifts', giftId)
    if (!gift || gift.status === 'claimed') return null
    await ctx.db.patch('billingGifts', giftId, {
      status: 'claimed',
      claimedByUserId: userId,
      claimedEntityId: entityId,
      claimedAt: Date.now(),
    })
    return null
  },
})

/** Gifts addressed to an email (lowercased), optionally filtered by status. */
export const listByEmail = query({
  args: { email: v.string(), status: v.optional(v.string()) },
  returns: v.array(vGift),
  handler: async (ctx, { email, status }) => {
    const normalized = email.toLowerCase()
    const rows = status
      ? await ctx.db
          .query('billingGifts')
          .withIndex('recipientEmail_status', q => q.eq('recipientEmail', normalized).eq('status', status))
          .collect()
      : await ctx.db
          .query('billingGifts')
          .withIndex('recipientEmail', q => q.eq('recipientEmail', normalized))
          .collect()
    return rows.map(toWire)
  },
})

/** A single gift by id, or `null`. */
export const get = query({
  args: { giftId: v.id('billingGifts') },
  returns: v.union(vGift, v.null()),
  handler: async (ctx, { giftId }) => {
    const row = await ctx.db.get('billingGifts', giftId)
    return row ? toWire(row) : null
  },
})

/**
 * Resolve a recipient email to an existing auth user and their first workspace
 * — direct index reads on this component's own auth tables (one benefit of the
 * all-in-one component). Used by the order webhook to attach a gift
 * automatically when the recipient already has an account.
 */
export const resolveRecipient = query({
  args: { email: v.string() },
  returns: v.union(
    v.object({ userId: v.string(), organizationId: v.union(v.string(), v.null()) }),
    v.null(),
  ),
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query('user')
      .withIndex('email_name', q => q.eq('email', email))
      .first()
    if (!user) return null
    const membership = await ctx.db
      .query('member')
      .withIndex('userId', q => q.eq('userId', user._id as string))
      .first()
    return { userId: user._id as string, organizationId: membership?.organizationId ?? null }
  },
})
