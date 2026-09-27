import type { PaginationOptions } from 'convex/server'
import type { Doc } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'

/** Returns the authenticated user's identity, or throws when signed out. */
export async function requireIdentity(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error('Not authenticated')
  return identity
}

/** Best-effort display name for a user identity. */
export function displayName(identity: { name?: string | null, email?: string | null }) {
  return identity.name ?? identity.email ?? 'Anonymous'
}

/** A todo owned by the current user, or throws when missing / not owned. */
export async function getOwnedTodo(ctx: MutationCtx, id: Doc<'todos'>['_id'], userId: string) {
  const todo = await ctx.db.get(id)
  if (!todo || todo.userId !== userId) {
    throw new Error('Todo not found')
  }
  return todo
}

/** Paginate the current user's logs (newest first), or an empty page when signed out. */
export async function paginateUserLogs(ctx: QueryCtx, paginationOpts: PaginationOptions) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    return { page: [], isDone: true, continueCursor: '' }
  }
  return await ctx.db
    .query('logs')
    .withIndex('userId', q => q.eq('userId', identity.subject))
    .order('desc')
    .paginate(paginationOpts)
}
