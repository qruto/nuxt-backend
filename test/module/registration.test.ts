import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { posix, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadNuxt, nuxtCtx, runWithNuxtContext } from '@nuxt/kit'
import type { Nuxt, NuxtHooks, NuxtPage } from '@nuxt/schema'
import { defu } from 'defu'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { lazily, lazyComponentModule } from '../../src/nuxt/registry'
import { backendAppConfigDefaults } from '../../src/runtime/config'
import { UI_PARTS } from '../../src/ui/registry'
import { COMPONENT_CONTRACT, CONTRACT_EXEMPT } from '../nuxt/component-contract'

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
}

interface NitroImport { name: string, as?: string, from: string }

/** The Nitro instance `initNuxt` creates during `ready()` (config only, no build). */
interface NitroView {
  _nitro?: { options: { imports: { imports: NitroImport[] }, routeRules: Record<string, Record<string, unknown>> } }
}

/**
 * The components heavy enough to load on first render (CONTRIBUTING,
 * "Budgets"), named before they exist: each is registered through
 * `lazily`, and every other component with its page.
 */
const HEAVY_COMPONENTS = new Set(['ChatThread', 'UploadInput', 'AdminUsers', 'AdminWorkspaces'])

/** The private pages' default paths: behind the page guard, out of indexes and caches. */
const PRIVATE_PATHS = ['/accept-invitation', '/admin', '/gifts', '/profile', '/security', '/settings']

const COMPOSABLE_NAMES = [
  'useAuth',
  'useConnectionState',
  'useBackendClient',
  'useLoginFlow',
  'useEmailChange',
  'useWorkspace',
  'useSearch',
  'useBilling',
  'useFeatures',
  'useCredits',
  'usePricing',
  'usePushSubscription',
  'useCampaign',
  'useOrders',
  'useUsage',
  'useGifts',
  'useReferrals',
  'useReferralAdmin',
  'usePasskeys',
  'useSessions',
  'useReauthentication',
  'useAuditLog',
  'useAccount',
  'useConsents',
  'useAdmin',
  'useFlag',
  'useFlagAdmin',
  'useAccessPhase',
  'useInvite',
  'useAccessAdmin',
  'useWaitlist',
  'useWaitlistAdmin',
  'getBackendError',
  'useBackendConfig',
  'useLabels',
  'useBackendPagePath',
  'useReturnPath',
  'useEmailStatus',
  'useExperiment',
  'useSandboxInbox',
  'useWorkflowStatus',
  'useAiStream',
  'useJob',
  'useChat',
  'useAiLabel',
  'useHumanCheck',
  'useShareLink',
  'useUploadField',
  'useNotifications',
  'useNotificationInbox',
  'useEmailPreferences',
  'useAnnouncements',
  'useAnnouncementsAdmin',
  'useContactForm',
  'useInboxAdmin',
  'useOnboarding',
  'useActivation',
  'useAppShell',
]

/** In the registry's order: its page files sorted by name. */
const DEFAULT_PAGES = [
  { name: 'backend-accept-invitation', path: '/accept-invitation', file: 'vue/pages/accept-invitation', meta: { auth: true } },
  { name: 'backend-accessibility', path: '/legal/accessibility', file: 'vue/pages/accessibility', meta: undefined },
  // The admin console asks the page guard for the admin role, and is hidden: anyone else gets a 404. A sign-in comes with any rule.
  { name: 'backend-admin', path: '/admin', file: 'vue/pages/admin', meta: { auth: { role: 'admin', hidden: true } } },
  { name: 'backend-gifts', path: '/gifts', file: 'vue/pages/gifts', meta: { auth: true } },
  { name: 'backend-invite', path: '/invite', file: 'vue/pages/invite', meta: undefined },
  { name: 'backend-keep-account', path: '/account/keep', file: 'vue/pages/keep-account', meta: undefined },
  { name: 'backend-login', path: '/login', file: 'vue/pages/login', meta: undefined },
  { name: 'backend-pricing', path: '/pricing', file: 'vue/pages/pricing', meta: undefined },
  { name: 'backend-privacy', path: '/legal/privacy', file: 'vue/pages/privacy', meta: undefined },
  { name: 'backend-profile', path: '/profile', file: 'vue/pages/profile', meta: { auth: true } },
  { name: 'backend-referral', path: '/r/:code', file: 'vue/pages/referral', meta: undefined },
  { name: 'backend-report', path: '/report', file: 'vue/pages/report', meta: undefined },
  { name: 'backend-security', path: '/security', file: 'vue/pages/security', meta: { auth: true } },
  { name: 'backend-settings', path: '/settings', file: 'vue/pages/settings', meta: { auth: true } },
  { name: 'backend-subprocessors', path: '/legal/subprocessors', file: 'vue/pages/subprocessors', meta: undefined },
  { name: 'backend-terms', path: '/legal/terms', file: 'vue/pages/terms', meta: undefined },
  { name: 'backend-unsubscribe', path: '/unsubscribe', file: 'vue/pages/unsubscribe', meta: undefined },
  { name: 'backend-waitlist', path: '/waitlist', file: 'vue/pages/waitlist', meta: undefined },
  { name: 'backend-welcome', path: '/welcome', file: 'vue/pages/welcome', meta: { auth: true } },
].map(page => ({ ...page, file: join(runtimeDir, `${page.file}.vue`) }))

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
    // .nuxtrc is Nuxt's own record of each module's install (`setups.*`),
    // written by Nuxt once a module has an install step, never by this one.
    .filter(entry => entry.name !== 'node_modules' && entry.name !== '.nuxt' && entry.name !== '.nuxtrc')
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

