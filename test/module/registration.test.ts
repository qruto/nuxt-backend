import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadNuxt } from '@nuxt/kit'
import type { Nuxt, NuxtHooks, NuxtPage } from '@nuxt/schema'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BACKEND_MCP_SCOPES, DEFAULT_MCP_EXCHANGE_PATH } from '../../src/convex/constants'
import { backendAppConfigDefaults } from '../../src/runtime/config'

// Module registration against a real Nuxt instance: `loadNuxt` with
// `ready: true` runs `nuxt.ready()` — config resolution, module installation
// (this module, its `moduleDependencies`, and Nuxt's core modules), and the
// Nitro config pass — without building anything. Everything the module
// contributes is then visible on `nuxt.options`, on the resolved Nitro
// options, or through the hooks the kit helpers registered.

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const fixtureDir = join(repoRoot, 'test/fixtures/registration')
const runtimeDir = join(repoRoot, 'src/runtime')

type Overrides = NonNullable<Parameters<typeof loadNuxt>[0]['overrides']>
type ExtendedComponents = Parameters<NuxtHooks['components:extend']>[0]
type ExtendedImports = Parameters<NuxtHooks['imports:extend']>[0]

/** The `moduleDependencies` forwarding targets, as their modules receive them. */
interface DependencyOptions {
  convex?: {
    url?: string
    siteUrl?: string
    authRoute?: string
    betterAuth?: { authClient?: string, loginPath?: string }
    polar?: boolean
    clerk?: boolean
    auth0?: boolean
  }
  mcp?: { route?: string, name?: string }
  backend?: { installation?: string }
}

interface NitroImport { name: string, as?: string, from: string }

/** The Nitro instance `initNuxt` creates during `ready()` (config only, no build). */
interface NitroView {
  _nitro?: { options: { imports: { imports: NitroImport[] } } }
}

const COMPONENT_NAMES = [
  'AuthForm',
  'RoleBoundary',
  'OrganizationBoundary',
  'FeatureBoundary',
  'AcceptInvitation',
  'GiftClaimBanner',
  'PricingTable',
  'BillingHistory',
  'UsageHistory',
  'CreditsLowBanner',
  'WorkspaceSettings',
  'ProfileSettings',
  'SecuritySettings',
]

const COMPOSABLE_NAMES = [
  'useAuth',
  'useAuthState',
  'useConnectionState',
  'useLoginFlow',
  'useOrganization',
  'useSearch',
  'useAggregate',
  'useCount',
  'useBilling',
  'useFeatures',
  'useCredits',
  'useOrders',
  'useUsage',
  'useGifts',
  'usePasskeys',
  'useSessions',
  'describeUserAgent',
  'unwrapAuth',
  'useBackendConfig',
  'useEmailStatus',
  'useWorkflowStatus',
  'useAiStream',
]

const DEFAULT_PAGES = [
  { name: 'backend-login', path: '/login', file: 'vue/pages/login', meta: undefined },
  { name: 'backend-pricing', path: '/pricing', file: 'vue/pages/pricing', meta: undefined },
  { name: 'backend-settings', path: '/settings', file: 'vue/pages/settings', meta: { middleware: 'auth' } },
  { name: 'backend-profile', path: '/profile', file: 'vue/pages/profile', meta: { middleware: 'auth' } },
  { name: 'backend-security', path: '/security', file: 'vue/pages/security', meta: { middleware: 'auth' } },
  { name: 'backend-accept-invitation', path: '/accept-invitation', file: 'vue/pages/accept-invitation', meta: { middleware: 'auth' } },
].map(page => ({ ...page, file: join(runtimeDir, page.file) }))

const MCP_RELAXATION = { security: { rateLimiter: false, xssValidator: false, corsHandler: false } }
const DISCOVERY_RELAXATION = { security: { corsHandler: false } }
const DISCOVERY_ROUTES = [
  '/.well-known/oauth-protected-resource',
  '/.well-known/oauth-protected-resource/**',
  '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-authorization-server/**',
]

/**
 * Registrations name files the bundler resolves later (`addComponent`,
 * `addImports`, handlers, pages), so check existence the way it would:
 * as given, with a source extension, or as a directory index.
 */
