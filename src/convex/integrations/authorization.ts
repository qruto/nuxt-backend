import type { Auth, FunctionReference, GenericActionCtx, GenericDataModel, RegisteredMutation } from 'convex/server'
import { internalMutationGeneric } from 'convex/server'
import { v } from 'convex/values'
import { AUTH_TIME_CLAIM, IMPERSONATED_BY_CLAIM, RECENT_SIGN_IN_SECONDS, SIGN_IN_METHOD_CLAIM, SIGN_IN_METHODS, type SignInMethod } from '../constants.js'
import { backendError } from '../errors.js'
import { eventRole } from '../events.js'
import { logBackend } from '../log.js'
import { type AdapterFindOne, type CallerRule, createAccessReads, hasAnyRole, passkeyOnlyAdminRefusal, refuseCaller, refuseStaleSignIn, signInRefusal } from './access.js'

export type { CallerRule } from './access.js'

/**
 * Authorization over the bundled Better Auth setup: app-wide role checks
 * (admin plugin) and workspace membership checks. Internal: `createFunctions`
 * (`nuxt-backend/functions`) builds its tiers on it, and the tiers are the
 * public way in. A role is a name, so there are no permission statements.
 *
 * The app-wide role and ban are read from the token's claims — `role`,
 * `banned`, the active workspace and `impersonatedBy` ride on the
 * Convex JWT (see `setupAuth`) — unless a check passes `{ fresh: true }`:
 * claims can lag a role change by up to the JWT lifetime (15 min).
 * Workspace membership (`requireMember`, `requireWorkspace`) is always
 * read fresh from the member table. A fresh read is made once per function
 * invocation and reused by every check after it in the same call; pass
 * `{ reread: true }` to read again after the call changed the membership or
 * the role it checks.
 *
 * Every check takes a {@link CallerRule}: `{ impersonation: 'refused' }`
 * refuses a session an administrator opened as the user, and `recentSignIn`
 * (seconds) refuses
 * a sign-in older than that as `reauthentication_required`
 * ({@link Authorization.requireRecentSignIn}).
 */

/**
 * Refuse to check a recent sign-in from a query, before anything else is
 * read: a query is not rerun as time passes, so the window would hold only
 * when it first ran, and a query must not read the clock. A query's ctx
 * reads the database and can write nothing; a mutation's can, and an
 * action's has no database of its own.
 */
function assertWindowCtx(ctx: AuthorizationCtx, within: number | undefined): void {
  if (within === undefined) return
  const db = (ctx as { db?: { insert?: unknown } }).db
  if (db && typeof db.insert !== 'function') {
    throw new TypeError('[nuxt-backend] A recent sign-in is checked in a mutation or an action: a query is not rerun as time passes, so it cannot hold a window.')
  }
}

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
  activeWorkspaceId: string | null
  /**
   * The admin impersonating this user, or `null` for the user's own session.
   * Refuse what an impersonating admin must not do: `if (user.impersonatedBy) throw …`.
   */
  impersonatedBy: string | null
  /**
   * When the person signed in to the session the token belongs to, as epoch
   * milliseconds (the `authTime` claim), or `null` for a
   * token minted before the claim existed.
   */
  authTime: number | null
  /**
   * How the person signed in to this session: `'passkey'` or
   * `'email-otp'` (the `signInMethod` claim, the session's own, never the
   * account's last sign-in elsewhere); `null` for an administrator's visit
   * and a token minted before the claim existed. Hold a passkey-only step to
   * it: `if (ctx.user.signInMethod !== 'passkey') throw …`.
   */
  signInMethod: SignInMethod | null
  /** All identity claims, for anything not surfaced above. */
  claims: Record<string, unknown>
}

/** The `signInMethod` claim, when it names one of the methods; `null` otherwise, and for a visit. */
function signInMethodOf(claims: Record<string, unknown>): SignInMethod | null {
  if (typeof claims[IMPERSONATED_BY_CLAIM] === 'string') return null
  const method = claims[SIGN_IN_METHOD_CLAIM]
  return (SIGN_IN_METHODS as readonly unknown[]).includes(method) ? method as SignInMethod : null
}

