import type { OptimisticLocalStore } from 'convex/browser'
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  PaginationOptions,
  PaginationResult,
  BetterOmit,
  Expand,
} from 'convex/server'
import { getFunctionName } from 'convex/server'
import type { Value } from 'convex/values'
import { ConvexError, compareValues, convexToJson } from 'convex/values'
import { computed, shallowRef, toValue, type ComputedRef, type MaybeRefOrGetter, type ShallowRef } from 'vue'
import { useConvex } from '../client'
import { useConvexQueries } from './use-queries'

/**
 * A FunctionReference usable with `usePaginatedQuery`.
 *
 * Must refer to a public query with a `paginationOpts` argument of type
 * {@link PaginationOptions} and a return type of {@link PaginationResult}.
 *
 * @public
 */
export type PaginatedQueryReference = FunctionReference<
  'query',
  'public',
  { paginationOpts: PaginationOptions },
  PaginationResult<unknown>
>

/**
 * The arguments to a paginated query, excluding `paginationOpts`.
 *
 * @public
 */
export type PaginatedQueryArgs<Query extends PaginatedQueryReference> = Expand<
  BetterOmit<FunctionArgs<Query>, 'paginationOpts'>
>

/**
 * The item type from a paginated query.
 *
 * @public
 */
export type PaginatedQueryItem<Query extends PaginatedQueryReference>
  = FunctionReturnType<Query>['page'][number]

/**
 * Options for the object-form {@link usePaginatedQuery} overload.
 *
 * @public
 */
export type UsePaginatedQueryOptions<Query extends PaginatedQueryReference> = {
  query: Query
  args: PaginatedQueryArgs<Query> | 'skip'
  initialNumItems: number
  /**
   * When `true` (default for the positional overload) errors are thrown.
   * When `false` (default for the object overload) errors surface via
   * `status: 'error'` instead of being thrown.
   */
  throwOnError?: boolean
}

// Internal state key type.
type QueryPageKey = number

interface UsePaginatedQueryState {
  query: FunctionReference<'query'>
  args: Record<string, Value>
  id: number
  nextPageKey: QueryPageKey
  pageKeys: QueryPageKey[]
  queries: Record<
    QueryPageKey,
    {
      query: FunctionReference<'query'>
      args: Record<string, Value>
    }
  >
  ongoingSplits: Record<QueryPageKey, [QueryPageKey, QueryPageKey]>
  skip: boolean
}

type PaginatedQueryValue<Item> = PaginationResult<Item> & {
  splitCursor?: string | null
  pageStatus?: 'SplitRecommended' | 'SplitRequired' | null
}

function isPaginatedQueryValue(value: unknown): value is PaginatedQueryValue<Value> {
  return typeof value === 'object'
    && value !== null
    && 'page' in value
    && Array.isArray(value.page)
    && 'isDone' in value
    && 'continueCursor' in value
}

/**
 * The positional-form return value of {@link usePaginatedQuery}.
 *
 * @public
 */
export type UsePaginatedQueryResult<Item> = {
  results: Item[]
  loadMore: (numItems: number) => void
} & (
  | { status: 'LoadingFirstPage', isLoading: true }
  | { status: 'CanLoadMore', isLoading: false }
  | { status: 'LoadingMore', isLoading: true }
  | { status: 'Exhausted', isLoading: false }
)

/**
 * The possible pagination statuses in {@link UsePaginatedQueryResult}.
 *
 * @public
 */
export type PaginationStatus = UsePaginatedQueryResult<unknown>['status']

/**
 * The return type of {@link usePaginatedQuery} when called with the
 * positional signature.
 *
 * @public
 */
export type UsePaginatedQueryReturnType<Query extends PaginatedQueryReference>
  = UsePaginatedQueryResult<PaginatedQueryItem<Query>>

/**
 * Item-parameterised discriminated union returned by the object-form of
 * {@link usePaginatedQuery}. Exposed via {@link UsePaginatedQueryObjectReturnType}
 * when bound to a specific query.
 *
 * @public
 */
