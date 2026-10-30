import { defineEventHandler, getRequestHeader, sendRedirect, toWebRequest } from 'h3'
import { DOCS_MCP_PAGE } from '../../shared/docs-mcp'
import { answerDocsMcp } from '../docs-mcp/server'
import { DOCS_MCP_TOOL_DEFINITIONS } from '../docs-mcp/tools'

// The docs MCP (server/docs-mcp/), inside the site. Agents reach it on the
// docs host (server/middleware/docs-mcp-host.ts); the docs assistant can
// call this route in-process. nuxt.config.ts gives it a per-IP budget of its
// own. No sign-in: it only reads the docs.
export default defineEventHandler((event) => {
  // A person who opens the URL gets the page that says how to connect.
  if (event.method === 'GET' && (getRequestHeader(event, 'accept') ?? '').includes('text/html')) return sendRedirect(event, DOCS_MCP_PAGE, 302)
  return answerDocsMcp(toWebRequest(event), DOCS_MCP_TOOL_DEFINITIONS)
})
