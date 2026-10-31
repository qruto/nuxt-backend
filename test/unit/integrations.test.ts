import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_LIMITS, setupRateLimiter } from '../../src/convex/integrations/rate-limit'
import { setupWorkflows } from '../../src/convex/integrations/workflows'
import { setupBilling } from '../../src/convex/integrations/billing'
import { setupEmail } from '../../src/convex/integrations/email'
import { search } from '../../src/convex/integrations/search'

// Every setup* accepts the whole generated `components` object and picks its
// keys structurally — this fixture stands in for it.
const fakeComponents = {
  rateLimiter: {},
  workflow: {},
  migrations: {},
  polar: { lib: { insertCustomer: {} } },
  backend: {
    // The auth tables' adapter: the fresh member and role reads.
    adapter: { findOne: {} },
    billing: { getByUser: {}, upsert: {}, userByCustomer: {} },
    gifts: { create: {}, markPaid: {}, markClaimed: {}, listByEmail: {}, get: {}, resolveRecipient: {} },
    email: {},
  },
} as never

afterEach(() => {
  vi.restoreAllMocks()
})

describe('setupRateLimiter', () => {
  it('seeds only limits with a real consumer (no dead password/sign-in limits)', () => {
    expect(Object.keys(DEFAULT_LIMITS)).toEqual(['emailOtp', 'emailOtpGlobal', 'emailOtpAttempt', 'emailChange', 'billingSync', 'ai', 'aiBudget', 'aiGlobal', 'admin', 'invitation', 'invitationGlobal', 'workspaceCreate', 'accountDelete', 'passkeySignIn', 'passkeySignInGlobal', 'signUpOtpGlobal', 'inviteCheck', 'inviteCheckGlobal', 'waitlistJoin', 'waitlistJoinGlobal', 'contact', 'contactGlobal', 'inboundMail', 'inboundMailGlobal', 'report', 'reportGlobal', 'write', 'upload'])
    expect(DEFAULT_LIMITS.emailOtp).toMatchObject({ kind: 'token bucket' })
    // The deployment-wide backstop is a fixed window: a ceiling per hour, not a smoothed rate.
    expect(DEFAULT_LIMITS.emailOtpGlobal).toMatchObject({ kind: 'fixed window', rate: 300 })
    // Guesses at a code, per address, while one is waiting: ten an hour.
    expect(DEFAULT_LIMITS.emailOtpAttempt).toMatchObject({ kind: 'token bucket', rate: 10, period: 60 * 60 * 1000, capacity: 10 })
    expect(DEFAULT_LIMITS.ai).toMatchObject({ kind: 'token bucket', rate: 30 })
    // The credit budget is a period allowance that resets, not a smoothed rate.
    expect(DEFAULT_LIMITS.aiBudget).toMatchObject({ kind: 'fixed window' })
    // What the app pays for itself (guest jobs): one unkeyed ceiling an hour.
    expect(DEFAULT_LIMITS.aiGlobal).toMatchObject({ kind: 'fixed window', rate: 300, period: 60 * 60 * 1000 })
    // Both privileged-route limits are consumed by setupAuth's before-hook
    // (see "privileged route rate limits" in auth-integrations.test.ts).
    expect(DEFAULT_LIMITS.admin).toMatchObject({ kind: 'token bucket', rate: 30 })
    // An hour, not a minute: an invitation is an email, and what matters is
    // the volume one account can send rather than its per-second rate.
    expect(DEFAULT_LIMITS.invitation).toMatchObject({ kind: 'token bucket', rate: 30, period: 60 * 60 * 1000 })
    // The deployment-wide invitation ceiling is a fixed window, like the OTP
    // backstop it mirrors — a period allowance, not a smoothed rate.
    expect(DEFAULT_LIMITS.invitationGlobal).toMatchObject({ kind: 'fixed window', rate: 200, period: 60 * 60 * 1000 })
    // Each new workspace is a billing entity (the free plan's credits, a
    // provider customer): a few at once, then ten an hour per member.
    expect(DEFAULT_LIMITS.workspaceCreate).toMatchObject({ kind: 'token bucket', rate: 10, period: 60 * 60 * 1000, capacity: 5 })
    // An account's own deletion: a person deletes once; three tries an hour stop a script.
    expect(DEFAULT_LIMITS.accountDelete).toMatchObject({ kind: 'token bucket', rate: 3, period: 60 * 60 * 1000, capacity: 3 })
    // The passkey sign-in challenge: a bucket per client address, a minute's
    // worth of sign-in pages; behind it, an hour's ceiling for the deployment.
    expect(DEFAULT_LIMITS.passkeySignIn).toMatchObject({ kind: 'token bucket', rate: 30, period: 60 * 1000, capacity: 30 })
    expect(DEFAULT_LIMITS.passkeySignInGlobal).toMatchObject({ kind: 'fixed window', rate: 3000, period: 60 * 60 * 1000 })
    // Codes to new addresses spend their own ceiling, so a rush of joins leaves existing people's codes alone.
    expect(DEFAULT_LIMITS.signUpOtpGlobal).toMatchObject({ kind: 'fixed window', rate: 200, period: 60 * 60 * 1000 })
    // The scaffold's createFunctions spends `write` on every authed write, per account.
    expect(DEFAULT_LIMITS.write).toMatchObject({ kind: 'token bucket', rate: 120, period: 60 * 1000, capacity: 60 })
  })

  it('merges custom limits on top of the defaults', () => {
    const rateLimiter = setupRateLimiter(fakeComponents, {
      sendMessage: { kind: 'token bucket', rate: 30, period: 60_000, capacity: 5 },
    })
    expect(rateLimiter.limits).toHaveProperty('emailOtp')
    expect(rateLimiter.limits).toHaveProperty('sendMessage')
  })
})

