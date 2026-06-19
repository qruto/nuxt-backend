import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { makeFunctionReference } from 'convex/server'
import type { OptimisticLocalStore } from 'convex/browser'
import { ConvexVueClient } from '../../src/runtime/vue/client'
import { mountWithConvex } from '../helpers/vue_test_utils'
import { silentConnectLogger } from '../helpers/silent-logger'
import { useAggregate, useCount } from '../../src/runtime/vue/composables/use-aggregate'
import { type BillingApi, useBilling } from '../../src/runtime/vue/composables/use-billing'
import { useFeatures } from '../../src/runtime/vue/composables/use-features'
import { useCredits } from '../../src/runtime/vue/composables/use-credits'
import { type EmailApi, useEmailStatus } from '../../src/runtime/vue/composables/use-email-status'
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
