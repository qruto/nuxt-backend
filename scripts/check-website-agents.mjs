#!/usr/bin/env node
// What the site serves agents, checked against a build or the live site
// (website/shared/agent-surfaces.ts says what each document promises):
//
// - /llms.txt opens with the version line, which names the line these docs
//   describe (website/shared/docs-version.ts) and /openapi.json's version.
//   Its sections are the module's overview and full-docs set, one per tab,
//   titled as the tab is and in the header's order, then the playground,
//   the skills and the notes. Every hand-written page sits in exactly one
//   tab section, its own, and no generated API page in any; each link's
//   title and description are the ones Nuxt Content parsed for the page,
//   a planned or changing page's description opened with its marker.
//   Every link on it answers 200, a twin as text/markdown, and every twin
//   opens with its page's header: the release line, the tab, the kind and
//   the status, then the index and the core skill.
// - /raw/index.md is the homepage written out: no component tags, the
//   install command, every skill, the docs MCP's URL.
// - /sitemap.md lists the twin of every page under website/content, the
//   homepage first, then a section per tab.
// - Every route the docs moved still redirects both of its twins
//   (`<from>.md` and `/raw<from>.md`) straight to the target's twin.
// - A missing twin answers 404 in Markdown, listing where to look next.
// - The skills index lists every skill; the manifest and the rename map are
//   the core skill's own files; the site's MCP server card describes the
//   docs MCP, and the site itself serves no `/mcp`; and /playground gives
//   an agent the page, not a Markdown 404.
// - The docs MCP (website/shared/docs-mcp.ts): the docs host's MCP server
//   card points at it, with no sign-in and its tools; on the docs host it answers
//   `initialize`, lists exactly its tools, each read-only, and every tool
//   answers against the built content with no sign-in; it refuses a
//   JSON-RPC batch; the site's own route answers too; a browser is sent to
//   the Docs MCP page; the docs host publishes no OAuth metadata and sends
//   the site's sign-in to the site; and, against a build, a caller past the
//   per-IP budget gets 429 while another does not.
//   A build has no docs host, so the check names it in `x-forwarded-host`,
//   which the host middleware reads as the platform's edge sets it.
// - The docs assistant (website/shared/assistant.ts) is on exactly when the
//   build could reach its model: against a build, when the env it runs in
//   holds a credential (CI's holds none, so there no page offers it and
//   its endpoint is not there); on the live site, always.
//
//   node scripts/check-website-agents.mjs                 a build: serves website/.output
//   node scripts/check-website-agents.mjs --origin <url>  a live site (the weekly job)
//
// Run after `nuxt build website`. Against a live site it also asks for a
// page with `Accept: text/markdown`, which only the deploy's edge answers:
// a built Nitro server serves a prerendered page before any middleware.

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { AGENT_SKILLS, CORE_SKILL } from '../src/guidance/skills.ts'
import { ASSISTANT_API_PATH, assistantEnabled } from '../website/shared/assistant.ts'
import { INSTALL_COMMAND } from '../website/shared/console.ts'
import { DOCS_MCP_NAME, DOCS_MCP_PAGE, DOCS_MCP_PATH, DOCS_MCP_RATE_LIMIT, DOCS_MCP_ROUTE, DOCS_MCP_TOOLS, docsMcpHost, docsMcpUrl, MCP_SERVER_CARD_PATH } from '../website/shared/docs-mcp.ts'
import { BUILD_GROUPS, DOCS_REDIRECTS, DOCS_SOURCES, DOCS_TABS, REFERENCE_ROUTE } from '../website/shared/docs-routes.ts'
import { DOCS_VERSION } from '../website/shared/docs-version.ts'
import { markedDescription } from '../website/shared/planned.ts'
import { docsFiles } from './lib/docs-pages.mjs'
import { frontmatter } from './lib/frontmatter.mjs'

/** llms.txt's doc sections, as shared/agent-surfaces.ts LLMS_SECTIONS builds them: a tab each, Build one per group too. */
const LLMS_SECTIONS = DOCS_TABS.flatMap(tab => tab.path === '/docs/build'
  ? [tab, ...BUILD_GROUPS.map(group => ({ title: `${tab.title}: ${group.title}`, path: group.path }))]
  : [tab])

/** The llms.txt section a docs route belongs to: the one with the longest path that holds it. */
const llmsSectionOf = route => LLMS_SECTIONS.filter(section => route === section.path || route.startsWith(`${section.path}/`))
  .sort((a, b) => b.path.length - a.path.length)[0]

const CONTENT = 'website/content'

