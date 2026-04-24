import { defineNuxtModule, addPlugin, addImports, addServerHandler, addServerImports, addRouteMiddleware, createResolver } from '@nuxt/kit'
import { scaffoldBackendFiles } from './scaffold'

export interface ModuleOptions {
  url?: string
  siteUrl?: string
  authRoute?: string
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-backend',
    configKey: 'backend',
  },
  defaults: {
    authRoute: '/api/auth',
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)

    const url = options.url
      || process.env.NUXT_PUBLIC_CONVEX_URL

    if (!url) {
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
    scaffoldBackendFiles(nuxt.options.rootDir)

    // Client-only Convex plugin for Nuxt applications.
    // SSR data should be loaded via `fetchQuery` / `preloadQuery` from `#imports`
    // in server routes and passed to `usePreloadedQuery` on the client.
    addPlugin(resolver.resolve('./runtime/auth/vue/plugin'))

    // Vue composables exposed by the Nuxt module.
    const vueComposables: Array<{ name: string, from: string, as?: string }> = [
      { name: 'useConvex', from: resolver.resolve('./runtime/vue/client') },
      { name: 'useQuery', from: resolver.resolve('./runtime/vue/use_query') },
      { name: 'useConvexQuery', from: resolver.resolve('./runtime/vue/use_query') },
      { name: 'useQueries', from: resolver.resolve('./runtime/vue/use_queries') },
      { name: 'useConvexQueries', from: resolver.resolve('./runtime/vue/use_queries') },
      { name: 'useMutation', from: resolver.resolve('./runtime/vue/use_mutation') },
      { name: 'useConvexMutation', from: resolver.resolve('./runtime/vue/use_mutation') },
      { name: 'useAction', from: resolver.resolve('./runtime/vue/use_action') },
      { name: 'useConvexAction', from: resolver.resolve('./runtime/vue/use_action') },
      { name: 'useConvexConnectionState', from: resolver.resolve('./runtime/vue/use_connection_state') },
      { name: 'useConvexAuth', from: resolver.resolve('./runtime/vue/auth') },
      { name: 'provideConvexAuth', from: resolver.resolve('./runtime/vue/auth') },
      { name: 'usePreloadedQuery', from: resolver.resolve('./runtime/vue/hydration') },
      { name: 'usePaginatedQuery', from: resolver.resolve('./runtime/vue/use_paginated_query') },
    ]
    for (const composable of vueComposables) {
      addImports(composable)
    }

    // Better Auth composables for the Vue/Nuxt runtime.
    addImports({ name: 'useAuth', from: resolver.resolve('./runtime/auth/vue/useAuth') })
    addImports({ name: 'useSession', from: resolver.resolve('./runtime/auth/vue/useSession') })
    addImports({ name: 'useAuthClient', from: resolver.resolve('./runtime/auth/vue/useAuthClient') })

    // Auth proxy
    addServerHandler({
      route: `${authRoute}/**`,
      handler: resolver.resolve('./runtime/auth/nuxt/proxy'),
    })

    // Auth middleware (opt-in per page via definePageMeta)
    addRouteMiddleware({
      name: 'auth',
      path: resolver.resolve('./runtime/auth/nuxt/middleware'),
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
        name: 'convexBetterAuth',
        from: resolver.resolve('./runtime/auth/nuxt/server'),
      },
    ])
  },
})
