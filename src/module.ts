import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { defineNuxtModule, addComponent, addImports, addPlugin, addServerHandler, addServerImports, addTypeTemplate, createResolver, extendPages, useLogger, updateTemplates, type Resolver } from '@nuxt/kit'
import { defu } from 'defu'
import type { ModuleDependencies, Nuxt } from '@nuxt/schema'
import { backendAppConfigDefaults, type BackendAppConfigInput } from './runtime/config'
import { BACKEND_MCP_SCOPES, DEFAULT_MCP_EXCHANGE_PATH } from './convex/constants'
import { deriveDeploymentUrls } from './deployment'
import { runEnvPush } from './env-push'
import { scaffoldBackendFiles } from './scaffold'
import { registerBackendAliases, backendTypeFallbackContents, hasGeneratedApi, resolveFunctionsDir } from './aliases'
import { collectPreflightFindings, formatPreflightSummary } from './preflight'
import { BACKEND_PAGE_DEFS, collectExistingPagePaths, resolvePagePath, resolvedBackendPages, type BackendPageKey, type ModulePagesOptions } from './pages'
import { buildDevtoolsInfo, computeDevtoolsPages, readPackageVersions } from './devtools/info'
import type { DevtoolsPageInfo } from './devtools/rpc-types'
import type { BackendInstallationMode } from './templates'
import type { BackendMcpFunctionKey, BackendMcpToolName } from './runtime/server/mcp/builtin'

const logger = useLogger('nuxt-backend')

/**
 * Backend-neutral names for the Nitro `backendAuth(event)` service types —
 * the base module's `convexAuth` service under this package's terminology.
 * Type-only: erased at build, so none of the runtime resolution concerns the
 * `backendAuth` auto-import handles (see `registerSaasComposables`).
 */
export type { ConvexAuthOptions as BackendAuthOptions, ConvexAuthService as BackendAuthService } from 'nuxt-convex-module/better-auth/server'

// The MCP option vocabularies live with the runtime that interprets them
// (type-only imports — erased at build, so no server-runtime code is pulled
// into the module bundle).
export type { BackendMcpFunctionKey, BackendMcpToolName } from './runtime/server/mcp/builtin'

/**
 * The agent (MCP) surface: an OAuth-protected MCP endpoint served by Nitro
 * via `@nuxtjs/mcp-toolkit`, with ready-made account/billing/workspace tools
 * that call Convex as the signed-in user. On by default — everything the
 * tools expose is already reachable through the product UI under the same
 * user auth; OAuth adds per-client consent and the deployment's `mcp` rate
 * limit guards the token exchange. Set `backend.mcp: false` for the
 * conservative posture (no MCP endpoint, no OAuth discovery routes).
 */
export interface ModuleMcpOptions {
  /** Master switch (same as `backend.mcp: false`). */
  enabled?: boolean
  /** MCP endpoint route. Default `/mcp` (the toolkit's default). */
  route?: string
  /** Server name/description/instructions forwarded to the toolkit. */
  name?: string
  description?: string
  instructions?: string
  /** Stateful transport sessions, forwarded to the toolkit. Default off. */
  sessions?: boolean | { enabled?: boolean, maxDuration?: number, maxSessions?: number }
  tools?: {
    /**
     * The built-in tool set: `false` removes all of them from the build;
     * a map hides individual tools (`{ 'billing-portal-link': false }`).
     */
    builtin?: false | Partial<Record<BackendMcpToolName, boolean>>
  }
  /**
   * Override the Convex functions the built-in tools call — needed only when
   * the scaffolded `auth.ts`/`billing.ts` files were renamed. Values are
   * `module:export` refs, e.g. `{ getCredits: 'myBilling:getCredits' }`.
   */
  functions?: Partial<Record<BackendMcpFunctionKey, string>>
}

