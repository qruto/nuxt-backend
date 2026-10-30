import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { McpToolDefinitionListItem } from '@nuxtjs/mcp-toolkit/server'
import { createApp, eventHandler, toNodeListener } from 'h3'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { BACKEND_ENV } from '../../src/env-registry'
import { FINDINGS } from '../../src/findings'
import { RENAMES } from '../../src/guidance/renames'
import { DOCS_MCP_CALLS } from '../../scripts/check-website-agents.mjs'
import { DOCS_MCP_LOOKUPS_FILE } from '../../scripts/docs-lookups/docs-mcp.mjs'
import LOOKUPS from '../../website/server/docs-mcp/lookups.generated.json'
import { lookUp, lookupNames, normalizeName, suggest, upgradeGuide } from '../../website/server/docs-mcp/lookups'
import { queryTerms, rankSections, SEARCH_LIMIT, type SearchSection } from '../../website/server/docs-mcp/search'
import { DOCS_MCP_MAX_BODY, DOCS_MCP_NAME, DOCS_MCP_PAGE, DOCS_MCP_PATH, DOCS_MCP_RATE_LIMIT, DOCS_MCP_ROUTE, DOCS_MCP_TOOLS, DOCS_MCP_URL, docsMcpHost, docsMcpUrl, isDocsMcpHost, MCP_SERVER_CARD_PATH, siteHostOf } from '../../website/shared/docs-mcp'
import { GENERATED_SECTIONS, REFERENCE_ROUTE } from '../../website/shared/docs-routes'
import { SITE } from '../../website/shared/site'
import { contentFile, read } from './helpers'

// The docs MCP (website/shared/docs-mcp.ts): where it answers, what its
// lookups and its search say, the server's protocol with every tool on it,
// read-only and with no sign-in, and the docs host's middleware. The build
// and the live host are held to the same by scripts/check-website-agents.mjs,
// which calls every tool against the built content and checks the per-IP
// limit.

const SITE_URL = 'https://nuxt-backend.dev'

// What the tools reach through Nitro, Nuxt Content and nuxt-agent-discovery,
// stood in: a request event, the site's config, the docs' search sections,
// and the two documents Docus's tools read.
const runtime = vi.hoisted(() => ({
  event: { path: '/api/docs-mcp', node: { req: { headers: {} } }, context: {} } as Record<string, unknown>,
  sections: [] as SearchSection[],
  localFetch: vi.fn(),
  // Nitro's cached functions, recorded: no docs tool may cache (tools.ts).
  cached: vi.fn((fn: unknown) => fn),
}))

vi.mock('nitropack/runtime', () => ({
  useEvent: () => runtime.event,
  useRuntimeConfig: () => ({ agentDiscovery: { siteUrl: SITE_URL }, public: {} }),
  defineCachedFunction: runtime.cached,
  useStorage: () => ({ getItem: async () => null, setItem: async () => {} }),
  useNitroApp: () => ({ localFetch: runtime.localFetch }),
}))
vi.mock('../../website/server/docs-mcp/sections', () => ({ docsSections: async () => runtime.sections }))
vi.mock('#agent-discovery', () => ({
  listAgentPages: async () => [
    { route: '/', title: 'Nuxt backend', url: `${SITE_URL}/` },
    { route: DOCS_MCP_PAGE, title: 'Docs MCP', description: 'These docs as an MCP server.', url: `${SITE_URL}${DOCS_MCP_PAGE}` },
  ],
  getAgentDocument: async (_event: unknown, path: string) => path === DOCS_MCP_PAGE
    ? { title: 'Docs MCP', description: 'These docs as an MCP server.', markdown: '# Docs MCP\n\nVersion: nuxt-backend 0.2.x', canonicalUrl: `${SITE_URL}${DOCS_MCP_PAGE}` }
    : null,
}))

/** A JSON-RPC answer, as the tests read it. */
interface RpcBody {
  result?: {
    isError?: boolean
    content?: Array<{ text?: string }>
    serverInfo?: Record<string, unknown>
    instructions?: string
    tools?: Array<{ name: string, annotations?: Record<string, boolean>, inputSchema: { properties?: object } }>
  }
  error?: { message: string }
}

