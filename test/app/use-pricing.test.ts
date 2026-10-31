import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { clearNuxtData, useRouter, useState } from '#app'
import { backendError } from '../../src/convex/errors'
import type { PricedPack, PricedPlan, Pricing } from '../../src/convex/integrations/billing/types/records'
import { createBackendMock, resetBackendMock, type BackendMock } from '../../src/runtime/test-utils'
import { usePricing, type UsePricingOptions, type UsePricingReturn } from '../../src/runtime/vue/composables/use-pricing'
import { diagnostics } from '../../src/runtime/vue/utils/live-query'

// Where the provider's page opens: nowhere, here.
vi.mock('../../src/runtime/vue/utils/open-url', () => ({ openProviderUrl: vi.fn() }))

// usePricing over the backend mock: the plans and packs as a pricing page
// shows them, the intervals a switch offers, the pack that covers a
// shortfall, and the action behind each plan's button — a visitor signs in
// first, a subscriber changes plan, anyone else checks out with the
// address's campaign, one at a time.

enableAutoUnmount(afterEach)
beforeEach(() => {
  clearNuxtData()
  useState('backend:pricing:currency').value = null
})
afterEach(() => {
  resetBackendMock()
  diagnostics.enabled = false
  vi.restoreAllMocks()
})

const price = (productId: string, amount: number, fields: Record<string, unknown> = {}) => ({ productId, amount, currency: 'usd', monthly: amount, ...fields })
function plan(key: string, prices: PricedPlan['prices'], fields: Partial<PricedPlan> = {}): PricedPlan {
  return { key, name: key.toUpperCase(), description: null, retired: false, prices, features: [], featureKeys: [], ...fields }
}
function pack(key: string, units: number | null, amount: number, meter = 'credits'): PricedPack {
  return { key, productId: `prod_${key}`, name: key, description: null, amount, currency: 'usd', isBestValue: false, ...(units === null ? {} : { credits: { meter, units, rollover: true } }) }
}

const PRICING: Pricing = {
  plans: [
    plan('pro', { month: price('prod_pro', 900), year: price('prod_pro_year', 9000) }),
    plan('legacy', { month: price('prod_legacy', 500) }, { retired: true }),
    plan('team', { year: price('prod_team_year', 29000), month: price('prod_team', 2900, { archived: true }) }),
  ],
  packs: [pack('large', 500, 4000), pack('small', 50, 500), pack('medium', 200, 1500), pack('gift', null, 1000), pack('images', 20, 300, 'images')],
  currency: 'usd',
  currencies: ['usd'],
}

/** The pricing read, answered with `pricing`, for whoever `user` says (a visitor without one). */
function backendWith(user?: Record<string, unknown>, pricing: Pricing = PRICING, queries: Record<string, unknown> = {}): BackendMock {
  return createBackendMock({ ...(user ? { user } : {}), queries: { 'billing:getPricing': pricing, ...queries } })
}

/** A component reading the pricing at `route`, and what usePricing returned. */
async function read(options: UsePricingOptions = {}, route = '/pricing'): Promise<UsePricingReturn> {
  let pricing!: UsePricingReturn
  await mountSuspended(defineComponent({
    setup() {
      pricing = usePricing(options)
      return () => h('div')
    },
  }), { route })
  await flushPromises()
  return pricing
}

/** Press a plan's button, as `v-bind="bind.planAction(plan)"` wires it. */
async function press(pricing: UsePricingReturn, key: string): Promise<void> {
  const bag = pricing.bind.planAction({ key, name: key }) as { onClick?: () => unknown }
  await bag.onClick?.()
  await flushPromises()
}

