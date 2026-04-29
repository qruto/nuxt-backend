import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import {
  anyApi,
  getFunctionName,
  makeFunctionReference,
  type FunctionArgs,
  type FunctionReference,
  type FunctionReturnType,
  type PaginationOptions,
  type PaginationResult,
} from 'convex/server'
import { compareValues, convexToJson, type Value } from 'convex/values'
import type { OptimisticLocalStore } from 'convex/browser'
import { ConvexVueClient } from '../../src/runtime/vue/client'
import {
  insertAtBottomIfLoaded,
  insertAtPosition,
  insertAtTop,
  resetPaginationId,
  usePaginatedQuery,
  type PaginatedQueryArgs,
  type PaginatedQueryItem,
  type PaginatedQueryReference,
  type UsePaginatedQueryObjectReturnType,
  type UsePaginatedQueryReturnType,
} from '../../src/runtime/vue/composables/use-paginated-query'
import { withInMemoryWebSocket } from '../helpers/in_memory_web_socket'
import { mountWithConvex } from '../helpers/vue_test_utils'

const address = 'https://127.0.0.1:30001'
const mutationRef = makeFunctionReference<'mutation'>('myMutation:default')

type QueryArgs = Record<string, unknown>
type PaginatedQueryCallArgs = QueryArgs & {
  channel?: string
  paginationOpts?: {
    numItems?: number
    cursor?: string | null
    id?: number
  }
}
type WatchQueryCalls = Array<[FunctionReference<'query'>, QueryArgs, ...unknown[]]>

function getWatchQueryArgs(
  calls: WatchQueryCalls,
  predicate: (args: QueryArgs) => boolean,
): FunctionArgs<PaginatedQueryReference> {
  const match = calls.find(([, args]) => predicate(args))
  if (!match) {
    throw new Error('Expected watchQuery to be called with matching args.')
  }
  return match[1] as FunctionArgs<PaginatedQueryReference>
}

function asPaginatedCallArgs(args: QueryArgs): PaginatedQueryCallArgs {
  return args as PaginatedQueryCallArgs
}

function applyOptimisticQueryResult(
  client: ConvexVueClient,
  query: PaginatedQueryReference,
  args: FunctionArgs<PaginatedQueryReference>,
  value: FunctionReturnType<PaginatedQueryReference>,
): void {
  void client.mutation(mutationRef, {}, {
    optimisticUpdate(localStore) {
      localStore.setQuery(query, args, value)
    },
  })
}

function pushFirstPageError(
  client: ConvexVueClient,
  query: FunctionReference<'query'>,
  message: string,
): void {
  void client.mutation(mutationRef, {}, {
    optimisticUpdate(localStore) {
      localStore.setQuery(
        query,
        {
          paginationOpts: {
            numItems: 10,
            cursor: null,
            id: 1,
          },
        },
        new Error(message) as unknown as PaginationResult<unknown>,
      )
    },
  })
}

