import type { GenericCtx } from '@convex-dev/better-auth'
import { APIError } from 'better-auth/api'
import { betterAuth } from 'better-auth/minimal'
import { type FunctionReference, mutationGeneric, type GenericDataModel, type GenericQueryCtx, type QueryBuilder } from 'convex/server'
import { v } from 'convex/values'
import { backendError } from '../errors.js'
import { type AdapterFindOne, createAccessReads, refuseCaller } from '../integrations/access.js'
import type { AuthBuildOptions, AuthIntegrations, AuthSetupComponents, DeviceSession, SetupAuthOptions, SignInAlert } from './auth-types.js'
import { buildAuthOptions } from './better-auth-options.js'
import { type BackendPaths, resolveBackendPaths } from '../paths.js'
import { componentAdapterRefs, createAuthComponent, resolveIntegrations } from './component.js'
import { entityListenersOf } from './entities.js'
import { identitySessionId } from './identity.js'
import { userSessions } from './sessions.js'

/**
 * The auth layer's request error, re-exported so an app needs no direct
 * dependency on the auth library. Throw it from a hook `setupAuth` passes
 * through (`authOptions.databaseHooks`, `authOptions.hooks`) to
 * refuse with a status and a message the client shows, not a bare 500:
 * `throw new APIError('BAD_REQUEST', { message: 'Invite a company address.' })`.
 * Add a catalog `code` and its fields to the body
 * (`{ code: 'invalid_input', field: 'email', message }`) and the client
 * reads it with `getBackendError` like the package's own refusals.
 */
export { APIError }

/** The app's paths `setupAuth({ paths })` takes: the `paths` of the generated `paths.generated.ts`. */
export type { BackendPaths } from '../paths.js'

/**
 * How the package names a code sign-in for Better Auth's `lastLoginMethod`
 * plugin, for an app that passes its own (to set the cookie only with a
 * person's consent, say).
 */
export { resolveSignInMethod, storesLastSignInCookie } from './plugins.js'

// `setupAuth` is the entry's one builder: every auth instance is built
// through it. The public types live in auth-types.ts and are re-exported in
// declaration order; the rest of the implementation sits next to this file,
// one responsibility per module.
export type {
  AuthMutationCtx,
  AuthEmail,
  AuthRateLimitName,
  AuthRateLimiter,
  AuthCreatedUser,
  OnUserCreated,
  AuthDeletedUser,
  OnUserDeleted,
  CanSignInPurpose,
  CanSignInInput,
  CanSignInVerdict,
  CanSignIn,
  AuthAccount,
  AuthAudit,
  AuthIntegrations,
  AdminPluginOptions,
  WorkspaceOptions,
  WorkspaceHook,
  WorkspaceHookWorkspace,
  WorkspaceCreatedEvent,
  WorkspaceMemberEvent,
  WorkspaceInviteInput,
  AuthAccess,
  SetupAuthOptions,
  AuthSetupComponents,
  DeviceSession,
  SignInAlert,
} from './auth-types.js'
/** `setupAuth`'s `createAuth`: the auth instance for one request ctx. */
type AuthFactory<DM extends GenericDataModel> = (ctx: GenericCtx<DM>) => { api: { revokeSession: (input: { body: { token: string }, headers: Headers }) => Promise<unknown> } }

/**
 * The app functions `setupAuth` returns for the scaffold to re-export,
 * following Convex's API remounting pattern for component client code.
 */
