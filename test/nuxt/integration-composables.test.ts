import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { computed, nextTick, provide, ref } from 'vue'
import { getFunctionName, makeFunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import type { OptimisticLocalStore } from 'convex/browser'
import { ConvexVueClient, ConvexAuthStateKey } from 'nuxt-convex-module/client'
import { mountWithConvex } from '../helpers/vue_test_utils'
import { silentConnectLogger } from '../helpers/silent-logger'
import { useAggregate } from '../../src/runtime/vue/composables/use-aggregate'
import { type BillingApi, useBilling } from '../../src/runtime/vue/composables/use-billing'
import { useFeatures } from '../../src/runtime/vue/composables/use-features'
import { useCredits } from '../../src/runtime/vue/composables/use-credits'
import { useOrders } from '../../src/runtime/vue/composables/use-orders'
import { useUsage } from '../../src/runtime/vue/composables/use-usage'
import { type EmailApi, useEmailStatus } from '../../src/runtime/vue/composables/use-email-status'
import { type SandboxInboxApi, useSandboxInbox } from '../../src/runtime/vue/composables/use-sandbox-inbox'
import { useGifts } from '../../src/runtime/vue/composables/use-gifts'
import { useSearch } from '../../src/runtime/vue/composables/use-search'
import { useWorkflowStatus } from '../../src/runtime/vue/composables/use-workflow'
import { useAiStream } from '../../src/runtime/vue/composables/use-ai-stream'
import { diagnostics } from '../../src/runtime/vue/utils/live-query'

const address = 'https://127.0.0.1:3001'
const seedMutationRef = makeFunctionReference<'mutation'>('seed:default')
const countRef = makeFunctionReference<'query'>('aggregates:countMessages')
const searchRef = makeFunctionReference<'query'>('search:searchMessages')
const subscriptionRef = makeFunctionReference<'query'>('billing:getCurrentSubscription')
const featuresRef = makeFunctionReference<'query'>('billing:getFeatures')
const creditsRef = makeFunctionReference<'query'>('billing:getCredits')
const emailStatusRef = makeFunctionReference<'query'>('email:getEmailStatus')
const sandboxInboxRef = makeFunctionReference<'query'>('email:getSandboxInbox')
const workflowRef = makeFunctionReference<'query'>('workflows:status')
const productsRef = makeFunctionReference<'query'>('billing:getConfiguredProducts')
const subscriptionsRef = makeFunctionReference<'query'>('billing:listAllSubscriptions')
const checkoutRef = makeFunctionReference<'action'>('billing:generateCheckoutLink')
const portalRef = makeFunctionReference<'action'>('billing:generateCustomerPortalUrl')
const changeRef = makeFunctionReference<'action'>('billing:changeCurrentSubscription')
const cancelRef = makeFunctionReference<'action'>('billing:cancelCurrentSubscription')
const syncRef = makeFunctionReference<'action'>('billing:syncEntitlements')
const giftCheckoutRef = makeFunctionReference<'action'>('billing:giftCheckout')
const receivedGiftsRef = makeFunctionReference<'query'>('billing:getReceivedGifts')
const claimGiftRef = makeFunctionReference<'action'>('billing:claimGift')
const updateSubscriptionRef = makeFunctionReference<'action'>('billing:updateSubscription')
const cancelSubscriptionRef = makeFunctionReference<'action'>('billing:cancelSubscription')
const uncancelSubscriptionRef = makeFunctionReference<'action'>('billing:uncancelSubscription')
const pauseSubscriptionRef = makeFunctionReference<'action'>('billing:pauseSubscription')
const resumeSubscriptionRef = makeFunctionReference<'action'>('billing:resumeSubscription')
const ordersRef = makeFunctionReference<'action'>('billing:getOrders')
const invoiceRef = makeFunctionReference<'action'>('billing:getInvoiceUrl')
const usageRef = makeFunctionReference<'action'>('billing:getUsageHistory')

let client: ConvexVueClient

function seed(setup: (store: OptimisticLocalStore) => void) {
  void client.mutation(seedMutationRef, {}, { optimisticUpdate: setup })
}

/**
 * Make reads of `query` fail with `error`, as a refused or crashed query
 * does: every read, or those whose args `when` accepts. Other reads stay live.
 */
function failQuery(query: ReturnType<typeof makeFunctionReference>, error: Error, when: (args: Record<string, unknown>) => boolean = () => true) {
  const watchQuery = client.watchQuery.bind(client)
  vi.spyOn(client, 'watchQuery').mockImplementation(((ref: typeof query, ...rest: unknown[]) => {
    if (getFunctionName(ref) !== getFunctionName(query) || !when(rest[0] as Record<string, unknown>)) return (watchQuery as (...args: unknown[]) => unknown)(ref, ...rest)
    return {
      onUpdate: () => () => {},
      localQueryResult: () => {
        throw error
      },
      localQueryLogs: () => undefined,
      journal: () => undefined,
    }
  }) as never)
}

beforeEach(() => {
  client = new ConvexVueClient(address, { logger: silentConnectLogger })
  // The development-only logging and call-shape warnings, as `nuxt dev` runs them.
  diagnostics.enabled = true
})

afterEach(() => {
  diagnostics.enabled = false
  vi.restoreAllMocks()
})

describe('useAggregate', () => {
  it('returns the numeric result in data', async () => {
    seed(store => store.setQuery(countRef, {}, 7))
    const { result } = await mountWithConvex(client, () => useAggregate(countRef))
    expect(result.data.value).toBe(7)
    expect(result.isLoading.value).toBe(false)
    expect(result.error.value).toBeNull()
  })

  it('reads undefined while loading, never a 0 that looks like an answer', async () => {
    const { result } = await mountWithConvex(client, () => useAggregate(countRef))
    expect(result.data.value).toBeUndefined()
    expect(result.isLoading.value).toBe(true)
  })

  it('reads 0 for a query that answers no number, and nothing while skipped', async () => {
    seed(store => store.setQuery(countRef, {}, null))
    const { result } = await mountWithConvex(client, () => useAggregate(countRef))
    expect(result.data.value).toBe(0)
    const skipped = await mountWithConvex(client, () => useAggregate(countRef, 'skip'))
    expect(skipped.result.data.value).toBeUndefined()
    expect(skipped.result.isLoading.value).toBe(false)
  })

  it('follows reactive args given as a getter', async () => {
    seed((store) => {
      store.setQuery(countRef, { channel: 'a' }, 1)
      store.setQuery(countRef, { channel: 'b' }, 2)
    })
    const channel = ref('a')
    const { result } = await mountWithConvex(client, () => useAggregate(countRef as never, () => ({ channel: channel.value }) as never))
    expect(result.data.value).toBe(1)
    channel.value = 'b'
    await nextTick()
    expect(result.data.value).toBe(2)
  })

  it('logs a failure without a code once in development, with the original error as cause', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const crash = new Error('[CONVEX Q(aggregates:countMessages)] Server Error')
    failQuery(countRef, crash)
    const { result } = await mountWithConvex(client, () => useAggregate(countRef))
    expect(result.error.value).toEqual({ code: 'unavailable', data: { service: 'backend', reason: 'unexpected' }, message: 'Something went wrong.' })
    expect((result.error.value as { cause?: unknown }).cause).toBe(crash)
    expect(Object.keys(result.error.value!)).toEqual(['code', 'data', 'message'])
    seed(store => store.setQuery(searchRef, { query: 'unrelated' }, []))
    await nextTick()
    expect(logged.mock.calls.filter(([text]) => text === '[nuxt-backend] query failed:')).toEqual([['[nuxt-backend] query failed:', crash]])
  })

  it('logs nothing for a refusal with a code, which error already explains', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    failQuery(countRef, new ConvexError({ code: 'unauthenticated' }))
    await mountWithConvex(client, () => useAggregate(countRef))
    expect(logged.mock.calls.some(([text]) => text === '[nuxt-backend] query failed:')).toBe(false)
  })

  it('keeps the message of an app\'s own ConvexError({ message })', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    failQuery(countRef, new ConvexError({ message: 'This board is archived.' }))
    const { result } = await mountWithConvex(client, () => useAggregate(countRef))
    expect(result.error.value).toMatchObject({ code: 'unavailable', data: { reason: 'unexpected' }, message: 'This board is archived.' })
  })

  it('puts a refused read in error instead of throwing', async () => {
    failQuery(countRef, new ConvexError({ code: 'unauthenticated' }))
    const { result } = await mountWithConvex(client, () => useAggregate(countRef))
    expect(result.data.value).toBeUndefined()
    expect(result.isLoading.value).toBe(false)
    expect(result.error.value).toMatchObject({ code: 'unauthenticated', data: {} })
  })
})