/** Where the site serves the core skill's files (the skills route of nuxt-agent-discovery). */
const CORE_SKILL_FILES = `/.well-known/skills/${CORE_SKILL.name}`

/** The public-surface manifest and the rename map: the core skill's files, as the site serves them. */
export const MANIFESTS = {
  surface: `${CORE_SKILL_FILES}/references/surface.json`,
  renames: `${CORE_SKILL_FILES}/references/renames.json`,
}

/** The documents the Markdown 404 points an agent at: the ones this site adds to the module's own. */
export const NOT_FOUND_LINKS = ['/llms.txt', '/sitemap.md', MANIFESTS.surface, MANIFESTS.renames, DOCS_MCP_PAGE]

/**
 * llms.txt's sections, in order: the homepage and the full-docs file
 * (nuxt-agent-discovery and nuxt-llms add them), a section per tab (Build
 * one per group too, LLMS_SECTIONS), then
 * the site's own.
 */
export const LLMS_HEADINGS = ['Overview', 'Documentation Sets', ...LLMS_SECTIONS.map(section => section.title), 'Live playground', 'Agent skills', 'Notes']

/** The version line llms.txt opens with, as shared/agent-surfaces.ts words it. */
const VERSION_LINE = /^These docs describe nuxt-backend (\S+?),/m

/**
 * llms.txt read back: its version (the line it opens with names it) and its
 * sections, each with its links.
 */
export function parseLlms(text) {
  const version = text.match(VERSION_LINE)?.[1]
  const sections = []
  for (const line of text.split('\n')) {
    const heading = line.match(/^## (.+)$/)
    if (heading) sections.push({ title: heading[1], links: [] })
    const link = line.match(/^- \[([^\]]+)\]\(([^)\s]+)\)(?:: (.*))?$/)
    if (link && sections.length) sections.at(-1).links.push({ title: link[1], href: link[2], ...(link[3] ? { description: link[3] } : {}) })
  }
  return { version, sections }
}

/** The section headings of a Markdown document, in order. */
export function headings(text) {
  return [...text.matchAll(/^## (.+)$/gm)].map(([, title]) => title)
}

/** Every link target in a Markdown document. */
export function markdownLinks(text) {
  return [...text.matchAll(/\]\(([^)\s]+)\)/g)].map(([, href]) => href)
}

/**
 * The title and description a twin opens with: the frontmatter
 * nuxt-agent-discovery writes from what Nuxt Content parsed, each value a
 * JSON string.
 */
export function twinFrontmatter(markdown) {
  const lines = (markdown.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '').split('\n')
  const field = (name) => {
    const raw = lines.find(line => line.startsWith(`${name}: `))?.slice(name.length + 2)
    try {
      return raw === undefined ? undefined : JSON.parse(raw)
    }
    catch {
      return raw
    }
  }
  return { title: field('title'), description: field('description') }
}

/**
 * Every page under website/content, with the kind and status its header
 * shows: the homepage (Docus's landing collection, which has neither), and
 * each page the docs collection sources serve.
 */
export function contentPages(root = process.cwd()) {
  const content = join(root, CONTENT)
  const docs = docsFiles(content, DOCS_SOURCES).map(({ file, route }) => {
    const { kind, status, changedBy } = frontmatter(readFileSync(join(content, file), 'utf8'))
    return { route, ...(kind ? { kind } : {}), ...(status ? { status } : {}), ...(changedBy ? { changedBy } : {}) }
  })
  return existsSync(join(content, 'index.md')) ? [{ route: '/' }, ...docs] : docs
}

/** A page's raw twin path: `/docs/start` → `/raw/docs/start.md`, `/` → `/raw/index.md`. */
export const rawTwin = route => `/raw${route === '/' ? '/index' : route}.md`

/** Whether a route is a page of the generated API reference. */
const isGeneratedReference = route => route === REFERENCE_ROUTE || route.startsWith(`${REFERENCE_ROUTE}/`)

/** The tab a docs route belongs to. */
const tabOf = route => DOCS_TABS.find(tab => route === tab.path || route.startsWith(`${tab.path}/`))

/**
 * The line a page's twin opens with, under its title and description
 * (`twinHeader`, website/shared/agent-markdown.ts): the release line, then
 * the tab, the kind and the status where the page has them.
 */
export function headerLine(page) {
  const tab = tabOf(page.route)
  return [
    `Version: nuxt-backend ${DOCS_VERSION.line}${DOCS_VERSION.released ? '' : ' (not on npm yet)'}`,
    ...(tab ? [`Tab: ${tab.title}`] : []),
    ...(page.kind ? [`Kind: ${page.kind}`, `Status: ${page.status ?? 'stable'}`] : []),
  ].join(' · ')
}

