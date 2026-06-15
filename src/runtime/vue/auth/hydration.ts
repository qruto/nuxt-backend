import type { FunctionReference, FunctionReturnType } from 'convex/server'
import { makeFunctionReference } from 'convex/server'
import { jsonToConvex } from 'convex/values'
import { computed, type ComputedRef } from 'vue'
import type { Preloaded } from '../hydration'
import { useQuery } from '../composables/use-query'
import { useConvexAuth } from './index'

/**
 * Auth-aware version of {@link usePreloadedQuery} for payloads returned by
 * `backendAuth(event).preloadAuthQuery(...)`.
 *
 * Keeps the server-rendered result visible while client auth is still
 * loading, skips the live query while unauthenticated, and switches to live
 * data once Convex confirms the authenticated state.
 *
 * @public
 */
export function usePreloadedAuthQuery<Query extends FunctionReference<'query'>>(
  preloadedQuery: Preloaded<Query>,
): ComputedRef<FunctionReturnType<Query> | null> {
  const args = jsonToConvex(preloadedQuery._argsJSON) as Query['_args']
  const preloadedResult = jsonToConvex(preloadedQuery._valueJSON) as FunctionReturnType<Query>
  const query = makeFunctionReference(preloadedQuery._name) as Query

  // On the server we render with the preloaded value (as a frozen computed) and
  // defer the live query (and any auth gating) to the client plugin after
  // hydration.
  if (import.meta.server) {
    return computed<FunctionReturnType<Query> | null>(() => preloadedResult)
  }

  const auth = useConvexAuth()

  const liveResult = useQuery(
    query,
    computed<Query['_args'] | 'skip'>(() => auth.isAuthenticated ? args : 'skip'),
  )

  // Derived state → a `computed`; the result type is inferred, not asserted.
  return computed<FunctionReturnType<Query> | null>(() => {
    if (auth.isLoading) return preloadedResult
    if (!auth.isAuthenticated) return null
    return liveResult.value !== undefined ? liveResult.value : preloadedResult
  })
}
