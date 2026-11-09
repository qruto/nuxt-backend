/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, defineTable, type FunctionReference, makeFunctionReference, mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import { generateText } from 'ai'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { backendError, getBackendError } from '../../src/convex/errors'
import { defineJobQueue, setupAi } from '../../src/convex/integrations/ai'
import type { Billing } from '../../src/convex/integrations/billing'
import { BILLING_METERS } from '../../src/convex/integrations/billing/context'
import { setupRateLimiter } from '../../src/convex/integrations/rate-limit'

// defineJobQueue end to end, the way backend/jobs.ts and a strips module use
// it: a strip job holds its credits while it waits, is charged when it
// starts, draws its panels through a step under the model's limit, reports
// its progress and its cost, and is refunded when it fails. Tiers give a
// head start, a dedicated slot and a daily budget; cancel, retry and discard
// work from the admin side. A kind charged by output holds the most it may
// cost and charges what it made; one job may run free; a balance never read
// is read as the job starts. Models answer with the AI SDK's mock (ai/test).

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const METER_ID = 'm1'
const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'>, rateLimiter: never, workflow: never, persistentTextStreaming: never }
const backend = components.backend

/** What the fake billing provider was asked to do. */
const provider = {
  charges: [] as string[],
  /** Each charge with what it billed: the whole hold, or a smaller final amount. */
  settled: [] as Array<{ externalId: string, value: number }>,
  refunds: [] as Array<{ userId: string, value: number }>,
  refundIds: [] as string[],
  costs: [] as Array<Record<string, unknown>>,
}

/** Balances the provider holds that this deployment never read: a refresh brings them in. */
const cold = new Map<string, number>()

/** Owners the provider holds no credit meter for: a refresh reads a balance without one. */
const meterless = new Set<string>()

/** Owners whose credit meter the provider has not granted yet: this many refreshes read none, then it is there. */
const grantedAfter = new Map<string, number>()

/** How many times each owner's balance was read from the provider. */
const refreshes = new Map<string, number>()

/** How many refunds the provider refuses next, with a 503. */
let refundFailures = 0

/** The workspaces whose plan grants `priority_queue`. */
const priority = new Set<string>()

