/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, defineTable, type FunctionReference, internalMutationGeneric, makeFunctionReference, mutationGeneric } from 'convex/server'
import { v } from 'convex/values'
import { generateText } from 'ai'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { backendError, getBackendError } from '../../src/convex/errors'
import { defineJobQueue, setupAi } from '../../src/convex/integrations/ai'
import type { Billing } from '../../src/convex/integrations/billing'
import { setupRateLimiter } from '../../src/convex/integrations/rate-limit'

// defineJobQueue where it refuses and where a job goes wrong, the way
// backend/jobs.ts and a strips module use it: a queue it cannot build, a job
// it will not put in line, a step that waits for its model's turn, a running
// job that stops answering (the stall sweep) or is canceled, a charge the
// billing provider refuses, a handler that throws outside its steps, a cost
// report that does not land, and what an administrator may retune. The happy
// path, the line and the refunds are in jobs.test.ts.

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const METER_ID = 'm1'
const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'>, rateLimiter: never, workflow: never, persistentTextStreaming: never }
const backend = components.backend

/** What the fake billing provider was asked to do. */
const provider = { charges: [] as string[], refunds: [] as Array<{ userId: string, value: number }>, costs: [] as Array<Record<string, unknown>> }

/** How the fake provider misbehaves: a charge it refuses (plainly, or as a catalog error), refunds it refuses, a cost report it drops, the plans it has on sale. */
const misbehave = { settle: null as null | 'plain' | 'catalog', refund: false, report: false, plans: 'pro' as 'pro' | 'none' | 'down' }

// A billing stand-in over the component's real credit cache, as jobs.test.ts
// has it. An account outside any workspace has no billing entity.
const billing = {
  requireEntity: async (ctx: { auth: { getUserIdentity: () => Promise<Record<string, unknown> | null> } }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw backendError('unauthenticated', {})
    if (typeof identity.activeOrganizationId !== 'string') throw backendError('forbidden', { reason: 'no_workspace' })
    return { userId: identity.activeOrganizationId, email: identity.email as string }
  },
  reserveCredits: async (ctx: { runMutation: (ref: unknown, args: unknown) => Promise<{ ok: boolean, balance: number }> }, event: { userId: string, value: number, externalId: string, hold?: number }) => {
    const result = await ctx.runMutation(backend.billing.debit, { userId: event.userId, meterId: METER_ID, amount: event.value, externalId: event.externalId, ...(event.hold ? { hold: event.hold } : {}) })
    if (!result.ok) throw backendError('insufficient_credits', { meter: 'credits', balance: result.balance, need: event.value })
    return { entityId: event.userId, externalId: event.externalId, reserved: true, meter: 'credits', meterId: METER_ID, value: event.value }
  },
  settleSpend: async (ctx: { runMutation: (ref: unknown, args: unknown) => Promise<unknown> }, reservation: { entityId: string, externalId: string }) => {
    if (misbehave.settle === 'plain') throw new Error('The billing provider answered 503.')
    if (misbehave.settle === 'catalog') throw backendError('unavailable', { service: 'billing', reason: 'provider_refused' })
    provider.charges.push(reservation.externalId)
    await ctx.runMutation(backend.billing.settle, { userId: reservation.entityId, externalId: reservation.externalId })
  },
  releaseSpend: async (ctx: { runMutation: (ref: unknown, args: unknown) => Promise<unknown> }, reservation: { entityId: string, externalId: string }) => {
    await ctx.runMutation(backend.billing.release, { userId: reservation.entityId, externalId: reservation.externalId })
  },
  refundCredits: async (ctx: { runMutation: (ref: unknown, args: unknown) => Promise<unknown> }, event: { userId: string, value: number }) => {
    if (misbehave.refund) throw new Error('The billing provider answered 503.')
    provider.refunds.push({ userId: event.userId, value: event.value })
    await ctx.runMutation(backend.billing.credit, { userId: event.userId, meterId: METER_ID, amount: event.value })
  },
  reportCost: async (_ctx: unknown, report: Record<string, unknown>) => {
    if (misbehave.report) throw new Error('The billing provider answered 500.')
    provider.costs.push(report)
  },
  requireFeature: async (_ctx: unknown, feature: string) => {
    if (misbehave.plans === 'down') throw backendError('unavailable', { service: 'billing', reason: 'provider_refused' })
    throw backendError('feature_required', { feature, plans: misbehave.plans === 'pro' ? ['pro'] : [] })
  },
  recordEvent: async () => {},
} as unknown as Billing

