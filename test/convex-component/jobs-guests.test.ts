/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, defineTable, type FunctionReference, internalMutationGeneric, makeFunctionReference, mutationGeneric } from 'convex/server'
import { convexTest } from 'convex-test'
import { v } from 'convex/values'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { backendError, getBackendError } from '../../src/convex/errors'
import { verifyHuman } from '../../src/convex/integrations/functions'
import { defineJobQueue, setupAi } from '../../src/convex/integrations/ai'
import type { Billing } from '../../src/convex/integrations/billing'
import { BILLING_METERS } from '../../src/convex/integrations/billing/context'
import { setupRateLimiter } from '../../src/convex/integrations/rate-limit'
import { signProof, VISITOR_METHOD, withVisitor } from '../../src/convex/proof'
import componentSchema from '../../src/convex/components/backend/schema'
import { GUEST_TRIES_RETENTION_MS, JOB_RETENTION_MS } from '../../src/convex/components/backend/jobs'
import { MAINTENANCE_TASKS } from '../../src/convex/components/backend/maintenance'

const componentModules = import.meta.glob('../../src/convex/components/backend/**/*.ts')

// Guest generation (defineJobQueue({ guest })), the way a strips module
// uses it: a signed-out visitor, proved by verifyHuman with the proof the
// app's server bound to their browser, starts one free job of a kind open
// to guests. It holds no credits, counts in no budget and spends the
// app-wide `aiGlobal` window. When the visitor signs up in that browser,
// the auth hook claims the visitor's jobs (component `claimVisitor`) and
// the queue moves them, and the app's rows through setupAi's `claim`, to
// the new account's workspace. Nobody reads or claims another visitor's.

const HOUR = 60 * 60_000
const SITE = 'https://happy-otter-123.convex.site'
const AUDIENCE = new URL(SITE).host
const SECRET = 'a-proof-secret-of-at-least-thirty-two-characters'
const METER_ID = 'm1'
const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'>, rateLimiter: never, workflow: never, persistentTextStreaming: never }
const backend = components.backend

/** What the fake billing provider was asked to do. */
const provider = { charges: [] as string[], costs: [] as Array<Record<string, unknown>> }

const billing = {
  requireEntity: async (ctx: { auth: { getUserIdentity: () => Promise<Record<string, unknown> | null> } }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw backendError('unauthenticated', {})
    return { userId: identity.activeOrganizationId as string, email: identity.email as string }
  },
  reserveCredits: async (ctx: { runMutation: (ref: unknown, args: unknown) => Promise<{ ok: boolean, balance: number }> }, event: { userId: string, value: number, externalId: string, hold?: number }) => {
    const result = await ctx.runMutation(backend.billing.debit, { userId: event.userId, meterId: METER_ID, amount: event.value, externalId: event.externalId, ...(event.hold ? { hold: event.hold } : {}) })
    if (!result.ok) throw backendError('insufficient_credits', { meter: 'credits', balance: result.balance, need: event.value })
    return { entityId: event.userId, externalId: event.externalId, reserved: true, meter: 'credits', meterId: METER_ID, value: event.value }
  },
  settleSpend: async (ctx: { runMutation: (ref: unknown, args: unknown) => Promise<unknown> }, reservation: { entityId: string, externalId: string }) => {
    provider.charges.push(reservation.externalId)
    await ctx.runMutation(backend.billing.settle, { userId: reservation.entityId, externalId: reservation.externalId })
  },
  releaseSpend: async (ctx: { runMutation: (ref: unknown, args: unknown) => Promise<unknown> }, reservation: { entityId: string, externalId: string }) => {
    await ctx.runMutation(backend.billing.release, { userId: reservation.entityId, externalId: reservation.externalId })
  },
  refundCredits: async () => {},
  reportCost: async (_ctx: unknown, report: Record<string, unknown>) => {
    provider.costs.push(report)
  },
  requireFeature: async (_ctx: unknown, feature: string) => {
    throw backendError('feature_required', { feature, plans: [] })
  },
  recordEvent: async () => {},
} as unknown as Billing
BILLING_METERS.set(billing, ({ meter }: { meter?: string }) => (meter === 'credits' ? { meterId: METER_ID, property: 'credits' } : null) as never)

