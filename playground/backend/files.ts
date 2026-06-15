import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

const MAX_FILES = 50

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
  handler: async (ctx, { storageId, name, contentType, size }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')
    await ctx.db.insert('files', {
      userId: identity.subject,
      storageId,
      name,
      contentType,
      size,
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

/** Resolve the served URL for a single stored file. */
export const getUrl = query({
  args: { storageId: v.id('_storage') },
  handler: async (ctx, { storageId }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    return await ctx.storage.getUrl(storageId)
  },
})

/** Delete a file from storage and the user's library. */
export const remove = mutation({
  args: { id: v.id('files') },
  handler: async (ctx, { id }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')

    const file = await ctx.db.get(id)
    if (!file || file.userId !== identity.subject) throw new Error('File not found')

    await ctx.storage.delete(file.storageId)
    await ctx.db.delete(id)
  },
})