/** The redirects both twins of every moved route must answer: each straight to the target's twin. */
export function twinRedirects() {
  return DOCS_REDIRECTS.flatMap(({ from, to, pending }) => {
    const page = to.split('#')[0]
    const status = pending ? 302 : 301
    return [
      { from: `${from}.md`, to: `${page}.md`, status },
      { from: `/raw${from}.md`, to: rawTwin(page), status },
    ]
  })
}

/** Run `task` over `items`, eight at a time. */
async function each(items, task) {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(8, items.length) }, async () => {
    while (next < items.length) await task(items[next++])
  }))
}

/** Ask the site under check: redirects reported rather than followed unless `init` says so, as this check. */
function askSite(origin, path, init) {
  // fallow-ignore-next-line security-sink -- the site under check: the built site on 127.0.0.1, or the --origin the weekly workflow names (nuxt-backend.dev); paths come from this file and the site's own documents, re-rooted on that origin; verified 2026-10-19
  return fetch(new URL(path, origin), { redirect: 'manual', ...init, headers: { 'user-agent': 'nuxt-backend-agent-surfaces-check', ...init?.headers } })
}

/** A response's media type. */
const type = response => response.headers.get('content-type') ?? ''

/** A twin opens with its page's header, then where to go from a page found on its own: the index and the core skill. */
function checkTwinHeader({ fail }, path, body, page) {
  const expected = headerLine(page)
  const lines = body.split('\n')
  const at = lines.findIndex(line => line.startsWith('Version: '))
  const firstSection = lines.findIndex(line => line.startsWith('## '))
  if (at === -1 || lines[at] !== expected || (firstSection !== -1 && firstSection < at)) {
    return fail(`${path} does not open with its header: ${at === -1 ? 'no header line' : `"${lines[at]}"`}, not "${expected}"`)
  }
  const pointers = lines.slice(at + 1, at + 4).join('\n')
  if (!/\]\([^)\s]*\/llms\.txt\)/.test(pointers) || !pointers.includes(`${CORE_SKILL_FILES}/SKILL.md)`)) fail(`${path} does not point at /llms.txt and the core skill under its header`)
}

/** Where each link in the tab sections of llms.txt sits: the sections that list it, and the link as the first one does. */
function tabLinks({ local, fail }, sections, byTwin) {
  const placed = new Map()
  for (const section of sections.filter(({ title }) => LLMS_SECTIONS.some(tab => tab.title === title))) {
    for (const link of section.links) {
      const path = local(link.href) ?? link.href
      const entry = placed.get(path) ?? { link, sections: [] }
      entry.sections.push(section.title)
      placed.set(path, entry)
      const page = byTwin.get(path)
      if (!page) fail(`${path}, linked under ${section.title} in /llms.txt, is no page of the content`)
      else if (isGeneratedReference(page.route)) fail(`${path}, a generated API page, is linked under ${section.title} in /llms.txt`)
      else if (llmsSectionOf(page.route)?.title !== section.title) fail(`${path} is linked under ${section.title} in /llms.txt, not under its own tab`)
    }
  }
  for (const [path, { sections: listing }] of placed) if (listing.length > 1) fail(`${path} is linked under ${listing.join(' and ')} in /llms.txt: a page sits in one section`)
  return placed
}

/**
 * llms.txt: the version it names, its sections, the hand-written pages in
 * them, and every link it holds answering, each twin with its header.
 */
