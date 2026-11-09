import type { Nuxt } from '@nuxt/schema'

// What the package's development defaults read of the app's own config, and
// the dev server's module cache, which a browser must never keep.

type Config = Record<string, unknown>

const isConfig = (value: unknown): value is Config => typeof value === 'object' && value !== null

/** The value at a path of keys, `undefined` where any step is missing. */
function valueAt(config: unknown, path: readonly string[]): unknown {
  let value = config
  for (const key of path) {
    if (!isConfig(value)) return undefined
    value = value[key]
  }
  return value
}

/** The config the app and each of its layers wrote, as written: `$development` and `$env` blocks included. */
function writtenConfigs(nuxt: Pick<Nuxt, 'options'>): Config[] {
  const layers = (nuxt.options._layers ?? []).map(layer => layer.config as unknown)
  return [nuxt.options as unknown, ...layers].filter(isConfig)
}

/**
 * Whether the app sets an option for development itself, under
 * `$development` or `$env.development`, in its config or a layer's:
 * `$development: { security: { rateLimiter: { … } } }`. A development
 * default of the package gives way to it, and to nothing else.
 */
export function setForDevelopment(nuxt: Pick<Nuxt, 'options'>, path: readonly string[]): boolean {
  return writtenConfigs(nuxt).some(config => [config.$development, valueAt(config, ['$env', 'development'])]
    .some(block => valueAt(block, path) !== undefined))
}

/** Nuxt's own default for `app.buildAssetsDir`. */
const NUXT_BUILD_ASSETS_DIR = '/_nuxt/'

/** Where a dev server serves the app's modules: away from `/_nuxt/`, whose old copies a browser may still hold. */
export const DEV_BUILD_ASSETS_DIR = '/_dev/'

/** Whether the app chose where its build assets are served: a value other than Nuxt's, an env override, or the key in a config it wrote. */
function ownsBuildAssetsDir(nuxt: Pick<Nuxt, 'options'>): boolean {
  if (nuxt.options.app.buildAssetsDir !== NUXT_BUILD_ASSETS_DIR || process.env.NUXT_APP_BUILD_ASSETS_DIR) return true
  const path = ['app', 'buildAssetsDir']
  return setForDevelopment(nuxt, path) || writtenConfigs(nuxt).slice(1).some(config => valueAt(config, path) !== undefined)
}

/**
 * Keep the dev server's modules out of the browser's cache. Vite serves a
 * pre-bundled dependency (`vue.js?v=…`) as immutable for a year, and Safari
 * keeps such a module across dev server restarts, while a re-optimized
 * dependency comes back under a new `?v=`: one page then runs two copies of
 * Vue, whose reactivity does not cross, and a signed-in page ends on a 500.
 * So in development:
 *
 * - every module the dev server sends says `Cache-Control: no-store`
 *   (`vite.server.headers`), so nothing is kept from now on;
 * - the modules move from `/_nuxt/` to `/_dev/` (`app.buildAssetsDir`), so
 *   none a browser kept from an earlier dev server is asked for again.
 *
 * Development only: a production build's assets are hashed and served for
 * a year, as they should be. A setting of the app's own wins in each case:
 * a `Cache-Control` of its own in `vite.server.headers`, and any
 * `app.buildAssetsDir` it sets (Nuxt's `/_nuxt/` included, written out).
 */
export function keepDevModulesUncached(nuxt: Nuxt): void {
  if (!nuxt.options.dev) return
  const vite = (nuxt.options.vite ??= {})
  const server = (vite.server ??= {})
  const headers = (server.headers ??= {}) as Record<string, unknown>
  if (!Object.keys(headers).some(name => name.toLowerCase() === 'cache-control')) headers['Cache-Control'] = 'no-store'
  if (ownsBuildAssetsDir(nuxt)) return
  nuxt.options.app.buildAssetsDir = DEV_BUILD_ASSETS_DIR
  // Resolved from it before any module ran: the server render and the bundler read these.
  const runtimeApp = nuxt.options.runtimeConfig.app as { buildAssetsDir?: string } | undefined
  if (runtimeApp?.buildAssetsDir === NUXT_BUILD_ASSETS_DIR) runtimeApp.buildAssetsDir = DEV_BUILD_ASSETS_DIR
  const build = vite.build as { assetsDir?: string } | undefined
  if (build?.assetsDir === NUXT_BUILD_ASSETS_DIR.slice(1)) build.assetsDir = DEV_BUILD_ASSETS_DIR.slice(1)
}
