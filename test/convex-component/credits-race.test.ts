/// <reference types="vite/client" />

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { convexTest, type TestConvex } from 'convex-test'
import component from '../../src/convex/test'
import schema from '../../src/convex/components/backend/schema'
import { api } from '../../src/convex/components/backend/_generated/api'

// The reserve → settle / release protocol of the entitlement cache, driven as
// the root app (see billing.test.ts). Invariant under test: cache = last
// provider state − active reservations, where a reservation is active until
// settled, released, or older than the pending-spend TTL.
let t: TestConvex<typeof schema>

/** Mirrors `PENDING_SPEND_TTL_MS` in the component (10 minutes). */
const PENDING_SPEND_TTL_MS = 10 * 60 * 1000
const USER = 'u1'
const METER = 'm1'

beforeEach(() => {
  t = convexTest(schema, component.modules.backend)
})

afterEach(() => {
  vi.restoreAllMocks()
  clockOffset = 0
})

/** Provider truth for one meter (what a sync / webhook refresh would write). */
function providerMeter(balance: number, consumedUnits = 0, creditedUnits = balance + consumedUnits) {
  return { meterId: METER, consumedUnits, creditedUnits, balance }
}

async function seed(balance: number) {
  await t.mutation(api.billing.upsert, {
    userId: USER, activeProductIds: [], benefits: [], meters: [providerMeter(balance)],
  })
}

async function refresh(...meters: Array<ReturnType<typeof providerMeter>>) {
  await t.mutation(api.billing.upsert, { userId: USER, activeProductIds: [], benefits: [], meters })
}

const debit = (externalId: string, amount = 1) =>
  t.mutation(api.billing.debit, { userId: USER, meterId: METER, amount, externalId })

async function meter(meterId = METER) {
  const row = await t.query(api.billing.getByUser, { userId: USER })
  return row?.meters.find(entry => entry.meterId === meterId)
}

/** The raw reservation list — not part of the public read model. */
async function pendingIds(): Promise<string[]> {
  return t.run(async (ctx) => {
    const row = await ctx.db
      .query('billingEntitlements')
      .withIndex('userId', q => q.eq('userId', USER))
      .unique()
    return (row?.pendingSpends ?? []).map(entry => entry.externalId)
  })
}

/**
 * Move the component's clock forward (it reads `Date.now()` on every touch).
 * Cumulative within a test; reset with the mocks in `afterEach`.
 */
const realNow = Date.now
let clockOffset = 0
function advanceClock(ms: number) {
  clockOffset += ms
  vi.spyOn(Date, 'now').mockImplementation(() => realNow() + clockOffset)
}

describe('concurrent reservations against balance for one spend', () => {
  test('exactly one of two simultaneous debits wins; the loser sees the decremented balance', async () => {
    await seed(1)

    const [a, b] = await Promise.all([debit('spend-a'), debit('spend-b')])

    const winners = [a, b].filter(result => result.ok)
    const losers = [a, b].filter(result => !result.ok)
    expect(winners).toHaveLength(1)
    expect(winners[0]).toStrictEqual({ ok: true, balance: 0 })
    expect(losers).toStrictEqual([{ ok: false, balance: 0, reason: 'insufficient' }])
    expect(await meter()).toMatchObject({ balance: 0, consumedUnits: 1 })
    // Exactly one reservation is held — the winner's.
    const winnerId = a.ok ? 'spend-a' : 'spend-b'
    expect(await pendingIds()).toStrictEqual([winnerId])
  })

  test('a burst of spends never over-commits the balance', async () => {
    await seed(3)

    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => debit(`burst-${i}`)))

    expect(results.filter(result => result.ok)).toHaveLength(3)
    expect(await meter()).toMatchObject({ balance: 0, consumedUnits: 3 })
    expect(await pendingIds()).toHaveLength(3)
  })
})

describe('settle / release are idempotent per externalId', () => {
  test('settle drops the reservation once; repeats and unknown ids are no-ops', async () => {
    await seed(2)
    await debit('s1')

    await t.mutation(api.billing.settle, { userId: USER, externalId: 's1' })
    await t.mutation(api.billing.settle, { userId: USER, externalId: 's1' })
    await t.mutation(api.billing.settle, { userId: USER, externalId: 'never-reserved' })

    expect(await meter()).toMatchObject({ balance: 1, consumedUnits: 1 })
    expect(await pendingIds()).toStrictEqual([])
    // A settled id cannot be released back — the spend is final.
    await t.mutation(api.billing.release, { userId: USER, externalId: 's1' })
    expect(await meter()).toMatchObject({ balance: 1, consumedUnits: 1 })
  })

  test('release re-credits exactly once; repeats and unknown ids are no-ops', async () => {
    await seed(2)
    await debit('r1')
    expect(await meter()).toMatchObject({ balance: 1, consumedUnits: 1 })

    await t.mutation(api.billing.release, { userId: USER, externalId: 'r1' })
    await t.mutation(api.billing.release, { userId: USER, externalId: 'r1' })
    await t.mutation(api.billing.release, { userId: USER, externalId: 'never-reserved' })

    expect(await meter()).toMatchObject({ balance: 2, consumedUnits: 0 })
    expect(await pendingIds()).toStrictEqual([])
  })

  test('settle and release only touch their own reservation', async () => {
    await seed(4)
    await debit('keep')
    await debit('settle-me')
    await debit('release-me')

    await t.mutation(api.billing.settle, { userId: USER, externalId: 'settle-me' })
    await t.mutation(api.billing.release, { userId: USER, externalId: 'release-me' })

    expect(await meter()).toMatchObject({ balance: 2, consumedUnits: 2 })
    expect(await pendingIds()).toStrictEqual(['keep'])
  })

  test('both are safe for a user that has never synced', async () => {
    expect(await t.mutation(api.billing.settle, { userId: 'nobody', externalId: 'x' })).toBeNull()
    expect(await t.mutation(api.billing.release, { userId: 'nobody', externalId: 'x' })).toBeNull()
  })
})

