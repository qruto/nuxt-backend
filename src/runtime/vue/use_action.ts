import type { FunctionReference, FunctionReturnType, OptionalRestArgs } from 'convex/server'
import { makeFunctionReference } from 'convex/server'
import { useConvex } from './client'

/**
 * An interface to execute a Convex action on the server.
 *
 * @public
 */
export interface VueAction<Action extends FunctionReference<'action'>> {
  /** Execute the action, returning a Promise of its return value. */
  (...args: OptionalRestArgs<Action>): Promise<FunctionReturnType<Action>>
}

/**
 * Construct a new {@link VueAction}.
 *
 * Returns a function that you can call to execute a Convex action.
 * The returned function is stable (same reference) for the lifetime of the composable.
 *
 * Actions can call third-party APIs and perform side effects.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useAction } from '#imports'
 * import { api } from '~/backend/_generated/api'
 *
 * const generate = useAction(api.ai.generateSummary)
 *
 * async function handleClick() {
 *   try {
 *     const summary = await generate({ text: 'Some long text...' })
 *     console.log(summary)
 *   } catch (error) {
 *     console.error('Action failed:', error)
 *   }
 * }
 * </script>
 * ```
 *
 * @param action - A FunctionReference for the public action to run.
 * @returns The {@link VueAction} object.
 *
 * @public
 */
export function useAction<Action extends FunctionReference<'action'>>(
  action: Action,
): VueAction<Action> {
  const actionReference
    = typeof action === 'string'
      ? makeFunctionReference<'action'>(action) as Action
      : action

  const convex = useConvex()
  return function (...args: OptionalRestArgs<Action>): Promise<FunctionReturnType<Action>> {
    return convex.action(actionReference, ...args)
  } as VueAction<Action>
}

/** @public */
export const useConvexAction = useAction