async function checkLlms(context, openapiVersion) {
  const { get, local, fail, pages } = context
  const response = await get('/llms.txt')
  if (response.status !== 200) return fail(`/llms.txt answered ${response.status}`)
  const text = await response.text()
  const llms = parseLlms(text)
  if (llms.version !== DOCS_VERSION.line) fail(`/llms.txt describes ${llms.version ?? 'no version'}, the docs ${DOCS_VERSION.line}`)
  if (openapiVersion !== DOCS_VERSION.line) fail(`/openapi.json says ${openapiVersion}, the docs ${DOCS_VERSION.line}`)
  const titles = llms.sections.map(section => section.title)
  if (titles.join('\n') !== LLMS_HEADINGS.join('\n')) fail(`/llms.txt has the sections ${titles.join(', ')}, not ${LLMS_HEADINGS.join(', ')}`)

  // Each hand-written page in exactly one tab section, its own; no generated API page in any.
  const byTwin = new Map(pages.map(page => [rawTwin(page.route), page]))
  const placed = tabLinks(context, llms.sections, byTwin)
  const unlisted = pages.filter(page => page.route !== '/' && !isGeneratedReference(page.route) && !placed.has(rawTwin(page.route))).map(page => rawTwin(page.route))
  if (unlisted.length) fail(`/llms.txt leaves out ${unlisted.length} hand-written pages: ${unlisted.slice(0, 5).join(', ')}${unlisted.length > 5 ? ', …' : ''}`)

  // Every link, in the lists and in the prose: a twin answers Markdown with its header, a page or a file answers.
  const links = [...new Set(markdownLinks(text).map(local).filter(Boolean))]
  await each(links, async (path) => {
    const twin = path.endsWith('.md')
    const linked = await get(path, twin ? undefined : { redirect: 'follow' })
    if (linked.status !== 200 || (twin && !type(linked).startsWith('text/markdown'))) {
      fail(`${path}, linked from /llms.txt, answered ${linked.status} ${type(linked)}`)
      return linked.body?.cancel()
    }
    if (!twin) return linked.body?.cancel()
    const body = await linked.text()
    const page = byTwin.get(path)
    if (page) checkTwinHeader(context, path, body, page)
    const { link } = placed.get(path) ?? {}
    if (!link) return
    // What llms.txt says of a page is what Nuxt Content parsed from its frontmatter,
    // a planned or changing page's description opened with its marker (website/shared/planned.ts).
    const parsed = twinFrontmatter(body)
    const described = page && parsed.description ? markedDescription(page, parsed.description) : parsed.description
    if (!link.description) fail(`${path} has no description in /llms.txt`)
    else if (link.description !== described) fail(`${path}'s description in /llms.txt is not the page's: "${link.description}", not "${described}"`)
    if (link.title !== parsed.title) fail(`${path}'s title in /llms.txt is not the page's: "${link.title}", not "${parsed.title}"`)
  })
  const full = await get('/llms-full.txt')
  if (full.status !== 200) fail(`/llms-full.txt answered ${full.status}`)
  await full.body?.cancel()
}

/** The homepage's twin: its blocks written out as text, the install, every skill and the docs MCP named. */
async function checkHome({ get, fail }) {
  const response = await get('/raw/index.md')
  if (response.status !== 200) {
    fail(`/raw/index.md answered ${response.status}`)
    return response.body?.cancel()
  }
  const body = await response.text()
  if (/<home-|::home-/.test(body)) fail('/raw/index.md still holds the homepage\'s component tags')
  if (!body.includes(INSTALL_COMMAND)) fail(`/raw/index.md does not give the install command, ${INSTALL_COMMAND}`)
  const unnamed = AGENT_SKILLS.map(skill => skill.name).filter(name => !body.includes(`\`${name}\``))
  if (unnamed.length) fail(`/raw/index.md does not name the skills ${unnamed.join(', ')}`)
  if (!body.includes(docsMcpUrl())) fail(`/raw/index.md does not give the docs MCP's URL, ${docsMcpUrl()}`)
}

/** sitemap.md: every page of the content listed, under the homepage and the tabs. */
async function checkSitemap({ get, local, fail, pages }) {
  const response = await get('/sitemap.md')
  if (response.status !== 200 || !type(response).startsWith('text/markdown')) fail(`/sitemap.md answered ${response.status} ${type(response)}`)
  const sitemap = await response.text()
  const listed = new Set(markdownLinks(sitemap).map(local))
  const unlisted = pages.map(page => rawTwin(page.route)).filter(twin => !listed.has(twin))
  if (unlisted.length) fail(`/sitemap.md leaves out ${unlisted.length} pages: ${unlisted.slice(0, 5).join(', ')}${unlisted.length > 5 ? ', …' : ''}`)
  const sections = headings(sitemap)
  if (sections.join() !== ['Home', ...DOCS_TABS.map(tab => tab.title)].join()) fail(`/sitemap.md has the sections ${sections.join(', ')}`)
}

/** Both twins of every moved route: one hop to the target's twin. */
async function checkRedirects({ get, local, fail }) {
  await each(twinRedirects(), async ({ from, to, status }) => {
    const response = await get(from)
    const location = response.headers.get('location') ?? ''
    const target = location.startsWith('/') ? location : local(location) ?? location
    if (response.status !== status || target !== to) fail(`${from} answered ${response.status} → ${location || 'nowhere'}, not ${status} → ${to}`)
    await response.body?.cancel()
  })
}

/** A missing twin: a Markdown 404 that points at the documents to look in. */
async function checkNotFound({ get, local, fail }) {
  const response = await get('/docs/not-a-page.md')
  const body = await response.text()
  if (response.status !== 404 || !type(response).startsWith('text/markdown')) return fail(`a missing twin answered ${response.status} ${type(response)}, not a Markdown 404`)
  const links = markdownLinks(body).map(local)
  for (const path of NOT_FOUND_LINKS) if (!links.includes(path)) fail(`the Markdown 404 does not point at ${path}`)
}

