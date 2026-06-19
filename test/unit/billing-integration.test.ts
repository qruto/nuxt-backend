import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { customersGetState } from '@polar-sh/sdk/funcs/customersGetState.js'
import { benefitsGet } from '@polar-sh/sdk/funcs/benefitsGet.js'
import { discountsCreate } from '@polar-sh/sdk/funcs/discountsCreate.js'
import { eventsIngest } from '@polar-sh/sdk/funcs/eventsIngest.js'
import { type Billing, setupBilling } from '../../src/convex/integrations/billing'

// Stub the standalone Polar SDK functions the billing helpers call so nothing
// hits the network. `polar.getCustomerByUserId` is spied per-test on the
// constructed client instead.
vi.mock('@polar-sh/sdk/funcs/customersGetState.js', () => ({ customersGetState: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/benefitsGet.js', () => ({ benefitsGet: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/discountsCreate.js', () => ({ discountsCreate: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/eventsIngest.js', () => ({ eventsIngest: vi.fn() }))

const mockCustomersGetState = vi.mocked(customersGetState)
const mockBenefitsGet = vi.mocked(benefitsGet)
const mockDiscountsCreate = vi.mocked(discountsCreate)
const mockEventsIngest = vi.mocked(eventsIngest)

const fakeComponent = {} as never
const backend = {
  billing: { getByUser: 'ref:getByUser', upsert: 'ref:upsert', userByCustomer: 'ref:userByCustomer' },
} as never
const config = {
  getUserInfo: async () => ({ userId: 'u1', email: 'a@b.com' }),
  currentUserId: async () => 'u1',
} as never

function makeCtx() {
  return { runQuery: vi.fn(), runMutation: vi.fn() }
}

let billing: Billing
let getCustomerByUserId: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  billing = setupBilling(fakeComponent, backend, config)
  getCustomerByUserId = vi.spyOn(billing.polar, 'getCustomerByUserId')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('getCustomerState', () => {
  it('normalizes Polar customer state with live benefit metadata', async () => {
    getCustomerByUserId.mockResolvedValue({ id: 'cus_1' } as never)
    mockCustomersGetState.mockResolvedValue({
      ok: true,
      value: {
        activeSubscriptions: [{ productId: 'prod_pro' }],
        grantedBenefits: [{ id: 'g1', benefitId: 'ben_1', benefitType: 'custom' }],
        activeMeters: [{ meterId: 'm1', consumedUnits: 2, creditedUnits: 10, balance: 8 }],
      },
    } as never)
    mockBenefitsGet.mockResolvedValue({ ok: true, value: { metadata: { key: 'premium' } } } as never)

    const state = await billing.getCustomerState(makeCtx() as never, { userId: 'u1' })

    expect(state).toStrictEqual({
      customerId: 'cus_1',
      activeProductIds: ['prod_pro'],
      benefits: [{ id: 'g1', benefitId: 'ben_1', type: 'custom', metadata: { key: 'premium' } }],
      meters: [{ meterId: 'm1', consumedUnits: 2, creditedUnits: 10, balance: 8 }],
    })
  })

  it('returns an empty state when the user has no Polar customer', async () => {
    getCustomerByUserId.mockResolvedValue(null as never)

    const state = await billing.getCustomerState(makeCtx() as never, { userId: 'u1' })

    expect(state).toStrictEqual({ customerId: null, activeProductIds: [], benefits: [], meters: [] })
    expect(mockCustomersGetState).not.toHaveBeenCalled()
  })
})

describe('spendCredits', () => {
  it('throws when the user has no Polar customer', async () => {
    getCustomerByUserId.mockResolvedValue(null as never)
    await expect(
      billing.spendCredits(makeCtx() as never, { userId: 'u1', name: 'credits' }),
    ).rejects.toThrow(/No Polar customer/)
  })

  it('blocks the spend when the guarded meter balance is insufficient', async () => {
    getCustomerByUserId.mockResolvedValue({ id: 'cus_1' } as never)
    mockCustomersGetState.mockResolvedValue({
      ok: true,
      value: { activeMeters: [{ meterId: 'm1', consumedUnits: 0, creditedUnits: 1, balance: 1 }] },
    } as never)

    await expect(
      billing.spendCredits(makeCtx() as never, { userId: 'u1', name: 'credits', meterId: 'm1', value: 5 }),
    ).rejects.toThrow(/Insufficient credits/)
    expect(mockEventsIngest).not.toHaveBeenCalled()
  })

  it('ingests a credit-spend event when not guarded by a meter', async () => {
    getCustomerByUserId.mockResolvedValue({ id: 'cus_1' } as never)
    mockEventsIngest.mockResolvedValue({ ok: true, value: {} } as never)

    await billing.spendCredits(makeCtx() as never, { userId: 'u1', name: 'credits', metadata: { feature: 'ai' } })

    expect(mockEventsIngest).toHaveBeenCalledWith(
      expect.anything(),
      { events: [expect.objectContaining({ name: 'credits', customerId: 'cus_1', metadata: { feature: 'ai' } })] },
    )
  })

  it('propagates a failed events.ingest', async () => {
    getCustomerByUserId.mockResolvedValue({ id: 'cus_1' } as never)
    mockEventsIngest.mockResolvedValue({ ok: false, error: new Error('ingest failed') } as never)

    await expect(
      billing.spendCredits(makeCtx() as never, { userId: 'u1', name: 'credits' }),
    ).rejects.toThrow('ingest failed')
  })
})

describe('createDiscount', () => {
  it('returns the created discount id and code', async () => {
    mockDiscountsCreate.mockResolvedValue({ ok: true, value: { id: 'disc_1', code: 'SAVE10' } } as never)
    expect(await billing.createDiscount({ name: 'Launch' } as never)).toStrictEqual({ id: 'disc_1', code: 'SAVE10' })
  })

  it('normalizes a missing code to null', async () => {
    mockDiscountsCreate.mockResolvedValue({ ok: true, value: { id: 'disc_2', code: null } } as never)
    expect(await billing.createDiscount({ name: 'Internal' } as never)).toStrictEqual({ id: 'disc_2', code: null })
  })

  it('propagates a failed discounts.create', async () => {
    mockDiscountsCreate.mockResolvedValue({ ok: false, error: new Error('bad discount') } as never)
    await expect(billing.createDiscount({ name: 'x' } as never)).rejects.toThrow('bad discount')
  })
})

describe('webhook refresh handler', () => {
  function primeRefresh() {
    getCustomerByUserId.mockResolvedValue({ id: 'cus_1' } as never)
    mockCustomersGetState.mockResolvedValue({
      ok: true,
      value: { activeSubscriptions: [], grantedBenefits: [], activeMeters: [] },
    } as never)
  }

  it('resolves the user from the customer metadata and refreshes the cache', async () => {
    primeRefresh()
    const ctx = makeCtx()
    const handler = billing.webhookEvents['order.created']!

    await handler(ctx as never, { data: { customer: { id: 'cus_1', metadata: { userId: 'u1' } } } } as never)

    expect(ctx.runQuery).not.toHaveBeenCalled() // metadata short-circuits the cache lookup
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:upsert', expect.objectContaining({ userId: 'u1' }))
  })

  it('falls back to the cache to resolve the user from the customer id', async () => {
    primeRefresh()
    const ctx = makeCtx()
    ctx.runQuery.mockResolvedValue('u2')
    const handler = billing.webhookEvents['order.paid']!

    await handler(ctx as never, { data: { customerId: 'cus_2' } } as never)

    expect(ctx.runQuery).toHaveBeenCalledWith('ref:userByCustomer', { customerId: 'cus_2' })
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:upsert', expect.objectContaining({ userId: 'u2' }))
  })

  it('ignores events without a resolvable customer id', async () => {
    const ctx = makeCtx()
    const handler = billing.webhookEvents['subscription.updated']!

    await handler(ctx as never, { data: {} } as never)

    expect(ctx.runMutation).not.toHaveBeenCalled()
  })

  it('ignores events whose customer maps to no user', async () => {
    const ctx = makeCtx()
    ctx.runQuery.mockResolvedValue(null)
    const handler = billing.webhookEvents['subscription.canceled']!

    await handler(ctx as never, { data: { customerId: 'cus_unknown' } } as never)

    expect(ctx.runMutation).not.toHaveBeenCalled()
  })
})
