import { v } from 'convex/values'
import type { Doc } from './_generated/dataModel.js'
import { mutation, query } from './_generated/server.js'
import { vGift } from './schema.js'

/**
 * Gift purchases: one person pays for a credit pack that a recipient
 * (identified by email) claims. This module owns the `billingGifts`
 * lifecycle; the payments run at the app level in `setupBilling` (see
 * `src/convex/integrations/billing/gifts.ts`), which calls these functions
 * via `components.backend.gifts.*`.
 *
 * Lifecycle: `create` (the purchaser's checkout started, `pending`) →
 * `markPaid` (the purchase order is paid on the purchaser's own customer) →
 * `setDiscount` (the single-use claim discount is minted) → `startClaim`
 * (the recipient opened the $0 claim checkout) → `markClaimed` (that order is
 * paid, so the provider granted the pack to the recipient's customer). A
 * refund of the purchase before the claim ends it `refunded` instead.
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
    purchaserEntityId: row.purchaserEntityId,
    pack: row.pack,
    giftProductId: row.giftProductId,
    amount: row.amount,
    currency: row.currency,
    discountId: row.discountId,
    claimingEntityId: row.claimingEntityId,
    claimingUserId: row.claimingUserId,
    claimOrderId: row.claimOrderId,
    claimedByUserId: row.claimedByUserId,
    claimedEntityId: row.claimedEntityId,
    createdAt: row.createdAt,
    paidAt: row.paidAt,
    notifiedAt: row.notifiedAt,
    claimedAt: row.claimedAt,
    refundedAt: row.refundedAt,
  }
}

/**
 * How long a gift stays `pending` before it is dropped: a provider checkout
 * session expires well within it, so a pending gift this old was abandoned.
 */
const PENDING_TTL_MS = 24 * 60 * 60 * 1000
/** The most gifts one read returns: plenty for a person, and bounded. */
const READ_CAP = 100

/**
 * Record a gift when its purchaser's checkout starts (status `pending` until
 * the order is paid), dropping the purchaser's own abandoned ones on the way,
 * so pending rows never pile up.
 */
export const create = mutation({
  args: {
    recipientEmail: v.string(),
    purchaserUserId: v.string(),
    purchaserEntityId: v.optional(v.string()),
    purchaserName: v.optional(v.string()),
    pack: v.optional(v.string()),
    productIds: v.array(v.string()),
    giftProductId: v.optional(v.string()),
    message: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const abandoned = await ctx.db.query('billingGifts')
      .withIndex('purchaserUserId_createdAt', q => q.eq('purchaserUserId', args.purchaserUserId).lt('createdAt', Date.now() - PENDING_TTL_MS))
      .take(READ_CAP)
    for (const row of abandoned) {
      if (row.status === 'pending') await ctx.db.delete('billingGifts', row._id)
    }
    const id = await ctx.db.insert('billingGifts', {
      ...args,
      recipientEmail: args.recipientEmail.toLowerCase(),
      status: 'pending',
      createdAt: Date.now(),
    })
    return id as string
  },
})

/**
 * Mark a gift paid once the provider confirms its purchase order, with what
 * the order charged. Idempotent: only a pending gift is paid.
 */
export const markPaid = mutation({
  args: {
    giftId: v.id('billingGifts'),
    billingOrderId: v.optional(v.string()),
    amount: v.optional(v.number()),
    currency: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { giftId, ...paid }) => {
    const gift = await ctx.db.get('billingGifts', giftId)
    if (!gift || gift.status !== 'pending') return null
    await ctx.db.patch('billingGifts', giftId, { status: 'paid', paidAt: Date.now(), ...paid })
    return null
  },
})

/** Store the claim discount minted for a paid gift, once. Returns whether this call stored it. */
export const setDiscount = mutation({
  args: { giftId: v.id('billingGifts'), discountId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { giftId, discountId }) => {
    const gift = await ctx.db.get('billingGifts', giftId)
    if (!gift || gift.status !== 'paid' || gift.discountId !== undefined) return false
    await ctx.db.patch('billingGifts', giftId, { discountId })
    return true
  },
})

/**
 * Stamp the recipient-notification email as sent. The caller stamps only
 * after the send succeeded, so a failed send is retried on the next delivery
 * of `order.paid`, and skips the send once the stamp is there, so a replay
 * long after the email's own record is gone still emails nobody twice.
 * Returns whether this call set the stamp.
 */
export const markNotified = mutation({
  args: { giftId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { giftId }) => {
    const id = ctx.db.normalizeId('billingGifts', giftId)
    if (!id) return false
    const gift = await ctx.db.get('billingGifts', id)
    if (!gift || gift.notifiedAt !== undefined) return false
    await ctx.db.patch('billingGifts', gift._id, { notifiedAt: Date.now() })
    return true
  },
})

