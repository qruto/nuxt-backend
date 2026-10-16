#!/usr/bin/env node
/**
 * Writes the wide-gamut tiers of the package's signal colours into
 * src/runtime/vue/components/tokens.css: for each `--bk-*` signal, the sRGB
 * pair the file declares, raised to the chroma a display-P3 screen and a
 * Rec. 2020 screen can show. Lightness and hue stay, so a signal reads as the
 * same colour, only more vivid, and its contrast holds; a screen without the
 * gamut keeps the sRGB value.
 *
 *   node scripts/wide-gamut.mjs          rewrite the generated block
 *
 * test/unit/tokens-css.test.ts fails when the block is stale or a tier leaves
 * its gamut, so the sRGB pair is the one value to edit.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const TOKENS = join(fileURLToPath(new URL('.', import.meta.url)), '../src/runtime/vue/components/tokens.css')
const START = '/* wide-gamut:start'
const END = '/* wide-gamut:end */'

/** The signals with a wide-gamut tier. `--bk-on-accent` is the text on the accent: it stays. */
export const SIGNALS = ['--bk-accent', '--bk-ok', '--bk-warn', '--bk-error']

/** How far toward the gamut's edge a tier goes: vivid, with room for a screen's own limits. */
const REACH = 0.96

// ── Colour math: sRGB ⇄ OKLCH, and linear sRGB → XYZ → display-P3 / Rec. 2020 ──

const toLinear = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const fromLinearSrgb = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
/** Rec. 2020's own transfer, as CSS Color 4 defines it. */
const fromLinearRec2020 = (c) => {
  const alpha = 1.09929682680944
  const beta = 0.018053968510807
  return c < beta ? 4.5 * c : alpha * c ** 0.45 - (alpha - 1)
}

const multiply = (m, v) => m.map(row => row[0] * v[0] + row[1] * v[1] + row[2] * v[2])

const SRGB_TO_XYZ = [
  [0.41239079926595934, 0.357584339383878, 0.1804807884018343],
  [0.21263900587151027, 0.715168678767756, 0.07219231536073371],
  [0.01933081871559182, 0.11919477979462598, 0.9505321522496607],
]
const XYZ_TO_P3 = [
  [2.493496911941425, -0.9313836179191239, -0.40271078445071684],
  [-0.8294889695615747, 1.7626640603183463, 0.023624685841943577],
  [0.03584583024378447, -0.07617238926804182, 0.9568845240076872],
]
const XYZ_TO_REC2020 = [
  [1.7166511879712674, -0.35567078377639233, -0.25336628137365974],
  [-0.6666843518324892, 1.6164812366349395, 0.01576854581391113],
  [0.017639857445310783, -0.042770613257808524, 0.9421031212354738],
]

export const GAMUTS = {
  'display-p3': { matrix: XYZ_TO_P3, encode: fromLinearSrgb },
  'rec2020': { matrix: XYZ_TO_REC2020, encode: fromLinearRec2020 },
}

/** `#rrggbb` → OKLCH `[L, C, h]`. */
export function hexToOklch(hex) {
  const [r, g, b] = [1, 3, 5].map(i => toLinear(Number.parseInt(hex.slice(i, i + 2), 16) / 255))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return [L, Math.hypot(A, B), (Math.atan2(B, A) * 180 / Math.PI + 360) % 360]
}

/** OKLCH → linear sRGB (may fall outside [0, 1]: that is what wider gamuts hold). */
function oklchToLinearSrgb([L, C, h]) {
  const A = C * Math.cos(h * Math.PI / 180)
  const B = C * Math.sin(h * Math.PI / 180)
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

/** An OKLCH colour's linear channels in a gamut, and its luminance (Y). */
export function inGamut(lch, gamut) {
  const xyz = multiply(SRGB_TO_XYZ, oklchToLinearSrgb(lch))
  return { linear: multiply(GAMUTS[gamut].matrix, xyz), luminance: xyz[1] }
}

const fits = channels => channels.every(c => c >= -1e-6 && c <= 1 + 1e-6)

/** The most chroma a gamut holds at this lightness and hue. */
function maxChroma(L, h, gamut) {
  let low = 0
  let high = 0.5
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2
    if (fits(inGamut([L, mid, h], gamut).linear)) low = mid
    else high = mid
  }
  return low
}

/** A signal's tier in OKLCH: same lightness and hue, chroma toward the gamut's edge. */
export function tierLch(hex, gamut) {
  const [L, C, h] = hexToOklch(hex)
  return [L, Math.max(C, maxChroma(L, h, gamut) * REACH), h]
}

/** A signal's tier in a gamut, as CSS: `color(<gamut> r g b)`. */
export function tier(hex, gamut) {
  const { linear } = inGamut(tierLch(hex, gamut), gamut)
  const channels = linear.map(c => Math.min(1, Math.max(0, GAMUTS[gamut].encode(Math.min(1, Math.max(0, c))))))
  return `color(${gamut} ${channels.map(c => c.toFixed(4)).join(' ')})`
}

/** The stylesheet without its comments: prose quotes selectors and values too. */
const code = css => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** The sRGB `light-dark()` pairs tokens.css declares for the signals, from its first block. */
export function srgbPairs(css = readFileSync(TOKENS, 'utf8')) {
  const first = code(css).slice(0, code(css).indexOf('}'))
  return Object.fromEntries(SIGNALS.map((name) => {
    const at = first.indexOf(`${name}: light-dark(`)
    const pair = at < 0 ? null : first.slice(at).match(/^[\w-]+: light-dark\((#[0-9a-f]{6}), (#[0-9a-f]{6})\);/)
    if (!pair) throw new Error(`tokens.css: ${name} is not a light-dark() pair of hex colours`)
    return [name, [pair[1], pair[2]]]
  }))
}

/** The generated block: one media query per gamut, the roots as tokens.css themes them. */
export function wideGamutBlock(css = readFileSync(TOKENS, 'utf8')) {
  const plain = code(css)
  const roots = plain.slice(plain.indexOf(':where('), plain.indexOf(') {') + 1)
  const pairs = srgbPairs(css)
  const queries = Object.keys(GAMUTS).map((gamut) => {
    const declarations = SIGNALS.map(name => `      ${name}: light-dark(${tier(pairs[name][0], gamut)}, ${tier(pairs[name][1], gamut)});`)
    const indented = roots.split('\n').map((line, index) => (index === 0 ? line : `    ${line}`)).join('\n')
    return `@media (color-gamut: ${gamut === 'display-p3' ? 'p3' : gamut}) {
  @supports (color: color(${gamut} 0 0 0)) {
    ${indented} {
${declarations.join('\n')}
    }
  }
}`
  })
  return `${START} — generated by scripts/wide-gamut.mjs from the sRGB pairs above (pnpm generate).
   On a wider screen each signal keeps its lightness and hue and gains the
   chroma that screen can show. */
${queries.join('\n\n')}
${END}`
}

/** tokens.css with its generated block rewritten. */
export function tokensCss(css = readFileSync(TOKENS, 'utf8')) {
  const start = css.indexOf(START)
  const end = css.indexOf(END)
  if (start < 0 || end < 0) throw new Error('tokens.css: the wide-gamut markers are missing')
  return css.slice(0, start) + wideGamutBlock(css) + css.slice(end + END.length)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(TOKENS, tokensCss())
  console.log(`wide-gamut: ${SIGNALS.length} signals × ${Object.keys(GAMUTS).length} gamuts`)
}
