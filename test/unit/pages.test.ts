import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { registryText } from '../../scripts/pages-registry.mjs'
import { BACKEND_PAGE_DEFS, collectExistingPagePaths, normalizePagePath, pageRouteRules, privatePagePaths, resolvePagePath, resolvedBackendPages } from '../../src/pages'

describe('resolvePagePath', () => {
  it('returns default paths when nothing is configured', () => {
    expect(resolvePagePath(undefined, 'login')).toBe('/login')
    expect(resolvePagePath({}, 'pricing')).toBe('/pricing')
    expect(resolvePagePath({}, 'acceptInvitation')).toBe('/accept-invitation')
  })

  it('honors custom paths, normalized', () => {
    expect(resolvePagePath({ login: '/sign-in' }, 'login')).toBe('/sign-in')
    expect(resolvePagePath({ settings: 'account/' }, 'settings')).toBe('/account')
  })

  it('keeps the default path for a blank one: a page is always mounted', () => {
    expect(resolvePagePath({ pricing: '  ' }, 'pricing')).toBe('/pricing')
  })
})

describe('resolvedBackendPages', () => {
  it('maps every page key to its path', () => {
    const resolved = resolvedBackendPages({ login: '/sign-in' })
    expect(resolved).toEqual({
      login: '/sign-in',
      pricing: '/pricing',
      settings: '/settings',
      profile: '/profile',
      security: '/security',
      acceptInvitation: '/accept-invitation',
      agentConsent: '/oauth/consent',
    })
    expect(Object.keys(resolved)).toHaveLength(BACKEND_PAGE_DEFS.length)
  })
})

describe('privatePagePaths', () => {
  it('lists the pages behind the auth middleware, at their paths', () => {
    expect(privatePagePaths(undefined).sort()).toEqual(['/accept-invitation', '/oauth/consent', '/profile', '/security', '/settings'])
    expect(privatePagePaths({ profile: '/me/' })).toContain('/me')
  })

  it('never lists the public pages', () => {
    expect(privatePagePaths({ login: '/sign-in', pricing: '/plans' })).not.toEqual(expect.arrayContaining(['/sign-in', '/plans']))
  })
})

describe('pageRouteRules', () => {
  it('prerenders no page', () => {
    for (const def of BACKEND_PAGE_DEFS) expect(pageRouteRules(def), def.key).toMatchObject({ prerender: false })
  })

  it('keeps a private page out of indexes, sitemaps and every cache', () => {
    expect(pageRouteRules({ auth: true })).toStrictEqual({
      prerender: false,
      cache: false,
      swr: false,
      isr: false,
      robots: false,
      sitemap: false,
      headers: { 'cache-control': 'private, no-store' },
    })
  })

  it('leaves a public page cacheable and indexable', () => {
    expect(pageRouteRules({ auth: false })).toStrictEqual({ prerender: false })
  })
})

describe('the page registry', () => {
  it('lists every page file (pnpm generate)', () => {
    expect(readFileSync(fileURLToPath(new URL('../../src/pages/registry.ts', import.meta.url)), 'utf8')).toBe(registryText())
  })

  it('gives each page a key, a component and an absolute default path', () => {
    const keys = BACKEND_PAGE_DEFS.map(def => def.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const def of BACKEND_PAGE_DEFS) {
      expect(def.defaultPath, def.key).toMatch(/^\/[a-z0-9/-]+$/)
      expect(existsSync(fileURLToPath(new URL(`../../src/runtime/vue/pages/${def.file}.ts`, import.meta.url))), def.file).toBe(true)
    }
  })
})

describe('collectExistingPagePaths', () => {
  it('collects absolute paths with trailing slashes normalized', () => {
    const paths = collectExistingPagePaths([
      { path: '/login/' },
      { path: '/pricing' },
    ])
    expect(paths.has('/login')).toBe(true)
    expect(paths.has('/pricing')).toBe(true)
  })

  it('joins relative child paths onto their parents', () => {
    const paths = collectExistingPagePaths([
      {
        path: '/settings',
        children: [
          { path: 'billing' },
          { path: '/settings/security' },
        ],
      },
    ])
    expect(paths.has('/settings')).toBe(true)
    expect(paths.has('/settings/billing')).toBe(true)
    expect(paths.has('/settings/security')).toBe(true)
  })
})

describe('normalizePagePath', () => {
  it('adds leading slashes and strips trailing ones', () => {
    expect(normalizePagePath('login')).toBe('/login')
    expect(normalizePagePath('/login/')).toBe('/login')
    expect(normalizePagePath('/')).toBe('/')
  })
})
