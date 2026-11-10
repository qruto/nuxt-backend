import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { clearNuxtData, useRouter, useState } from '#app'
import { backendError } from '../../src/convex/errors'
import type { PricedPlan, Pricing } from '../../src/convex/integrations/billing/types/records'
import { createBackendMock, resetBackendMock, type BackendMock } from '../../src/runtime/test-utils'
import { useGiftForm, type UseGiftFormReturn } from '../../src/runtime/vue/composables/use-gift-form'
import { registerComponents } from '../helpers/register-components'
import { inRuntimeLocale } from '../helpers/runtime-locale'
import { serverRender } from '../helpers/server-render'

// Where the provider's page opens: nowhere, here.
vi.mock('../../src/runtime/vue/utils/open-url', () => ({ openProviderUrl: vi.fn() }))

await registerComponents('GiftForm')
const { default: GiftForm } = await import('../../src/runtime/vue/components/billing/GiftForm.vue')

// The gift form over the backend mock: a credit pack or a plan pass whose
// lengths are the plan's gift lengths at their live prices, the recipient,
// a note and a day, the purchaser's checkout (`giftCheckout`), a visitor
// signed in and brought back with the choice kept, and the return from a
// paid checkout (`?sent=1`).

enableAutoUnmount(afterEach)
afterEach(() => resetBackendMock())
beforeEach(() => {
  clearNuxtData()
  useState('backend:pricing:currency').value = null
})

const length = (months: number, amount: number) => ({ months, amount, currency: 'usd', monthly: amount / months })
const PRO: PricedPlan = {
  key: 'pro',
  name: 'Pro',
  description: null,
  retired: false,
  prices: { month: { productId: 'prod_pro', amount: 900, currency: 'usd', monthly: 900 } },
  features: [],
  featureKeys: [],
  gift: { lengths: [length(1, 900), length(3, 2700), length(12, 9000)] },
}
const PRICING: Pricing = {
  plans: [
    { key: 'free', name: 'Free', description: null, retired: false, free: true, prices: { month: { productId: 'prod_free', amount: 0, currency: 'usd', monthly: 0 } }, features: [], featureKeys: [] },
    PRO,
    // Not giftable: no lengths.
    { ...PRO, key: 'team', name: 'Team', gift: undefined },
  ],
  packs: [
    { key: 'credits100', productId: 'prod_c100', name: '100 credits', description: null, amount: 500, currency: 'usd', isBestValue: false },
    { key: 'credits500', productId: 'prod_c500', name: '500 credits', description: null, amount: 2000, currency: 'usd', isBestValue: true },
  ],
  currency: 'usd',
  currencies: ['usd'],
}

function backend(signedIn = true): BackendMock {
  const mock = createBackendMock({ ...(signedIn ? { user: {} } : {}), queries: { 'billing:getPricing': PRICING, 'billing:getReceivedGifts': [], 'billing:getSentGifts': [] } })
  mock.stub('billing:giftCheckout', () => ({ url: 'https://checkout.example.com/gift' }))
  return mock
}

async function form(route = '/gifts'): Promise<UseGiftFormReturn> {
  let state!: UseGiftFormReturn
  await mountSuspended(defineComponent({
    setup() {
      state = useGiftForm()
      return () => h('div')
    },
  }), { route })
  await flushPromises()
  return state
}

