import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { clearNuxtData, useState } from '#app'
import { backendError } from '../../src/convex/errors'
import type { PricedPlan, Pricing } from '../../src/convex/integrations/billing/types/records'
import { createBackendMock, resetBackendMock, type BackendMock } from '../../src/runtime/test-utils'
import { PLAN_STATES, useBillingSection, type UseBillingSectionReturn } from '../../src/runtime/vue/composables/use-billing-section'
import { finishingCheckout } from '../../src/runtime/vue/utils/checkout-return'

// Where the provider's page opens: nowhere, here.
vi.mock('../../src/runtime/vue/utils/open-url', () => ({ openProviderUrl: vi.fn() }))

// useBillingSection over the backend mock, the way a billing settings page
// of an app's own reads it: the state the plan is in, a failed read as a
// failure rather than a plan, a finishing checkout as busy, what each state
// offers in order, and the pause's months counted as the provider counts them.

enableAutoUnmount(afterEach)
beforeEach(() => {
  clearNuxtData()
  useState('backend:pricing:currency').value = null
})
afterEach(() => {
  resetBackendMock()
  finishingCheckout.value = false
})

const PRODUCTS = { pro: { id: 'prod_pro', name: 'Pro' }, team: { id: 'prod_team', name: 'Team' } }
const PERIOD_END = '2099-03-15T00:00:00.000Z'
const price = (productId: string, amount: number) => ({ productId, amount, currency: 'usd', monthly: amount })
const plan = (key: string, name: string, productId: string, amount: number): PricedPlan => ({ key, name, description: null, retired: false, prices: { month: price(productId, amount) }, features: [], featureKeys: [] })
const PRICING: Pricing = { plans: [plan('pro', 'Pro', 'prod_pro', 900), plan('team', 'Team', 'prod_team', 2900)], packs: [], currency: 'usd', currencies: ['usd'] }

/** The subscription `getCurrentSubscription` answers: an active Pro plan unless told otherwise. */
const subscription = (fields: Record<string, unknown> = {}) => ({ id: 'sub_1', status: 'active', productId: 'prod_pro', currentPeriodEnd: PERIOD_END, cancelAtPeriodEnd: false, pendingChange: null, resumesAt: null, ...fields })

function backendWith(current: unknown = subscription(), canManage = true): BackendMock {
  return createBackendMock({
    user: {},
    queries: {
      'billing:getConfiguredProducts': PRODUCTS,
      'billing:getBillingAccess': { canManage },
      'billing:getCurrentSubscription': current,
      'billing:getFeatures': { plans: [], benefits: [] },
      'billing:getPricing': PRICING,
    },
  })
}

async function section(): Promise<UseBillingSectionReturn> {
  let read!: UseBillingSectionReturn
  await mountSuspended(defineComponent({
    setup() {
      read = useBillingSection()
      return () => h('div')
    },
  }))
  await flushPromises()
  return read
}

describe('useBillingSection: the plan\'s state', () => {
  it('reads every state a running plan can be in, in the order they are tried, and what each offers', async () => {
    const cases: Array<[Record<string, unknown>, string, string[]]> = [
      [{ pass: { plan: 'pro', months: 3, startedAt: 0, endsAt: Date.parse('2099-04-15T00:00:00.000Z') } }, 'gifted', ['keep-gifted']],
      [{ status: 'past_due' }, 'past_due', ['portal', 'change-plan', 'cancel']],
      [{ status: 'paused', resumesAt: '2099-05-01T00:00:00.000Z' }, 'paused', ['resume', 'portal']],
      [{ cancelAtPeriodEnd: true }, 'canceling', ['uncancel', 'portal']],
      [{ pendingChange: { productId: 'prod_team', appliesAt: PERIOD_END } }, 'changing', ['cancel-change', 'portal', 'pause', 'cancel']],
      [{ status: 'trialing', trialEnd: PERIOD_END }, 'trialing', ['portal', 'change-plan', 'cancel']],
      [{}, 'active', ['portal', 'change-plan', 'pause', 'cancel']],
    ]
    for (const [fields, state, actions] of cases) {
      backendWith(subscription(fields))
      const read = await section()
      expect(read.state.value, state).toBe(state)
      expect(read.actions.value, state).toEqual(actions)
    }
    // The order the Subscriptions page lists.
    expect(cases.map(([, state]) => state)).toEqual([...PLAN_STATES])
  })

  it('reads a failed read as a failure, never as a plan, and offers nothing on it', async () => {
    const backend = backendWith()
    backend.fail('billing:getCurrentSubscription', backendError('unavailable', { service: 'billing', reason: 'unexpected' }))
    const read = await section()
    expect(read.state.value).toBe('error')
    expect(read.error.value).toMatchObject({ code: 'unavailable' })
    expect(read.isLoading.value).toBe(false)
    expect(read.actions.value).toEqual([])
  })

  it('is loading until the plan is known, and busy while a return from checkout finishes', async () => {
    const backend = backendWith()
    // A read that answers nothing yet is still loading.
    backend.state.queries['billing:getCurrentSubscription'] = () => undefined
    const loading = await section()
    expect(loading.state.value).toBe('loading')
    expect(loading.isLoading.value).toBe(true)
    backendWith()
    const read = await section()
    expect(read.isLoading.value).toBe(false)
    finishingCheckout.value = true
    expect(read.isLoading.value).toBe(true)
  })

  it('reads the free plan, or none, as free, with nothing to offer', async () => {
    backendWith(subscription({ productId: 'prod_free', free: true }))
    const free = await section()
    expect(free.state.value).toBe('free')
    expect(free.actions.value).toEqual([])
    backendWith(null)
    expect((await section()).state.value).toBe('free')
  })

  it('offers a member who manages no billing nothing, whatever the state', async () => {
    backendWith(subscription(), false)
    const read = await section()
    expect(read.state.value).toBe('active')
    expect(read.actions.value).toEqual([])
  })
})

