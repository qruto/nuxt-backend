#!/usr/bin/env node
/**
 * The site's text contrast, measured on the values the stylesheets declare.
 *
 * Reads the ramps from website/app.css (`@theme static`) and the tokens from
 * website/assets/css/tokens.css (`:root`, the per-ground blocks that
 * re-derive the inks on raised faces and in wells, and the wide-gamut
 * block), resolves each one to its light and dark value, and measures the
 * pairs in PAIRS against their WCAG bar: 4.5:1 for text, 3:1 for type of
 * 24px and up and for a focus ring.
 *
 * A ground is a token or a composite: a token with the translucent layers
 * the stylesheet paints over it, at the point where they are strongest (the
 * ground's light ray at its peak, a plaque's sheen in its corner). A pair
 * can also name an overlay, a layer that lies over the text as well as its
 * ground (the LCD's sheen).
 *
 *   node scripts/design-contrast.mjs          print the table
 *   node scripts/design-contrast.mjs --write  rewrite the table in website/design.md
 *
 * test/docs/design-tokens.test.ts fails when a pair drops below its bar, when
 * the table in design.md is stale, or when a `:root` property that reads a
 * per-ground ink is not re-declared in every per-ground block (see
 * `unscopedBridges`), so a token edit is measured before it lands.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const APP_CSS = 'website/app.css'
const TOKENS_CSS = 'website/assets/css/tokens.css'
const DEPTH_CSS = 'website/assets/css/depth.css'
const DESIGN_MD = 'website/design.md'
const START = '<!-- contrast:start -->'
const END = '<!-- contrast:end -->'

/** The ground's light ray where it is strongest, over the hairline grain. */
const RAY_PEAK = { label: 'the ray at its peak', base: '--bg', layers: ['--matte-grain', '--ray'] }
/** A plaque's face at its lightest (the top-left sheen over a lit line of grain) and its darkest (the bottom-right shade). */
const PLAQUE_SHEEN = { label: 'the plaque sheen', base: '--surface', layers: ['--plaque-grain', '--plaque-sheen'] }
const PLAQUE_SHADE = { label: 'the plaque shade', base: '--surface', layers: ['--plaque-shade'] }

/**
 * The grounds text sits on. A scope's block re-declares inks for its own
 * ground; anything it leaves alone comes from `:root`. Raised covers every
 * face the block names: a plaque's sheen and shade, a card, the console
 * slab from its lit corner (`--surface-hi`) to its foot (`--unit-lo`).
 */
const SCOPES = {
  ground: { selector: null, grounds: ['--bg', RAY_PEAK] },
  raised: { selector: '.plaque', grounds: ['--surface', '--surface-hi', '--unit-lo', PLAQUE_SHEEN, PLAQUE_SHADE] },
  well: { selector: '.slot', grounds: ['--sink'] },
}

const TEXT = 4.5
const LARGE = 3
/** WCAG 1.4.11: a focus ring is a UI component, 3:1 against what is next to it. */
const UI = 3

/** The `cut` part's lighter floor, as depth.css declares it (see `readTokens`). */
export const FLOOR = 'the `cut` floor'

/** The LCD's glyphs: on the glass at its darkest and where the backlight peaks, under the sheen that lies over the text too. */
const LCD = { grounds: ['--lcd-ground', '--lcd-lit'], overlay: ['--lcd-sheen'], min: TEXT }