// A billing stand-in over the component's real credit cache: holds, charges
// and refunds move the cached balance as setupBilling does, and the provider
// side is a record of calls.
const billing = {
  requireEntity: async (ctx: { auth: { getUserIdentity: () => Promise<Record<string, unknown> | null> } }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw backendError('unauthenticated', {})
    return { userId: identity.activeOrganizationId as string, email: identity.email as string }
  },
  reserveCredits: async (ctx: { runMutation: (ref: unknown, args: unknown) => Promise<{ ok: boolean, balance: number, reason?: string }> }, event: { userId: string, value: number, externalId: string, hold?: number, allowRefresh?: boolean }) => {
    const debit = () => ctx.runMutation(backend.billing.debit, { userId: event.userId, meterId: METER_ID, amount: event.value, externalId: event.externalId, ...(event.hold ? { hold: event.hold } : {}) })
    let result = await debit()
    if (!result.ok && (result.reason === 'no-row' || result.reason === 'no-meter') && event.allowRefresh !== false) {
      // A balance not in the cache: a mutation cannot fetch it; an action reads it from the provider once.
      refreshes.set(event.userId, (refreshes.get(event.userId) ?? 0) + 1)
      const pending = grantedAfter.get(event.userId) ?? 0
      if (pending > 0) grantedAfter.set(event.userId, pending - 1)
      const meters = meterless.has(event.userId) || pending > 0 ? [] : [{ meterId: METER_ID, consumedUnits: 0, creditedUnits: cold.get(event.userId) ?? 0, balance: cold.get(event.userId) ?? 0 }]
      await ctx.runMutation(backend.billing.upsert, { userId: event.userId, activeProductIds: [], benefits: [], meters })
      result = await debit()
    }
    if (!result.ok && result.reason !== 'insufficient') throw backendError('not_ready', { reason: 'not_synced' })
    if (!result.ok) throw backendError('insufficient_credits', { meter: 'credits', balance: result.balance, need: event.value })
    return { entityId: event.userId, externalId: event.externalId, reserved: true, meter: 'credits', meterId: METER_ID, value: event.value }
  },
  settleSpend: async (ctx: { runMutation: (ref: unknown, args: unknown) => Promise<unknown> }, reservation: { entityId: string, externalId: string, value: number }, options: { finalAmount?: number } = {}) => {
    const value = Math.min(options.finalAmount ?? reservation.value, reservation.value)
    provider.charges.push(reservation.externalId)
    provider.settled.push({ externalId: reservation.externalId, value })
    await ctx.runMutation(backend.billing.settle, { userId: reservation.entityId, externalId: reservation.externalId, finalAmount: value })
  },
  releaseSpend: async (ctx: { runMutation: (ref: unknown, args: unknown) => Promise<unknown> }, reservation: { entityId: string, externalId: string, reserved: boolean }) => {
    // As setupBilling does: a reservation that says nothing was reserved lets nothing go.
    if (!reservation.reserved) return
    await ctx.runMutation(backend.billing.release, { userId: reservation.entityId, externalId: reservation.externalId })
  },
  refundCredits: async (ctx: { runMutation: (ref: unknown, args: unknown) => Promise<unknown> }, event: { userId: string, value: number, externalId: string }) => {
    if (refundFailures > 0) {
      refundFailures--
      throw new Error('The billing provider answered 503.')
    }
    provider.refunds.push({ userId: event.userId, value: event.value })
    provider.refundIds.push(event.externalId)
    await ctx.runMutation(backend.billing.credit, { userId: event.userId, meterId: METER_ID, amount: event.value })
  },
  reportCost: async (_ctx: unknown, report: Record<string, unknown>) => {
    provider.costs.push(report)
  },
  requireFeature: async (_ctx: unknown, feature: string, { userId }: { userId: string }) => {
    if (feature === 'priority_queue' && priority.has(userId)) return
    throw backendError('feature_required', { feature, plans: feature === 'priority_queue' ? ['pro'] : [] })
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

/** How the next step behaves: draw, throttle, refuse, or throw. */
let stepMode: 'draw' | 'throttle' | 'refuse' | 'crash' = 'draw'

const drawPanel = jobs.step({
  model: 'test/image',
  args: { stripId: v.id('strips'), idea: v.string(), panel: v.number() },
  handler: async (ctx, { stripId, idea, panel }) => {
    if (stepMode === 'throttle') throw Object.assign(new Error('Too Many Requests'), { statusCode: 429 })
    if (stepMode === 'refuse') throw backendError('invalid_input', { field: 'idea' }, 'Not a strip idea.')
    if (stepMode === 'crash') throw new Error('kaboom')
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
      await job.progress({ done: panel, total: panels, label: `Panel ${panel}` })
    }
    return { stripId }
  },
})

/** How many panels the printer says it drew when it charges, and what it does after. */
const printer = { drawn: 0, after: 'return' as 'return' | 'skip' | 'twice' | 'crash' }

/** A strip charged by what it made: up to five credits a panel, held while it waits and runs. */
const print = jobs.define({
  meter: 'credits',
  charge: 'output',
  cost: ({ panels }) => panels * 5,
  args: { stripId: v.id('strips'), idea: v.string(), panels: v.number() },
  handler: async (job, { stripId, idea, panels }) => {
    for (let panel = 1; panel <= panels; panel++) {
      await job.run(makeFunctionReference<'action'>('strips:drawPanel') as unknown as FunctionReference<'action', 'internal'>, { stripId, idea, panel })
    }
    if (printer.after === 'skip') return { stripId }
    await job.charge(printer.drawn * 5)
    if (printer.after === 'twice') await job.charge(1)
    if (printer.after === 'crash') throw new Error('The strip could not be bound.')
    return { stripId }
  },
})

/** Put a strip in line by kind: drawn at its price, or free. */
const start = mutationGeneric({
  args: { kind: v.string(), idea: v.string(), panels: v.number(), free: v.optional(v.boolean()) },
  handler: async (ctx, { kind, idea, panels, free }) => {
    const identity = (await ctx.auth.getUserIdentity())!
    const stripId = await ctx.db.insert('strips', { workspaceId: identity.activeOrganizationId as string, idea, panels: [] })
    const { jobId } = await jobs.enqueue(ctx, makeFunctionReference<'mutation'>(`strips:${kind}`) as never, { stripId, idea, panels }, { free })
    return { stripId, jobId }
  },
})

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
const savePanel = mutationGeneric({
  args: { stripId: v.id('strips'), text: v.string() },
  handler: async (ctx, { stripId, text }) => {
    const strip = (await ctx.db.get(stripId))!
    await ctx.db.patch(stripId, { panels: [...strip.panels, text] })
  },
})
const get = queryGeneric({ args: { id: v.id('strips') }, handler: async (ctx, { id }) => ctx.db.get(id) })

const testApp = defineBackendTestApp(appSchema, {
  './_generated/api.js': () => Promise.resolve({}),
  './ai.js': () => Promise.resolve(ai.api),
  './jobs.js': () => Promise.resolve(jobs.api),
  './strips.js': () => Promise.resolve({ render, print, drawPanel, create, start, savePanel, get }),
})
type App = ReturnType<typeof testApp>

const ref = {
  create: makeFunctionReference<'mutation', { idea: string, panels: number }, { stripId: string, jobId: string }>('strips:create'),
  start: makeFunctionReference<'mutation', { kind: 'render' | 'print', idea: string, panels: number, free?: boolean }, { stripId: string, jobId: string }>('strips:start'),
  billJob: makeFunctionReference<'action', { op: string, jobId: string }, null>('jobs:billJob'),
  get: makeFunctionReference<'query', { id: string }, { panels: string[] } | null>('strips:get'),
  getJob: makeFunctionReference<'query', { jobId: string }, Record<string, unknown> | null>('jobs:getJob'),
  cancelJob: makeFunctionReference<'mutation', { jobId: string, refund?: boolean }, null>('jobs:cancelJob'),
  getQueue: makeFunctionReference<'query', Record<string, never>, Record<string, unknown> | null>('jobs:getQueue'),
  listJobs: makeFunctionReference<'query', { paginationOpts: { numItems: number, cursor: string | null }, deadLetters?: boolean }, { page: Array<Record<string, unknown>> }>('jobs:listJobs'),
  setQueue: makeFunctionReference<'mutation', Record<string, unknown>, null>('jobs:setQueue'),
  retryJob: makeFunctionReference<'mutation', { jobId: string }, null>('jobs:retryJob'),
  discardJob: makeFunctionReference<'mutation', { jobId: string }, null>('jobs:discardJob'),
  getCosts: makeFunctionReference<'query', { since: number }, Record<string, unknown> | null>('ai:getCosts'),
}

/** Give a workspace credits, and the priority feature when it pays for it. */
async function fund(t: App, workspaceId: string, balance: number, { pro = false } = {}) {
  if (pro) priority.add(workspaceId)
  await t.mutation(backend.billing.upsert as unknown as FunctionReference<'mutation'>, {
    userId: workspaceId,
    activeProductIds: [],
    benefits: pro ? [{ id: 'g-priority', benefitId: 'b-priority', type: 'feature_flag', metadata: { key: 'priority_queue' } }] : [],
    meters: [{ meterId: METER_ID, consumedUnits: 0, creditedUnits: balance, balance }],
  })
}

async function balanceOf(t: App, workspaceId: string): Promise<number | undefined> {
  const row = await t.query(backend.billing.getByUser as unknown as FunctionReference<'query'>, { userId: workspaceId }) as { meters: Array<{ balance: number }> } | null
  return row?.meters[0]?.balance
}

/** Run every scheduled function, the workflows' steps and sleeps included. */
async function drain(t: App) {
  await t.finishAllScheduledFunctions(vi.runAllTimers, 500)
}

async function refusal(call: Promise<unknown>) {
  return getBackendError(await call.then(() => null, (error: unknown) => error))
}

beforeEach(() => {
  vi.useFakeTimers()
  stepMode = 'draw'
  refundFailures = 0
  provider.charges.length = 0
  provider.settled.length = 0
  provider.refunds.length = 0
  provider.refundIds.length = 0
  provider.costs.length = 0
  priority.clear()
  cold.clear()
  meterless.clear()
  grantedAfter.clear()
  refreshes.clear()
  printer.drawn = 0
  printer.after = 'return'
})

afterEach(() => {
  vi.useRealTimers()
})

describe('a job, start to end', () => {
  test('holds its credits, charges them when it starts, draws every panel and reports its cost', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)

    const { stripId, jobId } = await ada.mutation(ref.create, { idea: 'A fox who wants to fly', panels: 3 })
    // Held at once: the balance drops before the job runs.
    expect(await balanceOf(t, ada.workspaceId!)).toBe(85)
    expect((await ada.query(ref.getJob, { jobId }))?.status).toBe('queued')

    await drain(t)

    const job = await ada.query(ref.getJob, { jobId })
    expect(job).toMatchObject({ status: 'done', progress: { done: 3, total: 3, label: 'Panel 3' }, result: { stripId } })
    expect((await ada.query(ref.get, { id: stripId }))?.panels).toHaveLength(3)
    expect(provider.charges).toHaveLength(1)
    expect(provider.refunds).toEqual([])
    expect(await balanceOf(t, ada.workspaceId!)).toBe(85)
    expect(provider.costs).toEqual([expect.objectContaining({ userId: ada.workspaceId, name: 'job.cost', parentId: provider.charges[0], llm: expect.objectContaining({ model: 'test/image', vendor: 'test' }) })])
  })

  test('refuses a job the balance cannot cover, before anything joins the line', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 4)

    const error = await refusal(ada.mutation(ref.create, { idea: 'Too big', panels: 1 }))
    expect(error).toMatchObject({ code: 'insufficient_credits', data: { balance: 4, need: 5 } })
    // The whole mutation rolled back: no strip, no budget counted.
    expect(await t.run(ctx => ctx.db.query('strips').collect())).toEqual([])
  })

  test('a step that keeps failing fails the job, refunds it and lands it in the dead letters', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    stepMode = 'crash'

    const { jobId } = await ada.mutation(ref.create, { idea: 'Doomed', panels: 2 })
    await drain(t)
    const admin = await asUser(t, { role: 'admin' })

    const job = await ada.query(ref.getJob, { jobId })
    expect(job).toMatchObject({ status: 'failed', error: { code: 'unavailable', reason: 'job_failed' } })
    expect(provider.refunds).toEqual([{ userId: ada.workspaceId, value: 10 }])
    expect(await balanceOf(t, ada.workspaceId!)).toBe(100)

    const dead = await admin.query(ref.listJobs, { paginationOpts: { numItems: 10, cursor: null }, deadLetters: true })
    expect(dead.page).toEqual([expect.objectContaining({ id: jobId, deadLetter: true, lastError: expect.stringContaining('kaboom') })])

    // Retried by an administrator: a new hold, and this time it draws.
    stepMode = 'draw'
    await admin.mutation(ref.retryJob, { jobId })
    expect(await balanceOf(t, ada.workspaceId!)).toBe(90)
    await drain(t)
    expect((await ada.query(ref.getJob, { jobId }))?.status).toBe('done')
    expect((await admin.query(ref.listJobs, { paginationOpts: { numItems: 10, cursor: null }, deadLetters: true })).page).toEqual([])
  })

  test('a catalog error from a step fails the job with that error', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    stepMode = 'refuse'

    const { jobId } = await ada.mutation(ref.create, { idea: 'Nope', panels: 1 })
    await drain(t)
    expect(await ada.query(ref.getJob, { jobId })).toMatchObject({ status: 'failed', error: { code: 'invalid_input', field: 'idea' } })
  })

  test('a throttled model halves its rate, and the job fails as provider_refused after four attempts', async () => {
    const t = testApp()
    const ada = await asUser(t)
    const admin = await asUser(t, { role: 'admin' })
    await fund(t, ada.workspaceId!, 100)
    stepMode = 'throttle'

    const { jobId } = await ada.mutation(ref.create, { idea: 'Busy', panels: 1 })
    await drain(t)

    expect(await ada.query(ref.getJob, { jobId })).toMatchObject({ status: 'failed', error: { code: 'unavailable', reason: 'provider_refused' } })
    const queue = await admin.query(ref.getQueue, {})
    const [model] = (queue as { models: Array<{ model: string, perMinute: number, count429: number }> }).models
    expect(model).toMatchObject({ model: 'test/image', count429: 4 })
    // Halved at least once, and never below its floor.
    expect(model!.perMinute).toBeLessThanOrEqual(30)
    expect(model!.perMinute).toBeGreaterThanOrEqual(1)
  })
})

