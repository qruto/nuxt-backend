/// <reference types="vite/client" />

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { convexTest } from 'convex-test'
import component from '../../src/convex/test'
import schema from '../../src/convex/components/backend/schema'
import { api } from '../../src/convex/components/backend/_generated/api'
import type { Id } from '../../src/convex/components/backend/_generated/dataModel'

// Run the backend component as the root app (same pattern as billing.test.ts):
// the merged schema owns both the gift table and the auth tables, so
// personalEntity's cross-module reads work against real rows.
let t: ReturnType<typeof convexTest>

beforeEach(() => {
  t = convexTest(schema, component.modules)
})

const now = () => Date.now()

async function createGift(overrides: Record<string, unknown> = {}) {
  // `create` returns the id as a plain string (the component wire format);
  // brand it back for the typed `giftId` args below.
  return await t.mutation(api.gifts.create, {
    recipientEmail: 'Recipient@Example.com',
    purchaserUserId: 'user-buyer',
    purchaserEntityId: 'org-buyer',
    purchaserName: 'Buyer',
    pack: 'credits500',
    productIds: ['prod_credits'],
    giftProductId: 'prod_credits_gift',
    message: 'Enjoy!',
    ...overrides,
  }) as Id<'billingGifts'>
}

describe('gift lifecycle (component)', () => {
  test('create stores the gift pending with a lowercased recipient email, and no recipient customer', async () => {
    const giftId = await createGift()
    const gift = await t.query(api.gifts.get, { giftId })
    expect(gift).toMatchObject({
      recipientEmail: 'recipient@example.com',
      status: 'pending',
      purchaserEntityId: 'org-buyer',
      pack: 'credits500',
      giftProductId: 'prod_credits_gift',
      productIds: ['prod_credits'],
    })
    expect(gift?.billingCustomerId).toBeUndefined()
  })

  test('markPaid transitions pending → paid once, with what the order charged', async () => {
    const giftId = await createGift()
    await t.mutation(api.gifts.markPaid, { giftId, billingOrderId: 'order_1', amount: 2000, currency: 'usd' })
    let gift = await t.query(api.gifts.get, { giftId })
    expect(gift).toMatchObject({ status: 'paid', billingOrderId: 'order_1', amount: 2000, currency: 'usd' })

    // A duplicate webhook delivery must not overwrite anything.
    await t.mutation(api.gifts.markPaid, { giftId, billingOrderId: 'order_2', amount: 1 })
    gift = await t.query(api.gifts.get, { giftId })
    expect(gift).toMatchObject({ billingOrderId: 'order_1', amount: 2000 })
  })

  test('setDiscount stores the claim discount once, and only on a paid gift', async () => {
    const giftId = await createGift()
    expect(await t.mutation(api.gifts.setDiscount, { giftId, discountId: 'disc_early' })).toBe(false)
    await t.mutation(api.gifts.markPaid, { giftId })
    expect(await t.mutation(api.gifts.setDiscount, { giftId, discountId: 'disc_1' })).toBe(true)
    expect(await t.mutation(api.gifts.setDiscount, { giftId, discountId: 'disc_2' })).toBe(false)
    expect((await t.query(api.gifts.get, { giftId }))?.discountId).toBe('disc_1')
  })

  test('markNotified stamps once, on the record the sender reads before sending', async () => {
    const giftId = await createGift()
    expect((await t.query(api.gifts.get, { giftId }))?.notifiedAt).toBeUndefined()

    expect(await t.mutation(api.gifts.markNotified, { giftId })).toBe(true)
    const stamped = (await t.query(api.gifts.get, { giftId }))?.notifiedAt
    expect(stamped).toBeTypeOf('number')

    expect(await t.mutation(api.gifts.markNotified, { giftId })).toBe(false)
    expect((await t.query(api.gifts.get, { giftId }))?.notifiedAt).toBe(stamped)
  })

  test('startClaim records the claim in flight; markClaimed records who received it and where', async () => {
    const giftId = await createGift()
    expect(await t.mutation(api.gifts.startClaim, { giftId, userId: 'user-recipient', entityId: 'org-1' })).toBe(false)
    await t.mutation(api.gifts.markPaid, { giftId })
    expect(await t.mutation(api.gifts.startClaim, { giftId, userId: 'user-recipient', entityId: 'org-1' })).toBe(true)
    expect(await t.query(api.gifts.get, { giftId })).toMatchObject({ status: 'paid', claimingUserId: 'user-recipient', claimingEntityId: 'org-1' })

    await t.mutation(api.gifts.markClaimed, { giftId, userId: 'user-recipient', entityId: 'org-1', claimOrderId: 'order_claim' })
    expect(await t.query(api.gifts.get, { giftId })).toMatchObject({
      status: 'claimed',
      claimedByUserId: 'user-recipient',
      claimedEntityId: 'org-1',
      claimOrderId: 'order_claim',
    })

    // Idempotent: a second claim leaves the first attribution in place.
    await t.mutation(api.gifts.markClaimed, { giftId, userId: 'someone-else', entityId: 'org-2' })
    expect((await t.query(api.gifts.get, { giftId }))?.claimedByUserId).toBe('user-recipient')
  })

  test('markRefunded ends an unclaimed gift, and never a claimed one', async () => {
    const unclaimed = await createGift()
    await t.mutation(api.gifts.markPaid, { giftId: unclaimed })
    expect(await t.mutation(api.gifts.markRefunded, { giftId: unclaimed })).toBe(true)
    expect(await t.query(api.gifts.get, { giftId: unclaimed })).toMatchObject({ status: 'refunded', refundedAt: expect.any(Number) })
    // A refunded gift can't be claimed any more.
    expect(await t.mutation(api.gifts.startClaim, { giftId: unclaimed, userId: 'u', entityId: 'e' })).toBe(false)
    expect(await t.mutation(api.gifts.markRefunded, { giftId: unclaimed })).toBe(false)

    const claimed = await createGift()
    await t.mutation(api.gifts.markPaid, { giftId: claimed })
    await t.mutation(api.gifts.markClaimed, { giftId: claimed, userId: 'u', entityId: 'e' })
    expect(await t.mutation(api.gifts.markRefunded, { giftId: claimed })).toBe(false)
    expect((await t.query(api.gifts.get, { giftId: claimed }))?.status).toBe('claimed')
  })

  test('listByEmail matches case-insensitively, and lists only paid and claimed gifts', async () => {
    const paid = await createGift()
    await t.mutation(api.gifts.markPaid, { giftId: paid })
    await t.mutation(api.gifts.markDelivered, { giftId: paid })
    const claimed = await createGift()
    await t.mutation(api.gifts.markPaid, { giftId: claimed })
    await t.mutation(api.gifts.markDelivered, { giftId: claimed })
    await t.mutation(api.gifts.markClaimed, { giftId: claimed, userId: 'u', entityId: 'e' })
    await createGift() // stays pending: someone's checkout, nothing to see
    // Paid but dated for later: not the recipient's to see yet.
    const scheduled = await createGift({ deliverAt: Date.now() + 86_400_000 })
    await t.mutation(api.gifts.markPaid, { giftId: scheduled })
    const refunded = await createGift()
    await t.mutation(api.gifts.markRefunded, { giftId: refunded })
    await createGift({ recipientEmail: 'other@example.com' })

    const visible = await t.query(api.gifts.listByEmail, { email: 'RECIPIENT@example.com' })
    expect(visible.map(gift => gift.id).sort()).toEqual([paid, claimed].sort())

    const claimable = await t.query(api.gifts.listByEmail, { email: 'recipient@example.com', status: 'paid' })
    expect(claimable.map(gift => gift.id)).toEqual([paid])
  })

  test('create drops the purchaser\'s own checkouts abandoned over a day ago, and nothing else', async () => {
    vi.useFakeTimers()
    try {
      const abandoned = await createGift()
      const paid = await createGift()
      await t.mutation(api.gifts.markPaid, { giftId: paid })
      const someoneElses = await createGift({ purchaserUserId: 'other-buyer' })
      vi.advanceTimersByTime(25 * 60 * 60 * 1000)
      await createGift()

      expect(await t.query(api.gifts.get, { giftId: abandoned })).toBeNull()
      expect(await t.query(api.gifts.get, { giftId: paid })).not.toBeNull()
      expect(await t.query(api.gifts.get, { giftId: someoneElses })).not.toBeNull()
    }
    finally {
      vi.useRealTimers()
    }
  })

  test('countBought counts bought gifts and the checkouts still open, never abandoned ones', async () => {
    const since = now() - 1000
    expect(await t.query(api.gifts.countBought, { purchaserUserId: 'user-buyer', since, pendingSince: since })).toStrictEqual({ count: 0, oldest: null })
    const first = await createGift()
    await t.mutation(api.gifts.markPaid, { giftId: first })
    const open = await createGift() // a checkout that may still be paid
    const refunded = await createGift()
    await t.mutation(api.gifts.markPaid, { giftId: refunded })
    await t.mutation(api.gifts.markRefunded, { giftId: refunded })
    await createGift({ purchaserUserId: 'someone-else' })

    const counted = await t.query(api.gifts.countBought, { purchaserUserId: 'user-buyer', since, pendingSince: since })
    expect(counted.count).toBe(3)
    expect(counted.oldest).toBe((await t.query(api.gifts.get, { giftId: first }))?.createdAt)
    // A checkout opened before `pendingSince` has expired at the provider: it no longer counts.
    expect((await t.query(api.gifts.countBought, { purchaserUserId: 'user-buyer', since, pendingSince: now() + 1000 })).count).toBe(2)
    // At payment the gift being paid for is left out.
    expect((await t.query(api.gifts.countBought, { purchaserUserId: 'user-buyer', since, pendingSince: since, excludeGiftId: open })).count).toBe(2)
    expect((await t.query(api.gifts.countBought, { purchaserUserId: 'user-buyer', since: now() + 1000, pendingSince: since })).count).toBe(0)
  })

  test('personalEntity finds the personal workspace a user still owns', async () => {
    const { userId, personal } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('user', { name: 'Recipient', email: 'recipient@example.com', emailVerified: true, createdAt: now(), updatedAt: now() }) as string
      const shared = await ctx.db.insert('organization', { name: 'Acme', slug: 'acme', createdAt: now() }) as string
      const personal = await ctx.db.insert('organization', { name: 'Mine', slug: `personal-${userId.toLowerCase()}-a1b2c3d4`, createdAt: now() }) as string
      await ctx.db.insert('member', { organizationId: shared, userId, role: 'owner', createdAt: now() })
      await ctx.db.insert('member', { organizationId: personal, userId, role: 'owner', createdAt: now() })
      return { userId, personal }
    })
    expect(await t.query(api.gifts.personalEntity, { userId })).toBe(personal)
    expect(await t.query(api.gifts.personalEntity, { userId: 'nobody' })).toBeNull()

    // Someone joined it: shared now, so it is no longer where gifts go.
    await t.run(async (ctx) => {
      await ctx.db.insert('member', { organizationId: personal, userId: 'someone-else', role: 'member', createdAt: now() })
    })
    expect(await t.query(api.gifts.personalEntity, { userId })).toBeNull()
  })
})

