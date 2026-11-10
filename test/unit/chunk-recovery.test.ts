import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

// The inline script a production build puts first in the head: one reload
// for a page whose code failed to load before the app started, under a guard
// of its own. Each case runs the script itself in a page of stubs, with the
// client plugin that tells it the app started, and the Nitro plugin over a
// render's HTML.

const runtimeConfig = vi.hoisted(() => ({ app: { buildAssetsDir: '/_nuxt/' } }))
vi.mock('nitropack/runtime', () => ({ defineNitroPlugin: (plugin: unknown) => plugin, useRuntimeConfig: () => runtimeConfig }))
vi.mock('#imports', () => ({ defineNuxtPlugin: (plugin: unknown) => plugin }))

const { chunkRecoveryScript, default: chunkRecoveryPlugin, headWithScript, RELOAD_GUARD_KEY, RELOAD_GUARD_MS } = await import('../../src/runtime/server/chunk-recovery')
const { default: startedPlugin } = await import('../../src/runtime/vue/plugins/chunk-recovery.client')
const { BROWSER_STORAGE } = await import('../../src/convex/legal')

type Listener = (event: { target?: unknown }) => void

/** Nuxt's start-up on the client, in order: `app:mounted` right after `vueApp.mount()`, then `app:suspense:resolve` once the first page rendered in full, hydration included. */
const STARTUP = ['app:mounted', 'app:suspense:resolve'] as const

/** The inline script in a page of its own: a stub for each global it reads. */
function page(options: { path?: string, readyState?: string, storage?: Partial<Storage>, assetsDir?: string } = {}) {
  const stored = new Map<string, string>()
  const storage = options.storage ?? {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, value),
  }
  const location = { pathname: options.path ?? '/', reload: vi.fn() }
  // A server-rendered page, which Vue hydrates with `createSSRApp`: nothing in it ever reads `[data-v-app]`.
  const document = { readyState: options.readyState ?? 'interactive', querySelector: () => null }
  const listeners: Record<string, Listener> = {}
  const addEventListener = (type: string, handler: Listener) => {
    listeners[type] = handler
  }
  // The script as a browser runs it, with a stub for each global it reads.
  new Function('addEventListener', 'document', 'location', 'sessionStorage', chunkRecoveryScript(options.assetsDir ?? '/_nuxt/'))(addEventListener, document, location, storage)
  return {
    fail: (target: unknown) => listeners.error!({ target }),
    failImport: () => listeners['vite:preloadError']!({}),
    // Nuxt's start-up up to `until`, through the client plugin's hooks, on the same page.
    start: (until: typeof STARTUP[number] = 'app:suspense:resolve') => {
      vi.stubGlobal('window', { dispatchEvent: (event: Event) => listeners[event.type]?.(event) })
      try {
        const hooks = startedPlugin.hooks as Record<string, (() => void) | undefined>
        for (const name of STARTUP.slice(0, STARTUP.indexOf(until) + 1)) hooks[name]?.()
      }
      finally {
        vi.unstubAllGlobals()
      }
    },
    location,
    stored,
  }
}

const entry = { tagName: 'SCRIPT', type: 'module', src: 'https://panels.app/_nuxt/entry.js' }
const stylesheet = { tagName: 'LINK', rel: 'stylesheet', href: 'https://panels.app/_nuxt/entry.css' }

