import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { makeFunctionReference } from 'convex/server'
import type { Value } from 'convex/values'
import { computed, shallowRef, toValue, watchEffect, type MaybeRefOrGetter, type ShallowRef } from 'vue'
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
 * @returns A shallow ref containing the latest query result, or `undefined`
 *   while the first result is loading.
 *
 * @public
 */
export function useQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  ...args: OptionalRestArgsOrSkip<Query>
): ShallowRef<FunctionReturnType<Query> | undefined> {
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

  // Mirror React's render-time throw semantics by throwing from inside
  // watchEffect — Vue propagates this to the nearest `errorCaptured` boundary,
  // matching React's `<ErrorBoundary>` behavior.
  const result = shallowRef<FunctionReturnType<Query> | undefined>(undefined)
  watchEffect(() => {
    const r = allResults.value.query as FunctionReturnType<Query> | undefined | Error
    if (r instanceof Error) throw r
    result.value = r
  })
  return result
}

/**
 * Load a reactive query within a Vue component using an options object.
 *
 * This is an experimental form of {@link useQuery} that accepts a single
 * {@link UseQueryOptions} object instead of positional arguments and returns a
 * discriminated-union {@link UseQueryResult} as a shallow ref.
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
 * @returns A shallow ref containing the current query state as a
 *   {@link UseQueryResult} object.
 *
 * @public
 */
export function useQuery_experimental<
  Query extends FunctionReference<'query'>,
  ThrowOnError extends boolean = false,
>(
  options: UseQueryOptions<Query, ThrowOnError>,
): ShallowRef<UseQueryResult<FunctionReturnType<Query>, ThrowOnError>>

export function useQuery_experimental<
  Query extends FunctionReference<'query'>,
  ThrowOnError extends boolean = false,
>(
  options: UseQueryOptions<Query, ThrowOnError>,
): ShallowRef<UseQueryResult<FunctionReturnType<Query>, false>> {
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

  // Using shallowRef + watchEffect (instead of `computed` + cast) yields a
  // genuine ShallowRef whose type matches the public signature without `as`.
  const result = shallowRef<UseQueryResult<FunctionReturnType<Query>, false>>({
    status: 'pending',
  })
  watchEffect(() => {
    const r = allResults.value.query as FunctionReturnType<Query> | undefined | Error
    if (r instanceof Error) {
      if (throwOnError) throw r
      result.value = { error: r, status: 'error' }
      return
    }
    if (r === undefined) {
      result.value = { status: 'pending' }
      return
    }
    result.value = { data: r, status: 'success' }
  })
  return result
}

/** @public */
export const useConvexQuery = useQuery
