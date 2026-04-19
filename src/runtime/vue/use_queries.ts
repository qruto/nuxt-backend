/**
 * Port of convex-js/src/react/use_queries.ts
 *
 * Adapted from React hooks to Vue composables:
 * - `useState(() => new QueriesObserver(...))` → instance created in setup
 * - `useEffect` cleanup → `onScopeDispose`
 * - `useSubscription({ getCurrentValue, subscribe })` → `shallowRef` + observer subscription
 *
 * The `QueriesObserver` class is used verbatim from queries_observer.ts.
 *
 * @see https://github.com/get-convex/convex-js/blob/a6e554e/src/react/use_queries.ts
 * @internal
 */
import type { Value } from 'convex/values'
import { shallowRef, triggerRef, onScopeDispose } from 'vue'
import type { FunctionReference } from 'convex/server'
import { getFunctionName } from 'convex/server'
import { useConvex } from './client'
import { type CreateWatch, type Watch, QueriesObserver } from './queries_observer'

/**
 * An object representing a request to load multiple queries.
 *
 * The keys of this object are identifiers and the values are objects containing
 * the query function and the arguments to pass to it.
 *
 * This is used as an argument to {@link useQueries}.
 *
 * Mirrors React's `RequestForQueries` type.
 * @public
 */
export type RequestForQueries = Record<
  string,
  {
    query: FunctionReference<'query'>
    args: Record<string, Value>
  }
>

/**
 * Load a variable number of reactive Convex queries.
 *
 * `useQueries` is similar to `useQuery` but it allows
 * loading multiple queries which can be useful for loading a dynamic number
 * of queries without violating the rules of hooks/composables.
 *
 * This composable accepts an object whose keys are identifiers for each query
 * and the values are objects of `{ query: FunctionReference, args: Record<string, Value> }`.
 *
 * Returns a ref containing an object that maps each identifier to the result
 * of the query, `undefined` if the query is still loading, or an instance of
 * `Error` if the query threw an exception.
 *
 * Mirrors the React `useQueries` hook. The `QueriesObserver` class is used
 * verbatim from the React source. Only the hook/subscription glue is
 * replaced with Vue equivalents.
 *
 * @see https://github.com/get-convex/convex-js/blob/a6e554e/src/react/use_queries.ts
 * @internal
 */
export function useQueries(
  queries: RequestForQueries,
): Record<string, Value | undefined | Error> {
  const convex = useConvex()

  // Mirrors React: `const createWatch = useMemo(() => ..., [convex])`
  //
  // Bridges ConvexClient → Watch interface using the same approach
  // as useQuery's createWatchFactory.
  const createWatch: CreateWatch = (
    query: FunctionReference<'query'>,
    args: Record<string, Value>,
    _options: { journal?: unknown },
  ): Watch<Value> => {
    const name = getFunctionName(query)
    return {
      // Mirrors ConvexReactClient.watchQuery().onUpdate()
      onUpdate: (callback: () => void) => {
        const unsub = convex.onUpdate(
          query,
          args as Parameters<typeof convex.onUpdate>[1],
          () => callback(),
          () => callback(),
        )
        return () => unsub()
      },
      // Mirrors ConvexReactClient.watchQuery().localQueryResult()
      localQueryResult: () => {
        return convex.client.localQueryResult(name, args) as Value | undefined
      },
      // Mirrors ConvexReactClient.watchQuery().journal()
      journal: () => {
        return convex.client.queryJournal(name, args)
      },
    }
  }

  return useQueriesHelper(queries, createWatch)
}

/**
 * Internal version of `useQueries` that is exported for testing.
 *
 * Mirrors React's `useQueriesHelper`.
 *
 * React equivalences:
 * - `useState(() => new QueriesObserver(...))` → observer created in setup
 * - `useEffect(() => () => observer.destroy(), [observer])` → `onScopeDispose`
 * - `useMemo({ getCurrentValue, subscribe })` → inline
 * - `useSubscription(subscription)` → shallowRef + observer.subscribe
 *
 * @internal
 */
export function useQueriesHelper(
  queries: RequestForQueries,
  createWatch: CreateWatch,
): Record<string, Value | undefined | Error> {
  // React: `const [observer] = useState(() => new QueriesObserver(createWatch))`
  const observer = new QueriesObserver(createWatch)

  // React: `useEffect(() => () => observer.destroy(), [observer])`
  onScopeDispose(() => observer.destroy())

  // React uses useMemo + useSubscription. In Vue, we:
  // 1. Set queries on the observer
  // 2. Subscribe to observer notifications
  // 3. Update a shallowRef when notified
  observer.setQueries(queries)

  const results = shallowRef<Record<string, Value | undefined | Error>>(
    observer.getLocalResults(queries),
  )

  const unsubscribe = observer.subscribe(() => {
    results.value = observer.getLocalResults(queries)
    triggerRef(results)
  })

  onScopeDispose(() => unsubscribe())

  return results.value
}
