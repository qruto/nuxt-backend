import type { Nuxt } from '@nuxt/schema'
import { describe, expect, it } from 'vitest'
import { deploySiteConfig, registerDeploySiteConfig } from '../../src/nuxt/site'

// The site an app's nuxt-site-config resolves, from the kind of deploy the
// build is for: a preview is its own site at the branch's stable URL and is
// never indexed, production is left as nuxt-site-config reads it, and the
// app's own `site` in nuxt.config sits above both.

/** The priorities nuxt-site-config gives its own entries (site-config-stack's `SiteConfigPriority`). */
const PRIORITY = { vendor: -5, nitro: -4, config: -3 }

type Entry = { _context?: string, _priority?: number } & Record<string, unknown>

/** A Nuxt with nuxt-site-config's stack, and the hooks registered on it. */
function fakeNuxt({ dev = false, stack = [] as Entry[] | null } = {}) {
  const hooks = new Map<string, () => void>()
  const nuxt = {
    options: { dev },
    hook: (name: string, run: () => void) => void hooks.set(name, run),
    ...(stack ? { _siteConfig: { push: (entry: Entry) => stack.push(entry) } } : {}),
  } as unknown as Nuxt
  return { nuxt, hooks }
}

/**
 * A Vercel build of an app with nuxt-site-config: the entries it pushes from
 * the host's env and from the app's nuxt.config `site`, then whatever this
 * module adds when the stack resolves.
 */
function buildStack(env: Record<string, string>, appSite: Record<string, unknown> = {}): Entry[] {
  const stack: Entry[] = [
    { _context: 'vendorEnv', _priority: PRIORITY.vendor, url: env.VERCEL_URL ? `https://${env.VERCEL_URL}` : undefined },
    { _context: 'nuxt-site-config:config', _priority: PRIORITY.config, ...appSite },
  ]
  const { nuxt, hooks } = fakeNuxt({ stack })
  registerDeploySiteConfig(nuxt, env)
  hooks.get('site-config:resolve')?.()
  return stack
}

/**
 * The site a deployed server's pages name, as nuxt-site-config resolves it:
 * the request's origin pushed first, the build's entries after it, sorted by
 * priority, a later entry winning a tie and a value left unset taking none.
 */
function servedSite(stack: readonly Entry[], origin: string): Record<string, unknown> {
  const site: Record<string, unknown> = {}
  const entries = [{ _context: 'nitro:init', _priority: PRIORITY.nitro, url: origin }, ...stack]
  for (const entry of entries.sort((a, b) => (a._priority ?? 0) - (b._priority ?? 0))) {
    for (const [key, value] of Object.entries(entry)) {
      if (!key.startsWith('_') && value !== undefined) site[key] = value
    }
  }
  return site
}

const PREVIEW = { VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: 'app-git-x.vercel.app', VERCEL_URL: 'app-abc123.vercel.app' }

describe('the deploy kind\'s site', () => {
  it('makes a Vercel preview its branch\'s own site, never indexable, whichever URL served it', () => {
    expect(servedSite(buildStack(PREVIEW), 'https://app-abc123.vercel.app')).toEqual({ url: 'https://app-git-x.vercel.app', indexable: false })
    // A deployment made outside Git has no branch URL: its own, as deploy --build gives the backend.
    expect(servedSite(buildStack({ VERCEL_ENV: 'preview', VERCEL_URL: 'app-abc123.vercel.app' }), 'https://app-abc123.vercel.app')).toEqual({ url: 'https://app-abc123.vercel.app', indexable: false })
    expect(deploySiteConfig({ VERCEL_ENV: 'development' })).toMatchObject({ indexable: false })
  })

  it('leaves production as nuxt-site-config reads it: the host the visitor came in on', () => {
    const production = { VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'panels.example.com', VERCEL_URL: 'app-abc123.vercel.app' }
    expect(deploySiteConfig(production)).toBeNull()
    expect(servedSite(buildStack(production), 'https://www.panels.example.com')).toEqual({ url: 'https://www.panels.example.com' })
    // Another host, or a local build: nuxt-site-config as it is.
    expect(deploySiteConfig({})).toBeNull()
  })

  it('yields to the app\'s own site in nuxt.config', () => {
    expect(servedSite(buildStack(PREVIEW, { url: 'https://staging.panels.example', indexable: true }), 'https://app-abc123.vercel.app')).toEqual({ url: 'https://staging.panels.example', indexable: true })
    // A site that names only its name still gets the preview's URL and stays out of the index.
    expect(servedSite(buildStack(PREVIEW, { name: 'Panels' }), 'https://app-abc123.vercel.app')).toEqual({ url: 'https://app-git-x.vercel.app', indexable: false, name: 'Panels' })
  })
})

describe('registerDeploySiteConfig', () => {
  it('pushes the entry when nuxt-site-config resolves its stack', () => {
    const stack: Entry[] = []
    const { nuxt, hooks } = fakeNuxt({ stack })
    registerDeploySiteConfig(nuxt, { VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: 'app-git-x.vercel.app' })
    expect(stack).toEqual([])
    hooks.get('site-config:resolve')!()
    expect(stack).toEqual([expect.objectContaining({ url: 'https://app-git-x.vercel.app', indexable: false })])
  })

  it('does nothing in development, on production or another host, or without nuxt-site-config', () => {
    const dev = fakeNuxt({ dev: true })
    registerDeploySiteConfig(dev.nuxt, { VERCEL_ENV: 'preview' })
    expect(dev.hooks.size).toBe(0)
    const production = fakeNuxt()
    registerDeploySiteConfig(production.nuxt, { VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'panels.example.com' })
    expect(production.hooks.size).toBe(0)
    const other = fakeNuxt()
    registerDeploySiteConfig(other.nuxt, {})
    expect(other.hooks.size).toBe(0)
    const without = fakeNuxt({ stack: null })
    registerDeploySiteConfig(without.nuxt, { VERCEL_ENV: 'preview' })
    expect(() => without.hooks.get('site-config:resolve')!()).not.toThrow()
  })
})
