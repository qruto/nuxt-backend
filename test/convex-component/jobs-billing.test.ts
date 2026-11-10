/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, defineTable, type FunctionReference, internalMutationGeneric, makeFunctionReference, mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import { generateText } from 'ai'
import { asUser, defineBackendTestApp, drain, seedBilling, stubBillingProvider, TEST_UNSAFE_CODE, type TestBillingProvider } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { defineJobQueue, setupAi, type StepJob, vJobEnd, vOwedCharge } from '../../src/convex/integrations/ai'
import { setupBilling } from '../../src/convex/integrations/billing'
import { setupRateLimiter } from '../../src/convex/integrations/rate-limit'

// A print shop on the package's own billing, end to end: a comic is printed
// page by page and charged for the pages it made (`charge: 'output'`), with
// the comic's id on the usage event. The billing provider is the test kit's
// fake (`stubBillingProvider`): when it refuses the charge, the comic is
// still done, the charge stays owed and lands in the background, or is
// given up, held credits back, for an administrator's retry. A customer
// billing has not made yet is waited for, never read as a shortfall. Each
// page's step knows whose job it is, and a safety check in it names them.

const METER_ID = 'meter_credits'
const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
const backend = components.backend

const billing = setupBilling(components as never, {
  email: { sendTemplate: async () => 'email_1' } as never,
  catalog: { sandbox: { meters: { credits: { meterId: METER_ID, eventName: 'credits', property: 'amount' } } } } as never,
  accessToken: 'test-billing-token',
})
const rateLimiter = setupRateLimiter(components as never)
const ai = setupAi(components as never, { billing, rateLimiter })
const jobs = defineJobQueue(components as never, {
  ai,
  onJobEnd: makeFunctionReference<'mutation'>('comics:ended') as never,
  onOwedCharge: makeFunctionReference<'mutation'>('comics:owed') as never,
})

const appSchema = defineSchema({
  ends: defineTable({ jobId: v.string(), status: v.string(), charged: v.number(), owed: v.optional(v.number()) }),
  owedCharges: defineTable({ jobId: v.string(), status: v.string(), credits: v.number() }),
  steps: defineTable({ job: v.any() }),
})

/** Whether a page's step checks its page with the safety classifier, marked unsafe. */
const check = { page: false }

const drawPage = jobs.step({
  model: 'test/image',
  args: { comicId: v.string(), page: v.number() },
  handler: async (ctx, { comicId, page }) => {
    await ctx.runMutation(makeFunctionReference<'mutation'>('comics:sawJob'), { job: ctx.job })
    if (check.page) await ai.moderate(ctx, { text: `Page ${page} ${TEST_UNSAFE_CODE('S7')}` }, { subject: comicId, stage: `output:${page}` })
    const { text } = await generateText({ model: ctx.model(), prompt: `Page ${page}` })
    return text
  },
})

/** A comic printed page by page, charged a credit a page it made, held at its page count. */
const print = jobs.define({
  meter: 'credits',
  charge: 'output',
  cost: ({ pages }) => pages,
  args: { comicId: v.string(), pages: v.number() },
  handler: async (job, { comicId, pages }) => {
    for (let page = 1; page <= pages; page++) {
      await job.run(makeFunctionReference<'action'>('comics:drawPage') as unknown as FunctionReference<'action', 'internal'>, { comicId, page })
    }
    await job.charge(pages, { metadata: { comicId } })
    return { comicId }
  },
})

/** Metadata past the billing provider's limits on a usage event, by the comic id that tags its charge with it. */
const misfits: Record<string, Record<string, string>> = {
  'long-value': { note: 'x'.repeat(501) },
  'long-key': { ['k'.repeat(41)]: 'v' },
  'provider-key': { _cost: '1' },
  'crowded': Object.fromEntries(Array.from({ length: 48 }, (_, i) => [`key${i}`, 'v'])),
}

