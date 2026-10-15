import { defineNuxtModule, addPlugin, createResolver } from '@nuxt/kit'
import { defu } from 'defu'
import type { ModuleDependencies, Nuxt } from '@nuxt/schema'
import { dependencyRange, moduleDir, packageVersion } from './dirs'
import { backendAppConfigDefaults, type BackendAppConfigInput } from './runtime/config'
import { deriveDeploymentUrls, resolveSiteUrl } from './deployment'
import { provisionedEnvNames, readEnvFiles } from './env-push'
import { scaffoldBackendFiles } from './scaffold'
import { registerBackendAliases, resolveFunctionsDir } from './aliases'
import { resolvePagePath, type BackendPageKey, type ModulePagesOptions } from './pages'
import { buildDevtoolsInfo, readPackageVersions } from './devtools/info'
import type { BackendMcpFunctionKey } from './runtime/server/mcp/builtin'
import { isDevtoolsUiEnabled, isSiteUrlConfigured, runDevAutoEnv, runPreflight } from './nuxt/dev'
import { registerMcp, resolveMcpOptions } from './nuxt/mcp'
import { registerModulePages } from './nuxt/pages'
import { registerAuthMiddleware, registerBackendTypeFallback, registerBillingLinkComponents, registerSaasComposables } from './nuxt/registry'

// The module definition; the helpers setup calls live in nuxt/, one file
// per concern.

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
 * that call Convex as the signed-in user. Everything the tools expose is
 * already reachable through the product UI under the same user auth; OAuth
 * adds per-client consent and the deployment's `mcp` rate limit guards the
 * token exchange.
 */
