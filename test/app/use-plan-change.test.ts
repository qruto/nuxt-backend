import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { clearNuxtData, useState } from '#app'
import { backendError } from '../../src/convex/errors'
import type { PricedPlan, Pricing } from '../../src/convex/integrations/billing/types/records'
import { createBackendMock, resetBackendMock, type BackendMock } from '../../src/runtime/test-utils'
import { usePlanChange, type UsePlanChangeOptions, type UsePlanChangeReturn } from '../../src/runtime/vue/composables/use-plan-change'
import { usePricing, type UsePricingReturn } from '../../src/runtime/vue/composables/use-pricing'

// Where the provider's page opens: nowhere, here.
vi.mock('../../src/runtime/vue/utils/open-url', () => ({ openProviderUrl: vi.fn() }))

// usePlanChange over the backend mock, the way a pricing or billing page of
// an app's own reads it: the prices a subscription can switch to, in its own
// currency, the confirmation's words from what `changeOf` says the switch
// does, and the switch itself, settled at once whatever the organization's
// default; a gifted plan's holder checks the plan out instead.

enableAutoUnmount(afterEach)
beforeEach(() => {
  clearNuxtData()
  useState('backend:pricing:currency').value = null
})
afterEach(() => resetBackendMock())

const PRODUCTS = {
  'pro': { id: 'prod_pro', name: 'Pro', recurringInterval: 'month' },
  'pro:year': { id: 'prod_pro_year', name: 'Pro', recurringInterval: 'year' },
  'team': { id: 'prod_team', name: 'Team', recurringInterval: 'month' },
}
const PERIOD_END = '2099-03-15T00:00:00.000Z'
const DAY = 24 * 60 * 60 * 1000

const price = (productId: string, amount: number, interval: 'month' | 'year', currency = 'usd') => ({ productId, amount, currency, monthly: interval === 'year' ? amount / 12 : amount })
const plan = (key: string, name: string, prices: PricedPlan['prices'], fields: Partial<PricedPlan> = {}): PricedPlan => ({ key, name, description: null, retired: false, prices, features: [], featureKeys: [], ...fields })
const PRICING: Pricing = {
  plans: [
    plan('free', 'Free', { month: price('prod_free', 0, 'month') }, { free: true }),
    plan('pro', 'Pro', { month: price('prod_pro', 900, 'month'), year: price('prod_pro_year', 9000, 'year') }),
    plan('team', 'Team', { month: price('prod_team', 2900, 'month') }),
    plan('legacy', 'Legacy', { month: { ...price('prod_legacy', 500, 'month'), archived: true } }, { retired: true }),
  ],
  packs: [],
  currency: 'usd',
  currencies: ['usd', 'eur'],
}
/** The same plans in euros, 2 less each; Team in the catalog's dollars when it has no euro price. */
const inEuros = (teamIn: 'eur' | 'usd' = 'eur'): Pricing => ({
  ...PRICING,
  currency: 'eur',
  plans: PRICING.plans.map(entry => entry.key === 'team' && teamIn === 'usd'
    ? entry
    : { ...entry, prices: Object.fromEntries(Object.entries(entry.prices).map(([interval, at]) => [interval, { ...at, currency: 'eur', amount: Math.max(0, at!.amount - 200) }])) }),
})

/** A billing manager on `productId`, its period ending on PERIOD_END, the pricing answered by currency. */
function subscribedTo(productId: string, fields: Record<string, unknown> = {}): BackendMock {
  const key = Object.entries(PRODUCTS).find(([, product]) => product.id === productId)?.[0]
  return createBackendMock({
    user: {},
    queries: {
      'billing:getConfiguredProducts': PRODUCTS,
      'billing:getBillingAccess': { canManage: true },
      'billing:getCurrentSubscription': { id: 'sub_1', status: 'active', productId, ...(key ? { productKey: key } : {}), currentPeriodEnd: PERIOD_END, cancelAtPeriodEnd: false, pendingChange: null, resumesAt: null, ...fields },
      'billing:getFeatures': { plans: [productId], benefits: [] },
      'billing:getPricing': (args: { currency?: string }) => (args.currency === 'eur' ? inEuros() : PRICING),
    },
  })
}

/** usePlanChange in a probe, read once the mock answered. */
async function planChange(options: UsePlanChangeOptions = {}): Promise<UsePlanChangeReturn> {
  let change!: UsePlanChangeReturn
  await mountSuspended(defineComponent({
    setup() {
      change = usePlanChange(options)
      return () => h('div')
    },
  }))
  await flushPromises()
  return change
}