/** A search section as Nuxt Content splits a page. */
const section = (id: string, title: string, content: string, level = 2, titles: string[] = []): SearchSection => ({ id, title, titles, content, level })

describe('where the docs MCP answers', () => {
  it('is its own host of the canonical site, at /mcp', () => {
    expect(DOCS_MCP_URL).toBe('https://mcp.nuxt-backend.dev/mcp')
    expect(docsMcpUrl(SITE.url)).toBe(DOCS_MCP_URL)
    expect(docsMcpHost('https://nuxt-backend.localhost')).toBe('mcp.nuxt-backend.localhost')
    expect(docsMcpUrl('http://127.0.0.1:3000')).toBe('http://mcp.127.0.0.1:3000/mcp')
    expect(DOCS_MCP_PATH).toBe('/mcp')
  })

  it('tells a docs host by its first label, wherever the site runs', () => {
    for (const host of ['mcp.nuxt-backend.dev', 'MCP.nuxt-backend.dev', 'mcp.nuxt-backend.localhost', 'mcp.wip-dmcp.nuxt-backend.localhost:443']) expect(isDocsMcpHost(host), host).toBe(true)
    for (const host of ['nuxt-backend.dev', 'mcpx.nuxt-backend.dev', 'docs.mcp.nuxt-backend.dev', '', undefined]) expect(isDocsMcpHost(host), String(host)).toBe(false)
    expect(siteHostOf('mcp.nuxt-backend.localhost:3000')).toBe('nuxt-backend.localhost:3000')
  })

  // The product's OAuth gate owns `/mcp` and everything under it.
  it('is served from a route outside the gated /mcp prefix, with a per-IP budget of its own', () => {
    const route: string = DOCS_MCP_ROUTE
    expect(route === '/mcp' || route.startsWith('/mcp/')).toBe(false)
    const config = read('website/nuxt.config.ts')
    const rule = config.slice(config.indexOf('[DOCS_MCP_ROUTE]: {'), config.indexOf('// `app.css` is auto-imported'))
    expect(rule).toContain('rateLimiter: { ...DOCS_MCP_RATE_LIMIT, headers: true },')
    expect(rule).toContain('xssValidator: false,')
    expect(DOCS_MCP_RATE_LIMIT).toEqual({ tokensPerInterval: 120, interval: 60_000 })
    const page = read(contentFile(DOCS_MCP_PAGE))
    expect(page).toContain('120 requests a minute per IP')
    // nuxt-security spends no token on the request that opens an IP's first window.
    expect(page).toContain('so that one window admits 121')
    expect(page).toContain(`one JSON-RPC message of ${DOCS_MCP_MAX_BODY / 1024} KiB at most`)
    expect(page).toContain('a batch answers `400`')
  })

  it('is copied from the page header for the site the deploy names, as the docs host card and llms.txt give it', () => {
    const header = read('website/components/docs/DocsPageHeaderLinks.vue')
    expect(header).toContain('onSelect: () => void copy(docsMcpUrl(site.url))')
    // The card names the site the module names, the deploy's (its homepage).
    expect(read('website/server/plugins/agent-surfaces.ts')).toContain('url: docsMcpUrl(info.homepage)')
    const config = read('website/nuxt.config.ts')
    expect(config).toContain('${docsMcpUrl(siteUrl)} (${siteUrl}${DOCS_MCP_PAGE})')
  })

  it('has a page that connects Claude Code, Cursor, VS Code and any client, and lists every tool', () => {
    const page = read(contentFile(DOCS_MCP_PAGE))
    for (const heading of ['## Claude Code', '## Cursor', '## VS Code', '## Any MCP client', '## Tools']) expect(page, heading).toContain(heading)
    expect(page).toContain(`claude mcp add --transport http ${DOCS_MCP_NAME} ${DOCS_MCP_URL}`)
    for (const tool of DOCS_MCP_TOOLS) expect(page, tool.name).toContain(`| \`${tool.name}\` |`)
  })
})

