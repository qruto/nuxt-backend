import type { GenericDataModel, QueryBuilder } from 'convex/server'
import { v } from 'convex/values'
import type { AdapterRefs } from './component.js'

// Workspaces (the organization plugin's organizations): the one every new
// session activates, and the workspace queries `setupAuth` remounts.

/** The minimal Better Auth adapter surface the session hooks need. */
interface AuthHookAdapter {
  findOne: (args: { model: string, where: Array<{ field: string, value: unknown }> }) => Promise<unknown>
  create: (args: { model: string, data: Record<string, unknown> }) => Promise<unknown>
}

/** The adapter a database hook's endpoint context carries (`undefined` outside a request). */
export function hookAdapter(hookCtx: unknown): AuthHookAdapter | undefined {
  return (hookCtx as { context?: { adapter?: AuthHookAdapter } } | undefined)?.context?.adapter
}

/**
 * Resolve the workspace a new session should activate: the user's first
 * membership, or a personal workspace created on the spot (organization +
 * owner membership rows via the Better Auth adapter).
 */
export async function ensureActiveOrganization(
  userId: string,
  hookCtx: unknown,
): Promise<string | undefined> {
  const adapter = hookAdapter(hookCtx)
  if (!adapter) return undefined

  const membership = await adapter.findOne({
    model: 'member',
    where: [{ field: 'userId', value: userId }],
  }) as { organizationId?: string } | null
  if (membership?.organizationId) return membership.organizationId

  const user = await adapter.findOne({
    model: 'user',
    where: [{ field: 'id', value: userId }],
  }) as { name?: string } | null
  const now = new Date()
  const workspace = await adapter.create({
    model: 'organization',
    data: {
      name: user?.name ? `${user.name}'s workspace` : 'Personal workspace',
      slug: `personal-${userId.toLowerCase()}`,
      createdAt: now,
    },
  }) as { id: string }
  await adapter.create({
    model: 'member',
    data: { organizationId: workspace.id, userId, role: 'owner', createdAt: now },
  })
  return workspace.id
}

/** More memberships than any real account holds; a bound, not pagination. */
const WORKSPACE_PAGE_SIZE = 100

/**
 * The caller's workspaces and the members of one of them, for `setupAuth`:
 * identity-gated reads over the component adapter.
 */
export function workspaceQueries<
  DM extends GenericDataModel,
>(
  queryBuilder: QueryBuilder<DM, 'public'>,
  adapter: AdapterRefs,
) {
  // The caller's workspaces (identity-gated adapter reads over member +
  // organization). Degrades to `null` for claimless callers — reactive clients
  // subscribe during auth handshakes, and a throwing query would be retried.
  const listWorkspaces = queryBuilder({
    args: {},
    handler: async (ctx) => {
      const identity = await ctx.auth.getUserIdentity()
      if (!identity) return null
      const claims = identity as unknown as Record<string, unknown>
      const activeOrganizationId = typeof claims.activeOrganizationId === 'string' ? claims.activeOrganizationId : null
      const memberships = await ctx.runQuery(adapter.findMany, {
        model: 'member',
        where: [{ field: 'userId', value: identity.subject }],
        paginationOpts: { numItems: WORKSPACE_PAGE_SIZE, cursor: null },
      })
      const workspaces = []
      for (const membership of memberships.page as Array<{ organizationId: string, role: string, createdAt: number }>) {
        const workspace = await ctx.runQuery(adapter.findOne, {
          model: 'organization',
          where: [{ field: '_id', value: membership.organizationId }],
        }) as { _id: string, name: string, slug: string, logo?: string | null } | null
        if (!workspace) continue
        workspaces.push({
          id: workspace._id,
          name: workspace.name,
          slug: workspace.slug,
          logo: workspace.logo ?? null,
          role: membership.role,
          active: workspace._id === activeOrganizationId,
          joinedAt: membership.createdAt,
        })
      }
      return workspaces
    },
  })

  // Members of one of the caller's workspaces (default: the active one).
  // Gated on a fresh member-table read, not claims — a removed member's JWT
  // can outlive the removal by the token lifetime.
  const listWorkspaceMembers = queryBuilder({
    args: { organizationId: v.optional(v.string()) },
    handler: async (ctx, args) => {
      const identity = await ctx.auth.getUserIdentity()
      if (!identity) return null
      const claims = identity as unknown as Record<string, unknown>
      const organizationId = (args as { organizationId?: string }).organizationId
        ?? (typeof claims.activeOrganizationId === 'string' ? claims.activeOrganizationId : null)
      if (!organizationId) return null
      const callerMembership = await ctx.runQuery(adapter.findOne, {
        model: 'member',
        where: [
          { field: 'organizationId', value: organizationId },
          { field: 'userId', value: identity.subject },
        ],
      })
      if (!callerMembership) return null
      const memberships = await ctx.runQuery(adapter.findMany, {
        model: 'member',
        where: [{ field: 'organizationId', value: organizationId }],
        paginationOpts: { numItems: WORKSPACE_PAGE_SIZE, cursor: null },
      })
      const members = []
      for (const membership of memberships.page as Array<{ userId: string, role: string, createdAt: number }>) {
        const user = await ctx.runQuery(adapter.findOne, {
          model: 'user',
          where: [{ field: '_id', value: membership.userId }],
        }) as { name?: string, email?: string } | null
        members.push({
          userId: membership.userId,
          name: user?.name ?? '',
          email: user?.email ?? '',
          role: membership.role,
          joinedAt: membership.createdAt,
        })
      }
      return { organizationId, members }
    },
  })

  return { listWorkspaces, listWorkspaceMembers }
}
