import { defineEventHandler, getRequestHeader, getRequestHost, getRequestIP, getRequestProtocol, proxyRequest, sendRedirect, setResponseStatus } from 'h3'
import { useNitroApp } from 'nitropack/runtime'
import { DOCS_MCP_PAGE, DOCS_MCP_PATH, DOCS_MCP_ROUTE, isDocsMcpHost, MCP_SERVER_CARD_PATH, siteHostOf } from '../../shared/docs-mcp'

// The docs host: `mcp.nuxt-backend.dev/mcp` (locally
// `mcp.nuxt-backend.localhost/mcp`) answers from the docs MCP's route,
// server/api/docs-mcp.ts. The same site serves both hosts, and a route rule
// cannot match a host, so this middleware does it. It hands the call on as
// a request of its own to the site: the route's rate limit counts
// it against the caller's IP, and the route, and the requests it makes in
// turn (Nuxt Content's queries), see the site's host, not this one.
//
// The docs host is the docs MCP and nothing else. It serves the MCP server
// card that describes it, from the site's own route (server/plugins/
// agent-surfaces.ts). It publishes no OAuth metadata, as there is nothing to
// authorize, and nothing under `/mcp/`: both answer 404, so a client that
// probes before it calls is not sent to a sign-in. Every other path is the
// site's, on the site's own host, where its sign-in, cookies and pages belong.

/** What the docs host never answers: OAuth metadata, and anything under `/mcp/`. */
function isRefused(path: string): boolean {
  return path.startsWith('/.well-known/oauth-') || path.startsWith(`${DOCS_MCP_PATH}/`)
}

export default defineEventHandler((event) => {
  const host = getRequestHost(event, { xForwardedHost: true })
  if (!isDocsMcpHost(host)) return
  const path = event.path.split('?')[0]!
  if (path === MCP_SERVER_CARD_PATH) return
  const siteHost = siteHostOf(host)
  const site = `${getRequestProtocol(event, { xForwardedProto: true })}://${siteHost}`
  if (path !== DOCS_MCP_PATH && path !== `${DOCS_MCP_PATH}/`) {
    if (!isRefused(path)) return sendRedirect(event, `${site}${event.path}`, 308)
    setResponseStatus(event, 404)
    return { error: 'not_found', message: `This host serves the docs MCP at ${DOCS_MCP_PATH} and nothing else. It needs no sign-in.` }
  }
  const accept = getRequestHeader(event, 'accept') ?? ''
  // A person who opens the URL gets the page that says how to connect, on the site itself.
  if (event.method === 'GET' && accept.includes('text/html')) return sendRedirect(event, `${site}${DOCS_MCP_PAGE}`, 302)
  const ip = getRequestIP(event, { xForwardedFor: true })
  return proxyRequest(event, DOCS_MCP_ROUTE, {
    fetch: useNitroApp().localFetch,
    // h3 drops `accept` from a proxied request; the transport needs it.
    // And it would forward this host, which the route's own requests would
    // carry back here, to be sent to the site.
    headers: { accept, 'host': siteHost, 'x-forwarded-host': siteHost, ...(ip ? { 'x-forwarded-for': ip } : {}) },
  })
})
