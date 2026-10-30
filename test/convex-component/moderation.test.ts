/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, defineTable, type FunctionReference, makeFunctionReference, mutationGeneric } from 'convex/server'
import { v } from 'convex/values'
import { MockLanguageModelV4 } from 'ai/test'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { backendError, getBackendError } from '../../src/convex/errors'
import { defineJobQueue, setupAi } from '../../src/convex/integrations/ai'
import { readVerdict } from '../../src/convex/integrations/ai/moderation'
import type { Billing } from '../../src/convex/integrations/billing'
import { setupRateLimiter } from '../../src/convex/integrations/rate-limit'
import { setupStorage } from '../../src/convex/integrations/storage'

// Content safety's check, the way an app uses it: ai.requireSafe on an
// upload not yet claimed (read from the component's storage through
// storage.bytes) or a file of the app's own, `moderate` on a metered action
// (checked before anything is reserved) and on a job (its first step, before
// the charge, the hold released when it is flagged). The classifier is a
// model object here, answering as Llama Guard does: `unsafe` and its codes
// for text that says BAD or for a GIF, `safe` for anything else.

const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'>, rateLimiter: never, workflow: never, persistentTextStreaming: never }
const backend = components.backend
const METER_ID = 'm1'

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), char => char.charCodeAt(0))
const GIF = new TextEncoder().encode('GIF89a\x01\x00\x01\x00\x00\x00\x00;')

/** What the classifier was shown, call by call, and the output budget of each call. */
const shown: Array<{ text: string, media: string[] }> = []
const budgets: Array<{ maxOutputTokens?: number, providerOptions?: unknown }> = []
let answer: string | null = null

const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 2, text: 2, reasoning: 0 } }
const classifier = new MockLanguageModelV4({
  provider: 'test',
  modelId: 'meta-llama/llama-guard-4-12b',
  doGenerate: async ({ prompt, maxOutputTokens, providerOptions }) => {
    budgets.push({ maxOutputTokens, providerOptions })
    const parts = prompt.flatMap(message => message.role === 'user' ? message.content as Array<{ type: string, text?: string, mediaType?: string }> : [])
    const text = parts.filter(part => part.type === 'text').map(part => part.text).join(' ')
    const media = parts.filter(part => part.type === 'file').map(part => part.mediaType!)
    shown.push({ text, media })
    const verdict = answer ?? (/BAD/.test(text) ? 'unsafe\nS10' : media.includes('image/gif') ? 'unsafe\nS12,S4' : 'safe')
    return { content: [{ type: 'text', text: verdict }], finishReason: { unified: 'stop', raw: 'stop' }, usage, warnings: [] }
  },
})

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
    await ctx.runMutation(backend.billing.settle, { userId: reservation.entityId, externalId: reservation.externalId })
  },
  releaseSpend: async (ctx: { runMutation: (ref: unknown, args: unknown) => Promise<unknown> }, reservation: { entityId: string, externalId: string }) => {
    await ctx.runMutation(backend.billing.release, { userId: reservation.entityId, externalId: reservation.externalId })
  },
  refundCredits: async () => {},
  reportCost: async () => {},
  requireFeature: async (_ctx: unknown, feature: string) => {
    throw backendError('feature_required', { feature, plans: [] })
  },
  recordEvent: async () => {},
} as unknown as Billing

const rateLimiter = setupRateLimiter(components as never)
const ai = setupAi(components as never, { billing, rateLimiter, moderation: { model: classifier } })
const textOnly = setupAi(components as never, { billing, rateLimiter, moderation: { model: new MockLanguageModelV4({ provider: 'test', modelId: 'openai/gpt-oss-safeguard-20b', doGenerate: classifier.doGenerate as never }) } })
/** The default classifier, by its id: what an app's own tests get from nuxt-backend/test. */
const byId = setupAi(components as never, { billing, rateLimiter })
const storage = setupStorage(components as never, { accept: ['image/png', 'image/gif'] })
const jobs = defineJobQueue(components as never, { ai })

const appSchema = defineSchema({
  strips: defineTable({ idea: v.string(), photoId: v.optional(v.string()), panels: v.array(v.string()) }),
})

