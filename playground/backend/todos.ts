import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    return await ctx.db
      .query('todos')
      .withIndex('userId', q => q.eq('userId', identity.subject))
      .order('desc')
      .collect()
  },
})

export const create = mutation({
  args: { text: v.string() },
  handler: async (ctx, { text }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')

    await ctx.db.insert('todos', {
      text,
      completed: false,
      userId: identity.subject,
    })
  },
})

export const toggle = mutation({
  args: { id: v.id('todos') },
  handler: async (ctx, { id }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')

    const todo = await ctx.db.get(id)
    if (!todo || todo.userId !== identity.subject) {
      throw new Error('Todo not found')
    }

    await ctx.db.patch(id, { completed: !todo.completed })
  },
})

export const remove = mutation({
  args: { id: v.id('todos') },
  handler: async (ctx, { id }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')

    const todo = await ctx.db.get(id)
    if (!todo || todo.userId !== identity.subject) {
      throw new Error('Todo not found')
    }

    await ctx.db.delete(id)
  },
})
