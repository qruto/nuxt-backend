import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DevtoolsServerInfo } from '../../src/devtools/rpc-types'
import { DEVTOOLS_UI_ROUTE, RPC_NAMESPACE } from '../../src/devtools/rpc-types'

/** The portable dev-server handler the panel is served by, as kit receives it. */
type PanelHandler = { route: string, handler: { nuxt: (event: { req: Request }) => Promise<Response> } }
const addDevServerHandler = vi.hoisted(() => vi.fn<(input: PanelHandler) => void>())
vi.mock('@nuxt/kit', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  addDevServerHandler,
  runWithNuxtContext: (_nuxt: unknown, fn: () => unknown) => fn(),
}))

const { setupDevtools } = await import('../../src/devtools/index')

const base = mkdtempSync(join(tmpdir(), 'nuxt-backend-devtools-'))
afterAll(() => rmSync(base, { recursive: true, force: true }))
beforeEach(() => addDevServerHandler.mockClear())

/**
 * A Nuxt with just what the wiring touches: hooks (called by name below, the
 * way @nuxt/devtools calls them) and the DevTools server context DevTools
 * sets before `devtools:initialized`.
 */
function fakeEnv(resolverBase: string) {
  const hooks = new Map<string, (...args: unknown[]) => unknown>()
  const extendServerRpc = vi.fn()
  const nuxt = {
    hook: vi.fn((name: string, fn: (...args: unknown[]) => unknown) => hooks.set(name, fn)),
    devtools: { extendServerRpc },
  }
  const resolver = { resolve: (path: string) => join(resolverBase, path) }
  return { hooks, nuxt, resolver, extendServerRpc }
}

// Placeholder info object — nothing connects to it; the tests only assert it
// flows through `getInfo()` by identity.
const info: DevtoolsServerInfo = {
  functionsDir: 'backend',
  options: {
    authRoute: '/api/auth',
  },
  deployment: { kind: 'none' },
  pages: [],
  findings: [],
  capabilities: [],
  doctorRanAt: null,
  env: { visible: { required: {}, optional: {} }, deployment: null },
  versions: {},
}

