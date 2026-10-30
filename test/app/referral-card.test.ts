import { afterEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { createBackendMock, resetBackendMock } from '../../src/runtime/test-utils'
import { registerComponents } from '../helpers/register-components'

await registerComponents('ReferralCard')
const { default: ReferralCard } = await import('../../src/runtime/vue/components/billing/ReferralCard.vue')

// <ReferralCard> over the backend mock: the person's link, and their choice
// to carry the code on the pages they share.

enableAutoUnmount(afterEach)
afterEach(() => resetBackendMock())

const program = { referred: { kind: 'trial', days: 14 }, referrer: { kind: 'months', months: 1 }, holdDays: 30, caps: { perReferrer: null, perMonth: null } }

describe('<ReferralCard>', () => {
  it('keeps the link on screen when the share-pages choice is refused, and puts the box back', async () => {
    const backend = createBackendMock({ user: {} })
    backend.stub('referrals:getReferralCode', () => ({ code: 'ADA123', sharePages: true, program }))
    backend.stub('referrals:getReferrals', () => ({ claimed: 0, held: 0, rewarded: 0, referrals: [] }))
    backend.fail('referrals:setReferralSharing', new Error('Provider unreachable'))
    const card = await mountSuspended(ReferralCard)
    await flushPromises()
    expect(card.find('[data-referral="root"]').attributes('data-state')).toBe('ready')

    const box = card.find<HTMLInputElement>('[data-referral="sharing-input"]')
    await box.setValue(false)
    await flushPromises()
    expect(backend.callsTo('referrals:setReferralSharing')).toEqual([{ share: false }])
    expect(card.find('[data-referral="root"]').attributes('data-state')).toBe('ready')
    expect(card.find<HTMLInputElement>('[data-referral="link"]').element.value).toContain('ADA123')
    expect(box.element.checked).toBe(true)
    expect(card.find('[data-referral="sharing-error"]').attributes('role')).toBe('alert')
    expect(card.emitted('error')).toHaveLength(1)
  })
})
