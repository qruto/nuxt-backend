/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { StreamId, StreamWriter } from '@convex-dev/persistent-text-streaming'
import { componentsGeneric, createFunctionHandle, defineSchema, type FunctionReference, type GenericActionCtx, type GenericDataModel, httpRouter, internalActionGeneric, internalMutationGeneric, makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'
import { generateText, streamText } from 'ai'
import { MockEmbeddingModelV4, MockLanguageModelV4 } from 'ai/test'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { IMPERSONATED_BY_CLAIM } from '../../src/convex/constants'
import { backendError, getBackendError } from '../../src/convex/errors'
import { setupAi } from '../../src/convex/integrations/ai'
import type { Billing } from '../../src/convex/integrations/billing'
import { setupRateLimiter } from '../../src/convex/integrations/rate-limit'
import { TEST_MODEL_USD, testEmbeddingModel, testModel } from '../../src/convex/test-models'

// ai.chat and ai.knowledge end to end, the way backend/chat.ts and
// backend/knowledge.ts use them: a send reserves the reply's estimate in the
// same transaction that saves the message, the reply streams into the
// thread on the Agent component and settles at what the model reported; a
// document is embedded into its workspace's namespace on the RAG component
// and found by meaning. Models answer with the AI SDK's mocks (ai/test),
// installed by nuxt-backend/test.

// The first test loads the Agent and RAG components' modules.
vi.setConfig({ testTimeout: 30_000 })

// The streaming component's writer, run to its end before the response goes
// back, so a test reads what a metered stream did: the real one runs it
// behind the response, unawaited.
vi.mock('@convex-dev/persistent-text-streaming', async (importOriginal) => {
  const original = await importOriginal<typeof import('@convex-dev/persistent-text-streaming')>()
  class Awaited extends original.PersistentTextStreaming {
    override async stream<A extends GenericActionCtx<GenericDataModel>>(ctx: A, request: Request, streamId: StreamId, writer: StreamWriter<A>) {
      const appended: string[] = []
      try {
        await writer(ctx, request, streamId, async (text) => {
          appended.push(text)
        })
      }
      catch (error) {
        return new Response(getBackendError(error)?.code ?? 'error', { status: 500 })
      }
      return new Response(appended.join(''))
    }
  }
  return { ...original, PersistentTextStreaming: Awaited }
})

const METER_ID = 'm1'
const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'>, agent: never, rag: never, rateLimiter: never, persistentTextStreaming: never }
const backend = components.backend

/** What the fake billing provider was asked to do. */
const provider = { charges: [] as Array<{ externalId: string, finalAmount?: number, metadata?: Record<string, unknown> }> }

/** The members who manage their workspace (its owners and admins). */
const managers = new Set<string>()

// A billing stand-in over the component's real credit cache, as the jobs test has it.
const billing = {
  requireEntity: async (ctx: { auth: { getUserIdentity: () => Promise<Record<string, unknown> | null> } }, rule: { access?: string, impersonation?: string } = {}) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw backendError('unauthenticated', {})
    if (rule.impersonation === 'refused' && typeof identity[IMPERSONATED_BY_CLAIM] === 'string') throw backendError('forbidden', { reason: 'impersonating' })
    if (rule.access === 'manage' && !managers.has(identity.subject as string)) throw backendError('forbidden', { reason: 'not_billing_manager' })
    return { userId: identity.activeOrganizationId as string, email: identity.email as string }
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
// No release timer: draining the scheduler runs every timer at once, the reservation's backstop included.
const ai = setupAi(components as never, { billing, rateLimiter, model: 'anthropic/claude-sonnet-4.5', streamTimeout: false })

const knowledge = ai.knowledge({
  model: 'openai/text-embedding-3-small',
  dimension: 1536,
  meter: 'credits',
  cost: { add: ({ characters }) => Math.ceil(characters / 20_000), search: 1 },
})

const helper = ai.chat({
  name: 'helper',
  instructions: 'You help people plan comic strips.',
  meter: 'credits',
  cost: { estimate: 20, creditsPerUsd: 1000, round: 'up', minimum: 1 },
  knowledge,
})

const moderated = ai.chat({ name: 'moderated', meter: 'credits', cost: 5, moderate: true })

const guide = ai.chat({ name: 'guide', billTo: 'app', model: 'openai/gpt-5-mini', instructions: 'You answer questions about this app.' })

// A metered action and a stream, each settled at what the model reported, as the job queue's steps are.
const summarize = ai.meteredAction({
  meter: 'credits',
  cost: { estimate: 20, creditsPerUsd: 1000, round: 'up', minimum: 1 },
  args: { text: v.string(), fail: v.optional(v.boolean()) },
  handler: async (ctx, { text, fail }) => {
    const { text: summary } = await generateText({ model: ctx.model(), prompt: text })
    // The model answered, and was paid for, before the run failed.
    if (fail) throw new Error('The summary could not be saved.')
    return summary
  },
})
const story = ai.stream({
  name: 'story',
  meter: 'credits',
  cost: { estimate: 20, creditsPerUsd: 1000, round: 'up', minimum: 1 },
  args: { prompt: v.string() },
  handler: async (ctx, { prompt }, { append }) => {
    for await (const chunk of streamText({ model: ctx.model(), prompt }).textStream) await append(chunk)
    return null
  },
})
const http = httpRouter()
http.route({ path: '/ai/stream', method: 'POST', handler: ai.httpHandler })

const publishArticle = internalActionGeneric({
  args: { slug: v.string(), title: v.string(), text: v.string() },
  handler: async (ctx, { slug, title, text }) => knowledge.add(ctx, { namespace: 'app', key: slug, title, text }),
})

// A component's delete that fails: what an erasure must ride out.
const failingDelete = internalMutationGeneric({
  args: { threadId: v.optional(v.string()), entryId: v.optional(v.string()), startOrder: v.optional(v.number()) },
  handler: async () => {
    throw new Error('The component is down.')
  },
})

const testApp = defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './chat.js': () => Promise.resolve(helper),
  './guide.js': () => Promise.resolve(guide),
  './moderated.js': () => Promise.resolve(moderated),
  './knowledge.js': () => Promise.resolve(knowledge.api),
  './help.js': () => Promise.resolve({ publishArticle }),
  './writing.js': () => Promise.resolve({ summarize, startStory: story.start }),
  './http.js': () => Promise.resolve({ default: http }),
  './down.js': () => Promise.resolve({ failingDelete }),
})
type App = ReturnType<typeof testApp>