/** A workspace membership, as returned by {@link Authorization.requireMember}. */
export interface AuthorizationMember {
  user: AuthorizationUser
  workspaceId: string
  /** The member's role *within the workspace* (owner/admin/member or custom). */
  role: string
}

/** A workspace the caller belongs to, as the `workspace` tier injects it as `ctx.workspace`. */
export interface AuthorizationWorkspace {
  id: string
  slug: string
  name: string
  /** The caller's role *within the workspace* (owner/admin/member or custom). */
  role: string
}

/** Any Convex ctx that can read identity and run component queries. */
export interface AuthorizationCtx {
  auth: Auth
  runQuery: GenericActionCtx<GenericDataModel>['runQuery']
}

/**
 * How a check reads the account: `fresh: true` reads the user table instead
 * of the token's claims, once per function invocation; `reread: true` reads
 * it again even when the same call already read it (after the call changed
 * the role or the membership it checks).
 */
export interface FreshRead {
  fresh?: boolean
  reread?: boolean
}

/**
 * The component handle `createFunctions` reads from your generated
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
    /** The activity trail `setUserRole` records a role change on; absent from a component built before it. */
    audit?: {
      record: unknown
    }
  }
}

type AdapterWhere = Array<{ field: string, value: string | number | boolean | null }>
type AuditRecord = FunctionReference<'mutation', 'internal', { event: { type: string, subjectId: string, data: { role: string } } }, unknown>
type AdapterUpdateOne = FunctionReference<'mutation', 'internal', {
  input: { model: string, update: Record<string, unknown>, where?: AdapterWhere }
}, unknown>

export interface Authorization {
  /** The signed-in user from identity claims, or `null` when signed out. */
  getUser: (ctx: AuthorizationCtx) => Promise<AuthorizationUser | null>
  /**
   * The signed-in user; throws `unauthenticated` when signed out, `forbidden`
   * (reason `banned`) when banned — catalog codes (see `backendError`).
   * The rule refuses an impersonated session (`forbidden`, reason
   * `impersonating`). `fresh: true`
   * also reads the account, so one banned or deleted since its token was
   * minted is refused at once.
   */
  requireUser: (ctx: AuthorizationCtx, options?: FreshRead & CallerRule) => Promise<AuthorizationUser>
  /**
   * Require an app-wide role. `fresh: true` re-reads the user document past
   * JWT staleness — use it for sensitive checks right after role changes;
   * `reread: true` reads it again even when this call already did.
   */
  requireRole: (ctx: AuthorizationCtx, role: string | string[], options?: FreshRead & CallerRule) => Promise<AuthorizationUser>
  /**
   * Require a workspace the caller still belongs to, the active one by
   * default, read fresh from the member table like
   * {@link Authorization.requireMember}; returns it with its slug, its name
   * and the caller's role there. `no_workspace` without one, `forbidden`
   * (reason `not_member`) once the caller is removed from it.
   */
  requireWorkspace: (ctx: AuthorizationCtx, options?: { workspaceId?: string, role?: string | string[] } & FreshRead & CallerRule) => Promise<{ user: AuthorizationUser, workspace: AuthorizationWorkspace }>
  /**
   * Require workspace membership (always a fresh member-table read, once per
   * call unless `reread: true`). Defaults to the active workspace; pass
   * `role` to also require a workspace role.
   */
  requireMember: (ctx: AuthorizationCtx, options?: { workspaceId?: string, role?: string | string[] } & FreshRead & CallerRule) => Promise<AuthorizationMember>
  /**
   * Require a recent sign-in: the person signed in to this session within
   * `within` seconds (default `RECENT_SIGN_IN_SECONDS`, ten minutes), for
   * a sensitive action of your own. An older sign-in, or a token that names
   * no session, is refused as `reauthentication_required`: the client
   * signs in again (`useReauthentication`) and retries. It fails closed: a
   * session an administrator opened by impersonating the account never
   * passes (`forbidden`, reason `impersonating`), and `unauthenticated` and `banned` refuse as
   * `requireUser` does. `fresh: true` also reads the account, so one
   * banned or deleted since the sign-in is refused at once. Call it from a
   * mutation or an action: a query is not rerun as time passes, so from
   * one it throws a `TypeError`, as does a `recentSignIn` rule on the
   * other checks.
   *
   * @guarantee Passes only a person's own session whose sign-in is at most `within` seconds old.
   */
  requireRecentSignIn: (ctx: AuthorizationCtx, options?: { within?: number } & FreshRead) => Promise<AuthorizationUser>
  /**
   * Refuse an administrator who may not act as one on this deployment: on
   * `sandbox`, an account that is not passkey-only (`forbidden`, reason
   * `passkey_only_admin`). The `admin` tier asks it of every caller its
   * role lets in; the account read is the one the role check made.
   *
   * @internal
   */
  requireAdminSignIn: (ctx: AuthorizationCtx, user: AuthorizationUser) => Promise<void>
}