describe('the inline recovery', () => {
  it('reloads the page for a failed entry script or stylesheet', () => {
    for (const target of [entry, stylesheet]) {
      const { fail, location } = page()
      fail(target)
      expect(location.reload).toHaveBeenCalledOnce()
    }
  })

  it('reloads once for a page that keeps failing, never in a loop', () => {
    const { fail, location } = page()
    fail(entry)
    fail(entry)
    fail(stylesheet)
    expect(location.reload).toHaveBeenCalledOnce()
  })

  it('keeps the guard to one path, for a minute', () => {
    vi.useFakeTimers()
    const { fail, location } = page({ path: '/waitlist' })
    fail(entry)
    location.pathname = '/invite'
    fail(entry)
    expect(location.reload).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(RELOAD_GUARD_MS + 1)
    fail(entry)
    expect(location.reload).toHaveBeenCalledTimes(3)
    vi.useRealTimers()
  })

  // Nuxt's `reloadNuxtApp` holds a path for ten seconds under `nuxt:reload`: a reload of the recovery's must not hold Nuxt's back for a minute.
  it('keeps its guard apart from Nuxt\'s `nuxt:reload`, which stays Nuxt\'s', () => {
    const { fail, location, stored } = page({ path: '/waitlist' })
    const nuxts = JSON.stringify({ path: '/waitlist', expires: Date.now() + 10_000 })
    stored.set('nuxt:reload', nuxts)
    fail(entry)
    expect(location.reload).toHaveBeenCalledOnce()
    expect(JSON.parse(stored.get(RELOAD_GUARD_KEY)!)).toMatchObject({ path: '/waitlist', expires: expect.any(Number) })
    expect(stored.get('nuxt:reload')).toBe(nuxts)
    // The privacy page names the key the script writes, on every build.
    expect(BROWSER_STORAGE.chunkReload).toMatchObject({ name: RELOAD_GUARD_KEY, kind: 'sessionStorage', everyBuild: true })
  })

  it('stays put without sessionStorage, since nothing would stop a loop', () => {
    const { fail, location } = page({
      storage: {
        getItem: () => {
          throw new Error('denied')
        },
      },
    })
    fail(entry)
    expect(location.reload).not.toHaveBeenCalled()
  })

  it('leaves the page alone for what is not the app\'s code', () => {
    const { fail, location } = page()
    fail(globalThis)
    fail({ tagName: 'IMG', src: 'https://panels.app/_nuxt/cover.webp' })
    fail({ tagName: 'SCRIPT', type: '', src: 'https://panels.app/_nuxt/classic.js' })
    fail({ tagName: 'LINK', rel: 'modulepreload', href: 'https://panels.app/_nuxt/next.js' })
    fail({ tagName: 'SCRIPT', type: 'module', src: 'https://elsewhere.example/app.js' })
    expect(location.reload).not.toHaveBeenCalled()
  })

  it('follows the app\'s build assets directory', () => {
    const moved = page({ assetsDir: '/_assets/' })
    moved.fail(entry)
    expect(moved.location.reload).not.toHaveBeenCalled()
    moved.fail({ ...entry, src: 'https://cdn.panels.app/_assets/entry.js' })
    expect(moved.location.reload).toHaveBeenCalledOnce()
  })

  it('leaves a stylesheet that fails after the page has loaded alone', () => {
    const { fail, location } = page({ readyState: 'complete' })
    fail(stylesheet)
    expect(location.reload).not.toHaveBeenCalled()
  })

  it('reloads for a dynamic import that fails before the app starts, under the same guard', () => {
    const { fail, failImport, location } = page()
    failImport()
    failImport()
    fail(entry)
    expect(location.reload).toHaveBeenCalledOnce()
  })

  // Vite's preload helper adds a `<link rel="stylesheet">` for a dynamic import's CSS, and Nuxt lets the import go on without it.
  it('leaves a stylesheet that fails on a running app alone, while the page is still loading', () => {
    const { fail, start, location } = page({ readyState: 'interactive' })
    start()
    fail({ tagName: 'LINK', rel: 'stylesheet', href: 'https://panels.app/_nuxt/LazyChart.css' })
    expect(location.reload).not.toHaveBeenCalled()
  })

  // Until the first page has hydrated, Nuxt's error handler is the app's: a lazy component whose chunk fails then swaps the page for the error page.
  it('reloads for a dynamic import that fails while the first page hydrates, after the app mounted', () => {
    const { failImport, start, location } = page()
    start('app:mounted')
    failImport()
    expect(location.reload).toHaveBeenCalledOnce()
  })

  // A lazy component's chunk on a flaky connection, or a navigation's, which Nuxt reloads to itself.
  it('leaves a dynamic import that fails on a hydrated app to Nuxt', () => {
    const { failImport, start, location } = page()
    start()
    failImport()
    failImport()
    expect(location.reload).not.toHaveBeenCalled()
  })

  it('cannot be closed by the directory it is given, and writes no markup', () => {
    const script = chunkRecoveryScript('/_x/</script><script>alert(1)//')
    expect(script).not.toContain('</script>')
    expect(script).not.toContain('<')
  })
})

