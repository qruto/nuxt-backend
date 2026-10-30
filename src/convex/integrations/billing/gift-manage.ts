import { ordersGet } from '@polar-sh/sdk/funcs/ordersGet.js'
import { refundsCreate } from '@polar-sh/sdk/funcs/refundsCreate.js'
import { actionGeneric, type Auth, type FunctionReference, internalActionGeneric, queryGeneric, type Scheduler } from 'convex/server'
import { v } from 'convex/values'
import { RECENT_SIGN_IN_SECONDS } from '../../constants.js'
import { UNDELIVERABLE_CAUSES, undeliverableReason } from '../../delivery.js'
import { backendError } from '../../errors.js'
import { logBackend } from '../../log.js'
import { normalizeEmail } from '../../tokens.js'
import { refuseStaleSignIn } from '../access.js'
import type { BillingContext } from './context.js'
import { GIFT_ACCESS, giftCaller } from './gift-access.js'
import { giftDeliverAt } from './gift-rules.js'
import type { BillingPasses } from './passes.js'
import type { RunQueryCtx, RunWriteCtx } from './types/base.js'
import type { GiftRecord } from './types/records.js'

// What a purchaser does with a gift they sent, until it is claimed (resend
// the notice, change the recipient, move the delivery date, cancel it and
// get the money back), the list of what they sent, and the sweep that
// delivers a gift on its date, sends its one reminder and follows its plan
// pass. The checks of a new gift (a valid address, never their own, the
// app's `canGift`, an address that can be written to) hold for a changed
// recipient too.

const HOUR_MS = 60 * 60 * 1000
/** A notice may be sent again this long after the last one. */
const RESEND_AFTER_MS = HOUR_MS
/** The most notices a gift ever sends: the first, the reminder and a few resends. */
const NOTICE_LIMIT = 6
/** How long a cancellation holds its gift: the refund at the provider, with room to spare. */
const CANCEL_HOLD_MS = 5 * 60 * 1000
/** How soon the sweep runs again when more was due than it took, and it got something done. */
const SWEEP_AGAIN_MS = 60 * 1000

/** What the sent list says of a gift. */
export type SentGiftStatus = 'scheduled' | 'delivered' | 'claimed' | 'refunded'

/** What the pieces of the gift flow hand the purchaser's actions. */
export interface GiftKit {
  passes: BillingPasses
  delivered: (gift: Pick<GiftRecord, 'deliveredAt' | 'deliverAt'>) => boolean
  deliver: (ctx: RunWriteCtx, gift: GiftRecord) => Promise<void>
  remind: (ctx: RunWriteCtx, gift: GiftRecord) => Promise<void>
  notifyRecipient: (ctx: RunWriteCtx, gift: GiftRecord, kind?: 'first' | 'reminder' | 'again') => Promise<boolean>
  askCanGift: (ctx: never, input: { recipientEmail: string, purchaserUserId: string, purchaserEntityId: string }) => Promise<void>
  requireAddressAllowance: (ctx: RunQueryCtx, recipientEmail: string) => Promise<void>
  voidDiscount: (discountId: string, operation: string) => Promise<void>
  discountRedeemed: (discountId: string) => Promise<boolean>
  recordGift: (ctx: RunWriteCtx, entityId: string | undefined, event: Parameters<BillingContext['recordEvent']>[2]) => Promise<void>
  schedulerOf: (ctx: RunWriteCtx) => Scheduler | undefined
  sweepReference: FunctionReference<'action', 'internal', { op?: 'sweep', giftId?: string }>
  registerSweep: (ctx: RunWriteCtx) => Promise<void>
}

/** A gift as the purchaser reads it in their sent list: never a billing id, nor the recipient's account. */
function sentOf(gift: GiftRecord, delivered: GiftKit['delivered']) {
  const status: SentGiftStatus = gift.status === 'refunded' ? 'refunded' : gift.status === 'claimed' ? 'claimed' : delivered(gift) ? 'delivered' : 'scheduled'
  return {
    id: gift.id,
    item: gift.plan ?? gift.pack ?? '',
    ...(gift.plan ? { plan: gift.plan, months: gift.months } : {}),
    recipientEmail: gift.recipientEmail,
    message: gift.message,
    status,
    createdAt: gift.createdAt,
    deliverAt: gift.deliverAt,
    paidAt: gift.paidAt,
    deliveredAt: gift.deliveredAt,
    claimedAt: gift.claimedAt,
  }
}

