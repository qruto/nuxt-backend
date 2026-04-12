import type { FunctionReference, FunctionArgs, FunctionReturnType } from 'convex/server'
import { useBackend } from './useBackend'

type ActionReference = FunctionReference<'action'>

/**
 * Returns an async function to call a backend action.
 */
export function useAction<Action extends ActionReference>(
  action: Action,
): (args: FunctionArgs<Action>) => Promise<FunctionReturnType<Action>> {
  const client = useBackend()
  return (args: FunctionArgs<Action>) => client.action(action, args)
}
