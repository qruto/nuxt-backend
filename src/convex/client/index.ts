import type { GenericCtx } from '@convex-dev/better-auth'
import { APIError } from 'better-auth/api'
import { betterAuth } from 'better-auth/minimal'
import { mutationGeneric, type GenericDataModel, type QueryBuilder } from 'convex/server'
import { v } from 'convex/values'
import { DEFAULT_AGENT_CONSENT_PATH, DEFAULT_INVITATION_PATH, DEFAULT_LOGIN_PATH } from '../constants.js'
import { backendError } from '../errors.js'
import { setupMcp, type McpExchange } from '../integrations/mcp.js'
import type { AuthBuildOptions, AuthIntegrations, AuthSetupComponents, DeviceSession, SetupAuthOptions } from './auth-types.js'
import { buildAuthOptions } from './better-auth-options.js'
import { componentAdapterRefs, createAuthComponent, resolveIntegrations } from './component.js'
import { convexSignerJwt } from './plugins.js'
import { identitySessionId, userSessions } from './sessions.js'
import { workspaceQueries } from './workspaces.js'

/**
 * The auth layer's request error, re-exported so an app needs no direct
 * dependency on the auth library. Throw it from a hook `setupAuth` passes
 * through (`authOptions.databaseHooks`, `organization.organizationHooks`) to
 * refuse with a status and a message the client shows, not a bare 500:
 * `throw new APIError('BAD_REQUEST', { message: 'Invite a company address.' })`.
 * Add a catalog `code` and its fields to the body
 * (`{ code: 'invalid_input', field: 'email', message }`) and the client
 * reads it with `getBackendError` like the package's own refusals.
 */
export { APIError }

// `setupAuth` is the entry's one function: every auth instance is built
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
  AuthIntegrations,
  AdminPluginOptions,
  OrganizationPluginOptions,
  McpAuthOptions,
  SetupAuthOptions,
  AuthSetupComponents,
  DeviceSession,
} from './auth-types.js'
/** The agent token exchange `setupAuth` returns as `mcp`, for `registerBackendRoutes({ auth })`. */
export type { McpExchange } from '../integrations/mcp.js'
/** `setupAuth`'s `createAuth`: the auth instance for one request ctx. */
type AuthFactory<DM extends GenericDataModel> = (ctx: GenericCtx<DM>) => { api: { revokeSession: (input: { body: { token: string }, headers: Headers }) => Promise<unknown> } }

/**
 * The app functions `setupAuth` returns for the scaffold to re-export,
 * following Convex's API remounting pattern for component client code.
 */
