/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { nextTick, ref, computed, createApp } from 'vue'
import { makeFunctionReference, getFunctionName } from 'convex/server'
import { ConvexClientKey } from '../../src/runtime/vue/client'
import { useQuery } from '../../src/runtime/vue/useQuery'

// ---------------------------------------------------------------------------
// Mock ConvexClient
//
// The new implementation uses:
// - ConvexClient.onUpdate(query, args, callback, onError) for Watch.onUpdate()
// - ConvexClient.client.localQueryResult(name, args) for Watch.localQueryResult()
// - ConvexClient.client.queryJournal(name, args) for Watch.journal()
//
// We mock all three, and simulate the query update flow:
// 1. useQuery → QueriesObserver → Watch.onUpdate() → registers subscription
// 2. Test pushes new value → callback fires → QueriesObserver notifies
// 3. useQuery reads Watch.localQueryResult() to get the latest value
// ---------------------------------------------------------------------------

interface MockSubscription {
  query: string
  args: Record<string, unknown>
  callback: () => void
  onError: (err: Error) => void
  unsubscribe: ReturnType<typeof vi.fn>
}

function createMockClient() {
  const subscriptions: MockSubscription[] = []

  // Store for query results (simulates BaseConvexClient's internal cache)
  const queryResults = new Map<string, unknown>()
  const queryErrors = new Map<string, Error>()

  function resultKey(name: string, args: Record<string, unknown>): string {
    return `${name}::${JSON.stringify(args)}`
  }

  const client = {
    // Mock ConvexClient.onUpdate()
    onUpdate: vi.fn((
      query: unknown,
      args: Record<string, unknown>,
      callback: () => void,
      onError?: (err: Error) => void,
    ) => {
      const name = getFunctionName(query as Parameters<typeof getFunctionName>[0])
      const sub: MockSubscription = {
        query: name,
        args,
        callback,
        onError: onError ?? (() => {}),
        unsubscribe: vi.fn(),
      }
      subscriptions.push(sub)

      // Return Unsubscribe function (matches ConvexClient API)
      const unsubFn = () => sub.unsubscribe()
      return unsubFn
    }),

    // Mock ConvexClient.client (BaseConvexClient)
    client: {
      localQueryResult: vi.fn((name: string, args: Record<string, unknown>) => {
        const key = resultKey(name, args)
        if (queryErrors.has(key)) {
          throw queryErrors.get(key)
        }
        return queryResults.get(key)
      }),
      queryJournal: vi.fn(() => undefined),
      subscribe: vi.fn((_name: string, _args: unknown, _options: unknown) => {
        return {
          queryToken: `token-${_name}`,
          unsubscribe: vi.fn(),
        }
      }),
    },

    subscriptions,

    // Test helpers: simulate server pushing a new result
    pushResult(subIndex: number, value: unknown) {
      const sub = subscriptions[subIndex]
      const key = resultKey(sub.query, sub.args)
      queryResults.set(key, value)
      queryErrors.delete(key)
      sub.callback()
    },

    pushError(subIndex: number, error: Error) {
      const sub = subscriptions[subIndex]
      const key = resultKey(sub.query, sub.args)
      queryErrors.set(key, error)
      queryResults.delete(key)
      sub.onError(error)
    },

    clearResults() {
      queryResults.clear()
      queryErrors.clear()
    },
  }

  return client
}

/**
 * Runs a composable inside a Vue app with the ConvexClient
 * provided via app-level `provide()`.
 *
 * This mirrors how the Nuxt plugin provides the client via
 * `nuxtApp.vueApp.provide(ConvexClientKey, client)`.
 */