describe('useBilling', () => {
  const billingApi = { getCurrentSubscription: subscriptionRef } as unknown as BillingApi

  it('exposes the current subscription reactively', async () => {
    seed(store => store.setQuery(subscriptionRef, {}, { status: 'active' }))
    const { result } = await mountWithConvex(client, () => useBilling({ api: billingApi }))
    expect(result.subscription.value).toStrictEqual({ status: 'active' })
    expect(result.isSubscribed.value).toBe(true)
  })

  it('is loading until the subscription resolves', async () => {
    const { result } = await mountWithConvex(client, () => useBilling({ api: billingApi }))
    expect(result.subscription.value).toBeUndefined()
    expect(result.isLoading.value).toBe(true)
  })

  it('exposes configured products', async () => {
    const api = { getConfiguredProducts: productsRef } as unknown as BillingApi
    const products = { pro: { id: 'prod_pro', name: 'Pro' } }
    seed(store => store.setQuery(productsRef, {}, products))
    const { result } = await mountWithConvex(client, () => useBilling({ api }))
    expect(result.products.value).toStrictEqual(products)
  })

  it('derives the active subscription from the full list', async () => {
    const api = { listAllSubscriptions: subscriptionsRef } as unknown as BillingApi
    const list = [
      { id: 's1', status: 'canceled', productId: 'p_old' },
      { id: 's2', status: 'active', productId: 'p_pro' },
    ]
    seed(store => store.setQuery(subscriptionsRef, {}, list))
    const { result } = await mountWithConvex(client, () => useBilling({ api }))
    expect(result.subscriptions.value).toHaveLength(2)
    expect(result.subscription.value).toMatchObject({ id: 's2', status: 'active' })
    expect(result.isSubscribed.value).toBe(true)
    expect(result.isFree.value).toBe(false)
  })

  it('is free when the list has no active/trialing subscription', async () => {
    const api = { listAllSubscriptions: subscriptionsRef } as unknown as BillingApi
    seed(store => store.setQuery(subscriptionsRef, {}, [{ id: 's1', status: 'canceled', productId: 'p' }]))
    const { result } = await mountWithConvex(client, () => useBilling({ api }))
    expect(result.subscription.value).toBeNull()
    expect(result.isFree.value).toBe(true)
  })

  it('treats signed-out users as free without querying', async () => {
    const api = { listAllSubscriptions: subscriptionsRef } as unknown as BillingApi
    const { result } = await mountWithConvex(
      client,
      () => useBilling({ api }),
      { provide: () => provide(ConvexAuthStateKey, { isLoading: computed(() => false), isAuthenticated: computed(() => false), isRefreshing: computed(() => false) }) },
    )
    expect(result.subscriptions.value).toStrictEqual([])
    expect(result.subscription.value).toBeNull()
    expect(result.isFree.value).toBe(true)
    expect(result.isLoading.value).toBe(false)
  })

  it('checkout generates a link and opens it in a new tab', async () => {
    const api = { generateCheckoutLink: checkoutRef } as unknown as BillingApi
    const actionSpy = vi.spyOn(client, 'action').mockResolvedValue({ url: 'https://polar.test/checkout' })
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    const { result } = await mountWithConvex(client, () => useBilling({ api }))

    const url = await result.checkout('prod_1', { metadata: { plan: 'pro' } })

    expect(url).toBe('https://polar.test/checkout')
    expect(actionSpy).toHaveBeenCalledWith(
      checkoutRef,
      expect.objectContaining({ productIds: ['prod_1'], metadata: { plan: 'pro' } }),
    )
    expect(openSpy).toHaveBeenCalledWith('https://polar.test/checkout', '_blank')
  })

  it('checkout redirects in the same tab when redirect is set', async () => {
    const api = { generateCheckoutLink: checkoutRef } as unknown as BillingApi
    vi.spyOn(client, 'action').mockResolvedValue({ url: 'https://polar.test/c' })
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    const { result } = await mountWithConvex(client, () => useBilling({ api }))

    const url = await result.checkout(['prod_1', 'prod_2'], { redirect: true })

    expect(url).toBe('https://polar.test/c')
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('portal, changePlan and cancel fall back to the pre-lifecycle actions', async () => {
    // A backend deployed before the lifecycle functions existed: `changePlan`
    // and `cancel` must still work through the older product-only pair.
    const api = {
      generateCustomerPortalUrl: portalRef,
      changeCurrentSubscription: changeRef,
      cancelCurrentSubscription: cancelRef,
    } as unknown as BillingApi
    // portal reads `.url`; changePlan/cancel ignore the return value.
    const actionSpy = vi.spyOn(client, 'action').mockResolvedValue({ url: 'https://polar.test/portal' })
    vi.spyOn(window, 'open').mockReturnValue(null)
    const { result } = await mountWithConvex(client, () => useBilling({ api }))

    expect(await result.portal()).toBe('https://polar.test/portal')
    await result.changePlan('prod_2')
    await result.cancel({ atPeriodEnd: false })

    expect(actionSpy).toHaveBeenCalledWith(changeRef, { productId: 'prod_2' })
    expect(actionSpy).toHaveBeenCalledWith(cancelRef, { revokeImmediately: true })
  })

  it('throws a helpful error when actions are not configured', async () => {
    const { result } = await mountWithConvex(client, () => useBilling({ api: {} as BillingApi }))
    await expect(result.checkout('p')).rejects.toThrow(/Billing checkout is unavailable/)
    await expect(result.portal()).rejects.toThrow(/Billing portal is unavailable/)
    await expect(result.changePlan('p')).rejects.toThrow(/Billing changePlan is unavailable/)
    await expect(result.cancel()).rejects.toThrow(/Billing cancel is unavailable/)
  })
})

describe('useBilling — subscription lifecycle', () => {
  const authedProvide = () => provide(ConvexAuthStateKey, {
    isLoading: computed(() => false),
    isAuthenticated: computed(() => true),
    isRefreshing: computed(() => false),
  })
  const lifecycleApi = {
    getCurrentSubscription: subscriptionRef,
    updateSubscription: updateSubscriptionRef,
    cancelSubscription: cancelSubscriptionRef,
    uncancelSubscription: uncancelSubscriptionRef,
    pauseSubscription: pauseSubscriptionRef,
    resumeSubscription: resumeSubscriptionRef,
  } as unknown as BillingApi

  it('reads the lifecycle fields off the provider record', async () => {
    seed(store => store.setQuery(subscriptionRef, {}, {
      id: 'sub_1',
      status: 'trialing',
      productId: 'prod_pro',
      cancelAtPeriodEnd: true,
      trialEnd: '2099-01-08T00:00:00.000Z',
      pausedAt: null,
      resumesAt: null,
      pendingUpdate: { id: 'pu_1', appliesAt: '2099-02-01T00:00:00.000Z', productId: 'prod_max' },
    }))
    const { result } = await mountWithConvex(client, () => useBilling({ api: lifecycleApi }), { provide: authedProvide })

    expect(result.status.value).toBe('trialing')
    expect(result.cancelAtPeriodEnd.value).toBe(true)
    expect(result.isTrialing.value).toBe(true)
    expect(result.trialEnd.value?.toISOString()).toBe('2099-01-08T00:00:00.000Z')
    expect(result.pausedAt.value).toBeNull()
    expect(result.resumesAt.value).toBeNull()
    expect(result.isPaused.value).toBe(false)
    expect(result.pendingUpdate.value).toStrictEqual({
      id: 'pu_1',
      appliesAt: new Date('2099-02-01T00:00:00.000Z'),
      productId: 'prod_max',
    })
  })

  it('reads paused state and reports the free plan as no status', async () => {
    seed(store => store.setQuery(subscriptionRef, {}, {
      id: 'sub_1', status: 'paused', productId: 'prod_pro', cancelAtPeriodEnd: false,
      pausedAt: '2026-08-01T00:00:00.000Z', resumesAt: '2026-09-01T00:00:00.000Z',
    }))
    const { result } = await mountWithConvex(client, () => useBilling({ api: lifecycleApi }), { provide: authedProvide })
    expect(result.isPaused.value).toBe(true)
    expect(result.resumesAt.value?.toISOString()).toBe('2026-09-01T00:00:00.000Z')

    seed(store => store.setQuery(subscriptionRef, {}, null))
    const free = await mountWithConvex(client, () => useBilling({ api: lifecycleApi }), { provide: authedProvide })
    expect(free.result.status.value).toBeNull()
    expect(free.result.cancelAtPeriodEnd.value).toBe(false)
    expect(free.result.pendingUpdate.value).toBeNull()
  })

  it('drives changePlan, cancel, uncancel, pause and resume', async () => {
    const actionSpy = vi.spyOn(client, 'action').mockResolvedValue(null)
    const { result } = await mountWithConvex(client, () => useBilling({ api: lifecycleApi }), { provide: authedProvide })

    await result.changePlan('prod_max', { proration: 'prorate' })
    await result.cancel({ reason: 'too_expensive', comment: 'Out of budget' })
    await result.cancel({ atPeriodEnd: false })
    await result.uncancel()
    await result.pause({ resumesAt: new Date('2099-03-01T00:00:00.000Z') })
    await result.resume()

    expect(actionSpy).toHaveBeenCalledWith(updateSubscriptionRef, { subscriptionId: undefined, productId: 'prod_max', proration: 'prorate' })
    // Cancelling keeps the paid period by default.
    expect(actionSpy).toHaveBeenCalledWith(cancelSubscriptionRef, { subscriptionId: undefined, atPeriodEnd: true, reason: 'too_expensive', comment: 'Out of budget' })
    expect(actionSpy).toHaveBeenCalledWith(cancelSubscriptionRef, { subscriptionId: undefined, atPeriodEnd: false, reason: undefined, comment: undefined })
    expect(actionSpy).toHaveBeenCalledWith(uncancelSubscriptionRef, { subscriptionId: undefined })
    // Convex has no date value, so the pause target crosses as epoch ms.
    expect(actionSpy).toHaveBeenCalledWith(pauseSubscriptionRef, { subscriptionId: undefined, resumesAt: Date.parse('2099-03-01T00:00:00.000Z') })
    expect(actionSpy).toHaveBeenCalledWith(resumeSubscriptionRef, { subscriptionId: undefined })
  })

  it('addresses one subscription by id, and cancels at period end unless told otherwise', async () => {
    const actionSpy = vi.spyOn(client, 'action').mockResolvedValue(null)
    const { result } = await mountWithConvex(client, () => useBilling({ api: lifecycleApi }), { provide: authedProvide })

    await result.changePlan('prod_max', { subscriptionId: 'sub_2' })
    await result.cancel()
    await result.cancel({ atPeriodEnd: false })

    expect(actionSpy).toHaveBeenCalledWith(updateSubscriptionRef, { subscriptionId: 'sub_2', productId: 'prod_max', proration: undefined })
    expect(actionSpy).toHaveBeenCalledWith(cancelSubscriptionRef, { subscriptionId: undefined, atPeriodEnd: true, reason: undefined, comment: undefined })
    expect(actionSpy).toHaveBeenCalledWith(cancelSubscriptionRef, { subscriptionId: undefined, atPeriodEnd: false, reason: undefined, comment: undefined })
  })

  it('throws a helpful error for lifecycle actions the backend has not deployed', async () => {
    const { result } = await mountWithConvex(client, () => useBilling({ api: {} as BillingApi }))
    await expect(result.uncancel()).rejects.toThrow(/Billing uncancel is unavailable/)
    await expect(result.pause()).rejects.toThrow(/Billing pause is unavailable/)
    await expect(result.resume()).rejects.toThrow(/Billing resume is unavailable/)
  })
})

describe('useOrders', () => {
  const authedProvide = () => provide(ConvexAuthStateKey, {
    isLoading: computed(() => false),
    isAuthenticated: computed(() => true),
    isRefreshing: computed(() => false),
  })
  const ordersApi = { getOrders: ordersRef, getInvoiceUrl: invoiceRef } as unknown as BillingApi
  const page = {
    items: [{ id: 'ord_1', createdAt: '2026-08-01T00:00:00.000Z', status: 'paid', totalAmount: 900, currency: 'EUR' }],
    pagination: { totalCount: 3, maxPage: 3 },
  }

  it('loads the first page on mount and pages forward', async () => {
    const actionSpy = vi.spyOn(client, 'action').mockResolvedValue(page)
    const { result } = await mountWithConvex(client, () => useOrders({ api: ordersApi, limit: 1 }), { provide: authedProvide })
    await flushPromises()

    expect(actionSpy).toHaveBeenCalledWith(ordersRef, { page: 1, limit: 1 })
    expect(result.orders.value).toHaveLength(1)
    expect(result.total.value).toBe(3)
    expect(result.pageCount.value).toBe(3)
    expect(result.hasMore.value).toBe(true)
    expect(result.hasPrevious.value).toBe(false)

    await result.next()
    expect(actionSpy).toHaveBeenCalledWith(ordersRef, { page: 2, limit: 1 })
    expect(result.page.value).toBe(2)
    expect(result.hasPrevious.value).toBe(true)
  })

  it('reads as loading from the first frame, never as empty', async () => {
    // A fetch that never settles: the state a first paint sees must be
    // "loading", not a flash of "no charges yet".
    vi.spyOn(client, 'action').mockReturnValue(new Promise(() => {}))
    const { result } = await mountWithConvex(client, () => useOrders({ api: ordersApi }), { provide: authedProvide })
    expect(result.isLoading.value).toBe(true)
    expect(result.orders.value).toBeUndefined()
  })

  it('accepts a bare array from a backend without the page envelope', async () => {
    vi.spyOn(client, 'action').mockResolvedValue(page.items)
    const { result } = await mountWithConvex(client, () => useOrders({ api: ordersApi }), { provide: authedProvide })
    await flushPromises()
    expect(result.orders.value).toHaveLength(1)
    expect(result.total.value).toBeUndefined()
    expect(result.hasMore.value).toBe(false)
  })

  it('opens an invoice and returns its URL', async () => {
    vi.spyOn(client, 'action').mockImplementation(async (...args: unknown[]) =>
      (args[0] === invoiceRef ? { url: 'https://billing.test/invoice.pdf' } : page) as never)
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    const { result } = await mountWithConvex(client, () => useOrders({ api: ordersApi }), { provide: authedProvide })

    expect(await result.invoice('ord_1')).toBe('https://billing.test/invoice.pdf')
    expect(openSpy).toHaveBeenCalledWith('https://billing.test/invoice.pdf', '_blank')
  })

  it('reports a failed load instead of rejecting', async () => {
    vi.spyOn(client, 'action').mockRejectedValue(new Error('Provider unreachable'))
    const { result } = await mountWithConvex(client, () => useOrders({ api: ordersApi }), { provide: authedProvide })
    await flushPromises()
    expect(result.error.value).toBe('Provider unreachable')
    expect(result.orders.value).toStrictEqual([])
    expect(result.isLoading.value).toBe(false)
  })

  it('degrades to an empty list when signed out or unconfigured', async () => {
    const actionSpy = vi.spyOn(client, 'action').mockResolvedValue(page)
    const signedOutProvide = () => provide(ConvexAuthStateKey, {
      isLoading: computed(() => false),
      isAuthenticated: computed(() => false),
      isRefreshing: computed(() => false),
    })
    const signedOut = await mountWithConvex(client, () => useOrders({ api: ordersApi }), { provide: signedOutProvide })
    await flushPromises()
    expect(signedOut.result.orders.value).toStrictEqual([])
    expect(actionSpy).not.toHaveBeenCalled()

    const unconfigured = await mountWithConvex(client, () => useOrders({ api: {} as BillingApi }), { provide: authedProvide })
    await flushPromises()
    expect(unconfigured.result.orders.value).toStrictEqual([])
    expect(await unconfigured.result.invoice('ord_1')).toBeNull()
    expect(actionSpy).not.toHaveBeenCalled()
  })
})

describe('useUsage', () => {
  const authedProvide = () => provide(ConvexAuthStateKey, {
    isLoading: computed(() => false),
    isAuthenticated: computed(() => true),
    isRefreshing: computed(() => false),
  })
  const usageApi = { getUsageHistory: usageRef } as unknown as BillingApi
  const page = {
    items: [
      { id: 'evt_1', timestamp: '2026-08-01T00:00:00.000Z', name: 'ai_tokens', units: 12 },
      { id: 'evt_2', timestamp: '2026-08-01T00:01:00.000Z', name: 'ai_tokens', units: 3 },
    ],
    pagination: { totalCount: 2, maxPage: 1 },
  }

  it('reads one meter\'s history and totals the page', async () => {
    const actionSpy = vi.spyOn(client, 'action').mockResolvedValue(page)
    const { result } = await mountWithConvex(
      client,
      () => useUsage({ api: usageApi, meter: 'credits', limit: 20 }),
      { provide: authedProvide },
    )
    await flushPromises()

    expect(actionSpy).toHaveBeenCalledWith(usageRef, { meter: 'credits', page: 1, limit: 20 })
    expect(result.events.value).toHaveLength(2)
    expect(result.units.value).toBe(15)
    expect(result.hasMore.value).toBe(false)
  })

  it('reloads from the first page when the meter changes', async () => {
    const meter = ref('credits')
    const actionSpy = vi.spyOn(client, 'action').mockResolvedValue(page)
    await mountWithConvex(client, () => useUsage({ api: usageApi, meter }), { provide: authedProvide })
    await flushPromises()

    meter.value = 'seats'
    await nextTick()
    await flushPromises()
    expect(actionSpy).toHaveBeenCalledWith(usageRef, { meter: 'seats', page: 1, limit: undefined })
  })

  it('degrades to an empty list when the backend has no usage function', async () => {
    const actionSpy = vi.spyOn(client, 'action').mockResolvedValue(page)
    const { result } = await mountWithConvex(client, () => useUsage({ api: {} as BillingApi }), { provide: authedProvide })
    await flushPromises()
    expect(result.events.value).toStrictEqual([])
    expect(result.units.value).toBeUndefined()
    expect(result.isLoading.value).toBe(false)
    expect(actionSpy).not.toHaveBeenCalled()
  })
})

describe('useGifts', () => {
  const giftsApi = { getReceivedGifts: receivedGiftsRef, claimGift: claimGiftRef } as unknown as BillingApi
  const authedProvide = () => provide(ConvexAuthStateKey, {
    isLoading: computed(() => false),
    isAuthenticated: computed(() => true),
    isRefreshing: computed(() => false),
  })
  const paidGift = {
    id: 'gift-1', recipientEmail: 'me@example.com', purchaserUserId: 'u-b',
    purchaserName: 'Buyer', productIds: ['p1'], status: 'paid', createdAt: 1,
  }

  it('lists received gifts and filters the unclaimed ones', async () => {
    seed(store => store.setQuery(receivedGiftsRef, {}, [paidGift, { ...paidGift, id: 'gift-2', status: 'claimed' }]))
    const { result } = await mountWithConvex(
      client,
      () => useGifts({ api: giftsApi, autoClaim: false }),
      { provide: authedProvide },
    )
    expect(result.received.value).toHaveLength(2)
    expect(result.unclaimed.value).toHaveLength(1)
    expect(result.unclaimed.value[0]?.id).toBe('gift-1')
  })

  it('is empty without querying when signed out', async () => {
    const { result } = await mountWithConvex(client, () => useGifts({ api: giftsApi, autoClaim: false }))
    expect(result.received.value).toStrictEqual([])
    expect(result.isLoading.value).toBe(false)
  })

  it('auto-claims paid gifts once on first authenticated load', async () => {
    const actionSpy = vi.spyOn(client, 'action').mockResolvedValue({ claimed: 1 })
    seed(store => store.setQuery(receivedGiftsRef, {}, [paidGift]))
    await mountWithConvex(
      client,
      () => useGifts({ api: giftsApi }),
      { provide: authedProvide },
    )
    await nextTick()
    await nextTick()
    expect(actionSpy).toHaveBeenCalledTimes(1)
    expect(actionSpy).toHaveBeenCalledWith(claimGiftRef, {})
  })

  it('claim(giftId) targets a single gift and reports the count', async () => {
    const actionSpy = vi.spyOn(client, 'action').mockResolvedValue({ claimed: 1 })
    const { result } = await mountWithConvex(
      client,
      () => useGifts({ api: giftsApi, autoClaim: false }),
      { provide: authedProvide },
    )
    expect(await result.claim('gift-1')).toBe(1)
    expect(actionSpy).toHaveBeenCalledWith(claimGiftRef, { giftId: 'gift-1' })
  })

  it('gift checkout opens the returned URL (useBilling.gift)', async () => {
    const api = { giftCheckout: giftCheckoutRef } as unknown as BillingApi
    const actionSpy = vi.spyOn(client, 'action').mockResolvedValue({ url: 'https://checkout.test/gift' })
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    const { result } = await mountWithConvex(client, () => useBilling({ api: { ...api, listAllSubscriptions: subscriptionsRef } as never }))

    const url = await result.gift('pack_100', { recipientEmail: 'friend@example.com', message: 'hi' })

    expect(url).toBe('https://checkout.test/gift')
    expect(actionSpy).toHaveBeenCalledWith(
      giftCheckoutRef,
      expect.objectContaining({ productIds: ['pack_100'], recipientEmail: 'friend@example.com', message: 'hi' }),
    )
    expect(openSpy).toHaveBeenCalledWith('https://checkout.test/gift', '_blank')
  })
})

describe('useFeatures', () => {
  const billingApi = { getFeatures: featuresRef } as unknown as BillingApi
  const features = {
    plans: ['prod_pro'],
    benefits: [
      { id: 'g1', benefitId: 'ben_123', type: 'custom', metadata: { key: 'premium' } },
      { id: 'g2', benefitId: 'ben_456', type: 'license_keys' },
    ],
  }

  it('exposes plans/benefits and gates features reactively', async () => {
    seed(store => store.setQuery(featuresRef, {}, features))
    const { result } = await mountWithConvex(client, () => useFeatures({ api: billingApi }))
    expect(result.plans.value).toStrictEqual(['prod_pro'])
    expect(result.has('premium')).toBe(true) // friendly name via benefit metadata
    expect(result.has('ben_456')).toBe(true) // direct benefit id
    expect(result.has('license_keys')).toBe(true) // benefit type
    expect(result.has('missing')).toBe(false)
    expect(result.hasPlan('prod_pro')).toBe(true)
    expect(result.hasPlan('prod_other')).toBe(false)
  })

  it('degrades to no features when getFeatures is not configured', async () => {
    const { result } = await mountWithConvex(client, () => useFeatures({ api: {} as BillingApi }))
    expect(result.plans.value).toBeUndefined()
    expect(result.benefits.value).toBeUndefined()
    expect(result.isLoading.value).toBe(false)
    expect(result.has('premium')).toBe(false)
    expect(result.hasPlan('prod_pro')).toBe(false)
  })
})

describe('useCredits', () => {
  const billingApi = { getCredits: creditsRef } as unknown as BillingApi
  const credits = { meters: [{ meterId: 'm1', consumedUnits: 1, creditedUnits: 10, balance: 9 }] }

  it('reads the prepaid credit balance for a given meter', async () => {
    seed(store => store.setQuery(creditsRef, {}, credits))
    const { result } = await mountWithConvex(client, () => useCredits('m1', { api: billingApi }))
    expect(result.balance.value).toBe(9)
    expect(result.consumed.value).toBe(1)
    expect(result.meterId.value).toBe('m1')
  })

  it('defaults to the user\'s primary meter', async () => {
    seed(store => store.setQuery(creditsRef, {}, credits))
    const { result } = await mountWithConvex(client, () => useCredits(undefined, { api: billingApi }))
    expect(result.balance.value).toBe(9)
    expect(result.meterId.value).toBe('m1')
  })

  it('defaults to a configured meter, not whichever the provider listed first', async () => {
    // A customer keeps every meter they were ever credited on — including one
    // this app's catalog has since retired, which `getCredits` returns
    // nameless. Taking it by position would report its stale zero as "the"
    // balance, which is what a live checkout did.
    seed(store => store.setQuery(creditsRef, {}, {
      meters: [
        { meterId: 'retired', consumedUnits: 0, creditedUnits: 0, balance: 0 },
        { meterId: 'm1', name: 'credits', consumedUnits: 1, creditedUnits: 50, balance: 49 },
      ],
    }))
    const { result } = await mountWithConvex(client, () => useCredits(undefined, { api: billingApi }))
    expect(result.balance.value).toBe(49)
    expect(result.meterId.value).toBe('m1')
  })

  it('reports a zero balance for an unknown meter id', async () => {
    seed(store => store.setQuery(creditsRef, {}, credits))
    const { result } = await mountWithConvex(client, () => useCredits('missing', { api: billingApi }))
    expect(result.balance.value).toBe(0)
    expect(result.consumed.value).toBe(0)
    expect(result.meterId.value).toBeUndefined()
  })

  it('degrades to no balance when getCredits is not configured', async () => {
    const { result } = await mountWithConvex(client, () => useCredits(undefined, { api: {} as BillingApi }))
    expect(result.balance.value).toBeUndefined()
    expect(result.isLoading.value).toBe(false)
  })

  it('topUp checks out a credit pack', async () => {
    const api = { generateCheckoutLink: checkoutRef } as unknown as BillingApi
    const actionSpy = vi.spyOn(client, 'action').mockResolvedValue({ url: 'https://polar.test/pack' })
    vi.spyOn(window, 'open').mockReturnValue(null)
    const { result } = await mountWithConvex(client, () => useCredits(undefined, { api }))

    const url = await result.topUp('pack_100')
    expect(url).toBe('https://polar.test/pack')
    expect(actionSpy).toHaveBeenCalledWith(checkoutRef, expect.objectContaining({ productIds: ['pack_100'] }))
  })

  it('refresh re-syncs entitlements when configured', async () => {
    const api = { syncEntitlements: syncRef } as unknown as BillingApi
    const actionSpy = vi.spyOn(client, 'action').mockResolvedValue(null)
    const { result } = await mountWithConvex(client, () => useCredits(undefined, { api }))

    await result.refresh()
    expect(actionSpy).toHaveBeenCalledWith(syncRef, {})
  })

  it('refresh is a no-op when syncEntitlements is not configured', async () => {
    const actionSpy = vi.spyOn(client, 'action')
    const { result } = await mountWithConvex(client, () => useCredits(undefined, { api: {} as BillingApi }))
    await expect(result.refresh()).resolves.toBeUndefined()
    expect(actionSpy).not.toHaveBeenCalled()
  })
})

describe('useSandboxInbox', () => {
  const inboxApi = { getSandboxInbox: sandboxInboxRef } as unknown as SandboxInboxApi
  const address = 'delivered+demo@resend.dev'
  const message = (fields: Record<string, string>) => ({ from: 'onboarding@resend.dev', subject: '', receivedAt: 1, ...fields })

  it('reads the inbox and the code in the newest message', async () => {
    seed(store => store.setQuery(sandboxInboxRef, { address }, [
      message({ subject: 'Your code', text: 'Your code: 482915' }),
      message({ subject: 'Older', text: 'Your code: 111111' }),
    ]))
    const { result } = await mountWithConvex(client, () => useSandboxInbox({ address, api: inboxApi }))
    expect(result.messages.value).toHaveLength(2)
    expect(result.latest.value?.subject).toBe('Your code')
    expect(result.code.value).toBe('482915')
    expect(result.isLoading.value).toBe(false)
    expect(result.error.value).toBeNull()
  })

  it('follows a reactive address, loading until the new inbox lands', async () => {
    const current = ref<string | undefined>()
    seed(store => store.setQuery(sandboxInboxRef, { address }, [message({ text: 'Code 482915' })]))
    const { result } = await mountWithConvex(client, () => useSandboxInbox({ address: current, api: inboxApi }))
    expect(result.messages.value).toBeUndefined()
    current.value = address
    await nextTick()
    expect(result.code.value).toBe('482915')
    current.value = 'delivered+unread@resend.dev'
    await nextTick()
    expect(result.isLoading.value).toBe(true)
    expect(result.messages.value).toBeUndefined()
    expect(result.code.value).toBeUndefined()
  })

  it('warns in development when handed the address bare, the call shape before options', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await mountWithConvex(client, () => useSandboxInbox(ref(address) as never))
    expect(warned).toHaveBeenCalledWith(expect.stringContaining('useSandboxInbox() takes an options object, such as useSandboxInbox({ address })'))
  })

  it('puts a failed read in error, as unavailable when it carries no code', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    failQuery(sandboxInboxRef, new Error('[CONVEX Q(email:getSandboxInbox)] Server Error'))
    const { result } = await mountWithConvex(client, () => useSandboxInbox({ address, api: inboxApi }))
    expect(result.messages.value).toBeUndefined()
    expect(result.isLoading.value).toBe(false)
    expect(result.error.value).toMatchObject({ code: 'unavailable', data: { service: 'backend', reason: 'unexpected' } })
    expect(result.error.value?.message).not.toContain('Server Error')
  })

  it('finds the code in the subject or the HTML when the text has none', async () => {
    seed(store => store.setQuery(sandboxInboxRef, { address: 'delivered+html@resend.dev' }, [message({ html: '<p>Code: <b>905521</b></p>' })]))
    const { result } = await mountWithConvex(client, () => useSandboxInbox({ address: 'delivered+html@resend.dev', api: inboxApi }))
    expect(result.code.value).toBe('905521')
  })

  it('skips style and script bodies in the HTML', async () => {
    const html = '<style>.body{color:#123456}</style><script>const t = 654321</script><p>Code: 905521</p>'
    seed(store => store.setQuery(sandboxInboxRef, { address: 'delivered+css@resend.dev' }, [message({ html })]))
    const { result } = await mountWithConvex(client, () => useSandboxInbox({ address: 'delivered+css@resend.dev', api: inboxApi }))
    expect(result.code.value).toBe('905521')
  })

  it('pauses while the address is empty', async () => {
    const { result } = await mountWithConvex(client, () => useSandboxInbox({ address: '  ', api: inboxApi }))
    expect(result.messages.value).toBeUndefined()
    expect(result.isLoading.value).toBe(false)
  })

  it('degrades gracefully when getSandboxInbox is not exported', async () => {
    const { result } = await mountWithConvex(client, () => useSandboxInbox({ address, api: {} as SandboxInboxApi }))
    expect(result.messages.value).toBeUndefined()
    expect(result.code.value).toBeUndefined()
    expect(result.isLoading.value).toBe(false)
  })
})

