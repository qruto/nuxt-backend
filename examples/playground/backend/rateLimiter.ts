import { HOUR, MINUTE, setupRateLimiter } from 'nuxt-backend/rate-limit'
import { ConvexError, v } from 'convex/values'
import { components } from './_generated/api'
import { mutation, query } from './_generated/server'

// Application rate limiting. Pre-seeded with the package defaults
// (DEFAULT_LIMITS in nuxt-backend/rate-limit) — add your own named limits here.
export const rateLimiter = setupRateLimiter(components, {
  // Demo limit for the showcase: a token bucket of 5 pings per minute per user.
  demoPing: { kind: 'token bucket', rate: 5, period: MINUTE, capacity: 5 },
  // The public playground's own guards. Its email sends (the test email, the
  // demo workflow) share one provider quota with every visitor's sign-in
  // codes, so they are limited per user and across the deployment.
  playgroundEmail: { kind: 'token bucket', rate: 5, period: MINUTE, capacity: 5 },
  playgroundEmailGlobal: { kind: 'fixed window', rate: 100, period: HOUR },
  // Bulk writes (the log seeder), per user.
  playgroundSeed: { kind: 'token bucket', rate: 3, period: MINUTE, capacity: 3 },
})

type PlaygroundLimit = 'playgroundEmail' | 'playgroundEmailGlobal' | 'playgroundSeed'

/**
 * Take one token from each limit in turn (keyed ones per user), or refuse with
 * a readable "try again" error — a `ConvexError`, whose message survives
 * production's error redaction.
 */
export async function throttle(
  ctx: Parameters<typeof rateLimiter.limit>[0],
  limits: Array<{ name: PlaygroundLimit, key?: string }>,
): Promise<void> {
  for (const { name, key } of limits) {
    const { ok, retryAfter } = await rateLimiter.limit(ctx, name, key ? { key } : {})
    if (!ok) throw new ConvexError(`Too many requests — try again in ${Math.ceil(retryAfter / 1000)} s.`)
  }
}

/** A user's email sends: their own budget, then the deployment's. */
export function emailLimits(userId: string): Array<{ name: PlaygroundLimit, key?: string }> {
  return [{ name: 'playgroundEmail', key: userId }, { name: 'playgroundEmailGlobal' }]
}

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
 * The key `setupAuth` gives an address's `emailOtp` limit: a SHA-256 of the
 * trimmed, lower-cased address, hex — so the meter reads the bucket OTP
 * sends actually drain.
 */
async function otpKey(email: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.trim().toLowerCase()))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

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
      rateLimiter.getValue(ctx, 'emailOtp', { key: await otpKey(email) }),
      rateLimiter.getValue(ctx, 'ai', { key: entityId }),
    ])
    return { email, emailOtp, ai }
  },
})