type Page<T> = { page: T[], isDone: boolean, continueCursor: string }
const firstPage = { numItems: 20, cursor: null }
const chatRefs = (module: string) => ({
  threads: makeFunctionReference<'query', Record<string, never>, Array<{ id: string, title: string, updatedAt: number }>>(`${module}:threads`),
  messages: makeFunctionReference<'query', { threadId: string, paginationOpts: typeof firstPage }, Page<{ id: string, role: string, text: string, status: string }>>(`${module}:messages`),
  send: makeFunctionReference<'mutation', { text: string, threadId?: string }, string>(`${module}:send`),
  remove: makeFunctionReference<'mutation', { threadId: string }, null>(`${module}:remove`),
})
const chat = chatRefs('chat')
const app = chatRefs('guide')
const checked = chatRefs('moderated')
const library = {
  documents: makeFunctionReference<'query', { paginationOpts: typeof firstPage }, Page<{ id: string, title: string, status: string, addedBy: string }>>('knowledge:documents'),
  add: makeFunctionReference<'mutation', { title: string, text?: string, storageId?: string, key?: string }, string>('knowledge:add'),
  search: makeFunctionReference<'action', { query: string, limit?: number }, { passages: Array<{ text: string, score: number, document: { id: string, title: string } }> }>('knowledge:search'),
  remove: makeFunctionReference<'mutation', { documentId: string }, null>('knowledge:remove'),
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

async function drain(t: App) {
  await t.finishAllScheduledFunctions(vi.runAllTimers, 200)
}

type Costs = { usd: number, runs: number, days: Array<{ day: number, usd: number, runs: number }>, people: Array<{ who: string, usd: number, input: number, runs: number }> }

/** What AI cost today, as the Costs tab reads it. */
async function costsToday(t: App): Promise<Costs> {
  return await t.query(backend.costs.summary as unknown as FunctionReference<'query'>, { since: Date.now() }) as Costs
}

const writing = {
  summarize: makeFunctionReference<'action', { text: string, fail?: boolean }, string>('writing:summarize'),
  startStory: makeFunctionReference<'action', { prompt: string }, { streamId: string }>('writing:startStory'),
}

async function refusal(call: Promise<unknown>) {
  return getBackendError(await call.then(() => null, (error: unknown) => error))
}

const rag = components.rag as unknown as { namespaces: { listNamespaceVersions: FunctionReference<'query'> }, entries: { list: FunctionReference<'query'> } }

/** The versions of a namespace the RAG component holds. */
async function ragNamespaces(t: App, namespace: string) {
  return (await t.query(rag.namespaces.listNamespaceVersions, { namespace, paginationOpts: firstPage }) as Page<{ namespaceId: string }>).page
}

/** The RAG component's entries in a namespace, every version of it, by status. */
async function ragEntries(t: App, namespace: string, status: 'pending' | 'ready' | 'replaced') {
  const versions = { page: await ragNamespaces(t, namespace) }
  const pages = await Promise.all(versions.page.map(async version => await t.query(rag.entries.list, { namespaceId: version.namespaceId, status, paginationOpts: firstPage }) as Page<{ entryId: string }>))
  return pages.flatMap(page => page.page)
}

/** The page as `useChat` shows it: oldest first. */
async function thread(user: { query: App['query'] }, threadId: string, refs = chat) {
  return [...(await user.query(refs.messages, { threadId, paginationOpts: firstPage })).page].reverse()
}

const TEST_MODELS = Symbol.for('nuxt-backend.testModels')
const TEST_EMBEDDING_MODELS = Symbol.for('nuxt-backend.testEmbeddingModels')
let original: unknown

/** Run `body` with the mock embedding model's `doEmbed` wrapped: `wrap` gets each call and the mock's own. */
async function withEmbedding(wrap: (options: Parameters<MockEmbeddingModelV4['doEmbed']>[0], doEmbed: MockEmbeddingModelV4['doEmbed']) => ReturnType<MockEmbeddingModelV4['doEmbed']>, body: () => Promise<void>) {
  const previous = (globalThis as Record<symbol, unknown>)[TEST_EMBEDDING_MODELS]
  ;(globalThis as Record<symbol, unknown>)[TEST_EMBEDDING_MODELS] = (id: string, dimension: number) => {
    const model = testEmbeddingModel(id, dimension) as MockEmbeddingModelV4
    const doEmbed = model.doEmbed.bind(model)
    model.doEmbed = async options => wrap(options, doEmbed)
    return model
  }
  try {
    await body()
  }
  finally {
    ;(globalThis as Record<symbol, unknown>)[TEST_EMBEDDING_MODELS] = previous
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  provider.charges.length = 0
  managers.clear()
  original = (globalThis as Record<symbol, unknown>)[TEST_MODELS]
})

afterEach(() => {
  ;(globalThis as Record<symbol, unknown>)[TEST_MODELS] = original
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('a chat the workspace pays for', () => {
  test('reserves the estimate with the message, streams the reply into the thread and settles at what the model cost', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)

    const threadId = await ada.mutation(chat.send, { text: 'Plan a strip about a fox who wants to fly' })
    // Held at once, in the transaction that saved the message.
    expect(await balanceOf(t, ada.workspaceId!)).toBe(80)
    expect((await thread(ada, threadId))[0]).toMatchObject({ role: 'user', text: 'Plan a strip about a fox who wants to fly', status: 'done' })

    await drain(t)

    expect(await thread(ada, threadId)).toEqual([
      expect.objectContaining({ role: 'user', text: 'Plan a strip about a fox who wants to fly', status: 'done' }),
      expect.objectContaining({ role: 'assistant', text: 'Test reply to: Plan a strip about a fox who wants to fly', status: 'done' }),
    ])
    // $0.001 at 1000 credits a dollar: 1 credit, the rest of the 20 handed back. The
    // workspace has no library yet, so the knowledge search embedded nothing.
    expect(provider.charges).toEqual([expect.objectContaining({ finalAmount: 1, metadata: expect.objectContaining({ chat: 'helper', userId: ada.userId }) })])
    expect(await balanceOf(t, ada.workspaceId!)).toBe(99)
    expect(await ada.query(chat.threads, {})).toEqual([{ id: threadId, title: 'Plan a strip about a fox who wants to fly', updatedAt: expect.any(Number) }])
  })

  test('continues a thread, with its last messages as the reply\'s context', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    const prompts: string[] = []
    ;(globalThis as Record<symbol, unknown>)[TEST_MODELS] = (id: string) => {
      const model = testModel(id) as unknown as MockLanguageModelV4
      const doStream = model.doStream.bind(model)
      model.doStream = async (options) => {
        prompts.push(JSON.stringify(options.prompt))
        return doStream(options)
      }
      return model
    }

    const threadId = await ada.mutation(chat.send, { text: 'A fox' })
    await drain(t)
    expect(await ada.mutation(chat.send, { text: 'Make it rain', threadId })).toBe(threadId)
    await drain(t)

    expect((await thread(ada, threadId)).map(message => message.text)).toEqual(['A fox', 'Test reply to: A fox', 'Make it rain', 'Test reply to: Make it rain'])
    expect(prompts[1]).toContain('A fox')
    expect(prompts[1]).toContain('You help people plan comic strips.')
    expect(await ada.query(chat.threads, {})).toHaveLength(1)
  })

  test('shows the reply as it is written, from the deltas the Agent component saves', async () => {
    vi.useRealTimers()
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    let finish!: () => void
    const finished = new Promise<void>((resolve) => {
      finish = resolve
    })
    ;(globalThis as Record<symbol, unknown>)[TEST_MODELS] = (id: string) => new MockLanguageModelV4({
      provider: 'test',
      modelId: id,
      doStream: async () => ({
        stream: new ReadableStream({
          async start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] })
            controller.enqueue({ type: 'text-start', id: 'text' })
            controller.enqueue({ type: 'text-delta', id: 'text', delta: 'Once upon a time. ' })
            await finished
            controller.enqueue({ type: 'text-delta', id: 'text', delta: 'The end.' })
            controller.enqueue({ type: 'text-end', id: 'text' })
            controller.enqueue({ type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } }, providerMetadata: { gateway: { cost: '0.001' } } })
            controller.close()
          },
        }),
      }),
    })

    const threadId = await ada.mutation(chat.send, { text: 'Tell me a story' })
    let reply: { text: string, status: string } | undefined
    for (let tries = 0; tries < 60 && !reply?.text; tries++) {
      await new Promise(resolve => setTimeout(resolve, 50))
      reply = (await thread(ada, threadId)).find(message => message.role === 'assistant')
    }
    expect(reply).toMatchObject({ text: 'Once upon a time. ', status: 'streaming' })

    finish()
    await t.finishInProgressScheduledFunctions()
    expect((await thread(ada, threadId)).at(-1)).toMatchObject({ role: 'assistant', text: 'Once upon a time. The end.', status: 'done' })
  })

  test('refuses a message the balance cannot cover, before the thread is made', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 5)

    expect(await refusal(ada.mutation(chat.send, { text: 'Too dear' }))).toMatchObject({ code: 'insufficient_credits', data: { balance: 5, need: 20 } })
    expect(await ada.query(chat.threads, {})).toEqual([])
    expect(await balanceOf(t, ada.workspaceId!)).toBe(5)
  })

  test('a reply that fails releases the whole reservation and reads failed', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    ;(globalThis as Record<symbol, unknown>)[TEST_MODELS] = (id: string) => new MockLanguageModelV4({
      provider: 'test',
      modelId: id,
      doStream: async () => {
        throw new Error('503 Service Unavailable')
      },
    })

    const threadId = await ada.mutation(chat.send, { text: 'Hello?' })
    await drain(t)

    expect(provider.charges).toEqual([])
    expect(await balanceOf(t, ada.workspaceId!)).toBe(100)
    const messages = await thread(ada, threadId)
    expect(messages[0]).toMatchObject({ role: 'user', text: 'Hello?' })
    expect(messages[1]).toMatchObject({ role: 'assistant', status: 'failed' })
  })

  test('a reply whose model fails after the library search answered still costs nothing', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await ada.mutation(library.add, { title: 'Notes', text: 'Some notes about foxes.' })
    await drain(t)
    const charged = provider.charges.length
    ;(globalThis as Record<symbol, unknown>)[TEST_MODELS] = (id: string) => new MockLanguageModelV4({
      provider: 'test',
      modelId: id,
      doStream: async () => {
        throw new Error('503 Service Unavailable')
      },
    })

    const threadId = await ada.mutation(chat.send, { text: 'Anything about foxes?' })
    await drain(t)

    expect(provider.charges).toHaveLength(charged)
    expect(await balanceOf(t, ada.workspaceId!)).toBe(99)
    expect((await thread(ada, threadId)).at(-1)).toMatchObject({ role: 'assistant', status: 'failed' })
  })

  test('a reply refused before it starts streaming still reads failed in the thread', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await ada.mutation(library.add, { title: 'Notes', text: 'Some notes.' })
    await drain(t)
    const embeddings = Symbol.for('nuxt-backend.testEmbeddingModels')
    const previous = (globalThis as Record<symbol, unknown>)[embeddings]
    ;(globalThis as Record<symbol, unknown>)[embeddings] = (id: string) => new MockEmbeddingModelV4({
      provider: 'test',
      modelId: id,
      doEmbed: async () => {
        throw new Error('The embedding model is down.')
      },
    })
    try {
      const threadId = await ada.mutation(chat.send, { text: 'Anything in my notes?' })
      await drain(t)
      expect(await thread(ada, threadId)).toEqual([
        expect.objectContaining({ role: 'user', status: 'done' }),
        expect.objectContaining({ role: 'assistant', status: 'failed' }),
      ])
    }
    finally {
      ;(globalThis as Record<symbol, unknown>)[embeddings] = previous
    }
    expect(await balanceOf(t, ada.workspaceId!)).toBe(99)
  })

  test('keeps each thread to the person who started it, in the workspace that pays', async () => {
    const t = testApp()
    const ada = await asUser(t)
    const bob = await asUser(t, { workspace: ada.workspaceId })
    await fund(t, ada.workspaceId!, 100)
    const threadId = await ada.mutation(chat.send, { text: 'Ada\'s idea' })
    await drain(t)

    // A teammate sees none of it, and cannot write in it or delete it.
    expect(await bob.query(chat.threads, {})).toEqual([])
    expect((await bob.query(chat.messages, { threadId, paginationOpts: firstPage })).page).toEqual([])
    expect(await refusal(bob.mutation(chat.send, { text: 'Mine now', threadId }))).toMatchObject({ code: 'forbidden', data: { reason: 'not_owner' } })
    expect(await refusal(bob.mutation(chat.remove, { threadId }))).toMatchObject({ code: 'forbidden', data: { reason: 'not_owner' } })
    // Another chat's threads are not this one's.
    expect(await ada.query(app.threads, {})).toEqual([])
  })

  test('lets an administrator acting as the person read the thread, never send in it', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    const threadId = await ada.mutation(chat.send, { text: 'Private plans' })
    await drain(t)
    const visiting = t.withIdentity({ subject: ada.userId, issuer: 'https://convex.test', activeOrganizationId: ada.workspaceId, [IMPERSONATED_BY_CLAIM]: 'admin-1' })

    expect(await visiting.query(chat.threads, {})).toHaveLength(1)
    expect(await thread(visiting, threadId)).toHaveLength(2)
    expect(await refusal(visiting.mutation(chat.send, { text: 'Hi', threadId }))).toMatchObject({ code: 'forbidden', data: { reason: 'impersonating' } })
  })

  test('deletes a thread with its messages', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    const threadId = await ada.mutation(chat.send, { text: 'Throwaway' })
    await drain(t)

    await ada.mutation(chat.remove, { threadId })
    await drain(t)

    expect(await ada.query(chat.threads, {})).toEqual([])
    expect((await ada.query(chat.messages, { threadId, paginationOpts: firstPage })).page).toEqual([])
  })

  test('refuses an empty message', async () => {
    const t = testApp()
    const ada = await asUser(t)
    expect(await refusal(ada.mutation(chat.send, { text: '   ' }))).toMatchObject({ code: 'invalid_input', data: { field: 'text' } })
  })
})

