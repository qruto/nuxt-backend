import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BASE, BASE_LINE, drift, expected, mountRoutes, OWNED, SOURCE, TARGET, targetOf } from '../../scripts/sync-panels.mjs'
import { routes as templateRoutes } from '../../templates/panels/backend/routes'
import { routes as siteRoutes } from '../../website/backend/routes'
import { MODULE_PAGES } from '../../website/shared/module-pages'
import { mountPanelsPages, PANELS_BASE } from '../../website/shared/panels'

// The docs site serves Panels (templates/panels) under /playground. The sync
// copies what it can byte for byte; these tests pin the rest: the mount, the
// catalog, the stylesheet and the dependencies.

const rootDir = fileURLToPath(new URL('../..', import.meta.url))
const read = (path: string) => readFileSync(join(rootDir, path), 'utf8')

/**
 * The `backend` block of an app.config.ts, evaluated. Read as text:
 * importing the file would need the app's `defineAppConfig`.
 */
function backendBlock(path: string): unknown {
  const text = read(path)
  const open = text.indexOf('{', text.indexOf('\n  backend: {'))
  let depth = 0
  let close = open
  for (; close < text.length; close++) {
    if (text[close] === '{') depth++
    else if (text[close] === '}' && --depth === 0) break
  }
  const literal = text.slice(open, close + 1).replace(/^\s*\/\/.*$/gm, '')
  return new Function(`return (${literal})`)()
}

describe('the sync', () => {
  it('leaves nothing missing, changed or stale', () => {
    expect(drift()).toEqual({ missing: [], changed: [], stale: [] })
  })

  it('points at the template and the site', () => {
    expect(relative(rootDir, SOURCE)).toBe(join('templates', 'panels'))
    expect(relative(rootDir, TARGET)).toBe('website')
  })

  it('keeps the site\'s own files in place, and writes none of them', () => {
    const own = ['nuxt.config.ts', 'app.config.ts', 'pages/login.vue', 'pages/playground/offline.vue', 'middleware/playground-offline.global.ts', 'backend/counter.ts', 'backend/personas.ts', 'backend/billing.generated.ts', 'backend/paths.generated.ts', 'backend/_generated/api.d.ts']
    for (const file of own) {
      expect(existsSync(join(TARGET, file)), file).toBe(true)
      expect(OWNED.some(pattern => pattern.test(file)), file).toBe(true)
    }
    for (const file of expected().keys()) expect(OWNED.some(pattern => pattern.test(file)), file).toBe(false)
  })

  it('maps the template\'s folders onto the site\'s flat layout', () => {
    expect(targetOf('app/pages/strips/index.vue')).toBe('pages/strips/index.vue')
    expect(targetOf('app/components/StripPhoto.vue')).toBe('components/StripPhoto.vue')
    expect(targetOf('app/layouts/default.vue')).toBe('layouts/panels.vue')
    expect(targetOf('app/pages/index.vue')).toBe('pages/playground/index.vue')
    expect(targetOf('backend/strips.ts')).toBe('backend/strips.ts')
    for (const file of ['app/app.vue', 'app/app.config.ts', 'app/assets/main.css', 'backend/billing.generated.ts', 'backend/paths.generated.ts', 'backend/strips.test.ts', 'nuxt.config.ts', 'package.json', 'test/app/strips.test.ts']) {
      expect(targetOf(file), file).toBeNull()
    }
  })
})

