/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { actionGeneric, componentsGeneric, defineSchema, defineTable, type FunctionReference, internalMutationGeneric, makeFunctionReference, mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import { APICallError } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import backendTest, { asUser, defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { backendError, getBackendError } from '../../src/convex/errors'
import { arachnidShield, azureContentSafety, defineJobQueue, openaiModeration, setupAi } from '../../src/convex/integrations/ai'
import { TEST_MODERATION_PROVIDERS } from '../../src/convex/integrations/ai/moderation-providers'
import { TEST_FAINT, TEST_KNOWN_ABUSE, TEST_UNSAFE } from '../../src/convex/test-moderation'
import { MODERATION_TIMEOUT_MS, readVerdict } from '../../src/convex/integrations/ai/moderation'
import { MAINTENANCE_TASKS } from '../../src/convex/components/backend/maintenance'
import type { Billing } from '../../src/convex/integrations/billing'
import { setupRateLimiter } from '../../src/convex/integrations/rate-limit'
import { setupStorage } from '../../src/convex/integrations/storage'

// Content safety's check, the way an app uses it: ai.requireSafe on an
// upload not yet claimed (read from the component's storage through
// storage.bytes) or a file of the app's own, `moderate` on a metered action
// (checked before anything is reserved) and on a job (its first step, before
// the charge, the hold released when it is flagged). The classifier is a
// model object here, answering as Llama Guard does: `unsafe` and its codes
// for text that says BAD or for a GIF, `safe` for anything else. Like Llama
// Guard behind the Convex AI Gateway, it refuses a message with no text: a
// 200 whose body is the upstream error, which the SDK cannot read. A policy
// (`block`, `escalate`, `log`) decides what a flag refuses, which flags an
// administrator looks at, and how long the flags are kept for the Flags tab.

const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'>, rateLimiter: never, workflow: never, persistentTextStreaming: never }
const backend = components.backend
const METER_ID = 'm1'

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), char => char.charCodeAt(0))
const GIF = new TextEncoder().encode('GIF89a\x01\x00\x01\x00\x00\x00\x00;')

/** What the classifier was shown, call by call, and the output budget of each call. */
const shown: Array<{ text: string, media: string[] }> = []
const budgets: Array<{ maxOutputTokens?: number, providerOptions?: unknown }> = []
let answer: string | null = null
/** How the classifier fails, when it does: its provider's error, or no answer at all. */
let failure: 'provider' | 'hang' | null = null

/** What the AI SDK throws for a gateway's 200 that carries an upstream error instead of an answer. */
const upstreamError = () => new APICallError({
  message: 'Invalid JSON response',
  url: 'https://gateway.example.com/v1/chat/completions',
  requestBodyValues: {},
  statusCode: 200,
  responseBody: JSON.stringify({ id: 'gen-1', error: { message: 'Upstream error from DeepInfra: {\'message\': \'\', \'type\': \'BadRequestError\', \'code\': 400}', code: 400 } }),
  isRetryable: false,
})

