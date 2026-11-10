import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { hexToOklch, inGamut, SIGNALS, srgbPairs, tierLch, tokensCss } from '../../scripts/wide-gamut.mjs'

// The shipped stylesheets are data, not code: nothing imports them at test
// time, so the contract is checked on the files themselves.
const componentsDir = fileURLToPath(new URL('../../src/runtime/vue/components/', import.meta.url))
const stylesheets = (readdirSync(componentsDir, { recursive: true }) as string[])
  .filter(name => name.endsWith('.css'))
  .map(name => [name.replaceAll('\\', '/'), readFileSync(join(componentsDir, name), 'utf-8')] as const)
const tokens = readFileSync(join(componentsDir, 'tokens.css'), 'utf-8')
const shared = readFileSync(join(componentsDir, 'shared.css'), 'utf-8')
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

  it('declares the layer order first: the token defaults below everything, Tailwind\'s theme and reset and an app\'s reset below the package\'s rules', () => {
    const rules = tokens.replace(/\/\*[\s\S]*?\*\//g, '').trim().split('\n').filter(Boolean)
    expect(rules[0]).toBe('@layer nuxt-backend-tokens, theme, base, reset, nuxt-backend;')
  })

  it('keeps every token default in the first layer declared, so a token an app sets in any layer wins, its own theme, base or reset included', () => {
    const css = tokens.replace(/\/\*[\s\S]*?\*\//g, '')
    const order = css.match(/^@layer ([^;{]+);/m)![1]!.split(',').map(name => name.trim())
    expect(order[0]).toBe('nuxt-backend-tokens')
    // Every declaration of a --bk-* default sits inside that layer's blocks.
    const outside = css.replace(/@layer nuxt-backend-tokens \{[\s\S]*?\n\}/g, '')
    expect(outside).not.toMatch(/--bk-[\w-]+\s*:/)
    expect(outside).not.toMatch(/--lightningcss-light\s*:/)
  })

  it('puts every rule of every stylesheet in @layer nuxt-backend, so any app rule outside a layer wins', () => {
    // tokens.css adds one block below every layer: the light default a
    // production build's rewritten light-dark() needs. shared.css adds the
    // face rules there, so an app's heading face in any layer wins over them.
    for (const [name, css] of stylesheets) {
      const top = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@layer nuxt-backend-tokens, theme, base, reset, nuxt-backend;/, '')
      const blocks = [...top.matchAll(/^(\S[^{\n]*)\{/gm)].map(match => match[1]!.trim())
      expect(blocks.filter(block => block !== '@layer nuxt-backend' && !(['tokens.css', 'shared.css'].includes(name) && block === '@layer nuxt-backend-tokens')), name).toEqual([])
    }
  })

  it('puts the tokens on :root, where every component reads them and any ancestor can override them', () => {
    const declared = tokens.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(declared).toMatch(/@layer nuxt-backend-tokens \{\s*:root \{\s*--bk-accent:/)
    for (const [name, css] of stylesheets) {
      if (name === 'tokens.css') continue
      // A family token defaults to the shared one; no stylesheet redeclares a shared token.
      expect(css.replace(/\/\*[\s\S]*?\*\//g, ''), name).not.toMatch(/^\s*--bk-[\w-]+:/m)
    }
  })

  it('draws a keyboard focus ring on every button and link the components render', () => {
    const rule = shared.match(/:where\(([^{]*?)\)\s*:where\(button:focus-visible, a:focus-visible\)\s*\{([^}]*)\}/)
    expect(rule).not.toBeNull()
    const [, roots, body] = rule!
    for (const root of [
      '[data-auth=\'form\']',
      '[data-invitation]',
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

  it('leaves the tracking, the split outline widths and the press states unset, so an app that sets none sees no change', () => {
    for (const token of [
      '--bk-tracking-heading',
      '--bk-tracking-control',
      '--bk-tracking-label',
      '--bk-border-width-surface',
      '--bk-border-width-control',
      '--bk-shadow-control-hover',
      '--bk-shadow-control-active',
      '--bk-offset-control-hover',
      '--bk-offset-control-active',
      '--bk-transition-control',
    ]) {
      expect(defaults[token], token).toBe('inherit')
    }
  })

  it('sets no tracking on a button or a link drawn as one while --bk-tracking-control is unset, so each keeps the page\'s, its reset\'s or the browser\'s', () => {
    // `normal` would override Tailwind's `letter-spacing: inherit` on buttons
    // (in `base`, below the package's layer) and a link's inherited tracking.
    // `revert-layer` takes the layer's declaration back: what stood before it stands.
    let reads = 0
    for (const [name, css] of stylesheets) {
      for (const [, fallback] of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/var\(--bk-tracking-control(?:, ([^)]*))?\)/g)) {
        reads++
        expect(fallback, name).toBe('revert-layer')
      }
    }
    expect(reads).toBeGreaterThan(30)
  })

  it('tracks every uppercase label from --bk-tracking-label, apart from the headings, each keeping its own while unset', () => {
    // A large title tightens (-0.02em) and a small uppercase label opens up
    // (0.06em): a display face's heading tracking would squeeze the labels.
    let labels = 0
    for (const [name, css] of stylesheets) {
      for (const [, selector, body] of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!/text-transform: uppercase/.test(body!)) continue
        labels++
        expect(body, `${name} ${selector!.trim()}`).toMatch(/letter-spacing: var\(--bk-tracking-label, -?[\d.]+em\);/)
        expect(body, `${name} ${selector!.trim()}`).not.toContain('--bk-tracking-heading')
      }
    }
    expect(labels).toBeGreaterThanOrEqual(9)
  })

  it('draws every outline from the surface or the control width, falling back to --bk-border-width', () => {
    for (const [name, css] of stylesheets) {
      if (name === 'tokens.css') continue
      const bare = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/var\(--bk-border-width-(surface|control), var\(--bk-border-width\)\)/g, '')
      expect(bare, name).not.toContain('--bk-border-width')
    }
  })

  it('lets every drawn button take the press and the control tracking, and keeps every text button still', () => {
    let drawn = 0
    for (const [name, css] of stylesheets) {
      const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      for (const [, selector, body] of rules) {
        // The resting shadow reads the press, never the token alone; the
        // offset rides with it, and the tracking with the control face.
        expect(body, `${name} ${selector!.trim()}`).not.toMatch(/box-shadow: var\(--bk-shadow-control\)/)
        if (body!.includes('box-shadow: var(--_bk-press-shadow, var(--bk-shadow-control));')) {
          drawn++
          expect(body, `${name} ${selector!.trim()}`).toContain('translate: var(--_bk-press-offset);')
        }
        if (body!.includes('font-family: var(--bk-font-control, var(--bk-font));'))
          expect(body, `${name} ${selector!.trim()}`).toContain('letter-spacing: var(--bk-tracking-control, revert-layer);')
        if (/box-shadow: none;/.test(body!))
          expect(body, `${name} ${selector!.trim()}`).toContain('translate: none;')
      }
    }
    expect(drawn).toBeGreaterThan(30)
    // The states set the private properties on the elements that press, in the lowest layer.
    const lowest = shared.match(/@layer nuxt-backend-tokens \{([\s\S]*?)\n\}/)![1]!
    expect(lowest).toContain('--_bk-press-shadow: var(--bk-shadow-control-hover);')
    expect(lowest).toContain('--_bk-press-shadow: var(--bk-shadow-control-active, var(--bk-shadow-control-hover));')
    expect(lowest).toContain('--_bk-press-offset: var(--bk-offset-control-active, var(--bk-offset-control-hover));')
    expect(lowest).toContain('transition: var(--bk-transition-control);')
    expect(lowest).toContain('letter-spacing: var(--bk-tracking-heading);')
  })

  it('presses only the element in the state, hovers only under a pointer that hovers, and moves nothing for someone who asked for less motion', () => {
    const lowest = shared.match(/@layer nuxt-backend-tokens \{([\s\S]*?)\n\}/)![1]!.replace(/\/\*[\s\S]*?\*\//g, '')
    // Custom properties inherit: below a link, a label or a summary, each element starts from no state.
    const reset = lowest.match(/:where\(\[data-backend\] :is\(button, a, label, summary\) \*\) \{\s*--_bk-press-shadow: initial;\s*--_bk-press-offset: initial;\s*\}/)
    expect(reset).not.toBeNull()
    // Before the states, so an element in one of its own sets it again.
    expect(lowest.indexOf(reset![0])).toBeLessThan(lowest.indexOf(':hover'))
    // A tap leaves `:hover` on a touch screen: the hover sets the state only under `(hover: hover)`.
    const setsState = /:hover[^{]*\{[^}]*--_bk-press-/
    const hover = lowest.match(/@media \(hover: hover\) \{([\s\S]*?)\n {2}\}/)
    expect(hover?.[1]).toMatch(setsState)
    expect(lowest.replace(hover![0], '')).not.toMatch(setsState)
    // Last, over the hover and the press: no offset and no transition.
    const reduce = lowest.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n {2}\}/)
    expect(reduce?.[1]).toMatch(/:where\(\[data-backend\]\) :where\(button, a, label, summary\) \{\s*--_bk-press-offset: initial;\s*transition: none;\s*\}/)
    expect(lowest.indexOf(reduce![0])).toBeGreaterThan(lowest.lastIndexOf(':active'))
  })

  it('styles each component and part in a file named after it', () => {
    const named = stylesheets.map(([name]) => name).filter(name => name.includes('/'))
    expect(named.length).toBeGreaterThan(30)
    for (const name of named) expect(name, name).toMatch(/^(auth|account|workspaces|billing|admin|shell)\/(admin|[A-Z]\w+)\.css$/)
  })
})