/** A comic that charges its pages, then fails to bind; or tags its charge with a number, or metadata past the provider's limits, which no usage event takes. */
const misprint = jobs.define({
  meter: 'credits',
  charge: 'output',
  cost: ({ pages }) => pages,
  args: { comicId: v.string(), pages: v.number() },
  handler: async (job, { comicId, pages }) => {
    if (comicId === 'numbered') await job.charge(pages, { metadata: { pages } as never })
    if (misfits[comicId]) await job.charge(pages, { metadata: misfits[comicId] })
    await job.charge(pages, { metadata: { comicId } })
    throw new Error('The comic could not be bound.')
  },
})

/** A cover, charged its two credits as it starts. */
const cover = jobs.define({
  meter: 'credits',
  cost: 2,
  args: { comicId: v.string() },
  handler: async (job, { comicId }) => {
    await job.run(makeFunctionReference<'action'>('comics:drawPage') as unknown as FunctionReference<'action', 'internal'>, { comicId, page: 0 })
    return { comicId }
  },
})

const start = mutationGeneric({
  args: { kind: v.string(), comicId: v.string(), pages: v.optional(v.number()) },
  handler: async (ctx, { kind, comicId, pages }) => {
    const { jobId } = await jobs.enqueue(ctx, makeFunctionReference<'mutation'>(`comics:${kind}`) as never, { comicId, ...(pages === undefined ? {} : { pages }) })
    return jobId
  },
})
const read = queryGeneric({ args: { jobId: v.string() }, handler: async (ctx, { jobId }) => jobs.get(ctx, jobId) })
const ended = internalMutationGeneric({
  args: vJobEnd,
  handler: async (ctx, end) => {
    await ctx.db.insert('ends', { jobId: end.jobId, status: end.status, charged: end.charged, ...(end.owed === undefined ? {} : { owed: end.owed }) })
  },
})
const owed = internalMutationGeneric({
  args: vOwedCharge,
  handler: async (ctx, charge) => {
    await ctx.db.insert('owedCharges', { jobId: charge.jobId, status: charge.status, credits: charge.credits })
  },
})
const sawJob = mutationGeneric({ args: { job: v.any() }, handler: async (ctx, { job }) => void await ctx.db.insert('steps', { job }) })

const testApp = defineBackendTestApp(appSchema, {
  './_generated/api.js': () => Promise.resolve({}),
  './ai.js': () => Promise.resolve(ai.api),
  './jobs.js': () => Promise.resolve(jobs.api),
  './comics.js': () => Promise.resolve({ drawPage, print, misprint, cover, start, read, ended, owed, sawJob }),
})
type App = ReturnType<typeof testApp>

const ref = {
  start: makeFunctionReference<'mutation', { kind: 'print' | 'misprint' | 'cover', comicId: string, pages?: number }, string>('comics:start'),
  read: makeFunctionReference<'query', { jobId: string }, Record<string, unknown> | null>('comics:read'),
  getJob: makeFunctionReference<'query', { jobId: string }, Record<string, unknown> | null>('jobs:getJob'),
  cancelJob: makeFunctionReference<'mutation', { jobId: string, refund?: boolean }, null>('jobs:cancelJob'),
  retryJob: makeFunctionReference<'mutation', { jobId: string }, null>('jobs:retryJob'),
  listJobs: makeFunctionReference<'query', { paginationOpts: { numItems: number, cursor: string | null } }, { page: Array<Record<string, unknown>> }>('jobs:listJobs'),
  listModerationFlags: makeFunctionReference<'query', { paginationOpts: { numItems: number, cursor: string | null } }, { page: Array<Record<string, unknown>> } | null>('ai:listModerationFlags'),
}

async function balanceOf(t: App, entityId: string): Promise<number | undefined> {
  const row = await t.query(backend.billing.getByUser as unknown as FunctionReference<'query'>, { userId: entityId }) as { meters: Array<{ meterId: string, balance: number }> } | null
  return row?.meters.find(meter => meter.meterId === METER_ID)?.balance
}

