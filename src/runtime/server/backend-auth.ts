/**
 * Backend-neutral name for the base module's Nitro auth service — the same
 * `convexAuth(event)` service (`isAuthenticated`, `fetchAuthQuery`, …) under
 * this package's terminology.
 */
export { convexAuth as backendAuth } from 'nuxt-convex-module/better-auth/server'
export type { ConvexAuthOptions as BackendAuthOptions, ConvexAuthService as BackendAuthService } from 'nuxt-convex-module/better-auth/server'
