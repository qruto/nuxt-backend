import type { OptimisticUpdate } from 'convex/browser'
import type { FunctionArgs, FunctionReference, FunctionReturnType, OptionalRestArgs } from 'convex/server'
import { getFunctionName, makeFunctionReference } from 'convex/server'
import type { Value } from 'convex/values'
import { useConvex, type ConvexVueClient } from './client'

/**
 * In Vue, `@click` (and other event) handlers receive a native DOM Event as
 * their first argument. Detect the mistake early and throw a helpful error
 * instead of sending the event object to the Convex backend.
 */
function assertNotAccidentalArgument(value: unknown): void {
  if (
    typeof value === 'object'
    && value !== null
    && 'bubbles' in value
    && 'cancelable' in value
    && 'target' in value
    && 'preventDefault' in value
    && typeof (value as any).preventDefault === 'function'
  ) {
    throw new Error(
      'Convex mutation called with Event object. '
      + 'Did you use a Convex mutation as an event handler directly? '
      + 'Event handlers like @click receive a native Event object as their first argument. '
      + 'These Event objects are not valid Convex values. '
      + 'Try wrapping the function like `const handler = () => myMutation()` '
      + 'and using `handler` in the event handler.',
    )
  }
}

/**
 * A callable object that runs a Convex mutation and optionally applies an
 * optimistic update before the server response arrives.
 *
 * Returned by {@link useMutation} and {@link createMutation}.
 *
 * @public
 */
export interface VueMutation<Mutation extends FunctionReference<'mutation'>> {
  /** Execute the mutation, returning a Promise of its return value. */
  (...args: OptionalRestArgs<Mutation>): Promise<FunctionReturnType<Mutation>>
  /**
   * Define an optimistic update to apply as part of this mutation.
   *
   * @returns A new `VueMutation` with the update configured.
   */
  withOptimisticUpdate(
    optimisticUpdate: OptimisticUpdate<FunctionArgs<Mutation>>,
  ): VueMutation<Mutation>
}

/**
 * Create a mutation function bound to the given client.
 *
 * Low-level alternative to {@link useMutation} for contexts where the
 * Vue composition API (and its `inject`) is unavailable — e.g. unit tests.
 *
 * @public
 */
export function createMutation(
  mutationReference: FunctionReference<'mutation'>,
  client: ConvexVueClient,
  update?: OptimisticUpdate<any>,
): VueMutation<any> {
  function mutation(args?: Record<string, Value>): Promise<unknown> {
    assertNotAccidentalArgument(args)
    return client.mutation(mutationReference, args, {
      optimisticUpdate: update,
    })
  }
  mutation.withOptimisticUpdate = function withOptimisticUpdate(
    optimisticUpdate: OptimisticUpdate<any>,
  ): VueMutation<any> {
    if (update !== undefined) {
      throw new Error(
        `Already specified optimistic update for mutation ${getFunctionName(mutationReference)}`,
      )
    }
    return createMutation(mutationReference, client, optimisticUpdate)
  }
  return mutation as VueMutation<any>
}

/**
 * Construct a new {@link VueMutation}.
 *
 * Returns a function that you can call to execute a Convex mutation.
 * The returned function is stable (same reference) for the lifetime of the composable.
 *
 * Mutations can optionally be configured with optimistic updates.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useMutation } from '#imports'
 * import { api } from '~/backend/_generated/api'
 *
 * const createTask = useMutation(api.tasks.create)
 *
 * async function handleClick() {
 *   await createTask({ text: 'New task' })
 * }
 * </script>
 * ```
 *
 * @param mutation - A FunctionReference for the public mutation to run.
 * @returns The {@link VueMutation} object.
 *
 * @public
 */
export function useMutation<Mutation extends FunctionReference<'mutation'>>(
  mutation: Mutation,
): VueMutation<Mutation> {
  const mutationReference
    = typeof mutation === 'string'
      ? makeFunctionReference<'mutation', any, any>(mutation)
      : mutation

  const convex = useConvex()
  return createMutation(mutationReference, convex) as VueMutation<Mutation>
}

/** @public */
export const useConvexMutation = useMutation
