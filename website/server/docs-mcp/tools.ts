import { defineMcpTool, type McpToolDefinitionListItem } from '@nuxtjs/mcp-toolkit/server'
import getPage from 'docus/server/mcp/tools/get-page'
import listPages from 'docus/server/mcp/tools/list-pages'
import { getRequestURL, type H3Event } from 'h3'
import { useEvent, useRuntimeConfig } from 'nitropack/runtime'
import { z } from 'zod'
import type { DocsMcpToolName } from '../../shared/docs-mcp'
import { lookUp, type LookupKind, upgradeGuide } from './lookups'
import { rankSections, SEARCH_LIMIT } from './search'
import { docsSections } from './sections'

// The docs MCP's tools. Docus's own two docs tools come first, as Docus
// ships them (its layer's server/mcp/tools/, which @nuxtjs/mcp-toolkit names
// by file, so they get their names here); the rest answer from the generated
// lookups (./lookups.ts) and the docs' search sections (./sections.ts,
// ranked by ./search.ts). Every one only reads: no sign-in, no state,
// nothing written.
//
// Nothing here caches. The toolkit keys a tool's cache on its raw
// arguments, and Nitro keeps the entries in memory for the life of the
// server, so an anonymous caller could fill it with arguments it makes up.
// What the tools read is held already: the search sections once per
// server, the pages in Nuxt Content's database.

/** What every docs tool declares about itself: it reads, the same answer twice, nothing outside these docs. */
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const

/**
 * The site's origin, as the twins and Docus's tools link it:
 * nuxt-agent-discovery's `siteUrl`, else the request's own origin.
 */
function siteOf(event: H3Event): string {
  const config = useRuntimeConfig(event) as { agentDiscovery?: { siteUrl?: string } }
  return config.agentDiscovery?.siteUrl || getRequestURL(event).origin
}

/** A lookup tool's answer: its record, or what is close when it finds nothing. */
function lookupResult(kind: LookupKind, name: string) {
  const found = lookUp(kind, name, siteOf(useEvent()))
  if (found.found) return found
  return { content: [{ type: 'text' as const, text: JSON.stringify(found, null, 2) }], structuredContent: found, isError: true }
}

const search = defineMcpTool({
  description: `Full-text search over every section of the nuxt-backend docs: the guides, the reference and the generated API pages.

WHEN TO USE: a question in words ("how do credits top up", "passkey sign-in", "rate limits"), when you don't know which page answers it.

OUTPUT: the best sections first, sections written by hand above generated ones: each with its title, the page \`path\` (pass it to get-page for the whole page), its \`anchor\`, its URL, the headings it sits under and the text around the first match.`,
  annotations: READ_ONLY,
  inputSchema: {
    query: z.string().min(2).max(200).describe('Words to look for, such as `useCredits top-up` or `webhook secret`'),
    limit: z.number().int().min(1).max(SEARCH_LIMIT).optional().describe(`How many sections to return, 8 by default, at most ${SEARCH_LIMIT}`),
  },
  inputExamples: [{ query: 'passkey sign-in' }, { query: 'credits top-up', limit: 5 }],
  handler: async ({ query, limit }) => {
    const event = useEvent()
    return { query, results: rankSections(await docsSections(event), query, limit ?? 8, siteOf(event)) }
  },
})

const getDiagnostic = defineMcpTool({
  description: `A \`doctor\` finding by its id, as Diagnostics documents it: what it checks, its capability, its severity in dev and under \`--prod\`, whether \`--fix\` repairs it, why it matters and its fix.

WHEN TO USE: \`npx nuxt-backend doctor\`, the dev-server preflight or the DevTools tab reported a finding id (such as \`auth-secret\`), or printed a \`/d/<id>\` link.

OUTPUT: the finding's capability, title, entry (Markdown) and URL; for an id that does not exist, the closest ids.`,
  annotations: READ_ONLY,
  inputSchema: {
    id: z.string().min(1).max(200).describe('The finding id, such as `auth-secret`, or its `/d/<id>` link'),
  },
  inputExamples: [{ id: 'auth-secret' }, { id: 'https://nuxt-backend.dev/d/billing-webhook-route' }],
  handler: ({ id }) => lookupResult('diagnostics', id),
})

const getEnvVar = defineMcpTool({
  description: `An environment variable nuxt-backend reads: its capability, where it is read (the deployment or the Nuxt app), whether a deploy needs it, the values it takes, an example, what happens without it and the \`doctor\` findings that check it.

WHEN TO USE: before you set, push or rename a variable, or when an app misbehaves for want of one. The platform's own \`CONVEX_*\` names are not here: the Convex CLI owns them.

OUTPUT: the variable's record and the URL of the env reference; for a name that does not exist, the closest names.`,
  annotations: READ_ONLY,
  inputSchema: {
    name: z.string().min(1).max(200).describe('The variable, such as `AUTH_SECRET` or `EMAIL_WEBHOOK_SECRET`'),
  },
  inputExamples: [{ name: 'AUTH_SECRET' }, { name: 'BILLING_WEBHOOK_SECRET' }],
  handler: ({ name }) => lookupResult('env', name),
})

