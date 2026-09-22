import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The shipped stylesheets are data, not code: nothing imports them at test
// time, so the contract is checked on the files themselves.
const componentsDir = fileURLToPath(new URL('../../src/runtime/vue/components/', import.meta.url))
const stylesheets = readdirSync(componentsDir)
  .filter(name => name.endsWith('.css'))
  .map(name => [name, readFileSync(join(componentsDir, name), 'utf-8')] as const)
const tokens = readFileSync(join(componentsDir, 'tokens.css'), 'utf-8')
const auth = readFileSync(join(componentsDir, 'auth.css'), 'utf-8')
const site = readFileSync(fileURLToPath(new URL('../../website/app.css', import.meta.url)), 'utf-8')

/**
 * Every `--bk-*` default declared in tokens.css, by name. Anchored to a
 * declaration line so the prose in the comment block (which quotes
 * `--bk-accent: var(--ok)`) is not read as one.
 */
const defaults = Object.fromEntries(
  [...tokens.matchAll(/^\s*(--bk-[\w-]+):([^;\n]+);/gm)].map(match => [match[1]!, match[2]!.trim()]),
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
    expect(defaults['--bk-accent']).toBe('light-dark(#136d36, #49b567)')
    expect(defaults['--bk-on-accent']).toBe('light-dark(#ffffff, #06150b)')
    expect(defaults['--bk-warn']).toBe('light-dark(#845007, #ce9622)')
    expect(defaults['--bk-error']).toBe('light-dark(#a1302d, #ee6d69)')
  })

  it('takes each signal pair from the website house ramps (500 on light, 400 on dark)', () => {
    for (const token of ['--bk-accent', '--bk-warn', '--bk-error']) {
      const [, light, dark] = defaults[token]!.match(LIGHT_DARK_PAIR)!
      expect(site, `${token} light`).toMatch(new RegExp(`--color-[a-z]+-500:\\s*${light}\\b`))
      expect(site, `${token} dark`).toMatch(new RegExp(`--color-[a-z]+-400:\\s*${dark}\\b`))
    }
  })

  it('leaves color-scheme to the app', () => {
    // `light-dark()` follows the scheme the app declares; a component that
    // set its own would override the host page's choice. Comments are
    // stripped first — tokens.css explains the rule in one.
    for (const [name, css] of stylesheets) {
      expect(css.replace(/\/\*[\s\S]*?\*\//g, ''), name).not.toMatch(/color-scheme\s*:/)
    }
  })

  it('mirrors the defaults in the auth.css fallbacks for stand-alone imports', () => {
    expect(auth).toContain(`--auth-accent: var(--bk-accent, ${defaults['--bk-accent']})`)
    expect(auth).toContain(`--auth-on-accent: var(--bk-on-accent, ${defaults['--bk-on-accent']})`)
    expect(auth).toContain(`--auth-error: var(--bk-error, ${defaults['--bk-error']})`)
  })

  it('draws a keyboard focus ring on every button and link the components render', () => {
    const rule = tokens.match(/:where\(([^{]*?)\)\s*:where\(button:focus-visible, a:focus-visible\)\s*\{([^}]*)\}/)
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
})
