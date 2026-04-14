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
      || process.env.CONVEX_URL
      || process.env.NUXT_PUBLIC_CONVEX_URL

    if (!url) {
      console.warn('[nuxt-backend] No Convex URL configured. Set `backend.url` in nuxt.config or CONVEX_URL env variable.')
    }

    const siteUrl = options.siteUrl
      || process.env.CONVEX_SITE_URL
      || process.env.NUXT_PUBLIC_CONVEX_SITE_URL

    const authRoute = options.authRoute || '/api/auth'

    // Runtime config
    nuxt.options.runtimeConfig.public.backend = {
      url: url || '',
      siteUrl: siteUrl || '',
    }

    nuxt.options.runtimeConfig.backend = {
      siteUrl: siteUrl || '',
    }

    // Auto-scaffold the minimum backend files
    scaffoldBackendFiles(nuxt.options.rootDir)

    // Plugins
    addPlugin(resolver.resolve('./runtime/plugins/backend.client'))
    addPlugin(resolver.resolve('./runtime/plugins/backend.server'))

    // Composables
    const composables = ['useBackend', 'useQuery', 'useMutation', 'useAction', 'useAuth', 'useSession', 'useAuthClient']
    for (const name of composables) {
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

    // Server utilities
    const serverUtils = [
      'getToken', 'isAuthenticated',
      'fetchQuery', 'fetchMutation', 'fetchAction',
      'fetchAuthQuery', 'fetchAuthMutation', 'fetchAuthAction',
      'preloadQuery', 'preloadAuthQuery', 'preloadedQueryResult',
    ]
    addServerImports(serverUtils.map(name => ({
      name,
      from: resolver.resolve('./runtime/server/utils/backend'),
    })))
  },
})
