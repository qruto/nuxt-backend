import { existsSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { AGENT_SKILLS, CORE_SKILL, TASK_SKILLS } from '../../src/guidance/skills'
import { checkSurfaces, contentPages, headerLine, LLMS_HEADINGS, MANIFESTS, NOT_FOUND_LINKS, parseLlms, rawTwin, twinFrontmatter, twinRedirects } from '../../scripts/check-website-agents.mjs'
import { readDocsPages } from '../../website/modules/docs-pages'
import { openTwin } from '../../website/shared/agent-markdown'
import { AGENT_LINKS, CORE_SKILL_URL, DOCS_FOR_AGENTS, isGeneratedReference, journeyOrder, LLMS_DETAILS, LLMS_SECTIONS, llmsSectionOf, llmsSections, RENAMES_URL, SITEMAP_LABELS, sitemapByTab, skillsAddCommand, SURFACE_URL, tabOf, twinRoute, VERSION_LINE, type AgentPage } from '../../website/shared/agent-surfaces'
import { DOCS_MCP_CARD, DOCS_MCP_NAME, DOCS_MCP_PAGE, DOCS_MCP_ROUTE, DOCS_MCP_TOOLS, DOCS_MCP_URL, MCP_SERVER_CARD_PATH } from '../../website/shared/docs-mcp'
import { DOCS_REDIRECTS, DOCS_TABS, REFERENCE_ROUTE } from '../../website/shared/docs-routes'
import { DOCS_VERSION } from '../../website/shared/docs-version'
import { PM_NOTE } from '../../website/shared/pm'
import { ROOT_MODULE_PATHS } from '../../website/shared/module-pages'
import { SITE as SITE_COPY } from '../../website/shared/site'
import { at, contentFile, read, walk } from './helpers'

// What the site serves agents (website/shared/agent-surfaces.ts), held to
// the docs tree: llms.txt has a section per tab with every hand-written
// page in reading order and the generated reference left out, the version
// it names is the one the chip and /openapi.json name, each twin opens with
// the page's header, sitemap.md goes by tab with kinds, and the app's own
// pages stay out. scripts/check-website-agents.mjs holds a build to the
// same, and the live site every week.

vi.mock('nitropack/runtime', () => ({ defineNitroPlugin: (plugin: unknown) => plugin }))
// What the content holds, for sitemap.md: the pages a test puts here.
const held: AgentPage[] = []
vi.mock('../../website/server/utils/content-pages', () => ({ contentPages: async () => held }))

const SITE = 'https://nuxt-backend.dev'
const pages = readDocsPages(at('website/content'))
const sections = llmsSections(pages, SITE)
const config = read('website/nuxt.config.ts')
const routeOf = (href: string) => href.slice(SITE.length)

type Node = string | [string, Record<string, unknown>, ...Node[]]
const body = (...value: Node[]) => ({ type: 'minimark', value })
const text = (nodes: Node[]): string => nodes.map(node => typeof node === 'string' ? node : text(node.slice(2) as Node[])).join('')

/** Where `route` sits in `list`, which must hold it. */
function place(list: string[], route: string): number {
  const index = list.indexOf(route)
  expect(index, route).toBeGreaterThanOrEqual(0)
  return index
}

describe('llms.txt', () => {
  it('is built from the docs tree, a section per tab and per Build group', () => {
    expect(config).toContain('...llmsSections(readDocsPages(fileURLToPath(new URL(\'./content\', import.meta.url))), siteUrl),')
    // The tab titles are the section titles, in the header's order, Build's groups after its landing.
    expect(sections.map(section => section.title)).toEqual(LLMS_SECTIONS.map(section => section.title))
    expect(LLMS_SECTIONS.map(section => section.title)).toEqual(expect.arrayContaining([...DOCS_TABS.map(tab => tab.title), 'Build: Billing', 'Build: Growth']))
  })

  it('lists every hand-written page in exactly one section, each tab\'s landing first', () => {
    const handWritten = pages.filter(page => !isGeneratedReference(page.route)).map(page => page.route)
    const listed = sections.flatMap(section => section.links.map(link => routeOf(link.href)))
    expect([...listed].sort()).toEqual([...handWritten].sort())
    for (const [index, tab] of LLMS_SECTIONS.entries()) {
      expect(sections[index]!.links[0]!.href, tab.title).toBe(`${SITE}${tab.path}`)
      expect(sections[index]!.links.every(link => llmsSectionOf(routeOf(link.href)) === tab), tab.title).toBe(true)
    }
  })

  // llms-full.txt follows these links: the generated reference is a lookup.
  it('leaves the generated API reference out of the links, and so out of llms-full.txt', () => {
    expect(pages.filter(page => isGeneratedReference(page.route)).length).toBeGreaterThan(20)
    expect(sections.flatMap(section => section.links).filter(link => isGeneratedReference(routeOf(link.href)))).toEqual([])
    expect(isGeneratedReference(REFERENCE_ROUTE)).toBe(true)
  })

  // One linked index, in prose: nuxt-agent-discovery follows a section's
  // links into llms-full.txt, never its description.
  it('names the generated API reference\'s index once, in the Reference section\'s prose', () => {
    const withIndex = sections.filter(section => section.description?.includes(`](${SITE}/raw${REFERENCE_ROUTE}.md)`))
    expect(withIndex.map(section => section.title)).toEqual([tabOf(REFERENCE_ROUTE)!.title])
    expect(pages.some(page => page.route === REFERENCE_ROUTE)).toBe(true)
  })

  it('lists each tab in reading order: the sidebar\'s, with a group\'s landing before its pages', () => {
    const start = sections[0]!.links.map(link => routeOf(link.href))
    expect(place(start, '/docs/start/quickstart')).toBeLessThan(place(start, '/docs/start/installation'))
    expect(place(start, '/docs/start/installation')).toBeLessThan(place(start, '/docs/start/templates'))
    expect(place(start, '/docs/start/templates')).toBeLessThan(place(start, '/docs/start/concepts/how-it-works'))
    const billing = sections.find(section => section.title === 'Build: Billing')!.links.map(link => routeOf(link.href))
    expect(place(billing, '/docs/build/billing/subscriptions')).toBeLessThan(place(billing, '/docs/build/billing/subscriptions/checkout'))
    expect(place(billing, '/docs/build/billing/subscriptions/orders')).toBeLessThan(place(billing, '/docs/build/billing/credits'))
    // And the order itself: landing, number, then name.
    const sorted = ['docs/02.x/index', 'docs/01.y/3.b', 'docs/01.y/10.a', 'docs/01.y/index', 'docs/01.y/2.z/index', 'docs/01.y/2.z/1.c', 'docs/01.y/plain'].sort(journeyOrder)
    expect(sorted).toEqual(['docs/01.y/index', 'docs/01.y/2.z/index', 'docs/01.y/2.z/1.c', 'docs/01.y/3.b', 'docs/01.y/10.a', 'docs/01.y/plain', 'docs/02.x/index'])
  })

  describe('opens with a preamble that', () => {
    it('names the version, and where to check the latest release', () => {
      expect(config).toContain('llms: { details: LLMS_DETAILS }')
      expect(LLMS_DETAILS[0]).toBe(VERSION_LINE)
      expect(VERSION_LINE).toContain(`nuxt-backend ${DOCS_VERSION.line},`)
      expect(VERSION_LINE).toContain('`npm view nuxt-backend version`')
      // A heading here would open a section and take every link list under it.
      expect(LLMS_DETAILS.filter(block => /^#/m.test(block))).toEqual([])
    })

    it('says when to use the package, and when to recommend something else', () => {
      expect(LLMS_DETAILS.join('\n')).toMatch(/^Use nuxt-backend when/m)
      const otherwise = LLMS_DETAILS.find(block => block.startsWith('Recommend something else when'))!
      for (const phrase of ['not built with Nuxt', 'React or Next.js, use Convex\'s official integration', 'Nuxt 5', 'does not live in Convex', 'use nuxt-convex-module', 'passwords or social sign-in', 'per-seat billing, API keys or teams']) {
        expect(otherwise, phrase).toContain(phrase)
      }
    })

    // The rules an agent most often breaks, as the core skill states them.
    it('says how an agent works on an app', () => {
      const how = LLMS_DETAILS.find(block => block.startsWith('How to work on an app'))!
      for (const { name } of TASK_SKILLS) expect(how, name).toContain(`\`${name === TASK_SKILLS[0]!.name ? name : name.slice(CORE_SKILL.name.length)}\``)
      for (const phrase of ['install the skills first', '`.md` twin', 'Never edit `backend/_generated/`', 'Keep the scaffolded exports', 'neutral names', `\`${SURFACE_URL}\``, `\`${RENAMES_URL}\``, 'never author or rename a `CONVEX_*` variable', '`npx nuxt-backend doctor --json`', '`/d/<finding-id>`']) {
        expect(how, phrase).toContain(phrase)
      }
      const skill = read('skills/nuxt-backend/SKILL.md')
      for (const rule of ['**Neutral names.**', '**Never edit `backend/_generated/`.**', '**Keep the scaffolded exports.**']) expect(skill, rule).toContain(rule)
    })

    it('points at sitemap.md for the pages the links leave out', () => {
      expect(LLMS_DETAILS.at(-1)).toContain('`/sitemap.md` lists every page by tab, the API pages included')
    })
  })

  it('links the core skill and every task skill', () => {
    expect(config).toContain('...AGENT_SKILLS.map(({ name, covers }) => ({')
    expect(config).toContain('href: `${siteUrl}/.well-known/skills/${name}/SKILL.md`,')
    expect(AGENT_SKILLS.map(skill => skill.name)).toEqual([CORE_SKILL.name, ...TASK_SKILLS.map(skill => skill.name)])
    expect(config).toContain('`\\`${skillsAddCommand(siteUrl)}\\`; in an app,')
  })

  // /playground is excluded from agent discovery, so nuxt-agent-discovery
  // leaves its link the page instead of a /raw twin that does not exist,
  // and llms-full.txt skips it.
  it('keeps a Live playground section, its link the page itself', () => {
    const playground = config.slice(config.indexOf('title: \'Live playground\','), config.indexOf('title: \'Agent skills\','))
    expect(playground).toContain('href: `${siteUrl}${PANELS_BASE}`,')
    expect(playground).toContain('no Markdown twin')
    expect(config).toContain('excludePrefixes: { extend: [PANELS_BASE, ...ROOT_MODULE_PATHS] },')
    expect(LLMS_HEADINGS.slice(-3)).toEqual(['Live playground', 'Agent skills', 'Notes'])
  })
})

describe('the version these docs describe', () => {
  const [major, minor] = (JSON.parse(read('package.json')) as { version: string }).version.split('.').map(Number) as [number, number]

  // Released, the line is package.json's; until then it is the next minor,
  // the one main is building.
  it('is package.json\'s line once released, the next one until then', () => {
    expect(DOCS_VERSION.line).toBe(DOCS_VERSION.released ? `${major}.${minor}.x` : `${major}.${minor + 1}.x`)
  })

  it('is what llms.txt, the twins, /openapi.json and the version chip say', () => {
    expect(VERSION_LINE).toContain(DOCS_VERSION.line)
    expect(config).toContain('docus: { version: DOCS_VERSION.line },')
    expect(read('website/components/app/AppHeaderVersion.vue')).toContain('DOCS_VERSION.line')
    const page = body(['p', {}, 'Body.'])
    openTwin(page, { path: '/docs/start', kind: 'landing' })
    expect(text([page.value[0]!])).toContain(`nuxt-backend ${DOCS_VERSION.line}`)
  })
})

describe('the twins', () => {
  const keys = { playground: '/playground/platform/email', api: '/docs/reference/api/email', source: 'src/convex/integrations/email.ts' }
  const pointers: Node = ['p', {}, 'Every page: ', ['a', { href: '/llms.txt' }, 'llms.txt'], ' · Skill for coding agents: ', ['a', { href: CORE_SKILL_URL }, CORE_SKILL.name]]
  // The twin's commands stay npm, and it says so once.
  const note: Node = ['p', {}, PM_NOTE]

  it('open with the page\'s header: version, tab, kind and status, the index and the skill, then its keys', () => {
    const page = body(['p', {}, 'Text.'])
    openTwin(page, { path: '/docs/build/email/sending', kind: 'how-to', status: 'experimental', ...keys })
    expect(page.value[0]).toEqual(['p', {}, `Version: nuxt-backend ${DOCS_VERSION.line}${DOCS_VERSION.released ? '' : ' (not on npm yet)'} · Tab: Build · Kind: how-to · Status: experimental`])
    expect(page.value[1]).toEqual(pointers)
    expect(page.value[2]).toEqual(note)
    expect(CORE_SKILL_URL).toBe(`/.well-known/skills/${CORE_SKILL.name}/SKILL.md`)
    expect(page.value[3]).toEqual(['ul', {},
      ['li', {}, ['a', { href: '/playground/platform/email' }, 'Try it live in the playground']],
      ['li', {}, ['a', { href: '/docs/reference/api/email' }, 'API reference']],
      ['li', {}, ['a', { href: 'https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts' }, 'Source']],
    ])
    expect(page.value[4]).toEqual(['p', {}, 'Text.'])
  })

  it('say a page without a status is stable, and list no keys a page has none of', () => {
    const page = body(['p', {}, 'Text.'])
    openTwin(page, { path: '/docs/reference/cli', kind: 'reference' })
    expect(text([page.value[0]!])).toMatch(/· Tab: Reference · Kind: reference · Status: stable$/)
    expect(page.value.slice(1)).toEqual([pointers, note, ['p', {}, 'Text.']])
  })

  it('open once, under a title the page already has', () => {
    const page = body(['h1', {}, 'API reference'], ['p', {}, 'Text.'])
    openTwin(page, { path: '/docs/reference/api', kind: 'reference' })
    openTwin(page, { path: '/docs/reference/api', kind: 'reference' })
    expect(page.value[0]).toEqual(['h1', {}, 'API reference'])
    expect(text([page.value[1]!])).toMatch(/^Version: /)
    expect(page.value.slice(2)).toEqual([pointers, note, ['p', {}, 'Text.']])
  })

  it('give up the wrapper of a block that holds its text, and keep every other', () => {
    const page = body(['what-you-get', { area: 'x' }, ['ul', {}, ['li', {}, 'One']]], ['note', {}, ['p', {}, 'Kept.']], ['card-group', {}, ['agent-prompt-links', {}, ['p', {}, 'Links.']]])
    openTwin(page, { path: '/docs/develop/agents' })
    expect(page.value.slice(3)).toEqual([['ul', {}, ['li', {}, 'One']], ['note', {}, ['p', {}, 'Kept.']], ['card-group', {}, ['p', {}, 'Links.']]])
  })

  // The build-output check states the header on its own, from the content's
  // frontmatter; it has to be the one the twins open with, for every page.
  it('open with the header line the build-output check expects, page by page', () => {
    const checked = contentPages()
    expect(checked.length).toBe(pages.length + 1)
    for (const page of checked) {
      const twin = body(['p', {}, 'Text.'])
      const fields = pages.find(entry => entry.route === page.route)
      openTwin(twin, { path: page.route, kind: fields?.kind, status: fields?.status })
      expect(text([twin.value[0]!]), page.route).toBe(headerLine(page))
    }
  })

  // The homepage is a console of Vue blocks: its twin, /raw/index.md, is
  // what they stand for, written out.
  it('write the homepage out: every block of content/index.md stands for text', () => {
    const blocks = [...read('website/content/index.md').matchAll(/^::([a-z-]+)$/gm)].map(([, name]) => name!)
    expect(blocks).toEqual(['home-hero', 'home-modules', 'home-console', 'home-all-in-one', 'home-closing-cta'])
    const page = body(...blocks.map((name): Node => [name, {}]))
    openTwin(page, { path: '/' })
    const nodes = page.value as Node[]
    expect(nodes.some(node => Array.isArray(node) && node[0].startsWith('home-'))).toBe(false)
    const words = text(nodes)
    expect(words).toContain('npx nuxt module add nuxt-backend')
    expect(words).toContain('npx nuxt-backend doctor --only billing')
    expect(words).toContain('Everything behind a client app')
    expect(words).toContain('One package, not twelve integrations')
    expect(words).toContain(skillsAddCommand(SITE_COPY.url))
    expect(words).toContain(SITE_COPY.closing.join(' ').replaceAll('⁠', ''))
    for (const { name } of TASK_SKILLS) expect(words, name).toContain(name)
    expect(JSON.stringify(nodes)).toContain(`{"href":"${DOCS_FOR_AGENTS}"}`)
    // The first page an agent reads names the docs MCP, and links its page.
    expect(words).toContain(DOCS_MCP_URL)
    expect(JSON.stringify(nodes)).toContain(`{"href":"${DOCS_MCP_PAGE}"}`)
  })

  it('give the homepage a title and description to open with', () => {
    const home = read('website/content/index.md')
    expect(home).toMatch(/^title: Nuxt backend$/m)
    expect(home).toMatch(/^description: The all-in-one backend for client apps on Nuxt and Convex/m)
  })

  // Docs for agents shows a twin's opening as it is: pinned to the header
  // the Credits page gets today, so a release-line change updates it.
  it('are shown on Docs for agents as the Credits page opens', () => {
    const doc = read(contentFile(DOCS_FOR_AGENTS))
    const credits = contentPages().find(page => page.route === '/docs/build/billing/credits')!
    expect(doc).toContain(`\n${headerLine(credits)}\n\nEvery page: [llms.txt](${SITE}/llms.txt) · Skill for coding agents: [${CORE_SKILL.name}](${SITE}${CORE_SKILL_URL})\n`)
    expect(doc).not.toMatch(/`\d+\.\d+\.x`/)
  })
})

describe('sitemap.md', () => {
  const sample: AgentPage[] = [
    { route: '/', stem: 'index', title: 'Nuxt backend', kind: 'landing' },
    { route: '/docs/develop/agents', stem: 'docs/03.develop/8.agents/index', title: 'Agents', kind: 'landing' },
    { route: '/docs/develop/agents/mcp', stem: 'docs/03.develop/8.agents/1.mcp/index', title: 'MCP server', kind: 'how-to', status: 'experimental' },
    { route: '/docs/start/installation', stem: 'docs/01.start/3.installation', title: 'Installation', kind: 'how-to' },
    { route: '/docs/start/quickstart', stem: 'docs/01.start/1.quickstart', title: 'Quickstart', kind: 'tutorial' },
  ]
  const raw = (route: string) => `${SITE}${rawTwin(route)}`
  // What the module hands the hook: grouped by path segment, in path order.
  const grouped = () => new Map([
    ['agents', [{ title: 'Agents', href: raw('/docs/develop/agents') }, { title: 'MCP server', href: raw('/docs/develop/agents/mcp') }]],
    ['start', [{ title: 'Installation', href: raw('/docs/start/installation') }, { title: 'Quickstart', href: raw('/docs/start/quickstart') }]],
    ['pages', [{ title: 'Nuxt backend', href: raw('/') }]],
  ])

  it('goes by tab, in the header\'s order after the homepage, each page in reading order with its kind', () => {
    const sections = grouped()
    sitemapByTab(sections, sample, href => twinRoute(href))
    expect([...sections.keys()]).toEqual(['pages', 'start', 'agents'])
    expect(sections.get('start')!.map(entry => entry.title)).toEqual(['Quickstart (tutorial)', 'Installation (how-to)'])
    expect(sections.get('agents')!.map(entry => entry.title)).toEqual(['Agents (landing)', 'MCP server (how-to, experimental)'])
  })

  it('heads each section with its tab\'s title', () => {
    expect(config).toContain('sitemap: { markdown: { expand: [\'/docs\'], labels: SITEMAP_LABELS } },')
    expect(Object.values(SITEMAP_LABELS)).toEqual(['Home', ...DOCS_TABS.map(tab => tab.title)])
  })

  it('reads a twin back to its page', () => {
    expect(twinRoute(`${SITE}/raw/docs/start.md`)).toBe('/docs/start')
    expect(twinRoute(`${SITE}/raw/index.md`)).toBe('/')
    expect(twinRoute(`${SITE}/docs/start`)).toBeUndefined()
  })
})

describe('the site\'s hooks', () => {
  type Handler = (event: unknown, value: never) => unknown
  const hooks = new Map<string, Handler>()

  beforeAll(async () => {
    const { default: plugin } = await import('../../website/server/plugins/agent-surfaces')
    plugin({ hooks: { hook: (name: string, handler: Handler) => hooks.set(name, handler) } } as never)
  })

  it('open every twin with its page\'s header', () => {
    const page = { path: '/docs/build/data/read-write/search', kind: 'how-to', body: body(['p', {}, 'Text.']) }
    hooks.get('agent-discovery:document')!({}, page as never)
    expect(text([page.body.value[0]!])).toContain('Tab: Build · Kind: how-to')
  })

  it('order sitemap.md from what the content holds', async () => {
    held.push(...startPages(), { route: '/', stem: 'index', title: 'Nuxt backend', kind: 'landing' })
    const sections = new Map([['start', [{ title: 'Installation', href: `${SITE}/raw/docs/start/installation.md` }, { title: 'Quickstart', href: `${SITE}/raw/docs/start/quickstart.md` }]], ['pages', [{ title: 'Nuxt backend', href: `${SITE}/raw/index.md` }]]])
    await hooks.get('agent-discovery:sitemap')!({}, sections as never)
    expect([...sections.keys()]).toEqual(['pages', 'start'])
    expect(sections.get('pages')![0]!.title).toBe('Nuxt backend (landing)')
    expect(sections.get('start')!.map(entry => entry.title)).toEqual(['Quickstart (tutorial)', 'Installation (how-to)'])
    function startPages(): AgentPage[] {
      return [
        { route: '/docs/start/installation', stem: 'docs/01.start/3.installation', title: 'Installation', kind: 'how-to' },
        { route: '/docs/start/quickstart', stem: 'docs/01.start/1.quickstart', title: 'Quickstart', kind: 'tutorial' },
      ]
    }
  })

  /** A request to the card route at `host`, as h3 reads it behind the platform's edge. */
  const onHost = (host: string) => ({ node: { req: { headers: { 'x-forwarded-host': host } } } })

  // The site serves no MCP endpoint of its own, so the card of either host
  // describes the docs MCP, its tools and no sign-in, never the toolkit's own
  // lists the module found.
  it.each(['nuxt-backend.dev', 'mcp.nuxt-backend.dev'])('describe the docs MCP on the card at %s, with its tools and no sign-in', (host) => {
    const card: Record<string, unknown> = {
      serverInfo: { name: 'nuxt-backend-docs', title: 'Nuxt backend docs', homepage: 'https://nuxt-backend.dev', version: '0.2', license: 'MIT' },
      endpoints: [{ type: 'streamable-http', url: 'https://nuxt-backend.dev/mcp' }],
      authentication: { required: false },
      capabilities: { tools: {}, resources: {}, prompts: {} },
      tools: [{ name: 'list-pages' }],
      resources: [],
      prompts: [],
    }
    hooks.get('agent-discovery:mcp-server-card')!(onHost(host), card as never)
    expect(card).toEqual({
      serverInfo: { name: DOCS_MCP_NAME, ...DOCS_MCP_CARD, homepage: 'https://nuxt-backend.dev', documentation: `https://nuxt-backend.dev${DOCS_MCP_PAGE}`, version: '0.2', license: 'MIT' },
      endpoints: [{ type: 'streamable-http', url: DOCS_MCP_URL }],
      authentication: { required: false },
      capabilities: { tools: { listChanged: false } },
      tools: DOCS_MCP_TOOLS.map(({ name, description }) => ({ name, description })),
    })
  })

  // Each works around nuxt-agent-discovery, as the llms.txt sections do;
  // .github/upstream.json asks for the fixes.
  it('are workarounds, each with an upstream ask', () => {
    const { asks } = JSON.parse(read('.github/upstream.json')) as { asks: Array<{ owner: string, blocks: string, fallback: string }> }
    const ours = asks.filter(ask => ask.owner === 'benjamincanac/nuxt-agent-discovery')
    expect(ours.map(ask => ask.blocks.split(',')[0])).toEqual(['D7a', 'D7a', 'D7a'])
    expect(ours.map(ask => ask.fallback).join('\n')).toMatch(/agent-surfaces\.ts[\s\S]*replaces the tool list[\s\S]*llmsSections/)
  })
})

describe('discovery', () => {
  const card = config.slice(config.indexOf('mcpServerCard: {'), config.indexOf('links: AGENT_LINKS'))

  // The config's card is the docs MCP's: the site has no endpoint of its own.
  it('describes the docs MCP in the config, not an endpoint of the site\'s own', () => {
    expect(card).toContain('endpoint: DOCS_MCP_PATH,')
    expect(card).toContain('name: DOCS_MCP_NAME,')
    expect(card).toContain('...DOCS_MCP_CARD,')
    expect(card).toContain('documentation: DOCS_MCP_PAGE,')
    expect(card).toContain('version: DOCS_VERSION.line,')
    expect(card).not.toContain('playground')
    expect(config).toContain('mcp: {\n    enabled: false,\n  },')
  })

  // The docs host's card (server/plugins/agent-surfaces.ts): what a docs agent connects to.
  it('says on the docs host\'s card what the docs MCP does: reads, with no sign-in, rate-limited', () => {
    expect(DOCS_MCP_NAME).toBe('nuxt-backend-docs')
    expect(DOCS_MCP_CARD.description).toContain('Read-only, with no sign-in, and rate-limited per IP.')
    expect(() => contentFile(DOCS_MCP_PAGE)).not.toThrow()
  })

  // Each host answers its own card, so neither may be a prerendered file.
  it('renders the card per request, never prerendered', () => {
    expect(config).toContain('[MCP_SERVER_CARD_PATH]: { prerender: false },')
    expect(MCP_SERVER_CARD_PATH).toBe('/.well-known/mcp/server-card.json')
  })

  // The skills route (`agentDiscovery.skills`) serves and prerenders every
  // file of each skill, the core's manifest and rename map among them.
  it('serves the manifest and the rename map as the core skill\'s own files', () => {
    expect(config).toContain('skills: { dir: \'../skills\' },')
    expect([SURFACE_URL, RENAMES_URL]).toEqual([MANIFESTS.surface, MANIFESTS.renames])
    for (const url of [SURFACE_URL, RENAMES_URL]) {
      expect(url).toMatch(new RegExp(`^/\\.well-known/skills/${CORE_SKILL.name}/references/\\w+\\.json$`))
      expect(existsSync(at(`skills/${url.slice('/.well-known/skills/'.length)}`)), url).toBe(true)
    }
    // No hand-written route stands in for the module's: the site's only route
    // file is the docs assistant's (test/docs/site-vercel.test.ts).
    expect(existsSync(at('website/server/routes/.well-known'))).toBe(false)
    expect(walk('website/server/routes', ['.ts', '.js', '.mjs'])).toEqual([at('website/server/routes/__docus__/assistant.ts')])
  })

  it('links documents that exist, which the Markdown 404 lists', () => {
    const files: Record<string, () => boolean> = {
      [SURFACE_URL]: () => existsSync(at('skills/nuxt-backend/references/surface.json')),
      [RENAMES_URL]: () => existsSync(at('skills/nuxt-backend/references/renames.json')),
      '/schemas/doctor.json': () => Boolean(read('website/public/schemas/doctor.json')),
      [DOCS_FOR_AGENTS]: () => Boolean(contentFile(DOCS_FOR_AGENTS)),
      [DOCS_MCP_PAGE]: () => Boolean(contentFile(DOCS_MCP_PAGE)),
    }
    expect(AGENT_LINKS.map(link => link.href)).toEqual(Object.keys(files))
    for (const [href, exists] of Object.entries(files)) expect(exists(), href).toBe(true)
    expect(config).toContain('links: AGENT_LINKS,')
    const linked = new Set(['/llms.txt', '/sitemap.md', ...AGENT_LINKS.map(link => link.href)])
    for (const path of NOT_FOUND_LINKS) expect(linked.has(path), path).toBe(true)
  })

  it('leaves the playground and the app\'s own pages out of every agent surface', () => {
    expect(config).toContain('excludePrefixes: { extend: [PANELS_BASE, ...ROOT_MODULE_PATHS] },')
    expect([...ROOT_MODULE_PATHS].sort()).toEqual(['/login'])
  })

  // Docus's default, `/mcp`, is the playground's OAuth-gated endpoint; the
  // assistant is on only with a credential (test/docs/site-vercel.test.ts).
  it('points the docs assistant at the docs MCP\'s route, which it calls in-process', () => {
    const assistant = config.slice(config.indexOf('  docus: {'), config.indexOf('  // Self-hosted webfonts.'))
    expect(assistant).toContain('mcpServer: DOCS_MCP_ROUTE,')
    expect(assistant).not.toMatch(/mcpServer: ['"`]/)
    expect(DOCS_MCP_ROUTE).toBe('/api/docs-mcp')
  })
})

describe('the build-output check', () => {
  it('runs on every website build, and on the live site every week', () => {
    const ci = read('.github/workflows/ci.yml')
    expect(ci.indexOf('run: node scripts/check-website-agents.mjs')).toBeGreaterThan(ci.indexOf('run: pnpm exec nuxt build website'))
    const weekly = read('.github/workflows/weekly.yml')
    expect(weekly).toContain('run: node scripts/check-website-agents.mjs --origin https://nuxt-backend.dev')
    expect(weekly).toMatch(/needs:\n(?:\s+- \w+\n)*\s+- agents\n/)
  })

  it('reads the pages the docs build reads, and every twin redirect the route table makes', () => {
    expect(contentPages().map(page => page.route).sort()).toEqual(['/', ...pages.map(page => page.route)].sort())
    expect(twinRedirects()).toHaveLength(DOCS_REDIRECTS.length * 2)
    expect(twinRedirects()).toContainEqual({ from: '/raw/getting-started/installation.md', to: '/raw/docs/start/installation.md', status: 301 })
  })

  it('expects llms.txt\'s sections as the site builds them', () => {
    expect(LLMS_HEADINGS).toEqual(['Overview', 'Documentation Sets', ...sections.map(section => section.title), 'Live playground', 'Agent skills', 'Notes'])
    // Docs for agents describes the same layout.
    expect(read(contentFile(DOCS_FOR_AGENTS))).toContain('Then a link to the homepage\'s twin and one to `/llms-full.txt`. Then one section per tab')
  })

  it('reads llms.txt and a twin back', () => {
    const llms = parseLlms(`# Nuxt backend\n\n> What it is.\n\n${VERSION_LINE}\n\n## Start\n\n- [Introduction](${SITE}/raw/docs/start.md): Text: with a colon.\n- [Bare](${SITE}/raw/docs/bare.md)\n\n## Notes\n\n- A note.`)
    expect(llms.version).toBe(DOCS_VERSION.line)
    expect(llms.sections).toEqual([
      { title: 'Start', links: [{ title: 'Introduction', href: `${SITE}/raw/docs/start.md`, description: 'Text: with a colon.' }, { title: 'Bare', href: `${SITE}/raw/docs/bare.md` }] },
      { title: 'Notes', links: [] },
    ])
    expect(twinFrontmatter('---\ntitle: "Credits & top-ups"\ndescription: "A \\"quoted\\" word."\ncanonical_url: "x"\n---\n# Credits')).toEqual({ title: 'Credits & top-ups', description: 'A "quoted" word.' })
  })

  // A site that answers everything wrong: each promise comes back as a failure.
  describe('against a site that breaks every promise', () => {
    let server: Server
    let origin: string
    beforeAll(async () => {
      server = createServer((request, response) => {
        const path = request.url ?? '/'
        const send = (status: number, type: string, payload: string, headers: Record<string, string> = {}) => response.writeHead(status, { 'content-type': type, ...headers }).end(payload)
        if (path === '/openapi.json') return send(200, 'application/json', JSON.stringify({ info: { version: '0.0.0' }, servers: [{ url: SITE }] }))
        if (path === '/llms.txt') {
          return send(200, 'text/plain', [
            '# Nuxt backend',
            '',
            'These docs describe nuxt-backend 9.9.x, soon.',
            '',
            '## Start',
            '',
            `- [Introduction](${SITE}/raw/docs/start.md): What it is.`,
            `- [Auth](${SITE}/raw/docs/build/auth.md): Sign-in.`,
            `- [API](${SITE}/raw/docs/reference/api/auth.md): Generated.`,
            '',
            '## Ship',
            '',
            `- [Introduction](${SITE}/raw/docs/start.md): What it is.`,
            '',
          ].join('\n'))
        }
        // A twin with no header, and a description its page does not have.
        if (path === '/raw/docs/start.md') return send(200, 'text/markdown', '---\ntitle: "Introduction"\ndescription: "Something else."\n---\n# Introduction\n\nText.\n')
        if (path === '/raw/index.md') return send(200, 'text/markdown', '# Nuxt backend\n\n<home-hero></home-hero>\n')
        if (path === '/sitemap.md') return send(200, 'text/markdown', `## Docs\n\n- [Introduction](${SITE}/raw/docs/start.md)\n`)
        if (path === '/getting-started/installation.md') return send(301, 'text/plain', '', { location: '/docs/wrong.md' })
        if (path === '/.well-known/skills/index.json') return send(200, 'application/json', JSON.stringify({ skills: [{ name: CORE_SKILL.name }] }))
        if (path === '/.well-known/mcp/server-card.json') return send(200, 'application/json', JSON.stringify({ authentication: { required: false }, endpoints: [{ url: `${SITE}/mcp` }] }))
        if (path === '/mcp') return send(200, 'application/json', '{}')
        if (path === '/playground') return send(404, 'text/markdown', '# 404')
        return send(404, 'text/html', 'Not here')
      })
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
      origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    })
    afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))

    it('reports each one', async () => {
      const failures = await checkSurfaces(origin)
      const said = failures.join('\n')
      expect(said).toContain('/llms.txt describes 9.9.x')
      expect(said).toContain('/openapi.json says 0.0.0')
      expect(said).toContain('/llms.txt has the sections Start, Ship, not Overview, Documentation Sets, Start')
      expect(said).toContain('/raw/docs/build/auth.md is linked under Start in /llms.txt, not under its own tab')
      expect(said).toContain('/raw/docs/reference/api/auth.md, a generated API page, is linked under Start')
      expect(said).toContain('/raw/docs/start.md is linked under Start and Ship in /llms.txt: a page sits in one section')
      expect(said).toMatch(/\/llms\.txt leaves out \d+ hand-written pages/)
      expect(said).toContain('/raw/docs/build/auth.md, linked from /llms.txt, answered 404')
      expect(said).toContain('/raw/docs/start.md does not open with its header: no header line')
      expect(said).toContain('/raw/docs/start.md\'s description in /llms.txt is not the page\'s: "What it is.", not "Something else."')
      expect(said).toContain('/raw/index.md still holds the homepage\'s component tags')
      expect(said).toContain('/raw/index.md does not give the install command')
      expect(said).toContain(`/raw/index.md does not give the docs MCP's URL, ${DOCS_MCP_URL}`)
      expect(said).toContain('/sitemap.md leaves out')
      expect(said).toContain('/getting-started/installation.md answered 301 → /docs/wrong.md, not 301 → /docs/start/installation.md')
      expect(said).toContain('/raw/getting-started/installation.md answered 404')
      expect(said).toContain('a missing twin answered 404 text/html, not a Markdown 404')
      expect(said).toContain(`/.well-known/skills/index.json does not list ${TASK_SKILLS[0]!.name}`)
      expect(said).toContain(`${MANIFESTS.surface} answered 404`)
      expect(said).toContain(`the site's MCP server card does not point at the docs MCP, ${DOCS_MCP_URL}, with no sign-in`)
      expect(said).toContain('the docs host\'s MCP server card does not point at the docs MCP, https://mcp.nuxt-backend.dev/mcp, with no sign-in and its tools: it lists no tools')
      expect(said).toContain('the docs MCP at /mcp on mcp.nuxt-backend.dev answered initialize 200, not its server info')
      expect(said).toContain('an anonymous call to /mcp on the site answered 200, not 404: the site serves no MCP endpoint')
      expect(said).toContain('/playground answered an agent 404 text/markdown: it should get the page')
    }, 30_000)
  })
})