/** The pairs the design relies on: an ink, the scopes or grounds it is read on, its bar. */
export const PAIRS = [
  ...['--ink', '--ink-dim', '--ink-faint', '--ok', '--warn', '--err', '--engrave-ink-sm'].map(ink => ({ ink, scopes: ['ground', 'raised', 'well'], min: TEXT })),
  { ink: '--engrave-ink', scopes: ['ground', 'raised', 'well'], min: LARGE, note: '24px and up' },
  { ink: FLOOR, scopes: ['ground', 'raised', 'well'], min: LARGE, note: '24px and up' },
  { ink: '--emb-ink', scopes: ['ground', 'raised'], min: TEXT, note: 'embossed titles' },
  { ink: '--focus', scopes: ['ground', 'raised', 'well'], min: UI, note: 'focus ring' },
  { ink: '--key-ink', grounds: ['--key-hi', '--key-mid', '--key-lo'], min: TEXT, note: 'key lettering' },
  { ink: '--key-ink', grounds: ['--key-down-hi', '--key-down-lo'], min: TEXT, note: 'a pressed key' },
  { ink: '--ok', grounds: ['--key-down-hi', '--key-down-lo'], min: TEXT, note: 'the current key' },
  { ink: '--key-warn-ink', grounds: ['--key-hi', '--key-mid', '--key-lo', '--key-down-hi', '--key-down-lo'], min: TEXT, note: 'a warning key, at rest and down' },
  { ink: '--key-err-ink', grounds: ['--key-hi', '--key-mid', '--key-lo', '--key-down-hi', '--key-down-lo'], min: TEXT, note: 'a destructive key, at rest and down' },
  { ink: '--go-ink', grounds: ['--go-hi', '--go-lo', '--ok-lit'], min: TEXT, note: 'the GO key' },
  { ink: '--go-ink', grounds: ['--go-down-hi', '--go-down-lo'], min: TEXT, note: 'the GO key, down' },
  { ink: '--on-ok', grounds: ['--ok'], min: TEXT, note: 'on a green fill' },
  { ink: '--on-warn', grounds: ['--warn'], min: TEXT, note: 'on a yellow fill' },
  { ink: '--on-err', grounds: ['--err'], min: TEXT, note: 'on a red fill' },
  ...['--ok-lit', '--warn-lit', '--err-glyph'].map(ink => ({ ink, ...LCD, note: 'LCD glyphs' })),
  // A P3 screen shows the wide-gamut lit values, and the green and yellow
  // glyphs read them.
  ...['--ok-lit', '--warn-lit'].map(ink => ({ ink, ...LCD, gamut: 'p3', note: 'LCD glyphs on a P3 screen' })),
]

/** Splits a list on its top-level commas. */
function splitTopLevel(text, separator = ',') {
  const parts = []
  let depth = 0
  let current = ''
  for (const char of text) {
    if (char === '(') depth++
    if (char === ')') depth--
    if (char === separator && depth === 0) {
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

const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** The custom properties a block body declares, by name. */
function declarations(body) {
  const declared = new Map()
  for (const [, name, value] of stripComments(body).matchAll(/(--[\w-]+)\s*:([^;]+);/g)) {
    declared.set(name, value.replace(/\s+/g, ' ').trim())
  }
  return declared
}

/** Every top-level block of a stylesheet: its prelude and body. */
function blocks(css) {
  const out = []
  const text = stripComments(css)
  let start = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ';' && !text.slice(start, i).includes('{')) start = i + 1
    if (text[i] !== '{') continue
    const end = closingBrace(text, i)
    out.push({ prelude: text.slice(start, i).trim(), body: text.slice(i + 1, end) })
    i = end
    start = end + 1
  }
  return out
}

/** The body of the first top-level rule whose selector satisfies `match`. */
function ruleBody(css, match) {
  const found = blocks(css).find(block => match(block.prelude))
  if (!found) throw new Error('no rule matched')
  return found.body
}

function closingBrace(text, open) {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++
    if (text[i] === '}' && --depth === 0) return i
  }
  throw new Error('unbalanced braces')
}

const selectors = prelude => prelude.split(',').map(part => part.trim())

/**
 * Every token, per scope: `{ ramps, root, scopes: { raised, well }, p3,
 * bridges, floor }`, each a Map but the floor, the colour depth.css gives
 * the `cut` part's floor.
 */
