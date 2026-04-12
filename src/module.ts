import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineNuxtModule, addPlugin, addImports, addServerHandler, addServerImports, addRouteMiddleware, createResolver } from '@nuxt/kit'

export interface ModuleOptions {
  url?: string
  siteUrl?: string
  authRoute?: string
}

const DEFAULT_FUNCTIONS_DIR = 'backend'
const STANDARD_FUNCTIONS_DIR = 'convex'
const REQUIRED_CONVEX_FILES: Record<string, string> = {
  'convex.config.ts': 'export { default } from \'nuxt-backend/backend-component\'\n',
  'auth.config.ts': 'export { default } from \'nuxt-backend/auth-config\'\n',
  'auth.ts': [
    'import { setupAuth } from \'nuxt-backend/auth\'',
    'import { components } from \'./_generated/api\'',
    'import { query } from \'./_generated/server\'',
    '',
    'export const { authComponent, createAuth, getCurrentUser } = setupAuth(components.backend, query)',
    '',
  ].join('\n'),
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
    const rootDir = nuxt.options.rootDir

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

    // Public runtime config (client + server)
    nuxt.options.runtimeConfig.public.convex = {
      url: url || '',
      siteUrl: siteUrl || '',
    }

    // Server-only runtime config
    nuxt.options.runtimeConfig.convex = {
      siteUrl: siteUrl || '',
    }

    // Auto-scaffold the minimum Convex root files
    scaffoldConvexFiles(rootDir)

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

/**
 * Auto-scaffold the minimum Convex root files if they don't exist.
 */
function scaffoldConvexFiles(rootDir: string) {
  const functionsDir = resolveFunctionsDir(rootDir)
  const functionsDirPath = join(rootDir, functionsDir)
  const convexJsonPath = join(rootDir, 'convex.json')

  if (!existsSync(functionsDirPath)) {
    mkdirSync(functionsDirPath, { recursive: true })
    console.log(`[nuxt-backend] Created ${functionsDir}/ directory`)
  }

  for (const [file, contents] of Object.entries(REQUIRED_CONVEX_FILES)) {
    const targetPath = join(functionsDirPath, file)
    if (!existsSync(targetPath)) {
      writeFileSync(targetPath, contents)
      console.log(`[nuxt-backend] Created ${functionsDir}/${file}`)
    }
  }

  if (functionsDir !== STANDARD_FUNCTIONS_DIR && !existsSync(convexJsonPath)) {
    writeFileSync(convexJsonPath, `${JSON.stringify({ functions: `${functionsDir}/` }, null, 2)}\n`)
    console.log('[nuxt-backend] Created convex.json')
  }
}

function resolveFunctionsDir(rootDir: string) {
  const convexJsonPath = join(rootDir, 'convex.json')
  const configuredFunctionsDir = readFunctionsDirFromConvexJson(convexJsonPath)
  if (configuredFunctionsDir) {
    return configuredFunctionsDir
  }

  if (existsSync(join(rootDir, DEFAULT_FUNCTIONS_DIR))) {
    return DEFAULT_FUNCTIONS_DIR
  }

  if (existsSync(join(rootDir, STANDARD_FUNCTIONS_DIR))) {
    return STANDARD_FUNCTIONS_DIR
  }

  return DEFAULT_FUNCTIONS_DIR
}

function readFunctionsDirFromConvexJson(convexJsonPath: string) {
  if (!existsSync(convexJsonPath)) {
    return
  }

  try {
    const convexJson = JSON.parse(readFileSync(convexJsonPath, 'utf-8')) as { functions?: unknown }
    if (typeof convexJson.functions !== 'string') {
      return
    }

    const normalizedFunctionsDir = normalizeFunctionsDir(convexJson.functions)
    return normalizedFunctionsDir || undefined
  }
  catch (error) {
    console.warn(`[nuxt-backend] Failed to parse convex.json: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function normalizeFunctionsDir(functionsDir: string) {
  return functionsDir
    .replace(/^\.?\//, '')
    .replace(/\/+$/, '')
}
