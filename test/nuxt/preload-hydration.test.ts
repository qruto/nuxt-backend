import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { anyApi, type FunctionReference } from 'convex/server'
import { convexToJson } from 'convex/values'
import { defineComponent, h, nextTick, provide, reactive, type ShallowRef } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { ConvexVueClient, ConvexClientKey } from '../../src/runtime/vue/client'
import { ConvexAuthStateKey } from '../../src/runtime/vue/auth'
import { usePreloadedAuthQuery } from '../../src/runtime/vue/auth/hydration'
import { usePreloadedQuery } from '../../src/runtime/vue/hydration'
import { preloadQuery, preloadedQueryResult } from '../../src/runtime/nuxt/index'
import { nodeWebSocket } from '../helpers/in_memory_web_socket'

// Coverage for Nuxt preload + hydration round-trips.

const address = 'https://127.0.0.1:3001'
const queryRef = anyApi.myQuery!.default! as FunctionReference<'query'>
const mutationRef = anyApi.myMutation!.default! as FunctionReference<'mutation'>

function testClient() {
  return new ConvexVueClient(address, {
    webSocketConstructor: nodeWebSocket,
    unsavedChangesWarning: false,
  })
}

describe('preloadQuery + usePreloadedQuery round-trip', () => {
  beforeEach(() => {
    process.env.NUXT_PUBLIC_CONVEX_URL = address
    global.fetch = vi.fn(async () => new Response(
      JSON.stringify({ status: 'success', value: convexToJson({ x: 42 }) }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    )) as typeof fetch
  })

  afterEach(() => {
    delete process.env.NUXT_PUBLIC_CONVEX_URL
  })

  it('returns the server result before the client has live data', async () => {
    const preloaded = await preloadQuery(queryRef, { arg: 'something' })

    expect(fetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ cache: 'no-store' }),
    )
    expect(preloadedQueryResult(preloaded)).toStrictEqual({ x: 42 })

    const client = testClient()
    let hydrated!: ShallowRef<unknown>
    const Child = defineComponent({
      setup() {
        hydrated = usePreloadedQuery(preloaded)
        return () => h('div')
      },
    })
    const Wrapper = defineComponent({
      setup() {
        provide(ConvexClientKey, client)
        return () => h(Child)
      },
    })

    const mounted = await mountSuspended(Wrapper)
    await nextTick()

    expect(hydrated.value).toStrictEqual({ x: 42 })

    mounted.unmount()
    await client.close()
  })

  it('returns the client result once an optimistic update primes the cache', async () => {
    const preloaded = await preloadQuery(queryRef, { arg: 'something' })
    const client = testClient()

    // Fire an optimistic update to seed the local query store. The mutation
    // RPC itself is irrelevant here — the
    // optimistic callback runs synchronously against the local cache.
    void client.mutation(
      mutationRef,
      {},
      {
        optimisticUpdate: (localStore) => {
          localStore.setQuery(queryRef, { arg: 'something' }, null)
        },
      },
    )

    let hydrated!: ShallowRef<unknown>
    const Child = defineComponent({
      setup() {
        hydrated = usePreloadedQuery(preloaded)
        return () => h('div')
      },
    })
    const Wrapper = defineComponent({
      setup() {
        provide(ConvexClientKey, client)
        return () => h(Child)
      },
    })

    const mounted = await mountSuspended(Wrapper)
    await nextTick()

    expect(hydrated.value).toStrictEqual(null)

    mounted.unmount()
    await client.close()
  })

  it('keeps auth-preloaded data while auth loads, then clears for unauthenticated users', async () => {
    const preloaded = await preloadQuery(queryRef, { arg: 'something' })
    const client = testClient()
    const authState = reactive({ isLoading: true, isAuthenticated: false })

    let hydrated!: ShallowRef<unknown>
    const Child = defineComponent({
      setup() {
        hydrated = usePreloadedAuthQuery(preloaded)
        return () => h('div')
      },
    })
    const Wrapper = defineComponent({
      setup() {
        provide(ConvexClientKey, client)
        provide(ConvexAuthStateKey, authState)
        return () => h(Child)
      },
    })

    const mounted = await mountSuspended(Wrapper)
    await nextTick()

    expect(hydrated.value).toStrictEqual({ x: 42 })

    authState.isLoading = false
    await nextTick()
    await nextTick()

    expect(hydrated.value).toBeNull()

    mounted.unmount()
    await client.close()
  })

  it('switches auth-preloaded data to the live authenticated result', async () => {
    const preloaded = await preloadQuery(queryRef, { arg: 'something' })
    const client = testClient()
    const authState = reactive({ isLoading: false, isAuthenticated: true })

    void client.mutation(
      mutationRef,
      {},
      {
        optimisticUpdate: (localStore) => {
          localStore.setQuery(queryRef, { arg: 'something' }, null)
        },
      },
    )

    let hydrated!: ShallowRef<unknown>
    const Child = defineComponent({
      setup() {
        hydrated = usePreloadedAuthQuery(preloaded)
        return () => h('div')
      },
    })
    const Wrapper = defineComponent({
      setup() {
        provide(ConvexClientKey, client)
        provide(ConvexAuthStateKey, authState)
        return () => h(Child)
      },
    })

    const mounted = await mountSuspended(Wrapper)
    await nextTick()
    await nextTick()

    expect(hydrated.value).toStrictEqual(null)

    mounted.unmount()
    await client.close()
  })
})