describe('the line', () => {
  test('a paid job takes its dedicated slot, the free jobs wait their turn, and nobody runs twice per owner', async () => {
    const t = testApp()
    const free = await asUser(t)
    const other = await asUser(t)
    const pro = await asUser(t)
    await fund(t, free.workspaceId!, 100)
    await fund(t, other.workspaceId!, 100)
    await fund(t, pro.workspaceId!, 100, { pro: true })
    await t.mutation(backend.jobs.setQueue as unknown as FunctionReference<'mutation'>, { paused: true })

    const a = await free.mutation(ref.create, { idea: 'a', panels: 1 })
    const b = await free.mutation(ref.create, { idea: 'b', panels: 1 })
    const c = await other.mutation(ref.create, { idea: 'c', panels: 1 })
    const d = await pro.mutation(ref.create, { idea: 'd', panels: 1 })

    // Paused: every job waits on the queue.
    expect(await free.query(ref.getJob, { jobId: a.jobId })).toMatchObject({ status: 'queued', waitingOn: 'paused', position: null })

    // With no job ended yet, the place in line still reads; the wait does not.
    await t.mutation(backend.jobs.setQueue as unknown as FunctionReference<'mutation'>, { paused: false })
    const standing = await pro.query(ref.getJob, { jobId: d.jobId })
    expect(standing).toMatchObject({ waitingOn: 'line', position: 1 })
    expect(standing).not.toHaveProperty('estimatedWait')
    // One slot of two is kept for priority: a free owner's second job waits on its owner's first.
    expect(await free.query(ref.getJob, { jobId: b.jobId })).toMatchObject({ waitingOn: 'line', position: 3 })
    expect(await other.query(ref.getJob, { jobId: c.jobId })).toMatchObject({ position: 4 })
  })

  test('the daily budget refuses a job past it, and names the plans whose tier fits', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 500)

    await ada.mutation(ref.create, { idea: 'one', panels: 4 })
    const error = await refusal(ada.mutation(ref.create, { idea: 'two', panels: 4 }))
    expect(error).toMatchObject({ code: 'rate_limited', data: { limit: 'jobBudget', plans: ['pro'] } })
    expect(error?.message).toMatch(/Resets in \d+ minutes?/)
    // Too big for any plan's budget that is on sale.
    expect(await refusal(ada.mutation(ref.create, { idea: 'huge', panels: 40 }))).toMatchObject({ code: 'feature_required', data: { feature: 'priority_queue', plans: ['pro'] } })
  })

  test('cancelling a waiting job releases its hold and gives its budget back', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    await t.mutation(backend.jobs.setQueue as unknown as FunctionReference<'mutation'>, { paused: true })

    const { jobId } = await ada.mutation(ref.create, { idea: 'one', panels: 4 })
    expect(await balanceOf(t, ada.workspaceId!)).toBe(80)
    await ada.mutation(ref.cancelJob, { jobId })
    expect(await balanceOf(t, ada.workspaceId!)).toBe(100)
    expect((await ada.query(ref.getJob, { jobId }))?.status).toBe('canceled')
    // The budget it counted is back: another 20-credit job fits the 30.
    await ada.mutation(ref.create, { idea: 'two', panels: 4 })

    const stranger = await asUser(t)
    expect(await refusal(stranger.mutation(ref.cancelJob, { jobId }))).toMatchObject({ code: 'forbidden' })
    expect(await stranger.query(ref.getJob, { jobId })).toBeNull()
  })
})

