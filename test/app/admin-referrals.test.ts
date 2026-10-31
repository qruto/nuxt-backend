import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { enableAutoUnmount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { backendError } from '../../src/convex/errors'
import type { ReferralConsole, ReferralConsoleRow } from '../../src/convex/integrations/referrals'
import { createBackendMock, resetBackendMock, type BackendMock } from '../../src/runtime/test-utils'
import { useReferralAdmin } from '../../src/runtime/vue/composables/use-referral-admin'
import { registerComponents } from '../helpers/register-components'

await registerComponents('AdminReferrals')
const { default: AdminReferrals } = await import('../../src/runtime/vue/components/admin/AdminReferrals.vue')

// The admin console's Referrals tab over the backend mock, built on
// useReferralAdmin: the program's totals, the flagged queue an
// administrator releases or voids (a void after a confirmation), and one
// referrer's history, read with the console when they are picked.

enableAutoUnmount(afterEach)
afterEach(() => resetBackendMock())

const AT = Date.parse('2026-10-01T10:00:00.000Z')
const CONSOLE = 'referrals:getReferralConsole'

const row = (id: string, fields: Partial<ReferralConsoleRow> = {}): ReferralConsoleRow => ({ id, referrerId: 'u_ada', state: 'held', claimedAt: AT, paidAt: AT, holdUntil: AT + 30 * 86_400_000, rewardedAt: null, flags: [], released: false, capped: false, voidedFor: null, ...fields })

function consoleOf(fields: Partial<ReferralConsole> = {}): ReferralConsole {
  return {
    totals: { claimed: 7, held: 3, rewarded: 2, voided: 1, capped: 1, flagged: 1 },
    top: [{ referrerId: 'u_ada', name: 'Ada', referrals: 5, rewarded: 2 }, { referrerId: 'u_bob', name: null, referrals: 2, rewarded: 0 }],
    flagged: [row('r1', { flags: ['same_network', 'burst'] })],
    history: [],
    program: { referred: { kind: 'trial', days: 14 }, referrer: { kind: 'months', months: 1 }, holdDays: 30, caps: { perReferrer: 10, perMonth: null } },
    ...fields,
  }
}

/** An administrator; the console answers by its arguments, one referrer's history when one is named. */
function administrator(fields: Partial<ReferralConsole> = {}): BackendMock {
  const backend = createBackendMock({ user: { role: 'admin' } })
  backend.stub(CONSOLE, (args: { referrerId?: string }) => consoleOf({
    ...fields,
    ...(args.referrerId ? { history: [row('h1', { referrerId: args.referrerId, state: 'rewarded' }), row('h2', { referrerId: args.referrerId, state: 'claimed', capped: true })] } : {}),
  }))
  backend.stub('referrals:resolveReferral', () => ({ resolved: true }))
  return backend
}

async function tab(props: Record<string, unknown> = { confirm: () => true }): Promise<VueWrapper> {
  const wrapper = await mountSuspended(AdminReferrals, { props, attachTo: document.body })
  await flushPromises()
  return wrapper
}

const button = (wrapper: VueWrapper, scope: string, text: string) => wrapper.find(scope).findAll('button').find(candidate => candidate.text() === text)!

describe('the Referrals tab', () => {
  it('counts the referrals by state, and says the program\'s hold and caps', async () => {
    administrator()
    const wrapper = await tab()
    const counts = wrapper.find('[data-admin="referrals-counts"]')
    expect(counts.attributes('aria-label')).toBe('Referrals by state')
    expect(counts.findAll('li').map(item => [item.attributes('data-state'), item.find('[data-admin="referrals-count"]').text()])).toEqual([
      ['claimed', '7'], ['held', '3'], ['rewarded', '2'], ['voided', '1'], ['capped', '1'], ['flagged', '1'],
    ])
    const program = wrapper.find('[data-admin="referrals-program"]').text()
    expect(program).toContain('Hold: 30 days')
    expect(program).toContain('At most 10 rewards per referrer.')
    expect(program).not.toContain('a month')
  })

  it('lists the flagged referrals with why, and releases one, saying so', async () => {
    const backend = administrator()
    const wrapper = await tab()
    const flagged = wrapper.find('[data-admin="referrals-flagged"] tbody tr')
    expect(flagged.attributes('data-state')).toBe('held')
    expect(flagged.findAll('td')[2]!.text()).toBe('One network and browser for both sides, A burst on one code')
    await button(wrapper, '[data-admin="referrals-flagged"]', 'Release').trigger('click')
    await flushPromises()
    expect(backend.callsTo('referrals:resolveReferral')).toEqual([{ id: 'r1', resolution: 'release' }])
    expect(wrapper.find('[data-admin="message"]').attributes('role')).toBe('status')
    expect(wrapper.find('[data-admin="message"]').text()).toBe('The reward was released.')
  })

  it('voids a referral only once the administrator confirms, in the tab\'s own dialog', async () => {
    const backend = administrator()
    const wrapper = await tab({})
    await button(wrapper, '[data-admin="referrals-flagged"]', 'Void').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-confirm="text"]').text()).toBe('Void this referral? Nobody gets its reward.')
    await wrapper.find('[data-confirm="cancel"]').trigger('click')
    await flushPromises()
    expect(backend.callsTo('referrals:resolveReferral')).toEqual([])

    await button(wrapper, '[data-admin="referrals-flagged"]', 'Void').trigger('click')
    await flushPromises()
    await wrapper.find('[data-confirm="accept"]').trigger('click')
    await flushPromises()
    expect(backend.callsTo('referrals:resolveReferral')).toEqual([{ id: 'r1', resolution: 'void' }])
    expect(wrapper.find('[data-admin="message"]').text()).toBe('The referral was voided.')
  })

  it('says why a decision was refused, as an alert, and keeps the row', async () => {
    const backend = administrator()
    backend.fail('referrals:resolveReferral', backendError('forbidden', { reason: 'not_admin' }))
    const wrapper = await tab()
    await button(wrapper, '[data-admin="referrals-flagged"]', 'Release').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-admin="message"]').attributes()).toMatchObject({ 'role': 'alert', 'data-state': 'error' })
    expect(wrapper.find('[data-admin="referrals-flagged"] tbody tr').exists()).toBe(true)
  })

  it('shows a referrer\'s history when picked, and hides it on the second press', async () => {
    administrator()
    const wrapper = await tab()
    const top = wrapper.findAll('[data-admin="referrals-top"] tbody tr')
    // A referrer without a name reads as their id.
    expect(top.map(entry => entry.find('th').text())).toEqual(['Ada', 'u_bob'])
    expect(wrapper.find('[data-admin="referrals-history"]').exists()).toBe(false)

    const history = top[0]!.find('button')
    expect(history.attributes('aria-pressed')).toBe('false')
    await history.trigger('click')
    await flushPromises()
    expect(history.attributes('aria-pressed')).toBe('true')
    const rows = wrapper.findAll('[data-admin="referrals-history"] tbody tr')
    // A referral past the caps reads as such, whatever state it holds.
    expect(rows.map(entry => entry.find('th').text())).toEqual(['Rewarded', 'Past the caps'])

    await history.trigger('click')
    await flushPromises()
    expect(history.attributes('aria-pressed')).toBe('false')
    expect(wrapper.find('[data-admin="referrals-history"]').exists()).toBe(false)
  })

  it('says when nothing waits and nobody referred anyone yet', async () => {
    administrator({ flagged: [], top: [] })
    const wrapper = await tab()
    expect(wrapper.findAll('[data-admin="referrals-empty"]').map(note => note.text())).toEqual(['Nothing waits for a decision.', 'No referrals yet.'])
  })

  it('says it is loading until the console lands, why a read failed, and that the tab is for administrators', async () => {
    const backend = createBackendMock({ user: { role: 'admin' } })
    const wrapper = await tab()
    expect(wrapper.find('[data-admin="loading"]').attributes()).toMatchObject({ 'role': 'status', 'aria-live': 'polite' })
    expect(wrapper.find('[data-admin="referrals"]').attributes('aria-busy')).toBe('true')

    backend.fail(CONSOLE, backendError('unavailable', { service: 'backend', reason: 'unexpected' }))
    await flushPromises()
    expect(wrapper.find('[data-admin="error"]').attributes('role')).toBe('alert')

    backend.stub(CONSOLE, () => null)
    await flushPromises()
    expect(wrapper.find('[data-admin="refused"]').text()).toBe('Only administrators see and change referrals.')
  })
})

