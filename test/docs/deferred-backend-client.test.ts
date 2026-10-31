import type { NuxtPage } from '@nuxt/schema'
import { describe, expect, it, vi } from 'vitest'
import { deferClientChunks, markBackendClientPages } from '../../website/modules/deferred-backend-client'
import { backendClientMiddleware, BackendClientChunkError, createBackendClientLoader } from '../../website/modules/deferred-backend-client/runtime/loader'
import { routeNeedsBackendClient } from '../../website/modules/deferred-backend-client/runtime/routes'

// The docs site's backend client, loaded only where a page uses it
// (website/modules/deferred-backend-client): which routes wait for it, what
// a page does when it cannot load, and what no page prefetches.

describe('the routes that load the client first', () => {
  const backendPages = ['/login', '/accept-invitation', '/oauth/consent', '/playground/vanilla/pricing']
  const pages = (): NuxtPage[] => [
    { path: '/', file: 'index.vue' },
    { path: '/:lang?/:slug(.*)*', file: '[...slug].vue' },
    { path: '/login', file: 'login.vue' },
    { path: '/accept-invitation', file: 'accept-invitation.ts' },
    { path: '/oauth/consent', file: 'agent-consent.ts' },
    { path: '/playground', file: 'playground/index.vue' },
    { path: '/playground/platform/billing', file: 'playground/platform/billing.vue' },
    { path: '/playground/vanilla/pricing', file: 'pricing.ts' },
    { path: '/playgrounds', file: 'playgrounds.vue' },
    { path: '/nested', file: 'nested.vue', children: [{ path: 'child', file: 'nested/child.vue' }] },
  ]

  /** The pages the build marks, by the path each declares. */
  function marked(): Set<string> {
    const list = pages()
    markBackendClientPages(list, backendPages)
    const walk = (entries: NuxtPage[], parent = ''): string[] => entries.flatMap(page => [
      ...page.meta?.backendClient === true ? [`${parent}${page.path}`] : [],
      ...walk(page.children ?? [], `${parent}${page.path}/`),
    ])
    return new Set(walk(list))
  }

  it('are the playground and the module\'s pages, children included', () => {
    expect(marked()).toEqual(new Set(['/login', '/accept-invitation', '/oauth/consent', '/playground', '/playground/platform/billing', '/playground/vanilla/pricing']))
  })

  it('marks a nested page by its full path', () => {
    const list: NuxtPage[] = [{ path: '/playground', file: 'playground.vue', children: [{ path: 'nested', file: 'nested.vue' }] }]
    markBackendClientPages(list, [])
    expect(list[0]!.children![0]!.meta).toEqual({ backendClient: true })
  })

  // vue-router matches `/login/`, `/Login` and `/LOGIN/` to the `/login`
  // record (`strict` and `sensitive` are off), so the mark on the record
  // decides, whatever the URL says.
  it.each(['/login/', '/Login', '/LOGIN/', '/accept-invitation/'])('waits on %s, whose record is marked', (fullPath) => {
    expect(routeNeedsBackendClient({ matched: [{ meta: { backendClient: true } }], fullPath } as never)).toBe(true)
  })

  it('waits under a marked parent', () => {
    expect(routeNeedsBackendClient({ matched: [{ meta: { backendClient: true } }, { meta: {} }] })).toBe(true)
  })

  it('does not wait on an unmarked page', () => {
    expect(routeNeedsBackendClient({ matched: [{ meta: { layout: 'docs' } }] })).toBe(false)
    expect(routeNeedsBackendClient({ matched: [] })).toBe(false)
  })
})

describe('loading the client', () => {
  const plugin = { name: 'client' }

  it('imports it once, however many blocks ask', async () => {
    const load = vi.fn(async () => ({ default: plugin }))
    const run = vi.fn()
    const loader = createBackendClientLoader({ url: 'https://x.convex.cloud', load, run })
    await Promise.all([loader(), loader(), loader()])
    expect(load).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledExactlyOnceWith(plugin)
  })

  it('refuses without a backend URL, before importing anything, so a live block shows its fallback', async () => {
    const load = vi.fn(async () => ({ default: plugin }))
    const loader = createBackendClientLoader({ url: '', load, run: vi.fn() })
    await expect(loader()).rejects.toThrow(/no backend URL/)
    expect(load).not.toHaveBeenCalled()
  })

  // A block reads it before it asks: a build with nothing to connect to
  // says so at once, and a page that has the client goes live at once.
  it('says where it stands without loading anything', async () => {
    const load = vi.fn(async () => ({ default: plugin }))
    const loader = createBackendClientLoader({ url: 'https://x.convex.cloud', load, run: vi.fn() })
    expect(loader.status()).toBe('deferred')
    expect(load).not.toHaveBeenCalled()
    await loader()
    expect(loader.status()).toBe('loaded')
    expect(createBackendClientLoader({ url: undefined, load, run: vi.fn() }).status()).toBe('unavailable')
    expect(load).toHaveBeenCalledOnce()
  })

  it('stays deferred after a failed load, so a block may try again', async () => {
    const loader = createBackendClientLoader({ url: 'https://x.convex.cloud', load: () => Promise.reject(new TypeError('404')), run: vi.fn() })
    await expect(loader()).rejects.toBeInstanceOf(BackendClientChunkError)
    expect(loader.status()).toBe('deferred')
    const failing = createBackendClientLoader({
      url: 'https://x.convex.cloud',
      load: async () => ({ default: plugin }),
      run: () => {
        throw new Error('plugin failed')
      },
    })
    await expect(failing()).rejects.toThrow('plugin failed')
    expect(failing.status()).toBe('deferred')
  })

  it('tries again after a chunk that would not fetch, and says what failed', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'))
      .mockResolvedValueOnce({ default: plugin })
    const loader = createBackendClientLoader({ url: 'https://x.convex.cloud', load, run: vi.fn() })
    await expect(loader()).rejects.toBeInstanceOf(BackendClientChunkError)
    await expect(loader()).resolves.toBeUndefined()
    expect(load).toHaveBeenCalledTimes(2)
  })
})