describe('refunds', () => {
  test('a refund the provider refuses is tried again until it lands', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    stepMode = 'crash'
    refundFailures = 2

    const { jobId } = await ada.mutation(ref.create, { idea: 'Doomed', panels: 2 })
    await drain(t)
    expect(provider.refunds).toEqual([{ userId: ada.workspaceId, value: 10 }])
    expect(await balanceOf(t, ada.workspaceId!)).toBe(100)
    const row = await t.query(backend.jobs.get as unknown as FunctionReference<'query'>, { jobId }) as { refunded: boolean, refundOwed?: string }
    expect(row).toMatchObject({ refunded: true })
    expect(row.refundOwed).toBeUndefined()
  })

  test('a retry waits for a refund on its way, and runs on the charge a refund that gave up left', async () => {
    const t = testApp()
    const ada = await asUser(t)
    const admin = await asUser(t, { role: 'admin' })
    await fund(t, ada.workspaceId!, 100)
    stepMode = 'crash'
    refundFailures = 100

    const { jobId } = await ada.mutation(ref.create, { idea: 'Doomed', panels: 2 })
    // Run the job to its end, but not its refund's later tries.
    await t.finishInProgressScheduledFunctions()
    for (let round = 0; round < 50 && (await t.query(backend.jobs.get as unknown as FunctionReference<'query'>, { jobId }) as { status: string }).status !== 'failed'; round++) {
      vi.advanceTimersByTime(1000)
      await t.finishInProgressScheduledFunctions()
    }
    expect(await refusal(admin.mutation(ref.retryJob, { jobId }))).toMatchObject({ code: 'invalid_input', data: { field: 'jobId', reason: 'refund_pending' } })

    // Every try failed: the job still owes its credits, and a retry carries the charge.
    await drain(t)
    expect(provider.refunds).toEqual([])
    expect(await t.query(backend.jobs.get as unknown as FunctionReference<'query'>, { jobId })).toMatchObject({ charged: true, refunded: false, refundOwed: 'given_up' })
    stepMode = 'draw'
    refundFailures = 0
    // Hours went by: the administrator signs in again.
    const later = await asUser(t, { role: 'admin' })
    await later.mutation(ref.retryJob, { jobId })
    // No second hold, and no second charge.
    expect(await balanceOf(t, ada.workspaceId!)).toBe(90)
    await drain(t)
    expect((await ada.query(ref.getJob, { jobId }))?.status).toBe('done')
    expect(provider.charges).toHaveLength(1)
    expect(await balanceOf(t, ada.workspaceId!)).toBe(90)
  })

  test('a job that ended while its charge was on its way is refunded at once, and a charge after the end bills nothing', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    await t.mutation(backend.jobs.setQueue as unknown as FunctionReference<'mutation'>, { paused: true })
    const { jobId } = await ada.mutation(ref.create, { idea: 'Racing', panels: 1 })
    const policy = { concurrency: 2, perOwner: 1, stallAfter: 60_000, tiers: [] }
    const call = (name: string, args: Record<string, unknown>) => t.mutation((backend.jobs as Record<string, unknown>)[name] as FunctionReference<'mutation'>, args)
    await call('setQueue', { paused: false })
    await call('pick', { policy, pausedAi: false })

    expect(await call('claimCharge', { jobId })).toBe('claimed')
    // The stall sweep fails it before the charge lands.
    await call('finish', { jobId, outcome: 'failed' })
    expect(await call('mark', { jobId, charged: true })).toEqual({ refund: true })
    expect(await t.query(backend.jobs.get as unknown as FunctionReference<'query'>, { jobId })).toMatchObject({ charged: true, refundOwed: 'pending' })
    // Once ended, a charge that had not begun refuses to.
    expect(await call('claimCharge', { jobId })).toBe('charged')
  })
})

