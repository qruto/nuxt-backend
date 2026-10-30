import { ShardedCounter } from '@convex-dev/sharded-counter'
import { ConvexError, v } from 'convex/values'
import { components } from './_generated/api'
import type { MutationCtx } from './_generated/server'
import { mutation, query } from './_generated/server'

// Each visitor's counters, kept by the sharded counter the scaffold mounts:
// a count is spread over several documents, so increments from many tabs at
// once never conflict. A counter's name is the visitor's id and the counter
// they asked for.
const counter = new ShardedCounter(components.shardedCounter)

/**
 * The counters a visitor has: `demo` on the client pages, `server` on the
 * server-rendering page. A fixed list, so clearing an account can reset
 * every one of them.
 */
const COUNTER_NAMES = ['demo', 'server'] as const

// The arguments accept exactly these names, so none can be written that
// clearing an account would miss.
const counterName = v.union(...COUNTER_NAMES.map(name => v.literal(name)))

/** Bounds on what a visitor writes: a modest step. */
const MAX_STEP = 1000

const keyOf = (userId: string, name: string) => `${userId}:${name}`

/** Reset every counter of a visitor's, when their data is cleared. */
export async function resetCounters(ctx: MutationCtx, userId: string): Promise<void> {
  for (const name of COUNTER_NAMES) await counter.reset(ctx, keyOf(userId, name))
}

/**
 * Start a visitor's `demo` counter at `value` when it reads zero: never
 * written, reset, or brought back to zero. A count is left as it is.
 */
export async function seedCounter(ctx: MutationCtx, userId: string, value: number): Promise<boolean> {
  const key = keyOf(userId, 'demo')
  if (await counter.count(ctx, key) !== 0) return false
  await counter.add(ctx, key, value)
  return true
}

export const get = query({
  args: { name: v.optional(counterName) },
  handler: async (ctx, { name = 'demo' }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return { value: 0, name }
    return { name, value: await counter.count(ctx, keyOf(identity.subject, name)) }
  },
})

export const increment = mutation({
  args: { name: v.optional(counterName), by: v.optional(v.number()) },
  handler: async (ctx, { name = 'demo', by = 1 }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')
    if (!Number.isInteger(by) || Math.abs(by) > MAX_STEP) throw new ConvexError(`Steps are whole numbers up to ±${MAX_STEP}.`)
    await counter.add(ctx, keyOf(identity.subject, name), by)
  },
})

export const reset = mutation({
  args: { name: v.optional(counterName) },
  handler: async (ctx, { name = 'demo' }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')
    await counter.reset(ctx, keyOf(identity.subject, name))
  },
})