const rateLimiter = setupRateLimiter(components as never)
const ai = setupAi(components as never, { billing, rateLimiter })
const jobs = defineJobQueue(components as never, {
  ai,
  concurrency: 2,
  tiers: {
    priority: { feature: 'priority_queue', headStart: 10 * MINUTE, dedicated: 1, perOwner: 2 },
    standard: { budget: { units: 30, period: DAY } },
  },
  models: { 'test/image': { perMinute: 60, min: 1, max: 120 } },
})

const appSchema = defineSchema({
  strips: defineTable({ workspaceId: v.string(), idea: v.string(), panels: v.array(v.string()), jobId: v.optional(v.string()) }),
})

const drawPanel = jobs.step({
  model: 'test/image',
  args: { stripId: v.id('strips'), idea: v.string(), panel: v.number() },
  handler: async (ctx, { stripId, idea, panel }) => {
    const { text } = await generateText({ model: ctx.model(), prompt: `Panel ${panel} about ${idea}` })
    await ctx.runMutation(makeFunctionReference<'mutation'>('strips:savePanel'), { stripId, text })
    return panel
  },
})

const render = jobs.define({
  meter: 'credits',
  cost: ({ panels }) => panels * 5,
  args: { stripId: v.id('strips'), idea: v.string(), panels: v.number() },
  handler: async (job, { stripId, idea, panels }) => {
    for (let panel = 1; panel <= panels; panel++) {
      await job.run(makeFunctionReference<'action'>('strips:drawPanel') as unknown as FunctionReference<'action', 'internal'>, { stripId, idea, panel })
    }
    return { stripId }
  },
})

/** A step that names no model, in an app whose setupAi names none either. */
const caption = jobs.step({
  args: { idea: v.string() },
  handler: async (ctx, { idea }) => (await generateText({ model: ctx.model(), prompt: idea })).text,
})

/** A free kind whose handler goes wrong as `mode` says, outside any step. */
const misfire = jobs.define({
  meter: false,
  args: { mode: v.string() },
  handler: async (job, { mode }) => {
    if (mode === 'catalog') throw backendError('invalid_input', { field: 'idea', reason: 'too_vague' }, 'Not a strip idea.')
    if (mode === 'plain') throw new Error('The strip could not be laid out.')
    // Text that only looks like the queue's own mark: never read as a catalog error.
    if (mode === 'lookalike') throw new Error('nuxt-backend:job-error:{not json')
    if (mode === 'codeless') throw new Error('nuxt-backend:job-error:{"field":"idea"}')
    if (mode === 'progress') await job.progress({ done: -1, total: 3 })
    if (mode === 'unmodelled') await job.run(makeFunctionReference<'action'>('strips:caption') as unknown as FunctionReference<'action', 'internal'>, { idea: 'A fox' })
    return null
  },
})

/** A metered kind that fails once its charge is made. */
const doomed = jobs.define({
  meter: 'credits',
  cost: 5,
  args: {},
  handler: async () => {
    throw new Error('kaboom')
  },
})
/** Free kinds whose price is no price, and a metered one whose price is nothing. */
const negative = jobs.define({ meter: false, cost: -1, args: {}, handler: async () => null })
const priceless = jobs.define({ meter: 'credits', cost: () => 0, args: {}, handler: async () => null })
/** An internal mutation of the app's that is no kind. */
const notAKind = internalMutationGeneric({ args: { quote: v.optional(v.any()) }, handler: async () => null })