const getComposable = defineMcpTool({
  description: `A composable or auto-imported helper the module registers: its tab, stability tier, what it is and its generated API page.

WHEN TO USE: before you call a composable, to check that the name exists and find its API (\`useAuth\`, \`useCredits\`, \`getBackendError\`). Read the API page with get-page for its options and return shape.

OUTPUT: the composable's record, its \`api\` page path and the URL of the composables reference; for a name that does not exist, the closest names.`,
  annotations: READ_ONLY,
  inputSchema: {
    name: z.string().min(1).max(200).describe('The composable, such as `useCredits`'),
  },
  inputExamples: [{ name: 'useCredits' }, { name: 'useWorkspace' }],
  handler: ({ name }) => lookupResult('composables', name),
})

const getComponent = defineMcpTool({
  description: `A component the module registers, as its family page documents it: what it is, where it is rendered, its family and labels, its slots, events and states, its props and its accessibility.

WHEN TO USE: before you place or restyle a packaged component (\`<PricingTable>\`, \`<AuthForm>\`), to check its props and slots.

OUTPUT: the component's tab, tier, summary, entry (Markdown) and URL; for a name that does not exist, the closest names.`,
  annotations: READ_ONLY,
  inputSchema: {
    name: z.string().min(1).max(200).describe('The component, such as `PricingTable`, `<PricingTable>` or `pricing-table`'),
  },
  inputExamples: [{ name: 'PricingTable' }, { name: '<AuthForm>' }],
  handler: ({ name }) => lookupResult('components', name),
})

const getUpgradeGuide = defineMcpTool({
  description: `The rename map: every public name a release renamed, reshaped or removed, each with what replaced it and the section of the Upgrade page that explains it.

WHEN TO USE: a name from 0.1 or an older preview (in code, a tutorial or your memory) is not in the current docs. Pass it to find what it became; pass nothing to list the Upgrade page's sections.

OUTPUT: with a name, every entry it is the old or new side of (\`from\`, \`to\`, \`change\`, \`section\`, \`note\`, \`url\`); without one, the sections and how many names each one moves.`,
  annotations: READ_ONLY,
  inputSchema: {
    name: z.string().max(200).optional().describe('An old or new name, such as `useBilling().products` or `doctor --only deployment`'),
  },
  inputExamples: [{ name: 'doctor --only deployment' }, {}],
  handler: ({ name }) => upgradeGuide(name, siteOf(useEvent())),
})

/**
 * A tool under the name the docs MCP lists it by, with no cache (see the
 * top of this file): Docus's two ship with one. The toolkit names a tool it
 * discovers after its file; these are imported, so each is named here. Its
 * list type cannot hold a tool whose `cache` is keyed by that tool's own
 * arguments (the key function makes it contravariant in them), so each is
 * read as a list item, as the toolkit's own loader reads every tool.
 */
const named = (tool: object, name: DocsMcpToolName): McpToolDefinitionListItem & { name: DocsMcpToolName } => ({ ...(tool as McpToolDefinitionListItem), name, cache: undefined })

// Docus's two tools keep their handlers as Docus ships them; their inputs
// get the bounds every other tool has, which Docus's own schemas leave out,
// and examples of this site's paths.

const docusListPages = {
  ...named(listPages, 'list-pages'),
  inputSchema: {
    locale: z.string().max(35).optional().describe('A locale to filter by, such as `en`. These docs are in English only, so every page is listed'),
  },
}

const docusGetPage = {
  ...named(getPage, 'get-page'),
  inputSchema: {
    path: z.string().min(1).max(200).describe('The page\'s path, from list-pages or search, such as `/docs/start/quickstart`'),
  },
  inputExamples: [{ path: '/docs/start/quickstart' }, { path: '/docs/reference/api/use-credits' }],
}

/** Every tool, in DOCS_MCP_TOOLS' order: Docus's two, then the lookups. */
export const DOCS_MCP_TOOL_DEFINITIONS = [
  docusListPages,
  docusGetPage,
  named(search, 'search'),
  named(getDiagnostic, 'get-diagnostic'),
  named(getEnvVar, 'get-env-var'),
  named(getComposable, 'get-composable'),
  named(getComponent, 'get-component'),
  named(getUpgradeGuide, 'get-upgrade-guide'),
]