export type UsePaginatedQueryObjectResult<Item>
  = | {
    data: Item[] | undefined
    status: 'pending'
    canLoadMore: false
    isLoading: true
    error: undefined
    loadMore: (numItems: number) => void
  }
  | {
    data: Item[]
    status: 'success'
    canLoadMore: boolean
    isLoading: false
    error: undefined
    loadMore: (numItems: number) => void
  }
  | {
    data: Item[]
    status: 'error'
    canLoadMore: false
    isLoading: false
    error: Error
    loadMore: (numItems: number) => void
  }

/**
 * The return type of {@link usePaginatedQuery} when called with the
 * object-form options.
 *
 * Uses lowercase `status` (`'pending' | 'success' | 'error'`) and a
 * `canLoadMore` boolean instead of the TitleCase pagination status strings
 * used by the positional form.
 *
 * @public
 */
export type UsePaginatedQueryObjectReturnType<
  Query extends PaginatedQueryReference,
> = UsePaginatedQueryObjectResult<PaginatedQueryItem<Query>>

/**
 * @internal
 */
type UsePaginatedQueryInternalResult<Item>
  = | UsePaginatedQueryResult<Item>
    | {
      results: Item[]
      status: 'Error'
      isLoading: false
      error: Error
      loadMore: (numItems: number) => void
    }

let paginationId = 0
function nextPaginationId(): number {
  return ++paginationId
}

/** @internal */
export function resetPaginationId(): void {
  paginationId = 0
}

/**
 * Load data reactively from a paginated query to create a growing list.
 *
 * This can be used to power "infinite scroll" UIs.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { usePaginatedQuery } from '#imports'
 * import { api } from '~/backend/_generated/api'
 *
 * const { results, status, loadMore, isLoading } = usePaginatedQuery(
 *   api.messages.list,
 *   { channel: '#general' },
 *   { initialNumItems: 5 },
 * )
 * </script>
 * ```
 *
 * @public
 */
export function usePaginatedQuery<Query extends PaginatedQueryReference>(
  query: Query,
  args: MaybeRefOrGetter<PaginatedQueryArgs<Query> | 'skip'>,
  options: { initialNumItems: number },
): ShallowRef<UsePaginatedQueryReturnType<Query>>

/**
 * Object-form overload for {@link usePaginatedQuery}.
 *
 * Accepts a single options object and returns an object-form result with
 * `data`, `status: 'pending' | 'success' | 'error'`, `canLoadMore`, and
 * `error`. Errors are surfaced via `status: 'error'` unless
 * `throwOnError: true` is set.
 *
 * @public
 */
export function usePaginatedQuery<Query extends PaginatedQueryReference>(
  options: MaybeRefOrGetter<UsePaginatedQueryOptions<Query>>,
): ShallowRef<UsePaginatedQueryObjectReturnType<Query>>

export function usePaginatedQuery<Query extends PaginatedQueryReference>(
  queryOrOptions:
    | Query
    | MaybeRefOrGetter<UsePaginatedQueryOptions<Query>>,
  args?: MaybeRefOrGetter<PaginatedQueryArgs<Query> | 'skip'>,
  options?: { initialNumItems: number },
):
  | ShallowRef<UsePaginatedQueryReturnType<Query>>
  | ShallowRef<UsePaginatedQueryObjectReturnType<Query>> {
  // Detect object-form by sniffing the first arg. Supports reactive refs
  // (ref/computed/getter) of the options object too, matching the
  // `MaybeRefOrGetter` contract used elsewhere in this package.
  const firstValue = toValue(queryOrOptions as MaybeRefOrGetter<unknown>)
  const isObjectOptions = typeof firstValue === 'object'
    && firstValue !== null
    && 'query' in (firstValue as object)

  if (isObjectOptions) {
    const optsGetter = () => toValue(
      queryOrOptions as MaybeRefOrGetter<UsePaginatedQueryOptions<Query>>,
    )
    const initial = optsGetter()
    validateInitialNumItems(initial.initialNumItems)

    const internal = usePaginatedQueryInternal<Query>(
      () => optsGetter().query,
      () => optsGetter().args,
      () => ({ initialNumItems: optsGetter().initialNumItems }),
      () => optsGetter().throwOnError ?? false,
    )

    return computed(
      () => reshapeToObjectForm<PaginatedQueryItem<Query>>(internal.value),
    )
  }

  validateInitialNumItems(options?.initialNumItems)

  const query = queryOrOptions as Query
  const internal = usePaginatedQueryInternal<Query>(
    () => query,
    args as MaybeRefOrGetter<PaginatedQueryArgs<Query> | 'skip'>,
    () => options as { initialNumItems: number },
    () => true,
  )

  // Positional form always throws on error — expose the positional result
  // type by stripping the internal 'Error' variant from the union.
  return internal as ShallowRef<UsePaginatedQueryReturnType<Query>>
}

