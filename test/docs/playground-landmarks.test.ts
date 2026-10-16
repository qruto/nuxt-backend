import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BACKEND_PAGE_DEFS } from '../../src/pages'
import { at, read, walk } from './helpers'

// One main landmark on every playground route. The module's own pages (the
// vanilla group) render their own <main>, as a page does in an app without
// layouts; the playground layout gives every other page its main landmark
// and only a plain container to the module's.

const LAYOUT = 'website/layouts/playground.vue'
const modulePages = walk('src/runtime/vue/pages', ['.ts'])
const sitePages = walk('website/pages/playground', ['.vue'])

/** A source without its comments, which may well name a landmark. */
const code = (file: string) => read(file).replace(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, '$1')

describe('the playground\'s main landmark', () => {
  it.each(modulePages.map(file => [file.slice(file.indexOf('src/')), file] as const))('%s renders its own <main>', (_label, file) => {
    expect(code(file)).toMatch(/\bh\('main'/)
  })

  it('is the layout\'s on every page the site writes', () => {
    for (const file of sitePages) {
      const source = code(file)
      // A page that opts out of the layout brings its own.
      if (/layout:\s*false/.test(source)) continue
      expect(source, file).not.toMatch(/<main\b|role="main"/)
    }
  })

  it('is the module\'s on every page the module mounts: no site page takes one\'s path', () => {
    for (const def of BACKEND_PAGE_DEFS) {
      expect(existsSync(at(`website/pages/playground/vanilla${def.defaultPath}.vue`)), def.key).toBe(false)
    }
  })

  it('comes from the layout exactly where the module\'s pages do not bring one', () => {
    const layout = code(LAYOUT)
    expect(layout).not.toMatch(/<main\b/)
    expect(layout).toContain('useRuntimeConfig().public.backend.pages')
    expect(layout).toContain(':role="pageHasMain ? undefined : \'main\'"')
  })
})
