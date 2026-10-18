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
    const claimed = await createGift()
    await t.mutation(api.gifts.markPaid, { giftId: claimed })
    await t.mutation(api.gifts.markClaimed, { giftId: claimed, userId: 'u', entityId: 'e' })
    await createGift() // stays pending: someone's checkout, nothing to see
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
