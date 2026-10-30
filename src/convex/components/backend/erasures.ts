import { v } from 'convex/values'
import type { Doc } from './_generated/dataModel.js'
import { mutation, query, type QueryCtx } from './_generated/server.js'

// The app's part of an erasure that gave up on a participant (the billing
// customer, the email contact, an app's own source): its plan, kept in
// `accountErasureFailures`. The component's part deletes the account's
// workspaces and its own erasure row once it is done, so without this a
// retry would recompute a plan that erases nothing. Public component
// functions, reachable only through the parent app.

const vFailure = v.object({
  userId: v.optional(v.string()),
  email: v.optional(v.string()),
  deleted: v.array(v.string()),
  left: v.array(v.string()),
  done: v.array(v.string()),
  failed: v.array(v.string()),
  rounds: v.number(),
  failedAt: v.number(),
})

/** The kept failure of one account's (or one address's) erasure, or `null`. */
async function failureOf(ctx: QueryCtx, { userId, email }: { userId?: string, email?: string }): Promise<Doc<'accountErasureFailures'> | null> {
  if (userId) return ctx.db.query('accountErasureFailures').withIndex('userId', q => q.eq('userId', userId)).first()
  if (email) return ctx.db.query('accountErasureFailures').withIndex('email', q => q.eq('email', email)).first()
  return null
}

const view = ({ _id, _creationTime, ...row }: Doc<'accountErasureFailures'>) => row

/** Keep, or bring up to date, the plan of an erasure whose app part gave up on a participant. */
export const keepFailure = mutation({
  args: vFailure.omit('failedAt'),
  returns: v.null(),
  handler: async (ctx, failure) => {
    if (!failure.userId && !failure.email) return null
    const kept = await failureOf(ctx, failure)
    const row = { ...failure, failedAt: Date.now() }
    if (kept) await ctx.db.replace('accountErasureFailures', kept._id, row)
    else await ctx.db.insert('accountErasureFailures', row)
    return null
  },
})

/** Forget the kept plan once every participant of it finished. */
export const clearFailure = mutation({
  args: { userId: v.optional(v.string()), email: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, target) => {
    const kept = await failureOf(ctx, target)
    if (kept) await ctx.db.delete('accountErasureFailures', kept._id)
    return null
  },
})

/** The kept plan of one account's (or one address's) erasure, or `null`. */
export const failure = query({
  args: { userId: v.optional(v.string()), email: v.optional(v.string()) },
  returns: v.union(vFailure, v.null()),
  handler: async (ctx, target) => {
    const kept = await failureOf(ctx, target)
    return kept ? view(kept) : null
  },
})

/** Every kept plan, oldest first: what a retry of the failed erasures runs again. */
export const failures = query({
  args: {},
  returns: v.array(vFailure),
  handler: async ctx => (await ctx.db.query('accountErasureFailures').withIndex('failedAt').take(100)).map(view),
})
