/**
 * Vue composables for integrating Convex into Vue applications.
 *
 * This module mirrors the structure of `convex/react` but adapted for Vue:
 *
 * - {@link useConvex} — access the active `ConvexClient` (equivalent of
 *   React's `useConvex` which reads from `ConvexContext`).
 * - {@link useQuery} — reactive query subscription (equivalent of React's
 *   `useQuery` with both positional and object-form overloads).
 *
 * ### Architecture note
 *
 * The React integration (`convex/react`) is built on top of
 * `ConvexReactClient`, `QueriesObserver`, and `useSubscription` — layers
 * needed to safely schedule React re-renders and batch state updates in
 * concurrent mode.
 *
 * Vue's fine-grained reactivity system makes these layers unnecessary.
 * We subscribe directly to `ConvexClient.onUpdate()` and write to `ref()`s,
 * which Vue schedules and batches automatically.
 *
 * @module
 */

export { ConvexClientKey, useConvex } from './client'
export { useQuery } from './useQuery'
export type { UseQueryReturn, UseQueryOptions, OptionalRestArgsOrSkip } from './useQuery'
