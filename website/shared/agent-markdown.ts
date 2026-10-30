import { CORE_SKILL, TASK_SKILLS } from '../../src/guidance/skills'
import { AGENT_PROMPT, AGENT_PROVIDERS } from './agent-prompt'
import { CORE_SKILL_URL, DOCS_FOR_AGENTS, skillsAddCommand, tabOf } from './agent-surfaces'
import { CONSOLE_DETENTS, consoleCommand, INSTALL_COMMAND } from './console'
import { DOCS_MCP_PAGE, DOCS_MCP_URL } from './docs-mcp'
import { DOCS_VERSION } from './docs-version'
import { HOME_MODULES, HOME_SERVICES, HOME_TRAITS } from './home'
import { pageKeys, type PageKeyFields } from './page-keys'
import { PM_NOTE, PM_TAG } from './pm'
import { SITE } from './site'
import WHAT_YOU_GET from './what-you-get.json'

// THE PAGES AS AGENTS READ THEM. `/raw/<page>.md` and `/llms-full.txt` print
// each page from its parsed body, and a block whose Vue component draws what
// the reader sees has nothing in it to print: an agent got
// `<agent-prompt-links></agent-prompt-links>` and never the links. And the
// page header (its version, kind, status and keys) comes from the
// frontmatter and the chrome, which the twin leaves out.
//
// - modules/docs-pages.ts runs `expandForAgents` over every page as it is
//   parsed: each docs block gets the text it stands for as children, which
//   its component does not render as a slot, so the site itself does not
//   change.
// - server/plugins/agent-surfaces.ts runs `openTwin` over the copy of a
//   page nuxt-agent-discovery is about to print: the homepage's blocks get
//   their text there (in the stored page it would ride the homepage's
//   payload for nothing), every filled block gives up its wrapper tag, and
//   the page opens with its header. Only the copy: the site's search
//   indexes every word of the stored page, and would find text the page
//   never shows.

/** A minimark node: `[tag, props, ...children]`, or a text string. */
type MinimarkNode = string | [string, Record<string, unknown>, ...MinimarkNode[]]

type Props = Record<string, unknown>

type Fillers = Record<string, (props: Props) => MinimarkNode[]>

/** One kind of what a tab ships, as `::what-you-get` lists it. */
interface WhatYouGetGroup {
  kind: string
  items: Array<{ name: string, to: string, label?: string }>
}

const link = (href: string, text: MinimarkNode): MinimarkNode => ['a', { href }, text]
const code = (text: string): MinimarkNode => ['code', {}, text]
const item = (...children: MinimarkNode[]): MinimarkNode => ['li', {}, ...children]

/** The text each kind of docs block stands for, as minimark children. */
const BLOCK_FILLERS: Fillers = {
  'what-you-get': ({ area }) => [
    ['ul', {}, ...((WHAT_YOU_GET as Record<string, WhatYouGetGroup[]>)[String(area)] ?? []).map(({ kind, items }) =>
      item(`${kind}: `, ...items.flatMap(({ name, to, label }, i): MinimarkNode[] => [...(i ? [', '] : []), link(to, label ?? code(name))])))],
  ],
  'agent-prompt-links': () => [
    ['p', {}, 'Or open it in your agent with the prompt typed in:'],
    ['ul', {}, ...AGENT_PROVIDERS.map(({ agent, maker, links }) =>
      item(`${agent} (${maker}): `, ...links.flatMap(({ app, href }, i): MinimarkNode[] => [...(i ? [', '] : []), link(href, app)])))],
  ],
}

/**
 * What each block of the homepage (content/index.md) stands for. The
 * homepage is a console of Vue blocks with no prose of their own, so this
 * is what `/raw/index.md` and the head of `/llms-full.txt` say: what the
 * package is, its layers and services, the doctor, what being one package
 * means, the skills and the docs MCP, the install.
 */
