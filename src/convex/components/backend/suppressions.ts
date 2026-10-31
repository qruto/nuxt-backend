import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'
import type { Doc } from './_generated/dataModel.js'
import { mutation, type MutationCtx, query, type QueryCtx } from './_generated/server.js'

/**
 * The email provider's suppression list, mirrored. The provider decides
 * what is suppressed (a hard bounce, a complaint, an address added by
 * hand) and tells the deployment through its `suppression.added`,
 * `suppression.removed` and `email.suppressed` events, which the email
 * webhook hands here. A sign-in reads {@link isSuppressed} before a code is
 * sent: one indexed read, no provider call. The package never suppresses
 * an address of its own accord.
 *
 * Events can arrive late or twice: each row keeps the time of the
 * provider's change it follows (`changedAt`), and an older event changes
 * nothing. A lifted address keeps its row, marked, for
 * {@link LIFTED_RETENTION_MS}, so a late `suppression.added` from before the
 * lift cannot put it back; the maintenance pass deletes it after that.
 */

/** A lifted row is kept this long after the lift, then pruned. */
export const LIFTED_SUPPRESSION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

/** The most rows one admin page lists. */
const PAGE_MAX = 100

export const vSuppressionOrigin = v.union(v.literal('bounce'), v.literal('complaint'), v.literal('manual'), v.literal('dropped'))

/** An address as the copy keys it. */
export function suppressionKey(email: string): string {
  return email.trim().toLowerCase()
}

async function rowOf(ctx: QueryCtx, email: string): Promise<Doc<'suppressions'> | null> {
  return await ctx.db.query('suppressions').withIndex('email', q => q.eq('email', suppressionKey(email))).first()
}

/**
 * Record an address the provider suppressed, at the time it says it did.
 * A row whose latest change is newer stays as it is. Answers whether the
 * copy changed.
 */
export const record = mutation({
  args: { email: v.string(), origin: vSuppressionOrigin, at: v.number() },
  returns: v.boolean(),
  handler: async (ctx, { email, origin, at }) => {
    const key = suppressionKey(email)
    if (!key) return false
    const row = await rowOf(ctx, key)
    if (!row) {
      await ctx.db.insert('suppressions', { email: key, origin, suppressedAt: at, changedAt: at })
      return true
    }
    if (row.changedAt > at) return false
    // A dropped send says only that the address is suppressed: it keeps a known reason.
    const kept = origin === 'dropped' && row.liftedAt === undefined ? row.origin : origin
    await ctx.db.patch('suppressions', row._id, { origin: kept, suppressedAt: row.liftedAt === undefined ? row.suppressedAt : at, liftedAt: undefined, changedAt: at })
    return true
  },
})

/**
 * Mark an address lifted, at the time the provider lifted it: the next
 * sign-in code goes out. Answers the origin it was suppressed for, or
 * `null` when nothing changed (not suppressed, or a newer change stands).
 */
export const lift = mutation({
  args: { email: v.string(), at: v.number() },
  returns: v.union(vSuppressionOrigin, v.null()),
  handler: async (ctx, { email, at }) => {
    const row = await rowOf(ctx, email)
    if (!row || row.liftedAt !== undefined || row.changedAt > at) return null
    await ctx.db.patch('suppressions', row._id, { liftedAt: at, changedAt: at })
    return row.origin
  },
})

/** Whether the provider suppressed this address, as the copy knows it. */
export const isSuppressed = query({
  args: { email: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { email }) => {
    const row = await rowOf(ctx, email)
    return Boolean(row && row.liftedAt === undefined)
  },
})

const vSuppression = v.object({
  email: v.string(),
  origin: vSuppressionOrigin,
  suppressedAt: v.number(),
})

/** The addresses suppressed now, newest first, a page at a time. */
export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(vSuppression),
  handler: async (ctx, { paginationOpts }) => {
    const result = await ctx.db
      .query('suppressions')
      .withIndex('liftedAt_suppressedAt', q => q.eq('liftedAt', undefined))
      .order('desc')
      .paginate({ ...paginationOpts, numItems: Math.min(Math.max(paginationOpts.numItems, 1), PAGE_MAX) })
    return { ...result, page: result.page.map(row => ({ email: row.email, origin: row.origin, suppressedAt: row.suppressedAt })) }
  },
})

/** Erasure by address: the address's row goes, standing or lifted. Answers whether one was there. */
export async function forgetSuppression(ctx: MutationCtx, email: string): Promise<boolean> {
  const row = await rowOf(ctx, email)
  if (!row) return false
  await ctx.db.delete('suppressions', row._id)
  return true
}