describe('usePaginatedQuery', () => {
  const queryRef = makeFunctionReference<'query'>('myQuery:default') as PaginatedQueryReference

  beforeEach(() => {
    resetPaginationId()
  })

  // -- positional-form validation ---------------------------------------------

  it.each([
    {
      options: undefined,
      expectedError: '`options.initialNumItems` must be a positive number. Received `undefined`.',
    },
    {
      options: {},
      expectedError: '`options.initialNumItems` must be a positive number. Received `undefined`.',
    },
    {
      options: { initialNumItems: -1 },
      expectedError: '`options.initialNumItems` must be a positive number. Received `-1`.',
    },
    {
      options: { initialNumItems: 'wrongType' },
      expectedError: '`options.initialNumItems` must be a positive number. Received `wrongType`.',
    },
  ])('throws an error when options is $options', async ({ options, expectedError }) => {
    const client = new ConvexVueClient(address)
    await expect(
      mountWithConvex(client, () =>
        usePaginatedQuery(
          queryRef,
          {},
          options as { initialNumItems: number },
        ),
      ),
    ).rejects.toThrow(expectedError)
    await client.close()
  })

  // -- object-form error handling ---------------------------------------------

  it('object options default to non-throwing error state', async () => {
    await withInMemoryWebSocket(async ({ address }) => {
      const client = new ConvexVueClient(address)

      const { result } = await mountWithConvex(client, () =>
        usePaginatedQuery({
          query: queryRef,
          args: {},
          initialNumItems: 10,
        }),
      { tick: true },
      )

      pushFirstPageError(client, queryRef, 'boom-default')
      await nextTick()

      expect(result.value.status).toBe('error')
      if (result.value.status !== 'error') {
        throw new Error('Expected error status')
      }
      expect(result.value.error.message).toBe('boom-default')
      expect(result.value.isLoading).toBe(false)
      expect(result.value.canLoadMore).toBe(false)
      expect(result.value.data).toEqual([])

      await client.close()
    })
  })

  it('object options throw when throwOnError is true', async () => {
    await withInMemoryWebSocket(async ({ address }) => {
      const client = new ConvexVueClient(address)

      const { result } = await mountWithConvex(client, () =>
        usePaginatedQuery({
          query: queryRef,
          args: {},
          initialNumItems: 10,
          throwOnError: true,
        }),
      { tick: true },
      )

      pushFirstPageError(client, queryRef, 'boom-throw')
      await nextTick()

      expect(() => result.value).toThrow('boom-throw')

      await client.close()
    })
  })

  it('positional form continues throwing on errors', async () => {
    await withInMemoryWebSocket(async ({ address }) => {
      const client = new ConvexVueClient(address)

      const { result } = await mountWithConvex(
        client,
        () => usePaginatedQuery(queryRef, {}, { initialNumItems: 10 }),
        { tick: true },
      )

      pushFirstPageError(client, queryRef, 'boom-positional')
      await nextTick()

      expect(() => result.value).toThrow('boom-positional')

      await client.close()
    })
  })

  // -- skip behaviour ---------------------------------------------------------

  it('returns nothing when args are skip (positional)', async () => {
    const client = new ConvexVueClient(address)

    const watchQuerySpy = vi.spyOn(client, 'watchQuery')
    const { result } = await mountWithConvex(
      client,
      () => usePaginatedQuery(queryRef, 'skip', { initialNumItems: 10 }),
    )

    expect(watchQuerySpy).not.toHaveBeenCalled()
    expect(result.value).toMatchObject({
      isLoading: true,
      results: [],
      status: 'LoadingFirstPage',
    })

    await client.close()
  })

  it('returns pending when object-form args are skip', async () => {
    const client = new ConvexVueClient(address)

    const watchQuerySpy = vi.spyOn(client, 'watchQuery')
    const { result } = await mountWithConvex(client, () =>
      usePaginatedQuery({
        query: queryRef,
        args: 'skip',
        initialNumItems: 10,
      }),
    )

    expect(watchQuerySpy).not.toHaveBeenCalled()
    expect(result.value).toMatchObject({
      isLoading: true,
      data: undefined,
      status: 'pending',
      canLoadMore: false,
    })

    await client.close()
  })

  // -- initial-load states ----------------------------------------------------

  it('initially returns pending for object options', async () => {
    await withInMemoryWebSocket(async ({ address }) => {
      const client = new ConvexVueClient(address)
      const watchQuerySpy = vi.spyOn(client, 'watchQuery')

      const { result } = await mountWithConvex(client, () =>
        usePaginatedQuery({
          query: queryRef,
          args: {},
          initialNumItems: 10,
        }),
      { tick: true },
      )

      const firstPageArgs = getWatchQueryArgs(
        watchQuerySpy.mock.calls as WatchQueryCalls,
        args => asPaginatedCallArgs(args).paginationOpts?.cursor === null,
      )
      expect(firstPageArgs).toMatchObject({
        paginationOpts: { numItems: 10, cursor: null, id: expect.any(Number) },
      })
      expect(result.value).toMatchObject({
        isLoading: true,
        data: undefined,
        status: 'pending',
        canLoadMore: false,
      })

      await client.close()
    })
  })

  it('initially returns LoadingFirstPage', async () => {
    await withInMemoryWebSocket(async ({ address }) => {
      const client = new ConvexVueClient(address)
      const watchQuerySpy = vi.spyOn(client, 'watchQuery')

      const { result } = await mountWithConvex(
        client,
        () => usePaginatedQuery(queryRef, {}, { initialNumItems: 10 }),
        { tick: true },
      )

      const firstPageArgs = getWatchQueryArgs(
        watchQuerySpy.mock.calls as WatchQueryCalls,
        args => asPaginatedCallArgs(args).paginationOpts?.cursor === null,
      )
      expect(firstPageArgs).toMatchObject({
        paginationOpts: { numItems: 10, cursor: null, id: expect.any(Number) },
      })
      expect(result.value).toMatchObject({
        isLoading: true,
        results: [],
        status: 'LoadingFirstPage',
      })

      await client.close()
    })
  })

  // -- arg/query changes ------------------------------------------------------

  it('updates to a new query when args change', async () => {
    await withInMemoryWebSocket(async ({ address }) => {
      const client = new ConvexVueClient(address)
      const watchQuerySpy = vi.spyOn(client, 'watchQuery')
      const args = ref<{ channel: string } | 'skip'>({ channel: 'general' })

      const { result } = await mountWithConvex(
        client,
        () => usePaginatedQuery(queryRef, args, { initialNumItems: 1 }),
        { tick: true },
      )

      const firstArgs = getWatchQueryArgs(
        watchQuerySpy.mock.calls as WatchQueryCalls,
        queryArgs => queryArgs.channel === 'general',
      )
      applyOptimisticQueryResult(client, queryRef, firstArgs, {
        page: ['general-item'],
        isDone: true,
        continueCursor: 'cursor-general',
        splitCursor: null,
      } satisfies PaginationResult<unknown>)
      await nextTick()

      expect(result.value.results).toEqual(['general-item'])

      args.value = { channel: 'random' }
      await nextTick()

      expect(result.value).toMatchObject({
        isLoading: true,
        results: [],
        status: 'LoadingFirstPage',
      })

      const secondArgs = getWatchQueryArgs(
        watchQuerySpy.mock.calls as WatchQueryCalls,
        queryArgs => queryArgs.channel === 'random',
      )
      applyOptimisticQueryResult(client, queryRef, secondArgs, {
        page: ['random-item'],
        isDone: true,
        continueCursor: 'cursor-random',
        splitCursor: null,
      } satisfies PaginationResult<unknown>)
      await nextTick()

      expect(result.value.results).toEqual(['random-item'])

      await client.close()
    })
  })

  it('does not re-subscribe when args serialize identically', async () => {
    await withInMemoryWebSocket(async ({ address }) => {
      const client = new ConvexVueClient(address)
      const watchQuerySpy = vi.spyOn(client, 'watchQuery')
      const args = ref<Record<string, Value>>({ someArg: 123 })

      await mountWithConvex(
        client,
        () => usePaginatedQuery(queryRef, args, { initialNumItems: 10 }),
        { tick: true },
      )

      const before = watchQuerySpy.mock.calls.length

      // Replace object with a new object that serializes to the same thing.
      args.value = { someArg: 123 }
      await nextTick()

      expect(watchQuerySpy.mock.calls.length).toBe(before)

      await client.close()
    })
  })

  // -- pages / loadMore / splits ---------------------------------------------

  describe('pages', () => {
    it('loadMore', async () => {
      await withInMemoryWebSocket(async ({ address }) => {
        const client = new ConvexVueClient(address)

        const { result } = await mountWithConvex(
          client,
          () => usePaginatedQuery(queryRef, {}, { initialNumItems: 1 }),
          { tick: true },
        )

        expect(result.value.status).toBe('LoadingFirstPage')

        applyOptimisticQueryResult(
          client,
          queryRef,
          { paginationOpts: { numItems: 1, cursor: null, id: 1 } as PaginationOptions },
          {
            page: ['item1'],
            continueCursor: 'abc',
            isDone: false,
            splitCursor: null,
          } satisfies PaginationResult<unknown>,
        )
        await nextTick()

        expect(result.value.status).toBe('CanLoadMore')
        expect(result.value.results).toEqual(['item1'])

        applyOptimisticQueryResult(
          client,
          queryRef,
          { paginationOpts: { numItems: 2, cursor: 'abc', id: 1 } as PaginationOptions },
          {
            page: ['item2'],
            continueCursor: 'def',
            isDone: true,
            splitCursor: null,
          } satisfies PaginationResult<unknown>,
        )
        result.value.loadMore(2)
        await nextTick()

        expect(result.value.status).toBe('Exhausted')
        expect(result.value.results).toEqual(['item1', 'item2'])

        await client.close()
      })
    })

    it('single page updating', async () => {
      await withInMemoryWebSocket(async ({ address }) => {
        const client = new ConvexVueClient(address)

        const { result } = await mountWithConvex(
          client,
          () => usePaginatedQuery(queryRef, {}, { initialNumItems: 1 }),
          { tick: true },
        )

        applyOptimisticQueryResult(
          client,
          queryRef,
          { paginationOpts: { numItems: 1, cursor: null, id: 1 } as PaginationOptions },
          {
            page: ['item1'],
            continueCursor: 'abc',
            isDone: true,
            splitCursor: null,
          } satisfies PaginationResult<unknown>,
        )
        await nextTick()

        expect(result.value.status).toBe('Exhausted')
        expect(result.value.results).toEqual(['item1'])

        applyOptimisticQueryResult(
          client,
          queryRef,
          { paginationOpts: { numItems: 1, cursor: null, id: 1 } as PaginationOptions },
          {
            page: ['item2', 'item3'],
            continueCursor: 'def',
            isDone: true,
            splitCursor: null,
          } satisfies PaginationResult<unknown>,
        )
        await nextTick()

        expect(result.value.status).toBe('Exhausted')
        expect(result.value.results).toEqual(['item2', 'item3'])

        await client.close()
      })
    })

    it('page split', async () => {
      await withInMemoryWebSocket(async ({ address }) => {
        const client = new ConvexVueClient(address)

        const { result } = await mountWithConvex(
          client,
          () => usePaginatedQuery(queryRef, {}, { initialNumItems: 1 }),
          { tick: true },
        )

        applyOptimisticQueryResult(
          client,
          queryRef,
          { paginationOpts: { numItems: 1, cursor: null, id: 1 } as PaginationOptions },
          {
            page: ['item1', 'item2', 'item3', 'item4'],
            continueCursor: 'abc',
            splitCursor: 'mid',
            isDone: true,
          } satisfies PaginationResult<unknown>,
        )
        await nextTick()
        await nextTick()

        expect(result.value.status).toBe('Exhausted')
        expect(result.value.results).toEqual([
          'item1',
          'item2',
          'item3',
          'item4',
        ])

        applyOptimisticQueryResult(
          client,
          queryRef,
          { paginationOpts: { numItems: 1, cursor: null, endCursor: 'mid', id: 1 } as unknown as PaginationOptions },
          {
            page: ['item1S', 'item2S'],
            continueCursor: 'mid',
            isDone: false,
            splitCursor: null,
          } satisfies PaginationResult<unknown>,
        )
        applyOptimisticQueryResult(
          client,
          queryRef,
          { paginationOpts: { numItems: 1, cursor: 'mid', endCursor: 'abc', id: 1 } as unknown as PaginationOptions },
          {
            page: ['item3S', 'item4S'],
            continueCursor: 'abc',
            isDone: true,
            splitCursor: null,
          } satisfies PaginationResult<unknown>,
        )
        await nextTick()
        await nextTick()

        expect(result.value.status).toBe('Exhausted')
        expect(result.value.results).toEqual([
          'item1S',
          'item2S',
          'item3S',
          'item4S',
        ])

        await client.close()
      })
    })
  })
})

