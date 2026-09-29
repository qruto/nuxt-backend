import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { action, mutation, query } from './_generated/server'
import { paginateUserLogs } from './lib'

/**
 * A pretend "slow" action that simulates a network round-trip on the server
 * (which itself might be calling a third-party API). Useful for demoing
 * `useAction` from the client: you can show a pending spinner, errors, and
 * non-reactive results.
 */
export const echo = action({
  args: {
    text: v.string(),
    delayMs: v.optional(v.number()),
    failRate: v.optional(v.number()),
  },
  handler: async (_ctx, { text, delayMs, failRate }) => {
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
 * Demo helper: clear all app data for the current authenticated user.
 * Exposed so the playground UI can offer a "reset data" control for clean test runs.
 */
export const clearUserData = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return { deleted: 0 }

    // Explicit per-table queries keep `withIndex` names statically correct.
    const tables = await Promise.all([
      ctx.db
        .query('todos')
        .withIndex('userId', q => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('messages')
        .withIndex('userId', q => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('counters')
        .withIndex('userId_name', q => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('logs')
        .withIndex('userId', q => q.eq('userId', identity.subject))
        .collect(),
    ])

    const rows = tables.flat()
    await Promise.all(rows.map(r => ctx.db.delete(r._id)))

    return { deleted: rows.length }
  },
})