export interface ModuleOptions {
  url?: string
  siteUrl?: string
  authRoute?: string
  installation?: BackendInstallationMode
  /**
   * Auto-scaffold missing Convex backend files on dev startup. Set `false`
   * when you scaffold explicitly with `npx nuxt-backend init`.
   */
  scaffold?: 'auto' | false
  /**
   * The ready-made pages — login, pricing, settings, profile, security, and
   * the invitation accept page — all mounted by default. Per key: `true`
   * (default path), a string (custom path), or `false` (bring your own).
   * `false` disables the whole set. An app page at the same path always wins
   * over the module's.
   */
  pages?: ModulePagesOptions | false
  /**
   * Where the auth middleware sends signed-out visitors. Defaults to the
   * resolved built-in login page path; set this when you disable
   * `pages.login` and serve your own sign-in route somewhere else.
   */
  loginPath?: string
  /**
   * Auto-add the neutral default stylesheet (`nuxt-backend/ui.css`) covering
   * every shipped component and page. `false` to opt out and style the
   * `data-*` hooks yourself.
   */
  css?: boolean
  /**
   * On dev startup, provision the `dev:` deployment env automatically — the
   * same engine as `npx nuxt-backend env push`: forward `.env(.local)` values,
   * generate `AUTH_SECRET`, default `SITE_URL` to localhost, and echo OTP
   * codes to the convex dev console until an email transport exists. Runs
   * once per deployment (stamped under `node_modules/.cache/nuxt-backend`),
   * asynchronously after startup. Never touches non-dev deployments.
   * `false` to manage the deployment env yourself.
   */
  autoEnv?: boolean
  /**
   * The agent (MCP) surface — an OAuth-protected `/mcp` endpoint with
   * built-in account/billing/workspace tools. Enabled by default (dev and
   * production); `false` disables it. See {@link ModuleMcpOptions}.
   */
  mcp?: boolean | ModuleMcpOptions
  /**
   * The Backend panel in Nuxt DevTools (dev only): preflight findings, env
   * presence, mounted pages, the agent surface, and live identity/billing/
   * credits/workspace state with recent webhook deliveries. Enabled by
   * default whenever Nuxt DevTools is; set `false` to disable just the
   * Backend tab.
   */
  devtools?: boolean
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-backend',
    configKey: 'backend',
    // moduleDependencies with option forwarding is a Nuxt 4.1 feature.
    compatibility: { nuxt: '>=4.1.0' },
  },
  defaults: {
    installation: 'default',
    scaffold: 'auto',
    css: true,
    autoEnv: true,
    devtools: true,
  },
  // The Convex + Better Auth + Polar framework integration. Declared as a
  // module dependency (not `installModule`) so Nuxt dedupes it when the app
  // lists it too, and so its own dependencies (nuxt-security with the
  // Convex-aware CSP) chain through. `defaults` forward the `backend.*`
  // options (user `convex.*` config wins over them); `overrides` force-enable
  // the integrations this package bundles.
  moduleDependencies: (nuxt): ModuleDependencies => {
    const rawOptions = nuxt.options as unknown as Record<string, unknown>
    const backend = (rawOptions.backend ?? {}) as ModuleOptions
    const convex = (rawOptions.convex ?? {}) as Record<string, unknown>
    const resolver = createResolver(import.meta.url)
    // The auth middleware redirects to the resolved login page path; with the
    // built-in page disabled, `backend.loginPath` points at the app's own
    // sign-in route (else the app is expected to shadow `/login`).
    const loginPath = backend.loginPath ?? resolvePagePath(backend.pages, 'login') ?? undefined
    // Both Convex URLs are derivable from the CONVEX_DEPLOYMENT slug that
    // `npx convex dev` writes to .env.local, so neither is required config.
    // Precedence for these *defaults*: backend.* option → the neutral
    // NUXT_PUBLIC_BACKEND_* env names → derived. Explicit `convex.*` config
    // and the base module's own NUXT_PUBLIC_CONVEX_* env always win over
    // defaults (they reach the base module directly).
    const derived = deriveDeploymentUrls(nuxt.options.rootDir)
    const mcp = resolveMcpOptions(backend.mcp)
    return {
      'nuxt-convex-module': {
        defaults: {
          url: backend.url ?? process.env.NUXT_PUBLIC_BACKEND_URL ?? derived?.url,
          siteUrl: backend.siteUrl ?? process.env.NUXT_PUBLIC_BACKEND_SITE_URL ?? derived?.siteUrl,
          authRoute: backend.authRoute,
        },
        overrides: {
          // Better Auth with this package's passwordless client (OTP +
          // passkeys). A user-supplied `convex.betterAuth` object (e.g. a
          // custom `authClient`) wins; only a disable is overridden.
          betterAuth: typeof convex.betterAuth === 'object' && convex.betterAuth !== null
            ? { loginPath, ...convex.betterAuth }
            : { authClient: resolver.resolve('./runtime/vue/auth-client'), loginPath },
          polar: true,
          // This package's auth story is Better Auth — don't let auto-detect
          // enable a second auth provider just because its SDK is resolvable.
          clerk: false,
          auth0: false,
        },
      },
      // The MCP endpoint host. `defaults` forward `backend.mcp.*` — a user's
      // own top-level `mcp` config wins over them (same contract as the
      // `convex.*` forwarding above). Dropped entirely when disabled.
      ...(mcp
        ? {
            '@nuxtjs/mcp-toolkit': {
              defaults: {
                route: mcp.route,
                ...(mcp.name !== undefined ? { name: mcp.name } : {}),
                ...(mcp.description !== undefined ? { description: mcp.description } : {}),
                ...(mcp.instructions !== undefined ? { instructions: mcp.instructions } : {}),
                ...(mcp.sessions !== undefined ? { sessions: mcp.sessions } : {}),
              },
            },
          }
        : {}),
    }
  },
  async setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)

    // Scaffold the minimum Convex backend files (auth component mount, route
    // registration) on the first dev run. Dev-boot only: `nuxt build`,
    // `nuxt prepare`, and test boots must never write into the app.
    if (options.scaffold !== false && nuxt.options.dev && !nuxt.options._prepare && !nuxt.options.test) {
      scaffoldBackendFiles(nuxt.options.rootDir, { installation: options.installation })
    }

    // `#backend/*` — the backend-branded aliases for the Convex functions
    // folder (same targets as the base module's `#convex/*`).
    registerBackendAliases(nuxt)
    registerBackendTypeFallback(nuxt)

    // The content layer: `appConfig.backend` (plan catalog, labels, brand).
    // defu keeps user `app.config.ts` values winning and HMR-reactive. Cast:
    // in a consumer typecheck the resolved AppConfig narrows `backend` to the
    // app's literal config, which the defaults-merge intentionally widens.
    nuxt.options.appConfig.backend = defu(
      nuxt.options.appConfig.backend as BackendAppConfigInput | undefined,
      backendAppConfigDefaults,
    ) as typeof nuxt.options.appConfig.backend

    registerSaasComposables(resolver)

    // The neutral default stylesheet for every shipped component and page.
    if (options.css !== false) {
      nuxt.options.css.push(resolver.resolve('./runtime/vue/components/ui.css'))
    }

    const pagesInfo = registerModulePages(options, resolver, nuxt)

    registerMcp(options, resolver, nuxt)

    runPreflight(options, nuxt)

    runDevAutoEnv(options, nuxt)

    if (nuxt.options.dev && options.devtools !== false && isDevtoolsUiEnabled(nuxt)) {
      // Lazy import keeps @nuxt/devtools-kit out of production module evaluation.
      const { setupDevtools } = await import('./devtools/index')
      const functionsDir = resolveFunctionsDir(nuxt.options.rootDir)
      const mcp = resolveMcpOptions(options.mcp)
      const siteUrlConfigured = isSiteUrlConfigured(options, nuxt)
      const versions = readPackageVersions(nuxt.options.rootDir)
      setupDevtools(resolver, nuxt, {
        rootDir: nuxt.options.rootDir,
        functionsDir,
        // Rebuilt per RPC call so preflight findings (and the shadowed-page
        // list `extendPages` fills during build) stay live in the panel.
        getInfo: () => buildDevtoolsInfo({
          env: process.env,
          siteUrlConfigured,
          options,
          pages: pagesInfo.list,
          appConfig: nuxt.options.appConfig.backend as BackendAppConfigInput | undefined,
          mcp: mcp ? { route: mcp.route, builtin: mcp.tools?.builtin } : null,
          versions,
          functionsDir,
        }),
      })
      // Appended so it runs after the plugins that provide the Convex client
      // and the auth session.
      addPlugin({ src: resolver.resolve('./runtime/devtools/plugin.client'), mode: 'client' }, { append: true })
    }
  },
})

