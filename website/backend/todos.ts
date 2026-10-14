import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { getOwnedTodo, requireIdentity } from './lib'

/** The longest todo the playground keeps. */
const MAX_TEXT = 200

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
    const identity = await requireIdentity(ctx)
    const trimmed = text.trim()
    if (!trimmed) throw new ConvexError('A todo needs some text.')
    if (trimmed.length > MAX_TEXT) throw new ConvexError(`Todos are up to ${MAX_TEXT} characters.`)

    await ctx.db.insert('todos', {
      text: trimmed,
      completed: false,
      userId: identity.subject,
    })
  },
})

export const toggle = mutation({
  args: { id: v.id('todos') },
  handler: async (ctx, { id }) => {
    const identity = await requireIdentity(ctx)
    const todo = await getOwnedTodo(ctx, id, identity.subject)

    await ctx.db.patch(id, { completed: !todo.completed })
  },
})

export const remove = mutation({
  args: { id: v.id('todos') },
  handler: async (ctx, { id }) => {
    const identity = await requireIdentity(ctx)
    await getOwnedTodo(ctx, id, identity.subject)

    await ctx.db.delete(id)
  },
})
