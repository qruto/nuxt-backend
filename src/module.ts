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

    // Client-only Convex plugin (mirrors React's ConvexProvider).
    // SSR data should be loaded via `fetchQuery` / `preloadQuery` from `#imports`
    // in server routes and passed to `usePreloadedQuery` on the client.
    addPlugin(resolver.resolve('./runtime/plugins/backend.client'))

    // Vue composables (mirror convex/react public surface).
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

    // Better Auth composables
    for (const name of ['useAuth', 'useSession', 'useAuthClient']) {
      addImports({ name, from: resolver.resolve(`./runtime/composables/${name}`) })
    }

    // Auth proxy
    addServerHandler({
      route: `${authRoute}/**`,
      handler: resolver.resolve('./runtime/server/api/auth/[...all]'),
    })

    // Auth middleware (opt-in per page via definePageMeta)
    addRouteMiddleware({
      name: 'auth',
      path: resolver.resolve('./runtime/middleware/auth'),
      global: false,
    })

    // Server utilities (mirror convex/nextjs).
    const serverUtils = [
      'fetchQuery', 'fetchMutation', 'fetchAction',
      'preloadQuery', 'preloadedQueryResult',
    ]
    addServerImports(serverUtils.map(name => ({
      name,
      from: resolver.resolve('./runtime/nuxt/index'),
    })))
  },
})