function validateInitialNumItems(value: unknown): void {
  if (typeof value !== 'number' || value < 0) {
    throw new Error(
      `\`options.initialNumItems\` must be a positive number. Received \`${String(value)}\`.`,
    )
  }
}

function reshapeToObjectForm<Item>(
  internal: UsePaginatedQueryInternalResult<Item>,
): UsePaginatedQueryObjectResult<Item> {
  const { results, loadMore } = internal
  if (internal.status === 'Error') {
    return {
      data: results,
      status: 'error',
      canLoadMore: false,
      isLoading: false,
      error: internal.error,
      loadMore,
    }
  }
  if (internal.status === 'LoadingFirstPage' || internal.status === 'LoadingMore') {
    return {
      data: internal.status === 'LoadingFirstPage' ? undefined : results,
      status: 'pending',
      canLoadMore: false,
      isLoading: true,
      error: undefined,
      loadMore,
    }
  }
  // CanLoadMore or Exhausted
  return {
    data: results,
    status: 'success',
    canLoadMore: internal.status === 'CanLoadMore',
    isLoading: false,
    error: undefined,
    loadMore,
  }
}

/**
 * @internal
 */
function usePaginatedQueryInternal<Query extends PaginatedQueryReference>(
  query: MaybeRefOrGetter<Query>,
  args: MaybeRefOrGetter<PaginatedQueryArgs<Query> | 'skip'>,
  options: MaybeRefOrGetter<{ initialNumItems: number }>,
  throwOnError: MaybeRefOrGetter<boolean>,
): ComputedRef<UsePaginatedQueryInternalResult<PaginatedQueryItem<Query>>> {
  const convex = useConvex()
  const logger = convex.logger

  function buildInitialState(
    q: Query,
    currentArgs: Record<string, Value>,
    skip: boolean,
    initialNumItems: number,
  ): UsePaginatedQueryState {
    const id = nextPaginationId()
    return {
      query: q,
      args: currentArgs,
      id,
      nextPageKey: 1,
      pageKeys: skip ? [] : [0],
      queries: skip
        ? {}
        : {
            0: {
              query: q,
              args: {
                ...currentArgs,
                paginationOpts: {
                  numItems: initialNumItems,
                  cursor: null,
                  id,
                },
              },
            },
          },
      ongoingSplits: {},
      skip,
    }
  }

  // Eagerly compute the initial state so `state.value` is never `null`.
  const initialQuery = toValue(query)
  const initialRawArgs = toValue(args)
  const initialSkip = initialRawArgs === 'skip'
  const initialArgsObject = (initialSkip ? {} : initialRawArgs) as Record<string, Value>
  const { initialNumItems: initialInitialNumItems } = toValue(options)
  const state = shallowRef<UsePaginatedQueryState>(
    buildInitialState(initialQuery, initialArgsObject, initialSkip, initialInitialNumItems),
  )

  // Reactive queries input for useConvexQueries. Resets state whenever
  // the query name, serialized args, or skip flag change.
  const queriesInput = computed(() => {
    const q = toValue(query)
    const rawArgs = toValue(args)
    const skip = rawArgs === 'skip'
    const argsObject = (skip ? {} : rawArgs) as Record<string, Value>
    const { initialNumItems } = toValue(options)

    const currentState = state.value
    const needsReset
      = getFunctionName(q) !== getFunctionName(currentState.query)
        || JSON.stringify(convexToJson(argsObject as Value))
        !== JSON.stringify(convexToJson(currentState.args))
        || skip !== currentState.skip

    if (needsReset) {
      state.value = buildInitialState(q, argsObject, skip, initialNumItems)
    }

    return state.value.queries
  })

  const allResults = useConvexQueries(queriesInput)

  function splitPage(
    key: QueryPageKey,
    splitCursor: string,
    continueCursor: string,
  ): void {
    const prev = state.value
    const currentQuery = prev.queries[key]
    if (currentQuery === undefined) {
      return
    }
    const queries = { ...prev.queries }
    const splitKey1 = prev.nextPageKey
    const splitKey2 = prev.nextPageKey + 1

    const currentArgs = currentQuery.args
    const basePaginationOpts = (currentArgs as { paginationOpts: Record<string, unknown> }).paginationOpts
    queries[splitKey1] = {
      query: prev.query,
      args: {
        ...currentArgs,
        paginationOpts: {
          ...basePaginationOpts,
          endCursor: splitCursor,
        },
      },
    }
    queries[splitKey2] = {
      query: prev.query,
      args: {
        ...currentArgs,
        paginationOpts: {
          ...basePaginationOpts,
          cursor: splitCursor,
          endCursor: continueCursor,
        },
      },
    }

    const ongoingSplits = { ...prev.ongoingSplits }
    ongoingSplits[key] = [splitKey1, splitKey2]

    state.value = {
      ...prev,
      nextPageKey: prev.nextPageKey + 2,
      queries,
      ongoingSplits,
    }
  }

  function completeSplit(key: QueryPageKey): void {
    const prev = state.value
    const completedSplit = prev.ongoingSplits[key]
    if (completedSplit === undefined) return

    const queries = { ...prev.queries }
    const ongoingSplits = { ...prev.ongoingSplits }
    for (const k of Object.keys(queries)) {
      if (Number(k) === key) Reflect.deleteProperty(queries, k)
    }
    for (const k of Object.keys(ongoingSplits)) {
      if (Number(k) === key) Reflect.deleteProperty(ongoingSplits, k)
    }

    let pageKeys = prev.pageKeys.slice()
    const pageIndex = prev.pageKeys.findIndex(v => v === key)
    if (pageIndex >= 0) {
      pageKeys = [
        ...prev.pageKeys.slice(0, pageIndex),
        ...completedSplit,
        ...prev.pageKeys.slice(pageIndex + 1),
      ]
    }

    state.value = {
      ...prev,
      queries,
      pageKeys,
      ongoingSplits,
    }
  }

  function resetState(): void {
    const q = toValue(query)
    const rawArgs = toValue(args)
    const skip = rawArgs === 'skip'
    const argsObject = (skip ? {} : rawArgs) as Record<string, Value>
    const { initialNumItems } = toValue(options)
    state.value = buildInitialState(q, argsObject, skip, initialNumItems)
  }

  return computed<UsePaginatedQueryInternalResult<PaginatedQueryItem<Query>>>(() => {
    const currState = state.value
    const { initialNumItems } = toValue(options)
    const shouldThrow = toValue(throwOnError)
    const resultsObject = allResults.value
    let lastResult: PaginationResult<Value> | undefined
    let maybeError: Error | undefined
    const allItems: PaginatedQueryItem<Query>[] = []

    for (const pageKey of currState.pageKeys) {
      const currResult = resultsObject[pageKey]
      if (currResult === undefined) {
        lastResult = undefined
        break
      }

      if (currResult instanceof Error) {
        const isInvalidCursor = currResult.message.includes('InvalidCursor')
          || (currResult instanceof ConvexError
            && typeof currResult.data === 'object'
            && (currResult.data as { isConvexSystemError?: boolean })?.isConvexSystemError === true
            && (currResult.data as { paginationError?: string })?.paginationError === 'InvalidCursor')

        if (isInvalidCursor) {
          logger.warn?.(
            'usePaginatedQuery hit error, resetting pagination state: '
            + currResult.message,
          )
          // Trigger reactive reset on next tick by invalidating state.
          resetState()
          return {
            results: [],
            status: 'LoadingFirstPage',
            isLoading: true,
            loadMore: noopLoadMore,
          }
        }

        if (shouldThrow) {
          throw currResult
        }
        maybeError = currResult
        break
      }

      if (!isPaginatedQueryValue(currResult)) {
        throw new Error('Paginated query returned a non-pagination result.')
      }

      const result = currResult

      const ongoingSplit = currState.ongoingSplits[pageKey]
      if (ongoingSplit !== undefined) {
        if (
          resultsObject[ongoingSplit[0]] !== undefined
          && resultsObject[ongoingSplit[1]] !== undefined
        ) {
          completeSplit(pageKey)
        }
      }
      else if (
        result.splitCursor
        && (result.pageStatus === 'SplitRecommended'
          || result.pageStatus === 'SplitRequired'
          || result.page.length > initialNumItems * 2)
      ) {
        splitPage(pageKey, result.splitCursor, result.continueCursor)
      }

      if (result.pageStatus === 'SplitRequired') {
        lastResult = undefined
        break
      }

      allItems.push(...(result.page as PaginatedQueryItem<Query>[]))
      lastResult = result
    }

    if (maybeError !== undefined) {
      return {
        results: allItems,
        status: 'Error',
        isLoading: false,
        error: maybeError,
        loadMore: noopLoadMore,
      }
    }

    if (lastResult === undefined) {
      if (currState.nextPageKey === 1) {
        return {
          results: allItems,
          status: 'LoadingFirstPage',
          isLoading: true,
          loadMore: noopLoadMore,
        }
      }
      return {
        results: allItems,
        status: 'LoadingMore',
        isLoading: true,
        loadMore: noopLoadMore,
      }
    }

    if (lastResult.isDone) {
      return {
        results: allItems,
        status: 'Exhausted',
        isLoading: false,
        loadMore: noopLoadMore,
      }
    }

    const continueCursor = lastResult.continueCursor
    let alreadyLoadingMore = false

    return {
      results: allItems,
      status: 'CanLoadMore',
      isLoading: false,
      loadMore: (numItems: number) => {
        if (alreadyLoadingMore) return
        alreadyLoadingMore = true

        const prev = state.value
        const rawArgs = toValue(args)
        const argsObject = (rawArgs === 'skip' ? {} : rawArgs) as Record<string, Value>

        const pageKeys = [...prev.pageKeys, prev.nextPageKey]
        const queries = { ...prev.queries }
        queries[prev.nextPageKey] = {
          query: prev.query,
          args: {
            ...argsObject,
            paginationOpts: {
              numItems,
              cursor: continueCursor,
              id: prev.id,
            },
          },
        }

        state.value = {
          ...prev,
          nextPageKey: prev.nextPageKey + 1,
          pageKeys,
          queries,
        }
      },
    }
  })
}