/** Whether the Nuxt DevTools UI itself is enabled for this app. */
function isDevtoolsUiEnabled(nuxt: Nuxt): boolean {
  const devtools = nuxt.options.devtools as boolean | { enabled?: boolean } | undefined
  return typeof devtools === 'boolean' ? devtools : devtools?.enabled !== false
}

/** Resolve `backend.mcp` into effective options, or `null` when disabled. */
function resolveMcpOptions(raw: ModuleOptions['mcp']): (ModuleMcpOptions & { route: string }) | null {
  if (raw === false) return null
  const options = typeof raw === 'object' ? raw : {}
  if (options.enabled === false) return null
  return { ...options, route: options.route?.replace(/\/+$/, '') || '/mcp' }
}

/**
 * The agent (MCP) surface: contribute the built-in tools to the toolkit's
 * definition scan, publish the runtime config the gate/tools read, and mount
 * the route-scoped middleware — the OAuth gate on the MCP route plus the two
 * `/.well-known` discovery documents (registered as middleware so they answer
 * before the toolkit's 404 stubs on the same routes).
 */
function registerMcp(options: ModuleOptions, resolver: Resolver, nuxt: Nuxt): void {
  const mcp = resolveMcpOptions(options.mcp)
  // The server utils stay importable (and auto-imported) even when disabled,
  // so consumer tool files keep compiling; without runtime config the gate
  // never authenticates anything and every backend tool stays hidden.
  addServerImports([
    { name: 'useBackendMcp', from: resolver.resolve('./runtime/server/mcp/index') },
    { name: 'defineBackendMcpTool', from: resolver.resolve('./runtime/server/mcp/index') },
  ])
  if (!mcp) return

  const builtin = mcp.tools?.builtin
  // The toolkit's `useEvent`-based helpers — and our `useBackendMcp()` inside
  // tool handlers — read the current request through Nitro's async context.
  nuxt.options.nitro.experimental = defu(
    { asyncContext: true },
    nuxt.options.nitro.experimental,
  )

  // Everything the Nitro runtime needs (the gate, the discovery documents,
  // and the built-in tools' enabled/function lookups). Server-side only —
  // never exposed to the client bundle.
  nuxt.options.runtimeConfig.backendMcp = defu(
    nuxt.options.runtimeConfig.backendMcp as Record<string, unknown> | undefined,
    {
      route: mcp.route,
      authBase: options.authRoute ?? '/api/auth',
      exchangePath: DEFAULT_MCP_EXCHANGE_PATH,
      scopes: [...BACKEND_MCP_SCOPES],
      tools: builtin === false ? {} : { ...builtin },
      functions: { ...mcp.functions },
    },
  )

  // Contribute the built-in tool files to the toolkit's definition scan
  // (absolute paths pass through its layer-relative resolution).
  if (builtin !== false) {
    // The hook is declared by the toolkit's runtime types, which Nuxt's hook
    // map doesn't know at module-build time.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(nuxt.hook as any)('mcp:definitions:paths', (paths: { tools: string[] }) => {
      paths.tools.push(resolver.resolve('./runtime/server/mcp/tools'))
    })
  }

  // Route-scoped middleware (h3 prefix matching): the OAuth gate owns the MCP
  // route; the discovery documents own their `/.well-known` prefixes
  // (including the RFC 8414/9728 path-suffix forms via the prefix match).
  addServerHandler({
    route: mcp.route,
    middleware: true,
    handler: resolver.resolve('./runtime/server/mcp/gate'),
  })
  addServerHandler({
    route: '/.well-known/oauth-protected-resource',
    middleware: true,
    handler: resolver.resolve('./runtime/server/mcp/protected-resource'),
  })
  addServerHandler({
    route: '/.well-known/oauth-authorization-server',
    middleware: true,
    handler: resolver.resolve('./runtime/server/mcp/authorization-server'),
  })

  // nuxt-security (chained through the base module) would throttle long agent
  // sessions with its IP rate limiter, reject tool args that look like markup
  // (xssValidator), and take over CORS on the discovery documents — the MCP
  // surface has its own guards (OAuth + the deployment's `mcp` limit). Inert
  // when nuxt-security isn't installed.
  const routeRules = (nuxt.options.nitro.routeRules ??= {})
  const relax = { security: { rateLimiter: false as const, xssValidator: false as const, corsHandler: false as const } }
  for (const route of [mcp.route, `${mcp.route}/**`]) {
    routeRules[route] = defu(routeRules[route], relax)
  }
  for (const route of [
    '/.well-known/oauth-protected-resource',
    '/.well-known/oauth-protected-resource/**',
    '/.well-known/oauth-authorization-server',
    '/.well-known/oauth-authorization-server/**',
  ]) {
    routeRules[route] = defu(routeRules[route], { security: { corsHandler: false as const } })
  }
}

