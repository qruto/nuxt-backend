import type { FunctionArgs, FunctionReference, FunctionReference_future, FunctionReturnType } from 'convex/server'
import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import type { BackendError } from '../utils/backend-error'
import { useLiveQuery, warnCallShape } from '../utils/live-query'

export interface UseWorkflowStatusOptions {
  /** The workflow to watch (a value, ref or getter). The subscription pauses while it is `null`, `undefined` or blank. */
  workflowId: MaybeRefOrGetter<string | null | undefined>
}

export interface UseWorkflowStatusReturn<Query extends FunctionReference<'query'> | FunctionReference_future<'query'>> {
  /** The status your query returns: `undefined` until the first read lands, while paused, and after a failed read. */
  data: ComputedRef<FunctionReturnType<Query> | undefined>
  /** `true` until the first read for the current id lands; `false` while paused. */
  isLoading: ComputedRef<boolean>
  /** Why the read failed, or `null`. */
  error: ComputedRef<BackendError | null>
}

/**
 * Reactively track a durable {@link https://www.convex.dev/components/workflow |
 * Workflow}'s status. Pass a query that takes `{ workflowId }` (wrapping
 * `workflow.status`) and the id to watch; the subscription pauses while the id
 * is empty and updates live as the workflow progresses. It never throws: a
 * failed read shows in `error`.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useWorkflowStatus } from '#imports'
 * import { api } from '#backend/api'
 *
 * const status = useWorkflowStatus(api.workflows.status, { workflowId })
 * // status.data.value?.type: 'inProgress' | 'completed' | 'failed' | 'canceled'
 * </script>
 * ```
 *
 * @experimental Tracks the upstream workflow component's status shape, which
 * is still pre-1.0; may change in a minor release (see STABILITY.md).
 */
export function useWorkflowStatus<Query extends FunctionReference<'query'> | FunctionReference_future<'query'>>(
  query: Query,
  options: UseWorkflowStatusOptions,
): UseWorkflowStatusReturn<Query> {
  warnCallShape('useWorkflowStatus', options, 'useWorkflowStatus(query, { workflowId })')
  const args = computed((): FunctionArgs<Query> | 'skip' => {
    const id = toValue(options?.workflowId)?.trim()
    // The Query is constrained to take `{ workflowId: string }`, but TS treats
    // `FunctionArgs<Query>` as opaque for a generic Query, so assert the shape.
    return id ? ({ workflowId: id } as FunctionArgs<Query>) : 'skip'
  })
  return useLiveQuery(query, args)
}