// ---------------------------------------------------------------------------
// Type-only checks for the Vue paginated query API.
// ---------------------------------------------------------------------------

describe('PaginatedQueryArgs', () => {
  it('excludes paginationOpts', () => {
    type MyQueryFunction = FunctionReference<
      'query',
      'public',
      { paginationOpts: PaginationOptions, property: string },
      PaginationResult<string>
    >
    type Args = PaginatedQueryArgs<MyQueryFunction>
    expectTypeOf<Args>().toEqualTypeOf<{ property: string }>()
  })
})

describe('PaginatedQueryItem', () => {
  it('infers the element type from a paginated return', () => {
    interface ReturnType { property: string }
    type MyQueryFunction = FunctionReference<
      'query',
      'public',
      { paginationOpts: PaginationOptions, property: string },
      PaginationResult<ReturnType>
    >
    expectTypeOf<PaginatedQueryItem<MyQueryFunction>>().toEqualTypeOf<ReturnType>()
  })
})

describe('UsePaginatedQueryObjectReturnType', () => {
  type MyQuery = FunctionReference<
    'query',
    'public',
    { paginationOpts: PaginationOptions },
    PaginationResult<string>
  >

  it('object-form return type includes an error variant', () => {
    type ObjResult = UsePaginatedQueryObjectReturnType<MyQuery>
    type ErrorVariant = Extract<ObjResult, { status: 'error' }>
    expectTypeOf<ErrorVariant>().toEqualTypeOf<{
      data: string[]
      status: 'error'
      canLoadMore: false
      isLoading: false
      error: Error
      loadMore: (numItems: number) => void
    }>()
  })

  it('positional-form return type does NOT include an error variant', () => {
    type PosResult = UsePaginatedQueryReturnType<MyQuery>
    type ErrorVariant = Extract<PosResult, { status: 'error' }>
    expectTypeOf<ErrorVariant>().toEqualTypeOf<never>()
  })

  it('object-form pending variant allows undefined data', () => {
    type ObjResult = UsePaginatedQueryObjectReturnType<MyQuery>
    type PendingData = Extract<ObjResult, { status: 'pending' }>['data']
    expectTypeOf<PendingData>().toEqualTypeOf<string[] | undefined>()
  })

  it('narrowing on status error gives access to the error field', () => {
    type ObjResult = UsePaginatedQueryObjectReturnType<MyQuery>
    type NarrowedError = Extract<ObjResult, { status: 'error' }>['error']
    expectTypeOf<NarrowedError>().toEqualTypeOf<Error>()
  })

  it('success variant has canLoadMore as boolean', () => {
    type ObjResult = UsePaginatedQueryObjectReturnType<MyQuery>
    type SuccessVariant = Extract<ObjResult, { status: 'success' }>
    expectTypeOf<SuccessVariant>().toEqualTypeOf<{
      data: string[]
      status: 'success'
      canLoadMore: boolean
      isLoading: false
      error: undefined
      loadMore: (numItems: number) => void
    }>()
  })
})

