import type { GenericCtx } from '@convex-dev/better-auth'
import { APIError } from 'better-auth/api'
import { betterAuth } from 'better-auth/minimal'
import { mutationGeneric, type GenericDataModel, type QueryBuilder } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import { DEFAULT_AGENT_CONSENT_PATH, DEFAULT_INVITATION_PATH, DEFAULT_LOGIN_PATH } from '../constants.js'
import { setupMcp, type McpExchange } from '../integrations/mcp.js'
import type { AuthBuildOptions, AuthIntegrations, AuthSetupComponents, DeviceSession, SetupAuthOptions } from './auth-types.js'
import { buildAuthOptions } from './better-auth-options.js'
import { componentAdapterRefs, createAuthComponent, resolveIntegrations } from './component.js'
import { resolveTemplates } from './email.js'
import { convexSignerJwt } from './plugins.js'
import { identitySessionId, userSessions } from './sessions.js'
import { workspaceQueries } from './workspaces.js'

/**
 * The auth layer's request error, re-exported so an app needs no direct
 * dependency on the auth library. Throw it from a hook `setupAuth` passes
 * through (`authOptions.databaseHooks`, `organization.organizationHooks`) to
 * refuse with a status and a message the client shows, not a bare 500:
 * `throw new APIError('BAD_REQUEST', { message: 'Invite a company address.' })`.
 */
export { APIError }

// `setupAuth` is the entry's one function: every auth instance is built
// through it. The public types live in auth-types.ts and are re-exported in
// declaration order; the rest of the implementation sits next to this file,
// one responsibility per module.
export type {
  AuthMutationCtx,
  AuthEmailMessage,
  AuthEmailSender,
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
  AuthEmailTemplates,
  AuthEmailTemplateOverrides,
  AdminPluginOptions,
  OrganizationPluginOptions,
  McpAuthOptions,
  SetupAuthOptions,
  AuthSetupComponents,
  DeviceSession,
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
      if (!identity) throw new Error('Sign in to update your profile.')
      const trimmed = name.trim()
      if (!trimmed || trimmed.length > 256) throw new Error('Name must be 1-256 characters.')
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
      if (!identity || !identitySessionId(identity)) throw new ConvexError('Sign in to manage your sessions.')
      const target = (await userSessions(ctx, adapter, identity.subject)).find(row => row._id === sessionId)
      if (!target) throw new ConvexError('Session not found.')
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

/** The cross-component options, without the ones left unset. */
function integrationsOf<DM extends GenericDataModel>(options: SetupAuthOptions<DM>): AuthIntegrations<DM> {
  const { email, rateLimiter, onUserCreated, canSignIn, onUserDeleted, emailTemplates } = options
  return Object.fromEntries(
    Object.entries({ email, rateLimiter, onUserCreated, canSignIn, onUserDeleted, emailTemplates }).filter(([, value]) => value !== undefined),
  ) as AuthIntegrations<DM>
}

/**
 * The app's auth, from one call: the auth instance factory, the functions the
 * scaffold re-exports, the agent token exchange, and the email templates in
 * effect.
 *
 * @example
 * ```ts
 * import { setupAuth } from 'nuxt-backend/auth'
 * import { components } from './_generated/api'
 * import { query } from './_generated/server'
 *
 * export const { authComponent, createAuth, getAuthUser } = setupAuth(components, query, {
 *   canSignIn: async (ctx, { email }) => email.endsWith('@acme.com'),
 * })
 * ```
 */
export function setupAuth<
  DM extends GenericDataModel,
>(
  components: AuthSetupComponents,
  queryBuilder: QueryBuilder<DM, 'public'>,
  options: SetupAuthOptions<DM> = {},
) {
  const { email: _email, rateLimiter: _rateLimiter, onUserCreated: _onUserCreated, canSignIn: _canSignIn, onUserDeleted: _onUserDeleted, emailTemplates: _emailTemplates, ...buildOptions } = options
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
    /** The auth emails in effect, overrides included: what a preview page renders. */
    emailTemplates: resolveTemplates(runtime),
  }
}
