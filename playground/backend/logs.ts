import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

const LEVELS = ['info', 'warn', 'error'] as const
const SAMPLES = [
  'User signed in',
  'Convex query subscribed',
  'Cache miss — fetching from upstream',
  'Mutation succeeded',
  'WebSocket reconnect',
  'Background job started',
  'Background job completed',
  'Rate limit warning approaching',
  'Stale connection detected',
  'Pagination cursor refreshed',
]

export const listPaginated = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      return { page: [], isDone: true, continueCursor: '' }
    }

    return await ctx.db
      .query('logs')
      .withIndex('userId', q => q.eq('userId', identity.subject))
      .order('desc')
      .paginate(paginationOpts)
  },
})

export const add = mutation({
  args: {
    level: v.union(v.literal('info'), v.literal('warn'), v.literal('error')),
    message: v.string(),
  },
  handler: async (ctx, { level, message }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')

    await ctx.db.insert('logs', {
      userId: identity.subject,
      level,
      message,
    })
  },
})

export const seed = mutation({
  args: { count: v.optional(v.number()) },
  handler: async (ctx, { count }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')

    const total = Math.min(Math.max(count ?? 25, 1), 200)
    for (let i = 0; i < total; i++) {
      const level = LEVELS[Math.floor(Math.random() * LEVELS.length)]!
      const sample = SAMPLES[Math.floor(Math.random() * SAMPLES.length)]!
      await ctx.db.insert('logs', {
        userId: identity.subject,
        level,
        message: `${sample} (#${i + 1})`,
      })
    }
    return total
  },
})

export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')

    const rows = await ctx.db
      .query('logs')
      .withIndex('userId', q => q.eq('userId', identity.subject))
      .collect()

    await Promise.all(rows.map(r => ctx.db.delete(r._id)))
    return rows.length
  },
})
