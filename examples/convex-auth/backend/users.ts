import { getAuthUserId } from '@convex-dev/auth/server'
import { v } from 'convex/values'
import { internalMutation, query } from './_generated/server'

/** Makes the app's user for a new account: Convex Auth calls it at sign-up. */
export const create = internalMutation({
  args: { method: v.object({ name: v.literal('usernamePassword'), profile: v.object({}) }) },
  returns: v.id('users'),
  handler: async ctx => ctx.db.insert('users', { createdAt: Date.now() }),
})

/** The signed-in user, or `null`. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    return userId ? ctx.db.get(userId) : null
  },
})
