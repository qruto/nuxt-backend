// Beside the worked example, in the same starter app: the Testing page's
// accessibility check, the base module's <Authenticated> over the mock, and
// a plain mount() given the mock through backendMockProvides().
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import axe from 'axe-core'
import { backendMockProvides, createBackendMock, resetBackendMock } from 'nuxt-backend/test-utils'
import { afterEach, expect, test } from 'vitest'
import { Authenticated, PricingTable } from '#components'

enableAutoUnmount(afterEach)
afterEach(() => resetBackendMock())

test('the table passes axe-core\'s WCAG A and AA rules', async () => {
  createBackendMock({
    user: {},
    queries: { 'billing:getConfiguredProducts': { pro: { id: 'prod_pro', name: 'Pro', prices: [{ priceAmount: 900, priceCurrency: 'EUR' }] } } },
  })
  const table = await mountSuspended(PricingTable, { props: { plans: [{ key: 'pro' }] }, attachTo: document.body })
  const { violations } = await axe.run(table.element, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  })
  expect(violations).toEqual([])
})

test('the base module\'s <Authenticated> follows the mock, mounted either way', async () => {
  createBackendMock({ user: {} })
  const slots = { default: () => 'signed in' }
  expect((await mountSuspended(Authenticated, { slots })).text()).toBe('signed in')
  expect(mount(Authenticated, { slots, global: { provide: backendMockProvides() } }).text()).toBe('signed in')
})