export function readTokens() {
  const app = readFileSync(join(root, APP_CSS), 'utf8')
  const tokens = readFileSync(join(root, TOKENS_CSS), 'utf8')
  const depth = readFileSync(join(root, DEPTH_CSS), 'utf8')
  const ramps = declarations(ruleBody(app, selector => selector === '@theme static'))
  const rootTokens = declarations(ruleBody(tokens, selector => selector === ':root'))
  const scopes = {}
  for (const [name, { selector }] of Object.entries(SCOPES)) {
    if (selector) scopes[name] = declarations(ruleBody(tokens, prelude => selectors(prelude).includes(selector)))
  }
  const p3 = declarations(ruleBody(ruleBody(tokens, prelude => prelude === '@media (color-gamut: p3)'), prelude => prelude === ':root'))
  // The properties app.css declares on `:root` (the Nuxt UI bridges among them).
  const bridges = new Map(blocks(app).filter(block => block.prelude === ':root').flatMap(block => [...declarations(block.body)]))
  const cut = ruleBody(depth, prelude => prelude === '@utility cut')
  const floor = ruleBody(cut, prelude => prelude === '&::after').match(/(?:^|[;\s])color\s*:([^;]+);/)
  if (!floor) throw new Error(`${DEPTH_CSS}: the \`cut\` part's floor declares no colour`)
  return { ramps, root: rootTokens, scopes, p3, bridges, floor: floor[1].replace(/\s+/g, ' ').trim() }
}

/* ── Colour ─────────────────────────────────────────────────────────
   A colour is `{ space, rgb, alpha }`: `srgb` or `display-p3`, channels
   gamma-encoded in 0–1, as the stylesheet writes them. */

const srgb = (rgb, alpha = 1) => ({ space: 'srgb', rgb, alpha })

function parseHex(hex) {
  const digits = hex.slice(1).toLowerCase()
  const full = digits.length <= 4 ? [...digits].map(d => d + d).join('') : digits
  const channels = full.match(/../g).map(pair => Number.parseInt(pair, 16) / 255)
  return srgb(channels.slice(0, 3), channels[3] ?? 1)
}

