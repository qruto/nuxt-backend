import { existsSync, readdirSync, statSync } from 'node:fs'
import { posix, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadNuxt, nuxtCtx } from '@nuxt/kit'
import type { Nuxt, NuxtHooks, NuxtPage } from '@nuxt/schema'
import { defu } from 'defu'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { BACKEND_MCP_SCOPES, DEFAULT_MCP_EXCHANGE_PATH } from '../../src/convex/constants'
import { backendAppConfigDefaults } from '../../src/runtime/config'

// Module registration against a real Nuxt instance: `loadNuxt` with
// `ready: true` runs `nuxt.ready()` — config resolution, module installation
// (this module, its `moduleDependencies`, and Nuxt's core modules), and the
// Nitro config pass — without building anything. Everything the module
// contributes is then visible on `nuxt.options`, on the resolved Nitro
// options, or through the hooks the kit helpers registered.

// `/`-separated, like the paths kit's resolver registers, so the prefix and
// equality checks below hold on Windows too (`join` there would give `\\`).
const { join, relative } = posix
/** A path as `/`-separated: kit's resolver already registers them that way; `path.join` on Windows does not. */
const posixPath = (path: string): string => path.split(sep).join('/')
const repoRoot = posixPath(fileURLToPath(new URL('../..', import.meta.url))).replace(/\/$/, '')
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
    betterAuth?: { authClient?: string, loginPath?: string, crossDomainCallbackRoute?: string }
    polar?: boolean
    clerk?: boolean
    auth0?: boolean
    devScript?: boolean
  }
  mcp?: { route?: string, name?: string, description?: string, instructions?: string, sessions?: boolean }
}

interface NitroImport { name: string, as?: string, from: string }

/** The Nitro instance `initNuxt` creates during `ready()` (config only, no build). */
interface NitroView {
  _nitro?: { options: { imports: { imports: NitroImport[] }, routeRules: Record<string, Record<string, unknown>> } }
}

/** The private pages' default paths: behind the `auth` middleware, out of indexes and caches. */
const PRIVATE_PATHS = ['/accept-invitation', '/oauth/consent', '/profile', '/security', '/settings']

const COMPONENT_NAMES = [
  'AuthForm',
  'RoleBoundary',
  'OrganizationBoundary',
  'FeatureBoundary',
  'AcceptInvitation',
  'AgentConsent',
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
  'useBackendClient',
  'useLoginFlow',
  'useEmailChange',
  'useOrganization',
  'useSearch',
  'useAggregate',
  'useBilling',
  'useFeatures',
  'useCredits',
  'useOrders',
  'useUsage',
  'useGifts',
  'usePasskeys',
  'useSessions',
  'useAgentConsent',
  'describeUserAgent',
  'unwrapAuth',
  'getBackendError',
  'useBackendConfig',
  'useEmailStatus',
  'useSandboxInbox',
  'useWorkflowStatus',
  'useAiStream',
]

/** In the registry's order: its page files sorted by name. */
const DEFAULT_PAGES = [
  { name: 'backend-accept-invitation', path: '/accept-invitation', file: 'vue/pages/accept-invitation', meta: { middleware: 'auth' } },
  { name: 'backend-agent-consent', path: '/oauth/consent', file: 'vue/pages/agent-consent', meta: { middleware: 'auth' } },
  { name: 'backend-login', path: '/login', file: 'vue/pages/login', meta: undefined },
  { name: 'backend-pricing', path: '/pricing', file: 'vue/pages/pricing', meta: undefined },
  { name: 'backend-profile', path: '/profile', file: 'vue/pages/profile', meta: { middleware: 'auth' } },
  { name: 'backend-security', path: '/security', file: 'vue/pages/security', meta: { middleware: 'auth' } },
  { name: 'backend-settings', path: '/settings', file: 'vue/pages/settings', meta: { middleware: 'auth' } },
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
 * sentinel. `node_modules/` and `.nuxt/` are Nuxt's own territory (the jiti
 * transform cache and the chrome-workspace id land in the first on every
 * boot, and since Nuxt 4.6 a dev boot writes its generated `app-secret` into
 * the second), so they are the subtrees the comparison ignores.
 */
function snapshotFixture(dir = fixtureDir): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.name !== 'node_modules' && entry.name !== '.nuxt')
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

/** The route rules as Nitro normalized them (`swr: 60` also reads `cache: { swr: true, maxAge: 60 }`). */
function nitroRouteRules(nuxt: Nuxt): Record<string, Record<string, unknown>> {
  const { _nitro } = nuxt as unknown as NitroView
  expect(_nitro, 'Nitro is initialised during ready()').toBeDefined()
  return _nitro!.options.routeRules
}

