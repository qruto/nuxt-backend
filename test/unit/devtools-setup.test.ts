import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DevtoolsServerInfo } from '../../src/devtools/rpc-types'
import { DEVTOOLS_UI_ROUTE, RPC_NAMESPACE } from '../../src/devtools/rpc-types'

const addCustomTab = vi.fn()
const extendServerRpc = vi.fn()
const onDevToolsInitialized = vi.fn()

vi.mock('@nuxt/devtools-kit', () => ({
  addCustomTab: (...args: unknown[]) => addCustomTab(...args),
  extendServerRpc: (...args: unknown[]) => extendServerRpc(...args),
  onDevToolsInitialized: (...args: unknown[]) => onDevToolsInitialized(...args),
}))

const { setupDevtools } = await import('../../src/devtools/index')

const base = mkdtempSync(join(tmpdir(), 'nuxt-backend-devtools-'))
afterAll(() => rmSync(base, { recursive: true, force: true }))

function fakeEnv(resolverBase: string) {
  const hooks = new Map<string, (arg: unknown) => unknown>()
  const nuxt = { hook: vi.fn((name: string, fn: (arg: unknown) => unknown) => hooks.set(name, fn)) }
  const resolver = { resolve: (path: string) => join(resolverBase, path) }
  return { hooks, nuxt, resolver }
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
    authRoute: '/api/auth',
    loginPath: null,
    pagesEnabled: true,
  },
  pages: [],
  findings: [],
  env: { required: {}, optional: {} },
  appConfig: { billing: { plans: [], packs: [] }, brand: {} },
  mcp: { enabled: false, builtinTools: [] },
  versions: {},
}

function contextFor(rootDir: string) {
  return { rootDir, functionsDir: 'backend', getInfo: () => info }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('setupDevtools', () => {
  it('serves the prebuilt panel via sirv when dist/devtools-client exists', async () => {
    const withClient = join(base, 'with-client')
    mkdirSync(join(withClient, 'devtools-client'), { recursive: true })
    const { hooks, nuxt, resolver } = fakeEnv(withClient)

    setupDevtools(resolver as never, nuxt as never, contextFor(base))

    expect(hooks.has('vite:serverCreated')).toBe(true)
    const middlewares = { use: vi.fn() }
    await hooks.get('vite:serverCreated')!({ middlewares })
    expect(middlewares.use).toHaveBeenCalledWith(DEVTOOLS_UI_ROUTE, expect.any(Function))
  })

  it('proxies the panel to the local dev server when the built client is absent', () => {
    const { hooks, nuxt, resolver } = fakeEnv(join(base, 'stub-build'))

    setupDevtools(resolver as never, nuxt as never, contextFor(base))

    expect(hooks.has('vite:extendConfig')).toBe(true)
    const viteConfig: { server?: { proxy?: Record<string, { rewrite?: (path: string) => string }> } } = {}
    hooks.get('vite:extendConfig')!(viteConfig)
    expect(viteConfig.server?.proxy?.[DEVTOOLS_UI_ROUTE]).toMatchObject({ changeOrigin: true })
    expect(viteConfig.server!.proxy![DEVTOOLS_UI_ROUTE]!.rewrite!(`${DEVTOOLS_UI_ROUTE}/foo`)).toBe('/foo')
  })

  it('delegates the resolveBackendSource RPC to the functions-dir lookup', () => {
    const projectRoot = join(base, 'rpc-project')
    mkdirSync(join(projectRoot, 'backend'), { recursive: true })
    writeFileSync(join(projectRoot, 'backend', 'billing.ts'), '')
    const { nuxt, resolver } = fakeEnv(join(base, 'stub-build'))

    setupDevtools(resolver as never, nuxt as never, contextFor(projectRoot))
    onDevToolsInitialized.mock.calls[0]![0]()

    const rpc = extendServerRpc.mock.calls[0]![1] as {
      resolveBackendSource: (file: string) => { filepath?: string }
    }
    expect(rpc.resolveBackendSource('billing.ts'))
      .toEqual({ filepath: join(projectRoot, 'backend', 'billing.ts') })
    expect(rpc.resolveBackendSource('missing.ts')).toEqual({})
  })

  it('registers the iframe tab and the server RPC', () => {
    const { nuxt, resolver } = fakeEnv(join(base, 'stub-build'))

    setupDevtools(resolver as never, nuxt as never, contextFor(base))

    expect(addCustomTab).toHaveBeenCalledWith(expect.objectContaining({
      name: 'nuxt-backend',
      title: 'Backend',
      view: { type: 'iframe', src: DEVTOOLS_UI_ROUTE },
    }))

    // The RPC is registered once DevTools initializes.
    expect(onDevToolsInitialized).toHaveBeenCalledTimes(1)
    onDevToolsInitialized.mock.calls[0]![0]()
    expect(extendServerRpc).toHaveBeenCalledWith(RPC_NAMESPACE, expect.objectContaining({
      getInfo: expect.any(Function),
      resolveBackendSource: expect.any(Function),
    }))
    expect(extendServerRpc.mock.calls[0]![1].getInfo()).toBe(info)
  })
})
