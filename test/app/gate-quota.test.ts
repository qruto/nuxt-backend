import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { h } from 'vue'
import { ConvexError } from 'convex/values'
import { clearNuxtData } from '#app'
import type { PricedPlan } from '../../src/convex/integrations/billing/types/records'
import { createBackendMock, type BackendMock } from '../../src/runtime/test-utils'
import Gate from '../../src/runtime/vue/components/shell/Gate.vue'
import { registerComponents } from '../helpers/register-components'

await registerComponents('Gate')

// <Gate quota> over the backend mock (nuxt-backend/test-utils), the way
// an app tests a page that makes things a plan limits: the real useFeatures
// reads the quotas from `getFeatures`, the real usePricing the plans that
// allow more from `getPricing`, and who may buy is `getBillingAccess`.

let backend: BackendMock

const price = (productId: string, amount: number) => ({ month: { productId, amount, currency: 'usd', monthly: amount } })
/** The live pricing: Starter allows 3 projects, Pro 10, Ultra any number, and a retired plan 50. */
const PLANS: PricedPlan[] = [
  { key: 'starter', name: 'Starter', description: null, retired: false, features: [], featureKeys: [], quotas: { projects: 3 }, prices: price('p_starter', 500) },
  { key: 'pro', name: 'Pro', description: null, retired: false, features: [], featureKeys: [], quotas: { projects: 10, exports: 2 }, prices: price('p_pro', 900) },
  { key: 'legacy', name: 'Legacy', description: null, retired: true, features: [], featureKeys: [], quotas: { projects: 50 }, prices: price('p_legacy', 700) },
  { key: 'ultra', name: 'Ultra', description: null, retired: false, features: [], featureKeys: [], quotas: { projects: 'unlimited' }, prices: price('p_ultra', 1900) },
]

/** The features a Starter workspace reads: 3 projects, all but one used, and no exports. */
const features = (used: number) => ({ plans: ['p_starter'], benefits: [], quotas: { projects: { limit: 3, used }, exports: { limit: 0, used: 0 } } })