function runComposable<T>(composable: () => T, client: ReturnType<typeof createMockClient>): T {
  let result!: T
  const app = createApp({
    setup() {
      result = composable()
      return () => null
    },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.provide(ConvexClientKey, client as any)
  app.mount(document.createElement('div'))
  return result
}

// Create a proper FunctionReference for testing
// (makeFunctionReference is used internally by useQuery for string queries)
function mockQueryRef(name: string) {
  return makeFunctionReference<'query'>(name)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useQuery (Vue layer)', () => {
  let client: ReturnType<typeof createMockClient>

  beforeEach(() => {
    client = createMockClient()
  })

  // --- Positional form ---

  it('subscribes and returns data on update (positional form)', () => {
    const { data, error, status } = runComposable(
      () => useQuery(mockQueryRef('api.tasks.list'), { completed: false }),
      client,
    )

    // Initially pending
    expect(status.value).toBe('pending')
    expect(data.value).toBeUndefined()
    expect(error.value).toBeUndefined()

    // Simulate server pushing a result
    expect(client.onUpdate).toHaveBeenCalledTimes(1)
    client.pushResult(0, [{ _id: '1', text: 'Buy milk' }])

    expect(data.value).toEqual([{ _id: '1', text: 'Buy milk' }])
    expect(status.value).toBe('success')
    expect(error.value).toBeUndefined()
  })

  it('handles errors via onError callback', () => {
    const { data, error, status } = runComposable(
      () => useQuery(mockQueryRef('api.tasks.list'), { completed: false }),
      client,
    )

    client.pushError(0, new Error('Query failed'))

    expect(error.value).toBeInstanceOf(Error)
    expect(error.value!.message).toBe('Query failed')
    expect(status.value).toBe('error')
    expect(data.value).toBeUndefined()
  })

  it('skips subscription when args is "skip"', () => {
    const { data, status } = runComposable(
      () => useQuery(mockQueryRef('api.tasks.list'), 'skip'),
      client,
    )

    expect(client.onUpdate).not.toHaveBeenCalled()
    expect(data.value).toBeUndefined()
    expect(status.value).toBe('pending')
  })

  it('allows omitting args for queries without required arguments', () => {
    const { status } = runComposable(
      () => useQuery(mockQueryRef('api.tasks.list')),
      client,
    )

    // Should subscribe with empty args (default)
    expect(client.onUpdate).toHaveBeenCalledTimes(1)
    expect(status.value).toBe('pending')
  })

  // --- Object form ---

  it('subscribes and returns data on update (object form)', () => {
    const { data, error, status } = runComposable(
      () => useQuery({
        query: mockQueryRef('api.tasks.list'),
        args: { completed: true },
      }),
      client,
    )

    expect(status.value).toBe('pending')
    expect(client.onUpdate).toHaveBeenCalledTimes(1)

    client.pushResult(0, ['task1', 'task2'])

    expect(data.value).toEqual(['task1', 'task2'])
    expect(status.value).toBe('success')
    expect(error.value).toBeUndefined()
  })

  it('skips subscription with object form args: "skip"', () => {
    const { data, status } = runComposable(
      () => useQuery({
        query: mockQueryRef('api.tasks.list'),
        args: 'skip',
      }),
      client,
    )

    expect(client.onUpdate).not.toHaveBeenCalled()
    expect(data.value).toBeUndefined()
    expect(status.value).toBe('pending')
  })

  // --- Reactive args ---

  it('re-subscribes when reactive args change', async () => {
    const args = ref<Record<string, boolean> | 'skip'>({ completed: false })

    const { data, status } = runComposable(
      () => useQuery(mockQueryRef('api.tasks.list'), args),
      client,
    )

    // First subscription
    expect(client.onUpdate).toHaveBeenCalledTimes(1)
    client.pushResult(0, ['result-1'])
    expect(data.value).toEqual(['result-1'])

    // Change args → should re-subscribe
    args.value = { completed: true }
    await nextTick()

    expect(client.onUpdate).toHaveBeenCalledTimes(2)
    // Old subscription should have been cleaned up
    expect(client.subscriptions[0].unsubscribe).toHaveBeenCalled()

    // New subscription delivers a new result
    client.pushResult(1, ['result-2'])
    expect(data.value).toEqual(['result-2'])
    expect(status.value).toBe('success')
  })

  it('transitions from skip to active when reactive args change', async () => {
    const args = ref<Record<string, string> | 'skip'>('skip')

    const { data, status } = runComposable(
      () => useQuery(mockQueryRef('api.users.get'), args),
      client,
    )

    expect(client.onUpdate).not.toHaveBeenCalled()
    expect(status.value).toBe('pending')

    // Transition from skip to actual args
    args.value = { userId: 'user-123' }
    await nextTick()

    expect(client.onUpdate).toHaveBeenCalledTimes(1)
    client.pushResult(0, { name: 'Alice' })
    expect(data.value).toEqual({ name: 'Alice' })
    expect(status.value).toBe('success')
  })

  it('transitions from active to skip when reactive args change', async () => {
    const args = ref<Record<string, string> | 'skip'>({ userId: 'user-123' })

    const { data, status } = runComposable(
      () => useQuery(mockQueryRef('api.users.get'), args),
      client,
    )

    client.pushResult(0, { name: 'Alice' })
    expect(data.value).toEqual({ name: 'Alice' })
    expect(status.value).toBe('success')

    // Transition to skip
    args.value = 'skip'
    await nextTick()

    // Should unsubscribe and reset state
    expect(client.subscriptions[0].unsubscribe).toHaveBeenCalled()
    expect(data.value).toBeUndefined()
    expect(status.value).toBe('pending')
  })

  it('does not re-subscribe when args are structurally equal', async () => {
    const trigger = ref(0)
    const argsComputed = computed(() => {
      // Access trigger to create a dependency, but always return same shape
      void trigger.value
      return { completed: false }
    })

    runComposable(
      () => useQuery(mockQueryRef('api.tasks.list'), argsComputed),
      client,
    )

    expect(client.onUpdate).toHaveBeenCalledTimes(1)

    // Trigger re-evaluation of the computed — args stay the same
    trigger.value++
    await nextTick()

    // Should NOT have re-subscribed because JSON representation is identical
    expect(client.onUpdate).toHaveBeenCalledTimes(1)
  })

  it('clears error when new subscription succeeds', () => {
    const { data, error, status } = runComposable(
      () => useQuery(mockQueryRef('api.tasks.list'), { completed: false }),
      client,
    )

    // First: error
    client.pushError(0, new Error('fail'))
    expect(error.value).toBeInstanceOf(Error)
    expect(status.value).toBe('error')

    // Then: success
    client.pushResult(0, ['recovered'])
    expect(data.value).toEqual(['recovered'])
    expect(error.value).toBeUndefined()
    expect(status.value).toBe('success')
  })

  // --- Error: no client ---

  it('throws if no ConvexClient is provided', () => {
    expect(() => {
      const app = createApp({
        setup() {
          // No client provided — should throw
          useQuery(mockQueryRef('api.tasks.list'), {})
          return () => null
        },
      })
      app.mount(document.createElement('div'))
    }).toThrow('Could not find Convex client')
  })
})