describe('a chat that checks each message', () => {
  test('a flagged message gets no reply, its reservation goes back, and it leaves the thread and the next reply\'s context', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const prompts: string[] = []
    ;(globalThis as Record<symbol, unknown>)[TEST_MODELS] = (id: string) => /llama-guard/.test(id)
      ? new MockLanguageModelV4({
          provider: 'test',
          modelId: id,
          doGenerate: async ({ prompt }) => {
            const text = JSON.stringify(prompt)
            return { content: [{ type: 'text', text: text.includes('BAD') ? 'unsafe\nS10' : 'safe' }], finishReason: { unified: 'stop', raw: 'stop' }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } }, warnings: [] }
          },
        })
      : new MockLanguageModelV4({
          provider: 'test',
          modelId: id,
          doStream: async (options) => {
            prompts.push(JSON.stringify(options.prompt))
            return (testModel(id) as unknown as MockLanguageModelV4).doStream(options)
          },
        })

    const threadId = await ada.mutation(checked.send, { text: 'Something BAD' })
    expect(await balanceOf(t, ada.workspaceId!)).toBe(95)
    await drain(t)
    expect(await balanceOf(t, ada.workspaceId!)).toBe(100)
    expect(provider.charges).toEqual([])
    const blocked = await thread(ada, threadId, checked)
    expect(blocked).toEqual([expect.objectContaining({ role: 'assistant', status: 'failed' })])

    await ada.mutation(checked.send, { text: 'Plan a strip about a fox', threadId })
    await drain(t)
    expect((await thread(ada, threadId, checked)).at(-1)).toMatchObject({ role: 'assistant', status: 'done' })
    expect(prompts).toHaveLength(1)
    expect(prompts[0]).not.toContain('BAD')
  })
})