function authApi<DM extends GenericDataModel>(
  components: AuthSetupComponents,
  queryBuilder: QueryBuilder<DM, 'public'>,
  options: AuthBuildOptions,
  createAuth: AuthFactory<DM>,
) {
  const authComponent = createAuthComponent<DM>(components.backend)
  const adapter = componentAdapterRefs(components)

  const getAuthUser = queryBuilder({
    args: {},
    handler: async (ctx) => {
      return authComponent.getAuthUser(ctx)
    },
  })

  // Deployment-side view of cross-boundary auth config, for diagnostics: each
  // Convex-side path must equal the Nuxt page it points at (`invitationPath`
  // and `pages.acceptInvitation`, the agent login and consent paths and
  // `pages.login` / `pages.agentConsent`), and only `nuxt-backend doctor` can
  // see both sides to compare them.
  const invitationPath = options.organization?.invitationPath ?? DEFAULT_INVITATION_PATH
  const agentLoginPath = options.mcp?.loginPath ?? DEFAULT_LOGIN_PATH
  const agentConsentPath = options.mcp?.consentPath ?? DEFAULT_AGENT_CONSENT_PATH
  const authConfig = queryBuilder({
    args: {},
    handler: async () => ({ invitationPath, agentLoginPath, agentConsentPath }),
  })

  // The caller's workspaces and their members (see workspaces.ts).
  const { listWorkspaces, listWorkspaceMembers } = workspaceQueries(queryBuilder, adapter)

  // Name-only by design: an email change needs a code from each address,
  // so neither the profile page nor an agent can move an account to an
  // unproven address through this mutation.
  // `mutationGeneric` because `setupAuth` receives only a query builder.
  const updateProfile = mutationGeneric({
    args: { name: v.string() },
    handler: async (ctx, { name }) => {
      const identity = await ctx.auth.getUserIdentity()
      if (!identity) throw backendError('unauthenticated', {}, 'Sign in to update your profile.')
      const trimmed = name.trim()
      if (!trimmed || trimmed.length > 256) {
        throw backendError('invalid_input', { field: 'name', message: 'Name must be 1-256 characters.' }, 'Name must be 1-256 characters.')
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
  // use here: it refuses any session older than `freshAge` (a day by default),
  // so a settings page would break for everyone signed in since yesterday.
  // Rows carry ids, never tokens. `null` for signed-out callers and for agent
  // tokens, which belong to no session.
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
  // token never reaches the browser.
  const revokeSession = mutationGeneric({
    args: { sessionId: v.string() },
    handler: async (ctx, { sessionId }) => {
      const identity = await ctx.auth.getUserIdentity()
      if (!identity || !identitySessionId(identity)) throw backendError('unauthenticated', {}, 'Sign in to manage your sessions.')
      const target = (await userSessions(ctx, adapter, identity.subject)).find(row => row._id === sessionId)
      if (!target) throw backendError('invalid_input', { field: 'sessionId', message: 'Session not found.' }, 'Session not found.')
      const { auth, headers } = await authComponent.getAuth(createAuth as never, ctx as unknown as GenericCtx<DM>)
      await (auth as unknown as ReturnType<AuthFactory<DM>>).api.revokeSession({ body: { token: target.token }, headers })
      return null
    },
  })

  return {
    getAuthUser,
    authConfig,
    listWorkspaces,
    listWorkspaceMembers,
    updateProfile,
    listSessions,
    revokeSession,
  }
}

/**
 * Check what the types cannot: `email` is required, but an import cycle hands
 * `setupAuth` `undefined` all the same, and then every code, invitation and
 * welcome email stops without a word. A leftover 0.1 `integrations` key
 * would leave the same hole.
 */
function assertSetupOptions(options: unknown): void {
  const given = (options ?? {}) as { email?: { sendTemplate?: unknown }, integrations?: unknown }
  if ('integrations' in given) {
    throw new Error('[nuxt-backend] setupAuth no longer takes `integrations`: pass email, rateLimiter, canSignIn, onUserCreated and onUserDeleted at the top level of its options.')
  }
  if (typeof given.email?.sendTemplate !== 'function') {
    throw new TypeError(
      '[nuxt-backend] setupAuth needs `email`, the app\'s setupEmail instance, and got '
      + `${given.email === undefined ? 'undefined' : 'something else'}. When backend/email.ts exports it, this is almost always an import cycle: `
      + 'email.ts imports a module that imports auth.ts (functions.ts importing auth.ts while email.ts imports functions.ts, say), '
      + 'so auth.ts runs before email.ts has exported `email`. Keep backend/email.ts free of imports that lead back to ./auth.',
    )
  }
}

/** The cross-component options. */
function integrationsOf<DM extends GenericDataModel>(options: SetupAuthOptions<DM>): AuthIntegrations<DM> {
  const { email, rateLimiter, onUserCreated, canSignIn, onUserDeleted } = options
  return { email, rateLimiter, onUserCreated, canSignIn, onUserDeleted }
}

/**
 * The app's auth, from one call: the auth instance factory, the functions the
 * scaffold re-exports, and the agent token exchange. Every auth email goes
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
  const { email: _email, rateLimiter: _rateLimiter, onUserCreated: _onUserCreated, canSignIn: _canSignIn, onUserDeleted: _onUserDeleted, ...buildOptions } = options
  const authComponent = createAuthComponent<DM>(components.backend)
  const runtime = resolveIntegrations(components, integrationsOf(options))

  const createAuth = (ctx: GenericCtx<DM>) => betterAuth(buildAuthOptions(authComponent.adapter(ctx), buildOptions, { ctx, ...runtime }))

  // A sign-only better-auth instance for the exchange's JWT mint: the aligned
  // jwt plugin CANNOT sit on the main instance — better-auth dedupes plugins
  // by id, so a top-level `jwt()` displaces the convex plugin's internal
  // custom-path jwt and 404s `/convex/token` (the client token bridge). This
  // instance shares the adapter/secret (same `jwks` row, so minted tokens
  // carry a `kid` the validator serves) but its handler is never mounted.
  const createSignerAuth = (ctx: GenericCtx<DM>) => {
    const base = buildAuthOptions(authComponent.adapter(ctx), buildOptions, { ctx, ...runtime })
    return betterAuth({
      database: base.database,
      secret: base.secret,
      baseURL: base.baseURL,
      basePath: base.basePath,
      plugins: [convexSignerJwt()],
    })
  }

  // The agent token exchange (`POST /mcp/exchange`, mounted by
  // `registerBackendRoutes`): trades an MCP OAuth Bearer for a short-lived
  // Convex JWT. Wired here because it needs the same auth instance and rate
  // limiter.
  const mcp: McpExchange = setupMcp({
    createAuth: ctx => createAuth(ctx as GenericCtx<DM>),
    createSignerAuth: ctx => createSignerAuth(ctx as GenericCtx<DM>),
    rateLimiter: runtime.rateLimiter,
  })

  return {
    authComponent,
    createAuth,
    ...authApi(components, queryBuilder, buildOptions, createAuth),
    mcp,
  }
}
