import { defineEventHandler, getRequestURL } from 'h3'
import { CORS_HEADERS, wellKnownRequest } from './well-known'

const WELL_KNOWN_PATH = '/.well-known/oauth-protected-resource'

/**
 * RFC 9728 protected-resource metadata, served locally (the toolkit's own
 * handler on this route is a 404 stub; middleware answers first). Points
 * agents at the authorization server — the better-auth OAuth surface on the
 * app origin via the base module's auth proxy. The prefix registration also
 * covers the path-suffix form (`…/oauth-protected-resource/mcp`).
 */
export default defineEventHandler((event) => {
  const config = wellKnownRequest(event, WELL_KNOWN_PATH)
  if (!config || config instanceof Response) return config

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
