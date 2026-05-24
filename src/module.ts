import { defineNuxtModule, addPlugin, addImports, addServerHandler, addServerImports, addRouteMiddleware, addComponent, createResolver } from '@nuxt/kit'
import { join } from 'node:path'
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

    const url = nuxt.options._prepare
      ? undefined
      : options.url || process.env.NUXT_PUBLIC_CONVEX_URL

    if (!url && !nuxt.options._prepare) {
      console.warn('[nuxt-backend] No Convex URL configured. Set `backend.url` in nuxt.config or NUXT_PUBLIC_CONVEX_URL.')
    }

    const siteUrl = options.siteUrl
      || process.env.NUXT_PUBLIC_CONVEX_SITE_URL

    const authRoute = options.authRoute || '/api/auth'

    nuxt.options.runtimeConfig.public.backend = {
      url: url || '',
      siteUrl: siteUrl || '',
    }

    nuxt.options.runtimeConfig.backend = {
      siteUrl: siteUrl || '',
    }

    // Auto-scaffold the minimum backend files
    scaffoldBackendFiles(nuxt.options.rootDir, { installation: options.installation })

    // Import aliases for the Convex backend folder and its generated assets.
    // - `#backend`            -> <rootDir>/<functionsDir>
    // - `#backend/_generated` -> <rootDir>/<functionsDir>/_generated
    //   (also covers `#backend/_generated/api`, `dataModel`, `server`, ...)
    const functionsDir = resolveFunctionsDir(nuxt.options.rootDir)
    const backendDir = join(nuxt.options.rootDir, functionsDir)
    const generatedDir = join(backendDir, '_generated')

    nuxt.options.alias['#backend'] = backendDir
    nuxt.options.alias['#backend/_generated'] = generatedDir

    nuxt.options.nitro ||= {}
    nuxt.options.nitro.alias ||= {}
    nuxt.options.nitro.alias['#backend'] = backendDir
    nuxt.options.nitro.alias['#backend/_generated'] = generatedDir

    // Client-only Convex plugin for Nuxt applications.
    // SSR data should be loaded via `fetchQuery` / `preloadQuery` from `#imports`
    // in server routes and passed to `usePreloadedQuery` on the client.
    addPlugin(resolver.resolve('./runtime/vue/auth/plugin.client'))

    // Server plugin: prefetches the Better Auth/Convex JWT for SSR and
    // stashes it in `useState('backend:initialToken')` so the client plugin
    // can pass it to `useAuth(initialToken)` — mirrors React's
    // `initialToken={await getToken()}` prop.
    addPlugin(resolver.resolve('./runtime/vue/auth/plugin.server'))

    // Vue composables exposed by the Nuxt module.
    const vueComposables: Array<{ name: string, from: string, as?: string }> = [
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
    ]
    for (const composable of vueComposables) {
      addImports(composable)
    }

    // Better Auth composables for the Vue/Nuxt runtime.
    addImports({ name: 'useAuth', from: resolver.resolve('./runtime/vue/auth/use-auth') })

    // Auto-register low-level Convex auth helper components so that users
    // can drop `<Authenticated>`, `<Unauthenticated>`, and `<AuthLoading>`
    // straight into templates — mirroring the React integration's exports.
    const helpersFile = resolver.resolve('./runtime/vue/auth/helpers')
    for (const name of ['Authenticated', 'Unauthenticated', 'AuthLoading'] as const) {
      addComponent({ name, filePath: helpersFile, export: name })
    }

    // Auth proxy
    addServerHandler({
      route: `${authRoute}/**`,
      handler: resolver.resolve('./runtime/nuxt/auth/proxy'),
    })

    // Auth middleware (opt-in per page via definePageMeta)
    addRouteMiddleware({
      name: 'auth',
      path: resolver.resolve('./runtime/nuxt/auth/middleware'),
      global: false,
    })

    // Server utilities for Nuxt server routes and SSR.
    const serverUtils = [
      'fetchQuery', 'fetchMutation', 'fetchAction',
      'preloadQuery', 'preloadedQueryResult',
    ]
    addServerImports(serverUtils.map(name => ({
      name,
      from: resolver.resolve('./runtime/nuxt/index'),
    })))
    addServerImports([
      {
        name: 'backendAuth',
        from: resolver.resolve('./runtime/nuxt/auth/server'),
      },
    ])
  },
})
