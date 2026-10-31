import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The stylesheets written for the templates and the examples keep every
// element rule in a cascade layer. The module's stylesheet sits in
// `components.backend`, and a rule outside any layer beats every layered
// one, whatever its selector: an unlayered reset (`button { … }`,
// `* { margin: 0 }`) strips the packaged buttons and inputs. A rule outside a
// layer may only select the app's own markup, by class or id.

const rootDir = fileURLToPath(new URL('../..', import.meta.url))

/** At-rules whose blocks hold style rules that stay unlayered. */
const CONDITIONAL = new Set(['media', 'supports', 'container', 'scope', 'starting-style', 'document'])

/** The index of the first of `chars` at depth 0 (outside parentheses, brackets and strings) from `from`, or -1. */
function nextAtTop(text: string, from: number, chars: string): number {
  let depth = 0
  let quote = ''
  for (let index = from; index < text.length; index++) {
    const char = text[index]!
    if (quote) {
      if (char === '\\') index++
      else if (char === quote) quote = ''
    }
    else if (char === '"' || char === '\'') quote = char
    else if (char === '(' || char === '[') depth++
    else if (char === ')' || char === ']') depth--
    else if (depth === 0 && chars.includes(char)) return index
  }
  return -1
}

/** `text` split at top-level `separator`s. */
function splitAtTop(text: string, separator: string): string[] {
  const parts: string[] = []
  let start = 0
  for (let index = nextAtTop(text, 0, separator); index >= 0; index = nextAtTop(text, start, separator)) {
    parts.push(text.slice(start, index))
    start = index + 1
  }
  return [...parts, text.slice(start)]
}

/**
 * Whether every compound of a selector names the app's own markup: a class,
 * an id, or `&` (a nested rule's parent, checked on its own). A type, `*`, a
 * bare pseudo-class or pseudo-element, or an attribute alone matches the
 * packaged components as well.
 */
function ownMarkupOnly(selector: string): boolean {
  const compounds = splitAtTop(selector.trim().replace(/\s*([>+~])\s*/g, ' '), ' ').filter(Boolean)
  return compounds.every((compound) => {
    let bare = compound.replace(/\[[^\]]*\]/g, '')
    for (let previous = ''; previous !== bare;) [previous, bare] = [bare, bare.replace(/\([^()]*\)/g, '')]
    return /[.#&]/.test(bare)
  })
}

/** The selectors (and imports) of `css` that sit outside any cascade layer and reach beyond the app's own markup. */
function unlayeredElementRules(css: string): string[] {
  const offenders: string[] = []
  const walk = (text: string): void => {
    for (let start = 0; start < text.length;) {
      const end = nextAtTop(text, start, '{;')
      if (end < 0) return
      const prelude = text.slice(start, end).trim()
      if (text[end] === ';') {
        if (/^@import\b/.test(prelude) && !/\blayer\b/.test(prelude)) offenders.push(prelude)
        start = end + 1
        continue
      }
      let close = end
      for (let depth = 0; close < text.length; close++) {
        if (text[close] === '{') depth++
        else if (text[close] === '}' && --depth === 0) break
      }
      const body = text.slice(end + 1, close)
      const atRule = prelude.match(/^@([\w-]+)/)?.[1]
      // `@layer` blocks are layered; `@font-face`, `@keyframes` and their
      // kind hold no selectors.
      if (atRule === undefined) {
        offenders.push(...splitAtTop(prelude, ',').map(selector => selector.trim()).filter(selector => !ownMarkupOnly(selector)))
        walk(body)
      }
      else if (CONDITIONAL.has(atRule)) walk(body)
      start = close + 1
    }
  }
  walk(css.replace(/\/\*[\s\S]*?\*\//g, ''))
  return offenders
}

/** Every stylesheet under `dir`, build output aside. */
function stylesheets(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', '.nuxt', '.output'].includes(entry.name)) return []
    const path = join(dir, entry.name)
    return entry.isDirectory() ? stylesheets(path) : entry.name.endsWith('.css') ? [path] : []
  })
}

const posix = (path: string) => path.split('\\').join('/')
const files = [...stylesheets(join(rootDir, 'templates')), ...stylesheets(join(rootDir, 'examples'))]
  .map(path => posix(relative(rootDir, path)))

describe('the check', () => {
  it('flags element, universal and attribute rules outside a layer', () => {
    expect(unlayeredElementRules('button, .x { } * { } ::placeholder { } [hidden] { } :where(button) { } :root { }'))
      .toEqual(['button', '*', '::placeholder', '[hidden]', ':where(button)', ':root'])
    expect(unlayeredElementRules('.row button { } .row > li { } @media (width > 1px) { input { } } @import "reset.css";'))
      .toEqual(['.row button', '.row > li', 'input', '@import "reset.css"'])
    expect(unlayeredElementRules('.row { & button { } }')).toEqual(['& button'])
  })

  it('lets layered rules and the app\'s own classes be', () => {
    expect(unlayeredElementRules('@layer base { * { } button { } } @layer theme, base; .muted { } #app .row:hover { } button.primary { } .x::before { }')).toEqual([])
    expect(unlayeredElementRules('@import "reset.css" layer(base); @font-face { font-family: x; } /* button { } */ .x { color: red }')).toEqual([])
  })
})

describe('the templates\' and the examples\' stylesheets', () => {
  it('are found', () => {
    expect(files).toEqual(expect.arrayContaining(['templates/starter/app/assets/main.css', 'templates/panels/app/assets/main.css', 'examples/advanced/app/assets/main.css']))
    for (const file of files) expect(existsSync(join(rootDir, file)), file).toBe(true)
  })

  it.each(files)('%s keeps every element rule in a layer', (file) => {
    expect(unlayeredElementRules(readFileSync(join(rootDir, file), 'utf8'))).toEqual([])
  })
})
