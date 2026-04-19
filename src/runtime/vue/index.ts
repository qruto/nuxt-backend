/**
 * Vue composables for integrating Convex into Vue applications.
 *
 * This module mirrors the structure of `convex/react` but adapted for Vue:
 *
 * - {@link useConvex} — access the active `ConvexClient` (equivalent of
 *   React's `useConvex` which reads from `ConvexContext`).
 * - {@link useQuery} — reactive query subscription (equivalent of React's
 *   `useQuery` with both positional and object-form overloads).
 * - {@link useQueries} — subscribe to a dynamic number of queries at once.
 *
 * ### Architecture note
 *
 * Internally this follows the same structure as `convex/react`:
 *
 *   useQuery → QueriesObserver.setQueries → Watch.onUpdate → localQueryResult
 *
 * The `QueriesObserver` class is ported verbatim from the React source.
 * Only the hook/subscription glue is replaced with Vue equivalents
 * (`watch`, `ref`, `onScopeDispose` instead of `useMemo`, `useState`,
 * `useEffect`, `useSubscription`).
 *
 * @module
 */

export { ConvexClientKey, useConvex } from './client'
export { useQuery } from './useQuery'
export type { UseQueryReturn, UseQueryOptions, OptionalRestArgsOrSkip } from './useQuery'
export { useQueries } from './use_queries'
export type { RequestForQueries } from './use_queries'
