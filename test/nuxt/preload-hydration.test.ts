import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { anyApi } from 'convex/server'
import { convexToJson } from 'convex/values'
import { defineComponent, h, nextTick, provide } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { ConvexVueClient, ConvexClientKey } from '../../src/runtime/vue/client'
import { usePreloadedQuery } from '../../src/runtime/vue/hydration'
import { preloadQuery, preloadedQueryResult } from '../../src/runtime/nuxt/index'
import { nodeWebSocket } from '../helpers/in_memory_web_socket'

// Mirrors convex-js/src/nextjs/nextjs.test.tsx

const address = 'https://127.0.0.1:3001'

function testClient() {
  return new ConvexVueClient(address, {
    webSocketConstructor: nodeWebSocket,
    unsavedChangesWarning: false,
  })
}

describe('preloadQuery + usePreloadedQuery round-trip', () => {
  beforeEach(() => {
    process.env.CONVEX_URL = address
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'success', value: convexToJson({ x: 42 }) }),
    } as never) as any
  })

  afterEach(() => {
    delete process.env.CONVEX_URL
  })

  it('returns the server result before the client has live data', async () => {
    const preloaded = await preloadQuery(anyApi.myQuery.default, { arg: 'something' })

    expect(fetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ cache: 'no-store' }),
    )
    expect(preloadedQueryResult(preloaded)).toStrictEqual({ x: 42 })

    const client = testClient()
    let hydrated: any
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
    const preloaded = await preloadQuery(anyApi.myQuery.default, { arg: 'something' })
    const client = testClient()

    // Fire an optimistic update to seed the local query store, mirroring the
    // upstream React test. The mutation RPC itself is irrelevant here — the
    // optimistic callback runs synchronously against the local cache.
    void client.mutation(
      anyApi.myMutation.default,
      {},
      {
        optimisticUpdate: (localStore) => {
          localStore.setQuery(anyApi.myQuery.default, { arg: 'something' }, null)
        },
      },
    )

    let hydrated: any
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
})
