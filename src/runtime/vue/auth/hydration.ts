import type { FunctionReference, FunctionReturnType } from 'convex/server'
import { makeFunctionReference } from 'convex/server'
import { jsonToConvex } from 'convex/values'
import { computed, shallowRef, watchEffect, type ShallowRef } from 'vue'
import type { Preloaded } from '../hydration'
import { useQuery } from '../composables/use-query'
import { useConvexAuth } from './index'

/**
 * Auth-aware version of {@link usePreloadedQuery} for payloads returned by
 * `backendAuth(event).preloadAuthQuery(...)`.
 *
 * It keeps the server result visible while Convex auth is still loading, skips
 * the live query when the user is unauthenticated, and switches to the live
 * authenticated query once client auth is ready.
 *
 * @public
 */
export function usePreloadedAuthQuery<Query extends FunctionReference<'query'>>(
  preloadedQuery: Preloaded<Query>,
): ShallowRef<FunctionReturnType<Query> | null> {
  const auth = useConvexAuth()
  const args = jsonToConvex(preloadedQuery._argsJSON) as Query['_args']
  const preloadedResult = jsonToConvex(preloadedQuery._valueJSON) as FunctionReturnType<Query>
  const query = makeFunctionReference(preloadedQuery._name) as Query

  const liveResult = useQuery(
    query,
    computed(() => auth.isAuthenticated ? args : 'skip') as Query['_args'] | 'skip',
  )
  const preloadExpired = shallowRef(false)
  const data = shallowRef<FunctionReturnType<Query> | null>(preloadedResult)

  watchEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      preloadExpired.value = true
    }
  })

  watchEffect(() => {
    if (liveResult.value !== undefined) {
      preloadExpired.value = true
    }
  })

  watchEffect(() => {
    if (auth.isLoading) return
    data.value = preloadExpired.value
      ? (liveResult.value ?? null)
      : preloadedResult
  })

  return data as ShallowRef<FunctionReturnType<Query> | null>
}