describe('delivery dates, notices and the purchaser\'s changes (component)', () => {
  const DAY = 24 * 60 * 60 * 1000

  async function paidGift(overrides: Record<string, unknown> = {}) {
    const giftId = await createGift(overrides)
    await t.mutation(api.gifts.markPaid, { giftId, billingOrderId: `order_${giftId}` })
    return giftId
  }

  test('a gift paid with a date is dated, not delivered, and stays out of its recipient\'s list until it is', async () => {
    const giftId = await paidGift({ deliverAt: now() + 3 * DAY })
    expect(await t.query(api.gifts.get, { giftId })).toMatchObject({ status: 'paid', deliverAt: expect.any(Number) })
    expect((await t.query(api.gifts.get, { giftId }))?.deliveredAt).toBeUndefined()
    expect(await t.query(api.gifts.listByEmail, { email: 'recipient@example.com' })).toEqual([])
    expect(await t.mutation(api.gifts.markDelivered, { giftId })).toBe(true)
    expect(await t.mutation(api.gifts.markDelivered, { giftId })).toBe(false)
    expect((await t.query(api.gifts.listByEmail, { email: 'recipient@example.com' })).map(gift => gift.id)).toEqual([giftId])
  })

  test('the date moves only while the gift is undelivered, and the recipient changes only while it is unclaimed', async () => {
    const giftId = await paidGift({ deliverAt: now() + 3 * DAY })
    const later = now() + 9 * DAY
    expect(await t.mutation(api.gifts.setDeliverAt, { giftId, deliverAt: later })).toBe(true)
    expect((await t.query(api.gifts.get, { giftId }))?.deliverAt).toBe(later)
    expect(await t.mutation(api.gifts.setRecipient, { giftId, recipientEmail: 'New@Example.com' })).toBe(true)
    expect((await t.query(api.gifts.get, { giftId }))?.recipientEmail).toBe('new@example.com')
    await t.mutation(api.gifts.markDelivered, { giftId })
    expect(await t.mutation(api.gifts.setDeliverAt, { giftId, deliverAt: later + DAY })).toBe(false)
    await t.mutation(api.gifts.markClaimed, { giftId, userId: 'u', entityId: 'e' })
    expect(await t.mutation(api.gifts.setRecipient, { giftId, recipientEmail: 'x@example.com' })).toBe(false)
  })

  test('a changed recipient starts over: the first notice and the reminder are theirs, the count of notices goes on', async () => {
    const giftId = await paidGift()
    await t.mutation(api.gifts.markNotified, { giftId })
    await t.mutation(api.gifts.noteNotice, { giftId })
    await t.mutation(api.gifts.noteNotice, { giftId, reminder: true })
    expect(await t.query(api.gifts.get, { giftId })).toMatchObject({ notifiedAt: expect.any(Number), noticeCount: 2, remindedAt: expect.any(Number) })
    await t.mutation(api.gifts.setRecipient, { giftId, recipientEmail: 'new@example.com' })
    const gift = await t.query(api.gifts.get, { giftId })
    expect(gift?.notifiedAt).toBeUndefined()
    expect(gift?.remindedAt).toBeUndefined()
  })

  test('countToAddress counts what an address was sent in a window, open checkouts and the excluded one apart', async () => {
    const first = await paidGift()
    await paidGift()
    await createGift()
    await createGift({ recipientEmail: 'other@example.com' })
    const base = { email: 'RECIPIENT@example.com', since: now() - DAY }
    expect(await t.query(api.gifts.countToAddress, { ...base, pendingSince: now() - 3600_000 })).toBe(3)
    // A minute ahead: past every checkout here, whose time convex-test may stamp a moment after the test's clock.
    expect(await t.query(api.gifts.countToAddress, { ...base, pendingSince: now() + 60_000 })).toBe(2)
    expect(await t.query(api.gifts.countToAddress, { ...base, pendingSince: now() + 60_000, excludeGiftId: first })).toBe(1)
  })

  test('listByPurchaser lists what a purchaser sent, newest first, without the open checkouts', async () => {
    const first = await paidGift()
    const second = await paidGift({ plan: 'pro', months: 3, pack: undefined })
    await createGift()
    await paidGift({ purchaserUserId: 'someone-else' })
    expect((await t.query(api.gifts.listByPurchaser, { purchaserUserId: 'user-buyer' })).map(gift => gift.id)).toEqual([second, first])
  })

  test('the sweep finds a delivery that is due, the week\'s reminder, and the steps of a pass, and wakes the app by its handle', async () => {
    const due = await paidGift({ deliverAt: now() + 1000 })
    const later = await paidGift({ deliverAt: now() + 5 * DAY })
    const reminded = await paidGift()
    await t.mutation(api.gifts.markDelivered, { giftId: reminded })
    const tasksAt = async (at: number) => (await t.query(api.gifts.due, { now: at })).tasks.map(task => `${task.kind}:${task.giftId}`).sort()
    expect(await tasksAt(now() + 2000)).toEqual([`deliver:${due}`])
    expect(await tasksAt(now() + 6 * DAY)).toEqual([`deliver:${due}`, `deliver:${later}`].sort())
    // A week after it was delivered, the reminder; once reminded, never again.
    expect(await tasksAt(now() + 8 * DAY)).toContain(`remind:${reminded}`)
    await t.mutation(api.gifts.noteNotice, { giftId: reminded, reminder: true })
    expect((await tasksAt(now() + 8 * DAY)).filter(task => task.startsWith('remind:'))).toEqual([])
  })

  test('a plan pass keeps its end date: claimed once, followed to its return, its notice and its end', async () => {
    const giftId = await paidGift({ plan: 'pro', months: 3, pack: undefined, productIds: ['prod_pass'] })
    await t.mutation(api.gifts.markDelivered, { giftId })
    const endsAt = now() + 90 * DAY
    // Its last billing cycle begins 28 days before the end.
    const returnFrom = endsAt - 28 * DAY
    // A claim is recorded only by the one that holds the gift.
    const until = now() + 60_000
    expect(await t.mutation(api.gifts.startPass, { giftId, userId: 'u', entityId: 'org-r', until, subscriptionId: 'sub_1', endsAt, returnFrom })).toBe(false)
    expect(await t.mutation(api.gifts.reservePass, { giftId, userId: 'u', entityId: 'org-r', until })).toBe('reserved')
    // A second claim waits while the first holds it, and the purchaser's refund is refused meanwhile.
    expect(await t.mutation(api.gifts.reservePass, { giftId, userId: 'u2', entityId: 'org-2', until: now() + 60_000 })).toBe('busy')
    expect(await t.mutation(api.gifts.markRefunded, { giftId })).toBe(false)
    expect(await t.mutation(api.gifts.beginCancel, { giftId, until: now() + 60_000 })).toBe(false)
    // Only with the hold it took: a claim that held it once, with another `until`, records nothing.
    expect(await t.mutation(api.gifts.startPass, { giftId, userId: 'u', entityId: 'org-r', until: until - 1, subscriptionId: 'sub_1', endsAt, returnFrom })).toBe(false)
    expect(await t.mutation(api.gifts.startPass, { giftId, userId: 'u', entityId: 'org-r', until, subscriptionId: 'sub_1', endsAt, returnFrom })).toBe(true)
    // A second claim finds it claimed already, and the workspace takes no other pass meanwhile.
    expect(await t.mutation(api.gifts.reservePass, { giftId, userId: 'u2', entityId: 'org-2', until: now() + 60_000 })).toBe('closed')
    expect(await t.mutation(api.gifts.startPass, { giftId, userId: 'u2', entityId: 'org-2', until, subscriptionId: 'sub_2', endsAt, returnFrom })).toBe(false)
    const other = await paidGift({ plan: 'pro', months: 1, pack: undefined, productIds: ['prod_pass'] })
    expect(await t.mutation(api.gifts.reservePass, { giftId: other, userId: 'u', entityId: 'org-r', until: now() + 60_000 })).toBe('taken')
    await t.mutation(api.gifts.markRefunded, { giftId: other })
    expect(await t.query(api.gifts.activePass, { entityId: 'org-r' })).toMatchObject({ id: giftId, plan: 'pro', months: 3, endsAt, subscriptionId: 'sub_1' })
    expect(await t.query(api.gifts.activePass, { entityId: 'org-other' })).toBeNull()
    const kinds = async (at: number) => (await t.query(api.gifts.due, { now: at })).tasks.map(task => task.kind).sort()
    expect(await kinds(now() + 10 * DAY)).toEqual([])
    // Not in the cycle before the last, however close the end: the return would land a cycle early.
    expect(await kinds(returnFrom - 1000)).toEqual([])
    // The last cycle: the return is scheduled; a week before the end, the workspace is told.
    expect(await kinds(endsAt - 20 * DAY)).toEqual(['schedule_return'])
    expect(await kinds(endsAt - 6 * DAY)).toEqual(['pass_notice', 'schedule_return'])
    await t.mutation(api.gifts.notePass, { giftId, step: 'return_scheduled' })
    await t.mutation(api.gifts.notePass, { giftId, step: 'noticed' })
    expect(await kinds(endsAt - 6 * DAY)).toEqual([])
    expect(await kinds(endsAt + 1000)).toEqual(['end_pass'])
    await t.mutation(api.gifts.notePass, { giftId, step: 'ended' })
    expect(await kinds(endsAt + 1000)).toEqual([])
    expect(await t.query(api.gifts.activePass, { entityId: 'org-r' })).toBeNull()
  })

  test('the sweep wakes nothing without a registered handle, and registering it twice keeps one', async () => {
    await t.mutation(api.gifts.registerSweep, { wake: 'handle-1' })
    await t.mutation(api.gifts.registerSweep, { wake: 'handle-2' })
    const rows = await t.run(async ctx => ctx.db.query('billingGiftSweep').collect())
    expect(rows).toHaveLength(1)
    expect(rows[0]!.wake).toBe('handle-2')
  })
})