const job = (t: App, jobId: string) => t.query(ref.read, { jobId })
const rows = <Table extends 'ends' | 'owedCharges' | 'steps'>(t: App, table: Table) => t.run(ctx => ctx.db.query(table).collect())
/** The job's row as the queue keeps it. */
const row = async (t: App, jobId: string) => await t.query(backend.jobs.get as unknown as FunctionReference<'query'>, { jobId }) as Record<string, unknown> | null

let provider: TestBillingProvider

beforeEach(() => {
  vi.useFakeTimers()
  provider = stubBillingProvider()
  check.page = false
})

afterEach(() => {
  provider.restore()
  vi.useRealTimers()
})

describe('a charge the provider refuses for now', () => {
  test('stays owed: the comic is done with its result, and the charge lands in the background, once, with the comic on it', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await seedBilling(t, ada.workspaceId!, { customer: true, credits: { [METER_ID]: 10 } })
    provider.refuse('charges', 1)

    const jobId = await ada.mutation(ref.start, { kind: 'print', comicId: 'comic-1', pages: 3 })
    // Run until the app hears the end.
    await drain(t, vi, { until: async () => (await rows(t, 'ends')).length > 0 })

    // Done, its result standing, its charge owed and its three credits still held.
    expect(await job(t, jobId)).toMatchObject({ status: 'done', result: { comicId: 'comic-1' }, charged: 0, owed: { credits: 3, givenUp: false } })
    expect(await ada.query(ref.getJob, { jobId })).toMatchObject({ status: 'done', charged: 0, owed: { credits: 3, givenUp: false } })
    expect(await rows(t, 'ends')).toEqual([expect.objectContaining({ jobId, status: 'done', charged: 0, owed: 3 })])
    expect(await balanceOf(t, ada.workspaceId!)).toBe(7)
    expect(provider.refused).toBe(1)
    expect(provider.charges).toEqual([])

    await drain(t, vi)

    const [charge] = provider.charges
    expect(provider.charges).toHaveLength(1)
    expect(charge).toMatchObject({ name: 'credits', customer: ada.workspaceId, value: 3, metadata: { comicId: 'comic-1', userId: ada.userId, job: 'comics:print', amount: 3 } })
    expect(await job(t, jobId)).toMatchObject({ status: 'done', charged: 3 })
    expect(await job(t, jobId)).not.toHaveProperty('owed')
    expect(await rows(t, 'owedCharges')).toEqual([expect.objectContaining({ jobId, status: 'charged', credits: 3 })])
    expect(await balanceOf(t, ada.workspaceId!)).toBe(7)
    // The end was heard once; how the owed charge ended, once more.
    expect(await rows(t, 'ends')).toHaveLength(1)
  })

  test('is given up after its last try: its hold goes back, and an administrator\'s retry charges it', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await seedBilling(t, ada.workspaceId!, { customer: true, credits: { [METER_ID]: 10 } })
    provider.refuse('charges')

    const jobId = await ada.mutation(ref.start, { kind: 'print', comicId: 'comic-2', pages: 2 })
    await drain(t, vi)

    // The one try in the job, then seven in the background, about two hours of them.
    expect(provider.refused).toBe(8)
    expect(await job(t, jobId)).toMatchObject({ status: 'done', result: { comicId: 'comic-2' }, charged: 0, owed: { credits: 2, givenUp: true } })
    expect(await rows(t, 'owedCharges')).toEqual([expect.objectContaining({ jobId, status: 'given_up', credits: 2 })])
    expect(await balanceOf(t, ada.workspaceId!)).toBe(10)
    // Signed in now: two hours on, a sign-in from before the job is too old to retry with.
    const admin = await asUser(t, { role: 'admin' })
    expect((await admin.query(ref.listJobs, { paginationOpts: { numItems: 10, cursor: null } })).page).toEqual([expect.objectContaining({ id: jobId, owed: { credits: 2, givenUp: true } })])

    provider.accept()
    await admin.mutation(ref.retryJob, { jobId })
    expect(await job(t, jobId)).toMatchObject({ owed: { credits: 2, givenUp: false } })
    await drain(t, vi)
    expect(provider.charges).toEqual([expect.objectContaining({ value: 2, metadata: expect.objectContaining({ comicId: 'comic-2' }) })])
    expect(await job(t, jobId)).toMatchObject({ status: 'done', charged: 2 })
    expect(await rows(t, 'owedCharges')).toEqual([expect.objectContaining({ status: 'given_up' }), expect.objectContaining({ status: 'charged', credits: 2 })])
    expect(await balanceOf(t, ada.workspaceId!)).toBe(8)
  })

  test('is dropped for a job that fails after it: nothing charged, nothing tried again, and its hold goes back', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await seedBilling(t, ada.workspaceId!, { customer: true, credits: { [METER_ID]: 10 } })
    provider.refuse('charges')
    const jobId = await ada.mutation(ref.start, { kind: 'misprint', comicId: 'comic-3', pages: 3 })
    await drain(t, vi)
    expect(await job(t, jobId)).toMatchObject({ status: 'failed', charged: 0, error: { code: 'unavailable', reason: 'job_failed' } })
    expect(await job(t, jobId)).not.toHaveProperty('owed')
    expect(provider.refused).toBe(1)
    expect(await rows(t, 'owedCharges')).toEqual([])
    expect(await balanceOf(t, ada.workspaceId!)).toBe(10)
  })

  test('takes string metadata only: a number fails the job before anything is charged', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await seedBilling(t, ada.workspaceId!, { customer: true, credits: { [METER_ID]: 10 } })
    const jobId = await ada.mutation(ref.start, { kind: 'misprint', comicId: 'numbered', pages: 2 })
    await drain(t, vi)
    expect(await job(t, jobId)).toMatchObject({ status: 'failed', charged: 0 })
    expect(provider.events).toEqual([])
    expect(await balanceOf(t, ada.workspaceId!)).toBe(10)
  })

  test.each([
    ['a value over 500 characters', 'long-value', /`metadata\.note` is 501 characters, over the 500/],
    ['a key over 40 characters', 'long-key', /is no key a usage event takes: 1 to 40 ASCII characters/],
    ['a key of the provider\'s own', 'provider-key', /"_cost" is no key a usage event takes/],
    ['more keys than the event has room for', 'crowded', /has 48 keys, over the 47 of your own/],
  ])('takes metadata within the provider\'s limits only: %s fails the job where it was charged, before anything is', async (_label, comicId, message) => {
    const t = testApp()
    const ada = await asUser(t)
    await seedBilling(t, ada.workspaceId!, { customer: true, credits: { [METER_ID]: 10 } })
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const jobId = await ada.mutation(ref.start, { kind: 'misprint', comicId, pages: 2 })
    await drain(t, vi)
    expect(await job(t, jobId)).toMatchObject({ status: 'failed', charged: 0 })
    expect(provider.events).toEqual([])
    expect(await balanceOf(t, ada.workspaceId!)).toBe(10)
    expect(logged.mock.calls.flat().map(String).join('\n')).toMatch(message)
    logged.mockRestore()
  })
})

