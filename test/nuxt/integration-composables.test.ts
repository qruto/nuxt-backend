import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { computed, nextTick, provide, ref } from 'vue'
import { makeFunctionReference } from 'convex/server'
import type { OptimisticLocalStore } from 'convex/browser'
import { ConvexVueClient, ConvexAuthStateKey } from 'nuxt-convex-module/client'
import { mountWithConvex } from '../helpers/vue_test_utils'
import { silentConnectLogger } from '../helpers/silent-logger'
import { useAggregate, useCount } from '../../src/runtime/vue/composables/use-aggregate'
import { type BillingApi, useBilling } from '../../src/runtime/vue/composables/use-billing'
import { useFeatures } from '../../src/runtime/vue/composables/use-features'
import { useCredits } from '../../src/runtime/vue/composables/use-credits'
import { useOrders } from '../../src/runtime/vue/composables/use-orders'
import { useUsage } from '../../src/runtime/vue/composables/use-usage'
import { type EmailApi, useEmailStatus } from '../../src/runtime/vue/composables/use-email-status'
import { useGifts } from '../../src/runtime/vue/composables/use-gifts'
import { useSearch } from '../../src/runtime/vue/composables/use-search'
import { useWorkflowStatus } from '../../src/runtime/vue/composables/use-workflow'

const address = 'https://127.0.0.1:3001'
const seedMutationRef = makeFunctionReference<'mutation'>('seed:default')
const countRef = makeFunctionReference<'query'>('aggregates:countMessages')
const searchRef = makeFunctionReference<'query'>('search:searchMessages')
const subscriptionRef = makeFunctionReference<'query'>('billing:getCurrentSubscription')
const featuresRef = makeFunctionReference<'query'>('billing:getFeatures')
const creditsRef = makeFunctionReference<'query'>('billing:getCredits')
const emailStatusRef = makeFunctionReference<'query'>('email:getEmailStatus')
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

beforeEach(() => {
  client = new ConvexVueClient(address, { logger: silentConnectLogger })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useAggregate / useCount', () => {
  it('returns the numeric result', async () => {
    seed(store => store.setQuery(countRef, {}, 7))
    const { result } = await mountWithConvex(client, () => useCount(countRef))
    expect(result.value).toBe(7)
  })

  it('coerces the loading state to 0', async () => {
    const { result } = await mountWithConvex(client, () => useAggregate(countRef))
    expect(result.value).toBe(0)
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

describe('useEmailStatus', () => {
  const emailApi = { getEmailStatus: emailStatusRef } as unknown as EmailApi
  const delivered = { status: 'delivered', errorMessage: null, bounced: false, complained: false, failed: false, deliveryDelayed: false, opened: true, clicked: false }

  it('tracks delivery status for an email id', async () => {
    seed(store => store.setQuery(emailStatusRef, { emailId: 'em_1' }, delivered))
    const { result } = await mountWithConvex(client, () => useEmailStatus('em_1', { api: emailApi }))
    expect(result.status.value).toBe('delivered')
    expect(result.isDelivered.value).toBe(true)
    expect(result.isError.value).toBe(false)
  })

  it('pauses while the id is undefined', async () => {
    const { result } = await mountWithConvex(client, () => useEmailStatus(undefined, { api: emailApi }))
    expect(result.data.value).toBeUndefined()
    expect(result.isLoading.value).toBe(false)
  })

  it('degrades gracefully when getEmailStatus is not configured', async () => {
    const { result } = await mountWithConvex(client, () => useEmailStatus(undefined, { api: {} as EmailApi }))
    expect(result.data.value).toBeUndefined()
    expect(result.status.value).toBeUndefined()
    expect(result.isLoading.value).toBe(false)
    expect(result.isDelivered.value).toBe(false)
    expect(result.isError.value).toBe(false)
  })
})

describe('useSearch', () => {
  it('returns matches for a non-empty term', async () => {
    seed(store => store.setQuery(searchRef, { query: 'hello' }, [{ _id: '1', text: 'hello world' }]))
    const { result } = await mountWithConvex(client, () => useSearch(searchRef, ref('hello')))
    expect(result.results.value).toStrictEqual([{ _id: '1', text: 'hello world' }])
    expect(result.isLoading.value).toBe(false)
  })

  it('skips the query (empty results) for a blank term', async () => {
    const { result } = await mountWithConvex(client, () => useSearch(searchRef, ref('')))
    expect(result.results.value).toStrictEqual([])
    expect(result.isLoading.value).toBe(false)
  })

  it('merges extra args alongside the query term', async () => {
    seed(store => store.setQuery(searchRef, { limit: 5, query: 'hello' }, [{ _id: '1', text: 'hi' }]))
    const { result } = await mountWithConvex(
      client,
      () => useSearch(searchRef, ref('hello'), { args: { limit: 5 } }),
    )
    expect(result.results.value).toStrictEqual([{ _id: '1', text: 'hi' }])
  })

  it('debounces term changes before querying', async () => {
    const term = ref('')
    const { result } = await mountWithConvex(client, () => useSearch(searchRef, term, { debounce: 200 }))
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
    const { wrapper } = await mountWithConvex(client, () => useSearch(searchRef, term, { debounce: 200 }))
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
    const { result } = await mountWithConvex(client, () => useWorkflowStatus(workflowRef, ref('wf_1')))
    expect(result.value).toStrictEqual({ type: 'completed' })
  })

  it('pauses while the id is null', async () => {
    const { result } = await mountWithConvex(client, () => useWorkflowStatus(workflowRef, ref(null)))
    expect(result.value).toBeUndefined()
  })
})
