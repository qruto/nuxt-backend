import { defineNuxtModule, addComponent, addImports, addTypeTemplate, createResolver, extendPages, useLogger, updateTemplates, type Resolver } from '@nuxt/kit'
import type { ModuleDependencies, Nuxt } from '@nuxt/schema'
import { scaffoldBackendFiles } from './scaffold'
import { registerBackendAliases, backendTypeFallbackContents, hasGeneratedApi, resolveFunctionsDir } from './aliases'
import { collectPreflightFindings, formatPreflightSummary } from './preflight'
import { DEFAULT_INVITATION_PATH } from './convex/constants'
import type { BackendInstallationMode } from './templates'

const logger = useLogger('nuxt-backend')

export interface ModuleOptions {
  url?: string
  siteUrl?: string
  authRoute?: string
  installation?: BackendInstallationMode
  /**
   * Auto-scaffold missing Convex backend files on dev startup. Set `false`
   * when you scaffold explicitly with `npx nuxt-backend init` / `add`.
   */
  scaffold?: 'auto' | false
  /**
   * Register the ready-made invitation accept page (renders
   * `<AcceptInvitation>` behind the `auth` middleware). `true` (the default)
   * uses `/accept-invitation`; pass a string to change the path — keep it in
   * sync with the Convex-side `organization.invitationPath` so emailed links
   * land on it. `false` to bring your own page.
   */
  invitationPage?: boolean | string
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
    invitationPage: true,
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
            ? convex.betterAuth
            : { authClient: resolver.resolve('./runtime/vue/auth-client') },
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

    registerSaasComposables(resolver)

    registerInvitationPage(options, resolver)

    runPreflight(options, nuxt)
  },
})

/**
 * Register the ready-made `/accept-invitation` page (see `invitationPage`
 * module option) behind the base module's `auth` route middleware, so the
 * accept links in invitation emails work with zero consumer files.
 */
function registerInvitationPage(options: ModuleOptions, resolver: Resolver): void {
  if (options.invitationPage === false) return
  const path = typeof options.invitationPage === 'string'
    ? options.invitationPage
    : DEFAULT_INVITATION_PATH
  extendPages((pages) => {
    pages.unshift({
      name: 'backend-accept-invitation',
      path,
      file: resolver.resolve('./runtime/vue/pages/accept-invitation'),
      meta: { middleware: 'auth' },
    })
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

  const composables: Array<{ name: string, from: string }> = [
    { name: 'useLoginFlow', from: resolver.resolve('./runtime/vue/composables/use-login-flow') },
    { name: 'useOrganization', from: resolver.resolve('./runtime/vue/composables/use-organization') },
    { name: 'useSearch', from: resolver.resolve('./runtime/vue/composables/use-search') },
    { name: 'useAggregate', from: resolver.resolve('./runtime/vue/composables/use-aggregate') },
    { name: 'useCount', from: resolver.resolve('./runtime/vue/composables/use-aggregate') },
    { name: 'useBilling', from: resolver.resolve('./runtime/vue/composables/use-billing') },
    { name: 'useFeatures', from: resolver.resolve('./runtime/vue/composables/use-features') },
    { name: 'useCredits', from: resolver.resolve('./runtime/vue/composables/use-credits') },
    { name: 'useGifts', from: resolver.resolve('./runtime/vue/composables/use-gifts') },
    { name: 'useEmailStatus', from: resolver.resolve('./runtime/vue/composables/use-email-status') },
    { name: 'useWorkflowStatus', from: resolver.resolve('./runtime/vue/composables/use-workflow') },
  ]
  for (const composable of composables) {
    addImports(composable)
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
