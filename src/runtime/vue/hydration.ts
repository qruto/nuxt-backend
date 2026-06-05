import type { FunctionReference, FunctionReturnType } from 'convex/server'
import { makeFunctionReference } from 'convex/server'
import { jsonToConvex } from 'convex/values'
import { computed, shallowRef, type ShallowRef } from 'vue'
import { useQuery } from './composables/use-query'

/**
 * The preloaded query payload, which should be passed to a client component
 * and used with {@link usePreloadedQuery}.
 *
 * @public
 */
export type Preloaded<Query extends FunctionReference<'query'>> = {
  __type: Query
  _name: string
  _argsJSON: string
  _valueJSON: string
}

/**
 * Load a reactive query within a Vue component using a `Preloaded` payload
 * from a server-side preload.
 *
 * This composable subscribes to the same query and reactively updates
 * when the result changes. Initially returns the preloaded server result
 * for instant display.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { usePreloadedQuery } from '#imports'
 *
 * const props = defineProps<{
 *   preloaded: Preloaded<typeof api.tasks.list>
 * }>()
 *
 * const tasks = usePreloadedQuery(props.preloaded)
 * </script>
 * ```
 *
 * @param preloadedQuery - The `Preloaded` payload from server-side preloading.
 * @returns A shallow ref that initially contains the preloaded data and
 * subsequently updates with live query results.
 *
 * @public
 */
export function usePreloadedQuery<Query extends FunctionReference<'query'>>(
  preloadedQuery: Preloaded<Query>,
): ShallowRef<FunctionReturnType<Query>> {
  const args = jsonToConvex(preloadedQuery._argsJSON) as Query['_args']
  const preloadedResult = jsonToConvex(preloadedQuery._valueJSON) as FunctionReturnType<Query>

  // On the server there is no live query — return the preloaded value
  // without opening a Convex subscription. The client plugin replaces this
  // with a reactive query after hydration.
  if (import.meta.server) {
    return shallowRef(preloadedResult) as ShallowRef<FunctionReturnType<Query>>
  }

  const result = useQuery(
    makeFunctionReference(preloadedQuery._name) as Query,
    args,
  )

  return computed(() => {
    return result.value === undefined ? preloadedResult : result.value
  }) as ShallowRef<FunctionReturnType<Query>>
}