function authApi<DM extends GenericDataModel>(
  components: AuthSetupComponents,
  queryBuilder: QueryBuilder<DM, 'public'>,
  options: AuthBuildOptions<DM>,
  createAuth: AuthFactory<DM>,
  keepPath?: string,
) {
  const authComponent = createAuthComponent<DM>(components.backend)
  const adapter = componentAdapterRefs(components)
  const reads = createAccessReads(adapter.findOne as unknown as AdapterFindOne)

  /**
   * Refuse an account deleted or banned since its token was minted, read
   * fresh: what the functions that change the account check before they
   * act. The reads read the token's claims.
   */
  const requireLiveAccount = async (ctx: { runQuery: GenericQueryCtx<DM>['runQuery'] }, userId: string, what: string): Promise<void> => {
    const account = await reads.account(ctx as never, userId)
    if (!account) throw backendError('unauthenticated', {}, `${what}: this account no longer exists.`)
    if (account.banned) throw backendError('forbidden', { reason: 'banned' }, `${what}: this account is banned.`)
  }

  // The signed-in account, without the hash of a passkey-only account's
  // recovery code: it is the server's alone, as Better Auth's own reads
  // never return it either.
  const getAuthUser = queryBuilder({
    args: {},
    handler: async (ctx) => {
      const { recoveryCodeHash: _hash, ...user } = await authComponent.getAuthUser(ctx)
      return user
    },
  })

  // The paths the deployment links to and serves on, for diagnostics: each
  // must equal what nuxt.config declares, and only `nuxt-backend doctor` can
  // see both sides to compare them (`page-paths`). Equal whenever the
  // deployed code carries the generated paths file.
  // The keep link is built by setupAccount from its own `paths`: the path it
  // really uses is reported, not the one setupAuth was given.
  const paths: BackendPaths = { ...resolveBackendPaths(options.paths, 'setupAuth'), ...(keepPath ? { keepAccount: keepPath } : {}) }
  const authConfig = queryBuilder({
    args: {},
    handler: async () => ({ paths }),
  })

  // Name-only by design: an email change needs a code from each address,
  // so the profile page cannot move an account to an unproven address
  // through this mutation.
  // `mutationGeneric` because `setupAuth` receives only a query builder.
  const updateProfile = mutationGeneric({
    args: { name: v.string() },
    handler: async (ctx, { name }) => {
      const identity = await ctx.auth.getUserIdentity()
      if (!identity) throw backendError('unauthenticated', {}, 'Sign in to update your profile.')
      await requireLiveAccount(ctx, identity.subject, 'updateProfile')
      const trimmed = name.trim()
      if (!trimmed || trimmed.length > 256) {
        throw backendError('invalid_input', { field: 'name' }, 'Name must be 1-256 characters.')
      }
      await ctx.runMutation(adapter.updateOne, {
        input: {
          model: 'user',
          where: [{ field: '_id', value: identity.subject }],
          update: { name: trimmed, updatedAt: Date.now() },
        },
      })
      return null
    },
  })

  // The caller's device sessions, read from the session table the way
  // upstream's `safeGetAuthUser` reads it. Better Auth's /list-sessions is no
  // use here: it refuses any session older than `freshAge`, which the package
  // sets to RECENT_SIGN_IN_SECONDS (ten minutes), so a settings page would
  // break for everyone signed in more than ten minutes ago.
  // Rows carry ids, never tokens. `null` for signed-out callers and for tokens
  // that belong to no session.
  const listSessions = queryBuilder({
    args: {},
    handler: async (ctx): Promise<DeviceSession[] | null> => {
      const identity = await ctx.auth.getUserIdentity()
      const sessionId = identitySessionId(identity)
      if (!identity || !sessionId) return null
      const rows = await userSessions(ctx, adapter, identity.subject)
      return rows.map(row => ({
        id: row._id,
        userAgent: row.userAgent ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        expiresAt: row.expiresAt,
        current: row._id === sessionId,
      }))
    },
  })

  // Sign one of the caller's sessions out, by id. The id is looked up among
  // the caller's own sessions, then Better Auth's /revoke-session does the
  // rest with headers built from the caller's session (`getAuth`), so its
  // ownership check, database hooks and secondary storage all apply. The
  // token never reaches the browser. Signing someone's devices out is theirs
  // to do: an administrator impersonating them is refused.
  const revokeSession = mutationGeneric({
    args: { sessionId: v.string() },
    handler: async (ctx, { sessionId }) => {
      const identity = await ctx.auth.getUserIdentity()
      if (!identity) throw backendError('unauthenticated', {}, 'Sign in to manage your sessions.')
      refuseCaller(identity as unknown as Record<string, unknown>, { impersonation: 'refused' }, 'revokeSession')
      if (!identitySessionId(identity)) throw backendError('unauthenticated', {}, 'Sign in to manage your sessions.')
      await requireLiveAccount(ctx, identity.subject, 'revokeSession')
      const target = (await userSessions(ctx, adapter, identity.subject)).find(row => row._id === sessionId)
      if (!target) throw backendError('invalid_input', { field: 'sessionId' }, 'Session not found.')
      const { auth, headers } = await authComponent.getAuth(createAuth as never, ctx as unknown as GenericCtx<DM>)
      await (auth as unknown as ReturnType<AuthFactory<DM>>).api.revokeSession({ body: { token: target.token }, headers })
      return null
    },
  })

  // The caller's latest sign-ins from a new device, and with the recovery
  // code: the Alerts section of the security page. Each names its device
  // and, while it lasts, its session, which the section signs out. `null`
  // signed out; `[]` from a backend component that keeps no devices.
  const devices = (components.backend as { devices?: { alerts: FunctionReference<'query', 'internal', { userId: string }, SignInAlert[]> } }).devices
  const listSignInAlerts = queryBuilder({
    args: {},
    handler: async (ctx): Promise<SignInAlert[] | null> => {
      const identity = await ctx.auth.getUserIdentity()
      if (!identity) return null
      return devices ? await ctx.runQuery(devices.alerts, { userId: identity.subject }) : []
    },
  })

  return {
    getAuthUser,
    authConfig,
    updateProfile,
    listSessions,
    revokeSession,
    listSignInAlerts,
  }
}