describe('the lookups', () => {
  it('are generated where the tools read them, from every registry entry', () => {
    expect(DOCS_MCP_LOOKUPS_FILE).toBe('website/server/docs-mcp/lookups.generated.json')
    expect(lookupNames('diagnostics')).toEqual(Object.keys(FINDINGS))
    expect(lookupNames('env')).toEqual(Object.keys(BACKEND_ENV))
    expect(lookupNames('composables')).toContain('useCredits')
    expect(lookupNames('components')).toContain('PricingTable')
  })

  it.each(Object.keys(FINDINGS))('find the finding %s, by its id or its short link', (id) => {
    for (const asked of [id, `/d/${id}`, `${SITE_URL}/d/${id}`, `\`${id}\``]) {
      const found = lookUp('diagnostics', asked, SITE_URL)
      expect(found.found, asked).toBe(true)
      if (!found.found) continue
      expect(found.name).toBe(id)
      expect(found.entry).toContain(`### \`${id}\``)
      expect(found.url).toBe(`${SITE_URL}/docs/reference/cli/diagnostics#${id}`)
    }
  })

  it.each(Object.keys(BACKEND_ENV))('find the variable %s, however it is written', (name) => {
    for (const asked of [name, name.toLowerCase(), `process.env.${name}`, `$${name}`, `${name}=x`]) {
      const found = lookUp('env', asked, SITE_URL)
      expect(found.found && found.name, asked).toBe(name)
    }
  })

  it('find a composable by its name or a call, and a component by its tag', () => {
    const composable = lookUp('composables', 'useCredits()', SITE_URL)
    expect(composable).toMatchObject({ found: true, name: 'useCredits', api: '/docs/reference/api/use-credits', url: `${SITE_URL}/docs/reference/nuxt/composables` })
    for (const asked of ['PricingTable', '<PricingTable>', '<PricingTable />', 'pricing-table', 'pricingtable']) {
      expect(lookUp('components', asked, SITE_URL), asked).toMatchObject({ found: true, name: 'PricingTable', url: `${SITE_URL}/docs/reference/components/billing#pricingtable` })
    }
  })

  it('say a name is not there, where every one is listed, and what is close', () => {
    expect(lookUp('env', 'AUTH_SECRT', SITE_URL)).toEqual({
      found: false,
      message: `nuxt-backend has no environment variable named "AUTH_SECRT". Every one is listed on ${SITE_URL}/docs/reference/configuration/environment-variables.`,
      suggestions: ['AUTH_SECRET'],
    })
    const missing = lookUp('composables', 'useBillingPortal', SITE_URL)
    expect(missing.found).toBe(false)
    expect(!missing.found && missing.suggestions).toContain('useBilling')
    expect(suggest(['useAuth', 'useAuthState'], '')).toEqual([])
    expect(normalizeName('components', '</AuthForm>')).toBe('AuthForm')
  })

  // A lookup table is a plain object, which also answers `constructor`.
  it('find nothing an object inherits, under any kind', () => {
    for (const kind of ['diagnostics', 'env', 'composables', 'components'] as const) {
      for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf', 'isPrototypeOf']) {
        const found = lookUp(kind, name, SITE_URL)
        expect(found.found, `${kind} ${name}`).toBe(false)
        expect(JSON.stringify(found)).not.toContain('undefined')
      }
    }
  })

  it('answer every rename by either side, and list the sections without a name', () => {
    const exact = upgradeGuide('doctor --only deployment', SITE_URL)
    expect(exact.renames?.[0]).toMatchObject({ from: 'doctor --only deployment', to: 'doctor --only data', change: 'renamed' })
    for (const rename of RENAMES) {
      expect(upgradeGuide(rename.from, SITE_URL).renames, rename.from).toContainEqual(expect.objectContaining({ from: rename.from, section: rename.section }))
    }
    const all = upgradeGuide(undefined, SITE_URL)
    expect(all.total).toBe(RENAMES.length)
    expect(all.sections?.map(entry => entry.section)).toEqual([...new Set(RENAMES.map(rename => rename.section))])
    expect(all.sections?.reduce((sum, entry) => sum + entry.names, 0)).toBe(RENAMES.length)
    expect(all.guide).toBe(`${SITE_URL}/docs/ship/releases/upgrade`)
    const none = upgradeGuide('useNothingAtAll', SITE_URL)
    expect(none.renames).toEqual([])
    expect(none.message).toContain('/.well-known/skills/nuxt-backend/references/surface.json')
  })

  it('hold one record per registry entry, each a page of the site', () => {
    for (const kind of ['diagnostics', 'env', 'composables', 'components'] as const) {
      for (const [name, record] of Object.entries(LOOKUPS[kind])) {
        expect(() => contentFile((record as { url: string }).url.split('#')[0]!), `${kind} ${name}`).not.toThrow()
      }
    }
  })
})