describe('useBillingSection: what each offer waits for', () => {
  it('offers no pause with one scheduled already, on a plan set to end, past due or in its trial', async () => {
    for (const fields of [{ resumesAt: '2099-06-01T00:00:00.000Z' }, { cancelAtPeriodEnd: true }, { status: 'past_due' }, { status: 'trialing', trialEnd: PERIOD_END }]) {
      backendWith(subscription(fields))
      const read = await section()
      expect(read.pausable.value, JSON.stringify(fields)).toBe(false)
      expect(read.actions.value, JSON.stringify(fields)).not.toContain('pause')
    }
  })

  it('offers no switch while a change is scheduled, the plan is set to end or paused, nor with no other price', async () => {
    for (const fields of [{ pendingChange: { productId: 'prod_team', appliesAt: PERIOD_END } }, { cancelAtPeriodEnd: true }, { status: 'paused' }]) {
      backendWith(subscription(fields))
      expect((await section()).switchable.value, JSON.stringify(fields)).toBe(false)
    }
    const backend = backendWith()
    backend.state.queries['billing:getPricing'] = { ...PRICING, plans: PRICING.plans.slice(0, 1) }
    expect((await section()).switchable.value).toBe(false)
  })

  it('offers no second cancellation on a plan set to end or paused', async () => {
    for (const fields of [{ cancelAtPeriodEnd: true }, { status: 'paused' }]) {
      backendWith(subscription(fields))
      expect((await section()).cancellable.value, JSON.stringify(fields)).toBe(false)
    }
  })
})

describe('useBillingSection: the pause and a gifted plan', () => {
  it('resumes a pause on the same day of the month, or its last when the month is shorter', async () => {
    backendWith(subscription({ currentPeriodEnd: '2099-01-31T00:00:00.000Z' }))
    const read = await section()
    expect(read.pauseLengths).toEqual([1, 2, 3])
    // Jan 31 and a month is Feb 28, never Mar 3.
    expect(read.resumesAfter(1)).toEqual(new Date('2099-02-28T00:00:00.000Z'))
    expect(read.resumesAfter(2)).toEqual(new Date('2099-03-31T00:00:00.000Z'))
  })

  it('pauses from the period\'s end for the months asked, resuming by itself after them', async () => {
    const backend = backendWith()
    backend.stub('billing:pauseSubscription', () => null)
    await (await section()).pause(2)
    expect(backend.callsTo('billing:pauseSubscription')).toEqual([{ resumesAt: Date.parse('2099-05-15T00:00:00.000Z') }])
  })

  it('says why a pause was refused, and rejects', async () => {
    const backend = backendWith()
    backend.fail('billing:pauseSubscription', backendError('invalid_input', { field: 'resumesAt' }))
    const read = await section()
    await expect(read.pause(1)).rejects.toThrow()
    expect(read.error.value).toMatchObject({ code: 'invalid_input', data: { field: 'resumesAt' } })
  })

  it('keeps a gifted plan by checking its plan out', async () => {
    const backend = backendWith(subscription({ productId: 'prod_pass', pass: { plan: 'pro', months: 3, startedAt: 0, endsAt: Date.parse('2099-04-15T00:00:00.000Z') } }))
    backend.stub('billing:generateCheckoutLink', () => ({ url: 'https://checkout.example.com/pro' }))
    await (await section()).keepGifted({ redirect: false })
    expect(backend.callsTo('billing:generateCheckoutLink')).toEqual([expect.objectContaining({ productIds: ['prod_pro'] })])
  })

  it('switches through its plan change, priced as the section prices it', async () => {
    const backend = backendWith()
    backend.stub('billing:updateSubscription', () => null)
    const read = await section()
    expect(read.change.targets.value?.map(target => `${target.plan} · ${target.price}`)).toEqual(['Team · $29/mo'])
    await read.change.switchTo('prod_team')
    expect(backend.callsTo('billing:updateSubscription')).toEqual([{ productId: 'prod_team', proration: 'invoice' }])
  })
})