const create = mutationGeneric({
  args: { idea: v.string(), panels: v.number() },
  handler: async (ctx, { idea, panels }) => {
    const identity = (await ctx.auth.getUserIdentity())!
    const stripId = await ctx.db.insert('strips', { workspaceId: identity.activeOrganizationId as string, idea, panels: [] })
    const { jobId } = await jobs.enqueue(ctx, makeFunctionReference<'mutation'>('strips:render') as never, { stripId, idea, panels })
    await ctx.db.patch(stripId, { jobId })
    return { stripId, jobId }
  },
})
/** Start a kind by name, as a mutation of the app's would, billed as `billTo` says. */
const start = mutationGeneric({
  args: { kind: v.string(), args: v.any(), billTo: v.optional(v.string()) },
  handler: async (ctx, { kind, args, billTo }) => jobs.enqueue(ctx, makeFunctionReference<'mutation'>(`strips:${kind}`) as never, args, billTo === undefined ? undefined : { billTo: billTo as never }),
})
/** Another caller of a model spends its turns ahead, at the limit the queue sets (one a minute here). */
const takeTurns = mutationGeneric({
  args: { model: v.string(), count: v.number() },
  handler: async (ctx, { model, count }) => {
    // `jobModel` is a bucket the queue names at run time, which the limiter's
    // typed names cannot know.
    const limiter = rateLimiter as unknown as { limit: (...args: unknown[]) => Promise<unknown> }
    await limiter.limit(ctx, 'jobModel', { key: model, count, reserve: true, config: { kind: 'token bucket', rate: 1, period: MINUTE, capacity: 1 } })
  },
})
const savePanel = mutationGeneric({
  args: { stripId: v.id('strips'), text: v.string() },
  handler: async (ctx, { stripId, text }) => {
    const strip = (await ctx.db.get(stripId))!
    await ctx.db.patch(stripId, { panels: [...strip.panels, text] })
  },
})

const testApp = defineBackendTestApp(appSchema, {
  './_generated/api.js': () => Promise.resolve({}),
  './ai.js': () => Promise.resolve(ai.api),
  './jobs.js': () => Promise.resolve(jobs.api),
  './strips.js': () => Promise.resolve({ render, drawPanel, caption, misfire, doomed, negative, priceless, notAKind, create, start, takeTurns, savePanel }),
})
type App = ReturnType<typeof testApp>

type Page = { page: Array<Record<string, unknown>>, isDone: boolean }
const firstPage = { numItems: 10, cursor: null }
const ref = {
  create: makeFunctionReference<'mutation', { idea: string, panels: number }, { stripId: string, jobId: string }>('strips:create'),
  start: makeFunctionReference<'mutation', { kind: string, args: Record<string, unknown>, billTo?: string }, { jobId: string }>('strips:start'),
  drawPanel: makeFunctionReference<'action', Record<string, unknown>, unknown>('strips:drawPanel'),
  takeTurns: makeFunctionReference<'mutation', { model: string, count: number }, null>('strips:takeTurns'),
  getJob: makeFunctionReference<'query', { jobId: string }, Record<string, unknown> | null>('jobs:getJob'),
  cancelJob: makeFunctionReference<'mutation', { jobId: string, refund?: boolean }, null>('jobs:cancelJob'),
  getQueue: makeFunctionReference<'query', Record<string, never>, Record<string, unknown> | null>('jobs:getQueue'),
  listJobs: makeFunctionReference<'query', { paginationOpts: typeof firstPage, deadLetters?: boolean }, Page>('jobs:listJobs'),
  setQueue: makeFunctionReference<'mutation', Record<string, unknown>, null>('jobs:setQueue'),
  retryJob: makeFunctionReference<'mutation', { jobId: string }, null>('jobs:retryJob'),
  runQueue: makeFunctionReference<'mutation', Record<string, unknown>, null>('jobs:runQueue'),
  billJob: makeFunctionReference<'action', { op: string, jobId: string }, null>('jobs:billJob'),
}

async function fund(t: App, workspaceId: string, balance: number) {
  await t.mutation(backend.billing.upsert as unknown as FunctionReference<'mutation'>, {
    userId: workspaceId,
    activeProductIds: [],
    benefits: [],
    meters: [{ meterId: METER_ID, consumedUnits: 0, creditedUnits: balance, balance }],
  })
}

async function balanceOf(t: App, workspaceId: string): Promise<number | undefined> {
  const row = await t.query(backend.billing.getByUser as unknown as FunctionReference<'query'>, { userId: workspaceId }) as { meters: Array<{ balance: number }> } | null
  return row?.meters[0]?.balance
}