describe('useEmailStatus', () => {
  const emailApi = { getEmailStatus: emailStatusRef } as unknown as EmailApi
  const delivered = { status: 'delivered', errorMessage: null, bounced: false, complained: false, failed: false, deliveryDelayed: false, opened: true, clicked: false }

  it('tracks delivery status for an email id', async () => {
    seed(store => store.setQuery(emailStatusRef, { emailId: 'em_1' }, delivered))
    const { result } = await mountWithConvex(client, () => useEmailStatus({ emailId: 'em_1', api: emailApi }))
    expect(result.status.value).toBe('delivered')
    expect(result.isDelivered.value).toBe(true)
    expect(result.isFailed.value).toBe(false)
    expect(result.error.value).toBeNull()
  })

  it('says isFailed for a bounce, a complaint or a failed send', async () => {
    for (const [emailId, flag] of [['em_b', 'bounced'], ['em_c', 'complained'], ['em_f', 'failed']] as const) {
      seed(store => store.setQuery(emailStatusRef, { emailId }, { ...delivered, status: flag, [flag]: true }))
      const { result } = await mountWithConvex(client, () => useEmailStatus({ emailId, api: emailApi }))
      expect(result.isFailed.value, flag).toBe(true)
      expect(result.isDelivered.value, flag).toBe(false)
    }
  })

  it('keeps a read failure in error, apart from a failed delivery', async () => {
    failQuery(emailStatusRef, new ConvexError({ code: 'forbidden', reason: 'not_owner' }))
    const { result } = await mountWithConvex(client, () => useEmailStatus({ emailId: 'em_1', api: emailApi }))
    expect(result.error.value).toMatchObject({ code: 'forbidden', data: { reason: 'not_owner' } })
    expect(result.isFailed.value).toBe(false)
    expect(result.isLoading.value).toBe(false)
  })

  it('pauses while the id is blank or whitespace', async () => {
    const { result } = await mountWithConvex(client, () => useEmailStatus({ emailId: '   ', api: emailApi }))
    expect(result.data.value).toBeUndefined()
    expect(result.isLoading.value).toBe(false)
  })

  it('warns in development when handed the id bare', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await mountWithConvex(client, () => useEmailStatus('em_1' as never))
    expect(warned).toHaveBeenCalledWith(expect.stringContaining('useEmailStatus() takes an options object'))
  })

  it('pauses while the id is undefined', async () => {
    const { result } = await mountWithConvex(client, () => useEmailStatus({ emailId: undefined, api: emailApi }))
    expect(result.data.value).toBeUndefined()
    expect(result.isLoading.value).toBe(false)
  })

  it('degrades gracefully when getEmailStatus is not configured', async () => {
    const { result } = await mountWithConvex(client, () => useEmailStatus({ emailId: 'em_1', api: {} as EmailApi }))
    expect(result.data.value).toBeUndefined()
    expect(result.status.value).toBeUndefined()
    expect(result.isLoading.value).toBe(false)
    expect(result.isDelivered.value).toBe(false)
    expect(result.isFailed.value).toBe(false)
    expect(result.error.value).toBeNull()
  })
})

