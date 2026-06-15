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
 * Build the ordered import-alias map for the Convex backend folder and its
 * generated modules, so user code and server routes can `import from
 * '#backend/...'` without spelling out `_generated`.
 *
 * - `#backend/api`        -> _generated/api        (`api`, `internal`, `components`)
 * - `#backend/server`     -> _generated/server     (`query`, `mutation`, `action`, `*Ctx`, ...)
 * - `#backend/dataModel`  -> _generated/dataModel  (`DataModel`, `Doc`, `Id`, `TableNames`)
 * - `#backend/_generated` -> _generated            (long form, covers every generated file)
 * - `#backend`            -> <rootDir>/<functionsDir>
 *
 * Order is significant: both Vite and Nitro resolve aliases with
 * `@rollup/plugin-alias`, which is first-match-wins and treats `#backend` as a
 * prefix of `#backend/api`. The specific generated-module aliases must come
 * before the catch-all `#backend`, otherwise `#backend/api` would resolve to
 * `<functionsDir>/api` instead of `<functionsDir>/_generated/api` (and would
 * shadow any user function file literally named `api.ts` / `server.ts`).
 */
export function getBackendAliases(rootDir: string): Record<string, string> {
  const functionsDir = resolveFunctionsDir(rootDir)
  const backendDir = join(rootDir, functionsDir)
  const generatedDir = join(backendDir, '_generated')

  return {
    '#backend/api': join(generatedDir, 'api'),
    '#backend/server': join(generatedDir, 'server'),
    '#backend/dataModel': join(generatedDir, 'dataModel'),
    '#backend/_generated': generatedDir,
    '#backend': backendDir,
  }
}

/**
 * Register the backend import aliases for both Vite (`options.alias`) and Nitro
 * (`nitro.alias`). Iterates {@link getBackendAliases} in declaration order to
 * preserve the specific-before-general ordering the alias resolvers depend on.
 */
function registerBackendAliases(nuxt: Nuxt): void {
  const aliases = getBackendAliases(nuxt.options.rootDir)

  nuxt.options.nitro ||= {}
  nuxt.options.nitro.alias ||= {}

  for (const [alias, target] of Object.entries(aliases)) {
    nuxt.options.alias[alias] = target
    nuxt.options.nitro.alias[alias] = target
  }
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
    { name: 'useQuery_experimental', from: resolver.resolve('./runtime/vue/composables/use-query') },
    { name: 'useConvexQuery', from: resolver.resolve('./runtime/vue/composables/use-query') },
    { name: 'useQueries', from: resolver.resolve('./runtime/vue/composables/use-queries') },
    { name: 'useConvexQueries', from: resolver.resolve('./runtime/vue/composables/use-queries') },
    { name: 'useMutation', from: resolver.resolve('./runtime/vue/composables/use-mutation') },
    { name: 'useConvexMutation', from: resolver.resolve('./runtime/vue/composables/use-mutation') },
    { name: 'useAction', from: resolver.resolve('./runtime/vue/composables/use-action') },
    { name: 'useConvexAction', from: resolver.resolve('./runtime/vue/composables/use-action') },
    { name: 'useConvexConnectionState', from: resolver.resolve('./runtime/vue/composables/use-connection-state') },
    { name: 'useUpload', from: resolver.resolve('./runtime/vue/composables/use-upload') },
    { name: 'useConvexUpload', from: resolver.resolve('./runtime/vue/composables/use-upload') },
    { name: 'uploadFile', from: resolver.resolve('./runtime/vue/composables/use-upload') },
    { name: 'useUploadQueue', from: resolver.resolve('./runtime/vue/composables/use-upload-queue') },
    { name: 'useConvexUploadQueue', from: resolver.resolve('./runtime/vue/composables/use-upload-queue') },
    { name: 'useStorageUrl', from: resolver.resolve('./runtime/vue/composables/use-storage-url') },
    { name: 'useConvexStorageUrl', from: resolver.resolve('./runtime/vue/composables/use-storage-url') },
    { name: 'useConvexAuth', from: resolver.resolve('./runtime/vue/auth/index') },
    { name: 'provideConvexAuth', from: resolver.resolve('./runtime/vue/auth/index') },
    { name: 'usePreloadedQuery', from: resolver.resolve('./runtime/vue/hydration') },
    { name: 'usePreloadedAuthQuery', from: resolver.resolve('./runtime/vue/auth/hydration') },
    { name: 'usePaginatedQuery', from: resolver.resolve('./runtime/vue/composables/use-paginated-query') },
    { name: 'usePaginatedQuery_experimental', from: resolver.resolve('./runtime/vue/composables/use-paginated-query') },
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
