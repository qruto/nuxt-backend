/**
 * Port of the `useQuery` function from convex-js/src/react/client.ts
 *
 * The internal logic (argument parsing, skip detection, delegation to
 * `QueriesObserver`, JSON serialisation for memoisation) matches the React
 * source as closely as possible so that upstream changes can be merged with
 * minimal diff.
 *
 * Only the **user-facing API** is adapted to Vue / Nuxt conventions:
 *
 * | React | Vue (this file) | Why |
 * |-------|-----------------|-----|
 * | Positional form returns `T \| undefined` | Always returns `{ data, error, status }` refs | Vue ecosystem standard (`useAsyncData`, VueUse, etc.) |
 * | Args are plain values, React re-renders trigger re-evaluation | Args can be `MaybeRefOrGetter` for reactive re-subscription | Idiomatic Vue reactivity |
 * | `useMemo` + `useQueries` + `useSubscription` chain | `watch()` with JSON-serialised source + direct `QueriesObserver` | Vue's fine-grained reactivity replaces React's concurrent-mode subscription glue |
 * | `useEffect` cleanup | `onScopeDispose` | Vue lifecycle equivalent |
 * | `React.useContext(ConvexContext)` | `inject(ConvexClientKey)` | Vue's dependency injection |
 *
 * @see https://github.com/get-convex/convex-js/blob/a6e554e/src/react/client.ts
 * @module
 */
import type { Ref, MaybeRefOrGetter } from 'vue'
import { ref, watch, toValue, onScopeDispose } from 'vue'
import { convexToJson, type Value } from 'convex/values'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { getFunctionName, makeFunctionReference } from 'convex/server'
import { useConvex } from './client'
import { type CreateWatch, type Watch, QueriesObserver } from './queries_observer'
import type { RequestForQueries } from './use_queries'

// Matches convex-js/src/server/registration.ts EmptyObject (not publicly exported)
type EmptyObject = Record<string, never>

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Return type of {@link useQuery}.
 *
 * Matches React's `UseQueryResult` discriminated union but exposed as
 * individual Vue refs so that each field can be watched independently.
 *
 * @public
 */
export interface UseQueryReturn<T> {
  /** The latest query result, or `undefined` while loading / on error. */
  data: Ref<T | undefined>
  /** The error if the query failed, or `undefined` otherwise. */
  error: Ref<Error | undefined>
  /** Tri-state loading status, matching React's `UseQueryResult['status']`. */
  status: Ref<'pending' | 'success' | 'error'>
}

/**
 * Options object accepted by the object-form overload of {@link useQuery}.
 *
 * Mirrors React's `UseQueryOptions<Query>`. In Vue, `args` can additionally
 * be a `Ref`, `ComputedRef`, or getter for reactive re-subscription.
 *
 * @public
 */
export interface UseQueryOptions<Query extends FunctionReference<'query'>> {
  query: Query
  args: MaybeRefOrGetter<FunctionArgs<Query> | 'skip'>
}

// ---------------------------------------------------------------------------
// Conditional tuple for the positional overload.
//
// Matches React's `OptionalRestArgsOrSkip` from src/react/client.ts:
//   export type OptionalRestArgsOrSkip<FuncRef extends FunctionReference<any>> =
//     FuncRef["_args"] extends EmptyObject
//       ? [args?: EmptyObject | "skip"]
//       : [args: FuncRef["_args"] | "skip"];
//
// The Vue adaptation wraps the value in `MaybeRefOrGetter` so the
// subscription automatically re-runs when reactive dependencies change.
// ---------------------------------------------------------------------------

/**
 * @public
 */
export type OptionalRestArgsOrSkip<FuncRef extends FunctionReference<'query'>>
  = FuncRef['_args'] extends EmptyObject
    ? [args?: MaybeRefOrGetter<FuncRef['_args'] | 'skip'>]
    : [args: MaybeRefOrGetter<FuncRef['_args'] | 'skip'>]

// ---------------------------------------------------------------------------
// parseArgs — inlined from convex-js/src/common/index.ts
// (not publicly exported by the convex package)
//
// @see https://github.com/get-convex/convex-js/blob/a6e554e/src/common/index.ts
// ---------------------------------------------------------------------------

function isSimpleObject(value: unknown) {
  const isObject = typeof value === 'object'
  const prototype = Object.getPrototypeOf(value)
  const isSimple
    = prototype === null
      || prototype === Object.prototype
      || prototype?.constructor?.name === 'Object'
  return isObject && isSimple
}

function parseArgs(
  args: Record<string, Value> | undefined,
): Record<string, Value> {
  if (args === undefined) {
    return {}
  }
  if (!isSimpleObject(args)) {
    throw new Error(
      `The arguments to a Convex function must be an object. Received: ${args as unknown as string}`,
    )
  }
  return args
}

