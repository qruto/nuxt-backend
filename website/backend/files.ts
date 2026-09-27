import { paginationOptsValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import { internal } from './_generated/api'
import { internalMutation, mutation, query } from './_generated/server'

/** A library holds this many files at most. */
const MAX_FILES = 50

/** The largest file the playground keeps: 5 MB. */
const MAX_BYTES = 5 * 1024 * 1024

/** An upload nobody saved within this long is an orphan, removed by `cleanupOrphanUploads`. */
const ORPHAN_AFTER_MS = 60 * 60 * 1000

/** Issue a one-time upload URL for an authenticated user. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')
    return await ctx.storage.generateUploadUrl()
  },
})

/** Persist a freshly uploaded file's storage id in the user's library. */
export const save = mutation({
  args: {
    storageId: v.id('_storage'),
    name: v.string(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
  },
  handler: async (ctx, { storageId, name, contentType }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new ConvexError('Not authenticated')
    // An id already in a library belongs to it — claiming it would hand this
    // caller a URL to someone else's file (see `getUrl`).
    const claimed = await ctx.db.query('files').withIndex('storageId', q => q.eq('storageId', storageId)).first()
    const upload = claimed ? null : await ctx.db.system.get('_storage', storageId)
    if (!upload) throw new ConvexError('Upload not found.')
    // The limits apply here, where the stored size is known: an upload URL
    // accepts any size. A refused upload is deleted on the spot.
    const library = await ctx.db.query('files').withIndex('userId', q => q.eq('userId', identity.subject)).take(MAX_FILES)
    const refusal = upload.size > MAX_BYTES
      ? 'Files up to 5 MB on the playground.'
      : library.length >= MAX_FILES ? `The playground keeps ${MAX_FILES} files per account — delete one first.` : null
    if (refusal) {
      await ctx.storage.delete(storageId)
      throw new ConvexError(refusal)
    }
    await ctx.db.insert('files', {
      userId: identity.subject,
      storageId,
      name: name.slice(0, 200),
      contentType: upload.contentType ?? contentType,
      size: upload.size,
    })
  },
})

/** List the current user's files, resolving a served URL for each. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    const files = await ctx.db
      .query('files')
      .withIndex('userId', q => q.eq('userId', identity.subject))
      .order('desc')
      .take(MAX_FILES)

    return Promise.all(
      files.map(async file => ({
        ...file,
        url: await ctx.storage.getUrl(file.storageId),
      })),
    )
  },
})

/** Resolve the served URL for a single stored file the caller owns. */
export const getUrl = query({
  args: { storageId: v.id('_storage') },
  handler: async (ctx, { storageId }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    // `storage.getUrl` has no per-object ACL, so returning a URL for any id
    // would be a cross-tenant IDOR — only serve files the caller owns.
    const file = await ctx.db.query('files').withIndex('storageId', q => q.eq('storageId', storageId)).first()
    if (file?.userId !== identity.subject) return null
    return await ctx.storage.getUrl(storageId)
  },
})

/** Delete a file from storage and the user's library. */
export const remove = mutation({
  args: { id: v.id('files') },
  handler: async (ctx, { id }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new ConvexError('Not authenticated')

    const file = await ctx.db.get(id)
    if (!file || file.userId !== identity.subject) throw new ConvexError('File not found')

    await ctx.storage.delete(file.storageId)
    await ctx.db.delete(id)
  },
})

/**
 * Delete uploads nobody saved: an upload URL was issued, the file streamed,
 * and `save` never ran (a closed tab, a refused save). Walks the storage
 * older than an hour a page at a time, scheduling the next page; the daily
 * cron in crons.ts starts it.
 */
export const cleanupOrphanUploads = internalMutation({
  // `cutoff` is fixed by the first page and carried along: a cursor belongs
  // to one exact query.
  args: { paginationOpts: paginationOptsValidator, cutoff: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, { paginationOpts, cutoff = Date.now() - ORPHAN_AFTER_MS }) => {
    const page = await ctx.db.system
      .query('_storage')
      .withIndex('by_creation_time', q => q.lt('_creationTime', cutoff))
      .paginate(paginationOpts)
    for (const upload of page.page) {
      const saved = await ctx.db.query('files').withIndex('storageId', q => q.eq('storageId', upload._id)).first()
      if (!saved) await ctx.storage.delete(upload._id)
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.files.cleanupOrphanUploads, {
        paginationOpts: { numItems: paginationOpts.numItems, cursor: page.continueCursor },
        cutoff,
      })
    }
    return null
  },
})
