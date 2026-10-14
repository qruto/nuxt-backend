import { paginationOptsValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import { internal } from './_generated/api'
import { action, query } from './_generated/server'
import { mutation } from './aggregates'
import { paginateUserLogs } from './lib'
import { throttle } from './rateLimiter'
import { clearAppData } from './retention'

/** The longest text the demo action echoes back. */
const MAX_ECHO = 500

/**
 * A pretend "slow" action that simulates a network round-trip on the server
 * (which itself might be calling a third-party API). Useful for demoing
 * `useAction` from the client: you can show a pending spinner, errors, and
 * non-reactive results. Signed-in callers only, throttled per user.
 */
export const echo = action({
  args: {
    text: v.string(),
    delayMs: v.optional(v.number()),
    failRate: v.optional(v.number()),
  },
  handler: async (ctx, { text, delayMs, failRate }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new ConvexError('Sign in to run the demo action.')
    if (text.length > MAX_ECHO) throw new ConvexError(`Up to ${MAX_ECHO} characters.`)
    await throttle(ctx, [{ name: 'playgroundAction', key: identity.subject }])

    const delay = Math.min(Math.max(delayMs ?? 800, 0), 5000)
    await new Promise(resolve => setTimeout(resolve, delay))

    if ((failRate ?? 0) > Math.random()) {
      throw new Error('Action failed (simulated)')
    }

    return {
      reversed: text.split('').reverse().join(''),
      length: text.length,
      receivedAt: new Date().toISOString(),
    }
  },
})

/**
 * A reactive query that succeeds or throws on demand. Used by the
 * `useQuery_experimental` showcase to flip between the `success` and `error`
 * branches of the object-form result union.
 */
export const flaky = query({
  args: { shouldFail: v.optional(v.boolean()), label: v.optional(v.string()) },
  handler: async (_ctx, { shouldFail, label }) => {
    if (shouldFail) {
      throw new Error('Query failed (simulated). Flip "shouldFail" off to recover.')
    }
    return {
      label: label ?? 'demo',
      tick: Math.floor(Date.now() / 1000),
      message: 'Reactive query value — updates whenever the server result changes.',
    }
  },
})

/**
 * A paginated query over the user's `logs` that can throw on demand. Used by the
 * `usePaginatedQuery_experimental` showcase to demo the `error` status without
 * disturbing the regular paginated-logs page.
 */
export const flakyPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
    shouldFail: v.optional(v.boolean()),
  },
  handler: async (ctx, { paginationOpts, shouldFail }) => {
    if (shouldFail) {
      throw new Error('Paginated query failed (simulated).')
    }
    return await paginateUserLogs(ctx, paginationOpts)
  },
})

/**
 * Demo helper: clear all app data for the current authenticated user — todos,
 * messages, counters, logs, files and the sent-email feed. Exposed so the
 * playground UI can offer a "reset data" control for clean test runs. A large
 * library finishes in the background (retention.clearUser).
 */
export const clearUserData = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return { deleted: 0 }

    const { deleted, done } = await clearAppData(ctx, identity.subject)
    if (!done) await ctx.scheduler.runAfter(0, internal.retention.clearUser, { userId: identity.subject })
    return { deleted }
  },
})
