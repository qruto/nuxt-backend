import { Polar } from '@convex-dev/polar'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { customersGet } from '@polar-sh/sdk/funcs/customersGet.js'
import { customersGetStateExternal } from '@polar-sh/sdk/funcs/customersGetStateExternal.js'
import { customersUpdate } from '@polar-sh/sdk/funcs/customersUpdate.js'
import { membersListMembers } from '@polar-sh/sdk/funcs/membersListMembers.js'
import { benefitsGet } from '@polar-sh/sdk/funcs/benefitsGet.js'
import { discountsCreate } from '@polar-sh/sdk/funcs/discountsCreate.js'
import { eventsIngest } from '@polar-sh/sdk/funcs/eventsIngest.js'
import { checkoutsCreate } from '@polar-sh/sdk/funcs/checkoutsCreate.js'
import { customerSessionsCreate } from '@polar-sh/sdk/funcs/customerSessionsCreate.js'
import { type Billing, type BillingEntityCtx, setupBilling, type SpendReservation } from '../../src/convex/integrations/billing'
import { setupEmail } from '../../src/convex/integrations/email'
import { backendError, getBackendError } from '../../src/convex/errors'

// Stub the standalone provider SDK functions the billing helpers call so
// nothing hits the network. `provider.getCustomerByUserId` is spied per-test
// on the constructed client instead.
vi.mock('@polar-sh/sdk/funcs/customersGet.js', () => ({ customersGet: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/customersGetStateExternal.js', () => ({ customersGetStateExternal: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/customersUpdate.js', () => ({ customersUpdate: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/membersListMembers.js', () => ({ membersListMembers: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/benefitsGet.js', () => ({ benefitsGet: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/discountsCreate.js', () => ({ discountsCreate: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/eventsIngest.js', () => ({ eventsIngest: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/checkoutsCreate.js', () => ({ checkoutsCreate: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/customerSessionsCreate.js', () => ({ customerSessionsCreate: vi.fn() }))

const mockCustomersGetState = vi.mocked(customersGetStateExternal)
const mockCustomersGet = vi.mocked(customersGet)
const mockCustomersUpdate = vi.mocked(customersUpdate)
const mockMembersList = vi.mocked(membersListMembers)
const mockBenefitsGet = vi.mocked(benefitsGet)
const mockDiscountsCreate = vi.mocked(discountsCreate)
const mockEventsIngest = vi.mocked(eventsIngest)
const mockCheckoutsCreate = vi.mocked(checkoutsCreate)
const mockCustomerSessionsCreate = vi.mocked(customerSessionsCreate)

const components = {
  polar: { lib: { insertCustomer: 'ref:insertCustomer' } },
  backend: {
    // The auth tables' adapter: the fresh member and role reads.
    adapter: { findOne: 'ref:findOne' },
    billing: {
      getByUser: 'ref:getByUser',
      entityProfile: 'ref:entityProfile',
      markTrialUsed: 'ref:markTrialUsed',
      upsert: 'ref:upsert',
      userByCustomer: 'ref:userByCustomer',
      debit: 'ref:debit',
      settle: 'ref:settle',
      finalize: 'ref:finalize',
      release: 'ref:release',
      credit: 'ref:credit',
      getBenefitMetadata: 'ref:getBenefitMetadata',
      upsertBenefitMetadata: 'ref:upsertBenefitMetadata',
      deleteByUser: 'ref:deleteByUser',
      recordSubscriptionChange: 'ref:recordSubscriptionChange',
    },
    gifts: {
      create: 'ref:gifts.create',
      markPaid: 'ref:gifts.markPaid',
      markNotified: 'ref:gifts.markNotified',
      markClaimed: 'ref:gifts.markClaimed',
      listByEmail: 'ref:gifts.listByEmail',
      get: 'ref:gifts.get',
      resolveRecipient: 'ref:gifts.resolveRecipient',
    },
    email: { send: 'ref:email.send' },
  },
} as never
// The app's email instance: a gift notification lands on ref:email.send.
const email = setupEmail(components)
const config = {
  email,
  // A token stands in for a configured deployment — every provider call is
  // mocked, but the operations that write at the provider refuse to run
  // without one.
  accessToken: 'oat_test',
  // What the app sells (a plan and a credit pack), and where a buyer may land.
  products: { pro: 'p1', credits500: 'p_pack' },
  trustedOrigins: ['https://app'],
} as never

interface MakeCtxOptions {
  /** Result(s) for `cache.debit` — an array is consumed per call. */
  debit?: object | object[]
  /** The caller's role in the workspace, read fresh; `null` for someone no longer a member. Default `'owner'`. */
  memberRole?: string | null
}

/**
 * The auth tables as the adapter answers `findOne` for one caller: their
 * account (`null` once deleted), and their role in each workspace they
 * belong to — no row for any other.
 */
function authTables(memberships: Record<string, string>, account: { role?: string, banned?: boolean } | null = { role: 'user', banned: false }) {
  return (ref: unknown, args: unknown) => {
    if (ref !== 'ref:findOne') return undefined
    const { model, where = [] } = (args ?? {}) as { model?: string, where?: Array<{ field: string, value: unknown }> }
    if (model === 'user') return account
    const workspace = where.find(clause => clause.field === 'organizationId')?.value as string
    return model === 'member' && memberships[workspace] ? { role: memberships[workspace] } : null
  }
}

/** A caller who holds `role` in `org-1`, the workspace the test claims name, and no other; `null` for one removed from it. */
function memberRead(role: string | null) {
  return authTables(role === null ? {} : { 'org-1': role })
}

function makeCtx({ debit, memberRole = 'owner', finalized = true }: MakeCtxOptions & { finalized?: boolean } = {}) {
  const debitResults = Array.isArray(debit) ? [...debit] : debit === undefined ? [] : [debit]
  const member = memberRead(memberRole)
  const runQuery = vi.fn(async (ref: unknown, args?: unknown): Promise<unknown> => {
    if (ref === 'ref:getBenefitMetadata') return []
    if (ref === 'ref:getByUser') return null
    return member(ref, args)
  })
  const runMutation = vi.fn(async (ref: unknown): Promise<unknown> => {
    if (ref === 'ref:debit') {
      return debitResults.length > 1 ? debitResults.shift() : debitResults[0] ?? { ok: true, balance: 99 }
    }
    if (ref === 'ref:finalize') return { settled: finalized, released: 0, balance: 0, balanceBefore: 0 }
    // The stamp lands after the gift email went out.
    if (ref === 'ref:gifts.markNotified') return true
    return null
  })
  return { runQuery, runMutation }
}

let billing: Billing
let getCustomerByUserId: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  billing = setupBilling(components, config)
  getCustomerByUserId = vi.spyOn(Polar.prototype, 'getCustomerByUserId')
  // A mapped customer is already keyed by its entity's id.
  mockCustomersGet.mockImplementation((async (_client: unknown, { id }: { id: string }) => ({ ok: true, value: { id, externalId: 'team-7', metadata: {} } })) as never)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('getCustomerState', () => {
  it('normalizes Polar customer state with live benefit metadata', async () => {
    mockCustomersGetState.mockResolvedValue({
      ok: true,
      value: {
        id: 'cus_1',
        activeSubscriptions: [{ productId: 'prod_pro' }],
        grantedBenefits: [{ id: 'g1', benefitId: 'ben_1', benefitType: 'custom' }],
        activeMeters: [{ meterId: 'm1', consumedUnits: 2, creditedUnits: 10, balance: 8 }],
      },
    } as never)
    mockBenefitsGet.mockResolvedValue({ ok: true, value: { metadata: { key: 'premium' } } } as never)

    const state = await billing.getCustomerState(makeCtx() as never, { userId: 'u1' })

    // Read by the entity's id, the customer's external id.
    expect(mockCustomersGetState).toHaveBeenCalledWith(expect.anything(), { externalId: 'u1' })
    expect(state).toStrictEqual({
      customerId: 'cus_1',
      activeProductIds: ['prod_pro'],
      // The provider's type, and what it gives in neutral words.
      benefits: [{ id: 'g1', benefitId: 'ben_1', type: 'custom', kind: 'custom', metadata: { key: 'premium' } }],
      meters: [{ meterId: 'm1', consumedUnits: 2, creditedUnits: 10, balance: 8 }],
    })
  })

  it('joins the granting subscription’s period and the benefit’s rollover onto each meter', async () => {
    getCustomerByUserId.mockResolvedValue({ id: 'cus_1' } as never)
    const start = new Date('2026-03-01T00:00:00.000Z')
    const end = new Date('2026-04-01T00:00:00.000Z')
    mockCustomersGetState.mockResolvedValue({
      ok: true,
      value: {
        // A meter has no period of its own in the provider's model — the cycle
        // lives on the subscription, which lists the meters it covers.
        activeSubscriptions: [{
          productId: 'prod_pro',
          currentPeriodStart: start,
          currentPeriodEnd: end,
          meters: [{ meterId: 'm1' }],
        }],
        grantedBenefits: [{ id: 'g1', benefitId: 'ben_credits', benefitType: 'meter_credit' }],
        activeMeters: [
          { meterId: 'm1', consumedUnits: 2, creditedUnits: 10, balance: 8 },
          // Bought as a one-time pack: no subscription, so no cycle at all.
          { meterId: 'm2', consumedUnits: 0, creditedUnits: 5, balance: 5 },
        ],
      },
    } as never)
    mockBenefitsGet.mockResolvedValue({
      ok: true,
      value: { metadata: {}, type: 'meter_credit', properties: { meterId: 'm1', units: 10, rollover: false } },
    } as never)

    const state = await billing.getCustomerState(makeCtx() as never, { userId: 'u1' })

    expect(state.meters).toStrictEqual([
      {
        meterId: 'm1',
        consumedUnits: 2,
        creditedUnits: 10,
        balance: 8,
        cycleStart: start.getTime(),
        cycleEnd: end.getTime(),
        rollover: false,
      },
      { meterId: 'm2', consumedUnits: 0, creditedUnits: 5, balance: 5 },
    ])
  })

  it('never says a balance expires when a pack bought on top of a plan\'s allowance rolls over', async () => {
    getCustomerByUserId.mockResolvedValue({ id: 'cus_1' } as never)
    const end = new Date('2026-04-01T00:00:00.000Z')
    const meters = [{ meterId: 'm1', consumedUnits: 0, creditedUnits: 600, balance: 600 }]
    mockCustomersGetState.mockResolvedValue({
      ok: true,
      value: {
        activeSubscriptions: [{ productId: 'prod_pro', currentPeriodEnd: end, meters: [{ meterId: 'm1' }] }],
        grantedBenefits: [
          { id: 'g1', benefitId: 'ben_plan', benefitType: 'meter_credit' },
          { id: 'g2', benefitId: 'ben_pack', benefitType: 'meter_credit' },
        ],
        activeMeters: meters,
      },
    } as never)
    const rollover: Record<string, boolean> = { ben_plan: false, ben_pack: true }
    mockBenefitsGet.mockImplementation((async (_client: unknown, { id }: { id: string }) =>
      ({ ok: true, value: { metadata: {}, type: 'meter_credit', properties: { meterId: 'm1', units: 100, rollover: rollover[id] } } })) as never)

    // Whichever read lands last, the pack's credits keep: no expiry.
    expect((await billing.getCustomerState(makeCtx() as never, { userId: 'u1' })).meters[0]?.rollover).toBe(true)

    // And with only the plan's benefit read this pass, nothing is said either way.
    mockBenefitsGet.mockImplementation((async (_client: unknown, { id }: { id: string }) =>
      (id === 'ben_plan'
        ? { ok: true, value: { metadata: {}, type: 'meter_credit', properties: { meterId: 'm1', units: 100, rollover: false } } }
        : { ok: false, error: { statusCode: 500 } })) as never)
    expect((await billing.getCustomerState(makeCtx() as never, { userId: 'u1' })).meters[0]).not.toHaveProperty('rollover')
  })

  it('keys a customer from before 0.2 on the first read, then reads it by the entity\'s id', async () => {
    getCustomerByUserId.mockResolvedValue({ id: 'cus_old' } as never)
    mockCustomersGetState
      .mockResolvedValueOnce({ ok: false, error: { statusCode: 404 } } as never)
      .mockResolvedValueOnce({ ok: true, value: { id: 'cus_old', activeSubscriptions: [], grantedBenefits: [], activeMeters: [] } } as never)
    mockCustomersGet.mockResolvedValue({ ok: true, value: { id: 'cus_old', externalId: null, metadata: {} } } as never)
    mockCustomersUpdate.mockResolvedValue({ ok: true, value: { id: 'cus_old' } } as never)

    const state = await billing.getCustomerState(makeCtx() as never, { userId: 'u1' })

    expect(mockCustomersUpdate).toHaveBeenCalledWith(expect.anything(), { id: 'cus_old', customerUpdate: { externalId: 'u1', metadata: { userId: 'u1' } } })
    expect(state.customerId).toBe('cus_old')
  })

  it('reads an entity mapped onto another entity\'s customer as having none', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    getCustomerByUserId.mockResolvedValue({ id: 'cus_shared' } as never)
    mockCustomersGetState.mockResolvedValue({ ok: false, error: { statusCode: 404 } } as never)
    mockCustomersGet.mockResolvedValue({ ok: true, value: { id: 'cus_shared', externalId: 'org-0', metadata: {} } } as never)

    expect(await billing.getCustomerState(makeCtx() as never, { userId: 'org-1' })).toStrictEqual({ customerId: null, activeProductIds: [], benefits: [], meters: [] })
    expect(mockCustomersUpdate).not.toHaveBeenCalled()
  })

  it('returns an empty state when no provider customer carries the entity\'s id', async () => {
    mockCustomersGetState.mockResolvedValue({ ok: false, error: Object.assign(new Error('Not found'), { statusCode: 404, error: 'ResourceNotFound' }) } as never)

    const state = await billing.getCustomerState(makeCtx() as never, { userId: 'u1' })

    expect(state).toStrictEqual({ customerId: null, activeProductIds: [], benefits: [], meters: [] })
    expect(mockBenefitsGet).not.toHaveBeenCalled()
  })
})

describe('spendCredits', () => {
  it('refuses as not_ready (no_customer) when the entity has no provider customer: a retry would not change it', async () => {
    getCustomerByUserId.mockResolvedValue(null as never)
    const refusal = await billing.spendCredits(makeCtx() as never, { userId: 'u1', name: 'credits' }).catch((error: unknown) => error)
    expect(refusal).toMatchObject({ message: expect.stringMatching(/No billing customer/) })
    expect(getBackendError(refusal)).toEqual({
      code: 'not_ready',
      data: { reason: 'no_customer' },
      message: 'Nothing to show yet — this opens after your first purchase.',
    })
  })

  it('refuses as not_ready (not_synced) when the balance never synced and may not refresh here', async () => {
    const meters = setupBilling(components, { ...(config as object), credits: { credits: { meterId: 'm1' } } } as never)
    const refusal = await meters.reserveCredits(makeCtx({ debit: { ok: false, reason: 'no-row' } }) as never, { userId: 'org-1', meter: 'credits', allowRefresh: false })
      .catch((error: unknown) => error)
    expect(getBackendError(refusal)).toMatchObject({ code: 'not_ready', data: { reason: 'not_synced' } })
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
      { events: [expect.objectContaining({ name: 'credits', externalCustomerId: 'u1', externalId: 'spend-1' })] },
    )
    // Settling carries the final amount so the component can hand back an
    // over-reserved remainder in the same transaction.
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:finalize', { userId: 'u1', externalId: 'spend-1', finalAmount: 1 })
    expect(ctx.runMutation).not.toHaveBeenCalledWith('ref:release', expect.anything())
  })

  it('forwards allowOverage to the debit so a pay-as-you-go meter can go negative', async () => {
    getCustomerByUserId.mockResolvedValue({ id: 'cus_1' } as never)
    mockEventsIngest.mockResolvedValue({ ok: true, value: {} } as never)
    const ctx = makeCtx({ debit: { ok: true, balance: -3 } })

    await billing.spendCredits(ctx as never, {
      userId: 'u1',
      name: 'credits',
      meterId: 'm1',
      allowOverage: true,
      externalId: 'spend-overage',
    })

    expect(ctx.runMutation).toHaveBeenCalledWith('ref:debit', {
      userId: 'u1',
      meterId: 'm1',
      amount: 1,
      externalId: 'spend-overage',
      allowOverage: true,
    })
  })

  it('settles at the final amount when the actual spend came in under the estimate', async () => {
    getCustomerByUserId.mockResolvedValue({ id: 'cus_1' } as never)
    mockEventsIngest.mockResolvedValue({ ok: true, value: {} } as never)
    const ctx = makeCtx({ debit: { ok: true, balance: 5 } })
    const named = setupBilling(components, {
      ...(config as object),
      credits: { credits: { meterId: 'm_sum', property: 'amount' } },
    } as never)
    vi.spyOn(Polar.prototype, 'getCustomerByUserId').mockResolvedValue({ id: 'cus_1' } as never)

    const reservation = await named.reserveCredits(ctx as never, { userId: 'u1', meter: 'credits', value: 10, externalId: 'est-1' })
    await named.settleSpend(ctx as never, reservation, { finalAmount: 4 })

    // The event bills the actual amount, and the reservation closes at it —
    // the estimate stays the ceiling.
    expect(mockEventsIngest).toHaveBeenCalledWith(
      expect.anything(),
      { events: [expect.objectContaining({ metadata: { amount: 4 } })] },
    )
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:finalize', { userId: 'u1', externalId: 'est-1', finalAmount: 4 })
  })

  it('releases the reservation when ingestion fails — a failed run consumes nothing', async () => {
    getCustomerByUserId.mockResolvedValue({ id: 'cus_1' } as never)
    mockEventsIngest.mockRejectedValue(new Error('provider down'))
    const ctx = makeCtx({ debit: { ok: true, balance: 7 } })

    await expect(
      billing.spendCredits(ctx as never, { userId: 'u1', name: 'credits', meterId: 'm1', externalId: 'spend-2' }),
    ).rejects.toThrow('provider down')
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:release', { userId: 'u1', externalId: 'spend-2' })
    expect(ctx.runMutation).not.toHaveBeenCalledWith('ref:finalize', expect.anything())
  })

  it('takes the credits from the cache again when the reservation was gone by the time the event landed', async () => {
    getCustomerByUserId.mockResolvedValue({ id: 'cus_1' } as never)
    mockEventsIngest.mockResolvedValue({ ok: true, value: {} } as never)
    // A first attempt's failed ingest released the reservation; this one landed.
    const ctx = makeCtx({ debit: { ok: true, balance: 2 }, finalized: false })
    await billing.settleSpend(ctx as never, { entityId: 'u1', externalId: 'job-1', reserved: true, meterId: 'm1', value: 3 }, { name: 'credits' })
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:debit', { userId: 'u1', meterId: 'm1', amount: 3, externalId: 'job-1', allowOverage: true })
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:settle', { userId: 'u1', externalId: 'job-1', finalAmount: 3 })
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
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:finalize', expect.anything())
  })

  it('spends by configured meter name: sum meters ingest the amount property', async () => {
    const named = setupBilling(components, {
      ...(config as object),
      credits: { credits: { meterId: 'm_sum', property: 'amount' } },
    } as never)
    vi.spyOn(Polar.prototype, 'getCustomerByUserId').mockResolvedValue({ id: 'cus_1' } as never)
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
    vi.spyOn(Polar.prototype, 'getCustomerByUserId').mockResolvedValue({ id: 'cus_1' } as never)

    await expect(
      named.spendCredits(makeCtx() as never, { userId: 'u1', meter: 'actions', value: 3 }),
    ).rejects.toThrow(/counts events/)
    // Refused as a catalog not synced yet, which the pages word for people.
    const unknown = named.spendCredits(makeCtx() as never, { userId: 'u1', meter: 'nope' })
    await expect(unknown).rejects.toThrow(/Unknown credit meter 'nope'/)
    await expect(unknown).rejects.toMatchObject({ data: { code: 'not_ready', reason: 'no_catalog' } })
  })

  it('refunds sum meters with a compensating negative event and rejects count meters', async () => {
    const named = setupBilling(components, {
      ...(config as object),
      credits: {
        credits: { meterId: 'm_sum', property: 'amount' },
        actions: { meterId: 'm_count' },
      },
    } as never)
    vi.spyOn(Polar.prototype, 'getCustomerByUserId').mockResolvedValue({ id: 'cus_1' } as never)
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
      { events: [expect.objectContaining({ name: 'credits', externalCustomerId: 'u1', metadata: { feature: 'ai' } })] },
    )
  })

  it('refuses a failed events.ingest as unavailable, without the provider\'s words', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    getCustomerByUserId.mockResolvedValue({ id: 'cus_1' } as never)
    mockEventsIngest.mockResolvedValue({ ok: false, error: new Error('ingest failed') } as never)

    const refusal = await billing.spendCredits(makeCtx() as never, { userId: 'u1', name: 'credits' }).catch((error: unknown) => error)
    expect(getBackendError(refusal)).toMatchObject({ code: 'unavailable', data: { service: 'billing', reason: 'provider_refused' } })
    expect(String(refusal)).not.toContain('ingest failed')
  })
})

// A negative spend credits the cached balance and ingests a usage event that
// grants credits; a NaN leaves the balance NaN, after which every `balance <
// amount` guard is false and every spend passes. Amounts are refused at every
// entry point, before the cache or the provider sees them.
describe('credit amounts are finite and above zero', () => {
  const invalid = [
    ['negative', -5],
    ['zero', 0],
    ['NaN', Number.NaN],
    ['infinite', Number.POSITIVE_INFINITY],
  ] as const

  it.each(invalid)('spendCredits refuses a %s value', async (_label, value) => {
    getCustomerByUserId.mockResolvedValue({ id: 'cus_1' } as never)
    const ctx = makeCtx()

    await expect(billing.spendCredits(ctx as never, { userId: 'u1', name: 'credits', meterId: 'm1', value }))
      .rejects.toThrow(/spendCredits: `value` must be a finite number above zero/)
    expect(ctx.runMutation).not.toHaveBeenCalled()
    expect(mockEventsIngest).not.toHaveBeenCalled()
  })

  it.each(invalid)('reserveCredits refuses a %s value on an unguarded spend as well', async (_label, value) => {
    const ctx = makeCtx()

    await expect(billing.reserveCredits(ctx as never, { userId: 'u1', value })).rejects.toThrow(/must be a finite number above zero/)
    expect(ctx.runMutation).not.toHaveBeenCalled()
  })

  // A reservation is plain serializable data — it can arrive from another
  // function, or from a bug — so settling checks it before ingesting on it.
  it.each(invalid)('settleSpend refuses a forged reservation whose value is %s', async (_label, value) => {
    getCustomerByUserId.mockResolvedValue({ id: 'cus_1' } as never)
    const ctx = makeCtx()
    const forged: SpendReservation = { entityId: 'u1', externalId: 'forged', reserved: true, meterId: 'm1', value }

    await expect(billing.settleSpend(ctx as never, forged, { name: 'credits' }))
      .rejects.toThrow(/settleSpend: the reservation's `value` must be a finite number above zero/)
    expect(mockEventsIngest).not.toHaveBeenCalled()
    expect(ctx.runMutation).not.toHaveBeenCalled()
  })

  it.each([
    ['negative', -1],
    ['NaN', Number.NaN],
    ['infinite', Number.POSITIVE_INFINITY],
  ])('settleSpend refuses a %s finalAmount', async (_label, finalAmount) => {
    getCustomerByUserId.mockResolvedValue({ id: 'cus_1' } as never)
    const ctx = makeCtx()
    const reservation: SpendReservation = { entityId: 'u1', externalId: 'r1', reserved: true, meterId: 'm1', value: 10 }

    await expect(billing.settleSpend(ctx as never, reservation, { name: 'credits', finalAmount }))
      .rejects.toThrow(/settleSpend: `finalAmount` must be a finite number of zero or more/)
    expect(mockEventsIngest).not.toHaveBeenCalled()
    expect(ctx.runMutation).not.toHaveBeenCalled()
  })

  it('settleSpend at a final amount of zero ingests nothing and hands the whole reservation back', async () => {
    const ctx = makeCtx()
    const reservation: SpendReservation = { entityId: 'u1', externalId: 'free', reserved: true, meterId: 'm1', value: 10 }

    await billing.settleSpend(ctx as never, reservation, { name: 'credits', finalAmount: 0 })

    expect(mockEventsIngest).not.toHaveBeenCalled()
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:settle', { userId: 'u1', externalId: 'free', finalAmount: 0 })
  })

  it.each(invalid)('refundCredits refuses a %s value — a negative refund would be a charge', async (_label, value) => {
    const named = setupBilling(components, {
      ...(config as object),
      credits: { credits: { meterId: 'm_sum', property: 'amount' } },
    } as never)
    vi.spyOn(Polar.prototype, 'getCustomerByUserId').mockResolvedValue({ id: 'cus_1' } as never)
    const ctx = makeCtx()

    await expect(named.refundCredits(ctx as never, { userId: 'u1', meter: 'credits', value }))
      .rejects.toThrow(/refundCredits: `value` must be a finite number above zero/)
    expect(mockEventsIngest).not.toHaveBeenCalled()
    expect(ctx.runMutation).not.toHaveBeenCalled()
  })
})

// `email` is required by type, but an import cycle through email.ts can still
// hand it over undefined — which, unchecked, fails only when a gift is paid.
describe('setupBilling checks its email at runtime', () => {
  it.each([
    ['missing', undefined],
    ['not an email instance', {}],
    ['one whose sendTemplate is not a function', { sendTemplate: 'nope' }],
  ])('throws at setup when `email` is %s, naming the import cycle', (_label, value) => {
    expect(() => setupBilling(components, { ...(config as object), email: value } as never))
      .toThrow(/`email` is not a setupEmail instance[\s\S]*import cycle runs through email\.ts/)
  })

  it('takes the app’s setupEmail instance', () => {
    expect(() => setupBilling(components, { email: setupEmail(components) })).not.toThrow()
  })
})

describe('forgetEntity', () => {
  it('deletes the entity’s entitlement cache row through the component', async () => {
    const ctx = makeCtx()
    await billing.forgetEntity(ctx as never, 'u1')
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:deleteByUser', { userId: 'u1' })
  })
})

describe('getCredits', () => {
  // The provider reports every meter the customer was ever credited on. One
  // the catalog has since retired comes back nameless — and a client asking
  // for "the balance" takes the first meter, so the configured ones lead.
  it('returns configured meters first, each named, unknown ones after', async () => {
    const named = setupBilling(components, {
      ...(config as object),
      credits: { credits: { meterId: 'm_current' } },
      billTo: 'user',
    } as never)
    const ctx = {
      auth: { getUserIdentity: async () => ({ subject: 'u1', email: 'a@b.com' }) },
      runQuery: vi.fn(async (ref: unknown, args?: unknown) => ref === 'ref:getByUser'
        ? {
            customerId: 'cus_1',
            activeProductIds: [],
            benefits: [],
            meters: [
              { meterId: 'm_retired', balance: 0, creditedUnits: 0, consumedUnits: 0 },
              { meterId: 'm_current', balance: 50, creditedUnits: 50, consumedUnits: 0 },
            ],
          }
        : authTables({})(ref, args) ?? null),
    }

    const result = await (named.api.getCredits as unknown as { _handler: (ctx: unknown, args: unknown) => Promise<{ meters: Array<{ meterId: string, name?: string, balance: number }> } | null> })._handler(ctx, {}) as { meters: Array<{ meterId: string, name?: string, balance: number }> }

    expect(result.meters.map(meter => meter.meterId)).toStrictEqual(['m_current', 'm_retired'])
    expect(result.meters[0]).toMatchObject({ name: 'credits', balance: 50 })
    expect(result.meters[1]!.name).toBeUndefined()
  })
})

describe('syncProducts', () => {
  // A fresh deployment has never seen a `product.*` webhook, so the reactive
  // products table is empty and every pricing page renders "no plans" until
  // this runs once. Every doc names the same caller: `npx convex run`.
  it('is internal — the ops bootstrap the docs tell you to run, not a client action', () => {
    expect(billing.api.syncProducts.isInternal).toBe(true)
    expect(billing.api.syncProducts.isAction).toBe(true)
  })

  it('pulls the provider catalog without asking for an identity', async () => {
    const ctx = { runQuery: vi.fn(), runMutation: vi.fn(), runAction: vi.fn(), auth: { getUserIdentity: vi.fn(async () => null) } }
    await expect((billing.api.syncProducts as unknown as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler(ctx, {})).resolves.toBeNull()
    expect(ctx.auth.getUserIdentity).not.toHaveBeenCalled()
  })
})

describe('benefit.updated', () => {
  // A product row embeds its benefits, and the provider sends no product
  // event when a benefit changes: pricing would keep a pack's old units.
  it('patches the benefit snapshot, then reloads the products table', async () => {
    const ctx = { ...makeCtx(), runAction: vi.fn(async () => null) }
    await billing.webhookEvents['benefit.updated']!(ctx as never, { type: 'benefit.updated', data: { id: 'ben_1', description: '600 credits', metadata: {} } } as never)
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:upsertBenefitMetadata', expect.anything())
    expect(ctx.runAction).toHaveBeenCalledTimes(1)
    // The billing component's own product sync, with the deployment's token.
    expect((ctx.runAction.mock.calls[0] as unknown[])[1]).toMatchObject({ polarAccessToken: 'oat_test', server: 'sandbox' })
  })

  it('never fails the delivery when the reload fails: it says so, and the benefit is recorded', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ctx = { ...makeCtx(), runAction: vi.fn(async () => Promise.reject(new Error('provider down'))) }
    await expect(billing.webhookEvents['benefit.updated']!(ctx as never, { type: 'benefit.updated', data: { id: 'ben_1', description: '600 credits', metadata: {} } } as never)).resolves.toBeUndefined()
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:upsertBenefitMetadata', expect.anything())
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('billing.product_resync_failed'), expect.any(Error))
    warn.mockRestore()
  })

  it('reloads nothing on a deployment with no access token yet', async () => {
    vi.stubEnv('BILLING_ACCESS_TOKEN', '')
    const tokenless = setupBilling(components, { ...(config as object), accessToken: undefined } as never)
    const ctx = { ...makeCtx(), runAction: vi.fn(async () => null) }
    await tokenless.webhookEvents['benefit.updated']!(ctx as never, { type: 'benefit.updated', data: { id: 'ben_1', metadata: {} } } as never)
    expect(ctx.runAction).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })
})

describe('discounts.create', () => {
  it('returns the created discount id and code', async () => {
    mockDiscountsCreate.mockResolvedValue({ ok: true, value: { id: 'disc_1', code: 'SAVE10' } } as never)
    expect(await billing.discounts.create({ name: 'Launch' } as never)).toStrictEqual({ id: 'disc_1', code: 'SAVE10' })
  })

  it('normalizes a missing code to null', async () => {
    mockDiscountsCreate.mockResolvedValue({ ok: true, value: { id: 'disc_2', code: null } } as never)
    expect(await billing.discounts.create({ name: 'Internal' } as never)).toStrictEqual({ id: 'disc_2', code: null })
  })

  it('refuses a failed discounts.create as unavailable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockDiscountsCreate.mockResolvedValue({ ok: false, error: new Error('bad discount') } as never)
    await expect(billing.discounts.create({ name: 'x' } as never)).rejects.toMatchObject({ data: { code: 'unavailable', reason: 'provider_refused' } })
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

  // An order's and a subscription's metadata come from the checkout a buyer
  // filled in: a `userId` there names whoever the buyer chose.
  it.each(['order.paid', 'subscription.updated'] as const)('never takes the entity from a %s payload\'s own metadata', async (type) => {
    primeRefresh()
    const ctx = makeCtx()
    ctx.runQuery.mockResolvedValue('u-owner')

    await billing.webhookEvents[type]!(ctx as never, { type, data: { customer: { id: 'cus_1', metadata: {} }, metadata: { userId: 'u-victim' } } } as never)

    expect(ctx.runQuery).toHaveBeenCalledWith('ref:userByCustomer', { customerId: 'cus_1' })
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:upsert', expect.objectContaining({ userId: 'u-owner' }))
    expect(ctx.runMutation).not.toHaveBeenCalledWith('ref:upsert', expect.objectContaining({ userId: 'u-victim' }))
  })

  it('takes the entity from the customer\'s external id first, over its tag', async () => {
    primeRefresh()
    const ctx = makeCtx()

    await billing.webhookEvents['subscription.updated']!(ctx as never, {
      type: 'subscription.updated',
      data: { customer: { id: 'cus_1', externalId: 'org-keyed', metadata: { userId: 'org-tagged' } }, metadata: { userId: 'u-victim' } },
    } as never)

    expect(ctx.runMutation).toHaveBeenCalledWith('ref:upsert', expect.objectContaining({ userId: 'org-keyed' }))
    expect(ctx.runQuery).not.toHaveBeenCalledWith('ref:userByCustomer', expect.anything())
  })

  it('records the owner\'s trial when a subscription starts one', async () => {
    primeRefresh()
    const ctx = makeCtx()
    ctx.runQuery.mockImplementation(async (ref: unknown) => (ref === 'ref:entityProfile' ? { name: 'Acme', personal: false, owner: { userId: 'u-owner', email: 'o@example.com', name: 'O', emailVerified: true }, ownedEntityIds: ['org-1'] } : null))

    await billing.webhookEvents['subscription.created']!(ctx as never, { type: 'subscription.created', data: { customer: { id: 'cus_1', externalId: 'org-1' }, trialStart: new Date() } } as never)

    expect(ctx.runMutation).toHaveBeenCalledWith('ref:markTrialUsed', { ownerUserId: 'u-owner', entityId: 'org-1' })
  })

  it.each(['subscription.updated', 'subscription.paused'])('keeps the scheduled plan change and resume date a %s delivery carries', async (type) => {
    primeRefresh()
    const ctx = makeCtx()
    const appliesAt = new Date('2099-02-01T00:00:00.000Z')
    const resumesAt = new Date('2099-03-01T00:00:00.000Z')
    const modifiedAt = new Date('2099-01-15T00:00:00.000Z')

    await billing.webhookEvents[type as 'subscription.updated']!(ctx as never, {
      type,
      data: {
        id: 'sub_1', customer: { id: 'cus_1', externalId: 'org-1' }, createdAt: new Date('2099-01-01T00:00:00.000Z'), modifiedAt,
        resumesAt, pendingUpdate: { id: 'pu_1', productId: 'p2', appliesAt, seats: null },
      },
    } as never)

    expect(ctx.runMutation).toHaveBeenCalledWith('ref:recordSubscriptionChange', {
      subscriptionId: 'sub_1',
      userId: 'org-1',
      pendingChange: { productId: 'p2', appliesAt: appliesAt.getTime() },
      resumesAt: resumesAt.getTime(),
      modifiedAt: modifiedAt.getTime(),
    })
    // A pause changes access as much as any other subscription event.
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:upsert', expect.objectContaining({ userId: 'org-1' }))
  })

  it('records nothing from an order event, or a subscription payload with no time to order it by', async () => {
    primeRefresh()
    const ctx = makeCtx()

    await billing.webhookEvents['order.paid']!(ctx as never, { type: 'order.paid', data: { id: 'ord_1', customer: { id: 'cus_1', externalId: 'org-1' }, createdAt: new Date() } } as never)
    await billing.webhookEvents['subscription.updated']!(ctx as never, { type: 'subscription.updated', data: { id: 'sub_1', customer: { id: 'cus_1', externalId: 'org-1' } } } as never)

    expect(ctx.runMutation).not.toHaveBeenCalledWith('ref:recordSubscriptionChange', expect.anything())
  })

  it('maps a keyed customer the component does not know yet, so its subscriptions read back', async () => {
    primeRefresh()
    getCustomerByUserId.mockResolvedValue(null as never)
    const ctx = makeCtx()

    // A customer the provider created from a checkout that named the external id.
    await billing.webhookEvents['customer.state_changed']!(ctx as never, { type: 'customer.state_changed', data: { id: 'cus_9', externalId: 'org-9', metadata: {} } } as never)

    expect(ctx.runMutation).toHaveBeenCalledWith('ref:insertCustomer', { id: 'cus_9', userId: 'org-9' })
  })

  it('takes the entity from a customer event\'s own metadata', async () => {
    primeRefresh()
    const ctx = makeCtx()

    await billing.webhookEvents['customer.state_changed']!(ctx as never, { type: 'customer.state_changed', data: { id: 'cus_1', metadata: { userId: 'u1' } } } as never)

    expect(ctx.runQuery).not.toHaveBeenCalled()
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
  function identityCtx(claims: Record<string, unknown> | null, memberships: Record<string, string> = { 'org-1': 'owner' }) {
    const member = authTables(memberships)
    return {
      runQuery: vi.fn(async (ref: unknown, args?: unknown) => member(ref, args)),
      runMutation: vi.fn(),
      auth: { getUserIdentity: vi.fn(async () => claims) },
    }
  }

  function setup(config: Partial<Parameters<typeof setupBilling>[1]> = {}) {
    const instance = setupBilling(components, { email, ...config })
    const spy = vi.spyOn(Polar.prototype, 'getCustomerByUserId')
    spy.mockResolvedValue({ id: 'cus_entity' } as never)
    // No trial ran on the entity yet.
    vi.spyOn(Polar.prototype, 'listAllUserSubscriptions').mockResolvedValue([] as never)
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

  it('refuses a caller nobody signed in as, with no explicit userId, as unauthenticated', async () => {
    const { instance } = setup()
    await expect(instance.spendCredits(identityCtx(null) as never, { name: 'credits' }))
      .rejects.toMatchObject({ data: { code: 'unauthenticated' }, message: expect.stringMatching(/no billing entity/) })
    await expect(instance.refundCredits(identityCtx(null) as never, { meter: 'credits', value: 1 }))
      .rejects.toMatchObject({ data: { code: 'unauthenticated' } })
  })

  it('org mode without an active workspace claim yields no entity', async () => {
    const { instance } = setup()
    await expect(
      instance.spendCredits(identityCtx({ subject: 'u1' }) as never, { name: 'credits' }),
    ).rejects.toMatchObject({ data: { code: 'no_workspace' }, message: expect.stringMatching(/needs an active workspace/) })
  })

  it('reads the caller\'s membership fresh, and refuses a removed member or an impersonating admin a spend', async () => {
    const { instance, spy } = setup()
    // The token still names the workspace; the member table no longer does.
    const removed = { ...identityCtx({ subject: 'u1', activeOrganizationId: 'org-1' }), runQuery: vi.fn(async (ref: unknown, args?: unknown) => memberRead(null)(ref, args)) }
    await expect(instance.spendCredits(removed as never, { name: 'credits' })).rejects.toMatchObject({ data: { code: 'forbidden', reason: 'not_member' } })
    expect(removed.runQuery).toHaveBeenCalledWith('ref:findOne', {
      model: 'member',
      where: [{ field: 'organizationId', value: 'org-1' }, { field: 'userId', value: 'u1' }],
    })
    expect(await handlerOf(instance.api.getCredits)(removed, {})).toBeNull()

    const impersonated = identityCtx({ subject: 'u1', activeOrganizationId: 'org-1', impersonatedBy: 'admin-1' })
    await expect(instance.spendCredits(impersonated as never, { name: 'credits' })).rejects.toMatchObject({ data: { code: 'forbidden', reason: 'impersonating' } })
    // Reading is not spending: the impersonating admin still sees the balance.
    await handlerOf(instance.api.getCredits)(impersonated, {})
    expect(impersonated.runQuery).toHaveBeenCalledWith('ref:getByUser', { userId: 'org-1' })
    expect(spy).not.toHaveBeenCalled()
  })

  /** A registered function's implementation, the seam convex-test drives too. */
  const handlerOf = (fn: unknown) => (fn as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler

  it('one resolveEntity serves the reactive reads, spends and checkout alike', async () => {
    const resolveEntity = vi.fn(async () => ({ userId: 'team-7', email: 'billing@team.test' }))
    const { instance, spy } = setup({ resolveEntity, accessToken: 'oat_test', products: { pro: 'p1' }, trustedOrigins: ['https://app'] })
    // A workspace the resolver picks: the caller owns it.
    const ctx = identityCtx({ subject: 'u1', activeOrganizationId: 'org-1' }, { 'team-7': 'owner' })

    // A spend bills the resolver's entity, not the active workspace claim.
    await instance.spendCredits(ctx as never, { name: 'credits' })
    expect(spy).toHaveBeenLastCalledWith(expect.anything(), 'team-7')

    // The reactive read looks up the same entity's cache row.
    await handlerOf(instance.api.getCredits)(ctx, {})
    expect(ctx.runQuery).toHaveBeenCalledWith('ref:getByUser', { userId: 'team-7' })

    // Checkout binds the same entity's provider customer and checks out as it.
    spy.mockClear()
    mockCheckoutsCreate.mockResolvedValue({ ok: true, value: { url: 'https://checkout' } } as never)
    const checkout = await handlerOf(instance.api.generateCheckoutLink)(ctx, { productIds: ['p1'], origin: 'https://app', successUrl: 'https://app/done' })
    expect(checkout).toStrictEqual({ url: 'https://checkout' })
    expect(spy).toHaveBeenCalledWith(expect.anything(), 'team-7')
    expect(mockCheckoutsCreate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ externalCustomerId: 'team-7', products: ['p1'] }))
    // A checking call hands the resolver the access it asks for.
    expect(resolveEntity).toHaveBeenCalledWith(ctx, expect.objectContaining({ access: 'manage', impersonation: 'refused' }))
  })

  it('refuses a workspace your own resolver picks that the caller does not belong to, with billTo: \'organization\'', async () => {
    const { instance, spy } = setup({ resolveEntity: vi.fn(async () => ({ userId: 'team-9', email: '' })), accessToken: 'oat_test' })
    // A member of org-1 only: the resolver's team-9 is someone else's.
    const ctx = identityCtx({ subject: 'u1', activeOrganizationId: 'org-1' })
    await expect(instance.spendCredits(ctx as never, { name: 'credits' })).rejects.toMatchObject({ data: { code: 'forbidden', reason: 'not_member' } })
    expect(await handlerOf(instance.api.getCredits)(ctx, {})).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })

  it('hands your own resolver the rule with billTo: \'user\', so it can refuse a caller who may only read', async () => {
    // Teams of the app's own: a viewer reads, only an owner manages.
    const resolveEntity = vi.fn(async (_ctx: BillingEntityCtx, rule?: { access: string }) => {
      if (rule?.access === 'manage') throw backendError('forbidden', { reason: 'not_billing_manager' })
      return { userId: 'team-1', email: '' }
    })
    const { instance } = setup({ billTo: 'user', resolveEntity, accessToken: 'oat_test', products: { pro: 'p1' }, trustedOrigins: ['https://app'] })
    const ctx = identityCtx({ subject: 'u1' }, {})
    await handlerOf(instance.api.getCredits)(ctx, {})
    expect(ctx.runQuery).toHaveBeenCalledWith('ref:getByUser', { userId: 'team-1' })
    await expect(handlerOf(instance.api.generateCheckoutLink)(ctx, { productIds: ['p1'], origin: 'https://app', successUrl: 'https://app/done' }))
      .rejects.toMatchObject({ data: { code: 'forbidden', reason: 'not_billing_manager' } })
    expect(resolveEntity).toHaveBeenCalledWith(ctx, expect.objectContaining({ access: 'member' }))
    expect(mockCheckoutsCreate).not.toHaveBeenCalled()
  })

  it('reads the account fresh: a banned or deleted one is refused whatever its token says', async () => {
    const { instance } = setup()
    for (const [account, refusal] of [[{ role: 'user', banned: true }, { code: 'forbidden', reason: 'banned' }], [null, { code: 'unauthenticated' }]] as const) {
      const ctx = { ...identityCtx({ subject: 'u1', activeOrganizationId: 'org-1' }), runQuery: vi.fn(async (ref: unknown, args?: unknown) => authTables({ 'org-1': 'owner' }, account)(ref, args)) }
      await expect(instance.spendCredits(ctx as never, { name: 'credits' })).rejects.toMatchObject({ data: refusal })
      expect(await handlerOf(instance.api.getCredits)(ctx, {})).toBeNull()
    }
  })

  it('reads the member table once per call, and again with reread', async () => {
    const { instance } = setup()
    const memberships: Record<string, string> = { 'org-1': 'owner' }
    const ctx = identityCtx({ subject: 'u1', activeOrganizationId: 'org-1' }, memberships)
    await instance.requireEntity(ctx as never, { access: 'manage' })
    // The same call demotes the caller, then checks again.
    memberships['org-1'] = 'member'
    expect(await instance.requireEntity(ctx as never, { access: 'manage' })).toMatchObject({ userId: 'org-1' })
    await expect(instance.requireEntity(ctx as never, { access: 'manage', reread: true })).rejects.toMatchObject({ data: { code: 'forbidden', reason: 'not_billing_manager' } })
  })

  it('keeps your own resolver\'s refusal: a read answers null for it, getBillingAccess says no, a crash stays one', async () => {
    const refuse = vi.fn(async (_ctx: BillingEntityCtx, rule?: { access: string }): Promise<null | { userId: string, email: string }> => {
      if (rule?.access !== 'member') throw backendError('forbidden', { reason: 'not_billing_manager' })
      return { userId: 'team-1', email: '' }
    })
    const { instance } = setup({ billTo: 'user', resolveEntity: refuse })
    const ctx = identityCtx({ subject: 'u1' }, {})
    expect(await handlerOf(instance.api.getBillingAccess)(ctx, {})).toEqual({ canManage: false, saveOffers: false, softOptIn: false })
    await expect(instance.requireEntity(ctx as never, { access: 'manage' })).rejects.toMatchObject({ data: { code: 'forbidden', reason: 'not_billing_manager' } })

    const crash = setup({
      billTo: 'user',
      resolveEntity: vi.fn(async () => {
        throw new Error('the team table is gone')
      }),
    }).instance
    await expect(handlerOf(crash.api.getCredits)(ctx, {})).rejects.toThrow('the team table is gone')

    // A service that failed is no refusal of the caller: it stays a failure, never "no billing".
    for (const failure of [backendError('unavailable', { service: 'billing', reason: 'provider_refused' }), backendError('rate_limited', { limit: 'billingSync' })]) {
      const failing = setup({ billTo: 'user', resolveEntity: vi.fn(async () => Promise.reject(failure)) }).instance
      await expect(handlerOf(failing.api.getCredits)(ctx, {})).rejects.toBe(failure)
    }
  })

  it('fails closed on an access it does not know', async () => {
    const { instance } = setup()
    const ctx = identityCtx({ subject: 'u1', activeOrganizationId: 'org-1' }, { 'org-1': 'member' })
    for (const access of ['admin', 'MEMBER', undefined]) {
      await expect(instance.requireEntity(ctx as never, { access } as never)).rejects.toMatchObject({ data: { code: 'forbidden', reason: 'permission' } })
    }
    expect(await instance.requireEntity(ctx as never, { access: 'member' })).toMatchObject({ userId: 'org-1' })
  })

  it('hands resolveEntity every context, signed in or not; its null answers reads with null and refuses provider calls', async () => {
    const resolveEntity = vi.fn(async (ctx: BillingEntityCtx) =>
      (await ctx.auth.getUserIdentity()) ? { userId: 'team-7', email: '' } : null)
    const { instance } = setup({ resolveEntity, accessToken: 'oat_test' })
    // An internal call with no caller: `auth` is there, its identity is null.
    const signedOut = identityCtx(null)

    expect(await instance.resolveEntity(signedOut as never)).toBeNull()
    expect(resolveEntity).toHaveBeenCalledWith(signedOut)
    expect(await handlerOf(instance.api.getCredits)(signedOut, {})).toBeNull()
    await expect(handlerOf(instance.api.generateCheckoutLink)(signedOut, { productIds: ['p1'], origin: 'https://app', successUrl: 'https://app/done' }))
      .rejects.toMatchObject({ data: { code: 'unauthenticated' } })
    expect(mockCheckoutsCreate).not.toHaveBeenCalled()
  })

  it('refuses a signed-in caller resolveEntity finds no entity for as no_workspace, naming the resolver', async () => {
    const { instance } = setup({ resolveEntity: vi.fn(async () => null), accessToken: 'oat_test' })
    const refusal = handlerOf(instance.api.generateCheckoutLink)(identityCtx({ subject: 'u1' }), { productIds: ['p1'], origin: 'https://app', successUrl: 'https://app/done' })
    await expect(refusal).rejects.toMatchObject({ data: { code: 'no_workspace' } })
    await expect(refusal).rejects.toThrow('[nuxt-backend] Billing found no billing entity for this caller: setupBilling\'s resolveEntity returned null.')
    expect(mockCheckoutsCreate).not.toHaveBeenCalled()
  })
})

describe('billing event hooks', () => {
  // The refresh reads the entity's customer state: none at the provider yet.
  beforeEach(() => {
    mockCustomersGetState.mockResolvedValue({ ok: false, error: { statusCode: 404 } } as never)
  })

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
    billing = setupBilling(components, { email, events: { 'order.paid': onPaid } })
    getCustomerByUserId = vi.spyOn(Polar.prototype, 'getCustomerByUserId')
    getCustomerByUserId.mockResolvedValue(null as never)
    const ctx = makeCtx()
    ctx.runMutation.mockImplementation(async () => {
      order.push('refresh')
    })

    await billing.webhookEvents['order.paid']!(ctx as never, {
      data: { customerId: 'cus_1', customer: { metadata: { userId: 'org-1' } } },
    } as never)

    expect(onPaid).toHaveBeenCalled()
    // The customer is mapped and the cache refreshed, then the hook runs.
    expect(order).toStrictEqual(['refresh', 'refresh', 'hook'])
  })

  it('mounts consumer-only event types outside the refresh set', async () => {
    const onCheckout = vi.fn()
    billing = setupBilling(components, { email, events: { 'checkout.created': onCheckout } as never })
    const ctx = refreshableCtx()

    const handler = billing.webhookEvents['checkout.created' as keyof typeof billing.webhookEvents]!
    await handler(ctx as never, { data: {} } as never)

    expect(onCheckout).toHaveBeenCalled()
    // No refresh for non-refresh events.
    expect(ctx.runMutation).not.toHaveBeenCalled()
  })

  it('keeps refreshing without any consumer hooks (default)', async () => {
    billing = setupBilling(components, { email })
    getCustomerByUserId = vi.spyOn(Polar.prototype, 'getCustomerByUserId')
    getCustomerByUserId.mockResolvedValue(null as never)
    const ctx = makeCtx()

    await billing.webhookEvents['subscription.active']!(ctx as never, {
      data: { customerId: 'cus_1', customer: { metadata: { userId: 'org-1' } } },
    } as never)

    expect(ctx.runMutation).toHaveBeenCalledWith('ref:upsert', expect.objectContaining({ userId: 'org-1' }))
  })
})

describe('provider refusals stop at the package boundary', () => {
  // What the provider SDK rejects with: its message carries the response body,
  // which echoes the request and must never reach a caller.
  const providerError = () => ({ ok: false, error: Object.assign(new Error('API error occurred: Status 403. Body: {"detail":"a@example.com"}'), { statusCode: 403 }) })
  const signedIn = (claims: Record<string, unknown> = {}) => ({ ...makeCtx(), auth: { getUserIdentity: async () => ({ subject: 'u1', email: 'a@example.com', emailVerified: true, activeOrganizationId: 'org-1', ...claims }) } })
  const handler = (fn: unknown) => (fn as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    getCustomerByUserId.mockResolvedValue({ id: 'cus_1' } as never)
    // The workspace's team customer lists the caller as its owner member.
    mockMembersList.mockResolvedValue({ ok: true, value: { result: { items: [{ id: 'mem_1', externalId: 'u1', email: 'a@example.com', role: 'owner' }] } } } as never)
  })

  it('syncEntitlements refuses a failed state read as unavailable, without the provider\'s body', async () => {
    mockCustomersGetState.mockResolvedValue(providerError() as never)
    const refusal = await handler(billing.api.syncEntitlements)(signedIn(), {}).catch((error: unknown) => error)
    expect(getBackendError(refusal)).toMatchObject({ code: 'unavailable', data: { service: 'billing', reason: 'provider_refused' } })
    expect(String(refusal)).not.toContain('Body')
  })

  it('generateCustomerPortalUrl refuses a failed portal session as unavailable, without the provider\'s body', async () => {
    mockCustomerSessionsCreate.mockResolvedValue(providerError() as never)
    const refusal = await handler(billing.api.generateCustomerPortalUrl)(signedIn(), { returnUrl: 'https://app/settings' }).catch((error: unknown) => error)
    expect(mockCustomerSessionsCreate).toHaveBeenCalledWith(expect.anything(), { customerId: 'cus_1', memberId: 'mem_1', returnUrl: 'https://app/settings' })
    expect(getBackendError(refusal)).toMatchObject({ code: 'unavailable', data: { reason: 'provider_refused' } })
    expect(String(refusal)).not.toContain('Body')
  })

  it('generateCustomerPortalUrl answers the portal URL, and refuses an entity without a customer by code', async () => {
    mockCustomerSessionsCreate.mockResolvedValue({ ok: true, value: { customerPortalUrl: 'https://portal' } } as never)
    expect(await handler(billing.api.generateCustomerPortalUrl)(signedIn(), {})).toEqual({ url: 'https://portal' })

    getCustomerByUserId.mockResolvedValue(null as never)
    await expect(handler(billing.api.generateCustomerPortalUrl)(signedIn(), {}))
      .rejects.toMatchObject({ data: { code: 'not_ready', reason: 'no_customer' } })
  })

  it('generateCustomerPortalUrl opens the caller\'s own member, found by user id or else by email', async () => {
    mockCustomerSessionsCreate.mockResolvedValue({ ok: true, value: { customerPortalUrl: 'https://portal' } } as never)
    mockMembersList.mockResolvedValue({ ok: true, value: { result: { items: [
      { id: 'mem_other', externalId: 'u2', email: 'b@example.com', role: 'owner' },
      // An adopted customer's owner member has no external id.
      { id: 'mem_adopted', externalId: null, email: 'A@Example.com', role: 'billing_manager' },
    ] } } } as never)
    await handler(billing.api.generateCustomerPortalUrl)(signedIn(), {})
    expect(mockMembersList).toHaveBeenCalledWith(expect.anything(), { customerId: 'cus_1', limit: 100 })
    expect(mockCustomerSessionsCreate).toHaveBeenCalledWith(expect.anything(), { customerId: 'cus_1', memberId: 'mem_adopted' })
  })

  it('generateCustomerPortalUrl matches by email only a member no account is keyed to, for a verified caller', async () => {
    for (const [claims, member] of [
      [{ emailVerified: false }, { id: 'mem_adopted', externalId: null, email: 'a@example.com', role: 'owner' }],
      [{}, { id: 'mem_someone', externalId: 'u-else', email: 'a@example.com', role: 'owner' }],
    ] as const) {
      mockMembersList.mockResolvedValue({ ok: true, value: { result: { items: [member] } } } as never)
      const refusal = await handler(billing.api.generateCustomerPortalUrl)(signedIn(claims), {}).catch((error: unknown) => error)
      expect(getBackendError(refusal)).toMatchObject({ code: 'forbidden', data: { reason: 'provider_owner_only' } })
    }
    expect(mockCustomerSessionsCreate).not.toHaveBeenCalled()
  })

  it('generateCustomerPortalUrl refuses a manager the provider does not list as one, before any session', async () => {
    for (const items of [[], [{ id: 'mem_1', externalId: 'u1', email: 'a@example.com', role: 'member' }]]) {
      mockMembersList.mockResolvedValue({ ok: true, value: { result: { items } } } as never)
      const refusal = await handler(billing.api.generateCustomerPortalUrl)(signedIn(), {}).catch((error: unknown) => error)
      expect(getBackendError(refusal)).toMatchObject({ code: 'forbidden', data: { reason: 'provider_owner_only' } })
    }
    expect(mockCustomerSessionsCreate).not.toHaveBeenCalled()
  })

  it('refuses a member who manages no billing, and a removed one, before the provider is asked', async () => {
    for (const [memberRole, reason] of [['member', 'not_billing_manager'], [null, 'not_member']] as const) {
      const caller = { ...signedIn(), ...makeCtx({ memberRole }) }
      for (const call of [
        () => handler(billing.api.generateCustomerPortalUrl)(caller, {}),
        () => handler(billing.api.generateCheckoutLink)(caller, { productIds: ['p1'], origin: 'https://app', successUrl: 'https://app/done' }),
        () => billing.cancelSubscription(caller as never),
        () => billing.getOrders(caller as never),
      ]) {
        expect(getBackendError(await call().catch((error: unknown) => error))).toMatchObject({ code: 'forbidden', data: { reason } })
      }
    }
    expect(mockMembersList).not.toHaveBeenCalled()
    expect(mockCustomerSessionsCreate).not.toHaveBeenCalled()
    expect(mockCheckoutsCreate).not.toHaveBeenCalled()
    expect(getCustomerByUserId).not.toHaveBeenCalled()
  })

  it('lets a workspace admin manage billing, as its owner does', async () => {
    mockCustomerSessionsCreate.mockResolvedValue({ ok: true, value: { customerPortalUrl: 'https://portal' } } as never)
    // The provider lists the admin as a billing manager of the team customer.
    mockMembersList.mockResolvedValue({ ok: true, value: { result: { items: [{ id: 'mem_admin', externalId: 'u1', email: 'a@example.com', role: 'billing_manager' }] } } } as never)
    const admin = { ...signedIn(), ...makeCtx({ memberRole: 'admin' }) }
    expect(await handler(billing.api.generateCustomerPortalUrl)(admin, {})).toEqual({ url: 'https://portal' })
  })

  it('generateCustomerPortalUrl opens a user entity\'s own customer with billTo: \'user\', no member read', async () => {
    const personal = setupBilling(components, { ...(config as object), billTo: 'user' } as never)
    mockCustomerSessionsCreate.mockResolvedValue({ ok: true, value: { customerPortalUrl: 'https://portal' } } as never)
    await handler(personal.api.generateCustomerPortalUrl)(signedIn(), {})
    expect(mockMembersList).not.toHaveBeenCalled()
    expect(mockCustomerSessionsCreate).toHaveBeenCalledWith(expect.anything(), { customerId: 'cus_1' })
  })

  it('refuses a signed-out caller as unauthenticated before it says billing is not configured', async () => {
    const unconfigured = setupBilling(components, { email } as never)
    const signedOut = { ...makeCtx(), auth: { getUserIdentity: async () => null } }
    await expect(handler(unconfigured.api.generateCustomerPortalUrl)(signedOut, {})).rejects.toMatchObject({ data: { code: 'unauthenticated' } })
    await expect(handler(unconfigured.api.generateCheckoutLink)(signedOut, { productIds: ['p'], origin: 'https://app', successUrl: 'https://app/done' }))
      .rejects.toMatchObject({ data: { code: 'unauthenticated' } })
    await expect(handler(unconfigured.api.giftCheckout)(signedOut, { productId: 'p', recipientEmail: 'a@example.com', origin: 'https://app', successUrl: 'https://app/done' }))
      .rejects.toMatchObject({ data: { code: 'unauthenticated' } })
    await expect(unconfigured.cancelSubscription(signedOut as never)).rejects.toMatchObject({ data: { code: 'unauthenticated' } })
    // Signed in, the missing token is what refuses.
    await expect(handler(unconfigured.api.generateCustomerPortalUrl)(signedIn(), {}))
      .rejects.toMatchObject({ data: { code: 'unavailable', service: 'billing', reason: 'not_configured' } })
  })

  it('refuses a signed-out caller by code, before any provider call', async () => {
    const signedOut = { ...makeCtx(), auth: { getUserIdentity: async () => null } }
    await expect(handler(billing.api.generateCustomerPortalUrl)(signedOut, {})).rejects.toMatchObject({ data: { code: 'unauthenticated' } })
    await expect(handler(billing.api.syncEntitlements)(signedOut, {})).rejects.toMatchObject({ data: { code: 'unauthenticated' } })
    expect(mockCustomerSessionsCreate).not.toHaveBeenCalled()
    expect(mockCustomersGetState).not.toHaveBeenCalled()
  })

  it('refuses an insufficient balance with the balance and the need', async () => {
    const meters = setupBilling(components, { ...(config as object), credits: { credits: { meterId: 'm1' } } } as never)
    const refusal = await meters.reserveCredits(makeCtx({ debit: { ok: false, reason: 'insufficient', balance: 0 } }) as never, { userId: 'org-1', meter: 'credits' })
      .catch((error: unknown) => error)
    expect(getBackendError(refusal)).toEqual({
      code: 'insufficient_credits',
      data: { meter: 'credits', balance: 0, need: 1 },
      message: 'Not enough credits: 0 left, 1 needed. Top up to continue.',
    })
  })
})
