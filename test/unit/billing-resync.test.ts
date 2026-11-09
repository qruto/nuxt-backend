import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { customersGetStateExternal } from '@polar-sh/sdk/funcs/customersGetStateExternal.js'
import { type Billing, setupBilling } from '../../src/convex/integrations/billing'
import { markRateLimited, providerRateLimit, retryAfterMs } from '../../src/convex/integrations/billing/rate-limit'
import { setupEmail } from '../../src/convex/integrations/email'

// `billing resync` against a provider that answers 429: the sweep reads its
// entities in turn, one a second at most, waits as long as the provider's
// `Retry-After` asks, gives up on an entity only after its tries (logged by
// id), and the last run logs the tally. The provider's SDK is faked; the
// clock is too, so the waits are measured rather than slept.

vi.mock('@polar-sh/sdk/funcs/customersGetStateExternal.js', () => ({ customersGetStateExternal: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/benefitsGet.js', () => ({ benefitsGet: vi.fn() }))

const getState = vi.mocked(customersGetStateExternal)

const components = {
  polar: { lib: { insertCustomer: 'ref:insertCustomer' } },
  backend: {
    adapter: { findOne: 'ref:findOne', findMany: 'ref:findMany' },
    billing: { upsert: 'ref:upsert', getBenefitMetadata: 'ref:getBenefitMetadata', upsertBenefitMetadata: 'ref:upsertBenefitMetadata', deleteByUser: 'ref:deleteByUser' },
    email: { send: 'ref:email.send' },
  },
} as never

const billing: Billing = setupBilling(components, { email: setupEmail(components), accessToken: 'oat_test', products: { pro: 'p1' } } as never)
const handler = (billing.api.resyncEntitlements as unknown as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler

/** The provider's answers, per entity: each call takes the next, the last repeats. */
let answers: Record<string, Array<'ok' | number | 'error' | 'limited'>>
/** When each entity was asked, on the fake clock. */
let asked: Array<{ id: string, at: number }>

/** A `429` as the SDK throws it, with `Retry-After` in seconds when given. */
const tooMany = (seconds?: number) => ({ ok: false as const, error: Object.assign(new Error('Too Many Requests'), { statusCode: 429, headers: new Headers(seconds === undefined ? {} : { 'retry-after': String(seconds) }) }) })

beforeEach(() => {
  vi.useFakeTimers()
  answers = {}
  asked = []
  getState.mockImplementation((async (_client: unknown, { externalId }: { externalId: string }) => {
    asked.push({ id: externalId, at: Date.now() })
    const queue = answers[externalId] ?? ['ok']
    const answer = queue.length > 1 ? queue.shift()! : queue[0]!
    if (answer === 'ok') return { ok: true, value: { id: `cus_${externalId}`, activeSubscriptions: [], grantedBenefits: [], activeMeters: [] } }
    if (answer === 'error') return { ok: false, error: Object.assign(new Error('Internal Server Error'), { statusCode: 500, headers: new Headers() }) }
    return tooMany(answer === 'limited' ? undefined : answer)
  }) as never)
  for (const level of ['info', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const ctx = (page: { page: Array<{ _id: string }>, isDone: boolean, continueCursor: string } = { page: [], isDone: true, continueCursor: '' }) => ({
  runQuery: vi.fn(async (ref: unknown) => (ref === 'ref:findMany' ? page : [])),
  runMutation: vi.fn(async () => null),
  runAction: vi.fn(),
  scheduler: { runAfter: vi.fn(async () => null) },
  auth: { getUserIdentity: vi.fn(async () => null) },
})

/** Run the handler to its end, the fake clock advanced through every wait. */
async function run(context: ReturnType<typeof ctx>, args: object): Promise<unknown> {
  const done = handler(context, args)
  await vi.runAllTimersAsync()
  return await done
}

const ZERO = { synced: 0, gone: 0, failed: 0, failedIds: [] }
const logged = (level: 'info' | 'warn', code: string) => vi.mocked(console[level]).mock.calls.map(([line]) => String(line)).filter(line => line.includes(code))

describe('the sweep', () => {
  it('starts by counting the first page and handing it to the paced runs, asking the provider nothing', async () => {
    const start = ctx({ page: [{ _id: 'a' }, { _id: 'b' }], isDone: false, continueCursor: 'c1' })
    await expect(run(start, {})).resolves.toEqual({ queued: 2, more: true })
    expect(getState).not.toHaveBeenCalled()
    expect(start.scheduler.runAfter).toHaveBeenCalledWith(0, expect.anything(), { pending: ['a', 'b'], cursor: 'c1', last: false, tally: ZERO })
  })

  it('reads one entity a second at most', async () => {
    await run(ctx(), { pending: ['a', 'b', 'c'], last: true, tally: ZERO })
    const gaps = asked.slice(1).map((entry, index) => entry.at - asked[index]!.at)
    expect(gaps).toEqual([1000, 1000])
  })

  it('waits as long as the provider\'s Retry-After asks, then reads the entity again', async () => {
    answers.a = [3, 'ok']
    await run(ctx(), { pending: ['a'], last: true, tally: ZERO })
    expect(asked.map(entry => entry.id)).toEqual(['a', 'a'])
    expect(asked[1]!.at - asked[0]!.at).toBe(3000)
    expect(logged('info', 'billing.resync_done')[0]).toContain('1 read again, 0 left to an erasure, 0 given up on.')
  })

  it('backs off on a 429 that names no wait, from two seconds', async () => {
    answers.a = ['limited', 'limited', 'ok']
    await run(ctx(), { pending: ['a'], last: true, tally: ZERO })
    expect(asked.slice(1).map((entry, index) => entry.at - asked[index]!.at)).toEqual([2000, 4000])
  })

  it('gives up on an entity the rate limit keeps refusing after eight tries, logs it by id, and counts it in the closing line', async () => {
    answers.b = [1]
    await run(ctx(), { pending: ['a', 'b'], last: true, tally: ZERO })
    expect(asked.filter(entry => entry.id === 'b')).toHaveLength(8)
    expect(logged('warn', 'billing.resync_failed')).toEqual([expect.stringContaining('Billing entity b\'s entitlements were not read again after 8 tries (the provider\'s rate limit)')])
    const [done] = logged('info', 'billing.resync_done')
    expect(done).toContain('1 read again, 0 left to an erasure, 1 given up on. Given up on: b;')
  })

  it('gives up on another refusal after three tries', async () => {
    answers.a = ['error']
    await run(ctx(), { pending: ['a'], last: true, tally: ZERO })
    expect(asked).toHaveLength(3)
    expect(logged('warn', 'billing.resync_failed')[0]).toContain('after 3 tries (the provider refused it)')
  })

  it('hands the next page on with the tally, and logs nothing until the last', async () => {
    answers.b = [1]
    const page = ctx()
    await run(page, { pending: ['a', 'b'], cursor: 'c2', last: false, tally: { synced: 4, gone: 1, failed: 0, failedIds: [] } })
    expect(page.scheduler.runAfter).toHaveBeenCalledWith(0, expect.anything(), { cursor: 'c2', tally: { synced: 5, gone: 1, failed: 1, failedIds: ['b'] } })
    expect(logged('info', 'billing.resync_done')).toEqual([])
    // The next run reads that page itself.
    const next = ctx({ page: [{ _id: 'c' }], isDone: true, continueCursor: '' })
    await run(next, { cursor: 'c2', tally: { synced: 5, gone: 1, failed: 1, failedIds: ['b'] } })
    expect(next.runQuery).toHaveBeenCalledWith('ref:findMany', expect.objectContaining({ paginationOpts: { cursor: 'c2', numItems: 100 } }))
    expect(logged('info', 'billing.resync_done')[0]).toContain('6 read again, 1 left to an erasure, 1 given up on. Given up on: b;')
  })
})

describe('waits that would outlast a run', () => {
  // The provider asks for two minutes each time: three tries fit a run's
  // four minutes, and the wait after the third would end past them.
  it('hands the entity on to the next run, after the wait, with the tries it spent, instead of waiting past the run', async () => {
    answers.a = [120]
    const started = Date.now()
    const page = ctx()
    await expect(run(page, { pending: ['a', 'b'], cursor: 'c3', last: true, tally: ZERO })).resolves.toEqual({ queued: 2, more: true })
    expect(asked.map(entry => entry.id)).toEqual(['a', 'a', 'a'])
    expect(Date.now() - started).toBeLessThanOrEqual(4 * 60_000)
    expect(page.scheduler.runAfter).toHaveBeenCalledWith(120_000, expect.anything(), { pending: ['a', 'b'], cursor: 'c3', last: true, tally: ZERO, tried: 3 })
    expect(logged('warn', 'billing.resync_failed')).toEqual([])
    expect(logged('info', 'billing.resync_done')).toEqual([])
  })

  it('counts the tries a run before spent, so an entity the rate limit keeps refusing still gives up at eight', async () => {
    answers.a = [120]
    await run(ctx(), { pending: ['a'], last: true, tally: ZERO, tried: 6 })
    expect(asked).toHaveLength(2)
    expect(logged('warn', 'billing.resync_failed')[0]).toContain('after 8 tries (the provider\'s rate limit)')
    expect(logged('info', 'billing.resync_done')[0]).toContain('0 read again, 0 left to an erasure, 1 given up on.')
  })

  it('gives up on one entity by id before its waits would outlast the action', async () => {
    answers.a = [120]
    const started = Date.now()
    await expect(run(ctx(), { entityId: 'a' })).resolves.toBe('failed')
    expect(Date.now() - started).toBeLessThanOrEqual(5 * 60_000)
    expect(asked).toHaveLength(3)
    expect(logged('warn', 'billing.resync_failed')[0]).toContain('after 3 tries (the provider\'s rate limit, and its next wait would outlast the run)')
  })
})

describe('one entity by id', () => {
  it('answers failed once its tries are spent, and synced after a wait', async () => {
    answers.a = [2]
    await expect(run(ctx(), { entityId: 'a' })).resolves.toBe('failed')
    answers.b = [2, 'ok']
    await expect(run(ctx(), { entityId: 'b' })).resolves.toBe('synced')
  })
})

describe('the provider\'s rate limit', () => {
  it('reads Retry-After as seconds or a date, capped at two minutes', () => {
    expect(retryAfterMs('5')).toBe(5000)
    expect(retryAfterMs('900')).toBe(120_000)
    // An HTTP date names whole seconds.
    const now = Date.UTC(2026, 10, 9, 12, 0, 0)
    expect(retryAfterMs(new Date(now + 10_000).toUTCString(), now)).toBe(10_000)
    expect(retryAfterMs('soon')).toBeNull()
    expect(retryAfterMs(null)).toBeNull()
  })

  it('rides on the package\'s refusal, never in the data a caller sees', () => {
    const refusal = markRateLimited(new Error('unavailable'), tooMany(4).error)
    expect(providerRateLimit(refusal)).toEqual({ waitMs: 4000 })
    expect(Object.keys(refusal)).toEqual([])
    expect(JSON.stringify(refusal)).toBe('{}')
    expect(providerRateLimit(markRateLimited(new Error('other'), { statusCode: 500 }))).toBeUndefined()
  })
})