describe('the line', () => {
  test('one owner\'s backlog never hides another owner\'s job from the pick', async () => {
    const t = testApp()
    const policy = { concurrency: 2, perOwner: 1, stallAfter: 60_000, tiers: [] }
    const call = (name: string, args: Record<string, unknown>) => t.mutation((backend.jobs as Record<string, unknown>)[name] as FunctionReference<'mutation'>, args)
    const join = (owner: string) => call('join', { kind: 'strips:render', args: {}, owner, cost: 1, budgetCounted: 0, policy })
    for (let index = 0; index < 401; index++) await join('workspace-a')
    const late = await join('workspace-b') as string
    const { started } = await call('pick', { policy, pausedAi: false }) as { started: Array<{ jobId: string }> }
    expect(started.map(job => job.jobId)).toContain(late)
  })
})

describe('pricing', () => {
  test('a count meter throws where the job is defined: its credits could never go back', () => {
    const counting = { ...billing } as Billing
    BILLING_METERS.set(counting, ({ meter }) => (meter === 'generations' ? { key: 'generations', meterId: 'm-count' } : { key: meter, meterId: 'm-sum', property: 'credits' }) as never)
    const queue = defineJobQueue(components as never, { ai: setupAi(components as never, { billing: counting, rateLimiter }) })
    expect(() => queue.define({ meter: 'generations', args: {}, handler: async () => null })).toThrow(/counts events/)
    expect(() => queue.define({ meter: 'credits', args: {}, handler: async () => null })).not.toThrow()
  })

  test('a meter the catalog does not hold yet passes where a job is defined: the module loads before the first billing sync', () => {
    const unsynced = { ...billing } as Billing
    BILLING_METERS.set(unsynced, ({ meter }) => {
      throw backendError('not_ready', { reason: 'no_catalog' }, `Unknown credit meter '${meter}'`)
    })
    const queue = defineJobQueue(components as never, { ai: setupAi(components as never, { billing: unsynced, rateLimiter }) })
    expect(() => queue.define({ meter: 'credits', args: {}, handler: async () => null })).not.toThrow()
  })
})