/** The `workspaces` options setupAuth reads; the organization plugin's own options pass through none. */
const WORKSPACE_KEYS = new Set(['invitationExpiresIn', 'canInvite', 'onCreate', 'onMemberAdded', 'onMemberRemoved'])

/** What replaces an organization plugin option that `workspaces` no longer passes through. */
const WORKSPACE_REPLACEMENTS: Readonly<Record<string, string>> = {
  organizationHooks: 'its invitation guard is `canInvite`, and its after-hooks are `onCreate`, `onMemberAdded` and `onMemberRemoved`',
  sendInvitationEmail: 'the `invite` template of your setupEmail instance sends it',
  invitationPath: 'set `backend.pages.acceptInvitation` in nuxt.config, and pass the `paths` of paths.generated.ts to setupAuth',
}

/**
 * Refuse a `workspaces` key setupAuth does not read: an option the
 * organization plugin took (a guard in `organizationHooks`, a limit) would
 * otherwise be dropped without a word, and a guard an app kept would fail
 * open.
 */
function assertWorkspaceOptions(workspaces: unknown): void {
  if (!workspaces || typeof workspaces !== 'object') return
  const unknown = Object.keys(workspaces).filter(key => !WORKSPACE_KEYS.has(key))
  if (unknown.length === 0) return
  const hints = unknown.map(key => WORKSPACE_REPLACEMENTS[key] ? `\`${key}\` (${WORKSPACE_REPLACEMENTS[key]})` : `\`${key}\``)
  throw new TypeError(
    `[nuxt-backend] setupAuth: \`workspaces\` does not take ${hints.join(', ')}. It reads ${[...WORKSPACE_KEYS].join(', ')}; `
    + 'refuse an invitation with `canInvite`, and react to workspace changes with `onCreate`, `onMemberAdded` and `onMemberRemoved`.',
  )
}

/**
 * Check what the types cannot: `email` is required, but an import cycle hands
 * `setupAuth` `undefined` all the same, and then every code, invitation and
 * welcome email stops without a word. A leftover 0.1 `integrations` key
 * would leave the same hole, and so would a `workspaces` key it no longer reads.
 */