export interface ModuleMcpOptions {
  /** MCP endpoint route. Default `/mcp` (the toolkit's default). */
  route?: string
  /** Server name/description/instructions forwarded to the toolkit. */
  name?: string
  description?: string
  instructions?: string
  /** Stateful transport sessions, forwarded to the toolkit. Default off. */
  sessions?: boolean | { enabled?: boolean, maxDuration?: number, maxSessions?: number }
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
  /**
   * Auto-scaffold missing Convex backend files on dev startup. Set `false`
   * when you scaffold explicitly with `npx nuxt-backend init`.
   */
  scaffold?: 'auto' | false
  /**
   * Where the ready-made pages mount (sign-in, pricing, settings, profile,
   * security, the invitation and agent-consent pages). Every page is on; give
   * a key a path to move it. To replace a page, put an app page at its path:
   * an app page always wins over the module's.
   */
  pages?: ModulePagesOptions
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
   * built-in account/billing/workspace tools. See {@link ModuleMcpOptions}.
   */
  mcp?: ModuleMcpOptions
  /**
   * The Backend tab in Nuxt DevTools (dev only): the deployment and its env
   * names, live checks and doctor on demand, the signed-in account, billing,
   * email, the webhook delivery log and the agent endpoint. Enabled by
   * default whenever Nuxt DevTools is; set `false` to disable just the
   * Backend tab.
   */
  devtools?: boolean
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-backend',
    version: packageVersion(),
    configKey: 'backend',
    // Surfaced by Nuxt DevTools and the nuxt/modules registry (which reads it
    // from dist/module.json and uses it as the listing's website).
    docs: 'https://nuxt-backend.dev',
    // From 4.1, where moduleDependencies with option forwarding arrived. Not
    // Nuxt 5 yet: every server handler here is written for Nitro 2 and h3 1,
    // and Nuxt 5 runs Nitro 3 — on it Nuxt disables the module with its own
    // incompatibility warning instead of letting it fail at runtime.
    compatibility: { nuxt: '^4.1.0' },
  },
  defaults: {
    scaffold: 'auto',
    autoEnv: true,
    devtools: true,
  },
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
    const backend = (rawOptions.backend ?? {}) as ModuleOptions
    const convex = (rawOptions.convex ?? {}) as Record<string, unknown>
    const resolver = createResolver(moduleDir)
    // The auth middleware redirects to the sign-in page's path, wherever it
    // mounts (and whether the module's page or the app's own serves it).
    const loginPath = resolvePagePath(backend.pages, 'login')
    // Both URLs are derivable from the deployment slug the platform CLI
    // writes to .env.local, so neither is required config. This package's own
    // env names are NUXT_PUBLIC_BACKEND_URL / NUXT_PUBLIC_BACKEND_SITE_URL;
    // precedence for these *defaults* is backend.* option → those names →
    // derived. The base module reads the platform's own NUXT_PUBLIC_CONVEX_*
    // names directly, so setting one of those still works and wins over a
    // default — preflight nudges you to the neutral name when it is the only
    // one set.
    const derived = deriveDeploymentUrls(nuxt.options.rootDir)
    const mcp = resolveMcpOptions(backend.mcp)
    return {
      // Installed here, by this package, so every app gets the security
      // headers and the Convex-aware CSP the docs promise. The base module
      // treats nuxt-security as optional and only auto-detects a package the
      // app itself declares; its `convex.security` default below is read at
      // its own setup, after Nuxt has already resolved the module graph, so
      // asking the base module alone would register its CSP plugin against a
      // nuxt-security that was never installed. First in the list, so it is
      // set up before the base module looks for it. `security: false` in
      // nuxt.config still disables it outright (nuxt-security's own switch).
      ...(securityDisabled(nuxt) ? {} : { 'nuxt-security': { version: dependencyRange('nuxt-security') } }),
      'nuxt-convex-module': {
        version: dependencyRange('nuxt-convex-module'),
        defaults: {
          url: backend.url ?? process.env.NUXT_PUBLIC_BACKEND_URL ?? derived?.url,
          // A platform build that knows only the client URL still gets its
          // HTTP-actions origin (the .site twin of a .cloud URL).
          siteUrl: resolveSiteUrl({ siteUrl: backend.siteUrl, url: backend.url, env: process.env, derived }),
          authRoute: backend.authRoute,
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
          // successful push, and the values come from this module's env
          // auto-provisioning, which runs inside Nuxt. So the scripts stay the
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
            ...(typeof convex.betterAuth === 'object' && convex.betterAuth !== null ? convex.betterAuth : {}),
          },
          polar: true,
          // This package's auth story is Better Auth — don't let auto-detect
          // enable a second auth provider just because its SDK is resolvable.
          clerk: false,
          auth0: false,
        },
      },
      // The MCP endpoint host. `defaults` forward `backend.mcp.*` — a user's
      // own top-level `mcp` config wins over them (same contract as the
      // `convex.*` forwarding above).
      '@nuxtjs/mcp-toolkit': {
        version: dependencyRange('@nuxtjs/mcp-toolkit'),
        defaults: {
          route: mcp.route,
          ...(mcp.name !== undefined ? { name: mcp.name } : {}),
          ...(mcp.description !== undefined ? { description: mcp.description } : {}),
          ...(mcp.instructions !== undefined ? { instructions: mcp.instructions } : {}),
          ...(mcp.sessions !== undefined ? { sessions: mcp.sessions } : {}),
        },
      },
    }
  },
  async setup(options, nuxt) {
    const resolver = createResolver(moduleDir)

    // Scaffold the minimum Convex backend files (auth component mount, route
    // registration) on the first dev run. Dev-boot only: `nuxt build`,
    // `nuxt prepare`, and test boots must never write into the app.
    if (options.scaffold !== false && nuxt.options.dev && !nuxt.options._prepare && !nuxt.options.test) {
      scaffoldBackendFiles(nuxt.options.rootDir)
    }

    // `#backend/*` — the backend-branded aliases for the Convex functions
    // folder (same targets as the base module's `#convex/*`).
    registerBackendAliases(nuxt)
    registerBackendTypeFallback(nuxt)

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

    registerSaasComposables(resolver)

    // The neutral stylesheet for every shipped component and page, first in
    // line and layered (ui.css), so every app rule wins over it.
    nuxt.options.css.unshift(resolver.resolve('./runtime/vue/components/ui.css'))

    registerAuthMiddleware()
    registerBillingLinkComponents()

    const pagesInfo = registerModulePages(options, resolver, nuxt)

    registerMcp(options, resolver, nuxt)

    runPreflight(options, nuxt)

    runDevAutoEnv(options, nuxt)

    // Only where a panel can be opened: in dev, with the DevTools UI on, and
    // never under a test runner, where nothing ever opens one.
    if (nuxt.options.dev && !nuxt.options.test && options.devtools !== false && isDevtoolsUiEnabled(nuxt)) {
      // Lazy import keeps the DevTools wiring out of production module evaluation.
      const { setupDevtools } = await import('./devtools/index')
      const functionsDir = resolveFunctionsDir(nuxt.options.rootDir)
      const mcp = resolveMcpOptions(options.mcp)
      const siteUrlConfigured = isSiteUrlConfigured(options, nuxt)
      const versions = readPackageVersions(nuxt.options.rootDir)
      const rootDir = nuxt.options.rootDir
      setupDevtools(resolver, nuxt, {
        rootDir,
        functionsDir,
        // Rebuilt per RPC call so preflight findings (and the shadowed-page
        // list `extendPages` fills during build) stay live in the panel. The
        // env is what the dev server sees: its env files under its process env.
        getInfo: deploymentEnv => buildDevtoolsInfo({
          rootDir,
          env: { ...readEnvFiles(rootDir), ...process.env },
          siteUrlConfigured,
          options,
          pages: pagesInfo.list,
          mcp: { route: mcp.route },
          versions,
          functionsDir,
          deploymentEnv,
          provisionedNames: provisionedEnvNames(rootDir),
        }),
      })
      // Appended so it runs after the plugins that provide the Convex client
      // and the auth session.
      addPlugin({ src: resolver.resolve('./runtime/devtools/plugin.client'), mode: 'client' }, { append: true })
    }
  },
})

/**
 * Whether the app set `security: false` (nuxt-security's own switch). Nuxt 4.6
 * types the resolved option as the module's options object, but the value is
 * still whatever nuxt.config wrote.
 */
function securityDisabled(nuxt: Nuxt): boolean {
  return (nuxt.options.security as unknown) === false
}

// Typed `appConfig.backend` (content layer) and
// `runtimeConfig.public.backend.pages` (resolved default-page paths, `''`
// when a page is disabled) for consumers. Same augmentation target as the
// base module's runtime-config typing (`@nuxt/schema`), not `nuxt/schema`,
// which only re-exports it: augmented through the re-export, this
// `AppConfigInput` did not merge with the other modules' and the website's
// `app.config.ts` (Nuxt UI keys) stopped type-checking.
declare module '@nuxt/schema' {
  interface AppConfigInput {
    backend?: BackendAppConfigInput
  }
  interface PublicRuntimeConfig {
    backend: {
      pages: Record<BackendPageKey, string>
      /** The same-origin auth proxy route (`backend.authRoute`). */
      authRoute: string
    }
  }
}