const HOME_FILLERS: Fillers = {
  'home-hero': () => [
    ['p', {}, SITE.lead],
    ['p', {}, 'Install it with ', code(INSTALL_COMMAND), ', or hand the install to a coding agent with this prompt:'],
    ['pre', { language: 'text', code: AGENT_PROMPT }, code(AGENT_PROMPT)],
    ['ul', {},
      item(link('/docs/start/quickstart', 'Quickstart'), ': from an empty Nuxt app to a running backend.'),
      item(link('/docs/start', 'Start'), ': what the package is, and whether it fits.'),
      item(link('/playground', 'Playground'), ': Panels, the app the tutorial builds, running for a signed-in person; it has no Markdown twin.')],
  ],
  'home-console': () => [
    ['h2', {}, 'One command checks it all'],
    ['p', {}, code('npx nuxt-backend doctor'), ' checks every app layer and prints one finding per check, with a fix under each warning; ', code('--only <layer>'), ' checks one layer and ', code('--json'), ' prints the report for a script or an agent.'],
    ['ul', {}, ...CONSOLE_DETENTS.map(detent => item(code(consoleCommand(detent)), `: ${detent.lines.length} check${detent.lines.length === 1 ? '' : 's'}, `, link(detent.docs, `the ${detent.label} docs`)))],
    ['p', {}, link('/docs/reference/cli#doctor', 'The doctor reference'), ' lists every check and its fix.'],
  ],
  'home-modules': () => [
    ['h2', {}, 'Everything behind a client app'],
    ['p', {}, 'Twelve app layers, each with its pages, components and checks, on when its key is set:'],
    ['ul', {}, ...HOME_MODULES.map(module => item(link(module.docs, module.title), `: ${module.gives}${module.status === 'available' ? '' : ` (${module.status})`}.`))],
    ['p', {}, 'Under the hood, one layer over all of these services; your code calls the package, and the package calls them:'],
    ['ul', {}, ...HOME_SERVICES.map(service => item(service.name, `: ${service.gives}.`))],
  ],
  'home-all-in-one': () => [
    ['h2', {}, 'One package, not twelve integrations'],
    ['ul', {}, ...HOME_TRAITS.map(trait => item(trait.title, ': ', trait.body, ' ', link(trait.link.to, trait.link.label), '.'))],
    ['h2', {}, 'Skills for coding agents'],
    ['p', {}, 'A coding agent that builds an app on the package reads its skills: the core, ', code(CORE_SKILL.name), ', with the rules, the CLI and the env, and a task skill for each part of the app:'],
    ['ul', {}, ...TASK_SKILLS.map(({ name, covers }) => item(link(`/.well-known/skills/${name}/SKILL.md`, code(name)), `: ${covers}`))],
    ['p', {}, 'Install them with ', code(skillsAddCommand(SITE.url)), '. ', link('/docs/develop/agents', 'Skills and agent files'), ' covers what each holds, and ', link(DOCS_FOR_AGENTS, 'Docs for agents'), ' lists everything this site serves to agents.'],
    ['p', {}, 'These docs answer as MCP tools too, read-only and with no sign-in: ', code(DOCS_MCP_URL), '. ', link(DOCS_MCP_PAGE, 'Docs MCP'), ' lists the tools and connects a client.'],
  ],
  'home-closing-cta': () => [
    ['h2', {}, SITE.closing.join(' ').replaceAll('\u2060', '')],
    ['p', {}, 'Add the module with ', code(INSTALL_COMMAND), '. The first ', code('npx nuxt-backend dev'), ' scaffolds the backend files and fills in the environment: nothing to set by hand.'],
  ],
}

/** Fill one node, then its children; a node that already has children is left as it is. */
function expand(node: MinimarkNode, fillers: Fillers): void {
  if (typeof node === 'string') return
  const [tag, props, ...children] = node
  if (children.length > 0) return children.forEach(child => expand(child, fillers))
  node.push(...(fillers[tag]?.(props) ?? []))
}