const check = ai.meteredAction({
  meter: false,
  args: { text: v.optional(v.string()), images: v.optional(v.array(v.string())), require: v.optional(v.boolean()) },
  handler: async (ctx, { text, images, require }) => {
    if (require) {
      await ai.requireSafe(ctx, { text, images })
      return null
    }
    return ai.moderate(ctx, { text, images })
  },
})
const checkTextOnly = textOnly.meteredAction({
  meter: false,
  args: { images: v.array(v.string()), text: v.optional(v.string()) },
  handler: async (ctx, { images, text }) => textOnly.moderate(ctx, { images, text }),
})
const checkById = byId.meteredAction({
  meter: false,
  args: { text: v.string() },
  handler: async (ctx, { text }) => {
    await byId.requireSafe(ctx, { text })
    return null
  },
})
/** A caption, checked before anything is reserved. */
let captioned = 0
const caption = ai.meteredAction({
  meter: false,
  moderate: ({ prompt }) => ({ text: prompt }),
  args: { prompt: v.string() },
  handler: async () => ++captioned,
})
/** An upload, as the browser would leave it: stored by the component, unclaimed by the app. */
const upload = mutationGeneric({
  args: { gif: v.boolean() },
  handler: async (ctx, { gif }) => {
    const identity = (await ctx.auth.getUserIdentity())!
    const stored = await storage.store(ctx, (gif ? GIF : PNG).slice().buffer as ArrayBuffer, { userId: identity.subject })
    return stored.storageId
  },
})
const readBytes = ai.meteredAction({
  meter: false,
  args: { storageId: v.string() },
  handler: async (ctx, { storageId }) => (await storage.bytes(ctx, storageId))?.length ?? null,
})

const drawPanel = jobs.step({
  args: { stripId: v.id('strips') },
  handler: async (ctx, { stripId }) => {
    await ctx.runMutation(makeFunctionReference<'mutation'>('strips:savePanel'), { stripId })
  },
})
const render = jobs.define({
  meter: 'credits',
  cost: 10,
  moderate: ({ idea, photoId }) => ({ text: idea, ...(photoId ? { images: [photoId] } : {}) }),
  args: { stripId: v.id('strips'), idea: v.string(), photoId: v.optional(v.string()) },
  handler: async (job, { stripId }) => {
    await job.run(makeFunctionReference<'action'>('strips:drawPanel') as unknown as FunctionReference<'action', 'internal'>, { stripId })
  },
})
const create = mutationGeneric({
  args: { idea: v.string(), photoId: v.optional(v.string()) },
  handler: async (ctx, { idea, photoId }) => {
    const stripId = await ctx.db.insert('strips', { idea, panels: [], ...(photoId ? { photoId } : {}) })
    const { jobId } = await jobs.enqueue(ctx, makeFunctionReference<'mutation'>('strips:render') as never, { stripId, idea, ...(photoId ? { photoId } : {}) })
    return { stripId, jobId }
  },
})
const savePanel = mutationGeneric({
  args: { stripId: v.id('strips') },
  handler: async (ctx, { stripId }) => {
    const strip = (await ctx.db.get(stripId))!
    await ctx.db.patch(stripId, { panels: [...strip.panels, 'panel'] })
  },
})

const testApp = defineBackendTestApp(appSchema, {
  './_generated/api.js': () => Promise.resolve({}),
  './jobs.js': () => Promise.resolve(jobs.api),
  './safety.js': () => Promise.resolve({ check, checkTextOnly, checkById, caption, upload, readBytes }),
  './strips.js': () => Promise.resolve({ render, drawPanel, create, savePanel }),
})
type App = ReturnType<typeof testApp>

