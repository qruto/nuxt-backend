import { Polar } from '@convex-dev/polar'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { customersGet } from '@polar-sh/sdk/funcs/customersGet.js'
import { eventsIngest } from '@polar-sh/sdk/funcs/eventsIngest.js'
import { setupBilling, type SetupBillingConfig } from '../../src/convex/integrations/billing'
import { getBackendError } from '../../src/convex/errors'

// The server gates and the credit calls at their edges, against a mocked
// provider and component (as billing-integration.test.ts runs them): an app
// that mounts no sharded counter, what a gate takes as a quota, a feature or
// an amount, the refusal that names no plan, and the spend, refund and cost
// calls with an entity, a customer or an event name missing; and the
// pricing read of a deployment whose catalog was never synced.

vi.mock('@polar-sh/sdk/funcs/customersGet.js', () => ({ customersGet: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/eventsIngest.js', () => ({ eventsIngest: vi.fn() }))

const mockEventsIngest = vi.mocked(eventsIngest)

const ref = (name: string) => `ref:${name}`
/** The components an app passes, without the sharded counter or the storage module. */
const components = {
  polar: { lib: { insertCustomer: ref('insertCustomer') } },
  backend: {
    adapter: { findOne: ref('findOne') },
    billing: Object.fromEntries(['getByUser', 'getBenefitMetadata', 'deleteByUser', 'quotaKeys', 'recordQuotaKey', 'debit', 'settle', 'finalize', 'release', 'credit'].map(name => [name, ref(name)])),
  },
} as never

const config = {
  email: { sendTemplate: async () => null },
  accessToken: 'oat_test',
  billTo: 'user',
  credits: { credits: { meterId: 'm_sum', property: 'amount' } },
  catalog: {
    sandbox: {
      products: { 'pro': 'prod_pro', 'pro:year': 'prod_pro_year', 'pack': 'prod_pack' },
      plans: { pro: { month: 'prod_pro', year: 'prod_pro_year' } },
      packs: ['pack'],
      quotas: { projects: 'Projects' },
    },
  },
} as unknown as SetupBillingConfig

/** The account's cached grants: Pro, which allows three projects and grants reports. */
const grants = {
  activeProductIds: ['prod_pro_year', 'prod_pack'],
  benefits: [
    { id: 'g1', benefitId: 'b_quotas', type: 'feature_flag', metadata: { key: 'pro-quotas', quota_projects: 3 } },
    { id: 'g2', benefitId: 'b_reports', type: 'feature_flag', metadata: { key: 'reports' } },
  ],
  meters: [],
}

/** A mutation's context for u1, signed in (or nobody, with `identity: null`), whose component reads answer from the cache above. */
function makeCtx(identity: object | null = { subject: 'u1', email: 'u1@example.com' }) {
  const runQuery = vi.fn(async (name: unknown, args?: unknown): Promise<unknown> => {
    if (name === 'ref:getByUser') return grants
    if (name === 'ref:getBenefitMetadata') return []
    if (name === 'ref:quotaKeys') return ['projects']
    if (name === 'ref:findOne') return (args as { model?: string }).model === 'user' ? { role: 'user', banned: false } : null
    return null
  })
  const runMutation = vi.fn(async (): Promise<unknown> => null)
  return { runQuery, runMutation, auth: { getUserIdentity: vi.fn(async () => identity) } }
}

/** A refusal as the caller reads it, or `null` when the call went through. */
const refusal = (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => getBackendError(error) ?? error)

let billing: ReturnType<typeof setupBilling>
let getCustomerByUserId: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  billing = setupBilling(components, config)
  getCustomerByUserId = vi.spyOn(Polar.prototype, 'getCustomerByUserId').mockResolvedValue({ id: 'cus_1', userId: 'u1' } as never)
  vi.spyOn(Polar.prototype, 'listProducts').mockResolvedValue([] as never)
  vi.mocked(customersGet).mockResolvedValue({ ok: true, value: { id: 'cus_1', externalId: 'u1', metadata: {} } } as never)
  mockEventsIngest.mockResolvedValue({ ok: true, value: {} } as never)
})

describe('quotas in an app that mounts no sharded counter', () => {
  it('refuse a claim and a release with how to mount it, and read the plan\'s limit with nothing claimed', async () => {
    const ctx = makeCtx()
    await expect(billing.requireQuota(ctx as never, 'projects')).rejects.toThrow(/sharded counter component.*app\.use\(shardedCounter\)/)
    await expect(billing.releaseQuota(ctx as never, 'projects')).rejects.toThrow(/app\.use\(shardedCounter\)/)
    expect(ctx.runMutation).not.toHaveBeenCalled()
    expect(await billing.getQuota(ctx as never, 'projects')).toEqual({ limit: 3, used: 0, description: 'Projects' })
  })

  it('forget an entity\'s cache row alone: there is no count to clear', async () => {
    const ctx = makeCtx()
    await billing.forgetEntity(ctx as never, 'u1')
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:deleteByUser', { userId: 'u1' })
    expect(ctx.runQuery).not.toHaveBeenCalledWith('ref:quotaKeys', expect.anything())
  })
})

describe('what a gate takes', () => {
  it('a quota or a feature that is no string is the app\'s mistake, named before anything is read', async () => {
    const ctx = makeCtx()
    const calls: Array<[string, () => Promise<unknown>, RegExp]> = [
      ['getQuota', () => billing.getQuota(ctx as never, 7 as never), /getQuota: the quota is its catalog key, a string, not 7/],
      ['requireQuota', () => billing.requireQuota(ctx as never, undefined as never), /requireQuota: .* not undefined/],
      ['releaseQuota', () => billing.releaseQuota(ctx as never, { key: 'projects' } as never), /releaseQuota: .* not \{"key":"projects"\}/],
      ['hasFeature', () => billing.hasFeature(ctx as never, 3 as never), /hasFeature: the feature is its catalog key \(or a benefit id\), a string, not 3/],
      ['requireFeature', () => billing.requireFeature(ctx as never, null as never), /requireFeature: .* not null/],
    ]
    for (const [name, call, message] of calls) {
      const error = await call().catch((thrown: unknown) => thrown)
      expect(error, name).toBeInstanceOf(TypeError)
      expect(String(error), name).toMatch(message)
    }
    expect(ctx.runQuery).not.toHaveBeenCalled()
  })

  it('an amount sent as text is refused like any that is no whole number, and a release must name its quota', async () => {
    expect(await refusal(billing.requireQuota(makeCtx() as never, 'projects', '2' as never))).toMatchObject({ code: 'invalid_input', data: { field: 'amount' } })
    expect(await refusal(billing.releaseQuota(makeCtx() as never, 'projects', Number.NaN))).toMatchObject({ code: 'invalid_input', data: { field: 'amount' } })
    expect(await refusal(billing.releaseQuota(makeCtx() as never, ''))).toMatchObject({ code: 'invalid_input', data: { field: 'quota' } })
  })
})

describe('feature gates', () => {
  it('refuse a feature no plan on sale includes without naming a plan, in an account\'s words', async () => {
    const refused = await billing.requireFeature(makeCtx() as never, 'sso').catch((error: unknown) => error)
    expect(getBackendError(refused)).toMatchObject({ code: 'feature_required', data: { feature: 'sso', plans: [] } })
    expect(String((refused as Error).message)).toContain('This account\'s plan does not include "sso", and no plan on sale does')
    // The plan's own grants pass.
    await expect(billing.requireFeature(makeCtx() as never, 'reports')).resolves.toBeUndefined()
  })

  it('read a plan by its key whichever of its prices the entity holds, never a pack, and nothing for nobody', async () => {
    expect(await billing.activePlans(makeCtx() as never)).toEqual(['pro'])
    expect(await billing.activePlans(makeCtx(null) as never)).toEqual([])
    expect(await billing.hasFeature(makeCtx(null) as never, 'reports')).toBe(false)
  })
})

describe('credit calls with something missing', () => {
  it('a settle needs an event name: one given, or a configured meter\'s', async () => {
    const ctx = makeCtx()
    await expect(billing.settleSpend(ctx as never, { entityId: 'u1', externalId: 'x1', reserved: false, value: 1 })).rejects.toThrow(/settleSpend: pass `name`/)
    expect(mockEventsIngest).not.toHaveBeenCalled()
  })

  it('a refund goes to the caller\'s own entity when server code names none, and is refused for nobody', async () => {
    const ctx = makeCtx()
    await billing.refundCredits(ctx as never, { meter: 'credits', value: 2 })
    expect(mockEventsIngest).toHaveBeenCalledWith(expect.anything(), { events: [expect.objectContaining({ externalCustomerId: 'u1', metadata: { amount: -2 } })] })
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:credit', { userId: 'u1', meterId: 'm_sum', amount: 2 })

    expect(await refusal(billing.refundCredits(makeCtx(null) as never, { meter: 'credits', value: 2 }))).toMatchObject({ code: 'unauthenticated' })
  })

  it('a refund for an entity with no customer is refused as not_ready, and nothing is ingested or credited', async () => {
    getCustomerByUserId.mockResolvedValue(null as never)
    const ctx = makeCtx()
    expect(await refusal(billing.refundCredits(ctx as never, { userId: 'u1', meter: 'credits', value: 2 }))).toMatchObject({ code: 'not_ready', data: { reason: 'no_customer' } })
    expect(mockEventsIngest).not.toHaveBeenCalled()
    expect(ctx.runMutation).not.toHaveBeenCalled()
  })

  it('a release hands back only a spend that reserved something', async () => {
    const ctx = makeCtx()
    await billing.releaseSpend(ctx as never, { entityId: 'u1', externalId: 'x1', reserved: false, value: 1 })
    expect(ctx.runMutation).not.toHaveBeenCalled()
    await billing.releaseSpend(ctx as never, { entityId: 'u1', externalId: 'x2', reserved: true, meterId: 'm_sum', value: 1 })
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:release', { userId: 'u1', externalId: 'x2' })
  })
})

describe('reportCost', () => {
  it('reports a cost and the model\'s tokens on one event, the cached input counted in the total', async () => {
    await billing.reportCost(makeCtx() as never, {
      userId: 'u1',
      name: 'ai.chat',
      externalId: 'run-1',
      parentId: 'run-0',
      memberId: 'u9',
      cents: 3,
      llm: { vendor: 'openai', model: 'gpt-5-mini', inputTokens: 100, outputTokens: 20, cachedInputTokens: 30 },
    })
    expect(mockEventsIngest).toHaveBeenCalledWith(expect.anything(), {
      events: [{
        name: 'ai.chat',
        externalCustomerId: 'u1',
        externalId: 'run-1',
        parentId: 'run-0',
        externalMemberId: 'u9',
        metadata: {
          _cost: { amount: 3, currency: 'usd' },
          _llm: { vendor: 'openai', model: 'gpt-5-mini', inputTokens: 100, outputTokens: 20, totalTokens: 150, cachedInputTokens: 30 },
        },
      }],
    })
  })

  it('reports only what it was given: no cost without cents, no cached count at zero, no parent or member left empty', async () => {
    await billing.reportCost(makeCtx() as never, { userId: 'u1', name: 'ai.chat', externalId: 'run-2', llm: { vendor: 'openai', model: 'gpt-5-mini', inputTokens: 10, outputTokens: 5, cachedInputTokens: 0 } })
    await billing.reportCost(makeCtx() as never, { userId: 'u1', name: 'ai.image', externalId: 'run-3', cents: 12 })
    const [first, second] = mockEventsIngest.mock.calls.map(call => (call[1] as { events: unknown[] }).events[0])
    expect(first).toEqual({ name: 'ai.chat', externalCustomerId: 'u1', externalId: 'run-2', metadata: { _llm: { vendor: 'openai', model: 'gpt-5-mini', inputTokens: 10, outputTokens: 5, totalTokens: 15 } } })
    expect(second).toEqual({ name: 'ai.image', externalCustomerId: 'u1', externalId: 'run-3', metadata: { _cost: { amount: 12, currency: 'usd' } } })
  })

  it('reports nothing for an entity with no customer, and refuses a report the provider turned down as unavailable', async () => {
    getCustomerByUserId.mockResolvedValueOnce(null as never)
    await billing.reportCost(makeCtx() as never, { userId: 'u1', name: 'ai.chat', externalId: 'run-4', cents: 1 })
    expect(mockEventsIngest).not.toHaveBeenCalled()

    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockEventsIngest.mockResolvedValue({ ok: false, error: new Error('ingest refused') } as never)
    const refused = await refusal(billing.reportCost(makeCtx() as never, { userId: 'u1', name: 'ai.chat', externalId: 'run-5', cents: 1 }))
    expect(refused).toMatchObject({ code: 'unavailable', data: { service: 'billing' } })
  })
})

describe('getPricing', () => {
  it('answers nothing on sale on a deployment whose catalog was never synced, and reads no benefit for it', async () => {
    const unsynced = setupBilling(components, { ...config, catalog: undefined } as unknown as SetupBillingConfig)
    const ctx = makeCtx(null)
    const getPricing = unsynced.api.getPricing as unknown as { _handler: (ctx: unknown, args: object) => Promise<unknown> }
    expect(await getPricing._handler(ctx, {})).toEqual({ plans: [], packs: [], currencies: [] })
    expect(ctx.runQuery).not.toHaveBeenCalledWith('ref:getBenefitMetadata', expect.anything())
  })
})
