import { createError, type H3Event } from 'h3'
import { createExchangeCache, EXCHANGE_CACHE_MARGIN_MS } from './cache'
import { readBackendMcpRuntimeConfig, readConvexSiteUrl } from './config'

/** The authenticated agent behind the current MCP request. */
export interface BackendMcpSession {
  /** The signed-in user the agent acts as. */
  userId: string
  /** The OAuth client (agent) id. */
  clientId: string
  /** Scopes the user consented to. */
  scopes: string[]
  /** Short-lived Convex JWT for calling deployment functions as the user. */
  convexToken: string
}

interface ExchangeResponse {
  token?: string
  expiresIn?: number
  session?: { userId?: string, clientId?: string, scopes?: string[] }
}

const cache = createExchangeCache<BackendMcpSession>()

/**
 * Trade an agent's opaque OAuth Bearer for a Convex-authenticated session via
 * the deployment's `/mcp/exchange` endpoint, caching for the minted JWT's
 * lifetime. `null` means the token is invalid/expired/revoked (401 material);
 * infrastructure problems throw so they surface as 5xx, never as a
 * re-authenticate prompt.
 */
export async function exchangeBackendMcpToken(event: H3Event, token: string): Promise<BackendMcpSession | null> {
  const cached = cache.get(token)
  if (cached) return cached

  const config = readBackendMcpRuntimeConfig(event)
  const siteUrl = readConvexSiteUrl(event)
  if (!config || !siteUrl) {
    throw createError({ statusCode: 503, message: 'Agent endpoint unavailable — no Convex site URL configured.' })
  }

  const response = await fetch(`${siteUrl}${config.exchangePath}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (response.status === 401) return null
  if (response.status === 429) {
    throw createError({ statusCode: 429, message: 'Too many agent requests — try again shortly.' })
  }
  if (!response.ok) {
    throw createError({ statusCode: 502, message: `Agent token exchange failed (${response.status}).` })
  }

  const body = await response.json() as ExchangeResponse
  if (!body.token || !body.session?.userId || !body.session.clientId) return null

  const session: BackendMcpSession = {
    userId: body.session.userId,
    clientId: body.session.clientId,
    scopes: body.session.scopes ?? [],
    convexToken: body.token,
  }
  cache.set(token, session, (body.expiresIn ?? 0) * 1000 - EXCHANGE_CACHE_MARGIN_MS)
  return session
}
