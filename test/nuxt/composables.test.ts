import { describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, h, provide, nextTick, type ShallowRef } from 'vue'
import { makeFunctionReference, getFunctionName } from 'convex/server'
import { ConvexClientKey, type ConvexVueClient } from '../../src/runtime/vue/client'
import { withConvex } from '../helpers/vue_test_utils'
import { useConvex } from '../../src/runtime/vue/client'
import { useMutation } from '../../src/runtime/vue/use_mutation'
import { useAction } from '../../src/runtime/vue/use_action'
import { useConvexConnectionState } from '../../src/runtime/vue/use_connection_state'
import { useConvexAuth, ConvexAuthStateKey } from '../../src/runtime/vue/auth'
import { useQuery } from '../../src/runtime/vue/use_query'

/**
 * Create a minimal mock ConvexVueClient.
 */
function createMockClient(overrides: Partial<ConvexVueClient> = {}) {
  const watchers = new Map<string, Array<() => void>>()
  const results = new Map<string, unknown>()
  const journals = new Map<string, unknown>()

  const client = {
    url: 'https://test.convex.cloud',
    watchQuery: vi.fn((query: any, args: any, opts?: any) => {
      let name: string
      if (typeof query === 'string') {
        name = query
      }
      else {
        try {
          name = getFunctionName(query)
        }
        catch {
          name = query?._name ?? 'unknown'
        }
      }
      const key = `${name}:${JSON.stringify(args ?? {})}`
      return {
        onUpdate: (callback: () => void) => {
          if (!watchers.has(key)) watchers.set(key, [])
          watchers.get(key)!.push(callback)
          return () => {
            const arr = watchers.get(key)
            if (arr) {
              const idx = arr.indexOf(callback)
              if (idx >= 0) arr.splice(idx, 1)
            }
          }
        },
        localQueryResult: () => results.get(key),
        journal: () => journals.get(key),
      }
    }),
    mutation: vi.fn(async () => ({ success: true })),
    action: vi.fn(async () => ({ result: true })),
    connectionState: vi.fn(() => ({
      hasInflightRequests: false,
      isWebSocketConnected: true,
      timeOfOldestInflightRequest: null,
    })),
    subscribeToConnectionState: vi.fn((cb: any) => () => {}),
    setAuth: vi.fn(),
    clearAuth: vi.fn(),
    close: vi.fn(async () => {}),
    // Test helpers
    _watchers: watchers,
    _results: results,
    _journals: journals,
    _triggerUpdate(name: string, args: any, value: unknown) {
      const key = `${name}:${JSON.stringify(args ?? {})}`
      results.set(key, value)
      const cbs = watchers.get(key)
      if (cbs) for (const cb of cbs) cb()
    },
    ...overrides,
  } as unknown as ConvexVueClient & {
    _watchers: Map<string, Array<() => void>>
    _results: Map<string, unknown>
    _journals: Map<string, unknown>
    _triggerUpdate: (name: string, args: any, value: unknown) => void
  }

  return client
}

describe('useConvex', () => {
  it('returns the provided client', async () => {
    const mockClient = createMockClient()

    let result: any
    const Child = defineComponent({
      setup() {
        result = useConvex()
        return () => h('div')
      },
    })
    const Wrapper = defineComponent({
      setup() {
        provide(ConvexClientKey, mockClient)
        return () => h(Child)
      },
    })

    await mountSuspended(Wrapper)
    expect(result).toBe(mockClient)
  })

  it('throws if no client is provided', async () => {
    const Wrapper = defineComponent({
      setup() {
        expect(() => useConvex()).toThrow()
        return () => h('div')
      },
    })

    await mountSuspended(Wrapper)
  })
})

describe('useMutation', () => {
  it('returns a callable function that invokes client.mutation', async () => {
    const mockClient = createMockClient()
    const mutationRef = { _name: 'api.tasks.create' } as any

    let mutate: any
    const { Wrapper } = withConvex(mockClient, () => {
      mutate = useMutation(mutationRef)
    })

    await mountSuspended(Wrapper)

    expect(typeof mutate).toBe('function')
    await mutate({ text: 'New task' })
    expect(mockClient.mutation).toHaveBeenCalledWith(mutationRef, { text: 'New task' }, { optimisticUpdate: undefined })
  })
})