/**
 * Build the authorization helpers over the `backend` component's auth adapter:
 * what every tier `createFunctions` returns checks its caller with.
 *
 * @internal
 */
export function createAuthorization(components: AuthorizationComponents): Authorization {
  const findOne = components.backend.adapter.findOne as AdapterFindOne
  const reads = createAccessReads(findOne)

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
      activeWorkspaceId: typeof claims.activeOrganizationId === 'string' ? claims.activeOrganizationId : null,
      impersonatedBy: typeof claims[IMPERSONATED_BY_CLAIM] === 'string' ? claims[IMPERSONATED_BY_CLAIM] : null,
      authTime: typeof claims[AUTH_TIME_CLAIM] === 'number' && Number.isFinite(claims[AUTH_TIME_CLAIM]) ? claims[AUTH_TIME_CLAIM] : null,
      signInMethod: signInMethodOf(claims),
      claims,
    }
  }

  // A recent sign-in is checked last, in every require*: who the caller is
  // and what they may do come first. Only a mutation or an action asks
  // (assertWindowCtx).
  const requireUser: Authorization['requireUser'] = async (ctx, { fresh, reread, recentSignIn, ...rule } = {}) => {
    assertWindowCtx(ctx, recentSignIn)
    const user = await getUser(ctx)
    if (!user) throw backendError('unauthenticated', {}, 'Unauthenticated')
    if (user.banned) throw backendError('forbidden', { reason: 'banned' }, 'Forbidden: account is banned')
    refuseCaller(user.claims, rule, 'This function')
    if (fresh || reread) await refreshUser(ctx, user, reread)
    refuseStaleSignIn(user.claims, recentSignIn, 'This function')
    return user
  }

  // Re-read the user document past JWT staleness, mutating `user.role`/`banned`
  // in place. Throws when the account has since been deleted or banned.
  const refreshUser = async (ctx: AuthorizationCtx, user: AuthorizationUser, reread?: boolean): Promise<void> => {
    const account = await reads.account(ctx, user.id, reread)
    if (!account) throw backendError('unauthenticated', {}, 'Unauthenticated')
    if (account.banned) throw backendError('forbidden', { reason: 'banned' }, 'Forbidden: account is banned')
    user.role = account.role
    user.banned = false
  }

  const requireRole: Authorization['requireRole'] = async (ctx, role, { recentSignIn, ...options } = {}) => {
    assertWindowCtx(ctx, recentSignIn)
    const user = await requireUser(ctx, options)
    if (!hasAnyRole(user.role, role)) {
      throw backendError('forbidden', { reason: 'role' }, 'Forbidden: missing required role')
    }
    refuseStaleSignIn(user.claims, recentSignIn, 'This function')
    return user
  }

  const requireMember: Authorization['requireMember'] = async (ctx, { workspaceId: chosen, role, fresh, reread, recentSignIn, ...rule } = {}) => {
    assertWindowCtx(ctx, recentSignIn)
    // `reread` is the membership's; the account is read again only with `fresh`.
    const user = await requireUser(ctx, { ...rule, fresh, reread: fresh ? reread : undefined })
    const workspaceId = chosen ?? user.activeWorkspaceId
    if (!workspaceId) {
      throw backendError('no_workspace', {}, 'No active workspace — create or switch to one first')
    }
    const memberRole = await reads.memberRole(ctx, user.id, workspaceId, reread)
    if (!memberRole) throw backendError('forbidden', { reason: 'not_member' }, 'Forbidden: not a member of this workspace')
    if (role && !hasAnyRole(memberRole, role)) {
      throw backendError('forbidden', { reason: 'workspace_role' }, 'Forbidden: missing required workspace role')
    }
    refuseStaleSignIn(user.claims, recentSignIn, 'This function')
    return { user, workspaceId, role: memberRole }
  }

  // The active workspace, as a membership: the token names it, the member
  // table says whether the caller still belongs to it, and the workspace
  // table gives its slug and name (read once per call, like the membership).
  const requireWorkspace: Authorization['requireWorkspace'] = async (ctx, options = {}) => {
    const { user, workspaceId, role } = await requireMember(ctx, options)
    const workspace = await reads.workspace(ctx, workspaceId, options.reread)
    if (!workspace) throw backendError('forbidden', { reason: 'not_member' }, 'Forbidden: not a member of this workspace')
    return { user, workspace: { id: workspaceId, slug: workspace.slug, name: workspace.name, role } }
  }

  const requireRecentSignIn: Authorization['requireRecentSignIn'] = async (ctx, { within = RECENT_SIGN_IN_SECONDS, fresh, reread } = {}) => {
    if (!Number.isFinite(within) || within <= 0) {
      throw new TypeError(`[nuxt-backend] requireRecentSignIn: \`within\` is a number of seconds above 0, not ${String(within)}.`)
    }
    assertWindowCtx(ctx, within)
    const user = await requireUser(ctx, { fresh, reread })
    const refused = signInRefusal(user.claims, within, 'This function')
    if (refused) throw refused
    return user
  }

  const requireAdminSignIn: Authorization['requireAdminSignIn'] = async (ctx, user) => {
    const account = await reads.account(ctx, user.id)
    const refused = passkeyOnlyAdminRefusal(account ?? {}, user.signInMethod, 'This function')
    if (refused) throw refused
  }

  return {
    getUser,
    requireUser,
    requireRole,
    requireWorkspace,
    requireMember,
    requireRecentSignIn,
    requireAdminSignIn,
  }
}

