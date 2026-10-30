import { defineNuxtModule, addNitroPlugin, addPlugin, addServerHandler, createResolver, hasNuxtModule } from '@nuxt/kit'
import { defu } from 'defu'
import type { ModuleDependencies, Nuxt } from '@nuxt/schema'
import { dependencyRange, moduleDir, packageVersion, runsFromSource } from './dirs'
import { backendAppConfigDefaults, type BackendAppConfigInput } from './runtime/config'
import { deriveDeploymentUrls, resolveSiteUrl } from './deployment'
import { registerBackendAliases } from './aliases'
import { resolvePagePath, type BackendPageKey, type ModulePagesOptions } from './pages'
import { registerDevtoolsPanel, runPreflight } from './nuxt/dev'
import { registerI18nMessages } from './nuxt/i18n'
import { registerLabels } from './nuxt/labels'
import { registerJobs } from './nuxt/jobs'
import { registerReports } from './nuxt/reports'
import { VISITOR_IP_ROUTE } from './convex/constants'
import { monitoringDependency, monitoringWiring, registerMonitoring, type MonitoringPublicConfig } from './nuxt/monitoring'
import { assertModuleOptions } from './nuxt/options'
import { registerModulePages } from './nuxt/pages'
import { registerBrandFile } from './nuxt/brand'
import { registerInstallable } from './nuxt/installable'
import { registerPathsFile } from './nuxt/paths'
import { hideBaseBrandNames, registerBackendApi, registerBaseComponentAliases, registerPageAccess, registerSaasComposables } from './nuxt/registry'
import { imageDependency } from './nuxt/image'
import { registerStyles } from './nuxt/styles'
import { registerProtection } from './nuxt/protection'
import { securityDefaults, securityDisabled } from './nuxt/security'

// The module definition; the helpers setup calls live in nuxt/, one file
// per concern.

/**
 * Backend-neutral names for the Nitro `backendAuth(event)` service types —
 * the base module's `convexAuth` service under this package's terminology.
 * Type-only: erased at build, so none of the runtime resolution concerns the
 * `backendAuth` auto-import handles (see `registerSaasComposables`).
 */
export type { ConvexAuthOptions as BackendAuthOptions, ConvexAuthService as BackendAuthService } from 'nuxt-convex-module/better-auth/server'

// The page guard's vocabulary: the rules `definePageMeta({ auth })` takes, and
// what its 403 carries in `error.data`, for a typed `error.vue`.
export type { AccessDeniedData, AccessDeniedReason, PageAccessRules } from './runtime/vue/utils/access-rules'
export type { AdminTabMeta } from './runtime/vue/components/admin/admin-tabs'

/** Where the ready-made pages send a person once they are done. */
export interface ModuleRedirectsOptions {
  /**
   * Where the sign-in page sends a person after they sign in, when the
   * `?redirect=` the page guard added names no page of this site.
   * A path of this site, such as `/app`. Default `/`.
   */
  afterSignIn?: string
}

export interface ModuleOptions {
  /**
   * The deployment's URL (the `.convex.cloud` origin). Else
   * `NUXT_PUBLIC_BACKEND_URL`, else derived from `CONVEX_DEPLOYMENT`. The
   * HTTP-routes origin (`.convex.site`) derives from it; a custom domain in
   * front of them goes in `NUXT_PUBLIC_CONVEX_SITE_URL`.
   */
  url?: string
  authRoute?: string
  /**
   * Where the ready-made pages mount (sign-in, pricing, settings, profile,
   * security and the invitation pages). Every page is on; give a key a path
   * to move it, or `false` to turn it off. To replace a page, put an app
   * page at its path: an app page always wins over the module's.
   */
  pages?: ModulePagesOptions
  /** Where the ready-made pages send a person once they are done. See {@link ModuleRedirectsOptions}. */
  redirects?: ModuleRedirectsOptions
  /**
   * The Backend tab in Nuxt DevTools (dev only): the deployment and its env
   * names, live checks and doctor on demand, the signed-in account, billing,
   * email and the webhook delivery log. Enabled by
   * default whenever Nuxt DevTools is; set `false` to disable just the
   * Backend tab.
   */
  devtools?: boolean
  /**
   * The package's stylesheets (default `true`): the `--bk-*` tokens on
   * `:root` and the styles of each detected capability's components, inside
   * `@layer nuxt-backend`, so any rule of the app's wins. `false` loads no
   * package CSS: the components keep their markup, `data-*` hooks and
   * accessibility attributes, unstyled.
   */
  css?: boolean
}