function assertSetupOptions(options: unknown): void {
  const given = (options ?? {}) as { email?: { sendTemplate?: unknown }, integrations?: unknown, workspaces?: unknown, authOptions?: object }
  if ('integrations' in given) {
    throw new Error('[nuxt-backend] setupAuth no longer takes `integrations`: pass email, rateLimiter, canSignIn, onUserCreated, onUserDeleted, audit and account at the top level of its options.')
  }
  // The auth route comes from the paths file alone: an `authOptions.basePath` would otherwise be dropped without a word.
  const basePath = 'basePath' in given ? 'basePath' : given.authOptions && 'basePath' in given.authOptions ? 'authOptions.basePath' : null
  if (basePath) {
    throw new TypeError(`[nuxt-backend] setupAuth no longer takes \`${basePath}\`: set \`backend.authRoute\` in nuxt.config, and pass the \`paths\` of paths.generated.ts, which the Nuxt module writes from it.`)
  }
  assertWorkspaceOptions(given.workspaces)
  if (typeof given.email?.sendTemplate !== 'function') {
    throw new TypeError(
      '[nuxt-backend] setupAuth needs `email`, the app\'s setupEmail instance, and got '
      + `${given.email === undefined ? 'undefined' : 'something else'}. When backend/email.ts exports it, this is almost always an import cycle: `
      + 'email.ts imports a module that imports auth.ts (email.ts importing functions.ts, which imports billing.ts, which imports email.ts, say), '
      + 'so auth.ts runs before email.ts has exported `email`. Keep backend/email.ts free of imports that lead back to ./auth.',
    )
  }
}

/** The cross-component options. */
function integrationsOf<DM extends GenericDataModel>(options: SetupAuthOptions<DM>): AuthIntegrations<DM> {
  const { email, rateLimiter, onUserCreated, canSignIn, onUserDeleted, audit, account } = options
  return { email, rateLimiter, onUserCreated, canSignIn, onUserDeleted, audit, account }
}

/**
 * The app's auth, from one call: the auth instance factory, the functions the
 * scaffold re-exports. Every auth email goes
 * out through the `email` instance, with the templates it holds.
 *
 * @example
 * ```ts
 * import { setupAuth } from 'nuxt-backend/auth'
 * import { components } from './_generated/api'
 * import { query } from './_generated/server'
 * import { email } from './email'
 *
 * export const { authComponent, createAuth, getAuthUser } = setupAuth(components, query, {
 *   email,
 *   canSignIn: async (ctx, { email }) => email.endsWith('@acme.com'),
 * })
 * ```
 */
export function setupAuth<
  DM extends GenericDataModel,
>(
  components: AuthSetupComponents,
  queryBuilder: QueryBuilder<DM, 'public'>,
  options: SetupAuthOptions<DM>,
) {
  assertSetupOptions(options)
  const { email: _email, rateLimiter: _rateLimiter, onUserCreated: _onUserCreated, canSignIn: _canSignIn, onUserDeleted: _onUserDeleted, audit: _audit, account: _account, access, ...buildOptions } = options
  const authComponent = createAuthComponent<DM>(components.backend)
  const runtime = { ...resolveIntegrations(components, integrationsOf(options)), ...(access ? { access: access.gate } : {}), paths: resolveBackendPaths(options.paths, 'setupAuth') }

  // Every workspace and account it makes is told to billing's free plan: through
  // the listener `registerBackendRoutes` connects, else by its function's name.
  const createAuth = (ctx: GenericCtx<DM>) => betterAuth(buildAuthOptions(authComponent.adapter(ctx), buildOptions, { ctx, ...runtime, entityCreated: listened }))
  const listened = entityListenersOf(createAuth)

  return {
    authComponent,
    createAuth,
    ...authApi(components, queryBuilder, buildOptions, createAuth, options.account?.keepPath),
  }
}
