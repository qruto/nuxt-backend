import type { FunctionReference, FunctionReference_future } from 'convex/server'
import { computed, toValue, type ComputedRef } from 'vue'
import type { OptionalRestArgsOrSkip } from 'nuxt-convex-module/client'
import type { BackendError } from '../utils/backend-error'
import { useLiveQuery } from '../utils/live-query'

export interface UseAggregateReturn {
  /** The count or sum: `undefined` until the first read lands, while skipped, and after a failed read; `0` for a query that answers no number. */
  data: ComputedRef<number | undefined>
  /** `true` until the first read for the current arguments lands; `false` while skipped. */
  isLoading: ComputedRef<boolean>
  /** Why the read failed, or `null`. */
  error: ComputedRef<BackendError | null>
}

/**
 * Reactive numeric aggregate (count / sum) backed by a Convex query, typically
 * one that reads from the {@link https://www.convex.dev/components/aggregate |
 * Aggregate} component. Takes the query's arguments the way `useQuery` does,
 * `'skip'` included. It never throws: a failed read shows in `error`.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useAggregate } from '#imports'
 * import { api } from '#backend/api'
 *
 * const messages = useAggregate(api.aggregates.countMessages)
 * </script>
 * <template>
 *   <p>{{ messages.data.value ?? '…' }} messages</p>
 * </template>
 * ```
 */
export function useAggregate<Query extends FunctionReference<'query'> | FunctionReference_future<'query'>>(
  query: Query,
  ...args: OptionalRestArgsOrSkip<Query>
): UseAggregateReturn {
  const read = useLiveQuery(query, () => (toValue(args[0]) ?? {}) as never)
  return {
    data: computed(() => {
      const value: unknown = read.data.value
      if (value === undefined) return undefined
      return typeof value === 'number' ? value : 0
    }),
    isLoading: read.isLoading,
    error: read.error,
  }
}
