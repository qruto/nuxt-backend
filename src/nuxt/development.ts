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

/**
 * What every dev module says: keep a copy, but ask before each use. Vite
 * answers with a 304 while its ETag still holds, and with the module
 * itself once it changed.
 */
const DEV_CACHE_CONTROL = 'no-cache'

/** Whether the app chose where its build assets are served: a value other than Nuxt's, an env override, or the key in a config it wrote. */
function ownsBuildAssetsDir(nuxt: Pick<Nuxt, 'options'>): boolean {
  if (nuxt.options.app.buildAssetsDir !== NUXT_BUILD_ASSETS_DIR || process.env.NUXT_APP_BUILD_ASSETS_DIR) return true
  const path = ['app', 'buildAssetsDir']
  return setForDevelopment(nuxt, path) || writtenConfigs(nuxt).slice(1).some(config => valueAt(config, path) !== undefined)
}

/**
 * Keep the browser from using a dev module it did not check. Vite serves a
 * module whose address carries a `?v=`, as a pre-bundled dependency's does
 * (`vue.js?v=…`), as `max-age=31536000,immutable`, which a browser uses
 * for a year without asking. Safari keeps such modules across dev
 * server restarts, while a re-optimized dependency comes back under a new
 * `?v=`: one page then runs two copies of Vue, whose reactivity does not
 * cross, and a signed-in page ends on a 500. So in development:
 *
 * - every module the dev server sends says `Cache-Control: no-cache`
 *   (`vite.server.headers`, which Vite sets after its own), so nothing is
 *   immutable from now on: the browser asks before each use, an unchanged
 *   module costs a 304, and a changed one comes back whole. (`no-store`
 *   cures it as well, but turns every reload into a full download.)
 * - the modules move from `/_nuxt/` to `/_dev/` (`app.buildAssetsDir`).
 *   That is what reaches the copies a browser stored as immutable before
 *   this header, from an earlier dev server of this app or of another one
 *   on the same origin: the browser never asks the server about them, so
 *   no header can, and it asks for none of them again at a new path.
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
  if (!Object.keys(headers).some(name => name.toLowerCase() === 'cache-control')) headers['Cache-Control'] = DEV_CACHE_CONTROL
  if (ownsBuildAssetsDir(nuxt)) return
  nuxt.options.app.buildAssetsDir = DEV_BUILD_ASSETS_DIR
  // Resolved from it before any module ran: the server render and the bundler read these.
  const runtimeApp = nuxt.options.runtimeConfig.app as { buildAssetsDir?: string } | undefined
  if (runtimeApp?.buildAssetsDir === NUXT_BUILD_ASSETS_DIR) runtimeApp.buildAssetsDir = DEV_BUILD_ASSETS_DIR
  const build = vite.build as { assetsDir?: string } | undefined
  if (build?.assetsDir === NUXT_BUILD_ASSETS_DIR.slice(1)) build.assetsDir = DEV_BUILD_ASSETS_DIR.slice(1)
}