// ---------------------------------------------------------------------------
// insertAtTop / insertAtPosition helpers — pure functions over
// OptimisticLocalStore. Uses a minimal in-memory fake.
// ---------------------------------------------------------------------------

class LocalQueryStoreFake implements OptimisticLocalStore {
  queries: Record<
    string,
    Record<string, { args: Record<string, Value>, value: undefined | Value }>
  > = {}

  setQuery(query: FunctionReference<'query'>, args: unknown, value: unknown): void {
    const queriesByName = this.queries[getFunctionName(query)] ?? {}
    this.queries[getFunctionName(query)] = queriesByName
    const rawArgs = (args ?? {}) as Record<string, Value>
    const serializedArgs = JSON.stringify(convexToJson(rawArgs as Value))
    queriesByName[serializedArgs] = { args: rawArgs, value: value as Value | undefined }
  }

  getAllQueries<Query extends FunctionReference<'query'>>(
    query: Query,
  ): Array<{
    args: FunctionArgs<Query>
    value: undefined | FunctionReturnType<Query>
  }> {
    return Object.values(this.queries[getFunctionName(query)] ?? {}).map(q => ({
      args: q.args as FunctionArgs<Query>,
      value: q.value as FunctionReturnType<Query> | undefined,
    }))
  }

  getQuery<Query extends FunctionReference<'query'>>(
    query: Query,
    args: FunctionArgs<Query>,
  ): FunctionReturnType<Query> | undefined {
    const serializedArgs = JSON.stringify(convexToJson(args as Value))
    return this.queries[getFunctionName(query)]?.[serializedArgs]
      ?.value as FunctionReturnType<Query> | undefined
  }