/** The skills index: every skill the package ships. */
async function checkSkills({ get, fail }) {
  const response = await get('/.well-known/skills/index.json')
  if (response.status !== 200 || !type(response).startsWith('application/json')) {
    fail(`/.well-known/skills/index.json answered ${response.status} ${type(response)}`)
    return response.body?.cancel()
  }
  const listed = new Set(((await response.json()).skills ?? []).map(skill => skill.name))
  const missing = AGENT_SKILLS.map(skill => skill.name).filter(name => !listed.has(name))
  if (missing.length) fail(`/.well-known/skills/index.json does not list ${missing.join(', ')}`)
}

/**
 * The manifest and the rename map: the core skill's own files. A live site
 * may have been built from another commit, so there each only has to be
 * one of the package's generated files.
 */
async function checkManifests({ get, fail, root, live }) {
  for (const [name, path] of Object.entries(MANIFESTS)) {
    const response = await get(path)
    if (response.status !== 200 || !type(response).startsWith('application/json')) {
      fail(`${path} answered ${response.status} ${type(response)}`)
      await response.body?.cancel()
      continue
    }
    const served = JSON.stringify(await response.json())
    const own = JSON.stringify(JSON.parse(readFileSync(join(root, `skills/nuxt-backend/references/${name}.json`), 'utf8')))
    if (live ? !served.startsWith('{"$comment":') : served !== own) fail(`${path} is not skills/nuxt-backend/references/${name}.json`)
  }
}

/** The JSON-RPC call an MCP client opens with. */
const INITIALIZE = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'nuxt-backend-agent-surfaces-check', version: '0' } } })

/** An MCP server card, read; `undefined` (and a failure) when it does not answer one. */
async function readCard(response, fail, where) {
  if (response.status === 200) return response.json()
  fail(`${where} answered ${response.status}`)
  await response.body?.cancel()
}

/**
 * The site serves no MCP endpoint of its own: its MCP server card describes
 * the docs MCP, as the docs host's does, and an anonymous call to `/mcp` on
 * the site finds nothing. And the playground stays a page for an agent.
 */
async function checkNoSiteMcpAndPlayground({ get, fail, site }) {
  const card = await readCard(await get(MCP_SERVER_CARD_PATH), fail, MCP_SERVER_CARD_PATH)
  if (card && (card.authentication?.required !== false || !card.endpoints?.some(endpoint => endpoint.url === docsMcpUrl(site)))) {
    fail(`the site's MCP server card does not point at the docs MCP, ${docsMcpUrl(site)}, with no sign-in`)
  }
  const call = await get('/mcp', { method: 'POST', headers: { 'content-type': 'application/json', 'accept': 'application/json, text/event-stream' }, body: INITIALIZE })
  if (call.status !== 404) fail(`an anonymous call to /mcp on the site answered ${call.status}, not 404: the site serves no MCP endpoint`)
  await call.body?.cancel()
  const playground = await get('/playground', { redirect: 'follow', headers: { 'user-agent': 'ClaudeBot/1.0' } })
  if (playground.status !== 200 || !type(playground).startsWith('text/html')) fail(`/playground answered an agent ${playground.status} ${type(playground)}: it should get the page`)
  await playground.body?.cancel()
}

// --- The docs MCP --------------------------------------------------------------

/** What an MCP client sends with every call: JSON in, and it accepts JSON or a stream back. */
const MCP_HEADERS = { 'content-type': 'application/json', 'accept': 'application/json, text/event-stream' }

/**
 * Each docs tool asked about something the built content holds, and what
 * its answer must say. Every tool has a call: a tool added to the server
 * without one fails the check.
 */