/** A job's row, as the component keeps it. */
async function row(t: App, jobId: string) {
  return await t.query(backend.jobs.get as unknown as FunctionReference<'query'>, { jobId }) as Record<string, unknown>
}

/** Pause or resume the line in the component, as the console's switch does. */
const pause = (t: App, paused: boolean) => t.mutation(backend.jobs.setQueue as unknown as FunctionReference<'mutation'>, { paused })

/** Run every scheduled function, the workflows' steps and sleeps included. */
async function drain(t: App) {
  await t.finishAllScheduledFunctions(vi.runAllTimers, 500)
}

async function refusal(call: Promise<unknown>) {
  return getBackendError(await call.then(() => null, (error: unknown) => error))
}

/** Every line the backend logged at `level`, as one text. */
const logged = (level: 'warn' | 'error') => vi.mocked(console[level]).mock.calls.flat().map(String).join('\n')

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  misbehave.settle = null
  misbehave.refund = false
  misbehave.report = false
  misbehave.plans = 'pro'
  provider.charges.length = 0
  provider.refunds.length = 0
  provider.costs.length = 0
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('defineJobQueue', () => {
  test('refuses a queue it cannot run: no setupAi instance, no Workflow component, a guest rule it cannot keep, a model limit out of order', () => {
    expect(() => defineJobQueue(components as never, { ai: {} as never })).toThrow(/`ai` is not a setupAi instance/)
    expect(() => defineJobQueue({ backend: components.backend }, { ai })).toThrow(/no Workflow component/)
    expect(() => defineJobQueue(components as never, { ai, guest: { perVisitor: 0 } })).toThrow(/`guest.perVisitor` is a whole number of 1 or more/)
    expect(() => defineJobQueue(components as never, { ai, guest: { perVisitor: 1.5 } })).toThrow(/`guest.perVisitor`/)
    const unlimited = setupAi(components as never, { billing })
    expect(() => defineJobQueue(components as never, { ai: unlimited, guest: { perVisitor: 1 } })).toThrow(/setupAi needs a `rateLimiter`/)
    expect(() => defineJobQueue(components as never, { ai, models: { 'test/image': { perMinute: 5, min: 10 } } })).toThrow(/needs 1 ≤ min ≤ perMinute ≤ max/)
    expect(() => defineJobQueue(components as never, { ai, models: { 'test/image': { perMinute: 50, max: 40 } } })).toThrow(/needs 1 ≤ min ≤ perMinute ≤ max/)
  })

  test('refuses a metered kind priced at nothing where it is defined', () => {
    expect(() => jobs.define({ meter: 'credits', cost: 0, args: {}, handler: async () => null })).toThrow(/must be a finite number above zero/)
  })
})

