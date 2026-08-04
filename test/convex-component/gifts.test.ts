/// <reference types="vite/client" />

import { beforeEach, describe, expect, test } from 'vitest'
import { convexTest } from 'convex-test'
import component from '../../src/convex/test'
import schema from '../../src/convex/components/backend/schema'
import { api } from '../../src/convex/components/backend/_generated/api'
import type { Id } from '../../src/convex/components/backend/_generated/dataModel'

// Run the backend component as the root app (same pattern as billing.test.ts):
// the merged schema owns both the gift table and the auth tables, so
// resolveRecipient's cross-module reads work against real rows.
let t: ReturnType<typeof convexTest>

beforeEach(() => {
  t = convexTest(schema, component.modules.backend)
})

const now = () => Date.now()

async function createGift(overrides: Record<string, unknown> = {}) {
  // `create` returns the id as a plain string (the component wire format);
  // brand it back for the typed `giftId` args below.
  return await t.mutation(api.gifts.create, {
    recipientEmail: 'Recipient@Example.com',
    purchaserUserId: 'user-buyer',
    purchaserEmail: 'buyer@example.com',
    purchaserName: 'Buyer',
    productIds: ['prod_credits'],
    message: 'Enjoy!',
    billingCustomerId: 'cus_gift',
    ...overrides,
  }) as Id<'billingGifts'>
}

describe('gift lifecycle (component)', () => {
  test('create stores the gift pending with a lowercased recipient email', async () => {
    const giftId = await createGift()
    const gift = await t.query(api.gifts.get, { giftId })
    expect(gift).toMatchObject({
      recipientEmail: 'recipient@example.com',
      status: 'pending',
      billingCustomerId: 'cus_gift',
      productIds: ['prod_credits'],
    })
  })

  test('markPaid transitions pending → paid once, idempotently', async () => {
    const giftId = await createGift()
    await t.mutation(api.gifts.markPaid, { giftId, billingOrderId: 'order_1' })
    let gift = await t.query(api.gifts.get, { giftId })
    expect(gift).toMatchObject({ status: 'paid', billingOrderId: 'order_1' })

    // A duplicate webhook delivery must not overwrite anything.
    await t.mutation(api.gifts.markPaid, { giftId, billingOrderId: 'order_2' })
    gift = await t.query(api.gifts.get, { giftId })
    expect(gift?.billingOrderId).toBe('order_1')
  })

  test('markClaimed records who received the gift and where', async () => {
    const giftId = await createGift()
    await t.mutation(api.gifts.markPaid, { giftId })
    await t.mutation(api.gifts.markClaimed, { giftId, userId: 'user-recipient', entityId: 'org-1' })
    const gift = await t.query(api.gifts.get, { giftId })
    expect(gift).toMatchObject({
      status: 'claimed',
      claimedByUserId: 'user-recipient',
      claimedEntityId: 'org-1',
    })

    // Idempotent: a second claim leaves the first attribution in place.
    await t.mutation(api.gifts.markClaimed, { giftId, userId: 'someone-else', entityId: 'org-2' })
    expect((await t.query(api.gifts.get, { giftId }))?.claimedByUserId).toBe('user-recipient')
  })

  test('listByEmail matches case-insensitively and filters by status', async () => {
    const paid = await createGift()
    await t.mutation(api.gifts.markPaid, { giftId: paid })
    await createGift({ billingCustomerId: 'cus_2' }) // stays pending
    await createGift({ recipientEmail: 'other@example.com', billingCustomerId: 'cus_3' })

    const all = await t.query(api.gifts.listByEmail, { email: 'RECIPIENT@example.com' })
    expect(all).toHaveLength(2)

    const claimable = await t.query(api.gifts.listByEmail, { email: 'recipient@example.com', status: 'paid' })
    expect(claimable).toHaveLength(1)
    expect(claimable[0]?.id).toBe(paid)
  })

  test('resolveRecipient finds an existing user and their first workspace', async () => {
    expect(await t.query(api.gifts.resolveRecipient, { email: 'recipient@example.com' })).toBeNull()

    const userId = await t.run(async ctx => await ctx.db.insert('user', {
      name: 'Recipient',
      email: 'recipient@example.com',
      emailVerified: true,
      createdAt: now(),
      updatedAt: now(),
    }) as string)

    // User without a workspace: resolvable, organizationId null.
    expect(await t.query(api.gifts.resolveRecipient, { email: 'recipient@example.com' }))
      .toStrictEqual({ userId, organizationId: null })

    await t.run(async (ctx) => {
      await ctx.db.insert('member', { organizationId: 'org-1', userId, role: 'owner', createdAt: now() })
    })
    expect(await t.query(api.gifts.resolveRecipient, { email: 'recipient@example.com' }))
      .toStrictEqual({ userId, organizationId: 'org-1' })
  })
})