describe('a chat the app pays for', () => {
  test('charges no one, and answers people in any workspace', async () => {
    const t = testApp()
    const ada = await asUser(t)
    const threadId = await ada.mutation(app.send, { text: 'How do I invite someone?' })
    await drain(t)

    expect((await thread(ada, threadId, app)).map(message => message.text)).toEqual(['How do I invite someone?', 'Test reply to: How do I invite someone?'])
    expect(provider.charges).toEqual([])
    expect(await ada.query(app.threads, {})).toHaveLength(1)
  })

  test('is refused where it is defined when setupAi has no rateLimiter to cap it', () => {
    const uncapped = setupAi(components as never, { billing, model: 'openai/gpt-5-mini' })
    expect(() => uncapped.chat({ name: 'uncapped', billTo: 'app' })).toThrow(/needs a `rateLimiter`/)
  })

  test('is refused once the app-wide aiGlobal window is spent', async () => {
    const t = testApp()
    const ada = await asUser(t)
    const limit = vi.spyOn(rateLimiter, 'limit')
    limit.mockImplementation(async (_ctx, name) => {
      if (name === 'aiGlobal') throw backendError('rate_limited', { limit: 'aiGlobal', retryAfter: 60_000 })
      return { ok: true, retryAfter: undefined } as never
    })

    expect(await refusal(ada.mutation(app.send, { text: 'Busy?' }))).toMatchObject({ code: 'rate_limited', data: { limit: 'aiGlobal' } })
    expect(limit).toHaveBeenCalledWith(expect.anything(), 'ai', { key: ada.userId, throws: true })
  })
})