function existsWithExtension(path: string): boolean {
  return [path, `${path}.ts`, `${path}.mts`, `${path}.js`, `${path}.mjs`, `${path}.vue`, join(path, 'index.ts')]
    .some(candidate => existsSync(candidate))
}

/**
 * Every file under the fixture with its size and mtime — the zero-write
 * sentinel. `node_modules/` is Nuxt's own territory (the jiti transform
 * cache and the chrome-workspace id land there on every boot), so it is the
 * one subtree the comparison ignores.
 */
function snapshotFixture(dir = fixtureDir): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.name !== 'node_modules')
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) return snapshotFixture(path)
      const { size, mtimeMs } = statSync(path)
      return [`${relative(fixtureDir, path)} ${size} ${mtimeMs}`]
    })
}

function dependencyOptions(nuxt: Nuxt): DependencyOptions {
  return nuxt.options as unknown as DependencyOptions
}

function nitroImports(nuxt: Nuxt): NitroImport[] {
  const { _nitro } = nuxt as unknown as NitroView
  expect(_nitro, 'Nitro is initialised during ready()').toBeDefined()
  return _nitro!.options.imports.imports
}

function installedModuleNames(nuxt: Nuxt): string[] {
  return nuxt.options._installedModules.map(entry => entry.meta.name ?? '')
}

function pagesEnabled(nuxt: Nuxt): boolean | undefined {
  const pages = nuxt.options.pages as boolean | { enabled?: boolean } | undefined
  return typeof pages === 'boolean' ? pages : pages?.enabled
}

function ourPlugins(nuxt: Nuxt): string[] {
  return nuxt.options.plugins
    .map(plugin => typeof plugin === 'string' ? plugin : plugin.src)
    .filter(src => src.startsWith(runtimeDir))
}

async function extendComponents(nuxt: Nuxt): Promise<ExtendedComponents> {
  const components: ExtendedComponents = []
  await nuxt.callHook('components:extend', components)
  return components.filter(component => component.filePath.startsWith(runtimeDir))
}

async function extendImports(nuxt: Nuxt): Promise<ExtendedImports> {
  const imports: ExtendedImports = []
  await nuxt.callHook('imports:extend', imports)
  return imports
}

async function extendPages(nuxt: Nuxt, pages: NuxtPage[] = []): Promise<NuxtPage[]> {
  await nuxt.callHook('pages:extend', pages)
  return pages
}

/**
 * Boot the fixture once per suite (module setup runs in `ready()`), close it
 * afterwards, and pin the zero-write guarantee for that boot: the fixture
 * listing is unchanged and the scaffold sentinel (`convex.json`, which the
 * scaffolder writes whenever the functions dir is not `convex/`) is absent.
 */
function useBoot(overrides: Record<string, unknown> = {}, options: { dev?: boolean } = {}): () => Nuxt {
  let nuxt: Nuxt
  let before: string[]

  beforeAll(async () => {
    before = snapshotFixture()
    nuxt = await loadNuxt({
      cwd: fixtureDir,
      dev: options.dev ?? false,
      ready: true,
      overrides: { telemetry: false, ...overrides } as Overrides,
    })
  })

  afterAll(async () => {
    await nuxt?.close()
  })

  it('writes nothing into the fixture', () => {
    expect(snapshotFixture()).toEqual(before)
    expect(existsSync(join(fixtureDir, 'convex.json'))).toBe(false)
  })

  return () => nuxt
}

