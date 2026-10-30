import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'
import { describe, expect, it } from 'vitest'

// Every word the packaged UI shows is a label (src/convex/labels.ts), so an
// app can override and translate all of it. This fails on a word that is
// not, in a component, a page, or a composable or helper that words what a
// person reads:
// - text in a render function's children, or in an attribute a person reads
//   (an accessible name, alt text, a placeholder);
// - a document title (`useHead({ title })`), and text an event hands the app
//   (`emit('error', '…')`);
// - text a render function returns;
// - a sentence anywhere else (a status message kept in a ref), a template or
//   a `+` concatenation read as one.
// Symbols are fine: '…', '×', ' · ', an emoji. So is a message for a
// developer: `new Error(…)`, `console.*`, and text that starts with
// `[nuxt-backend]` or a selector's `[`.

const runtime = fileURLToPath(new URL('../../src/runtime/vue/', import.meta.url))
const files = ['components', 'pages', 'composables', 'utils', 'plugins'].flatMap(dir =>
  readdirSync(join(runtime, dir)).filter(file => file.endsWith('.ts')).map(file => `${dir}/${file}`))

/**
 * Words the package shows in English on purpose, each with its reason: an
 * auto-imported helper whose return value is English by contract. Nothing
 * else belongs here.
 */
const ENGLISH_BY_CONTRACT: Record<string, string[]> = {
  // `describeUserAgent` is the English reading; <SecuritySettings> words a device through its labels.
  'composables/use-sessions.ts': ['"Browser · value"'],
}

/** Attributes whose value a person reads or hears. */
const READ_ATTRIBUTES = new Set(['aria-label', 'aria-description', 'aria-placeholder', 'aria-roledescription', 'aria-valuetext', 'alt', 'title', 'placeholder', 'label'])

type Node = { type: string, start: number, end: number, [key: string]: unknown }
type Found = { text: string, start: number }

const isNode = (value: unknown): value is Node => typeof value === 'object' && value !== null && typeof (value as Node).type === 'string'

/** Every node of a tree, depth first, with the chain of nodes above it. */
function* walk(node: unknown, ancestors: Node[] = []): Generator<{ node: Node, ancestors: Node[] }> {
  if (Array.isArray(node)) {
    for (const child of node) yield* walk(child, ancestors)
    return
  }
  if (!isNode(node)) return
  yield { node, ancestors }
  for (const [key, value] of Object.entries(node)) {
    if (key !== 'type' && typeof value === 'object') yield* walk(value, [...ancestors, node])
  }
}

/** The literal text an expression can evaluate to, through arrays, conditions, fallbacks and concatenations. */
function texts(node: unknown): Found[] {
  if (!isNode(node)) return []
  switch (node.type) {
    case 'Literal':
      return typeof node.value === 'string' ? [{ text: node.value, start: node.start }] : []
    case 'TemplateLiteral': {
      // A template reads as one text, its values standing in as words; one
      // of values alone (`${a} ${b}`) has no words of its own.
      const quasis = (node.quasis as Array<{ value: { cooked: string } }>).map(quasi => quasi.value.cooked)
      return quasis.some(hasWord) ? [{ text: quasis.join('value'), start: node.start }] : []
    }
    case 'BinaryExpression': {
      // `'Hello, ' + name`: one text, an expression standing in as a word.
      if (node.operator !== '+') return []
      const parts = [node.left, node.right].map(side => texts(side).map(entry => entry.text).join('') || 'value')
      return parts.every(part => part === 'value') ? [] : [{ text: parts.join(''), start: node.start }]
    }
    case 'ArrayExpression':
      return (node.elements as unknown[]).flatMap(texts)
    case 'ConditionalExpression':
      return [...texts(node.consequent), ...texts(node.alternate)]
    case 'LogicalExpression':
      return [...texts(node.left), ...texts(node.right)]
    case 'ParenthesizedExpression':
    case 'TSAsExpression':
    case 'SpreadElement':
      return texts(node.expression ?? node.argument)
    default:
      return []
  }
}