describe('a charge the provider refuses for good', () => {
  test('fails the job as a charge at start does: nothing owed, nothing tried in the background, its hold back', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await seedBilling(t, ada.workspaceId!, { customer: true, credits: { [METER_ID]: 10 } })
    // A revoked access token: the provider answers 401 to every try.
    provider.restore()
    provider = stubBillingProvider({ status: 401 })
    provider.refuse('charges')

    const jobId = await ada.mutation(ref.start, { kind: 'print', comicId: 'comic-6', pages: 3 })
    await drain(t, vi)

    expect(await job(t, jobId)).toMatchObject({ status: 'failed', charged: 0, error: { code: 'unavailable', reason: 'provider_refused' } })
    expect(await job(t, jobId)).not.toHaveProperty('owed')
    expect(await rows(t, 'ends')).toEqual([{ _id: expect.anything(), _creationTime: expect.any(Number), jobId, status: 'failed', charged: 0 }])
    expect(await rows(t, 'owedCharges')).toEqual([])
    // The job's own tries only: the queue tried none in the background.
    expect(provider.refused).toBe(3)
    expect(provider.charges).toEqual([])
    expect(await balanceOf(t, ada.workspaceId!)).toBe(10)
  })

  test('a rate limit is no such refusal: a charge refused 429 is owed, and lands', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await seedBilling(t, ada.workspaceId!, { customer: true, credits: { [METER_ID]: 10 } })
    provider.restore()
    provider = stubBillingProvider({ status: 429 })
    provider.refuse('charges', 1)

    const jobId = await ada.mutation(ref.start, { kind: 'print', comicId: 'comic-7', pages: 2 })
    await drain(t, vi, { until: async () => (await rows(t, 'ends')).length > 0 })
    expect(await job(t, jobId)).toMatchObject({ status: 'done', charged: 0, owed: { credits: 2, givenUp: false } })

    await drain(t, vi)
    expect(provider.charges).toEqual([expect.objectContaining({ value: 2, metadata: expect.objectContaining({ comicId: 'comic-7' }) })])
    expect(await job(t, jobId)).toMatchObject({ status: 'done', charged: 2 })
  })
})