describe('module registration (defaults)', () => {
  const getNuxt = useBoot()

  it('resolves the module by package name and installs its dependencies', () => {
    const nuxt = getNuxt()
    const entry = nuxt.options._installedModules.find(module => module.meta.name === 'nuxt-backend')
    expect(entry?.entryPath).toBe(join(repoRoot, 'src/module.ts'))
    expect(installedModuleNames(nuxt)).toEqual(expect.arrayContaining(['nuxt-convex-module', '@nuxtjs/mcp-toolkit']))
  })

  it('registers the #backend/* aliases for Vite and Nitro, specific entries first', () => {
    const nuxt = getNuxt()
    const backendDir = join(nuxt.options.rootDir, 'backend')
    const expected = {
      '#backend/api': join(backendDir, '_generated/api'),
      '#backend/server': join(backendDir, '_generated/server'),
      '#backend/dataModel': join(backendDir, '_generated/dataModel'),
      '#backend/_generated': join(backendDir, '_generated'),
      '#backend': backendDir,
    }
    for (const aliases of [nuxt.options.alias, nuxt.options.nitro.alias ?? {}]) {
      const keys = Object.keys(aliases).filter(key => key.startsWith('#backend'))
      // First-match-wins resolution: `#backend` must trail its sub-aliases.
      expect(keys).toEqual(Object.keys(expected))
      expect(Object.fromEntries(keys.map(key => [key, aliases[key]]))).toEqual(expected)
    }
  })

  it('publishes the page paths publicly and the MCP config server-side only', () => {
    const nuxt = getNuxt()
    const { runtimeConfig } = nuxt.options
    expect(runtimeConfig.public.backend).toEqual({
      pages: {
        login: '/login',
        pricing: '/pricing',
        settings: '/settings',
        profile: '/profile',
        security: '/security',
        acceptInvitation: '/accept-invitation',
      },
    })
    expect(runtimeConfig.backendMcp).toEqual({
      route: '/mcp',
      authBase: '/api/auth',
      exchangePath: DEFAULT_MCP_EXCHANGE_PATH,
      scopes: [...BACKEND_MCP_SCOPES],
      tools: {},
      functions: {},
    })
    expect((runtimeConfig.public as Record<string, unknown>).backendMcp).toBeUndefined()
  })

  it('merges the appConfig.backend defaults', () => {
    expect(getNuxt().options.appConfig.backend).toEqual(backendAppConfigDefaults)
  })

  it('adds the neutral stylesheet exactly once', () => {
    const uiCss = join(runtimeDir, 'vue/components/ui.css')
    expect(existsSync(uiCss)).toBe(true)
    expect(getNuxt().options.css.filter(entry => entry === uiCss)).toHaveLength(1)
  })

  it('relaxes nuxt-security on the MCP route and the OAuth discovery documents', () => {
    const routeRules = getNuxt().options.nitro.routeRules ?? {}
    expect(routeRules['/mcp']).toEqual(MCP_RELAXATION)
    expect(routeRules['/mcp/**']).toEqual(MCP_RELAXATION)
    for (const route of DISCOVERY_ROUTES) {
      expect(routeRules[route], route).toEqual(DISCOVERY_RELAXATION)
    }
  })

  it('enables the Nitro async context the MCP handlers read the request through', () => {
    expect(getNuxt().options.nitro.experimental).toMatchObject({ asyncContext: true })
  })

  it('forwards the auth wiring to nuxt-convex-module and the route to @nuxtjs/mcp-toolkit', () => {
    const { convex, mcp } = dependencyOptions(getNuxt())
    const authClient = join(runtimeDir, 'vue/auth-client')
    expect(existsWithExtension(authClient)).toBe(true)
    expect(convex).toMatchObject({
      betterAuth: { authClient, loginPath: '/login' },
      polar: true,
      clerk: false,
      auth0: false,
    })
    expect(mcp).toEqual({ route: '/mcp' })
  })

  it('mounts the three route-matched middleware handlers', () => {
    const handlers = getNuxt().options.serverHandlers.filter(handler => handler.handler.startsWith(runtimeDir))
    expect(handlers.map(handler => ({ handler: handler.handler, middleware: handler.middleware, route: handler.route }))).toEqual([
      { handler: join(runtimeDir, 'server/mcp/gate'), middleware: true, route: undefined },
      { handler: join(runtimeDir, 'server/mcp/protected-resource'), middleware: true, route: undefined },
      { handler: join(runtimeDir, 'server/mcp/authorization-server'), middleware: true, route: undefined },
    ])
    for (const { handler } of handlers) {
      expect(existsWithExtension(handler), handler).toBe(true)
    }
  })

  it('contributes the built-in tool files to the toolkit definition scan', async () => {
    const paths = { tools: [] as string[] }
    // Declared by the toolkit's runtime types, not Nuxt's hook map.
    await (getNuxt().callHook as (name: string, arg: unknown) => Promise<void>)('mcp:definitions:paths', paths)
    expect(paths.tools).toEqual([join(runtimeDir, 'server/mcp/tools')])
    expect(existsSync(paths.tools[0]!)).toBe(true)
  })

  it('registers every component, each pointing at an existing file', async () => {
    const components = await extendComponents(getNuxt())
    expect(components.map(component => component.pascalName).sort()).toEqual([...COMPONENT_NAMES].sort())
    for (const component of components) {
      expect(component.export).toBe(component.pascalName)
      expect(existsWithExtension(component.filePath), component.filePath).toBe(true)
    }
  })

  it('registers the composable set; useAuth is ours alone (the base module registers useBetterAuth)', async () => {
    const imports = await extendImports(getNuxt())
    const ours = imports.filter(entry => entry.from.startsWith(runtimeDir))
    expect(ours.map(entry => entry.name).sort()).toEqual([...COMPOSABLE_NAMES].sort())
    for (const entry of ours) {
      expect(existsWithExtension(entry.from), entry.from).toBe(true)
    }
    expect(imports.filter(entry => entry.name === 'useAuth').map(entry => entry.from)).toEqual([join(runtimeDir, 'vue/composables/use-auth')])
    expect(imports.filter(entry => entry.name === 'useBetterAuth').every(entry => !entry.from.startsWith(runtimeDir))).toBe(true)
    expect(imports.some(entry => entry.name === 'useBetterAuth'), 'the base module registers useBetterAuth').toBe(true)
  })

  it('registers the Nitro server imports, backendAuth aliased from the base runtime', () => {
    const imports = nitroImports(getNuxt())
    const byAlias = (alias: string) => imports.find(entry => (entry.as ?? entry.name) === alias)
    const mcpIndex = join(runtimeDir, 'server/mcp/index')
    expect(existsWithExtension(mcpIndex)).toBe(true)
    expect(byAlias('useBackendMcp')).toMatchObject({ name: 'useBackendMcp', from: mcpIndex })
    expect(byAlias('defineBackendMcpTool')).toMatchObject({ name: 'defineBackendMcpTool', from: mcpIndex })

    const backendAuth = byAlias('backendAuth')
    expect(backendAuth).toMatchObject({ name: 'convexAuth' })
    // The base package's `./better-auth/server` export (dist) or, for a
    // stub-linked checkout, its source entry — either way a real file.
    expect(backendAuth!.from).toMatch(/[\\/]nuxt-convex-module[\\/](dist|src)[\\/]runtime[\\/]better-auth[\\/]nuxt[\\/]server(\.m?js|\.ts)?$/)
    expect(existsWithExtension(backendAuth!.from), backendAuth!.from).toBe(true)
  })

  it('mounts the six pages, the private ones behind the auth middleware', async () => {
    const nuxt = getNuxt()
    // No `pages/` dir in the fixture: the module's pages alone switch routing on.
    expect(pagesEnabled(nuxt)).toBe(true)
    const pages = await extendPages(nuxt)
    expect(pages.map(({ name, path, file, meta }) => ({ name, path, file, meta }))).toEqual(DEFAULT_PAGES)
    for (const page of pages) {
      expect(existsWithExtension(page.file!), page.file).toBe(true)
    }
  })

  it('skips a page the app already serves at the same path', async () => {
    const appLogin: NuxtPage = { name: 'login', path: '/login', file: join(fixtureDir, 'app/pages/login.vue') }
    const pages = await extendPages(getNuxt(), [appLogin])
    expect(pages.filter(page => page.path === '/login')).toEqual([appLogin])
    expect(pages.map(page => page.name)).not.toContain('backend-login')
    expect(pages).toHaveLength(DEFAULT_PAGES.length)
  })

  it('adds no plugins outside dev (the DevTools bridge is dev-only)', () => {
    expect(ourPlugins(getNuxt())).toEqual([])
  })
})