/** A literal colour, or undefined. */
function parseLiteral(value) {
  if (/^#[0-9a-f]{3,8}$/i.test(value)) return parseHex(value)
  if (value === 'transparent') return srgb([0, 0, 0], 0)
  const rgb = value.match(/^rgba?\(([^)]*)\)$/)
  if (rgb) {
    // `rgb(r g b / a)`, or the legacy `rgba(r, g, b, a)`.
    const [r, g, b, a = '1'] = rgb[1].replace('/', ' ').split(/[\s,]+/).filter(Boolean)
    const alpha = a.endsWith('%') ? Number(a.slice(0, -1)) / 100 : Number(a)
    return srgb([r, g, b].map(channel => Number(channel) / 255), alpha)
  }
  const p3 = value.match(/^color\(\s*display-p3\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/)
  if (p3) return { space: 'display-p3', rgb: [p3[1], p3[2], p3[3]].map(Number), alpha: 1 }
  return undefined
}

const toLinear = value => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
const toGamma = value => (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055)

/** Linear RGB → XYZ (D65), per space. */
const TO_XYZ = {
  'srgb': [[0.4123908, 0.3575843, 0.1804808], [0.2126390, 0.7151687, 0.0721923], [0.0193308, 0.1191948, 0.9505322]],
  'display-p3': [[0.4865709, 0.2656677, 0.1982173], [0.2289746, 0.6917385, 0.0792869], [0.0000000, 0.0451134, 1.0439444]],
}
const XYZ_TO_P3 = [[2.4934969, -0.9313836, -0.4027108], [-0.8294890, 1.7626641, 0.0236247], [0.0358458, -0.0761724, 0.9568845]]
const multiply = (matrix, vector) => matrix.map(row => row.reduce((sum, weight, i) => sum + weight * vector[i], 0))

/** A colour in another space (only sRGB → display-p3 is needed: the P3 values are written in P3). */
function convert(colour, space) {
  if (colour.space === space) return colour
  if (colour.space !== 'srgb' || space !== 'display-p3') throw new Error(`cannot convert ${colour.space} to ${space}`)
  const xyz = multiply(TO_XYZ.srgb, colour.rgb.map(toLinear))
  return { space, rgb: multiply(XYZ_TO_P3, xyz).map(toGamma), alpha: colour.alpha }
}

/** `layer` painted over an opaque `base`, blended as a browser blends: in the base's gamma-encoded space. */
function over(base, layer) {
  const top = convert(layer, base.space)
  return { space: base.space, rgb: base.rgb.map((channel, i) => channel + (top.rgb[i] - channel) * top.alpha), alpha: 1 }
}

/** The relative luminance (WCAG): Y of the colour's XYZ. */
function luminance(colour) {
  const [, y] = multiply(TO_XYZ[colour.space], colour.rgb.map(toLinear))
  return y
}

const toHex = colour => `#${colour.rgb.map(channel => Math.round(Math.min(1, Math.max(0, channel)) * 255).toString(16).padStart(2, '0')).join('')}`

/* ── Resolution ───────────────────────────────────────────────────── */

function declared(tokens, name, scope, gamut) {
  const value = (gamut === 'p3' ? tokens.p3?.get(name) : undefined) ?? tokens.scopes[scope]?.get(name) ?? tokens.root.get(name) ?? tokens.ramps.get(name)
  if (value === undefined) throw new Error(`${name} is not declared`)
  return value
}

/** A token's colour in one theme and scope (and gamut: `p3` reads the wide-gamut block first). */
export function resolveColor(tokens, name, theme, scope = 'ground', gamut = 'srgb') {
  const colour = resolveValue(tokens, declared(tokens, name, scope, gamut), theme, scope, gamut)
  if (!colour) throw new Error(`${name} is not a plain colour`)
  return colour
}

/** A token's sRGB hex in one theme and scope, or undefined when it is not an opaque sRGB colour. */
export function resolve(tokens, name, theme, scope = 'ground') {
  const colour = resolveValue(tokens, declared(tokens, name, scope, 'srgb'), theme, scope, 'srgb')
  return colour && colour.space === 'srgb' && colour.alpha === 1 ? toHex(colour) : undefined
}

function resolveValue(tokens, value, theme, scope, gamut) {
  const literal = parseLiteral(value)
  if (literal) return literal
  const reference = value.match(/^var\((--[\w-]+)\)$/)
  if (reference) return resolveValue(tokens, declared(tokens, reference[1], scope, gamut), theme, scope, gamut)
  const pair = value.match(/^light-dark\((.*)\)$/)
  if (pair) {
    const [light, dark] = splitTopLevel(pair[1])
    return resolveValue(tokens, theme === 'light' ? light : dark, theme, scope, gamut)
  }
  const mixed = value.match(/^color-mix\(\s*in srgb\s*,(.*)\)$/)
  if (mixed) return mix(splitTopLevel(mixed[1]).map(stop => mixStop(tokens, stop, theme, scope, gamut)))
  return undefined
}

/** One `color-mix()` argument: a colour and its optional percentage. */
function mixStop(tokens, stop, theme, scope, gamut) {
  const last = stop.slice(stop.lastIndexOf(' ') + 1)
  const weighted = /^[\d.]+%$/.test(last)
  const colour = resolveValue(tokens, weighted ? stop.slice(0, -last.length).trim() : stop, theme, scope, gamut)
  if (!colour || colour.alpha !== 1) throw new Error(`color-mix(): cannot resolve ${stop}`)
  return { colour: convert(colour, 'srgb'), weight: weighted ? Number(last.slice(0, -1)) / 100 : undefined }
}

/** `color-mix(in srgb, …)` of two opaque colours, weights as CSS Color 5 normalises them. */
function mix([first, second]) {
  const a = first.weight ?? (second.weight === undefined ? 0.5 : 1 - second.weight)
  const b = second.weight ?? 1 - a
  return srgb(first.colour.rgb.map((channel, i) => (channel * a + second.colour.rgb[i] * b) / (a + b)))
}

/** A ground: a token, or a composite of translucent layers over one. */
function groundColor(tokens, ground, theme, scope) {
  if (typeof ground === 'string') return resolveColor(tokens, ground, theme, scope)
  return ground.layers.reduce((base, layer) => over(base, resolveColor(tokens, layer, theme, scope)), resolveColor(tokens, ground.base, theme, scope))
}

/** An ink's colour: a token, or the `cut` floor depth.css declares (FLOOR). */
export function inkColor(tokens, ink, theme, scope = 'ground', gamut = 'srgb') {
  if (ink === FLOOR) return resolveValue(tokens, tokens.floor, theme, scope, gamut)
  return resolveColor(tokens, ink, theme, scope, gamut)
}

/** The WCAG contrast ratio of two colours: sRGB hex strings or resolved colours. */
export function contrast(a, b) {
  const [high, low] = [a, b].map(colour => luminance(typeof colour === 'string' ? parseHex(colour) : colour)).sort((x, y) => y - x)
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
    for (const { scope, grounds } of cases) {
      const worst = theme => Math.min(...grounds.map((ground) => {
        const overlay = colour => (pair.overlay ?? []).reduce((base, layer) => over(base, resolveColor(tokens, layer, theme, scope)), colour)
        return contrast(overlay(inkColor(tokens, pair.ink, theme, scope, pair.gamut)), overlay(groundColor(tokens, ground, theme, scope)))
      }))
      rows.push({
        ink: pair.ink,
        gamut: pair.gamut,
        on: pair.grounds ? onGrounds(pair) : scope,
        light: worst('light'),
        dark: worst('dark'),
        min: pair.min,
        note: pair.grounds ? '' : (pair.note ?? ''),
      })
    }
  }
  return rows
}