function noopLoadMore(_numItems: number): void {
  // Intentional noop — only meaningful in `CanLoadMore` state.
}

/** @public */
export const useConvexPaginatedQuery = usePaginatedQuery

/**
 * Optimistically update values in a paginated list.
 *
 * @public
 */
export function optimisticallyUpdateValueInPaginatedQuery<
  Query extends PaginatedQueryReference,
>(
  localStore: OptimisticLocalStore,
  query: Query,
  args: PaginatedQueryArgs<Query>,
  updateValue: (
    currentValue: PaginatedQueryItem<Query>,
  ) => PaginatedQueryItem<Query>,
): void {
  const expectedArgs = JSON.stringify(convexToJson(args as Value))

  for (const queryResult of localStore.getAllQueries(query)) {
    if (queryResult.value !== undefined) {
      const { paginationOpts: _, ...innerArgs } = queryResult.args as {
        paginationOpts: PaginationOptions
      }
      if (JSON.stringify(convexToJson(innerArgs as Value)) === expectedArgs) {
        const value = queryResult.value as PaginationResult<PaginatedQueryItem<Query>>
        if (
          typeof value === 'object'
          && value !== null
          && Array.isArray(value.page)
        ) {
          localStore.setQuery(query, queryResult.args, {
            ...value,
            page: value.page.map(updateValue),
          })
        }
      }
    }
  }
}

