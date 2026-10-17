import { existsSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { addComponent, addImports, addRouteMiddleware, addServerImports, addTypeTemplate, resolveModule, updateTemplates, type Resolver } from '@nuxt/kit'
import type { Nuxt, NuxtHooks } from '@nuxt/schema'
import { backendTypeFallbackContents, hasGeneratedApi, resolveFunctionsDir } from '../aliases'
import { logger } from './logger'

// What the module registers by name — the composables, components, server
// imports and route middleware every app gets — and the `#backend/*`
// fallback types.

/**
 * Expose the SaaS layer as Nuxt auto-imports — one name per concept. The core
 * data composables (`useQuery`, `useMutation`, ...) come from
 * `nuxt-convex-module`; `useAuth` is this package's extended service over
 * the base module's, whose own name {@link hideBaseBrandNames} hides.
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
    name: 'BillingCheckoutLink',
    export: 'BillingCheckoutLink',
    filePath: resolver.resolve('./runtime/vue/components/billing-links'),
  })
  addComponent({
    name: 'BillingPortalLink',
    export: 'BillingPortalLink',
    filePath: resolver.resolve('./runtime/vue/components/billing-links'),
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
    { name: 'useBackendClient', from: resolver.resolve('./runtime/vue/composables/base-aliases') },
    { name: 'useLoginFlow', from: resolver.resolve('./runtime/vue/composables/use-login-flow') },
    { name: 'useEmailChange', from: resolver.resolve('./runtime/vue/composables/use-email-change') },
    { name: 'useOrganization', from: resolver.resolve('./runtime/vue/composables/use-organization') },
    { name: 'useSearch', from: resolver.resolve('./runtime/vue/composables/use-search') },
    { name: 'useAggregate', from: resolver.resolve('./runtime/vue/composables/use-aggregate') },
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
    { name: 'getBackendError', from: resolver.resolve('./runtime/vue/utils/backend-error') },
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
 * `convex-auth` (since nuxt-convex-module 0.10), and this package names it
 * `auth` — the built-in pages, the docs and the scaffold all say
 * `definePageMeta({ middleware: 'auth' })`. It is the same file: the guard
 * that lives beside the `better-auth/server` runtime this package already
 * aliases for `backendAuth`, so there is no second implementation to keep in
 * step. Without the base runtime on disk the base module's own registration
 * is missing too, so the warning next to `backendAuth` already covers it.
 */
export function registerAuthMiddleware(): void {
  const middleware = resolveBaseAuthMiddleware()
  if (!middleware) return
  addRouteMiddleware({ name: 'auth', path: middleware, global: false })
}

/**
 * The neutral names of the base module's components that carry a provider's
 * vocabulary: `<StorageImage>` is its `<ConvexImage>`, pointing at the same
 * export. Its `<CheckoutLink>` and `<CustomerPortalLink>` are replaced
 * outright by this package's `<BillingCheckoutLink>` and
 * `<BillingPortalLink>`, bound to its own checkout and portal.
 * {@link hideBaseBrandNames} hides the originals. Without the base runtime
 * on disk there is nothing to alias (and the base module's own registration
 * is missing too).
 *
 * In development the old names stay registered as stand-ins that warn once,
 * naming the new one, and render it: a type check cannot see a component name
 * in a template, so this is where an app still using one finds out. A
 * production build has no stand-ins.
 */
export function registerBaseComponentAliases(resolver: Resolver, nuxt: Nuxt): void {
  const renamed = (name: string, file: string) => {
    // Priority 1: it replaces the base module's registration under the same name, whichever hook runs first.
    if (nuxt.options.dev) addComponent({ name, export: name, filePath: resolver.resolve(`./runtime/vue/components/${file}`), priority: 1 })
  }
  // The billing links are the package's own (registered with the other
  // components), bound to its checkout and portal: the base module's bind by
  // name and create a session on render. The old names stand in for them.
  if (resolveBaseRuntime('nuxt-convex-module/polar/vue')) {
    renamed('CheckoutLink', 'renamed-billing-links')
    renamed('CustomerPortalLink', 'renamed-billing-links')
  }
  const client = resolveBaseRuntime('nuxt-convex-module/client')
  if (client) {
    // The component's own file when the build has one (what the base module
    // registers), so a page using it does not pull in the whole client entry.
    const own = ['components/convex-image.js', 'components/convex-image.mjs', 'components/convex-image.ts']
      .map(file => join(dirname(client), file))
      .find(file => existsSync(file))
    addComponent({ name: 'StorageImage', filePath: own ?? client, export: 'ConvexImage' })
    renamed('ConvexImage', 'renamed-storage-image')
  }
}

/** A path with `/` separators, the way kit's resolver registers them on every platform. */
const slashed = (path: string): string => path.replaceAll('\\', '/')

/**
 * The base module's package directory, as resolved and as its real path (a
 * pnpm or linked install registers through either), each ending in `/`.
 * Empty when it is not installed, so nothing reads as the base module's.
 */
function baseModuleRoots(): string[] {
  const manifest = resolveBaseRuntime('nuxt-convex-module/package.json')
  if (!manifest) return []
  const root = dirname(manifest)
  return [...new Set([root, realpathSync(root)])].map(dir => `${slashed(dir).replace(/\/$/, '')}/`)
}

/** An auto-import or component name that says the platform's or a provider's name. */
const BRAND_NAME = /convex|betterauth|polar|resend/i

/**
 * The base module's components hidden although their names say no brand:
 * the provider's own words for its billing links, with neutral aliases above.
 */
const PROVIDER_WORDED_COMPONENTS = new Set(['CheckoutLink', 'CustomerPortalLink'])

/**
 * Keep the base module's brand-named surface out of an app that uses this
 * package: its composables (`useConvex`, `useConvexQuery`, `useBetterAuth`,
 * `provideConvexAuth`, …), its components (`<ConvexImage>`, `<CheckoutLink>`,
 * `<CustomerPortalLink>`, and `<ConvexProviderWithClerk>` /
 * `<ConvexProviderWithAuth0>` when those integrations are on), its
 * `convex-auth` route middleware and its Nitro imports (`convexAuth`,
 * `convexBetterAuthNuxt`). Most have a neutral name here — `useBackendClient`,
 * `useQuery`, `useAuth`, `useAuthState`, `<StorageImage>`,
 * `<BillingCheckoutLink>`, `<BillingPortalLink>`, `auth` and `backendAuth`
 * — so an app sees one name per concept; the rest stay an explicit import
 * from the base module.
 *
 * The base module registers through the same hooks, and Nuxt installs it
 * after this module, so a filter added as one more hook would run before its
 * entries arrive. The filters run after each hook call instead, once every
 * handler has added its entries, whatever order the modules installed in.
 * One rule for imports and components alike: a brand-named entry whose file
 * lives in the base module's package directory goes. Nothing else is touched
 * — not the aliases above, not an app file that happens to sit under a
 * directory of the same name — and an argument of an unexpected shape is
 * left alone rather than failing the hook. The base module's own runtime
 * imports what it uses explicitly, so nothing it ships breaks.
 */
export function hideBaseBrandNames(nuxt: Nuxt): void {
  const roots = baseModuleRoots()
  const fromBaseModule = (path: unknown): boolean =>
    typeof path === 'string' && roots.some(root => slashed(path).startsWith(root))
  const hiddenImport = (entry: { name?: string, as?: string, from?: string } | undefined) =>
    fromBaseModule(entry?.from) && BRAND_NAME.test(entry?.as ?? entry?.name ?? '')
  const hiddenComponent = (component: { pascalName?: string, filePath?: string } | undefined) =>
    fromBaseModule(component?.filePath)
    && (BRAND_NAME.test(component?.pascalName ?? '') || PROVIDER_WORDED_COMPONENTS.has(component?.pascalName ?? ''))
  nuxt.hooks.afterEach(({ name, args }) => {
    switch (name) {
      case 'imports:extend':
        filterInPlace(args[0], (entry: Parameters<NuxtHooks['imports:extend']>[0][number]) => !hiddenImport(entry))
        break
      case 'components:extend':
        filterInPlace(args[0], (component: Parameters<NuxtHooks['components:extend']>[0][number]) => !hiddenComponent(component))
        break
      case 'app:resolve':
        filterInPlace(args[0], (middleware: { name?: string, path?: string } | undefined) =>
          !(middleware?.name === 'convex-auth' && fromBaseModule(middleware.path)), 'middleware')
        break
      case 'nitro:config':
        filterInPlace((args[0] as Parameters<NuxtHooks['nitro:config']>[0] | undefined)?.imports, (entry: { name?: string, as?: string, from?: string }) => !hiddenImport(entry), 'imports')
        break
    }
  })
}

/**
 * Remove the entries `keep` refuses, in place: the hooks hand over the array
 * every module shares. `list` (or its `key` property) is checked to be an
 * array first, since a throw here would reject the whole hook call.
 */
function filterInPlace<T>(holder: unknown, keep: (entry: T) => boolean, key?: string): void {
  const list = key === undefined ? holder : (holder as Record<string, unknown> | undefined)?.[key]
  if (!Array.isArray(list)) return
  for (let index = list.length - 1; index >= 0; index--) {
    if (!keep(list[index] as T)) list.splice(index, 1)
  }
}

/**
 * One of the base module's runtime files, by its package export (resolved
 * with ESM conditions like the server runtime below). `undefined` when it is
 * not on disk.
 */
function resolveBaseRuntime(specifier: string): string | undefined {
  try {
    const exported = resolveModule(specifier, { url: new URL(import.meta.url) })
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
  return resolveBaseRuntime('nuxt-convex-module/better-auth/server')
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
