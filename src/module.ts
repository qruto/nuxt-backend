import { defineNuxtModule, addComponent, addImports, addServerImports, addTypeTemplate, createResolver, extendPages, useLogger, updateTemplates, type Resolver } from '@nuxt/kit'
import { defu } from 'defu'
import type { ModuleDependencies, Nuxt } from '@nuxt/schema'
import { backendAppConfigDefaults, type BackendAppConfigInput } from './runtime/config'
import { scaffoldBackendFiles } from './scaffold'
import { registerBackendAliases, backendTypeFallbackContents, hasGeneratedApi, resolveFunctionsDir } from './aliases'
import { collectPreflightFindings, formatPreflightSummary } from './preflight'
import { BACKEND_PAGE_DEFS, collectExistingPagePaths, resolvePagePath, resolvedBackendPages, type BackendPageKey, type ModulePagesOptions } from './pages'
import type { BackendInstallationMode } from './templates'

const logger = useLogger('nuxt-backend')

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
    return {
      'nuxt-convex-module': {
        defaults: {
          url: backend.url,
          siteUrl: backend.siteUrl,
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
    // registration) on the first dev run.
    if (options.scaffold !== false) {
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
  },
})

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
  ]
  for (const composable of composables) {
    addImports(composable)
  }

  // Nitro-side neutral name for the base module's `convexAuth(event)` service.
  addServerImports([
    { name: 'backendAuth', from: resolver.resolve('./runtime/server/backend-auth') },
  ])
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

  const siteUrlConfigured = Boolean(
    options.siteUrl
    ?? process.env.NUXT_PUBLIC_CONVEX_SITE_URL
    ?? ((nuxt.options as unknown as Record<string, unknown>).convex as { siteUrl?: string } | undefined)?.siteUrl,
  )
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
