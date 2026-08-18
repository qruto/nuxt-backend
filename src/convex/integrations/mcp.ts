import type { GenericActionCtx, GenericDataModel } from 'convex/server'

/**
 * The agent (MCP) token exchange.
 *
 * Agents authenticate against the better-auth `mcp` OAuth provider (DCR +
 * authorization-code flow, mounted under the auth base path) and hold an
 * opaque Bearer. Convex functions authenticate with JWTs. This integration
 * bridges the two: `POST /mcp/exchange` (mounted by `registerBackendRoutes`)
 * validates the opaque Bearer against the provider's token store and mints a
 * short-lived Convex JWT carrying the same claims a session JWT would — so
 * `ctx.auth`, workspace resolution, and billing entity resolution all work
 * unchanged when the Nuxt MCP endpoint calls Convex functions as the user.
 *
 * The JWT deliberately lives {@link MCP_TOKEN_TTL_SECONDS} seconds: the Nitro
 * gate caches it for exactly that long, so revoking an agent's OAuth token
 * cuts Convex access within minutes without any distributed invalidation.
 */

/** Matches the httpAction ctx (and any action ctx) structurally. */
interface McpExchangeCtx {
  runQuery: GenericActionCtx<GenericDataModel>['runQuery']
  runMutation: GenericActionCtx<GenericDataModel>['runMutation']
  scheduler: GenericActionCtx<GenericDataModel>['scheduler']
}

/**
 * Guards the exchange. Satisfied by `setupRateLimiter(...)` (which seeds the
 * `mcp` named limit) and by the auth integrations' rate limiter.
 */
export interface McpRateLimiter {
  limit: (
    ctx: McpExchangeCtx,
    name: 'mcp',
    options?: { key?: string },
  ) => Promise<{ ok: boolean, retryAfter?: number }>
}

/** The provider's stored access-token row, as `getMcpSession` returns it. */
interface McpAccessTokenSession {
  userId?: string | null
  clientId?: string | null
  /** Space-delimited granted scopes (OAuth convention). */
  scopes?: string | null
}

/**
 * The better-auth surface the exchange needs, held structurally so this
 * module never imports the client bridge (which imports this one).
 */
export interface McpExchangeAuth {
  api: {
    getMcpSession: (args: { headers: Headers }) => Promise<McpAccessTokenSession | null>
    signJWT: (args: { body: { payload: Record<string, unknown> } }) => Promise<{ token: string } | null>
  }
  $context: Promise<{
    adapter: {
      findOne: (args: { model: string, where: Array<{ field: string, value: unknown }> }) => Promise<unknown>
    }
  }>
}

export interface SetupMcpOptions {
  /**
   * From `setupAuth`: builds the per-request better-auth instance. Typed
   * `unknown` because the concrete instance's generics reference option types
   * better-auth doesn't export — it is read structurally (same trade as
   * `registerBackendRoutes`'s never-typed auth params).
   */
  createAuth: (ctx: McpExchangeCtx) => unknown
  /** Throttles exchanges per client+user (the `mcp` named limit). */
  rateLimiter?: McpRateLimiter
  /** `false` turns the mounted route into a 404 (provider disabled). */
  enabled?: boolean
}

export interface McpExchange {
  /** httpAction body for `POST /mcp/exchange` (wrapped by `registerBackendRoutes`). */
  exchangeHandler: (ctx: McpExchangeCtx, request: Request) => Promise<Response>
}

/**
 * Convex JWT lifetime for agent calls. Short on purpose — it is also the
 * upper bound on how long the Nitro gate may cache an exchange, i.e. how long
 * a revoked agent token keeps working.
 */
const MCP_TOKEN_TTL_SECONDS = 5 * 60

function json(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  })
}

function unauthorized(): Response {
  return json(401, { error: 'invalid_token' }, { 'WWW-Authenticate': 'Bearer error="invalid_token"' })
}

function readEnv(name: string): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name]
}

/**
 * Build the `/mcp/exchange` handler. Wired for you by `setupAuth` (returned
 * as its `mcp` export); call directly only for hand-rolled auth setups.
 */
export function setupMcp(options: SetupMcpOptions): McpExchange {
  const enabled = options.enabled !== false

  const exchangeHandler = async (ctx: McpExchangeCtx, request: Request): Promise<Response> => {
    if (!enabled) return json(404, { error: 'mcp_disabled' })
    if (!request.headers.get('Authorization')) return unauthorized()

    const auth = options.createAuth(ctx) as McpExchangeAuth
    // The opaque Bearer is looked up in the provider's token store (indexed
    // by accessToken) and rejected when unknown or expired.
    const session = await auth.api.getMcpSession({ headers: request.headers })
    if (!session?.userId || !session.clientId) return unauthorized()

    if (options.rateLimiter) {
      const { ok, retryAfter } = await options.rateLimiter.limit(ctx, 'mcp', {
        key: `${session.clientId}:${session.userId}`,
      })
      if (!ok) {
        return json(429, { error: 'rate_limited' }, {
          'Retry-After': String(Math.max(1, Math.ceil((retryAfter ?? 1000) / 1000))),
        })
      }
    }

    const adapter = (await auth.$context).adapter
    const user = await adapter.findOne({
      model: 'user',
      where: [{ field: 'id', value: session.userId }],
    }) as { name?: string, email?: string, emailVerified?: boolean, role?: string | null, banned?: boolean | null } | null
    // Token for a since-deleted or banned account — fail like an invalid token.
    if (!user || user.banned) return unauthorized()

    // The user's workspace, resolved like a new session would (first
    // membership — see `ensureActiveOrganization`): billing follows the
    // tenant, so agent spend lands on the same entity as the web app's.
    const membership = await adapter.findOne({
      model: 'member',
      where: [{ field: 'userId', value: session.userId }],
    }) as { organizationId?: string } | null

    const scopes = (session.scopes ?? '').split(' ').filter(Boolean)
    const issuer = readEnv('CONVEX_SITE_URL')
    const nowSeconds = Math.floor(Date.now() / 1000)
    // Claims mirror the convex plugin's session JWTs (definePayload in the
    // client bridge) so every claims-first consumer — authorization, billing
    // entity resolution — reads agent calls exactly like web sessions.
    // iss/aud are pinned to the auth.config validator's expectations.
    const signed = await auth.api.signJWT({
      body: {
        payload: {
          name: user.name ?? '',
          email: user.email ?? '',
          emailVerified: user.emailVerified ?? false,
          ...(user.role ? { role: user.role } : {}),
          ...(membership?.organizationId ? { activeOrganizationId: membership.organizationId } : {}),
          scopes,
          clientId: session.clientId,
          sub: session.userId,
          ...(issuer ? { iss: issuer } : {}),
          aud: 'convex',
          iat: nowSeconds,
          exp: nowSeconds + MCP_TOKEN_TTL_SECONDS,
        },
      },
    })
    if (!signed?.token) return json(500, { error: 'token_mint_failed' })

    return json(200, {
      token: signed.token,
      expiresIn: MCP_TOKEN_TTL_SECONDS,
      session: {
        userId: session.userId,
        clientId: session.clientId,
        scopes,
      },
    })
  }

  return { exchangeHandler }
}
