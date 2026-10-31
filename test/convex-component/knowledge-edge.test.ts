/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, type FunctionReference, internalActionGeneric, makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'
import type { MockEmbeddingModelV4 } from 'ai/test'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { backendError, getBackendError } from '../../src/convex/errors'
import { setupAi } from '../../src/convex/integrations/ai'
import type { Billing } from '../../src/convex/integrations/billing'
import { setupRateLimiter } from '../../src/convex/integrations/rate-limit'
import { testEmbeddingModel } from '../../src/convex/test-models'

// ai.knowledge at its edges, the way backend/knowledge.ts uses it: what a
// store's definition refuses, what a document's title and text may be, who
// may read, add and remove (signed out, without a workspace, from another
// workspace), a model this deployment cannot reach, an upload that is no
// text, a search whose embedding fails, a free store, and server code that
// fills a workspace's own namespace. The happy paths and the chat that
// grounds its replies are in ai-chat.test.ts.

// The first test loads the RAG component's modules.
vi.setConfig({ testTimeout: 30_000 })

const METER_ID = 'm1'
const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'>, rag: never, rateLimiter: never }
const backend = components.backend

/** What the fake billing provider was asked to settle. */
const provider = { charges: [] as Array<{ externalId: string, finalAmount?: number, metadata?: Record<string, unknown> }> }

// A billing stand-in over the component's real credit cache, as ai-chat.test.ts has it.
// An account outside any workspace has no billing entity: reads see nothing, writes are refused.
const billing = {
  requireEntity: async (ctx: { auth: { getUserIdentity: () => Promise<Record<string, unknown> | null> } }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw backendError('unauthenticated', {})
    if (typeof identity.activeOrganizationId !== 'string') throw backendError('forbidden', { reason: 'no_workspace' })
    return { userId: identity.activeOrganizationId, email: identity.email as string }
  },
  reserveCredits: async (ctx: { runMutation: (ref: unknown, args: unknown) => Promise<{ ok: boolean, balance: number }> }, event: { userId: string, value: number, externalId?: string }) => {
    const externalId = event.externalId ?? crypto.randomUUID()
    const result = await ctx.runMutation(backend.billing.debit, { userId: event.userId, meterId: METER_ID, amount: event.value, externalId })
    if (!result.ok) throw backendError('insufficient_credits', { meter: 'credits', balance: result.balance, need: event.value })
    return { entityId: event.userId, externalId, reserved: true, meter: 'credits', meterId: METER_ID, value: event.value }
  },
  settleSpend: async (_ctx: unknown, reservation: { externalId: string }, options: { finalAmount?: number, metadata?: Record<string, unknown> } = {}) => {
    provider.charges.push({ externalId: reservation.externalId, ...options })
  },
  releaseSpend: async (ctx: { runMutation: (ref: unknown, args: unknown) => Promise<unknown> }, reservation: { entityId: string, externalId: string }) => {
    await ctx.runMutation(backend.billing.release, { userId: reservation.entityId, externalId: reservation.externalId })
  },
  recordEvent: async () => {},
} as unknown as Billing

const rateLimiter = setupRateLimiter(components as never)
const ai = setupAi(components as never, { billing, rateLimiter })

// A flat price: no cost option for search, so a search costs the default one credit.
const library = ai.knowledge({ model: 'openai/text-embedding-3-small', dimension: 1536, meter: 'credits', cost: { add: 3 } })
// No cost option at all: adding costs the default one credit.
const notes = ai.knowledge({ model: 'openai/text-embedding-3-large', dimension: 3072, meter: 'credits' })
// Free to add and to search.
const free = ai.knowledge({ model: 'openai/text-embedding-3-small', dimension: 512, meter: false })

const publish = internalActionGeneric({
  args: { namespace: v.string(), title: v.string(), text: v.string() },
  handler: async (ctx, document) => library.add(ctx, document),
})

const testApp = defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './library.js': () => Promise.resolve(library.api),
  './notes.js': () => Promise.resolve(notes.api),
  './free.js': () => Promise.resolve(free.api),
  './server.js': () => Promise.resolve({ publish }),
})
type App = ReturnType<typeof testApp>