/** The install and upgrade steps a published build declares (see `runsFromSource`). */
const lifecycleHooks = {
  async onInstall(nuxt: Nuxt): Promise<void> {
    const { installProject } = await import('./nuxt/install')
    await installProject(nuxt)
  },
  async onUpgrade(_nuxt: Nuxt, _options: ModuleOptions, previousVersion: string): Promise<void> {
    const { announceUpgrade } = await import('./nuxt/install')
    announceUpgrade(previousVersion, packageVersion())
  },
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-backend',
    version: packageVersion(),
    configKey: 'backend',
    // Surfaced by Nuxt DevTools and the nuxt/modules registry (which reads it
    // from dist/module.json and uses it as the listing's website).
    docs: 'https://nuxt-backend.dev',
    // From 4.6.2: the server code is written against `nuxt/server`, which
    // ships in 4.6, and nuxt-convex-module 0.12 needs 4.6 too. Not Nuxt 5
    // yet: the package's server code and nuxt-security still run on h3 1, and on Nuxt 5 Nuxt disables
    // the module with its own incompatibility warning instead of letting it
    // fail at runtime.
    compatibility: { nuxt: '^4.6.2' },
  },
  defaults: {
    devtools: true,
  },
  // `npx nuxt module add nuxt-backend` is the whole install: its `nuxt
  // prepare` calls onInstall once, and at an interactive terminal it sets the
  // project up as `npx nuxt-backend init` does, installing `convex` too. On a
  // newer version than the app recorded, onUpgrade says what `upgrade` does.
  // Nuxt records the version in the app's `.nuxtrc` (`setups.nuxt-backend`)
  // for any module that declares either hook, so only a published build
  // declares them: run from source, in this repository's own prepare, there
  // is no app to set up and nothing to record. Lazy: none of it loads on a
  // normal start.
  ...(runsFromSource ? {} : lifecycleHooks),
  // The Convex + Better Auth + Polar framework integration. Declared as a
  // module dependency (not `installModule`) so Nuxt dedupes it when the app
  // lists it too, and so its own dependencies (nuxt-security with the
  // Convex-aware CSP) chain through. `defaults` forward the `backend.*`
  // options (user `convex.*` config wins over them); `overrides` force-enable
  // the integrations this package bundles. Each `version` is the range this
  // package declares for that module, so a second, mismatched copy the app
  // installs fails with Nuxt's own error instead of half-working.
  moduleDependencies: (nuxt): ModuleDependencies => {
    const rawOptions = nuxt.options as unknown as Record<string, unknown>
    // Nuxt resolves the dependencies before any module's setup runs: refuse
    // an option 0.2 removed here, before the login path below is read.
    assertModuleOptions(rawOptions.backend)
    const backend = (rawOptions.backend ?? {}) as ModuleOptions
    const convex = (rawOptions.convex ?? {}) as Record<string, unknown>
    const resolver = createResolver(moduleDir)
    // The page guard redirects to the sign-in page's path, wherever it
    // mounts (and whether the module's page or the app's own serves it).
    const loginPath = resolvePagePath(backend.pages, 'login')
    // Both URLs are derivable from the deployment slug the platform CLI
    // writes to .env.local, so neither is required config. This package's own
    // env name is NUXT_PUBLIC_BACKEND_URL, and the site origin (the HTTP
    // routes) derives from it; precedence for the url *default* is
    // backend.url → that name → derived. The base module reads the platform's
    // own NUXT_PUBLIC_CONVEX_* names directly, so setting one of those still
    // works and wins over a default: NUXT_PUBLIC_CONVEX_SITE_URL is how a
    // custom domain in front of the HTTP routes is named.
    const derived = deriveDeploymentUrls(nuxt.options.rootDir)
    return {
      // The error-reporting SDK's module, only once it is installed and a
      // DSN is set: an app without either never bundles it (an optional
      // peer). Its defaults point it at the package's own config files. The
      // same decision registers the capture plugins in setup.
      ...monitoringDependency(monitoringWiring(nuxt), resolver),
      // Installed here, by this package, so every app gets the security
      // headers and the Convex-aware CSP the docs promise. The base module
      // treats nuxt-security as optional and only auto-detects a package the
      // app itself declares; its `convex.security` default below is read at
      // its own setup, after Nuxt has already resolved the module graph, so
      // asking the base module alone would register its CSP plugin against a
      // nuxt-security that was never installed. First in the list, so it is
      // set up before the base module looks for it. `security: false` in
      // nuxt.config still disables it outright (nuxt-security's own switch).
      // Its defaults add the nonce and, in a production build, Trusted Types (src/nuxt/security.ts).
      ...(securityDisabled(nuxt) ? {} : { 'nuxt-security': { version: dependencyRange('nuxt-security'), defaults: securityDefaults(nuxt.options.dev) } }),
      // <NuxtImg provider="backend"> once the app adds @nuxt/image: the
      // provider and the deployment's file hosts as its defaults.
      ...imageDependency(resolver, [backend.url ?? process.env.NUXT_PUBLIC_BACKEND_URL ?? derived?.url, resolveSiteUrl({ url: backend.url, env: process.env, derived })]),
      'nuxt-convex-module': {
        version: dependencyRange('nuxt-convex-module'),
        defaults: {
          url: backend.url ?? process.env.NUXT_PUBLIC_BACKEND_URL ?? derived?.url,
          // A platform build that knows only the client URL still gets its
          // HTTP-actions origin (the .site twin of a .cloud URL).
          siteUrl: resolveSiteUrl({ url: backend.url, env: process.env, derived }),
          // nuxt-security is this package's dependency, not the app's, and the
          // base module only auto-detects a package the app itself declares —
          // so ask for it outright (the module itself installs it, above).
          // Every app gets the security headers and the Convex-aware CSP the
          // docs promise; a user's `convex.security: false` still wins over
          // this default.
          security: true,
          // The base module rewrites a plain `nuxt dev` script to
          // `convex dev --start "nuxt dev"` on `nuxt dev` and `nuxt prepare`.
          // Here that command never starts Nuxt on a new deployment: the
          // scaffold's `backendEnv` requires AUTH_SECRET and SITE_URL, the
          // first push fails without them, Convex only starts the child after a
          // successful push, and the values come from `nuxt-backend dev`'s env
          // provisioning, which runs before Convex does. So the scripts stay the
          // app's own; a user's `convex.devScript: true` still wins.
          devScript: false,
        },
        overrides: {
          // Better Auth with this package's passwordless client (OTP +
          // passkeys). A user-supplied `convex.betterAuth` object is spread
          // over the package's seed, so its fields win (a custom `authClient`
          // replaces ours) while an object that only sets other options
          // (`crossDomainCallbackRoute`, …) keeps the bundled client. Only a
          // disable is overridden outright.
          betterAuth: {
            authClient: resolver.resolve('./runtime/vue/auth-client'),
            loginPath,
            // The same-origin proxy route (`betterAuth.authRoute` in the base
            // module since 0.12). Unset, the base module mounts it at /api/auth.
            ...(backend.authRoute !== undefined ? { authRoute: backend.authRoute } : {}),
            ...(typeof convex.betterAuth === 'object' && convex.betterAuth !== null ? convex.betterAuth : {}),
          },
          polar: true,
          // This package's auth story is Better Auth — don't let auto-detect
          // enable a second auth provider just because its SDK is resolvable.
          clerk: false,
          auth0: false,
        },
      },
    }
  },
  async setup(options, nuxt) {
    // Again for options passed inline (`modules: [['nuxt-backend', { … }]]`),
    // which `moduleDependencies` does not see.
    assertModuleOptions(options)
    const resolver = createResolver(moduleDir)

    // `#backend/*` — the backend-branded aliases for the Convex functions
    // folder (same targets as the base module's `#convex/*`).
    registerBackendAliases(nuxt, resolver.resolve('./runtime'))
    registerBackendApi(resolver, nuxt)

    // The content layer: `appConfig.backend` (plan catalog, labels, brand).
    // defu keeps user `app.config.ts` values winning and HMR-reactive. Cast:
    // in a consumer typecheck the resolved AppConfig narrows `backend` to the
    // app's literal config (empty catalog arrays included), which the
    // defaults-merge intentionally widens — the two never overlap enough for a
    // direct assertion.
    nuxt.options.appConfig.backend = defu(
      nuxt.options.appConfig.backend as BackendAppConfigInput | undefined,
      backendAppConfigDefaults,
    ) as unknown as typeof nuxt.options.appConfig.backend

    // A server that starts with only NUXT_PUBLIC_BACKEND_URL gets the base
    // module's two URLs from it (the render's auth-token prefetch needs the site one).
    const backendUrl = resolver.resolve('./runtime/server/backend-url')
    addNitroPlugin({ nitro2: backendUrl, nitro3: backendUrl })

    registerSaasComposables(resolver)
    // The English labels by group: a page ships the groups its components read.
    registerLabels(resolver)
    // The package's messages for an app's @nuxtjs/i18n, when it has one.
    registerI18nMessages(resolver, nuxt)

    // The tokens and each detected capability's component styles, first in
    // line and layered (`@layer nuxt-backend`), so any app rule wins over
    // them; none with `css: false` (src/nuxt/styles.ts).
    registerStyles(options.css, resolver, nuxt)

    // The page guard, the one way a page says who may open it: `definePageMeta({ auth })`.
    registerPageAccess(resolver, nuxt)
    // Without @nuxtjs/robots to answer the private pages' `robots: false`
    // rule, the pages carry the `noindex` meta tag themselves. Decided once
    // every module is installed, whichever order they are listed in.
    nuxt.hook('modules:done', () => {
      if (!hasNuxtModule('@nuxtjs/robots', nuxt)) addPlugin(resolver.resolve('./runtime/vue/plugins/noindex'))
    })
    // Off a guarded page to sign-in when the session ends under it.
    addPlugin({ src: resolver.resolve('./runtime/vue/plugins/session-ended'), mode: 'client' })
    // A new account to its first run at /welcome, once.
    if (options.pages?.welcome !== false) addPlugin({ src: resolver.resolve('./runtime/vue/plugins/onboarding-redirect'), mode: 'client' })
    // A return from checkout: the parameter off the address, the entitlements refreshed once.
    addPlugin({ src: resolver.resolve('./runtime/vue/plugins/checkout-return'), mode: 'client' })
    // A campaign link's UTM values, sent once for a signed-in person: the growth funnel's first touch.
    addPlugin({ src: resolver.resolve('./runtime/vue/plugins/first-touch'), mode: 'client' })
    // App activity and the browser's time zone, once a day: the sunset rule and quiet hours read them.
    addPlugin({ src: resolver.resolve('./runtime/vue/plugins/email-presence'), mode: 'client' })
    // The passkey ceremony, loaded once the page is idle (a tap then runs it straight through).
    addPlugin({ src: resolver.resolve('./runtime/vue/plugins/passkey-ceremony'), mode: 'client' })
    // The narrow Trusted Types `default` policy, for code that writes a sink without one of its own.
    if (!securityDisabled(nuxt)) addPlugin({ src: resolver.resolve('./runtime/vue/plugins/trusted-types.client'), mode: 'client' })
    registerBaseComponentAliases(resolver, nuxt)
    hideBaseBrandNames(nuxt)

    const pagesInfo = registerModulePages(options, resolver, nuxt)
    // The paths the backend links to, carried from this config into the functions directory.
    registerPathsFile(options, nuxt)
    // The brand the backend's emails read, carried from app.config beside it.
    registerBrandFile(nuxt)
    // The web push worker, and the web app manifest from the brand and two icons.
    registerInstallable(resolver, nuxt)

    // After the pages: it adds to the public runtime config they publish.
    registerProtection(resolver, nuxt)
    // Error reports, cron check-ins and the health route (the monitoring layer).
    registerMonitoring(resolver, nuxt)
    // The visitor's address for the billing provider's local pricing: a checkout is created on the deployment.
    addServerHandler({ route: VISITOR_IP_ROUTE, method: 'get', handler: { nuxt: resolver.resolve('./runtime/server/visitor-ip') } })
    // The admin console's Queue tab, once backend/jobs.ts defines a job queue.
    registerJobs(nuxt)
    registerReports(nuxt)

    runPreflight(options, nuxt)

    // The Backend tab in Nuxt DevTools, where a panel can be opened (nuxt/dev.ts).
    await registerDevtoolsPanel(options, resolver, nuxt, pagesInfo)
  },
})

