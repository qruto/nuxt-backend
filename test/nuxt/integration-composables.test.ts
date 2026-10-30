import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { computed, nextTick, provide, ref } from 'vue'
import { type FunctionReference, makeFunctionReference, getFunctionName } from 'convex/server'
import { ConvexError } from 'convex/values'
import type { OptimisticLocalStore } from 'convex/browser'
import { ConvexVueClient, ConvexAuthStateKey } from 'nuxt-convex-module/client'
import { failClientQuery, mountWithConvex } from '../helpers/vue_test_utils'
import { silentConnectLogger } from '../helpers/silent-logger'
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
import { diagnostics } from '../../src/runtime/vue/utils/live-query'

/** The session the provider history is read as: its account and its active workspace. */
const reader = vi.hoisted(() => ({ workspace: undefined as unknown as { value: string } }))
vi.mock('nuxt-convex-module/better-auth/client', async () => {
  const { computed, ref } = await import('vue')
  reader.workspace = ref('w1')
  return { useBetterAuth: () => ({ session: computed(() => ({ data: { user: { id: 'u_me' }, session: { activeOrganizationId: reader.workspace.value } } })) }) }
})

const address = 'https://127.0.0.1:3001'
const seedMutationRef = makeFunctionReference<'mutation'>('seed:default')
const searchRef = makeFunctionReference<'query'>('search:searchMessages')
const subscriptionRef = makeFunctionReference<'query'>('billing:getCurrentSubscription')
const featuresRef = makeFunctionReference<'query'>('billing:getFeatures')
const creditsRef = makeFunctionReference<'query'>('billing:getCredits')
const emailStatusRef = makeFunctionReference<'query'>('email:getEmailStatus')
const sandboxInboxRef = makeFunctionReference<'action'>('email:getSandboxInbox')
const workflowRef = makeFunctionReference<'query'>('workflows:status')
const productsRef = makeFunctionReference<'query'>('billing:getConfiguredProducts')
const subscriptionsRef = makeFunctionReference<'query'>('billing:listAllSubscriptions')
const checkoutRef = makeFunctionReference<'action'>('billing:generateCheckoutLink')
const portalRef = makeFunctionReference<'action'>('billing:generateCustomerPortalUrl')
const syncRef = makeFunctionReference<'action'>('billing:syncEntitlements')
const giftCheckoutRef = makeFunctionReference<'action'>('billing:giftCheckout')
const receivedGiftsRef = makeFunctionReference<'query'>('billing:getReceivedGifts')
const claimGiftRef = makeFunctionReference<'action'>('billing:claimGift')
const sentGiftsRef = makeFunctionReference<'query'>('billing:getSentGifts')
const updateSubscriptionRef = makeFunctionReference<'action'>('billing:updateSubscription')
const cancelSubscriptionRef = makeFunctionReference<'action'>('billing:cancelSubscription')
const uncancelSubscriptionRef = makeFunctionReference<'action'>('billing:uncancelSubscription')
const cancelPendingChangeRef = makeFunctionReference<'action'>('billing:cancelPendingChange')
const pauseSubscriptionRef = makeFunctionReference<'action'>('billing:pauseSubscription')
const resumeSubscriptionRef = makeFunctionReference<'action'>('billing:resumeSubscription')
const ordersRef = makeFunctionReference<'action'>('billing:getOrders')
const invoiceRef = makeFunctionReference<'action'>('billing:getInvoiceUrl')
const usageRef = makeFunctionReference<'action'>('billing:getUsageHistory')
const accessRef = makeFunctionReference<'query'>('billing:getBillingAccess')

let client: ConvexVueClient

/** Auth state for a composable, signed in while `authenticated` is true. */
function authState(authenticated: { value: boolean }) {
  return { isLoading: computed(() => false), isAuthenticated: computed(() => authenticated.value), isRefreshing: computed(() => false) }
}

function seed(setup: (store: OptimisticLocalStore) => void) {
  void client.mutation(seedMutationRef, {}, { optimisticUpdate: setup })
}

