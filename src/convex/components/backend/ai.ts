import { type FunctionHandle, paginationOptsValidator } from 'convex/server'
import { type ObjectType, v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel.js'
import { internal } from './_generated/api.js'
import { action, internalMutation, mutation, type MutationCtx, query, type QueryCtx } from './_generated/server.js'
import { fileOwnerOf, fileSha256, keepGenerated } from './storage.js'

/**
 * Metered-stream request plumbing (see `aiTables` in `schema.ts`): `start`
 * inserts a row after reserving credits, the HTTP dispatcher loads it by
 * stream id and claims it, and settlement/release mirror the credit
 * reservation's fate.
 * Public component functions — reachable only through the parent app, never
 * by browser clients (the `email.send` pattern).
 */

const vRequest = v.object({
  streamId: v.string(),
  name: v.string(),
  entityId: v.string(),
  userId: v.string(),
  args: v.string(),
  meterId: v.optional(v.string()),
  cost: v.number(),
  externalId: v.string(),
  status: v.union(v.literal('reserved'), v.literal('streaming'), v.literal('settled'), v.literal('released')),
  createdAt: v.number(),
})

export const createRequest = mutation({
  args: {
    streamId: v.string(),
    name: v.string(),
    entityId: v.string(),
    userId: v.string(),
    args: v.string(),
    meterId: v.optional(v.string()),
    cost: v.number(),
    externalId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert('aiRequests', { ...args, status: 'reserved', createdAt: Date.now() })
    return null
  },
})

export const getByStream = query({
  args: { streamId: v.string() },
  returns: v.union(vRequest, v.null()),
  handler: async (ctx, { streamId }) => {
    const row = await requestOf(ctx, streamId)
    if (!row) return null
    const { _id, _creationTime, ...request } = row
    return request
  },
})

/** A request by its stream id, or `null`. */
function requestOf(ctx: QueryCtx, streamId: string) {
  return ctx.db.query('aiRequests').withIndex('streamId', q => q.eq('streamId', streamId)).unique()
}

/**
 * Claim a reserved request for the one dispatch that runs its model: `true`
 * for the first, `false` for every other (one transaction, so two
 * dispatches of the same stream id cannot both win and both run the model
 * on one charge).
 */
export const claimRequest = mutation({
  args: { streamId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { streamId }) => {
    const row = await requestOf(ctx, streamId)
    if (row?.status !== 'reserved') return false
    await ctx.db.patch('aiRequests', row._id, { status: 'streaming' })
    return true
  },
})

/** Move a reserved or streaming request to its final status; a no-op once it has one. */
function markRequest(status: 'settled' | 'released') {
  return mutation({
    args: { streamId: v.string() },
    returns: v.null(),
    handler: async (ctx, { streamId }) => {
      const row = await requestOf(ctx, streamId)
      if (row && (row.status === 'reserved' || row.status === 'streaming')) await ctx.db.patch('aiRequests', row._id, { status })
      return null
    },
  })
}

export const markSettled = markRequest('settled')

export const markReleased = markRequest('released')

/**
 * Prune request plumbing older than `beforeMs` (rows are not a ledger).
 *
 * Reset plumbing for tests and dev deployments, reachable as
 * `components.backend.ai.clear`.
 */
export const clear = mutation({
  args: { beforeMs: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, { beforeMs }) => {
    const cutoff = beforeMs ?? Date.now()
    for await (const row of ctx.db.query('aiRequests')) {
      if (row.createdAt < cutoff) await ctx.db.delete('aiRequests', row._id)
    }
    return null
  },
})

// Chat threads and knowledge documents (`ai.chat`, `ai.knowledge`): the
// thread and the passages live in the app's Agent and RAG components; these
// rows say who owns them, and carry the handles an erasure and an export
// reach them by. Public component functions, reachable only through the
// parent app.

const vThreadRow = v.object({
  threadId: v.string(),
  chat: v.string(),
  owner: v.string(),
  userId: v.string(),
  title: v.string(),
  updatedAt: v.number(),
  remove: v.string(),
  read: v.string(),
})

/** A thread's owner row, by the thread's id. */
function threadRow(ctx: QueryCtx, threadId: string) {
  return ctx.db.query('aiThreads').withIndex('threadId', q => q.eq('threadId', threadId)).unique()
}

/** Record a new thread's owner. */
export const createThread = mutation({
  args: { threadId: v.string(), chat: v.string(), owner: v.string(), userId: v.string(), title: v.string(), remove: v.string(), read: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert('aiThreads', { ...args, updatedAt: Date.now() })
    return null
  },
})

/** One thread's owner row, or `null`. */
export const getThread = query({
  args: { threadId: v.string() },
  returns: v.union(vThreadRow, v.null()),
  handler: async (ctx, { threadId }) => {
    const row = await threadRow(ctx, threadId)
    if (!row) return null
    const { _id, _creationTime, ...thread } = row
    return thread
  },
})

/** A mutation that writes one thread's owner row, by the thread's id; a no-op for a thread with none. */
function threadWrite(write: (ctx: MutationCtx, row: Doc<'aiThreads'>) => Promise<void>) {
  return mutation({
    args: { threadId: v.string() },
    returns: v.null(),
    handler: async (ctx, { threadId }) => {
      const row = await threadRow(ctx, threadId)
      if (row) await write(ctx, row)
      return null
    },
  })
}

/** Mark a thread changed now: a message was sent or a reply finished. */
export const touchThread = threadWrite(async (ctx, row) => ctx.db.patch('aiThreads', row._id, { updatedAt: Date.now() }))

/** A person's threads of one chat and owner, the most recently changed first. */
export const listThreads = query({
  args: { chat: v.string(), owner: v.string(), userId: v.string(), limit: v.number() },
  returns: v.array(v.object({ threadId: v.string(), title: v.string(), updatedAt: v.number() })),
  handler: async (ctx, { chat, owner, userId, limit }) => {
    const rows = await ctx.db.query('aiThreads')
      .withIndex('userId_chat_owner_updatedAt', q => q.eq('userId', userId).eq('chat', chat).eq('owner', owner))
      .order('desc')
      .take(Math.min(Math.max(1, Math.floor(limit)), 200))
    return rows.map(row => ({ threadId: row.threadId, title: row.title, updatedAt: row.updatedAt }))
  },
})

/** Forget a thread's owner row (its messages go through the Agent component). */
export const deleteThread = threadWrite(async (ctx, row) => ctx.db.delete('aiThreads', row._id))

const vDocumentStatus = v.union(v.literal('pending'), v.literal('ready'), v.literal('failed'))

const vDocumentRow = v.object({
  id: v.string(),
  store: v.string(),
  owner: v.string(),
  addedBy: v.string(),
  title: v.string(),
  key: v.optional(v.string()),
  status: vDocumentStatus,
  entryId: v.optional(v.string()),
  characters: v.number(),
  createdAt: v.number(),
  remove: v.string(),
  read: v.string(),
  namespaces: v.optional(v.string()),
  removeNamespace: v.optional(v.string()),
})

function documentView(row: { _id: string, _creationTime: number } & Record<string, unknown>) {
  const { _id, _creationTime, ...document } = row
  return { id: _id, ...document } as never
}

/** Record a document waiting for its embeddings, and return its id. */
export const createDocument = mutation({
  args: { store: v.string(), owner: v.string(), addedBy: v.string(), title: v.string(), key: v.optional(v.string()), characters: v.number(), remove: v.string(), read: v.string(), namespaces: v.optional(v.string()), removeNamespace: v.optional(v.string()) },
  returns: v.string(),
  handler: async (ctx, args) => ctx.db.insert('aiDocuments', { ...args, status: 'pending', createdAt: Date.now() }),
})

/** One document, or `null`. */
export const getDocument = query({
  args: { documentId: v.string() },
  returns: v.union(vDocumentRow, v.null()),
  handler: async (ctx, { documentId }) => {
    const id = ctx.db.normalizeId('aiDocuments', documentId)
    const row = id ? await ctx.db.get('aiDocuments', id) : null
    return row ? documentView(row) : null
  },
})

/**
 * The store's older documents under a ready document's key go, and their
 * passages with them, deleted in the background: the RAG component only
 * marks a replaced entry so, and keeps its passages. Returns their ids.
 */
async function replaceOlder(ctx: MutationCtx, row: Doc<'aiDocuments'>, entryId: string | undefined): Promise<string[]> {
  const replaced: string[] = []
  const same = await ctx.db.query('aiDocuments').withIndex('store_owner_key', q => q.eq('store', row.store).eq('owner', row.owner).eq('key', row.key)).take(100)
  for (const older of same) {
    if (older._id === row._id || older.createdAt > row.createdAt) continue
    if (older.entryId && older.entryId !== entryId) await ctx.scheduler.runAfter(0, older.remove as FunctionHandle<'mutation', { entryId: string, startOrder: number }>, { entryId: older.entryId, startOrder: 0 })
    await ctx.db.delete('aiDocuments', older._id)
    replaced.push(older._id)
  }
  return replaced
}

/**
 * A document's embedding finished: `ready` with its entry, or `failed`.
 * A ready document added under a key replaces the store's older documents
 * with that key, passages and all, and returns their ids. A document
 * deleted meanwhile answers `null`.
 */
export const settleDocument = mutation({
  args: { documentId: v.string(), status: v.union(v.literal('ready'), v.literal('failed')), entryId: v.optional(v.string()) },
  returns: v.union(v.object({ replaced: v.array(v.string()) }), v.null()),
  handler: async (ctx, { documentId, status, entryId }) => {
    const id = ctx.db.normalizeId('aiDocuments', documentId)
    const row = id ? await ctx.db.get('aiDocuments', id) : null
    if (!row || row.status !== 'pending') return null
    await ctx.db.patch('aiDocuments', row._id, { status, ...(entryId ? { entryId } : {}) })
    return { replaced: status === 'ready' && row.key !== undefined ? await replaceOlder(ctx, row, entryId) : [] }
  },
})

/** A store's documents of one owner, the newest first, paginated. */
export const listDocuments = query({
  args: { store: v.string(), owner: v.string(), paginationOpts: paginationOptsValidator },
  returns: v.object({ page: v.array(vDocumentRow), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, { store, owner, paginationOpts }) => {
    const result = await ctx.db.query('aiDocuments')
      .withIndex('store_owner_createdAt', q => q.eq('store', store).eq('owner', owner))
      .order('desc')
      .paginate(paginationOpts)
    return { page: result.page.map(documentView), isDone: result.isDone, continueCursor: result.continueCursor }
  },
})

/** Forget a document's row (its passages go through the RAG component). */
export const deleteDocument = mutation({
  args: { documentId: v.string() },
  returns: v.null(),
  handler: async (ctx, { documentId }) => {
    const id = ctx.db.normalizeId('aiDocuments', documentId)
    if (id && await ctx.db.get('aiDocuments', id)) await ctx.db.delete('aiDocuments', id)
    return null
  },
})

// ── Provenance ──────────────────────────────────────────────────────────────

/** The IPTC digital source types a generated file is recorded with. */
const vSourceType = v.union(v.literal('trainedAlgorithmicMedia'), v.literal('compositeWithTrainedAlgorithmicMedia'))

/** The most inputs one record names: ids of the app's own rows and files. */
const MAX_INPUTS = 50

/** What made a generated image, beside where it is kept: `storeImage`'s arguments, its bytes aside. */
const vImageRecord = {
  contentType: v.optional(v.string()),
  jobId: v.optional(v.string()),
  owner: v.optional(v.string()),
  userId: v.optional(v.string()),
  models: v.array(v.string()),
  inputs: v.array(v.string()),
  sourceType: vSourceType,
  manifest: v.optional(v.string()),
}

/**
 * Keep a generated image (`ctx.storeImage`) and record what made it: an
 * action, so the bytes go straight to the component's storage and only the
 * storage id reaches the mutation that writes the owner record (a large
 * image never meets a mutation's argument limit after the model was paid).
 * The owner record makes the quota count the image, an export list it, an
 * erasure of its owner delete it and the orphan sweep keep it, as an upload
 * kept through `storage.claim` is. A job's image is the job's owner's, read
 * from the job itself; any other names its billing entity (`owner`) and the
 * member who ran it (`userId`). An entity that is a workspace keeps it for
 * its members. Stored bytes the record could not be written for are deleted
 * again. Answers the image's id in the component's storage.
 */
export const storeGeneratedImage = action({
  args: { bytes: v.bytes(), ...vImageRecord },
  returns: v.id('_storage'),
  handler: async (ctx, { bytes, ...record }): Promise<Id<'_storage'>> => {
    const contentType = record.contentType ?? 'application/octet-stream'
    const storageId = await ctx.storage.store(new Blob([bytes], { type: contentType }))
    try {
      return await ctx.runMutation(internal.ai.recordImage, { ...record, contentType, storageId, size: bytes.byteLength, sha256: await fileSha256(bytes) })
    }
    catch (error) {
      await ctx.storage.delete(storageId)
      throw error
    }
  },
})

/**
 * Keep a small image the caller already holds, from inside a mutation, with
 * the owner record and provenance `storeGeneratedImage` writes: a seed's
 * fixture images. A model's output goes through `storeGeneratedImage`
 * (`ctx.storeImage` does), so its bytes are never a mutation's argument.
 */
export const storeImage = mutation({
  args: { bytes: v.bytes(), ...vImageRecord },
  returns: v.id('_storage'),
  handler: async (ctx, { bytes, ...record }): Promise<Id<'_storage'>> => {
    const contentType = record.contentType ?? 'application/octet-stream'
    const storageId = await ctx.storage.store(new Blob([bytes], { type: contentType }))
    return await recordImageRow(ctx, { ...record, contentType, storageId, size: bytes.byteLength, sha256: await fileSha256(bytes) })
  },
})

const vRecordImage = { ...vImageRecord, storageId: v.id('_storage'), size: v.number(), sha256: v.string() }

/** The owner record and provenance of an image `storeGeneratedImage` stored, in one transaction. */
export const recordImage = internalMutation({
  args: vRecordImage,
  returns: v.id('_storage'),
  handler: async (ctx, args) => recordImageRow(ctx, args),
})

/** Write a stored image's owner record and its provenance row. */
async function recordImageRow(ctx: MutationCtx, args: ObjectType<typeof vRecordImage>): Promise<Id<'_storage'>> {
  const { storageId, size, sha256, contentType, jobId, owner, userId, inputs, ...record } = args
  const id = jobId ? ctx.db.normalizeId('jobs', jobId) : null
  const job = id ? await ctx.db.get('jobs', id) : null
  const entity = job?.owner ?? owner ?? 'app'
  await keepGenerated(ctx, {
    storageId,
    size,
    sha256,
    contentType: contentType ?? 'application/octet-stream',
    owner: await fileOwnerOf(ctx, entity, job ? job.userId : userId),
    holder: entity,
  })
  await ctx.db.insert('aiProvenance', {
    ...record,
    storageId,
    ...(jobId ? { jobId } : {}),
    owner: entity,
    inputs: [...new Set(inputs)].slice(0, MAX_INPUTS),
    createdAt: Date.now(),
  })
  return storageId
}

const vProvenance = v.object({ models: v.array(v.string()), finishedAt: v.number(), inputs: v.array(v.string()) })

/** What made a stored file, as `ai.provenanceOf` reads it, or `null` when nothing recorded it. */
export const getProvenance = query({
  args: { storageId: v.string() },
  returns: v.union(vProvenance, v.null()),
  handler: async (ctx, { storageId }) => {
    const row = await ctx.db.query('aiProvenance').withIndex('storageId', q => q.eq('storageId', storageId)).order('desc').first()
    return row ? { models: row.models, finishedAt: row.createdAt, inputs: row.inputs } : null
  },
})

/** The inputs every file a job stored names, once each: the job's provenance. */
export const jobProvenanceInputs = query({
  args: { jobId: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, { jobId }) => {
    const rows = await ctx.db.query('aiProvenance').withIndex('jobId', q => q.eq('jobId', jobId)).take(100)
    return [...new Set(rows.flatMap(row => row.inputs))].slice(0, MAX_INPUTS)
  },
})