describe('useAction', () => {
  it('returns a callable function that invokes client.action', async () => {
    const mockClient = createMockClient()
    const actionRef = { _name: 'api.tasks.process' } as any

    let act: any
    const { Wrapper } = withConvex(mockClient, () => {
      act = useAction(actionRef)
    })

    await mountSuspended(Wrapper)

    expect(typeof act).toBe('function')
    await act({ id: '123' })
    expect(mockClient.action).toHaveBeenCalledWith(actionRef, { id: '123' })
  })
})

describe('useConvexConnectionState', () => {
  it('returns a reactive connection state ref', async () => {
    const mockClient = createMockClient()

    let state: ShallowRef<any>
    const { Wrapper } = withConvex(mockClient, () => {
      state = useConvexConnectionState()
    })

    await mountSuspended(Wrapper)

    expect(state!.value).toBeDefined()
    expect(state!.value.isWebSocketConnected).toBe(true)
  })
})

describe('useConvexAuth', () => {
  it('returns isLoading and isAuthenticated refs', async () => {
    let authState: any

    const Child = defineComponent({
      setup() {
        authState = useConvexAuth()
        return () => h('div')
      },
    })

    const Wrapper = defineComponent({
      setup() {
        provide(ConvexAuthStateKey, {
          isLoading: false,
          isAuthenticated: true,
        })
        return () => h(Child)
      },
    })

    await mountSuspended(Wrapper)

    expect(authState.isLoading).toBe(false)
    expect(authState.isAuthenticated).toBe(true)
  })
})

// ── useQuery ─────────────────────────────────────────────────────────────────
// Mirrors React client.test.tsx `describe("useQuery")`.
// These tests live here because they require a Vue component tree.

describe('useQuery', () => {
  const queryRef = makeFunctionReference<'query'>('myQuery:default')
  const queryKey = 'myQuery:default'

  it('returns the result', async () => {
    const mockClient = createMockClient()

    let result: ShallowRef<unknown>
    const { Wrapper } = withConvex(mockClient, () => {
      result = useQuery(queryRef, {})
    })

    await mountSuspended(Wrapper)
    await nextTick() // let watchEffect register the observer subscriber

    // Trigger the mock with a query result then wait for Vue reactivity.
    ;(mockClient as any)._triggerUpdate(queryKey, {}, 'queryResult')
    await nextTick()

    expect(result!.value).toStrictEqual('queryResult')
  })

  it('returns undefined when skipped', async () => {
    const mockClient = createMockClient()

    let result: ShallowRef<unknown>
    const { Wrapper } = withConvex(mockClient, () => {
      result = useQuery(queryRef, 'skip')
    })

    await mountSuspended(Wrapper)

    expect(result!.value).toBeUndefined()
  })

  it('object form returns success result', async () => {
    const mockClient = createMockClient()

    let result: ShallowRef<unknown>
    const { Wrapper } = withConvex(mockClient, () => {
      result = useQuery({ query: queryRef, args: {} })
    })

    await mountSuspended(Wrapper)
    await nextTick() // let watchEffect register the observer subscriber
    ;(mockClient as any)._triggerUpdate(queryKey, {}, 'queryResult')
    await nextTick()

    expect(result!.value).toStrictEqual({
      data: 'queryResult',
      error: undefined,
      status: 'success',
    })
  })

  it('object form returns pending when skipped', async () => {
    const mockClient = createMockClient()

    let result: ShallowRef<unknown>
    const { Wrapper } = withConvex(mockClient, () => {
      result = useQuery({ query: queryRef, args: 'skip' })
    })

    await mountSuspended(Wrapper)

    expect(result!.value).toStrictEqual({
      data: undefined,
      error: undefined,
      status: 'pending',
    })
  })
})