describe('setup factories', () => {
  it('setupWorkflows returns a manager with define/start', () => {
    const workflow = setupWorkflows(fakeComponents)
    expect(workflow.define).toBeTypeOf('function')
    expect(workflow.start).toBeTypeOf('function')
  })

  it('setupBilling exposes ready-made functions and SaaS helpers, and never the provider client', () => {
    const billing = setupBilling(fakeComponents, { email: { sendTemplate: async () => null } })
    // The provider's own client stays inside: a brand-neutral surface.
    expect(billing).not.toHaveProperty('provider')
    expect(billing.api).toHaveProperty('generateCheckoutLink')
    expect(billing.api).toHaveProperty('generateCustomerPortalUrl')
    expect(billing.api).toHaveProperty('giftCheckout')
    // Every function the consumer's billing.ts re-exports, in the one bag.
    expect(billing.api.getCurrentSubscription).toBeDefined()
    expect(billing.api.getFeatures).toBeDefined()
    expect(billing.api.getCredits).toBeDefined()
    expect(billing.api.syncEntitlements).toBeDefined()
    expect(billing.api.getReceivedGifts).toBeDefined()
    expect(billing.api.claimGift).toBeDefined()
    // Webhook handlers keep the reactive cache fresh.
    expect(billing.webhookEvents['customer.state_changed']).toBeTypeOf('function')
    expect(billing.webhookEvents['order.created']).toBeTypeOf('function')
    // SaaS depth: customer state, prepaid-credit spend, discounts.
    expect(billing.getCustomerState).toBeTypeOf('function')
    expect(billing.spendCredits).toBeTypeOf('function')
    expect(billing.discounts.create).toBeTypeOf('function')
  })

  it('setupEmail exposes transactional + marketing helpers', () => {
    const email = setupEmail(fakeComponents)
    expect(email.api.getEmailStatus).toBeDefined()
    expect(email.api.previewEmails).toBeDefined()
    expect(email.api.sendEmailPreview).toBeDefined()
    expect(email).not.toHaveProperty('devtools')
    expect(email.send).toBeTypeOf('function')
    expect(email.status).toBeTypeOf('function')
    expect(email.cancel).toBeTypeOf('function')
    expect(email.webhookHandler).toBeTypeOf('function')
    expect(email.segments.create).toBeTypeOf('function')
    expect(email.contacts.add).toBeTypeOf('function')
    expect(email.broadcasts.send).toBeTypeOf('function')
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