describe('mcp: false', () => {
  const getNuxt = useBoot({ backend: { mcp: false } })

  it('drops the MCP surface: no toolkit, no runtime config, no gate, no relaxations', () => {
    const nuxt = getNuxt()
    expect(installedModuleNames(nuxt)).not.toContain('@nuxtjs/mcp-toolkit')
    expect(dependencyOptions(nuxt).mcp).toBeUndefined()
    expect(nuxt.options.runtimeConfig.backendMcp).toBeUndefined()
    expect(nuxt.options.serverHandlers.filter(handler => handler.handler.startsWith(runtimeDir))).toEqual([])
    const routeRules = nuxt.options.nitro.routeRules ?? {}
    for (const route of ['/mcp', '/mcp/**', ...DISCOVERY_ROUTES]) {
      expect(routeRules[route], route).toBeUndefined()
    }
    expect(nuxt.options.nitro.experimental?.asyncContext).toBeUndefined()
  })

  it('keeps the server utils importable so consumer tool files still compile', () => {
    const aliases = nitroImports(getNuxt()).map(entry => entry.as ?? entry.name)
    expect(aliases).toEqual(expect.arrayContaining(['useBackendMcp', 'defineBackendMcpTool', 'backendAuth']))
  })

  it('contributes no tool files to the toolkit scan', async () => {
    const paths = { tools: [] as string[] }
    await (getNuxt().callHook as (name: string, arg: unknown) => Promise<void>)('mcp:definitions:paths', paths)
    expect(paths.tools).toEqual([])
  })

  it('leaves the rest of the surface intact', async () => {
    const nuxt = getNuxt()
    expect(nuxt.options.runtimeConfig.public.backend).toMatchObject({ pages: { login: '/login' } })
    expect(nuxt.options.css).toContain(join(runtimeDir, 'vue/components/ui.css'))
    expect((await extendPages(nuxt)).map(page => page.path)).toEqual(DEFAULT_PAGES.map(page => page.path))
  })
})