describe('usePlanChange: what a subscription can switch to', () => {
  it('lists every price on sale but its own, in catalog order, its own plan\'s other period named with it', async () => {
    subscribedTo('prod_pro')
    const change = await planChange()
    expect(change.targets.value).toEqual([
      { key: 'pro', productId: 'prod_pro_year', name: 'Pro', plan: 'Pro, billed yearly', price: '$90/yr', interval: 'year', amount: 9000, currency: 'usd' },
      { key: 'team', productId: 'prod_team', name: 'Team', plan: 'Team', price: '$29/mo', interval: 'month', amount: 2900, currency: 'usd' },
    ])
    // Never the free plan, a retired plan or an archived price.
    expect(change.targetFor('free', 'month')).toBeUndefined()
    expect(change.targetFor('legacy', 'month')).toBeUndefined()
    expect(change.targetFor('pro', 'month')).toBeUndefined()
    expect(change.targetFor('team', 'month')).toMatchObject({ productId: 'prod_team', price: '$29/mo' })
    expect(change.isLoading.value).toBe(false)
  })

  it('prices each switch in the subscription\'s currency, which the provider keeps, and drops a plan with no price in it', async () => {
    const backend = subscribedTo('prod_pro', { currency: 'EUR' })
    expect((await planChange()).targets.value?.map(target => target.price)).toEqual(['€88/yr', '€27/mo'])
    backend.state.queries['billing:getPricing'] = (args: { currency?: string }) => (args.currency === 'eur' ? inEuros('usd') : PRICING)
    const change = await planChange()
    expect(change.targets.value?.map(target => target.productId)).toEqual(['prod_pro_year'])
    expect(change.targetFor('team', 'month')).toBeUndefined()
  })

  it('takes the page\'s own pricing while it is in the subscription\'s currency, and reads the subscription\'s apart otherwise', async () => {
    const backend = subscribedTo('prod_pro', { currency: 'usd' })
    const asked: Array<{ currency?: string }> = []
    backend.state.queries['billing:getPricing'] = (args: { currency?: string }) => {
      asked.push(args)
      return args.currency === 'eur' ? inEuros() : PRICING
    }
    let page!: UsePricingReturn
    let change!: UsePlanChangeReturn
    const probe = (currency: string) => mountSuspended(defineComponent({
      setup() {
        page = usePricing({ currency })
        change = usePlanChange({ pricing: page })
        return () => h('div')
      },
    }))
    await probe('usd')
    await flushPromises()
    expect(asked.every(args => args.currency === 'usd')).toBe(true)
    expect(change.targetFor('team', 'month')?.price).toBe('$29/mo')
    // A page in euros: the switch still states dollars, read apart.
    clearNuxtData()
    asked.length = 0
    await probe('eur')
    await flushPromises()
    expect(page.currency.value).toBe('eur')
    expect(asked).toContainEqual({ currency: 'usd' })
    expect(change.targetFor('team', 'month')?.price).toBe('$29/mo')
  })

  it('offers no switch to the price a scheduled change moves to, and says when it starts instead', async () => {
    subscribedTo('prod_pro_year', { pendingChange: { productId: 'prod_team', appliesAt: PERIOD_END } })
    const change = await planChange()
    expect(change.targetFor('team', 'month')).toBeUndefined()
    expect(change.targets.value?.map(target => target.productId)).toEqual(['prod_pro'])
    expect(change.scheduledFor('prod_team')).toEqual(new Date(PERIOD_END))
    expect(change.scheduledFor('prod_pro')).toBeNull()
  })

  it('has nothing to switch from on the free plan, without a plan, or while it is not enabled', async () => {
    const backend = subscribedTo('prod_free', { free: true })
    expect((await planChange()).targets.value).toEqual([])
    backend.state.queries['billing:getCurrentSubscription'] = null
    const none = await planChange()
    expect(none.targets.value).toEqual([])
    expect(none.targetFor('team', 'month')).toBeUndefined()
    subscribedTo('prod_pro')
    const off = await planChange({ enabled: false })
    expect(off.targets.value).toEqual([])
    expect(off.isLoading.value).toBe(false)
  })

  it('is loading, with a null target, until the prices are read', async () => {
    const backend = subscribedTo('prod_pro')
    // A read that answers nothing yet is still loading.
    backend.state.queries['billing:getPricing'] = () => undefined
    const change = await planChange()
    expect(change.targets.value).toBeUndefined()
    expect(change.targetFor('team', 'month')).toBeNull()
    expect(change.isLoading.value).toBe(true)
  })
})

