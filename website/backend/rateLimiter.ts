import { MINUTE, setupRateLimiter } from 'nuxt-backend/rate-limit'
import { v } from 'convex/values'
import { components } from './_generated/api'
import { mutation, query } from './_generated/server'

// Application rate limiting. Pre-seeded with the package defaults (emailOtp,
// billingSync, ai, mcp) — add your own named limits here.
export const rateLimiter = setupRateLimiter(components, {
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

/**
 * Live view of the pre-seeded limits for the caller — meters on the
 * rate-limit playground page drain as OTP requests / metered AI calls happen.
 * `getValue` returns `{ config, value, ts }`, so each entry carries its own
 * capacity for the meter.
 */
export const authLimits = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    const email = typeof identity?.email === 'string' ? identity.email : null
    if (!email) return { email: null, emailOtp: null, ai: null }
    const claims = identity as unknown as Record<string, unknown>
    const entityId = typeof claims.activeOrganizationId === 'string' ? claims.activeOrganizationId : identity!.subject
    const [emailOtp, ai] = await Promise.all([
      rateLimiter.getValue(ctx, 'emailOtp', { key: email }),
      rateLimiter.getValue(ctx, 'ai', { key: entityId }),
    ])
    return { email, emailOtp, ai }
  },
})
