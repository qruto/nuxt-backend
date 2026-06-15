import type { QueryJournal } from 'convex/browser'
import type { FunctionReference } from 'convex/server'
import type { Value } from 'convex/values'
import { onScopeDispose, shallowRef, toValue, watchEffect, type MaybeRefOrGetter, type ShallowRef } from 'vue'
import { useConvex } from '../client'
import { QueriesObserver, type CreateWatch } from '../queries-observer'
// Derive RequestForQueries (and its paginationOptions support) from the canonical
// React integration to stay in sync without duplicating the type shape.
import type { RequestForQueries } from 'convex/react'

export type { RequestForQueries }

export type QueriesResults = Record<string, Value | undefined | Error | unknown>

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
 * import { api } from '#backend/api'
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
): ShallowRef<QueriesResults> {
  const convex = useConvex()

  const createWatch: CreateWatch = (
    query: FunctionReference<'query'>,
    args: Record<string, Value>,
    {
      journal,
      paginationOptions,
    }: {
      journal?: QueryJournal
      // `paginationOptions` mirrors React's createWatch: its presence requests a
      // paginated subscription. The Vue port has no client-level paginated
      // engine (Convex's internal PaginatedQueryClient is not publicly
      // exported), so this branch throws — paginated queries go through the
      // `usePaginatedQuery` composable, which only ever passes plain queries
      // here. The branch is kept for structural parity with the React client.
      paginationOptions?: unknown
    },
  ) => {
    if (paginationOptions) {
      return convex.watchPaginatedQuery(query, args, paginationOptions)
    }
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
): ShallowRef<QueriesResults> {
  const observer = new QueriesObserver(createWatch)
  const results = shallowRef<QueriesResults>({})

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
// Public alias for the Vue composable name used by the module.