type Page<T> = { page: T[], isDone: boolean, continueCursor: string }
const firstPage = { numItems: 20, cursor: null }
const storeRefs = (module: string) => ({
  documents: makeFunctionReference<'query', { paginationOpts: typeof firstPage }, Page<{ id: string, title: string, status: string, addedBy: string }>>(`${module}:documents`),
  add: makeFunctionReference<'mutation', { title: string, text?: string, storageId?: string, key?: string }, string>(`${module}:add`),
  search: makeFunctionReference<'action', { query: string, limit?: number }, { passages: Array<{ text: string, score: number, document: { id: string, title: string } }> }>(`${module}:search`),
  remove: makeFunctionReference<'mutation', { documentId: string }, null>(`${module}:remove`),
})
const store = storeRefs('library')
const publishRef = makeFunctionReference<'action', { namespace: string, title: string, text: string }, { documentId: string }>('server:publish')

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

async function drain(t: App) {
  await t.finishAllScheduledFunctions(vi.runAllTimers, 200)
}

async function refusal(call: Promise<unknown>) {
  return getBackendError(await call.then(() => null, (error: unknown) => error))
}

const TEST_EMBEDDING_MODELS = Symbol.for('nuxt-backend.testEmbeddingModels')

/** Run `body` with the mock embedding model's `doEmbed` wrapped, as ai-chat.test.ts does; `null` takes the mock away. */
async function withEmbedding(wrap: ((options: Parameters<MockEmbeddingModelV4['doEmbed']>[0], doEmbed: MockEmbeddingModelV4['doEmbed']) => ReturnType<MockEmbeddingModelV4['doEmbed']>) | null, body: () => Promise<void>) {
  const previous = (globalThis as Record<symbol, unknown>)[TEST_EMBEDDING_MODELS]
  ;(globalThis as Record<symbol, unknown>)[TEST_EMBEDDING_MODELS] = wrap && ((id: string, dimension: number) => {
    const model = testEmbeddingModel(id, dimension) as MockEmbeddingModelV4
    const doEmbed = model.doEmbed.bind(model)
    model.doEmbed = async options => wrap(options, doEmbed)
    return model
  })
  try {
    await body()
  }
  finally {
    ;(globalThis as Record<symbol, unknown>)[TEST_EMBEDDING_MODELS] = previous
  }
}

/** An upload of the workspace's, checked and ready, as setupStorage keeps one; its storage URL answers with `body` as `type`. */
async function upload(t: App, owner: { userId: string, workspaceId?: string }, body: string, type: string) {
  const { storageId } = await t.mutation(backend.storage.store as unknown as FunctionReference<'mutation'>, {
    bytes: new TextEncoder().encode(body).buffer,
    contentType: type,
    owner: { userId: owner.userId, workspaceId: owner.workspaceId },
    holder: owner.workspaceId,
    limits: {},
  }) as { storageId: string }
  const served = await t.query(backend.storage.url as unknown as FunctionReference<'query'>, { storageId }) as string
  const real = globalThis.fetch.bind(globalThis)
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    return url === served ? new Response(body, { headers: { 'content-type': type } }) : real(input, init)
  })
  return storageId
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  provider.charges.length = 0
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('a store\'s definition', () => {
  test('refuses a vector length that is no whole number, and a store with no word on its price', () => {
    expect(() => ai.knowledge({ model: 'openai/text-embedding-3-small', dimension: 0, meter: false })).toThrow(/`dimension` is the length of the model's vectors/)
    expect(() => ai.knowledge({ model: 'openai/text-embedding-3-small', dimension: 1536.5, meter: false })).toThrow(/`dimension`/)
    expect(() => ai.knowledge({ model: 'openai/text-embedding-3-small', dimension: 1536 } as never)).toThrow(/name the credit `meter`/)
  })
})

describe('a document', () => {
  test('needs a title of at most 200 characters, trimmed, and some text of at most 500,000', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    expect(await refusal(ada.mutation(store.add, { title: '   ', text: 'x' }))).toMatchObject({ code: 'invalid_input', data: { field: 'title' } })
    expect((await refusal(ada.mutation(store.add, { title: '   ', text: 'x' })))!.data).not.toHaveProperty('reason')
    expect(await refusal(ada.mutation(store.add, { title: 't'.repeat(201), text: 'x' }))).toMatchObject({ data: { field: 'title', reason: 'too_long' } })
    expect(await refusal(ada.mutation(store.add, { title: 'Notes', text: ' \n ' }))).toMatchObject({ data: { field: 'text', reason: 'empty' } })
    expect(await refusal(ada.mutation(store.add, { title: 'Notes', text: 'x'.repeat(500_001) }))).toMatchObject({ data: { field: 'text', reason: 'too_long' } })
    expect(await balanceOf(t, ada.workspaceId!)).toBe(100)

    const documentId = await ada.mutation(store.add, { title: `  ${'t'.repeat(200)}  `, text: 'The fox learned to fly.' })
    expect((await ada.query(store.documents, { paginationOpts: firstPage })).page).toEqual([expect.objectContaining({ id: documentId, title: 't'.repeat(200) })])
  })

  test('costs the store\'s flat price to add, and the default one credit where the store names none', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    await ada.mutation(store.add, { title: 'Weather', text: 'In the strip it always rains on Tuesdays.' })
    expect(await balanceOf(t, ada.workspaceId!)).toBe(97)
    await ada.mutation(storeRefs('notes').add, { title: 'Weather', text: 'In the strip it always rains on Tuesdays.' })
    expect(await balanceOf(t, ada.workspaceId!)).toBe(96)
    await drain(t)
    expect(provider.charges.map(charge => charge.finalAmount)).toEqual([3, 1])
    // A search with no price of its own costs one credit.
    await ada.action(store.search, { query: 'when does it rain' })
    expect(await balanceOf(t, ada.workspaceId!)).toBe(95)
  })

  test('removed before its embedding ran is never embedded, and its reservation goes back', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    const documentId = await ada.mutation(store.add, { title: 'Wrong file', text: 'The secret plan of the fox.' })
    await ada.mutation(store.remove, { documentId })
    await drain(t)
    expect(provider.charges).toEqual([])
    expect(await balanceOf(t, ada.workspaceId!)).toBe(100)
    expect((await ada.query(store.documents, { paginationOpts: firstPage })).page).toEqual([])
  })
})

