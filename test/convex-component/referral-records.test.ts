/// <reference types="vite/client" />

import { beforeEach, describe, expect, test } from 'vitest'
import { convexTest } from 'convex-test'
import component from '../../src/convex/test'
import schema from '../../src/convex/components/backend/schema'
import { api } from '../../src/convex/components/backend/_generated/api'
import { forgetReferrals } from '../../src/convex/components/backend/referrals'

// The referral program's own records, run as the root app (the pattern of
// gifts.test.ts): which held referrals the sweep reaches, the flagged queue
// an administrator works through, and what an erasure leaves of a referral.

const DAY = 24 * 60 * 60 * 1000
const TERMS = { referrer: { pack: 'credits500' }, holdMs: 14 * DAY, caps: { perReferrer: 2, perMonth: null } }

let t: ReturnType<typeof convexTest>

beforeEach(() => {
  t = convexTest(schema, component.modules)
})

/** An account, as Better Auth writes it. */
async function account(email: string): Promise<string> {
  const now = Date.now()
  return await t.run(async ctx => await ctx.db.insert('user', { name: email.split('@')[0]!, email, emailVerified: true, createdAt: now, updatedAt: now, role: 'user', banned: false }) as string)
}

/** A session an account opened, from a network and a browser. */
async function session(userId: string, ipAddress: string): Promise<void> {
  const now = Date.now()
  await t.run(async ctx => void await ctx.db.insert('session', { userId, token: `token-${userId}-${ipAddress}`, createdAt: now, updatedAt: now, expiresAt: now + DAY, ipAddress, userAgent: 'Browser/1.0' }))
}

const codeOf = async (userId: string) => (await t.mutation(api.referrals.codeFor, { userId })).code

/** A new account that claims the code; answers the account and its referral. */
async function claimed(code: string, email: string): Promise<{ userId: string, id: string }> {
  const userId = await account(email)
  const claim = await t.mutation(api.referrals.claim, { code, userId, terms: TERMS })
  if (!claim.claimed) throw new Error(`claim refused: ${claim.reason}`)
  return { userId, id: claim.id }
}

/** The referred person's first paid order: the hold starts. */
const pay = (userId: string) => t.mutation(api.referrals.orderPaid, { ownerId: userId, entityId: `org-${userId}`, orderId: `order-${userId}` })

const counters = () => t.run(async ctx => Object.fromEntries((await ctx.db.query('referralCounters').collect()).map(row => [row.key, row.count])))

describe('the sweep\'s reach', () => {
  test('referrals waiting for an administrator never hide the ones that may be rewarded', async () => {
    const busy = await codeOf(await account('influencer@example.com'))
    // Five claims in an hour on one code: each payment is flagged as a burst.
    const crowd = []
    for (const name of ['a', 'b', 'c', 'd', 'e']) crowd.push(await claimed(busy, `${name}@example.com`))
    for (const friend of crowd) await pay(friend.userId)
    const quiet = await claimed(await codeOf(await account('ada@example.com')), 'grace@example.com')
    await pay(quiet.userId)
    const after = Date.now() + 15 * DAY
    expect(await t.query(api.referrals.due, { now: after, limit: 1 })).toEqual({ ids: [quiet.id], more: false })
    expect((await t.query(api.referrals.consoleRows, {})).totals).toMatchObject({ held: 6, flagged: 5 })
  })

  test('a grant that failed is taken up later, behind the referrals due before it', async () => {
    const code = await codeOf(await account('ada@example.com'))
    const first = await claimed(code, 'one@example.com')
    const second = await claimed(await codeOf(await account('bob@example.com')), 'two@example.com')
    await pay(first.userId)
    await pay(second.userId)
    const after = Date.now() + 15 * DAY
    expect((await t.query(api.referrals.due, { now: after, limit: 1 })).ids).toEqual([first.id])
    await t.mutation(api.referrals.deferReward, { id: first.id, until: after + 60 * 60 * 1000 })
    expect((await t.query(api.referrals.due, { now: after, limit: 1 })).ids).toEqual([second.id])
    expect((await t.query(api.referrals.due, { now: after + 2 * 60 * 60 * 1000 })).ids).toEqual([second.id, first.id])
  })

  test('a referral whose hold ends with no referrer reward is closed with no slot, and a later order starts nothing', async () => {
    const ada = await account('ada@example.com')
    const friend = await claimed(await codeOf(ada), 'grace@example.com')
    await pay(friend.userId)
    const after = Date.now() + 15 * DAY
    expect(await t.mutation(api.referrals.closeUnrewarded, { id: friend.id, now: after })).toBe(true)
    expect(await t.mutation(api.referrals.closeUnrewarded, { id: friend.id, now: after })).toBe(false)
    // No slot under the caps; the console counts it as claimed.
    expect(await counters()).toEqual({ 'total:claimed': 1, 'total:held': 0 })
    expect(await t.query(api.referrals.due, { now: after })).toEqual({ ids: [], more: false })
    expect(await pay(friend.userId)).toBeNull()
    expect(await t.query(api.referrals.mine, { userId: ada })).toMatchObject({ claimed: 1, held: 0, rewarded: 0 })
  })
})