// ---------------------------------------------------------------------------
// createWatchFromClient — bridges ConvexClient → Watch interface
//
// ConvexReactClient.watchQuery() creates Watch objects on top of
// BaseConvexClient. ConvexClient exposes the same BaseConvexClient
// via `.client`, so we can build the same Watch interface.
//
// @see ConvexReactClient.watchQuery() in convex-js/src/react/client.ts
// ---------------------------------------------------------------------------

function createWatchFactory(convex: ReturnType<typeof useConvex>): CreateWatch {
  return (
    query: FunctionReference<'query'>,
    args: Record<string, Value>,
    _options: { journal?: unknown },
  ): Watch<Value> => {
    const name = getFunctionName(query)
    return {
      // Mirrors ConvexReactClient.watchQuery().onUpdate()
      //
      // ConvexReactClient stores callbacks in a listeners map and invokes
      // them via `_transition()`. ConvexClient does the same internally
      // through its `onUpdate()` method, so we delegate to it.
      onUpdate: (callback: () => void) => {
        const unsub = convex.onUpdate(
          query,
          args as FunctionArgs<typeof query>,
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
}

// ---------------------------------------------------------------------------
// useQuery
// ---------------------------------------------------------------------------

/**
 * Load a reactive query within a Vue component.
 *
 * Subscribes to a Convex query function and returns reactive refs that update
 * whenever the server pushes a new result. The subscription is managed
 * automatically — it starts when the composable is called and is cleaned up
 * via `onScopeDispose`.
 *
 * Internally this follows the same path as the React `useQuery`:
 *
 *   useQuery → QueriesObserver.setQueries → Watch.onUpdate → localQueryResult
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useQuery } from '#imports'
 * import { api } from '~/backend/_generated/api'
 *
 * // Simple usage
 * const { data: tasks } = useQuery(api.tasks.list, { completed: false })
 *
 * // With reactive args
 * const completed = ref(false)
 * const { data: tasks } = useQuery(api.tasks.list, computed(() => ({ completed: completed.value })))
 *
 * // Conditional skip
 * const userId = ref<string | undefined>(undefined)
 * const { data: profile } = useQuery(
 *   api.users.get,
 *   computed(() => userId.value ? { userId: userId.value } : 'skip'),
 * )
 *
 * // Object form
 * const { data, error, status } = useQuery({
 *   query: api.tasks.list,
 *   args: { completed: false },
 * })
 * </script>
 * ```
 *
 * @public
 */
// Overload: object form
export function useQuery<Query extends FunctionReference<'query'>>(
  options: UseQueryOptions<Query>,
): UseQueryReturn<FunctionReturnType<Query>>

// Overload: positional form
export function useQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  ...args: OptionalRestArgsOrSkip<Query>
): UseQueryReturn<FunctionReturnType<Query>>

// Implementation — follows React source structure from src/react/client.ts:
//
//   1. Detect object vs positional form
//   2. Resolve queryReference via makeFunctionReference (for string queries)
//   3. Parse args via parseArgs
//   4. Build `queries` map (same as React's useMemo)
//   5. Pass to QueriesObserver (same as React's useQueries → useQueriesHelper)
//   6. Map result to { data, error, status } refs
//
export function useQuery<Query extends FunctionReference<'query'>>(
  queryOrOptions: Query | UseQueryOptions<Query>,
  ...positionalArgs: [MaybeRefOrGetter<FunctionArgs<Query> | 'skip'>?]
): UseQueryReturn<FunctionReturnType<Query>> {
  const convex = useConvex()

  // ---- Step 1: Detect calling convention (matches React source) ----
  //
  // React:
  //   const isObjectOptions = typeof queryOrOptions === "object"
  //     && queryOrOptions !== null && "query" in queryOrOptions;
  //
  const isObjectOptions
    = typeof queryOrOptions === 'object'
      && queryOrOptions !== null
      && 'query' in queryOrOptions

  // ---- Step 2: Resolve query reference (matches React source) ----
  //
  // React:
  //   queryReference = typeof query === "string"
  //     ? makeFunctionReference<"query", any, any>(query) : query;
  //
  const rawQuery = isObjectOptions
    ? (queryOrOptions as UseQueryOptions<Query>).query
    : queryOrOptions as Query

  const queryReference = (
    typeof rawQuery === 'string'
      ? makeFunctionReference<'query'>(rawQuery)
      : rawQuery
  ) as Query

  // ---- Resolve args source (Vue-specific: args can be reactive) ----
  const argsSource: MaybeRefOrGetter<FunctionArgs<Query> | 'skip'> = isObjectOptions
    ? (queryOrOptions as UseQueryOptions<Query>).args
    : (positionalArgs[0] ?? {}) as MaybeRefOrGetter<FunctionArgs<Query> | 'skip'>

  // React: `const queryName = queryReference ? getFunctionName(queryReference) : undefined`
  const queryName = queryReference ? getFunctionName(queryReference) : undefined

  // ---- Reactive output refs ----
  const data = ref<FunctionReturnType<Query> | undefined>() as Ref<FunctionReturnType<Query> | undefined>
  const error = ref<Error | undefined>() as Ref<Error | undefined>
  const status = ref<'pending' | 'success' | 'error'>('pending') as Ref<'pending' | 'success' | 'error'>

  // ---- Step 5: QueriesObserver (matches React's useQueriesHelper) ----
  //
  // React: `const createWatch = useMemo(() => (query, args, opts) => convex.watchQuery(query, args, opts), [convex])`
  //
  // We build the Watch interface on top of ConvexClient.client (BaseConvexClient),
  // mirroring ConvexReactClient.watchQuery() from the React source.
  const createWatch = createWatchFactory(convex)

  // React: `const [observer] = useState(() => new QueriesObserver(createWatch))`
  const observer = new QueriesObserver(createWatch)

  // React: `useEffect(() => () => observer.destroy(), [observer])`
  onScopeDispose(() => observer.destroy())

  // ---- Result processing (matches React source) ----
  //
  // React (src/react/client.ts):
  //   const results = useQueries(queries);
  //   const result = results["query"];
  //   if (result instanceof Error) → error state
  //   if (result === undefined) → pending state
  //   else → success state
  //
  function updateRefs(result: Value | undefined | Error) {
    if (result instanceof Error) {
      data.value = undefined
      error.value = result
      status.value = 'error'
    }
    else if (result === undefined) {
      data.value = undefined
      error.value = undefined
      status.value = 'pending'
    }
    else {
      data.value = result as FunctionReturnType<Query>
      error.value = undefined
      status.value = 'success'
    }
  }

  // ---- Build queries + sync (matches React's useMemo + useQueries) ----
  function buildQueriesAndSync() {
    const currentArgs = toValue(argsSource)

    // React:
    //   const skip = (isObjectOptions && queryOrOptions.args === "skip")
    //     || (!isObjectOptions && args[0] === "skip");
    //   const argsObject = skip ? {} : parseArgs(args[0]);
    //   const queries = useMemo(
    //     () => skip || !queryReference ? {} : { query: { query: queryReference, args: argsObject } },
    //     [JSON.stringify(convexToJson(argsObject)), queryName, skip],
    //   );
    const skip = currentArgs === 'skip'
    const argsObject: Record<string, Value> = skip
      ? {}
      : parseArgs(currentArgs as Record<string, Value>)

    const queries: RequestForQueries = skip || !queryReference
      ? {}
      : { query: { query: queryReference, args: argsObject } }

    // React: observer.setQueries(queries) happens via useSubscription callback
    observer.setQueries(queries)

    // React: useSubscription.getCurrentValue → observer.getLocalResults(queries)
    const results = observer.getLocalResults(queries)
    updateRefs(results.query)
  }

  // Subscribe to observer notifications
  // (replaces React's useSubscription which triggers re-renders)
  let observerUnsub: (() => void) | undefined

  function setupObserverSubscription() {
    observerUnsub?.()
    observerUnsub = observer.subscribe(() => {
      const currentArgs = toValue(argsSource)
      const skip = currentArgs === 'skip'
      const argsObject: Record<string, Value> = skip
        ? {}
        : parseArgs(currentArgs as Record<string, Value>)
      const queries: RequestForQueries = skip || !queryReference
        ? {}
        : { query: { query: queryReference, args: argsObject } }
      const results = observer.getLocalResults(queries)
      updateRefs(results.query)
    })
  }

  setupObserverSubscription()
  onScopeDispose(() => observerUnsub?.())

  // ---- Reactivity (Vue adaptation of React's useMemo deps) ----
  //
  // React memoises via:
  //   [JSON.stringify(convexToJson(argsObject)), queryName, skip]
  //
  // We watch the same serialised representation so that structurally-equal
  // args don't cause spurious re-subscriptions.
  watch(
    () => {
      const v = toValue(argsSource)
      if (v === 'skip') return `__skip__${queryName}`
      return `${JSON.stringify(convexToJson(v as Record<string, Value>))}__${queryName}`
    },
    () => buildQueriesAndSync(),
    { immediate: true },
  )

  return { data, error, status }
}