async function mountBoundary(props: { quota: string, amount?: number, name?: string, labels?: Record<string, string> }, slots: Record<string, (ctx: never) => unknown> = {}) {
  const wrapper = await mountSuspended(Gate, {
    props,
    slots: { default: ({ remaining }: { remaining?: number }) => h('button', { 'type': 'button', 'data-slot': 'content' }, `New project (${remaining} left)`), ...slots },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

const message = (wrapper: Awaited<ReturnType<typeof mountBoundary>>) => wrapper.find('[data-quota="message"]').text()
const action = (wrapper: Awaited<ReturnType<typeof mountBoundary>>) => wrapper.find('[data-quota="action"]')

beforeEach(() => {
  clearNuxtData()
  backend = createBackendMock({
    user: {},
    queries: {
      'billing:getPricing': { plans: PLANS, packs: [] },
      'billing:getBillingAccess': { canManage: true },
    },
  })
})

describe('<Gate quota>, on the backend mock', () => {
  it('says the quotas are loading in a busy polite status, and never shows the content meanwhile', async () => {
    const wrapper = await mountBoundary({ quota: 'projects' })
    expect(wrapper.find('[data-quota="loading"]').attributes()).toMatchObject({ 'role': 'status', 'aria-busy': 'true' })
    expect(wrapper.find('[data-slot="content"]').exists()).toBe(false)
  })

  it('shows the content while the plan has room, with how many are left', async () => {
    backend.state.queries['billing:getFeatures'] = features(2)
    const wrapper = await mountBoundary({ quota: 'projects' })
    expect(wrapper.find('[data-slot="content"]').text()).toBe('New project (1 left)')
  })

  it('with no room left, says how many are used of how many and offers the plans on sale that allow more, in pricing order', async () => {
    backend.state.queries['billing:getFeatures'] = features(3)
    const wrapper = await mountBoundary({ quota: 'projects' })
    expect(wrapper.find('[data-slot="content"]').exists()).toBe(false)
    expect(message(wrapper)).toBe('You have used 3 of 3 projects. More on Pro or Ultra.')
    expect(action(wrapper).text()).toBe('Upgrade to Pro')
    expect(action(wrapper).attributes('href')).toBe('/pricing?plan=pro')
  })

  it('asks for room for every one the content needs, and names only the plans that have it', async () => {
    backend.state.queries['billing:getFeatures'] = features(1)
    const wrapper = await mountBoundary({ quota: 'projects', amount: 9, name: 'boards' })
    expect(message(wrapper)).toBe('You have used 1 of 3 boards. This needs 9. More on Pro or Ultra.')
    const more = await mountBoundary({ quota: 'projects', amount: 12 })
    expect(message(more)).toBe('You have used 1 of 3 projects. This needs 12. More on Ultra.')
  })

  it('fails closed on a quota the plan names nowhere, and links to the pricing page when no plan on sale allows enough', async () => {
    backend.state.queries['billing:getFeatures'] = features(0)
    const exports = await mountBoundary({ quota: 'exports' })
    expect(message(exports)).toBe('Your plan includes no exports. More on Pro.')
    const sites = await mountBoundary({ quota: 'team_sites' })
    expect(message(sites)).toBe('Your plan includes no team sites.')
    expect(action(sites).text()).toBe('See plans')
    expect(action(sites).attributes('href')).toBe('/pricing')
  })

  it('never opens on an amount below one: 0, a negative or a fraction asks for room for at least one', async () => {
    backend.state.queries['billing:getFeatures'] = features(3)
    for (const amount of [0, -2, 0.5, Number.NaN]) {
      const wrapper = await mountBoundary({ quota: 'projects', amount })
      expect(wrapper.find('[data-slot="content"]').exists(), String(amount)).toBe(false)
      expect(message(wrapper)).toBe('You have used 3 of 3 projects. More on Pro or Ultra.')
    }
    const exports = await mountBoundary({ quota: 'exports', amount: 0 })
    expect(message(exports)).toBe('Your plan includes no exports. More on Pro.')
  })

  it('names a quota as the catalog describes it, unless given a name', async () => {
    backend.state.queries['billing:getFeatures'] = { ...features(3), quotas: { projects: { limit: 3, used: 3, description: 'team projects' } } }
    expect(message(await mountBoundary({ quota: 'projects' }))).toBe('You have used 3 of 3 team projects. More on Pro or Ultra.')
    expect(message(await mountBoundary({ quota: 'projects', name: 'boards' }))).toBe('You have used 3 of 3 boards. More on Pro or Ultra.')
  })

  it('reads a quota by its own name only: one called like an object\'s built-ins allows none, and no plan offers it', async () => {
    backend.state.queries['billing:getFeatures'] = features(0)
    const wrapper = await mountBoundary({ quota: 'constructor' })
    expect(wrapper.find('[data-slot="content"]').exists()).toBe(false)
    expect(message(wrapper)).toBe('Your plan includes no constructor.')
  })

  it('asks a member who manages no billing to ask an owner or admin, with no link', async () => {
    backend.state.queries['billing:getFeatures'] = features(3)
    backend.state.queries['billing:getBillingAccess'] = { canManage: false }
    const wrapper = await mountBoundary({ quota: 'projects' })
    expect(action(wrapper).exists()).toBe(false)
    expect(wrapper.find('[data-quota="note"]').text()).toBe('Ask the workspace\'s owner or an admin to upgrade.')
  })

  it('says the quotas could not be read in an alert, and hands the failure to an error slot', async () => {
    backend.fail('billing:getFeatures', new ConvexError({ code: 'unavailable', service: 'billing', reason: 'provider_refused' }))
    const wrapper = await mountBoundary({ quota: 'projects' })
    expect(wrapper.find('[data-quota="error"]').attributes('role')).toBe('alert')
    expect(wrapper.find('[data-slot="content"]').exists()).toBe(false)
    const slotted = await mountBoundary({ quota: 'projects' }, { error: ({ error }: { error: { code: string } }) => h('p', { 'data-slot': 'error' }, error.code) })
    expect(slotted.find('[data-slot="error"]').text()).toBe('unavailable')
  })

  it('hands its fallback slot the quota, the counts and the plans that allow more', async () => {
    backend.state.queries['billing:getFeatures'] = features(3)
    const wrapper = await mountBoundary({ quota: 'projects' }, {
      fallback: ({ limit, used, plans, href }: { limit: number, used: number, plans: PricedPlan[], href: string }) => h('a', { 'data-slot': 'fallback', href }, `${used}/${limit}: ${plans.map(plan => plan.key).join(',')}`),
    })
    expect(wrapper.find('[data-slot="fallback"]').text()).toBe('3/3: pro,ultra')
    expect(wrapper.find('[data-slot="fallback"]').attributes('href')).toBe('/pricing?plan=pro')
  })

  it('works from the keyboard: with no room, its one stop is a real link, which Tab reaches; with room, the content\'s own', async () => {
    backend.state.queries['billing:getFeatures'] = features(3)
    const refused = await mountBoundary({ quota: 'projects' })
    const stops = refused.findAll('a[href], button, input, select, textarea, [tabindex]')
    expect(stops.map(stop => stop.attributes('data-quota'))).toEqual(['action'])
    const link = action(refused).element as HTMLAnchorElement
    expect(link.tagName).toBe('A')
    expect(link.tabIndex).toBe(0)
    link.focus()
    expect(document.activeElement).toBe(link)
    refused.unmount()
    backend.state.queries['billing:getFeatures'] = features(0)
    const allowed = await mountBoundary({ quota: 'projects' })
    expect(allowed.findAll('a[href], button').map(stop => stop.attributes('data-slot'))).toEqual(['content'])
    allowed.unmount()
  })

  it('takes its words from the quota labels, a prop over the English', async () => {
    backend.state.queries['billing:getFeatures'] = features(3)
    const wrapper = await mountBoundary({ quota: 'projects', labels: { reached: '{used}/{limit} {quota} used.', upgrade: 'Get {plan}' } })
    expect(message(wrapper)).toBe('3/3 projects used. More on Pro or Ultra.')
    expect(action(wrapper).text()).toBe('Get Pro')
  })
})
