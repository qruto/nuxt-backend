import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, provide, ref } from 'vue'
import { makeFunctionReference } from 'convex/server'
import type { OptimisticLocalStore } from 'convex/browser'
import { ConvexVueClient } from '../../src/runtime/vue/client'
import { mountWithConvex } from '../helpers/vue_test_utils'
import { silentConnectLogger } from '../helpers/silent-logger'
import { useAggregate, useCount } from '../../src/runtime/vue/composables/use-aggregate'
import { type BillingApi, useBilling, useConvexBilling } from '../../src/runtime/vue/composables/use-billing'
import { useFeatures } from '../../src/runtime/vue/composables/use-features'
import { useCredits } from '../../src/runtime/vue/composables/use-credits'
import { type EmailApi, useEmailStatus } from '../../src/runtime/vue/composables/use-email-status'
import { useSearch } from '../../src/runtime/vue/composables/use-search'
import { useWorkflowStatus } from '../../src/runtime/vue/composables/use-workflow'
import { ConvexAuthStateKey } from '../../src/runtime/vue/auth'

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
      { provide: () => provide(ConvexAuthStateKey, { isLoading: false, isAuthenticated: false }) },
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

  it('portal, changePlan and cancel drive their actions', async () => {
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
    await result.cancel({ revokeImmediately: true })

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

  it('exposes useConvexBilling as an alias', () => {
    expect(useConvexBilling).toBe(useBilling)
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
