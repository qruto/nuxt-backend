import { getAuthConfigProvider } from '@convex-dev/better-auth/auth-config'
import type { AuthConfig } from 'convex/server'
import { type BackendPaths, resolveBackendPaths } from './paths.js'
import { SESSION_TOKEN_AUDIENCE } from './constants.js'

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
  /**
   * Which auth the app runs, as `setupAuth` takes it. `'convex-auth'`: the
   * access tokens of Convex Auth sessions, which the `backend` component
   * signs with the deployment's own key. `'better-auth'`: the session JWTs
   * Better Auth signs. Left out, both: every Convex deployment holds the
   * key the first is signed with, so trusting it costs an app on Better
   * Auth nothing, and an app that moves to Convex Auth needs no change here.
   */
  provider?: 'better-auth' | 'convex-auth'
}

/**
 * The provider of a Convex Auth app's tokens: signed by the `backend`
 * component (`ctx.auth.signJwt`), so issued under its path on the
 * deployment, and verified against the deployment's own JWKS.
 */
function convexAuthProvider(): AuthConfig['providers'][number] {
  const cloudUrl = process.env.CONVEX_CLOUD_URL
  if (!cloudUrl) throw new Error('[nuxt-backend] defineBackendAuthConfig({ provider: \'convex-auth\' }) reads CONVEX_CLOUD_URL, which every Convex deployment sets.')
  return {
    type: 'customJwt',
    applicationID: SESSION_TOKEN_AUDIENCE,
    issuer: `${cloudUrl}/components/backend`,
    jwks: `${cloudUrl}/.well-known/jwks.json`,
    algorithm: 'ES256',
  }
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
 *
 * Left out, `provider` trusts both kinds of token: Better Auth's and those
 * of Convex Auth sessions (`setupAuth({ provider: 'convex-auth' })`).
 */
export function defineBackendAuthConfig(options: DefineBackendAuthConfigOptions = {}): AuthConfig {
  if ('basePath' in options) {
    throw new TypeError('[nuxt-backend] defineBackendAuthConfig no longer takes `basePath`: set `backend.authRoute` in nuxt.config, and pass the `paths` of paths.generated.ts, which the Nuxt module writes from it.')
  }
  if (options.provider === 'convex-auth') return { providers: [convexAuthProvider()] }
  const betterAuth = getAuthConfigProvider({
    basePath: resolveBackendPaths(options.paths, 'defineBackendAuthConfig').authRoute,
    jwks: options.jwks,
  })
  if (options.provider === 'better-auth' || !process.env.CONVEX_CLOUD_URL) return { providers: [betterAuth] }
  return { providers: [betterAuth, convexAuthProvider()] }
}

export default defineBackendAuthConfig()