describe('jobs.enqueue', () => {
  test('refuses what is no job it can put in line: a billTo it does not know, a mutation that is no kind, a price that is no price', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    await expect(ada.mutation(ref.start, { kind: 'misfire', args: { mode: 'none' }, billTo: 'workspace' })).rejects.toThrow(/`billTo` is 'entity' or 'app'/)
    await expect(ada.mutation(ref.start, { kind: 'notAKind', args: {} })).rejects.toThrow(/strips:notAKind is no jobs.define export/)
    await expect(ada.mutation(ref.start, { kind: 'negative', args: {} })).rejects.toThrow(/`cost` is a number of 0 or more/)
    await expect(ada.mutation(ref.start, { kind: 'priceless', args: {} })).rejects.toThrow(/must be a finite number above zero/)
    expect(await balanceOf(t, ada.workspaceId!)).toBe(100)
    expect((await (await asUser(t, { role: 'admin' })).query(ref.listJobs, { paginationOpts: firstPage })).page).toEqual([])
  })

  test('refuses a job while a model the queue lists has no route on this deployment', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    vi.stubEnv('AI_GATEWAY_API_KEY', '')
    vi.stubEnv('CONVEX_CLOUD_URL', '')
    const TEST_MODELS = Symbol.for('nuxt-backend.testModels')
    const installed = (globalThis as Record<symbol, unknown>)[TEST_MODELS]
    ;(globalThis as Record<symbol, unknown>)[TEST_MODELS] = undefined
    try {
      expect(await refusal(ada.mutation(ref.create, { idea: 'A fox', panels: 1 }))).toMatchObject({ code: 'unavailable', data: { service: 'ai', reason: 'not_configured' } })
    }
    finally {
      ;(globalThis as Record<symbol, unknown>)[TEST_MODELS] = installed
    }
    expect(await balanceOf(t, ada.workspaceId!)).toBe(100)
  })

  test('refuses a job over every budget on sale as over_budget, and passes on a billing outage met while asking', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 500)
    // 35 credits, over the standard tier's 30, and no plan on sale grants the tier above.
    misbehave.plans = 'none'
    expect(await refusal(ada.mutation(ref.create, { idea: 'Huge', panels: 7 }))).toMatchObject({ code: 'invalid_input', data: { field: 'cost', reason: 'over_budget', need: 35, units: 30 } })
    misbehave.plans = 'down'
    expect(await refusal(ada.mutation(ref.create, { idea: 'Huge', panels: 7 }))).toMatchObject({ code: 'unavailable', data: { service: 'billing' } })
    // Nothing held, and the window's budget untouched: a 30-credit job still fits.
    expect(await balanceOf(t, ada.workspaceId!)).toBe(500)
    await ada.mutation(ref.create, { idea: 'Fits', panels: 6 })
    expect(await balanceOf(t, ada.workspaceId!)).toBe(470)
  })
})

describe('a step', () => {
  test('waits for its model\'s turn, however long, without spending an attempt or stalling', async () => {
    const t = testApp()
    const ada = await asUser(t)
    const admin = await asUser(t, { role: 'admin' })
    await fund(t, ada.workspaceId!, 100)
    // One call a minute, and another caller of the model took the next 600: the step waits ten hours,
    // its lease held all the while, so the stall sweep never takes it for dead.
    await admin.mutation(ref.setQueue, { model: { id: 'test/image', perMinute: 1 } })
    await t.mutation(ref.takeTurns, { model: 'test/image', count: 600 })
    const { jobId } = await ada.mutation(ref.create, { idea: 'A patient fox', panels: 1 })
    await drain(t)

    const job = await row(t, jobId)
    expect(job).toMatchObject({ status: 'done', attempts: 1 })
    expect((job.endedAt as number) - (job.startedAt as number)).toBeGreaterThanOrEqual(599 * MINUTE)
  })

  test('runs only through job.run in a job\'s handler', async () => {
    const t = testApp()
    const stripId = await t.run(ctx => ctx.db.insert('strips', { workspaceId: 'w', idea: 'x', panels: [] }))
    await expect(t.action(ref.drawPanel, { stripId, idea: 'x', panel: 1 })).rejects.toThrow(/runs through job.run/)
  })

  test('with no model to call anywhere fails its job, saying so to administrators', async () => {
    const t = testApp()
    const ada = await asUser(t)
    const { jobId } = await ada.mutation(ref.start, { kind: 'misfire', args: { mode: 'unmodelled' } })
    await drain(t)
    expect((await ada.query(ref.getJob, { jobId }))?.status).toBe('failed')
    const admin = await asUser(t, { role: 'admin' })
    const [listed] = (await admin.query(ref.listJobs, { paginationOpts: firstPage, deadLetters: true })).page
    expect(listed).toMatchObject({ id: jobId, deadLetter: true, lastError: expect.stringContaining('no model to call') })
  })
})

describe('a job\'s handler that throws outside its steps', () => {
  test('fails the job with a catalog error as that error', async () => {
    const t = testApp()
    const ada = await asUser(t)
    const { jobId } = await ada.mutation(ref.start, { kind: 'misfire', args: { mode: 'catalog' } })
    await drain(t)
    expect(await ada.query(ref.getJob, { jobId })).toMatchObject({ status: 'failed', error: { code: 'invalid_input', field: 'idea', reason: 'too_vague' } })
  })

  test('fails the job as job_failed with any other error, logged; text that only looks like a catalog error included', async () => {
    const t = testApp()
    const ada = await asUser(t)
    const started = await Promise.all(['plain', 'lookalike', 'codeless', 'progress'].map(mode => ada.mutation(ref.start, { kind: 'misfire', args: { mode } })))
    await drain(t)
    for (const { jobId } of started) {
      expect(await ada.query(ref.getJob, { jobId })).toMatchObject({ status: 'failed', error: { code: 'unavailable', service: 'ai', reason: 'job_failed' } })
    }
    expect(logged('error')).toContain('ai.job_failed')
    expect(logged('error')).toContain('`done` and `total` are numbers of 0 or more')
  })
})

