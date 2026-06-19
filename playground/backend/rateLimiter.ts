import { MINUTE, setupRateLimiter } from 'nuxt-backend/convex/rate-limit'
import { v } from 'convex/values'
import { components } from './_generated/api'
import { mutation } from './_generated/server'

// Application rate limiting. Pre-seeded with the auth limits (emailOtp,
// signIn, signUp, passwordReset) — add your own named limits here.
export const rateLimiter = setupRateLimiter(components.rateLimiter, {
  // Demo limit for the showcase: a token bucket of 5 pings per minute per user.
  demoPing: { kind: 'token bucket', rate: 5, period: MINUTE, capacity: 5 },
})

// Demo endpoint for the showcase: consumes one `demoPing` token per call and
// reports whether the caller is within budget. Returns (instead of throwing) so
// the UI can show the remaining-time hint when the bucket is empty.
export const ping = mutation({
  args: {},
  returns: v.object({ ok: v.boolean(), retryAfter: v.optional(v.number()) }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    const key = identity?.subject ?? 'anonymous'
    const { ok, retryAfter } = await rateLimiter.limit(ctx, 'demoPing', { key })
    return { ok, retryAfter }
  },
})