describe('knowledge search', () => {
  test('embeds a document in the background, then finds it by meaning, for the workspace only', async () => {
    const t = testApp()
    const ada = await asUser(t)
    const eve = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    await fund(t, eve.workspaceId!, 100)

    const documentId = await ada.mutation(library.add, { title: 'Character notes', text: 'The fox learned to fly with a kite made of autumn leaves.' })
    expect((await ada.query(library.documents, { paginationOpts: firstPage })).page).toEqual([expect.objectContaining({ id: documentId, title: 'Character notes', status: 'pending', addedBy: ada.userId })])
    expect(await balanceOf(t, ada.workspaceId!)).toBe(99)
    await drain(t)
    expect((await ada.query(library.documents, { paginationOpts: firstPage })).page[0]).toMatchObject({ status: 'ready' })

    const { passages } = await ada.action(library.search, { query: 'how the fox learned to fly' })
    expect(passages[0]).toMatchObject({ text: expect.stringContaining('kite made of autumn leaves'), document: { id: documentId, title: 'Character notes' } })
    expect(await balanceOf(t, ada.workspaceId!)).toBe(98)

    // Another workspace finds nothing of it.
    expect((await eve.action(library.search, { query: 'how the fox learned to fly' })).passages).toEqual([])
    expect((await eve.query(library.documents, { paginationOpts: firstPage })).page).toEqual([])
  })

  test('embeds an upload: add({ storageId }) reads the file at its storage URL, embeds it on the mock model and finds it', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    const notes = '# The fox\n\nThe fox learned to fly with a kite made of autumn leaves.'
    // An upload of the workspace's, checked and ready, as setupStorage keeps one.
    const { storageId } = await t.mutation(backend.storage.store as unknown as FunctionReference<'mutation'>, {
      bytes: new TextEncoder().encode(notes).buffer,
      contentType: 'text/markdown',
      owner: { userId: ada.userId, workspaceId: ada.workspaceId },
      holder: ada.workspaceId,
      limits: {},
    }) as { storageId: string }
    const served = await t.query(backend.storage.url as unknown as FunctionReference<'query'>, { storageId }) as string
    // The embed reads the file over HTTP, as it would on a deployment: the storage URL answers with its bytes.
    const real = globalThis.fetch.bind(globalThis)
    const fetched: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url !== served) return real(input, init)
      fetched.push(url)
      return new Response(notes, { headers: { 'content-type': 'text/markdown; charset=utf-8' } })
    })

    const documentId = await ada.mutation(library.add, { title: 'Character notes', storageId })
    expect((await ada.query(library.documents, { paginationOpts: firstPage })).page).toEqual([expect.objectContaining({ id: documentId, status: 'pending' })])
    // Reserved by its size in bytes: one credit for a short file.
    expect(await balanceOf(t, ada.workspaceId!)).toBe(99)
    await drain(t)

    expect(fetched).toEqual([served])
    expect((await ada.query(library.documents, { paginationOpts: firstPage })).page[0]).toMatchObject({ id: documentId, status: 'ready' })
    // Settled at its own length.
    expect(provider.charges.at(-1)).toMatchObject({ finalAmount: 1, metadata: { knowledge: 'add' } })
    const { passages } = await ada.action(library.search, { query: 'how the fox learned to fly' })
    expect(passages[0]).toMatchObject({ text: expect.stringContaining('kite made of autumn leaves'), document: { id: documentId, title: 'Character notes' } })
  })

  test('refuses a search too long to be a question, or with a limit that is no number, before anything is reserved', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)

    expect(await refusal(ada.action(library.search, { query: 'fox '.repeat(600) }))).toMatchObject({ code: 'invalid_input', data: { field: 'query', reason: 'too_long' } })
    expect(await refusal(ada.action(library.search, { query: 'fox', limit: Number.NaN }))).toMatchObject({ code: 'invalid_input', data: { field: 'limit' } })
    expect(await balanceOf(t, ada.workspaceId!)).toBe(100)
  })

  test('refuses an upload the caller cannot read, before anything is reserved', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    const storageId = await t.run(ctx => ctx.storage.store(new Blob(['Someone else\'s notes.'], { type: 'text/plain' })))

    expect(await refusal(ada.mutation(library.add, { title: 'Not mine', storageId }))).toMatchObject({ code: 'invalid_input', data: { field: 'storageId' } })
    expect(await refusal(ada.mutation(library.add, { title: 'Both', text: 'x', storageId }))).toMatchObject({ code: 'invalid_input', data: { field: 'text' } })
    expect(await balanceOf(t, ada.workspaceId!)).toBe(100)
  })

  test('an upload that cannot be read fails the document and releases its reservation', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const documentId = await t.mutation(backend.ai.createDocument as unknown as FunctionReference<'mutation'>, { store: 'openai/text-embedding-3-small@1536', owner: ada.workspaceId, addedBy: ada.userId, title: 'Upload', characters: 0, remove: 'none', read: 'none' }) as string
    await t.mutation(backend.billing.debit as unknown as FunctionReference<'mutation'>, { userId: ada.workspaceId, meterId: METER_ID, amount: 1, externalId: 'add-1' })
    const embed = makeFunctionReference<'action', Record<string, unknown>, null>('knowledge:embed')
    // No upload to read: the storage read throws, as a broken fetch would.
    await t.action(embed, { documentId, reservation: { entityId: ada.workspaceId, externalId: 'add-1', reserved: true, meter: 'credits', meterId: METER_ID, value: 1 }, usage: { entityId: ada.workspaceId, userId: ada.userId, cost: 1 } })

    expect((await ada.query(library.documents, { paginationOpts: firstPage })).page[0]).toMatchObject({ id: documentId, status: 'failed' })
    expect(await balanceOf(t, ada.workspaceId!)).toBe(100)
  })

  test('grounds a chat reply in the workspace\'s passages, quoted apart from the instructions', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    await ada.mutation(library.add, { title: 'Weather', text: 'In the strip it always rains on Tuesdays.' })
    await drain(t)
    const prompts: string[] = []
    ;(globalThis as Record<symbol, unknown>)[TEST_MODELS] = (id: string) => {
      const model = testModel(id) as unknown as MockLanguageModelV4
      const doStream = model.doStream.bind(model)
      model.doStream = async (options) => {
        prompts.push(JSON.stringify(options.prompt))
        return doStream(options)
      }
      return model
    }

    await ada.mutation(chat.send, { text: 'When does it rain in the strip?' })
    await drain(t)

    expect(prompts[0]).toContain('always rains on Tuesdays')
    expect(prompts[0]).toContain('quoted material')
    // The search's embedding is part of the reply's cost: $0.001 + $0.00001, rounded up.
    expect(provider.charges.at(-1)).toMatchObject({ finalAmount: 2, metadata: { chat: 'helper' } })
  })

  test('settles a grounded reply at the model\'s cost when the search\'s embedding reported none', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    await ada.mutation(library.add, { title: 'Weather', text: 'In the strip it always rains on Tuesdays.' })
    await drain(t)

    await withEmbedding(async (options, doEmbed) => ({ ...await doEmbed(options), providerMetadata: undefined }), async () => {
      await ada.mutation(chat.send, { text: 'When does it rain in the strip?' })
      await drain(t)
    })

    // The model's $0.001 at 1000 credits a dollar, not the 20 reserved.
    expect(provider.charges.at(-1)).toMatchObject({ finalAmount: 1, metadata: { chat: 'helper' } })
  })

  test('lets the member who added a document remove it, and the workspace\'s managers', async () => {
    const t = testApp()
    const ada = await asUser(t)
    const bob = await asUser(t, { workspace: ada.workspaceId })
    managers.add(ada.userId)
    await fund(t, ada.workspaceId!, 100)
    const first = await bob.mutation(library.add, { title: 'Bob\'s', text: 'Bob wrote this.' })
    const second = await ada.mutation(library.add, { title: 'Ada\'s', text: 'Ada wrote this.' })
    await drain(t)

    expect(await refusal(bob.mutation(library.remove, { documentId: second }))).toMatchObject({ code: 'forbidden' })
    await bob.mutation(library.remove, { documentId: first })
    await ada.mutation(library.remove, { documentId: second })
    expect((await ada.query(library.documents, { paginationOpts: firstPage })).page).toEqual([])
  })

  test('a document removed while it was embedded leaves no passages, and costs nothing', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    let removing = ''
    await withEmbedding(async (options, doEmbed) => {
      // The member removes it while its passages are embedded.
      if (removing) await ada.mutation(library.remove, { documentId: removing })
      removing = ''
      return doEmbed(options)
    }, async () => {
      removing = await ada.mutation(library.add, { title: 'Wrong file', text: 'The secret plan of the fox.' })
      await drain(t)
    })

    expect((await ada.query(library.documents, { paginationOpts: firstPage })).page).toEqual([])
    expect(provider.charges).toEqual([])
    expect(await balanceOf(t, ada.workspaceId!)).toBe(100)
    expect((await ada.action(library.search, { query: 'the secret plan of the fox' })).passages).toEqual([])
  })

  test('an embedding that fails part of the way leaves none of its passages to find', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Long enough for the RAG component to embed it in two batches of passages.
    const text = Array.from({ length: 120 }, (_, index) => `Chapter ${index}: the fox ${'flies far over the hills '.repeat(30)}`).join('\n\n')
    let embedded = 0
    await withEmbedding(async (options, doEmbed) => {
      // The first batch of 100 passages is stored; the model fails on the next.
      embedded += options.values.length
      if (embedded > 100) throw new Error('The embedding model is down.')
      return doEmbed(options)
    }, async () => {
      await ada.mutation(library.add, { title: 'The long one', text })
      await drain(t)
    })

    expect((await ada.query(library.documents, { paginationOpts: firstPage })).page[0]).toMatchObject({ status: 'failed' })
    expect((await ada.action(library.search, { query: 'Chapter 1: the fox flies far over the hills' })).passages).toEqual([])
  })

  test('replaces the document added under the same key once the new one is ready', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    await ada.mutation(library.add, { title: 'FAQ', key: 'faq', text: 'Refunds take five days.' })
    await drain(t)
    const newer = await ada.mutation(library.add, { title: 'FAQ', key: 'faq', text: 'Refunds take two days.' })
    await drain(t)

    expect((await ada.query(library.documents, { paginationOpts: firstPage })).page.map(document => document.id)).toEqual([newer])
    const { passages } = await ada.action(library.search, { query: 'refunds days' })
    expect(passages.map(passage => passage.text)).toEqual(['Refunds take two days.'])
    // The RAG component only marks the old entry replaced: its passages are deleted too.
    expect(await ragEntries(t, ada.workspaceId!, 'replaced')).toEqual([])
    expect(await ragEntries(t, ada.workspaceId!, 'ready')).toHaveLength(1)
  })

  test('fills the app\'s own namespace from server code, charging no one', async () => {
    const t = testApp()
    const { documentId } = await t.action(makeFunctionReference<'action', { slug: string, title: string, text: string }, { documentId: string }>('help:publishArticle'), { slug: 'invites', title: 'Inviting people', text: 'Open Settings, then Members, then Invite.' })

    const listed = await t.query(backend.ai.listDocuments as unknown as FunctionReference<'query'>, { store: 'openai/text-embedding-3-small@1536', owner: 'app', paginationOpts: firstPage }) as Page<{ id: string, status: string, addedBy: string }>
    expect(listed.page).toEqual([expect.objectContaining({ id: documentId, status: 'ready', addedBy: '' })])
    expect(provider.charges).toEqual([])
  })
})

