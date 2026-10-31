import { afterEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { createBackendMock, resetBackendMock } from '../../src/runtime/test-utils'
import { registerComponents } from '../helpers/register-components'

// Where the provider's page opens: nowhere, here.
vi.mock('../../src/runtime/vue/utils/open-url', () => ({ openProviderUrl: vi.fn() }))

await registerComponents('PricingTable', 'BillingCheckoutLink', 'PricingEmailOptOut')
const { default: PricingTable } = await import('../../src/runtime/vue/components/billing/PricingTable.vue')
const { default: BillingCheckoutLink } = await import('../../src/runtime/vue/components/billing/BillingCheckoutLink.vue')

// The EU soft opt-in at checkout (PREFS): while a topic of the app's takes
// it (`getBillingAccess().softOptIn`), <PricingTable> and
// <BillingCheckoutLink> show one line under their buttons with an unticked
// "Don't email me" box, and the checkout says whether it was ticked. Where
// no topic takes it, no box shows and the checkout says nothing.

enableAutoUnmount(afterEach)
afterEach(() => resetBackendMock())

const pricing = {
  plans: [{ key: 'pro', name: 'Pro', description: null, retired: false, features: [], featureKeys: [], prices: { month: { productId: 'prod_pro', amount: 900, currency: 'eur', monthly: 900 } } }],
  packs: [],
}

function mockBackend(softOptIn: boolean) {
  const backend = createBackendMock({
    user: { name: 'Ada' },
    queries: {
      'billing:getPricing': pricing,
      'billing:getCurrentSubscription': null,
      'billing:listAllSubscriptions': [],
      'billing:getBillingAccess': { canManage: true, softOptIn },
    },
  })
  backend.stub('billing:generateCheckoutLink', () => ({ url: 'https://checkout.example.com/1' }))
  return backend
}

describe('the soft opt-in box', () => {
  it('shows under the pricing table, unticked, and a checkout says whether it was ticked', async () => {
    const backend = mockBackend(true)
    const table = await mountSuspended(PricingTable, { props: { plans: [{ key: 'pro' }] } })
    await flushPromises()
    const line = table.find('[data-pricing="email-opt-out"]')
    expect(line.text()).toContain('We\'ll email you about new features.')
    const box = line.find<HTMLInputElement>('input[type="checkbox"]')
    expect(box.element.checked).toBe(false)
    expect(line.find('label').text()).toBe('Don\'t email me')

    await table.find('[data-intent="subscribe"]').trigger('click')
    await flushPromises()
    expect(backend.callsTo('billing:generateCheckoutLink')).toEqual([expect.objectContaining({ productIds: ['prod_pro'], emailOptOut: false })])

    await box.setValue(true)
    expect(line.attributes('data-state')).toBe('objected')
    await table.find('[data-intent="subscribe"]').trigger('click')
    await flushPromises()
    expect(backend.callsTo('billing:generateCheckoutLink')[1]).toMatchObject({ emailOptOut: true })
  })

  it('follows a checkout link, and its checkout carries the box', async () => {
    const backend = mockBackend(true)
    const link = await mountSuspended(BillingCheckoutLink, { props: { productIds: ['prod_pro'] }, slots: { default: () => h('span', 'Upgrade') } })
    await flushPromises()
    await link.find('[data-pricing="email-opt-out-box"]').setValue(true)
    await link.find('a').trigger('click')
    await flushPromises()
    expect(backend.callsTo('billing:generateCheckoutLink')).toEqual([expect.objectContaining({ productIds: ['prod_pro'], emailOptOut: true })])
  })

  it('shows nowhere, and a checkout says nothing of it, while no topic takes it', async () => {
    const backend = mockBackend(false)
    const table = await mountSuspended(PricingTable, { props: { plans: [{ key: 'pro' }] } })
    const link = await mountSuspended(BillingCheckoutLink, { props: { productIds: ['prod_pro'] }, slots: { default: () => h('span', 'Upgrade') } })
    await flushPromises()
    expect(table.find('[data-pricing="email-opt-out"]').exists()).toBe(false)
    expect(link.find('[data-pricing="email-opt-out"]').exists()).toBe(false)
    await link.find('a').trigger('click')
    await flushPromises()
    expect(backend.callsTo('billing:generateCheckoutLink')[0]).not.toHaveProperty('emailOptOut')
  })
})