describe('usePlanChange: the confirmation', () => {
  it('says the switch happens at once and settles the period now, then switches settling it at once', async () => {
    const backend = subscribedTo('prod_pro')
    backend.stub('billing:updateSubscription', () => null)
    const change = await planChange()
    expect(change.title.value).toBe('')
    change.open(change.targetFor('team', 'month')!)
    expect(change.applies.value).toBe('now')
    expect(change.title.value).toBe('Switch to Team?')
    expect(change.when.value).toBe('$29/mo from now on. The switch happens at once, and the difference for this period is settled now.')
    expect(backend.callsTo('billing:updateSubscription')).toEqual([])
    await change.confirm()
    // The difference is charged now, as the words say, whatever the organization's default.
    expect(backend.callsTo('billing:updateSubscription')).toEqual([{ productId: 'prod_team', proration: 'invoice' }])
    expect(change.target.value).toBeNull()
  })

  it('says a yearly price left for a monthly one waits for the paid year\'s end, on its date', async () => {
    subscribedTo('prod_pro_year')
    const change = await planChange()
    change.open(change.targetFor('team', 'month')!)
    expect(change.applies.value).toBe('period_end')
    const date = new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(PERIOD_END))
    expect(change.when.value).toBe(`$29/mo from ${date}. The year you paid for runs out first: the switch happens when it ends.`)
  })

  it('says what becomes of a trial: it carries over, or ends with a first payment', async () => {
    const start = Date.now() - 3 * DAY
    const trial = { status: 'trialing', trialStart: new Date(start).toISOString(), trialEnd: new Date(start + 14 * DAY).toISOString() }
    const backend = subscribedTo('prod_pro', trial)
    backend.state.queries['billing:getConfiguredProducts'] = { ...PRODUCTS, team: { ...PRODUCTS.team, trialInterval: 'day', trialIntervalCount: 14 } }
    const carries = await planChange()
    carries.open(carries.targetFor('team', 'month')!)
    expect(carries.when.value).toBe('$29/mo from now on. The switch happens at once and your trial carries over: nothing is charged until it ends.')
    backend.state.queries['billing:getConfiguredProducts'] = PRODUCTS
    const ends = await planChange()
    ends.open(ends.targetFor('team', 'month')!)
    expect(ends.when.value).toBe('$29/mo from now on. The switch happens at once and ends your trial, so the first payment is charged now.')
  })

  it('asks a gifted plan\'s holder too, saying the checkout ends the gift, then checks the plan out', async () => {
    const backend = subscribedTo('prod_pass', { pass: { plan: 'pro', months: 3, startedAt: Date.parse('2099-01-15T00:00:00.000Z'), endsAt: Date.parse('2099-04-15T00:00:00.000Z') } })
    backend.stub('billing:generateCheckoutLink', () => ({ url: 'https://checkout.example.com/team' }))
    const change = await planChange()
    // Every paid plan is a checkout away, theirs included.
    expect(change.targets.value?.map(target => target.productId)).toEqual(['prod_pro', 'prod_pro_year', 'prod_team'])
    change.open(change.targetFor('team', 'month')!)
    expect(change.applies.value).toBe('checkout')
    expect(change.preview.value).toBeNull()
    expect(change.when.value).toBe('$29/mo from checkout on. Your gifted plan stops once you check out, and the time left on it does not carry over.')
    await change.confirm({ redirect: false })
    expect(backend.callsTo('billing:updateSubscription')).toEqual([])
    expect(backend.callsTo('billing:generateCheckoutLink')).toEqual([expect.objectContaining({ productIds: ['prod_team'] })])
  })

  it('keeps the confirmation open and says why when the switch is refused', async () => {
    const backend = subscribedTo('prod_pro')
    backend.fail('billing:updateSubscription', backendError('unavailable', { service: 'checkout', reason: 'checkout_paused' }))
    const change = await planChange()
    change.open({ productId: 'prod_team', plan: 'Team', price: '$29/mo' })
    // A target opened by hand is told apart by its product.
    expect(change.target.value?.key).toBe('prod_team')
    await expect(change.confirm()).rejects.toThrow()
    expect(change.error.value).toMatchObject({ code: 'unavailable', data: { reason: 'checkout_paused' } })
    expect(change.target.value?.productId).toBe('prod_team')
    expect(change.isPending.value).toBe(false)
    change.close()
    expect(change.target.value).toBeNull()
  })

  it('switches past the confirmation, settling the period at once', async () => {
    const backend = subscribedTo('prod_pro')
    backend.stub('billing:updateSubscription', () => null)
    await (await planChange()).switchTo('prod_pro_year')
    expect(backend.callsTo('billing:updateSubscription')).toEqual([{ productId: 'prod_pro_year', proration: 'invoice' }])
  })

  it('takes its words from the labels it is given', async () => {
    subscribedTo('prod_pro')
    const change = await planChange({ labels: { changeTitle: 'Move to {plan}?' } })
    change.open(change.targetFor('team', 'month')!)
    expect(change.title.value).toBe('Move to Team?')
  })
})
