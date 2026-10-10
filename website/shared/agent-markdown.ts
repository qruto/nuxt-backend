import { AGENT_PROVIDERS } from './agent-prompt'

// THE PAGES AS AGENTS READ THEM. `/raw/<page>.md` and `/llms-full.txt` print
// each page from its parsed body, and a block whose Vue component draws what
// the reader sees has nothing in it to print: an agent got
// `<playground-link to="…"></playground-link>` and never the link.
//
// The `content:file:afterParse` hook in nuxt.config.ts runs this over every
// page: each such block gets the text it stands for as children. The
// components render no slot, so the site itself does not change.

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
  'playground-link': ({ to, label }) => typeof to === 'string'
    ? [['p', {}, `Try ${typeof label === 'string' ? label : 'this feature'} live in the playground: `, ['a', { href: to }, to]]]
    : [],
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