describe('the mount', () => {
  it('serves Panels under /playground: the site\'s routes.ts says so, and only that line differs', () => {
    expect(BASE).toBe('/playground')
    expect(PANELS_BASE).toBe(BASE)
    expect(read('templates/panels/backend/routes.ts')).toContain(BASE_LINE)
    expect(read('website/backend/routes.ts')).toBe(mountRoutes(read('templates/panels/backend/routes.ts')))
    expect(siteRoutes.strips).toBe(`${BASE}${templateRoutes.strips}`)
    expect(siteRoutes.strip('x')).toBe(`${BASE}${templateRoutes.strip('x')}`)
    expect(() => mountRoutes('export const base = \'/x\'\n')).toThrow(BASE_LINE)
  })

  it('moves Panels\' pages and leaves the site\'s own where they are', () => {
    const dir = '/site/pages'
    const pages = [
      { path: '/strips', file: `${dir}/strips/index.vue` },
      { path: '/strips/:id()', file: `${dir}/strips/[id].vue` },
      { path: '/welcome', file: `${dir}/welcome.vue` },
      { path: '/admin/demo', file: `${dir}/admin/demo.vue` },
      { path: '/playground', file: `${dir}/playground/index.vue` },
      { path: '/playground/offline', file: `${dir}/playground/offline.vue` },
      { path: '/login', file: `${dir}/login.vue` },
      { path: '/:lang?/:slug(.*)*', file: `${dir}/[[lang]]/[...slug].vue` },
      { path: '/pricing', file: '/module/runtime/vue/pages/pricing.vue' },
    ]
    mountPanelsPages(pages, dir)
    expect(pages.map(page => page.path)).toEqual(['/playground/strips', '/playground/strips/:id()', '/playground/welcome', '/playground/admin/demo', '/playground', '/playground/offline', '/login', '/:lang?/:slug(.*)*', '/pricing'])
  })

  it('mounts the module\'s pages beside Panels, its welcome Panels\' own, and lands a sign-in on the strips', () => {
    const config = read('website/nuxt.config.ts')
    expect(config).toContain('pages: MODULE_PAGES,')
    expect(config).toContain('redirects: { afterSignIn: routes.strips },')
    expect(config).toContain('mountPanelsPages(pages, ')
    expect(MODULE_PAGES.welcome).toBe(siteRoutes.welcome)
    expect(MODULE_PAGES).not.toHaveProperty('login')
    for (const path of Object.values(MODULE_PAGES)) expect(path.startsWith(`${BASE}/`), path).toBe(true)
  })

  it('shows the codes it sends on the sign-in page: the site\'s login reads the sandbox inbox Panels exports', () => {
    expect(read('templates/panels/backend/email.ts')).toMatch(/^export const \{ getSandboxInbox \} = email\.api$/m)
    expect(read('website/pages/login.vue')).toMatch(/SandboxInbox/)
  })

  it('keeps every playground route out of prerendering, indexes, sitemaps and social cards', () => {
    const config = read('website/nuxt.config.ts')
    for (const pattern of ['[PANELS_BASE]', '[`${PANELS_BASE}/**`]']) {
      expect(config).toContain(`${pattern}: { prerender: false, ogImage: false, robots: false, sitemap: false },`)
    }
    expect(config).toContain('excludePrefixes: { extend: [PANELS_BASE, ...ROOT_MODULE_PATHS] },')
  })
})

describe('the configuration', () => {
  it('renders the same catalog and labels as the template', () => {
    expect(backendBlock('website/app.config.ts')).toEqual(backendBlock('templates/panels/app/app.config.ts'))
  })

  it('declares every package the template depends on', () => {
    const template = JSON.parse(read('templates/panels/package.json')) as { dependencies: Record<string, string> }
    const site = JSON.parse(read('website/package.json')) as { dependencies: Record<string, string> }
    expect(Object.keys(template.dependencies).filter(name => !(name in site.dependencies))).toEqual([])
  })

  it('styles Panels\' pages with the template\'s rules, under its shell', () => {
    const selectors = (css: string) => new Set([...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^;{}@]+)\{/g)]
      .map(([, selector]) => selector!.replace(/\[data-shell='root'\]\s*/g, '').trim())
      .filter(selector => selector && !selector.startsWith(':root') && selector !== 'body'))
    const site = selectors(read('website/assets/css/panels.css'))
    const template = [...selectors(read('templates/panels/app/assets/main.css'))]
    expect(template.length).toBeGreaterThan(10)
    expect(template.filter(selector => !site.has(selector))).toEqual([])
    expect(read('website/app.css')).toContain('@import "./assets/css/panels.css";')
  })
})