const hasWord = (text: string) => /\p{L}/u.test(text)
// Two words in a row: a sentence, or the start of one.
const isSentence = (text: string) => /\p{L}{2,}[“”"‘’',;:!?—]*\s+[“”"‘’',;:!?—]*\p{L}{2,}/u.test(text)
// Text for a developer, never for the person.
const forDeveloper = (text: string) => text.trimStart().startsWith('[')

/** `h`, `useHead`, `console.warn`: what a call calls, by name. */
function calleeName(node: Node): string | undefined {
  const callee = node.callee as Node
  if (callee.type === 'Identifier') return String(callee.name)
  if (callee.type === 'MemberExpression') return `${String((callee.object as Node).name)}.${String((callee.property as Node).name)}`
  return undefined
}

/** Whether a node sits inside a message for a developer: an error's, the console's, or a `warn…` helper's. */
const inDeveloperMessage = (ancestors: Node[]) => ancestors.some(node =>
  (node.type === 'NewExpression' && String((node.callee as Node).name).endsWith('Error'))
  || (node.type === 'CallExpression' && /^(?:console\.|warn)/.test(calleeName(node) ?? '')))

/** The text a source renders that does not come from a label, as `line: text`. */
function literalCopyIn(source: string, name = 'probe.ts'): string[] {
  const { program, errors } = parseSync(name, source)
  expect(errors.map(error => error.message), name).toEqual([])
  const line = (offset: number) => source.slice(0, offset).split('\n').length
  const found: Found[] = []
  const add = (entries: Found[], rule: (text: string) => boolean = hasWord) => {
    for (const entry of entries) if (rule(entry.text) && !forDeveloper(entry.text)) found.push(entry)
  }
  for (const { node, ancestors } of walk(program)) {
    if (node.type === 'CallExpression') {
      const callee = calleeName(node)
      const [first, second, ...rest] = node.arguments as Node[]
      if (callee === 'h') {
        if (second?.type === 'ObjectExpression') {
          for (const property of second.properties as Node[]) {
            const key = property.key as Node | undefined
            const attribute = key?.type === 'Literal' ? String(key.value) : key?.type === 'Identifier' ? String(key.name) : undefined
            if (attribute && READ_ATTRIBUTES.has(attribute)) add(texts(property.value))
          }
        }
        else if (second) {
          add(texts(second))
        }
        for (const child of rest) add(texts(child))
      }
      // A document title.
      if (callee === 'useHead' && first?.type === 'ObjectExpression') {
        for (const property of first.properties as Node[]) {
          if ((property.key as Node | undefined)?.name === 'title') add(texts(property.value))
        }
      }
      // Text an event hands the app: everything after the event's name.
      if (callee === 'emit') for (const argument of [second, ...rest]) add(texts(argument))
    }
    // What a render function returns: a word that starts a sentence or has one in it.
    if (node.type === 'ReturnStatement' && ancestors.some(ancestor => ancestor.type === 'Property' && (ancestor.key as Node | undefined)?.name === 'render')) {
      add(texts(node.argument), text => hasWord(text) && (/^\p{Lu}/u.test(text.trim()) || /\s/.test(text.trim())))
    }
  }
  // A sentence anywhere else, but not in an import or a developer's message.
  for (const { node, ancestors } of walk(program)) {
    if (!['Literal', 'TemplateLiteral', 'BinaryExpression'].includes(node.type)) continue
    // A module's name, or a part of a longer text that is read whole.
    if (['ImportDeclaration', 'ExportAllDeclaration', 'BinaryExpression', 'TemplateLiteral'].includes(String(ancestors.at(-1)?.type))) continue
    if (inDeveloperMessage(ancestors)) continue
    add(texts(node), isSentence)
  }
  const seen = new Set<number>()
  return found
    .filter(entry => !seen.has(entry.start) && Boolean(seen.add(entry.start)))
    .sort((a, b) => a.start - b.start)
    .map(entry => `${line(entry.start)}: ${JSON.stringify(entry.text)}`)
}

/** What a file of the runtime renders without a label, its English-by-contract words left out. */
function literalCopy(file: string): string[] {
  const allowed = ENGLISH_BY_CONTRACT[file] ?? []
  return literalCopyIn(readFileSync(join(runtime, file), 'utf8'), file)
    .filter(entry => !allowed.some(text => entry.endsWith(`: ${text}`)))
}

describe('the packaged UI', () => {
  it('is all checked: components, pages, composables, helpers and plugins', () => {
    expect(files.length).toBeGreaterThan(60)
    for (const file of Object.keys(ENGLISH_BY_CONTRACT)) expect(files, file).toContain(file)
  })

  it.each(files)('%s shows only labels', (file) => {
    expect(literalCopy(file)).toEqual([])
  })
})

describe('the check', () => {
  // The rules on a source of their own, end to end, so a parser change
  // cannot quietly turn one off.
  const probe = `
    import { h } from 'vue'
    export const Probe = defineComponent({
      setup(_, { emit, slots }) {
        useHead({ title: 'Your account' })
        const note = ref({ text: 'Name updated.' })
        const fail = () => emit('error', 'Could not save')
        const hello = 'Hello, ' + name
        if (broken) throw new Error('[nuxt-backend] wiring is missing, see the docs')
        console.warn('a developer reads this one')
        warnCallShape('useProbe', options, 'useProbe({ meter: value })')
        const selector = '[data-auth^="step-"] input, button'
        const key = 'one-time-code'
        return () => slots.empty?.() ?? h('p', { 'aria-label': 'Close the dialog', 'data-x': 'compact' }, [
          busy ? 'Saving…' : label ?? 'Save',
          \`Sent to \${email}\`,
          '…', ' · ', '×',
        ])
      },
      render() {
        return 'Nothing'
      },
    })
  `
  const reported = literalCopyIn(probe).map(entry => entry.slice(entry.indexOf(': ') + 2))

  it('reports every kind of literal copy', () => {
    expect(reported).toEqual([
      '"Your account"',
      '"Name updated."',
      '"Could not save"',
      '"Hello, value"',
      '"Close the dialog"',
      '"Saving…"',
      '"Save"',
      '"Sent to value"',
      '"Nothing"',
    ])
  })

  it('leaves developer messages, selectors, symbols and attribute values alone', () => {
    for (const text of ['wiring is missing', 'a developer reads', 'data-auth', 'one-time-code', 'compact', 'meter']) {
      expect(reported.join(' '), text).not.toContain(text)
    }
    for (const symbol of ['…', ' · ', '×']) expect(reported).not.toContain(JSON.stringify(symbol))
  })
})