describe('the search', () => {
  const sections = [
    section('/docs/build/auth/sign-in#passkeys', 'Passkeys', 'Sign in with a passkey instead of a code. A passkey is bound to the device.'),
    section(`${REFERENCE_ROUTE}/use-passkeys`, 'usePasskeys', 'The passkey composable: register a passkey, list them.', 1),
    section(GENERATED_SECTIONS[0]!, 'Tools', 'Passkey is not mentioned much here, passkey.'),
    section('/docs/build/billing/credits', 'Credits', 'Prepaid credits on provider meters.', 1),
  ]

  it('splits a query into words, keeping the punctuation of a name', () => {
    expect(queryTerms('useAuth() and `env push`, @nuxt/ui!')).toEqual(['useauth', 'and', 'env', 'push', '@nuxt/ui'])
    expect(queryTerms('a ?')).toEqual([])
  })

  it('ranks a hand-written section above a generated one and the API reference, and cuts to the limit', () => {
    const results = rankSections(sections, 'passkey', 10, SITE_URL)
    expect(results.map(result => result.path)).toEqual(['/docs/build/auth/sign-in', `${REFERENCE_ROUTE}/use-passkeys`, GENERATED_SECTIONS[0]!.split('#')[0]])
    expect(results[0]).toMatchObject({ title: 'Passkeys', anchor: 'passkeys', url: `${SITE_URL}/docs/build/auth/sign-in#passkeys` })
    expect(results[0]!.snippet.toLowerCase()).toContain('passkey')
    expect(rankSections(sections, 'passkey', 1, SITE_URL)).toHaveLength(1)
    expect(rankSections(sections, 'passkey', 500, SITE_URL).length).toBeLessThanOrEqual(SEARCH_LIMIT)
    expect(rankSections(sections, 'webhooks', 5, SITE_URL)).toEqual([])
  })
})

