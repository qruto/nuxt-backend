import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { bundle, transform } from 'lightningcss'
import { describe, expect, it } from 'vitest'

// The package's stylesheet as a production build serves it. Vite 8 (Nuxt
// 4.6) minifies CSS with Lightning CSS for its default targets
// ('baseline-widely-available': Chrome and Edge 111, Firefox 114, Safari
// 16.4), none of which has light-dark(), so every light-dark(a, b) becomes
// var(--lightningcss-light, a) var(--lightningcss-dark, b), and Lightning CSS
// defines those two variables only in rules that declare color-scheme. `nuxt
// dev` never minifies, so only a build shows what a page without a scheme
// gets.

const version = (major: number, minor = 0) => (major << 16) | (minor << 8)
const TARGETS = { chrome: version(111), edge: version(111), firefox: version(114), safari: version(16, 4), ios_saf: version(16, 4) }

const tokensCss = fileURLToPath(new URL('../../src/runtime/vue/components/tokens.css', import.meta.url))
const tokens = readFileSync(tokensCss, 'utf8')

/** A stylesheet as the build minifies it. */
const build = (css: string) => transform({ filename: 'app.css', code: Buffer.from(css), minify: true, targets: TARGETS }).code.toString()
/** tokens.css, the stylesheet the module adds first, as the build minifies it. */
const pkg = bundle({ filename: tokensCss, minify: true, targets: TARGETS }).code.toString()
/** Its light-dark default, the block below every layer. */
const theme = pkg.slice(pkg.indexOf('@layer theme.backend{'))

/** The declarations of the first rule after `from` in minified CSS, by property. */
function ruleAfter(css: string, from: string): Record<string, string> {
  const open = css.indexOf('{', css.indexOf(from) + from.length)
  const body = css.slice(open + 1, css.indexOf('}', open))
  return Object.fromEntries(body.split(';').filter(Boolean).map((declaration) => {
    const colon = declaration.indexOf(':')
    return [declaration.slice(0, colon), declaration.slice(colon + 1)]
  }))
}

/** The index of the first comma outside parentheses, or -1. */
function topLevelComma(text: string): number {
  let depth = 0
  for (const [index, char] of [...text].entries()) {
    if (char === '(') depth++
    else if (char === ')') depth--
    else if (char === ',' && depth === 0) return index
  }
  return -1
}

/**
 * A value with its `var()`s substituted as a browser does: a defined
 * variable's value (an empty one included), else the fallback. `initial`
 * leaves a variable undefined.
 */
function substitute(value: string, variables: Record<string, string>): string {
  const start = value.indexOf('var(')
  if (start < 0) return value
  let depth = 0
  let end = start + 3
  for (; end < value.length; end++) {
    if (value[end] === '(') depth++
    else if (value[end] === ')' && --depth === 0) break
  }
  const inner = value.slice(start + 4, end)
  const comma = topLevelComma(inner)
  const name = (comma < 0 ? inner : inner.slice(0, comma)).trim()
  const defined = variables[name]
  const replacement = defined !== undefined && defined.trim() !== 'initial' ? defined : substitute(inner.slice(comma + 1), variables)
  return value.slice(0, start) + replacement + substitute(value.slice(end + 1), variables)
}

/** A `#rgb` or `#rrggbb` colour, lower-case and six digits long. */
const hex = (value: string) => value.trim().toLowerCase().replace(/^#(\w)(\w)(\w)$/, '#$1$1$2$2$3$3')

/** Each `--bk-*` default's sRGB pair, from the first rule of tokens.css (`:root`). */
const pairs = Object.fromEntries([...tokens.split('}')[0]!.matchAll(/^\s*(--bk-[\w-]+): light-dark\((#\w+), (#\w+)\);/gm)]
  .map(([, token, light, dark]) => [token!, { light: light!, dark: dark! }]))
/** The same rule once the build has rewritten it: the first in the package's layer. */
const built = ruleAfter(pkg, '@layer nuxt-backend{')

describe('the stylesheet in a production build', () => {
  it('reads the token pairs and their rewrites', () => {
    expect(Object.keys(pairs)).toEqual(expect.arrayContaining(['--bk-accent', '--bk-on-accent', '--bk-ok', '--bk-warn', '--bk-error']))
    for (const token of Object.keys(pairs)) expect(built[token], token).toBeDefined()
  })

  it('leaves no light-dark() for the targets to choke on', () => {
    expect(pkg).not.toContain('light-dark(')
    for (const token of Object.keys(pairs)) {
      expect(built[token], token).toMatch(/^var\(--lightningcss-light,[^)]+\) ?var\(--lightningcss-dark,[^)]+\)$/)
    }
  })

  it('needs a default: with no scheme declared, both colours stand and none parses', () => {
    // `a b`, two colours where a property takes one: the accent, the focus
    // ring and every tone fall back to the inherited or initial value.
    for (const [token, pair] of Object.entries(pairs)) {
      const parts = substitute(built[token]!, {}).split('#').filter(Boolean).map(part => hex(`#${part}`))
      expect(parts, token).toEqual([hex(pair.light), hex(pair.dark)])
    }
  })

  it('sets the default on the root, at zero specificity, below every other layer', () => {
    // The order statement first; the build folds its last layer into the block that follows.
    expect(pkg.startsWith('@layer theme,base,reset;@layer nuxt-backend{')).toBe(true)
    expect(theme).toBe('@layer theme.backend{:where(:root){--lightningcss-light:initial;--lightningcss-dark: }}')
  })

  it('gives a page that declares no color-scheme the light colour', () => {
    const root = ruleAfter(theme, ':where(:root)')
    for (const [token, pair] of Object.entries(pairs)) {
      expect(hex(substitute(built[token]!, root)), token).toBe(hex(pair.light))
    }
  })

  it('leaves a scheme the app declares in charge', () => {
    // Lightning CSS defines the two variables in the app's own rule, which
    // beats the default on <html> (it sits in a later layer, or in none) and
    // passes down from any element below.
    const dark = ruleAfter(build(':root{color-scheme:dark}'), ':root')
    const light = ruleAfter(build('@layer base{html{color-scheme:light}}'), 'html')
    for (const [token, pair] of Object.entries(pairs)) {
      expect(hex(substitute(built[token]!, dark)), token).toBe(hex(pair.dark))
      expect(hex(substitute(built[token]!, light)), token).toBe(hex(pair.light))
    }
  })
})