/**
 * Insert an item at the top of a paginated list, regardless of sort order.
 *
 * Only updates if the first page is already loaded — otherwise the insertion
 * would flash in/out once the real first page arrives.
 *
 * @public
 */
export function insertAtTop<Query extends PaginatedQueryReference>(options: {
  paginatedQuery: Query
  argsToMatch?: Partial<PaginatedQueryArgs<Query>>
  localQueryStore: OptimisticLocalStore
  item: PaginatedQueryItem<Query>
}): void {
  const { paginatedQuery, argsToMatch, localQueryStore, item } = options
  const queries = localQueryStore.getAllQueries(paginatedQuery)
  const queriesThatMatch = queries.filter(q => matchesArgs(q.args, argsToMatch))
  const firstPage = queriesThatMatch.find(
    q => (q.args as { paginationOpts: PaginationOptions }).paginationOpts.cursor === null,
  )
  if (firstPage === undefined || firstPage.value === undefined) {
    return
  }
  const value = firstPage.value as PaginationResult<PaginatedQueryItem<Query>>
  localQueryStore.setQuery(paginatedQuery, firstPage.args, {
    ...value,
    page: [item, ...value.page],
  })
}

/**
 * Insert an item at the bottom of a paginated list, but only if the final
 * page has loaded (otherwise it would pop out when the server responds).
 *
 * @public
 */
