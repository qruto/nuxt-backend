import type { FunctionReference } from 'convex/server'
import { computed, type ComputedRef } from 'vue'
import { useQuery, type OptionalRestArgsOrSkip } from './use-query'

/**
 * Reactive numeric aggregate (count / sum) backed by a Convex query — typically
 * one that reads from the {@link https://www.convex.dev/components/aggregate |
 * Aggregate} component. Coerces the loading/`null` state to `0` so templates can
 * bind directly.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useCount } from '#imports'
 * import { api } from '#backend/api'
 *
 * const messageCount = useCount(api.aggregates.countMessages)
 * </script>
 * ```
 */
export function useAggregate<Query extends FunctionReference<'query'>>(
  query: Query,
  ...args: OptionalRestArgsOrSkip<Query>
): ComputedRef<number> {
  const data = useQuery(query, ...args)
  return computed(() => {
    const value = data.value
    return typeof value === 'number' ? value : 0
  })
}

/** Alias of {@link useAggregate}, for the common count case. @public */
export const useCount = useAggregate
