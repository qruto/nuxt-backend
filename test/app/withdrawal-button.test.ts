import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { backendError } from '../../src/convex/errors'
import { createBackendMock, resetBackendMock, type BackendMock } from '../../src/runtime/test-utils'
import { registerComponents } from '../helpers/register-components'

await registerComponents('WithdrawalButton')
const { default: WithdrawalButton } = await import('../../src/runtime/vue/components/billing/WithdrawalButton.vue')

// <WithdrawalButton> over the backend mock: shown only for a purchase inside
// its 14 days, "Withdraw from contract here" opens a confirm step, and the
// confirmation is the scaffolded `withdraw` action; then when it was
// received, or why it failed.

enableAutoUnmount(afterEach)
afterEach(() => {
  resetBackendMock()
  vi.useRealTimers()
})

const DAY = 86_400_000
const long = (at: number) => new Intl.DateTimeFormat('en', { dateStyle: 'long' }).format(at)

/** A billing manager whose Pro purchase is inside its withdrawal period, which ends at `endsAt`. */
function manager(endsAt = Date.now() + 10 * DAY): BackendMock {
  return createBackendMock({
    user: {},
    queries: {
      'billing:getConfiguredProducts': { pro: { id: 'prod_pro', name: 'Pro' } },
      'billing:getWithdrawal': { period: { subscriptionId: 'sub_1', plan: 'pro', startedAt: Date.now() - 4 * DAY, endsAt } },
    },
  })
}