export const DOCS_MCP_CALLS = [
  { name: 'list-pages', arguments: {}, holds: answer => Array.isArray(answer) && answer.some(page => page.path === DOCS_MCP_PAGE), says: `lists ${DOCS_MCP_PAGE}` },
  { name: 'get-page', arguments: { path: DOCS_MCP_PAGE }, holds: answer => answer.title === 'Docs MCP' && answer.content?.includes('Version: nuxt-backend'), says: 'returns the page\'s twin' },
  { name: 'search', arguments: { query: 'passkey sign-in' }, holds: answer => answer.results?.length > 0 && answer.results.every(result => result.path?.startsWith('/docs/')), says: 'finds docs sections' },
  { name: 'get-diagnostic', arguments: { id: '/d/auth-secret' }, holds: answer => answer.capability === 'auth' && answer.entry?.includes('### `auth-secret`'), says: 'returns the Diagnostics entry' },
  { name: 'get-env-var', arguments: { name: 'AUTH_SECRET' }, holds: answer => answer.required === 'Required' && answer.checkedBy?.includes('auth-secret'), says: 'returns the env table\'s row' },
  { name: 'get-composable', arguments: { name: 'useCredits()' }, holds: answer => answer.name === 'useCredits' && answer.api?.endsWith('/docs/reference/api/use-credits'), says: 'returns the composable with its API page' },
  { name: 'get-component', arguments: { name: '<PricingTable>' }, holds: answer => answer.name === 'PricingTable' && answer.entry?.includes('## `<PricingTable>`'), says: 'returns the family page\'s section' },
  { name: 'get-upgrade-guide', arguments: { name: 'doctor --only deployment' }, holds: answer => answer.renames?.[0]?.to === 'doctor --only data', says: 'returns the rename' },
]

