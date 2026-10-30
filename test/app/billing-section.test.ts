import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { createBackendMock, type BackendMock } from '../../src/runtime/test-utils'
import WorkspaceSettings from '../../src/runtime/vue/components/workspaces/WorkspaceSettings.vue'
import { registerComponents } from '../helpers/register-components'

await registerComponents('WorkspaceSettings', 'CancelFlow')

// The billing section of <WorkspaceSettings> over the backend mock
// (nuxt-backend/test-utils), the way an app tests its settings page: the
// real useBilling and useFeatures read the scaffolded billing functions from
// the mock, so each state is the subscription row the deployment answers,
// and each button is the action the app's backend receives.

let backend: BackendMock

const PRO = { id: 'prod_pro', name: 'Pro' }
const TEAM = { id: 'prod_team', name: 'Team' }

/** The subscription `getCurrentSubscription` answers, an active Pro plan unless told otherwise. */
function subscription(fields: Record<string, unknown> = {}) {
  return { id: 'sub_1', status: 'active', productId: PRO.id, currentPeriodEnd: '2026-09-01T00:00:00.000Z', cancelAtPeriodEnd: false, pendingChange: null, resumesAt: null, ...fields }
}

async function mountSection() {
  const wrapper = await mountSuspended(WorkspaceSettings, { props: { sections: ['billing'] } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  backend = createBackendMock({
    user: {},
    queries: {
      'billing:getConfiguredProducts': { pro: PRO, team: TEAM },
      'billing:getBillingAccess': { canManage: true },
      'billing:getCurrentSubscription': subscription(),
      'billing:getFeatures': { plans: [PRO.id], benefits: [] },
    },
  })
})

describe('the billing section of <WorkspaceSettings>, on the backend mock', () => {
  it('reads every state the subscription can be in, and offers the one action each calls for', async () => {
    const cases: Array<[Record<string, unknown>, string, string]> = [
      [{ status: 'trialing', trialEnd: '2099-01-08T00:00:00.000Z' }, 'trialing', 'cancel'],
      [{ status: 'past_due' }, 'past_due', 'portal'],
      [{ status: 'paused', resumesAt: '2099-02-01T00:00:00.000Z' }, 'paused', 'resume'],
      [{ cancelAtPeriodEnd: true }, 'canceling', 'uncancel'],
      [{ pendingChange: { productId: TEAM.id, appliesAt: '2099-02-01T00:00:00.000Z' } }, 'changing', 'cancel-change'],
      [{}, 'active', 'cancel'],
    ]
    for (const [fields, state, action] of cases) {
      backend.state.queries['billing:getCurrentSubscription'] = subscription(fields)
      const wrapper = await mountSection()
      expect(wrapper.find('[data-settings="plan-status"]').attributes('data-state'), state).toBe(state)
      expect(wrapper.find(`[data-settings="${action}"]`).exists(), action).toBe(true)
    }
  })

  it('sends each action to the scaffolded function', async () => {
    backend.state.queries['billing:getCurrentSubscription'] = subscription({ status: 'paused' })
    await (await mountSection()).find('[data-settings="resume"]').trigger('click')
    await flushPromises()
    expect(backend.callsTo('billing:resumeSubscription')).toEqual([{}])

    backend.state.queries['billing:getCurrentSubscription'] = subscription({ pendingChange: { productId: TEAM.id, appliesAt: '2099-02-01T00:00:00.000Z' } })
    const changing = await mountSection()
    expect(changing.find('[data-settings="plan-status"]').text()).toContain('switches to Team')
    await changing.find('[data-settings="cancel-change"]').trigger('click')
    await flushPromises()
    expect(backend.callsTo('billing:cancelPendingChange')).toEqual([{}])

    backend.state.queries['billing:getCurrentSubscription'] = subscription()
    const active = await mountSection()
    await active.find('[data-settings="cancel"]').trigger('click')
    await active.find('[data-settings="confirm-cancel"]').trigger('click')
    await flushPromises()
    // At the period's end, in one step that asked nothing more.
    expect(backend.callsTo('billing:cancelSubscription')).toEqual([{ atPeriodEnd: true, offer: false }])
  })

  it('keeps a failed payment set to end from a second cancellation, and offers its way back', async () => {
    backend.state.queries['billing:getCurrentSubscription'] = subscription({ status: 'past_due', cancelAtPeriodEnd: true })
    const wrapper = await mountSection()
    expect(wrapper.find('[data-settings="plan-status"]').attributes('data-state')).toBe('past_due')
    expect(wrapper.find('[data-settings="cancel"]').exists()).toBe(false)
    await wrapper.find('[data-settings="uncancel"]').trigger('click')
    await flushPromises()
    expect(backend.callsTo('billing:uncancelSubscription')).toEqual([{}])
  })

  it('lists the native benefits the plan grants, by name and in neutral words', async () => {
    backend.state.queries['billing:getFeatures'] = {
      plans: [PRO.id],
      benefits: [
        { id: 'g1', benefitId: 'b1', type: 'license_keys', kind: 'license_key', name: 'Desktop license', licenseKey: '****-0A1B2C' },
        { id: 'g2', benefitId: 'b2', type: 'discord', kind: 'community', name: 'Community' },
      ],
    }
    const wrapper = await mountSection()
    expect(wrapper.findAll('[data-settings="benefit"]').map(row => row.attributes('data-kind'))).toEqual(['license_key', 'community'])
    expect(wrapper.find('[data-settings="benefit-detail"]').text()).toBe('****-0A1B2C')
  })

  it('shows a member who manages no billing the plan, and no button', async () => {
    backend.state.queries['billing:getBillingAccess'] = { canManage: false }
    const wrapper = await mountSection()
    expect(wrapper.find('[data-settings="plan-status"]').exists()).toBe(true)
    expect(wrapper.find('[data-settings="managed"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-settings="section-billing"] button')).toHaveLength(0)
  })

  it('tells the listener and the reader when the cancel flow, with save offers on, cancels the plan', async () => {
    backend.state.queries['billing:getBillingAccess'] = { canManage: true, saveOffers: true }
    backend.stub('billing:cancelSubscription', () => ({ canceled: true, endsAt: null }))
    const wrapper = await mountSection()
    await wrapper.find('[data-settings="cancel"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-cancel-flow="cancel"]').trigger('click')
    await flushPromises()
    expect(backend.callsTo('billing:cancelSubscription')).toEqual([{ atPeriodEnd: true, offer: false }])
    expect(wrapper.emitted('plan-canceled')).toHaveLength(1)
    expect(wrapper.find('[data-settings="message"]').text()).toBe('Subscription set to cancel at period end.')
  })
})
