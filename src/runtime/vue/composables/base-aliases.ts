/**
 * Backend-neutral names for the base module's brand-named composables. This
 * package operates in backend terminology — docs, templates, and the
 * playground use only these; the base names keep working for direct users of
 * the underlying integration.
 */
export { useConvexAuth as useAuthState } from 'nuxt-convex-module/client'
export { useConvexConnectionState as useConnectionState } from 'nuxt-convex-module/client'
