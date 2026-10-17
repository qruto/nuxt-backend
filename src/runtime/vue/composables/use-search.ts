import type { FunctionArgs, FunctionReference, FunctionReference_future, FunctionReturnType } from 'convex/server'
import { computed, onScopeDispose, ref, toValue, watch, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import type { BackendError } from '../utils/backend-error'
import { useLiveQuery, warnCallShape } from '../utils/live-query'

export interface UseSearchOptions<Query extends FunctionReference<'query'> | FunctionReference_future<'query'>> {
  /** The search term (a value, ref or getter). A blank, whitespace-only, `null` or `undefined` term skips the query. */
  term: MaybeRefOrGetter<string | null | undefined>
  /** Debounce, in milliseconds, before the term is sent to the server (a value, ref or getter; default 200). */
  debounce?: MaybeRefOrGetter<number | undefined>
  /** Extra arguments merged with `{ query }` (e.g. `{ limit }` or filter fields). */
  args?: MaybeRefOrGetter<Omit<FunctionArgs<Query>, 'query'>>
}

export interface UseSearchReturn<Query extends FunctionReference<'query'> | FunctionReference_future<'query'>> {
  /** The matching documents: an empty array while loading, while the term is blank, and after a failed read. */
  results: ComputedRef<FunctionReturnType<Query>>
  /** True while a non-empty term is in flight and no result has arrived yet. */
  isLoading: ComputedRef<boolean>
  /** Why the search failed, or `null`. Clears once a later term reads. */
  error: ComputedRef<BackendError | null>
  /** The debounced term currently driving the query. */
  term: ComputedRef<string>
}

/**
 * Reactive, debounced full-text search. Pairs with a query created by
 * `defineSearch` (or any query taking `{ query: string }`): as the term
 * changes it debounces, skips the round-trip while blank, and returns the live
 * results. It never throws: a failed search shows in `error`.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useSearch } from '#imports'
 * import { api } from '#backend/api'
 *
 * const term = ref('')
 * const { results, isLoading } = useSearch(api.search.searchMessages, { term, debounce: 200 })
 * </script>
 * ```
 */
export function useSearch<Query extends FunctionReference<'query'> | FunctionReference_future<'query'>>(
  query: Query,
  options: UseSearchOptions<Query>,
): UseSearchReturn<Query> {
  warnCallShape('useSearch', options, 'useSearch(query, { term })')
  const termOf = () => toValue(options?.term) ?? ''
  const debounced = ref(termOf())
  let handle: ReturnType<typeof setTimeout> | undefined

  watch(termOf, (value) => {
    if (handle) clearTimeout(handle)
    handle = setTimeout(() => {
      debounced.value = value
    }, toValue(options.debounce) ?? 200)
  })
  onScopeDispose(() => {
    if (handle) clearTimeout(handle)
  })

  const args = computed((): FunctionArgs<Query> | 'skip' => {
    const q = debounced.value
    if (!q.trim()) return 'skip'
    const extra = options.args ? toValue(options.args) : ({} as Omit<FunctionArgs<Query>, 'query'>)
    return { ...extra, query: q } as FunctionArgs<Query>
  })

  const read = useLiveQuery(query, args)

  return {
    results: computed(() => (read.data.value ?? []) as FunctionReturnType<Query>),
    isLoading: read.isLoading,
    error: read.error,
    term: computed(() => debounced.value),
  }
}
