import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp, toNodeListener, type EventHandler } from 'h3'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { setupDevtools } from '../../src/devtools/index'
import type { DevtoolsServerInfo } from '../../src/devtools/rpc-types'
import { DEVTOOLS_UI_ROUTE, RPC_NAMESPACE } from '../../src/devtools/rpc-types'

const base = mkdtempSync(join(tmpdir(), 'nuxt-backend-devtools-'))
afterAll(() => rmSync(base, { recursive: true, force: true }))

/**
 * A Nuxt with just what the wiring touches: hooks (called by name below, the
 * way @nuxt/devtools calls them), the dev-server handler list, and the
 * DevTools server context DevTools sets before `devtools:initialized`.
 */
function fakeEnv(resolverBase: string) {
  const hooks = new Map<string, (...args: unknown[]) => unknown>()
  const extendServerRpc = vi.fn()
  const nuxt = {
    hook: vi.fn((name: string, fn: (...args: unknown[]) => unknown) => hooks.set(name, fn)),
    options: { devServerHandlers: [] as Array<{ route: string, handler: EventHandler }> },
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
    installation: 'default',
    scaffold: true,
    css: true,
    autoEnv: true,
    workspaces: true,
    authRoute: '/api/auth',
    loginPath: null,
    pagesEnabled: true,
  },
  deployment: { kind: 'none' },
  pages: [],
  findings: [],
  env: { visible: { required: {}, optional: {} }, deployment: null },
  mcp: { enabled: false, tools: [], scopes: [] },
  versions: {},
}

function contextFor(rootDir: string) {
  return { rootDir, functionsDir: 'backend', getInfo: () => info }
}

/** Serve one registered dev-server handler on an ephemeral port. */
async function listen(entry: { route: string, handler: EventHandler }): Promise<{ url: string, server: Server }> {
  const app = createApp().use(entry.route, entry.handler)
  const server = createServer(toNodeListener(app))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}${entry.route}`, server }
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
    expect(nuxt.options.devServerHandlers).toHaveLength(1)
    const { url, server } = await listen(nuxt.options.devServerHandlers[0]!)
    try {
      const page = await fetch(`${url}/`)
      expect(page.status).toBe(200)
      expect(page.headers.get('content-type')).toBe('text/html; charset=utf-8')
      expect(page.headers.get('cache-control')).toBe('no-store')
      expect(await page.text()).toContain('id="panel"')

      const script = await fetch(`${url}/_nuxt/entry.js`)
      expect(script.headers.get('content-type')).toBe('text/javascript; charset=utf-8')

      expect((await fetch(`${url}/missing.js`)).status).toBe(404)
      expect((await fetch(`${url}/%2E%2E/secret.txt`)).status).toBe(404)
    }
    finally {
      server.close()
    }
  })

  it('proxies the panel to the local dev server when the built client is absent', () => {
    const { hooks, nuxt, resolver } = fakeEnv(join(base, 'stub-build'))

    setupDevtools(resolver as never, nuxt as never, contextFor(base))

    expect(nuxt.options.devServerHandlers).toHaveLength(0)
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