describe('what AI costs, per person', () => {
  // Every run records what its calls cost against who made it, as the job
  // queue's steps do: the Costs tab's summary and the AI spend alert read it.
  // Internal to the component: the alert's own read, called here as the alert calls it.
  const dailySpend = (backend.costs as unknown as { dailySpend: FunctionReference<'query', 'internal', { since: number, until: number }, Array<{ day: number, usd: number }>> }).dailySpend

  // Midday UTC: costs are summed per UTC day, and a run drained from just
  // before midnight would record its calls on the next one.
  beforeEach(() => {
    vi.setSystemTime(new Date().setUTCHours(12, 0, 0, 0))
  })

  test('a chat reply, a metered action and a stream each count against who made them, in the summary and the day\'s spend', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)

    await ada.mutation(chat.send, { text: 'A fox' })
    await drain(t)
    expect(await ada.action(writing.summarize, { text: 'A fox who wants to fly' })).toBe('Test reply to: A fox who wants to fly')
    const { streamId } = await ada.action(writing.startStory, { prompt: 'Once' })
    const streamed = await t.fetch('/ai/stream', { method: 'POST', body: JSON.stringify({ streamId }) })
    expect(await streamed.text()).toContain('Test reply to: Once')

    // One model call each, at the test model's cost.
    const costs = await costsToday(t)
    expect(costs).toMatchObject({ runs: 3, usd: expect.closeTo(3 * TEST_MODEL_USD, 9) })
    expect(costs.people).toEqual([expect.objectContaining({ who: ada.userId, runs: 3, usd: expect.closeTo(3 * TEST_MODEL_USD, 9), input: expect.any(Number) })])
    expect(costs.people[0]!.input).toBeGreaterThan(0)
    const today = costs.days[0]!.day
    expect(await t.query(dailySpend, { since: today, until: Date.now() })).toEqual([{ day: today, usd: expect.closeTo(3 * TEST_MODEL_USD, 9) }])
  })

  test('a failed run\'s calls count, since they were paid for; a reply no model answered records nothing', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(ada.action(writing.summarize, { text: 'A fox', fail: true })).rejects.toThrow(/could not be saved/)
    expect(await balanceOf(t, ada.workspaceId!)).toBe(100)
    ;(globalThis as Record<symbol, unknown>)[TEST_MODELS] = (id: string) => new MockLanguageModelV4({
      provider: 'test',
      modelId: id,
      doStream: async () => {
        throw new Error('503 Service Unavailable')
      },
    })
    await ada.mutation(chat.send, { text: 'Hello?' })
    await drain(t)

    expect(await costsToday(t)).toMatchObject({ runs: 1, usd: expect.closeTo(TEST_MODEL_USD, 9), people: [expect.objectContaining({ who: ada.userId, runs: 1 })] })
  })

  test('a reply the app pays for counts against who asked; the app\'s own document against the app', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await ada.mutation(app.send, { text: 'How do I invite someone?' })
    await drain(t)
    await t.action(makeFunctionReference<'action', { slug: string, title: string, text: string }, { documentId: string }>('help:publishArticle'), { slug: 'invites', title: 'Inviting people', text: 'Open Settings, then Members, then Invite.' })

    const { people } = await costsToday(t)
    expect(people).toEqual(expect.arrayContaining([
      expect.objectContaining({ who: ada.userId, runs: 1, usd: expect.closeTo(TEST_MODEL_USD, 9) }),
      expect.objectContaining({ who: 'app', runs: 1 }),
    ]))
    expect(people.find(person => person.who === 'app')!.usd).toBeGreaterThan(0)
  })

  test('a document\'s embedding and a search count against the member', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    await ada.mutation(library.add, { title: 'Character notes', text: 'The fox learned to fly with a kite made of autumn leaves.' })
    await drain(t)
    await ada.action(library.search, { query: 'how the fox learned to fly' })

    const { people } = await costsToday(t)
    expect(people).toEqual([expect.objectContaining({ who: ada.userId, runs: 2 })])
    expect(people[0]!.usd).toBeGreaterThan(0)
  })
})

