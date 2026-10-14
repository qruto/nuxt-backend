import { ConvexError, v } from 'convex/values'
import type { MutationCtx } from './_generated/server'
import { mutation, query } from './_generated/server'

const DEFAULT_NAME = 'demo'

/** Bounds on what a visitor writes: a short name, a modest step. */
const MAX_NAME = 64
const MAX_STEP = 1000

function checkName(name: string): string {
  if (!name || name.length > MAX_NAME) throw new ConvexError(`Counter names are 1–${MAX_NAME} characters.`)
  return name
}

async function getOrCreate(ctx: MutationCtx, userId: string, name: string) {
  const existing = await ctx.db
    .query('counters')
    .withIndex('userId_name', q => q.eq('userId', userId).eq('name', name))
    .unique()
  if (existing) return existing
  const id = await ctx.db.insert('counters', { userId, name, value: 0 })
  return (await ctx.db.get(id))!
}

export const get = query({
  args: { name: v.optional(v.string()) },
  handler: async (ctx, { name }) => {
    const resolved = name ?? DEFAULT_NAME
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return { value: 0, name: resolved }

    const counter = await ctx.db
      .query('counters')
      .withIndex('userId_name', q =>
        q.eq('userId', identity.subject).eq('name', resolved))
      .unique()

    return {
      name: resolved,
      value: counter === null ? 0 : counter.value,
    }
  },
})

export const increment = mutation({
  args: { name: v.optional(v.string()), by: v.optional(v.number()) },
  handler: async (ctx, { name, by }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')

    const step = by ?? 1
    if (!Number.isInteger(step) || Math.abs(step) > MAX_STEP) throw new ConvexError(`Steps are whole numbers up to ±${MAX_STEP}.`)
    const counter = await getOrCreate(ctx, identity.subject, checkName(name ?? DEFAULT_NAME))
    await ctx.db.patch(counter._id, { value: counter.value + step })
  },
})

export const reset = mutation({
  args: { name: v.optional(v.string()) },
  handler: async (ctx, { name }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')

    const counter = await getOrCreate(ctx, identity.subject, checkName(name ?? DEFAULT_NAME))
    await ctx.db.patch(counter._id, { value: 0 })
  },
})