/**
 * Dev-startup env auto-provision (`backend.autoEnv`, default on): run the
 * `env push` engine against the `dev:` deployment once per deployment,
 * asynchronously after startup. The stamp under `node_modules/.cache`
 * prevents a `convex env list` spawn on every boot; a failed run leaves no
 * stamp, so the next boot retries. When `npx convex dev` has not provisioned
 * yet (very first run — no `CONVEX_DEPLOYMENT` in `.env.local`), a watcher
 * on `.env.local` picks the deployment up the moment it appears, so the two
 * first-run terminals can start in any order.
 */
function runDevAutoEnv(options: ModuleOptions, nuxt: Nuxt): void {
  if (!nuxt.options.dev || nuxt.options._prepare || nuxt.options.test || options.autoEnv === false) return
  const rootDir = nuxt.options.rootDir

  const attempt = (): boolean => {
    const deployment = deriveDeploymentUrls(rootDir)?.deployment
    if (!deployment?.startsWith('dev:')) return false
    const stampDir = join(rootDir, 'node_modules/.cache/nuxt-backend')
    const stamp = join(stampDir, `env-ok-${deployment.replace(/[^\w-]/g, '_')}`)
    if (existsSync(stamp)) return true

    void runEnvPush(rootDir, {}).then((run) => {
      if (!run) return
      for (const { action, outcome, error } of run.results) {
        if (outcome === 'set') logger.info(`env push: ${action.name} — ${action.detail}`)
        else if (outcome === 'failed') logger.warn(`env push: ${action.name} failed — ${error}`)
      }
      if (run.results.every(result => result.outcome !== 'failed')) {
        mkdirSync(stampDir, { recursive: true })
        writeFileSync(stamp, new Date().toISOString())
      }
    }).catch((error: unknown) => {
      logger.warn(`env auto-provision failed: ${error instanceof Error ? error.message : String(error)}`)
    })
    return true
  }

  if (attempt()) return
  nuxt.hook('builder:watch', (_event, path) => {
    if (!path.replace(/\\/g, '/').endsWith('.env.local')) return
    attempt()
  })
}