describe('the admin side', () => {
  test('getCosts shows administrators what each person\'s jobs cost, and nobody else', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    await ada.mutation(ref.create, { idea: 'A fox who wants to fly', panels: 2 })
    await drain(t)

    expect(await ada.query(ref.getCosts, { since: Date.now() - DAY })).toBeNull()
    const admin = await asUser(t, { role: 'admin' })
    const costs = await admin.query(ref.getCosts, { since: Date.now() - DAY })
    expect(costs).toMatchObject({ runs: 1, people: [expect.objectContaining({ who: ada.userId, runs: 1 })] })
    const [person] = (costs as { people: Array<{ input: number }> }).people
    expect(person!.input).toBeGreaterThan(0)
  })

  test('setQueue is for administrators, and refuses what the queue cannot take', async () => {
    const t = testApp()
    const ada = await asUser(t)
    const admin = await asUser(t, { role: 'admin' })

    expect(await refusal(ada.mutation(ref.setQueue, { paused: true }))).toMatchObject({ code: 'forbidden', data: { reason: 'admin_only' } })
    expect(await ada.query(ref.getQueue, {})).toBeNull()

    expect(await refusal(admin.mutation(ref.setQueue, { tier: { name: 'standard', dedicated: 1 } }))).toMatchObject({ code: 'invalid_input', data: { field: 'dedicated' } })
    expect(await refusal(admin.mutation(ref.setQueue, { tier: { name: 'priority', budget: { units: 10 } } }))).toMatchObject({ code: 'invalid_input', data: { field: 'budget' } })
    expect(await refusal(admin.mutation(ref.setQueue, { tier: { name: 'priority', perOwner: 0 } }))).toMatchObject({ code: 'invalid_input', data: { field: 'perOwner' } })

    await admin.mutation(ref.setQueue, { concurrency: 1, tier: { name: 'standard', budget: { units: 20 } } })
    const queue = await admin.query(ref.getQueue, {}) as { concurrency: number, trimmed: boolean, tiers: Array<{ name: string, dedicated: number, dedicatedInEffect: number, budget: { units: number } | null }> }
    expect(queue.concurrency).toBe(1)
    // One slot left: the dedicated one is trimmed so a shared slot remains.
    expect(queue.trimmed).toBe(true)
    expect(queue.tiers[0]).toMatchObject({ name: 'priority', dedicated: 1, dedicatedInEffect: 0 })
    expect(queue.tiers[1]).toMatchObject({ name: 'standard', budget: { units: 20, period: DAY } })

    await admin.mutation(ref.setQueue, { tier: { name: 'standard', budget: null } })
    expect((await admin.query(ref.getQueue, {}) as typeof queue).tiers[1]!.budget).toEqual({ units: 30, period: DAY })
  })

  test('a dead letter can be discarded', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    stepMode = 'crash'
    const { jobId } = await ada.mutation(ref.create, { idea: 'Doomed', panels: 1 })
    await drain(t)
    const admin = await asUser(t, { role: 'admin' })

    await admin.mutation(ref.discardJob, { jobId })
    expect((await admin.query(ref.listJobs, { paginationOpts: { numItems: 10, cursor: null }, deadLetters: true })).page).toEqual([])
    expect(await refusal(admin.mutation(ref.retryJob, { jobId }))).toMatchObject({ code: 'invalid_input' })
  })
})

/** A job's row, as the component keeps it. */
async function row(t: App, jobId: string) {
  return await t.query(backend.jobs.get as unknown as FunctionReference<'query'>, { jobId }) as Record<string, unknown> & { hold?: { externalId: string } }
}

