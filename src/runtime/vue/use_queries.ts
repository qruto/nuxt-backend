import type { QueryJournal } from 'convex/browser'
import type { FunctionReference } from 'convex/server'
import type { Value } from 'convex/values'
import { onScopeDispose, shallowRef, toValue, watchEffect, type MaybeRefOrGetter, type ShallowRef } from 'vue'
import { useConvex } from './client'
import { QueriesObserver, type CreateWatch, type RequestForQueries } from './queries_observer'

export type { RequestForQueries }

/**
 * Load multiple reactive Convex queries at once.
 *
 * Unlike calling {@link useQuery} multiple times, `useConvexQueries`
 * accepts a reactive map of query descriptors so you can add or remove queries
 * at runtime without breaking the rules of composables.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useConvexQueries } from '#imports'
 * import { api } from '~/backend/_generated/api'
 *
 * const results = useConvexQueries({
 *   tasks: { query: api.tasks.list, args: { completed: false } },
 *   user:  { query: api.users.me, args: {} },
 * })
 * // results.value.tasks — Task[] | undefined
 * // results.value.user  — User  | undefined
 * </script>
 * ```
 *
 * @param queries - A reactive (ref/computed/getter) or plain object mapping
 *   identifiers to `{ query, args }` descriptors.
 * @returns A shallow ref whose value maps each identifier to its query result,
 *   `undefined` while loading, or an `Error` if the query threw.
 *
 * @public
 */
export function useConvexQueries(
  queries: MaybeRefOrGetter<RequestForQueries>,
): ShallowRef<Record<string, any | undefined | Error>> {
  const convex = useConvex()

  const createWatch: CreateWatch = (
    query: FunctionReference<'query'>,
    args: Record<string, Value>,
    { journal }: { journal?: QueryJournal },
  ) => {
    return convex.watchQuery(query, args, journal ? { journal } : {})
  }

  return useQueriesHelper(queries, createWatch)
}

/**
 * Testable core of {@link useConvexQueries} that accepts a custom
 * `createWatch` factory instead of reading from `inject`.
 *
 * @internal
 */
export function useQueriesHelper(
  queries: MaybeRefOrGetter<RequestForQueries>,
  createWatch: CreateWatch,
): ShallowRef<Record<string, any | undefined | Error>> {
  const observer = new QueriesObserver(createWatch)
  const results = shallowRef<Record<string, any | undefined | Error>>({})

  watchEffect((onCleanup) => {
    const currentQueries = toValue(queries)
    observer.setQueries(currentQueries)

    // Read initial value synchronously.
    results.value = observer.getLocalResults(currentQueries)

    const unsubscribe = observer.subscribe(() => {
      results.value = observer.getLocalResults(toValue(queries))
    })

    onCleanup(unsubscribe)
  })

  onScopeDispose(() => observer.destroy())

  return results
}

/** @public */
export const useQueries = useConvexQueries
// Port of convex-js/src/react/use_queries.ts