/**
 * Mount the ready-made pages (see the `pages` module option). Detect-and-skip
 * instead of route-precedence games: vue-router resolves tied scores
 * first-in-array, so ordering tricks are fragile — when the app already has a
 * page at the path, the module simply doesn't mount its own and logs the
 * override. The resolved paths are published to
 * `runtimeConfig.public.backend.pages` for cross-links between the pages.
 *
 * Returns a holder the DevTools `getInfo()` reads lazily: `extendPages` runs
 * during build, after module setup, so the shadowed-page list is filled in
 * place rather than returned by value.
 */
function registerModulePages(options: ModuleOptions, resolver: Resolver, nuxt: Nuxt): { list: DevtoolsPageInfo[] } {
  const resolved = resolvedBackendPages(options.pages)
  const info: { list: DevtoolsPageInfo[] } = { list: [] }

  const runtimeConfig = nuxt.options.runtimeConfig
  runtimeConfig.public.backend = {
    ...(runtimeConfig.public.backend as Record<string, unknown> | undefined),
    pages: resolved,
  }

  if (options.pages === false) return info

  extendPages((pages) => {
    const taken = collectExistingPagePaths(pages)
    info.list = computeDevtoolsPages(resolved, taken)
    for (const def of BACKEND_PAGE_DEFS) {
      const path = resolved[def.key]
      if (!path) continue
      if (taken.has(path)) {
        logger.info(`App page at \`${path}\` overrides the built-in ${def.key} page`)
        continue
      }
      pages.push({
        name: `backend-${def.file}`,
        path,
        file: resolver.resolve(`./runtime/vue/pages/${def.file}`),
        meta: def.auth ? { middleware: 'auth' } : undefined,
      })
    }
  })

  return info
}

