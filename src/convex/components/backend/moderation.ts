import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { mutation, query } from './_generated/server.js'
import { vAiFlag } from './schema.js'

/**
 * What the safety classifier flagged (`setupAi({ moderation })`): one row a
 * flagged check, categories only, never the content. Kept for the days the
 * app's `moderation.log` names, then pruned by the maintenance pass; an
 * account's erasure deletes the rows about it. The admin console's
 * Moderation tab lists them, newest first.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** Record one flagged check, kept `days`. */
export const record = mutation({
  args: { ...vAiFlag, days: v.number() },
  returns: v.null(),
  handler: async (ctx, { days, ...flag }) => {
    await ctx.db.insert('aiFlags', { ...flag, expiresAt: Date.now() + days * DAY_MS })
    return null
  },
})

/** A flag as the Moderation tab lists it. */
const vFlag = v.object({ id: v.string(), at: v.number(), ...vAiFlag })

/** The flags, newest first, a page at a time; the escalated ones alone with `escalated`. */
export const list = query({
  args: { paginationOpts: paginationOptsValidator, escalated: v.optional(v.boolean()) },
  returns: v.object({ page: v.array(vFlag), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, { paginationOpts, escalated }) => {
    const rows = escalated
      ? ctx.db.query('aiFlags').withIndex('by_escalate', q => q.eq('escalate', true))
      : ctx.db.query('aiFlags')
    const { page, isDone, continueCursor } = await rows.order('desc').paginate(paginationOpts)
    return {
      page: page.map(({ _id, _creationTime, expiresAt: _, ...flag }) => ({ id: _id as string, at: _creationTime, ...flag })),
      isDone,
      continueCursor,
    }
  },
})
