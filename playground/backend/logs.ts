import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { LOG_LEVELS as LEVELS, logLevelValidator } from './schema'
import { paginateUserLogs, requireIdentity } from './lib'

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
  handler: async (ctx, { paginationOpts }) => paginateUserLogs(ctx, paginationOpts),
})

export const add = mutation({
  args: {
    level: logLevelValidator,
    message: v.string(),
  },
  handler: async (ctx, { level, message }) => {
    const identity = await requireIdentity(ctx)

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
    const identity = await requireIdentity(ctx)

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
    const identity = await requireIdentity(ctx)

    const rows = await ctx.db
      .query('logs')
      .withIndex('userId', q => q.eq('userId', identity.subject))
      .collect()

    await Promise.all(rows.map(r => ctx.db.delete(r._id)))
    return rows.length
  },
})