const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 2, text: 2, reasoning: 0 } }
const classifier = new MockLanguageModelV4({
  provider: 'test',
  modelId: 'meta-llama/llama-guard-4-12b',
  doGenerate: async ({ prompt, maxOutputTokens, providerOptions, abortSignal }) => {
    budgets.push({ maxOutputTokens, providerOptions })
    const parts = prompt.flatMap(message => message.role === 'user' ? message.content as Array<{ type: string, text?: string, mediaType?: string }> : [])
    const text = parts.filter(part => part.type === 'text').map(part => part.text).join(' ')
    const media = parts.filter(part => part.type === 'file').map(part => part.mediaType!)
    shown.push({ text, media })
    if (failure === 'hang') {
      return new Promise((_resolve, reject) => abortSignal?.addEventListener('abort', () => reject(abortSignal.reason)))
    }
    if (failure === 'provider' || !text) throw upstreamError()
    const verdict = answer ?? (/BAD/.test(text) ? 'unsafe\nS10' : /HOUSE/.test(text) ? 'unsafe\nS7' : media.includes('image/gif') ? 'unsafe\nS12,S4' : 'safe')
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
/** A policy: hate (S10) and child safety (S4) refused, S4 escalated, the rest recorded and let through, flags kept 30 days. */
const policed = setupAi(components as never, { billing, rateLimiter, moderation: { model: classifier, block: ['S10', 'S4'], escalate: ['S4'], log: { days: 30 } } })
/** The default policy, with no flags kept. */
const unlogged = setupAi(components as never, { billing, rateLimiter, moderation: { model: classifier, log: false } })
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
/** A title checked under the policy, named in the app's words; `require` throws what the policy blocks. */
const checkPoliced = actionGeneric({
  args: { text: v.optional(v.string()), images: v.optional(v.array(v.string())), require: v.optional(v.boolean()) },
  handler: async (ctx, { text, images, require }) => {
    const about = { subject: 'comic-1', stage: 'title' }
    if (!require) return policed.moderate(ctx, { text, images }, about)
    await policed.requireSafe(ctx, { text, images }, about)
    return null
  },
})
/** The app's providers: Azure for images, OpenAI asked in the gray band, Arachnid Shield before both. */
const provided = setupAi(components as never, { billing, rateLimiter, moderation: { model: classifier, images: [azureContentSafety({ region: 'francecentral' })], secondOpinion: openaiModeration(), knownAbuse: arachnidShield(), thresholds: { violence: 0.45 }, policy: { version: '2026-11-08' } } })
const checkProvided = actionGeneric({
  args: { images: v.array(v.string()), stage: v.optional(v.string()) },
  handler: async (ctx, { images, stage }) => provided.moderate(ctx, { images }, { subject: 'upload-1', stage: stage ?? 'upload' }),
})
/** An upload whose bytes carry a marker the providers' fakes read, after a valid PNG; `wide` declares a width Azure refuses. */
const uploadMarked = mutationGeneric({
  args: { marker: v.string(), wide: v.optional(v.boolean()) },
  handler: async (ctx, { marker, wide }) => {
    const identity = (await ctx.auth.getUserIdentity())!
    // The IHDR size: 100 px a side, Azure's least is 50; `wide` goes past its 7200.
    const png = PNG.slice()
    const view = new DataView(png.buffer)
    view.setUint32(16, wide ? 8000 : 100)
    view.setUint32(20, 100)
    // The marker in a private ancillary chunk before IEND, which storage keeps as it strips metadata.
    const data = new TextEncoder().encode(marker)
    const chunk = new Uint8Array(12 + data.length)
    new DataView(chunk.buffer).setUint32(0, data.length)
    chunk.set(new TextEncoder().encode('prVt'), 4)
    chunk.set(data, 8)
    const bytes = new Uint8Array([...png.subarray(0, png.length - 12), ...chunk, ...png.subarray(png.length - 12)])
    const stored = await storage.store(ctx, bytes.buffer as ArrayBuffer, { userId: identity.subject })
    return stored.storageId
  },
})
const checkUnlogged = actionGeneric({ args: { text: v.string() }, handler: async (ctx, { text }) => unlogged.moderate(ctx, { text }) })
/** An upload's check in a plain action of the app's, outside any metered call. */
const checkAlone = actionGeneric({
  args: { text: v.string() },
  handler: async (ctx, { text }) => {
    await ai.requireSafe(ctx, { text })
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
  './safety.js': () => Promise.resolve({ check, checkTextOnly, checkById, checkAlone, caption, upload, readBytes, checkPoliced, checkUnlogged, checkProvided, uploadMarked }),
  './ai.js': () => Promise.resolve(policed.api),
  './strips.js': () => Promise.resolve({ render, drawPanel, create, savePanel }),
})
type App = ReturnType<typeof testApp>

const ref = {
  checkProvided: makeFunctionReference<'action', { images: string[], stage?: string }, Record<string, unknown>>('safety:checkProvided'),
  uploadMarked: makeFunctionReference<'mutation', { marker: string, wide?: boolean }, string>('safety:uploadMarked'),
  getModerationStatement: makeFunctionReference<'query', { flagId: string }, Record<string, unknown> | null>('ai:getModerationStatement'),
  check: makeFunctionReference<'action', { text?: string, images?: string[], require?: boolean }, { flagged: boolean, categories: string[] } | null>('safety:check'),
  checkTextOnly: makeFunctionReference<'action', { images: string[], text?: string }, { flagged: boolean, categories: string[] }>('safety:checkTextOnly'),
  checkById: makeFunctionReference<'action', { text: string }, null>('safety:checkById'),
  checkAlone: makeFunctionReference<'action', { text: string }, null>('safety:checkAlone'),
  caption: makeFunctionReference<'action', { prompt: string }, number>('safety:caption'),
  upload: makeFunctionReference<'mutation', { gif: boolean }, string>('safety:upload'),
  readBytes: makeFunctionReference<'action', { storageId: string }, number | null>('safety:readBytes'),
  create: makeFunctionReference<'mutation', { idea: string, photoId?: string }, { stripId: string, jobId: string }>('strips:create'),
  getJob: makeFunctionReference<'query', { jobId: string }, Record<string, unknown> | null>('jobs:getJob'),
  checkPoliced: makeFunctionReference<'action', { text?: string, images?: string[], require?: boolean }, Record<string, unknown> | null>('safety:checkPoliced'),
  checkUnlogged: makeFunctionReference<'action', { text: string }, Record<string, unknown>>('safety:checkUnlogged'),
  listModerationFlags: makeFunctionReference<'query', { paginationOpts: { numItems: number, cursor: string | null }, escalated?: boolean }, { page: Array<Record<string, unknown>>, isDone: boolean } | null>('ai:listModerationFlags'),
}

const firstPage = { numItems: 10, cursor: null }

// Reads of the component's own, for the test: its flags as stored, and the maintenance pass's prune of them.
const testing = {
  flags: queryGeneric({ args: {}, handler: async ctx => ctx.db.query('aiFlags').collect() }),
  prune: internalMutationGeneric({ args: { at: v.number() }, handler: async (ctx, { at }) => { await MAINTENANCE_TASKS.aiFlags(ctx as never, at) } }),
}

/** The app under test, with the component's test-only module beside its own. */
function appUnderTest(): App {
  const t = testApp()
  t.registerComponent('backend', backendTest.schema, { ...backendTest.modules, './components/backend/testing.ts': () => Promise.resolve(testing) })
  return t
}

const inComponent = (name: 'flags' | 'prune') => (backend as unknown as { testing: Record<string, FunctionReference<'query', 'internal'>> }).testing[name]!

/** Every flag the component keeps, as stored. */
const flagRows = (t: App) => t.query(inComponent('flags'), {}) as Promise<Array<Record<string, unknown>>>

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
  failure = null
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

  test('keeps a code beyond S14 for the policy to refuse, and reads no answer with other words beside the codes', () => {
    expect(readVerdict('unsafe\nS15')).toEqual({ flagged: true, categories: ['S15'] })
    // A padded code is the code it pads: escalated and held as S4 is.
    expect(readVerdict('unsafe\nS04, s012')).toEqual({ flagged: true, categories: ['S4', 'S12'] })
    expect(readVerdict('unsafe\nS7, child abuse')).toBeNull()
    expect(readVerdict('unsafe\nS1: violent crimes')).toBeNull()
    expect(readVerdict('safe\nS4')).toBeNull()
  })
})

describe('ai.moderate and ai.requireSafe', () => {
  test('answer the classifier\'s verdict on text, and refuse flagged text on prompt', async () => {
    const t = testApp()
    const ada = await asUser(t)
    expect(await ada.action(ref.check, { text: 'A fox who wants to fly' })).toMatchObject({ flagged: false, categories: [], codes: [], blocked: false, escalate: false })
    expect(await ada.action(ref.check, { text: 'Something BAD' })).toMatchObject({ flagged: true, categories: ['hate'], codes: ['S10'], blocked: true, escalate: false })
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
    // Images checked alone go with a few neutral words, which the gateway's Llama Guard needs.
    expect(shown.map(call => call.text)).toEqual(['An image to check.', 'An image to check.'])
    const own = await t.run(ctx => ctx.storage.store(new Blob([GIF])))
    expect(await ada.action(ref.check, { images: [own] })).toMatchObject({ flagged: true, categories: ['minors_sexual', 'sexual'], codes: ['S12', 'S4'], blocked: true, escalate: false })
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

  test('refuse as unchecked, with a code, when the classifier\'s provider fails, and log the provider\'s words', async () => {
    failure = 'provider'
    const t = testApp()
    const ada = await asUser(t)
    expect(await refusal(ada.action(ref.check, { text: 'A fox' }))).toMatchObject({ code: 'unavailable', data: { service: 'ai', reason: 'provider_refused' } })
    const logged = silence[1]!.mock.calls.map(call => String(call[0])).join(' ')
    expect(logged).toContain('ai.moderation_failed')
    expect(logged).toContain('Upstream error from DeepInfra')
  })

  test('stop waiting for a classifier that does not answer, and refuse the content as unchecked', async () => {
    failure = 'hang'
    const t = testApp()
    const ada = await asUser(t)
    const checked = refusal(ada.action(ref.check, { text: 'A fox' }))
    await vi.advanceTimersByTimeAsync(MODERATION_TIMEOUT_MS)
    expect(await checked).toMatchObject({ code: 'unavailable', data: { service: 'ai', reason: 'provider_refused' } })
    expect(silence[1]!.mock.calls.flat().join(' ')).toContain('ai.moderation_failed')
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
    expect(await ada.action(ref.checkTextOnly, { images: [], text: 'BAD' })).toMatchObject({ flagged: true, categories: ['hate'], codes: ['S10'], blocked: true, escalate: false })
    // The content is quoted apart from the policy, which goes as the system prompt.
    expect(shown[0]).toEqual({ text: '<content>\nBAD\n</content>', media: [] })
    // A reasoning classifier's thinking counts against its output: it gets room, and is asked to keep it short.
    expect(budgets[0]).toEqual({ maxOutputTokens: 1024, providerOptions: { openai: { reasoningEffort: 'low' } } })
  })
})

describe('a check outside a metered call', () => {
  test('is a model call like any: its cost recorded, and refused while pause_ai is on', async () => {
    const t = testApp()
    const ada = await asUser(t)
    const since = Date.now()
    expect(await ada.action(ref.checkAlone, { text: 'A fox who wants to fly' })).toBeNull()
    // Recorded against who asked, so the Costs tab and the spendLimit count it.
    expect(await t.query(backend.costs.summary as unknown as FunctionReference<'query'>, { since })).toMatchObject({ runs: 1, people: [expect.objectContaining({ input: 10, output: 2 })] })
    await t.mutation(backend.flags.set as unknown as FunctionReference<'mutation'>, { key: 'pause_ai', override: { enabled: true } })
    const calls = shown.length
    expect(await refusal(ada.action(ref.checkAlone, { text: 'A fox' }))).toMatchObject({ code: 'unavailable', data: { reason: 'ai_paused' } })
    expect(shown.length).toBe(calls)
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

describe('the moderation policy', () => {
  test('blocks only the categories it names, escalates its own, and passes the rest, recorded', async () => {
    const t = appUnderTest()
    const ada = await asUser(t)
    const gif = await ada.mutation(ref.upload, { gif: true })
    expect(await ada.action(ref.checkPoliced, { text: 'Something BAD' })).toMatchObject({ flagged: true, categories: ['hate'], codes: ['S10'], blocked: true, escalate: false })
    // Privacy (S7) is let through under this policy, recorded.
    expect(await ada.action(ref.checkPoliced, { text: 'My HOUSE number' })).toMatchObject({ flagged: true, categories: [], codes: ['S7'], blocked: false, escalate: false })
    expect(await ada.action(ref.checkPoliced, { text: 'My HOUSE number', require: true })).toBeNull()
    // Child safety (S4) goes to an administrator, and is held back meanwhile.
    expect(await ada.action(ref.checkPoliced, { images: [gif] })).toMatchObject({ flagged: true, categories: ['minors_sexual', 'sexual'], codes: ['S12', 'S4'], blocked: true, escalate: true })
    expect(await refusal(ada.action(ref.checkPoliced, { images: [gif], require: true }))).toMatchObject({ code: 'invalid_input', data: { reason: 'content_blocked' } })
    expect(await refusal(ada.action(ref.checkPoliced, { text: 'Something BAD', require: true }))).toMatchObject({ code: 'invalid_input', data: { reason: 'content_blocked' } })
    // A clean check records nothing.
    expect(await ada.action(ref.checkPoliced, { text: 'A fox' })).toMatchObject({ flagged: false, blocked: false })
    const rows = await flagRows(t)
    expect(rows).toHaveLength(6)
    expect(rows[0]).toMatchObject({ userId: ada.userId, subject: 'comic-1', stage: 'title', categories: ['hate'], codes: ['S10'], providers: ['meta-llama/llama-guard-4-12b'], automated: true, blocked: true, escalate: false, model: 'meta-llama/llama-guard-4-12b', policy: 'block S10,S4; escalate S4' })
    expect(rows[0]).not.toHaveProperty('legalHold')
    expect(rows[3]).toMatchObject({ codes: ['S12', 'S4'], blocked: true, escalate: true, legalHold: true })
    // The escalation's log line names what, where, and the flag that holds it.
    expect(vi.mocked(console.error).mock.calls.flat().map(String).join('\n')).toContain('ai.content_escalated')
    expect(vi.mocked(console.error).mock.calls.flat().map(String).join('\n')).toContain(`subject comic-1, at title, flag ${rows[3]!._id as string}`)
    // Kept the policy's 30 days.
    expect(Math.round(((rows[0]!.expiresAt as number) - (rows[0]!._creationTime as number)) / 1000)).toBe(30 * 24 * 60 * 60)
  })

  test('reads a padded code as the code it pads: S04 is escalated and held as S4', async () => {
    const t = appUnderTest()
    const ada = await asUser(t)
    answer = 'unsafe\nS04'
    expect(await ada.action(ref.checkPoliced, { text: 'A fox' })).toMatchObject({ flagged: true, categories: ['minors_sexual'], codes: ['S4'], blocked: true, escalate: true })
    expect(await flagRows(t)).toEqual([expect.objectContaining({ codes: ['S4'], escalate: true, legalHold: true })])
  })

  test('refuses a code beyond S14 under any policy: it was never weighed', async () => {
    const t = appUnderTest()
    const ada = await asUser(t)
    answer = 'unsafe\nS15'
    expect(await ada.action(ref.checkPoliced, { text: 'A fox' })).toMatchObject({ flagged: true, categories: [], codes: ['S15'], blocked: true, escalate: false })
  })

  test('lists the flags to administrators only, newest first, the escalated ones alone on asking', async () => {
    const t = appUnderTest()
    const ada = await asUser(t)
    const admin = await asUser(t, { role: 'admin' })
    const gif = await ada.mutation(ref.upload, { gif: true })
    await ada.action(ref.checkPoliced, { text: 'Something BAD' })
    vi.advanceTimersByTime(1000)
    await ada.action(ref.checkPoliced, { images: [gif] })

    expect(await ada.query(ref.listModerationFlags, { paginationOpts: firstPage })).toBeNull()
    const all = (await admin.query(ref.listModerationFlags, { paginationOpts: firstPage }))!
    expect(all.page.map(flag => flag.codes)).toEqual([['S12', 'S4'], ['S10']])
    expect(all.page[0]).toMatchObject({ id: expect.any(String), at: expect.any(Number), userId: ada.userId, subject: 'comic-1', stage: 'title', categories: ['minors_sexual', 'sexual'], codes: ['S12', 'S4'], blocked: true, escalate: true, model: 'meta-llama/llama-guard-4-12b', policy: 'block S10,S4; escalate S4', legalHold: true })
    const escalated = (await admin.query(ref.listModerationFlags, { paginationOpts: firstPage, escalated: true }))!
    expect(escalated.page.map(flag => flag.codes)).toEqual([['S12', 'S4']])
  })

  test('the default blocks every flag and keeps flags 183 days; `log: false` keeps none', async () => {
    const t = appUnderTest()
    const ada = await asUser(t)
    expect(await refusal(ada.action(ref.check, { text: 'Something BAD', require: true }))).toMatchObject({ code: 'invalid_input' })
    expect(await ada.action(ref.checkUnlogged, { text: 'Something BAD' })).toMatchObject({ blocked: true })
    const rows = await flagRows(t)
    expect(rows).toHaveLength(1)
    expect(Math.round(((rows[0]!.expiresAt as number) - (rows[0]!._creationTime as number)) / 1000)).toBe(183 * 24 * 60 * 60)
  })

  test('the maintenance pass prunes a flag once its days are over', async () => {
    const t = appUnderTest()
    const ada = await asUser(t)
    await ada.action(ref.checkPoliced, { text: 'Something BAD' })
    await t.mutation(inComponent('prune') as unknown as FunctionReference<'mutation'>, { at: Date.now() + 29 * 24 * 60 * 60 * 1000 })
    expect(await flagRows(t)).toHaveLength(1)
    await t.mutation(inComponent('prune') as unknown as FunctionReference<'mutation'>, { at: Date.now() + 31 * 24 * 60 * 60 * 1000 })
    expect(await flagRows(t)).toEqual([])
  })

  test('a flagged job\'s record names the job, its starter and its workspace', async () => {
    const t = appUnderTest()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 50)
    const { jobId } = await ada.mutation(ref.create, { idea: 'A BAD strip' })
    await t.finishAllScheduledFunctions(vi.runAllTimers, 500)
    expect(await flagRows(t)).toEqual([expect.objectContaining({ userId: ada.userId, owner: ada.workspaceId, subject: jobId, stage: 'job', blocked: true })])
  })

  test('refuses a policy it cannot keep, where setupAi is called', () => {
    const setup = (moderation: Record<string, unknown>) => () => setupAi(components as never, { billing, rateLimiter, moderation: { model: classifier, ...moderation } })
    expect(setup({ block: 'some' })).toThrow(/`block` is 'all' or a list/)
    expect(setup({ block: ['S1', ''] })).toThrow(/`block`/)
    expect(setup({ escalate: 'S4' })).toThrow(/`escalate` is a list/)
    // A mistyped or unknown code would match nothing, and let its content through.
    for (const code of ['s04', 'csam', 'S15', 'S0', 'S4.']) {
      expect(setup({ block: ['S1', code] })).toThrow(/`block` is 'all' or a list of categories or Llama Guard's codes/)
      expect(setup({ block: 'all', escalate: [code] })).toThrow(/`escalate` is a list of categories or Llama Guard's codes/)
    }
    expect(setup({ block: [' s4 ', 'S10'], escalate: ['S4 '] })).not.toThrow()
    // Escalated content is held back: each escalated code is blocked too, and leaves a record.
    expect(setup({ block: ['S10'], escalate: ['S4'] })).toThrow(/`escalate` names S4, which `block` does not/)
    expect(setup({ escalate: ['S4'] })).not.toThrow()
    // A code and the shared category it reads as cover each other; another category does not.
    expect(setup({ block: ['minors_sexual'], escalate: ['S4'] })).not.toThrow()
    expect(setup({ block: ['S4'], escalate: ['minors_sexual'] })).not.toThrow()
    expect(setup({ block: ['sexual'], escalate: ['minors_sexual'] })).toThrow(/`escalate` names minors_sexual/)
    expect(setup({ escalate: ['S4'], log: false })).toThrow(/`escalate` needs the flags `log` keeps/)
    // A known-abuse match leaves its hash on record.
    expect(setup({ knownAbuse: arachnidShield(), log: false })).toThrow(/`knownAbuse` needs the flags `log` keeps/)
    // No image provider judges minors in an image: new abuse material is caught as sexual, which block must cover.
    const azure = azureContentSafety({ region: 'francecentral' })
    expect(setup({ images: [azure], block: ['S10', 'hate'] })).toThrow(/no image provider judges `minors_sexual`/)
    expect(setup({ images: [azure], block: ['S10', 'S12'] })).not.toThrow()
    expect(setup({ images: [azure], block: ['sexual'] })).not.toThrow()
    expect(setup({ images: [azure] })).not.toThrow()
    expect(setup({ log: { days: 0 } })).toThrow(/log.days/)
    expect(setup({ log: { days: 1.5 } })).toThrow(/log.days/)
  })
})

describe('moderation providers', () => {
  /** Which providers a check asked, in order. */
  const asked: string[] = []
  const globals = globalThis as Record<symbol, unknown>
  let fake: (provider: string, request: unknown) => unknown

  beforeEach(() => {
    asked.length = 0
    fake = globals[TEST_MODERATION_PROVIDERS] as typeof fake
    globals[TEST_MODERATION_PROVIDERS] = (provider: string, request: unknown) => {
      asked.push(provider)
      return fake(provider, request)
    }
  })
  afterEach(() => {
    globals[TEST_MODERATION_PROVIDERS] = fake
  })

  test('checks an image with the image provider after the known-abuse match, and passes a clean one', async () => {
    const t = appUnderTest()
    const ada = await asUser(t)
    const photo = await ada.mutation(ref.uploadMarked, { marker: '' })
    expect(await ada.action(ref.checkProvided, { images: [photo] })).toMatchObject({ flagged: false, blocked: false, categories: [], providers: ['azure-content-safety', 'meta-llama/llama-guard-4-12b'] })
    expect(asked).toEqual(['arachnid-shield', 'azure-content-safety'])
    // Azure judges no minors in an image, so the Llama Guard stand-in reads it for that alone.
    expect(shown).toEqual([{ text: 'An image to check.', media: ['image/png'] }])
  })

  test('catches a sexual image of a minor no hash list knows through the classifier, holds it, and withholds its statement from the uploader', async () => {
    const t = appUnderTest()
    const ada = await asUser(t)
    const admin = await asUser(t, { role: 'admin' })
    const photo = await ada.mutation(ref.uploadMarked, { marker: '' })
    answer = 'unsafe\nS4, S12'
    const verdict = await ada.action(ref.checkProvided, { images: [photo] })
    // Only its minors reading is kept: the image provider judges the rest.
    expect(verdict).toMatchObject({ flagged: true, blocked: true, categories: ['minors_sexual'], codes: ['S4'] })
    const [row] = await flagRows(t)
    expect(row).toMatchObject({ categories: ['minors_sexual'], legalHold: true })
    expect(await ada.query(ref.getModerationStatement, { flagId: String(row!._id) })).toBeNull()
    expect(await admin.query(ref.getModerationStatement, { flagId: String(row!._id) })).toMatchObject({ decision: 'blocked', categories: ['minors_sexual'] })
  })

  test('blocks sexual content the image provider finds, and records the decision with its scores, thresholds and policy', async () => {
    const t = appUnderTest()
    const ada = await asUser(t)
    const photo = await ada.mutation(ref.uploadMarked, { marker: TEST_UNSAFE('sexual') })
    const verdict = await ada.action(ref.checkProvided, { images: [photo] })
    expect(verdict).toMatchObject({ flagged: true, blocked: true, categories: ['sexual'], codes: ['Sexual:6'], providers: ['azure-content-safety', 'meta-llama/llama-guard-4-12b'] })
    expect(verdict.scores).toMatchObject({ sexual: { score: 1, supported: true }, minors_sexual: { score: 0, supported: true } })
    const [row] = await flagRows(t)
    expect(row).toMatchObject({ categories: ['sexual'], providers: ['azure-content-safety', 'meta-llama/llama-guard-4-12b'], policyVersion: '2026-11-08', automated: true, thresholds: { sexual: 0.3, violence: 0.45 } })
  })

  test('blocks a known-abuse match before any other provider sees the image, and keeps its hash, never the image', async () => {
    const t = appUnderTest()
    const ada = await asUser(t)
    const admin = await asUser(t, { role: 'admin' })
    const photo = await ada.mutation(ref.uploadMarked, { marker: TEST_KNOWN_ABUSE })
    expect(await ada.action(ref.checkProvided, { images: [photo] })).toMatchObject({ flagged: true, blocked: true, escalate: true, knownAbuse: true, categories: ['csam_match'], providers: ['arachnid-shield'] })
    expect(asked).toEqual(['arachnid-shield'])
    const [row] = await flagRows(t)
    expect(row).toMatchObject({ playbook: 'csam', hash: expect.stringMatching(/^[0-9a-f]{64}$/), categories: ['csam_match'] })
    expect(vi.mocked(console.error).mock.calls.flat().map(String).join('\n')).toContain('ai.known_abuse_matched')
    // A match goes to the authorities, never back to who uploaded it.
    expect(await ada.query(ref.getModerationStatement, { flagId: String(row!._id) })).toBeNull()
    expect(await admin.query(ref.getModerationStatement, { flagId: String(row!._id) })).toMatchObject({ decision: 'blocked', categories: ['csam_match'] })
  })

  test('asks the second opinion only for a score just under its threshold', async () => {
    const t = appUnderTest()
    const ada = await asUser(t)
    // Azure's lowest violence (2 of 6) sits in the gray band under this app's 0.45.
    const faint = await ada.mutation(ref.uploadMarked, { marker: TEST_FAINT('violence') })
    expect(await ada.action(ref.checkProvided, { images: [faint] })).toMatchObject({ flagged: false, providers: ['azure-content-safety', 'meta-llama/llama-guard-4-12b', 'openai-moderation'] })
    expect(asked).toEqual(['arachnid-shield', 'azure-content-safety', 'openai-moderation'])
    asked.length = 0
    const clean = await ada.mutation(ref.uploadMarked, { marker: '' })
    await ada.action(ref.checkProvided, { images: [clean] })
    expect(asked).not.toContain('openai-moderation')
  })

  test('flags any sexual signal on a model\'s output that an upload would let through', async () => {
    const t = appUnderTest()
    const ada = await asUser(t)
    // Suggestive (Azure's sexual severity 2) passes an upload, and flags an output.
    const suggestive = await ada.mutation(ref.uploadMarked, { marker: TEST_UNSAFE('suggestive') })
    expect(await ada.action(ref.checkProvided, { images: [suggestive] })).toMatchObject({ flagged: false })
    expect(await ada.action(ref.checkProvided, { images: [suggestive], stage: 'output' })).toMatchObject({ flagged: true, blocked: true, categories: ['suggestive'] })
  })

  test('refuses an image Azure would refuse, saying how to fix it', async () => {
    const t = appUnderTest()
    const ada = await asUser(t)
    const wide = await ada.mutation(ref.uploadMarked, { marker: '', wide: true })
    expect(await refusal(ada.action(ref.checkProvided, { images: [wide] }))).toMatchObject({ code: 'invalid_input', data: { field: 'images', reason: 'too_large' } })
  })

  test('gives a decision\'s statement of reasons to the person it was about, and to no one else', async () => {
    const t = appUnderTest()
    const ada = await asUser(t)
    const stranger = await asUser(t)
    const photo = await ada.mutation(ref.uploadMarked, { marker: TEST_UNSAFE('violence') })
    await ada.action(ref.checkProvided, { images: [photo] })
    const [row] = await flagRows(t)
    const flagId = String(row!._id)
    expect(await ada.query(ref.getModerationStatement, { flagId })).toEqual({ id: flagId, at: expect.any(Number), decision: 'blocked', automated: true, categories: ['violence'], providers: ['azure-content-safety', 'meta-llama/llama-guard-4-12b'], policyVersion: '2026-11-08', subject: 'upload-1', stage: 'upload' })
    expect(await stranger.query(ref.getModerationStatement, { flagId })).toBeNull()
    expect(await t.query(ref.getModerationStatement, { flagId })).toBeNull()
  })
})
