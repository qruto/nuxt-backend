import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { h } from 'vue'
import { backendError } from '../../src/convex/errors'
import { createBackendMock, type BackendMock } from '../../src/runtime/test-utils'
import BackendNotices from '../../src/runtime/vue/components/shell/BackendNotices.vue'
import KeepAccount from '../../src/runtime/vue/components/account/KeepAccount.vue'

// The deletion notice of <BackendNotices> and the page behind the emailed
// "keep my account" link, over the backend mock: the notice reads the
// scheduled deletion live and keeps the account on a press; the page does
// the same with the link's token, for someone who is not signed in.

let backend: BackendMock

const DELETES_AT = Date.UTC(2027, 0, 31, 12)

beforeEach(() => {
  backend = createBackendMock({ user: {} })
  backend.state.queries['account:getAccountDeletion'] = { requestedAt: Date.UTC(2027, 0, 1), deletesAt: DELETES_AT }
  backend.stub('account:cancelAccountDeletion', () => {
    backend.state.queries['account:getAccountDeletion'] = null
    return true
  })
})

describe('the deletion notice of <BackendNotices>', () => {
  it('says when the account is deleted, and keeps it on a press, announcing that it is kept', async () => {
    const notices = await mountSuspended(BackendNotices, { attachTo: document.body })
    const notice = notices.find('[data-deletion="notice"]')
    expect(notice.attributes('aria-label')).toBe('Account deletion')
    expect(notice.find('[data-deletion="message"]').text()).toMatch(/^Your account will be deleted on .*2027.* Until then you can keep it\.$/)
    const keep = notice.find('button[data-deletion="keep"]')
    expect(keep.text()).toBe('Keep my account')
    ;(keep.element as HTMLElement).focus()
    await keep.trigger('click')
    await flushPromises()
    expect(backend.callsTo('account:cancelAccountDeletion')).toEqual([{}])
    // The button is gone with the deletion; the notice says it is kept and holds focus.
    expect(notices.find('button[data-deletion="keep"]').exists()).toBe(false)
    const kept = notices.find('[data-deletion="notice"] [data-deletion="message"]')
    expect(kept.text()).toBe('Your account is kept.')
    expect(document.activeElement).toBe(kept.element)
    expect(notices.find('[data-deletion="status"]').text()).toBe('Your account is kept.')
    notices.unmount()
  })

  it('shows nothing while no deletion is scheduled, and follows the deletion live', async () => {
    backend.state.queries['account:getAccountDeletion'] = null
    const notices = await mountSuspended(BackendNotices)
    expect(notices.find('[data-deletion="notice"]').exists()).toBe(false)
    backend.state.queries['account:getAccountDeletion'] = { requestedAt: 1, deletesAt: DELETES_AT }
    await flushPromises()
    expect(notices.find('[data-deletion="notice"]').exists()).toBe(true)
  })

  it('shows a refusal in an alert and leaves the button to press again', async () => {
    backend.stub('account:cancelAccountDeletion', () => {
      throw backendError('rate_limited', { limit: 'accountDelete', retryAfter: 60_000 })
    })
    const notices = await mountSuspended(BackendNotices)
    await notices.find('button[data-deletion="keep"]').trigger('click')
    await flushPromises()
    expect(notices.find('[data-deletion="error"][role="alert"]').exists()).toBe(true)
    expect(notices.find('button[data-deletion="keep"]').attributes('aria-disabled')).toBeUndefined()
  })

  it('takes a slot of the app\'s own, and an empty slot turns the notice off', async () => {
    const own = await mountSuspended(BackendNotices, {
      slots: { deletion: ({ deletion, keep }: { deletion: { deletesAt: number }, keep: () => Promise<void> }) => h('button', { 'data-test': 'own', 'onClick': keep }, `Deleted at ${deletion.deletesAt}`) },
    })
    expect(own.find('[data-test="own"]').text()).toBe(`Deleted at ${DELETES_AT}`)
    await own.find('[data-test="own"]').trigger('click')
    await flushPromises()
    expect(backend.callsTo('account:cancelAccountDeletion')).toHaveLength(1)

    backend.state.queries['account:getAccountDeletion'] = { requestedAt: 1, deletesAt: DELETES_AT }
    const off = await mountSuspended(BackendNotices, { slots: { deletion: () => [] } })
    expect(off.find('[data-deletion="notice"]').exists()).toBe(false)
  })
})

describe('the page behind the "keep my account" link', () => {
  it('changes nothing until the person presses the button, then cancels with the link\'s token', async () => {
    const page = await mountSuspended(KeepAccount, { props: { token: 'the-token' }, attachTo: document.body })
    expect(backend.callsTo('account:cancelAccountDeletion')).toEqual([])
    expect(page.find('[data-deletion="message"]').text()).toBe('Your account is scheduled for deletion. Keep it, and the deletion is cancelled.')
    const keep = page.find('button[data-deletion="keep"]')
    ;(keep.element as HTMLElement).focus()
    await keep.trigger('click')
    await flushPromises()
    expect(backend.callsTo('account:cancelAccountDeletion')).toEqual([{ token: 'the-token' }])
    expect(page.find('[data-deletion="keep-page"]').attributes('data-state')).toBe('kept')
    expect(page.find('[data-deletion="message"]').text()).toBe('Your account is kept, and the deletion is cancelled. We sent you a confirmation.')
    expect(document.activeElement).toBe(page.find('[data-deletion="message"]').element)
    expect(page.find('button[data-deletion="keep"]').exists()).toBe(false)
    page.unmount()
  })

  it('says there is nothing to cancel when the link is used or replaced', async () => {
    backend.stub('account:cancelAccountDeletion', () => false)
    const page = await mountSuspended(KeepAccount, { props: { token: 'old-token' } })
    await page.find('button[data-deletion="keep"]').trigger('click')
    await flushPromises()
    expect(page.find('[data-deletion="keep-page"]').attributes('data-state')).toBe('nothing')
    expect(page.find('[data-deletion="status"]').text()).toContain('There is nothing to cancel')
  })

  it('asks for the link again when it carries no token, and shows a failure as an alert', async () => {
    const without = await mountSuspended(KeepAccount)
    expect(without.find('[data-deletion="keep-page"]').attributes('data-state')).toBe('no-token')
    expect(without.find('button').exists()).toBe(false)
    backend.stub('account:cancelAccountDeletion', () => {
      throw backendError('unavailable', { service: 'convex', reason: 'provider_refused' })
    })
    const failing = await mountSuspended(KeepAccount, { props: { token: 'the-token' } })
    await failing.find('button[data-deletion="keep"]').trigger('click')
    await flushPromises()
    expect(failing.find('[data-deletion="error"][role="alert"]').exists()).toBe(true)
    expect(failing.find('button[data-deletion="keep"]').exists()).toBe(true)
  })
})