function contextFor(rootDir: string) {
  return { rootDir, functionsDir: 'backend', getInfo: () => info }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('setupDevtools', () => {
  it('serves the prebuilt panel from a dev-server handler, uncached, and nothing outside it', async () => {
    const withClient = join(base, 'with-client')
    mkdirSync(join(withClient, 'devtools-client', '_nuxt'), { recursive: true })
    writeFileSync(join(withClient, 'devtools-client', 'index.html'), '<!doctype html><div id="panel"></div>')
    writeFileSync(join(withClient, 'devtools-client', '_nuxt', 'entry.js'), 'export {}')
    writeFileSync(join(withClient, 'secret.txt'), 'not for the panel')
    const { hooks, nuxt, resolver } = fakeEnv(withClient)

    setupDevtools(resolver as never, nuxt as never, contextFor(base))

    expect(hooks.has('vite:serverCreated')).toBe(false)
    expect(addDevServerHandler).toHaveBeenCalledTimes(1)
    const { route, handler } = addDevServerHandler.mock.calls[0]![0]
    expect(route).toBe(`${DEVTOOLS_UI_ROUTE}/**`)
    // The request as every server builder hands it over: the full URL.
    const get = (path: string, method = 'GET') =>
      handler.nuxt({ req: new Request(`http://localhost:3000${DEVTOOLS_UI_ROUTE}${path}`, { method }) })

    const page = await get('/')
    expect(page.status).toBe(200)
    expect(page.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(page.headers.get('cache-control')).toBe('no-store')
    expect(await page.text()).toContain('id="panel"')

    const script = await get('/_nuxt/entry.js')
    expect(script.headers.get('content-type')).toBe('text/javascript; charset=utf-8')

    expect((await get('/missing.js')).status).toBe(404)
    expect((await get('/', 'POST')).status).toBe(405)
    // A path that climbs out of the panel folder is refused, not read. The URL
    // parser folds a plain `..`, so it arrives with an encoded slash.
    const escape = await get('/..%2fsecret.txt')
    expect(escape.status).toBe(404)
    expect(await escape.text()).not.toContain('not for the panel')
  })

  it('proxies the panel to the local dev server when the built client is absent', () => {
    const { hooks, nuxt, resolver } = fakeEnv(join(base, 'stub-build'))

    setupDevtools(resolver as never, nuxt as never, contextFor(base))

    expect(addDevServerHandler).not.toHaveBeenCalled()
    expect(hooks.has('vite:extendConfig')).toBe(true)
    const viteConfig: { server?: { proxy?: Record<string, { rewrite?: (path: string) => string }> } } = {}
    hooks.get('vite:extendConfig')!(viteConfig)
    expect(viteConfig.server?.proxy?.[DEVTOOLS_UI_ROUTE]).toMatchObject({ changeOrigin: true })
    expect(viteConfig.server!.proxy![DEVTOOLS_UI_ROUTE]!.rewrite!(`${DEVTOOLS_UI_ROUTE}/foo`)).toBe('/foo')
  })

  it('registers the iframe tab under Server, through the hook DevTools calls', () => {
    const { hooks, nuxt, resolver } = fakeEnv(join(base, 'stub-build'))

    setupDevtools(resolver as never, nuxt as never, contextFor(base))

    const tabs: unknown[] = []
    hooks.get('devtools:customTabs')!(tabs)
    expect(tabs).toEqual([expect.objectContaining({
      name: 'nuxt-backend',
      title: 'Backend',
      category: 'server',
      view: { type: 'iframe', src: DEVTOOLS_UI_ROUTE },
    })])
  })

  it('extends the server RPC once DevTools initializes', () => {
    const projectRoot = join(base, 'rpc-project')
    mkdirSync(join(projectRoot, 'backend'), { recursive: true })
    writeFileSync(join(projectRoot, 'backend', 'billing.ts'), '')
    const { hooks, nuxt, resolver, extendServerRpc } = fakeEnv(join(base, 'stub-build'))

    setupDevtools(resolver as never, nuxt as never, contextFor(projectRoot))
    expect(extendServerRpc).not.toHaveBeenCalled()
    hooks.get('devtools:initialized')!()

    expect(extendServerRpc).toHaveBeenCalledWith(RPC_NAMESPACE, expect.objectContaining({
      getInfo: expect.any(Function),
      resolveBackendSource: expect.any(Function),
    }))
    const rpc = extendServerRpc.mock.calls[0]![1] as {
      getInfo: () => DevtoolsServerInfo
      resolveBackendSource: (file: string) => { filepath?: string }
    }
    expect(rpc.getInfo()).toBe(info)
    expect(rpc.resolveBackendSource('billing.ts')).toEqual({ filepath: join(projectRoot, 'backend', 'billing.ts') })
    expect(rpc.resolveBackendSource('missing.ts')).toEqual({})
  })

  it('tells an open panel when an env file or the codegen changes, once per burst', () => {
    vi.useFakeTimers()
    const asEvent = vi.fn()
    const { hooks, nuxt, resolver, extendServerRpc } = fakeEnv(join(base, 'stub-build'))
    extendServerRpc.mockReturnValue({ broadcast: { onInfo: { asEvent } } })

    setupDevtools(resolver as never, nuxt as never, contextFor(base))
    const watch = hooks.get('builder:watch') as (event: string, path: string) => void

    // Before DevTools initializes there is no panel to tell.
    watch('change', '.env.local')
    vi.advanceTimersByTime(400)
    expect(asEvent).not.toHaveBeenCalled()

    hooks.get('devtools:initialized')!()
    watch('change', '.env.local')
    watch('change', 'backend/_generated/api.d.ts')
    watch('change', 'app/pages/index.vue')
    vi.advanceTimersByTime(400)
    expect(asEvent).toHaveBeenCalledTimes(1)
    expect(asEvent).toHaveBeenCalledWith(info)
  })
})
