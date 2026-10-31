import { v } from 'convex/values'
import { internalMutation } from './_generated/server.js'

/**
 * The session signing keys' rotation, for `nuxt-backend env rotate
 * AUTH_SECRET`. Internal: only the Convex CLI calls them (`convex run
 * --component backend keys:rotate`), with the deployment's admin key.
 *
 * Rotating marks every key that still signs as expired now. The auth
 * library then makes a new key at the next token it signs, encrypted with
 * the current secret, and keeps publishing the expired keys' public halves
 * for its grace period (30 days), so a token signed a moment before stays
 * valid until it expires. Retiring removes the expired keys, once the
 * previous secret they were encrypted with goes.
 */

/** The most keys a deployment holds: one signing, a few rotated out. A bound for the reads below. */
const MAX_KEYS = 100

export const rotate = internalMutation({
  args: {},
  returns: v.object({ expired: v.number(), kept: v.number() }),
  handler: async (ctx) => {
    const now = Date.now()
    const keys = await ctx.db.query('jwks').take(MAX_KEYS)
    let expired = 0
    for (const key of keys) {
      if (typeof key.expiresAt === 'number' && key.expiresAt <= now) continue
      await ctx.db.patch('jwks', key._id, { expiresAt: now })
      expired++
    }
    return { expired, kept: keys.length - expired }
  },
})

export const retire = internalMutation({
  args: {},
  returns: v.object({ removed: v.number(), signing: v.number() }),
  handler: async (ctx) => {
    const now = Date.now()
    const keys = await ctx.db.query('jwks').take(MAX_KEYS)
    let removed = 0
    for (const key of keys) {
      if (typeof key.expiresAt !== 'number' || key.expiresAt > now) continue
      await ctx.db.delete('jwks', key._id)
      removed++
    }
    return { removed, signing: keys.length - removed }
  },
})