describe('a job charged by what it made', () => {
  test('holds the most it may cost, charges what it made, and gives the rest back unbilled', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    const { jobId } = await ada.mutation(ref.start, { kind: 'print', idea: 'A fox', panels: 3 })
    // Held: three panels at most.
    expect(await balanceOf(t, ada.workspaceId!)).toBe(85)
    printer.drawn = 2
    await drain(t)
    const job = await row(t, jobId)
    expect(job).toMatchObject({ status: 'done', charged: true, price: 10 })
    // One event, for what it made, under the hold's id.
    expect(provider.settled).toEqual([{ externalId: job.hold!.externalId, value: 10 }])
    expect(await balanceOf(t, ada.workspaceId!)).toBe(90)
    expect(await ada.query(ref.getJob, { jobId })).toMatchObject({ charged: 10, free: false })
  })

  test('never charges above its hold, and a second charge changes nothing', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    printer.drawn = 7
    printer.after = 'twice'
    const { jobId } = await ada.mutation(ref.start, { kind: 'print', idea: 'Too many', panels: 3 })
    await drain(t)
    expect(await row(t, jobId)).toMatchObject({ status: 'done', price: 15 })
    expect(provider.settled.map(charge => charge.value)).toEqual([15])
    expect(await balanceOf(t, ada.workspaceId!)).toBe(85)
    expect(warn.mock.calls.flat().map(String).join('\n')).toContain('ai.cost_over_reservation')
    warn.mockRestore()
  })

  test('a job that fails after its charge is refunded what it was charged, once, under the hold\'s refund key', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    printer.drawn = 2
    printer.after = 'crash'
    const { jobId } = await ada.mutation(ref.start, { kind: 'print', idea: 'Unbound', panels: 3 })
    await drain(t)
    const job = await row(t, jobId)
    expect(job).toMatchObject({ status: 'failed', price: 10, refunded: true })
    expect(provider.refunds).toEqual([{ userId: ada.workspaceId, value: 10 }])
    expect(provider.refundIds).toEqual([`${job.hold!.externalId}-refund`])
    // A refund run again finds nothing owed.
    await t.action(ref.billJob, { op: 'refund', jobId })
    expect(provider.refunds).toHaveLength(1)
    expect(await balanceOf(t, ada.workspaceId!)).toBe(100)
  })

  test('a job that fails before its charge, or ends without one, costs nothing', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    stepMode = 'crash'
    const failed = await ada.mutation(ref.start, { kind: 'print', idea: 'Doomed', panels: 2 })
    await drain(t)
    stepMode = 'draw'
    printer.after = 'skip'
    const unpriced = await ada.mutation(ref.start, { kind: 'print', idea: 'Free ride', panels: 2 })
    await drain(t)
    expect(await row(t, failed.jobId)).toMatchObject({ status: 'failed', charged: false })
    expect(await row(t, unpriced.jobId)).toMatchObject({ status: 'done', charged: false })
    expect(provider.settled).toEqual([])
    expect(provider.refunds).toEqual([])
    expect(await balanceOf(t, ada.workspaceId!)).toBe(100)
  })

  test('an administrator\'s retry of a job charged nothing takes a fresh hold and charges what the rerun made', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    printer.drawn = 0
    printer.after = 'crash'
    const { jobId } = await ada.mutation(ref.start, { kind: 'print', idea: 'Nothing yet', panels: 3 })
    await drain(t)
    const first = await row(t, jobId)
    expect(first).toMatchObject({ status: 'failed', charged: true, price: 0, refunded: false })
    printer.drawn = 2
    printer.after = 'return'
    const admin = await asUser(t, { role: 'admin' })
    await admin.mutation(ref.retryJob, { jobId })
    const rerun = await row(t, jobId)
    expect(rerun).toMatchObject({ status: 'queued', charged: false, retries: 1, hold: { reserved: true, value: 15 } })
    expect(rerun.hold!.externalId).not.toBe(first.hold!.externalId)
    await drain(t)
    expect(await row(t, jobId)).toMatchObject({ status: 'done', charged: true, price: 10 })
    expect(await balanceOf(t, ada.workspaceId!)).toBe(90)
  })

  test('an administrator\'s retry of a job whose charge was never given back refunds it first', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    printer.drawn = 2
    printer.after = 'crash'
    refundFailures = 99
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { jobId } = await ada.mutation(ref.start, { kind: 'print', idea: 'Owed', panels: 3 })
    await drain(t)
    expect(await row(t, jobId)).toMatchObject({ status: 'failed', price: 10, refunded: false, refundOwed: 'given_up' })
    refundFailures = 0
    const admin = await asUser(t, { role: 'admin' })
    // The first retry gives the charge back; the job stays failed until it lands.
    await admin.mutation(ref.retryJob, { jobId })
    expect(await row(t, jobId)).toMatchObject({ status: 'failed', refundOwed: 'pending' })
    await drain(t)
    expect(await row(t, jobId)).toMatchObject({ refunded: true })
    expect(provider.refunds).toEqual([{ userId: ada.workspaceId, value: 10 }])
    const again = await asUser(t, { role: 'admin' })
    await again.mutation(ref.retryJob, { jobId })
    expect(await row(t, jobId)).toMatchObject({ status: 'queued', charged: false })
    vi.restoreAllMocks()
  })

  test('refuses where it is defined a kind charged by output that has no meter, or a charge it does not know', () => {
    expect(() => jobs.define({ meter: false, charge: 'output', args: {}, handler: async () => null })).toThrow(/cannot charge by output/)
    expect(() => jobs.define({ meter: 'credits', charge: 'later' as never, args: {}, handler: async () => null })).toThrow(/'start' or 'output'/)
  })
})

describe('a free job', () => {
  test('holds nothing, is never charged and counts in no budget, of either kind', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    printer.drawn = 2
    // 50 credits, over the standard tier's 30 a day: free, it counts in none.
    const render = await ada.mutation(ref.start, { kind: 'render', idea: 'On the house', panels: 10, free: true })
    const print = await ada.mutation(ref.start, { kind: 'print', idea: 'On the house', panels: 2, free: true })
    expect(await balanceOf(t, ada.workspaceId!)).toBe(100)
    await drain(t)
    expect(await row(t, render.jobId)).toMatchObject({ status: 'done', cost: 0, charged: false, budgetCounted: 0 })
    expect(await row(t, print.jobId)).toMatchObject({ status: 'done', cost: 0, charged: false })
    expect(await row(t, render.jobId)).not.toHaveProperty('hold')
    expect(await ada.query(ref.getJob, { jobId: print.jobId })).toMatchObject({ free: true, charged: 0 })
    expect(provider.charges).toEqual([])
    expect(await balanceOf(t, ada.workspaceId!)).toBe(100)
  })
})

