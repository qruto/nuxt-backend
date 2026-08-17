import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

/**
 * Metered-stream request plumbing (see `aiTables` in `schema.ts`): `start`
 * inserts a row after reserving credits, the HTTP dispatcher loads it by
 * stream id, and settlement/release mirror the credit reservation's fate.
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
  status: v.union(v.literal('reserved'), v.literal('settled'), v.literal('released')),
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
    const row = await ctx.db
      .query('aiRequests')
      .withIndex('streamId', q => q.eq('streamId', streamId))
      .unique()
    if (!row) return null
    const { _id, _creationTime, ...request } = row
    return request
  },
})

export const markSettled = mutation({
  args: { streamId: v.string() },
  returns: v.null(),
  handler: async (ctx, { streamId }) => {
    const row = await ctx.db
      .query('aiRequests')
      .withIndex('streamId', q => q.eq('streamId', streamId))
      .unique()
    if (row && row.status === 'reserved') await ctx.db.patch('aiRequests', row._id, { status: 'settled' })
    return null
  },
})

export const markReleased = mutation({
  args: { streamId: v.string() },
  returns: v.null(),
  handler: async (ctx, { streamId }) => {
    const row = await ctx.db
      .query('aiRequests')
      .withIndex('streamId', q => q.eq('streamId', streamId))
      .unique()
    if (row && row.status === 'reserved') await ctx.db.patch('aiRequests', row._id, { status: 'released' })
    return null
  },
})

/** Prune request plumbing older than `beforeMs` (rows are not a ledger). */
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
