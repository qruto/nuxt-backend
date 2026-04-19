/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { nextTick, ref, computed, createApp } from 'vue'
import { ConvexClientKey } from '../../src/runtime/vue/client'
import { useQuery } from '../../src/runtime/vue/useQuery'

// ---------------------------------------------------------------------------
// Mock ConvexClient
//
// The Vue layer's `useQuery` subscribes via `ConvexClient.onUpdate()`.
// We create a minimal mock that captures the callback so tests can push
// new values and assert the reactive refs update correctly.
// ---------------------------------------------------------------------------

interface MockSubscription {
  callback: (result: unknown) => void
  onError: (err: Error) => void
  unsubscribe: Mock
  getCurrentValue: Mock
}

function createMockClient() {
  const subscriptions: MockSubscription[] = []

  const client = {
    onUpdate: vi.fn((_query: unknown, _args: unknown, callback: (result: unknown) => void, onError?: (err: Error) => void) => {
      const sub: MockSubscription = {
        callback,
        onError: onError ?? (() => {}),
        unsubscribe: vi.fn(),
        getCurrentValue: vi.fn(() => undefined),
      }
      subscriptions.push(sub)

      // Return an Unsubscribe function (matching ConvexClient API)
      const unsubFn = () => sub.unsubscribe()
      return unsubFn
    }),
    subscriptions,
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

// Fake FunctionReference — the ConvexClient mock doesn't validate the reference
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockQueryRef(name: string): any {
  return name
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
    expect(error.value).toBeNull()

    // Simulate server pushing a result
    expect(client.onUpdate).toHaveBeenCalledTimes(1)
    const sub = client.subscriptions[0]
    sub.callback([{ _id: '1', text: 'Buy milk' }])

    expect(data.value).toEqual([{ _id: '1', text: 'Buy milk' }])
    expect(status.value).toBe('success')
    expect(error.value).toBeNull()
  })

  it('handles errors via onError callback', () => {
    const { data, error, status } = runComposable(
      () => useQuery(mockQueryRef('api.tasks.list'), { completed: false }),
      client,
    )

    const sub = client.subscriptions[0]
    sub.onError(new Error('Query failed'))

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
    expect(client.onUpdate).toHaveBeenCalledWith(
      mockQueryRef('api.tasks.list'),
      {},
      expect.any(Function),
      expect.any(Function),
    )
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

    const sub = client.subscriptions[0]
    sub.callback(['task1', 'task2'])

    expect(data.value).toEqual(['task1', 'task2'])
    expect(status.value).toBe('success')
    expect(error.value).toBeNull()
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
    client.subscriptions[0].callback(['result-1'])
    expect(data.value).toEqual(['result-1'])

    // Change args → should re-subscribe
    args.value = { completed: true }
    await nextTick()

    expect(client.onUpdate).toHaveBeenCalledTimes(2)
    // Old subscription should have been cleaned up
    expect(client.subscriptions[0].unsubscribe).toHaveBeenCalled()

    // New subscription delivers a new result
    client.subscriptions[1].callback(['result-2'])
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
    client.subscriptions[0].callback({ name: 'Alice' })
    expect(data.value).toEqual({ name: 'Alice' })
    expect(status.value).toBe('success')
  })

  it('transitions from active to skip when reactive args change', async () => {
    const args = ref<Record<string, string> | 'skip'>({ userId: 'user-123' })

    const { data, status } = runComposable(
      () => useQuery(mockQueryRef('api.users.get'), args),
      client,
    )

    client.subscriptions[0].callback({ name: 'Alice' })
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
    client.subscriptions[0].onError(new Error('fail'))
    expect(error.value).toBeInstanceOf(Error)
    expect(status.value).toBe('error')

    // Then: success
    client.subscriptions[0].callback(['recovered'])
    expect(data.value).toEqual(['recovered'])
    expect(error.value).toBeNull()
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
