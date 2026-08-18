import { defineEventHandler, getRequestHeader, getRequestURL, type H3Event } from 'h3'
import { readBackendMcpRuntimeConfig } from './config'
import { exchangeBackendMcpToken } from './session'

/**
 * Route-scoped auth gate on the MCP endpoint. No/invalid Bearer answers 401
 * with the RFC 9728 `WWW-Authenticate: Bearer resource_metadata="…"`
 * challenge (how MCP clients discover the OAuth flow); a valid Bearer is
 * exchanged for a Convex-authenticated session (cached for the JWT lifetime)
 * and attached as `event.context.backendMcp` for the tool guards/handlers.
 */
export default defineEventHandler(async (event) => {
  const config = readBackendMcpRuntimeConfig(event)
  if (!config) return

  // h3 mounts route-scoped middleware by path prefix — re-check so sibling
  // routes (`/mcp-status`) never get gated, and the toolkit's public
  // conveniences (IDE install deeplink, badge) stay public.
  const path = event.path.split('?')[0] ?? ''
  if (path !== config.route && !path.startsWith(`${config.route}/`)) return
  if (path === `${config.route}/deeplink` || path === `${config.route}/badge.svg`) return
  if (event.method === 'OPTIONS') return
  // A human in a browser gets the toolkit's homepage redirect, not a Bearer
  // challenge; no session context is attached, so every tool stays hidden.
  if (event.method === 'GET' && (getRequestHeader(event, 'accept') ?? '').includes('text/html')) return

  const authorization = getRequestHeader(event, 'authorization') ?? ''
  const [scheme, token] = authorization.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return challenge(event)

  const session = await exchangeBackendMcpToken(event, token)
  if (!session) return challenge(event)
  event.context.backendMcp = session
})

function challenge(event: H3Event): Response {
  const origin = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin
  const wwwAuthenticate = `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`
  // JSON-RPC error body mirroring better-auth's own MCP challenge shape.
  return new Response(JSON.stringify({
    jsonrpc: '2.0',
    error: {
      'code': -32000,
      'message': 'Unauthorized: authentication required',
      'www-authenticate': wwwAuthenticate,
    },
    id: null,
  }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      'WWW-Authenticate': wwwAuthenticate,
      'Access-Control-Expose-Headers': 'WWW-Authenticate',
    },
  })
}