describe('useGiftForm', () => {
  it('offers the packs and the giftable plans, picking the first of each, with the plan\'s gift lengths at their prices', async () => {
    backend()
    const gift = await form()
    expect(gift.kinds.value).toEqual(['pack', 'pass'])
    expect(gift.kind.value).toBe('pack')
    expect(gift.packs.value.map(pack => pack.key)).toEqual(['credits100', 'credits500'])
    expect(gift.plans.value.map(plan => plan.key)).toEqual(['pro'])
    expect(gift.choice.value).toMatchObject({ kind: 'pack', key: 'credits100', amount: 500, price: '$5' })
    gift.kind.value = 'pass'
    expect(gift.lengths.value.map(entry => entry.months)).toEqual([1, 3, 12])
    expect(gift.months.value).toBe(1)
    gift.months.value = 12
    expect(gift.choice.value).toMatchObject({ kind: 'pass', key: 'pro', name: 'Pro', months: 12, amount: 9000, price: '$90' })
  })

  it('starts from the address: a plan pass of the months it names, or a pack', async () => {
    backend()
    const pass = await form('/gifts?plan=pro&months=3')
    expect(pass.kind.value).toBe('pass')
    expect(pass.choice.value).toMatchObject({ key: 'pro', months: 3, amount: 2700 })
    clearNuxtData()
    backend()
    const pack = await form('/gifts?pack=credits500')
    expect(pack.choice.value).toMatchObject({ kind: 'pack', key: 'credits500' })
    clearNuxtData()
    backend()
    // A length the plan is not gifted for moves to its first.
    expect((await form('/gifts?plan=pro&months=7')).months.value).toBe(1)
  })

  it('checks the purchaser out for a pass, with the note, the day, the currency, and a return to this page with ?sent=1', async () => {
    const mock = backend()
    const gift = await form('/gifts?plan=pro&months=3')
    gift.recipientEmail.value = ' friend@example.com '
    gift.message.value = '  Happy reading!  '
    gift.deliverOn.value = '2099-12-24'
    await expect(gift.send()).resolves.toBe(true)
    expect(mock.callsTo('billing:giftCheckout')).toEqual([expect.objectContaining({
      plan: 'pro',
      months: 3,
      recipientEmail: 'friend@example.com',
      message: 'Happy reading!',
      deliverAt: Date.parse('2099-12-24T09:00:00Z'),
      currency: 'usd',
      successUrl: `${window.location.origin}/gifts?plan=pro&months=3&sent=1`,
    })])
  })

  it('sends a visitor to sign in first, back to the form with the choice kept, and buys nothing', async () => {
    const mock = backend(false)
    const gift = await form('/gifts')
    gift.kind.value = 'pass'
    gift.months.value = 12
    await expect(gift.send()).resolves.toBe(false)
    await vi.waitFor(() => expect(useRouter().currentRoute.value.fullPath).toBe(`/login?redirect=${encodeURIComponent('/gifts?plan=pro&months=12')}`))
    expect(mock.callsTo('billing:giftCheckout')).toEqual([])
  })

  it('keeps a refusal in `error`, naming its field, and never rejects', async () => {
    const mock = backend()
    mock.fail('billing:giftCheckout', backendError('invalid_input', { field: 'recipientEmail' }, 'Not that address.'))
    const gift = await form()
    gift.recipientEmail.value = 'me@example.com'
    await expect(gift.send()).resolves.toBe(false)
    expect(gift.error.value).toMatchObject({ code: 'invalid_input' })
    expect(gift.invalidField.value).toBe('recipientEmail')
    expect(gift.isPending.value).toBe(false)
  })

  it('reads a return from a paid checkout once, taking ?sent=1 off the address', async () => {
    backend()
    const gift = await form('/gifts?sent=1')
    expect(gift.sent.value).toBe(true)
    await vi.waitFor(() => expect(useRouter().currentRoute.value.query.sent).toBeUndefined())
  })

  it('holds the same choice on a server render, whose pricing arrives after setup, as in the browser', async () => {
    const mock = backend()
    const choiceText = (gift: UseGiftFormReturn) => {
      const chosen = gift.choice.value
      return chosen ? `${chosen.kind} ${chosen.key} ${chosen.price}` : 'none'
    }
    // A server render: setup runs before the pricing arrives, watchers never
    // fire after it, and the page renders once the pricing is there.
    delete mock.state.queries['billing:getPricing']
    const server = await serverRender(defineComponent({
      async setup() {
        const gift = useGiftForm()
        mock.state.queries['billing:getPricing'] = PRICING
        await vi.waitFor(() => expect(gift.isLoading.value).toBe(false))
        return () => h('p', choiceText(gift))
      },
    }))
    // The browser hydrates with the pricing already in hand.
    const browser = await form()
    expect(server).toBe(`<p>${choiceText(browser)}</p>`)
    expect(server).toBe('<p>pack credits100 $5</p>')
  })

  it('prices the choice alike on a server and in a browser whose default locales differ', async () => {
    backend()
    const price = () => h('p', useGiftForm().choice.value?.price)
    const server = await inRuntimeLocale('en-US', () => serverRender(defineComponent({ setup: () => price })))
    const browser = await inRuntimeLocale('de-DE', async () => (await form()).choice.value?.price)
    expect(server).toBe(`<p>${browser}</p>`)
    expect(browser).toBe('$5')
  })

  it('bounds the delivery day from today to a year ahead', async () => {
    backend()
    const gift = await form()
    expect(gift.firstDay.value).toBe(new Date().toISOString().slice(0, 10))
    expect(Date.parse(gift.lastDay.value) - Date.parse(gift.firstDay.value)).toBe(365 * 24 * 60 * 60 * 1000)
  })
})

describe('<GiftForm>', () => {
  async function mounted(route = '/gifts'): Promise<VueWrapper> {
    const wrapper = await mountSuspended(GiftForm, { route })
    await flushPromises()
    return wrapper
  }
  const part = (wrapper: VueWrapper, name: string) => wrapper.find(`[data-gift="${name}"]`)

  it('names its price on the button, and the lengths of a pass from the plan', async () => {
    backend()
    const wrapper = await mounted()
    expect(part(wrapper, 'send').text()).toBe('Pay $5 and send')
    await wrapper.find('[data-gift="kinds"] input[value="pass"]').setValue(true)
    expect(wrapper.findAll('[data-gift="lengths"] [data-gift="option"]').map(option => option.text())).toEqual(['1 month', '3 months', '12 months'])
    expect(part(wrapper, 'pass-hint').exists()).toBe(true)
    await wrapper.findAll('[data-gift="lengths"] input')[1]!.setValue(true)
    expect(part(wrapper, 'send').text()).toBe('Pay $27 and send')
  })

  it('marks the field a refusal names, described by the alert, and tells its listener', async () => {
    const mock = backend()
    mock.fail('billing:giftCheckout', backendError('invalid_input', { field: 'recipientEmail' }, 'That address cannot receive a gift.'))
    const wrapper = await mounted()
    await part(wrapper, 'input-recipient').setValue('me@example.com')
    await part(wrapper, 'form').trigger('submit')
    await flushPromises()
    const alert = part(wrapper, 'form-error')
    expect(alert.attributes('role')).toBe('alert')
    const input = part(wrapper, 'input-recipient')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(input.attributes('aria-describedby')).toBe(alert.attributes('id'))
    expect(wrapper.emitted('error')).toEqual([[alert.text()]])
  })

  it('asks a visitor to sign in to send, and says a paid gift is on its way', async () => {
    backend(false)
    expect(part(await mounted(), 'send').text()).toBe('Sign in to send a gift')
    clearNuxtData()
    backend()
    const back = await mounted('/gifts?sent=1')
    expect(part(back, 'sent').text()).toBe('Paid. The gift goes out on the day you picked; you will find it under Sent.')
  })
})
