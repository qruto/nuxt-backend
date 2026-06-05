import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

const MAX_MESSAGES = 100

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    const messages = await ctx.db
      .query('messages')
      .withIndex('userId', q => q.eq('userId', identity.subject))
      .order('desc')
      .take(MAX_MESSAGES)

    return messages.reverse()
  },
})

export const send = mutation({
  args: { text: v.string() },
  handler: async (ctx, { text }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')

    const trimmed = text.trim()
    if (!trimmed) throw new Error('Message must not be empty')
    if (trimmed.length > 500) throw new Error('Message is too long')

    await ctx.db.insert('messages', {
      userId: identity.subject,
      author: identity.name ?? identity.email ?? 'Anonymous',
      text: trimmed,
    })
  },
})

export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')

    const messages = await ctx.db
      .query('messages')
      .withIndex('userId', q => q.eq('userId', identity.subject))
      .collect()

    await Promise.all(messages.map(m => ctx.db.delete(m._id)))
  },
})
