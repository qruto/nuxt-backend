import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { addPlugin, addServerHandler, extendRouteRules, type Resolver } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { resolveFunctionsDir } from '../scaffold'

// Which auth an app runs, and the wiring of the one that is not the base
// module's own default. A Convex Auth app mounts Convex Auth's core
// component (`@convex-dev/auth/convex.config`, as `auth`) in its
// backend/convex.config.ts, which is what `nuxt-backend init` scaffolds; an
// app without that mount, every app made before it, stays on Better Auth.
// `backend.auth` in nuxt.config names one outright.

/** The two auth providers. */
export type AuthProvider = 'better-auth' | 'convex-auth'

/** Whether a `convex.config.ts` source mounts Convex Auth's core component (`@convex-dev/auth/convex.config`). */
export function mountsConvexAuth(source: string): boolean {
  return /from\s+['"]@convex-dev\/auth\/convex\.config(?:\.js)?['"]/.test(source)
}

/**
 * The provider an app runs: `backend.auth` when nuxt.config names one, else
 * Convex Auth when the functions folder's `convex.config.ts` mounts its
 * core component, else Better Auth.
 */
export function detectAuthProvider(rootDir: string, option: unknown): AuthProvider {
  if (option === 'better-auth' || option === 'convex-auth') return option
  const dir = join(rootDir, resolveFunctionsDir(rootDir))
  for (const name of ['convex.config.ts', 'convex.config.js', 'convex.config.mts', 'convex.config.mjs']) {
    const file = join(dir, name)
    if (existsSync(file)) return mountsConvexAuth(readFileSync(file, 'utf8')) ? 'convex-auth' : 'better-auth'
  }
  return 'better-auth'
}

/** The base module's own runtime folder, for the Convex Auth files it mounts only when the app has a server file. */
function baseRuntimeDir(): string {
  const manifest = createRequire(import.meta.url).resolve('nuxt-convex-module/package.json')
  return join(dirname(manifest), 'dist', 'runtime')
}

/** The app's own `server/convex-auth.*`, which the base module mounts the routes from. */
function appAuthServer(nuxt: Nuxt): string | undefined {
  return ['.ts', '.mts', '.js', '.mjs'].map(extension => join(nuxt.options.serverDir, `convex-auth${extension}`)).find(file => existsSync(file))
}

/**
 * Point an alias at a file, for the app and for the server. Once every module
 * has run: the base module is this one's dependency, so Nuxt installs it
 * after this one, and it points `#convex/auth-client` and
 * `#convex/auth-server` at its own files as it does.
 */
function alias(nuxt: Nuxt, name: string, target: string): void {
  nuxt.hook('modules:done', () => {
    nuxt.options.alias[name] = target
    nuxt.options.nitro ||= {}
    nuxt.options.nitro.alias ||= {}
    nuxt.options.nitro.alias[name] = target
  })
}

/** The base module's Better Auth entries, which the stand-ins answer for at runtime. */
const STAND_INS = ['nuxt-convex-module/better-auth/client', 'nuxt-convex-module/better-auth/server']

/**
 * Keep the stand-ins out of the generated tsconfig: the package's code is
 * typed against the base module's own declarations of those entries, which
 * the stand-ins implement, and an app's own imports of them read the same.
 */
function typeStandInsAsBase(nuxt: Nuxt): void {
  const drop = (...configs: Array<{ compilerOptions?: { paths?: Record<string, unknown> } } | undefined>) => {
    for (const config of configs) {
      for (const name of STAND_INS) delete config?.compilerOptions?.paths?.[name]
    }
  }
  nuxt.hook('prepare:types', options => drop(options.tsConfig, options.nodeTsConfig, options.sharedTsConfig, options.serverTsConfig))
  nuxt.hook('nitro:init', (nitro) => {
    nitro.hooks.hook('types:extend', types => drop(types.tsConfig))
  })
}

/**
 * Wire a Convex Auth app. The base module runs its Convex Auth integration
 * (the client, its SSR proxy and routes) and no Better Auth; the package's
 * session layer, written against the base module's Better Auth entries,
 * reads Convex Auth through stand-ins at those names, so every packaged
 * composable, component and server helper runs unchanged. An app without a
 * `server/convex-auth.ts` gets the package's, which names the functions
 * `setupAuth` builds; the base module mounts nothing without one, so the
 * routes, the proxy and the plugin it would have mounted are mounted here;
 * its route middleware is not, as in every app of the package's: pages say
 * who may open them through `backend-access`.
 */
export function registerConvexAuth(resolver: Resolver, nuxt: Nuxt): void {
  typeStandInsAsBase(nuxt)
  alias(nuxt, 'nuxt-convex-module/better-auth/client', resolver.resolve('./runtime/vue/convex-auth/better-auth-client'))
  alias(nuxt, 'nuxt-convex-module/better-auth/server', resolver.resolve('./runtime/server/convex-auth/better-auth-server'))
  alias(nuxt, '#convex/auth-client', resolver.resolve('./runtime/vue/convex-auth/auth-client'))
  const publicConfig = nuxt.options.runtimeConfig.public as Record<string, Record<string, unknown> | undefined>
  publicConfig.backend = { ...publicConfig.backend, authProvider: 'convex-auth' }
  if (appAuthServer(nuxt)) return
  alias(nuxt, '#convex/auth-server', resolver.resolve('./runtime/server/convex-auth/auth-server'))
  const base = baseRuntimeDir()
  addServerHandler({ route: '/api/_convex/auth/:action', method: 'post', handler: { nuxt: join(base, 'convex-auth/nuxt/handler.js') } })
  addServerHandler({ middleware: true, handler: { nuxt: join(base, 'convex-auth/nuxt/proxy.js') } })
  extendRouteRules('/api/_convex/auth/**', { cache: false, prerender: false })
  addPlugin(join(base, 'convex-auth/nuxt/plugin.js'), { append: true })
}