describe('pages: false', () => {
  const getNuxt = useBoot({ backend: { pages: false } })

  it('publishes every page path as empty and mounts nothing', async () => {
    const nuxt = getNuxt()
    expect(nuxt.options.runtimeConfig.public.backend).toEqual({
      pages: { login: '', pricing: '', settings: '', profile: '', security: '', acceptInvitation: '' },
    })
    expect(await extendPages(nuxt)).toEqual([])
    // Nothing else in the fixture registers a page, so Nuxt routing stays off.
    expect(pagesEnabled(nuxt)).toBe(false)
  })

  it('forwards no login path to the auth middleware (the app must provide one)', () => {
    expect(dependencyOptions(getNuxt()).convex?.betterAuth?.loginPath).toBeUndefined()
  })
})

describe('loginPath with a disabled login page and a custom pricing path', () => {
  const getNuxt = useBoot({ backend: { loginPath: '/signin', pages: { login: false, pricing: '/plans/' } } })

  it('forwards the explicit login path to the auth middleware', () => {
    expect(dependencyOptions(getNuxt()).convex?.betterAuth?.loginPath).toBe('/signin')
  })

  it('mounts the remaining pages, the string path normalized', async () => {
    const nuxt = getNuxt()
    expect(nuxt.options.runtimeConfig.public.backend).toMatchObject({ pages: { login: '', pricing: '/plans' } })
    const pages = await extendPages(nuxt)
    expect(pages.map(page => page.path)).toEqual(['/plans', '/settings', '/profile', '/security', '/accept-invitation'])
    expect(pages.find(page => page.path === '/plans')).toMatchObject({ name: 'backend-pricing', file: join(runtimeDir, 'vue/pages/pricing') })
  })
})

