import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { clearNuxtData, useState } from '#app'
import type { PricedPlan, Pricing } from '../../src/convex/integrations/billing/types/records'
import { createBackendMock, resetBackendMock, type BackendMock } from '../../src/runtime/test-utils'
import { useBilling, type UseBillingReturn } from '../../src/runtime/vue/composables/use-billing'
import { registerComponents } from '../helpers/register-components'

await registerComponents('PricingTable', 'WorkspaceSettings', 'CancelFlow')
const { default: PricingTable } = await import('../../src/runtime/vue/components/billing/PricingTable.vue')
const { default: WorkspaceSettings } = await import('../../src/runtime/vue/components/workspaces/WorkspaceSettings.vue')

// A plan change, previewed and confirmed, over the backend mock: what
// `useBilling().changeOf` says a switch does (a yearly price left for a
// monthly one waits for the paid year's end, anything else applies at once
// and settles the period now), and the one confirmation <PricingTable> and
// the plan section of <WorkspaceSettings> ask before `changePlan`, plus the
// section's pause of one to three months.

enableAutoUnmount(afterEach)
afterEach(() => resetBackendMock())

const PRODUCTS = {
  'pro': { id: 'prod_pro', name: 'Pro', recurringInterval: 'month' },
  'pro:year': { id: 'prod_pro_year', name: 'Pro', recurringInterval: 'year' },
  'team': { id: 'prod_team', name: 'Team', recurringInterval: 'month' },
}
const PERIOD_END = '2099-03-15T00:00:00.000Z'

const price = (productId: string, amount: number, interval: 'month' | 'year') => ({ productId, amount, currency: 'usd', monthly: interval === 'year' ? amount / 12 : amount })
const plan = (key: string, name: string, prices: PricedPlan['prices']): PricedPlan => ({ key, name, description: null, retired: false, prices, features: [], featureKeys: [] })
const PRICING: Pricing = {
  plans: [
    plan('pro', 'Pro', { month: price('prod_pro', 900, 'month'), year: price('prod_pro_year', 9000, 'year') }),
    plan('team', 'Team', { month: price('prod_team', 2900, 'month') }),
  ],
  packs: [],
  currency: 'usd',
  currencies: ['usd'],
}

/** A billing manager on `productId`, its period ending on PERIOD_END. */
function subscribedTo(productId: string, fields: Record<string, unknown> = {}): BackendMock {
  const key = Object.entries(PRODUCTS).find(([, product]) => product.id === productId)![0]
  return createBackendMock({
    user: {},
    queries: {
      'billing:getConfiguredProducts': PRODUCTS,
      'billing:getBillingAccess': { canManage: true },
      'billing:getCurrentSubscription': { id: 'sub_1', status: 'active', productId, productKey: key, recurringInterval: PRODUCTS[key as keyof typeof PRODUCTS].recurringInterval, currentPeriodEnd: PERIOD_END, cancelAtPeriodEnd: false, pendingChange: null, resumesAt: null, ...fields },
      'billing:getFeatures': { plans: [productId], benefits: [] },
      'billing:getPricing': PRICING,
    },
  })
}

beforeEach(() => {
  clearNuxtData()
  useState('backend:pricing:currency').value = null
})

async function billingState(): Promise<UseBillingReturn> {
  let billing!: UseBillingReturn
  await mountSuspended(defineComponent({
    setup() {
      billing = useBilling()
      return () => h('div')
    },
  }))
  await flushPromises()
  return billing
}

