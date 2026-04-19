import type { Ref, MaybeRefOrGetter } from 'vue'
import { ref, watch, toValue, onScopeDispose } from 'vue'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { useConvex } from './client'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Return type of {@link useQuery}.
 *
 * In React, the positional form of `useQuery` returns `T | undefined` and
 * the object form returns a `{ data, error, status }` discriminated union.
 *
 * In Vue we always return `{ data, error, status }` — this matches the
 * established Vue ecosystem convention used by Nuxt's `useAsyncData`,
 * VueUse's `useFetch`, and other composables.
 *
 * @public
 */
export interface UseQueryReturn<T> {
  /** The latest query result, or `undefined` while loading / on error. */
  data: Ref<T | undefined>
  /** The error if the query failed, or `null` otherwise. */
  error: Ref<Error | null>
  /** Tri-state loading status, matching React's `UseQueryResult['status']`. */
  status: Ref<'pending' | 'success' | 'error'>
}

/**
 * Options object accepted by the object-form overload of {@link useQuery}.
 *
 * Mirrors React's `UseQueryOptions<Query>` but args can be reactive
 * (`Ref`, `ComputedRef`, or getter function) — a Vue-specific enhancement.
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
// Mirrors React's `OptionalRestArgsOrSkip`:
//   • For queries with NO required arguments → the args param is optional.
//   • For queries WITH required arguments  → the args param is required.
//
// The key difference from React is that the value itself can be a
// `MaybeRefOrGetter` so the subscription automatically re-runs when
// reactive dependencies change.
// ---------------------------------------------------------------------------
type EmptyObject = Record<string, never>

/**
 * @public
 */
export type OptionalRestArgsOrSkip<FuncRef extends FunctionReference<'query'>>
  = FuncRef['_args'] extends EmptyObject
    ? [args?: MaybeRefOrGetter<FuncRef['_args'] | 'skip'>]
    : [args: MaybeRefOrGetter<FuncRef['_args'] | 'skip'>]

// ---------------------------------------------------------------------------
// useQuery
// ---------------------------------------------------------------------------

/**
 * Load a reactive query within a Vue component.
 *
 * This composable subscribes to a Convex query via `ConvexClient.onUpdate()`
 * and updates reactive refs whenever the server pushes a new result. The
 * subscription is managed automatically — it starts when the composable is
 * called and is cleaned up via `onScopeDispose`.
 *
 * ### Differences from the React `useQuery`
 *
 * | Aspect | React | Vue |
 * |---|---|---|
 * | Return value | `T \| undefined` (positional) or `UseQueryResult<T>` (object) | Always `{ data, error, status }` refs — the Vue ecosystem standard |
 * | Re-subscription on arg change | `useMemo` + JSON serialization | `watch()` with serialized comparison |
 * | Lifecycle cleanup | `useEffect` cleanup | `onScopeDispose` |
 * | Skip sentinel | `"skip"` as args value | Same, but args can be a reactive `Ref<… | "skip">` |
 * | Error handling | Positional throws, object returns | Errors always populate `error` ref |
 * | Client access | React Context (`useContext`) | Vue `inject()` with typed key |
 * | Subscription glue | `QueriesObserver` + `useSubscription` | Direct `ConvexClient.onUpdate()` |
 *
 * The React version routes through `useQueries` → `QueriesObserver` →
 * `useSubscription` to safely batch React re-renders. Vue's fine-grained
 * reactivity makes that indirection unnecessary — we subscribe directly
 * and mutate refs, which Vue schedules efficiently.
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

// Implementation
export function useQuery<Query extends FunctionReference<'query'>>(
  queryOrOptions: Query | UseQueryOptions<Query>,
  ...positionalArgs: [MaybeRefOrGetter<FunctionArgs<Query> | 'skip'>?]
): UseQueryReturn<FunctionReturnType<Query>> {
  const client = useConvex()

  // Resolve query reference and args source from either calling convention.
  // The React version does the same normalisation in its implementation overload.
  const isObjectForm
    = typeof queryOrOptions === 'object'
      && queryOrOptions !== null
      && 'query' in queryOrOptions

  const queryRef: Query = isObjectForm
    ? (queryOrOptions as UseQueryOptions<Query>).query
    : queryOrOptions as Query

  const argsSource: MaybeRefOrGetter<FunctionArgs<Query> | 'skip'> = isObjectForm
    ? (queryOrOptions as UseQueryOptions<Query>).args
    : (positionalArgs[0] ?? {}) as MaybeRefOrGetter<FunctionArgs<Query> | 'skip'>

  // Reactive state — always returned regardless of calling convention.
  const data = ref<FunctionReturnType<Query> | undefined>() as Ref<FunctionReturnType<Query> | undefined>
  const error = ref<Error | null>(null)
  const status = ref<'pending' | 'success' | 'error'>('pending')

  // Track the current unsubscribe handle so we can tear down on arg change.
  let unsubscribe: (() => void) | undefined

  /**
   * (Re-)subscribe to the query with the current args.
   *
   * In React, the `useQueries` hook delegates to `QueriesObserver` which diffs
   * the old and new query sets and calls `watch.onUpdate()` on the
   * `ConvexReactClient`. Because Vue's reactivity tracks changes at the ref
   * level, we can subscribe directly to `ConvexClient.onUpdate()` without an
   * intermediary observer.
   */
  function subscribe() {
    // Tear down any previous subscription first.
    unsubscribe?.()
    unsubscribe = undefined

    const currentArgs = toValue(argsSource)

    if (currentArgs === 'skip') {
      data.value = undefined
      error.value = null
      status.value = 'pending'
      return
    }

    status.value = 'pending'
    error.value = null

    const sub = client.onUpdate(
      queryRef,
      currentArgs as FunctionArgs<Query>,
      (result) => {
        data.value = result
        error.value = null
        status.value = 'success'
      },
      (err) => {
        error.value = err
        status.value = 'error'
      },
    )
    unsubscribe = () => sub()
  }

  // ----- Reactivity ---------------------------------------------------------
  //
  // In React, args are memoised via `useMemo` with a JSON-serialised
  // dependency key to avoid re-subscribing when the args are structurally
  // identical but referentially different:
  //
  //   [JSON.stringify(convexToJson(argsObject)), queryName, skip]
  //
  // We mirror this by watching a serialised representation of the args
  // instead of watching the raw object.  This avoids spurious
  // re-subscriptions when a computed returns a new (but equal) object.
  // -------------------------------------------------------------------------
  watch(
    () => {
      const v = toValue(argsSource)
      return v === 'skip' ? 'skip' : JSON.stringify(v)
    },
    () => subscribe(),
  )

  // Initial subscription (equivalent of the initial render in React).
  subscribe()

  // Cleanup on scope disposal (equivalent of useEffect cleanup in React).
  onScopeDispose(() => {
    unsubscribe?.()
  })

  return { data, error, status }
}
