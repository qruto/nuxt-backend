import type { Nuxt } from '@nuxt/schema'
import { describe, expect, it } from 'vitest'
import { DEPLOY_SITE_PRIORITY, deploySiteConfig, registerDeploySiteConfig } from '../../src/nuxt/site'

// The site an app's nuxt-site-config reads, from the kind of deploy the
// build is for: a preview is its own site at the branch's stable URL and is
// never indexed, production is the project's domain, and the app's own `site`
// in nuxt.config sits above both.

/** nuxt-site-config's priorities: the host's env as it reads it, and the app's nuxt.config `site`. */
const VENDOR = -5
const CONFIG = -3

describe('the deploy kind\'s site', () => {
  it('makes a Vercel preview its branch\'s own site, never indexable', () => {
    expect(deploySiteConfig({ VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: 'app-git-x.vercel.app', VERCEL_URL: 'app-abc123.vercel.app' })).toEqual({ _context: 'nuxt-backend:deploy', _priority: DEPLOY_SITE_PRIORITY, url: 'https://app-git-x.vercel.app', indexable: false })
    // A deployment made outside Git has no branch URL: its own, as deploy --build gives the backend.
    expect(deploySiteConfig({ VERCEL_ENV: 'preview', VERCEL_URL: 'app-abc123.vercel.app' })).toMatchObject({ url: 'https://app-abc123.vercel.app', indexable: false })
    expect(deploySiteConfig({ VERCEL_ENV: 'development' })).toEqual({ _context: 'nuxt-backend:deploy', _priority: DEPLOY_SITE_PRIORITY, indexable: false })
  })

  it('gives production the project\'s domain and leaves its indexing to the app', () => {
    const production = deploySiteConfig({ VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'panels.example.com', VERCEL_URL: 'app-abc123.vercel.app' })
    expect(production).toEqual({ _context: 'nuxt-backend:deploy', _priority: DEPLOY_SITE_PRIORITY, url: 'https://panels.example.com' })
    expect(deploySiteConfig({ VERCEL_ENV: 'production' })).toBeNull()
    // Another host, or a local build: nuxt-site-config as it is.
    expect(deploySiteConfig({})).toBeNull()
  })

  it('sits above the host\'s env and below the app\'s own site config', () => {
    expect(DEPLOY_SITE_PRIORITY).toBeGreaterThan(VENDOR)
    expect(DEPLOY_SITE_PRIORITY).toBeLessThan(CONFIG)
  })
})

describe('registerDeploySiteConfig', () => {
  /** A Nuxt with nuxt-site-config's stack, and the hooks registered on it. */
  function fakeNuxt({ dev = false, stack = true } = {}) {
    const hooks = new Map<string, () => void>()
    const pushed: unknown[] = []
    const nuxt = {
      options: { dev },
      hook: (name: string, run: () => void) => void hooks.set(name, run),
      ...(stack ? { _siteConfig: { push: (entry: unknown) => pushed.push(entry) } } : {}),
    } as unknown as Nuxt
    return { nuxt, hooks, pushed }
  }

  it('pushes the entry when nuxt-site-config resolves its stack', () => {
    const { nuxt, hooks, pushed } = fakeNuxt()
    registerDeploySiteConfig(nuxt, { VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: 'app-git-x.vercel.app' })
    expect(pushed).toEqual([])
    hooks.get('site-config:resolve')!()
    expect(pushed).toEqual([expect.objectContaining({ url: 'https://app-git-x.vercel.app', indexable: false })])
  })

  it('does nothing in development, on another host, or without nuxt-site-config', () => {
    const dev = fakeNuxt({ dev: true })
    registerDeploySiteConfig(dev.nuxt, { VERCEL_ENV: 'preview' })
    expect(dev.hooks.size).toBe(0)
    const other = fakeNuxt()
    registerDeploySiteConfig(other.nuxt, {})
    expect(other.hooks.size).toBe(0)
    const without = fakeNuxt({ stack: false })
    registerDeploySiteConfig(without.nuxt, { VERCEL_ENV: 'preview' })
    expect(() => without.hooks.get('site-config:resolve')!()).not.toThrow()
  })
})