describe('a running job', () => {
  /** A job put in line while the line is paused, then started by a pick: running, its charge not yet made. */
  async function running(t: App, user: Awaited<ReturnType<typeof asUser>>) {
    await pause(t, true)
    const { jobId } = await user.mutation(ref.create, { idea: 'A fox who wants to fly', panels: 1 })
    await pause(t, false)
    await t.mutation(ref.runQueue, { op: 'pick' })
    expect(await row(t, jobId)).toMatchObject({ status: 'running', workflowId: expect.any(String) })
    return jobId
  }

  test('that shows no sign of life fails at the next pick, gives its hold back and its workflow stops', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    const jobId = await running(t, ada)
    expect(await balanceOf(t, ada.workspaceId!)).toBe(95)
    // Five minutes and more without a sign of life.
    vi.setSystemTime(Date.now() + 6 * MINUTE)
    await t.mutation(ref.runQueue, { op: 'pick' })
    expect(await ada.query(ref.getJob, { jobId })).toMatchObject({ status: 'failed', error: { code: 'unavailable', service: 'ai', reason: 'stalled' } })
    expect(logged('error')).toContain('ai.job_stalled')
    await drain(t)
    // The workflow never ran its charge or its steps.
    expect(await row(t, jobId)).toMatchObject({ status: 'failed', charged: false })
    expect(provider.charges).toEqual([])
    expect(await balanceOf(t, ada.workspaceId!)).toBe(100)
  })

  test('whose workflow cannot be canceled still fails once stalled, and the line moves on', async () => {
    const t = testApp()
    const policy = { concurrency: 2, perOwner: 1, stallAfter: 5 * MINUTE, tiers: [] }
    const call = (name: string, args: Record<string, unknown>) => t.mutation((backend.jobs as Record<string, unknown>)[name] as FunctionReference<'mutation'>, args)
    // Two jobs started by hand: one with no workflow, one whose workflow is gone.
    const lone = await call('join', { kind: 'strips:misfire', args: { mode: 'none' }, owner: 'workspace-a', cost: 0, budgetCounted: 0, policy }) as string
    const orphan = await call('join', { kind: 'strips:misfire', args: { mode: 'none' }, owner: 'workspace-b', cost: 0, budgetCounted: 0, policy }) as string
    await call('pick', { policy, pausedAi: false })
    await call('attachWorkflow', { jobId: orphan, workflowId: 'no-such-workflow' })
    vi.setSystemTime(Date.now() + 6 * MINUTE)
    await t.mutation(ref.runQueue, { op: 'pick' })
    expect(await row(t, lone)).toMatchObject({ status: 'failed', error: { reason: 'stalled' } })
    expect(await row(t, orphan)).toMatchObject({ status: 'failed', error: { reason: 'stalled' } })
    expect(logged('warn')).toContain('ai.job_cancel_failed')
  })

  test('canceled by who started it stops its workflow, gives its hold back and charges nothing', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    const jobId = await running(t, ada)
    expect(await ada.query(ref.getJob, { jobId })).toMatchObject({ canCancel: true })
    await ada.mutation(ref.cancelJob, { jobId })
    await drain(t)
    expect(await ada.query(ref.getJob, { jobId })).toMatchObject({ status: 'canceled', canCancel: false })
    expect(provider.charges).toEqual([])
    expect(await balanceOf(t, ada.workspaceId!)).toBe(100)
  })
})

