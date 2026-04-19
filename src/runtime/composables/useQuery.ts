/**
 * Nuxt auto-imported `useQuery` composable.
 *
 * This is a thin re-export of the framework-agnostic Vue composable from
 * `../vue/useQuery`. The separation mirrors how `convex-js` separates
 * `src/react/` (framework composables) from `src/nextjs/` (framework
 * integration glue).
 *
 * The Vue layer's `useQuery` obtains the `ConvexClient` via Vue's
 * `inject()` mechanism, which the Nuxt plugin sets up at app boot.
 */
export { useQuery } from '../vue/useQuery'
export type { UseQueryReturn, UseQueryOptions, OptionalRestArgsOrSkip } from '../vue/useQuery'