async function button(): Promise<VueWrapper> {
  const wrapper = await mountSuspended(WithdrawalButton, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

const part = (wrapper: VueWrapper, name: string) => wrapper.find(`[data-withdrawal="${name}"]`)

describe('<WithdrawalButton>', () => {
  it('renders nothing while the period loads, with no purchase in one, after it ended, or signed out', async () => {
    const backend = createBackendMock({ user: {} })
    const wrapper = await button()
    expect(wrapper.html()).not.toContain('data-withdrawal')

    for (const answer of [null, { period: null }, { period: { subscriptionId: 'sub_1', plan: 'pro', startedAt: 0, endsAt: Date.now() - DAY } }]) {
      backend.state.queries['billing:getWithdrawal'] = answer
      await flushPromises()
      expect(wrapper.html(), JSON.stringify(answer)).not.toContain('data-withdrawal')
    }

    backend.state.queries['billing:getWithdrawal'] = { period: { subscriptionId: 'sub_1', plan: 'pro', startedAt: 0, endsAt: Date.now() + DAY } }
    await flushPromises()
    expect(part(wrapper, 'root').exists()).toBe(true)
    // A period that cannot be read offers nothing: the server decides who may withdraw.
    backend.fail('billing:getWithdrawal', backendError('unavailable', { service: 'billing', reason: 'unexpected' }))
    await flushPromises()
    expect(wrapper.html()).not.toContain('data-withdrawal')
    backend.stub('billing:getWithdrawal', () => ({ period: { subscriptionId: 'sub_1', plan: 'pro', startedAt: 0, endsAt: Date.now() + DAY } }))
    await flushPromises()
    expect(part(wrapper, 'root').exists()).toBe(true)
    backend.signOut()
    await flushPromises()
    expect(wrapper.html()).not.toContain('data-withdrawal')
  })

  it('names the plan and the last day of the period, and opens its confirm step from the button it controls', async () => {
    const endsAt = Date.now() + 10 * DAY
    manager(endsAt)
    const wrapper = await button()
    expect(part(wrapper, 'root').attributes('data-state')).toBe('idle')
    expect(part(wrapper, 'period').text()).toBe(`You can withdraw from Pro until ${long(endsAt)}.`)
    const open = part(wrapper, 'button')
    expect(open.text()).toBe('Withdraw from contract here')
    expect(open.attributes('aria-expanded')).toBe('false')
    const controls = open.attributes('aria-controls')

    await open.trigger('click')
    const confirm = part(wrapper, 'confirm')
    expect(part(wrapper, 'root').attributes('data-state')).toBe('confirming')
    expect(confirm.attributes('id')).toBe(controls)
    expect(confirm.attributes('role')).toBe('group')
    expect(wrapper.find(`#${confirm.attributes('aria-labelledby')}`).text()).toBe('Withdraw from your Pro purchase?')
    expect(part(wrapper, 'confirm-text').text()).toBe('Your plan ends now. We email you a receipt, and refund what is due.')
    expect(part(wrapper, 'button').exists()).toBe(false)
  })

  it('goes back from the confirm step by its button and by Escape, withdrawing nothing', async () => {
    const backend = manager()
    const wrapper = await button()
    await part(wrapper, 'button').trigger('click')
    await part(wrapper, 'back').trigger('click')
    expect(part(wrapper, 'confirm').exists()).toBe(false)
    await part(wrapper, 'button').trigger('click')
    await part(wrapper, 'confirm').trigger('keydown', { key: 'Escape' })
    expect(part(wrapper, 'confirm').exists()).toBe(false)
    expect(backend.callsTo('billing:withdraw')).toEqual([])
  })

  it('withdraws the purchase in the period, and says when it was received', async () => {
    const backend = manager()
    const at = Date.UTC(2026, 9, 20, 14, 30)
    backend.stub('billing:withdraw', () => ({ withdrawnAt: at }))
    const wrapper = await button()
    await part(wrapper, 'button').trigger('click')
    await part(wrapper, 'confirm-button').trigger('click')
    await flushPromises()
    expect(backend.callsTo('billing:withdraw')).toEqual([{ subscriptionId: 'sub_1' }])
    expect(part(wrapper, 'root').attributes('data-state')).toBe('done')
    const done = part(wrapper, 'done')
    expect(done.attributes('role')).toBe('status')
    const time = new Intl.DateTimeFormat('en', { dateStyle: 'long', timeStyle: 'short' }).format(at)
    expect(done.text()).toBe(`We received your withdrawal on ${time}. A receipt is on its way to your email.`)
    expect(wrapper.emitted('withdrawn')).toEqual([[at]])

    // The receipt stays on screen though the period is over now.
    backend.state.queries['billing:getWithdrawal'] = { period: null }
    await flushPromises()
    expect(part(wrapper, 'done').exists()).toBe(true)
  })

  it('says why the withdrawal failed, as an alert, and keeps the confirm step open for another try', async () => {
    const backend = manager()
    backend.fail('billing:withdraw', backendError('unavailable', { service: 'billing', reason: 'unexpected' }))
    const wrapper = await button()
    await part(wrapper, 'button').trigger('click')
    await part(wrapper, 'confirm-button').trigger('click')
    await flushPromises()
    const error = part(wrapper, 'error')
    expect(error.attributes('role')).toBe('alert')
    expect(wrapper.emitted('error')).toEqual([[error.text()]])
    expect(part(wrapper, 'confirm').exists()).toBe(true)

    backend.stub('billing:withdraw', () => ({ withdrawnAt: Date.now() }))
    await part(wrapper, 'confirm-button').trigger('click')
    await flushPromises()
    expect(part(wrapper, 'error').exists()).toBe(false)
    expect(part(wrapper, 'done').exists()).toBe(true)
  })

  it('stays busy and focusable while the withdrawal is on its way, sending it once, and keeps the step open', async () => {
    const backend = manager()
    let land!: () => void
    backend.stub('billing:withdraw', () => new Promise((resolve) => {
      land = () => resolve({ withdrawnAt: Date.now() })
    }))
    const wrapper = await button()
    await part(wrapper, 'button').trigger('click')
    await part(wrapper, 'confirm-button').trigger('click')
    await flushPromises()
    const confirm = part(wrapper, 'confirm-button')
    expect(confirm.text()).toBe('Withdrawing…')
    expect(confirm.attributes('aria-disabled')).toBe('true')
    expect(confirm.attributes('disabled')).toBeUndefined()
    await confirm.trigger('click')
    await part(wrapper, 'back').trigger('click')
    expect(backend.callsTo('billing:withdraw')).toHaveLength(1)
    expect(part(wrapper, 'confirm').exists()).toBe(true)
    land()
    await flushPromises()
    expect(part(wrapper, 'done').exists()).toBe(true)
  })

  it('takes the button away once the period ends while the page is open', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    manager(Date.now() + 30_000)
    const wrapper = await button()
    expect(part(wrapper, 'button').exists()).toBe(true)
    vi.advanceTimersByTime(60_000)
    await flushPromises()
    expect(wrapper.html()).not.toContain('data-withdrawal')
  })
})
