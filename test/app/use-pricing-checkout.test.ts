import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { clearNuxtData, useState } from '#app'
import { backendError } from '../../src/convex/errors'
import type { PricedPack, PricedPlan, Pricing } from '../../src/convex/integrations/billing/types/records'
import { createBackendMock, resetBackendMock, type BackendMock } from '../../src/runtime/test-utils'
import { usePricing, type UsePricingOptions, type UsePricingReturn } from '../../src/runtime/vue/composables/use-pricing'

// Where the provider's page opens: nowhere, here.
vi.mock('../../src/runtime/vue/utils/open-url', () => ({ openProviderUrl: vi.fn() }))

// usePricing's checkout and structured data over the backend mock, for a
// pricing page of an app's own: a checkout carries the address's campaign
// and the page's promotion the way <PricingTable>'s buttons do, one
// discount at a time, never blocked by a dead one, in the price's currency
// where the catalog prices more than one; and the plans and packs on sale
// as schema.org data.

enableAutoUnmount(afterEach)
beforeEach(() => {
  clearNuxtData()
  useState('backend:pricing:currency').value = null
})
afterEach(() => resetBackendMock())

const price = (productId: string, amount: number, fields: Record<string, unknown> = {}) => ({ productId, amount, currency: 'usd', monthly: amount, ...fields })
const plan = (key: string, prices: PricedPlan['prices']): PricedPlan => ({ key, name: key.toUpperCase(), description: null, retired: false, prices, features: [], featureKeys: [] })
const PACK: PricedPack = { key: 'small', productId: 'prod_small', name: 'Small', description: null, amount: 500, currency: 'eur', isBestValue: false, credits: { meter: 'credits', units: 50, rollover: true } }
const PRICING: Pricing = {
  plans: [plan('starter', { month: price('prod_starter', 500) }), plan('pro', { month: price('prod_pro', 900), year: price('prod_pro_year', 9000) })],
  packs: [PACK],
  currency: 'usd',
  currencies: ['usd'],
}
/** The pricing with the `launch` promotion, which Pro's monthly price and the pack carry. */
const PROMOTED: Pricing = {
  ...PRICING,
  promotion: { key: 'launch', name: 'Launch offer', percentOff: 20, duration: 'once', endsAt: '2099-12-31T00:00:00.000Z' },
  plans: [PRICING.plans[0]!, plan('pro', { month: price('prod_pro', 900, { promotion: { amount: 720, off: 180 } }), year: price('prod_pro_year', 9000) })],
  packs: [{ ...PACK, promotion: { amount: 400, off: 100 } }],
}

/** A billing manager on no plan yet, or on `subscription`, the pricing answered with `pricing`. */
function buyer(pricing: Pricing = PRICING, subscription: unknown = null): BackendMock {
  const backend = createBackendMock({
    user: {},
    queries: {
      'billing:getPricing': pricing,
      'billing:getCurrentSubscription': subscription,
      'billing:getBillingAccess': { canManage: true },
    },
  })
  backend.stub('billing:generateCheckoutLink', () => ({ url: 'https://checkout.example.com/1' }))
  return backend
}

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

/** The checkouts started, as the deployment received them, with what each carried. */
const checkouts = (backend: BackendMock) => backend.callsTo('billing:generateCheckoutLink').map((call) => {
  const { productIds, discount, discountCode, utm, currency } = call as Record<string, unknown>
  return { productIds, ...(discount ? { discount } : {}), ...(discountCode ? { discountCode } : {}), ...(utm ? { utm } : {}), ...(currency ? { currency } : {}) }
})