/**
 * The internal mutation that sets an app-wide role by email: how the first
 * administrator is made (`npx nuxt-backend doctor --fix` runs it, or
 * `npx convex run functions:setUserRole '{"email":"you@example.com","role":"admin"}'`).
 * A role it changes is recorded on the activity trail as
 * `admin.role_changed`, by the app; the role already held records nothing.
 *
 * @internal
 */
export function defineSetUserRole(components: AuthorizationComponents): RegisteredMutation<'internal', { email: string, role: string }, Promise<null>> {
  const findOne = components.backend.adapter.findOne as AdapterFindOne
  const updateOne = components.backend.adapter.updateOne as AdapterUpdateOne
  const recordEvent = components.backend.audit?.record as AuditRecord | undefined
  return internalMutationGeneric({
    args: { email: v.string(), role: v.string() },
    returns: v.null(),
    handler: async (ctx, { email, role }: { email: string, role: string }) => {
      const user = await ctx.runQuery(findOne, {
        model: 'user',
        where: [{ field: 'email', value: email }],
      }) as { _id: string, role?: string | null } | null
      if (!user) throw backendError('invalid_input', { field: 'email' }, `No user with email ${email}`)
      await ctx.runMutation(updateOne, {
        input: { model: 'user', update: { role }, where: [{ field: 'email', value: email }] },
      })
      // On the activity trail, by the app (no one signed in runs it), when
      // it changes the role. Recording never fails the role it records.
      const changed = eventRole(role)
      if (recordEvent && changed && changed !== (eventRole(user.role) ?? 'user')) {
        try {
          await ctx.runMutation(recordEvent, { event: { type: 'admin.role_changed', subjectId: user._id, data: { role: changed } } })
        }
        catch (error) {
          logBackend('warn', 'audit.record_failed', 'The role setUserRole set was not recorded on the activity trail; it is set.', error)
        }
      }
      return null
    },
  }) as RegisteredMutation<'internal', { email: string, role: string }, Promise<null>>
}