  // Unused methods required by the `OptimisticLocalStore` interface.
  getAllMutations(): never {
    throw new Error('not implemented')
  }
}

function setupPages<Query extends PaginatedQueryReference>(options: {
  localQueryStore: LocalQueryStoreFake
  paginatedQuery: Query
  args: PaginatedQueryArgs<Query>
  pages: Array<Array<PaginatedQueryItem<Query>>>
  isDone: boolean
}): void {
  let currentCursor: string | null = null
  for (let i = 0; i < options.pages.length; i++) {
    const page = options.pages[i]
    const nextCursor = `cursor${i}`
    options.localQueryStore.setQuery(
      options.paginatedQuery,
      {
        ...options.args,
        paginationOpts: {
          cursor: currentCursor,
          id: JSON.stringify(options.args),
          numItems: 10,
        },
      },
      {
        page,
        continueCursor: nextCursor,
        isDone: i === options.pages.length - 1 ? options.isDone : false,
      },
    )
    currentCursor = nextCursor
  }
}

function argsMatch<Query extends PaginatedQueryReference>(opts: {
  args: FunctionArgs<Query>
  argsToMatch?: Partial<PaginatedQueryArgs<Query>>
}): boolean {
  if (opts.argsToMatch === undefined) return true
  return Object.keys(opts.argsToMatch).every(
    (k) => {
      const target = (opts.argsToMatch as unknown as Record<string, Value>)[k]
      const actual = (opts.args as unknown as Record<string, Value>)[k]
      return compareValues(target, actual) === 0
    },
  )
}

function getPaginatedQueryResults<Query extends PaginatedQueryReference>(opts: {
  localQueryStore: LocalQueryStoreFake
  query: Query
  argsToMatch?: Partial<PaginatedQueryArgs<Query>>
}): PaginatedQueryItem<Query>[] {
  const all = opts.localQueryStore.getAllQueries(opts.query)
  const relevant = all.filter(q => argsMatch({ args: q.args, argsToMatch: opts.argsToMatch }))
  const loaded: Array<{
    args: FunctionArgs<Query>
    value: FunctionReturnType<Query>
  }> = []
  for (const q of relevant) {
    expect(q.value).toBeDefined()
    loaded.push({ args: q.args, value: q.value! })
  }
  const firstPage = loaded.find(
    q => (q.args as { paginationOpts: PaginationOptions }).paginationOpts.cursor === null,
  )
  if (!firstPage) return []
  const sorted: PaginatedQueryItem<Query>[] = [...firstPage.value.page]
  let currentCursor: string | null = firstPage.value.continueCursor
  while (currentCursor !== null) {
    const nextPage = loaded.find(
      r => (r.args as { paginationOpts: PaginationOptions }).paginationOpts.cursor === currentCursor,
    )
    if (nextPage === undefined) break
    sorted.push(...nextPage.value.page)
    if (nextPage.value.isDone) break
    currentCursor = nextPage.value.continueCursor
  }
  return sorted
}

