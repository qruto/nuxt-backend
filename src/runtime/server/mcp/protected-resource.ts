import { defineEventHandler, getRequestURL } from 'h3'
import { readBackendMcpRuntimeConfig } from './config'

const WELL_KNOWN_PATH = '/.well-known/oauth-protected-resource'

/** Public metadata is fetched cross-origin by browser-based MCP clients. */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, mcp-protocol-version',
} as const

/**
 * RFC 9728 protected-resource metadata, served locally (the toolkit's own
 * handler on this route is a 404 stub; middleware answers first). Points
 * agents at the authorization server — the better-auth OAuth surface on the
 * app origin via the base module's auth proxy. The prefix registration also
 * covers the path-suffix form (`…/oauth-protected-resource/mcp`).
 */
export default defineEventHandler((event) => {
  const config = readBackendMcpRuntimeConfig(event)
  if (!config) return

  const path = event.path.split('?')[0] ?? ''
  if (path !== WELL_KNOWN_PATH && !path.startsWith(`${WELL_KNOWN_PATH}/`)) return
  if (event.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })

  const origin = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin
  return new Response(JSON.stringify({
    // The origin (not the endpoint URL) so clients requesting any path under
    // it — the MCP route included — pass their sub-path resource check.
    resource: origin,
    authorization_servers: [`${origin}${config.authBase}`],
    jwks_uri: `${origin}${config.authBase}/mcp/jwks`,
    scopes_supported: config.scopes,
    bearer_methods_supported: ['header'],
    resource_signing_alg_values_supported: ['RS256'],
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
      ...CORS_HEADERS,
    },
  })
})