/** The Nitro plugins the resolved Nitro options hold, the modules' included. */
function nitroPlugins(nuxt: Nuxt): string[] {
  return ((nuxt as unknown as { _nitro?: { options: { plugins: string[] } } })._nitro?.options.plugins ?? []).map(posixPath)
}

function ourPlugins(nuxt: Nuxt): string[] {
  return nuxt.options.plugins
    .map(plugin => typeof plugin === 'string' ? plugin : plugin.src)
    .filter(src => src.startsWith(runtimeDir))
}

/** The DevTools bridge among them: the plugin only a dev boot with a panel gets. */
function devtoolsPlugins(nuxt: Nuxt): string[] {
  return ourPlugins(nuxt).filter(src => /[\\/]devtools[\\/]/.test(src))
}

/** The file a component's code lives in: a lazy one is registered from a generated module, its own file as its declaration. */
const sourceOf = (component: ExtendedComponents[number]): string => posixPath(component.declarationPath ?? component.filePath)

async function extendComponents(nuxt: Nuxt): Promise<ExtendedComponents> {
  const components: ExtendedComponents = []
  await nuxt.callHook('components:extend', components)
  return components.filter(component => sourceOf(component).startsWith(runtimeDir))
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

// The machine running the tests may hold a DSN of its own: no boot reads it
// unless a suite sets one. The SDK is installed here (a dev dependency), so
// the DSN alone decides whether the module wires it.
beforeAll(() => {
  vi.stubEnv('MONITORING_DSN', '')
  vi.stubEnv('SENTRY_DSN', '')
})

afterAll(() => {
  vi.unstubAllEnvs()
})

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
    expect(installedModuleNames(nuxt)).toEqual(expect.arrayContaining(['nuxt-convex-module']))
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
      // The packaged UI's helpers and part types, and the runtime an ejected file imports.
      '#backend/a11y': join(runtimeDir, 'vue/a11y'),
      '#backend/parts': join(runtimeDir, 'vue/parts'),
      '#backend/runtime': join(runtimeDir, 'vue'),
      '#backend': backendDir,
    }
    for (const aliases of [nuxt.options.alias, nuxt.options.nitro.alias ?? {}]) {
      const keys = Object.keys(aliases).filter(key => key.startsWith('#backend'))
      // First-match-wins resolution: `#backend` must trail its sub-aliases.
      expect(keys).toEqual(Object.keys(expected))
      expect(Object.fromEntries(keys.map(key => [key, posixPath(aliases[key]!)]))).toEqual(expected)
    }
  })

  it('publishes the page paths publicly, and no MCP config', () => {
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
        admin: '/admin',
        invite: '/invite',
        keepAccount: '/account/keep',
        unsubscribe: '/unsubscribe',
        gifts: '/gifts',
        referral: '/r/:code',
        report: '/report',
        waitlist: '/waitlist',
        welcome: '/welcome',
        privacy: '/legal/privacy',
        terms: '/legal/terms',
        subprocessors: '/legal/subprocessors',
        accessibility: '/legal/accessibility',
      },
      authRoute: '/api/auth',
      redirects: { afterSignIn: '/' },
      // The inbox is registered: the shell shows its bell.
      notificationInbox: true,
      // Bot protection: BotID only in a build on Vercel, the challenge only with a site key.
      botDetection: false,
      challengeSiteKey: '',
      // No DSN: the browser reports nowhere, and nothing names the service.
      monitoring: { dsn: '', environment: expect.any(String) },
      jobs: false,
      // No reports in setupAdmin: the console has no Reports tab.
      reports: false,
      // No SEO module: the pricing page keeps to its meta description.
      seo: false,
    })
    expect(runtimeConfig.backendHealth).toEqual({ deployment: '' })
    expect(runtimeConfig.backendMcp).toBeUndefined()
    expect((runtimeConfig.public as Record<string, unknown>).backendMcp).toBeUndefined()
  })

  it('merges the appConfig.backend defaults', () => {
    expect(getNuxt().options.appConfig.backend).toEqual(backendAppConfigDefaults)
  })

  it('adds the tokens first, exactly once, then the shared rules and each component\'s stylesheet', () => {
    // First in line, so its `@layer` order statement leads (tokens.css), and
    // an app's own rules come after it.
    const css = getNuxt().options.css.map(posixPath)
    const tokens = join(runtimeDir, 'vue/components/tokens.css')
    expect(css[0]).toBe(tokens)
    expect(css.filter(entry => entry === tokens)).toHaveLength(1)
    expect(css[1]).toBe(join(runtimeDir, 'vue/components/shared.css'))
    // The fixture has a billing catalog (backend/billing.ts): billing's stylesheets load too.
    for (const file of ['auth/AuthForm.css', 'account/ProfileIdentity.css', 'shell/AccessDenied.css', 'billing/PricingPlanCard.css']) {
      expect(css, file).toContain(join(runtimeDir, 'vue/components', file))
    }
    for (const entry of css.filter(entry => entry.startsWith(runtimeDir))) expect(existsSync(entry), entry).toBe(true)
  })

  it('carries the light-dark default in the tokens, below every layer: no generated theme stylesheet', () => {
    const nuxt = getNuxt()
    expect(nuxt.options.css.some(entry => /theme-bridge/.test(entry))).toBe(false)
    const tokens = readFileSync(join(runtimeDir, 'vue/components/tokens.css'), 'utf8')
    expect(tokens).toContain('@layer theme.backend {\n  :where(:root) {\n    --lightningcss-light: initial;\n    --lightningcss-dark: ;\n  }\n}')
  })

  it('gets the base module\'s Nuxt 4.6 build fix: one Convex copy for Vite', () => {
    // nuxt-convex-module 0.11+ dedupes `convex`, without which a Nuxt 4.6
    // production server fails every request with ERR_MODULE_NOT_FOUND.
    expect(getNuxt().options.vite.resolve?.dedupe).toContain('convex')
  })

  it('forwards the auth wiring to nuxt-convex-module, and installs no MCP toolkit', () => {
    const { convex } = dependencyOptions(getNuxt())
    const authClient = join(runtimeDir, 'vue/auth-client')
    expect(existsWithExtension(authClient)).toBe(true)
    expect(convex).toMatchObject({
      betterAuth: { authClient, loginPath: '/login' },
      polar: true,
      clerk: false,
      auth0: false,
    })
    expect((getNuxt().options as unknown as Record<string, unknown>).mcp).toBeUndefined()
  })

  it('mounts the route-matched middleware handlers: the push service worker, the bot check with its proof route, the health route and the visitor\'s address for local pricing, and no dev-only log', () => {
    const handlers = getNuxt().options.serverHandlers.filter(handler => handler.handler.startsWith(runtimeDir))
    expect(handlers.map(handler => ({ handler: handler.handler, middleware: handler.middleware, route: handler.route }))).toEqual([
      { handler: join(runtimeDir, 'server/push-worker'), middleware: undefined, route: '/_backend/push/worker.js' },
      { handler: join(runtimeDir, 'server/protection/gate'), middleware: true, route: undefined },
      { handler: join(runtimeDir, 'server/monitoring/health'), middleware: undefined, route: '/api/backend/health' },
      { handler: join(runtimeDir, 'server/visitor-ip'), middleware: undefined, route: '/api/backend/visitor-ip' },
    ])
    for (const { handler } of handlers) {
      expect(existsWithExtension(handler), handler).toBe(true)
    }
  })

  it('aliases the base module\'s brand-named components under neutral names, and hides the originals', async () => {
    // <StorageImage> is the base module's <ConvexImage> — same file, same
    // export — so an app's surface never says a platform's name. It lives
    // outside the runtime dir, hence the unfiltered hook here.
    const components: ExtendedComponents = []
    await getNuxt().callHook('components:extend', components)
    const byName = (name: string) => components.find(component => component.pascalName === name)
    const aliases = [
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
    // The billing links are the package's own, bound to its checkout and
    // portal; the base module's, which bind by name, are hidden.
    for (const [own, upstream] of [['BillingCheckoutLink', 'CheckoutLink'], ['BillingPortalLink', 'CustomerPortalLink']] as const) {
      expect(byName(own)?.export, own).toBe('default')
      expect(byName(own)?.filePath).toMatch(new RegExp(`[\\\\/]runtime[\\\\/]vue[\\\\/]components[\\\\/]billing[\\\\/]${own}\\.vue$`))
      expect(byName(upstream), `${upstream} is hidden`).toBeUndefined()
    }
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
    // The module's registration is the list; the contract has a row for each
    // name on it, and no row for a name that is not on it.
    const parts = new Set(UI_PARTS.map(part => part.name))
    const registered = components.map(component => component.pascalName).filter(name => !parts.has(name))
    // Every part is registered too, from its own file.
    expect(components.map(component => component.pascalName).filter(name => parts.has(name)).sort()).toEqual([...parts].sort())
    expect({
      withoutRow: registered.filter(name => !Object.hasOwn(COMPONENT_CONTRACT, name) && !Object.hasOwn(CONTRACT_EXEMPT, name)),
      rowWithoutComponent: Object.keys(COMPONENT_CONTRACT).filter(name => !registered.includes(name)),
    }).toEqual({ withoutRow: [], rowWithoutComponent: [] })
    for (const component of components) {
      expect(component.export).toBe(HEAVY_COMPONENTS.has(component.pascalName) ? component.pascalName : 'default')
      expect(existsWithExtension(sourceOf(component)), sourceOf(component)).toBe(true)
      if (parts.has(component.pascalName)) continue
      // The contract row names the file the component lives in.
      const { file } = COMPONENT_CONTRACT[component.pascalName as keyof typeof COMPONENT_CONTRACT]
      expect(sourceOf(component).replace(/\.vue$/, '')).toBe(join(runtimeDir, 'vue/components', file))
      // A heavy component loads on first render, through its lazy module in
      // the build directory; every other one is imported with its page.
      expect(posixPath(component.filePath) !== sourceOf(component), component.pascalName).toBe(HEAVY_COMPONENTS.has(component.pascalName))
    }
  })

  it('registers a heavy component from its lazy module, typed from its own file', async () => {
    const nuxt = getNuxt()
    const filePath = join(runtimeDir, 'vue/components/auth/AuthForm.vue')
    const options = await runWithNuxtContext(nuxt, () => lazily({ name: 'AuthForm', export: 'default', filePath }))
    expect({ ...options, filePath: posixPath(options.filePath) }).toEqual({
      name: 'AuthForm',
      export: 'AuthForm',
      filePath: join(posixPath(nuxt.options.buildDir), 'nuxt-backend/lazy/AuthForm.mjs'),
      declarationPath: filePath,
    })
    const { templates } = nuxt.options.build
    const template = templates.find(entry => entry.filename === 'nuxt-backend/lazy/AuthForm.mjs')!
    templates.splice(templates.indexOf(template), 1)
    expect(await template.getContents?.({ nuxt, app: nuxt.apps.default!, options: {} })).toBe(lazyComponentModule('AuthForm', 'default', filePath))
  })

  it('hands an app no component the contract misses, but the ones exempt by name', async () => {
    // Every component this package or the base module puts in the app: each
    // has a contract row (test/nuxt/component-contract.ts) or an exempt
    // name with its reason there. Nuxt's own are Nuxt's.
    const components: ExtendedComponents = []
    await getNuxt().callHook('components:extend', components)
    const ours = components.filter(component => posixPath(component.filePath).startsWith(runtimeDir) || /[\\/]nuxt-convex-module[\\/]/.test(component.filePath))
    expect(ours.map(component => component.pascalName)).toEqual(expect.arrayContaining(['StorageImage', 'Authenticated']))
    const uncovered = ours
      .map(component => component.pascalName)
      // A part is its component's: the component's row covers it.
      .filter(name => !(name in COMPONENT_CONTRACT) && !(name in CONTRACT_EXEMPT) && !UI_PARTS.some(part => part.name === name))
    expect(uncovered).toEqual([])
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

  it('registers the Nitro server imports, backendAuth over the base runtime\'s service', () => {
    const imports = nitroImports(getNuxt())
    const byAlias = (alias: string) => imports.find(entry => (entry.as ?? entry.name) === alias)
    expect(byAlias('useBackendMcp')).toBeUndefined()
    expect(byAlias('defineBackendMcpTool')).toBeUndefined()

    // The package's wrapper, which reports a failed call with its function.
    const backendAuth = byAlias('backendAuth')
    expect(backendAuth).toMatchObject({ name: 'backendAuth', from: join(runtimeDir, 'server/monitoring/backend-calls') })
    expect(existsWithExtension(backendAuth!.from), backendAuth!.from).toBe(true)
  })

  it('mounts every default page, the private ones behind the page guard', async () => {
    const nuxt = getNuxt()
    // No `pages/` dir in the fixture: the module's pages alone switch routing on.
    expect(pagesEnabled(nuxt)).toBe(true)
    const pages = await extendPages(nuxt)
    expect(pages.map(({ name, path, file, meta }) => ({ name, path, file, meta }))).toEqual(DEFAULT_PAGES)
    for (const page of pages) {
      expect(existsWithExtension(page.file!), page.file).toBe(true)
    }
  })

  it('registers no named `auth` middleware, and hides the base module\'s `convex-auth`: the page guard is the one way', async () => {
    const middleware = await resolveMiddleware(getNuxt())
    expect(middleware.map(entry => entry.name)).not.toContain('auth')
    expect(middleware.map(entry => entry.name)).not.toContain('convex-auth')
  })

  it('registers the global page guard and types the `auth` page meta on the app', async () => {
    const nuxt = getNuxt()
    const middleware = await resolveMiddleware(nuxt)
    expect(middleware.find(entry => entry.name === 'backend-access')).toEqual({ name: 'backend-access', path: join(runtimeDir, 'vue/middleware/page-access'), global: true })
    const template = nuxt.options.build.templates.find(entry => entry.filename === 'types/nuxt-backend-page-access.d.ts')
    expect(template).toBeDefined()
    const contents = await template!.getContents?.({ nuxt, app: nuxt.apps.default!, options: {} })
    expect(contents).toBe(`export type { PageAccessRules } from ${JSON.stringify(join(runtimeDir, 'vue/utils/page-access'))}\n`)
    expect(existsWithExtension(join(runtimeDir, 'vue/utils/page-access'))).toBe(true)
  })

  it('gives an app with no error page of its own one that shows the 403 with <AccessDenied>, and leaves an app\'s own alone', async () => {
    const nuxt = getNuxt()
    const nuxtErrorPage = join(posixPath(nuxt.options.appDir), 'components/nuxt-error-page.vue')
    const fallback = { errorComponent: nuxtErrorPage, middleware: [] }
    await nuxt.callHook('app:resolve', fallback as never)
    expect(fallback.errorComponent).toBe(join(runtimeDir, 'vue/components/shell/ErrorPage.vue'))
    expect(existsWithExtension(fallback.errorComponent)).toBe(true)
    const own = { errorComponent: join(fixtureDir, 'app/error.vue'), middleware: [] }
    await nuxt.callHook('app:resolve', own as never)
    expect(own.errorComponent).toBe(join(fixtureDir, 'app/error.vue'))
  })

  it('keeps every page with `auth` rules out of caches and indexes, a parent\'s rules covering its children', async () => {
    const nuxt = getNuxt()
    // Read at build time: Nuxt extracts the key from `definePageMeta`.
    expect((nuxt.options.experimental as { extraPageMetaExtractionKeys?: string[] }).extraPageMetaExtractionKeys).toContain('auth')
    const pages: NuxtPage[] = [
      { name: 'about', path: '/about', file: 'about.vue' },
      { name: 'admin', path: '/admin', file: 'admin.vue', meta: { auth: { role: 'admin' } }, children: [
        { name: 'admin-users', path: 'users/:id(\\d+)', file: 'admin/users.vue' },
        { name: 'admin-index', path: '', file: 'admin/index.vue' },
      ] },
      { name: 'team', path: '/team/:slug/billing', file: 'team.vue', meta: { auth: {} } },
      { name: 'docs', path: '/docs/:path(.*)*', file: 'docs.vue', meta: { auth: { role: 'staff' } } },
      { name: 'open', path: '/open', file: 'open.vue', meta: { auth: false } },
    ]
    await nuxt.callHook('pages:resolved', pages)
    const rules = nitroRouteRules(nuxt)
    for (const path of ['/admin', '/admin/users/*', '/team/*/billing']) {
      expect(rules[path], path).toMatchObject({ prerender: false, cache: false, swr: false, isr: false, robots: false, sitemap: false, headers: { 'cache-control': 'private, no-store' } })
    }
    // A path no pattern covers exactly (a repeated parameter) gets none: the module names it in a warning.
    for (const path of ['/about', '/open', '/docs/**', '/docs/*']) expect(rules[path], path).toBeUndefined()
  })

  it('skips a page the app already serves at the same path', async () => {
    const appLogin: NuxtPage = { name: 'login', path: '/login', file: join(fixtureDir, 'app/pages/login.vue') }
    const pages = await extendPages(getNuxt(), [appLogin])
    expect(pages.filter(page => page.path === '/login')).toEqual([appLogin])
    expect(pages.map(page => page.name)).not.toContain('backend-login')
    expect(pages).toHaveLength(DEFAULT_PAGES.length)
  })

  // The DevTools bridge is dev-only; the session-ended watch and the
  // passkey ceremony's idle load are always on.
  it('wires no error-reporting SDK without a DSN, installed or not: nothing imports it', () => {
    const nuxt = getNuxt()
    expect(installedModuleNames(nuxt)).not.toContain('@sentry/nuxt/module')
    expect(ourPlugins(nuxt).filter(src => src.includes('monitoring'))).toEqual([])
    expect(nitroPlugins(nuxt).filter(plugin => plugin.includes('monitoring'))).toEqual([])
  })

  it('adds the noindex plugin and the client-side session-ended, onboarding-redirect, checkout-return, first-touch, email-presence, passkey-ceremony, protection and trusted-types plugins outside dev', () => {
    const plugins = getNuxt().options.plugins.filter(entry => typeof entry !== 'string' && entry.src.startsWith(runtimeDir)) as Array<{ src: string, mode?: string }>
    expect(ourPlugins(getNuxt())).toHaveLength(9)
    expect(plugins.map(plugin => plugin.src.replace(/^.*[\\/]vue[\\/]plugins[\\/]/, '').replace(/\.ts$/, '')).sort()).toEqual(['checkout-return', 'email-presence', 'first-touch', 'noindex', 'onboarding-redirect', 'passkey-ceremony', 'protection.client', 'session-ended', 'trusted-types.client'])

    for (const plugin of plugins) {
      // The noindex meta tag is on the server's render too; everything else is the browser's.
      expect(plugin.mode).toBe(/noindex/.test(plugin.src) ? 'all' : 'client')
      expect(existsWithExtension(plugin.src), plugin.src).toBe(true)
    }
  })
})

describe('the admin console and the app\'s own tabs', () => {
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
  const getNuxt = useBoot()
  afterAll(() => {
    for (const stream of streams) stream.mockRestore()
  })

  it('nests the app\'s pages below the console\'s path under it, so its guard holds for them', async () => {
    const featured: NuxtPage = { name: 'admin-featured', path: '/admin/featured', file: 'admin/featured.vue', meta: { adminTab: { label: 'Featured' } } }
    const reports: NuxtPage = { name: 'admin-reports', path: '/admin/reports/', file: 'admin/reports.vue', children: [{ name: 'admin-reports-id', path: ':id()', file: 'admin/reports/[id].vue' }] }
    const about: NuxtPage = { name: 'about', path: '/about', file: 'about.vue' }
    const lookalike: NuxtPage = { name: 'administrators', path: '/administrators', file: 'administrators.vue' }
    const pages = await extendPages(getNuxt(), [featured, about, reports, lookalike])
    const admin = pages.find(page => page.name === 'backend-admin')!
    expect(pages.filter(page => page.path.startsWith('/admin')).map(page => page.path)).toEqual(['/administrators', '/admin'])
    expect(pages.map(page => page.name)).toContain('about')
    expect(admin.meta).toEqual({ auth: { role: 'admin', hidden: true } })
    expect(admin.children?.map(({ name, path }) => ({ name, path }))).toEqual([
      { name: 'admin-featured', path: 'featured' },
      { name: 'admin-reports', path: 'reports' },
    ])
    // The page keeps its own meta and its own children.
    expect(admin.children![0]!.meta).toEqual({ adminTab: { label: 'Featured' } })
    expect(admin.children![1]!.children).toEqual(reports.children)
  })

  it('leaves the pages alone when the app serves the console\'s path itself', async () => {
    const appAdmin: NuxtPage = { name: 'admin', path: '/admin', file: 'admin.vue', children: [{ name: 'admin-featured', path: 'featured', file: 'admin/featured.vue' }] }
    const other: NuxtPage = { name: 'admin-queue', path: '/admin/queue', file: 'admin/queue.vue' }
    const pages = await extendPages(getNuxt(), [appAdmin, other])
    expect(pages.filter(page => page.name === 'backend-admin')).toEqual([])
    expect(pages.filter(page => page.path.startsWith('/admin'))).toEqual([appAdmin, other])
    expect(appAdmin.children).toHaveLength(1)
  })

  it('has Nuxt extract `adminTab` from page meta, and keeps the tab pages out of caches and indexes', async () => {
    const nuxt = getNuxt()
    expect((nuxt.options.experimental as { extraPageMetaExtractionKeys?: string[] }).extraPageMetaExtractionKeys).toEqual(expect.arrayContaining(['auth', 'adminTab']))
    const pages = await extendPages(nuxt, [{ name: 'admin-featured', path: '/admin/featured', file: 'admin/featured.vue' }])
    await nuxt.callHook('pages:resolved', pages)
    expect(nitroRouteRules(nuxt)['/admin/featured']).toMatchObject({ prerender: false, cache: false, robots: false, sitemap: false })
  })

  it('names a tab page the tab bar would leave out', async () => {
    const nuxt = getNuxt()
    written.length = 0
    const pages = await extendPages(nuxt, [
      { name: 'admin-blank', path: '/admin/blank', file: 'admin/blank.vue', meta: { adminTab: { icon: 'i-lucide-star' } } },
      { name: 'admin-one', path: '/admin/one/:id()', file: 'admin/one.vue', meta: { adminTab: { label: 'One' } } },
      { name: 'admin-fine', path: '/admin/fine', file: 'admin/fine.vue', meta: { adminTab: { label: 'Fine' } } },
      { name: 'elsewhere', path: '/elsewhere', file: 'elsewhere.vue', meta: { adminTab: {} } },
    ])
    await nuxt.callHook('pages:resolved', pages)
    const output = written.join('')
    expect(output).toContain('The page at `/admin/blank` names `adminTab` without a `label`')
    expect(output).toContain('The page at `/admin/one/:id()` has a parameter in its path')
    expect(output).not.toContain('/admin/fine')
    expect(output).not.toContain('/elsewhere')
  })
})

describe('the noindex meta tag', () => {
  const getNuxt = useBoot()
  it('is on every page `auth` guards, from a plugin on the server\'s render too', () => {
    const noindex = ourPlugins(getNuxt()).filter(src => /noindex/.test(src))
    expect(noindex).toHaveLength(1)
    expect(existsWithExtension(noindex[0]!)).toBe(true)
  })
})

describe('the noindex meta tag with @nuxtjs/robots installed', () => {
  // That module answers the `robots: false` rules, and a rule of the app's
  // (`robots: true`) indexes a page again: the plugin would override it.
  const getNuxt = useBoot({ modules: ['@nuxtjs/robots'] })
  it('is left to that module', () => {
    expect(installedModuleNames(getNuxt())).toContain('@nuxtjs/robots')
    expect(ourPlugins(getNuxt()).filter(src => /noindex/.test(src))).toEqual([])
  })
})

describe('with a DSN set and the SDK installed', () => {
  const DSN = 'https://public-key@o7.ingest.monitor.test/42'
  beforeAll(() => {
    vi.stubEnv('MONITORING_DSN', DSN)
  })
  afterAll(() => {
    vi.stubEnv('MONITORING_DSN', '')
  })
  const getNuxt = useBoot()

  it('installs the SDK\'s module, pointed at the package\'s own config, and reports through it', () => {
    const nuxt = getNuxt()
    expect(installedModuleNames(nuxt)).toContain('@sentry/nuxt/module')
    expect(nuxt.options.runtimeConfig.public.backend.monitoring.dsn).toBe(DSN)
    expect(ourPlugins(nuxt).filter(src => /[\\/]monitoring[\\/]sdk[\\/]capture\.client(?:\.ts)?$/.test(src))).toHaveLength(1)
    expect(nitroPlugins(nuxt).filter(plugin => /[\\/]monitoring[\\/]sdk[\\/]capture\.server(?:\.ts)?$/.test(plugin))).toHaveLength(1)
    // The SDK's module found the package's client config and loads it in a plugin of its own.
    const sdkPlugins = nuxt.options.plugins.map(plugin => typeof plugin === 'string' ? plugin : plugin.src).filter(src => src.includes('sentry'))
    expect(sdkPlugins.some(src => src.includes('sentry-client-config'))).toBe(true)
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
      // Public, but it reads a sign-in code from its link: out of indexes, not out of caches.
      expect(routeRules['/login']).toEqual({ prerender: false, robots: false })
      expect(routeRules['/pricing']).toEqual({ prerender: false })
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
    ['a page turned on', { pages: { pricing: true } }, '`backend.pages.pricing` is `true`.'],
    ['loginPath', { loginPath: '/sign-in' }, '`loginPath` is gone.'],
  ])('stop the boot with a named error: %s', async (_name, backend, problem) => {
    const before = snapshotFixture()
    const error = await bootError({ backend })
    expect(error.name).toBe('BackendOptionsError')
    expect(error.message).toContain(problem)
    expect(error.message).toContain('https://nuxt-backend.dev/docs/ship/releases/upgrade#page-paths-the-stylesheet-and-the-webhook-log')
    expect(snapshotFixture()).toEqual(before)
  })
})

describe('with @nuxtjs/i18n installed', () => {
  // Each app locale gets the package's messages in its language, through the
  // module's own registration hook: English for en and en-GB, French for fr. A
  // fixture of its own: @nuxtjs/i18n reads locales from the project layer,
  // which a boot's overrides never reach.
  let nuxt: Nuxt
  beforeAll(async () => {
    nuxt = await loadNuxt({ cwd: fileURLToPath(new URL('../fixtures/i18n', import.meta.url)), dev: false, ready: true, overrides: { telemetry: false } as Overrides })
  })
  afterAll(async () => {
    await nuxt?.close()
  })

  it('registers each language\'s messages for the locales in it: English for en and en-GB, French for fr', async () => {
    const options = await templateContents(nuxt, 'i18n-options.mjs')
    // One loader per locale file, keyed by its name: the package's `en.json` and `fr.json`.
    const loaders = (code: string) => options.match(new RegExp(`\\n  "?${code}"?: \\[([^\\]]*)\\]`))?.[1]
    expect(loaders('en')).toMatch(/key: "locale_en_46json_/)
    expect(loaders('en-GB')).toMatch(/key: "locale_en_46json_/)
    expect(loaders('fr')).toMatch(/key: "locale_fr_46json_/)
    expect(loaders('fr')).not.toMatch(/locale_en_46json_/)
  })

  it('gives every localized page the rules of the page it copies: private, unframed and never prerendered', async () => {
    // As a build resolves them: the module mounts its pages, @nuxtjs/i18n
    // copies each per locale, then the module follows the copies (after
    // Nitro has started, so into its table).
    const pages: NuxtPage[] = []
    await nuxt.callHook('pages:extend', pages)
    await nuxt.callHook('pages:resolved', pages)
    const rules = nitroRouteRules(nuxt)
    for (const path of ['/fr/profile', '/en-GB/settings', '/fr/accept-invitation']) {
      expect(rules[path], path).toMatchObject({ prerender: false, cache: false, robots: false, sitemap: false, headers: { 'cache-control': 'private, no-store' } })
    }
    // A public page is still never prerendered, and never cached.
    expect(rules['/fr/login']).toMatchObject({ prerender: false })
    expect(rules['/fr/login']?.cache).toBeUndefined()
  })
})

describe('custom login and pricing paths', () => {
  const getNuxt = useBoot({ backend: { pages: { login: '/signin', pricing: '/plans/' }, redirects: { afterSignIn: '/app' } } })

  it('sends the auth middleware to the sign-in page\'s path', () => {
    expect(dependencyOptions(getNuxt()).convex?.betterAuth?.loginPath).toBe('/signin')
  })

  it('mounts every page, the string paths normalized', async () => {
    const nuxt = getNuxt()
    expect(nuxt.options.runtimeConfig.public.backend).toMatchObject({ pages: { login: '/signin', pricing: '/plans' }, redirects: { afterSignIn: '/app' } })
    const pages = await extendPages(nuxt)
    expect(pages.map(page => page.path).sort()).toEqual(['/accept-invitation', '/account/keep', '/admin', '/gifts', '/invite', '/legal/accessibility', '/legal/privacy', '/legal/subprocessors', '/legal/terms', '/plans', '/profile', '/r/:code', '/report', '/security', '/settings', '/signin', '/unsubscribe', '/waitlist', '/welcome'])

    expect(pages.find(page => page.path === '/plans')).toMatchObject({ name: 'backend-pricing', file: join(runtimeDir, 'vue/pages/pricing.vue') })
  })
})

describe('option forwarding through moduleDependencies', () => {
  const url = 'https://example.convex.cloud'
  const siteUrl = 'https://example.convex.site'
  // Any existing file: the base module validates a custom auth client path.
  const authClient = join(fixtureDir, 'backend/auth.ts')
  const getNuxt = useBoot({
    backend: { url, authRoute: '/api/session' },
    convex: { betterAuth: { authClient } },
  })

  it('forwards url as a default with its .site twin, authRoute under betterAuth, and keeps a user betterAuth object', () => {
    expect(dependencyOptions(getNuxt()).convex).toEqual({
      url,
      siteUrl,
      security: true,
      devScript: false,
      betterAuth: { authClient, loginPath: '/login', authRoute: '/api/session' },
      polar: true,
      clerk: false,
      auth0: false,
    })
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
    expect(devtoolsPlugins(getNuxt())).toEqual([])
  })
})

// nuxt-security's own switch, honoured by the package that installs it: no
// headers module, and no Trusted Types policies for a CSP that is not sent.
describe('security: false', () => {
  const getNuxt = useBoot({ security: false })

  it('installs no nuxt-security and adds no trusted-types plugin', () => {
    const nuxt = getNuxt()
    expect(installedModuleNames(nuxt)).not.toContain('nuxt-security')
    expect(installedModuleNames(nuxt)).toContain('nuxt-convex-module')
    expect(ourPlugins(nuxt).filter(src => src.includes('trusted-types'))).toEqual([])
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
    const plugins = nuxt.options.plugins.filter(entry => typeof entry !== 'string' && entry.src.startsWith(runtimeDir) && entry.src.includes('devtools'))
    expect(plugins).toHaveLength(1)
    const [plugin] = plugins as Array<{ src: string, mode?: string }>
    // Nuxt resolves the registered path to the file (`plugin.client.ts`).
    expect(plugin!.mode).toBe('client')
    expect(plugin!.src).toMatch(/[\\/]devtools[\\/]plugin\.client(\.ts)?$/)
    expect(existsWithExtension(plugin!.src), plugin!.src).toBe(true)
  })

  // What the module hands the panel's RPC once DevTools starts: `getInfo`
  // rebuilds the payload from this boot on every call.
  it('answers the panel\'s getInfo with this app\'s functions dir and pages', async () => {
    const nuxt = getNuxt()
    let functions: { getInfo?: () => { functionsDir: string, pages: Array<{ path: string }>, doctorRanAt: number | null } } = {}
    // The base module serves an RPC of its own: only this package's namespace counts.
    const devtools = {
      extendServerRpc: (namespace: string, served: typeof functions) => {
        if (namespace === 'nuxt-backend') functions = served
        return null
      },
    }
    Object.assign(nuxt, { devtools })
    // The payload DevTools itself calls the hook with, at `modules:done`.
    const initialized = { version: '0.0.0', packagePath: '', isGlobalInstall: false }
    // A DevTools hook, which Nuxt's own hook types do not list.
    const callHook = nuxt.callHook.bind(nuxt) as unknown as (name: string, ...args: unknown[]) => Promise<void>
    await callHook('devtools:initialized', initialized)
    const info = functions.getInfo?.()
    expect(info?.functionsDir).toBe('backend')
    expect(info?.pages.map(page => page.path)).toContain('/login')
    expect(info?.doctorRanAt).toBeNull()
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
    expect(devtoolsPlugins(nuxt)).toEqual([])
  })

  // `updateTemplates` re-renders through `builder:generateApp`; nothing
  // listens to it before a build, so the filters it is called with are the
  // whole observable effect. The base module watches the same codegen path for
  // its own fallback, so the check is that one of the filters picks ours.
  it('re-renders the #backend type fallback and the api plugin when codegen writes _generated/api, on either separator', async () => {
    const nuxt = getNuxt()
    const fallback = { filename: 'types/nuxt-backend-api-fallback.d.ts' }
    const rendersFallback = async (path: string, template = fallback): Promise<boolean> => {
      const filters: Array<(template: typeof fallback) => boolean> = []
      const unhook = nuxt.hook('builder:generateApp', (options) => {
        if (options?.filter) filters.push(options.filter as (template: typeof fallback) => boolean)
      })
      await nuxt.callHook('builder:watch', 'change', path)
      unhook()
      return filters.some(filter => filter(template))
    }

    expect(await rendersFallback('backend/_generated/api.d.ts')).toBe(true)
    expect(await rendersFallback('backend/_generated/api.d.ts', { filename: 'nuxt-backend-provide-api.mjs' })).toBe(true)
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
    expect(devtoolsPlugins(nuxt)).toEqual([])
  })
})
