import {
  actionGeneric,
  createFunctionHandle,
  type FunctionReference,
  type GenericActionCtx,
  type GenericDataModel,
  type GenericMutationCtx,
  type GenericQueryCtx,
  internalActionGeneric,
  makeFunctionReference,
  mutationGeneric,
  paginationOptsValidator,
  queryGeneric,
  type RegisteredAction,
  type RegisteredMutation,
  type RegisteredQuery,
} from 'convex/server'
import { v } from 'convex/values'
import type { SpendReservation } from '../billing.js'
import { BILLING_ACCESS } from '../billing/context.js'
import type { MeteredUsage, RunCtx } from './config.js'
import type { AiContext } from './context.js'
import { type AiEmbeddingModel, embeddingModelId, embeddingReachable, meteredEmbeddingModel, requireEmbeddingModel } from './embeddings.js'
import type { AiMetering } from './metering.js'
import { type ModelCall, modelRefusal } from './models.js'
import { backendError } from '../../errors.js'
import { logBackend } from '../../log.js'

// Knowledge search on Convex's RAG component (`ai.knowledge`): the component
// splits each document into passages, embeds them and runs the vector
// search; the package adds one namespace per billing entity plus the app's
// own, the metering, the membership checks, and who added what (a row in
// the backend component, which an erasure and an export reach the passages
// through). The RAG component is the app's own mount (`app.use(rag)`), an
// optional peer loaded only when a store runs.

/** A document of a knowledge store, as the page lists it. */
export interface KnowledgeDocument {
  id: string
  title: string
  /** `pending` while its passages are embedded, `ready` once it is found, `failed` when it could not be (nothing was charged). */
  status: 'pending' | 'ready' | 'failed'
  /** The member who added it; empty for the app's own. */
  addedBy: string
  /** When it was added, in ms. */
  createdAt: number
}

/** One passage a search found. */
export interface KnowledgePassage {
  text: string
  /** How close it is to the question, from 0 to 1. */
  score: number
  document: { id: string, title: string }
}

/** What adding a document costs, from the length of the text it embeds. */
export type KnowledgeAddCost = number | ((document: { characters: number }) => number)

/** What `ai.knowledge` takes. */
export interface KnowledgeConfig {
  /** The embedding model: a `provider/model` id from the gateway's model list, or an AI SDK embedding model of your own. */
  model: AiEmbeddingModel
  /** The length of the model's vectors: `1536` for `openai/text-embedding-3-small`. */
  dimension: number
  /** The credit meter adding and searching are charged to; `false` makes both free. */
  meter: string | false
  /** What adding and searching cost, in credits. Default `{ add: 1, search: 1 }`. */
  cost?: { add?: KnowledgeAddCost, search?: number }
  /** The named rate limit adding and searching count against. Default `'ai'`; `false` disables it. */
  limit?: string | false
}

/** The functions a page calls, and the embedding `add` schedules: export each from the store's module, by these names. */
export interface KnowledgeApi {
  /** The active workspace's documents, newest first, paginated. */
  documents: RegisteredQuery<'public', { paginationOpts: { numItems: number, cursor: string | null } }, Promise<{ page: KnowledgeDocument[], isDone: boolean, continueCursor: string }>>
  /** Add a document from `{ title, text }` or `{ title, storageId }`, optionally under a `key` that replaces the older one, and return its id. */
  add: RegisteredMutation<'public', { title: string, text?: string, storageId?: string, key?: string }, Promise<string>>
  /** Search the active workspace's documents for `{ query, limit? }`. */
  search: RegisteredAction<'public', { query: string, limit?: number }, Promise<{ passages: KnowledgePassage[] }>>
  /** Remove a document: the member who added it, or the workspace's owners and admins. */
  remove: RegisteredMutation<'public', { documentId: string }, Promise<null>>
  /** The embedding `add` schedules, by this name next to itself. Internal. */
  embed: RegisteredAction<'internal', Record<string, unknown>, Promise<null>>
}

/** What the store's internals hand a chat. */
export const KNOWLEDGE_SEARCH = Symbol.for('nuxt-backend.knowledgeSearch')