describe('billing not synced yet', () => {
  test('a customer billing has not made yet is waited for, then charged once it is there', async () => {
    const t = testApp()
    const ada = await asUser(t)
    // Credits read, and no customer yet: the free plan's start makes it a moment later.
    await seedBilling(t, ada.workspaceId!, { credits: { [METER_ID]: 10 } })

    const jobId = await ada.mutation(ref.start, { kind: 'cover', comicId: 'cover-1' })
    await drain(t, vi, { until: async () => (await row(t, jobId) as { lastError?: string } | null)?.lastError?.includes('No billing customer') === true })
    expect(await job(t, jobId)).toMatchObject({ status: 'running', charged: 0 })

    // The provider's balance is as it was: nothing reached it yet, and the cache subtracts the hold itself.
    await seedBilling(t, ada.workspaceId!, { customer: true, credits: { [METER_ID]: 10 } })
    await drain(t, vi)
    expect(await job(t, jobId)).toMatchObject({ status: 'done', charged: 2 })
    expect(provider.charges).toEqual([expect.objectContaining({ value: 2, customer: ada.workspaceId })])
    expect(await balanceOf(t, ada.workspaceId!)).toBe(8)
  })

  test('a charge at start that waits for the customer keeps its hold: no other spend takes its credits meanwhile', async () => {
    const t = testApp()
    const ada = await asUser(t)
    // Exactly one cover's credits, and no customer yet.
    await seedBilling(t, ada.workspaceId!, { credits: { [METER_ID]: 2 } })
    const jobId = await ada.mutation(ref.start, { kind: 'cover', comicId: 'cover-3' })
    await drain(t, vi, { until: async () => (await row(t, jobId) as { lastError?: string } | null)?.lastError?.includes('No billing customer') === true })

    // While it waits, its two credits stay held: a second cover is refused at the door.
    expect(await balanceOf(t, ada.workspaceId!)).toBe(0)
    await expect(ada.mutation(ref.start, { kind: 'cover', comicId: 'cover-4' })).rejects.toThrow(/Insufficient credits/)

    await seedBilling(t, ada.workspaceId!, { customer: true, credits: { [METER_ID]: 2 } })
    await drain(t, vi)
    expect(await job(t, jobId)).toMatchObject({ status: 'done', charged: 2 })
    expect(provider.charges).toEqual([expect.objectContaining({ value: 2 })])
    expect(await balanceOf(t, ada.workspaceId!)).toBe(0)
  })

  test('a job canceled while its charge waits for the customer gets its hold back', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await seedBilling(t, ada.workspaceId!, { credits: { [METER_ID]: 10 } })
    const jobId = await ada.mutation(ref.start, { kind: 'cover', comicId: 'cover-5' })
    await drain(t, vi, { until: async () => (await row(t, jobId) as { lastError?: string } | null)?.lastError?.includes('No billing customer') === true })
    expect(await balanceOf(t, ada.workspaceId!)).toBe(8)

    await ada.mutation(ref.cancelJob, { jobId })
    await drain(t, vi)
    expect(await job(t, jobId)).toMatchObject({ status: 'canceled', charged: 0 })
    expect(provider.events).toEqual([])
    expect(await balanceOf(t, ada.workspaceId!)).toBe(10)
  })

  test('a customer that never comes fails the job as not ready, never as short of credits', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await seedBilling(t, ada.workspaceId!, { credits: { [METER_ID]: 10 } })
    const jobId = await ada.mutation(ref.start, { kind: 'cover', comicId: 'cover-2' })
    await drain(t, vi)
    expect(await job(t, jobId)).toMatchObject({ status: 'failed', charged: 0, error: { code: 'not_ready', reason: 'no_customer' } })
    expect(provider.events).toEqual([])
    // Its hold went back.
    expect(await balanceOf(t, ada.workspaceId!)).toBe(10)
  })

  test('charged by output, no customer yet leaves the charge owed: the comic is done', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await seedBilling(t, ada.workspaceId!, { credits: { [METER_ID]: 10 } })
    const jobId = await ada.mutation(ref.start, { kind: 'print', comicId: 'comic-4', pages: 2 })
    await drain(t, vi, { until: async () => (await job(t, jobId))?.status === 'done' })
    expect(await job(t, jobId)).toMatchObject({ status: 'done', owed: { credits: 2, givenUp: false } })
    expect(await balanceOf(t, ada.workspaceId!)).toBe(8)
    // The customer is made; the provider has seen no charge yet, so it still reads 10.
    await seedBilling(t, ada.workspaceId!, { customer: true, credits: { [METER_ID]: 10 } })
    expect(await balanceOf(t, ada.workspaceId!)).toBe(8)
    await drain(t, vi)
    expect(await job(t, jobId)).toMatchObject({ status: 'done', charged: 2 })
    expect(provider.charges).toEqual([expect.objectContaining({ value: 2, metadata: expect.objectContaining({ comicId: 'comic-4' }) })])
    expect(await balanceOf(t, ada.workspaceId!)).toBe(8)
  })
})

describe('a step', () => {
  test('knows whose job it runs for, and a safety check in it names them on its flag', async () => {
    const t = testApp()
    const ada = await asUser(t)
    const admin = await asUser(t, { role: 'admin' })
    await seedBilling(t, ada.workspaceId!, { customer: true, credits: { [METER_ID]: 10 } })
    check.page = true

    const jobId = await ada.mutation(ref.start, { kind: 'print', comicId: 'comic-5', pages: 1 })
    await drain(t, vi)

    const [seen] = await rows(t, 'steps')
    expect(seen!.job as StepJob).toEqual({ id: jobId, attempt: 1, owner: ada.workspaceId, userId: ada.userId })
    const flags = await admin.query(ref.listModerationFlags, { paginationOpts: { numItems: 10, cursor: null } })
    expect(flags?.page).toEqual([expect.objectContaining({ userId: ada.userId, owner: ada.workspaceId, subject: 'comic-5', stage: 'output:1', codes: ['S7'] })])
  })
})