describe('credit restores balance', () => {
  test('re-credits a settled spend (refund) and clamps consumedUnits at zero', async () => {
    await seed(3)
    await debit('c1', 2)
    await t.mutation(api.billing.settle, { userId: USER, externalId: 'c1' })
    expect(await meter()).toMatchObject({ balance: 1, consumedUnits: 2 })

    await t.mutation(api.billing.credit, { userId: USER, meterId: METER, amount: 2 })
    expect(await meter()).toMatchObject({ balance: 3, consumedUnits: 0 })

    // A grant beyond what was consumed adds balance without going negative.
    await t.mutation(api.billing.credit, { userId: USER, meterId: METER, amount: 5 })
    expect(await meter()).toMatchObject({ balance: 8, consumedUnits: 0 })
  })

  test('only the named meter changes; unknown users / meters are no-ops', async () => {
    await refresh(providerMeter(1), { meterId: 'm2', consumedUnits: 0, creditedUnits: 1, balance: 1 })

    await t.mutation(api.billing.credit, { userId: USER, meterId: 'm2', amount: 4 })
    await t.mutation(api.billing.credit, { userId: USER, meterId: 'missing', amount: 4 })
    expect(await t.mutation(api.billing.credit, { userId: 'nobody', meterId: METER, amount: 4 })).toBeNull()

    expect(await meter()).toMatchObject({ balance: 1 })
    expect(await meter('m2')).toMatchObject({ balance: 5 })
  })
})

describe('upsert re-subtracts active reservations (cache = provider − reservations)', () => {
  test('a provider refresh landing mid-spend does not resurrect reserved balance', async () => {
    await seed(5)
    await debit('inflight', 2)

    // Pre-spend provider truth arrives (e.g. a webhook-driven refresh).
    await refresh(providerMeter(5))

    expect(await meter()).toMatchObject({ balance: 3, consumedUnits: 2 })
    expect(await pendingIds()).toStrictEqual(['inflight'])
  })

  test('after settle the provider state stands as-is; after release it is restored', async () => {
    await seed(5)
    await debit('a', 2)
    await debit('b', 1)

    await t.mutation(api.billing.settle, { userId: USER, externalId: 'a' })
    // Provider ingested spend `a` (consumed 2, balance 3) but not yet `b`.
    await refresh(providerMeter(3, 2))
    expect(await meter()).toMatchObject({ balance: 2, consumedUnits: 3 })

    await t.mutation(api.billing.release, { userId: USER, externalId: 'b' })
    await refresh(providerMeter(3, 2))
    expect(await meter()).toMatchObject({ balance: 3, consumedUnits: 2 })
    expect(await pendingIds()).toStrictEqual([])
  })

  test('reservations are applied per meter; other meters pass through untouched', async () => {
    await refresh(providerMeter(5), { meterId: 'm2', consumedUnits: 0, creditedUnits: 7, balance: 7 })
    await debit('only-m1', 3)

    await refresh(providerMeter(5), { meterId: 'm2', consumedUnits: 0, creditedUnits: 7, balance: 7 })

    expect(await meter()).toMatchObject({ balance: 2, consumedUnits: 3 })
    expect(await meter('m2')).toMatchObject({ balance: 7, consumedUnits: 0 })
  })
})

describe('pending-spend TTL', () => {
  test('reservations older than the TTL are pruned on the next touch (a crashed flow self-heals)', async () => {
    await seed(5)
    await debit('stale', 2)
    expect(await meter()).toMatchObject({ balance: 3 })

    advanceClock(PENDING_SPEND_TTL_MS + 1000)

    // The stale reservation no longer holds balance back from provider truth…
    await refresh(providerMeter(5))
    expect(await meter()).toMatchObject({ balance: 5, consumedUnits: 0 })
    expect(await pendingIds()).toStrictEqual([])
    // …and can neither be released nor settled — nothing is left to undo.
    await t.mutation(api.billing.release, { userId: USER, externalId: 'stale' })
    expect(await meter()).toMatchObject({ balance: 5, consumedUnits: 0 })
  })

  test('only entries past the TTL are dropped; fresh reservations survive the prune', async () => {
    await seed(5)
    await debit('old', 1)

    advanceClock(PENDING_SPEND_TTL_MS - 1000)
    await debit('fresh', 1)
    // Within the TTL both still count.
    await t.mutation(api.billing.settle, { userId: USER, externalId: 'unrelated' })
    expect(await pendingIds()).toStrictEqual(['old', 'fresh'])

    // `old` is now past the TTL; `fresh` is two seconds old.
    advanceClock(2000)
    await t.mutation(api.billing.settle, { userId: USER, externalId: 'unrelated' })
    expect(await pendingIds()).toStrictEqual(['fresh'])
  })

  test('an expired reservation id can be reserved again (it is no longer treated as pending)', async () => {
    await seed(3)
    expect(await debit('same', 1)).toStrictEqual({ ok: true, balance: 2 })
    // Within the TTL the same id is idempotent — no second decrement.
    expect(await debit('same', 1)).toStrictEqual({ ok: true, balance: 2 })

    advanceClock(PENDING_SPEND_TTL_MS + 1000)
    expect(await debit('same', 1)).toStrictEqual({ ok: true, balance: 1 })
    expect(await pendingIds()).toStrictEqual(['same'])
  })
})
