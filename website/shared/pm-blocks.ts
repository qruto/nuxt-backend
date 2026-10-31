import { convertBlock, OTHER_PACKAGE_MANAGERS, PACKAGE_MANAGERS, PM_TAG, type OtherPackageManager } from './pm'

// Every bash block whose commands all convert (shared/pm.ts) becomes a
// `pm-code` block as the build parses the page (modules/docs-pages.ts):
//
//   ['pm-code', { variants, preClass }, <the npm pre, as parsed>]
//
// The npm block stays its only child, so the page's text — what search
// indexes, what the Markdown twins and llms-full.txt print — is npm alone;
// the twins give the wrapper up (shared/agent-markdown.ts). The other
// managers ride in `variants`, a prop: each one's code, for its copy button,
// and its lines as highlighted tokens. A token keeps the class Shiki gave the
// npm text it came from, so a variant is coloured the way its npm block is
// with no highlighter at runtime (components/PmCode.vue renders it), in a
// `pre` of the npm block's classes (`preClass`), which Shiki's CSS keys on.
//
// A block keeps its npm form when:
// - it carries a filename, ```bash [npm] — the way an author opts one out;
// - it sits in a `::code-group`, which already names its variants;
// - any line names npm in a way the converter cannot read with confidence,
//   or no line runs npm at all.

/** A highlighted token: Shiki's class (or none) and its text. */
export type Token = [className: string, text: string]

/** One package manager's take on a block: the code its copy button copies, and its lines as tokens. */
export interface PmVariant {
  pm: OtherPackageManager
  code: string
  lines: Token[][]
}

/** A minimark node: `[tag, props, ...children]`, or a text string. */
type Node = string | [string, Record<string, unknown>, ...Node[]]

type Element = [string, Record<string, unknown>, ...Node[]]

const BASH = new Set(['bash', 'sh', 'shell', 'zsh'])

const isElement = (node: Node | undefined): node is Element => Array.isArray(node)

/** A highlighted line's tokens, or null when a token holds more than text. */
function lineTokens(line: Element): Token[] | null {
  const tokens: Token[] = []
  for (const child of line.slice(2) as Node[]) {
    if (typeof child === 'string') tokens.push(['', child])
    else if (child.length === 3 && typeof child[2] === 'string') tokens.push([String(child[1].class ?? ''), child[2]])
    else if (child.length === 2) continue
    else return null
  }
  return tokens
}

/** The tokens covering `from` to `to` of a line's text, the ones at either end cut to fit. */
function slice(tokens: Token[], from: number, to: number): Token[] {
  const out: Token[] = []
  let at = 0
  for (const [className, text] of tokens) {
    const start = Math.max(from, at)
    const end = Math.min(to, at + text.length)
    if (start < end) out.push([className, text.slice(start - at, end - at)])
    at += text.length
  }
  return out
}

/** The class of the token that holds character `at`. */
function classAt(tokens: Token[], at: number): string | undefined {
  let offset = 0
  for (const [className, text] of tokens) {
    if (at < offset + text.length) return className
    offset += text.length
  }
  return undefined
}

const COMMANDS = new Set(['npm', 'npx', ...PACKAGE_MANAGERS, 'bunx'])

/**
 * A converted line as tokens. What it shares with the npm line at either
 * end (cut at word boundaries) keeps the npm tokens; the words between take
 * the class the npm line gives its command (a manager's name), its flags or
 * its arguments.
 */
export function retoken(tokens: Token[], from: string, to: string): Token[] {
  if (from === to) return tokens
  let prefix = 0
  while (prefix < from.length && prefix < to.length && from[prefix] === to[prefix]) prefix++
  while (prefix > 0 && !/\s/.test(to[prefix - 1]!)) prefix--
  let suffix = 0
  while (suffix < from.length - prefix && suffix < to.length - prefix && from[from.length - 1 - suffix] === to[to.length - 1 - suffix]) suffix++
  while (suffix > 0 && !/\s/.test(to[to.length - suffix]!)) suffix--

  const words = [...from.matchAll(/\S+/g)].map(match => ({ word: match[0], className: classAt(tokens, match.index) ?? '' }))
  const command = words.find(({ word }) => COMMANDS.has(word))?.className ?? ''
  const after = words.slice(words.findIndex(({ word }) => COMMANDS.has(word)) + 1)
  const argument = after.find(({ word }) => !word.startsWith('-'))?.className ?? command
  const flag = after.find(({ word }) => word.startsWith('-'))?.className ?? argument

  const middle = to.slice(prefix, to.length - suffix)
  const fresh: Token[] = [...middle.matchAll(/\s*\S+|\s+$/g)].map(([segment]) => {
    const word = segment.trim()
    return [!word ? '' : COMMANDS.has(word) ? command : word.startsWith('-') ? flag : argument, segment]
  })
  return [...slice(tokens, 0, prefix), ...fresh, ...slice(tokens, from.length - suffix, from.length)].filter(([, text]) => text)
}

/** A bash `pre`'s variants, or null when it stays npm. */
export function pmVariants(pre: Element): PmVariant[] | null {
  const props = pre[1]
  if (!BASH.has(String(props.language ?? '')) || props.filename) return null
  const code = (pre.slice(2) as Node[]).find(isElement)
  if (!code || code[0] !== 'code') return null
  const lines = (code.slice(2) as Node[]).filter(isElement)
  const tokens: Token[][] = []
  for (const line of lines) {
    const read = lineTokens(line)
    if (!read) return null
    tokens.push(read)
  }
  // Shiki keeps each line's newline in its last token.
  const texts = tokens.map(line => line.map(([, text]) => text).join(''))
  const ends = texts.map(text => text.endsWith('\n'))
  const converted = convertBlock(texts.map((text, i) => ends[i] ? text.slice(0, -1) : text))
  if (!converted) return null
  return OTHER_PACKAGE_MANAGERS.map((pm) => {
    const variant = converted[pm].map((text, i) => {
      const bare = ends[i] ? texts[i]!.slice(0, -1) : texts[i]!
      if (text === bare) return tokens[i]!
      const line = retoken(slice(tokens[i]!, 0, bare.length), bare, text)
      if (!ends[i]) return line
      const last = line.at(-1)
      return last ? [...line.slice(0, -1), [last[0], `${last[1]}\n`] as Token] : [['', '\n'] as Token]
    })
    const trailing = typeof props.code === 'string' && props.code.endsWith('\n') ? '\n' : ''
    return { pm, code: `${converted[pm].join('\n')}${trailing}`, lines: variant }
  })
}

/** Wrap every bash block whose commands all convert, at any depth, in place. Safe to run twice. */
export function wrapPmBlocks(nodes: Node[]): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (!isElement(node) || node[0] === 'code-group' || node[0] === PM_TAG) continue
    if (node[0] === 'pre') {
      const variants = pmVariants(node)
      if (variants) nodes[i] = [PM_TAG, { variants, preClass: node[1].className }, node]
      continue
    }
    const children = node.slice(2) as Node[]
    wrapPmBlocks(children)
    node.splice(2, node.length - 2, ...children)
  }
}
