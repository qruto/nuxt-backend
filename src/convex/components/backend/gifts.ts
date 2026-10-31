import type { FunctionHandle } from 'convex/server'
import { v } from 'convex/values'
import type { Doc } from './_generated/dataModel.js'
import { internalMutation, mutation, query, type QueryCtx } from './_generated/server.js'
import { vGift } from './schema.js'
import { keepWake } from './wake.js'

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
 * A gift is delivered when its notice goes out: at once, or on the date the
 * purchaser chose (`deliverAt`). Until `deliveredAt` is stamped the
 * recipient neither sees nor claims it, and the purchaser can still change
 * the date, the address, or cancel. A plan pass (`plan`, `months`) is a
 * gift too: its claim switches a free workspace to the pass and keeps the end
 * date here, where the sweep follows it.
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
    plan: row.plan,
    months: row.months,
    deliverAt: row.deliverAt,
    deliveredAt: row.deliveredAt,
    noticedAt: row.noticedAt,
    noticeCount: row.noticeCount,
    recipientChanges: row.recipientChanges,
    remindedAt: row.remindedAt,
    passSubscriptionId: row.passSubscriptionId,
    passStartedAt: row.passStartedAt,
    passEndsAt: row.passEndsAt,
    passReturnScheduledAt: row.passReturnScheduledAt,
    passNoticedAt: row.passNoticedAt,
    passEndedAt: row.passEndedAt,
    reverseTrial: row.reverseTrial,
  }
}

/**
 * Whether the recipient may see and claim a paid gift: its notice went out,
 * or it was paid before gifts had delivery dates (no date, no stamp).
 */
export function isDelivered(row: Pick<Doc<'billingGifts'>, 'deliveredAt' | 'deliverAt'>): boolean {
  return row.deliveredAt !== undefined || row.deliverAt === undefined
}

/**
 * How long a gift stays `pending` before it is dropped: a provider checkout
 * session expires well within it, so a pending gift this old was abandoned.
 */
const PENDING_TTL_MS = 24 * 60 * 60 * 1000
/** The most gifts one read returns: plenty for a person, and bounded. */
const READ_CAP = 100
const DAY_MS = 24 * 60 * 60 * 1000
/** A gift unclaimed this long after it was delivered gets its one reminder. */
export const REMINDER_AFTER_MS = 7 * DAY_MS
/** How long before a pass ends its workspace's managers are told. */
export const PASS_NOTICE_BEFORE_MS = 7 * DAY_MS

/** How long before a reverse trial ends its workspace is told: three days, of a trial a few weeks long. */
export const TRIAL_PASS_NOTICE_BEFORE_MS = 3 * DAY_MS
/** How many tasks one sweep hands the app: more are left for the next wake, which the app schedules. */
const SWEEP_BATCH = 50

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
    plan: v.optional(v.string()),
    months: v.optional(v.number()),
    deliverAt: v.optional(v.number()),
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
    const now = Date.now()
    // The date the purchaser chose, else now: delivered by the paying webhook or the sweep, never by a read.
    await ctx.db.patch('billingGifts', giftId, { status: 'paid', paidAt: now, deliverAt: gift.deliverAt ?? now, ...paid })
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

/** Whether the purchaser's cancellation holds the gift now: no claim starts meanwhile. */
const canceling = (gift: Doc<'billingGifts'>, now: number): boolean => gift.cancelingUntil !== undefined && gift.cancelingUntil > now

/** Whether a plan pass's claim holds the gift now, while it switches the workspace at the provider. */
const passClaiming = (gift: Doc<'billingGifts'>, now: number): boolean => gift.claimingUntil !== undefined && gift.claimingUntil > now

/**
 * Record the claim checkout the recipient opened: who, and for which
 * billing entity. A later claim of the same gift replaces it — the discount
 * is single-use, so only one claim order can ever be paid. Refused while
 * the purchaser's cancellation holds the gift.
 */
