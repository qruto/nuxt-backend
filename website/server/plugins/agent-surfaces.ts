import type { H3Event } from 'h3'
import { defineNitroPlugin } from 'nitropack/runtime'
import { openTwin, type TwinPage } from '../../shared/agent-markdown'
import { sitemapByTab, twinRoute } from '../../shared/agent-surfaces'
import { DOCS_MCP_CARD, DOCS_MCP_NAME, DOCS_MCP_PAGE, DOCS_MCP_TOOLS, docsMcpUrl } from '../../shared/docs-mcp'
import { contentPages } from '../utils/content-pages'

/**
 * The hooks nuxt-agent-discovery calls. It declares them in a type template
 * of the website's .nuxt only, which the docs tests that import this plugin
 * type-check without; scripts/check-website-agents.mjs holds the built
 * output to what each one adds, so a renamed hook fails there.
 */
interface AgentDiscoveryHooks {
  'agent-discovery:document': (event: H3Event, page: TwinPage & { body?: unknown }) => void
  'agent-discovery:sitemap': (event: H3Event, sections: Map<string, Array<{ title: string, href: string }>>) => Promise<void>
  'agent-discovery:mcp-server-card': (event: H3Event, card: Record<string, unknown>) => void
}

/** Nitro's hooks, seen as the ones this plugin adds to. */
type Hooks = { hook: <Name extends keyof AgentDiscoveryHooks>(name: Name, handler: AgentDiscoveryHooks[Name]) => void }

/**
 * The card: the docs MCP at the site's docs host, its tools, and no
 * sign-in. The site is the card's homepage, the one the module names (the
 * deploy's site URL).
 */
function describeDocsMcp(card: Record<string, unknown>): void {
  const info = card.serverInfo as Record<string, unknown> & { homepage: string }
  card.serverInfo = { ...info, name: DOCS_MCP_NAME, ...DOCS_MCP_CARD, documentation: new URL(DOCS_MCP_PAGE, info.homepage).href }
  card.endpoints = [{ type: 'streamable-http', url: docsMcpUrl(info.homepage) }]
  card.authentication = { required: false }
  card.capabilities = { tools: { listChanged: false } }
  card.tools = DOCS_MCP_TOOLS.map(({ name, description }) => ({ name, description }))
  delete card.resources
  delete card.prompts
}

// What the site adds to the documents nuxt-agent-discovery serves agents
// (shared/agent-surfaces.ts says what each one promises):
//
// - each twin, `/raw/<page>.md` and every page of `/llms-full.txt`, opens
//   with the page's header: the release line, the tab, the kind, the status
//   and the keys (shared/agent-markdown.ts). It gets a copy of the page,
//   so the stored page, which search indexes, stays as the site shows it;
// - `/sitemap.md` lists the homepage, then each tab in the header's order,
//   every page in reading order and labelled with its kind;
// - the MCP server card describes the docs MCP (shared/docs-mcp.ts) on
//   either host: its URL, its tools, and no sign-in. The site has no MCP
//   endpoint of its own, which the module cannot know.
export default defineNitroPlugin((nitroApp) => {
  const hooks = nitroApp.hooks as unknown as Hooks
  hooks.hook('agent-discovery:document', (_event, page) => {
    openTwin(page.body, page)
  })
  hooks.hook('agent-discovery:sitemap', async (event, sections) => {
    sitemapByTab(sections, await contentPages(event), href => twinRoute(href))
  })
  hooks.hook('agent-discovery:mcp-server-card', (_event, card) => {
    describeDocsMcp(card)
  })
})