describe('useBilling().changeOf', () => {
  it('waits for the paid year\'s end when a yearly price is left for a monthly one, settling nothing mid-period', async () => {
    subscribedTo('prod_pro_year')
    const billing = await billingState()
    expect(billing.changeOf('prod_team')).toEqual({
      productId: 'prod_team',
      plan: 'team',
      interval: 'month',
      fromInterval: 'year',
      applies: 'period_end',
      appliesAt: new Date(PERIOD_END),
      proration: 'none',
      rule: 'paid_year',
    })
    expect(billing.changeOf('prod_pro')).toMatchObject({ plan: 'pro', applies: 'period_end', rule: 'paid_year' })
  })

  it('applies any other change at once, settling the period now', async () => {
    subscribedTo('prod_pro')
    const billing = await billingState()
    expect(billing.changeOf('prod_pro_year')).toEqual({ productId: 'prod_pro_year', plan: 'pro', interval: 'year', fromInterval: 'month', applies: 'now', appliesAt: null, proration: 'now', rule: null })
    expect(billing.changeOf('prod_team')).toMatchObject({ applies: 'now', proration: 'now', rule: null })
  })

  it('has nothing to preview for the product it is on, the free plan, a gifted pass, or no subscription', async () => {
    const backend = subscribedTo('prod_pro')
    const billing = await billingState()
    expect(billing.changeOf('prod_pro')).toBeNull()
    backend.state.queries['billing:getCurrentSubscription'] = { id: 'sub_free', status: 'active', productId: 'prod_free', free: true }
    await flushPromises()
    expect(billing.changeOf('prod_team')).toBeNull()
    backend.state.queries['billing:getCurrentSubscription'] = { id: 'sub_pass', status: 'active', productId: 'prod_pass', pass: { plan: 'pro', months: 3, startedAt: 0, endsAt: 1 } }
    await flushPromises()
    expect(billing.changeOf('prod_team')).toBeNull()
    backend.state.queries['billing:getCurrentSubscription'] = null
    await flushPromises()
    expect(billing.changeOf('prod_team')).toBeNull()
  })
})

const part = (wrapper: VueWrapper, family: string, name: string) => wrapper.find(`[data-${family}="${name}"]`)

describe('<PricingTable>\'s switch confirmation', () => {
  async function table(): Promise<VueWrapper> {
    const wrapper = await mountSuspended(PricingTable, { attachTo: document.body })
    await flushPromises()
    return wrapper
  }
  const card = (wrapper: VueWrapper, name: string) => wrapper.findAll('[data-pricing="plan"]').find(entry => entry.find('[data-pricing="plan-name"]').text().startsWith(name))!

  it('asks first: the price, that the switch happens now and settles the period, then switches on "Confirm switch"', async () => {
    const backend = subscribedTo('prod_pro')
    const wrapper = await table()
    const button = card(wrapper, 'Team').find('[data-pricing="plan-action"]')
    expect(button.attributes('data-intent')).toBe('upgrade')
    expect(button.attributes('aria-expanded')).toBe('false')
    await button.trigger('click')
    expect(button.attributes('aria-expanded')).toBe('true')
    const group = card(wrapper, 'Team').find('[data-pricing="change-confirm"]')
    expect(group.attributes('role')).toBe('group')
    expect(group.attributes('data-applies')).toBe('now')
    expect(button.attributes('aria-controls')).toBe(group.attributes('id'))
    expect(part(wrapper, 'pricing', 'change-title').text()).toBe('Switch to Team?')
    expect(part(wrapper, 'pricing', 'change-when').text()).toBe('$29/mo from now on. The switch happens at once, and the difference for this period is settled now.')
    // Nothing changed before the confirmation.
    expect(backend.callsTo('billing:updateSubscription')).toEqual([])
    await part(wrapper, 'pricing', 'confirm-change').trigger('click')
    await flushPromises()
    expect(backend.callsTo('billing:updateSubscription')).toEqual([{ subscriptionId: undefined, productId: 'prod_team', proration: undefined }])
    expect(wrapper.emitted('plan-changed')).toEqual([['team']])
    expect(part(wrapper, 'pricing', 'change-confirm').exists()).toBe(false)
  })

  it('says a switch from a yearly price to a monthly one waits for the paid year\'s end, on its date', async () => {
    subscribedTo('prod_pro_year')
    const wrapper = await table()
    await card(wrapper, 'Team').find('[data-pricing="plan-action"]').trigger('click')
    expect(part(wrapper, 'pricing', 'change-confirm').attributes('data-applies')).toBe('period_end')
    const date = new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(PERIOD_END))
    expect(part(wrapper, 'pricing', 'change-when').text()).toBe(`$29/mo from ${date}. The year you paid for runs out first: the switch happens when it ends.`)
  })

  it('names the billing period on the plan\'s own card, and closes on "Not now" or Escape with focus back on its button', async () => {
    const backend = subscribedTo('prod_pro')
    const wrapper = await mountSuspended(PricingTable, { attachTo: document.body, props: { interval: 'year' } })
    await flushPromises()
    const button = card(wrapper, 'Pro').find('[data-pricing="plan-action"]')
    expect(button.attributes('data-intent')).toBe('switch')
    await button.trigger('click')
    expect(part(wrapper, 'pricing', 'change-title').text()).toBe('Switch to Pro, billed yearly?')
    await part(wrapper, 'pricing', 'change-back').trigger('click')
    await flushPromises()
    expect(part(wrapper, 'pricing', 'change-confirm').exists()).toBe(false)
    expect(document.activeElement).toBe(button.element)
    await button.trigger('click')
    await part(wrapper, 'pricing', 'change-confirm').trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(part(wrapper, 'pricing', 'change-confirm').exists()).toBe(false)
    expect(backend.callsTo('billing:updateSubscription')).toEqual([])
  })
})