describe('cancelJob', () => {
  test('is for who started the job and the workspace\'s owners, and a refund for an administrator only', async () => {
    const t = testApp()
    const ada = await asUser(t)
    const bob = await asUser(t, { workspace: ada.workspaceId })
    const stranger = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    await pause(t, true)
    const { jobId } = await bob.mutation(ref.create, { idea: 'Bob\'s strip', panels: 1 })

    expect(await refusal(t.mutation(ref.cancelJob, { jobId }))).toMatchObject({ code: 'unauthenticated' })
    expect(await refusal(stranger.mutation(ref.cancelJob, { jobId }))).toMatchObject({ code: 'forbidden', data: { reason: 'not_allowed' } })
    expect(await refusal(bob.mutation(ref.cancelJob, { jobId, refund: true }))).toMatchObject({ code: 'forbidden', data: { reason: 'admin_only' } })
    // The workspace's owner cancels a member's job.
    expect(await ada.query(ref.getJob, { jobId })).toMatchObject({ canCancel: true })
    await ada.mutation(ref.cancelJob, { jobId })
    expect((await bob.query(ref.getJob, { jobId }))?.status).toBe('canceled')
    expect(await balanceOf(t, ada.workspaceId!)).toBe(100)
  })

  test('leaves a job that ended as it ended', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    const { jobId } = await ada.mutation(ref.create, { idea: 'Done soon', panels: 1 })
    await drain(t)
    await ada.mutation(ref.cancelJob, { jobId })
    expect(await ada.query(ref.getJob, { jobId })).toMatchObject({ status: 'done', canCancel: false })
    expect(provider.charges).toHaveLength(1)
    expect(provider.refunds).toEqual([])
  })
})

describe('a charge the billing provider refuses', () => {
  test('fails the job as provider_refused, gives the hold back, and a retry waits until the charge can no longer land', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    misbehave.settle = 'plain'
    const { jobId } = await ada.mutation(ref.create, { idea: 'Unbillable', panels: 1 })
    await drain(t)

    expect(await ada.query(ref.getJob, { jobId })).toMatchObject({ status: 'failed', error: { code: 'unavailable', service: 'ai', reason: 'provider_refused' } })
    expect(provider.charges).toEqual([])
    expect(await balanceOf(t, ada.workspaceId!)).toBe(100)

    misbehave.settle = null
    const admin = await asUser(t, { role: 'admin' })
    expect(await refusal(admin.mutation(ref.retryJob, { jobId }))).toMatchObject({ code: 'invalid_input', data: { field: 'jobId', reason: 'charge_pending' } })
    vi.setSystemTime(Date.now() + 16 * MINUTE)
    const later = await asUser(t, { role: 'admin' })
    await later.mutation(ref.retryJob, { jobId })
    await drain(t)
    expect((await ada.query(ref.getJob, { jobId }))?.status).toBe('done')
    expect(provider.charges).toHaveLength(1)
    expect(await balanceOf(t, ada.workspaceId!)).toBe(95)
  })

  test('with a catalog error fails the job with that error', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    misbehave.settle = 'catalog'
    const { jobId } = await ada.mutation(ref.create, { idea: 'Unbillable', panels: 1 })
    await drain(t)
    expect(await ada.query(ref.getJob, { jobId })).toMatchObject({ status: 'failed', error: { code: 'unavailable', service: 'billing', reason: 'provider_refused' } })
    expect(await balanceOf(t, ada.workspaceId!)).toBe(100)
  })
})

describe('the billing a job owes', () => {
  test('a cost report that does not land is logged, and the job is done all the same', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    misbehave.report = true
    const { jobId } = await ada.mutation(ref.create, { idea: 'A fox', panels: 1 })
    await drain(t)
    expect((await ada.query(ref.getJob, { jobId }))?.status).toBe('done')
    expect(provider.costs).toEqual([])
    expect(logged('warn')).toContain('ai.job_cost_unreported')
  })

  test('a refund run again after it landed gives nothing twice', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    // Charged, then failed: refunded once.
    const { jobId } = await ada.mutation(ref.start, { kind: 'doomed', args: {} })
    await drain(t)
    expect(await row(t, jobId)).toMatchObject({ status: 'failed', charged: true, refunded: true })
    expect(provider.refunds).toEqual([{ userId: ada.workspaceId, value: 5 }])
    // The refund's run again, as a retried scheduled function would be: nothing is owed, so nothing moves.
    await t.action(ref.billJob, { op: 'refund', jobId })
    expect(provider.refunds).toHaveLength(1)
    expect(await balanceOf(t, ada.workspaceId!)).toBe(100)
  })
})