// Typed `appConfig.backend` (content layer) and
// `runtimeConfig.public.backend.pages` (where each page mounts: every page
// does) for consumers. Same augmentation target as the
// base module's runtime-config typing (`@nuxt/schema`), not `nuxt/schema`,
// which only re-exports it: augmented through the re-export, this
// `AppConfigInput` did not merge with the other modules' and the website's
// `app.config.ts` (its UI library's keys) stopped type-checking.
declare module '@nuxt/schema' {
  interface AppConfigInput {
    backend?: BackendAppConfigInput
  }
  interface PublicRuntimeConfig {
    backend: {
      pages: Record<BackendPageKey, string | false>
      /** The same-origin auth proxy route (`backend.authRoute`). */
      authRoute: string
      /** `backend.redirects`, defaults filled in. */
      redirects: Required<ModuleRedirectsOptions>
      /** BotID checks requests in the browser: a build on Vercel. */
      botDetection: boolean
      /** The bot check's challenge site key, or empty: `NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY`. */
      challengeSiteKey: string
      /** The DSN the browser reports errors to, empty when nothing is wired. */
      monitoring: MonitoringPublicConfig
      /** `backend/jobs.ts` defines a job queue, as the build read it: the admin console shows its Queue tab. */
      jobs: boolean
      /** `backend/admin.ts` passes `reports` to `setupAdmin`, as the build read it: the admin console shows its Reports tab. */
      reports: boolean
      /**
       * An SEO module is installed, as the build detected it: the pricing
       * page adds Open Graph tags and schema.org products. Detected, never
       * a switch to set.
       *
       * @internal
       */
      seo: boolean
    }
  }
  interface RuntimeConfig {
    /** What the app's health route tells the backend it asks (server only). */
    backendHealth: {
      /** The deployment kind the build ran against, for the detail's wording; empty when none. */
      deployment: string
    }
  }
}
