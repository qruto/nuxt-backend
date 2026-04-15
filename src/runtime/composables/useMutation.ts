import type { FunctionReference, FunctionArgs, FunctionReturnType } from 'convex/server'
import { useBackend } from './useBackend'

type MutationReference = FunctionReference<'mutation'>

/**
 * Returns an async function to call a backend mutation.
 */
export function useMutation<Mutation extends MutationReference>(
  mutation: Mutation,
): (args: FunctionArgs<Mutation>) => Promise<FunctionReturnType<Mutation>> {
  const client = useBackend()
  return (args: FunctionArgs<Mutation>) => client.mutation(mutation, args)
}
