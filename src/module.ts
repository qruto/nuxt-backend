import { defineNuxtModule, addPlugin, addImports, addServerHandler, addServerImports, addRouteMiddleware, addComponent, createResolver, type Resolver } from '@nuxt/kit'
import { join } from 'node:path'
import type { Nuxt } from '@nuxt/schema'
import { resolveFunctionsDir, scaffoldBackendFiles } from './scaffold'
import type { BackendInstallationMode } from './templates'

export interface ModuleOptions {
  url?: string
  siteUrl?: string
  authRoute?: string
  installation?: BackendInstallationMode
}

declare module '@nuxt/schema' {
  interface RuntimeConfig {
    backend: {
      siteUrl: string
    }
  }
  interface PublicRuntimeConfig {
    backend: {
      url: string
      siteUrl: string
    }
  }
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-backend',
    configKey: 'backend',
  },
  defaults: {
    authRoute: '/api/auth',
    installation: 'default',
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const authRoute = options.authRoute || '/api/auth'

    applyRuntimeConfig(nuxt, options)
    scaffoldBackendFiles(nuxt.options.rootDir, { installation: options.installation })
    registerBackendAliases(nuxt)

    registerAuthPlugins(resolver)
    registerVueComposables(resolver)
    registerAuthComponents(resolver)
    registerAuthServerHandlers(resolver, authRoute)
    registerServerImports(resolver)
  },
})

/**
 * Resolve the Convex deployment URL from module options or environment, and
 * publish `backend.url` / `backend.siteUrl` into Nuxt's runtime config.
 */
function applyRuntimeConfig(nuxt: Nuxt, options: ModuleOptions): void {
  const url = nuxt.options._prepare
    ? undefined
    : options.url || process.env.NUXT_PUBLIC_CONVEX_URL

  if (!url && !nuxt.options._prepare) {
    console.warn('[nuxt-backend] No Convex URL configured. Set `backend.url` in nuxt.config or NUXT_PUBLIC_CONVEX_URL.')
  }

  const siteUrl = options.siteUrl || process.env.NUXT_PUBLIC_CONVEX_SITE_URL || ''

  nuxt.options.runtimeConfig.public.backend = {
    url: url || '',
    siteUrl,
  }
  nuxt.options.runtimeConfig.backend = { siteUrl }
}

/**
 * Wire up import aliases for the Convex backend folder and its generated
 * assets so user code and server routes can `import from '#backend/...'`.
 *
 * - `#backend`            -> <rootDir>/<functionsDir>
 * - `#backend/_generated` -> <rootDir>/<functionsDir>/_generated
 *   (also covers `#backend/_generated/api`, `dataModel`, `server`, ...)
 */
function registerBackendAliases(nuxt: Nuxt): void {
  const functionsDir = resolveFunctionsDir(nuxt.options.rootDir)
  const backendDir = join(nuxt.options.rootDir, functionsDir)
  const generatedDir = join(backendDir, '_generated')

  nuxt.options.alias['#backend'] = backendDir
  nuxt.options.alias['#backend/_generated'] = generatedDir

  nuxt.options.nitro ||= {}
  nuxt.options.nitro.alias ||= {}
  nuxt.options.nitro.alias['#backend'] = backendDir
  nuxt.options.nitro.alias['#backend/_generated'] = generatedDir
}

/**
 * Register the client-only Convex plugin and the SSR token-prefetch plugin.
 *
 * The server plugin stashes the Better Auth/Convex JWT in
 * `useState('backend:initialToken')` so the client plugin can pass it to
 * `useAuth(initialToken)` — mirrors React's `initialToken={await getToken()}`.
 * SSR data should be loaded via `fetchQuery` / `preloadQuery` from `#imports`
 * in server routes and passed to `usePreloadedQuery` on the client.
 */