describe('the middleware before a page that needs the client', () => {
  const needs = { fullPath: '/playground?tab=1', matched: [{ meta: { backendClient: true } }] }
  const docs = { fullPath: '/docs/start', matched: [{ meta: {} }] }

  it('waits for the client, and only there', async () => {
    const load = vi.fn(async () => {})
    const middleware = backendClientMiddleware({ available: true, load, reload: vi.fn() })
    expect(middleware(docs)).toBeUndefined()
    await middleware(needs)
    expect(load).toHaveBeenCalledTimes(1)
  })

  // An open tab outlives a deploy that renames the client's chunk. Nuxt's
  // own chunk reload never sees the failure (the router wraps a middleware's
  // error in a new one), so the middleware reloads into the new build.
  it('reloads into the current build at the target when the client\'s chunk is gone', async () => {
    const reload = vi.fn()
    const middleware = backendClientMiddleware({ available: true, load: () => Promise.reject(new BackendClientChunkError(new TypeError('404'))), reload })
    await expect(middleware(needs)).rejects.toBeInstanceOf(BackendClientChunkError)
    expect(reload).toHaveBeenCalledExactlyOnceWith('/playground?tab=1')
  })

  it('does not reload for a client that loaded and then failed to start', async () => {
    const reload = vi.fn()
    const middleware = backendClientMiddleware({ available: true, load: () => Promise.reject(new Error('plugin failed')), reload })
    await expect(middleware(needs)).rejects.toThrow('plugin failed')
    expect(reload).not.toHaveBeenCalled()
  })

  it('lets a page render as it would without a backend URL: there is nothing to load', () => {
    const load = vi.fn(async () => {})
    expect(backendClientMiddleware({ available: false, load, reload: vi.fn() })(needs)).toBeUndefined()
    expect(load).not.toHaveBeenCalled()
  })
})

describe('the client\'s chunks', () => {
  const PLUGIN = '../node_modules/nuxt-convex-module/dist/runtime/better-auth/vue/plugin.client.js'

  function manifest(): Record<string, { isEntry?: boolean, imports?: string[], dynamicImports?: string[], prefetch?: boolean }> {
    return {
      'entry.js': { isEntry: true, imports: ['_vue.js'], dynamicImports: [PLUGIN, 'pages/playground.vue', 'layouts/docs.vue'], prefetch: true },
      '_vue.js': { prefetch: true },
      [PLUGIN]: { imports: ['_vue.js', '_convex.js', '_auth.js'], prefetch: true },
      '_convex.js': { imports: ['_vue.js'], prefetch: true },
      '_auth.js': { imports: ['_shared.js'], prefetch: true },
      '_shared.js': { prefetch: true },
      'pages/playground.vue': { imports: ['_convex.js', '_page.js'], prefetch: true },
      '_page.js': { prefetch: true },
      'layouts/docs.vue': { imports: ['_vue.js'], prefetch: true },
    }
  }

  it('are never prefetched, from any route into them; what the entry loads anyway is left alone', () => {
    const chunks = manifest()
    expect(deferClientChunks(chunks, PLUGIN).sort()).toEqual([PLUGIN, '_auth.js', '_convex.js', '_shared.js'].sort())
    for (const key of [PLUGIN, '_auth.js', '_convex.js', '_shared.js']) expect(chunks[key]!.prefetch, key).toBe(false)
    for (const key of ['_vue.js', 'pages/playground.vue', '_page.js', 'layouts/docs.vue']) expect(chunks[key]!.prefetch, key).toBe(true)
  })

  it('leave the entry\'s prefetch list', () => {
    const chunks = manifest()
    deferClientChunks(chunks, PLUGIN)
    expect(chunks['entry.js']!.dynamicImports).toEqual(['pages/playground.vue', 'layouts/docs.vue'])
  })
})