/** A knowledge store: its `api`, and `add` for your server code. */
export interface Knowledge {
  api: KnowledgeApi
  /**
   * Add a document from server code, charging no one: to the app's own
   * namespace (`'app'`), which chats the app pays for search, or to a
   * billing entity's by its id. Embeds at once, in this action. A `key`
   * replaces the document added under it before.
   */
  add: (ctx: GenericActionCtx<GenericDataModel>, document: { namespace: string, title: string, text: string, key?: string }) => Promise<{ documentId: string }>
  /**
   * The embedding model's id.
   *
   * @internal
   */
  readonly modelId: string
  /**
   * Whether this deployment can reach the embedding model.
   *
   * @internal
   */
  reachable: () => boolean
  /**
   * Search one namespace for a chat's reply, the embedding's cost recorded into `calls`.
   *
   * @internal
   */
  [KNOWLEDGE_SEARCH]: (ctx: GenericActionCtx<GenericDataModel>, search: { namespace: string, query: string, limit: number, calls: ModelCall[] }) => Promise<KnowledgePassage[]>
}

/** The longest document text, in characters. */
export const KNOWLEDGE_TEXT_MAX = 500_000

/** The longest title, in characters. */
const TITLE_MAX = 200

/** The most passages one search returns. */
const SEARCH_LIMIT_MAX = 20

/** The longest search, in characters: a question, never a document. */
const KNOWLEDGE_QUERY_MAX = 2_000

/** The owner of the app's own namespace. */
const APP_NAMESPACE = 'app'

/** The pending entries of a namespace a failed add looks through for its own: the newest, of the few embedding at once. */
const PENDING_ENTRIES = 100

type QueryCtx = GenericQueryCtx<GenericDataModel>
type MutationCtx = GenericMutationCtx<GenericDataModel>
type ActionCtx = GenericActionCtx<GenericDataModel>

interface DocumentRow {
  id: string
  store: string
  owner: string
  addedBy: string
  title: string
  key?: string
  status: KnowledgeDocument['status']
  entryId?: string
  characters: number
  createdAt: number
}

/** The backend component's document rows, as a store reaches them. */
interface DocumentRefs {
  createDocument: FunctionReference<'mutation', 'internal', { store: string, owner: string, addedBy: string, title: string, key?: string, characters: number, remove: string, read: string, namespaces: string, removeNamespace: string }, string>
  getDocument: FunctionReference<'query', 'internal', { documentId: string }, DocumentRow | null>
  settleDocument: FunctionReference<'mutation', 'internal', { documentId: string, status: 'ready' | 'failed', entryId?: string }, { replaced: string[] } | null>
  listDocuments: FunctionReference<'query', 'internal', { store: string, owner: string, paginationOpts: { numItems: number, cursor: string | null } }, { page: DocumentRow[], isDone: boolean, continueCursor: string }>
  deleteDocument: FunctionReference<'mutation', 'internal', { documentId: string }, null>
}

interface StorageRefs {
  url: FunctionReference<'query', 'internal', { storageId: string, userId?: string }, string | null>
  served: FunctionReference<'query', 'internal', { storageId: string }, { url: string, contentType: string, size: number } | null>
}

/** The RAG component's functions a store calls directly. */
interface RagRefs {
  entries: { deleteAsync: FunctionReference<'mutation', 'internal', { entryId: string, startOrder: number }, null> }
  chunks: { list: FunctionReference<'query', 'internal', Record<string, unknown>, unknown> }
  namespaces: {
    listNamespaceVersions: FunctionReference<'query', 'internal', Record<string, unknown>, unknown>
    deleteNamespaceSync: FunctionReference<'action', 'internal', { namespaceId: string }, null>
  }
}

type RagModule = typeof import('@convex-dev/rag')

/** The RAG component's client, or the refusal that says to install it. */
async function loadRag(): Promise<RagModule> {
  try {
    return await import('@convex-dev/rag')
  }
  catch (error) {
    throw backendError(
      'unavailable',
      { service: 'ai', reason: 'not_configured' },
      `[nuxt-backend] ai.knowledge needs Convex's RAG component: \`pnpm add @convex-dev/rag\`, then \`app.use(rag)\` in backend/convex.config.ts. (${error instanceof Error ? error.message : String(error)})`,
    )
  }
}

