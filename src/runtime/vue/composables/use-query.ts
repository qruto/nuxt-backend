import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { makeFunctionReference } from 'convex/server'
import type { Value } from 'convex/values'
import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import { useConvexQueries, type RequestForQueries } from './use-queries'

// Derive UseQueryResult from the canonical React integration (avoids duplicating
// the discriminated union shape here). Import is type-only so no "react" peer
// is pulled for pure-Vue usage. Barrel re-exports the same for consumers.
import type { UseQueryResult as ConvexUseQueryResult } from 'convex/react'
// Our OptionalRestArgsOrSkip is Vue-enhanced (supports MaybeRefOrGetter for reactive args).
type OptionalRestArgsOrSkip<FuncRef extends FunctionReference<'query'>> = FuncRef['_args'] extends Record<string, never>
  ? [args?: MaybeRefOrGetter<Record<string, never> | 'skip'>]
  : [args: MaybeRefOrGetter<FuncRef['_args'] | 'skip'>]

export type { OptionalRestArgsOrSkip }
export type UseQueryResult<QueryResult, ThrowOnError extends boolean = false>
  = ConvexUseQueryResult<QueryResult, ThrowOnError>

interface UseQueryOptions<
  Query extends FunctionReference<'query'>,
  ThrowOnError extends boolean,
> {
  query: Query
  args: MaybeRefOrGetter<FunctionArgs<Query> | 'skip'>
  throwOnError?: ThrowOnError
}

/**
 * Load a reactive query within a Vue component.
 *
 * Subscribes to a Convex query and returns a shallow ref that updates
 * automatically whenever the server sends a new result. The subscription is
 * started when the component mounts and cleaned up on unmount.
 *
 * Pass `'skip'` (or a reactive getter that returns `'skip'`) to conditionally
 * disable the subscription without breaking the rules of composables.
 *
 * Returns `undefined` while the first result is loading. Query errors are
 * thrown and propagate to the nearest `errorCaptured` boundary — use
 * {@link useQuery_experimental} if you want errors returned in the result.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useQuery } from '#imports'
 * import { api } from '#backend/api'
 *
 * const tasks = useQuery(api.tasks.list, { completed: false })
 * // tasks.value is Task[] | undefined while the first result is loading
 *
 * // Conditionally disable with 'skip'
 * const profile = useQuery(
 *   api.users.get,
 *   computed(() => userId.value ? { userId: userId.value } : 'skip'),
 * )
 * </script>
 * ```
 *
 * @param query - A `FunctionReference` for the public query to run.
 * @param args - Arguments for the query, or `'skip'` to pause the subscription.
 *   Accepts a ref, computed, or getter for reactive args.
 * @returns A computed ref containing the latest query result, or `undefined`
 *   while the first result is loading.
 *
 * @public
 */
export function useQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  ...args: OptionalRestArgsOrSkip<Query>
): ComputedRef<FunctionReturnType<Query> | undefined> {
  const queryReference = typeof query === 'string'
    ? (makeFunctionReference<'query'>(query) as Query)
    : query
  const argsGetter = (args[0] ?? {}) as MaybeRefOrGetter<FunctionArgs<Query> | 'skip'>

  // Build reactive queries input for useConvexQueries.
  const queriesInput = computed((): RequestForQueries => {
    const currentArgs = toValue(argsGetter)
    if (currentArgs === 'skip') {
      return {}
    }
    return {
      query: {
        query: queryReference,
        args: currentArgs as Record<string, Value>,
      },
    }
  })

  const allResults = useConvexQueries(queriesInput)

  // The result is derived state, so it is a `computed` (VueUse convention for
  // derived values). Mirroring React's render-time throw, the getter throws on
  // error — Vue surfaces that when `.value` is read during render and
  // propagates it to the nearest `errorCaptured` boundary (React's
  // `<ErrorBoundary>` analog). Returning the narrowed value means the public
  // `ComputedRef` type is inferred, not asserted.
  return computed(() => {
    const r = allResults.value.query as FunctionReturnType<Query> | undefined | Error
    if (r instanceof Error) throw r
    return r
  })
}

/**
 * Load a reactive query within a Vue component using an options object.
 *
 * This is an experimental form of {@link useQuery} that accepts a single
 * {@link UseQueryOptions} object instead of positional arguments and returns a
 * discriminated-union {@link UseQueryResult} as a computed ref.
 *
 * Inspect the returned `status` field to use the result. If an error occurs it
 * is present in the result object unless `throwOnError` is `true`, in which case
 * the error is thrown instead.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useQuery_experimental as useQuery } from '#imports'
 * import { api } from '#backend/api'
 *
 * const state = useQuery({ query: api.tasks.list, args: { completed: false } })
 * // state.value.status: 'pending' | 'success' | 'error'
 * </script>
 * ```
 *
 * @param options - Query options. Pass `args: 'skip'` to disable the query.
 * @returns A computed ref containing the current query state as a
 *   {@link UseQueryResult} object.
 *
 * @public
 */
export function useQuery_experimental<
  Query extends FunctionReference<'query'>,
  ThrowOnError extends boolean = false,
>(
  options: UseQueryOptions<Query, ThrowOnError>,
): ComputedRef<UseQueryResult<FunctionReturnType<Query>, ThrowOnError>>

export function useQuery_experimental<
  Query extends FunctionReference<'query'>,
  ThrowOnError extends boolean = false,
>(
  options: UseQueryOptions<Query, ThrowOnError>,
): ComputedRef<UseQueryResult<FunctionReturnType<Query>, false>> {
  const throwOnError = options.throwOnError ?? false
  const queryReference = typeof options.query === 'string'
    ? (makeFunctionReference<'query'>(options.query) as Query)
    : options.query
  const argsGetter = options.args

  // Build reactive queries input for useConvexQueries.
  const queriesInput = computed((): RequestForQueries => {
    const currentArgs = toValue(argsGetter)
    if (currentArgs === 'skip') {
      return {}
    }
    return {
      query: {
        query: queryReference,
        args: currentArgs as Record<string, Value>,
      },
    }
  })

  const allResults = useConvexQueries(queriesInput)

  // Derived discriminated-union state → a `computed`. The explicit type
  // argument gives the returned object literals their contextual type (so
  // `status: 'error'` narrows to the literal), letting the `ComputedRef` type
  // be inferred without a cast. Errors are returned as `status: 'error'` unless
  // `throwOnError`, in which case the getter throws (→ `errorCaptured`).
  return computed<UseQueryResult<FunctionReturnType<Query>, false>>(() => {
    const r = allResults.value.query as FunctionReturnType<Query> | undefined | Error
    if (r instanceof Error) {
      if (throwOnError) throw r
      return { error: r, status: 'error' }
    }
    if (r === undefined) {
      return { status: 'pending' }
    }
    return { data: r, status: 'success' }
  })
}

/** @public */
export const useConvexQuery = useQuery
