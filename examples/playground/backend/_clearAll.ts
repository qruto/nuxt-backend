import { internalMutation } from './_generated/server'

const TABLES = ['todos', 'messages', 'counters', 'logs'] as const

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    let deleted = 0
    for (const table of TABLES) {
      const rows = await ctx.db.query(table).collect()
      await Promise.all(rows.map(r => ctx.db.delete(r._id)))
      deleted += rows.length
    }
    return { deleted }
  },
})