/** A JSON-RPC call to the docs MCP: its HTTP response, and the body as JSON when it is. */
async function rpc(call, method, params, headers = {}) {
  const response = await call({ method: 'POST', headers: { ...MCP_HEADERS, ...headers }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
  const text = await response.text()
  let body
  try {
    body = JSON.parse(text)
  }
  catch {
    // Not JSON (an error page): the caller reports the status.
  }
  return { response, body }
}

/** A tool's answer, read back from its text content. */
function answerOf(result) {
  try {
    return JSON.parse(result?.content?.[0]?.text ?? '')
  }
  catch {
    return undefined
  }
}

/** The docs host's MCP server card: the docs MCP, with no sign-in, and its tools. */
async function checkDocsMcpCard({ fail, site }, onHost) {
  const card = await readCard(await onHost(MCP_SERVER_CARD_PATH), fail, `${MCP_SERVER_CARD_PATH} on ${docsMcpHost(site)}`)
  if (!card) return
  const tools = (card.tools ?? []).map(tool => tool.name).join(', ')
  if (card.authentication?.required !== false || !card.endpoints?.some(endpoint => endpoint.url === docsMcpUrl(site)) || tools !== DOCS_MCP_TOOLS.map(tool => tool.name).join(', ')) {
    fail(`the docs host's MCP server card does not point at the docs MCP, ${docsMcpUrl(site)}, with no sign-in and its tools: it lists ${tools || 'no tools'}`)
  }
}

/** The docs MCP's rate limit, against a build: one caller past the budget gets 429, another caller does not. */
async function checkDocsMcpLimit({ fail }, call) {
  const ping = ip => rpc(call, 'ping', undefined, { 'x-forwarded-for': ip })
  let limited
  for (let attempt = 0; attempt < DOCS_MCP_RATE_LIMIT.tokensPerInterval + 3 && !limited; attempt++) {
    const { response } = await ping('203.0.113.7')
    if (response.status === 429) limited = response
  }
  if (!limited) return fail(`the docs MCP never limited a caller past ${DOCS_MCP_RATE_LIMIT.tokensPerInterval} requests`)
  if (limited.headers.get('x-ratelimit-limit') !== String(DOCS_MCP_RATE_LIMIT.tokensPerInterval)) fail(`the docs MCP's 429 says its limit is ${limited.headers.get('x-ratelimit-limit')}, not ${DOCS_MCP_RATE_LIMIT.tokensPerInterval}`)
  const other = await ping('203.0.113.8')
  if (other.response.status !== 200) fail(`the docs MCP answered another caller ${other.response.status} once the first was limited`)
}

/** The tools the docs MCP lists: exactly the ones the docs name, in their order, each read-only. */
async function checkDocsMcpList({ fail }, call) {
  const listed = await rpc(call, 'tools/list', {})
  const tools = listed.body?.result?.tools ?? []
  const names = tools.map(tool => tool.name).join(', ')
  const expected = DOCS_MCP_TOOLS.map(tool => tool.name)
  if (names !== expected.join(', ')) fail(`the docs MCP lists ${names || 'no tools'}, not ${expected.join(', ')}`)
  const writes = tools.filter(tool => tool.annotations?.readOnlyHint !== true).map(tool => tool.name)
  if (writes.length) fail(`the docs MCP's ${writes.join(', ')} do not say they only read`)
  const uncalled = expected.filter(name => !DOCS_MCP_CALLS.some(entry => entry.name === name))
  if (uncalled.length) fail(`the check calls no ${uncalled.join(', ')}: add each to DOCS_MCP_CALLS`)
}

/** Every tool called as DOCS_MCP_CALLS asks it, against the built content. */
async function checkDocsMcpCalls({ fail }, call) {
  await each(DOCS_MCP_CALLS, async ({ name, arguments: args, holds, says }) => {
    const { response, body } = await rpc(call, 'tools/call', { name, arguments: args })
    const answer = answerOf(body?.result)
    if (response.status === 200 && !body?.result?.isError && answer && holds(answer)) return
    fail(`the docs MCP's ${name} ${says} no longer: it answered ${response.status} ${(body?.result?.content?.[0]?.text ?? body?.error?.message ?? '').slice(0, 160)}`)
  })
}

/**
 * The docs host is the docs MCP and nothing else: no OAuth metadata, as
 * there is nothing to authorize, and the site's sign-in on the site's own
 * host. And a JSON-RPC batch is refused, so a request is one tool call.
 */
async function checkDocsMcpHost({ fail, site }, onHost, call) {
  const ping = { jsonrpc: '2.0', id: 1, method: 'ping' }
  const batch = await call({ method: 'POST', headers: MCP_HEADERS, body: JSON.stringify([ping, { ...ping, id: 2 }]) })
  if (batch.status !== 400) fail(`the docs MCP answered a JSON-RPC batch ${batch.status}, not 400`)
  await batch.body?.cancel()
  const metadata = await onHost('/.well-known/oauth-protected-resource')
  if (metadata.status !== 404) fail(`the docs host answered /.well-known/oauth-protected-resource ${metadata.status}, not 404: it has nothing to authorize`)
  await metadata.body?.cancel()
  const signIn = await onHost('/login')
  const location = signIn.headers.get('location') ?? ''
  if (signIn.status !== 308 || !location.endsWith(`//${new URL(site).host}/login`)) fail(`the docs host answered /login ${signIn.status}${location ? ` → ${location}` : ''}, not 308 to the site's /login`)
  await signIn.body?.cancel()
}

/** The site's own route answers as the docs host does, and a browser at the docs host gets the Docs MCP page. */
async function checkDocsMcpDoors({ get, fail }, call) {
  const route = await rpc(init => get(DOCS_MCP_ROUTE, init), 'tools/list', {})
  if (route.response.status !== 200 || (route.body?.result?.tools?.length ?? 0) !== DOCS_MCP_TOOLS.length) fail(`the docs MCP's route, ${DOCS_MCP_ROUTE}, answered tools/list ${route.response.status}`)
  const browser = await call({ headers: { accept: 'text/html' } })
  const location = browser.headers.get('location') ?? ''
  if (browser.status !== 302 || !location.endsWith(DOCS_MCP_PAGE)) fail(`a browser at the docs MCP got ${browser.status}${location ? ` → ${location}` : ''}, not the Docs MCP page`)
  await browser.body?.cancel()
}

/**
 * The docs MCP on its host: it initializes, lists exactly its tools, each
 * read-only, and every tool answers against the built content, with no
 * sign-in. The site's own route answers too, a browser gets the page, a
 * batch is refused, the host is the docs MCP alone, and against a build a
 * caller past the budget is limited.
 */
export async function checkDocsMcp(context) {
  const { get, fail, site, live } = context
  // A build has no docs host: name it as the platform's edge does.
  const onHost = live
    ? (path, init) => askSite(docsMcpUrl(site), path, init)
    : (path, init) => get(path, { ...init, headers: { 'x-forwarded-host': docsMcpHost(site), ...init?.headers } })
  await checkDocsMcpCard(context, onHost)
  const call = init => onHost(DOCS_MCP_PATH, init)
  const initialize = await rpc(call, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'nuxt-backend-agent-surfaces-check', version: '0' } })
  if (initialize.response.status !== 200 || initialize.body?.result?.serverInfo?.name !== DOCS_MCP_NAME) {
    const where = live ? docsMcpUrl(site) : `${DOCS_MCP_PATH} on ${docsMcpHost(site)}`
    return fail(`the docs MCP at ${where} answered initialize ${initialize.response.status}${initialize.body?.error ? ` (${initialize.body.error.message})` : ''}, not its server info`)
  }
  await checkDocsMcpList(context, call)
  await checkDocsMcpCalls(context, call)
  await checkDocsMcpDoors(context, call)
  await checkDocsMcpHost(context, onHost, call)
  if (!live) await checkDocsMcpLimit(context, call)
}

/**
 * Whether a page's runtime config turns the docs assistant on: `true` or
 * `false` as the page says, `undefined` when it says neither.
 */