export const startClaim = mutation({
  args: { giftId: v.id('billingGifts'), userId: v.string(), entityId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { giftId, userId, entityId }) => {
    const gift = await ctx.db.get('billingGifts', giftId)
    if (!gift || gift.status !== 'paid' || canceling(gift, Date.now())) return false
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

/**
 * End an unclaimed gift whose purchase was refunded. Returns whether this
 * call ended it: not while a plan pass's claim holds it, which is left to
 * its claim.
 */
export const markRefunded = mutation({
  args: { giftId: v.id('billingGifts') },
  returns: v.boolean(),
  handler: async (ctx, { giftId }) => {
    const gift = await ctx.db.get('billingGifts', giftId)
    if (!gift || gift.status === 'claimed' || gift.status === 'refunded' || passClaiming(gift, Date.now())) return false
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
      rows.push(...(await ctx.db
        .query('billingGifts')
        .withIndex('recipientEmail_status', q => q.eq('recipientEmail', normalized).eq('status', each))
        .order('desc')
        .take(READ_CAP))
        // A gift dated for later is not the recipient's to see yet.
        .filter(isDelivered))
    }
    return rows.map(toWire)
  },
})

/**
 * The gifts a purchaser bought, newest first and bounded: every state past
 * the open checkout (`paid` splits into scheduled and delivered by the
 * caller, from `deliveredAt`).
 */
export const listByPurchaser = query({
  args: { purchaserUserId: v.string() },
  returns: v.array(vGift),
  handler: async (ctx, { purchaserUserId }) => {
    const rows = await ctx.db.query('billingGifts').withIndex('purchaserUserId_createdAt', q => q.eq('purchaserUserId', purchaserUserId)).order('desc').take(READ_CAP)
    return rows.filter(row => row.status !== 'pending').map(toWire)
  },
})

/**
 * How many gifts an address was sent since a moment: paid, claimed or
 * refunded ones, plus the checkouts still open since `pendingSince`.
 * What the per-address cap counts, so nobody can flood one inbox. Pass
 * `excludeGiftId` to leave out the gift being paid for.
 */
export const countToAddress = query({
  args: { email: v.string(), since: v.number(), pendingSince: v.number(), excludeGiftId: v.optional(v.string()) },
  returns: v.number(),
  handler: async (ctx, { email, since, pendingSince, excludeGiftId }) => {
    let count = 0
    const rows = ctx.db.query('billingGifts').withIndex('recipientEmail_createdAt', q => q.eq('recipientEmail', email.toLowerCase()).gte('createdAt', since))
    for await (const row of rows) {
      if (row._id === excludeGiftId || row.reverseTrial || (row.status === 'pending' && row.createdAt < pendingSince)) continue
      count++
    }
    return count
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

/**
 * A single gift by id, or `null`: for an id that is no gift's too, since
 * the id comes from a caller's arguments or an order's metadata, and a
 * malformed one refuses like a missing gift.
 */
export const get = query({
  args: { giftId: v.string() },
  returns: v.union(vGift, v.null()),
  handler: async (ctx, { giftId }) => {
    const id = ctx.db.normalizeId('billingGifts', giftId)
    const row = id ? await ctx.db.get('billingGifts', id) : null
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

// ── Delivery, notices and the purchaser's changes ───────────────────────

/** Stamp a paid gift delivered: the recipient may see and claim it from now on. Returns whether this call stamped it. */
export const markDelivered = mutation({
  args: { giftId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { giftId }) => {
    const id = ctx.db.normalizeId('billingGifts', giftId)
    const gift = id ? await ctx.db.get('billingGifts', id) : null
    if (!gift || gift.status !== 'paid' || gift.deliveredAt !== undefined) return false
    await ctx.db.patch('billingGifts', gift._id, { deliveredAt: Date.now() })
    return true
  },
})

/**
 * Count a notice that went out (the first, a reminder or a resend): when,
 * how many, and for a reminder that the one reminder is spent.
 */
export const noteNotice = mutation({
  args: { giftId: v.string(), reminder: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, { giftId, reminder }) => {
    const id = ctx.db.normalizeId('billingGifts', giftId)
    const gift = id ? await ctx.db.get('billingGifts', id) : null
    if (!gift) return null
    const now = Date.now()
    await ctx.db.patch('billingGifts', gift._id, { noticedAt: now, noticeCount: (gift.noticeCount ?? 0) + 1, ...(reminder ? { remindedAt: now } : {}) })
    return null
  },
})

/**
 * Address an unclaimed gift to someone else: the old address can no longer
 * claim it, the new one is told as a fresh gift (its notice and reminder
 * start over, under keys of their own). Refused once a claim started, and
 * while the purchaser's cancellation holds it. Returns whether it changed.
 */
export const setRecipient = mutation({
  args: { giftId: v.id('billingGifts'), recipientEmail: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { giftId, recipientEmail }) => {
    const gift = await ctx.db.get('billingGifts', giftId)
    if (!gift || gift.status !== 'paid' || gift.claimingUserId !== undefined || canceling(gift, Date.now())) return false
    await ctx.db.patch('billingGifts', giftId, {
      recipientEmail: recipientEmail.toLowerCase(),
      notifiedAt: undefined,
      noticedAt: undefined,
      noticeCount: undefined,
      remindedAt: undefined,
      recipientChanges: (gift.recipientChanges ?? 0) + 1,
    })
    return true
  },
})

/**
 * Hold a gift for its purchaser's cancellation until `until`, before any
 * money moves: refused (`false`) once its recipient started a claim, or
 * while another cancellation holds it. A claim can't start meanwhile.
 */
export const beginCancel = mutation({
  args: { giftId: v.id('billingGifts'), until: v.number() },
  returns: v.boolean(),
  handler: async (ctx, { giftId, until }) => {
    const gift = await ctx.db.get('billingGifts', giftId)
    if (!gift || gift.status !== 'paid' || gift.claimingUserId !== undefined || canceling(gift, Date.now())) return false
    await ctx.db.patch('billingGifts', giftId, { cancelingUntil: until })
    return true
  },
})

/** A mutation that lets go of a gift's hold, `cleared`, while `held` says the gift still has it. */
function releaseHold(held: (gift: Doc<'billingGifts'>) => boolean, cleared: Partial<Doc<'billingGifts'>>) {
  return mutation({
    args: { giftId: v.id('billingGifts') },
    returns: v.null(),
    handler: async (ctx, { giftId }) => {
      const gift = await ctx.db.get('billingGifts', giftId)
      if (gift && held(gift)) await ctx.db.patch('billingGifts', giftId, cleared)
      return null
    },
  })
}

/** Let go of a cancellation that stopped before the refund: the gift is claimable again. */
export const endCancel = releaseHold(gift => gift.cancelingUntil !== undefined, { cancelingUntil: undefined })

/** Move the delivery date of a gift not delivered yet. Returns whether it moved. */
export const setDeliverAt = mutation({
  args: { giftId: v.id('billingGifts'), deliverAt: v.number() },
  returns: v.boolean(),
  handler: async (ctx, { giftId, deliverAt }) => {
    const gift = await ctx.db.get('billingGifts', giftId)
    if (!gift || gift.status !== 'paid' || isDelivered(gift)) return false
    await ctx.db.patch('billingGifts', giftId, { deliverAt })
    return true
  },
})

// ── Plan passes ─────────────────────────────────────────────────────────

/** The pass a workspace holds, not ended: a claimed pack has no end date, so it is never one. */
async function runningPass(ctx: QueryCtx, entityId: string): Promise<Doc<'billingGifts'> | null> {
  return await ctx.db.query('billingGifts').withIndex('claimedEntityId_passEndedAt_passEndsAt', q => q.eq('claimedEntityId', entityId).eq('passEndedAt', undefined).gt('passEndsAt', 0)).first()
}

/** Whether a workspace holds a pass, or a plan pass's claim into it is on its way: it takes one at a time. */
async function passHeld(ctx: QueryCtx, entityId: string, now: number, giftId?: string): Promise<boolean> {
  if (await runningPass(ctx, entityId)) return true
  const claiming = await ctx.db.query('billingGifts').withIndex('claimingEntityId_claimingUntil', q => q.eq('claimingEntityId', entityId).gt('claimingUntil', now)).take(2)
  return claiming.some(row => row._id !== giftId)
}

/** What a running pass keeps from its start: who holds it, where, its subscription, its end and from when its return may be booked. */
function passStart({ userId, entityId, subscriptionId, endsAt, returnFrom }: { userId: string, entityId: string, subscriptionId: string, endsAt: number, returnFrom: number }, now: number) {
  return { claimedAt: now, claimedByUserId: userId, claimedEntityId: entityId, passSubscriptionId: subscriptionId, passStartedAt: now, passEndsAt: endsAt, passReturnFrom: returnFrom }
}

/**
 * Hold a plan pass for one claim into a workspace until `until`, before the
 * provider switches anything: `reserved`; `busy` while another claim or
 * the purchaser's cancellation holds it; `taken` when the workspace holds a
 * pass or another one is being claimed into it; `closed` for a gift that
 * is no longer paid and unclaimed.
 */
export const reservePass = mutation({
  args: { giftId: v.id('billingGifts'), userId: v.string(), entityId: v.string(), until: v.number() },
  returns: v.union(v.literal('reserved'), v.literal('busy'), v.literal('taken'), v.literal('closed')),
  handler: async (ctx, { giftId, userId, entityId, until }) => {
    const gift = await ctx.db.get('billingGifts', giftId)
    const now = Date.now()
    if (!gift || gift.status !== 'paid' || gift.plan === undefined) return 'closed'
    if (passClaiming(gift, now) || canceling(gift, now)) return 'busy'
    if (await passHeld(ctx, entityId, now, giftId)) return 'taken'
    await ctx.db.patch('billingGifts', giftId, { claimingUserId: userId, claimingEntityId: entityId, claimingUntil: until })
    return 'reserved'
  },
})

/**
 * Let go of a plan pass's claim that did not finish: the gift is its
 * recipient's to claim again. Only the claim the hold is still for lets go
 * (its holder and its `until`, as `reservePass` recorded them): one whose
 * hold lapsed, and that another claim took since, leaves that one's hold.
 */
export const releasePass = mutation({
  args: { giftId: v.id('billingGifts'), userId: v.string(), entityId: v.string(), until: v.number() },
  returns: v.null(),
  handler: async (ctx, { giftId, userId, entityId, until }) => {
    const gift = await ctx.db.get('billingGifts', giftId)
    if (gift?.status === 'paid' && gift.claimingUserId === userId && gift.claimingEntityId === entityId && gift.claimingUntil === until) {
      await ctx.db.patch('billingGifts', giftId, { claimingUserId: undefined, claimingEntityId: undefined, claimingUntil: undefined })
    }
    return null
  },
})

/**
 * Claim a plan pass: the recipient's workspace switched to the pass product,
 * for `months` months from now. The package keeps the end date, and from
 * when its return may be booked (`returnFrom`). Only the claim that holds
 * the gift (`reservePass`) records it. Returns whether this call claimed it.
 */
export const startPass = mutation({
  args: { giftId: v.id('billingGifts'), userId: v.string(), entityId: v.string(), subscriptionId: v.string(), endsAt: v.number(), returnFrom: v.number() },
  returns: v.boolean(),
  handler: async (ctx, { giftId, ...start }) => {
    const gift = await ctx.db.get('billingGifts', giftId)
    if (!gift || gift.status !== 'paid' || gift.plan === undefined || gift.claimingUserId !== start.userId || gift.claimingEntityId !== start.entityId) return false
    await ctx.db.patch('billingGifts', giftId, { status: 'claimed', claimingUntil: undefined, ...passStart(start, Date.now()) })
    return true
  },
})

/**
 * Start a reverse trial (LIFECYCLE): a new workspace's free subscription
 * switched to a plan's pass product until `endsAt`, recorded as a pass
 * nobody bought, so the gift sweep follows it like a gifted one. Refused
 * (`false`) when the address already started one, with plus tags and
 * dots taken out (`address`), or the workspace holds a pass.
 */
export const startTrialPass = mutation({
  args: { address: v.string(), userId: v.string(), entityId: v.string(), plan: v.string(), productId: v.string(), subscriptionId: v.string(), endsAt: v.number(), returnFrom: v.number() },
  returns: v.boolean(),
  handler: async (ctx, { address, plan, productId, ...start }) => {
    const before = await ctx.db.query('billingGifts').withIndex('recipientEmail_status', q => q.eq('recipientEmail', address).eq('status', 'trial')).first()
    if (before) return false
    const now = Date.now()
    if (await passHeld(ctx, start.entityId, now)) return false
    await ctx.db.insert('billingGifts', { recipientEmail: address, purchaserUserId: '', productIds: [productId], status: 'trial', plan, createdAt: now, ...passStart(start, now), reverseTrial: true })
    return true
  },
})

/**
 * Start a referral reward's pass (REF): a referrer on the free plan got free
 * months of a plan, recorded as a pass nobody bought so the gift sweep
 * follows it like a gifted one. Answers `false` when this referral's reward
 * was recorded already, or the workspace holds a pass.
 */
export const startRewardPass = mutation({
  args: { rewardId: v.string(), userId: v.string(), entityId: v.string(), plan: v.string(), months: v.number(), productId: v.string(), subscriptionId: v.string(), endsAt: v.number(), returnFrom: v.number() },
  returns: v.boolean(),
  handler: async (ctx, { rewardId, plan, months, productId, ...start }) => {
    if (await ctx.db.query('billingGifts').withIndex('rewardId', q => q.eq('rewardId', rewardId)).first()) return false
    const now = Date.now()
    if (await passHeld(ctx, start.entityId, now)) return false
    await ctx.db.insert('billingGifts', { recipientEmail: '', purchaserUserId: '', productIds: [productId], status: 'reward', plan, months, createdAt: now, ...passStart(start, now), rewardId })
    return true
  },
})

/** Whether an address (plus tags and dots taken out) already started a reverse trial. */
export const trialPassTaken = query({
  args: { address: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { address }) => Boolean(await ctx.db.query('billingGifts').withIndex('recipientEmail_status', q => q.eq('recipientEmail', address).eq('status', 'trial')).first()),
})

/**
 * Record what the sweep did for a pass: the return to the free plan
 * scheduled, the ending notice sent, or the pass over (also when the
 * workspace kept the plan by paying for it: the end date returns it nowhere).
 * Returns whether this call took the step, so a step two runs race to take
 * is taken, and recorded, once.
 */
export const notePass = mutation({
  args: { giftId: v.id('billingGifts'), step: v.union(v.literal('return_scheduled'), v.literal('noticed'), v.literal('ended')) },
  returns: v.boolean(),
  handler: async (ctx, { giftId, step }) => {
    const gift = await ctx.db.get('billingGifts', giftId)
    if (!gift || gift.passEndsAt === undefined) return false
    const now = Date.now()
    if (step === 'return_scheduled' && gift.passReturnScheduledAt === undefined) await ctx.db.patch('billingGifts', giftId, { passReturnScheduledAt: now })
    else if (step === 'noticed' && gift.passNoticedAt === undefined) await ctx.db.patch('billingGifts', giftId, { passNoticedAt: now })
    else if (step === 'ended' && gift.passEndedAt === undefined) await ctx.db.patch('billingGifts', giftId, { passEndedAt: now })
    else return false
    return true
  },
})

/** The pass a workspace holds now, if any: its plan, when it began and ends, and the referral it rewards when it is one's. */
export const activePass = query({
  args: { entityId: v.string() },
  returns: v.union(v.object({ id: v.string(), plan: v.string(), months: v.optional(v.number()), startedAt: v.number(), endsAt: v.number(), subscriptionId: v.optional(v.string()), trial: v.optional(v.literal(true)), rewardId: v.optional(v.string()) }), v.null()),
  handler: async (ctx, { entityId }) => {
    const gift = await runningPass(ctx, entityId)
    if (gift?.plan === undefined || gift.passEndsAt === undefined || gift.passStartedAt === undefined) return null
    return { id: gift._id as string, plan: gift.plan, months: gift.months, startedAt: gift.passStartedAt, endsAt: gift.passEndsAt, subscriptionId: gift.passSubscriptionId, ...(gift.reverseTrial ? { trial: true as const } : {}), ...(gift.rewardId ? { rewardId: gift.rewardId } : {}) }
  },
})

// ── The sweep ───────────────────────────────────────────────────────────

/** One thing the sweep found to do, for the app to carry out. */
const vTask = v.object({
  kind: v.union(v.literal('deliver'), v.literal('remind'), v.literal('schedule_return'), v.literal('end_pass'), v.literal('pass_notice')),
  giftId: v.string(),
})

type Task = { kind: 'deliver' | 'remind' | 'schedule_return' | 'end_pass' | 'pass_notice', giftId: string }

/** The ids of the paid gifts whose delivery is due: not delivered, dated for now or earlier. A gift paid before delivery dates (no date) counts. */
async function dueDeliveries(ctx: QueryCtx, now: number, limit: number): Promise<string[]> {
  const rows = await ctx.db.query('billingGifts').withIndex('status_deliveredAt_deliverAt', q => q.eq('status', 'paid').eq('deliveredAt', undefined).lte('deliverAt', now)).take(limit)
  return rows.map(row => row._id)
}

/** The ids of the delivered gifts still unclaimed a week later, that were never reminded. */
async function dueReminders(ctx: QueryCtx, now: number, limit: number): Promise<string[]> {
  const rows = await ctx.db.query('billingGifts').withIndex('status_remindedAt_deliveredAt', q => q.eq('status', 'paid').eq('remindedAt', undefined).gt('deliveredAt', 0).lte('deliveredAt', now - REMINDER_AFTER_MS)).take(limit)
  return rows.map(row => row._id)
}

/** The ids of the running passes whose end date came. */
async function dueEnds(ctx: QueryCtx, now: number, limit: number): Promise<string[]> {
  const rows = await ctx.db.query('billingGifts').withIndex('passEndedAt_passEndsAt', q => q.eq('passEndedAt', undefined).gt('passEndsAt', 0).lte('passEndsAt', now)).take(limit)
  return rows.map(row => row._id)
}

/** The ids of the running passes in their last billing cycle whose return is not booked yet (one past its end is ended instead). */
async function dueReturns(ctx: QueryCtx, now: number, limit: number): Promise<string[]> {
  const rows = await ctx.db.query('billingGifts').withIndex('passEndedAt_passReturnScheduledAt_passReturnFrom', q => q.eq('passEndedAt', undefined).eq('passReturnScheduledAt', undefined).gt('passReturnFrom', 0).lte('passReturnFrom', now)).take(limit)
  return rows.filter(row => row.passEndsAt !== undefined && row.passEndsAt > now).map(row => row._id)
}

/** The ids of the running passes whose workspace is to be told they end: a week before, three days for a reverse trial. */
async function dueNotices(ctx: QueryCtx, now: number, limit: number): Promise<string[]> {
  const read = (trial: true | undefined, before: number) => ctx.db.query('billingGifts')
    .withIndex('passEndedAt_passNoticedAt_reverseTrial_passEndsAt', q => q.eq('passEndedAt', undefined).eq('passNoticedAt', undefined).eq('reverseTrial', trial).gt('passEndsAt', now).lte('passEndsAt', now + before))
    .take(limit)
  return [...await read(undefined, PASS_NOTICE_BEFORE_MS), ...await read(true, TRIAL_PASS_NOTICE_BEFORE_MS)].map(row => row._id)
}

/**
 * What is due at `now`, bounded: each kind of step read from its own index
 * range, oldest first, and taken in turns, so steps of one kind that keep
 * failing never hold up the others.
 */
async function dueTasks(ctx: QueryCtx, now: number, limit: number): Promise<Task[]> {
  const kinds: Array<[Task['kind'], string[]]> = [
    ['end_pass', await dueEnds(ctx, now, limit)],
    ['schedule_return', await dueReturns(ctx, now, limit)],
    ['pass_notice', await dueNotices(ctx, now, limit)],
    ['deliver', await dueDeliveries(ctx, now, limit)],
    ['remind', await dueReminders(ctx, now, limit)],
  ]
  const tasks: Task[] = []
  for (let turn = 0; tasks.length < limit && kinds.some(([, ids]) => turn < ids.length); turn++) {
    for (const [kind, ids] of kinds) {
      if (turn < ids.length && tasks.length < limit) tasks.push({ kind, giftId: ids[turn]! })
    }
  }
  return tasks
}

/** The tasks the sweep hands the app when it wakes it, and whether more wait. */
export const due = query({
  args: { now: v.number(), limit: v.optional(v.number()) },
  returns: v.object({ tasks: v.array(vTask), more: v.boolean() }),
  handler: async (ctx, { now, limit }) => {
    const cap = Math.min(limit ?? SWEEP_BATCH, SWEEP_BATCH)
    const tasks = await dueTasks(ctx, now, cap + 1)
    return { tasks: tasks.slice(0, cap), more: tasks.length > cap }
  },
})

/** Keep the handle the component's sweep wakes the app by. Idempotent. */
export const registerSweep = mutation({
  args: { wake: v.string() },
  returns: v.null(),
  handler: async (ctx, { wake }) => {
    await keepWake(ctx, 'billingGiftSweep', wake)
    return null
  },
})

/**
 * The component's own sweep (crons.ts): wake the app when a delivery, a
 * reminder or a pass step is due. It reads and returns otherwise, and does
 * nothing in an app that never sold a gift.
 */
export const sweep = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const row = await ctx.db.query('billingGiftSweep').first()
    if (!row) return null
    if ((await dueTasks(ctx, Date.now(), 1)).length > 0) await ctx.scheduler.runAfter(0, row.wake as FunctionHandle<'action', { op: 'sweep' }>, { op: 'sweep' })
    return null
  },
})