describe('insertAtTop', () => {
  it('does not insert if the query is not loaded', () => {
    const localQueryStore = new LocalQueryStoreFake()
    const paginatedQuery = anyApi.messages!.list as PaginatedQueryReference

    insertAtTop({
      paginatedQuery,
      localQueryStore,
      item: { author: 'Sarah', content: 'Hello, world!' },
    })
    expect(localQueryStore.getAllQueries(paginatedQuery).length).toBe(0)
  })

  it('inserts at top', () => {
    const localQueryStore = new LocalQueryStoreFake()
    const paginatedQuery = anyApi.messages!.list as FunctionReference<
      'query',
      'public',
      { paginationOpts: PaginationOptions },
      PaginationResult<{ author: string, content: string }>
    >
    setupPages({
      localQueryStore,
      paginatedQuery,
      args: {},
      pages: [
        [
          { author: 'Alice', content: 'Hello, world!' },
          { author: 'Bob', content: 'Hello, world!' },
        ],
      ],
      isDone: false,
    })

    insertAtTop({
      paginatedQuery,
      localQueryStore,
      item: { author: 'Sarah', content: 'Hello, world!' },
    })
    expect(
      getPaginatedQueryResults({ localQueryStore, query: paginatedQuery }),
    ).toEqual([
      { author: 'Sarah', content: 'Hello, world!' },
      { author: 'Alice', content: 'Hello, world!' },
      { author: 'Bob', content: 'Hello, world!' },
    ])
  })

  it('inserts at top multiple pages', () => {
    const localQueryStore = new LocalQueryStoreFake()
    const paginatedQuery = anyApi.messages!.list as FunctionReference<
      'query',
      'public',
      { paginationOpts: PaginationOptions },
      PaginationResult<{ author: string, content: string }>
    >
    setupPages({
      localQueryStore,
      paginatedQuery,
      args: {},
      pages: [
        [
          { author: 'Alice', content: 'Hello, world!' },
          { author: 'Bob', content: 'Hello, world!' },
        ],
        [
          { author: 'Charlie', content: 'Hello, world!' },
          { author: 'Dave', content: 'Hello, world!' },
        ],
      ],
      isDone: false,
    })
    insertAtTop({
      paginatedQuery,
      localQueryStore,
      item: { author: 'Sarah', content: 'Hello, world!' },
    })
    expect(
      getPaginatedQueryResults({ localQueryStore, query: paginatedQuery }),
    ).toEqual([
      { author: 'Sarah', content: 'Hello, world!' },
      { author: 'Alice', content: 'Hello, world!' },
      { author: 'Bob', content: 'Hello, world!' },
      { author: 'Charlie', content: 'Hello, world!' },
      { author: 'Dave', content: 'Hello, world!' },
    ])
  })

  it('respects filters', () => {
    const localQueryStore = new LocalQueryStoreFake()
    const paginatedQuery = anyApi.messages!.list as FunctionReference<
      'query',
      'public',
      { paginationOpts: PaginationOptions, channel?: string },
      PaginationResult<{ author: string, content: string }>
    >
    setupPages({
      localQueryStore,
      paginatedQuery,
      args: { channel: 'general' },
      pages: [
        [
          { author: 'Alice', content: 'Hello, world!' },
          { author: 'Bob', content: 'Hello, world!' },
        ],
      ],
      isDone: false,
    })
    setupPages({
      localQueryStore,
      paginatedQuery,
      args: { channel: 'marketing' },
      pages: [
        [
          { author: 'Charlie', content: 'Hello, world!' },
          { author: 'Dave', content: 'Hello, world!' },
        ],
      ],
      isDone: false,
    })

    insertAtTop({
      paginatedQuery,
      localQueryStore,
      argsToMatch: { channel: 'general' },
      item: { author: 'Sarah', content: 'Hello, world!' },
    })

    expect(
      getPaginatedQueryResults({
        localQueryStore,
        query: paginatedQuery,
        argsToMatch: { channel: 'general' },
      }),
    ).toEqual([
      { author: 'Sarah', content: 'Hello, world!' },
      { author: 'Alice', content: 'Hello, world!' },
      { author: 'Bob', content: 'Hello, world!' },
    ])
  })
})

describe('insertAtBottomIfLoaded', () => {
  it('does nothing when the last page is not loaded', () => {
    const localQueryStore = new LocalQueryStoreFake()
    const paginatedQuery = anyApi.messages!.list as FunctionReference<
      'query',
      'public',
      { paginationOpts: PaginationOptions },
      PaginationResult<{ author: string, rank: number }>
    >
    setupPages({
      localQueryStore,
      paginatedQuery,
      args: {},
      pages: [[{ author: 'Alice', rank: 10 }]],
      isDone: false,
    })
    insertAtBottomIfLoaded({
      paginatedQuery,
      localQueryStore,
      item: { author: 'Sarah', rank: 99 },
    })
    expect(
      getPaginatedQueryResults({ localQueryStore, query: paginatedQuery }),
    ).toEqual([{ author: 'Alice', rank: 10 }])
  })

  it('inserts at the bottom when the last page is loaded', () => {
    const localQueryStore = new LocalQueryStoreFake()
    const paginatedQuery = anyApi.messages!.list as FunctionReference<
      'query',
      'public',
      { paginationOpts: PaginationOptions },
      PaginationResult<{ author: string, rank: number }>
    >
    setupPages({
      localQueryStore,
      paginatedQuery,
      args: {},
      pages: [[{ author: 'Alice', rank: 10 }]],
      isDone: true,
    })
    insertAtBottomIfLoaded({
      paginatedQuery,
      localQueryStore,
      item: { author: 'Sarah', rank: 99 },
    })
    expect(
      getPaginatedQueryResults({ localQueryStore, query: paginatedQuery }),
    ).toEqual([
      { author: 'Alice', rank: 10 },
      { author: 'Sarah', rank: 99 },
    ])
  })
})

