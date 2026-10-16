import type { GenericDataModel, QueryBuilder } from 'convex/server'
import { v } from 'convex/values'
import type { AdapterRefs } from './component.js'
import { hookAdapter } from './runtime.js'

// Workspaces (the organization plugin's organizations): the one every new
// session activates, and the workspace queries `setupAuth` remounts.

/**
 * Resolve the workspace a new session should activate: the user's first
 * membership, or their personal workspace (organization + owner membership
 * rows via the Better Auth adapter). `name` is the account's display name,
 * which names a workspace created here.
 *
 * A personal workspace can outlive its owner's membership. Left empty, it is
 * the user's again; still held by others, it stays with them, and the user
 * gets a new one under a slug of its own. Creating the old slug again would
 * break the organization's unique slug, and with it every sign-in of the
 * account.
 */
export async function ensureActiveOrganization(
  userId: string,
  hookCtx: unknown,
  name?: string,
): Promise<string | undefined> {
  const adapter = hookAdapter(hookCtx)
  if (!adapter) return undefined

  const membership = await adapter.findOne({
    model: 'member',
    where: [{ field: 'userId', value: userId }],
  }) as { organizationId?: string } | null
  if (membership?.organizationId) return membership.organizationId

  const now = new Date()
  const join = async (organizationId: string) => {
    await adapter.create({
      model: 'member',
      data: { organizationId, userId, role: 'owner', createdAt: now },
    })
    return organizationId
  }

  const slug = `personal-${userId.toLowerCase()}`
  const personal = await adapter.findOne({
    model: 'organization',
    where: [{ field: 'slug', value: slug }],
  }) as { id: string } | null
  if (personal) {
    const anyMember = await adapter.findOne({
      model: 'member',
      where: [{ field: 'organizationId', value: personal.id }],
    })
    if (!anyMember) return join(personal.id)
  }

  const workspace = await adapter.create({
    model: 'organization',
    data: {
      name: name ? `${name}'s workspace` : 'Personal workspace',
      slug: personal ? `${slug}-${randomSuffix()}` : slug,
      createdAt: now,
    },
  }) as { id: string }
  return join(workspace.id)
}

/** Eight hex characters: a fresh slug beside a personal workspace someone else now holds. */
function randomSuffix(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(4)), byte => byte.toString(16).padStart(2, '0')).join('')
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