/** Make reads of `query` fail with `error` on this test's client (see {@link failClientQuery}). */
function failQuery(query: FunctionReference<'query'>, error: Error, when?: (args: Record<string, unknown>) => boolean) {
  return failClientQuery(client, query, error, when)
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

describe('useBilling', () => {
  const billingApi = { getCurrentSubscription: subscriptionRef } as unknown as BillingApi

  it('exposes the current subscription reactively', async () => {
    seed(store => store.setQuery(subscriptionRef, {}, { status: 'active' }))
    const { result } = await mountWithConvex(client, () => useBilling({ api: billingApi }))
    expect(result.subscription.value).toStrictEqual({ status: 'active' })
    expect(result.isSubscribed.value).toBe(true)
  })

  it('says whether the caller manages the billing, as the server decides it', async () => {
    const api = { getCurrentSubscription: subscriptionRef, getBillingAccess: accessRef } as unknown as BillingApi
    const mount = () => mountWithConvex(client, () => useBilling({ api }))

    // Not known yet: nothing is hidden, and the server still decides.
    expect((await mount()).result.canManage.value).toBe(true)
    for (const [access, manages] of [[{ canManage: true }, true], [{ canManage: false }, false], [null, false]] as const) {
      seed(store => store.setQuery(accessRef, {}, access))
      expect((await mount()).result.canManage.value, JSON.stringify(access)).toBe(manages)
    }
  })

  it('hides what a failed access read cannot vouch for', async () => {
    const api = { getCurrentSubscription: subscriptionRef, getBillingAccess: accessRef } as unknown as BillingApi
    failQuery(accessRef, new ConvexError({ code: 'unavailable', service: 'billing', reason: 'provider_refused' }))
    const { result } = await mountWithConvex(client, () => useBilling({ api }))
    await vi.waitFor(() => expect(result.canManage.value).toBe(false))
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

  it('offers no products, rather than loading forever, on a backend without the products query, and says so in development', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    diagnostics.enabled = true
    try {
      const { result } = await mountWithConvex(client, () => useBilling({ api: billingApi }))
      expect(result.products.value).toStrictEqual({})
      expect(result.productsError.value).toBeNull()
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('getConfiguredProducts'))
    }
    finally {
      diagnostics.enabled = false
      warn.mockRestore()
    }
  })

  it('holds a failed products read in productsError, apart from the subscription', async () => {
    const api = { getConfiguredProducts: productsRef, getCurrentSubscription: subscriptionRef } as unknown as BillingApi
    failQuery(productsRef, new ConvexError({ code: 'unavailable', service: 'billing', reason: 'provider_refused' }))
    const { result } = await mountWithConvex(client, () => useBilling({ api }))
    await vi.waitFor(() => expect(result.productsError.value).toMatchObject({ code: 'unavailable' }))
    expect(result.products.value).toBeUndefined()
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

  it('reads the free plan as a subscription that is still free, and names each plan by its key', async () => {
    const api = { getCurrentSubscription: subscriptionRef } as unknown as BillingApi
    seed(store => store.setQuery(subscriptionRef, {}, { id: 's1', status: 'active', productId: 'p_free', productKey: 'free', free: true }))
    const { result } = await mountWithConvex(client, () => useBilling({ api }))
    expect(result.subscription.value).toMatchObject({ id: 's1', free: true })
    expect(result.plan.value).toBe('free')
    expect(result.isFree.value).toBe(true)
    expect(result.isSubscribed.value).toBe(false)
    // A yearly price reads as its plan's key.
    seed(store => store.setQuery(subscriptionRef, {}, { id: 's1', status: 'active', productId: 'p_pro_year', productKey: 'pro:year' }))
    const yearly = await mountWithConvex(client, () => useBilling({ api }))
    expect(yearly.result.plan.value).toBe('pro')
    expect(yearly.result.isSubscribed.value).toBe(true)
    expect(yearly.result.isFree.value).toBe(false)
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
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(window)
    const { result } = await mountWithConvex(client, () => useBilling({ api }))

    const url = await result.checkout('prod_1', { metadata: { plan: 'pro' }, discountCode: 'LAUNCH', utm: { source: 'newsletter' } })

    expect(url).toBe('https://polar.test/checkout')
    expect(actionSpy).toHaveBeenCalledWith(
      checkoutRef,
      expect.objectContaining({ productIds: ['prod_1'], metadata: { plan: 'pro' }, discountCode: 'LAUNCH', utm: { source: 'newsletter' } }),
    )
    // The trial and a discount by id are the server's: never sent.
    const sent = actionSpy.mock.calls[0]![1] as Record<string, unknown>
    for (const field of ['trialInterval', 'trialIntervalCount', 'discountId']) expect(sent).not.toHaveProperty(field)
    expect(openSpy).toHaveBeenCalledWith('https://polar.test/checkout', '_blank')
  })

  // Code written for an earlier release, or plain JavaScript, may still send
  // a trial or a discount id: passed on, the server refuses it by name.
  it('checkout passes a trial or discount id on, for the server to refuse', async () => {
    const api = { generateCheckoutLink: checkoutRef } as unknown as BillingApi
    const actionSpy = vi.spyOn(client, 'action').mockResolvedValue({ url: 'https://polar.test/checkout' })
    vi.spyOn(window, 'open').mockReturnValue(window)
    const { result } = await mountWithConvex(client, () => useBilling({ api }))

    await result.checkout('prod_1', { trialInterval: 'day', trialIntervalCount: 7, discountId: 'disc_1' } as never)

    expect(actionSpy).toHaveBeenCalledWith(checkoutRef, expect.objectContaining({ trialInterval: 'day', trialIntervalCount: 7, discountId: 'disc_1' }))
  })

  it('checkout redirects in the same tab when redirect is set', async () => {
    const api = { generateCheckoutLink: checkoutRef } as unknown as BillingApi
    vi.spyOn(client, 'action').mockResolvedValue({ url: 'https://polar.test/c' })
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(window)
    const { result } = await mountWithConvex(client, () => useBilling({ api }))

    const url = await result.checkout(['prod_1', 'prod_2'], { redirect: true })

    expect(url).toBe('https://polar.test/c')
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('portal opens the returned URL with the return URL it was given', async () => {
    const api = { generateCustomerPortalUrl: portalRef } as unknown as BillingApi
    const actionSpy = vi.spyOn(client, 'action').mockResolvedValue({ url: 'https://polar.test/portal' })
    vi.spyOn(window, 'open').mockReturnValue(window)
    const { result } = await mountWithConvex(client, () => useBilling({ api }))

    expect(await result.portal({ returnUrl: 'https://app.test/billing' })).toBe('https://polar.test/portal')
    expect(actionSpy).toHaveBeenCalledWith(portalRef, { returnUrl: 'https://app.test/billing' })
  })

  it('throws a helpful error when actions are not configured', async () => {
    const { result } = await mountWithConvex(client, () => useBilling({ api: {} as BillingApi }))
    await expect(result.checkout('p')).rejects.toThrow(/Billing checkout is unavailable/)
    await expect(result.portal()).rejects.toThrow(/Billing portal is unavailable/)
    await expect(result.changePlan('p')).rejects.toThrow(/Billing changePlan is unavailable/)
    await expect(result.cancel()).rejects.toThrow(/Billing cancel is unavailable/)
    // The setup error is the package's own, so `error` keeps its sentence.
    expect(result.error.value).toMatchObject({ code: 'unavailable', message: expect.stringMatching(/Billing cancel is unavailable/) })
  })

  it('puts a failed subscription read in error, and stops loading', async () => {
    failQuery(subscriptionRef, new ConvexError({ code: 'unauthenticated' }))
    const { result } = await mountWithConvex(client, () => useBilling({ api: billingApi }))
    expect(result.error.value).toMatchObject({ code: 'unauthenticated' })
    expect(result.isLoading.value).toBe(false)
    expect(result.subscription.value).toBeUndefined()
    expect(result.isFree.value).toBe(false)
  })

  it('reports a failed products read too', async () => {
    failQuery(productsRef, new Error('[CONVEX Q(billing:getConfiguredProducts)] Server Error'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const api = { getConfiguredProducts: productsRef, getCurrentSubscription: subscriptionRef } as unknown as BillingApi
    seed(store => store.setQuery(subscriptionRef, {}, null))
    const { result } = await mountWithConvex(client, () => useBilling({ api }))
    expect(result.isFree.value).toBe(true)
    expect(result.error.value).toMatchObject({ code: 'unavailable', data: { reason: 'unexpected' } })
  })

  it('counts an action toward isPending, and rejects with the original error, which error holds over a failed read', async () => {
    failQuery(subscriptionRef, new ConvexError({ code: 'unauthenticated' }))
    const api = { getCurrentSubscription: subscriptionRef, generateCustomerPortalUrl: portalRef } as unknown as BillingApi
    let settle!: (value: { url: string }) => void
    const actionSpy = vi.spyOn(client, 'action').mockImplementationOnce(() => new Promise((resolve) => {
      settle = resolve as never
    }))
    vi.spyOn(window, 'open').mockReturnValue(window)
    const { result } = await mountWithConvex(client, () => useBilling({ api }))

    expect(result.isPending.value).toBe(false)
    const opening = result.portal()
    expect(result.isPending.value).toBe(true)
    settle({ url: 'https://billing.test/portal' })
    await opening
    expect(result.isPending.value).toBe(false)

    const refusal = new ConvexError({ code: 'rate_limited', limit: 'billing', retryAfter: 1000 })
    actionSpy.mockRejectedValueOnce(refusal)
    await expect(result.portal()).rejects.toBe(refusal)
    expect(result.isPending.value).toBe(false)
    expect(result.error.value).toMatchObject({ code: 'rate_limited', data: { retryAfter: 1000 } })

    // The next action clears its own failure; the read's shows again.
    actionSpy.mockResolvedValueOnce({ url: 'https://billing.test/portal' })
    await result.portal()
    expect(result.error.value).toMatchObject({ code: 'unauthenticated' })
  })

  it('counts overlapping actions: pending until the last one settles', async () => {
    const api = { generateCustomerPortalUrl: portalRef } as unknown as BillingApi
    const settles: Array<(value: { url: string }) => void> = []
    vi.spyOn(client, 'action').mockImplementation(() => new Promise((resolve) => {
      settles.push(resolve as never)
    }))
    vi.spyOn(window, 'open').mockReturnValue(window)
    const { result } = await mountWithConvex(client, () => useBilling({ api }))

    const first = result.portal()
    const second = result.portal()
    settles[0]!({ url: 'https://billing.test/1' })
    await first
    expect(result.isPending.value).toBe(true)
    settles[1]!({ url: 'https://billing.test/2' })
    await second
    expect(result.isPending.value).toBe(false)
  })

  it('reads a failed subscription list as unknown, not as the free plan, when it derives the current one', async () => {
    const api = { listAllSubscriptions: subscriptionsRef } as unknown as BillingApi
    failQuery(subscriptionsRef, new ConvexError({ code: 'no_workspace' }))
    const { result } = await mountWithConvex(client, () => useBilling({ api }))
    expect(result.subscription.value).toBeUndefined()
    expect(result.isFree.value).toBe(false)
    expect(result.isLoading.value).toBe(false)
    expect(result.error.value).toMatchObject({ code: 'no_workspace' })
  })

  it('drops an action failure once the user signs out', async () => {
    const authenticated = ref(true)
    const api = { generateCustomerPortalUrl: portalRef } as unknown as BillingApi
    vi.spyOn(client, 'action').mockRejectedValueOnce(new ConvexError({ code: 'forbidden', reason: 'not_billing_manager' }))
    const { result } = await mountWithConvex(client, () => useBilling({ api }), { provide: () => provide(ConvexAuthStateKey, authState(authenticated)) })
    await expect(result.portal()).rejects.toBeTruthy()
    expect(result.error.value).toMatchObject({ code: 'forbidden' })
    authenticated.value = false
    await nextTick()
    expect(result.error.value).toBeNull()
  })

  it('a lifecycle change that fails rejects and lands in error', async () => {
    const api = { updateSubscription: updateSubscriptionRef } as unknown as BillingApi
    const refusal = new ConvexError({ code: 'invalid_input', field: 'productId' })
    vi.spyOn(client, 'action').mockRejectedValueOnce(refusal)
    const { result } = await mountWithConvex(client, () => useBilling({ api }))
    await expect(result.changePlan('prod_max')).rejects.toBe(refusal)
    expect(result.error.value).toMatchObject({ code: 'invalid_input', data: { field: 'productId' } })
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
    cancelPendingChange: cancelPendingChangeRef,
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
      resumesAt: null,
      pendingChange: { productId: 'prod_max', appliesAt: '2099-02-01T00:00:00.000Z' },
    }))
    const { result } = await mountWithConvex(client, () => useBilling({ api: lifecycleApi }), { provide: authedProvide })

    expect(result.status.value).toBe('trialing')
    expect(result.cancelAtPeriodEnd.value).toBe(true)
    expect(result.isTrialing.value).toBe(true)
    expect(result.trialEnd.value?.toISOString()).toBe('2099-01-08T00:00:00.000Z')
    expect(result.resumesAt.value).toBeNull()
    expect(result.isPaused.value).toBe(false)
    expect(result.pendingChange.value).toStrictEqual({
      productId: 'prod_max',
      appliesAt: new Date('2099-02-01T00:00:00.000Z'),
    })
  })

  it('reads no pending change from a row without a product or a date', async () => {
    seed(store => store.setQuery(subscriptionRef, {}, {
      id: 'sub_1', status: 'active', productId: 'prod_pro',
      pendingChange: { productId: 'prod_max', appliesAt: null },
    }))
    const { result } = await mountWithConvex(client, () => useBilling({ api: lifecycleApi }), { provide: authedProvide })
    expect(result.status.value).toBe('active')
    expect(result.pendingChange.value).toBeNull()
  })

  it('reads paused state and reports the free plan as no status', async () => {
    seed(store => store.setQuery(subscriptionRef, {}, {
      id: 'sub_1', status: 'paused', productId: 'prod_pro', cancelAtPeriodEnd: false,
      resumesAt: '2026-09-01T00:00:00.000Z',
    }))
    const { result } = await mountWithConvex(client, () => useBilling({ api: lifecycleApi }), { provide: authedProvide })
    expect(result.isPaused.value).toBe(true)
    expect(result.isPastDue.value).toBe(false)
    expect(result.resumesAt.value?.toISOString()).toBe('2026-09-01T00:00:00.000Z')
    expect(result).not.toHaveProperty('pausedAt')

    seed(store => store.setQuery(subscriptionRef, {}, null))
    const free = await mountWithConvex(client, () => useBilling({ api: lifecycleApi }), { provide: authedProvide })
    expect(free.result.status.value).toBeNull()
    expect(free.result.cancelAtPeriodEnd.value).toBe(false)
    expect(free.result.pendingChange.value).toBeNull()
  })

  it('reads a failed payment as past due, still on the plan', async () => {
    seed(store => store.setQuery(subscriptionRef, {}, { id: 'sub_1', status: 'past_due', productId: 'prod_pro' }))
    const { result } = await mountWithConvex(client, () => useBilling({ api: lifecycleApi }), { provide: authedProvide })
    expect(result.isPastDue.value).toBe(true)
    expect(result.isSubscribed.value).toBe(true)
    expect(result.isFinishingCheckout.value).toBe(false)
  })

  it('drives changePlan, cancel, uncancel, pause and resume', async () => {
    const actionSpy = vi.spyOn(client, 'action').mockResolvedValue(null)
    const { result } = await mountWithConvex(client, () => useBilling({ api: lifecycleApi }), { provide: authedProvide })

    await result.changePlan('prod_max', { proration: 'prorate' })
    await result.cancel({ reason: 'too_expensive', comment: 'Out of budget' })
    await result.cancel({ atPeriodEnd: false })
    await result.uncancel()
    await result.cancelPendingChange()
    await result.pause({ resumesAt: new Date('2099-03-01T00:00:00.000Z') })
    await result.resume()

    expect(actionSpy).toHaveBeenCalledWith(updateSubscriptionRef, { subscriptionId: undefined, productId: 'prod_max', proration: 'prorate' })
    // Cancelling keeps the paid period by default.
    expect(actionSpy).toHaveBeenCalledWith(cancelSubscriptionRef, { subscriptionId: undefined, atPeriodEnd: true, reason: 'too_expensive', comment: 'Out of budget' })
    expect(actionSpy).toHaveBeenCalledWith(cancelSubscriptionRef, { subscriptionId: undefined, atPeriodEnd: false, reason: undefined, comment: undefined })
    expect(actionSpy).toHaveBeenCalledWith(uncancelSubscriptionRef, { subscriptionId: undefined })
    expect(actionSpy).toHaveBeenCalledWith(cancelPendingChangeRef, { subscriptionId: undefined })
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
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(window)
    const { result } = await mountWithConvex(client, () => useOrders({ api: ordersApi }), { provide: authedProvide })

    expect(await result.invoice('ord_1')).toBe('https://billing.test/invoice.pdf')
    expect(openSpy).toHaveBeenCalledWith('https://billing.test/invoice.pdf', '_blank')
  })

  it('reports a failed load instead of rejecting', async () => {
    vi.spyOn(client, 'action').mockRejectedValue(new Error('Provider unreachable'))
    const { result } = await mountWithConvex(client, () => useOrders({ api: ordersApi }), { provide: authedProvide })
    await flushPromises()
    expect(result.error.value).toEqual({ code: 'unavailable', data: { service: 'backend', reason: 'unexpected' }, message: 'Something went wrong.' })
    expect(result.orders.value).toStrictEqual([])
    expect(result.isLoading.value).toBe(false)
  })

  it('clears another workspace\'s orders at once and reads the new one\'s from the first page', async () => {
    const answers: Array<(value: unknown) => void> = []
    const actionSpy = vi.spyOn(client, 'action').mockImplementation((() => new Promise(resolve => answers.push(resolve))) as never)
    const { result } = await mountWithConvex(client, () => useOrders({ api: ordersApi }), { provide: authedProvide })
    await flushPromises()
    answers[0]!(page)
    await flushPromises()
    expect(result.orders.value).toHaveLength(1)

    // The person switches workspaces: the billing entity is another one.
    reader.workspace.value = 'w2'
    await nextTick()
    await flushPromises()
    expect(result.orders.value).toBeUndefined()
    expect(result.isLoading.value).toBe(true)
    expect(actionSpy).toHaveBeenCalledTimes(2)
    answers[1]!({ items: [] })
    await flushPromises()
    expect(result.orders.value).toStrictEqual([])
    reader.workspace.value = 'w1'
  })

  it('a failed invoice rejects with the original error and lands in error, over the page', async () => {
    const refusal = new ConvexError({ code: 'forbidden', reason: 'not_owner' })
    vi.spyOn(client, 'action').mockImplementation(async (...args: unknown[]) => {
      if (args[0] === invoiceRef) throw refusal
      return page as never
    })
    const { result } = await mountWithConvex(client, () => useOrders({ api: ordersApi }), { provide: authedProvide })
    await flushPromises()
    const opening = result.invoice('ord_1')
    expect(result.isPending.value).toBe(true)
    await expect(opening).rejects.toBe(refusal)
    expect(result.isPending.value).toBe(false)
    expect(result.error.value).toMatchObject({ code: 'forbidden', data: { reason: 'not_owner' } })
    expect(result.orders.value).toHaveLength(1)
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
    await expect(unconfigured.result.invoice('ord_1')).rejects.toThrow(/Billing invoice is unavailable/)
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

  // A `next()` still on its way when the meter changes, answering last: the
  // older answer must not put the previous meter's page 2 under the new one.
  it('keeps the latest load\'s answer when an older one comes back after it', async () => {
    const answers = new Map<string, (value: unknown) => void>()
    const event = (id: string, name: string) => ({ id, timestamp: '2026-08-01T00:00:00.000Z', name, units: 1 })
    const meter = ref('credits')
    vi.spyOn(client, 'action').mockImplementation(((_ref: unknown, args: { meter: string, page: number }) => {
      if (args.meter === 'credits' && args.page === 1) return Promise.resolve({ items: [event('c1', 'credits')], pagination: { totalCount: 2, maxPage: 2 } })
      return new Promise(resolve => answers.set(`${args.meter}:${args.page}`, resolve))
    }) as never)
    const { result } = await mountWithConvex(client, () => useUsage({ api: usageApi, meter }), { provide: authedProvide })
    await flushPromises()
    expect(result.events.value?.map(entry => entry.id)).toEqual(['c1'])

    const paging = result.next()
    meter.value = 'seats'
    await nextTick()
    await flushPromises()
    answers.get('seats:1')!({ items: [event('s1', 'seats')], pagination: { totalCount: 1, maxPage: 1 } })
    await flushPromises()
    expect(result.events.value?.map(entry => entry.id)).toEqual(['s1'])
    expect(result.isLoading.value).toBe(false)

    answers.get('credits:2')!({ items: [event('c2', 'credits')], pagination: { totalCount: 2, maxPage: 2 } })
    await paging
    expect(result.events.value?.map(entry => entry.id)).toEqual(['s1'])
    expect(result.page.value).toBe(1)
    expect(result.pageCount.value).toBe(1)
  })

  it('ends the loading state with the latest load, not the first to finish', async () => {
    const answers: Array<(value: unknown) => void> = []
    const meter = ref('credits')
    vi.spyOn(client, 'action').mockImplementation((() => new Promise(resolve => answers.push(resolve))) as never)
    const { result } = await mountWithConvex(client, () => useUsage({ api: usageApi, meter }), { provide: authedProvide })
    await flushPromises()
    meter.value = 'seats'
    await nextTick()
    await flushPromises()
    expect(answers).toHaveLength(2)
    answers[0]!({ items: [] })
    await flushPromises()
    expect(result.isLoading.value).toBe(true)
    answers[1]!({ items: [] })
    await flushPromises()
    expect(result.isLoading.value).toBe(false)
  })

  it('reports a refused load by its code instead of rejecting', async () => {
    vi.spyOn(client, 'action').mockRejectedValue(new ConvexError({ code: 'forbidden', reason: 'not_member' }))
    const { result } = await mountWithConvex(client, () => useUsage({ api: usageApi }), { provide: authedProvide })
    await flushPromises()
    expect(result.error.value).toMatchObject({ code: 'forbidden', data: { reason: 'not_member' } })
    expect(result.events.value).toStrictEqual([])
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
  const paidGift = { id: 'gift-1', purchaserName: 'Buyer', pack: 'credits100', productIds: ['p1'], status: 'paid', createdAt: 1 }

  it('lists received gifts and filters the unclaimed ones', async () => {
    seed(store => store.setQuery(receivedGiftsRef, {}, [paidGift, { ...paidGift, id: 'gift-2', status: 'claimed' }]))
    const { result } = await mountWithConvex(
      client,
      () => useGifts({ api: giftsApi }),
      { provide: authedProvide },
    )
    expect(result.received.value).toHaveLength(2)
    expect(result.unclaimed.value).toHaveLength(1)
    expect(result.unclaimed.value[0]?.id).toBe('gift-1')
  })

  it('is empty without querying when signed out', async () => {
    const { result } = await mountWithConvex(client, () => useGifts({ api: giftsApi }))
    expect(result.received.value).toStrictEqual([])
    expect(result.isLoading.value).toBe(false)
  })

  it('never claims a gift its recipient did not ask for', async () => {
    const actionSpy = vi.spyOn(client, 'action').mockResolvedValue({ url: null })
    seed(store => store.setQuery(receivedGiftsRef, {}, [paidGift]))
    await mountWithConvex(
      client,
      () => useGifts({ api: giftsApi }),
      { provide: authedProvide },
    )
    await nextTick()
    await nextTick()
    expect(actionSpy).not.toHaveBeenCalled()
  })

  it('claim(giftId) claims one gift, returning to this page; true when the server confirmed it', async () => {
    const actionSpy = vi.spyOn(client, 'action').mockResolvedValue({ url: null })
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(window)
    const { result } = await mountWithConvex(
      client,
      () => useGifts({ api: giftsApi }),
      { provide: authedProvide },
    )
    expect(await result.claim('gift-1')).toBe(true)
    expect(actionSpy).toHaveBeenCalledWith(claimGiftRef, { giftId: 'gift-1', successUrl: window.location.href })
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('claim(giftId) opens the provider\'s $0 checkout when the pack needs one, and resolves false', async () => {
    vi.spyOn(client, 'action').mockResolvedValue({ url: 'https://checkout.test/claim' })
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(window)
    const { result } = await mountWithConvex(
      client,
      () => useGifts({ api: giftsApi }),
      { provide: authedProvide },
    )
    expect(await result.claim('gift-1')).toBe(false)
    expect(openSpy).toHaveBeenCalledWith('https://checkout.test/claim', '_blank')
  })

  it('counts a claim toward isPending; a failed one rejects and lands in error', async () => {
    let settle!: (value: { url: null }) => void
    const actionSpy = vi.spyOn(client, 'action').mockImplementationOnce(() => new Promise((resolve) => {
      settle = resolve as never
    }))
    const { result } = await mountWithConvex(client, () => useGifts({ api: giftsApi }), { provide: authedProvide })
    const claiming = result.claim('gift-1')
    expect(result.isPending.value).toBe(true)
    settle({ url: null })
    expect(await claiming).toBe(true)
    expect(result.isPending.value).toBe(false)
    expect(result).not.toHaveProperty('isClaiming')

    const refusal = new ConvexError({ code: 'forbidden', reason: 'not_recipient' })
    actionSpy.mockRejectedValueOnce(refusal)
    await expect(result.claim('gift-2')).rejects.toBe(refusal)
    expect(result.error.value).toMatchObject({ code: 'forbidden', data: { reason: 'not_recipient' } })
  })

  it('puts a failed list read in error, and stops loading', async () => {
    failQuery(receivedGiftsRef, new ConvexError({ code: 'unauthenticated' }))
    const { result } = await mountWithConvex(client, () => useGifts({ api: giftsApi }), { provide: authedProvide })
    expect(result.error.value).toMatchObject({ code: 'unauthenticated' })
    expect(result.isLoading.value).toBe(false)
    expect(result.unclaimed.value).toStrictEqual([])
  })

  it('send opens the purchaser\'s checkout of a pack by its catalog key, or of a plan pass by its key and months', async () => {
    const api = { giftCheckout: giftCheckoutRef } as unknown as BillingApi
    const actionSpy = vi.spyOn(client, 'action').mockResolvedValue({ url: 'https://checkout.test/gift' })
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(window)
    const { result } = await mountWithConvex(client, () => useGifts({ api }))

    const url = await result.send('credits100', { recipientEmail: 'friend@example.com', message: 'hi' })

    expect(url).toBe('https://checkout.test/gift')
    // By catalog key: the server resolves the pack and refuses anything else.
    expect(actionSpy).toHaveBeenCalledWith(
      giftCheckoutRef,
      expect.objectContaining({ pack: 'credits100', recipientEmail: 'friend@example.com', message: 'hi' }),
    )
    expect(openSpy).toHaveBeenCalledWith('https://checkout.test/gift', '_blank')

    // A plan with its months is a pass; a date is sent as a time.
    await result.send('pro', { recipientEmail: 'friend@example.com', months: 3, deliverAt: new Date('2027-03-14T09:00:00Z') })
    expect(actionSpy).toHaveBeenLastCalledWith(
      giftCheckoutRef,
      expect.objectContaining({ plan: 'pro', months: 3, deliverAt: Date.UTC(2027, 2, 14, 9) }),
    )
    expect(actionSpy.mock.calls.at(-1)![1]).not.toHaveProperty('pack')
  })

  it('lists the gifts sent, and resends, readdresses, redates and cancels them by id', async () => {
    const api = {
      getSentGifts: sentGiftsRef,
      resendGift: makeFunctionReference<'action'>('billing:resendGift'),
      changeGiftRecipient: makeFunctionReference<'action'>('billing:changeGiftRecipient'),
      rescheduleGift: makeFunctionReference<'action'>('billing:rescheduleGift'),
      cancelGift: makeFunctionReference<'action'>('billing:cancelGift'),
    } as unknown as BillingApi
    const sentGift = { id: 'gift-9', item: 'credits100', recipientEmail: 'friend@example.com', status: 'scheduled', createdAt: 1 }
    seed(store => store.setQuery(sentGiftsRef, {}, [sentGift]))
    const actionSpy = vi.spyOn(client, 'action').mockResolvedValue(null)
    const { result } = await mountWithConvex(client, () => useGifts({ api }), { provide: authedProvide })
    expect(result.sent.value).toEqual([sentGift])

    await result.resend('gift-9')
    await result.changeRecipient('gift-9', 'other@example.com')
    await result.reschedule('gift-9', new Date('2027-05-01T00:00:00Z'))
    await result.cancel('gift-9')
    expect(actionSpy.mock.calls.map(call => [getFunctionName(call[0] as never), call[1]])).toEqual([
      ['billing:resendGift', { giftId: 'gift-9' }],
      ['billing:changeGiftRecipient', { giftId: 'gift-9', recipientEmail: 'other@example.com' }],
      ['billing:rescheduleGift', { giftId: 'gift-9', deliverAt: Date.UTC(2027, 4, 1) }],
      ['billing:cancelGift', { giftId: 'gift-9' }],
    ])

    // A cancel without a recent sign-in rejects with that refusal, which error holds.
    const refusal = new ConvexError({ code: 'reauthentication_required' })
    actionSpy.mockRejectedValueOnce(refusal)
    await expect(result.cancel('gift-9')).rejects.toBe(refusal)
    expect(result.error.value).toMatchObject({ code: 'reauthentication_required' })
  })

  it('claims into the workspace it is told, and into none by default', async () => {
    const actionSpy = vi.spyOn(client, 'action').mockResolvedValue({ url: null })
    const { result } = await mountWithConvex(client, () => useGifts({ api: giftsApi }), { provide: authedProvide })
    await result.claim('gift-1', { workspaceId: 'org-team' })
    expect(actionSpy).toHaveBeenLastCalledWith(claimGiftRef, { giftId: 'gift-1', successUrl: window.location.href, workspaceId: 'org-team' })
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
    expect(result.has('premium')).toBe(true) // its catalog key, in the benefit's metadata
    expect(result.has('ben_456')).toBe(true) // the benefit id of a benefit with no key
    // One name per benefit, as the server matches: never a keyed benefit's id, a grant id or a type.
    expect(result.has('ben_123')).toBe(false)
    expect(result.has('g2')).toBe(false)
    expect(result.has('license_keys')).toBe(false)
    expect(result.has('missing')).toBe(false)
    expect(result.hasPlan('prod_pro')).toBe(true)
    expect(result.hasPlan('prod_other')).toBe(false)
  })

  it('reads each quota\'s limit and use, and how many more fit: unlimited without end, and none for a quota no grant names', async () => {
    seed(store => store.setQuery(featuresRef, {}, { ...features, quotas: { projects: { limit: 10, used: 7 }, exports: { limit: 'unlimited', used: 40 }, sites: { limit: 2, used: 5 } } }))
    const { result } = await mountWithConvex(client, () => useFeatures({ api: billingApi }))
    expect(result.quota('projects')).toEqual({ limit: 10, used: 7 })
    expect(result.remaining('projects')).toBe(3)
    expect(result.remaining('exports')).toBe(Number.POSITIVE_INFINITY)
    // Held past a lower limit (a downgrade): nothing more fits, never a negative.
    expect(result.remaining('sites')).toBe(0)
    expect(result.quota('boards')).toEqual({ limit: 0, used: 0 })
    expect(result.remaining('boards')).toBe(0)
    // Its own entries only: a name an object has built in is no quota, and allows none.
    for (const key of ['constructor', 'toString', '__proto__']) {
      expect(result.quota(key), key).toEqual({ limit: 0, used: 0 })
      expect(result.remaining(key), key).toBe(0)
    }
  })

  it('reads no quota as allowing none: signed out, and from a backend older than plan quotas', async () => {
    seed(store => store.setQuery(featuresRef, {}, null))
    const signedOut = await mountWithConvex(client, () => useFeatures({ api: billingApi }))
    expect(signedOut.result.quotas.value).toEqual({})
    expect(signedOut.result.remaining('projects')).toBe(0)
    seed(store => store.setQuery(featuresRef, {}, features))
    const older = await mountWithConvex(client, () => useFeatures({ api: billingApi }))
    expect(older.result.quota('projects')).toEqual({ limit: 0, used: 0 })
  })

  it('puts a failed read in error and gates closed', async () => {
    failQuery(featuresRef, new ConvexError({ code: 'no_workspace' }))
    const { result } = await mountWithConvex(client, () => useFeatures({ api: billingApi }))
    expect(result.error.value).toMatchObject({ code: 'no_workspace' })
    expect(result.isLoading.value).toBe(false)
    expect(result.has('premium')).toBe(false)
    expect(result.hasPlan('prod_pro')).toBe(false)
    expect(result.quota('projects')).toBeUndefined()
    expect(result.remaining('projects')).toBe(0)
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
    const { result } = await mountWithConvex(client, () => useCredits({ meter: 'm1', api: billingApi }))
    expect(result.balance.value).toBe(9)
    expect(result.consumed.value).toBe(1)
    expect(result.meterId.value).toBe('m1')
  })

  it('defaults to the user\'s primary meter', async () => {
    seed(store => store.setQuery(creditsRef, {}, credits))
    const { result } = await mountWithConvex(client, () => useCredits({ api: billingApi }))
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
    const { result } = await mountWithConvex(client, () => useCredits({ api: billingApi }))
    expect(result.balance.value).toBe(49)
    expect(result.meterId.value).toBe('m1')
  })

  it('follows a meter given as a getter', async () => {
    seed(store => store.setQuery(creditsRef, {}, {
      meters: [
        { meterId: 'm1', name: 'credits', consumedUnits: 1, creditedUnits: 10, balance: 9 },
        { meterId: 'm2', name: 'tokens', consumedUnits: 0, creditedUnits: 500, balance: 500 },
      ],
    }))
    const meter = ref('credits')
    const { result } = await mountWithConvex(client, () => useCredits({ meter: () => meter.value, api: billingApi }))
    expect(result.balance.value).toBe(9)
    meter.value = 'tokens'
    await nextTick()
    expect(result.balance.value).toBe(500)
    expect(result.meterId.value).toBe('m2')
  })

  it('warns in development when handed the meter bare, the call shape before options', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await mountWithConvex(client, () => useCredits('credits' as never))
    // The old shape with no meter: `useCredits(undefined, { api })`.
    await mountWithConvex(client, () => (useCredits as (...args: unknown[]) => unknown)(undefined, { api: billingApi }))
    expect(warned.mock.calls.filter(([text]) => String(text).includes('useCredits() takes an options object, such as useCredits({ meter: \'credits\' })'))).toHaveLength(2)
  })

  it('reads a null answer, no billing entity yet, as no credits: zero, not loading', async () => {
    seed(store => store.setQuery(creditsRef, {}, null))
    const { result } = await mountWithConvex(client, () => useCredits({ api: billingApi }))
    await nextTick()
    expect(result.isLoading.value).toBe(false)
    expect(result.balance.value).toBe(0)
    expect(result.cycle.value).toBeNull()
    expect(result.expiresAtCycleEnd.value).toBe(false)
  })

  it('reads nothing while signed out, and says there are no credits', async () => {
    const query = vi.spyOn(client, 'watchQuery')
    const { result } = await mountWithConvex(client, () => useCredits({ api: billingApi }), { provide: () => provide(ConvexAuthStateKey, authState(ref(false))) })
    expect(query.mock.calls.some(([ref]) => ref === creditsRef)).toBe(false)
    expect(result.isLoading.value).toBe(false)
    expect(result.balance.value).toBe(0)
  })

  it('puts a failed read in error, and stops loading', async () => {
    failQuery(creditsRef, new ConvexError({ code: 'unauthenticated' }))
    const { result } = await mountWithConvex(client, () => useCredits({ api: billingApi }))
    expect(result.error.value).toMatchObject({ code: 'unauthenticated' })
    expect(result.isLoading.value).toBe(false)
    expect(result.balance.value).toBeUndefined()
  })

  it('counts a top-up toward isPending; a failed one rejects and lands in error', async () => {
    const api = { generateCheckoutLink: checkoutRef } as unknown as BillingApi
    const refusal = new ConvexError({ code: 'invalid_input', field: 'productIds' })
    vi.spyOn(client, 'action').mockRejectedValueOnce(refusal)
    const { result } = await mountWithConvex(client, () => useCredits({ api }))
    const buying = result.topUp('prod_off_catalog')
    expect(result.isPending.value).toBe(true)
    await expect(buying).rejects.toBe(refusal)
    expect(result.isPending.value).toBe(false)
    expect(result.error.value).toMatchObject({ code: 'invalid_input', data: { field: 'productIds' } })
  })

  it('reports a zero balance for an unknown meter id', async () => {
    seed(store => store.setQuery(creditsRef, {}, credits))
    const { result } = await mountWithConvex(client, () => useCredits({ meter: 'missing', api: billingApi }))
    expect(result.balance.value).toBe(0)
    expect(result.consumed.value).toBe(0)
    expect(result.meterId.value).toBeUndefined()
  })

  it('degrades to no balance when getCredits is not configured', async () => {
    const { result } = await mountWithConvex(client, () => useCredits({ api: {} as BillingApi }))
    expect(result.balance.value).toBeUndefined()
    expect(result.isLoading.value).toBe(false)
  })

  it('topUp checks out a credit pack', async () => {
    const api = { generateCheckoutLink: checkoutRef } as unknown as BillingApi
    const actionSpy = vi.spyOn(client, 'action').mockResolvedValue({ url: 'https://polar.test/pack' })
    vi.spyOn(window, 'open').mockReturnValue(window)
    const { result } = await mountWithConvex(client, () => useCredits({ api }))

    const url = await result.topUp('pack_100')
    expect(url).toBe('https://polar.test/pack')
    expect(actionSpy).toHaveBeenCalledWith(checkoutRef, expect.objectContaining({ productIds: ['pack_100'] }))
  })

  it('refresh re-syncs entitlements when configured', async () => {
    const api = { syncEntitlements: syncRef } as unknown as BillingApi
    const actionSpy = vi.spyOn(client, 'action').mockResolvedValue(null)
    const { result } = await mountWithConvex(client, () => useCredits({ api }))

    await result.refresh()
    expect(actionSpy).toHaveBeenCalledWith(syncRef, {})
  })

  it('refresh rejects with the setup sentence when syncEntitlements is not exported', async () => {
    const actionSpy = vi.spyOn(client, 'action')
    const { result } = await mountWithConvex(client, () => useCredits({ api: {} as BillingApi }))
    await expect(result.refresh()).rejects.toThrow(/Billing refresh is unavailable/)
    expect(result.error.value).toMatchObject({ code: 'unavailable', message: expect.stringMatching(/Billing refresh is unavailable/) })
    expect(actionSpy).not.toHaveBeenCalled()
  })

  it('drops an action failure once the user signs out', async () => {
    const authenticated = ref(true)
    const api = { syncEntitlements: syncRef } as unknown as BillingApi
    vi.spyOn(client, 'action').mockRejectedValueOnce(new ConvexError({ code: 'rate_limited', limit: 'billingSync', retryAfter: 1000 }))
    const { result } = await mountWithConvex(client, () => useCredits({ api }), { provide: () => provide(ConvexAuthStateKey, authState(authenticated)) })
    await expect(result.refresh()).rejects.toBeTruthy()
    expect(result.error.value).toMatchObject({ code: 'rate_limited' })
    authenticated.value = false
    await nextTick()
    expect(result.error.value).toBeNull()
  })
})

describe('useSandboxInbox', () => {
  const inboxApi = { getSandboxInbox: sandboxInboxRef } as unknown as SandboxInboxApi
  const address = 'delivered+demo@resend.dev'
  const message = (fields: Record<string, string>) => ({ from: 'onboarding@resend.dev', subject: '', receivedAt: 1, ...fields })
  /** Let the first read, and the state it sets, land. */
  const settle = async () => {
    for (let turn = 0; turn < 4; turn++) await nextTick()
    await Promise.resolve()
    await nextTick()
  }

  it('reads the inbox and the code in the newest message, from the provider through the backend\'s action', async () => {
    const read = vi.spyOn(client, 'action').mockResolvedValue([
      message({ subject: 'Your code', text: 'Your code: 482915' }),
      message({ subject: 'Older', text: 'Your code: 111111' }),
    ])
    const { result } = await mountWithConvex(client, () => useSandboxInbox({ address, api: inboxApi }))
    await settle()
    expect(read).toHaveBeenCalledWith(expect.anything(), { address })
    expect(result.messages.value).toHaveLength(2)
    expect(result.latest.value?.subject).toBe('Your code')
    expect(result.code.value).toBe('482915')
    expect(result.isLoading.value).toBe(false)
    expect(result.error.value).toBeNull()
  })

  it('asks again while the page is open, and finds the code once the mail has been sent', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    try {
      const read = vi.spyOn(client, 'action').mockResolvedValueOnce([]).mockResolvedValue([message({ text: 'Code 482915' })])
      const { result } = await mountWithConvex(client, () => useSandboxInbox({ address, api: inboxApi }))
      await settle()
      expect(result.messages.value).toEqual([])
      expect(result.code.value).toBeUndefined()
      // Not more often than every ten seconds: the provider allows ten requests a second to a whole team.
      await vi.advanceTimersByTimeAsync(9999)
      await settle()
      expect(read).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)
      await settle()
      expect(read).toHaveBeenCalledTimes(2)
      expect(result.code.value).toBe('482915')
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('follows a reactive address, loading until the new inbox lands', async () => {
    const current = ref<string | undefined>()
    let answer: (messages: unknown[]) => void = () => {}
    const waiting = () => new Promise<unknown[]>((resolve) => {
      answer = resolve
    })
    const read = vi.spyOn(client, 'action').mockImplementation(((_ref: unknown, args: { address: string }) => args.address === address ? Promise.resolve([message({ text: 'Code 482915' })]) : waiting()) as never)
    const { result } = await mountWithConvex(client, () => useSandboxInbox({ address: current, api: inboxApi }))
    expect(result.messages.value).toBeUndefined()
    expect(read).not.toHaveBeenCalled()
    current.value = address
    await settle()
    expect(result.code.value).toBe('482915')
    current.value = 'delivered+unread@resend.dev'
    await nextTick()
    expect(result.isLoading.value).toBe(true)
    expect(result.messages.value).toBeUndefined()
    expect(result.code.value).toBeUndefined()
    answer([])
    await settle()
    expect(result.isLoading.value).toBe(false)
    expect(result.messages.value).toEqual([])
  })

  it('warns in development when handed the address bare, the call shape before options', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await mountWithConvex(client, () => useSandboxInbox(ref(address) as never))
    expect(warned).toHaveBeenCalledWith(expect.stringContaining('useSandboxInbox() takes an options object, such as useSandboxInbox({ address })'))
  })

  it('puts a failed read in error, as unavailable when it carries no code', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(client, 'action').mockRejectedValue(new Error('[CONVEX A(email:getSandboxInbox)] Server Error'))
    const { result } = await mountWithConvex(client, () => useSandboxInbox({ address, api: inboxApi }))
    await settle()
    expect(result.messages.value).toBeUndefined()
    expect(result.isLoading.value).toBe(false)
    expect(result.error.value).toMatchObject({ code: 'unavailable', data: { service: 'backend', reason: 'unexpected' } })
    expect(result.error.value?.message).not.toContain('Server Error')
  })

  it('finds the code in the subject or the HTML when the text has none', async () => {
    vi.spyOn(client, 'action').mockResolvedValue([message({ html: '<p>Code: <b>905521</b></p>' })])
    const { result } = await mountWithConvex(client, () => useSandboxInbox({ address: 'delivered+html@resend.dev', api: inboxApi }))
    await settle()
    expect(result.code.value).toBe('905521')
  })

  it('skips style and script bodies in the HTML', async () => {
    const html = '<style>.body{color:#123456}</style><script>const t = 654321</script><p>Code: 905521</p>'
    vi.spyOn(client, 'action').mockResolvedValue([message({ html })])
    const { result } = await mountWithConvex(client, () => useSandboxInbox({ address: 'delivered+css@resend.dev', api: inboxApi }))
    await settle()
    expect(result.code.value).toBe('905521')
  })

  it('pauses while the address is empty', async () => {
    const read = vi.spyOn(client, 'action').mockResolvedValue([])
    const { result } = await mountWithConvex(client, () => useSandboxInbox({ address: '  ', api: inboxApi }))
    await settle()
    expect(read).not.toHaveBeenCalled()
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
