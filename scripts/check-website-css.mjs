// Fail the website build when its stylesheet has lost the house palette.
//
// Docus splices this site's app.css into its own Tailwind entry. Two ways that
// can go wrong without any error: a Docus release that stops compiling the
// splice would ship a literal `@theme` block (dead CSS, every colour back to
// stock Tailwind), and a ramp declared with plain `@theme` instead of
// `@theme static` is emitted only for the shades Tailwind's usage scan finds,
// so the Nuxt UI tokens that read the rest at runtime fall back to stock
// colours. Both change how every page looks and neither fails a build, so
// this reads the built CSS and asserts every shade of every house ramp is
// there with its house value.
//
// The expected shades come from app.css itself — every `--color-<ramp>-<n>`
// declared in any `@theme` block, `static` or not — so a new shade is
// checked the moment it is added, and turning a ramp back into plain `@theme`
// fails here instead of quietly dropping it from the check. A shade missing
// from the output means its ramp is not `static`; a stock Tailwind value in
// its place would mean the splice failed.
//
// More silent losses are checked the same way. app.css imports its tokens
// (assets/css/tokens.css): a broken import ships the ramps without a single
// ground or ink, so a plain-hex token from that file must be in the output.
// Anybody and Martian Mono are variable in width only when Google is asked
// for the axis (nuxt.config.ts `fonts`); without it every wide heading and
// narrow code block renders at the normal width, so each family's faces must
// carry its `font-stretch` range. Their metric-matched fallback faces are
// written by hand in app.css (@nuxt/fonts writes none for a global family),
// so every one must reach the output with its metrics, and each stack must
// name its fallback right after the family. And app.css's element defaults
// sit in `@layer base`: one that lands outside a layer beats every part and
// utility, whatever its specificity.
//
// Run after `nuxt build website`.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const outputDir = 'website/.output/public/_nuxt'
const APP_CSS = readFileSync('website/app.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

function expectedShades() {
  const shades = new Map()
  for (const block of APP_CSS.matchAll(/@theme(?:\s+static)?\s*\{([^}]*)\}/g)) {
    for (const [, name, value] of block[1].matchAll(/(--color-[a-z]+-\d+)\s*:\s*(#[0-9a-f]{3,8})/gi)) {
      shades.set(name, value.toLowerCase())
    }
  }
  return shades
}

// Minifiers may shorten `#aabbcc` to `#abc`; accept either spelling.
function spellings(hex) {
  const long = hex.length === 7 ? hex : `#${[...hex.slice(1)].map(c => c + c).join('')}`
  const pairs = long.slice(1).match(/../g)
  const short = pairs.every(p => p[0] === p[1]) ? `#${pairs.map(p => p[0]).join('')}` : null
  return [long, short].filter(Boolean)
}

const shades = expectedShades()
if (shades.size === 0) {
  console.error('[check-website-css] no `@theme` colour shades found in website/app.css.')
  process.exit(1)
}

let files
try {
  files = readdirSync(outputDir).filter(name => name.endsWith('.css'))
}
catch {
  console.error(`[check-website-css] ${outputDir} not found — run \`nuxt build website\` first.`)
  process.exit(1)
}
const css = files.map(name => readFileSync(join(outputDir, name), 'utf8')).join('\n').replace(/\s+/g, '').toLowerCase()

const problems = []
if (css.includes('@theme')) problems.push('a literal `@theme` block reached the output (the app.css splice was not compiled)')

// A token tokens.css declares as a plain hex, so no transform rewrites it.
const TOKENS_SENTINEL = '--lcd-bezel:#15171b'
if (!css.includes(TOKENS_SENTINEL)) problems.push(`\`${TOKENS_SENTINEL}\` is missing (did app.css stop importing assets/css/tokens.css?)`)

/** The width range each variable family must be served with (names and values as the whitespace-free output spells them). */
const WIDTH_AXES = { anybody: '50%150%', martianmono: '75%112.5%' }
const faces = [...css.matchAll(/@font-face\{([^}]*)\}/g)].map(([, body]) => body)
for (const [family, range] of Object.entries(WIDTH_AXES)) {
  const own = faces.filter(body => ['', '"', '\''].some(quote => body.includes(`font-family:${quote}${family}${quote};`) || body.endsWith(`font-family:${quote}${family}${quote}`)))
  if (own.length === 0) problems.push(`no @font-face for ${family}`)
  // Every face, the italic included: one face with the axis must not hide one without.
  else if (!own.every(body => body.includes(`font-stretch:${range}`))) problems.push(`${family} is served without its width axis on every face (font-stretch ${range}; see nuxt.config.ts fonts)`)
}
for (const [name, hex] of shades) {
  if (!spellings(hex).some(value => css.includes(`${name}:${value}`))) {
    problems.push(`\`${name}\` is missing or not ${hex} (is its ramp \`@theme static\`?)`)
  }
}

/** A family name as the whitespace-free output may spell it: quoted or bare. */
const familySpellings = family => ['"', '\'', ''].map(quote => `${quote}${family.replace(/\s+/g, '').toLowerCase()}${quote}`)

// Every fallback face app.css writes reaches the output with its metrics, and
// each stack that names a fallback names it right after its family.
const FALLBACK_FACES = [...APP_CSS.matchAll(/@font-face\s*\{([^}]*)\}/g)]
  .map(([, body]) => body.match(/font-family:\s*"([^"]+ Fallback)"/)?.[1])
  .filter(Boolean)