/** The text of a template a module added, as Nuxt would write it. */
async function templateContents(nuxt: Nuxt, filename: string): Promise<string> {
  const template = nuxt.options.build.templates.find(entry => entry.filename === filename)
  expect(template?.getContents, filename).toBeDefined()
  return template!.getContents!({ nuxt, app: {} as never, options: template!.options ?? {} })
}

/**
 * The error a boot with these overrides stops with. The half-made instance
 * holds Nuxt's global context until it is closed, so close it.
 */
async function bootError(overrides: Record<string, unknown>): Promise<Error> {
  try {
    const nuxt = await loadNuxt({ cwd: fixtureDir, dev: false, ready: true, overrides: { telemetry: false, ...overrides } as Overrides })
    await nuxt.close()
  }
  catch (error) {
    await nuxtCtx.tryUse()?.close()
    return error as Error
  }
  throw new Error(`booted with ${JSON.stringify(overrides)}`)
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

type RegisteredMiddleware = Array<{ name: string, path: string, global?: boolean }>

/** Route middleware lands on the app through `app:resolve`; read it with an empty collector. */
async function resolveMiddleware(nuxt: Nuxt): Promise<RegisteredMiddleware> {
  const app = { middleware: [] as RegisteredMiddleware }
  await nuxt.callHook('app:resolve', app as never)
  return app.middleware
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

  it('installs nuxt-security ahead of the base module, which then finds it registered', () => {
    const names = installedModuleNames(getNuxt())
    expect(names).toContain('nuxt-security')
    expect(names.indexOf('nuxt-security')).toBeLessThan(names.indexOf('nuxt-convex-module'))
  })

  it('resolves the module by package name and installs its dependencies', () => {
    const nuxt = getNuxt()
    const entry = nuxt.options._installedModules.find(module => module.meta.name === 'nuxt-backend')
    expect(entry?.entryPath).toBe(join(repoRoot, 'src/module.ts'))
    expect(installedModuleNames(nuxt)).toEqual(expect.arrayContaining(['nuxt-convex-module', '@nuxtjs/mcp-toolkit']))
  })

  it('registers the #backend/* aliases for Vite and Nitro, specific entries first', () => {
    const nuxt = getNuxt()
    // The aliases are built with the platform's `path.join` (backslashes on
    // Windows), so both sides are compared in posix form.
    const backendDir = join(posixPath(nuxt.options.rootDir), 'backend')
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
      expect(Object.fromEntries(keys.map(key => [key, posixPath(aliases[key]!)]))).toEqual(expected)
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
        agentConsent: '/oauth/consent',
      },
      authRoute: '/api/auth',
    })
    expect(runtimeConfig.backendMcp).toEqual({
      route: '/mcp',
      authBase: '/api/auth',
      exchangePath: DEFAULT_MCP_EXCHANGE_PATH,
      scopes: [...BACKEND_MCP_SCOPES],
      functions: {},
    })
    expect((runtimeConfig.public as Record<string, unknown>).backendMcp).toBeUndefined()
  })

  it('merges the appConfig.backend defaults', () => {
    expect(getNuxt().options.appConfig.backend).toEqual(backendAppConfigDefaults)
  })

  it('adds the neutral stylesheet first, exactly once', () => {
    // First in line, so its `@layer` order statement leads (ui.css), and an
    // app's own rules come after it.
    const uiCss = join(runtimeDir, 'vue/components/ui.css')
    expect(existsSync(uiCss)).toBe(true)
    expect(getNuxt().options.css[0]).toBe(uiCss)
    expect(getNuxt().options.css.filter(entry => entry === uiCss)).toHaveLength(1)
  })

  it('adds the generated theme stylesheet right after it, with the light-dark default', async () => {
    // An app with neither Nuxt UI nor color-mode gets it too: the default
    // keeps every rewritten light-dark() valid in a production build.
    const nuxt = getNuxt()
    expect(nuxt.options.css[1]).toMatch(/[\\/]nuxt-backend[\\/]theme-bridge\.css$/)
    const css = await templateContents(nuxt, 'nuxt-backend/theme-bridge.css')
    expect(css).toContain('@layer theme.backend {\n  :where(:root) {\n    --lightningcss-light: initial;\n    --lightningcss-dark: ;\n  }\n}')
    expect(css).not.toContain('@layer components.backend')
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

  it('gets the base module\'s Nuxt 4.6 build fix: one Convex copy for Vite', () => {
    // nuxt-convex-module 0.11+ dedupes `convex`, without which a Nuxt 4.6
    // production server fails every request with ERR_MODULE_NOT_FOUND.
    expect(getNuxt().options.vite.resolve?.dedupe).toContain('convex')
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

  it('aliases the base module\'s brand-named components under neutral names, and hides the originals', async () => {
    // <BillingCheckoutLink> / <BillingPortalLink> are the base module's
    // <CheckoutLink> / <CustomerPortalLink>, and <StorageImage> its
    // <ConvexImage> — same files, same exports — so an app's surface never
    // says a platform's or a provider's name. They live outside the runtime
    // dir, hence the unfiltered hook here.
    const components: ExtendedComponents = []
    await getNuxt().callHook('components:extend', components)
    const byName = (name: string) => components.find(component => component.pascalName === name)
    const aliases = [
      ['BillingCheckoutLink', 'CheckoutLink', /[\\/]runtime[\\/]polar[\\/]vue[\\/]components(\.m?js|\.ts)?$/],
      ['BillingPortalLink', 'CustomerPortalLink', /[\\/]runtime[\\/]polar[\\/]vue[\\/]components(\.m?js|\.ts)?$/],
      ['StorageImage', 'ConvexImage', /[\\/]runtime[\\/]vue[\\/]components[\\/]convex-image(\.m?js|\.ts)?$/],
    ] as const
    for (const [alias, upstream, file] of aliases) {
      const component = byName(alias)
      expect(component, alias).toBeDefined()
      expect(component!.export).toBe(upstream)
      expect(component!.filePath).toMatch(/[\\/]nuxt-convex-module[\\/](dist|src)[\\/]/)
      expect(component!.filePath).toMatch(file)
      expect(existsWithExtension(component!.filePath), component!.filePath).toBe(true)
      expect(byName(upstream), `${upstream} is hidden`).toBeUndefined()
    }
    // The base module's neutral components stay.
    expect(byName('Authenticated')).toBeDefined()
  })

  it('hides every brand-named auto-import, component, middleware and Nitro import of the base module', async () => {
    const nuxt = getNuxt()
    const brand = /convex|betterauth|polar|resend/i
    const imports = await extendImports(nuxt)
    const components: ExtendedComponents = []
    await nuxt.callHook('components:extend', components)
    const middleware = await resolveMiddleware(nuxt)
    expect({
      imports: imports.map(entry => entry.as ?? entry.name).filter(name => brand.test(name)),
      components: components.map(component => component.pascalName).filter(name => brand.test(name) || ['CheckoutLink', 'CustomerPortalLink'].includes(name)),
      middleware: middleware.map(entry => entry.name).filter(name => brand.test(name)),
      server: nitroImports(nuxt).map(entry => entry.as ?? entry.name).filter(name => brand.test(name)),
    }).toEqual({ imports: [], components: [], middleware: [], server: [] })
    // The neutral data composables the base module registers stay.
    expect(imports.map(entry => entry.name)).toEqual(expect.arrayContaining(['useQuery', 'useMutation', 'useAction', 'usePaginatedQuery', 'useStorageUrl']))
  })

  it('registers every component, each pointing at an existing file', async () => {
    const components = await extendComponents(getNuxt())
    expect(components.map(component => component.pascalName).sort()).toEqual([...COMPONENT_NAMES].sort())
    for (const component of components) {
      expect(component.export).toBe(component.pascalName)
      expect(existsWithExtension(component.filePath), component.filePath).toBe(true)
    }
  })

  it('registers the composable set; useAuth is ours alone', async () => {
    const imports = await extendImports(getNuxt())
    const ours = imports.filter(entry => entry.from.startsWith(runtimeDir))
    expect(ours.map(entry => entry.name).sort()).toEqual([...COMPOSABLE_NAMES].sort())
    for (const entry of ours) {
      expect(existsWithExtension(entry.from), entry.from).toBe(true)
    }
    expect(imports.filter(entry => entry.name === 'useAuth').map(entry => entry.from)).toEqual([join(runtimeDir, 'vue/composables/use-auth')])
    // The imperative client: the base module's `useConvex` under its neutral name.
    expect(imports.find(entry => entry.name === 'useBackendClient')?.from).toBe(join(runtimeDir, 'vue/composables/base-aliases'))
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

  it('mounts the seven pages, the private ones behind the auth middleware', async () => {
    const nuxt = getNuxt()
    // No `pages/` dir in the fixture: the module's pages alone switch routing on.
    expect(pagesEnabled(nuxt)).toBe(true)
    const pages = await extendPages(nuxt)
    expect(pages.map(({ name, path, file, meta }) => ({ name, path, file, meta }))).toEqual(DEFAULT_PAGES)
    for (const page of pages) {
      expect(existsWithExtension(page.file!), page.file).toBe(true)
    }
  })

  it('registers the neutral `auth` middleware over the base module\'s guard file, in place of `convex-auth`', async () => {
    const middleware = await resolveMiddleware(getNuxt())
    const auth = middleware.find(entry => entry.name === 'auth')
    // The base module registers the same file as `convex-auth`; the neutral
    // name is this package's promise (STABILITY.md), the one implementation
    // stays the base module's, and the brand-named registration is hidden.
    expect(auth).toMatchObject({ name: 'auth', global: false })
    expect(auth!.path).toMatch(/[\\/]nuxt-convex-module[\\/](dist|src)[\\/]runtime[\\/]better-auth[\\/]nuxt[\\/]middleware(\.m?js|\.ts)?$/)
    expect(existsWithExtension(auth!.path), auth!.path).toBe(true)
    expect(middleware.map(entry => entry.name)).not.toContain('convex-auth')
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

describe('page route rules', () => {
  const privateRules = {
    prerender: false,
    cache: false,
    swr: false,
    isr: false,
    robots: false,
    sitemap: false,
    headers: { 'cache-control': 'private, no-store' },
  }

  describe('with the defaults', () => {
    const getNuxt = useBoot()

    it('keeps the private pages out of indexes, sitemaps and caches, and prerenders no page', () => {
      const routeRules = getNuxt().options.routeRules ?? {}
      for (const path of ['/settings', '/profile', '/security', '/accept-invitation']) {
        expect(routeRules[path], path).toEqual(privateRules)
      }
      expect(routeRules['/oauth/consent']).toMatchObject({ ...privateRules, headers: { 'cache-control': 'private, no-store' } })
      expect(routeRules['/login']).toEqual({ prerender: false })
      expect(routeRules['/pricing']).toEqual({ prerender: false })
    })

    it('keeps the consent page out of frames and its URL out of referrers, with or without nuxt-security', () => {
      expect(getNuxt().options.routeRules?.['/oauth/consent']).toMatchObject({
        headers: { 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' },
        security: { headers: { referrerPolicy: 'no-referrer', xFrameOptions: 'DENY', contentSecurityPolicy: { 'frame-ancestors': '\'none\'' } } },
      })
    })
  })

  describe('with a custom path and a rule of the app\'s own', () => {
    const getNuxt = useBoot({
      backend: { pages: { profile: '/me' } },
      routeRules: { '/security': { robots: true } },
    })

    it('follows the path and lets the app\'s keys win', () => {
      const routeRules = getNuxt().options.routeRules ?? {}
      expect(routeRules['/me']).toEqual(privateRules)
      expect(routeRules['/profile']).toBeUndefined()
      expect(routeRules['/security']).toEqual({ ...privateRules, robots: true })
    })
  })

  describe('with an app-wide cache rule', () => {
    // The module logs through consola, which writes to the process streams.
    const written: string[] = []
    const streams: Array<{ mockRestore: () => void }> = []
    beforeAll(() => {
      for (const stream of [process.stdout, process.stderr]) {
        streams.push(vi.spyOn(stream, 'write').mockImplementation((chunk: string | Uint8Array) => {
          written.push(String(chunk))
          return true
        }))
      }
    })
    const getNuxt = useBoot({ routeRules: { '/**': { swr: 60, isr: 60 } } })
    afterAll(() => {
      for (const stream of streams) stream.mockRestore()
    })

    it('keeps every private page out of the caches, as Nitro applies the normalized rules', () => {
      const rules = nitroRouteRules(getNuxt())
      // The app's rule as Nitro reads it: `swr` became a cache entry.
      expect(rules['/**']).toMatchObject({ swr: 60, isr: 60, cache: { swr: true, maxAge: 60 } })
      for (const path of PRIVATE_PATHS) {
        // At a request, Nitro merges every rule that matches the path, the
        // most specific first (defu); at build time, a path whose `cache` is
        // off under a cached wildcard gets a renderer of its own, uncached.
        expect(defu({}, rules[path], rules['/**']), path).toMatchObject({
          cache: false,
          swr: false,
          isr: false,
          headers: { 'cache-control': 'private, no-store' },
        })
      }
      // A public page keeps the app's cache.
      expect(defu({}, rules['/pricing'], rules['/**'])).toMatchObject({ cache: { swr: true, maxAge: 60 }, isr: 60 })
    })

    it('warns once that the rule reaches the private pages, which are exempt at their exact paths only', () => {
      const warnings = written.join('').split('\n').filter(line => line.includes('A wildcard cache rule covers the private pages'))
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain(`\`routeRules['/**']\` (swr, isr) covers ${PRIVATE_PATHS.join(', ')}`)
    })
  })
})

describe('options 0.2 removed', () => {
  // Refused in `moduleDependencies`, which Nuxt runs before any module's
  // setup: nothing reads them, and nothing is written.
  it.each([
    ['pages turned off', { pages: false }, '`backend.pages` is `false`.'],
    ['a page turned off', { pages: { profile: false } }, '`backend.pages.profile` is `false`.'],
    ['a page turned on', { pages: { pricing: true } }, '`backend.pages.pricing` is `true`.'],
    ['loginPath', { loginPath: '/sign-in' }, '`loginPath` is gone.'],
    ['css', { css: false }, '`css` is gone.'],
  ])('stop the boot with a named error: %s', async (_name, backend, problem) => {
    const before = snapshotFixture()
    const error = await bootError({ backend })
    expect(error.name).toBe('BackendOptionsError')
    expect(error.message).toContain(problem)
    expect(error.message).toContain('https://nuxt-backend.dev/docs/ship/migrate/upgrade#pages-the-stylesheet-and-the-webhook-log-are-always-on')
    expect(snapshotFixture()).toEqual(before)
  })
})

describe('with @nuxtjs/color-mode installed with options of its own', () => {
  // Passed inline, as Nuxt UI 3 passes `classSuffix: ''`: they never show in
  // `nuxt.options.colorMode`, only in the options color-mode renders for its
  // runtime, which is where the theme stylesheet reads its class.
  const getNuxt = useBoot({ modules: [['@nuxtjs/color-mode', { classSuffix: '-theme' }]] })

  it('follows the class it puts on <html>, and the nearest one around the components', async () => {
    const nuxt = getNuxt()
    expect((nuxt.options as { colorMode?: { classSuffix?: string } }).colorMode?.classSuffix).toBeUndefined()
    const css = await templateContents(nuxt, 'nuxt-backend/theme-bridge.css')
    expect(css).toContain(':where(html.dark-theme) :where(')
    expect(css).toContain('@scope (.dark-theme) {')
    expect(css).toContain(':where(html.light-theme) :where(')
    expect(css).toContain('@scope (.light-theme) {')
    // No Nuxt UI here: the neutrals stay the package's.
    expect(css).not.toContain('--bk-muted')
  })
})

describe('custom login and pricing paths', () => {
  const getNuxt = useBoot({ backend: { pages: { login: '/signin', pricing: '/plans/' } } })

  it('sends the auth middleware to the sign-in page\'s path', () => {
    expect(dependencyOptions(getNuxt()).convex?.betterAuth?.loginPath).toBe('/signin')
  })

  it('mounts every page, the string paths normalized', async () => {
    const nuxt = getNuxt()
    expect(nuxt.options.runtimeConfig.public.backend).toMatchObject({ pages: { login: '/signin', pricing: '/plans' } })
    const pages = await extendPages(nuxt)
    expect(pages.map(page => page.path).sort()).toEqual(['/accept-invitation', '/oauth/consent', '/plans', '/profile', '/security', '/settings', '/signin'])
    expect(pages.find(page => page.path === '/plans')).toMatchObject({ name: 'backend-pricing', file: join(runtimeDir, 'vue/pages/pricing') })
  })
})

describe('option forwarding through moduleDependencies', () => {
  const url = 'https://example.convex.cloud'
  const siteUrl = 'https://example.convex.site'
  // Any existing file: the base module validates a custom auth client path.
  const authClient = join(fixtureDir, 'backend/auth.ts')
  const getNuxt = useBoot({
    backend: { url, siteUrl, authRoute: '/api/session', mcp: { route: '/agent/', name: 'Agent', description: 'Account tools', instructions: 'Ask before buying.', sessions: true } },
    convex: { betterAuth: { authClient } },
  })

  it('forwards url/siteUrl/authRoute as defaults and keeps a user betterAuth object', () => {
    expect(dependencyOptions(getNuxt()).convex).toEqual({
      url,
      siteUrl,
      authRoute: '/api/session',
      security: true,
      devScript: false,
      betterAuth: { authClient, loginPath: '/login' },
      polar: true,
      clerk: false,
      auth0: false,
    })
  })

  it('forwards the MCP route (trailing slash trimmed) and the server options to the toolkit', () => {
    const nuxt = getNuxt()
    expect(dependencyOptions(nuxt).mcp).toEqual({ route: '/agent', name: 'Agent', description: 'Account tools', instructions: 'Ask before buying.', sessions: true })
    expect(nuxt.options.runtimeConfig.backendMcp).toMatchObject({ route: '/agent', authBase: '/api/session' })
    const routeRules = nuxt.options.nitro.routeRules ?? {}
    expect(routeRules['/agent']).toEqual(MCP_RELAXATION)
    expect(routeRules['/agent/**']).toEqual(MCP_RELAXATION)
    expect(routeRules['/mcp']).toBeUndefined()
  })
})

describe('a user convex.devScript', () => {
  // The default is off (see src/module.ts); an app that wants the base
  // module's combined `convex dev --start` script can still ask for it.
  const getNuxt = useBoot({ convex: { devScript: true } })

  it('wins over the forwarded default', () => {
    expect(dependencyOptions(getNuxt()).convex?.devScript).toBe(true)
  })
})

describe('a user betterAuth object without an authClient', () => {
  const getNuxt = useBoot({ convex: { betterAuth: { crossDomainCallbackRoute: '/cb' } } })

  it('keeps the bundled auth client and login path beside the user options', () => {
    expect(dependencyOptions(getNuxt()).convex?.betterAuth).toEqual({
      authClient: join(runtimeDir, 'vue/auth-client'),
      loginPath: '/login',
      crossDomainCallbackRoute: '/cb',
    })
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
  // A type check cannot see a component name in a template, so in development
  // the hidden names render their replacement and warn (test/unit/brand-names.test.ts).
  it('keeps the hidden component names as warning stand-ins, in place of the base module\'s', async () => {
    const components: ExtendedComponents = []
    await getNuxt().callHook('components:extend', components)
    const standIns = components
      .filter(component => ['ConvexImage', 'CheckoutLink', 'CustomerPortalLink'].includes(component.pascalName))
      .map(({ pascalName, export: name, filePath }) => ({ pascalName, export: name, filePath }))
    expect(standIns).toStrictEqual([
      { pascalName: 'CheckoutLink', export: 'CheckoutLink', filePath: join(runtimeDir, 'vue/components/renamed-billing-links') },
      { pascalName: 'CustomerPortalLink', export: 'CustomerPortalLink', filePath: join(runtimeDir, 'vue/components/renamed-billing-links') },
      { pascalName: 'ConvexImage', export: 'ConvexImage', filePath: join(runtimeDir, 'vue/components/renamed-storage-image') },
    ])
    for (const { filePath } of standIns) expect(existsWithExtension(filePath), filePath).toBe(true)
  })
})

describe('dev boot under a test runner (test: true), DevTools left on', () => {
  const getNuxt = useBoot({ test: true }, { dev: true })

  it('skips the DevTools bridge: nothing opens a panel under a test runner', () => {
    const nuxt = getNuxt()
    expect(nuxt.options.dev).toBe(true)
    expect(nuxt.options.test).toBe(true)
    expect(ourPlugins(nuxt)).toEqual([])
  })

  // `updateTemplates` re-renders through `builder:generateApp`; nothing
  // listens to it before a build, so the filters it is called with are the
  // whole observable effect. The base module watches the same codegen path for
  // its own fallback, so the check is that one of the filters picks ours.
  it('re-renders the #backend type fallback when codegen writes _generated/api, on either separator', async () => {
    const nuxt = getNuxt()
    const fallback = { filename: 'types/nuxt-backend-api-fallback.d.ts' }
    const rendersFallback = async (path: string): Promise<boolean> => {
      const filters: Array<(template: typeof fallback) => boolean> = []
      const unhook = nuxt.hook('builder:generateApp', (options) => {
        if (options?.filter) filters.push(options.filter as (template: typeof fallback) => boolean)
      })
      await nuxt.callHook('builder:watch', 'change', path)
      unhook()
      return filters.some(filter => filter(fallback))
    }

    expect(await rendersFallback('backend/_generated/api.d.ts')).toBe(true)
    expect(await rendersFallback('backend\\_generated\\api.d.ts')).toBe(true)
    expect(await rendersFallback('backend/todos.ts')).toBe(false)
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
