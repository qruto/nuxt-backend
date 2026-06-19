import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_AUTH_LIMITS, setupRateLimiter } from '../../src/convex/integrations/rate-limit'
import { setupWorkflows } from '../../src/convex/integrations/workflows'
import { setupMigrations } from '../../src/convex/integrations/migrations'
import { setupBilling } from '../../src/convex/integrations/billing'
import { setupEmail } from '../../src/convex/integrations/email'
import { TableAggregate, Triggers, withTriggers } from '../../src/convex/integrations/aggregate'
import { search } from '../../src/convex/integrations/search'

const fakeComponent = {} as never

afterEach(() => {
  vi.restoreAllMocks()
})

describe('setupRateLimiter', () => {
  it('seeds the auth-sensitive default limits', () => {
    expect(Object.keys(DEFAULT_AUTH_LIMITS)).toEqual(['emailOtp', 'signIn', 'signUp', 'passwordReset'])
    expect(DEFAULT_AUTH_LIMITS.emailOtp).toMatchObject({ kind: 'token bucket' })
  })

  it('merges custom limits on top of the defaults', () => {
    const rateLimiter = setupRateLimiter(fakeComponent, {
      sendMessage: { kind: 'token bucket', rate: 30, period: 60_000, capacity: 5 },
    })
    expect(rateLimiter.limits).toHaveProperty('emailOtp')
    expect(rateLimiter.limits).toHaveProperty('sendMessage')
  })
})

describe('setup factories', () => {
  it('setupWorkflows returns a manager with define/start', () => {
    const workflow = setupWorkflows(fakeComponent)
    expect(workflow.define).toBeTypeOf('function')
    expect(workflow.start).toBeTypeOf('function')
  })

  it('setupMigrations returns migrations + a runner', () => {
    const { migrations, run } = setupMigrations(fakeComponent)
    expect(migrations.define).toBeTypeOf('function')
    expect(run).toBeDefined()
  })

  it('setupBilling exposes the Polar client, ready-made functions, and SaaS helpers', () => {
    const backend = { billing: { getByUser: {}, upsert: {}, userByCustomer: {} } } as never
    const billing = setupBilling(fakeComponent, backend, {
      getUserInfo: async () => ({ userId: 'u1', email: 'a@b.com' }),
      currentUserId: async () => 'u1',
    })
    expect(billing.polar).toBeDefined()
    expect(billing.api).toHaveProperty('generateCheckoutLink')
    expect(billing.api).toHaveProperty('generateCustomerPortalUrl')
    // Ready-made reactive functions re-exported by the consumer's billing.ts.
    expect(billing.functions.getCurrentSubscription).toBeDefined()
    expect(billing.functions.getFeatures).toBeDefined()
    expect(billing.functions.getCredits).toBeDefined()
    expect(billing.functions.syncEntitlements).toBeDefined()
    // Webhook handlers keep the reactive cache fresh.
    expect(billing.webhookEvents['customer.state_changed']).toBeTypeOf('function')
    expect(billing.webhookEvents['order.created']).toBeTypeOf('function')
    // SaaS depth: customer state, prepaid-credit spend, discounts.
    expect(billing.getCustomerState).toBeTypeOf('function')
    expect(billing.spendCredits).toBeTypeOf('function')
    expect(billing.createDiscount).toBeTypeOf('function')
  })

  it('setupEmail exposes transactional + marketing helpers', () => {
    const email = setupEmail({ email: {} } as never)
    expect(email.api.getEmailStatus).toBeDefined()
    expect(email.send).toBeTypeOf('function')
    expect(email.status).toBeTypeOf('function')
    expect(email.cancel).toBeTypeOf('function')
    expect(email.webhookHandler).toBeTypeOf('function')
    expect(email.audiences.create).toBeTypeOf('function')
    expect(email.contacts.add).toBeTypeOf('function')
    expect(email.broadcasts.send).toBeTypeOf('function')
  })

  it('aggregate helpers compose a trigger-wrapped mutation', () => {
    const aggregate = new TableAggregate<{ Key: null, DataModel: never, TableName: 'messages' }>(
      fakeComponent,
      { sortKey: () => null },
    )
    expect(aggregate.trigger).toBeTypeOf('function')

    const triggers = new Triggers()
    const rawMutation = vi.fn(definition => definition)
    const mutation = withTriggers(rawMutation as never, triggers)
    expect(mutation).toBeTypeOf('function')
  })
})

// ── fluent search builder ────────────────────────────────────────────────────
function makeSearchCtx(rows: Array<{ _id: string }>) {
  const calls = { index: '', search: [] as Array<[string, string]>, eq: [] as Array<[string, unknown]> }
  const finalizer = {
    eq(field: string, value: unknown) {
      calls.eq.push([field, value])
      return finalizer
    },
  }
  const filterBuilder = {
    search(field: string, term: string) {
      calls.search.push([field, term])
      return finalizer
    },
  }
  const ordered = {
    take: async (n: number) => rows.slice(0, n),
    collect: async () => rows,
    first: async () => rows[0] ?? null,
  }
  const builder = {
    withSearchIndex(index: string, cb: (q: typeof filterBuilder) => unknown) {
      calls.index = index
      cb(filterBuilder)
      return ordered
    },
  }
  const ctx = { db: { query: () => builder } } as never
  return { ctx, calls }
}

describe('search (fluent builder)', () => {
  it('short-circuits a blank term without touching the database', async () => {
    const { ctx, calls } = makeSearchCtx([{ _id: '1' }])
    const results = await search(ctx, 'messages').withSearchIndex('search_text').search('text', '').take(5)
    expect(results).toEqual([])
    expect(calls.index).toBe('') // withSearchIndex never invoked
  })

  it('builds search + eq filters for a non-blank term', async () => {
    const { ctx, calls } = makeSearchCtx([{ _id: '1' }, { _id: '2' }])
    const results = await search(ctx, 'messages')
      .withSearchIndex('search_text')
      .search('text', 'hello')
      .eq('userId', 'u1')
      .take(1)

    expect(results).toEqual([{ _id: '1' }])
    expect(calls.index).toBe('search_text')
    expect(calls.search).toEqual([['text', 'hello']])
    expect(calls.eq).toEqual([['userId', 'u1']])
  })

  it('first() resolves to null for a blank term', async () => {
    const { ctx } = makeSearchCtx([{ _id: '1' }])
    expect(await search(ctx, 'messages').withSearchIndex('i').search('text', '').first()).toBeNull()
  })
})
