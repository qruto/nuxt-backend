import type { BillingContext } from './context.js'
import type { BillingRewards } from './rewards.js'
import type { RunWriteCtx } from './types/base.js'

/** The fields of an order's payload that the referral program reads. */
export interface ReferralOrder {
  id?: string
  status?: string
  paid?: boolean
  netAmount?: number
  totalAmount?: number
  metadata?: Record<string, unknown>
}

/**
 * Hand the referral program the orders it counts (REF): a paid order of the
 * person a referral brought starts its hold, and a refund of the order a
 * referral holds voids it. The program lives in the component's tables, so
 * the billing module needs no knowledge of the app's `setupReferrals`
 * options: the terms each referral was claimed under travel with it.
 *
 * Only a real purchase counts: a free order, a gift's purchase or claim, and
 * a referral reward's own $0 checkout start nothing.
 */
export function createReferralOrders({ components }: Pick<BillingContext, 'components'>, rewards: Pick<BillingRewards, 'ownerOf'>) {
  const referrals = components.backend.referrals
  return async (ctx: RunWriteCtx, type: 'order.paid' | 'order.refunded', order: ReferralOrder, entityOf: () => Promise<string | null>): Promise<void> => {
    if (!referrals || typeof order.id !== 'string') return
    if (type === 'order.refunded') {
      await ctx.runMutation(referrals.orderRefunded, { orderId: order.id })
      return
    }
    const amount = order.netAmount ?? order.totalAmount ?? 0
    const paid = order.status === 'paid' || order.paid === true
    if (!paid || amount <= 0 || order.metadata?.giftId !== undefined || order.metadata?.referralId !== undefined) return
    // The entity is looked up last: an order that starts nothing asks the provider's records nothing.
    const entityId = await entityOf()
    if (!entityId) return
    const ownerId = await rewards.ownerOf(ctx, entityId)
    if (ownerId) await ctx.runMutation(referrals.orderPaid, { ownerId, entityId, orderId: order.id })
  }
}

/** The handler `createReferralOrders` makes. */
export type RewardOrders = ReturnType<typeof createReferralOrders>
