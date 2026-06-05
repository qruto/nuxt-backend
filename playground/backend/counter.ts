import { v } from 'convex/values'
import type { MutationCtx } from './_generated/server'
import { mutation, query } from './_generated/server'

const DEFAULT_NAME = 'demo'

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
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return { value: 0, name: name ?? DEFAULT_NAME }

    const counter = await ctx.db
      .query('counters')
      .withIndex('userId_name', q =>
        q.eq('userId', identity.subject).eq('name', name ?? DEFAULT_NAME))
      .unique()

    return {
      name: name ?? DEFAULT_NAME,
      value: counter?.value ?? 0,
    }
  },
})

export const increment = mutation({
  args: { name: v.optional(v.string()), by: v.optional(v.number()) },
  handler: async (ctx, { name, by }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')

    const counter = await getOrCreate(ctx, identity.subject, name ?? DEFAULT_NAME)
    await ctx.db.patch(counter._id, { value: counter.value + (by ?? 1) })
  },
})

export const reset = mutation({
  args: { name: v.optional(v.string()) },
  handler: async (ctx, { name }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')

    const counter = await getOrCreate(ctx, identity.subject, name ?? DEFAULT_NAME)
    await ctx.db.patch(counter._id, { value: 0 })
  },
})