/** nuxt-security's own nonce pass, the Nitro plugin that puts the request's nonce on the tags a render writes. */
const nonceThePage = pathToFileURL(join(dirname(createRequire(import.meta.url).resolve('nuxt-security')), 'runtime/nitro/plugins/40-cspSsrNonce.js')).href

/** A render's HTML hooks, in the order Nitro runs them. */
type RenderHook = (html: { head: string[], body: string[], bodyAppend: string[], bodyPrepend: string[] }, context: { event: { path: string, context: { security?: Record<string, unknown> } } }) => void

/** The plugin over one render: the head it leaves, then nuxt-security's nonce pass over it when `nonce` is given (a server render under the package's CSP). */
async function render(head: string[], nonce?: string): Promise<string[]> {
  const hooks: RenderHook[] = []
  const nitroApp = { hooks: { hook: (name: string, run: RenderHook) => void (name === 'render:html' && hooks.push(run)) } }
  chunkRecoveryPlugin(nitroApp as unknown as Parameters<typeof chunkRecoveryPlugin>[0])
  // nuxt-security sorts its Nitro plugins after every other one, so its pass runs last.
  if (nonce) (await import(nonceThePage)).default(nitroApp)
  const html = { head, body: [], bodyAppend: [], bodyPrepend: [] }
  const security = { nonce, rules: { enabled: true, nonce: true, headers: { contentSecurityPolicy: { 'script-src': ['\'strict-dynamic\'', '\'nonce-{{nonce}}\''] } } } }
  for (const run of hooks) run(html, { event: { path: '/', context: nonce ? { security } : {} } })
  return html.head
}

describe('the recovery in the rendered head', () => {
  it('goes first, right after the charset, with the request\'s nonce once', async () => {
    const [head] = await render(['<meta charset="utf-8">\n<meta name="viewport" content="width=device-width"><script type="module" src="/_nuxt/entry.js"></script>'], 'abc123')
    expect(head!.startsWith('<meta charset="utf-8"><script nonce="abc123">(function(){')).toBe(true)
    expect(head!.indexOf('nonce="abc123"')).toBeLessThan(head!.indexOf('/_nuxt/entry.js"'))
    const recovery = head!.match(/<script\b[^>]*>\(function\(\)\{/)![0]
    expect(recovery.match(/\bnonce=/g)).toHaveLength(1)
  })

  it('leaves the nonce to nuxt-security, which puts one on every script in the head', async () => {
    expect((await render(['<meta charset="utf-8">']))[0]).toMatch(/^<meta charset="utf-8"><script>\(function\(\)\{/)
  })

  it('reads the build assets directory from the runtime config', async () => {
    runtimeConfig.app.buildAssetsDir = '/_assets/'
    expect((await render(['<meta charset="utf-8">'])).join('')).toContain('var dir="/_assets/"')
    runtimeConfig.app.buildAssetsDir = '/_nuxt/'
  })

  it('leaves the other chunks of the head where they were', () => {
    expect(headWithScript(['<link rel="icon">', '<meta charset=utf-8>', '<style></style>'], '<script></script>'))
      .toEqual(['<link rel="icon">', '<meta charset=utf-8><script></script>', '<style></style>'])
  })
})
