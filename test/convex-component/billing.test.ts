/// <reference types="vite/client" />

import { beforeEach, describe, expect, test } from 'vitest'
import { convexTest } from 'convex-test'
import component from '../../src/convex/test'
import schema from '../../src/convex/component/schema'
import { api } from '../../src/convex/component/_generated/api'

// Run the backend component as the root app: its full schema (which owns the
// `billingEntitlements` table) plus its own module glob. `convex-test` strips
// the `./component/` prefix via the `_generated` heuristic, so `api.billing.*`
// resolves to the component functions.
let t: ReturnType<typeof convexTest>

beforeEach(() => {
  t = convexTest(schema, component.modules)
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
})