describe('useReferralAdmin', () => {
  async function inPage<T>(composable: () => T): Promise<T> {
    let result!: T
    await mountSuspended(defineComponent({
      setup() {
        result = composable()
        return () => h('div')
      },
    }))
    return result
  }

  it('answers whether a decision went through, and names what is missing without resolveReferral', async () => {
    const backend = administrator()
    backend.stub('referrals:resolveReferral', () => ({ resolved: false }))
    const admin = await inPage(() => useReferralAdmin())
    expect(await admin.resolve('r1', 'release')).toBe(false)

    const bare = await inPage(() => useReferralAdmin({ api: {} }))
    await expect(bare.resolve('r1', 'void')).rejects.toThrow('`resolveReferral`')
    expect(bare.isLoading.value).toBe(false)
  })

  it('waits on the session, and shows a visitor no console, no refusal and no error', async () => {
    const backend = createBackendMock({ isLoading: true })
    backend.stub(CONSOLE, () => null)
    const admin = await inPage(() => useReferralAdmin())
    expect(admin.console.value).toBeUndefined()
    expect(admin.isLoading.value).toBe(true)
    backend.state.isLoading = false
    await flushPromises()
    expect([admin.console.value, admin.isLoading.value, admin.isRefused.value, admin.error.value]).toEqual([null, false, false, null])
  })
})