describe('who may use a store', () => {
  test('signed out, or outside any workspace, reads an empty library and may add nothing', async () => {
    const t = testApp()
    const loner = await asUser(t, { workspace: false })
    expect(await t.query(store.documents, { paginationOpts: firstPage })).toEqual({ page: [], isDone: true, continueCursor: '' })
    expect(await loner.query(store.documents, { paginationOpts: firstPage })).toEqual({ page: [], isDone: true, continueCursor: '' })
    expect(await refusal(t.mutation(store.add, { title: 'Notes', text: 'x' }))).toMatchObject({ code: 'unauthenticated' })
    expect(await refusal(loner.mutation(store.add, { title: 'Notes', text: 'x' }))).toMatchObject({ code: 'forbidden', data: { reason: 'no_workspace' } })
  })

  test('removes only a document of the caller\'s own workspace and this store', async () => {
    const t = testApp()
    const ada = await asUser(t)
    const eve = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    await fund(t, eve.workspaceId!, 100)
    const theirs = await ada.mutation(store.add, { title: 'Ada\'s', text: 'Ada wrote this.' })
    const elsewhere = await ada.mutation(storeRefs('notes').add, { title: 'Ada\'s notes', text: 'Ada wrote these.' })
    await drain(t)

    expect(await refusal(eve.mutation(store.remove, { documentId: theirs }))).toMatchObject({ code: 'forbidden', data: { reason: 'not_owner' } })
    // The same workspace, through another store's functions.
    expect(await refusal(ada.mutation(store.remove, { documentId: elsewhere }))).toMatchObject({ code: 'forbidden', data: { reason: 'not_owner' } })
    expect((await ada.query(store.documents, { paginationOpts: firstPage })).page.map(document => document.id)).toEqual([theirs])
  })
})

describe('a model this deployment cannot reach', () => {
  test('refuses an add and a search before anything is reserved', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', '')
    vi.stubEnv('CONVEX_CLOUD_URL', '')
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    await withEmbedding(null, async () => {
      expect(await refusal(ada.mutation(store.add, { title: 'Notes', text: 'x' }))).toMatchObject({ code: 'unavailable', data: { service: 'ai', reason: 'not_configured' } })
      expect(await refusal(ada.action(store.search, { query: 'fox' }))).toMatchObject({ code: 'unavailable', data: { reason: 'not_configured' } })
    })
    expect(await balanceOf(t, ada.workspaceId!)).toBe(100)
  })
})

