import { AGENT_PROVIDERS } from './agent-prompt'
import { pageKeys, type PageKeyFields } from './page-keys'

// THE PAGES AS AGENTS READ THEM. `/raw/<page>.md` and `/llms-full.txt` print
// each page from its parsed body, and a block whose Vue component draws what
// the reader sees has nothing in it to print: an agent got
// `<agent-prompt-links></agent-prompt-links>` and never the links. And the
// page header's keys come from the frontmatter, which the twin leaves out.
//
// modules/docs-pages.ts runs this over every page: each such block gets the
// text it stands for as children, and the header's keys close the page in a
// `page-keys` block. The components render no slot (PageKeys renders
// nothing at all), so the site itself does not change.

/** A minimark node: `[tag, props, ...children]`, or a text string. */
type MinimarkNode = string | [string, Record<string, unknown>, ...MinimarkNode[]]

type Props = Record<string, unknown>

/** The text each kind of block stands for, as minimark children. */
const FILLERS: Record<string, (props: Props) => MinimarkNode[]> = {
  'agent-prompt-links': () => [
    ['p', {}, 'Or open it in your agent with the prompt typed in:'],
    ['ul', {}, ...AGENT_PROVIDERS.map(({ agent, maker, links }): MinimarkNode =>
      ['li', {}, `${agent} (${maker}): `, ...links.flatMap(({ app, href }, i): MinimarkNode[] => [...(i ? [', '] : []), ['a', { href }, app]])])],
  ],
}

/** Fill one node, then its children; a node that already has children is left as it is. */
function expand(node: MinimarkNode): void {
  if (typeof node === 'string') return
  const [tag, props, ...children] = node
  if (children.length > 0) return children.forEach(expand)
  node.push(...(FILLERS[tag]?.(props) ?? []))
}

/** Fill the agent-facing text into a parsed page body, in place. Safe to run twice. */
export function expandForAgents(body: unknown): void {
  if (!body || typeof body !== 'object') return
  const { type, value } = body as { type?: unknown, value?: unknown }
  if (type === 'minimark' && Array.isArray(value)) value.forEach(expand)
}

/** What each header key is called where an agent reads it. */
const KEY_TEXT = { playground: 'Try it live in the playground', api: 'API reference', source: 'Source' } as const

/** Close a parsed page body with its header's keys, in place. Safe to run twice. */
export function appendPageKeys(body: unknown, page: Record<string, unknown>): void {
  const text = (value: unknown) => typeof value === 'string' ? value : undefined
  const fields: PageKeyFields = { playground: text(page.playground), api: text(page.api), source: text(page.source) }
  const keys = pageKeys(fields)
  if (keys.length === 0 || !body || typeof body !== 'object') return
  const { type, value } = body as { type?: unknown, value?: unknown }
  if (type !== 'minimark' || !Array.isArray(value)) return
  if (value.some(node => Array.isArray(node) && node[0] === 'page-keys')) return
  value.push(['page-keys', {}, ['ul', {}, ...keys.map(({ name, to }): MinimarkNode => ['li', {}, `${KEY_TEXT[name]}: `, ['a', { href: to }, to]])]])
}