export function insertAtBottomIfLoaded<Query extends PaginatedQueryReference>(
  options: {
    paginatedQuery: Query
    argsToMatch?: Partial<PaginatedQueryArgs<Query>>
    localQueryStore: OptimisticLocalStore
    item: PaginatedQueryItem<Query>
  },
): void {
  const { paginatedQuery, argsToMatch, localQueryStore, item } = options
  const queries = localQueryStore.getAllQueries(paginatedQuery)
  const queriesThatMatch = queries.filter(q => matchesArgs(q.args, argsToMatch))
  const lastPage = queriesThatMatch.find(
    q => q.value !== undefined
      && (q.value as PaginationResult<unknown>).isDone,
  )
  if (lastPage === undefined) return
  const value = lastPage.value as PaginationResult<PaginatedQueryItem<Query>>
  localQueryStore.setQuery(paginatedQuery, lastPage.args, {
    ...value,
    page: [...value.page, item],
  })
}

type LocalQueryResult<Query extends FunctionReference<'query'>> = {
  args: FunctionArgs<Query>
  value: undefined | FunctionReturnType<Query>
}

type LoadedResult<Query extends FunctionReference<'query'>> = {
  args: FunctionArgs<Query>
  value: FunctionReturnType<Query>
}

/**
 * Insert an item at its sorted position across loaded pages of a paginated
 * query, given a sort order and a function deriving the sort key.
 *
 * @public
 */
export function insertAtPosition<Query extends PaginatedQueryReference>(
  options: {
    paginatedQuery: Query
    argsToMatch?: Partial<PaginatedQueryArgs<Query>>
    sortOrder: 'asc' | 'desc'
    sortKeyFromItem: (item: PaginatedQueryItem<Query>) => Value | Value[]
    localQueryStore: OptimisticLocalStore
    item: PaginatedQueryItem<Query>
  },
): void {
  const {
    paginatedQuery,
    argsToMatch,
    sortOrder,
    sortKeyFromItem,
    localQueryStore,
    item,
  } = options

  const queries = localQueryStore.getAllQueries(paginatedQuery) as LocalQueryResult<Query>[]
  // Group pages that belong to the same `usePaginatedQuery` invocation.
  // Pages from the same invocation share all non-`paginationOpts` args and
  // the `paginationOpts.id`.
  const queryGroups: Record<string, LocalQueryResult<Query>[]> = {}
  for (const q of queries) {
    if (!matchesArgs(q.args, argsToMatch)) continue
    const key = JSON.stringify(
      Object.fromEntries(
        Object.entries(q.args as Record<string, unknown>).map(([k, v]) => [
          k,
          k === 'paginationOpts' ? (v as { id: unknown }).id : v,
        ]),
      ),
    )
    queryGroups[key] ??= []
    queryGroups[key].push(q)
  }
  for (const pageQueries of Object.values(queryGroups)) {
    insertAtPositionInPages({
      pageQueries,
      paginatedQuery,
      sortOrder,
      sortKeyFromItem,
      localQueryStore,
      item,
    })
  }
}