// Two guests an hour across the app, so the third visitor meets the ceiling.
const rateLimiter = setupRateLimiter(components as never, { aiGlobal: { kind: 'fixed window', rate: 2, period: HOUR } })
const ai = setupAi(components as never, { billing, rateLimiter, guest: { claim: makeFunctionReference<'mutation'>('strips:claimGuest') as never } })
const jobs = defineJobQueue(components as never, {
  ai,
  concurrency: 2,
  guest: { perVisitor: 1 },
  tiers: { standard: { budget: { units: 30, period: 24 * HOUR } } },
})

const appSchema = defineSchema({
  strips: defineTable({ idea: v.string(), workspaceId: v.optional(v.string()), jobId: v.optional(v.string()), panels: v.number() }),
})

const preview = jobs.define({
  meter: 'credits',
  cost: 10,
  guest: true,
  args: { stripId: v.id('strips'), panels: v.number() },
  handler: async (job, { stripId, panels }) => {
    await job.progress({ done: panels, total: panels })
    return { stripId }
  },
})

const render = jobs.define({
  meter: 'credits',
  cost: 10,
  args: { stripId: v.id('strips'), panels: v.number() },
  handler: async (_job, { stripId }) => ({ stripId }),
})

/** The kind to enqueue, by name: a guest kind unless the test asks otherwise. */
const KINDS = { preview: 'strips:preview', render: 'strips:render' } as const

const tryOnce = mutationGeneric({
  args: { idea: v.string(), proof: v.union(v.string(), v.null()), kind: v.optional(v.union(v.literal('preview'), v.literal('render'))) },
  handler: async (ctx, { idea, proof, kind }) => {
    await verifyHuman(ctx, proof, { action: 'try-once' })
    const stripId = await ctx.db.insert('strips', { idea, panels: 2 })
    const { jobId } = await jobs.enqueue(ctx, makeFunctionReference<'mutation'>(KINDS[kind ?? 'preview']) as never, { stripId, panels: 2 })
    await ctx.db.patch(stripId, { jobId })
    return { stripId, jobId }
  },
})

/** setupAi({ guest: { claim } }): the strips that name the claimed jobs move to the new workspace. */
const claims: Array<Record<string, unknown>> = []
const claimGuest = internalMutationGeneric({
  args: { jobIds: v.array(v.string()), workspaceId: v.string(), userId: v.string() },
  handler: async (ctx, claim) => {
    claims.push(claim)
    for (const strip of await ctx.db.query('strips').collect()) {
      if (strip.jobId && claim.jobIds.includes(strip.jobId)) await ctx.db.patch(strip._id, { workspaceId: claim.workspaceId })
    }
  },
})

const testApp = defineBackendTestApp(appSchema, {
  './_generated/api.js': () => Promise.resolve({}),
  './jobs.js': () => Promise.resolve(jobs.api),
  './strips.js': () => Promise.resolve({ preview, render, tryOnce, claimGuest }),
})
type App = ReturnType<typeof testApp>

const ref = {
  tryOnce: makeFunctionReference<'mutation', { idea: string, proof: string | null, kind?: 'preview' | 'render' }, { stripId: string, jobId: string }>('strips:tryOnce'),
  getJob: makeFunctionReference<'query', { jobId: string }, Record<string, unknown> | null>('jobs:getJob'),
  listJobs: makeFunctionReference<'query', { paginationOpts: { numItems: number, cursor: string | null } }, { page: Array<Record<string, unknown>> }>('jobs:listJobs'),
}

/** A proof the app's server signed for this browser's visitor, as `useHumanCheck().token('try-once')` gets it. */
async function visitorProof(visitor: string, action = 'try-once') {
  return withVisitor(await signProof(SECRET, { method: VISITOR_METHOD, path: action, audience: AUDIENCE, subject: visitor }), visitor)
}

/** The visitors of three browsers. */
const ADA = 'AdaAdaAdaAdaAdaAdaAda0'
const BOB = 'BobBobBobBobBobBobBob0'
const CY = 'CyCyCyCyCyCyCyCyCyCy00'

async function drain(t: App) {
  await t.finishAllScheduledFunctions(vi.runAllTimers, 500)
}

async function refusal(call: Promise<unknown>) {
  return getBackendError(await call.then(() => null, (error: unknown) => error))
}

/** A job's row, as the component keeps it. */
async function row(t: App, jobId: string) {
  return await t.query(backend.jobs.get as unknown as FunctionReference<'query'>, { jobId }) as Record<string, unknown>
}