describe('usePricing().checkout', () => {
  it('checks a plan out at the interval shown, with the campaign link\'s code and attribution, back where successUrl says', async () => {
    const backend = buyer()
    const pricing = await read({ successUrl: { plan: chosen => `/welcome?plan=${chosen.key}` } }, '/pricing?discount=PARTNER5&utm_source=newsletter')
    pricing.setInterval('year')
    await expect(pricing.checkout('plan', 'pro')).resolves.toBe('https://checkout.example.com/1')
    expect(checkouts(backend)).toEqual([{ productIds: ['prod_pro_year'], discountCode: 'PARTNER5', utm: { source: 'newsletter' } }])
    expect(backend.callsTo('billing:generateCheckoutLink')[0]).toMatchObject({ successUrl: `${window.location.origin}/welcome?plan=pro` })
  })

  it('puts the page\'s promotion in the code\'s place on a price it is offered on, and keeps the code elsewhere', async () => {
    const backend = buyer(PROMOTED)
    const pricing = await read({ discount: 'launch' }, '/pricing?discount=PARTNER5')
    await pricing.checkout('plan', 'pro')
    await pricing.checkout('plan', 'starter')
    await pricing.checkout('pack', 'small')
    expect(checkouts(backend)).toEqual([
      { productIds: ['prod_pro'], discount: 'launch' },
      { productIds: ['prod_starter'], discountCode: 'PARTNER5' },
      { productIds: ['prod_small'], discount: 'launch' },
    ])
  })

  it('sends a promotion the campaign link\'s own code shows as that code', async () => {
    const backend = buyer(PROMOTED)
    const pricing = await read({ discount: 'LAUNCH20' }, '/pricing?discount=LAUNCH20')
    await pricing.checkout('plan', 'pro')
    expect(checkouts(backend)).toEqual([{ productIds: ['prod_pro'], discountCode: 'LAUNCH20' }])
  })

  it('checks out again without a discount the server refuses, the attribution kept, and rejects on any other refusal', async () => {
    const backend = buyer(PROMOTED)
    let refusals = 1
    backend.stub('billing:generateCheckoutLink', (args: { discount?: string }) => {
      if (args.discount && refusals-- > 0) throw backendError('invalid_input', { field: 'discount' })
      return { url: 'https://checkout.example.com/2' }
    })
    const pricing = await read({ discount: 'launch' }, '/pricing?utm_source=newsletter')
    await expect(pricing.checkout('plan', 'pro')).resolves.toBe('https://checkout.example.com/2')
    expect(checkouts(backend)).toEqual([
      { productIds: ['prod_pro'], discount: 'launch', utm: { source: 'newsletter' } },
      { productIds: ['prod_pro'], utm: { source: 'newsletter' } },
    ])
    backend.fail('billing:generateCheckoutLink', backendError('invalid_input', { field: 'productIds' }))
    await expect(pricing.checkout('plan', 'starter')).rejects.toThrow()
  })

  it('pays in the price\'s currency only where the catalog prices more than one', async () => {
    const single = buyer()
    await (await read()).checkout('pack', 'small')
    expect(checkouts(single)).toEqual([{ productIds: ['prod_small'] }])
    clearNuxtData()
    const many = buyer({ ...PRICING, currencies: ['usd', 'eur'] })
    await (await read()).checkout('pack', 'small')
    expect(checkouts(many)).toEqual([{ productIds: ['prod_small'], currency: 'eur' }])
  })

  it('offers a gifted plan\'s holder, who checks out, no plan promotion: theirs is a held plan', async () => {
    const backend = buyer(PROMOTED, { id: 'sub_pass', status: 'active', productId: 'prod_pass', pass: { plan: 'starter', months: 3, startedAt: 0, endsAt: Date.parse('2099-04-15T00:00:00.000Z') } })
    const pricing = await read({ discount: 'launch' })
    await pricing.checkout('plan', 'pro')
    expect(checkouts(backend)).toEqual([{ productIds: ['prod_pro'] }])
  })

  it('takes a discount of the caller\'s own in the campaign\'s place, and the caller\'s other options over its own', async () => {
    const backend = buyer(PROMOTED)
    const pricing = await read({ discount: 'launch' }, '/pricing?discount=PARTNER5&utm_source=newsletter')
    await pricing.checkout('plan', 'pro', { discountCode: 'FRIEND10', redirect: false, successUrl: 'https://app.example.com/thanks' })
    expect(checkouts(backend)).toEqual([{ productIds: ['prod_pro'], discountCode: 'FRIEND10', utm: { source: 'newsletter' } }])
    expect(backend.callsTo('billing:generateCheckoutLink')[0]).toMatchObject({ successUrl: 'https://app.example.com/thanks' })
  })

  it('refuses a key nothing on sale has', async () => {
    const backend = buyer()
    const pricing = await read()
    await expect(pricing.checkout('plan', 'enterprise')).rejects.toMatchObject({ data: { code: 'invalid_input', field: 'plan' } })
    await expect(pricing.checkout('pack', 'huge')).rejects.toMatchObject({ data: { code: 'invalid_input', field: 'pack' } })
    expect(backend.callsTo('billing:generateCheckoutLink')).toEqual([])
  })
})

describe('usePricing().structuredData', () => {
  it('describes the plans and packs on sale as schema.org products once the pricing loads', async () => {
    const backend = createBackendMock()
    const pricing = await read()
    expect(pricing.structuredData.value).toBeUndefined()
    backend.state.queries['billing:getPricing'] = PRICING
    await flushPromises()
    const graph = pricing.structuredData.value?.['@graph'] as Array<{ name: string, offers: Array<{ price: string, priceCurrency: string }> }>
    expect(pricing.structuredData.value?.['@context']).toBe('https://schema.org')
    expect(graph.map(product => [product.name, product.offers.map(offer => `${offer.price} ${offer.priceCurrency}`)])).toEqual([
      ['STARTER', ['5.00 USD']],
      ['PRO', ['9.00 USD', '90.00 USD']],
      ['Small', ['5.00 EUR']],
    ])
  })
})
