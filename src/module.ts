import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { defineNuxtModule, addComponent, addImports, addServerImports, addTypeTemplate, createResolver, extendPages, useLogger, updateTemplates, type Resolver } from '@nuxt/kit'
import { defu } from 'defu'
import type { ModuleDependencies, Nuxt } from '@nuxt/schema'
import { backendAppConfigDefaults, type BackendAppConfigInput } from './runtime/config'
import { deriveDeploymentUrls } from './deployment'
import { runEnvPush } from './env-push'
import { scaffoldBackendFiles } from './scaffold'
import { registerBackendAliases, backendTypeFallbackContents, hasGeneratedApi, resolveFunctionsDir } from './aliases'
import { collectPreflightFindings, formatPreflightSummary } from './preflight'
import { BACKEND_PAGE_DEFS, collectExistingPagePaths, resolvePagePath, resolvedBackendPages, type BackendPageKey, type ModulePagesOptions } from './pages'
import type { BackendInstallationMode } from './templates'

const logger = useLogger('nuxt-backend')

/**
 * Backend-neutral names for the Nitro `backendAuth(event)` service types —
 * the base module's `convexAuth` service under this package's terminology.
 * Type-only: erased at build, so none of the runtime resolution concerns the
 * `backendAuth` auto-import handles (see `registerSaasComposables`).
 */
export type { ConvexAuthOptions as BackendAuthOptions, ConvexAuthService as BackendAuthService } from 'nuxt-convex-module/better-auth/server'

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
    // The auth middleware redirects to the resolved login page path; when the
    // login page is disabled the base default (`/login`) stands and the app is
    // expected to shadow that route (or set `convex.betterAuth.loginPath`).
    const loginPath = resolvePagePath(backend.pages, 'login') ?? undefined
    // Both Convex URLs are derivable from the CONVEX_DEPLOYMENT slug that
    // `npx convex dev` writes to .env.local, so neither is required config.
    // Precedence for these *defaults*: backend.* option → the neutral
    // NUXT_PUBLIC_BACKEND_* env names → derived. Explicit `convex.*` config
    // and the base module's own NUXT_PUBLIC_CONVEX_* env always win over
    // defaults (they reach the base module directly).
    const derived = deriveDeploymentUrls(nuxt.options.rootDir)
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
    }
  },
  setup(options, nuxt) {
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

    registerModulePages(options, resolver, nuxt)

    runPreflight(options, nuxt)

    runDevAutoEnv(options, nuxt)
  },
})

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
 */
function registerModulePages(options: ModuleOptions, resolver: Resolver, nuxt: Nuxt): void {
  const resolved = resolvedBackendPages(options.pages)

  const runtimeConfig = nuxt.options.runtimeConfig
  runtimeConfig.public.backend = {
    ...(runtimeConfig.public.backend as Record<string, unknown> | undefined),
    pages: resolved,
  }

  if (options.pages === false) return

  extendPages((pages) => {
    const taken = collectExistingPagePaths(pages)
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
 * Dev-startup environment preflight. Reports findings, never throws — a dev
 * server must still boot with an incomplete environment.
 */
function runPreflight(options: ModuleOptions, nuxt: Nuxt): void {
  if (!nuxt.options.dev || nuxt.options._prepare || nuxt.options.test) return

  const derived = deriveDeploymentUrls(nuxt.options.rootDir)
  const siteUrlConfigured = Boolean(
    options.siteUrl
    ?? process.env.NUXT_PUBLIC_CONVEX_SITE_URL
    ?? process.env.NUXT_PUBLIC_BACKEND_SITE_URL
    ?? ((nuxt.options as unknown as Record<string, unknown>).convex as { siteUrl?: string } | undefined)?.siteUrl
    ?? derived?.siteUrl,
  )
  if (derived?.source === 'deployment' && !options.url && !process.env.NUXT_PUBLIC_CONVEX_URL && !process.env.NUXT_PUBLIC_BACKEND_URL) {
    logger.info(`Convex URLs derived from ${derived.deployment} — no NUXT_PUBLIC_* URL vars needed.`)
  }
  const findings = collectPreflightFindings({ env: process.env, siteUrlConfigured })

  // The auth middleware always needs a login route. With the built-in page
  // disabled, the app must shadow `/login` (or set `convex.betterAuth.loginPath`).
  if (resolvePagePath(options.pages, 'login') === null) {
    logger.warn(
      'The built-in login page is disabled (`backend.pages.login: false`). '
      + 'Provide your own page at `/login`, or point `convex.betterAuth.loginPath` at your sign-in route.',
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
