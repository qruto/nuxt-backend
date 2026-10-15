import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Nuxt } from '@nuxt/schema'
import { describe, expect, it, vi } from 'vitest'
import { detectThemeBridge, NUXT_UI_TOKENS, registerThemeBridge, themeBridgeCss, TOKEN_ROOTS } from '../../src/nuxt/theme'

vi.mock('@nuxt/kit', async original => ({
  ...await original<typeof import('@nuxt/kit')>(),
  addTemplate: (template: { filename: string }) => ({ ...template, dst: `/build/${template.filename}` }),
}))

const tokens = readFileSync(fileURLToPath(new URL('../../src/runtime/vue/components/tokens.css', import.meta.url)), 'utf8')

/** A Nuxt with these modules installed and these options, and its `modules:done` hooks. */
function fakeNuxt(modules: string[], colorMode?: { classPrefix?: string, classSuffix?: string }) {
  const hooks: Array<() => void> = []
  const nuxt = {
    options: { _installedModules: modules.map(name => ({ meta: { name } })), modules: [], css: ['/app/first.css', '/pkg/ui.css', '/app/last.css'], colorMode },
    hook: (name: string, fn: () => void) => {
      if (name === 'modules:done') hooks.push(fn)
    },
  } as unknown as Nuxt
  return { nuxt, done: () => hooks.forEach(fn => fn()) }
}

describe('the theme bridge', () => {
  it('themes the same roots as tokens.css', () => {
    // The first rule: `:where(<roots>) { --bk-…: … }`.
    const css = tokens.replace(/\/\*[\s\S]*?\*\//g, '')
    const list = css.slice(css.indexOf(':where(') + ':where('.length, css.indexOf(') {'))
    expect(list.split(',').map(root => root.trim()).filter(Boolean)).toEqual([...TOKEN_ROOTS])
  })

  it('maps the neutrals, the edge and the card radius onto Nuxt UI, and keeps the signals the package\'s', () => {
    const declared = new Set([...tokens.matchAll(/^\s*(--bk-[\w-]+):/gm)].map(match => match[1]!))
    const own = ['--bk-accent', '--bk-on-accent', '--bk-ok', '--bk-warn', '--bk-error', '--bk-ink', '--bk-radius-control']
    expect([...Object.keys(NUXT_UI_TOKENS), ...own].sort()).toEqual([...declared].sort())
    expect(NUXT_UI_TOKENS['--bk-edge']).toBe('var(--ui-border)')
    expect(tokens).toMatch(/--bk-ink: inherit;/)
  })

  it('writes nothing for an app with neither module', () => {
    expect(themeBridgeCss({ nuxtUi: false, colorMode: false })).toBe('')
  })

  it('maps the tokens inside the package layer, after the layer order', () => {
    const css = themeBridgeCss({ nuxtUi: true, colorMode: false })
    expect(css).toContain('@layer theme, base, components, utilities;\n\n@layer components.backend {')
    for (const [token, value] of Object.entries(NUXT_UI_TOKENS)) expect(css).toContain(`${token}: ${value};`)
    expect(css).not.toContain('color-scheme')
  })

  it('follows the color-mode class with color-scheme on the roots only', () => {
    const css = themeBridgeCss({ nuxtUi: false, colorMode: { dark: 'dark-mode', light: 'light-mode' } })
    expect(css).toContain(`:where(html.dark-mode) :where(${TOKEN_ROOTS.join(', ')}) {\n    color-scheme: dark;`)
    expect(css).toContain(':where(html.light-mode) :where(')
    expect(css).not.toContain('--bk-accent')
  })

  it('detects the modules and color-mode\'s class affixes', () => {
    expect(detectThemeBridge(fakeNuxt([]).nuxt)).toEqual({ nuxtUi: false, colorMode: false })
    expect(detectThemeBridge(fakeNuxt(['@nuxt/ui', '@nuxtjs/color-mode']).nuxt)).toEqual({ nuxtUi: true, colorMode: { dark: 'dark', light: 'light' } })
    expect(detectThemeBridge(fakeNuxt(['@nuxtjs/color-mode'], { classPrefix: 'theme-', classSuffix: '-mode' }).nuxt).colorMode).toEqual({ dark: 'theme-dark-mode', light: 'theme-light-mode' })
  })

  it('leaves color-scheme alone when the class is not a plain name', () => {
    expect(detectThemeBridge(fakeNuxt(['@nuxtjs/color-mode'], { classSuffix: ' x' }).nuxt).colorMode).toBe(false)
  })

  it('adds the stylesheet right after ui.css once every module is in', () => {
    const { nuxt, done } = fakeNuxt(['@nuxt/ui'])
    registerThemeBridge(nuxt, '/pkg/ui.css')
    expect(nuxt.options.css).toHaveLength(3)
    done()
    expect(nuxt.options.css).toEqual(['/app/first.css', '/pkg/ui.css', '/build/nuxt-backend/theme-bridge.css', '/app/last.css'])
  })

  it('adds nothing to an app with neither module', () => {
    const { nuxt, done } = fakeNuxt([])
    registerThemeBridge(nuxt, '/pkg/ui.css')
    done()
    expect(nuxt.options.css).toEqual(['/app/first.css', '/pkg/ui.css', '/app/last.css'])
  })
})