export function assistantFlag(html) {
  const said = html.match(/\bassistant:\{enabled:(true|false)\b/) ?? html.match(/"assistant":\{"enabled":(true|false)\b/)
  return said ? said[1] === 'true' : undefined
}

/**
 * The docs assistant: on as `expected` says, which is the build's own
 * credentials (the env this check runs in, which a build shares), or always
 * on the live site. Off, its endpoint is not there either. On, the check
 * never asks it a question: each one is a billed model call.
 */
export async function checkAssistant({ get, fail, live }, expected = live || assistantEnabled(process.env)) {
  const page = await get('/docs/start', { redirect: 'follow' })
  if (page.status !== 200) await page.body?.cancel()
  const said = page.status === 200 ? assistantFlag(await page.text()) : undefined
  if (said === undefined) return fail(`/docs/start answered ${page.status} and does not say whether the docs assistant is on`)
  if (said !== expected) fail(`the docs assistant is ${said ? 'on' : 'off'}, not ${expected ? 'on' : 'off'}${live ? ' as the live site promises' : ' as the build\'s credentials say'}`)
  if (said || live) return
  const call = await get(ASSISTANT_API_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"messages":[]}' })
  if (call.status !== 404) fail(`the docs assistant is off, but ${ASSISTANT_API_PATH} answered ${call.status}, not 404`)
  await call.body?.cancel()
}

/** A page asked for with `Accept: text/markdown`: only a deploy's edge answers it for a prerendered page. */
async function checkNegotiation({ get, fail }) {
  const page = await get('/docs/start', { headers: { accept: 'text/markdown' } })
  if (page.status !== 200 || !type(page).startsWith('text/markdown')) fail(`/docs/start with Accept: text/markdown answered ${page.status} ${type(page)}`)
  await page.body?.cancel()
}

/** The checks, against a site answering at `origin`. Returns what failed, one line each. */
export async function checkSurfaces(origin, { live = false, root = process.cwd() } = {}) {
  const failures = []
  const get = (path, init) => askSite(origin, path, init)
  // The canonical origin the documents link to, which is not where a local build answers.
  const openapi = await get('/openapi.json')
  if (openapi.status !== 200) return [`/openapi.json answered ${openapi.status}`]
  const { info, servers } = await openapi.json()
  const site = new URL(servers?.[0]?.url ?? origin).origin
  const context = {
    get,
    site,
    local: href => href.startsWith(site) ? href.slice(site.length) || '/' : undefined,
    fail: message => failures.push(message),
    pages: contentPages(root),
    root,
    live,
  }
  await checkLlms(context, info?.version)
  await checkHome(context)
  await checkSitemap(context)
  await checkRedirects(context)
  await checkNotFound(context)
  await checkSkills(context)
  await checkManifests(context)
  await checkNoSiteMcpAndPlayground(context)
  await checkDocsMcp(context)
  await checkAssistant(context)
  if (live) await checkNegotiation(context)
  return failures
}

/** A free port on the loopback interface. */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer().once('error', reject).listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

/** Serve the built site (website/.output) until `run` settles. */
async function serveBuild(run) {
  const port = await freePort()
  const origin = `http://127.0.0.1:${port}`
  // fallow-ignore-next-line security-sink -- this Node binary running the site this repository just built, no shell, fixed arguments; verified 2026-10-19
  const server = spawn(process.execPath, ['website/.output/server/index.mjs'], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NITRO_PORT: String(port), NITRO_HOST: '127.0.0.1' }, stdio: ['ignore', 'ignore', 'pipe'] })
  // The playground's SSR logs that the build names no deployment: noise, unless the server never starts.
  let log = ''
  server.stderr.on('data', (chunk) => {
    log = `${log}${chunk}`.slice(-4000)
  })
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        await askSite(origin, '/llms.txt')
        break
      }
      catch (error) {
        if (attempt > 100 || server.exitCode !== null) throw new Error(`the built site never answered at ${origin}\n${log}`, { cause: error })
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
    return await run(origin)
  }
  finally {
    server.kill()
  }
}

async function main() {
  const at = process.argv.indexOf('--origin')
  const origin = at === -1 ? undefined : process.argv[at + 1]
  const failures = origin ? await checkSurfaces(origin, { live: true }) : await serveBuild(local => checkSurfaces(local))
  if (failures.length) {
    console.error(`Agent surfaces of ${origin ?? 'the built site'}: ${failures.length} failed\n${failures.map(line => `  ✗ ${line}`).join('\n')}`)
    process.exit(1)
  }
  console.log(`Agent surfaces of ${origin ?? 'the built site'}: llms.txt and every link on it, the twins' headers, the homepage's twin, sitemap.md, the redirects, the Markdown 404, the skills, the manifest, the rename map, the MCP card and no /mcp on the site, the docs MCP and its card, and the docs assistant answer as they promise.`)
}

if (import.meta.main) await main()
