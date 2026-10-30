import { v } from 'convex/values'
import { mutation, type MutationCtx, query } from './_generated/server.js'

/**
 * The app shell's two marks on an account: when it finished or skipped the
 * first run at `/welcome` (`onboardedAt`), and when it dismissed the
 * activation checklist (`activationDismissedAt`). Both are epoch
 * milliseconds on the account's own row, so an export carries them and an
 * erasure removes them with the account. The app's `setupAccount` and
 * `setupAudit` call these after checking who is asking; nothing here reads a
 * caller.
 */

const vMarks = v.object({
  onboardedAt: v.union(v.number(), v.null()),
  activationDismissedAt: v.union(v.number(), v.null()),
})

/** The marks an account holds; both `null` for an account that has none, or that no longer exists. */
export const marks = query({
  args: { userId: v.string() },
  returns: vMarks,
  handler: async (ctx, { userId }) => {
    const id = ctx.db.normalizeId('user', userId)
    const user = id ? await ctx.db.get('user', id) : null
    return { onboardedAt: user?.onboardedAt ?? null, activationDismissedAt: user?.activationDismissedAt ?? null }
  },
})

/** Stamp one of the account's marks with the time now, once: a second call keeps the first time. `null` for an unknown account. */
async function stamp(ctx: MutationCtx, userId: string, field: 'onboardedAt' | 'activationDismissedAt'): Promise<number | null> {
  const id = ctx.db.normalizeId('user', userId)
  const user = id ? await ctx.db.get('user', id) : null
  if (!id || !user) return null
  const held = user[field]
  if (typeof held === 'number') return held
  const at = Date.now()
  await ctx.db.patch('user', id, { [field]: at })
  return at
}

/** Stamp the first run as finished. Idempotent: a second call keeps the first time. Answers the time, `null` for an unknown account. */
export const complete = mutation({
  args: { userId: v.string() },
  returns: v.union(v.number(), v.null()),
  handler: (ctx, { userId }) => stamp(ctx, userId, 'onboardedAt'),
})

/** Stamp the activation checklist as dismissed. Idempotent. Answers the time, `null` for an unknown account. */
export const dismissActivation = mutation({
  args: { userId: v.string() },
  returns: v.union(v.number(), v.null()),
  handler: (ctx, { userId }) => stamp(ctx, userId, 'activationDismissedAt'),
})
