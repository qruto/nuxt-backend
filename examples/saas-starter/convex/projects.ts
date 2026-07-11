import { v } from 'convex/values'
import { org } from './functions'

// `org.*` builders inject ctx.user and ctx.organization (fresh membership
// check) — every function here is automatically scoped to the caller's
// active workspace.

export const list = org.query({
  args: {},
  handler: async ctx =>
    ctx.db
      .query('projects')
      .withIndex('organizationId', q => q.eq('organizationId', ctx.organization.id))
      .collect(),
})

export const create = org.mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) =>
    ctx.db.insert('projects', {
      name,
      organizationId: ctx.organization.id,
      createdBy: ctx.user.id,
    }),
})

export const remove = org.mutation({
  args: { id: v.id('projects') },
  handler: async (ctx, { id }) => {
    const project = await ctx.db.get(id)
    if (project?.organizationId !== ctx.organization.id) {
      throw new Error('Project belongs to another workspace')
    }
    await ctx.db.delete(id)
  },
})