/**
 * Record the claim checkout the recipient opened: who, and for which
 * billing entity. A later claim of the same gift replaces it — the discount
 * is single-use, so only one claim order can ever be paid.
 */
export const startClaim = mutation({
  args: { giftId: v.id('billingGifts'), userId: v.string(), entityId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { giftId, userId, entityId }) => {
    const gift = await ctx.db.get('billingGifts', giftId)
    if (!gift || gift.status !== 'paid') return false
    await ctx.db.patch('billingGifts', giftId, { claimingUserId: userId, claimingEntityId: entityId })
    return true
  },
})

/** Mark a gift claimed once its $0 claim order is paid. Idempotent. */
export const markClaimed = mutation({
  args: { giftId: v.id('billingGifts'), userId: v.string(), entityId: v.string(), claimOrderId: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { giftId, userId, entityId, claimOrderId }) => {
    const gift = await ctx.db.get('billingGifts', giftId)
    if (!gift || gift.status !== 'paid') return null
    await ctx.db.patch('billingGifts', giftId, {
      status: 'claimed',
      claimedByUserId: userId,
      claimedEntityId: entityId,
      claimOrderId,
      claimedAt: Date.now(),
    })
    return null
  },
})

/** End an unclaimed gift whose purchase was refunded. Returns whether this call ended it. */
export const markRefunded = mutation({
  args: { giftId: v.id('billingGifts') },
  returns: v.boolean(),
  handler: async (ctx, { giftId }) => {
    const gift = await ctx.db.get('billingGifts', giftId)
    if (!gift || gift.status === 'claimed' || gift.status === 'refunded') return false
    await ctx.db.patch('billingGifts', giftId, { status: 'refunded', refundedAt: Date.now() })
    return true
  },
})

/**
 * Gifts addressed to an email (lowercased) that are its recipient's to see:
 * paid and claimed ones, or one `status` of them. Read through the status
 * index, newest first and bounded, so a pile of someone else's checkouts for
 * an address never reaches its recipient.
 */
export const listByEmail = query({
  args: { email: v.string(), status: v.optional(v.union(v.literal('paid'), v.literal('claimed'))) },
  returns: v.array(vGift),
  handler: async (ctx, { email, status }) => {
    const normalized = email.toLowerCase()
    const rows = []
    for (const each of status ? [status] : ['paid', 'claimed'] as const) {
      rows.push(...await ctx.db
        .query('billingGifts')
        .withIndex('recipientEmail_status', q => q.eq('recipientEmail', normalized).eq('status', each))
        .order('desc')
        .take(READ_CAP))
    }
    return rows.map(toWire)
  },
})

/**
 * How many gifts a purchaser bought since a moment — paid, claimed or
 * refunded — plus the checkouts still open since `pendingSince` (a checkout
 * that may yet be paid counts against the cap, an abandoned one does not),
 * and when the oldest of them was created: what the per-purchaser cap counts.
 * Pass `excludeGiftId` to leave out the gift being paid for.
 */
export const countBought = query({
  args: { purchaserUserId: v.string(), since: v.number(), pendingSince: v.number(), excludeGiftId: v.optional(v.string()) },
  returns: v.object({ count: v.number(), oldest: v.union(v.number(), v.null()) }),
  handler: async (ctx, { purchaserUserId, since, pendingSince, excludeGiftId }) => {
    let count = 0
    let oldest: number | null = null
    const rows = ctx.db.query('billingGifts').withIndex('purchaserUserId_createdAt', q => q.eq('purchaserUserId', purchaserUserId).gte('createdAt', since))
    for await (const row of rows) {
      if (row._id === excludeGiftId || (row.status === 'pending' && row.createdAt < pendingSince)) continue
      count++
      oldest ??= row.createdAt
    }
    return { count, oldest }
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
 * The personal workspace of a user, the billing entity a gift is bought from
 * and claimed into by default: the workspace the sign-in hook made for them
 * (its slug starts `personal-<their id>`) that they still own, with no other
 * member. `null` when they have none.
 */
export const personalEntity = query({
  args: { userId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { userId }) => {
    const prefix = `personal-${userId.toLowerCase()}`
    for await (const member of ctx.db.query('member').withIndex('userId', q => q.eq('userId', userId))) {
      if (!member.role.split(',').some(role => role.trim() === 'owner')) continue
      const id = ctx.db.normalizeId('organization', member.organizationId)
      const workspace = id ? await ctx.db.get('organization', id) : null
      if (!workspace?.slug.startsWith(prefix)) continue
      // Personal only while its owner is its one member: one others joined is shared.
      const members = await ctx.db.query('member').withIndex('organizationId', q => q.eq('organizationId', member.organizationId)).take(2)
      if (members.length === 1) return member.organizationId
    }
    return null
  },
})
