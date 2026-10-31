import { afterEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { backendError } from '../../src/convex/errors'
import type { SaveOffer } from '../../src/convex/integrations/billing/types/lifecycle'
import { createBackendMock, resetBackendMock, type BackendMock } from '../../src/runtime/test-utils'
import { registerComponents } from '../helpers/register-components'

await registerComponents('CancelFlow')
const { default: CancelFlow } = await import('../../src/runtime/vue/components/billing/CancelFlow.vue')

// <CancelFlow> over the backend mock: the one optional question, the one
// offer the server answers for it (worded by its real terms), the end with
// "Keep my plan", and "Cancel my plan" on every step before it. What each
// step sends is the scaffolded billing action the app's backend receives.

enableAutoUnmount(afterEach)
afterEach(() => resetBackendMock())

const PERIOD_END = Date.UTC(2026, 11, 1)
const long = (at: number) => new Intl.DateTimeFormat('en', { dateStyle: 'long' }).format(at)

/** A signed-in subscriber whose cancellation the server answers with `outcome`. */
function subscriber(outcome: unknown = { canceled: true, endsAt: PERIOD_END }): BackendMock {
  const backend = createBackendMock({
    user: {},
    queries: { 'billing:getConfiguredProducts': { pro: { id: 'prod_pro', name: 'Pro' }, team: { id: 'prod_team', name: 'Team' } } },
  })
  backend.stub('billing:cancelSubscription', () => outcome)
  backend.stub('billing:acceptSaveOffer', () => null)
  backend.stub('billing:uncancelSubscription', () => null)
  return backend
}

async function flow(props: Record<string, unknown> = {}): Promise<VueWrapper> {
  const wrapper = await mountSuspended(CancelFlow, { props, attachTo: document.body })
  await flushPromises()
  return wrapper
}

const part = (wrapper: VueWrapper, name: string) => wrapper.find(`[data-cancel-flow="${name}"]`)

/** Answer the question with `reason` and "Continue". */
async function answer(wrapper: VueWrapper, reason: string, comment = ''): Promise<void> {
  await wrapper.find(`input[value="${reason}"]`).setValue(true)
  if (comment) await part(wrapper, 'comment').setValue(comment)
  await part(wrapper, 'question').trigger('submit')
  await flushPromises()
}

const offer = (fields: Partial<Extract<SaveOffer, { kind: 'discount' }>>): SaveOffer => ({ id: 'offer_1', reason: 'too_expensive', kind: 'discount', discount: 'stay', name: 'Stay', duration: 'once', ...fields })

describe('<CancelFlow>', () => {
  it('asks its one optional question in a named group, and is named by its title', async () => {
    subscriber()
    const wrapper = await flow()
    const root = part(wrapper, 'root')
    expect(root.attributes('data-step')).toBe('question')
    expect(wrapper.find(`#${root.attributes('aria-labelledby')}`).text()).toBe('Cancel your plan')
    expect(part(wrapper, 'question-title').text()).toBe('What is the main reason? (optional)')
    expect(wrapper.findAll('[data-cancel-flow="reason"]').map(reason => reason.text())).toEqual([
      'Too expensive', 'Not using it enough', 'Missing features', 'Switched to another service',
      'Too complicated', 'Quality was lower than expected', 'Customer service', 'Something else',
    ])
    // One radio group: they share a name.
    expect(new Set(wrapper.findAll('[data-cancel-flow="reason-input"]').map(input => input.attributes('name'))).size).toBe(1)
    expect(part(wrapper, 'comment').attributes('maxlength')).toBe('500')
    expect(part(wrapper, 'cancel').text()).toBe('Cancel my plan')
  })

  it('sends the reason and the trimmed comment, and shows the pause the server offers, by its real terms', async () => {
    const resumesAt = Date.UTC(2027, 1, 1)
    const backend = subscriber({ offer: { id: 'offer_p', reason: 'unused', kind: 'pause', months: 2, resumesAt, plan: 'pro' } })
    const wrapper = await flow({ subscriptionId: 'sub_2' })
    await answer(wrapper, 'unused', '  Busy season  ')
    expect(backend.callsTo('billing:cancelSubscription')).toEqual([{ subscriptionId: 'sub_2', atPeriodEnd: true, reason: 'unused', comment: 'Busy season' }])
    expect(part(wrapper, 'root').attributes('data-step')).toBe('offer')
    expect(part(wrapper, 'title').text()).toBe('Before you go')
    const terms = part(wrapper, 'offer-terms')
    expect(terms.attributes('role')).toBe('status')
    expect(terms.text()).toBe(`Pause Pro for 2 months instead. It resumes by itself on ${long(resumesAt)}, and nothing is charged meanwhile.`)
    expect(part(wrapper, 'accept').text()).toBe('Pause instead')
    // "Cancel my plan" stays beside the offer.
    expect(part(wrapper, 'cancel').exists()).toBe(true)
  })

  it('words a cheaper plan, and each kind of discount, the way the offer runs', async () => {
    const appliesAt = Date.UTC(2026, 11, 1)
    const cases: Array<[SaveOffer, string, string]> = [
      [{ id: 'o1', reason: 'too_expensive', kind: 'downgrade', plan: 'team', appliesAt }, `Switch to Team instead, from ${long(appliesAt)}, when this period ends.`, 'Switch to Team'],
      // A plan the catalog does not name reads as its key.
      [{ id: 'o2', reason: 'too_expensive', kind: 'downgrade', plan: 'starter', appliesAt }, `Switch to starter instead, from ${long(appliesAt)}, when this period ends.`, 'Switch to starter'],
      [offer({ percentOff: 30, duration: 'repeating', months: 3 }), '30% off for 3 months', 'Keep my plan with this offer'],
      [offer({ percentOff: 50, duration: 'repeating' }), '50% off for 1 month', 'Keep my plan with this offer'],
      [offer({ amountOff: { usd: 500 }, duration: 'once' }), '$5.00 off your next payment', 'Keep my plan with this offer'],
      [offer({ percentOff: 10, duration: 'forever' }), '10% off for as long as you keep the plan', 'Keep my plan with this offer'],
    ]
    for (const [made, terms, accept] of cases) {
      subscriber({ offer: made })
      const wrapper = await flow()
      await answer(wrapper, 'too_expensive')
      expect(part(wrapper, 'offer').attributes('data-kind'), terms).toBe(made.kind)
      expect(part(wrapper, 'offer-terms').text()).toBe(terms)
      expect(part(wrapper, 'accept').text()).toBe(accept)
      wrapper.unmount()
    }
  })

  it('keeps the plan when the offer is accepted, says so, and closes after', async () => {
    const backend = subscriber({ offer: offer({ id: 'offer_9', percentOff: 20 }) })
    const wrapper = await flow()
    await answer(wrapper, 'too_expensive')
    await part(wrapper, 'accept').trigger('click')
    await flushPromises()
    expect(backend.callsTo('billing:acceptSaveOffer')).toEqual([{ offerId: 'offer_9' }])
    expect(part(wrapper, 'root').attributes('data-step')).toBe('kept')
    expect(part(wrapper, 'kept').attributes('role')).toBe('status')
    expect(part(wrapper, 'kept').text()).toBe('Your plan stays as it is.')
    expect(wrapper.emitted('kept')).toHaveLength(1)
    // The end has no "Cancel my plan": only a way out.
    expect(part(wrapper, 'cancel').exists()).toBe(false)
    await part(wrapper, 'close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('cancels at once past the offer, says when the plan ends, and undoes it with "Keep my plan"', async () => {
    const backend = subscriber({ offer: offer({ percentOff: 20 }) })
    const wrapper = await flow()
    await answer(wrapper, 'other')
    backend.stub('billing:cancelSubscription', () => ({ canceled: true, endsAt: PERIOD_END }))
    await part(wrapper, 'cancel').trigger('click')
    await flushPromises()
    // Past the offer: the server makes none, and cancels.
    expect(backend.callsTo('billing:cancelSubscription')[1]).toEqual({ atPeriodEnd: true, reason: 'other', offer: false })
    expect(part(wrapper, 'ends').text()).toBe(`Your plan ends on ${long(PERIOD_END)}.`)
    expect(part(wrapper, 'ends').attributes('role')).toBe('status')
    expect(wrapper.emitted('canceled')).toEqual([[PERIOD_END]])

    await part(wrapper, 'keep').trigger('click')
    await flushPromises()
    expect(backend.callsTo('billing:uncancelSubscription')).toEqual([{}])
    expect(part(wrapper, 'kept').exists()).toBe(true)
    expect(wrapper.emitted('kept')).toHaveLength(1)
  })

  it('says the plan ends with its period when the server names no date, as an older backend that answers nothing does', async () => {
    subscriber(null)
    const wrapper = await flow()
    await part(wrapper, 'question').trigger('submit')
    await flushPromises()
    expect(part(wrapper, 'root').attributes('data-step')).toBe('ended')
    expect(part(wrapper, 'ends').text()).toBe('Your plan ends when the current period does.')
    expect(wrapper.emitted('canceled')).toEqual([[null]])
  })

  it('says why a step failed, as an alert in the reader\'s words, and lets them try again', async () => {
    const backend = subscriber()
    backend.fail('billing:cancelSubscription', backendError('unavailable', { service: 'billing', reason: 'unexpected' }))
    const wrapper = await flow()
    await part(wrapper, 'cancel').trigger('click')
    await flushPromises()
    const error = part(wrapper, 'error')
    expect(error.attributes('role')).toBe('alert')
    expect(error.text()).not.toBe('')
    expect(wrapper.emitted('error')).toEqual([[error.text()]])
    expect(part(wrapper, 'root').attributes('data-step')).toBe('question')

    // Something that is no error at all reads as the flow's own sentence.
    backend.fail('billing:cancelSubscription', { reason: 'opaque' })
    await part(wrapper, 'cancel').trigger('click')
    await flushPromises()
    expect(part(wrapper, 'error').text()).toBe('That didn\'t work. Try again, or cancel in the billing portal.')

    backend.stub('billing:cancelSubscription', () => ({ canceled: true, endsAt: PERIOD_END }))
    await part(wrapper, 'cancel').trigger('click')
    await flushPromises()
    expect(part(wrapper, 'error').exists()).toBe(false)
    expect(part(wrapper, 'root').attributes('data-step')).toBe('ended')
  })

  it('runs one step at a time: busy and still focusable, and Escape closes it only when nothing runs', async () => {
    const backend = subscriber()
    let land!: () => void
    backend.stub('billing:cancelSubscription', () => new Promise((resolve) => {
      land = () => resolve({ canceled: true, endsAt: PERIOD_END })
    }))
    const wrapper = await flow()
    await part(wrapper, 'question').trigger('submit')
    await flushPromises()
    expect(part(wrapper, 'root').attributes('aria-busy')).toBe('true')
    const next = part(wrapper, 'continue')
    expect(next.text()).toBe('Canceling…')
    expect(next.attributes('aria-disabled')).toBe('true')
    expect(next.attributes('disabled')).toBeUndefined()
    await part(wrapper, 'cancel').trigger('click')
    await part(wrapper, 'root').trigger('keydown', { key: 'Escape' })
    expect(backend.callsTo('billing:cancelSubscription')).toHaveLength(1)
    expect(wrapper.emitted('close')).toBeUndefined()

    land()
    await flushPromises()
    expect(part(wrapper, 'root').attributes('aria-busy')).toBeUndefined()
    await part(wrapper, 'root').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('close')).toBeUndefined()
    await part(wrapper, 'root').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
