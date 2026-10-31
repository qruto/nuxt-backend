import { afterEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { backendError } from '../../src/convex/errors'
import type { AnnouncementRow, AnnouncementsConsole } from '../../src/convex/integrations/announcements'
import { createBackendMock, resetBackendMock, type BackendMock } from '../../src/runtime/test-utils'
import { registerComponents } from '../helpers/register-components'

await registerComponents('AdminAnnouncements')
const { default: AdminAnnouncements } = await import('../../src/runtime/vue/components/admin/AdminAnnouncements.vue')

// The admin console's Announcements tab over the backend mock: the composer
// that publishes a notice (and the email that may go with it), the list with
// where each notice and its email stand, and the changes it sends to
// backend/email.ts, one at a time, a destructive one after a confirmation.

enableAutoUnmount(afterEach)
afterEach(() => resetBackendMock())

const HOUR = 3_600_000
const DAY = 24 * HOUR
const CONSOLE = 'email:getAnnouncementsConsole'

function announcement(id: string, fields: Partial<AnnouncementRow> = {}): AnnouncementRow {
  return { id, message: `Notice ${id}`, expiresAt: Date.now() + DAY, publishedAt: Date.now() - HOUR, ...fields }
}

function consoleOf(fields: Partial<AnnouncementsConsole> = {}): AnnouncementsConsole {
  return {
    announcements: [],
    topics: [{ key: 'product', name: 'Product news' }, { key: 'tips', name: 'Tips' }],
    audiences: { accounts: true, waitlist: true },
    canBroadcast: true,
    postalAddress: true,
    ...fields,
  }
}

/** An administrator, the console answering `fields`, and every change answered. */
function administrator(fields: Partial<AnnouncementsConsole> = {}): BackendMock {
  const backend = createBackendMock({ user: { role: 'admin' }, queries: { [CONSOLE]: consoleOf(fields) } })
  backend.stub('email:publishAnnouncement', () => ({ id: 'a-new' }))
  backend.stub('email:endAnnouncement', () => ({ ended: true }))
  backend.stub('email:previewAnnouncement', () => ({ emailId: 'em_1' }))
  backend.stub('email:sendAnnouncement', (args: { scheduledAt?: number }) => ({ sendAt: args.scheduledAt ?? Date.now() }))
  backend.stub('email:cancelAnnouncement', () => ({ cancelled: true }))
  return backend
}

async function tab(props: Record<string, unknown> = { confirm: () => true }): Promise<VueWrapper> {
  const wrapper = await mountSuspended(AdminAnnouncements, { props, attachTo: document.body })
  await flushPromises()
  return wrapper
}

const message = (wrapper: VueWrapper) => wrapper.find('[data-admin="message"]')
const item = (wrapper: VueWrapper, id: string) => wrapper.findAll('[data-admin="announcement"]').find(row => row.text().includes(`Notice ${id}`))!

/** A `datetime-local` value for `at`, in the browser's own zone, as the input holds one. */
function localInput(at: number): string {
  const date = new Date(at)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

describe('the Announcements tab', () => {
  it('says it is loading until the console lands, and says the tab is for administrators to anyone else', async () => {
    const backend = createBackendMock({ user: { role: 'admin' } })
    const wrapper = await tab()
    const loading = wrapper.find('[data-admin="loading"]')
    expect(loading.attributes()).toMatchObject({ 'role': 'status', 'aria-live': 'polite' })
    expect(wrapper.find('[data-admin="announcements"]').attributes('aria-busy')).toBe('true')
    expect(wrapper.find('[data-admin="announcements-compose"]').exists()).toBe(false)

    backend.state.queries[CONSOLE] = consoleOf()
    await flushPromises()
    expect(wrapper.find('[data-admin="loading"]').exists()).toBe(false)
    expect(wrapper.find('[data-admin="announcements"]').attributes('aria-busy')).toBeUndefined()
    expect(wrapper.find('[data-admin="announcements-empty"]').text()).toBe('Nothing published yet.')

    backend.state.queries[CONSOLE] = null
    await flushPromises()
    expect(wrapper.find('[data-admin="refused"]').text()).toBe('Only administrators see and publish announcements.')
    expect(wrapper.find('[data-admin="announcements-compose"]').exists()).toBe(false)
  })

  it('says why the console could not be read, as an alert', async () => {
    const backend = createBackendMock({ user: { role: 'admin' } })
    backend.fail(CONSOLE, backendError('unavailable', { service: 'backend', reason: 'unexpected' }))
    const wrapper = await tab()
    expect(wrapper.find('[data-admin="error"]').attributes('role')).toBe('alert')
    expect(wrapper.find('[data-admin="loading"]').exists()).toBe(false)
  })

  it('publishes a notice with its link and an email under the first topic, then empties the composer', async () => {
    const backend = administrator()
    const wrapper = await tab()
    const form = wrapper.find('[data-admin="announcements-compose"]')
    expect(form.attributes('aria-labelledby')).toBe(form.find('h3').attributes('id'))
    const textarea = form.find<HTMLTextAreaElement>('textarea')
    expect(textarea.attributes('maxlength')).toBe('280')
    // The hint under the notice is what a screen reader reads with it.
    expect(form.find(`#${textarea.attributes('aria-describedby')}`).text()).toBe('One or two sentences, up to 280 characters.')
    // The expiry starts a week out, to the minute.
    const expiry = form.find<HTMLInputElement>('input[type="datetime-local"]')
    expect(Math.abs(new Date(expiry.element.value).getTime() - (Date.now() + 7 * DAY))).toBeLessThan(2 * 60_000)

    await textarea.setValue('Pro is 20% off this week.')
    const [link, words] = form.findAll<HTMLInputElement>('input[type="text"]')
    await link!.setValue('  /pricing  ')
    await words!.setValue(' See plans ')
    expect(form.find('[data-admin="announcements-email"]').exists()).toBe(false)
    await form.find('input[type="checkbox"]').setValue(true)
    const email = form.find('[data-admin="announcements-email"]')
    expect(email.find('legend').text()).toBe('To')
    expect(email.findAll('option').map(option => option.text())).toEqual(['Product news', 'Tips'])
    await email.find('input[maxlength="150"]').setValue('This week only')
    await email.find('textarea').setValue('Pro is 20% off.')
    await form.trigger('submit')
    await flushPromises()

    const [sent] = backend.callsTo('email:publishAnnouncement') as Array<Record<string, unknown>>
    expect(sent).toEqual({
      message: 'Pro is 20% off this week.',
      link: { url: '/pricing', label: 'See plans' },
      expiresAt: new Date(expiry.element.value).getTime(),
      broadcast: { audience: 'accounts', topic: 'product', subject: 'This week only', body: 'Pro is 20% off.' },
    })
    expect(message(wrapper).text()).toBe('Published: the notice shows now.')
    expect(message(wrapper).attributes()).toMatchObject({ 'role': 'status', 'data-state': 'ok' })
    expect(textarea.element.value).toBe('')
    expect(link!.element.value).toBe('')
    expect(wrapper.find('[data-admin="announcements-email"]').exists()).toBe(false)
  })

  it('sends a notice without a link as its words and expiry alone, and an email to the waitlist under no topic', async () => {
    const backend = administrator()
    const wrapper = await tab()
    const form = wrapper.find('[data-admin="announcements-compose"]')
    await form.find('textarea').setValue('We launch on Monday.')
    const at = Date.now() + 3 * DAY
    await form.find('input[type="datetime-local"]').setValue(localInput(at))
    await form.trigger('submit')
    await flushPromises()
    expect(backend.callsTo('email:publishAnnouncement')).toEqual([{ message: 'We launch on Monday.', expiresAt: Math.floor(at / 60_000) * 60_000 }])

    await form.find('textarea').setValue('Doors open.')
    await form.find('input[type="checkbox"]').setValue(true)
    await form.find('input[type="radio"][value="waitlist"]').setValue(true)
    // The topic is the accounts' choice: the waitlist has none.
    expect(form.find('select').exists()).toBe(false)
    await form.find('input[maxlength="150"]').setValue('We are open')
    await form.find('[data-admin="announcements-email"] textarea').setValue('Come in.')
    await form.trigger('submit')
    await flushPromises()
    expect(backend.callsTo('email:publishAnnouncement')[1]).toMatchObject({ broadcast: { audience: 'waitlist', subject: 'We are open', body: 'Come in.' } })
    expect((backend.callsTo('email:publishAnnouncement')[1] as { broadcast: object }).broadcast).not.toHaveProperty('topic')
  })

  it('keeps the draft and says why, as an alert, when publishing is refused', async () => {
    const backend = administrator()
    backend.fail('email:publishAnnouncement', backendError('invalid_input', { field: 'expiresAt' }, 'A notice expires within 90 days.'))
    const wrapper = await tab()
    const textarea = wrapper.find<HTMLTextAreaElement>('[data-admin="announcements-compose"] textarea')
    await textarea.setValue('Too far out.')
    await wrapper.find('[data-admin="announcements-compose"]').trigger('submit')
    await flushPromises()
    expect(message(wrapper).attributes()).toMatchObject({ 'role': 'alert', 'data-state': 'error' })
    expect(message(wrapper).text()).not.toBe('')
    expect(textarea.element.value).toBe('Too far out.')
    expect(wrapper.find('[data-admin="announcements-publish"]').text()).toBe('Publish')
  })

  it('lists each notice by where it stands, and ends only a live one', async () => {
    administrator({
      announcements: [
        announcement('live'),
        announcement('ended', { endedAt: Date.now() - HOUR }),
        announcement('expired', { expiresAt: Date.now() - HOUR }),
      ],
    })
    const wrapper = await tab()
    const list = wrapper.find('[data-admin="announcements-list"]')
    expect(wrapper.find(`#${list.attributes('aria-labelledby')}`).text()).toBe('Published')
    expect(wrapper.findAll('[data-admin="announcement"]').map(row => row.attributes('data-state'))).toEqual(['live', 'ended', 'expired'])
    expect(item(wrapper, 'live').find('[data-admin="announcement-state"]').text()).toMatch(/^Live until /)
    expect(item(wrapper, 'ended').find('[data-admin="announcement-state"]').text()).toMatch(/^Ended /)
    expect(item(wrapper, 'expired').find('[data-admin="announcement-state"]').text()).toMatch(/^Expired /)
    expect(wrapper.findAll('[data-admin="announcement-end"]')).toHaveLength(1)
    expect(item(wrapper, 'live').find('[data-admin="announcement-end"]').text()).toBe('End notice')
  })

  it('ends a notice only once the administrator confirms in the tab\'s own dialog', async () => {
    const backend = administrator({ announcements: [announcement('a1')] })
    const wrapper = await tab({})
    const end = item(wrapper, 'a1').find('[data-admin="announcement-end"]')
    await end.trigger('click')
    await flushPromises()
    const dialog = wrapper.find('[data-confirm="dialog"]')
    expect(dialog.attributes('role')).toBe('alertdialog')
    expect(wrapper.find(`#${dialog.attributes('aria-labelledby')}`).text()).toBe('End this notice now? It goes away for everyone.')
    await dialog.find('[data-confirm="cancel"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-confirm="dialog"]').exists()).toBe(false)
    expect(backend.callsTo('email:endAnnouncement')).toEqual([])

    await end.trigger('click')
    await flushPromises()
    await wrapper.find('[data-confirm="accept"]').trigger('click')
    await flushPromises()
    expect(backend.callsTo('email:endAnnouncement')).toEqual([{ id: 'a1' }])
  })

  it('says where each email stands, and offers to send or cancel only one that has not gone out', async () => {
    const email = (state: NonNullable<AnnouncementRow['broadcast']>['state'], sendAt?: number) => ({ audience: 'accounts' as const, topic: 'product', subject: `Subject ${state}`, body: 'Body', state, ...(sendAt === undefined ? {} : { sendAt }) })
    administrator({
      announcements: [
        announcement('draft', { broadcast: email('draft') }),
        announcement('created', { broadcast: email('created') }),
        announcement('creating', { broadcast: email('creating') }),
        announcement('scheduled', { broadcast: email('sent', Date.now() + DAY) }),
        announcement('sent', { broadcast: email('sent', Date.now() - DAY) }),
        announcement('unsent', { broadcast: email('sent') }),
        announcement('cancelled', { broadcast: email('cancelled') }),
        announcement('plain'),
      ],
    })
    const wrapper = await tab()
    const group = (id: string) => item(wrapper, id).find('[data-admin="announcement-email"]')
    const controls = (id: string) => ['preview', 'send', 'cancel'].filter(action => group(id).find(`[data-admin="announcement-${action}"]`).exists())
    expect(group('draft').attributes()).toMatchObject({ 'role': 'group', 'aria-label': 'Email: Subject draft' })
    expect(group('draft').find('p').text()).toBe('Email: Subject draft · Not sent')
    expect(group('created').find('p').text()).toContain('· Not sent')
    expect(group('creating').find('p').text()).toContain('· Sending…')
    expect(group('scheduled').find('p').text()).toMatch(/· Scheduled for /)
    expect(group('sent').find('p').text()).toMatch(/· Sent /)
    expect(group('unsent').find('p').text()).toContain('· Not sent')
    expect(group('cancelled').find('p').text()).toContain('· Cancelled')
    expect(item(wrapper, 'plain').find('[data-admin="announcement-email"]').exists()).toBe(false)

    expect(controls('draft')).toEqual(['preview', 'send', 'cancel'])
    expect(controls('created')).toEqual(['preview', 'send', 'cancel'])
    // A scheduled email can still be called back, until it goes out.
    expect(controls('scheduled')).toEqual(['cancel'])
    for (const id of ['creating', 'sent', 'unsent', 'cancelled']) expect(controls(id), id).toEqual([])
  })

  it('previews an email to the administrator, sends it now, or schedules it for the time typed', async () => {
    const backend = administrator({ announcements: [announcement('a1', { broadcast: { audience: 'accounts', subject: 'Launch', body: 'Hi', state: 'draft' } })] })
    const wrapper = await tab()
    const row = item(wrapper, 'a1')
    await row.find('[data-admin="announcement-preview"]').trigger('click')
    await flushPromises()
    expect(backend.callsTo('email:previewAnnouncement')).toEqual([{ id: 'a1' }])
    expect(message(wrapper).text()).toBe('A preview is on its way to your address.')

    await row.find('[data-admin="announcement-send"]').trigger('click')
    await flushPromises()
    expect(backend.callsTo('email:sendAnnouncement')).toEqual([{ id: 'a1' }])
    expect(message(wrapper).text()).toBe('The email is on its way.')

    const at = Date.now() + 2 * DAY
    const sendAt = row.find<HTMLInputElement>('input[type="datetime-local"]')
    expect(row.find(`#${sendAt.attributes('aria-describedby')}`).text()).toBe('Leave empty to send now.')
    await sendAt.setValue(localInput(at))
    await row.find('[data-admin="announcement-send"]').trigger('click')
    await flushPromises()
    expect(backend.callsTo('email:sendAnnouncement')[1]).toEqual({ id: 'a1', scheduledAt: Math.floor(at / 60_000) * 60_000 })
    expect(message(wrapper).text()).toBe('The email is scheduled.')
  })

  it('sends nothing when the administrator says no to sending, and cancels an email that has not gone out', async () => {
    const backend = administrator({ announcements: [announcement('a1', { broadcast: { audience: 'waitlist', subject: 'Launch', body: 'Hi', state: 'created' } })] })
    const asked: string[] = []
    const wrapper = await tab({ confirm: (text: string) => {
      asked.push(text)
      return false
    } })
    await item(wrapper, 'a1').find('[data-admin="announcement-send"]').trigger('click')
    await flushPromises()
    expect(asked).toEqual(['Send this email to everyone in its audience who opted in? It goes out once and cannot be called back.'])
    expect(backend.callsTo('email:sendAnnouncement')).toEqual([])

    // Cancelling an email asks nothing: it sends nobody anything.
    await item(wrapper, 'a1').find('[data-admin="announcement-cancel"]').trigger('click')
    await flushPromises()
    expect(asked).toHaveLength(1)
    expect(backend.callsTo('email:cancelAnnouncement')).toEqual([{ id: 'a1' }])
    expect(message(wrapper).text()).toBe('The email is cancelled.')
  })

  it('says outside production that only a preview goes out, and offers no send', async () => {
    administrator({ canBroadcast: false, announcements: [announcement('a1', { broadcast: { audience: 'accounts', subject: 'Launch', body: 'Hi', state: 'draft' } })] })
    const wrapper = await tab()
    expect(wrapper.find('[data-admin="announcements"] > [data-admin="hint"]').text()).toBe('Emails go out only from production. Here, send yourself a preview.')
    const row = item(wrapper, 'a1')
    expect(row.find('[data-admin="announcement-preview"]').exists()).toBe(true)
    expect(row.find('[data-admin="announcement-send"]').exists()).toBe(false)
    expect(row.find('input[type="datetime-local"]').exists()).toBe(false)
  })

  it('holds the send back until the brand has a postal address, and says so', async () => {
    const backend = administrator({ postalAddress: false, announcements: [announcement('a1', { broadcast: { audience: 'accounts', subject: 'Launch', body: 'Hi', state: 'draft' } })] })
    const wrapper = await tab()
    const hint = wrapper.find('[data-admin="announcements"] > [data-admin="hint"][data-state="error"]')
    expect(hint.text()).toContain('Add your postal address')
    const send = item(wrapper, 'a1').find('[data-admin="announcement-send"]')
    // Still focusable, so the hint above is found; the server refuses the send anyway.
    expect(send.attributes('aria-disabled')).toBe('true')
    expect(send.attributes('disabled')).toBeUndefined()
    expect(backend.callsTo('email:sendAnnouncement')).toEqual([])
  })

  it('runs one change at a time: the busy button says so, and a second press sends nothing', async () => {
    const backend = administrator({ announcements: [announcement('a1', { broadcast: { audience: 'accounts', subject: 'Launch', body: 'Hi', state: 'draft' } })] })
    let land!: () => void
    backend.stub('email:previewAnnouncement', () => new Promise((resolve) => {
      land = () => resolve({ emailId: 'em_1' })
    }))
    const wrapper = await tab()
    const row = item(wrapper, 'a1')
    await row.find('[data-admin="announcement-preview"]').trigger('click')
    await flushPromises()
    const preview = row.find('[data-admin="announcement-preview"]')
    expect(preview.text()).toBe('Sending…')
    expect(preview.attributes('aria-disabled')).toBe('true')
    expect(row.find('[data-admin="announcement-cancel"]').attributes('aria-disabled')).toBeUndefined()

    await row.find('[data-admin="announcement-cancel"]').trigger('click')
    await row.find('[data-admin="announcement-end"]').trigger('click')
    await flushPromises()
    expect(backend.callsTo('email:cancelAnnouncement')).toEqual([])
    expect(backend.callsTo('email:endAnnouncement')).toEqual([])

    land()
    await flushPromises()
    expect(row.find('[data-admin="announcement-preview"]').text()).toBe('Send me a preview')
    expect(row.find('[data-admin="announcement-preview"]').attributes('aria-disabled')).toBeUndefined()
  })
})
