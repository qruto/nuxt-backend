import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { uiCssText } from '../../scripts/stylesheet-imports.mjs'
import { hexToOklch, inGamut, SIGNALS, srgbPairs, tierLch, tokensCss } from '../../scripts/wide-gamut.mjs'

// The shipped stylesheets are data, not code: nothing imports them at test
// time, so the contract is checked on the files themselves.
const componentsDir = fileURLToPath(new URL('../../src/runtime/vue/components/', import.meta.url))
const stylesheets = readdirSync(componentsDir)
  .filter(name => name.endsWith('.css'))
  .map(name => [name, readFileSync(join(componentsDir, name), 'utf-8')] as const)
const tokens = readFileSync(join(componentsDir, 'tokens.css'), 'utf-8')
const ui = readFileSync(join(componentsDir, 'ui.css'), 'utf-8')
const site = readFileSync(fileURLToPath(new URL('../../website/app.css', import.meta.url)), 'utf-8')

/**
 * Every `--bk-*` default declared in tokens.css's first block, by name: the
 * sRGB values every browser reads, before the wide-gamut tiers. Anchored to a
 * declaration line so the prose in the comment block (which quotes
 * `--bk-accent: var(--ok)`) is not read as one.
 */
const firstBlock = tokens.replace(/\/\*[\s\S]*?\*\//g, '').split('}')[0]!
const defaults = Object.fromEntries(
  [...firstBlock.matchAll(/^\s*(--bk-[\w-]+):([^;\n]+);/gm)].map(match => [match[1]!, match[2]!.trim()]),
)
const LIGHT_DARK_PAIR = /^light-dark\((#[0-9a-f]{6}), (#[0-9a-f]{6})\)$/
const SIGNAL_TOKENS = ['--bk-accent', '--bk-on-accent', '--bk-ok', '--bk-warn', '--bk-error']

describe('component tokens', () => {
  it('no longer carries the old brand green anywhere in the shipped CSS', () => {
    for (const [name, css] of stylesheets) {
      expect(css, name).not.toMatch(/#00dc82|#04101f/i)
    }
  })

  it('declares every fixed colour default as a light-dark() pair', () => {
    for (const token of SIGNAL_TOKENS) {
      expect(defaults[token], token).toMatch(LIGHT_DARK_PAIR)
    }
    // A lone hex anywhere else would force one theme's colour onto the other.
    for (const [token, value] of Object.entries(defaults)) {
      if (/#[0-9a-f]{3,8}\b/i.test(value)) expect(value, token).toMatch(LIGHT_DARK_PAIR)
    }
  })

  it('speaks the three-signal vocabulary: the accent is the ok green', () => {
    expect(defaults['--bk-accent']).toBe(defaults['--bk-ok'])
    expect(defaults['--bk-accent']).toBe('light-dark(#116632, #4ade80)')
    expect(defaults['--bk-on-accent']).toBe('light-dark(#ffffff, #052912)')
    expect(defaults['--bk-warn']).toBe('light-dark(#6d5600, #facc15)')
    expect(defaults['--bk-error']).toBe('light-dark(#a1302d, #f87171)')
  })

  it('takes each signal pair from the website house ramps (500 on light, 400 on dark)', () => {
    for (const token of ['--bk-accent', '--bk-warn', '--bk-error']) {
      const [, light, dark] = defaults[token]!.match(LIGHT_DARK_PAIR)!
      expect(site, `${token} light`).toMatch(new RegExp(`--color-[a-z]+-500:\\s*${light}\\b`))
      expect(site, `${token} dark`).toMatch(new RegExp(`--color-[a-z]+-400:\\s*${dark}\\b`))
    }
  })

  it('raises each signal to a wide gamut: what scripts/wide-gamut.mjs writes (pnpm generate)', () => {
    expect(tokens).toBe(tokensCss(tokens))
    expect(tokens).toContain('@media (color-gamut: p3)')
    expect(tokens).toContain('@media (color-gamut: rec2020)')
  })

  it.each(SIGNALS.flatMap(name => (['display-p3', 'rec2020'] as const).map(gamut => [name, gamut] as const)))('%s in %s keeps its lightness, hue and contrast, and stays in gamut', (name, gamut) => {
    const block = tokens.slice(tokens.indexOf(`@supports (color: color(${gamut}`))
    const declared = block.match(new RegExp(`${name}: light-dark\\((color\\(${gamut} [^)]+\\)), (color\\(${gamut} [^)]+\\))\\);`))
    expect(declared, `${name} has a ${gamut} tier`).not.toBeNull()
    srgbPairs(tokens)[name]!.forEach((hex, index) => {
      const [L, C, h] = hexToOklch(hex)
      const channels = declared![index + 1]!.match(/[\d.]+/g)!.slice(-3).map(Number)
      for (const channel of channels) expect(channel).toBeGreaterThanOrEqual(0)
      for (const channel of channels) expect(channel).toBeLessThanOrEqual(1)
      // The same lightness and hue, more vivid than sRGB, at a luminance
      // within a tenth of it: the contrast measured on the sRGB pair holds.
      const vivid = tierLch(hex, gamut)
      expect(vivid[0]).toBeCloseTo(L, 6)
      expect(vivid[2]).toBeCloseTo(h, 6)
      expect(vivid[1]).toBeGreaterThan(C)
      expect(Math.abs(inGamut(vivid, gamut).luminance / inGamut([L, C, h], gamut).luminance - 1)).toBeLessThan(0.1)
    })
  })

  it('leaves color-scheme to the app', () => {
    // `light-dark()` follows the scheme the app declares; a component that
    // set its own would override the host page's choice. Comments are
    // stripped first — tokens.css explains the rule in one.
    for (const [name, css] of stylesheets) {
      expect(css.replace(/\/\*[\s\S]*?\*\//g, ''), name).not.toMatch(/color-scheme\s*:/)
    }
  })

  it('layers every stylesheet between Tailwind\'s reset and its utilities', () => {
    // The order statement Tailwind declares comes first, so the layer sits in
    // the same place whichever stylesheet loads first; every piece goes into
    // components.backend, and an app rule outside a layer always wins.
    const rules = ui.replace(/\/\*[\s\S]*?\*\//g, '').trim().split('\n').filter(Boolean)
    expect(rules[0]).toBe('@layer theme, base, components, utilities;')
    const pieces = stylesheets.map(([name]) => name).filter(name => name !== 'ui.css')
    expect(rules.slice(1).sort()).toStrictEqual(pieces.map(name => `@import './${name}' layer(components.backend);`).sort())
  })

  it('imports what scripts/stylesheet-imports.mjs writes: tokens first (pnpm generate)', () => {
    expect(ui).toBe(uiCssText())
    expect(ui).toContain('@layer theme, base, components, utilities;\n\n@import \'./tokens.css\' layer(components.backend);')
  })

  it('draws a keyboard focus ring on every button and link the components render', () => {
    const rule = tokens.match(/:where\(([^{]*?)\)\s*:where\(button:focus-visible, a:focus-visible\)\s*\{([^}]*)\}/)
    expect(rule).not.toBeNull()
    const [, roots, body] = rule!
    for (const root of [
      '[data-auth=\'form\']',
      '[data-invitation]',
      '[data-consent]',
      '[data-gift=\'banner\']',
      '[data-credits=\'banner\']',
      '[data-history=\'root\']',
      '[data-usage=\'root\']',
      '[data-pricing=\'table\']',
      '[data-settings=\'root\']',
      '[data-profile=\'root\']',
      '[data-security=\'root\']',
    ]) {
      expect(roots, root).toContain(root)
    }
    expect(body).toContain('outline: 2px solid var(--bk-accent)')
    expect(body).toContain('outline-offset: 2px')
  })

  it('never lays out a whole family: a bare [data-<family>] rule also matches its text', () => {
    // The attribute marks a component's message, actions and buttons as well
    // as its root, so a layout rule on the bare attribute (display: flex,
    // flex-direction: column) stacks the words of a message one per line.
    for (const [name, css] of stylesheets) {
      expect(css.match(/^\[data-[a-z]+\]\s*[,{]/m), name).toBeNull()
    }
  })

  it('gives every component family the shared tokens', () => {
    // Each family has a stylesheet named after it (consent.css styles
    // [data-consent]) that reads --bk-* from the family root. A root missing
    // from the token layer renders with undefined tokens: no accent, no
    // focus ring.
    const families = stylesheets
      .map(([name]) => name.replace(/\.css$/, ''))
      .filter(name => !['tokens', 'ui'].includes(name))
    expect(families.length).toBeGreaterThan(8)
    for (const family of families) {
      expect(stylesheets.find(([name]) => name === `${family}.css`)![1], family).toContain(`[data-${family}`)
      expect(tokens, family).toContain(`[data-${family}`)
    }
  })
})