const ref = {
  check: makeFunctionReference<'action', { text?: string, images?: string[], require?: boolean }, { flagged: boolean, categories: string[] } | null>('safety:check'),
  checkTextOnly: makeFunctionReference<'action', { images: string[], text?: string }, { flagged: boolean, categories: string[] }>('safety:checkTextOnly'),
  checkById: makeFunctionReference<'action', { text: string }, null>('safety:checkById'),
  caption: makeFunctionReference<'action', { prompt: string }, number>('safety:caption'),
  upload: makeFunctionReference<'mutation', { gif: boolean }, string>('safety:upload'),
  readBytes: makeFunctionReference<'action', { storageId: string }, number | null>('safety:readBytes'),
  create: makeFunctionReference<'mutation', { idea: string, photoId?: string }, { stripId: string, jobId: string }>('strips:create'),
  getJob: makeFunctionReference<'query', { jobId: string }, Record<string, unknown> | null>('jobs:getJob'),
}

async function refusal(call: Promise<unknown>) {
  return getBackendError(await call.then(() => null, (error: unknown) => error))
}

async function fund(t: App, workspaceId: string, balance: number): Promise<void> {
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

const silence = [vi.spyOn(console, 'warn').mockImplementation(() => {}), vi.spyOn(console, 'error').mockImplementation(() => {}), vi.spyOn(console, 'info').mockImplementation(() => {})]

beforeEach(() => {
  vi.useFakeTimers()
  shown.length = 0
  budgets.length = 0
  answer = null
  captioned = 0
  for (const spy of silence) spy.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('readVerdict', () => {
  test('reads Llama Guard\'s answer, and nothing else', () => {
    expect(readVerdict('safe')).toEqual({ flagged: false, categories: [] })
    expect(readVerdict(' unsafe\nS1,S10 ')).toEqual({ flagged: true, categories: ['S1', 'S10'] })
    expect(readVerdict('Unsafe.\ns12')).toEqual({ flagged: true, categories: ['S12'] })
    expect(readVerdict('I cannot help with that.')).toBeNull()
  })
})

describe('ai.moderate and ai.requireSafe', () => {
  test('answer the classifier\'s verdict on text, and refuse flagged text on prompt', async () => {
    const t = testApp()
    const ada = await asUser(t)
    expect(await ada.action(ref.check, { text: 'A fox who wants to fly' })).toEqual({ flagged: false, categories: [] })
    expect(await ada.action(ref.check, { text: 'Something BAD' })).toEqual({ flagged: true, categories: ['S10'] })
    expect(await refusal(ada.action(ref.check, { text: 'Something BAD', require: true }))).toMatchObject({ code: 'invalid_input', data: { field: 'prompt', reason: 'content_blocked' } })
    // Llama Guard brings its own policy: the text goes as it is, and its verdict needs a few tokens.
    expect(shown[0]).toEqual({ text: 'A fox who wants to fly', media: [] })
    expect(budgets[0]).toMatchObject({ maxOutputTokens: 20 })
  })

  test('read an upload not yet claimed from the component\'s storage, and a file of the app\'s own', async () => {
    const t = testApp()
    const ada = await asUser(t)
    const photo = await ada.mutation(ref.upload, { gif: false })
    const flagged = await ada.mutation(ref.upload, { gif: true })
    expect(await ada.action(ref.readBytes, { storageId: photo })).toBe(PNG.length)
    expect(await ada.action(ref.check, { images: [photo], require: true })).toBeNull()
    expect(await refusal(ada.action(ref.check, { images: [flagged], require: true }))).toMatchObject({ code: 'invalid_input', data: { field: 'images', reason: 'content_blocked' } })
    expect(shown.map(call => call.media)).toEqual([['image/png'], ['image/gif']])
    const own = await t.run(ctx => ctx.storage.store(new Blob([GIF])))
    expect(await ada.action(ref.check, { images: [own] })).toEqual({ flagged: true, categories: ['S12', 'S4'] })
  })

  test('refuse an image that is gone or is no image', async () => {
    const t = testApp()
    const ada = await asUser(t)
    const text = await t.run(ctx => ctx.storage.store(new Blob(['plain text'])))
    expect(await refusal(ada.action(ref.check, { images: [text] }))).toMatchObject({ code: 'invalid_input', data: { field: 'images', reason: 'unsupported_type' } })
    await t.run(ctx => ctx.storage.delete(text))
    expect(await refusal(ada.action(ref.check, { images: [text] }))).toMatchObject({ code: 'invalid_input', data: { field: 'images', reason: 'upload_gone' } })
    expect(await ada.action(ref.readBytes, { storageId: 'not-an-id' })).toBeNull()
    expect(shown).toEqual([])
  })

  test('refuse as unchecked when the classifier gives no verdict, and say so in the log', async () => {
    answer = 'Here is a poem about foxes.'
    const t = testApp()
    const ada = await asUser(t)
    expect(await refusal(ada.action(ref.check, { text: 'A fox' }))).toMatchObject({ code: 'unavailable', data: { service: 'ai', reason: 'provider_refused' } })
    expect(silence[1]!.mock.calls.flat().join(' ')).toContain('ai.moderation_unreadable')
  })

  test('a text-only classifier is given the policy and room to reason, and refuses images it cannot read', async () => {
    const t = testApp()
    const ada = await asUser(t)
    const flagged = await ada.mutation(ref.upload, { gif: true })
    // Images it cannot read are refused as unchecked, never answered safe.
    expect(await refusal(ada.action(ref.checkTextOnly, { images: [flagged] }))).toMatchObject({ code: 'unavailable', data: { service: 'ai', reason: 'not_configured' } })
    expect(await refusal(ada.action(ref.checkTextOnly, { images: [flagged], text: 'A fox' }))).toMatchObject({ code: 'unavailable', data: { reason: 'not_configured' } })
    expect(shown).toEqual([])
    expect(silence[1]!.mock.calls.flat().join(' ')).toContain('ai.moderation_images_unchecked')
    expect(await ada.action(ref.checkTextOnly, { images: [], text: 'BAD' })).toEqual({ flagged: true, categories: ['S10'] })
    // The content is quoted apart from the policy, which goes as the system prompt.
    expect(shown[0]).toEqual({ text: '<content>\nBAD\n</content>', media: [] })
    // A reasoning classifier's thinking counts against its output: it gets room, and is asked to keep it short.
    expect(budgets[0]).toEqual({ maxOutputTokens: 1024, providerOptions: { openai: { reasoningEffort: 'low' } } })
  })
})

describe('the test kit\'s classifier', () => {
  test('passes text, and refuses text carrying the marker, with no key and no network', async () => {
    const t = testApp()
    const ada = await asUser(t)
    expect(await ada.action(ref.checkById, { text: 'A fox who wants to fly' })).toBeNull()
    expect(await refusal(ada.action(ref.checkById, { text: 'A fox [[unsafe]]' }))).toMatchObject({ code: 'invalid_input', data: { field: 'prompt', reason: 'content_blocked' } })
  })
})

describe('moderate on a metered action', () => {
  test('refuses a flagged prompt before the handler runs', async () => {
    const t = testApp()
    const ada = await asUser(t)
    expect(await ada.action(ref.caption, { prompt: 'A fox' })).toBe(1)
    expect(await refusal(ada.action(ref.caption, { prompt: 'BAD fox' }))).toMatchObject({ code: 'invalid_input', data: { field: 'prompt', reason: 'content_blocked' } })
    expect(captioned).toBe(1)
  })
})

describe('moderate on a job', () => {
  test('a flagged job fails before its charge, and its hold goes back', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 50)
    const { jobId } = await ada.mutation(ref.create, { idea: 'A BAD strip' })
    await t.finishAllScheduledFunctions(vi.runAllTimers, 500)
    expect(await ada.query(ref.getJob, { jobId })).toMatchObject({ status: 'failed', error: { code: 'invalid_input', field: 'prompt', reason: 'content_blocked' } })
    expect(await balanceOf(t, ada.workspaceId!)).toBe(50)
  })

  test('a job that passes is charged and runs', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 50)
    const { jobId } = await ada.mutation(ref.create, { idea: 'A fox who wants to fly' })
    await t.finishAllScheduledFunctions(vi.runAllTimers, 500)
    expect(await ada.query(ref.getJob, { jobId })).toMatchObject({ status: 'done' })
    expect(await balanceOf(t, ada.workspaceId!)).toBe(40)
  })
})
