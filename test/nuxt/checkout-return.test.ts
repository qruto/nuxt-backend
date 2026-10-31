import { describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { computed, createApp, ref } from 'vue'
import { ConvexAuthStateKey } from 'nuxt-convex-module/client'
import { useNuxtApp, useRouter } from '#imports'
import { entitlementSync, finishCheckoutReturn, finishingCheckout } from '../../src/runtime/vue/utils/checkout-return'

// The return from checkout: the server sends a plan or pack checkout back
// with `?checkout_return=`, and the client takes it off the address, then refreshes
// the entitlements once while `useBilling().isFinishingCheckout` says so.
// First the steps on their own, then the plugin file on the test's own Nuxt
// app and router, with the backend's refresh standing in.

const sync = vi.hoisted(() => ({ calls: [] as Array<{ args: unknown, finishing: boolean }> }))

vi.mock('../../src/runtime/vue/utils/namespace', () => ({ useBackendNamespace: () => ({ syncEntitlements: {} }) }))
vi.mock('nuxt-convex-module/client', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  useAction: () => async (args: unknown) => {
    const { finishingCheckout: finishing } = await import('../../src/runtime/vue/utils/checkout-return')
    sync.calls.push({ args, finishing: finishing.value })
    return null
  },
}))

describe('finishing a return from checkout', () => {
  it('takes the parameter off the address, keeping the rest, and refreshes once, busy while it runs', async () => {
    const strip = vi.fn()
    let during: boolean | undefined
    const refresh = vi.fn(async () => {
      during = finishingCheckout.value
    })
    expect(await finishCheckoutReturn({ query: { tab: 'plan', checkout_return: 'chk_a' }, strip, sync: refresh })).toBe(true)
    expect(strip).toHaveBeenCalledWith({ tab: 'plan' })
    expect(during).toBe(true)
    expect(finishingCheckout.value).toBe(false)
    // The same checkout again (a back button, a second tab of the page): no second refresh.
    expect(await finishCheckoutReturn({ query: { checkout_return: 'chk_a' }, strip, sync: refresh })).toBe(false)
    expect(strip).toHaveBeenCalledTimes(2)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('does nothing on an address without the parameter, and leaves a failed refresh to the webhooks', async () => {
    const strip = vi.fn()
    expect(await finishCheckoutReturn({ query: { tab: 'plan' }, strip, sync: vi.fn() })).toBe(false)
    expect(strip).not.toHaveBeenCalled()
    expect(await finishCheckoutReturn({ query: { checkout_return: 'chk_b' }, strip, sync: () => Promise.reject(new Error('offline')) })).toBe(false)
    expect(finishingCheckout.value).toBe(false)
    // An empty id (the placeholder the provider did not fill) refreshes nothing.
    expect(await finishCheckoutReturn({ query: { checkout_return: '' }, strip, sync: vi.fn() })).toBe(false)
  })
})

describe('the refresh a return makes', () => {
  /** The refresh, in an app whose session is `loading` and then signed in or not. */
  function refreshIn(session: { loading: boolean, signedIn: boolean }) {
    const app = createApp({})
    app.provide(ConvexAuthStateKey, {
      isLoading: computed(() => session.loading),
      isAuthenticated: computed(() => session.signedIn),
      isRefreshing: computed(() => false),
    })
    return app.runWithContext(entitlementSync)
  }

  it('refreshes nothing for a signed-out visitor', async () => {
    const before = sync.calls.length
    await finishCheckoutReturn({ query: { checkout_return: 'chk_out' }, strip: vi.fn(), sync: refreshIn({ loading: false, signedIn: false }) })
    expect(sync.calls).toHaveLength(before)
    expect(finishingCheckout.value).toBe(false)
  })

  it('waits for the session to settle, then refreshes for a signed-in person', async () => {
    const before = sync.calls.length
    const loading = ref(true)
    const app = createApp({})
    app.provide(ConvexAuthStateKey, { isLoading: computed(() => loading.value), isAuthenticated: computed(() => !loading.value), isRefreshing: computed(() => false) })
    const finishing = finishCheckoutReturn({ query: { checkout_return: 'chk_in' }, strip: vi.fn(), sync: app.runWithContext(entitlementSync) })
    await flushPromises()
    expect(sync.calls).toHaveLength(before)
    expect(finishingCheckout.value).toBe(true)
    loading.value = false
    expect(await finishing).toBe(true)
    expect(sync.calls).toHaveLength(before + 1)
    expect(finishingCheckout.value).toBe(false)
  })

  it('gives up when the session never settles, and says it is finishing no longer', async () => {
    vi.useFakeTimers()
    try {
      const before = sync.calls.length
      const finishing = finishCheckoutReturn({ query: { checkout_return: 'chk_stuck' }, strip: vi.fn(), sync: refreshIn({ loading: true, signedIn: false }) })
      await vi.advanceTimersByTimeAsync(9_000)
      expect(finishingCheckout.value).toBe(true)
      await vi.advanceTimersByTimeAsync(1_000)
      expect(await finishing).toBe(false)
      expect(finishingCheckout.value).toBe(false)
      expect(sync.calls).toHaveLength(before)
    }
    finally {
      vi.useRealTimers()
    }
  })
})

describe('the checkout-return plugin', () => {
  it('finishes a return on the page it lands on, once, and loads nothing on any other page', async () => {
    const { default: plugin } = await import('../../src/runtime/vue/plugins/checkout-return')
    const nuxtApp = useNuxtApp()
    const router = useRouter()
    const before = sync.calls.length
    await router.push('/settings?tab=plan')
    await nuxtApp.runWithContext(() => (plugin as unknown as (app: typeof nuxtApp) => unknown)(nuxtApp))
    await nuxtApp.callHook('app:mounted', nuxtApp.vueApp)
    await flushPromises()
    expect(sync.calls).toHaveLength(before)

    await router.push('/settings?tab=plan&checkout_return=chk_1#billing')
    await nuxtApp.callHook('app:mounted', nuxtApp.vueApp)
    await vi.waitFor(() => expect(sync.calls).toHaveLength(before + 1), { timeout: 15_000 })
    // Refreshed with no arguments, while the page said it is finishing the purchase.
    expect(sync.calls[before]).toEqual({ args: {}, finishing: true })
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/settings?tab=plan#billing'))
    expect(finishingCheckout.value).toBe(false)
  })

  it('leaves an app\'s own checkout_id on the address', async () => {
    const nuxtApp = useNuxtApp()
    const router = useRouter()
    const before = sync.calls.length
    await router.push('/settings?checkout_id=chk_mine')
    await nuxtApp.callHook('app:mounted', nuxtApp.vueApp)
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/settings?checkout_id=chk_mine')
    expect(sync.calls).toHaveLength(before)
  })
})
