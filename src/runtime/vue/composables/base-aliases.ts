/**
 * Backend-neutral names for the base module's brand-named composables. This
 * package operates in backend terminology — docs, templates, and the
 * playground use only these, and the module hides the base names from apps
 * (`hideBaseBrandNames`).
 */
export { useConvexAuth as useAuthState } from 'nuxt-convex-module/client'
export { useConvexConnectionState as useConnectionState } from 'nuxt-convex-module/client'
export { useConvex as useBackendClient } from 'nuxt-convex-module/client'
