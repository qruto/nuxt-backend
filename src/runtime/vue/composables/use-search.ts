import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { computed, onScopeDispose, ref, toValue, watch, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import { useQuery } from './use-query'

export interface UseSearchOptions<Query extends FunctionReference<'query'>> {
  /** Debounce, in milliseconds, before the term is sent to the server (default 200). */
  debounce?: number
  /** Extra arguments merged with `{ query }` (e.g. `{ limit }` or filter fields). */
  args?: MaybeRefOrGetter<Omit<FunctionArgs<Query>, 'query'>>
}

export interface UseSearchResult<Query extends FunctionReference<'query'>> {
  /** The matching documents (empty array while loading or when the term is blank). */
  results: ComputedRef<FunctionReturnType<Query>>
  /** True while a non-empty term is in flight and no result has arrived yet. */
  isLoading: ComputedRef<boolean>
  /** The debounced term currently driving the query. */
  term: ComputedRef<string>
}

/**
 * Reactive, debounced full-text search. Pairs with a query created by
 * `defineSearch` (or any query taking `{ query: string }`): as the term ref
 * changes it debounces, skips the round-trip while blank, and returns the live
 * results.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useSearch } from '#imports'
 * import { api } from '#backend/api'
 *
 * const term = ref('')
 * const { results, isLoading } = useSearch(api.search.searchMessages, term, { debounce: 200 })
 * </script>
 * ```
 */
export function useSearch<Query extends FunctionReference<'query'>>(
  query: Query,
  term: MaybeRefOrGetter<string>,
  options: UseSearchOptions<Query> = {},
): UseSearchResult<Query> {
  const debounceMs = options.debounce ?? 200
  const debounced = ref(toValue(term))
  let handle: ReturnType<typeof setTimeout> | undefined

  watch(() => toValue(term), (value) => {
    if (handle) clearTimeout(handle)
    handle = setTimeout(() => {
      debounced.value = value
    }, debounceMs)
  })
  onScopeDispose(() => {
    if (handle) clearTimeout(handle)
  })

  const args = computed((): FunctionArgs<Query> | 'skip' => {
    const q = debounced.value
    if (!q) return 'skip'
    const extra = options.args ? toValue(options.args) : ({} as Omit<FunctionArgs<Query>, 'query'>)
    return { ...extra, query: q } as FunctionArgs<Query>
  })

  const data = useQuery(query, args)
  const results = computed(() => (data.value ?? []) as FunctionReturnType<Query>)
  const isLoading = computed(() => Boolean(debounced.value) && data.value === undefined)

  return {
    results,
    isLoading,
    term: computed(() => debounced.value),
  }
}

/** @public */
export const useConvexSearch = useSearch
