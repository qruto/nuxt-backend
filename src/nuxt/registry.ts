import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { addComponent, addImports, addRouteMiddleware, addServerImports, addTypeTemplate, resolveModule, updateTemplates, type Resolver } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { backendTypeFallbackContents, hasGeneratedApi, resolveFunctionsDir } from '../aliases'
import { logger } from './logger'

// What the module registers by name — the composables, components, server
// imports and route middleware every app gets — and the `#backend/*`
// fallback types.

/**
 * Expose the SaaS layer as Nuxt auto-imports — one name per concept. The core
 * data composables (`useQuery`, `useMutation`, ...) come from
 * `nuxt-convex-module`, which registers its own service as `useBetterAuth`;
 * `useAuth` is this package's extended service and the only auto-import of
 * that name.
 */
export function registerSaasComposables(resolver: Resolver): void {
  addImports({
    name: 'useAuth',
    from: resolver.resolve('./runtime/vue/composables/use-auth'),
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
    name: 'AgentConsent',
    export: 'AgentConsent',
    filePath: resolver.resolve('./runtime/vue/components/agent-consent'),
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
    name: 'BillingHistory',
    export: 'BillingHistory',
    filePath: resolver.resolve('./runtime/vue/components/billing-history'),
  })
  addComponent({
    name: 'UsageHistory',
    export: 'UsageHistory',
    filePath: resolver.resolve('./runtime/vue/components/usage-history'),
  })
  addComponent({
    name: 'CreditsLowBanner',
    export: 'CreditsLowBanner',
    filePath: resolver.resolve('./runtime/vue/components/credits-low-banner'),
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
    { name: 'useOrders', from: resolver.resolve('./runtime/vue/composables/use-orders') },
    { name: 'useUsage', from: resolver.resolve('./runtime/vue/composables/use-usage') },
    { name: 'useGifts', from: resolver.resolve('./runtime/vue/composables/use-gifts') },
    { name: 'usePasskeys', from: resolver.resolve('./runtime/vue/composables/use-passkeys') },
    { name: 'useSessions', from: resolver.resolve('./runtime/vue/composables/use-sessions') },
    { name: 'useAgentConsent', from: resolver.resolve('./runtime/vue/composables/use-agent-consent') },
    { name: 'describeUserAgent', from: resolver.resolve('./runtime/vue/composables/use-sessions') },
    { name: 'unwrapAuth', from: resolver.resolve('./runtime/vue/utils/auth-result') },
    { name: 'useBackendConfig', from: resolver.resolve('./runtime/vue/composables/use-backend-config') },
    { name: 'useEmailStatus', from: resolver.resolve('./runtime/vue/composables/use-email-status') },
    { name: 'useSandboxInbox', from: resolver.resolve('./runtime/vue/composables/use-sandbox-inbox') },
    { name: 'useWorkflowStatus', from: resolver.resolve('./runtime/vue/composables/use-workflow') },
    { name: 'useAiStream', from: resolver.resolve('./runtime/vue/composables/use-ai-stream') },
  ]
  for (const composable of composables) {
    addImports(composable)
  }

  // Nitro-side neutral name for the base module's `convexAuth(event)` service,
  // aliased straight from the base runtime file (same file its own
  // registration uses).
  const serverRuntime = resolveBaseServerRuntime()
  if (serverRuntime) {
    addServerImports([
      { name: 'convexAuth', as: 'backendAuth', from: serverRuntime },
    ])
  }
  else {
    logger.warn(
      '`backendAuth` auto-import unavailable — could not locate the nuxt-convex-module server runtime '
      + '(neither its `./better-auth/server` export nor a stub-linked src/). Reinstall nuxt-convex-module, '
      + 'or import `convexAuth` from `nuxt-convex-module/better-auth/server` directly.',
    )
  }
}

/**
 * The neutral `auth` route middleware: the base module registers its guard as
 * `convex-auth` (since nuxt-convex-module 0.10), and this package promises the
 * brand-neutral name — the built-in pages, the docs and the scaffold all say
 * `definePageMeta({ middleware: 'auth' })`. Both names resolve to the same
 * file: the guard that lives beside the `better-auth/server` runtime this
 * package already aliases for `backendAuth`, so there is no second
 * implementation to keep in step. Without the base runtime on disk the base
 * module's own registration is missing too, so the warning next to
 * `backendAuth` already covers it.
 */
export function registerAuthMiddleware(): void {
  const middleware = resolveBaseAuthMiddleware()
  if (!middleware) return
  addRouteMiddleware({ name: 'auth', path: middleware, global: false })
}

/**
 * The neutral names of the base module's billing links. `nuxt-convex-module`
 * registers `<CheckoutLink>` and `<CustomerPortalLink>` (its Vue ports of
 * `@convex-dev/polar/react`) as global components in every app — provider
 * names on this package's otherwise brand-neutral surface. Both stay
 * registered; `<BillingCheckoutLink>` and `<BillingPortalLink>` point at the
 * same exports, and are what the docs and the scaffold name. Without the base
 * runtime on disk there is nothing to alias (and the base module's own
 * registration is missing too).
 */
export function registerBillingLinkComponents(): void {
  const components = resolveBasePolarComponents()
  if (!components) return
  addComponent({ name: 'BillingCheckoutLink', filePath: components, export: 'CheckoutLink' })
  addComponent({ name: 'BillingPortalLink', filePath: components, export: 'CustomerPortalLink' })
}

/**
 * The base module's `polar/vue` runtime file (its `./polar/vue` export,
 * resolved with ESM conditions like the server runtime above). `undefined`
 * when it is not on disk.
 */
function resolveBasePolarComponents(): string | undefined {
  try {
    const exported = resolveModule('nuxt-convex-module/polar/vue', { url: new URL(import.meta.url) })
    return existsSync(exported) ? exported : undefined
  }
  catch {
    return undefined
  }
}

/**
 * The base module's route middleware file, `middleware.js` next to its
 * `better-auth/server` runtime (`dist/runtime/better-auth/nuxt/`). `undefined`
 * when the runtime is not on disk.
 */
function resolveBaseAuthMiddleware(): string | undefined {
  const serverRuntime = resolveBaseServerRuntime()
  if (!serverRuntime) return undefined
  const dir = dirname(serverRuntime)
  for (const candidate of ['middleware.js', 'middleware.mjs', 'middleware.ts']) {
    const file = join(dir, candidate)
    if (existsSync(file)) return file
  }
  return undefined
}

/**
 * The base module's `better-auth/server` runtime file for the `backendAuth`
 * server auto-import: the package's `./better-auth/server` export (resolved
 * with ESM conditions, since that subpath exports `import`/`types` only and
 * `require.resolve` cannot see it). `undefined` when it is not on disk.
 */
function resolveBaseServerRuntime(): string | undefined {
  try {
    const exported = resolveModule('nuxt-convex-module/better-auth/server', { url: new URL(import.meta.url) })
    return existsSync(exported) ? exported : undefined
  }
  catch {
    return undefined
  }
}

/**
 * Fallback ambient types for `#backend/*` until `convex dev` emits codegen,
 * re-rendered live the moment `_generated/api` appears (mirrors the base
 * module's `#convex/*` fallback).
 */
export function registerBackendTypeFallback(nuxt: Nuxt): void {
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
