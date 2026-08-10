import { customAction, customCtx, customMutation, customQuery } from 'convex-helpers/server/customFunctions'
import type { ActionBuilder, GenericDataModel, MutationBuilder, QueryBuilder } from 'convex/server'
import type { Authorization, AuthorizationCtx, AuthorizationUser } from './authorization'

/** The workspace context injected by the `org` tier. */
export interface FunctionOrganization {
  id: string
  /** The caller's role within the workspace (owner/admin/member or custom). */
  role: string
}

/** A rate limiter compatible with `setupRateLimiter(...)` from `nuxt-backend/rate-limit`. */
export interface FunctionsRateLimiter {
  limit: (
    ctx: never,
    name: never,
    options?: { key?: string, throws?: boolean },
  ) => Promise<unknown>
}

export interface CreateFunctionsOptions {
  /** App-wide roles that pass the `admin` tier. Default `['admin']`. */
  adminRoles?: string[]
  /** Rate limiter to guard write tiers (`setupRateLimiter(...)`). */
  rateLimiter?: FunctionsRateLimiter
  /**
   * Named rate limits per tier, consumed on **mutations and actions** (keyed
   * by user id; queries are reads and can't consume a limit). E.g.
   * `{ authed: 'apiWrites' }` with a matching limit in `setupRateLimiter`.
   */
  limits?: Partial<Record<'authed' | 'org' | 'admin', string>>
}

type Builders<DM extends GenericDataModel> = {
  query: QueryBuilder<DM, 'public'>
  mutation: MutationBuilder<DM, 'public'>
  action: ActionBuilder<DM, 'public'>
}

/**
 * Pre-authorized function builders over your `_generated/server` builders —
 * grouped by tier, each a drop-in `{ query, mutation, action }`:
 *
 * ```ts
 * const { authed, org, admin, withRole } = createFunctions({ query, mutation, action }, authorization)
 *
 * export const me = authed.query({           // ctx.user (requireUser)
 *   args: {},
 *   handler: async (ctx) => ctx.user,
 * })
 * export const createProject = org.mutation({ // + ctx.organization (fresh membership)
 *   args: { name: v.string() },
 *   handler: async (ctx, { name }) =>
 *     ctx.db.insert('projects', { name, organizationId: ctx.organization.id }),
 * })
 * export const purge = admin.action({ ... })   // requireRole(adminRoles)
 * export const review = withRole('editor').query({ ... })
 * ```
 *
 * The `org` tier verifies membership with a fresh member-table read on every
 * call (a removed member is locked out immediately, not at JWT expiry).
 * `authed`/`admin`/`withRole` are claims-based — see `requireRole`'s `fresh`
 * option when you need stronger guarantees. Pass your `withTriggers`-wrapped
 * `mutation` to keep aggregate triggers composing.
 */
export function createFunctions<DM extends GenericDataModel>(
  builders: Builders<DM>,
  authorization: Authorization,
  options: CreateFunctionsOptions = {},
) {
  const adminRoles = options.adminRoles ?? ['admin']

  const consumeLimit = async (ctx: AuthorizationCtx, tierName: keyof NonNullable<CreateFunctionsOptions['limits']>, user: AuthorizationUser) => {
    const name = options.limits?.[tierName]
    if (!name || !options.rateLimiter) return
    await options.rateLimiter.limit(ctx as never, name as never, { key: user.id, throws: true })
  }

  const tier = <Extra extends { user: AuthorizationUser }>(
    tierName: keyof NonNullable<CreateFunctionsOptions['limits']>,
    resolve: (ctx: AuthorizationCtx) => Promise<Extra>,
  ) => ({
    query: customQuery(builders.query, customCtx(ctx => resolve(ctx as unknown as AuthorizationCtx))),
    mutation: customMutation(builders.mutation, customCtx(async (ctx) => {
      const extra = await resolve(ctx as unknown as AuthorizationCtx)
      await consumeLimit(ctx as unknown as AuthorizationCtx, tierName, extra.user)
      return extra
    })),
    action: customAction(builders.action, customCtx(async (ctx) => {
      const extra = await resolve(ctx as unknown as AuthorizationCtx)
      await consumeLimit(ctx as unknown as AuthorizationCtx, tierName, extra.user)
      return extra
    })),
  })

  return {
    /** Signed-in (and not banned): injects `ctx.user`. */
    authed: tier('authed', async ctx => ({ user: await authorization.requireUser(ctx) })),
    /** Workspace member (fresh check): injects `ctx.user` + `ctx.organization`. */
    org: tier('org', async (ctx) => {
      const member = await authorization.requireMember(ctx)
      return { user: member.user, organization: { id: member.organizationId, role: member.role } satisfies FunctionOrganization }
    }),
    /** App-wide admin (`adminRoles`): injects `ctx.user`. */
    admin: tier('admin', async ctx => ({ user: await authorization.requireRole(ctx, adminRoles) })),
    /** Custom app-wide role tier: `withRole('editor').query(...)`. */
    withRole: (role: string | string[]) =>
      tier('authed', async ctx => ({ user: await authorization.requireRole(ctx, role) })),
  }
}
