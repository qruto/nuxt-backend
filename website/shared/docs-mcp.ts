// THE DOCS MCP: a read-only MCP server over these docs, for coding agents
// and for the docs assistant, with no sign-in. One place says where it
// answers and what it offers:
//
// - server/api/docs-mcp.ts serves it inside the site, at DOCS_MCP_ROUTE,
//   which the docs assistant can call in-process;
// - server/middleware/docs-mcp-host.ts answers DOCS_MCP_PATH on the docs
//   host (`mcp.nuxt-backend.dev`, locally `mcp.nuxt-backend.localhost`)
//   from that route, so agents get a URL of its own: the site serves no MCP
//   endpoint (Docus's toolkit is off);
// - nuxt.config.ts limits the route per IP; the docs host serves an MCP
//   server card of its own (server/plugins/agent-surfaces.ts): DOCS_MCP_URL,
//   DOCS_MCP_TOOLS and no sign-in, the same card on either host;
// - scripts/check-website-agents.mjs calls every tool against a build, and
//   against the live host every week.
//
// No imports, so plain Node loads it too (the build-output check), and the
// Nitro bundle and the client read it as they are.

/**
 * The canonical site, as shared/site.ts names it (test/docs/docs-mcp.test.ts
 * holds the two equal): a deploy may name another through NUXT_SITE_URL.
 */
const CANONICAL_SITE = 'https://nuxt-backend.dev'

/** The route inside the site that serves the docs MCP, which the docs host's `/mcp` hands its calls to. */
export const DOCS_MCP_ROUTE = '/api/docs-mcp'

/** The first label of the docs host: `mcp.nuxt-backend.dev`. */
const DOCS_MCP_HOST_LABEL = 'mcp'

/** The path the docs host answers the docs MCP at. */
export const DOCS_MCP_PATH = '/mcp'

/** The docs page that says how to connect a client. */
export const DOCS_MCP_PAGE = '/docs/develop/agents/docs-mcp'

/** The server's name, in its `serverInfo` and on the MCP server card. */
export const DOCS_MCP_NAME = 'nuxt-backend-docs'

/** The docs MCP's title and description on the docs host's MCP server card. */
export const DOCS_MCP_CARD = {
  title: 'Nuxt backend docs',
  description: 'The nuxt-backend documentation as MCP tools: search, every page as Markdown, and lookups of a '
    + '`doctor` finding, an environment variable, a composable, a component or a renamed name. Read-only, with '
    + 'no sign-in, and rate-limited per IP.',
} as const

/** Where each host serves its MCP server card, which describes the docs MCP. */
export const MCP_SERVER_CARD_PATH = '/.well-known/mcp/server-card.json'

/** The docs host of a site origin: `https://nuxt-backend.dev` → `mcp.nuxt-backend.dev`. */
export function docsMcpHost(site: string = CANONICAL_SITE): string {
  return `${DOCS_MCP_HOST_LABEL}.${new URL(site).host}`
}

/** The URL a client connects to, for a site origin: `https://mcp.nuxt-backend.dev/mcp`. */
export function docsMcpUrl(site: string = CANONICAL_SITE): string {
  return `${new URL(site).protocol}//${docsMcpHost(site)}${DOCS_MCP_PATH}`
}

/** The docs MCP's URL for the canonical site. */
export const DOCS_MCP_URL = docsMcpUrl()

/** Whether a request's host is a docs host: its first label is `mcp`, whatever site it fronts. */
export function isDocsMcpHost(host: string | undefined): boolean {
  return Boolean(host && host.toLowerCase().startsWith(`${DOCS_MCP_HOST_LABEL}.`))
}

/** The site a docs host fronts: `mcp.nuxt-backend.dev` → `nuxt-backend.dev`. */
export function siteHostOf(docsHost: string): string {
  return docsHost.slice(DOCS_MCP_HOST_LABEL.length + 1)
}

/**
 * The budget of one client IP: requests per window. A tool call is one
 * request, and so are `initialize` and `tools/list` (the server refuses a
 * JSON-RPC batch, which would carry many), so an agent working through a
 * task stays well inside it; a loop that is not reading does not.
 * nuxt-security spends no token on the request that opens an IP's first
 * window, so that one window admits one more.
 */
export const DOCS_MCP_RATE_LIMIT = { tokensPerInterval: 120, interval: 60_000 } as const

/** The largest request body the docs MCP reads, in bytes: one JSON-RPC message with arguments of 200 characters at most. */
export const DOCS_MCP_MAX_BODY = 16_384

/**
 * Every tool the docs MCP offers, what it answers, and what it takes: the
 * server card, the Docs MCP page and the build-output check read this list,
 * and test/docs/docs-mcp.test.ts holds the server's tools to it. The first
 * two are Docus's own docs tools.
 */
export const DOCS_MCP_TOOLS = [
  { name: 'list-pages', input: '`locale` (optional)', description: 'Every docs page with its title, path, description and URL.' },
  { name: 'get-page', input: '`path`', description: 'A page as Markdown, by its path from `list-pages` or `search`.' },
  { name: 'search', input: '`query`, `limit`', description: 'Full-text search over every section of the docs, sections written by hand ranked first.' },
  { name: 'get-diagnostic', input: '`id`', description: 'A `doctor` finding by its id: what it checks, its severity, why it matters and its fix.' },
  { name: 'get-env-var', input: '`name`', description: 'An environment variable: its capability, where it is read, whether a deploy needs it, what it takes and what happens without it.' },
  { name: 'get-composable', input: '`name`', description: 'A composable or auto-imported helper: its tab, tier, summary and API page.' },
  { name: 'get-component', input: '`name`', description: 'A component: what it is, its contract, its props and its accessibility.' },
  { name: 'get-upgrade-guide', input: '`name` (optional)', description: 'The rename map: what an old name became, and the Upgrade section that explains it.' },
] as const

/** A docs MCP tool's name. */
export type DocsMcpToolName = (typeof DOCS_MCP_TOOLS)[number]['name']