/** The purchaser's side of gifts, and the sweep. */
export function createGiftManagement(context: BillingContext, kit: GiftKit) {
  const { components, provider, account, requireProviderAccess, unwrapProvider, throttle } = context
  const gifts = components.backend.gifts

  /** The caller as the gift's purchaser, or the refusal; `stepUp` also asks for a recent sign-in, after the gift is known to be theirs. */
  const purchaserOf = async (ctx: RunQueryCtx & { auth: Auth }, what: string, giftId: string, stepUp = false) => {
    const caller = await giftCaller(ctx, what, GIFT_ACCESS.buy, account)
    const gift = await ctx.runQuery(gifts.get, { giftId })
    // A gift that does not exist refuses like someone else's.
    if (!gift || gift.purchaserUserId !== caller.userId) {
      throw backendError('forbidden', { reason: 'not_owner' }, `[nuxt-backend] ${what}: this gift was not sent by you.`)
    }
    if (stepUp) refuseStaleSignIn(caller.claims, RECENT_SIGN_IN_SECONDS, what)
    return { caller, gift }
  }

  /** Refuse a gift that is over: refunded, or already claimed. */
  const requireOpen = (gift: GiftRecord, what: string): void => {
    if (gift.status === 'refunded') throw backendError('forbidden', { reason: 'gift_refunded' }, `[nuxt-backend] ${what}: this gift was refunded.`)
    if (gift.status === 'claimed') throw backendError('forbidden', { reason: 'gift_claimed' }, `[nuxt-backend] ${what}: this gift was claimed, so it can't be changed.`)
    if (gift.status !== 'paid') throw backendError('not_ready', { reason: 'not_paid' }, `[nuxt-backend] ${what}: this gift is not paid for yet.`)
  }

  /** Refuse a gift whose recipient has started a claim: a claim checkout is open, or its discount is redeemed, so the gift is theirs. */
  const requireUnstarted = async (gift: GiftRecord, what: string): Promise<void> => {
    if (gift.claimingUserId !== undefined || (gift.discountId && await kit.discountRedeemed(gift.discountId))) {
      throw backendError('forbidden', { reason: 'gift_claimed' }, `[nuxt-backend] ${what}: this gift is being claimed, so it can't be changed.`)
    }
  }

  /** The error a notice that cannot go out is: the purchaser asked for it, so they hear. */
  const requireDeliverable = (email: string, what: string): void => {
    const unsendable = undeliverableReason(email)
    if (!unsendable) return
    logBackend('warn', 'email.undeliverable', `A gift change was refused: ${UNDELIVERABLE_CAUSES[unsendable]}`)
    throw backendError('unavailable', { service: 'email', reason: unsendable === 'test-mode' ? 'test_mode' : 'unconfigured' }, `[nuxt-backend] ${what}: the gift email to this recipient would not arrive.`)
  }

  /** The gifts the caller sent, newest first. `null` for whoever is not signed in. */
  const getSentGifts = queryGeneric({
    args: {},
    handler: async (ctx) => {
      const identity = await ctx.auth.getUserIdentity()
      if (!identity) return null
      // A banned or deleted account lists nothing, whatever its token says.
      const stored = await account(ctx, identity.subject)
      if (!stored || stored.banned) return null
      return (await ctx.runQuery(gifts.listByPurchaser, { purchaserUserId: identity.subject })).map(gift => sentOf(gift, kit.delivered))
    },
  })

  /**
   * Send a delivered gift's notice again, for a recipient who lost it: at
   * most one an hour and six in all, so nobody can use it to flood an inbox.
   */
  const resendGift = actionGeneric({
    args: { giftId: v.string() },
    handler: async (ctx, { giftId }) => {
      const what = 'resendGift'
      const { gift } = await purchaserOf(ctx, what, giftId)
      requireOpen(gift, what)
      if (!kit.delivered(gift)) throw backendError('not_ready', { reason: 'not_delivered' }, `[nuxt-backend] ${what}: this gift has not been delivered yet — its notice goes out on its date.`)
      const wait = gift.noticedAt === undefined ? 0 : gift.noticedAt + RESEND_AFTER_MS - Date.now()
      if (wait > 0 || (gift.noticeCount ?? 0) >= NOTICE_LIMIT) {
        throw backendError('rate_limited', { limit: 'giftNotice', retryAfter: wait > 0 ? wait : undefined }, `[nuxt-backend] ${what}: the notice was sent a moment ago — try again later.`)
      }
      requireDeliverable(gift.recipientEmail, what)
      await kit.notifyRecipient(ctx, gift, 'again')
      return null
    },
  })

  /**
   * Address an unclaimed gift to someone else, for a mistyped address: the
   * old address can no longer claim it, and the new one gets the notice once
   * the gift is delivered. The same checks as a new gift, the purchaser's own
   * address, the app's \`canGift\` and the address's daily limit included.
   */
  const changeGiftRecipient = actionGeneric({ args: { giftId: v.string(), recipientEmail: v.string() }, handler: async (ctx, { giftId, recipientEmail: typed }) => {
    const what = 'changeGiftRecipient'
    const { caller, gift } = await purchaserOf(ctx, what, giftId)
    requireOpen(gift, what)
    await requireUnstarted(gift, what)
    const recipientEmail = normalizeEmail(typed)
    if (!recipientEmail || !recipientEmail.includes('@')) {
      throw backendError('invalid_input', { field: 'recipientEmail' }, `[nuxt-backend] ${what}: a valid recipient email is required.`)
    }
    if (recipientEmail === caller.email) {
      const message = 'A gift is for someone else — send it to another address.'
      throw backendError('forbidden', { reason: 'gift_refused', message }, message)
    }
    if (recipientEmail === gift.recipientEmail) return null
    await throttle(ctx, caller.userId, 'gift changes')
    await kit.askCanGift(ctx as never, { recipientEmail, purchaserUserId: caller.userId, purchaserEntityId: gift.purchaserEntityId ?? '' })
    requireDeliverable(recipientEmail, what)
    await kit.requireAddressAllowance(ctx, recipientEmail)
    if (!await ctx.runMutation(gifts.setRecipient, { giftId: gift.id, recipientEmail })) {
      throw backendError('forbidden', { reason: 'gift_claimed' }, `[nuxt-backend] ${what}: this gift can't be changed any more.`)
    }
    const changed = await ctx.runQuery(gifts.get, { giftId: gift.id })
    // A gift dated for later tells the new address on its date, like the old one would have.
    if (changed && kit.delivered(changed)) await kit.notifyRecipient(ctx, changed)
    return null
  } })

  /**
   * Move the delivery date of a gift not delivered yet, up to a year ahead; a
   * date that is now or past delivers it at once.
   */
  const rescheduleGift = actionGeneric({ args: { giftId: v.string(), deliverAt: v.number() }, handler: async (ctx, { giftId, deliverAt }) => {
    const what = 'rescheduleGift'
    const { caller, gift } = await purchaserOf(ctx, what, giftId)
    requireOpen(gift, what)
    if (kit.delivered(gift)) throw backendError('forbidden', { reason: 'gift_delivered' }, `[nuxt-backend] ${what}: this gift was delivered already — its date can't change.`)
    const date = giftDeliverAt(deliverAt)
    // Each new date schedules a delivery: held to the limit of the other changes.
    await throttle(ctx, caller.userId, 'gift changes')
    await ctx.runMutation(gifts.setDeliverAt, { giftId: gift.id, deliverAt: date ?? Date.now() })
    const moved = await ctx.runQuery(gifts.get, { giftId: gift.id })
    // Its earlier scheduled function finds it not due, and does nothing.
    if (moved) await kit.deliver(ctx, moved)
    return null
  } })

  /**
   * Cancel a gift and refund the purchase in full, until the recipient claims
   * it or starts to: it moves money, so it asks for a recent sign-in. The
   * gift is held for the cancellation before any money moves, so no claim
   * starts meanwhile, and one that started first refuses it. The refund goes
   * next and the gift is ended after it, so a failed refund leaves the gift
   * as it was; the claim discount is voided last (the provider's \`order.refunded\`
   * does it too, should this stop short). A claimed gift can't be taken back.
   */
  const cancelGift = actionGeneric({ args: { giftId: v.string() }, handler: async (ctx, { giftId }) => {
    const what = 'cancelGift'
    const { caller, gift } = await purchaserOf(ctx, what, giftId, true)
    requireOpen(gift, what)
    await requireUnstarted(gift, what)
    requireProviderAccess('gift cancellation')
    await throttle(ctx, caller.userId, 'gift cancellations')
    if (!await ctx.runMutation(gifts.beginCancel, { giftId: gift.id, until: Date.now() + CANCEL_HOLD_MS })) {
      throw backendError('forbidden', { reason: 'gift_claimed' }, `[nuxt-backend] ${what}: this gift is being claimed, so it can't be changed.`)
    }
    try {
      if (gift.billingOrderId) {
        const order = unwrapProvider(await ordersGet(provider.polar, { id: gift.billingOrderId }), 'gift cancellation')
        const amount = order.refundableAmount
        if (typeof amount === 'number' && amount > 0) {
          unwrapProvider(await refundsCreate(provider.polar, { orderId: gift.billingOrderId, reason: 'customer_request', amount, revokeBenefits: true }), 'gift refund')
        }
      }
    }
    catch (error) {
      await ctx.runMutation(gifts.endCancel, { giftId: gift.id })
      throw error
    }
    if (await ctx.runMutation(gifts.markRefunded, { giftId: gift.id })) {
      await kit.recordGift(ctx, gift.purchaserEntityId, { type: 'gift.refunded', actor: { userId: caller.userId }, targetId: gift.id })
    }
    if (gift.discountId) await kit.voidDiscount(gift.discountId, 'gift cancellation')
    return null
  } })

  /** One sweep task, run for the gift as it is now: each step checks its own condition, so a task that went stale does nothing. */
  const runTask = async (ctx: RunWriteCtx, kind: string, giftId: string): Promise<void> => {
    const gift = await ctx.runQuery(gifts.get, { giftId })
    if (!gift) return
    if (kind === 'deliver') await kit.deliver(ctx, gift)
    else if (kind === 'remind') await kit.remind(ctx, gift)
    else if (kind === 'schedule_return' || kind === 'end_pass') await kit.passes.follow(ctx, gift, kind)
    else if (kind === 'pass_notice' && gift.passNoticedAt === undefined && gift.passEndedAt === undefined) await kit.passes.noticeEnding(ctx, gift)
  }

  /**
   * The gift sweep, internal: what the component's cron wakes, and a gift
   * dated for later is scheduled on (\`giftId\`). It delivers what is due,
   * sends the one reminder and follows the plan passes, one task at a time:
   * a task that fails is logged and the rest go on, and the next sweep tries
   * it again. When more was due than one sweep takes and some of it got done,
   * it runs again a minute later; a run where everything failed (the
   * provider down, say) leaves the rest to the hourly sweep.
   */
  const runGiftSweep = internalActionGeneric({
    args: { op: v.optional(v.literal('sweep')), giftId: v.optional(v.string()) },
    handler: async (ctx, { giftId }) => {
      if (giftId) {
        await runTask(ctx, 'deliver', giftId)
        return null
      }
      const { tasks, more } = await ctx.runQuery(gifts.due, { now: Date.now() })
      let done = 0
      for (const task of tasks) {
        try {
          await runTask(ctx, task.kind, task.giftId)
          done++
        }
        catch (error) {
          logBackend('error', 'billing.gift_sweep_task_failed', `A gift sweep step (${task.kind}) failed; the next sweep tries it again.`, error)
        }
      }
      if (more && done > 0) await ctx.scheduler.runAfter(SWEEP_AGAIN_MS, kit.sweepReference, { op: 'sweep' })
      return null
    },
  })

  return { getSentGifts, resendGift, changeGiftRecipient, rescheduleGift, cancelGift, runGiftSweep }
}