describe('a balance never read', () => {
  test('lets the job join, and reads the balance as the job starts, for either kind', async () => {
    const t = testApp()
    const ada = await asUser(t)
    cold.set(ada.workspaceId!, 100)
    const { jobId } = await ada.mutation(ref.start, { kind: 'render', idea: 'First strip', panels: 3 })
    // Nothing read yet, so nothing held.
    expect(await balanceOf(t, ada.workspaceId!)).toBeUndefined()
    expect(await row(t, jobId)).toMatchObject({ hold: { reserved: false, value: 15 } })
    await drain(t)
    expect(await row(t, jobId)).toMatchObject({ status: 'done', charged: true })
    expect(await balanceOf(t, ada.workspaceId!)).toBe(85)

    const bob = await asUser(t)
    cold.set(bob.workspaceId!, 100)
    printer.drawn = 1
    const printed = await bob.mutation(ref.start, { kind: 'print', idea: 'First print', panels: 3 })
    await drain(t)
    expect(await row(t, printed.jobId)).toMatchObject({ status: 'done', price: 5, hold: { reserved: true } })
    expect(await balanceOf(t, bob.workspaceId!)).toBe(95)
  })

  test('refuses an owner whose balance was read and holds no credit meter, at the door', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await t.mutation(backend.billing.upsert as unknown as FunctionReference<'mutation'>, { userId: ada.workspaceId!, activeProductIds: [], benefits: [], meters: [] })
    expect((await refusal(ada.mutation(ref.start, { kind: 'render', idea: 'No credits', panels: 1 })))?.code).toBe('not_ready')
  })

  test('waits for a credit meter billing has not synced yet, and runs once it is there', async () => {
    const t = testApp()
    const ada = await asUser(t)
    cold.set(ada.workspaceId!, 100)
    // The provider grants the plan's credits a moment after the account starts: two reads find no meter.
    grantedAfter.set(ada.workspaceId!, 2)
    printer.drawn = 1
    const render = await ada.mutation(ref.start, { kind: 'render', idea: 'Soon', panels: 1 })
    await drain(t)
    expect(await row(t, render.jobId)).toMatchObject({ status: 'done', charged: true })
    expect(refreshes.get(ada.workspaceId!)).toBe(3)
    expect(await balanceOf(t, ada.workspaceId!)).toBe(95)
  })

  test('fails as not ready, not short of credits, a job whose balance never shows a credit meter', async () => {
    const t = testApp()
    const ada = await asUser(t)
    meterless.add(ada.workspaceId!)
    const { jobId } = await ada.mutation(ref.start, { kind: 'print', idea: 'No meter', panels: 2 })
    await drain(t)
    expect(await row(t, jobId)).toMatchObject({ status: 'failed', charged: false, error: { code: 'not_ready', reason: 'not_synced' } })
    // Read once, then once a wait, about five minutes of them: never as many as a retry loop would.
    expect(refreshes.get(ada.workspaceId!)).toBe(7)
    expect((await ada.query(ref.getJob, { jobId }))?.error).toMatchObject({ code: 'not_ready' })
  })

  test('lets a hold go by its id when the step that took it never noted it', async () => {
    const t = testApp()
    const ada = await asUser(t)
    cold.set(ada.workspaceId!, 100)
    await t.mutation(backend.jobs.setQueue as unknown as FunctionReference<'mutation'>, { paused: true })
    const { jobId } = await ada.mutation(ref.start, { kind: 'print', idea: 'Lost note', panels: 3 })
    const joined = await row(t, jobId)
    expect(joined).toMatchObject({ hold: { reserved: false } })
    // A step took the hold, then died before noting it on the job.
    await t.mutation(backend.billing.upsert as unknown as FunctionReference<'mutation'>, { userId: ada.workspaceId!, activeProductIds: [], benefits: [], meters: [{ meterId: METER_ID, consumedUnits: 0, creditedUnits: 100, balance: 100 }] })
    await t.mutation(backend.billing.debit as unknown as FunctionReference<'mutation'>, { userId: ada.workspaceId!, meterId: METER_ID, amount: 15, externalId: joined.hold!.externalId, hold: 7 * DAY })
    expect(await balanceOf(t, ada.workspaceId!)).toBe(85)
    await ada.mutation(ref.cancelJob, { jobId })
    expect(await balanceOf(t, ada.workspaceId!)).toBe(100)
  })

  test('fails the job short of credits before any model is called, charging nothing', async () => {
    const t = testApp()
    const ada = await asUser(t)
    cold.set(ada.workspaceId!, 5)
    const render = await ada.mutation(ref.start, { kind: 'render', idea: 'Too big', panels: 3 })
    const print = await ada.mutation(ref.start, { kind: 'print', idea: 'Too big', panels: 3 })
    await drain(t)
    for (const { jobId, stripId } of [render, print]) {
      expect(await row(t, jobId)).toMatchObject({ status: 'failed', charged: false, error: { code: 'insufficient_credits', need: 15 } })
      expect((await ada.query(ref.get, { id: stripId }))?.panels).toEqual([])
    }
    expect(provider.charges).toEqual([])
    expect(await balanceOf(t, ada.workspaceId!)).toBe(5)
  })
})