function registerAuthPlugins(resolver: Resolver): void {
  addPlugin(resolver.resolve('./runtime/vue/auth/plugin.client'))
  addPlugin(resolver.resolve('./runtime/vue/auth/plugin.server'))
}

/**
 * Expose the Vue composables (`useQuery`, `useMutation`, `useAction`,
 * pagination, auth, preloaded-query helpers, ...) as Nuxt auto-imports.
 */
function registerVueComposables(resolver: Resolver): void {
  const composables: Array<{ name: string, from: string }> = [
    { name: 'useConvex', from: resolver.resolve('./runtime/vue/client') },
    { name: 'useQuery', from: resolver.resolve('./runtime/vue/composables/use-query') },
    { name: 'useConvexQuery', from: resolver.resolve('./runtime/vue/composables/use-query') },
    { name: 'useQueries', from: resolver.resolve('./runtime/vue/composables/use-queries') },
    { name: 'useConvexQueries', from: resolver.resolve('./runtime/vue/composables/use-queries') },
    { name: 'useMutation', from: resolver.resolve('./runtime/vue/composables/use-mutation') },
    { name: 'useConvexMutation', from: resolver.resolve('./runtime/vue/composables/use-mutation') },
    { name: 'useAction', from: resolver.resolve('./runtime/vue/composables/use-action') },
    { name: 'useConvexAction', from: resolver.resolve('./runtime/vue/composables/use-action') },
    { name: 'useConvexConnectionState', from: resolver.resolve('./runtime/vue/composables/use-connection-state') },
    { name: 'useConvexAuth', from: resolver.resolve('./runtime/vue/auth/index') },
    { name: 'provideConvexAuth', from: resolver.resolve('./runtime/vue/auth/index') },
    { name: 'usePreloadedQuery', from: resolver.resolve('./runtime/vue/hydration') },
    { name: 'usePreloadedAuthQuery', from: resolver.resolve('./runtime/vue/auth/hydration') },
    { name: 'usePaginatedQuery', from: resolver.resolve('./runtime/vue/composables/use-paginated-query') },
    { name: 'useAuth', from: resolver.resolve('./runtime/vue/auth/use-auth') },
  ]
  for (const composable of composables) {
    addImports(composable)
  }
}

/**
 * Auto-register the low-level Convex auth helper components so users can drop
 * `<Authenticated>`, `<Unauthenticated>`, and `<AuthLoading>` straight into
 * templates — mirroring the React integration's exports.
 */
function registerAuthComponents(resolver: Resolver): void {
  const helpersFile = resolver.resolve('./runtime/vue/auth/helpers')
  for (const name of ['Authenticated', 'Unauthenticated', 'AuthLoading'] as const) {
    addComponent({ name, filePath: helpersFile, export: name })
  }
}

/**
 * Mount the auth proxy route and the opt-in route middleware. The middleware
 * is registered as non-global; pages enable it via `definePageMeta`.
 */
function registerAuthServerHandlers(resolver: Resolver, authRoute: string): void {
  addServerHandler({
    route: `${authRoute}/**`,
    handler: resolver.resolve('./runtime/nuxt/auth/proxy'),
  })

  addRouteMiddleware({
    name: 'auth',
    path: resolver.resolve('./runtime/nuxt/auth/middleware'),
    global: false,
  })
}

/**
 * Expose server-side utilities (`fetchQuery`, `preloadQuery`, `backendAuth`,
 * ...) as Nitro server auto-imports for use inside server routes and SSR.
 */
function registerServerImports(resolver: Resolver): void {
  const fromNuxt = resolver.resolve('./runtime/nuxt/index')
  const serverUtils = ['fetchQuery', 'fetchMutation', 'fetchAction', 'preloadQuery', 'preloadedQueryResult']
  addServerImports(serverUtils.map(name => ({ name, from: fromNuxt })))

  addServerImports([
    { name: 'backendAuth', from: resolver.resolve('./runtime/nuxt/auth/server') },
  ])
}