describe('the server', () => {
  let answer: (request: Request) => Promise<Response>
  let toolNames: string[]

  beforeAll(async () => {
    // Docus's own two tools use Nitro's and the toolkit's auto-imports.
    vi.stubGlobal('defineMcpTool', (definition: unknown) => definition)
    vi.stubGlobal('useEvent', () => runtime.event)
    vi.stubGlobal('useRuntimeConfig', () => ({ public: {} }))
    vi.stubGlobal('createError', (input: { statusCode: number, message: string }) => Object.assign(new Error(input.message), input))
    const { answerDocsMcp } = await import('../../website/server/docs-mcp/server')
    // By a path TypeScript does not follow: the tools import Docus's own,
    // whose sources rely on Nitro's globals, which only the website's type
    // check declares (scripts/typecheck-website.mjs).
    const tools = '../../website/server/docs-mcp/tools'
    const { DOCS_MCP_TOOL_DEFINITIONS } = await import(/* @vite-ignore */ tools) as { DOCS_MCP_TOOL_DEFINITIONS: Array<McpToolDefinitionListItem & { name: string }> }
    toolNames = DOCS_MCP_TOOL_DEFINITIONS.map(tool => tool.name)
    answer = request => answerDocsMcp(request, DOCS_MCP_TOOL_DEFINITIONS)
  })
  afterAll(() => vi.unstubAllGlobals())
  beforeEach(() => {
    runtime.sections = [section('/docs/build/auth/sign-in#passkeys', 'Passkeys', 'Sign in with a passkey.')]
  })

  /** One JSON-RPC call, as an MCP client sends it: no session, no credentials. */
  async function call(method: string, params?: unknown) {
    const response = await answer(new Request(`${SITE_URL}${DOCS_MCP_ROUTE}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept': 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }))
    return { response, body: await response.json() as RpcBody }
  }

  /** A tool's answer, read back from its text content: JSON, or the text of an error. */
  async function tool(name: string, args: Record<string, unknown>) {
    const { body } = await call('tools/call', { name, arguments: args })
    const text = body.result?.content?.[0]?.text ?? 'null'
    let answer: unknown = text
    try {
      answer = JSON.parse(text)
    }
    catch {
      // An error's text: compared as it is.
    }
    return { isError: Boolean(body.result?.isError), answer: answer as Record<string, unknown> }
  }

  it('offers exactly the tools the docs list, Docus\'s own first', () => {
    expect(toolNames).toEqual(DOCS_MCP_TOOLS.map(entry => entry.name))
    expect(DOCS_MCP_CALLS.map(entry => entry.name)).toEqual(toolNames)
  })

  it('initializes with no credentials, and says which tool answers what', async () => {
    const { response, body } = await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } })
    expect(response.status).toBe(200)
    expect(response.headers.get('mcp-session-id')).toBeNull()
    expect(body.result?.serverInfo).toMatchObject({ name: DOCS_MCP_NAME, version: '0.2.x' })
    for (const name of toolNames.filter(name => name !== 'get-page' && name !== 'list-pages')) expect(body.result?.instructions, name).toContain(`\`${name}\``)
  })

  it('lists every tool as read-only, each with its input', async () => {
    const { body } = await call('tools/list', {})
    const tools = body.result?.tools ?? []
    expect(tools.map(entry => entry.name)).toEqual(toolNames)
    for (const entry of tools) {
      expect(entry.annotations, entry.name).toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: false })
    }
    expect(Object.keys(tools.find(entry => entry.name === 'search')!.inputSchema.properties ?? {})).toEqual(['query', 'limit'])
  })

  // The Docs MCP page's table (DOCS_MCP_TOOLS' `input`) against what clients see.
  it('takes exactly the inputs the docs list for each tool', async () => {
    const { body } = await call('tools/list', {})
    for (const entry of body.result?.tools ?? []) {
      const documented = DOCS_MCP_TOOLS.find(tool => tool.name === entry.name)!.input
      expect(Object.keys(entry.inputSchema.properties ?? {}), entry.name).toEqual([...documented.matchAll(/`([^`]+)`/g)].map(([, name]) => name))
    }
  })

  // The toolkit keys a cache on raw arguments, which Nitro keeps in memory.
  it('caches no tool\'s answer, Docus\'s two included', async () => {
    const tools = '../../website/server/docs-mcp/tools'
    const { DOCS_MCP_TOOL_DEFINITIONS } = await import(/* @vite-ignore */ tools) as { DOCS_MCP_TOOL_DEFINITIONS: McpToolDefinitionListItem[] }
    for (const definition of DOCS_MCP_TOOL_DEFINITIONS) expect(definition.cache, definition.name).toBeUndefined()
    runtime.cached.mockClear()
    for (const { name, arguments: args } of DOCS_MCP_CALLS) await tool(name, args)
    expect(runtime.cached).not.toHaveBeenCalled()
  })

  it('answers every tool as the build-output check asks it', async () => {
    runtime.sections = [section('/docs/build/auth/sign-in#passkeys', 'Passkey sign-in', 'Sign in with a passkey.')]
    for (const { name, arguments: args, holds, says } of DOCS_MCP_CALLS) {
      const { isError, answer: result } = await tool(name, args)
      expect(isError, name).toBe(false)
      expect(holds(result as never), `${name} ${says}`).toBe(true)
    }
  })

  it('answers a name it does not have as an error with the closest names', async () => {
    const { isError, answer: result } = await tool('get-component', { name: 'PricingTables' })
    expect(isError).toBe(true)
    expect(result).toMatchObject({ found: false, suggestions: ['PricingTable'] })
    const page = await tool('get-page', { path: '/docs/not-a-page' })
    expect(page).toEqual({ isError: true, answer: 'Page not found' })
  })

  it('refuses input past its bounds, on every tool', async () => {
    const tooLong = {
      'list-pages': { locale: 'x'.repeat(36) },
      'get-page': { path: `/docs/${'x'.repeat(200)}` },
      'search': { query: 'x'.repeat(201) },
      'get-diagnostic': { id: 'x'.repeat(201) },
      'get-env-var': { name: 'x'.repeat(201) },
      'get-composable': { name: 'x'.repeat(201) },
      'get-component': { name: 'x'.repeat(201) },
      'get-upgrade-guide': { name: 'x'.repeat(201) },
    } satisfies Record<(typeof DOCS_MCP_TOOLS)[number]['name'], Record<string, string>>
    for (const [name, args] of Object.entries(tooLong)) {
      const { body } = await call('tools/call', { name, arguments: args })
      expect(body.result?.isError ?? Boolean(body.error), name).toBe(true)
      expect(body.result?.content?.[0]?.text ?? body.error?.message, name).toMatch(/Input validation error/)
    }
    expect(await tool('get-page', { path: '' })).toMatchObject({ isError: true })
  })

  /** A POST of a raw body, as a client that does not speak one message per request sends it. */
  const post = (body: string) => answer(new Request(`${SITE_URL}${DOCS_MCP_ROUTE}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'application/json, text/event-stream' },
    body,
  }))

  // The rate limit counts requests: a batch would carry up to a hundred calls.
  it('refuses a JSON-RPC batch, so a request is one tool call', async () => {
    const message = (id: number) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'search', arguments: { query: `passkey ${id}` } } })
    for (const batch of [[message(1), message(2)], [message(1)], []]) {
      const response = await post(JSON.stringify(batch))
      expect(response.status, String(batch.length)).toBe(400)
      expect(await response.json()).toEqual({ jsonrpc: '2.0', error: { code: -32600, message: 'Batches are not supported: send one JSON-RPC message per request.' }, id: null })
    }
  })

  it('reads one message of a few kilobytes at most, and answers what is not JSON as the transport does', async () => {
    const huge = await post(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping', params: { pad: 'x'.repeat(DOCS_MCP_MAX_BODY) } }))
    expect(huge.status).toBe(413)
    const garbled = await post('{"jsonrpc":')
    expect(garbled.status).toBe(400)
    expect(await garbled.json()).toMatchObject({ error: { code: -32700 } })
    const { response, body } = await call('ping')
    expect(response.status).toBe(200)
    expect(body.result).toEqual({})
  })

  it('opens no stream and ends no session: GET and DELETE answer 405', async () => {
    for (const method of ['GET', 'DELETE']) {
      const response = await answer(new Request(`${SITE_URL}${DOCS_MCP_ROUTE}`, { method, headers: { accept: 'text/event-stream' } }))
      expect(response.status, method).toBe(405)
      expect(response.headers.get('allow')).toBe('POST')
    }
  })
  // The build-output check against a site serving this server: on its docs
  // host and its route, with or without the per-IP budget the build has.
  describe('under the build-output check', () => {
    let site: Server
    let origin: string
    let budget: number | undefined
    // Whether the docs host serves the site, as it did before it was the docs MCP alone.
    let mirror = false
    const spent = new Map<string, number>()

    beforeAll(async () => {
      site = createServer((request, response) => {
        const chunks: Buffer[] = []
        request.on('data', chunk => chunks.push(chunk as Buffer))
        request.on('end', async () => {
          const url = new URL(request.url ?? '/', 'http://site')
          const send = (status: number, headers: Record<string, string>, payload = '') => response.writeHead(status, headers).end(payload)
          const docsHost = request.headers['x-forwarded-host'] === 'mcp.nuxt-backend.dev'
          // Each host's own card: the docs MCP on the docs host.
          if (url.pathname === MCP_SERVER_CARD_PATH) {
            const card = docsHost ? { authentication: { required: false }, endpoints: [{ url: DOCS_MCP_URL }], tools: DOCS_MCP_TOOLS } : { authentication: { required: true }, endpoints: [{ url: 'https://nuxt-backend.dev/mcp' }] }
            return send(200, { 'content-type': 'application/json' }, JSON.stringify(card))
          }
          if (docsHost && url.pathname !== DOCS_MCP_PATH) {
            if (mirror) return send(200, { 'content-type': 'text/html' }, 'the site')
            if (url.pathname.startsWith('/.well-known/oauth-')) return send(404, {})
            return send(308, { location: `https://nuxt-backend.dev${url.pathname}` })
          }
          if (!docsHost && url.pathname !== DOCS_MCP_ROUTE) return send(404, {})
          if (request.method === 'GET' && request.headers.accept?.includes('text/html')) return send(302, { location: `https://nuxt-backend.dev${DOCS_MCP_PAGE}` })
          const ip = String(request.headers['x-forwarded-for'] ?? 'local')
          spent.set(ip, (spent.get(ip) ?? 0) + 1)
          if (budget !== undefined && spent.get(ip)! > budget) return send(429, { 'x-ratelimit-limit': String(budget) })
          const headers = Object.fromEntries(Object.entries(request.headers).filter(([, value]) => typeof value === 'string')) as Record<string, string>
          const reply = await answer(new Request(url, { method: request.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined }))
          send(reply.status, Object.fromEntries(reply.headers), await reply.text())
        })
      })
      await new Promise<void>(resolve => site.listen(0, '127.0.0.1', resolve))
      origin = `http://127.0.0.1:${(site.address() as AddressInfo).port}`
    })
    afterAll(() => new Promise<void>(resolve => site.close(() => resolve())))
    beforeEach(() => {
      spent.clear()
      mirror = false
      runtime.sections = [section('/docs/build/auth/sign-in#passkeys', 'Passkey sign-in', 'Sign in with a passkey.')]
    })

    /** What the check reports against the site, as the build's own run would. */
    async function check() {
      const failures: string[] = []
      const get = (path: string, init?: RequestInit) => fetch(new URL(path, origin), { redirect: 'manual', ...init })
      const { checkDocsMcp } = await import('../../scripts/check-website-agents.mjs')
      await checkDocsMcp({ get, fail: (message: string) => failures.push(message), site: SITE_URL, live: false })
      return failures
    }

    it('passes a server that answers every tool and limits a caller past the budget', async () => {
      budget = DOCS_MCP_RATE_LIMIT.tokensPerInterval
      expect(await check()).toEqual([])
      expect(spent.get('203.0.113.8')).toBe(1)
    }, 30_000)

    it('fails a server that never limits a caller', async () => {
      budget = undefined
      expect(await check()).toEqual([`the docs MCP never limited a caller past ${DOCS_MCP_RATE_LIMIT.tokensPerInterval} requests`])
    }, 30_000)

    it('fails a docs host that serves the site, OAuth metadata and sign-in included', async () => {
      budget = DOCS_MCP_RATE_LIMIT.tokensPerInterval
      mirror = true
      expect(await check()).toEqual([
        'the docs host answered /.well-known/oauth-protected-resource 200, not 404: it has nothing to authorize',
        'the docs host answered /login 200, not 308 to the site\'s /login',
      ])
    }, 30_000)
  })
})

