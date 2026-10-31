import { beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { clearNuxtData, useState } from '#app'
import type { Pricing } from '../../src/convex/integrations/billing/types/records'
import { createBackendMock } from '../../src/runtime/test-utils'
import { usePricing, type UsePricingReturn } from '../../src/runtime/vue/composables/use-pricing'

// The currency usePricing reads the pricing in, over the backend mock: the
// visitor's guess (this browser's language), a `?currency=` in the address,
// the visitor's own pick, and the page's option, in that order of strength;
// the server's answer names the one it priced in.

const asked: Array<string | undefined> = []

beforeEach(() => {
  clearNuxtData()
  asked.length = 0
  useState('backend:pricing:currency').value = null
  createBackendMock({
    queries: {
      // As getPricing answers: in the currency asked for when the catalog prices it, else its own.
      'billing:getPricing': (args: { currency?: string }): Pricing => {
        asked.push(args.currency)
        return { plans: [], packs: [], currency: args.currency === 'eur' ? 'eur' : 'usd', currencies: ['usd', 'eur'] }
      },
    },
  })
})

/** Mount a component reading the pricing, at `route`, and hand back what usePricing returned. */
async function read(route = '/pricing', options: Parameters<typeof usePricing>[0] = {}): Promise<UsePricingReturn> {
  let pricing!: UsePricingReturn
  await mountSuspended(defineComponent({
    setup() {
      pricing = usePricing(options)
      return () => h('p', pricing.currency.value)
    },
  }), { route })
  await flushPromises()
  return pricing
}

describe('usePricing\'s currency', () => {
  it('starts from the visitor\'s, and lists what the catalog prices', async () => {
    const pricing = await read()
    // This browser asks for en-US.
    expect(asked.at(-1)).toBe('usd')
    expect(pricing.currency.value).toBe('usd')
    expect(pricing.currencies.value).toEqual(['usd', 'eur'])
  })

  it('follows a ?currency= in the address, then the visitor\'s pick over it, and the page\'s option over both', async () => {
    const linked = await read('/pricing?currency=EUR')
    expect(linked.currency.value).toBe('eur')
    linked.setCurrency('usd')
    await flushPromises()
    expect(linked.currency.value).toBe('usd')
    // Not a code: ignored.
    linked.setCurrency('dollars')
    await flushPromises()
    expect(linked.currency.value).toBe('usd')
    const fixed = await read('/pricing?currency=usd', { currency: 'eur' })
    expect(fixed.currency.value).toBe('eur')
  })
})