function insertAtPositionInPages<Query extends PaginatedQueryReference>(
  options: {
    pageQueries: LocalQueryResult<Query>[]
    paginatedQuery: Query
    sortOrder: 'asc' | 'desc'
    sortKeyFromItem: (item: PaginatedQueryItem<Query>) => Value | Value[]
    localQueryStore: OptimisticLocalStore
    item: PaginatedQueryItem<Query>
  },
): void {
  const {
    pageQueries,
    sortOrder,
    sortKeyFromItem,
    localQueryStore,
    item,
    paginatedQuery,
  } = options
  const insertedKey = sortKeyFromItem(item)
  const loadedPages: LoadedResult<Query>[] = pageQueries.filter(
    (q): q is LoadedResult<Query> =>
      q.value !== undefined
      && (q.value as PaginationResult<PaginatedQueryItem<Query>>).page.length > 0,
  )
  const sortedPages = loadedPages.slice().sort((a, b) => {
    const aKey = sortKeyFromItem(
      (a.value as PaginationResult<PaginatedQueryItem<Query>>).page[0],
    )
    const bKey = sortKeyFromItem(
      (b.value as PaginationResult<PaginatedQueryItem<Query>>).page[0],
    )
    return sortOrder === 'asc'
      ? compareValues(aKey, bKey)
      : compareValues(bKey, aKey)
  })

  const firstLoadedPage = sortedPages[0]
  if (firstLoadedPage === undefined) return

  const firstValue = firstLoadedPage.value as PaginationResult<PaginatedQueryItem<Query>>
  const firstPageKey = sortKeyFromItem(firstValue.page[0])
  const isBeforeFirstPage = sortOrder === 'asc'
    ? compareValues(insertedKey, firstPageKey) <= 0
    : compareValues(insertedKey, firstPageKey) >= 0
  if (isBeforeFirstPage) {
    if (
      (firstLoadedPage.args as { paginationOpts: PaginationOptions })
        .paginationOpts.cursor === null
    ) {
      localQueryStore.setQuery(paginatedQuery, firstLoadedPage.args, {
        ...firstValue,
        page: [item, ...firstValue.page],
      })
    }
    return
  }

  const lastLoadedPage = sortedPages[sortedPages.length - 1]
  if (lastLoadedPage === undefined) return
  const lastValue = lastLoadedPage.value as PaginationResult<PaginatedQueryItem<Query>>
  const lastPageKey = sortKeyFromItem(
    lastValue.page[lastValue.page.length - 1],
  )
  const isAfterLastPage = sortOrder === 'asc'
    ? compareValues(insertedKey, lastPageKey) >= 0
    : compareValues(insertedKey, lastPageKey) <= 0
  if (isAfterLastPage) {
    if (lastValue.isDone) {
      localQueryStore.setQuery(paginatedQuery, lastLoadedPage.args, {
        ...lastValue,
        page: [...lastValue.page, item],
      })
    }
    return
  }

  // Inserted element lands somewhere in the middle. Find the first page
  // whose first item is strictly past the insertion point, then insert
  // into the page before it.
  const successorPageIndex = sortedPages.findIndex((p) => {
    const headKey = sortKeyFromItem(
      (p.value as PaginationResult<PaginatedQueryItem<Query>>).page[0],
    )
    return sortOrder === 'asc'
      ? compareValues(headKey, insertedKey) > 0
      : compareValues(headKey, insertedKey) < 0
  })
  const pageToUpdate = successorPageIndex === -1
    ? sortedPages[sortedPages.length - 1]
    : sortedPages[successorPageIndex - 1]
  if (pageToUpdate === undefined) return

  const pageValue = pageToUpdate.value as PaginationResult<PaginatedQueryItem<Query>>
  const indexWithinPage = pageValue.page.findIndex((e) => {
    const k = sortKeyFromItem(e)
    return sortOrder === 'asc'
      ? compareValues(k, insertedKey) >= 0
      : compareValues(k, insertedKey) <= 0
  })
  const newPage = indexWithinPage === -1
    ? [...pageValue.page, item]
    : [
        ...pageValue.page.slice(0, indexWithinPage),
        item,
        ...pageValue.page.slice(indexWithinPage),
      ]
  localQueryStore.setQuery(paginatedQuery, pageToUpdate.args, {
    ...pageValue,
    page: newPage,
  })
}

function matchesArgs(
  args: Record<string, unknown>,
  argsToMatch: Record<string, unknown> | undefined,
): boolean {
  if (argsToMatch === undefined) return true
  return Object.keys(argsToMatch).every(
    k => compareValues(argsToMatch[k] as Value, args[k] as Value) === 0,
  )
}
