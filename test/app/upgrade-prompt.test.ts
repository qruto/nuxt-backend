import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { clearNuxtData } from '#app'
import type { PricedPlan } from '../../src/convex/integrations/billing/types/records'
import { createBackendMock, type BackendMock } from '../../src/runtime/test-utils'
import UpgradePrompt from '../../src/runtime/vue/components/billing/UpgradePrompt.vue'
import { registerComponents } from '../helpers/register-components'

await registerComponents('UpgradePrompt')

// <UpgradePrompt> over the backend mock (nuxt-backend/test-utils), the way an
// app tests a gated page: the real usePricing reads the scaffolded
// `getPricing`, and who may buy is the server's `getBillingAccess`.
// The plans it offers are the catalog's, by each plan's featureKeys: what
// `requireFeature` names on the server.

let backend: BackendMock

const price = (productId: string, amount: number) => ({ month: { productId, amount, currency: 'usd', monthly: amount } })
/** The live pricing: Starter has nothing, Pro and Ultra grant `reports`, Ultra alone `audit`, a retired plan `reports` too. */
const PLANS: PricedPlan[] = [
  { key: 'starter', name: 'Starter', description: null, retired: false, features: [], featureKeys: ['starter-credits'], prices: price('p_starter', 500) },
  { key: 'pro', name: 'Pro', description: null, retired: false, features: ['Reports'], featureKeys: ['reports', 'pro-credits'], prices: price('p_pro', 900) },
  { key: 'legacy', name: 'Legacy', description: null, retired: true, features: ['Reports'], featureKeys: ['reports'], prices: price('p_legacy', 700) },
  { key: 'ultra', name: 'Ultra', description: null, retired: false, features: ['Reports', 'Audit'], featureKeys: ['reports', 'audit'], prices: price('p_ultra', 1900) },
]

async function mountPrompt(props: { feature?: string, plans?: string[] } = {}) {
  const wrapper = await mountSuspended(UpgradePrompt, { props, attachTo: document.body })
  await flushPromises()
  return wrapper
}

const message = (wrapper: Awaited<ReturnType<typeof mountPrompt>>) => wrapper.find('[data-upgrade="message"]').text()
const action = (wrapper: Awaited<ReturnType<typeof mountPrompt>>) => wrapper.find('[data-upgrade="action"]')

beforeEach(() => {
  // Each test reads the pricing afresh: the browser-only read keeps its payload entry.
  clearNuxtData()
  backend = createBackendMock({
    user: {},
    queries: {
      'billing:getPricing': { plans: PLANS, packs: [] },
      'billing:getBillingAccess': { canManage: true },
    },
  })
})

describe('<UpgradePrompt>, on the backend mock', () => {
  it('names the plans on sale that include the feature, in pricing order, and links to the first on the pricing page', async () => {
    const wrapper = await mountPrompt({ feature: 'reports' })
    expect(message(wrapper)).toBe('Your plan doesn\'t include this. Available on Pro or Ultra.')
    expect(action(wrapper).text()).toBe('Upgrade to Pro')
    expect(action(wrapper).attributes('href')).toBe('/pricing?plan=pro')
    // Ultra alone has audit; the retired plan is offered to nobody.
    const audit = await mountPrompt({ feature: 'audit' })
    expect(message(audit)).toBe('Your plan doesn\'t include this. Available on Ultra.')
    expect(action(audit).attributes('href')).toBe('/pricing?plan=ultra')
  })

  it('offers a refusal\'s own plans as they are, still in pricing order and only while on sale', async () => {
    const wrapper = await mountPrompt({ feature: 'reports', plans: ['ultra', 'legacy', 'pro'] })
    expect(message(wrapper)).toBe('Your plan doesn\'t include this. Available on Pro or Ultra.')
    expect(action(wrapper).attributes('href')).toBe('/pricing?plan=pro')
  })

  it('links to the pricing page itself when no plan on sale includes the feature', async () => {
    const none = await mountPrompt({ feature: 'sso' })
    expect(message(none)).toBe('Your plan doesn\'t include this.')
    expect(action(none).text()).toBe('See plans')
    expect(action(none).attributes('href')).toBe('/pricing')
  })

  it('says it in a polite status, which the plans it names arrive into, and is busy no more once they have', async () => {
    const wrapper = await mountPrompt({ feature: 'reports' })
    expect(wrapper.find('[data-upgrade="message"]').attributes('role')).toBe('status')
    expect(wrapper.find('[data-upgrade="root"]').attributes('aria-busy')).toBeUndefined()
  })

  it('asks a member who manages no billing to ask an owner or admin, with no link', async () => {
    backend.state.queries['billing:getBillingAccess'] = { canManage: false }
    const wrapper = await mountPrompt({ feature: 'reports' })
    expect(action(wrapper).exists()).toBe(false)
    expect(wrapper.find('[data-upgrade="note"]').text()).toBe('Ask the workspace\'s owner or an admin to upgrade.')
  })

  it('works from the keyboard: its one stop is a real link, which Tab reaches', async () => {
    const wrapper = await mountPrompt({ feature: 'reports' })
    const stops = wrapper.findAll('a[href], button, input, select, textarea, [tabindex]')
    expect(stops.map(stop => stop.attributes('data-upgrade'))).toEqual(['action'])
    const link = action(wrapper).element as HTMLAnchorElement
    expect(link.tagName).toBe('A')
    expect(link.tabIndex).toBe(0)
    link.focus()
    expect(document.activeElement).toBe(link)
    wrapper.unmount()
  })

  it('takes its words from the upgrade labels, a prop over the English', async () => {
    const wrapper = await mountSuspended(UpgradePrompt, { props: { feature: 'reports', labels: { upgrade: 'Get {plan}' } } })
    await flushPromises()
    expect(action(wrapper).text()).toBe('Get Pro')
  })
})
