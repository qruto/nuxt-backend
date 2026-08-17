/// <reference types="vite/client" />

import { beforeEach, describe, expect, test } from 'vitest'
import { convexTest } from 'convex-test'
import component from '../../src/convex/test'
import schema from '../../src/convex/components/backend/schema'
import { api } from '../../src/convex/components/backend/_generated/api'

// Run the backend component as the root app: its schema (which owns the
// `billingEntitlements` table) plus its own module glob. `convex-test` strips
// the `./components/backend/` prefix via the `_generated` heuristic, so
// `api.billing.*` resolves to the component functions.
let t: ReturnType<typeof convexTest>

beforeEach(() => {
  t = convexTest(schema, component.modules.backend)
})

describe('billing entitlement cache (component)', () => {
  test('upsert then getByUser returns the cached row', async () => {
    await t.mutation(api.billing.upsert, {
      userId: 'u1',
      customerId: 'cus_1',
      activeProductIds: ['prod_pro'],
      benefits: [{ id: 'g1', benefitId: 'ben_1', type: 'custom', metadata: { key: 'premium' } }],
      meters: [{ meterId: 'm1', consumedUnits: 1, creditedUnits: 10, balance: 9 }],
    })

    const row = await t.query(api.billing.getByUser, { userId: 'u1' })

    expect(row).toMatchObject({
      customerId: 'cus_1',
      activeProductIds: ['prod_pro'],
      benefits: [{ id: 'g1', benefitId: 'ben_1', type: 'custom', metadata: { key: 'premium' } }],
      meters: [{ meterId: 'm1', consumedUnits: 1, creditedUnits: 10, balance: 9 }],
    })
  })

  test('getByUser returns null for an unknown user', async () => {
    expect(await t.query(api.billing.getByUser, { userId: 'nobody' })).toBeNull()
  })

  test('upsert patches the existing row instead of inserting a duplicate', async () => {
    await t.mutation(api.billing.upsert, { userId: 'u1', activeProductIds: ['p1'], benefits: [], meters: [] })
    await t.mutation(api.billing.upsert, { userId: 'u1', activeProductIds: ['p2'], benefits: [], meters: [] })

    // getByUser uses `.unique()`, which throws if a duplicate row exists — so a
    // successful read of the updated value proves the second upsert patched.
    const row = await t.query(api.billing.getByUser, { userId: 'u1' })
    expect(row?.activeProductIds).toStrictEqual(['p2'])
  })

  test('userByCustomer resolves the user id, and null when unknown', async () => {
    await t.mutation(api.billing.upsert, {
      userId: 'u1', customerId: 'cus_1', activeProductIds: [], benefits: [], meters: [],
    })

    expect(await t.query(api.billing.userByCustomer, { customerId: 'cus_1' })).toBe('u1')
    expect(await t.query(api.billing.userByCustomer, { customerId: 'cus_x' })).toBeNull()
  })

  test('clear wipes the cache', async () => {
    await t.mutation(api.billing.upsert, { userId: 'u1', activeProductIds: [], benefits: [], meters: [] })
    await t.mutation(api.billing.clear, {})
    expect(await t.query(api.billing.getByUser, { userId: 'u1' })).toBeNull()
  })
})