describe('useSearch', () => {
  it('returns matches for a non-empty term', async () => {
    seed(store => store.setQuery(searchRef, { query: 'hello' }, [{ _id: '1', text: 'hello world' }]))
    const { result } = await mountWithConvex(client, () => useSearch(searchRef, { term: ref('hello') }))
    expect(result.results.value).toStrictEqual([{ _id: '1', text: 'hello world' }])
    expect(result.isLoading.value).toBe(false)
    expect(result.error.value).toBeNull()
  })

  it('skips the query for a whitespace-only, null or undefined term', async () => {
    for (const term of ['   ', null, undefined]) {
      const { result } = await mountWithConvex(client, () => useSearch(searchRef, { term }))
      expect(result.results.value, String(term)).toStrictEqual([])
      expect(result.isLoading.value, String(term)).toBe(false)
    }
  })

  it('reads the debounce from a ref on each change', async () => {
    const term = ref('')
    const debounce = ref(500)
    const { result } = await mountWithConvex(client, () => useSearch(searchRef, { term, debounce }))
    vi.useFakeTimers()
    try {
      debounce.value = 50
      term.value = 'quick'
      await nextTick()
      vi.advanceTimersByTime(50)
      await nextTick()
      expect(result.term.value).toBe('quick')
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('warns in development when handed the term bare', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await mountWithConvex(client, () => useSearch(searchRef, ref('hello') as never))
    expect(warned).toHaveBeenCalledWith(expect.stringContaining('useSearch() takes an options object'))
  })

  it('takes the term as a getter', async () => {
    seed(store => store.setQuery(searchRef, { query: 'getter' }, [{ _id: '2', text: 'from a getter' }]))
    const source = ref({ term: 'getter' })
    const { result } = await mountWithConvex(client, () => useSearch(searchRef, { term: () => source.value.term }))
    expect(result.results.value).toStrictEqual([{ _id: '2', text: 'from a getter' }])
  })

  it('puts a refused search in error and keeps results an empty list', async () => {
    failQuery(searchRef, new ConvexError({ code: 'rate_limited', retryAfter: 2000 }))
    const { result } = await mountWithConvex(client, () => useSearch(searchRef, { term: 'hello' }))
    expect(result.results.value).toStrictEqual([])
    expect(result.isLoading.value).toBe(false)
    expect(result.error.value).toMatchObject({ code: 'rate_limited', data: { retryAfter: 2000 } })
  })

  it('skips the query (empty results) for a blank term', async () => {
    const { result } = await mountWithConvex(client, () => useSearch(searchRef, { term: ref('') }))
    expect(result.results.value).toStrictEqual([])
    expect(result.isLoading.value).toBe(false)
  })

  it('merges extra args alongside the query term', async () => {
    seed(store => store.setQuery(searchRef, { limit: 5, query: 'hello' }, [{ _id: '1', text: 'hi' }]))
    const { result } = await mountWithConvex(
      client,
      () => useSearch(searchRef, { term: ref('hello'), args: { limit: 5 } }),
    )
    expect(result.results.value).toStrictEqual([{ _id: '1', text: 'hi' }])
  })

  it('debounces term changes before querying', async () => {
    const term = ref('')
    const { result } = await mountWithConvex(client, () => useSearch(searchRef, { term, debounce: 200 }))
    vi.useFakeTimers()
    try {
      seed(store => store.setQuery(searchRef, { query: 'world' }, [{ _id: '9', text: 'world' }]))
      term.value = 'world'
      await nextTick() // run the watcher → schedules the debounce timer
      expect(result.term.value).toBe('') // not yet applied
      vi.advanceTimersByTime(200)
      await nextTick() // debounced ref updated → query args recompute
      await nextTick() // useQuery picks up the new subscription
      expect(result.term.value).toBe('world')
      expect(result.results.value).toStrictEqual([{ _id: '9', text: 'world' }])
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('clears a pending debounce timer on unmount', async () => {
    const term = ref('')
    const { wrapper } = await mountWithConvex(client, () => useSearch(searchRef, { term, debounce: 200 }))
    vi.useFakeTimers()
    try {
      term.value = 'pending'
      await nextTick() // schedules a timer that should be cleared on dispose
      const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
      wrapper.unmount()
      expect(clearSpy).toHaveBeenCalled()
    }
    finally {
      vi.useRealTimers()
    }
  })
})

describe('useWorkflowStatus', () => {
  it('tracks status for a workflow id', async () => {
    seed(store => store.setQuery(workflowRef, { workflowId: 'wf_1' }, { type: 'completed' }))
    const { result } = await mountWithConvex(client, () => useWorkflowStatus(workflowRef, { workflowId: ref('wf_1') }))
    expect(result.data.value).toStrictEqual({ type: 'completed' })
    expect(result.isLoading.value).toBe(false)
    expect(result.error.value).toBeNull()
  })

  it('pauses while the id is null, and loads once it is set', async () => {
    const workflowId = ref<string | null>(null)
    const { result } = await mountWithConvex(client, () => useWorkflowStatus(workflowRef, { workflowId }))
    expect(result.data.value).toBeUndefined()
    expect(result.isLoading.value).toBe(false)
    workflowId.value = 'wf_unknown'
    await nextTick()
    expect(result.isLoading.value).toBe(true)
  })

  it('clears the error once the id changes to one that reads', async () => {
    seed(store => store.setQuery(workflowRef, { workflowId: 'wf_ok' }, { type: 'inProgress' }))
    failQuery(workflowRef, new ConvexError({ code: 'invalid_input', field: 'workflowId' }), args => args.workflowId === 'wf_bad')
    const workflowId = ref('wf_bad')
    const { result } = await mountWithConvex(client, () => useWorkflowStatus(workflowRef, { workflowId }))
    expect(result.error.value?.code).toBe('invalid_input')
    workflowId.value = 'wf_ok'
    await nextTick()
    expect(result.error.value).toBeNull()
    expect(result.data.value).toStrictEqual({ type: 'inProgress' })
  })

  it('warns in development when handed the id bare', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await mountWithConvex(client, () => useWorkflowStatus(workflowRef, ref('wf_1') as never))
    expect(warned).toHaveBeenCalledWith(expect.stringContaining('useWorkflowStatus() takes an options object'))
  })

  it('puts a failed read in error instead of throwing', async () => {
    failQuery(workflowRef, new ConvexError({ code: 'invalid_input', field: 'workflowId' }))
    const { result } = await mountWithConvex(client, () => useWorkflowStatus(workflowRef, { workflowId: 'wf_1' }))
    expect(result.error.value).toMatchObject({ code: 'invalid_input', data: { field: 'workflowId' } })
    expect(result.data.value).toBeUndefined()
  })
})

describe('useAiStream', () => {
  const startRef = makeFunctionReference<'action'>('ai:startEcho')
  const bodyRef = makeFunctionReference<'query'>('ai:echoBody')

  it('ends a refused start in error, with the refusal in error, and rejects', async () => {
    const refusal = new ConvexError({ code: 'insufficient_credits', meter: 'credits', balance: 0, need: 1 })
    vi.spyOn(client, 'action').mockRejectedValue(refusal)
    const { result } = await mountWithConvex(client, () => useAiStream({ start: startRef, body: bodyRef }, { url: 'https://site.test/ai/stream' }))

    await expect(result.start({ prompt: 'hi' })).rejects.toBe(refusal)
    expect(result.status.value).toBe('error')
    expect(result.isStreaming.value).toBe(false)
    expect(result.error.value).toEqual({
      code: 'insufficient_credits',
      data: { meter: 'credits', balance: 0, need: 1 },
      message: 'Not enough credits: 0 left, 1 needed. Top up to continue.',
    })
  })

  it('says error after a refused start while attached to a finished stream, and clears it on the next start', async () => {
    seed(store => store.setQuery(bodyRef, { streamId: 's1' }, { text: 'earlier', status: 'done' }))
    const refusal = new ConvexError({ code: 'rate_limited', limit: 'ai', retryAfter: 2000 })
    const action = vi.spyOn(client, 'action').mockRejectedValueOnce(refusal)
    const { result } = await mountWithConvex(client, () => useAiStream({ start: startRef, body: bodyRef }, { url: 'https://site.test/ai/stream', streamId: 's1' }))
    expect(result.status.value).toBe('done')

    await expect(result.start()).rejects.toBe(refusal)
    expect(result.status.value).toBe('error')
    expect(result.isStreaming.value).toBe(false)
    expect(result.error.value).toMatchObject({ code: 'rate_limited' })

    // The next start begins clean, even one that fails before it reaches the server.
    action.mockRejectedValueOnce(new Error('offline'))
    await expect(result.start()).rejects.toThrow('offline')
    expect(result.error.value).toBeNull()
    expect(result.status.value).toBe('error')
  })

  it('clears the last refusal before checking for an endpoint', async () => {
    const url = ref<string | undefined>('https://site.test/ai/stream')
    vi.spyOn(client, 'action').mockRejectedValue(new ConvexError({ code: 'unauthenticated' }))
    const { result } = await mountWithConvex(client, () => useAiStream({ start: startRef, body: bodyRef }, { url }))
    await expect(result.start()).rejects.toBeTruthy()
    expect(result.error.value).toMatchObject({ code: 'unauthenticated' })

    url.value = undefined
    await expect(result.start()).rejects.toThrow(/no stream endpoint/)
    expect(result.error.value).toBeNull()
  })
})