describe('usePricing', () => {
  it('lists the plans, retired ones included, the packs, and the intervals a plan on sale still sells at', async () => {
    backendWith()
    const pricing = await read()
    expect(pricing.plans.value?.map(entry => [entry.key, entry.retired])).toEqual([['pro', false], ['legacy', true], ['team', false]])
    expect(pricing.packs.value?.map(entry => entry.key)).toEqual(['large', 'small', 'medium', 'gift', 'images'])
    expect(pricing.intervals.value).toEqual(['month', 'year'])
    expect(pricing.isLoading.value).toBe(false)
    expect(pricing.error.value).toBeNull()
  })

  it('shows the plans by the month until another interval is picked, and by the year where nothing sells monthly', async () => {
    backendWith()
    const pricing = await read()
    expect(pricing.interval.value).toBe('month')
    pricing.setInterval('year')
    expect(pricing.interval.value).toBe('year')
    // The switch's own bag flips it back.
    expect(pricing.bind.periodSwitch).toMatchObject({ 'role': 'switch', 'aria-checked': 'true' })
    ;(pricing.bind.periodSwitch.onClick as () => void)()
    expect(pricing.interval.value).toBe('month')

    clearNuxtData()
    backendWith(undefined, { ...PRICING, plans: [plan('team', { year: price('prod_team_year', 29000) }), plan('old', { month: price('prod_old', 100) }, { retired: true })] })
    const yearly = await read()
    expect(yearly.intervals.value).toEqual(['year'])
    expect(yearly.interval.value).toBe('year')
  })

  it('offers the smallest pack that covers a shortfall, else the largest, on the meter named', async () => {
    backendWith()
    const { packFor } = await read()
    expect(packFor(30)?.key).toBe('small')
    expect(packFor(150)?.key).toBe('medium')
    expect(packFor(5000)?.key).toBe('large')
    expect(packFor(10, 'images')?.key).toBe('images')
    expect(packFor(10, 'video')).toBeUndefined()
  })

  it('reads nothing while it is not enabled, and once it is', async () => {
    const backend = backendWith()
    const enabled = ref(false)
    const pricing = await read({ enabled })
    expect(pricing.isLoading.value).toBe(false)
    expect(pricing.plans.value).toBeUndefined()
    expect(backend.callsTo('billing:getPricing')).toEqual([])

    enabled.value = true
    await flushPromises()
    await vi.waitFor(() => expect(pricing.plans.value).toHaveLength(3))
  })

  it('is loading, with no error, until the pricing is read', async () => {
    const backend = createBackendMock()
    const pricing = await read()
    expect([pricing.plans.value, pricing.isLoading.value, pricing.error.value]).toEqual([undefined, true, null])

    backend.state.queries['billing:getPricing'] = PRICING
    await flushPromises()
    expect(pricing.plans.value).toHaveLength(3)
    expect([pricing.isLoading.value, pricing.error.value]).toEqual([false, null])
  })

  it('says why the pricing could not be read, and reads it again on refresh', async () => {
    const backend = backendWith()
    backend.fail('billing:getPricing', backendError('unavailable', { service: 'billing', reason: 'unexpected' }))
    const pricing = await read()
    expect(pricing.error.value).toMatchObject({ code: 'unavailable' })
    expect(pricing.isLoading.value).toBe(false)

    backend.stub('billing:getPricing', () => PRICING)
    await pricing.refresh()
    await flushPromises()
    expect(pricing.error.value).toBeNull()
    expect(pricing.plans.value).toHaveLength(3)
  })

  it('asks for the promotion the page names, trimmed, beside the currency', async () => {
    const backend = backendWith()
    const asked: unknown[] = []
    backend.stub('billing:getPricing', (args: unknown) => {
      asked.push(args)
      return PRICING
    })
    await read({ discount: '  launch  ', currency: 'usd' })
    expect(asked.at(-1)).toEqual({ currency: 'usd', discount: 'launch' })
  })
})