describe('a retried job that carries its first run\'s charge', () => {
  test('canceled before it starts gets that charge back', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    // Charged, then failed, and every refund refused: the job still owes its 5 credits.
    misbehave.refund = true
    const { jobId } = await ada.mutation(ref.start, { kind: 'doomed', args: {} })
    await drain(t)
    expect(await row(t, jobId)).toMatchObject({ status: 'failed', charged: true, refunded: false, refundOwed: 'given_up' })
    expect(await balanceOf(t, ada.workspaceId!)).toBe(95)

    // An administrator retries it on the charge it paid; it is canceled while it waits.
    misbehave.refund = false
    await pause(t, true)
    await (await asUser(t, { role: 'admin' })).mutation(ref.retryJob, { jobId })
    expect(await balanceOf(t, ada.workspaceId!)).toBe(95)
    await ada.mutation(ref.cancelJob, { jobId })
    await drain(t)
    expect(await row(t, jobId)).toMatchObject({ status: 'canceled', refunded: true })
    expect(provider.refunds).toEqual([{ userId: ada.workspaceId, value: 5 }])
    expect(await balanceOf(t, ada.workspaceId!)).toBe(100)
  })
})

describe('reading jobs', () => {
  test('an account outside any workspace reads nobody\'s job, and a member lists no queue', async () => {
    const t = testApp()
    const ada = await asUser(t)
    const loner = await asUser(t, { workspace: false })
    await fund(t, ada.workspaceId!, 100)
    const { jobId } = await ada.mutation(ref.create, { idea: 'Mine', panels: 1 })
    expect(await loner.query(ref.getJob, { jobId })).toBeNull()
    expect(await ada.query(ref.listJobs, { paginationOpts: firstPage })).toEqual({ page: [], isDone: true, continueCursor: '' })
  })
})

describe('setQueue', () => {
  test('refuses a concurrency, a tier or a model limit the queue cannot take, naming the field', async () => {
    const t = testApp()
    const admin = await asUser(t, { role: 'admin' })
    const field = async (change: Record<string, unknown>) => (await refusal(admin.mutation(ref.setQueue, change)))?.data
    expect(await field({ concurrency: 1.5 })).toMatchObject({ field: 'concurrency' })
    expect(await field({ concurrency: -1 })).toMatchObject({ field: 'concurrency' })
    expect(await field({ concurrency: 21 })).toMatchObject({ field: 'concurrency' })
    expect(await field({ tier: { name: 'gold', perOwner: 2 } })).toMatchObject({ field: 'tier' })
    expect(await field({ tier: { name: 'priority', dedicated: -1 } })).toMatchObject({ field: 'dedicated' })
    expect(await field({ tier: { name: 'standard', budget: { units: 0 } } })).toMatchObject({ field: 'budget' })
    expect(await field({ model: { id: 'test/image', perMinute: 200 } })).toMatchObject({ field: 'model' })
    expect(await field({ model: { id: 'test/image', min: 0 } })).toMatchObject({ field: 'model' })
  })

  test('retunes a model\'s limit within its range, and pauses and resumes the line', async () => {
    const t = testApp()
    const admin = await asUser(t, { role: 'admin' })
    await admin.mutation(ref.setQueue, { model: { id: 'test/image', perMinute: 10, max: 20 } })
    const queue = await admin.query(ref.getQueue, {}) as { models: Array<{ model: string, perMinute: number, max: number }>, paused: boolean, guests: unknown }
    expect(queue.models).toEqual([expect.objectContaining({ model: 'test/image', perMinute: 10, max: 20 })])
    // A queue that takes no guests counts none.
    expect(queue.guests).toBeNull()
    await admin.mutation(ref.setQueue, { paused: true })
    expect(await admin.query(ref.getQueue, {})).toMatchObject({ paused: true })
    await admin.mutation(ref.setQueue, { paused: false })
    expect(await admin.query(ref.getQueue, {})).toMatchObject({ paused: false })
  })
})
