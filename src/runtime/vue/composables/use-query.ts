import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { makeFunctionReference } from 'convex/server'
import type { Value } from 'convex/values'
import { computed, shallowRef, toValue, watchEffect, type MaybeRefOrGetter, type ShallowRef } from 'vue'
import type { RequestForQueries } from '../queries-observer'
import { useConvexQueries } from './use-queries'

type OptionalRestArgsOrSkip<FuncRef extends FunctionReference<'query'>> = FuncRef['_args'] extends Record<string, never>
  ? [args?: Record<string, never> | 'skip']
  : [args: FuncRef['_args'] | 'skip']

export type { OptionalRestArgsOrSkip }

/**
 * The discriminated-union result type returned by the object-options form of
 * {@link useQuery}.
 *
 * @public
 */
export type UseQueryResult<QueryResult> = { data: QueryResult, error: undefined, status: 'success' } | { data: undefined, error: Error, status: 'error' } | { data: undefined, error: undefined, status: 'pending' }

interface UseQueryOptions<Query extends FunctionReference<'query'>> {
  query: Query
  args: MaybeRefOrGetter<FunctionArgs<Query> | 'skip'>
  throwOnError?: boolean
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
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useQuery } from '#imports'
 * import { api } from '~/backend/_generated/api'
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
): ShallowRef<FunctionReturnType<Query> | undefined>

/**
 * Object-options form of {@link useQuery}.
 *
 * Instead of a positional `args` argument, accepts a single options object
 * with `query`, `args` (reactive), and an optional `throwOnError` flag.
 * Returns a discriminated-union {@link UseQueryResult} so you can inspect
 * `status` rather than relying on `undefined` as a loading sentinel.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const result = useQuery({
 *   query: api.tasks.list,
 *   args: computed(() => ({ completed: filter.value })),
 * })
 * // result.value.status: 'pending' | 'success' | 'error'
 * </script>
 * ```
 *
 * @public
 */
export function useQuery<Query extends FunctionReference<'query'>>(
  options: UseQueryOptions<Query>,
): ShallowRef<UseQueryResult<FunctionReturnType<Query>>>

export function useQuery<Query extends FunctionReference<'query'>>(
  queryOrOptions: Query | UseQueryOptions<Query>,
  ...args: OptionalRestArgsOrSkip<Query>
): ShallowRef<FunctionReturnType<Query> | undefined> | ShallowRef<UseQueryResult<FunctionReturnType<Query>>> {
  const isObjectOptions
    = typeof queryOrOptions === 'object'
      && queryOrOptions !== null
      && 'query' in queryOrOptions

  const throwOnError = isObjectOptions
    ? (queryOrOptions.throwOnError ?? false)
    : true

  let queryReference: Query
  let argsGetter: MaybeRefOrGetter<FunctionArgs<Query> | 'skip'>

  if (isObjectOptions) {
    const query = queryOrOptions.query
    queryReference = typeof query === 'string'
      ? (makeFunctionReference<'query'>(query) as Query)
      : query
    argsGetter = queryOrOptions.args
  }
  else {
    const query = queryOrOptions
    queryReference = typeof query === 'string'
      ? (makeFunctionReference<'query'>(query) as Query)
      : query
    argsGetter = (args[0] ?? {}) as MaybeRefOrGetter<FunctionArgs<Query> | 'skip'>
  }

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

  if (isObjectOptions) {
    // Object form: return UseQueryResult discriminated union as a ShallowRef.
    // Using shallowRef + watchEffect (instead of `computed` + cast) yields a
    // genuine ShallowRef whose type matches the public signature without `as`.
    const result = shallowRef<UseQueryResult<FunctionReturnType<Query>>>({
      data: undefined,
      error: undefined,
      status: 'pending',
    })
    watchEffect(() => {
      const r = allResults.value.query
      if (r instanceof Error) {
        if (throwOnError) throw r
        result.value = { data: undefined, error: r, status: 'error' }
        return
      }
      if (r === undefined) {
        result.value = { data: undefined, error: undefined, status: 'pending' }
        return
      }
      result.value = { data: r, error: undefined, status: 'success' }
    })
    return result
  }

  // Positional form: mirror React's render-time throw semantics by throwing
  // from inside watchEffect — Vue propagates this to the nearest
  // `errorCaptured` boundary, matching React's `<ErrorBoundary>` behavior.
  const result = shallowRef<FunctionReturnType<Query> | undefined>(undefined)
  watchEffect(() => {
    const r = allResults.value.query
    if (r instanceof Error) throw r
    result.value = r
  })
  return result
}

/** @public */
export const useConvexQuery = useQuery
