import { existsSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { addComponent, addImports, addPluginTemplate, addRouteMiddleware, addServerImports, addTemplate, addTypeTemplate, resolveModule, updateTemplates, type Resolver } from '@nuxt/kit'
import type { Nuxt, NuxtHooks } from '@nuxt/schema'
import { backendTypeFallbackContents, hasGeneratedApi, resolveFunctionsDir } from '../aliases'
import { logger } from './logger'
import { protectGuardedPages } from './pages'
import { REGISTERED_UI, uiPath } from '../ui/registry'

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

  // Every packaged component and part, by the name an app sees it under
  // (src/ui/registry.ts). A part is registered too: an app component of the
  // same name replaces it everywhere, since its parent renders it by name.
  for (const entry of REGISTERED_UI) {
    const component = { name: entry.name, export: 'default', filePath: resolver.resolve(`./runtime/vue/components/${uiPath(entry)}.vue`) }
    addComponent(entry.lazy ? lazily(component) : component)
  }

  const composables: Array<{ name: string, from: string }> = [
    // Backend-neutral names over the base module's brand-named surface.
    { name: 'useConnectionState', from: resolver.resolve('./runtime/vue/composables/base-aliases') },
    { name: 'useBackendClient', from: resolver.resolve('./runtime/vue/composables/base-aliases') },
    { name: 'useLoginFlow', from: resolver.resolve('./runtime/vue/composables/use-login-flow') },
    { name: 'useEmailChange', from: resolver.resolve('./runtime/vue/composables/use-email-change') },
    { name: 'useWorkspace', from: resolver.resolve('./runtime/vue/composables/use-workspace') },
    { name: 'useSearch', from: resolver.resolve('./runtime/vue/composables/use-search') },
    { name: 'useBilling', from: resolver.resolve('./runtime/vue/composables/use-billing') },
    { name: 'useFeatures', from: resolver.resolve('./runtime/vue/composables/use-features') },
    { name: 'useCredits', from: resolver.resolve('./runtime/vue/composables/use-credits') },
    { name: 'usePricing', from: resolver.resolve('./runtime/vue/composables/use-pricing') },
    { name: 'useCampaign', from: resolver.resolve('./runtime/vue/composables/use-campaign') },
    { name: 'useOrders', from: resolver.resolve('./runtime/vue/composables/use-orders') },
    { name: 'useUsage', from: resolver.resolve('./runtime/vue/composables/use-usage') },
    { name: 'useGifts', from: resolver.resolve('./runtime/vue/composables/use-gifts') },
    { name: 'useReferrals', from: resolver.resolve('./runtime/vue/composables/use-referrals') },
    { name: 'useReferralAdmin', from: resolver.resolve('./runtime/vue/composables/use-referral-admin') },
    { name: 'usePasskeys', from: resolver.resolve('./runtime/vue/composables/use-passkeys') },
    { name: 'useSessions', from: resolver.resolve('./runtime/vue/composables/use-sessions') },
    { name: 'useReauthentication', from: resolver.resolve('./runtime/vue/composables/use-reauthentication') },
    { name: 'useAuditLog', from: resolver.resolve('./runtime/vue/composables/use-audit-log') },
    { name: 'useAccount', from: resolver.resolve('./runtime/vue/composables/use-account') },
    { name: 'useConsents', from: resolver.resolve('./runtime/vue/composables/use-consents') },
    { name: 'useAdmin', from: resolver.resolve('./runtime/vue/composables/use-admin') },
    { name: 'useFlag', from: resolver.resolve('./runtime/vue/composables/use-flags') },
    { name: 'useFlagAdmin', from: resolver.resolve('./runtime/vue/composables/use-flags') },
    { name: 'useAccessPhase', from: resolver.resolve('./runtime/vue/composables/use-access') },
    { name: 'useInvite', from: resolver.resolve('./runtime/vue/composables/use-access') },
    { name: 'useAccessAdmin', from: resolver.resolve('./runtime/vue/composables/use-access') },
    { name: 'useWaitlist', from: resolver.resolve('./runtime/vue/composables/use-waitlist') },
    { name: 'useWaitlistAdmin', from: resolver.resolve('./runtime/vue/composables/use-waitlist-admin') },
    { name: 'useShareLink', from: resolver.resolve('./runtime/vue/composables/use-share-link') },
    { name: 'useUploadField', from: resolver.resolve('./runtime/vue/composables/use-upload-field') },
    { name: 'useNotifications', from: resolver.resolve('./runtime/vue/composables/use-notifications') },
    { name: 'useNotificationInbox', from: resolver.resolve('./runtime/vue/composables/use-notification-inbox') },
    { name: 'useEmailPreferences', from: resolver.resolve('./runtime/vue/composables/use-email-preferences') },
    { name: 'usePushSubscription', from: resolver.resolve('./runtime/vue/composables/use-push-subscription') },
    { name: 'useAnnouncements', from: resolver.resolve('./runtime/vue/composables/use-announcements') },
    { name: 'useAnnouncementsAdmin', from: resolver.resolve('./runtime/vue/composables/use-announcements') },
    { name: 'useContactForm', from: resolver.resolve('./runtime/vue/composables/use-contact-form') },
    { name: 'useOnboarding', from: resolver.resolve('./runtime/vue/composables/use-onboarding') },
    { name: 'useActivation', from: resolver.resolve('./runtime/vue/composables/use-activation') },
    { name: 'useExperiment', from: resolver.resolve('./runtime/vue/composables/use-experiment') },
    { name: 'useAppShell', from: resolver.resolve('./runtime/vue/composables/use-app-shell') },
    { name: 'useInboxAdmin', from: resolver.resolve('./runtime/vue/composables/use-inbox-admin') },
    { name: 'getBackendError', from: resolver.resolve('./runtime/vue/utils/backend-error') },
    { name: 'useBackendConfig', from: resolver.resolve('./runtime/vue/composables/use-backend-config') },
    { name: 'useLabels', from: resolver.resolve('./runtime/vue/composables/use-labels') },
    { name: 'useBackendPagePath', from: resolver.resolve('./runtime/vue/composables/use-backend-page-path') },
    { name: 'useReturnPath', from: resolver.resolve('./runtime/vue/composables/use-return-path') },
    { name: 'useEmailStatus', from: resolver.resolve('./runtime/vue/composables/use-email-status') },
    { name: 'useSandboxInbox', from: resolver.resolve('./runtime/vue/composables/use-sandbox-inbox') },
    { name: 'useWorkflowStatus', from: resolver.resolve('./runtime/vue/composables/use-workflow') },
    { name: 'useAiStream', from: resolver.resolve('./runtime/vue/composables/use-ai-stream') },
    { name: 'useJob', from: resolver.resolve('./runtime/vue/composables/use-job') },
    { name: 'useAiLabel', from: resolver.resolve('./runtime/vue/composables/use-ai-label') },
    { name: 'useChat', from: resolver.resolve('./runtime/vue/composables/use-chat') },
    { name: 'useHumanCheck', from: resolver.resolve('./runtime/vue/composables/use-human-check') },
  ]
  for (const composable of composables) {
    addImports(composable)
  }

  // Nitro-side neutral name for the base module's `convexAuth(event)`
  // service: the same service, its calls reported to the monitoring layer
  // when they fail (tagged with the function they ran). Registered only
  // when the base runtime it wraps is on disk.
  const serverRuntime = resolveBaseServerRuntime()
  if (serverRuntime) {
    addServerImports([
      { name: 'backendAuth', from: resolver.resolve('./runtime/server/monitoring/backend-calls') },
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

/** What `addComponent` takes for one of the package's components. */
interface PackageComponent {
  name: string
  export: string
  filePath: string
}

/**
 * Register a heavy component lazily, by passing its options through this:
 * `addComponent(lazily({ name, export, filePath }))`. It is registered from
 * a generated module that exports it, under its name, as an async component
 * over its file (a default export included), so its code is fetched when one
 * first renders: the server awaits it, and the browser's hydration waits for
 * it. Its type is still read from its own file. A component is heavy when it
 * brings a library of its own or its own code passes 10 kB gzipped
 * (CONTRIBUTING, "Budgets"); none registered above is, today.
 */
export function lazily(component: PackageComponent): PackageComponent & { declarationPath: string } {
  const filePath = slashed(component.filePath)
  const lazy = addTemplate({
    filename: `nuxt-backend/lazy/${component.name}.mjs`,
    getContents: () => lazyComponentModule(component.name, component.export, filePath),
  })
  return { name: component.name, export: component.name, filePath: lazy.dst, declarationPath: filePath }
}

/**
 * The module a lazy component is registered from: `name`, an async
 * component over the `exported` export (`default` included) of the file at
 * `filePath`.
 */
export function lazyComponentModule(name: string, exported: string, filePath: string): string {
  if (!/^[A-Z][\w$]*$/.test(name)) throw new Error(`lazily: "${name}" is not a component name a module can export`)
  return [
    `import { defineAsyncComponent } from 'vue'`,
    `export const ${name} = defineAsyncComponent(() => import(${JSON.stringify(filePath)}).then(module => module[${JSON.stringify(exported)}]))`,
    '',
  ].join('\n')
}

/**
 * The page guard, `definePageMeta({ auth })`, the one way a page says who
 * may open it (`true`, or `{ role, workspace, feature, hidden }`):
 * a global route middleware, so a page's rules guard it with no middleware
 * named, and the `auth` key typed on every app's `PageMeta`. A page without
 * rules costs the guard one look at its meta. A guarded page's path is kept
 * out of caches (protectGuardedPages), and an app with no error page of its
 * own gets one that shows the 403 with `<AccessDenied>`.
 */
export function registerPageAccess(resolver: Resolver, nuxt: Nuxt): void {
  addRouteMiddleware({ name: 'backend-access', path: resolver.resolve('./runtime/vue/middleware/page-access'), global: true })
  // The `PageMeta` augmentation lives beside the rules' type; a type of its
  // own here brings that file into the app's type program.
  addTypeTemplate({
    filename: 'types/nuxt-backend-page-access.d.ts',
    getContents: () => `export type { PageAccessRules } from ${JSON.stringify(slashed(resolver.resolve('./runtime/vue/utils/page-access')))}\n`,
  }, { nuxt: true })
  protectGuardedPages(nuxt)
  // Nuxt's own error page, the one it falls back to when neither the app nor
  // a layer has an `error.vue`: the module's renders the same for anything
  // but a 403. An `error.vue` the app adds later replaces it again.
  const nuxtErrorPage = slashed(join(nuxt.options.appDir, 'components/nuxt-error-page.vue'))
  nuxt.hook('app:resolve', (app) => {
    if (app.errorComponent && slashed(app.errorComponent) === nuxtErrorPage) app.errorComponent = resolver.resolve('./runtime/vue/components/shell/ErrorPage.vue')
  })
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
export const BRAND_NAME = /convex|betterauth|polar|resend/i

/**
 * The base module's components hidden although their names say no brand:
 * the provider's own words for its billing links, with neutral aliases above.
 */
export const PROVIDER_WORDED_COMPONENTS = new Set(['CheckoutLink', 'CustomerPortalLink'])

/**
 * Keep the base module's brand-named surface out of an app that uses this
 * package: its composables (`useConvex`, `useConvexQuery`, `useBetterAuth`,
 * `provideConvexAuth`, …), its components (`<ConvexImage>`, `<CheckoutLink>`,
 * `<CustomerPortalLink>`, and `<ConvexProviderWithClerk>` /
 * `<ConvexProviderWithAuth0>` when those integrations are on), its
 * `convex-auth` route middleware and its Nitro imports (`convexAuth`,
 * `convexBetterAuthNuxt`). Most have a neutral name here — `useBackendClient`,
 * `useQuery`, `useAuth`, `<StorageImage>`,
 * `<BillingCheckoutLink>`, `<BillingPortalLink>` and `backendAuth`
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
 * The base module's `better-auth/server` runtime file, which the
 * `backendAuth` server auto-import wraps: its `./better-auth/server` export (resolved
 * with ESM conditions, since that subpath exports `import`/`types` only and
 * `require.resolve` cannot see it). `undefined` when it is not on disk.
 */
function resolveBaseServerRuntime(): string | undefined {
  return resolveBaseRuntime('nuxt-convex-module/better-auth/server')
}

/** The templates that change the moment `convex dev` emits `_generated/api`. */
const CODEGEN_GUARDED_TEMPLATES = ['types/nuxt-backend-api-fallback.d.ts', 'nuxt-backend-provide-api.mjs']

/**
 * Fallback ambient types for `#backend/*` until `convex dev` emits codegen,
 * and the plugin that provides the generated `api` app-wide, both re-rendered
 * live the moment `_generated/api` appears.
 *
 * The plugin is what every composable reads its namespace through
 * (`useBilling()` reads `api.billing`). The base module provided the `api`
 * until 0.12, which leaves it to the app. Before codegen the import would fail
 * the build, so the plugin is a no-op until then and the composables degrade
 * with their dev warning.
 */
export function registerBackendApi(resolver: Resolver, nuxt: Nuxt): void {
  const functionsDir = resolveFunctionsDir(nuxt.options.rootDir)
  const generated = () => hasGeneratedApi(nuxt.options.rootDir, functionsDir)
  addTypeTemplate({
    filename: 'types/nuxt-backend-api-fallback.d.ts',
    getContents: () => backendTypeFallbackContents(generated(), functionsDir),
  }, { nuxt: true, nitro: true })

  const namespaceModule = resolver.resolve('./runtime/vue/utils/namespace')
  addPluginTemplate({
    filename: 'nuxt-backend-provide-api.mjs',
    getContents: () => generated()
      ? [
          'import { defineNuxtPlugin } from \'#app\'',
          'import { api } from \'#backend/api\'',
          `import { provideBackendApi } from ${JSON.stringify(namespaceModule)}`,
          'export default defineNuxtPlugin({ name: \'nuxt-backend:api\', setup(nuxtApp) { provideBackendApi(api, nuxtApp.vueApp) } })',
          '',
        ].join('\n')
      : 'import { defineNuxtPlugin } from \'#app\'\nexport default defineNuxtPlugin({ name: \'nuxt-backend:api\', setup() {} })\n',
  })

  if (!nuxt.options.dev) return
  nuxt.hook('builder:watch', async (_event, path) => {
    if (!path.replace(/\\/g, '/').includes('_generated/api')) return
    await updateTemplates({ filter: template => CODEGEN_GUARDED_TEMPLATES.includes(template.filename) })
  })
}
