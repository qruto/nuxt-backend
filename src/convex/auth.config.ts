import { getAuthConfigProvider } from '@convex-dev/better-auth/auth-config'
import type { AuthConfig } from 'convex/server'
import { DEFAULT_AUTH_ROUTE } from './constants.js'

/** Where the backend's tokens come from, for an app that moved them. */
export interface DefineBackendAuthConfigOptions {
  /** The auth routes' base path, where the token signer's JWKS is served. Default `/api/auth`. */
  basePath?: string
  /** A static JWKS, for a deployment that sets its signing keys itself instead of storing them. */
  jwks?: string
}

/**
 * The Convex auth config that trusts the backend's tokens: the session JWTs
 * the `backend` component signs, verified against its JWKS on the
 * deployment's site URL. `nuxt-backend/auth.config` exports it with the
 * defaults, which the scaffolded `backend/auth.config.ts` re-exports; call
 * it yourself only to move the auth routes or pin the keys.
 *
 * @example
 * ```ts [backend/auth.config.ts]
 * import { defineBackendAuthConfig } from 'nuxt-backend/auth.config'
 *
 * export default defineBackendAuthConfig({ basePath: '/auth' })
 * ```
 */
export function defineBackendAuthConfig(options: DefineBackendAuthConfigOptions = {}): AuthConfig {
  return {
    providers: [
      getAuthConfigProvider({
        basePath: options.basePath ?? DEFAULT_AUTH_ROUTE,
        jwks: options.jwks,
      }),
    ],
  }
}

export default defineBackendAuthConfig()