describe('the plan section\'s switch and pause', () => {
  async function section(): Promise<VueWrapper> {
    const wrapper = await mountSuspended(WorkspaceSettings, { props: { sections: ['billing'] }, attachTo: document.body })
    await flushPromises()
    return wrapper
  }

  it('lists every other price on sale, says what switching to one does, and switches on the confirmation', async () => {
    const backend = subscribedTo('prod_pro')
    const wrapper = await section()
    const toggle = part(wrapper, 'settings', 'change-plan')
    expect(toggle.text()).toBe('Change plan')
    await toggle.trigger('click')
    const select = part(wrapper, 'settings', 'switch-select')
    expect(select.findAll('option').map(option => option.text())).toEqual(['Choose a plan', 'Pro, billed yearly · $90/yr', 'Team, billed monthly · $29/mo'])
    await select.setValue('prod_pro_year')
    expect(part(wrapper, 'settings', 'change-title').text()).toBe('Switch to Pro, billed yearly?')
    expect(part(wrapper, 'settings', 'change-when').text()).toContain('The switch happens at once')
    await part(wrapper, 'settings', 'confirm-change').trigger('click')
    await flushPromises()
    expect(backend.callsTo('billing:updateSubscription')).toEqual([{ subscriptionId: undefined, productId: 'prod_pro_year', proration: undefined }])
    expect(wrapper.emitted('plan-changed')).toEqual([['prod_pro_year']])
    expect(part(wrapper, 'settings', 'message').text()).toBe('The plan is now Pro, billed yearly.')
    expect(part(wrapper, 'settings', 'switch-picker').exists()).toBe(false)
  })

  it('says a yearly plan\'s switch to monthly waits for the year\'s end, and announces it as scheduled', async () => {
    subscribedTo('prod_pro_year')
    const wrapper = await section()
    await part(wrapper, 'settings', 'change-plan').trigger('click')
    await part(wrapper, 'settings', 'switch-select').setValue('prod_team')
    const date = new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(PERIOD_END))
    expect(part(wrapper, 'settings', 'change-when').text()).toContain(`from ${date}. The year you paid for runs out first`)
    await part(wrapper, 'settings', 'confirm-change').trigger('click')
    await flushPromises()
    expect(part(wrapper, 'settings', 'message').text()).toBe(`On ${date}, the plan switches to Team, billed monthly.`)
  })

  it('closes the switch and the pause on Escape, focus back on the button that opened each', async () => {
    subscribedTo('prod_pro')
    const wrapper = await section()
    for (const [toggle, group] of [['change-plan', 'switch-picker'], ['pause', 'pause-confirm']] as const) {
      const button = part(wrapper, 'settings', toggle)
      await button.trigger('click')
      await part(wrapper, 'settings', group).trigger('keydown', { key: 'Escape' })
      await flushPromises()
      expect(part(wrapper, 'settings', group).exists(), group).toBe(false)
      expect(button.attributes('aria-expanded')).toBe('false')
      expect(document.activeElement, toggle).toBe(button.element)
    }
  })

  it('offers no switch while the plan is set to end, paused, or already changing', async () => {
    for (const fields of [{ cancelAtPeriodEnd: true }, { status: 'paused' }, { pendingChange: { productId: 'prod_team', appliesAt: PERIOD_END } }]) {
      subscribedTo('prod_pro', fields)
      const wrapper = await section()
      expect(part(wrapper, 'settings', 'change-plan').exists(), JSON.stringify(fields)).toBe(false)
      wrapper.unmount()
    }
  })

  it('pauses from the period\'s end for the months picked, resuming by itself after them', async () => {
    const backend = subscribedTo('prod_pro')
    const wrapper = await section()
    const toggle = part(wrapper, 'settings', 'pause')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    const group = part(wrapper, 'settings', 'pause-confirm')
    expect(group.attributes('role')).toBe('group')
    expect(group.findAll('[data-settings="pause-length"]').map(length => length.text())).toEqual(['1 month', '2 months', '3 months'])
    await group.findAll('input[type="radio"]')[1]!.setValue(true)
    await part(wrapper, 'settings', 'confirm-pause').trigger('click')
    await flushPromises()
    const resumesAt = Date.parse('2099-05-15T00:00:00.000Z')
    expect(backend.callsTo('billing:pauseSubscription')).toEqual([{ subscriptionId: undefined, resumesAt }])
    expect(wrapper.emitted('plan-paused')).toEqual([[resumesAt]])
    const date = new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(resumesAt)
    expect(part(wrapper, 'settings', 'message').text()).toBe(`The plan pauses when this period ends and resumes ${date}.`)
  })

  it('offers no pause with one scheduled already, or on a plan set to end', async () => {
    for (const fields of [{ resumesAt: '2099-06-01T00:00:00.000Z' }, { cancelAtPeriodEnd: true }, { status: 'past_due' }]) {
      subscribedTo('prod_pro', fields)
      const wrapper = await section()
      expect(part(wrapper, 'settings', 'pause').exists(), JSON.stringify(fields)).toBe(false)
      wrapper.unmount()
    }
  })
})