describe('spend reservations (reserve → settle / release)', () => {
  const seed = async (balance = 1) => {
    await t.mutation(api.billing.upsert, {
      userId: 'u1',
      activeProductIds: [],
      benefits: [],
      meters: [{ meterId: 'm1', consumedUnits: 0, creditedUnits: balance, balance }],
    })
  }

  test('two concurrent spends against balance 1 — exactly one wins', async () => {
    await seed(1)
    const [a, b] = await Promise.all([
      t.mutation(api.billing.debit, { userId: 'u1', meterId: 'm1', amount: 1, externalId: 'a' }),
      t.mutation(api.billing.debit, { userId: 'u1', meterId: 'm1', amount: 1, externalId: 'b' }),
    ])
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1)
    const row = await t.query(api.billing.getByUser, { userId: 'u1' })
    expect(row?.meters[0]).toMatchObject({ balance: 0, consumedUnits: 1 })
  })

  test('debit distinguishes cold cache from insufficient balance', async () => {
    expect(await t.mutation(api.billing.debit, { userId: 'nobody', meterId: 'm1', amount: 1, externalId: 'x' }))
      .toMatchObject({ ok: false, reason: 'no-row' })
    await seed(1)
    expect(await t.mutation(api.billing.debit, { userId: 'u1', meterId: 'other', amount: 1, externalId: 'x' }))
      .toMatchObject({ ok: false, reason: 'no-meter' })
    expect(await t.mutation(api.billing.debit, { userId: 'u1', meterId: 'm1', amount: 2, externalId: 'x' }))
      .toMatchObject({ ok: false, reason: 'insufficient', balance: 1 })
  })

  test('re-reserving the same externalId is idempotent', async () => {
    await seed(2)
    await t.mutation(api.billing.debit, { userId: 'u1', meterId: 'm1', amount: 1, externalId: 'same' })
    const again = await t.mutation(api.billing.debit, { userId: 'u1', meterId: 'm1', amount: 1, externalId: 'same' })
    expect(again.ok).toBe(true)
    const row = await t.query(api.billing.getByUser, { userId: 'u1' })
    expect(row?.meters[0]?.balance).toBe(1) // decremented once, not twice
  })

  test('release re-credits; settle keeps the spend', async () => {
    await seed(2)
    await t.mutation(api.billing.debit, { userId: 'u1', meterId: 'm1', amount: 1, externalId: 'r1' })
    await t.mutation(api.billing.debit, { userId: 'u1', meterId: 'm1', amount: 1, externalId: 's1' })
    await t.mutation(api.billing.release, { userId: 'u1', externalId: 'r1' })
    await t.mutation(api.billing.settle, { userId: 'u1', externalId: 's1' })
    const row = await t.query(api.billing.getByUser, { userId: 'u1' })
    expect(row?.meters[0]).toMatchObject({ balance: 1, consumedUnits: 1 })
  })

  test('upsert re-subtracts active reservations from fresh provider state', async () => {
    await seed(5)
    await t.mutation(api.billing.debit, { userId: 'u1', meterId: 'm1', amount: 2, externalId: 'inflight' })
    // A webhook-driven refresh lands mid-spend with pre-spend provider truth.
    await t.mutation(api.billing.upsert, {
      userId: 'u1',
      activeProductIds: [],
      benefits: [],
      meters: [{ meterId: 'm1', consumedUnits: 0, creditedUnits: 5, balance: 5 }],
    })
    const row = await t.query(api.billing.getByUser, { userId: 'u1' })
    expect(row?.meters[0]).toMatchObject({ balance: 3, consumedUnits: 2 })
    // After settling, provider truth stands as-is on the next refresh.
    await t.mutation(api.billing.settle, { userId: 'u1', externalId: 'inflight' })
    await t.mutation(api.billing.upsert, {
      userId: 'u1',
      activeProductIds: [],
      benefits: [],
      meters: [{ meterId: 'm1', consumedUnits: 2, creditedUnits: 5, balance: 3 }],
    })
    const settled = await t.query(api.billing.getByUser, { userId: 'u1' })
    expect(settled?.meters[0]).toMatchObject({ balance: 3, consumedUnits: 2 })
  })
})

describe('benefit metadata snapshots', () => {
  test('upsert + read round trip, patched in place', async () => {
    await t.mutation(api.billing.upsertBenefitMetadata, {
      entries: [{ benefitId: 'ben_1', metadata: { key: 'premium' } }],
    })
    await t.mutation(api.billing.upsertBenefitMetadata, {
      entries: [{ benefitId: 'ben_1', metadata: { key: 'premium-renamed' } }],
    })
    const rows = await t.query(api.billing.getBenefitMetadata, { benefitIds: ['ben_1', 'missing'] })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ benefitId: 'ben_1', metadata: { key: 'premium-renamed' } })
  })
})