describe('usePricing\'s plan actions', () => {
  const subscribedTo = (productId: string) => ({ id: 'sub_1', status: 'active', productId, currentPeriodEnd: '2099-01-01T00:00:00.000Z', cancelAtPeriodEnd: false })

  it('sends a visitor to sign in, and back to the pricing page they were on', async () => {
    const backend = backendWith()
    const pricing = await read({}, '/pricing?currency=usd')
    // A visitor is offered the button: the sign-in comes first.
    expect(pricing.bind.planAction({ key: 'pro', name: 'Pro' })).toMatchObject({ type: 'button' })
    await press(pricing, 'pro')
    await vi.waitFor(() => expect(useRouter().currentRoute.value.fullPath).toBe(`/login?redirect=${encodeURIComponent('/pricing?currency=usd')}`))
    expect(backend.callsTo('billing:generateCheckoutLink')).toEqual([])
  })

  it('checks a signed-in person out at the interval shown, with the address\'s campaign and the page\'s promotion', async () => {
    const backend = backendWith({}, PRICING, { 'billing:getCurrentSubscription': null, 'billing:getBillingAccess': { canManage: true } })
    backend.stub('billing:generateCheckoutLink', () => ({ url: 'https://checkout.example.com/1' }))
    const pricing = await read({ discount: 'launch' }, '/pricing?discount=LAUNCH20&utm_source=newsletter')
    pricing.setInterval('year')
    await press(pricing, 'pro')
    expect(backend.callsTo('billing:generateCheckoutLink')).toEqual([expect.objectContaining({
      productIds: ['prod_pro_year'],
      discountCode: 'LAUNCH20',
      discount: 'launch',
      utm: { source: 'newsletter' },
    })])
    expect(pricing.pending.value).toBeNull()
  })

  it('checks a plan priced only by the year out at its year, whatever the switch shows', async () => {
    const yearly = { ...PRICING, plans: [...PRICING.plans, plan('annual', { year: price('prod_annual_year', 12000) })] }
    const backend = backendWith({}, yearly, { 'billing:getCurrentSubscription': null, 'billing:getBillingAccess': { canManage: true } })
    backend.stub('billing:generateCheckoutLink', () => ({ url: 'https://checkout.example.com/2' }))
    const pricing = await read()
    expect(pricing.interval.value).toBe('month')
    await press(pricing, 'annual')
    expect(backend.callsTo('billing:generateCheckoutLink')).toEqual([expect.objectContaining({ productIds: ['prod_annual_year'] })])
  })

  it('sells nobody new an archived price: a plan whose monthly price is archived checks out at its year', async () => {
    const backend = backendWith({}, PRICING, { 'billing:getCurrentSubscription': null, 'billing:getBillingAccess': { canManage: true } })
    backend.stub('billing:generateCheckoutLink', () => ({ url: 'https://checkout.example.com/3' }))
    const pricing = await read()
    expect(pricing.interval.value).toBe('month')
    await press(pricing, 'team')
    expect(backend.callsTo('billing:generateCheckoutLink')).toEqual([expect.objectContaining({ productIds: ['prod_team_year'] })])
  })

  it('changes a subscriber to the price of a plan that still sells, past its archived one', async () => {
    const backend = backendWith({}, PRICING, { 'billing:getCurrentSubscription': subscribedTo('prod_pro'), 'billing:getBillingAccess': { canManage: true } })
    backend.stub('billing:updateSubscription', () => null)
    const pricing = await read()
    expect(pricing.interval.value).toBe('month')
    await press(pricing, 'team')
    expect(backend.callsTo('billing:updateSubscription')).toEqual([{ productId: 'prod_team_year' }])
  })

  it('changes a subscriber\'s plan instead of checking out', async () => {
    const backend = backendWith({}, PRICING, { 'billing:getCurrentSubscription': subscribedTo('prod_pro'), 'billing:getBillingAccess': { canManage: true } })
    backend.stub('billing:updateSubscription', () => null)
    const pricing = await read()
    pricing.setInterval('year')
    await press(pricing, 'team')
    expect(backend.callsTo('billing:updateSubscription')).toEqual([{ productId: 'prod_team_year' }])
    expect(backend.callsTo('billing:generateCheckoutLink')).toEqual([])
  })

  it('runs one action at a time, busy on its own button, and frees it when the action fails', async () => {
    const backend = backendWith({}, PRICING, { 'billing:getCurrentSubscription': null, 'billing:getBillingAccess': { canManage: true } })
    let fail!: () => void
    backend.stub('billing:generateCheckoutLink', () => new Promise((_resolve, reject) => {
      fail = () => reject(backendError('unavailable', { service: 'billing', reason: 'unexpected' }))
    }))
    const pricing = await read()
    const first = press(pricing, 'pro')
    await vi.waitFor(() => expect(pricing.pending.value).toBe('pro'))
    expect(pricing.bind.planAction({ key: 'pro', name: 'Pro' })).toMatchObject({ 'aria-disabled': 'true', 'data-state': 'pending' })
    expect(pricing.bind.planAction({ key: 'team', name: 'Team' })).toMatchObject({ 'data-state': 'idle' })
    await press(pricing, 'team')
    expect(backend.callsTo('billing:generateCheckoutLink')).toHaveLength(1)

    fail()
    await first
    expect(pricing.pending.value).toBeNull()
    expect(pricing.bind.planAction({ key: 'pro', name: 'Pro' })).toMatchObject({ 'data-state': 'idle' })
  })

  it('shows no plan action to a member who manages no billing, and does nothing for a plan it does not price', async () => {
    const backend = backendWith({}, PRICING, { 'billing:getCurrentSubscription': null, 'billing:getBillingAccess': { canManage: false } })
    const pricing = await read()
    expect(pricing.bind.planAction({ key: 'pro', name: 'Pro' })).toEqual({ hidden: true })

    backend.state.queries['billing:getBillingAccess'] = { canManage: true }
    await flushPromises()
    await press(pricing, 'enterprise')
    expect(pricing.pending.value).toBeNull()
    expect(backend.callsTo('billing:generateCheckoutLink')).toEqual([])
  })
})

describe('usePricing for a view of its own', () => {
  it('binds no action for a view that runs its own, and takes the interval as a v-model', async () => {
    const backend = backendWith({}, PRICING, { 'billing:getCurrentSubscription': null, 'billing:getBillingAccess': { canManage: true } })
    const pricing = await read({ actions: false })
    expect(pricing.bind.planAction({ key: 'pro', name: 'Pro' })).toEqual({ hidden: true })
    pricing.interval.value = 'year'
    expect(pricing.interval.value).toBe('year')
    expect(pricing.bind.periodSwitch).toMatchObject({ 'aria-checked': 'true' })
    expect(backend.callsTo('billing:generateCheckoutLink')).toEqual([])
  })
})

describe('usePricing without getPricing', () => {
  it('has nothing to show and nothing loading, offers no action, and says what is missing in development', async () => {
    diagnostics.enabled = true
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    backendWith({})
    const pricing = await read({ api: {} })
    expect([pricing.plans.value, pricing.packs.value, pricing.intervals.value, pricing.currencies.value]).toEqual([[], [], [], []])
    expect([pricing.currency.value, pricing.promotion.value, pricing.isLoading.value, pricing.error.value]).toEqual([undefined, undefined, false, null])
    expect(pricing.packFor(10)).toBeUndefined()
    expect(pricing.interval.value).toBe('month')
    expect(pricing.bind.planAction({ key: 'pro', name: 'Pro' })).toEqual({ hidden: true })
    pricing.setCurrency('eur')
    await pricing.refresh()
    expect(pricing.currency.value).toBeUndefined()
    expect(warn.mock.calls.map(call => String(call[0]))).toContainEqual(expect.stringContaining('the backend exports no `getPricing`'))
  })
})