/** The nodes of a parsed page body, or nothing when it is not one. */
function minimark(body: unknown): MinimarkNode[] | undefined {
  if (!body || typeof body !== 'object') return undefined
  const { type, value } = body as { type?: unknown, value?: unknown }
  return type === 'minimark' && Array.isArray(value) ? value as MinimarkNode[] : undefined
}

/** Fill the agent-facing text into a parsed docs page body, in place. Safe to run twice. */
export function expandForAgents(body: unknown): void {
  minimark(body)?.forEach(node => expand(node, BLOCK_FILLERS))
}

/**
 * The blocks whose wrapper tag means nothing to an agent once they hold
 * their text, and the package-manager block, which holds its npm block.
 */
const FILLED = new Set([...Object.keys(BLOCK_FILLERS), ...Object.keys(HOME_FILLERS), PM_TAG])

/** Replace each filled block with its children, at any depth. */
function unwrap(nodes: MinimarkNode[]): void {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i]!
    if (typeof node === 'string') continue
    const children = node.slice(2) as MinimarkNode[]
    unwrap(children)
    if (FILLED.has(node[0])) nodes.splice(i, 1, ...children)
    else node.splice(2, node.length - 2, ...children)
  }
}

/** What each header key is called where an agent reads it. */
const KEY_TEXT = { playground: 'Try it live in the playground', api: 'API reference', source: 'Source' } as const

/** The first word of the header line, which tells an opened twin from one that is not. */
const HEADER_START = 'Version: '

/** A page as the twin hook hands it over: its route, its kind and status, and its keys. */
export type TwinPage = { [Key in keyof PageKeyFields]?: unknown } & { path?: unknown, kind?: unknown, status?: unknown }

/**
 * A page's header as an agent reads it: the release line these docs
 * describe, the page's tab, kind and status; where to go from a page found
 * on its own, the index and the core skill; that its commands are npm's;
 * then its keys (Try live, API, Source) as links.
 */
function twinHeader(page: TwinPage): MinimarkNode[] {
  const text = (value: unknown) => typeof value === 'string' && value ? value : undefined
  const path = text(page.path)
  const tab = path ? tabOf(path) : undefined
  const kind = text(page.kind)
  const facts = [
    `${HEADER_START}nuxt-backend ${DOCS_VERSION.line}${DOCS_VERSION.released ? '' : ' (not on npm yet)'}`,
    ...(tab ? [`Tab: ${tab.title}`] : []),
    ...(kind ? [`Kind: ${kind}`, `Status: ${text(page.status) ?? 'stable'}`] : []),
  ]
  const keys = pageKeys({ playground: text(page.playground), api: text(page.api), source: text(page.source) })
  const header: MinimarkNode[] = [
    ['p', {}, facts.join(' · ')],
    ['p', {}, 'Every page: ', link('/llms.txt', 'llms.txt'), ' · Skill for coding agents: ', link(CORE_SKILL_URL, CORE_SKILL.name)],
    ['p', {}, PM_NOTE],
  ]
  if (keys.length) header.push(['ul', {}, ...keys.map(({ name, to }) => item(link(to, KEY_TEXT[name])))])
  return header
}

/**
 * Ready the copy of a page nuxt-agent-discovery prints as its twin, in
 * place: the homepage's blocks get their text, every filled block gives up
 * its wrapper, and the page opens with its header, under the title and the
 * description the module puts first. Safe to run twice.
 */
export function openTwin(body: unknown, page: TwinPage): void {
  const nodes = minimark(body)
  if (!nodes) return
  nodes.forEach(node => expand(node, HOME_FILLERS))
  unwrap(nodes)
  const at = Array.isArray(nodes[0]) && nodes[0][0] === 'h1' ? 1 : 0
  const first = nodes[at]
  if (Array.isArray(first) && first[0] === 'p' && typeof first[2] === 'string' && first[2].startsWith(HEADER_START)) return
  nodes.splice(at, 0, ...twinHeader(page))
}
