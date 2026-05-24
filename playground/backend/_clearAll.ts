import { internalMutation } from './_generated/server'

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const todos = await ctx.db.query('todos').collect()
    await Promise.all(todos.map(t => ctx.db.delete(t._id)))
    return { deleted: todos.length }
  },
})
