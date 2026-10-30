// The Testing page's worked example, verbatim
// (test/docs/test-utils-example.test.ts holds the two to each other), run by
// CI's `pack` job in a starter app installed from the packed package.
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { createBackendMock, resetBackendMock } from 'nuxt-backend/test-utils'
import { afterEach, expect, test } from 'vitest'
import { PricingTable } from '#components'

enableAutoUnmount(afterEach)
afterEach(() => resetBackendMock())

test('a subscriber cancels the plan they are on', async () => {
  const backend = createBackendMock({
    user: { name: 'Ada' },
    queries: {
      'billing:getPricing': {
        plans: [{ key: 'pro', name: 'Pro', description: null, retired: false, features: [], featureKeys: [], prices: { month: { productId: 'prod_pro', amount: 900, currency: 'eur', monthly: 900 } } }],
        packs: [],
      },
      'billing:getCurrentSubscription': { id: 'sub_1', status: 'active', productId: 'prod_pro' },
    },
  })
  backend.stub('billing:cancelSubscription', () => null)

  const table = await mountSuspended(PricingTable, { props: { plans: [{ key: 'pro' }] } })
  // Cancelling takes one step: the button opens it, and its one button confirms.
  await table.find('[data-intent="cancel"]').trigger('click')
  await table.find('[data-pricing="confirm-cancel"]').trigger('click')
  await flushPromises()
  expect(backend.callsTo('billing:cancelSubscription')).toEqual([{ atPeriodEnd: true }])

  // The state is reactive: the table follows, as it follows the deployment.
  backend.signOut()
  await flushPromises()
  expect(table.find('[data-intent="sign-in"]').exists()).toBe(true)
})