describe('insertAtPosition', () => {
  const descPages = [
    [
      { author: 'Dave', rank: 40 },
      { author: 'Charlie', rank: 30 },
    ],
    [
      { author: 'Bob', rank: 20 },
      { author: 'Alice', rank: 10 },
    ],
  ]
  const ascPages = [
    [
      { author: 'Alice', rank: 10 },
      { author: 'Bob', rank: 20 },
    ],
    [
      { author: 'Charlie', rank: 30 },
      { author: 'Dave', rank: 40 },
    ],
  ]

  type Item = { author: string, rank: number }
  type RankedQuery = FunctionReference<
    'query',
    'public',
    { paginationOpts: PaginationOptions },
    PaginationResult<Item>
  >

  describe('descending', () => {
    const paginatedQuery = anyApi.messages!.list as RankedQuery

    it('inserts in middle', () => {
      const localQueryStore = new LocalQueryStoreFake()
      setupPages({
        localQueryStore,
        paginatedQuery,
        args: {},
        pages: descPages,
        isDone: false,
      })
      insertAtPosition({
        paginatedQuery,
        localQueryStore,
        item: { author: 'Sarah', rank: 15 },
        sortOrder: 'desc',
        sortKeyFromItem: item => item.rank,
      })
      expect(
        getPaginatedQueryResults({ localQueryStore, query: paginatedQuery }),
      ).toEqual([
        { author: 'Dave', rank: 40 },
        { author: 'Charlie', rank: 30 },
        { author: 'Bob', rank: 20 },
        { author: 'Sarah', rank: 15 },
        { author: 'Alice', rank: 10 },
      ])
    })

    it('inserts at top', () => {
      const localQueryStore = new LocalQueryStoreFake()
      setupPages({
        localQueryStore,
        paginatedQuery,
        args: {},
        pages: descPages,
        isDone: false,
      })
      insertAtPosition({
        paginatedQuery,
        localQueryStore,
        item: { author: 'Sarah', rank: 55 },
        sortOrder: 'desc',
        sortKeyFromItem: item => item.rank,
      })
      expect(
        getPaginatedQueryResults({ localQueryStore, query: paginatedQuery }),
      ).toEqual([
        { author: 'Sarah', rank: 55 },
        { author: 'Dave', rank: 40 },
        { author: 'Charlie', rank: 30 },
        { author: 'Bob', rank: 20 },
        { author: 'Alice', rank: 10 },
      ])
    })

    it('inserts at bottom if list is done', () => {
      const localQueryStore = new LocalQueryStoreFake()
      setupPages({
        localQueryStore,
        paginatedQuery,
        args: {},
        pages: descPages,
        isDone: true,
      })
      insertAtPosition({
        paginatedQuery,
        localQueryStore,
        item: { author: 'Sarah', rank: 5 },
        sortOrder: 'desc',
        sortKeyFromItem: item => item.rank,
      })
      expect(
        getPaginatedQueryResults({ localQueryStore, query: paginatedQuery }),
      ).toEqual([
        { author: 'Dave', rank: 40 },
        { author: 'Charlie', rank: 30 },
        { author: 'Bob', rank: 20 },
        { author: 'Alice', rank: 10 },
        { author: 'Sarah', rank: 5 },
      ])
    })

    it('does not insert at bottom if list is still loading', () => {
      const localQueryStore = new LocalQueryStoreFake()
      setupPages({
        localQueryStore,
        paginatedQuery,
        args: {},
        pages: descPages,
        isDone: false,
      })
      insertAtPosition({
        paginatedQuery,
        localQueryStore,
        item: { author: 'Sarah', rank: 5 },
        sortOrder: 'desc',
        sortKeyFromItem: item => item.rank,
      })
      expect(
        getPaginatedQueryResults({ localQueryStore, query: paginatedQuery }),
      ).toEqual([
        { author: 'Dave', rank: 40 },
        { author: 'Charlie', rank: 30 },
        { author: 'Bob', rank: 20 },
        { author: 'Alice', rank: 10 },
      ])
    })

    it('inserts on page boundary', () => {
      const localQueryStore = new LocalQueryStoreFake()
      setupPages({
        localQueryStore,
        paginatedQuery,
        args: {},
        pages: descPages,
        isDone: false,
      })
      insertAtPosition({
        paginatedQuery,
        localQueryStore,
        item: { author: 'Sarah', rank: 29 },
        sortOrder: 'desc',
        sortKeyFromItem: item => item.rank,
      })
      expect(
        getPaginatedQueryResults({ localQueryStore, query: paginatedQuery }),
      ).toEqual([
        { author: 'Dave', rank: 40 },
        { author: 'Charlie', rank: 30 },
        { author: 'Sarah', rank: 29 },
        { author: 'Bob', rank: 20 },
        { author: 'Alice', rank: 10 },
      ])
    })
  })

  describe('ascending', () => {
    const paginatedQuery = anyApi.messages!.list as RankedQuery

    it('inserts in middle', () => {
      const localQueryStore = new LocalQueryStoreFake()
      setupPages({
        localQueryStore,
        paginatedQuery,
        args: {},
        pages: ascPages,
        isDone: false,
      })
      insertAtPosition({
        paginatedQuery,
        localQueryStore,
        item: { author: 'Sarah', rank: 15 },
        sortOrder: 'asc',
        sortKeyFromItem: item => item.rank,
      })
      expect(
        getPaginatedQueryResults({ localQueryStore, query: paginatedQuery }),
      ).toEqual([
        { author: 'Alice', rank: 10 },
        { author: 'Sarah', rank: 15 },
        { author: 'Bob', rank: 20 },
        { author: 'Charlie', rank: 30 },
        { author: 'Dave', rank: 40 },
      ])
    })

    it('inserts at top', () => {
      const localQueryStore = new LocalQueryStoreFake()
      setupPages({
        localQueryStore,
        paginatedQuery,
        args: {},
        pages: ascPages,
        isDone: false,
      })
      insertAtPosition({
        paginatedQuery,
        localQueryStore,
        item: { author: 'Sarah', rank: 5 },
        sortOrder: 'asc',
        sortKeyFromItem: item => item.rank,
      })
      expect(
        getPaginatedQueryResults({ localQueryStore, query: paginatedQuery }),
      ).toEqual([
        { author: 'Sarah', rank: 5 },
        { author: 'Alice', rank: 10 },
        { author: 'Bob', rank: 20 },
        { author: 'Charlie', rank: 30 },
        { author: 'Dave', rank: 40 },
      ])
    })

    it('inserts at bottom if list is done', () => {
      const localQueryStore = new LocalQueryStoreFake()
      setupPages({
        localQueryStore,
        paginatedQuery,
        args: {},
        pages: ascPages,
        isDone: true,
      })
      insertAtPosition({
        paginatedQuery,
        localQueryStore,
        item: { author: 'Sarah', rank: 50 },
        sortOrder: 'asc',
        sortKeyFromItem: item => item.rank,
      })
      expect(
        getPaginatedQueryResults({ localQueryStore, query: paginatedQuery }),
      ).toEqual([
        { author: 'Alice', rank: 10 },
        { author: 'Bob', rank: 20 },
        { author: 'Charlie', rank: 30 },
        { author: 'Dave', rank: 40 },
        { author: 'Sarah', rank: 50 },
      ])
    })

    it('does not insert at bottom if list is still loading', () => {
      const localQueryStore = new LocalQueryStoreFake()
      setupPages({
        localQueryStore,
        paginatedQuery,
        args: {},
        pages: ascPages,
        isDone: false,
      })
      insertAtPosition({
        paginatedQuery,
        localQueryStore,
        item: { author: 'Sarah', rank: 50 },
        sortOrder: 'asc',
        sortKeyFromItem: item => item.rank,
      })
      expect(
        getPaginatedQueryResults({ localQueryStore, query: paginatedQuery }),
      ).toEqual([
        { author: 'Alice', rank: 10 },
        { author: 'Bob', rank: 20 },
        { author: 'Charlie', rank: 30 },
        { author: 'Dave', rank: 40 },
      ])
    })

    it('inserts on page boundary', () => {
      const localQueryStore = new LocalQueryStoreFake()
      setupPages({
        localQueryStore,
        paginatedQuery,
        args: {},
        pages: ascPages,
        isDone: false,
      })
      insertAtPosition({
        paginatedQuery,
        localQueryStore,
        item: { author: 'Sarah', rank: 21 },
        sortOrder: 'asc',
        sortKeyFromItem: item => item.rank,
      })
      expect(
        getPaginatedQueryResults({ localQueryStore, query: paginatedQuery }),
      ).toEqual([
        { author: 'Alice', rank: 10 },
        { author: 'Bob', rank: 20 },
        { author: 'Sarah', rank: 21 },
        { author: 'Charlie', rank: 30 },
        { author: 'Dave', rank: 40 },
      ])
    })
  })
})