describe('option forwarding through moduleDependencies', () => {
  const url = 'https://example.convex.cloud'
  const siteUrl = 'https://example.convex.site'
  // Any existing file: the base module validates a custom auth client path.
  const authClient = join(fixtureDir, 'backend/auth.ts')
  const getNuxt = useBoot({
    backend: { url, siteUrl, authRoute: '/api/session', mcp: { route: '/agent/', name: 'Agent' } },
    convex: { betterAuth: { authClient } },
  })

  it('forwards url/siteUrl/authRoute as defaults and keeps a user betterAuth object', () => {
    expect(dependencyOptions(getNuxt()).convex).toEqual({
      url,
      siteUrl,
      authRoute: '/api/session',
      betterAuth: { authClient, loginPath: '/login' },
      polar: true,
      clerk: false,
      auth0: false,
    })
  })

  it('forwards the MCP route (trailing slash trimmed) and name to the toolkit', () => {
    const nuxt = getNuxt()
    expect(dependencyOptions(nuxt).mcp).toEqual({ route: '/agent', name: 'Agent' })
    expect(nuxt.options.runtimeConfig.backendMcp).toMatchObject({ route: '/agent', authBase: '/api/session' })
    const routeRules = nuxt.options.nitro.routeRules ?? {}
    expect(routeRules['/agent']).toEqual(MCP_RELAXATION)
    expect(routeRules['/agent/**']).toEqual(MCP_RELAXATION)
    expect(routeRules['/mcp']).toBeUndefined()
  })
})

describe('installation: local', () => {
  // The local template set has files the fixture lacks (components/backend/*),
  // so a scaffold pass leaking into a non-dev boot would show up in the listing.
  const getNuxt = useBoot({ backend: { installation: 'local' } })

  it('changes nothing at registration time — the mode only steers scaffolding', async () => {
    const nuxt = getNuxt()
    expect(dependencyOptions(nuxt).backend?.installation).toBe('local')
    expect(nuxt.options.alias['#backend']).toBe(join(nuxt.options.rootDir, 'backend'))
    expect(existsSync(join(fixtureDir, 'backend/components'))).toBe(false)
    expect((await extendPages(nuxt)).map(page => page.path)).toEqual(DEFAULT_PAGES.map(page => page.path))
    expect(nuxt.options.runtimeConfig.backendMcp).toBeDefined()
  })
})

describe('css: false', () => {
  const getNuxt = useBoot({ backend: { css: false } })

  it('leaves the stylesheet out and the rest in', async () => {
    const nuxt = getNuxt()
    expect(nuxt.options.css.filter(entry => entry.startsWith(runtimeDir))).toEqual([])
    expect((await extendComponents(nuxt)).map(component => component.pascalName).sort()).toEqual([...COMPONENT_NAMES].sort())
  })
})

describe('devtools: false', () => {
  const getNuxt = useBoot({ backend: { devtools: false } })

  it('registers no DevTools bridge plugin (nor does the default outside dev)', () => {
    expect(ourPlugins(getNuxt())).toEqual([])
  })
})

// Dev boots: the module's dev-only work (scaffold, preflight, env
// auto-provision) keys off `nuxt.options._prepare` (`nuxi prepare`) and
// `nuxt.options.test` (set by @nuxt/test-utils, and resolved from the
// vitest/NODE_ENV=test markers by the schema). Each flag alone must keep the
// scaffolder out of the app — the zero-write sentinel in `useBoot` is the
// assertion; these suites add the DevTools registration the flags do not gate.
describe('dev boot under nuxi prepare (_prepare: true, test: false)', () => {
  const getNuxt = useBoot({ _prepare: true, test: false }, { dev: true })

  it('registers the DevTools bridge plugin (dev-only, client-side)', () => {
    const nuxt = getNuxt()
    expect(nuxt.options.dev).toBe(true)
    expect(nuxt.options.test).toBe(false)
    const plugins = nuxt.options.plugins.filter(entry => typeof entry !== 'string' && entry.src.startsWith(runtimeDir))
    expect(plugins).toHaveLength(1)
    const [plugin] = plugins as Array<{ src: string, mode?: string }>
    // Nuxt resolves the registered path to the file (`plugin.client.ts`).
    expect(plugin!.mode).toBe('client')
    expect(plugin!.src).toMatch(/[\\/]devtools[\\/]plugin\.client(\.ts)?$/)
    expect(existsWithExtension(plugin!.src), plugin!.src).toBe(true)
  })
})

describe('dev boot under a test runner (test: true) with devtools: false', () => {
  const getNuxt = useBoot({ test: true, backend: { devtools: false } }, { dev: true })

  it('boots in dev with the test flag and skips the DevTools bridge', () => {
    const nuxt = getNuxt()
    expect(nuxt.options.dev).toBe(true)
    expect(nuxt.options.test).toBe(true)
    expect(ourPlugins(nuxt)).toEqual([])
  })
})