describe('the flagged queue', () => {
  test('a flag first found at the payment goes back to an administrator, released before or not', async () => {
    const ada = await account('ada@example.com')
    const code = await codeOf(ada)
    for (const name of ['a', 'b', 'c', 'd', 'e']) await claimed(code, `${name}@example.com`)
    // The sixth claim in the hour is flagged at once, and an administrator releases it.
    const friend = await claimed(code, 'grace@example.com')
    expect(await t.mutation(api.referrals.resolveFlag, { id: friend.id, resolution: 'release' })).toBe(true)
    expect((await t.query(api.referrals.consoleRows, {})).flagged).toEqual([])
    // Both accounts then sign in from one network and browser: the payment finds it.
    await session(ada, '203.0.113.7')
    await session(friend.userId, '203.0.113.7')
    await pay(friend.userId)
    const view = await t.query(api.referrals.consoleRows, {})
    expect(view.flagged).toEqual([expect.objectContaining({ id: friend.id, state: 'held', released: false, flags: expect.arrayContaining(['burst', 'same_network']) })])
    expect((await t.query(api.referrals.due, { now: Date.now() + 15 * DAY })).ids).not.toContain(friend.id)
  })

  test('lists a flagged referral however many claims came after it', async () => {
    const code = await codeOf(await account('ada@example.com'))
    for (const name of ['a', 'b', 'c', 'd', 'e']) await claimed(code, `${name}@example.com`)
    const flagged = await claimed(code, 'grace@example.com')
    await t.run(async (ctx) => {
      for (let n = 0; n < 500; n++) {
        await ctx.db.insert('referrals', { code: 'OTHER000', referrerId: 'someone', referredId: `later-${n}`, state: 'claimed', terms: TERMS, claimedAt: Date.now() + 1000 + n })
      }
    })
    expect((await t.query(api.referrals.consoleRows, {})).flagged.map(row => row.id)).toEqual([flagged.id])
  })
})

describe('the console totals', () => {
  test('are kept on every state change, however many claims came after, and lose a referrer who is erased', async () => {
    const ada = await account('ada@example.com')
    const code = await codeOf(ada)
    const grace = await claimed(code, 'grace@example.com')
    const bob = await claimed(code, 'bob@example.com')
    const cy = await claimed(await codeOf(await account('eve@example.com')), 'cy@example.com')
    await pay(grace.userId)
    await pay(bob.userId)
    const after = Date.now() + 15 * DAY
    expect(await t.mutation(api.referrals.beginReward, { id: grace.id, now: after })).toBe('grant')
    expect(await t.mutation(api.referrals.finishReward, { id: grace.id })).toBe(true)
    // Bob's first order is refunded during the hold.
    await t.mutation(api.referrals.orderRefunded, { orderId: `order-${bob.userId}` })
    // Five hundred newer claims, written past the program's own functions: the totals never read the rows.
    await t.run(async (ctx) => {
      for (let n = 0; n < 500; n++) await ctx.db.insert('referrals', { code: 'OTHER000', referrerId: 'someone', referredId: `later-${n}`, state: 'claimed', terms: TERMS, claimedAt: Date.now() + 1000 + n })
    })

    const view = await t.query(api.referrals.consoleRows, {})
    expect(view.totals).toEqual({ claimed: 1, held: 0, rewarded: 1, voided: 1, capped: 0, flagged: 0 })
    expect(view.top).toEqual([
      { referrerId: ada, name: 'ada', referrals: 1, rewarded: 1 },
      expect.objectContaining({ referrals: 1, rewarded: 0 }),
    ])
    expect(cy.id).toBeTruthy()

    // Ada erases her account: her referrals leave the totals, and her tally goes.
    await t.run(async ctx => void await forgetReferrals(ctx as never, ada))
    expect((await t.query(api.referrals.consoleRows, {})).totals).toEqual({ claimed: 1, held: 0, rewarded: 0, voided: 0, capped: 0, flagged: 0 })
    expect(await t.run(async ctx => (await ctx.db.query('referralTallies').collect()).map(row => row.referrerId))).not.toContain(ada)
  })
})

describe('an erasure', () => {
  test('keeps a reward that was paid counted, and a mailbox referred once', async () => {
    const ada = await account('ada@example.com')
    const code = await codeOf(ada)
    const grace = await claimed(code, 'grace@example.com')
    await pay(grace.userId)
    const after = Date.now() + 15 * DAY
    expect(await t.mutation(api.referrals.beginReward, { id: grace.id, now: after })).toBe('grant')
    expect(await t.mutation(api.referrals.finishReward, { id: grace.id })).toBe(true)
    // Grace erases her account: Ada's reward stays counted under her cap.
    await t.run(async ctx => void await forgetReferrals(ctx as never, grace.userId))
    expect(await counters()).toMatchObject({ [`referrer:${ada}`]: 1 })
    // The same mailbox, signed up again with a plus tag, claims nothing.
    const again = await account('grace+again@example.com')
    expect(await t.mutation(api.referrals.claim, { code, userId: again, terms: TERMS })).toEqual({ claimed: false, reason: 'already_claimed' })
    // Nothing of Grace is left on the referral Ada keeps.
    const kept = await t.run(async ctx => await ctx.db.query('referrals').collect())
    expect(kept).toHaveLength(1)
    expect(JSON.stringify(kept)).not.toContain(grace.userId)
    // Ada erases hers: her own counter goes with her.
    await t.run(async ctx => void await forgetReferrals(ctx as never, ada))
    expect(Object.keys(await counters()).filter(key => key.startsWith('referrer:'))).toEqual([])
  })
})
