import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { readRequestBody } from '@modelcontextprotocol/sdk/server/requestBody.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { type McpToolDefinitionListItem, registerToolFromDefinition } from '@nuxtjs/mcp-toolkit/server'
import { DOCS_MCP_MAX_BODY, DOCS_MCP_NAME } from '../../shared/docs-mcp'
import { DOCS_VERSION } from '../../shared/docs-version'

// The docs MCP server: the tools of ./tools.ts on the MCP SDK's own server
// and Web-standard transport, one stateless server per request, answering
// JSON. Not a @nuxtjs/mcp-toolkit handler: the toolkit mounts one
// auto-discovered handler per app at `/mcp`, and the site has none (it is
// switched off). The tools are toolkit definitions all the same, and its
// `registerToolFromDefinition` registers them, cache and result shape
// included, as the toolkit's own handler would.

/** What the server tells an agent at `initialize`: what it covers, and which tool answers what. */
export const DOCS_MCP_INSTRUCTIONS = [
  `The documentation of nuxt-backend ${DOCS_VERSION.line}: one Nuxt module and one Convex component for passwordless auth, workspaces, billing with credits, transactional email and metered AI. Read-only, no sign-in.`,
  'Start with `search` for a question in words, or `list-pages` for the map, and read a page with `get-page`.',
  'Look a name up before you write it: `get-diagnostic` for a `doctor` finding id, `get-env-var` for an environment variable, `get-composable` for a composable, `get-component` for a component.',
  'A name that is not in the docs may be one a release renamed: `get-upgrade-guide` says what it became.',
].join('\n')

/** A docs MCP server with these tools: a fresh one for every request, as the transport is stateless. */
export function createDocsMcpServer(tools: readonly McpToolDefinitionListItem[]): McpServer {
  const server = new McpServer(
    { name: DOCS_MCP_NAME, title: 'Nuxt backend docs', version: DOCS_VERSION.line },
    { instructions: DOCS_MCP_INSTRUCTIONS },
  )
  for (const tool of tools) registerToolFromDefinition(server, tool)
  return server
}

/** A JSON-RPC error with no request to answer, as the transport writes its own. */
function rpcError(status: number, message: string, { code = -32000, headers = {} }: { code?: number, headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

/**
 * The message a request carries, read before the transport does: the body
 * as JSON, `undefined` when it is not JSON (the transport then answers it
 * as it answers any malformed request), or the response that refuses it.
 */
async function messageOf(request: Request): Promise<{ parsed: unknown } | Response> {
  const body = await readRequestBody(request.clone(), DOCS_MCP_MAX_BODY)
  if (body.tooLarge) return rpcError(413, `Payload too large: a docs MCP request is at most ${DOCS_MCP_MAX_BODY} bytes.`)
  let parsed: unknown
  try {
    parsed = JSON.parse(body.text)
  }
  catch {
    return { parsed: undefined }
  }
  // The rate limit counts requests: a JSON-RPC batch would run up to a
  // hundred tool calls for the price of one. MCP dropped batches in
  // 2025-06-18, and no client of that revision sends one.
  if (Array.isArray(parsed)) return rpcError(400, 'Batches are not supported: send one JSON-RPC message per request.', { code: -32600 })
  return { parsed }
}

/**
 * One request to the docs MCP. Only `POST` carries one: with no session
 * there is no stream to open with `GET` and none to end with `DELETE`, so
 * both answer `405`, which clients read as "stateless server". A request
 * carries one JSON-RPC message, of a few kilobytes at most.
 */
export async function answerDocsMcp(request: Request, tools: readonly McpToolDefinitionListItem[]): Promise<Response> {
  if (request.method !== 'POST') return rpcError(405, 'Method not allowed: the docs MCP is stateless, POST each request.', { headers: { allow: 'POST' } })
  const message = await messageOf(request)
  if (message instanceof Response) return message
  const server = createDocsMcpServer(tools)
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: DOCS_MCP_MAX_BODY })
  await server.connect(transport)
  try {
    return await transport.handleRequest(request, message.parsed === undefined ? undefined : { parsedBody: message.parsed })
  }
  finally {
    await server.close()
  }
}
