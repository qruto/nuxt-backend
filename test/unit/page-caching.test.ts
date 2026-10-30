import type { Nuxt } from '@nuxt/schema'
import { describe, expect, it, vi } from 'vitest'
import { logger } from '../../src/nuxt/logger'
import { warnOnCachedPrivatePages } from '../../src/nuxt/pages'
import { cachingRulesOver, privatePagePaths } from '../../src/pages'

// The private pages carry their no-cache rules at their exact paths, and
// Nitro matches rules case-sensitively where the router does not: a wildcard
// cache rule over them is the risk, and the module says so at startup.

const PRIVATE = privatePagePaths(undefined)

describe('cachingRulesOver', () => {
  it('finds an app-wide cache rule, with the keys that turn caching on', () => {
    expect(cachingRulesOver({ '/**': { swr: 60, isr: 60 } }, PRIVATE)).toEqual([{ pattern: '/**', paths: PRIVATE, keys: ['swr', 'isr'] }])
    expect(cachingRulesOver({ '/**': { cache: { maxAge: 60 } } }, PRIVATE)).toEqual([{ pattern: '/**', paths: PRIVATE, keys: ['cache'] }])
  })

  it('reads Nitro\'s normalized rules, where `swr` also shows as `cache`', () => {
    expect(cachingRulesOver({ '/**': { swr: 60, cache: { swr: true, maxAge: 60 } } }, PRIVATE)[0]?.keys).toEqual(['swr', 'cache'])
  })

  it('leaves out exact paths, rules that cache nothing, and wildcards beside the private pages', () => {
    expect(cachingRulesOver({
      '/settings': { swr: 60 },
      '/**': { robots: true, headers: { 'x-a': 'b' } },
      '/blog/**': { swr: 60 },
      '/api/**': { cache: { maxAge: 60 } },
      '/old/**': { isr: false, swr: false, cache: false },
    }, PRIVATE)).toEqual([])
  })

  it('matches the way Nitro\'s matcher does', () => {
    const covers = (pattern: string, path: string) => cachingRulesOver({ [pattern]: { swr: 1 } }, [path]).length > 0
    // `**` is the rest of the path, none included.
    expect(covers('/**', '/settings')).toBe(true)
    expect(covers('/oauth/**', '/oauth/consent')).toBe(true)
    expect(covers('/oauth/**', '/oauth')).toBe(true)
    expect(covers('/**:rest', '/settings')).toBe(true)
    // `*` and `:name` are exactly one segment.
    expect(covers('/*', '/settings')).toBe(true)
    expect(covers('/:page', '/settings')).toBe(true)
    expect(covers('/*', '/oauth/consent')).toBe(false)
    expect(covers('/oauth/:step', '/oauth/consent')).toBe(true)
    // Any other segment by its exact spelling, case included.
    expect(covers('/OAUTH/**', '/oauth/consent')).toBe(false)
    expect(covers('/account/**', '/settings')).toBe(false)
  })
})

/** A Nuxt whose `nitro:init` hooks run against these normalized route rules. */
function nitroInit(paths: readonly string[], routeRules: Record<string, unknown>): void {
  const hooks: Array<(nitro: unknown) => void> = []
  const nuxt = { hook: (name: string, fn: (nitro: unknown) => void) => name === 'nitro:init' && hooks.push(fn) } as unknown as Nuxt
  warnOnCachedPrivatePages(nuxt, paths)
  for (const fn of hooks) fn({ options: { routeRules } })
}

describe('warnOnCachedPrivatePages', () => {
  it('warns once, naming the rule, the pages and the fix, when Nitro has every rule', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    nitroInit(PRIVATE, { '/settings': { cache: false }, '/**': { swr: 60, isr: 60, cache: { swr: true, maxAge: 60 } }, '/blog/**': { swr: 60 } })
    expect(warn).toHaveBeenCalledTimes(1)
    const message = String(warn.mock.calls[0]![0])
    expect(message).toContain(`\`routeRules['/**']\` (swr, isr) covers ${PRIVATE.join(', ')}`)
    expect(message).toContain('Nitro matches paths case-sensitively and the router does not')
    expect(message).toContain(`${PRIVATE[0]!.toUpperCase()} renders the page at ${PRIVATE[0]}`)
    expect(message).toContain('a signed-in render carries the session\'s token')
    expect(message).toContain('https://nuxt-backend.dev/docs/build/ui/pages#caches')
    expect(message).not.toContain('routeRules[\'/blog/**\']')
    warn.mockRestore()
  })

  it('stays quiet when no cache rule reaches a private page', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    nitroInit(PRIVATE, { '/blog/**': { swr: 60 }, '/settings': { robots: false } })
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
