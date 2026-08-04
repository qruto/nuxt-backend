import type { Auth, FunctionReference, GenericActionCtx, GenericDataModel, MutationBuilder, RegisteredMutation } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import { defaultRoles } from 'better-auth/plugins/admin/access'

/**
 * Authorization over the bundled Better Auth setup: role checks (admin
 * plugin), permission-statement checks (access control), and workspace
 * membership checks (organization plugin).
 *
 * Reads are claims-first — `role`, `banned`, and `activeOrganizationId` ride
 * on the Convex JWT (see `createBetterAuthOptions`'s `definePayload`), so most
 * checks cost no database read. Claims can lag role changes by up to the JWT
 * lifetime (15 min); pass `{ fresh: true }` where that matters.
 */

/** The signed-in user, as read from identity claims. */
export interface AuthorizationUser {
  /** Better Auth user id (the component's `user` document id). */
  id: string
  email: string
  name: string
  /** App-wide role from the admin plugin; `'user'` when unset. */
  role: string
  banned: boolean
  /** The session's active workspace, or `null` when none. */
  activeOrganizationId: string | null
  /** All identity claims, for anything not surfaced above. */
  claims: Record<string, unknown>
}

/** A workspace membership, as returned by {@link Authorization.requireMember}. */
export interface AuthorizationMember {
  user: AuthorizationUser
  organizationId: string
  /** The member's role *within the workspace* (owner/admin/member or custom). */
  role: string
}

/** Any Convex ctx that can read identity and run component queries. */
export interface AuthorizationCtx {
  auth: Auth
  runQuery: GenericActionCtx<GenericDataModel>['runQuery']
}

/** A role with a Better Auth access-control statement check. */
export interface StatementRole {
  authorize: (permissions: Record<string, string[]>) => { success: boolean, error?: string }
}

/**
 * The component handle {@link setupAuthorization} reads from your generated
 * `components` object: the package's all-in-one `backend` component, whose
 * auth adapter functions it queries through. Pass the whole `components`
 * object — the key is picked structurally.
 */
export interface AuthorizationComponents {
  backend: {
    adapter: {
      findOne: unknown
      updateOne: unknown
    }
  }
}

type AdapterWhere = Array<{ field: string, value: string | number | boolean | null }>
type AdapterFindOne = FunctionReference<'query', 'internal', { model: string, where?: AdapterWhere }, unknown>
type AdapterUpdateOne = FunctionReference<'mutation', 'internal', {
  input: { model: string, update: Record<string, unknown>, where?: AdapterWhere }
}, unknown>

export interface SetupAuthorizationOptions<DM extends GenericDataModel = GenericDataModel> {
  /**
   * Statement roles for {@link Authorization.requirePermission} — pass the
   * same `roles` map you gave the admin plugin (`createAccessControl` roles).
   * Defaults to the admin plugin's built-in `admin`/`user` roles.
   */
  roles?: Record<string, StatementRole>
  /**
   * Your `internalMutation` builder — supplying it adds the `setUserRole`
   * bootstrap mutation (run `npx convex run functions:setUserRole
   * '{"email":"you@example.com","role":"admin"}'` to mint the first admin).
   */
  internalMutation?: MutationBuilder<DM, 'internal'>
}

export interface Authorization {
  /** The signed-in user from identity claims, or `null` when signed out. */
  getUser: (ctx: AuthorizationCtx) => Promise<AuthorizationUser | null>
  /** The signed-in user; throws `Unauthenticated` when signed out, `Forbidden` when banned. */
  requireUser: (ctx: AuthorizationCtx) => Promise<AuthorizationUser>
  /**
   * Require an app-wide role. `fresh: true` re-reads the user document past
   * JWT staleness — use it for sensitive checks right after role changes.
   */
  requireRole: (ctx: AuthorizationCtx, role: string | string[], options?: { fresh?: boolean }) => Promise<AuthorizationUser>
  /**
   * Require permission statements (e.g. `{ user: ['ban'] }`) against the user's
   * role. `fresh: true` re-reads the user document past JWT staleness — use it
   * for permission-gated destructive operations right after role changes.
   */
  requirePermission: (ctx: AuthorizationCtx, permissions: Record<string, string[]>, options?: { fresh?: boolean }) => Promise<AuthorizationUser>
  /** Require an active workspace on the session; returns its id. */
  requireOrganization: (ctx: AuthorizationCtx) => Promise<{ user: AuthorizationUser, organizationId: string }>
  /**
   * Require workspace membership (always a fresh member-table read). Defaults
   * to the active workspace; pass `role` to also require a workspace role.
   */
  requireMember: (ctx: AuthorizationCtx, options?: { organizationId?: string, role?: string | string[] }) => Promise<AuthorizationMember>
  /** Bootstrap role assignment — present when `internalMutation` was supplied. */
  setUserRole?: RegisteredMutation<'internal', { email: string, role: string }, Promise<null>>
}

/**
 * Build the authorization helpers over the `backend` component's auth adapter.
 *
 * @example
 * ```ts
 * // convex/functions.ts
 * import { setupAuthorization } from 'nuxt-backend/convex/authorization'
 * import { components } from './_generated/api'
 * import { internalMutation } from './_generated/server'
 *
 * export const authorization = setupAuthorization(components, { internalMutation })
 * export const { requireUser, requireRole, requireOrganization, setUserRole } = authorization
 * ```
 */