describe('the docs host', () => {
  let server: Server
  let origin: string

  beforeAll(async () => {
    const { default: middleware } = await import('../../website/server/middleware/docs-mcp-host')
    const app = createApp()
    app.use(middleware)
    app.use(eventHandler(event => `the site at ${event.path}`))
    server = createServer(toNodeListener(app))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))
  beforeEach(() => {
    runtime.localFetch.mockReset()
    runtime.localFetch.mockResolvedValue(new Response('{"jsonrpc":"2.0","id":1,"result":{}}', { status: 200, headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '119' } }))
  })

  const MCP_HOST = 'mcp.nuxt-backend.dev'

  it('hands /mcp on the docs host to the docs MCP\'s route, as the caller, with what it accepts', async () => {
    const response = await fetch(`${origin}${DOCS_MCP_PATH}`, {
      method: 'POST',
      headers: { 'x-forwarded-host': MCP_HOST, 'x-forwarded-for': '203.0.113.9', 'accept': 'application/json, text/event-stream', 'content-type': 'application/json' },
      body: '{"jsonrpc":"2.0","id":1,"method":"ping"}',
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('x-ratelimit-remaining')).toBe('119')
    expect(await response.json()).toEqual({ jsonrpc: '2.0', id: 1, result: {} })
    const [target, init] = runtime.localFetch.mock.calls[0]! as [string, { method: string, headers: Headers | Record<string, string>, body: unknown }]
    const headers = new Headers(init.headers)
    expect(target).toBe(DOCS_MCP_ROUTE)
    expect(init.method).toBe('POST')
    expect(headers.get('accept')).toBe('application/json, text/event-stream')
    expect(headers.get('x-forwarded-for')).toBe('203.0.113.9')
    // A request to the site: the route's own requests (Nuxt Content's
    // queries) would otherwise carry the docs host back here.
    expect(headers.get('host')).toBe('nuxt-backend.dev')
    expect(headers.get('x-forwarded-host')).toBe('nuxt-backend.dev')
    expect(Buffer.from(init.body as Uint8Array).toString()).toBe('{"jsonrpc":"2.0","id":1,"method":"ping"}')
  })

  it('sends a browser to the Docs MCP page on the site', async () => {
    const response = await fetch(`${origin}${DOCS_MCP_PATH}`, { headers: { 'x-forwarded-host': MCP_HOST, 'x-forwarded-proto': 'https', 'accept': 'text/html' }, redirect: 'manual' })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(`https://nuxt-backend.dev${DOCS_MCP_PAGE}`)
    expect(runtime.localFetch).not.toHaveBeenCalled()
  })

  it('answers /mcp/ as /mcp', async () => {
    const response = await fetch(`${origin}${DOCS_MCP_PATH}/`, { method: 'POST', headers: { 'x-forwarded-host': MCP_HOST, 'content-type': 'application/json' }, body: '{}' })
    expect(response.status).toBe(200)
    expect(runtime.localFetch.mock.calls[0]![0]).toBe(DOCS_MCP_ROUTE)
  })

  // Nothing to authorize, and no product endpoint: a client that probes is not sent to a sign-in.
  it('publishes no OAuth metadata and none of the product endpoint\'s routes on the docs host', async () => {
    for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-authorization-server', '/mcp/deeplink', '/mcp/badge.svg']) {
      const response = await fetch(`${origin}${path}`, { headers: { 'x-forwarded-host': MCP_HOST }, redirect: 'manual' })
      expect(response.status, path).toBe(404)
      expect(await response.json(), path).toMatchObject({ error: 'not_found' })
    }
    expect(runtime.localFetch).not.toHaveBeenCalled()
  })

  // Sign-in, cookies and the playground belong to the site's one origin.
  it('sends every other path of the docs host to the site, method and query kept', async () => {
    for (const path of ['/', '/docs/start', '/login', '/playground', '/api/auth/get-session?x=1', '/__nuxt_content/docs/query', DOCS_MCP_ROUTE, '/.well-known/mcp/other.json']) {
      const response = await fetch(`${origin}${path}`, { method: 'POST', headers: { 'x-forwarded-host': MCP_HOST, 'x-forwarded-proto': 'https' }, redirect: 'manual' })
      expect(response.status, path).toBe(308)
      expect(response.headers.get('location'), path).toBe(`https://nuxt-backend.dev${path}`)
    }
    expect(runtime.localFetch).not.toHaveBeenCalled()
  })

  // Its card comes from the site's own route, which answers by host
  // (server/plugins/agent-surfaces.ts): the docs MCP's, there.
  it('leaves its MCP server card to the site\'s route, which describes the docs MCP there', async () => {
    const response = await fetch(`${origin}${MCP_SERVER_CARD_PATH}`, { headers: { 'x-forwarded-host': MCP_HOST }, redirect: 'manual' })
    expect(await response.text()).toBe(`the site at ${MCP_SERVER_CARD_PATH}`)
    expect(runtime.localFetch).not.toHaveBeenCalled()
  })

  // The site's own /mcp stays the playground's, behind the package's gate.
  it('leaves every path of the site, /mcp included, to the site', async () => {
    for (const path of ['/mcp', '/mcp/deeplink', '/login', '/.well-known/oauth-protected-resource']) {
      const response = await fetch(`${origin}${path}`, { method: 'POST', headers: { 'x-forwarded-host': 'nuxt-backend.dev' } })
      expect(await response.text(), path).toBe(`the site at ${path}`)
    }
    expect(runtime.localFetch).not.toHaveBeenCalled()
  })
})
