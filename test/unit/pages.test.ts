import { describe, expect, it } from 'vitest'
import { BACKEND_PAGE_DEFS, collectExistingPagePaths, normalizePagePath, resolvePagePath, resolvedBackendPages } from '../../src/pages'

describe('resolvePagePath', () => {
  it('returns default paths when nothing is configured', () => {
    expect(resolvePagePath(undefined, 'login')).toBe('/login')
    expect(resolvePagePath({}, 'pricing')).toBe('/pricing')
    expect(resolvePagePath({}, 'acceptInvitation')).toBe('/accept-invitation')
  })

  it('honors custom paths, normalized', () => {
    expect(resolvePagePath({ login: '/sign-in' }, 'login')).toBe('/sign-in')
    expect(resolvePagePath({ settings: 'account/' }, 'settings')).toBe('/account')
    expect(resolvePagePath({ security: true }, 'security')).toBe('/security')
  })

  it('disables per key, per empty path, and for the whole set', () => {
    expect(resolvePagePath({ pricing: false }, 'pricing')).toBeNull()
    expect(resolvePagePath({ pricing: '  ' }, 'pricing')).toBeNull()
    expect(resolvePagePath(false, 'login')).toBeNull()
  })
})

describe('resolvedBackendPages', () => {
  it('maps every page key, with empty strings for disabled pages', () => {
    const resolved = resolvedBackendPages({ profile: false, login: '/sign-in' })
    expect(resolved).toEqual({
      login: '/sign-in',
      pricing: '/pricing',
      settings: '/settings',
      profile: '',
      security: '/security',
      acceptInvitation: '/accept-invitation',
    })
    expect(Object.keys(resolved)).toHaveLength(BACKEND_PAGE_DEFS.length)
  })

  it('is all-empty when the page set is off', () => {
    expect(Object.values(resolvedBackendPages(false)).every(path => path === '')).toBe(true)
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