describe('<PricingTable> and its address', () => {
  /** A billing manager on no plan yet, with a pack on sale too. */
  function buyer(): BackendMock {
    const backend = createBackendMock({
      user: {},
      queries: {
        'billing:getConfiguredProducts': PRODUCTS,
        'billing:getBillingAccess': { canManage: true },
        'billing:getCurrentSubscription': null,
        'billing:getPricing': { ...PRICING, packs: [{ key: 'credits100', productId: 'prod_pack', name: '100 credits', description: null, amount: 500, currency: 'usd', isBestValue: false }] },
      },
    })
    backend.stub('billing:generateCheckoutLink', () => ({ url: 'https://checkout.example.com/1' }))
    return backend
  }

  it('shows the yearly prices a ?interval=year link asks for', async () => {
    buyer()
    const wrapper = await mountSuspended(PricingTable, { route: '/pricing?interval=year' })
    await flushPromises()
    expect(wrapper.find('[data-pricing="plan"]').attributes('data-interval')).toBe('year')
  })

  it('brings the card a ?plan= link asks for into view', async () => {
    buyer()
    const scrolled: string[] = []
    const original = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
      scrolled.push(this.querySelector('[data-pricing="plan-name"]')?.textContent ?? '')
    }
    try {
      await mountSuspended(PricingTable, { route: '/pricing?plan=team' })
      await flushPromises()
    }
    finally {
      HTMLElement.prototype.scrollIntoView = original
    }
    expect(scrolled).toEqual(['Team'])
  })

  it('returns a plan\'s checkout and a pack\'s each where `successUrl` says', async () => {
    const backend = buyer()
    // A redirect checkout moves the page: the site's origin is read before it does.
    const origin = window.location.origin
    const wrapper = await mountSuspended(PricingTable, { props: { redirect: false, successUrl: { plan: chosen => `/welcome?plan=${chosen.key}`, pack: '/credits' } } })
    await flushPromises()
    await wrapper.find('[data-pricing="plan-action"][data-intent="subscribe"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-pricing="pack-action"]').trigger('click')
    await flushPromises()
    expect(backend.callsTo('billing:generateCheckoutLink').map(call => [(call as { productIds: string[] }).productIds[0], (call as { successUrl: string }).successUrl])).toEqual([
      ['prod_pro', `${origin}/welcome?plan=pro`],
      ['prod_pack', `${origin}/credits`],
    ])
  })
})
