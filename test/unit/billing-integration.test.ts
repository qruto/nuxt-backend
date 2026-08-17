import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { customersGetState } from '@polar-sh/sdk/funcs/customersGetState.js'
import { benefitsGet } from '@polar-sh/sdk/funcs/benefitsGet.js'
import { discountsCreate } from '@polar-sh/sdk/funcs/discountsCreate.js'
import { eventsIngest } from '@polar-sh/sdk/funcs/eventsIngest.js'
import { customersList } from '@polar-sh/sdk/funcs/customersList.js'
import { customersCreate } from '@polar-sh/sdk/funcs/customersCreate.js'
import { customersUpdate } from '@polar-sh/sdk/funcs/customersUpdate.js'
import { checkoutsCreate } from '@polar-sh/sdk/funcs/checkoutsCreate.js'
import { type Billing, setupBilling } from '../../src/convex/integrations/billing'

// Stub the standalone provider SDK functions the billing helpers call so
// nothing hits the network. `provider.getCustomerByUserId` is spied per-test
// on the constructed client instead.
vi.mock('@polar-sh/sdk/funcs/customersGetState.js', () => ({ customersGetState: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/benefitsGet.js', () => ({ benefitsGet: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/discountsCreate.js', () => ({ discountsCreate: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/eventsIngest.js', () => ({ eventsIngest: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/customersList.js', () => ({ customersList: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/customersCreate.js', () => ({ customersCreate: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/customersUpdate.js', () => ({ customersUpdate: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/checkoutsCreate.js', () => ({ checkoutsCreate: vi.fn() }))

const mockCustomersGetState = vi.mocked(customersGetState)
const mockBenefitsGet = vi.mocked(benefitsGet)
const mockDiscountsCreate = vi.mocked(discountsCreate)
const mockEventsIngest = vi.mocked(eventsIngest)
const mockCustomersList = vi.mocked(customersList)
const mockCustomersCreate = vi.mocked(customersCreate)
const mockCustomersUpdate = vi.mocked(customersUpdate)
const mockCheckoutsCreate = vi.mocked(checkoutsCreate)

const components = {
  polar: { lib: { insertCustomer: 'ref:insertCustomer' } },
  backend: {
    billing: {
      getByUser: 'ref:getByUser',
      upsert: 'ref:upsert',
      userByCustomer: 'ref:userByCustomer',
      debit: 'ref:debit',
      settle: 'ref:settle',
      release: 'ref:release',
      credit: 'ref:credit',
      getBenefitMetadata: 'ref:getBenefitMetadata',
      upsertBenefitMetadata: 'ref:upsertBenefitMetadata',
    },
    gifts: {
      create: 'ref:gifts.create',
      markPaid: 'ref:gifts.markPaid',
      markClaimed: 'ref:gifts.markClaimed',
      listByEmail: 'ref:gifts.listByEmail',
      get: 'ref:gifts.get',
      resolveRecipient: 'ref:gifts.resolveRecipient',
    },
    email: { send: 'ref:email.send' },
  },
} as never
const config = {
  getUserInfo: async () => ({ userId: 'u1', email: 'a@b.com' }),
  currentUserId: async () => 'u1',
} as never

interface MakeCtxOptions {
  /** Result(s) for `cache.debit` — an array is consumed per call. */
  debit?: object | object[]
}

function makeCtx({ debit }: MakeCtxOptions = {}) {
  const debitResults = Array.isArray(debit) ? [...debit] : debit === undefined ? [] : [debit]
  const runQuery = vi.fn(async (ref: unknown): Promise<unknown> => {
    if (ref === 'ref:getBenefitMetadata') return []
    if (ref === 'ref:getByUser') return null
    return undefined
  })
  const runMutation = vi.fn(async (ref: unknown): Promise<unknown> => {
    if (ref === 'ref:debit') {
      return debitResults.length > 1 ? debitResults.shift() : debitResults[0] ?? { ok: true, balance: 99 }
    }
    return null
  })
  return { runQuery, runMutation }
}

let billing: Billing
let getCustomerByUserId: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  billing = setupBilling(components, config)
  getCustomerByUserId = vi.spyOn(billing.provider, 'getCustomerByUserId')
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
    ).rejects.toThrow(/No billing customer/)
  })

  it('blocks the spend when the guarded meter balance is insufficient', async () => {
    getCustomerByUserId.mockResolvedValue({ id: 'cus_1' } as never)
    const ctx = makeCtx({ debit: { ok: false, balance: 1, reason: 'insufficient' } })

    await expect(
      billing.spendCredits(ctx as never, { userId: 'u1', name: 'credits', meterId: 'm1', value: 5 }),
    ).rejects.toThrow(/Insufficient credits — balance 1, need 5/)
    expect(mockEventsIngest).not.toHaveBeenCalled()
    // Nothing was reserved, so nothing to release.
    expect(ctx.runMutation).not.toHaveBeenCalledWith('ref:release', expect.anything())
  })

  it('reserves, ingests, then settles a guarded spend', async () => {
    getCustomerByUserId.mockResolvedValue({ id: 'cus_1' } as never)
    mockEventsIngest.mockResolvedValue({ ok: true, value: {} } as never)
    const ctx = makeCtx({ debit: { ok: true, balance: 7 } })

    await billing.spendCredits(ctx as never, { userId: 'u1', name: 'credits', meterId: 'm1', value: 1, externalId: 'spend-1' })

    expect(ctx.runMutation).toHaveBeenCalledWith('ref:debit', { userId: 'u1', meterId: 'm1', amount: 1, externalId: 'spend-1' })
    expect(mockEventsIngest).toHaveBeenCalledWith(
      expect.anything(),
      { events: [expect.objectContaining({ name: 'credits', customerId: 'cus_1', externalId: 'spend-1' })] },
    )
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:settle', { userId: 'u1', externalId: 'spend-1' })
    expect(ctx.runMutation).not.toHaveBeenCalledWith('ref:release', expect.anything())
  })

  it('releases the reservation when ingestion fails — a failed run consumes nothing', async () => {
    getCustomerByUserId.mockResolvedValue({ id: 'cus_1' } as never)
    mockEventsIngest.mockRejectedValue(new Error('provider down'))
    const ctx = makeCtx({ debit: { ok: true, balance: 7 } })

    await expect(
      billing.spendCredits(ctx as never, { userId: 'u1', name: 'credits', meterId: 'm1', externalId: 'spend-2' }),
    ).rejects.toThrow('provider down')
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:release', { userId: 'u1', externalId: 'spend-2' })
    expect(ctx.runMutation).not.toHaveBeenCalledWith('ref:settle', expect.anything())
  })

  it('self-heals a cold cache: refreshes entitlements and retries the reservation once', async () => {
    getCustomerByUserId.mockResolvedValue({ id: 'cus_1' } as never)
    mockCustomersGetState.mockResolvedValue({ ok: true, value: { activeMeters: [{ meterId: 'm1', consumedUnits: 0, creditedUnits: 5, balance: 5 }] } } as never)
    mockEventsIngest.mockResolvedValue({ ok: true, value: {} } as never)
    const ctx = makeCtx({ debit: [{ ok: false, balance: 0, reason: 'no-row' }, { ok: true, balance: 4 }] })

    await billing.spendCredits(ctx as never, { userId: 'u1', name: 'credits', meterId: 'm1' })

    // The cold cache triggered one sync (upsert) before the successful retry.
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:upsert', expect.objectContaining({ userId: 'u1' }))
    expect(mockEventsIngest).toHaveBeenCalledTimes(1)
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:settle', expect.anything())
  })

  it('spends by configured meter name: sum meters ingest the amount property', async () => {
    const named = setupBilling(components, {
      ...(config as object),
      credits: { credits: { meterId: 'm_sum', property: 'amount' } },
    } as never)
    vi.spyOn(named.provider, 'getCustomerByUserId').mockResolvedValue({ id: 'cus_1' } as never)
    mockEventsIngest.mockResolvedValue({ ok: true, value: {} } as never)
    const ctx = makeCtx({ debit: { ok: true, balance: 10 } })

    await named.spendCredits(ctx as never, { userId: 'u1', meter: 'credits', value: 5 })

    expect(ctx.runMutation).toHaveBeenCalledWith('ref:debit', expect.objectContaining({ meterId: 'm_sum', amount: 5 }))
    expect(mockEventsIngest).toHaveBeenCalledWith(
      expect.anything(),
      { events: [expect.objectContaining({ name: 'credits', metadata: { amount: 5 } })] },
    )
  })

  it('rejects multi-credit spends on configured count meters and unknown meter names', async () => {
    const named = setupBilling(components, {
      ...(config as object),
      credits: { actions: { meterId: 'm_count' } },
    } as never)
    vi.spyOn(named.provider, 'getCustomerByUserId').mockResolvedValue({ id: 'cus_1' } as never)

    await expect(
      named.spendCredits(makeCtx() as never, { userId: 'u1', meter: 'actions', value: 3 }),
    ).rejects.toThrow(/counts events/)
    await expect(
      named.spendCredits(makeCtx() as never, { userId: 'u1', meter: 'nope' }),
    ).rejects.toThrow(/Unknown credit meter 'nope'/)
  })

  it('refunds sum meters with a compensating negative event and rejects count meters', async () => {
    const named = setupBilling(components, {
      ...(config as object),
      credits: {
        credits: { meterId: 'm_sum', property: 'amount' },
        actions: { meterId: 'm_count' },
      },
    } as never)
    vi.spyOn(named.provider, 'getCustomerByUserId').mockResolvedValue({ id: 'cus_1' } as never)
    mockEventsIngest.mockResolvedValue({ ok: true, value: {} } as never)
    const ctx = makeCtx()

    await named.refundCredits(ctx as never, { userId: 'u1', meter: 'credits', value: 3 })

    expect(mockEventsIngest).toHaveBeenCalledWith(
      expect.anything(),
      { events: [expect.objectContaining({ metadata: { amount: -3 } })] },
    )
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:credit', { userId: 'u1', meterId: 'm_sum', amount: 3 })

    await expect(
      named.refundCredits(makeCtx() as never, { userId: 'u1', meter: 'actions', value: 1 }),
    ).rejects.toThrow(/only sum meters/)
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

describe('billing entity resolution (billTo)', () => {
  function identityCtx(claims: Record<string, unknown> | null) {
    return {
      runQuery: vi.fn(),
      runMutation: vi.fn(),
      auth: { getUserIdentity: vi.fn(async () => claims) },
    }
  }

  function setup(config: Parameters<typeof setupBilling>[1] = {}) {
    const instance = setupBilling(components, config)
    const spy = vi.spyOn(instance.provider, 'getCustomerByUserId')
    spy.mockResolvedValue({ id: 'cus_entity' } as never)
    mockEventsIngest.mockResolvedValue({ ok: true, value: {} } as never)
    return { instance, spy }
  }

  it('bills the active workspace by default (zero config)', async () => {
    const { instance, spy } = setup()
    await instance.spendCredits(
      identityCtx({ subject: 'u1', activeOrganizationId: 'org-1' }) as never,
      { name: 'credits' },
    )
    expect(spy).toHaveBeenCalledWith(expect.anything(), 'org-1')
  })

  it('bills the signed-in user with billTo: "user"', async () => {
    const { instance, spy } = setup({ billTo: 'user' })
    await instance.spendCredits(
      identityCtx({ subject: 'u1', activeOrganizationId: 'org-1' }) as never,
      { name: 'credits' },
    )
    expect(spy).toHaveBeenCalledWith(expect.anything(), 'u1')
  })

  it('an explicit userId wins over identity resolution', async () => {
    const { instance, spy } = setup()
    await instance.spendCredits(
      identityCtx({ subject: 'u1', activeOrganizationId: 'org-1' }) as never,
      { userId: 'org-override', name: 'credits' },
    )
    expect(spy).toHaveBeenCalledWith(expect.anything(), 'org-override')
  })

  it('throws a clear error with no identity and no explicit userId', async () => {
    const { instance } = setup()
    await expect(
      instance.spendCredits(identityCtx(null) as never, { name: 'credits' }),
    ).rejects.toThrow(/no billing entity/)
  })

  it('org mode without an active workspace claim yields no entity', async () => {
    const { instance } = setup()
    await expect(
      instance.spendCredits(identityCtx({ subject: 'u1' }) as never, { name: 'credits' }),
    ).rejects.toThrow(/no billing entity/)
  })
})

describe('gifts', () => {
  function authedCtx(claims: Record<string, unknown> | null) {
    return {
      runQuery: vi.fn(),
      runMutation: vi.fn(),
      auth: { getUserIdentity: vi.fn(async () => claims) },
    }
  }
  const purchaser = { subject: 'u-buyer', email: 'buyer@example.com', name: 'Buyer', activeOrganizationId: 'org-buyer' }

  it('giftCheckout requires a signed-in purchaser', async () => {
    await expect(
      (billing.api.giftCheckout as unknown as (ctx: unknown, args: unknown) => Promise<unknown>)(
        authedCtx(null),
        { productIds: ['p1'], recipientEmail: 'r@example.com', origin: 'https://app', successUrl: 'https://app/done' },
      ),
    ).rejects.toThrow(/sign in/)
    expect(mockCheckoutsCreate).not.toHaveBeenCalled()
  })

  it('giftCheckout creates the gift record and a checkout for the recipient customer', async () => {
    mockCustomersList.mockResolvedValue({ ok: true, value: { result: { items: [] } } } as never)
    mockCustomersCreate.mockResolvedValue({ ok: true, value: { id: 'cus_recipient' } } as never)
    mockCheckoutsCreate.mockResolvedValue({ ok: true, value: { url: 'https://checkout' } } as never)
    const ctx = authedCtx(purchaser)
    ctx.runMutation.mockResolvedValue('gift-1')

    const result = await (billing.api.giftCheckout as unknown as (ctx: unknown, args: unknown) => Promise<{ url: string }>)(
      ctx,
      { productIds: ['p1'], recipientEmail: 'Recipient@Example.com', message: 'hi', origin: 'https://app', successUrl: 'https://app/done' },
    )

    expect(result).toStrictEqual({ url: 'https://checkout' })
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:gifts.create', expect.objectContaining({
      recipientEmail: 'recipient@example.com',
      purchaserUserId: 'u-buyer',
      billingCustomerId: 'cus_recipient',
    }))
    expect(mockCheckoutsCreate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      customerId: 'cus_recipient',
      metadata: expect.objectContaining({ gift: 'true', giftId: 'gift-1', purchaserUserId: 'u-buyer' }),
    }))
  })

  it('giftCheckout reuses an existing provider customer for the recipient email', async () => {
    mockCustomersList.mockResolvedValue({ ok: true, value: { result: { items: [{ id: 'cus_existing' }] } } } as never)
    mockCheckoutsCreate.mockResolvedValue({ ok: true, value: { url: 'https://checkout' } } as never)
    const ctx = authedCtx(purchaser)
    ctx.runMutation.mockResolvedValue('gift-1')

    await (billing.api.giftCheckout as unknown as (ctx: unknown, args: unknown) => Promise<unknown>)(
      ctx,
      { productIds: ['p1'], recipientEmail: 'r@example.com', origin: 'https://app', successUrl: 'https://app/done' },
    )

    expect(mockCustomersCreate).not.toHaveBeenCalled()
    expect(mockCheckoutsCreate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ customerId: 'cus_existing' }))
  })

  it('claimGift rejects a gift addressed to a different email', async () => {
    const ctx = authedCtx({ subject: 'u-r', email: 'me@example.com', activeOrganizationId: 'org-r' })
    ctx.runQuery.mockImplementation(async (ref: unknown) =>
      ref === 'ref:gifts.get'
        ? { id: 'gift-1', recipientEmail: 'other@example.com', status: 'paid', billingCustomerId: 'cus_g' }
        : null)

    await expect(
      (billing.functions.claimGift as unknown as (ctx: unknown, args: unknown) => Promise<unknown>)(ctx, { giftId: 'gift-1' }),
    ).rejects.toThrow(/different email/)
    expect(ctx.runMutation).not.toHaveBeenCalled()
  })

  it('claimGift attaches every paid gift for the caller email', async () => {
    getCustomerByUserId.mockResolvedValue(null as never)
    mockCustomersUpdate.mockResolvedValue({ ok: true, value: {} } as never)
    mockCustomersGetState.mockResolvedValue({ ok: true, value: {} } as never)
    const ctx = authedCtx({ subject: 'u-r', email: 'Me@Example.com', activeOrganizationId: 'org-r' })
    ctx.runQuery.mockImplementation(async (ref: unknown) =>
      ref === 'ref:gifts.listByEmail'
        ? [{ id: 'gift-1', recipientEmail: 'me@example.com', status: 'paid', billingCustomerId: 'cus_g' }]
        : null)

    const result = await (billing.functions.claimGift as unknown as (ctx: unknown, args: unknown) => Promise<{ claimed: number }>)(ctx, {})

    expect(result).toStrictEqual({ claimed: 1 })
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:insertCustomer', { id: 'cus_g', userId: 'org-r' })
    expect(mockCustomersUpdate).toHaveBeenCalledWith(expect.anything(), {
      id: 'cus_g',
      customerUpdate: { metadata: { userId: 'org-r' } },
    })
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:gifts.markClaimed', { giftId: 'gift-1', userId: 'u-r', entityId: 'org-r' })
    // The entitlement cache refreshes for the claiming entity.
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:upsert', expect.objectContaining({ userId: 'org-r' }))
  })

  it('claimGift refuses when the entity already bills through another customer', async () => {
    getCustomerByUserId.mockResolvedValue({ id: 'cus_other' } as never)
    const ctx = authedCtx({ subject: 'u-r', email: 'me@example.com', activeOrganizationId: 'org-r' })
    ctx.runQuery.mockImplementation(async (ref: unknown) =>
      ref === 'ref:gifts.get'
        ? { id: 'gift-1', recipientEmail: 'me@example.com', status: 'paid', billingCustomerId: 'cus_g' }
        : null)

    await expect(
      (billing.functions.claimGift as unknown as (ctx: unknown, args: unknown) => Promise<unknown>)(ctx, { giftId: 'gift-1' }),
    ).rejects.toThrow(/different billing profile/)
  })

  it('order.paid with gift metadata marks the gift paid, auto-attaches, and emails the recipient', async () => {
    getCustomerByUserId.mockResolvedValue(null as never)
    mockCustomersUpdate.mockResolvedValue({ ok: true, value: {} } as never)
    mockCustomersGetState.mockResolvedValue({ ok: true, value: {} } as never)
    const ctx = makeCtx()
    const gift = {
      id: 'gift-1',
      recipientEmail: 'r@example.com',
      purchaserName: 'Buyer',
      status: 'paid',
      billingCustomerId: 'cus_g',
    }
    ctx.runQuery.mockImplementation(async (ref: unknown) => {
      if (ref === 'ref:gifts.get') return gift
      if (ref === 'ref:gifts.resolveRecipient') return { userId: 'u-r', organizationId: 'org-r' }
      return null
    })

    await billing.webhookEvents['order.paid']!(ctx as never, {
      data: { id: 'order-1', metadata: { gift: 'true', giftId: 'gift-1' } },
    } as never)

    expect(ctx.runMutation).toHaveBeenCalledWith('ref:gifts.markPaid', { giftId: 'gift-1', billingOrderId: 'order-1' })
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:gifts.markClaimed', { giftId: 'gift-1', userId: 'u-r', entityId: 'org-r' })
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:email.send', expect.objectContaining({ to: 'r@example.com' }))
  })

  it('order.paid leaves an unknown recipient unclaimed but still notifies them', async () => {
    const ctx = makeCtx()
    ctx.runQuery.mockImplementation(async (ref: unknown) => {
      if (ref === 'ref:gifts.get') {
        return { id: 'gift-1', recipientEmail: 'new@example.com', status: 'paid', billingCustomerId: 'cus_g' }
      }
      return null // resolveRecipient: no account
    })

    await billing.webhookEvents['order.paid']!(ctx as never, {
      data: { id: 'order-1', metadata: { gift: 'true', giftId: 'gift-1' } },
    } as never)

    expect(ctx.runMutation).toHaveBeenCalledWith('ref:gifts.markPaid', expect.anything())
    expect(ctx.runMutation).not.toHaveBeenCalledWith('ref:gifts.markClaimed', expect.anything())
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:email.send', expect.objectContaining({ to: 'new@example.com' }))
  })

  it('order.paid without gift metadata skips the gift branch', async () => {
    const ctx = makeCtx()
    ctx.runQuery.mockResolvedValue(null)

    await billing.webhookEvents['order.paid']!(ctx as never, { data: { customerId: 'cus_x' } } as never)

    expect(ctx.runQuery).not.toHaveBeenCalledWith('ref:gifts.get', expect.anything())
  })

  it('getReceivedGifts lists gifts for the identity email, null when claimless', async () => {
    const gifts = [{ id: 'gift-1' }]
    const ctx = authedCtx({ subject: 'u-r', email: 'Me@Example.com' })
    ctx.runQuery.mockResolvedValue(gifts)

    const fn = billing.functions.getReceivedGifts as unknown as (ctx: unknown, args: unknown) => Promise<unknown>
    expect(await fn(ctx, {})).toStrictEqual(gifts)
    expect(ctx.runQuery).toHaveBeenCalledWith('ref:gifts.listByEmail', { email: 'me@example.com' })

    expect(await fn(authedCtx(null), {})).toBeNull()
  })
})

describe('billing event hooks', () => {
  function refreshableCtx() {
    const ctx = makeCtx()
    // handleRefreshEvent path: metadata carries the entity, state fetch mocked.
    getCustomerByUserId.mockResolvedValue(null as never)
    return ctx
  }

  it('runs the consumer hook after the built-in cache refresh', async () => {
    const order: string[] = []
    const onPaid = vi.fn(async () => {
      order.push('hook')
    })
    billing = setupBilling(components, { events: { 'order.paid': onPaid } })
    getCustomerByUserId = vi.spyOn(billing.provider, 'getCustomerByUserId')
    getCustomerByUserId.mockResolvedValue(null as never)
    const ctx = makeCtx()
    ctx.runMutation.mockImplementation(async () => {
      order.push('refresh')
    })

    await billing.webhookEvents['order.paid']!(ctx as never, {
      data: { customerId: 'cus_1', customer: { metadata: { userId: 'org-1' } } },
    } as never)

    expect(onPaid).toHaveBeenCalled()
    expect(order).toStrictEqual(['refresh', 'hook'])
  })

  it('mounts consumer-only event types outside the refresh set', async () => {
    const onCheckout = vi.fn()
    billing = setupBilling(components, { events: { 'checkout.created': onCheckout } as never })
    const ctx = refreshableCtx()

    const handler = billing.webhookEvents['checkout.created' as keyof typeof billing.webhookEvents]!
    await handler(ctx as never, { data: {} } as never)

    expect(onCheckout).toHaveBeenCalled()
    // No refresh for non-refresh events.
    expect(ctx.runMutation).not.toHaveBeenCalled()
  })

  it('keeps refreshing without any consumer hooks (default)', async () => {
    billing = setupBilling(components, {})
    getCustomerByUserId = vi.spyOn(billing.provider, 'getCustomerByUserId')
    getCustomerByUserId.mockResolvedValue(null as never)
    const ctx = makeCtx()

    await billing.webhookEvents['subscription.active']!(ctx as never, {
      data: { customerId: 'cus_1', customer: { metadata: { userId: 'org-1' } } },
    } as never)

    expect(ctx.runMutation).toHaveBeenCalledWith('ref:upsert', expect.objectContaining({ userId: 'org-1' }))
  })
})