/**
 * Expose the SaaS layer as Nuxt auto-imports — one name per concept. The core
 * data composables (`useQuery`, `useMutation`, ...) come from
 * `nuxt-convex-module`; `useAuth` is this package's extended service and takes
 * priority over the base registration.
 */
function registerSaasComposables(resolver: Resolver): void {
  addImports({
    name: 'useAuth',
    from: resolver.resolve('./runtime/vue/composables/use-auth'),
    priority: 10,
  })

  addComponent({
    name: 'AuthForm',
    export: 'AuthForm',
    filePath: resolver.resolve('./runtime/vue/components/auth-form'),
  })
  addComponent({
    name: 'RoleBoundary',
    export: 'RoleBoundary',
    filePath: resolver.resolve('./runtime/vue/components/role-boundary'),
  })
  addComponent({
    name: 'OrganizationBoundary',
    export: 'OrganizationBoundary',
    filePath: resolver.resolve('./runtime/vue/components/organization-boundary'),
  })
  addComponent({
    name: 'FeatureBoundary',
    export: 'FeatureBoundary',
    filePath: resolver.resolve('./runtime/vue/components/feature-boundary'),
  })
  addComponent({
    name: 'AcceptInvitation',
    export: 'AcceptInvitation',
    filePath: resolver.resolve('./runtime/vue/components/accept-invitation'),
  })
  addComponent({
    name: 'GiftClaimBanner',
    export: 'GiftClaimBanner',
    filePath: resolver.resolve('./runtime/vue/components/gift-claim-banner'),
  })
  addComponent({
    name: 'PricingTable',
    export: 'PricingTable',
    filePath: resolver.resolve('./runtime/vue/components/pricing-table'),
  })
  addComponent({
    name: 'WorkspaceSettings',
    export: 'WorkspaceSettings',
    filePath: resolver.resolve('./runtime/vue/components/workspace-settings'),
  })
  addComponent({
    name: 'ProfileSettings',
    export: 'ProfileSettings',
    filePath: resolver.resolve('./runtime/vue/components/profile-settings'),
  })
  addComponent({
    name: 'SecuritySettings',
    export: 'SecuritySettings',
    filePath: resolver.resolve('./runtime/vue/components/security-settings'),
  })

  const composables: Array<{ name: string, from: string }> = [
    // Backend-neutral names over the base module's brand-named surface.
    { name: 'useAuthState', from: resolver.resolve('./runtime/vue/composables/base-aliases') },
    { name: 'useConnectionState', from: resolver.resolve('./runtime/vue/composables/base-aliases') },
    { name: 'useLoginFlow', from: resolver.resolve('./runtime/vue/composables/use-login-flow') },
    { name: 'useOrganization', from: resolver.resolve('./runtime/vue/composables/use-organization') },
    { name: 'useSearch', from: resolver.resolve('./runtime/vue/composables/use-search') },
    { name: 'useAggregate', from: resolver.resolve('./runtime/vue/composables/use-aggregate') },
    { name: 'useCount', from: resolver.resolve('./runtime/vue/composables/use-aggregate') },
    { name: 'useBilling', from: resolver.resolve('./runtime/vue/composables/use-billing') },
    { name: 'useFeatures', from: resolver.resolve('./runtime/vue/composables/use-features') },
    { name: 'useCredits', from: resolver.resolve('./runtime/vue/composables/use-credits') },
    { name: 'useGifts', from: resolver.resolve('./runtime/vue/composables/use-gifts') },
    { name: 'usePasskeys', from: resolver.resolve('./runtime/vue/composables/use-passkeys') },
    { name: 'useSessions', from: resolver.resolve('./runtime/vue/composables/use-sessions') },
    { name: 'describeUserAgent', from: resolver.resolve('./runtime/vue/composables/use-sessions') },
    { name: 'unwrapAuth', from: resolver.resolve('./runtime/vue/utils/auth-result') },
    { name: 'useBackendConfig', from: resolver.resolve('./runtime/vue/composables/use-backend-config') },
    { name: 'useEmailStatus', from: resolver.resolve('./runtime/vue/composables/use-email-status') },
    { name: 'useWorkflowStatus', from: resolver.resolve('./runtime/vue/composables/use-workflow') },
    { name: 'useAiStream', from: resolver.resolve('./runtime/vue/composables/use-ai-stream') },
  ]
  for (const composable of composables) {
    addImports(composable)
  }

  // Nitro-side neutral name for the base module's `convexAuth(event)` service,
  // aliased straight from the base runtime file (same file its own
  // registration uses). The exact filename varies by install state — compiled
  // dist (published), raw-`.ts` dist, or src (stub build) — so probe for it.
  const baseModuleDir = dirname(createRequire(import.meta.url).resolve('nuxt-convex-module/package.json'))
  const serverRuntime = [
    'dist/runtime/better-auth/nuxt/server.mjs',
    'dist/runtime/better-auth/nuxt/server.js',
    'dist/runtime/better-auth/nuxt/server.ts',
    'src/runtime/better-auth/nuxt/server.ts',
  ].map(candidate => join(baseModuleDir, candidate)).find(existsSync)
  if (serverRuntime) {
    addServerImports([
      { name: 'convexAuth', as: 'backendAuth', from: serverRuntime },
    ])
  }
  else {
    logger.warn(
      '`backendAuth` auto-import unavailable — could not locate the nuxt-convex-module server runtime '
      + '(looked in dist/ and src/). Reinstall nuxt-convex-module, or import `convexAuth` from '
      + '`nuxt-convex-module/better-auth/server` directly.',
    )
  }
}