/** A credit amount a cost option gives, checked where the store is defined or the document is added. */
function creditsOf(cost: KnowledgeAddCost | undefined, characters: number): number {
  if (cost === undefined) return 1
  return typeof cost === 'function' ? cost({ characters }) : cost
}

/** A title, checked: non-empty, at most {@link TITLE_MAX} characters. */
function requireTitle(title: string): string {
  const trimmed = title.trim()
  if (!trimmed || trimmed.length > TITLE_MAX) throw backendError('invalid_input', { field: 'title', ...(trimmed ? { reason: 'too_long' } : {}) }, `[nuxt-backend] A document needs a title of at most ${TITLE_MAX} characters.`)
  return trimmed
}

/** A document's text, checked: non-empty, at most {@link KNOWLEDGE_TEXT_MAX} characters. */
function requireText(text: string, field: 'text' | 'storageId'): string {
  if (!text.trim()) throw backendError('invalid_input', { field, reason: 'empty' }, '[nuxt-backend] A document needs some text.')
  if (text.length > KNOWLEDGE_TEXT_MAX) throw backendError('invalid_input', { field, reason: 'too_long' }, `[nuxt-backend] A document is at most ${KNOWLEDGE_TEXT_MAX} characters.`)
  return text
}

/** Whether a content type is text the store reads: plain text and Markdown. */
function isText(contentType: string | null): boolean {
  const type = (contentType ?? '').split(';')[0]!.trim().toLowerCase()
  return type === 'text/plain' || type === 'text/markdown' || type === 'text/x-markdown'
}

/** An upload's text, or why it cannot be read as a document: a read that throws, such as a fetch the network broke, is one reason. */
async function uploadText(ctx: ActionCtx, storage: StorageRefs, storageId: string): Promise<{ text: string } | { refused: string }> {
  try {
    const url = await ctx.runQuery(storage.url, { storageId })
    // fallow-ignore-next-line security-sink -- the URL is the deployment's own file storage URL for an upload the component holds (storage.url), never request input; verified 2026-10-28
    const response = url ? await fetch(url) : null
    if (!response?.ok || !isText(response.headers.get('content-type'))) return { refused: 'the upload is no plain text or Markdown file' }
    const text = await response.text()
    return !text.trim() || text.length > KNOWLEDGE_TEXT_MAX ? { refused: 'the upload is empty or too long' } : { text }
  }
  catch {
    return { refused: 'the upload could not be read' }
  }
}

