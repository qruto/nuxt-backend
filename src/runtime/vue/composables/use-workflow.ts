import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import { useQuery } from './use-query'

/**
 * Reactively track a durable {@link https://www.convex.dev/components/workflow |
 * Workflow}'s status. Pass a query that takes `{ workflowId }` (wrapping
 * `workflow.status`) and the id to watch; the subscription pauses while the id
 * is null/undefined and updates live as the workflow progresses.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useWorkflowStatus } from '#imports'
 * import { api } from '#backend/api'
 *
 * const status = useWorkflowStatus(api.workflows.status, workflowId)
 * // status.value?.type: 'inProgress' | 'completed' | 'failed' | 'canceled'
 * </script>
 * ```
 */
export function useWorkflowStatus<Query extends FunctionReference<'query'>>(
  query: Query,
  workflowId: MaybeRefOrGetter<string | null | undefined>,
): ComputedRef<FunctionReturnType<Query> | undefined> {
  const args = computed((): FunctionArgs<Query> | 'skip' => {
    const id = toValue(workflowId)
    // The Query is constrained to take `{ workflowId: string }`, but TS treats
    // `FunctionArgs<Query>` as opaque for a generic Query, so assert the shape.
    return id ? ({ workflowId: id } as FunctionArgs<Query>) : 'skip'
  })
  return useQuery(query, args)
}
