#!/usr/bin/env node
/**
 * The site's text contrast, measured on the values the stylesheets declare.
 *
 * Reads the ramps from website/app.css (`@theme static`) and the tokens from
 * website/assets/css/tokens.css (`:root`, and the per-ground blocks that
 * re-derive the inks on raised faces and in wells), resolves each one to its
 * light and dark sRGB value, and measures the pairs in PAIRS against their
 * WCAG bar: 4.5:1 for text, 3:1 for type of 24px and up.
 *
 *   node scripts/design-contrast.mjs          print the table
 *   node scripts/design-contrast.mjs --write  rewrite the table in website/design.md
 *
 * test/docs/design-tokens.test.ts fails when a pair drops below its bar or
 * the table in design.md is stale, so a token edit is measured before it
 * lands.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const APP_CSS = 'website/app.css'
const TOKENS_CSS = 'website/assets/css/tokens.css'
const DESIGN_MD = 'website/design.md'
const START = '<!-- contrast:start -->'
const END = '<!-- contrast:end -->'

/**
 * The grounds text sits on. A scope's block re-declares inks for its own
 * ground; anything it leaves alone comes from `:root`.
 */
const SCOPES = {
  ground: { selector: null, grounds: ['--bg'] },
  raised: { selector: '.plaque', grounds: ['--surface', '--surface-hi'] },
  well: { selector: '.slot', grounds: ['--sink'] },
}

const TEXT = 4.5
const LARGE = 3

/** The pairs the design relies on: an ink, the scopes it is read in, its bar. */
export const PAIRS = [
  ...['--ink', '--ink-dim', '--ink-faint', '--ok', '--warn', '--err', '--engrave-ink-sm'].map(ink => ({ ink, scopes: ['ground', 'raised', 'well'], min: TEXT })),
  { ink: '--engrave-ink', scopes: ['ground', 'raised', 'well'], min: LARGE, note: '24px and up' },
  { ink: '--emb-ink', scopes: ['ground', 'raised'], min: TEXT, note: 'embossed titles' },
  { ink: '--key-ink', grounds: ['--key-hi', '--key-mid', '--key-lo'], min: TEXT, note: 'key lettering' },
  { ink: '--ok', grounds: ['--key-down-hi', '--key-down-lo'], min: TEXT, note: 'the current key' },
  { ink: '--key-warn-ink', grounds: ['--key-hi', '--key-mid', '--key-lo'], min: TEXT, note: 'a warning key' },
  { ink: '--key-err-ink', grounds: ['--key-hi', '--key-mid', '--key-lo'], min: TEXT, note: 'a destructive key' },
  { ink: '--go-ink', grounds: ['--go-hi', '--go-lo', '--ok-lit'], min: TEXT, note: 'the GO key' },
  { ink: '--on-ok', grounds: ['--ok'], min: TEXT, note: 'on a green fill' },
  { ink: '--on-warn', grounds: ['--warn'], min: TEXT, note: 'on a yellow fill' },
  { ink: '--on-err', grounds: ['--err'], min: TEXT, note: 'on a red fill' },
  ...['--ok-lit', '--warn-lit', '--err-lit'].map(ink => ({ ink, grounds: ['--lcd-ground'], min: TEXT, note: 'LCD glyphs' })),
]

/** Splits a list on its top-level commas. */
function splitTopLevel(text) {
  const parts = []
  let depth = 0
  let current = ''
  for (const char of text) {
    if (char === '(') depth++
    if (char === ')') depth--
    if (char === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
    }
    else {
      current += char
    }
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

/** The custom properties a block body declares, by name. */
function declarations(body) {
  const declared = new Map()
  for (const [, name, value] of body.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+)\s*:([^;]+);/g)) {
    declared.set(name, value.replace(/\s+/g, ' ').trim())
  }
  return declared
}

/** The body of the first top-level rule whose selector satisfies `match`. */
function ruleBody(css, match) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
  let depth = 0
  let selectorStart = 0
  for (let i = 0; i < stripped.length; i++) {
    const char = stripped[i]
    if (char === '{') {
      if (depth === 0) {
        const selector = stripped.slice(selectorStart, i).trim()
        const end = closingBrace(stripped, i)
        if (match(selector)) return stripped.slice(i + 1, end)
        i = end
        selectorStart = end + 1
        continue
      }
      depth++
    }
    else if (char === '}') {
      depth--
    }
    else if (char === ';' && depth === 0) {
      selectorStart = i + 1
    }
  }
  throw new Error('no rule matched')
}

function closingBrace(text, open) {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++
    if (text[i] === '}' && --depth === 0) return i
  }
  throw new Error('unbalanced braces')
}

