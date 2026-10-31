import { getAuthConfigProvider } from '@convex-dev/better-auth/auth-config'
import type { AuthConfig } from 'convex/server'
import { type BackendPaths, resolveBackendPaths } from './paths.js'

export type { BackendPaths } from './paths.js'

/** Where the backend's tokens come from. */
export interface DefineBackendAuthConfigOptions {
  /**
   * The app's paths, from the `paths.generated.ts` the Nuxt module writes:
   * `authRoute`, where the token signer's JWKS is served, is the one read
   * here. Default `/api/auth`.
   */
  paths?: Partial<BackendPaths>
  /** A static JWKS, for a deployment that sets its signing keys itself instead of storing them. */
  jwks?: string
}

/**
 * The Convex auth config that trusts the backend's tokens: the session JWTs
 * the `backend` component signs, verified against its JWKS on the
 * deployment's site URL, under the auth route nuxt.config names
 * (`backend.authRoute`). The scaffolded `backend/auth.config.ts` calls it
 * with the generated paths; pass `jwks` only to pin the keys.
 *
 * @example
 * ```ts [backend/auth.config.ts]
 * import { defineBackendAuthConfig } from 'nuxt-backend/auth.config'
 * import { paths } from './paths.generated'
 *
 * export default defineBackendAuthConfig({ paths })
 * ```
 */
export function defineBackendAuthConfig(options: DefineBackendAuthConfigOptions = {}): AuthConfig {
  if ('basePath' in options) {
    throw new TypeError('[nuxt-backend] defineBackendAuthConfig no longer takes `basePath`: set `backend.authRoute` in nuxt.config, and pass the `paths` of paths.generated.ts, which the Nuxt module writes from it.')
  }
  return {
    providers: [
      getAuthConfigProvider({
        basePath: resolveBackendPaths(options.paths, 'defineBackendAuthConfig').authRoute,
        jwks: options.jwks,
      }),
    ],
  }
}

export default defineBackendAuthConfig()