/** Give a workspace credits. */
async function fund(t: App, workspaceId: string, balance: number) {
  await t.mutation(backend.billing.upsert as unknown as FunctionReference<'mutation'>, {
    userId: workspaceId,
    activeProductIds: [],
    benefits: [],
    meters: [{ meterId: METER_ID, consumedUnits: 0, creditedUnits: balance, balance }],
  })
}

/** The queue's policy as backend/jobs.ts above declares it, for a pick run by hand. */
const POLICY = { concurrency: 2, perOwner: 1, stallAfter: 5 * 60_000, tiers: [{ name: 'standard', budget: { units: 30, period: 24 * HOUR } }] }

/** What the auth library's user-create hook does for an account created in a visitor's browser. */
async function signUp(t: App, visitor: string) {
  const user = await asUser(t)
  await t.mutation(backend.jobs.claimVisitor as unknown as FunctionReference<'mutation'>, { visitor, userId: user.userId })
  return user
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubEnv('PROTECTION_PROOF_SECRET', SECRET)
  vi.stubEnv('CONVEX_SITE_URL', SITE)
  provider.charges.length = 0
  provider.costs.length = 0
  claims.length = 0
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('a guest job', () => {
  test('runs free for a visitor the bot check proved, once per browser', async () => {
    const t = testApp()
    const { jobId } = await t.mutation(ref.tryOnce, { idea: 'A fox who wants to fly', proof: await visitorProof(ADA) })

    expect(await row(t, jobId)).toMatchObject({ owner: `guest:${ADA}`, visitor: ADA, status: 'queued', budgetCounted: 0, charged: false })
    expect((await row(t, jobId)).hold).toBeUndefined()
    await drain(t)
    expect(await row(t, jobId)).toMatchObject({ status: 'done' })
    // Nothing billed, nothing reported to a customer's cost insights.
    expect(provider.charges).toEqual([])
    expect(provider.costs).toEqual([])

    // The same browser's second try is refused; the whole mutation rolled back.
    expect(await refusal(t.mutation(ref.tryOnce, { idea: 'Again', proof: await visitorProof(ADA) }))).toMatchObject({ code: 'unauthenticated' })
    expect(await t.run(ctx => ctx.db.query('strips').collect())).toHaveLength(1)
  })

  test('is refused without a visitor, for a kind not open to guests, and past the aiGlobal window', async () => {
    const t = testApp()
    // No proof bound to a browser: nobody to count the try against.
    expect(await refusal(t.mutation(ref.tryOnce, { idea: 'x', proof: await signProof(SECRET, { method: 'CALL', path: 'try-once', audience: AUDIENCE }) }))).toMatchObject({ code: 'unauthenticated' })
    // A kind defined without `guest: true`.
    expect(await refusal(t.mutation(ref.tryOnce, { idea: 'x', proof: await visitorProof(ADA), kind: 'render' }))).toMatchObject({ code: 'unauthenticated' })
    // Two visitors fill the hour's window; the third is told to wait.
    await t.mutation(ref.tryOnce, { idea: 'x', proof: await visitorProof(ADA) })
    await t.mutation(ref.tryOnce, { idea: 'x', proof: await visitorProof(BOB) })
    expect(await refusal(t.mutation(ref.tryOnce, { idea: 'x', proof: await visitorProof(CY) }))).toMatchObject({ code: 'rate_limited', data: { limit: 'aiGlobal' } })
  })

  test('counts a held try however many failed jobs came before it, and the claim takes it', async () => {
    const t = testApp()
    const join = () => t.mutation(backend.jobs.join as unknown as FunctionReference<'mutation'>, { kind: KINDS.preview, args: {}, owner: `guest:${ADA}`, visitor: ADA, cost: 10, budgetCounted: 0, policy: POLICY }) as Promise<string>
    const finish = (jobId: string, outcome: 'done' | 'failed') => t.mutation(backend.jobs.finish as unknown as FunctionReference<'mutation'>, { jobId, outcome })
    // A hundred tries that failed and gave their try back, then one that is done.
    for (let index = 0; index < 100; index++) await finish(await join(), 'failed')
    const kept = await join()
    await finish(kept, 'done')

    expect(await t.query(backend.jobs.visitorJobs as unknown as FunctionReference<'query'>, { visitor: ADA })).toBe(1)
    expect(await refusal(t.mutation(ref.tryOnce, { idea: 'Again', proof: await visitorProof(ADA) }))).toMatchObject({ code: 'unauthenticated' })
    const ada = await signUp(t, ADA)
    expect(await row(t, kept)).toMatchObject({ userId: ada.userId })
  })

  test('is read by nobody but an administrator before its claim', async () => {
    const t = testApp()
    const { jobId } = await t.mutation(ref.tryOnce, { idea: 'x', proof: await visitorProof(ADA) })
    expect(await t.query(ref.getJob, { jobId })).toBeNull()
    const someone = await asUser(t)
    expect(await someone.query(ref.getJob, { jobId })).toBeNull()
    const admin = await asUser(t, { role: 'admin' })
    expect((await admin.query(ref.listJobs, { paginationOpts: { numItems: 10, cursor: null } })).page).toEqual([expect.objectContaining({ id: jobId, owner: `guest:${ADA}`, guest: true })])
  })
})

describe('the claim at sign-up', () => {
  test('moves the visitor\'s jobs and the app\'s rows to the new account\'s workspace; a waiting one still runs as a guest', async () => {
    const t = testApp()
    const { jobId, stripId } = await t.mutation(ref.tryOnce, { idea: 'A fox who wants to fly', proof: await visitorProof(ADA) })
    const bob = await t.mutation(ref.tryOnce, { idea: 'Another browser', proof: await visitorProof(BOB) })

    const ada = await signUp(t, ADA)
    await drain(t)

    expect(await row(t, jobId)).toMatchObject({ owner: ada.workspaceId, userId: ada.userId, visitor: ADA, status: 'done', budgetCounted: 0, charged: false })
    expect(claims).toEqual([{ jobIds: [jobId], workspaceId: ada.workspaceId, userId: ada.userId }])
    expect(await t.run(ctx => ctx.db.get(stripId as never))).toMatchObject({ workspaceId: ada.workspaceId })
    // The new account reads its job; the other browser's stays the other visitor's.
    expect(await ada.query(ref.getJob, { jobId })).toMatchObject({ id: jobId, status: 'done' })
    expect(await ada.query(ref.getJob, { jobId: bob.jobId })).toBeNull()
    expect(await row(t, bob.jobId)).toMatchObject({ owner: `guest:${BOB}` })
    expect((await row(t, bob.jobId)).userId).toBeUndefined()
    expect(provider.charges).toEqual([])
  })

  test('a claimed job that waits still counts against its visitor, never against the workspace\'s perOwner or budget', async () => {
    const t = testApp()
    await t.mutation(backend.jobs.setQueue as unknown as FunctionReference<'mutation'>, { paused: true })
    const guestJob = await t.mutation(ref.tryOnce, { idea: 'Free', proof: await visitorProof(ADA) })
    const ada = await signUp(t, ADA)
    await fund(t, ada.workspaceId!, 100)
    // The new account's own job, paid from its credits, beside the claimed one.
    const paid = await ada.mutation(ref.tryOnce, { idea: 'Paid', proof: await visitorProof(ADA), kind: 'render' })
    await drain(t)
    expect(await row(t, guestJob.jobId)).toMatchObject({ owner: ada.workspaceId, visitor: ADA, status: 'queued', rank: 1 })
    expect(await row(t, paid.jobId)).toMatchObject({ owner: ada.workspaceId, status: 'queued', budgetCounted: 10 })

    // With perOwner 1, both start at once: the guest job counts against its visitor.
    await t.mutation(backend.jobs.setQueue as unknown as FunctionReference<'mutation'>, { paused: false })
    const { started } = await t.mutation(backend.jobs.pick as unknown as FunctionReference<'mutation'>, { policy: POLICY, pausedAi: false }) as { started: Array<{ jobId: string }> }
    expect(started.map(job => job.jobId).sort()).toEqual([guestJob.jobId, paid.jobId].sort())
  })

  test('is the first account\'s only: a second sign-up in the same browser claims nothing', async () => {
    const t = testApp()
    const { jobId } = await t.mutation(ref.tryOnce, { idea: 'x', proof: await visitorProof(ADA) })
    const first = await signUp(t, ADA)
    await drain(t)
    const second = await signUp(t, ADA)
    await drain(t)
    expect(await row(t, jobId)).toMatchObject({ owner: first.workspaceId, userId: first.userId })
    expect(await second.query(ref.getJob, { jobId })).toBeNull()
    expect(claims).toHaveLength(1)
    // And the browser's try stays used.
    expect(await refusal(t.mutation(ref.tryOnce, { idea: 'Again', proof: await visitorProof(ADA) }))).toMatchObject({ code: 'unauthenticated' })
  })

  test('waits about a minute for the account\'s workspace, then leaves the jobs under their visitor', async () => {
    const t = testApp()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { jobId } = await t.mutation(ref.tryOnce, { idea: 'x', proof: await visitorProof(ADA) })
    const user = await asUser(t, { workspace: false })
    await t.mutation(backend.jobs.claimVisitor as unknown as FunctionReference<'mutation'>, { visitor: ADA, userId: user.userId })
    await drain(t)
    expect(await row(t, jobId)).toMatchObject({ owner: `guest:${ADA}`, userId: user.userId })
    expect(claims).toEqual([])
    expect(error.mock.calls.flat().join(' ')).toContain('ai.guest_claim_failed')
  })
})

describe('a browser\'s used try', () => {
  const component = () => convexTest(componentSchema, componentModules)
  const jobsFn = <Kind extends 'query' | 'mutation'>(name: string) => makeFunctionReference<Kind>(`jobs:${name}`) as unknown as FunctionReference<Kind>
  const DAY = 24 * HOUR
  const join = (t: ReturnType<typeof component>, visitor?: string) => t.mutation(jobsFn<'mutation'>('join'), {
    kind: KINDS.preview,
    args: {},
    owner: visitor ? `guest:${visitor}` : 'org_1',
    ...(visitor ? { visitor } : {}),
    cost: 10,
    budgetCounted: 0,
    policy: POLICY,
  }) as Promise<string>
  const tries = (t: ReturnType<typeof component>, visitor: string) => t.query(jobsFn<'query'>('visitorJobs'), { visitor }) as Promise<number>

  test('stays used for the visitor cookie\'s year, after the prune deletes its job 30 days on', async () => {
    const t = component()
    const done = await join(t, ADA)
    await t.mutation(jobsFn<'mutation'>('finish'), { jobId: done, outcome: 'done' })
    // A failed try gives its try back, and its record goes with the prune too.
    await t.mutation(jobsFn<'mutation'>('finish'), { jobId: await join(t, ADA), outcome: 'failed' })
    expect(await tries(t, ADA)).toBe(1)

    await t.run(ctx => MAINTENANCE_TASKS.jobs(ctx as never, Date.now() + JOB_RETENTION_MS + DAY))
    expect(await t.run(ctx => ctx.db.query('jobs').collect())).toEqual([])
    expect(await tries(t, ADA)).toBe(1)
    expect(await tries(t, BOB)).toBe(0)

    // A year after the last try, the count goes, as the cookie does.
    await t.run(ctx => MAINTENANCE_TASKS.guestTries(ctx as never, Date.now() + GUEST_TRIES_RETENTION_MS - DAY))
    expect(await tries(t, ADA)).toBe(1)
    await t.run(ctx => MAINTENANCE_TASKS.guestTries(ctx as never, Date.now() + GUEST_TRIES_RETENTION_MS + DAY))
    expect(await tries(t, ADA)).toBe(0)
  })

  test('is the claiming account\'s, so its erasure removes the count', async () => {
    const t = component()
    const jobId = await join(t, ADA)
    await t.mutation(jobsFn<'mutation'>('finish'), { jobId, outcome: 'done' })
    await t.mutation(jobsFn<'mutation'>('claimVisitor'), { visitor: ADA, userId: 'user_ada' })
    expect(await t.run(ctx => ctx.db.query('guestTries').collect())).toEqual([expect.objectContaining({ visitor: ADA, done: 1, userId: 'user_ada' })])
  })

  test('the Queue tab counts the guest jobs that run and wait', async () => {
    const t = component()
    await join(t, ADA)
    await join(t, BOB)
    await join(t)
    await t.mutation(jobsFn<'mutation'>('pick'), { policy: POLICY, pausedAi: false })
    const overview = await t.query(jobsFn<'query'>('overview'), { policy: POLICY, models: [] }) as { running: number, waiting: number, guests: { running: number, waiting: number } }
    expect(overview).toMatchObject({ running: 2, waiting: 1 })
    expect(overview.guests.running + overview.guests.waiting).toBe(2)
  })
})