const names = (body, family) => familySpellings(family).some(name => body.includes(`font-family:${name};`) || body.endsWith(`font-family:${name}`))
for (const family of new Set(FALLBACK_FACES)) {
  const expected = FALLBACK_FACES.filter(name => name === family).length
  const built = faces.filter(body => names(body, family) && body.includes('size-adjust:') && body.includes('ascent-override:'))
  if (built.length !== expected) problems.push(`${family}: ${built.length} of app.css's ${expected} fallback faces reached the output with their metrics`)
}
for (const [, variable, stack] of APP_CSS.matchAll(/(--font-[a-z]+):([^;]*Fallback[^;]*);/g)) {
  const [family, fallback] = stack.split(',').map(part => part.trim().replace(/^"|"$/g, ''))
  const prefixes = familySpellings(family).flatMap(name => familySpellings(fallback).map(next => `${variable}:${name},${next}`))
  if (!prefixes.some(prefix => css.includes(prefix))) problems.push(`\`${variable}\` does not name ${fallback} right after ${family}`)
}

/** A selector list as a sorted set: the minifier reorders lists (`p, li` ships as `li,p`). */
function selectorSet(list) {
  const selectors = []
  let depth = 0
  let current = ''
  for (const char of list.replace(/\s+/g, '').toLowerCase()) {
    if (char === '(') depth++
    if (char === ')') depth--
    if (char === ',' && depth === 0) {
      selectors.push(current)
      current = ''
    }
    else {
      current += char
    }
  }
  return [...selectors, current].sort().join(',')
}

/** Every rule in the output: its selector set and the `@layer` blocks around it. */
function rules(text) {
  const out = []
  const open = []
  let start = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      const prelude = text.slice(start, i)
      out.push({ selectors: selectorSet(prelude), layers: open.filter(outer => outer.startsWith('@layer')).map(outer => outer.slice('@layer'.length)) })
      open.push(prelude)
      start = i + 1
    }
    else if (text[i] === '}' || text[i] === ';') {
      if (text[i] === '}') open.pop()
      start = i + 1
    }
  }
  return out
}

// The element defaults app.css puts in the base layer arrive there, and
// nowhere outside a layer.
const baseBlock = APP_CSS.match(/@layer\s+base\s*\{([\s\S]*?)\n\}/)?.[1]
if (!baseBlock) problems.push('website/app.css has no `@layer base` block of element defaults')
const builtRules = rules(css)
for (const [, prelude] of (baseBlock ?? '').matchAll(/(?:^|\})([^{}]+)\{/g)) {
  const selector = prelude.trim()
  const places = builtRules.filter(rule => rule.selectors === selectorSet(selector))
  if (places.length === 0) problems.push(`the element default \`${selector}\` is missing`)
  else if (places.some(rule => !rule.layers.includes('base'))) problems.push(`the element default \`${selector}\` landed outside \`@layer base\``)
}

if (problems.length) {
  console.error(`[check-website-css] ${files.length} stylesheet(s) in ${outputDir}:`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log(`[check-website-css] OK — ${shades.size} shades, the tokens, both width axes, ${FALLBACK_FACES.length} fallback faces and the base-layer defaults present in ${files.length} stylesheet(s).`)