/**
 * Fallback ambient types for `#backend/*` until `convex dev` emits codegen,
 * re-rendered live the moment `_generated/api` appears (mirrors the base
 * module's `#convex/*` fallback).
 */
function registerBackendTypeFallback(nuxt: Nuxt): void {
  const functionsDir = resolveFunctionsDir(nuxt.options.rootDir)
  const filename = 'types/nuxt-backend-api-fallback.d.ts' as const
  addTypeTemplate({
    filename,
    getContents: () => backendTypeFallbackContents(hasGeneratedApi(nuxt.options.rootDir, functionsDir), functionsDir),
  }, { nuxt: true, nitro: true })

  if (!nuxt.options.dev) return
  nuxt.hook('builder:watch', async (_event, path) => {
    if (!path.replace(/\\/g, '/').includes('_generated/api')) return
    await updateTemplates({ filter: template => template.filename === filename })
  })
}

// Typed `appConfig.backend` (content layer) and
// `runtimeConfig.public.backend.pages` (resolved default-page paths, `''`
// when a page is disabled) for consumers. Same augmentation target as the
// base module's runtime-config typing (`@nuxt/schema`).
declare module '@nuxt/schema' {
  interface AppConfigInput {
    backend?: BackendAppConfigInput
  }
  interface PublicRuntimeConfig {
    backend: {
      pages: Record<BackendPageKey, string>
    }
  }
}