/** Build `ai.knowledge`. */
export function createKnowledge(context: AiContext, metering: AiMetering, ragComponent: unknown, storage: StorageRefs) {
  const { config, billing, recordCost } = context
  const { prepare, closeSpend, armRelease } = metering
  const rows = context.requests as unknown as DocumentRefs
  const ragRefs = ragComponent as RagRefs

  const knowledge = (definition: KnowledgeConfig): Knowledge => {
    requireEmbeddingModel(definition.model, 'ai.knowledge')
    const { dimension } = definition
    if (!(Number.isInteger(dimension) && dimension > 0)) throw new Error('[nuxt-backend] ai.knowledge: `dimension` is the length of the model\'s vectors, such as 1536.')
    if (definition.meter === undefined) throw new Error('[nuxt-backend] ai.knowledge: name the credit `meter` adding and searching are charged to, or `meter: false` to make them free.')
    const searchCost = definition.cost?.search ?? 1
    const modelId = embeddingModelId(definition.model)
    const store = `${modelId}@${dimension}`
    const region = config.inferenceRegion

    /** The store's RAG client, its model recording into `calls`. */
    const ragFor = async (calls: ModelCall[]) => {
      const { RAG } = await loadRag()
      const textEmbeddingModel = await meteredEmbeddingModel(definition.model, calls, { region, dimension })
      return new RAG(ragComponent as never, { textEmbeddingModel: textEmbeddingModel as never, embeddingDimension: dimension })
    }

    const requireReachable = () => {
      if (!embeddingReachable(definition.model, region)) throw modelRefusal({ id: modelId, ...(region ? { region } : {}) })
    }

    /** The caller's billing entity: a member's, for reading; one who acts in person, for writing. */
    const entityFor = async (ctx: QueryCtx | MutationCtx | ActionCtx, access: 'read' | 'write') => {
      const identity = await ctx.auth.getUserIdentity()
      if (!identity) {
        if (access === 'read') return null
        throw backendError('unauthenticated', {}, '[nuxt-backend] Sign in to use the library.')
      }
      try {
        const entity = await billing.requireEntity(ctx as never, access === 'write' ? BILLING_ACCESS.spend : BILLING_ACCESS.read)
        return { userId: identity.subject, owner: entity.userId }
      }
      catch (error) {
        if (access === 'read') return null
        throw error
      }
    }

    /**
     * What a failed add left of a document: the entry it made in the
     * namespace, still pending with the passages embedded so far, which a
     * search would find and no row reaches.
     */
    const dropPartial = async (ctx: ActionCtx, rag: Awaited<ReturnType<typeof ragFor>>, row: { documentId: string, owner: string }) => {
      try {
        const namespace = await rag.getNamespace(ctx as never, { namespace: row.owner })
        if (!namespace) return
        const pending = await rag.list(ctx as never, { namespaceId: namespace.namespaceId, status: 'pending', order: 'desc', limit: PENDING_ENTRIES })
        for (const entry of pending.page) {
          if ((entry.metadata as { documentId?: unknown } | undefined)?.documentId === row.documentId) await ctx.runMutation(ragRefs.entries.deleteAsync, { entryId: entry.entryId, startOrder: 0 })
        }
      }
      catch {
        // Best effort: the failure that left it is logged already.
      }
    }

    /**
     * Embed one document's text into its namespace, and mark it ready (or
     * failed). Returns whether it is ready: one removed while it was
     * embedded is not, and its passages go too.
     */
    const embedDocument = async (ctx: ActionCtx, row: { documentId: string, owner: string, title: string, key?: string }, text: string, calls: ModelCall[]): Promise<boolean> => {
      let rag: Awaited<ReturnType<typeof ragFor>> | undefined
      try {
        rag = await ragFor(calls)
        const { entryId } = await rag.add(ctx as never, {
          namespace: row.owner,
          ...(row.key === undefined ? {} : { key: row.key }),
          title: row.title,
          text,
          metadata: { documentId: row.documentId },
        })
        if (await ctx.runMutation(rows.settleDocument, { documentId: row.documentId, status: 'ready', entryId })) return true
        await ctx.runMutation(ragRefs.entries.deleteAsync, { entryId, startOrder: 0 })
        return false
      }
      catch (error) {
        logBackend('warn', 'ai.knowledge_embed_failed', 'A knowledge document could not be embedded; it reads failed and its reservation was released.', error)
        if (rag) await dropPartial(ctx, rag, row)
        await ctx.runMutation(rows.settleDocument, { documentId: row.documentId, status: 'failed' })
        return false
      }
    }

    /** Record a document's row with the handles an erasure and an export reach its passages and its namespace by. */
    const createRow = async (ctx: MutationCtx | ActionCtx, document: { owner: string, addedBy: string, title: string, key?: string, characters: number }) => ctx.runMutation(rows.createDocument, {
      store,
      ...document,
      remove: await createFunctionHandle(ragRefs.entries.deleteAsync),
      read: await createFunctionHandle(ragRefs.chunks.list),
      namespaces: await createFunctionHandle(ragRefs.namespaces.listNamespaceVersions),
      removeNamespace: await createFunctionHandle(ragRefs.namespaces.deleteNamespaceSync),
    })

    const documents = queryGeneric({
      args: { paginationOpts: paginationOptsValidator },
      handler: async (ctx, { paginationOpts }) => {
        const caller = await entityFor(ctx, 'read')
        if (!caller) return { page: [], isDone: true, continueCursor: '' }
        const listed = await ctx.runQuery(rows.listDocuments, { store, owner: caller.owner, paginationOpts })
        return { ...listed, page: listed.page.map(row => ({ id: row.id, title: row.title, status: row.status, addedBy: row.addedBy, createdAt: row.createdAt })) }
      },
    })

    const add = mutationGeneric({
      args: { title: v.string(), text: v.optional(v.string()), storageId: v.optional(v.string()), key: v.optional(v.string()) },
      handler: async (ctx, args): Promise<string> => {
        const title = requireTitle(args.title)
        if ((args.text === undefined) === (args.storageId === undefined)) throw backendError('invalid_input', { field: 'text' }, '[nuxt-backend] Add a document from `text` or from an upload\'s `storageId`, one of them.')
        const text = args.text === undefined ? undefined : requireText(args.text, 'text')
        const caller = (await entityFor(ctx, 'write'))!
        // An upload is the caller's own, or their workspace's, and passed its checks.
        if (args.storageId !== undefined && !await ctx.runQuery(storage.url, { storageId: args.storageId, userId: caller.userId })) {
          throw backendError('invalid_input', { field: 'storageId' }, '[nuxt-backend] That upload is not one you can read, or it is still being checked.')
        }
        requireReachable()
        // An upload's length is known once it is read: it reserves by its size in bytes (never fewer than its characters), and settles at its own.
        const upload = args.storageId === undefined ? null : await ctx.runQuery(storage.served, { storageId: args.storageId })
        const characters = text?.length ?? Math.min(upload?.size ?? KNOWLEDGE_TEXT_MAX, KNOWLEDGE_TEXT_MAX)
        const cost = creditsOf(definition.cost?.add, characters)
        const { usage, reservation } = await prepare(ctx as unknown as RunCtx, { meter: definition.meter, limit: definition.limit, cost, allowRefresh: false })
        const documentId = await createRow(ctx, { owner: caller.owner, addedBy: caller.userId, title, ...(args.key === undefined ? {} : { key: args.key }), characters: text?.length ?? 0 })
        const { name: self } = await ctx.meta.getFunctionMetadata()
        const embedRef = makeFunctionReference<'action'>(`${self.slice(0, self.lastIndexOf(':'))}:embed`)
        await ctx.scheduler.runAfter(0, embedRef, { documentId, ...(text === undefined ? { storageId: args.storageId } : { text }), reservation, usage })
        await armRelease(ctx as never, reservation)
        return documentId
      },
    })

    const embed = internalActionGeneric({
      args: { documentId: v.string(), text: v.optional(v.string()), storageId: v.optional(v.string()), reservation: v.any(), usage: v.any() },
      handler: async (ctx, args): Promise<null> => {
        const reservation = args.reservation as SpendReservation
        const usage = args.usage as MeteredUsage
        const metered = definition.meter !== false
        const row = await ctx.runQuery(rows.getDocument, { documentId: args.documentId })
        const fail = async (why: string) => {
          logBackend('warn', 'ai.knowledge_embed_failed', `A knowledge document could not be embedded (${why}); it reads failed and its reservation was released.`)
          if (row) await ctx.runMutation(rows.settleDocument, { documentId: args.documentId, status: 'failed' })
          if (metered) await billing.releaseSpend(ctx as never, reservation)
          return null
        }
        // Removed before it was embedded: nothing to embed, nothing to charge.
        if (!row || row.status !== 'pending') return fail('it was removed first')
        const read = args.text === undefined ? await uploadText(ctx, storage, args.storageId!) : { text: args.text }
        if ('refused' in read) return fail(read.refused)
        const { text } = read
        const calls: ModelCall[] = []
        const ready = await embedDocument(ctx, { documentId: args.documentId, owner: row.owner, title: row.title, ...(row.key === undefined ? {} : { key: row.key }) }, text, calls)
        // What the embedding cost, ready or failed, against who added it: it was paid for either way.
        await recordCost(ctx, { userId: usage.userId, owner: usage.entityId }, calls)
        if (!ready) {
          if (metered) await billing.releaseSpend(ctx as never, reservation)
          return null
        }
        if (metered) await closeSpend(ctx as never, usage, reservation, { finalAmount: creditsOf(definition.cost?.add, text.length), metadata: { knowledge: 'add' } })
        return null
      },
    })

    /** Search one namespace: the closest passages, with their documents. */
    const searchIn: Knowledge[typeof KNOWLEDGE_SEARCH] = async (ctx, { namespace, query, limit, calls }) => {
      const rag = await ragFor(calls)
      // A namespace no document was added to yet: nothing to find, and no question to embed (or pay for).
      if (!await rag.getNamespace(ctx as never, { namespace })) return []
      const found = await rag.search(ctx as never, { namespace, query, limit, vectorScoreThreshold: 0 })
      const titles = new Map(found.entries.map((entry) => {
        const documentId = (entry.metadata as { documentId?: unknown } | undefined)?.documentId
        return [entry.entryId as string, { id: typeof documentId === 'string' ? documentId : entry.entryId as string, title: entry.title ?? '' }]
      }))
      return found.results.map(result => ({
        text: result.content.map(part => part.text).join('\n'),
        score: result.score,
        document: titles.get(result.entryId as string) ?? { id: String(result.entryId), title: '' },
      }))
    }

    const search = actionGeneric({
      args: { query: v.string(), limit: v.optional(v.number()) },
      handler: async (ctx, args): Promise<{ passages: KnowledgePassage[] }> => {
        const query = args.query.trim()
        if (!query) throw backendError('invalid_input', { field: 'query' }, '[nuxt-backend] Search for something.')
        if (query.length > KNOWLEDGE_QUERY_MAX) throw backendError('invalid_input', { field: 'query', reason: 'too_long' }, `[nuxt-backend] A search is at most ${KNOWLEDGE_QUERY_MAX} characters.`)
        if (args.limit !== undefined && !Number.isFinite(args.limit)) throw backendError('invalid_input', { field: 'limit' }, `[nuxt-backend] \`limit\` is a number of passages, up to ${SEARCH_LIMIT_MAX}.`)
        const limit = Math.min(Math.max(1, Math.floor(args.limit ?? 5)), SEARCH_LIMIT_MAX)
        requireReachable()
        const { usage, reservation } = await prepare(ctx as unknown as RunCtx, { meter: definition.meter, limit: definition.limit, cost: searchCost })
        const metered = definition.meter !== false
        const calls: ModelCall[] = []
        let passages: KnowledgePassage[]
        try {
          passages = await searchIn(ctx, { namespace: usage.entityId, query, limit, calls })
        }
        catch (error) {
          if (metered) await billing.releaseSpend(ctx as never, reservation)
          throw error
        }
        finally {
          // What embedding the question cost, against who asked.
          await recordCost(ctx, { userId: usage.userId, owner: usage.entityId }, calls)
        }
        if (metered) await closeSpend(ctx as never, usage, reservation, { metadata: { knowledge: 'search' } })
        return { passages }
      },
    })

    const remove = mutationGeneric({
      args: { documentId: v.string() },
      handler: async (ctx, { documentId }): Promise<null> => {
        const caller = (await entityFor(ctx, 'write'))!
        const row = await ctx.runQuery(rows.getDocument, { documentId })
        if (!row || row.store !== store || row.owner !== caller.owner) throw backendError('forbidden', { reason: 'not_owner' }, '[nuxt-backend] This document is not in your workspace.')
        // The member who added it may; so may the workspace's owners and admins.
        if (row.addedBy !== caller.userId) await billing.requireEntity(ctx as never, { access: 'manage', impersonation: 'refused' })
        if (row.entryId) await ctx.runMutation(ragRefs.entries.deleteAsync, { entryId: row.entryId, startOrder: 0 })
        await ctx.runMutation(rows.deleteDocument, { documentId })
        return null
      },
    })

    const addFromServer: Knowledge['add'] = async (ctx, document) => {
      const title = requireTitle(document.title)
      const text = requireText(document.text, 'text')
      const namespace = document.namespace || APP_NAMESPACE
      const documentId = await createRow(ctx, { owner: namespace, addedBy: '', title, ...(document.key === undefined ? {} : { key: document.key }), characters: text.length })
      const calls: ModelCall[] = []
      const ready = await embedDocument(ctx, { documentId, owner: namespace, title, ...(document.key === undefined ? {} : { key: document.key }) }, text, calls)
      // The app's own document: its cost counts against the namespace it went to.
      await recordCost(ctx, { owner: namespace }, calls)
      if (!ready) throw backendError('unavailable', { service: 'ai', reason: 'provider_refused' }, '[nuxt-backend] knowledge.add: the document could not be embedded; it reads failed.')
      return { documentId }
    }

    return {
      api: { documents, add, search, remove, embed } as unknown as KnowledgeApi,
      add: addFromServer,
      modelId,
      reachable: () => embeddingReachable(definition.model, region),
      [KNOWLEDGE_SEARCH]: searchIn,
    }
  }

  return { knowledge }
}