/** Every token, per scope: `{ ramps, root, scopes: { raised, well } }`, each a Map. */
export function readTokens() {
  const app = readFileSync(join(root, APP_CSS), 'utf8')
  const tokens = readFileSync(join(root, TOKENS_CSS), 'utf8')
  const ramps = declarations(ruleBody(app, selector => selector === '@theme static'))
  const rootTokens = declarations(ruleBody(tokens, selector => selector === ':root'))
  const scopes = {}
  for (const [name, { selector }] of Object.entries(SCOPES)) {
    if (selector) scopes[name] = declarations(ruleBody(tokens, list => list.split(',').map(part => part.trim()).includes(selector)))
  }
  return { ramps, root: rootTokens, scopes }
}

/** A token's sRGB hex in one theme and scope, or undefined when it is not a plain colour. */
export function resolve(tokens, name, theme, scope = 'ground') {
  const value = tokens.scopes[scope]?.get(name) ?? tokens.root.get(name) ?? tokens.ramps.get(name)
  if (value === undefined) throw new Error(`${name} is not declared`)
  return resolveValue(tokens, value, theme, scope)
}

function resolveValue(tokens, value, theme, scope) {
  if (/^#[0-9a-f]{3,8}$/i.test(value)) return expandHex(value)
  const reference = value.match(/^var\((--[\w-]+)\)$/)
  if (reference) return resolve(tokens, reference[1], theme, scope)
  const pair = value.match(/^light-dark\((.*)\)$/)
  if (pair) {
    const [light, dark] = splitTopLevel(pair[1])
    return resolveValue(tokens, theme === 'light' ? light : dark, theme, scope)
  }
  return undefined
}

function expandHex(hex) {
  const digits = hex.slice(1).toLowerCase()
  return `#${digits.length === 3 ? [...digits].map(d => d + d).join('') : digits.slice(0, 6)}`
}

function luminance(hex) {
  const channel = (offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

/** The WCAG contrast ratio of two sRGB hex colours. */
export function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (high + 0.05) / (low + 0.05)
}

/**
 * Every measurement: one row per pair and scope, with the worst ratio over
 * that scope's grounds in each theme.
 */
export function measure(tokens = readTokens()) {
  const rows = []
  for (const pair of PAIRS) {
    const cases = pair.grounds
      ? [{ scope: 'ground', grounds: pair.grounds, label: pair.note }]
      : pair.scopes.map(scope => ({ scope, grounds: SCOPES[scope].grounds, label: scope }))
    for (const { scope, grounds, label } of cases) {
      const worst = theme => Math.min(...grounds.map(ground =>
        contrast(resolve(tokens, pair.ink, theme, scope), resolve(tokens, ground, theme, scope))))
      rows.push({
        ink: pair.ink,
        on: pair.grounds ? grounds.join(', ') : label,
        light: worst('light'),
        dark: worst('dark'),
        min: pair.min,
        note: pair.grounds ? '' : (pair.note ?? ''),
      })
    }
  }
  return rows
}

/** The table design.md carries. */
export function table(rows = measure()) {
  const format = ratio => `${ratio.toFixed(2)}:1`
  return [
    '| Ink | On | Light | Dark | Bar |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map(row => `| \`${row.ink}\` | ${row.on.startsWith('--') ? row.on.split(', ').map(name => `\`${name}\``).join(', ') : row.on} | ${format(row.light)} | ${format(row.dark)} | ${row.min}:1${row.note ? ` (${row.note})` : ''} |`),
  ].join('\n')
}

/** design.md with its contrast table regenerated. */
export function withTable(markdown, rows = measure()) {
  const start = markdown.indexOf(START)
  const end = markdown.indexOf(END)
  if (start < 0 || end < start) throw new Error(`${DESIGN_MD} has no ${START} … ${END} section`)
  return `${markdown.slice(0, start + START.length)}\n${table(rows)}\n${markdown.slice(end)}`
}

export function designDoc() {
  return readFileSync(join(root, DESIGN_MD), 'utf8')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rows = measure()
  if (process.argv.includes('--write')) {
    writeFileSync(join(root, DESIGN_MD), withTable(designDoc(), rows))
    console.log(`design-contrast: ${rows.length} pairs written to ${DESIGN_MD}`)
  }
  else {
    console.log(table(rows))
  }
  const failing = rows.filter(row => row.light < row.min || row.dark < row.min)
  for (const row of failing) console.error(`below ${row.min}:1: ${row.ink} on ${row.on} (light ${row.light.toFixed(2)}, dark ${row.dark.toFixed(2)})`)
  if (failing.length) process.exitCode = 1
}