export function setupAuthorization<DM extends GenericDataModel = GenericDataModel>(
  components: AuthorizationComponents,
  options: SetupAuthorizationOptions<DM> = {},
): Authorization {
  const statementRoles: Record<string, StatementRole> = options.roles ?? (defaultRoles as unknown as Record<string, StatementRole>)
  const findOne = components.backend.adapter.findOne as AdapterFindOne
  const updateOne = components.backend.adapter.updateOne as AdapterUpdateOne

  const getUser = async (ctx: AuthorizationCtx): Promise<AuthorizationUser | null> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    const claims = identity as unknown as Record<string, unknown>
    return {
      id: identity.subject,
      email: typeof claims.email === 'string' ? claims.email : '',
      name: typeof claims.name === 'string' ? claims.name : '',
      role: typeof claims.role === 'string' && claims.role ? claims.role : 'user',
      banned: claims.banned === true,
      activeOrganizationId: typeof claims.activeOrganizationId === 'string' ? claims.activeOrganizationId : null,
      claims,
    }
  }

  const requireUser = async (ctx: AuthorizationCtx): Promise<AuthorizationUser> => {
    const user = await getUser(ctx)
    if (!user) throw new ConvexError('Unauthenticated')
    if (user.banned) throw new ConvexError('Forbidden: account is banned')
    return user
  }

  const hasAnyRole = (userRole: string, required: string | string[]): boolean => {
    const requiredRoles = Array.isArray(required) ? required : [required]
    // Better Auth stores multiple roles comma-separated.
    const userRoles = userRole.split(',').map(role => role.trim())
    return requiredRoles.some(role => userRoles.includes(role))
  }

  // Re-read the user document past JWT staleness, mutating `user.role`/`banned`
  // in place. Throws when the account has since been deleted or banned.
  const refreshUser = async (ctx: AuthorizationCtx, user: AuthorizationUser): Promise<void> => {
    const document = await ctx.runQuery(findOne, {
      model: 'user',
      where: [{ field: '_id', value: user.id }],
    }) as { role?: string | null, banned?: boolean | null } | null
    if (!document) throw new ConvexError('Unauthenticated')
    if (document.banned) throw new ConvexError('Forbidden: account is banned')
    user.role = document.role || 'user'
    user.banned = false
  }

  const requireRole: Authorization['requireRole'] = async (ctx, role, { fresh } = {}) => {
    const user = await requireUser(ctx)
    if (fresh) await refreshUser(ctx, user)
    if (!hasAnyRole(user.role, role)) {
      throw new ConvexError('Forbidden: missing required role')
    }
    return user
  }

  const requirePermission: Authorization['requirePermission'] = async (ctx, permissions, { fresh } = {}) => {
    const user = await requireUser(ctx)
    if (fresh) await refreshUser(ctx, user)
    const allowed = user.role.split(',').some((role) => {
      const statementRole = statementRoles[role.trim()]
      return statementRole ? statementRole.authorize(permissions).success : false
    })
    if (!allowed) throw new ConvexError('Forbidden: missing required permission')
    return user
  }

  const requireOrganization: Authorization['requireOrganization'] = async (ctx) => {
    const user = await requireUser(ctx)
    if (!user.activeOrganizationId) {
      throw new ConvexError('No active organization — create or activate a workspace first')
    }
    return { user, organizationId: user.activeOrganizationId }
  }

  const requireMember: Authorization['requireMember'] = async (ctx, memberOptions = {}) => {
    const user = await requireUser(ctx)
    const organizationId = memberOptions.organizationId ?? user.activeOrganizationId
    if (!organizationId) {
      throw new ConvexError('No active organization — create or activate a workspace first')
    }
    const member = await ctx.runQuery(findOne, {
      model: 'member',
      where: [
        { field: 'userId', value: user.id },
        { field: 'organizationId', value: organizationId },
      ],
    }) as { role?: string } | null
    if (!member) throw new ConvexError('Forbidden: not a member of this workspace')
    const memberRole = member.role ?? 'member'
    if (memberOptions.role && !hasAnyRole(memberRole, memberOptions.role)) {
      throw new ConvexError('Forbidden: missing required workspace role')
    }
    return { user, organizationId, role: memberRole }
  }

  const setUserRole = options.internalMutation?.({
    args: { email: v.string(), role: v.string() },
    returns: v.null(),
    handler: async (ctx, { email, role }: { email: string, role: string }) => {
      const user = await ctx.runQuery(findOne, {
        model: 'user',
        where: [{ field: 'email', value: email }],
      })
      if (!user) throw new ConvexError(`No user with email ${email}`)
      await ctx.runMutation(updateOne, {
        input: { model: 'user', update: { role }, where: [{ field: 'email', value: email }] },
      })
      return null
    },
  }) as Authorization['setUserRole']

  return {
    getUser,
    requireUser,
    requireRole,
    requirePermission,
    requireOrganization,
    requireMember,
    ...(setUserRole ? { setUserRole } : {}),
  }
}

// Building blocks for custom roles/permissions, re-exported so consumers
// don't import Better Auth internals directly.
export { createAccessControl } from 'better-auth/plugins/access'
export { adminAc, defaultStatements, userAc } from 'better-auth/plugins/admin/access'
