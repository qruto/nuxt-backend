import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, h, provide } from 'vue'
import type { ConnectionState } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import { ConvexClientKey, ConvexVueClient, useConvex } from '../../src/runtime/vue/client'
import { mountWithConvex } from '../helpers/vue_test_utils'
import { createMutation, useMutation } from '../../src/runtime/vue/composables/use-mutation'
import { useAction } from '../../src/runtime/vue/composables/use-action'
import { useConvexConnectionState } from '../../src/runtime/vue/composables/use-connection-state'
import { useConvexAuth, ConvexAuthStateKey, type ConvexAuthState } from '../../src/runtime/vue/auth'
import { useQuery } from '../../src/runtime/vue/composables/use-query'

const address = 'https://127.0.0.1:3001'
const seededQueryRef = makeFunctionReference<'query'>('myQuery:default')
const seededMutationRef = makeFunctionReference<'mutation'>('myMutation:default')
const initialConnectionState = {
  hasInflightRequests: false,
  isWebSocketConnected: true,
  timeOfOldestInflightRequest: null,
  hasEverConnected: true,
  connectionCount: 1,
  connectionRetries: 0,
  inflightMutations: 0,
  inflightActions: 0,
} satisfies ConnectionState

let client: ConvexVueClient

beforeEach(() => {
  client = new ConvexVueClient(address)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ConvexVueClient', () => {
  it('can be constructed', () => {
    expect(typeof client).not.toEqual('undefined')
  })
})

describe('useConvex', () => {
  it('returns the provided client', async () => {
    let result!: ConvexVueClient
    const Child = defineComponent({
      setup() {
        result = useConvex()
        return () => h('div')
      },
    })
    const Wrapper = defineComponent({
      setup() {
        provide(ConvexClientKey, client)
        return () => h(Child)
      },
    })

    await mountSuspended(Wrapper)
    expect(result).toBe(client)
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
    const mutationRef = makeFunctionReference<'mutation'>('api.tasks.create')
    const mutationSpy = vi.spyOn(client, 'mutation').mockImplementation(async () => ({ success: true }) as never)

    const { result } = await mountWithConvex(client, () => useMutation(mutationRef))

    expect(typeof result).toBe('function')
    await result({ text: 'New task' })
    expect(mutationSpy).toHaveBeenCalledWith(mutationRef, { text: 'New task' }, { optimisticUpdate: undefined })
  })
})

describe('useAction', () => {
  it('returns a callable function that invokes client.action', async () => {
    const actionRef = makeFunctionReference<'action'>('api.tasks.process')
    const actionSpy = vi.spyOn(client, 'action').mockImplementation(async () => ({ result: true }) as never)

    const { result } = await mountWithConvex(client, () => useAction(actionRef))

    expect(typeof result).toBe('function')
    await result({ id: '123' })
    expect(actionSpy).toHaveBeenCalledWith(actionRef, { id: '123' })
  })
})

describe('useConvexConnectionState', () => {
  it('returns a reactive connection state ref', async () => {
    vi.spyOn(client, 'connectionState').mockReturnValue(initialConnectionState)
    vi.spyOn(client, 'subscribeToConnectionState').mockReturnValue(() => {})

    const { result } = await mountWithConvex(client, () => useConvexConnectionState())

    expect(result.value).toBeDefined()
    expect(result.value.isWebSocketConnected).toBe(true)
  })
})

describe('useConvexAuth', () => {
  it('returns isLoading and isAuthenticated refs', async () => {
    let authState!: ConvexAuthState

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
// Coverage for the Vue useQuery composable.
// These tests live here because they require a Vue component tree.
// Mirrors the React upstream client.test.tsx useQuery suite, using a real
// ConvexVueClient seeded via an optimistic update instead of a mock client.

describe('useQuery', () => {
  beforeEach(() => {
    // Seed a query result into the local store synchronously via an optimistic
    // update — no WebSocket round-trip needed. Mirrors the React upstream
    // technique from client.test.tsx.
    void client.mutation(seededMutationRef, {}, {
      optimisticUpdate: (localStore) => {
        localStore.setQuery(seededQueryRef, {}, 'queryResult')
      },
    })
  })

  it('returns the result', async () => {
    const { result } = await mountWithConvex(
      client,
      () => useQuery(seededQueryRef),
    )

    expect(result.value).toStrictEqual('queryResult')
  })

  it('returns undefined when skipped', async () => {
    const { result } = await mountWithConvex(client, () => useQuery(seededQueryRef, 'skip'))

    expect(result.value).toBeUndefined()
  })

  it('object form returns success result', async () => {
    const { result } = await mountWithConvex(client, () => useQuery({ query: seededQueryRef, args: {} }), { tick: true })

    expect(result.value).toStrictEqual({
      data: 'queryResult',
      error: undefined,
      status: 'success',
    })
  })

  it('object form returns pending when skipped', async () => {
    const { result } = await mountWithConvex(client, () => useQuery({ query: seededQueryRef, args: 'skip' }))

    expect(result.value).toStrictEqual({
      data: undefined,
      error: undefined,
      status: 'pending',
    })
  })

  it('async optimistic update handlers warn', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn')
    const mutation = createMutation(
      seededMutationRef,
      client,
    ).withOptimisticUpdate(async () => {})
    void mutation()
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Optimistic update handler returned a Promise. Optimistic updates should be synchronous.',
    )
  })
})