const code = name => `\`${name}\``

/** A pair's grounds as the table names them. */
function onGrounds(pair) {
  const grounds = pair.grounds.map(ground => typeof ground === 'string' ? code(ground) : ground.label).join(', ')
  return pair.overlay ? `${grounds} under ${pair.overlay.map(code).join(', ')}` : grounds
}

/** The table design.md carries. */
export function table(rows = measure()) {
  const format = ratio => `${ratio.toFixed(2)}:1`
  const ink = row => `${row.ink.startsWith('--') ? code(row.ink) : row.ink}${row.gamut === 'p3' ? ' (display-p3)' : ''}`
  return [
    '| Ink | On | Light | Dark | Bar |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map(row => `| ${ink(row)} | ${row.on} | ${format(row.light)} | ${format(row.dark)} | ${row.min}:1${row.note ? ` (${row.note})` : ''} |`),
  ].join('\n')
}

/**
 * The `:root` properties that read a per-ground ink but are not re-declared
 * in every per-ground block: `{ property, scope }` for each miss.
 *
 * A custom property resolves its `var()`s on the element that declares it,
 * and descendants inherit the result. A property declared on `:root` that
 * reads `--ink-dim` therefore carries `:root`'s ink into a plaque, whatever
 * the plaque re-derives (Nuxt UI's `--ui-text-muted` did). Every such
 * property, directly or through another, must be re-declared where the ink
 * is.
 */
export function unscopedBridges(tokens = readTokens()) {
  const scoped = new Set(Object.values(tokens.scopes).flatMap(scope => [...scope.keys()]))
  const declaredOnRoot = new Map([...tokens.root, ...tokens.bridges])
  const reads = value => [...value.matchAll(/var\((--[\w-]+)/g)].map(([, name]) => name)
  const dependent = new Set()
  for (let grew = true; grew;) {
    grew = false
    for (const [name, value] of declaredOnRoot) {
      if (dependent.has(name)) continue
      if (reads(value).some(read => read !== name && (scoped.has(read) || dependent.has(read)))) {
        dependent.add(name)
        grew = true
      }
    }
  }
  return [...dependent].flatMap(property => Object.entries(tokens.scopes)
    .filter(([, scope]) => !scope.has(property))
    .map(([scope]) => ({ property, scope })))
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
  const unscoped = unscopedBridges()
  for (const { property, scope } of unscoped) console.error(`${property} reads a per-ground ink on :root but the ${scope} block does not re-declare it`)
  if (failing.length || unscoped.length) process.exitCode = 1
}