describe('export and erasure', () => {
  test('an erasure deletes the account\'s threads and its workspace\'s documents, namespace and all', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await fund(t, ada.workspaceId!, 100)
    const threadId = await ada.mutation(chat.send, { text: 'Forget me' })
    await ada.mutation(library.add, { title: 'Notes', text: 'Private notes.' })
    // A document replaced under its key, and one removed: neither leaves an entry behind.
    await ada.mutation(library.add, { title: 'FAQ', key: 'faq', text: 'Refunds take five days.' })
    await drain(t)
    await ada.mutation(library.add, { title: 'FAQ', key: 'faq', text: 'Refunds take two days.' })
    await ada.mutation(library.remove, { documentId: await ada.mutation(library.add, { title: 'Draft', text: 'A draft.' }) })
    await drain(t)
    expect(await ragNamespaces(t, ada.workspaceId!)).toHaveLength(1)
    // Its export lists the documents it added, never the handles an erasure reaches them by.
    const exported = await t.query(backend.account.exportData as unknown as FunctionReference<'query'>, { userId: ada.userId }) as { knowledge: Array<Record<string, unknown>> }
    expect(exported.knowledge).toHaveLength(2)
    for (const key of ['remove', 'namespaces', 'removeNamespace']) expect(exported.knowledge.filter(document => key in document)).toEqual([])

    await t.mutation(backend.account.forget as unknown as FunctionReference<'mutation'>, { userId: ada.userId })
    await drain(t)

    expect(await t.query(backend.ai.getThread as unknown as FunctionReference<'query'>, { threadId })).toBeNull()
    // The Agent component deleted the messages through the row's handle.
    const left = await t.query((components.agent as unknown as { messages: { listMessagesByThreadId: FunctionReference<'query'> } }).messages.listMessagesByThreadId, { threadId, order: 'asc', paginationOpts: firstPage }) as Page<unknown>
    expect(left.page).toEqual([])
    const listed = await t.query(backend.ai.listDocuments as unknown as FunctionReference<'query'>, { store: 'openai/text-embedding-3-small@1536', owner: ada.workspaceId, paginationOpts: firstPage }) as Page<unknown>
    expect(listed.page).toEqual([])
    // The RAG component deleted the passages, then the namespace itself.
    expect(await ragNamespaces(t, ada.workspaceId!)).toEqual([])
  })

  test('an erasure schedules the Agent and RAG deletes, so one that fails never stops it', async () => {
    const t = testApp()
    const ada = await asUser(t)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const handle = await t.run(async () => createFunctionHandle(makeFunctionReference<'mutation'>('down:failingDelete')))
    await t.mutation(backend.ai.createThread as unknown as FunctionReference<'mutation'>, { threadId: 'thread-1', chat: 'helper', owner: ada.workspaceId, userId: ada.userId, title: 'Hello', remove: handle, read: handle })
    const documentId = await t.mutation(backend.ai.createDocument as unknown as FunctionReference<'mutation'>, { store: 'openai/text-embedding-3-small@1536', owner: ada.workspaceId, addedBy: ada.userId, title: 'Notes', characters: 5, remove: handle, read: handle }) as string
    await t.mutation(backend.ai.settleDocument as unknown as FunctionReference<'mutation'>, { documentId, status: 'ready', entryId: 'entry-1' })

    await t.mutation(backend.account.forget as unknown as FunctionReference<'mutation'>, { userId: ada.userId })
    await drain(t)

    expect(await t.query(backend.account.failedErasures as unknown as FunctionReference<'query'>, {})).toEqual([])
    expect(await t.query(backend.ai.getThread as unknown as FunctionReference<'query'>, { threadId: 'thread-1' })).toBeNull()
    expect(await t.query(backend.ai.getDocument as unknown as FunctionReference<'query'>, { documentId })).toBeNull()
  })
})