/**
 * Whether a Convex site URL reaches the base module — from the module option,
 * either env name, explicit `convex.siteUrl` config, or slug derivation.
 * Shared by the preflight run and the DevTools `getInfo()` builder.
 */
function isSiteUrlConfigured(options: ModuleOptions, nuxt: Nuxt): boolean {
  return Boolean(
    options.siteUrl
    ?? process.env.NUXT_PUBLIC_CONVEX_SITE_URL
    ?? process.env.NUXT_PUBLIC_BACKEND_SITE_URL
    ?? ((nuxt.options as unknown as Record<string, unknown>).convex as { siteUrl?: string } | undefined)?.siteUrl
    ?? deriveDeploymentUrls(nuxt.options.rootDir)?.siteUrl,
  )
}

/**
 * Dev-startup environment preflight. Reports findings, never throws — a dev
 * server must still boot with an incomplete environment.
 */
function runPreflight(options: ModuleOptions, nuxt: Nuxt): void {
  if (!nuxt.options.dev || nuxt.options._prepare || nuxt.options.test) return

  const derived = deriveDeploymentUrls(nuxt.options.rootDir)
  const siteUrlConfigured = isSiteUrlConfigured(options, nuxt)
  if (derived?.source === 'deployment' && !options.url && !process.env.NUXT_PUBLIC_CONVEX_URL && !process.env.NUXT_PUBLIC_BACKEND_URL) {
    logger.info(`Convex URLs derived from ${derived.deployment} — no NUXT_PUBLIC_* URL vars needed.`)
  }
  const mcp = resolveMcpOptions(options.mcp)
  const findings = collectPreflightFindings({
    env: process.env,
    siteUrlConfigured,
    ...(mcp ? { mcp: { route: mcp.route } } : {}),
  })

  // The auth middleware always needs a login route. With the built-in page
  // disabled and no explicit `backend.loginPath`, the app must shadow `/login`.
  if (resolvePagePath(options.pages, 'login') === null && !options.loginPath) {
    logger.warn(
      'The built-in login page is disabled (`backend.pages.login: false`). '
      + 'Provide your own page at `/login`, or point `backend.loginPath` at your sign-in route.',
    )
  }

  for (const finding of findings) {
    if (finding.status === 'fail') {
      logger.error(`${finding.title}: ${finding.message}${finding.fixHint ? `\n  ↳ ${finding.fixHint}` : ''}`)
    }
    else if (finding.status === 'warn') {
      logger.warn(`${finding.title}: ${finding.message}${finding.fixHint ? `\n  ↳ ${finding.fixHint}` : ''}`)
    }
  }
  logger.info(`backend preflight: ${formatPreflightSummary(findings)}`)
}