describe('an upload', () => {
  test('that is no plain text or Markdown fails the document, and its reservation goes back', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    const storageId = await upload(t, ada, '<html><body>Not notes</body></html>', 'text/html')
    const documentId = await ada.mutation(store.add, { title: 'A page', storageId })
    expect(await balanceOf(t, ada.workspaceId!)).toBe(97)
    await drain(t)
    expect((await ada.query(store.documents, { paginationOpts: firstPage })).page).toEqual([expect.objectContaining({ id: documentId, status: 'failed' })])
    expect(await balanceOf(t, ada.workspaceId!)).toBe(100)
    expect(provider.charges).toEqual([])
  })

  test('of text with nothing in it fails the document as well', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    const storageId = await upload(t, ada, ' \n\n ', 'text/plain')
    await ada.mutation(store.add, { title: 'Empty', storageId })
    await drain(t)
    expect((await ada.query(store.documents, { paginationOpts: firstPage })).page[0]).toMatchObject({ status: 'failed' })
    expect(await balanceOf(t, ada.workspaceId!)).toBe(100)
  })
})

describe('a search', () => {
  test('refuses an empty question, and finds at least one passage for a limit under one', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    await ada.mutation(store.add, { title: 'Weather', text: 'In the strip it always rains on Tuesdays.' })
    await ada.mutation(store.add, { title: 'Flight', text: 'The fox learned to fly with a kite.' })
    await drain(t)
    expect(await refusal(ada.action(store.search, { query: '   ' }))).toMatchObject({ code: 'invalid_input', data: { field: 'query' } })
    expect((await ada.action(store.search, { query: 'rain', limit: 0 })).passages).toHaveLength(1)
  })

  test('whose embedding fails gives its reservation back and says why', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    await ada.mutation(store.add, { title: 'Weather', text: 'In the strip it always rains on Tuesdays.' })
    await drain(t)
    const before = await balanceOf(t, ada.workspaceId!)
    const charged = provider.charges.length
    await withEmbedding(async () => {
      throw new Error('The embedding model is down.')
    }, async () => {
      await expect(ada.action(store.search, { query: 'when does it rain' })).rejects.toThrow(/The embedding model is down/)
    })
    expect(await balanceOf(t, ada.workspaceId!)).toBe(before)
    expect(provider.charges).toHaveLength(charged)
  })
})

describe('a free store', () => {
  test('adds, finds and fails without touching any balance', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 10)
    const freeStore = storeRefs('free')
    const documentId = await ada.mutation(freeStore.add, { title: 'Weather', text: 'In the strip it always rains on Tuesdays.' })
    await drain(t)
    expect((await ada.query(freeStore.documents, { paginationOpts: firstPage })).page[0]).toMatchObject({ id: documentId, status: 'ready' })
    expect((await ada.action(freeStore.search, { query: 'when does it rain' })).passages[0]).toMatchObject({ document: { id: documentId } })
    // An upload that is no text fails, and nothing is released or charged: nothing was held.
    const storageId = await upload(t, ada, 'GIF89a', 'image/gif')
    await ada.mutation(freeStore.add, { title: 'A picture', storageId })
    await drain(t)
    await withEmbedding(async () => {
      throw new Error('The embedding model is down.')
    }, async () => {
      await expect(ada.action(freeStore.search, { query: 'rain' })).rejects.toThrow(/down/)
    })
    expect(await balanceOf(t, ada.workspaceId!)).toBe(10)
    expect(provider.charges).toEqual([])
  })
})

describe('knowledge.add from server code', () => {
  test('fills a workspace\'s own namespace, charging no one, and its members find it', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    const { documentId } = await t.action(publishRef, { namespace: ada.workspaceId!, title: 'Onboarding', text: 'Your workspace was set up by the team on Monday.' })
    expect(await balanceOf(t, ada.workspaceId!)).toBe(100)
    expect((await ada.query(store.documents, { paginationOpts: firstPage })).page).toEqual([expect.objectContaining({ id: documentId, status: 'ready', addedBy: '' })])
    expect((await ada.action(store.search, { query: 'who set up the workspace' })).passages[0]).toMatchObject({ document: { id: documentId, title: 'Onboarding' } })
  })

  test('throws once an embedding fails, the document reading failed', async () => {
    const t = testApp()
    await withEmbedding(async () => {
      throw new Error('The embedding model is down.')
    }, async () => {
      expect(await refusal(t.action(publishRef, { namespace: '', title: 'Help', text: 'Open Settings.' }))).toMatchObject({ code: 'unavailable', data: { service: 'ai', reason: 'provider_refused' } })
    })
    // An empty namespace is the app's own.
    const listed = await t.query(backend.ai.listDocuments as unknown as FunctionReference<'query'>, { store: 'openai/text-embedding-3-small@1536', owner: 'app', paginationOpts: firstPage }) as Page<{ status: string }>
    expect(listed.page).toEqual([expect.objectContaining({ status: 'failed' })])
  })
})
