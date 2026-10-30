import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { createBackendMock, resetBackendMock } from '../../src/runtime/test-utils'
import { registerComponents } from '../helpers/register-components'

// The app's proof route is the server's; here the deployment checks nobody.
vi.mock('../../src/runtime/vue/composables/use-human-check', () => ({ useHumanCheck: () => ({ mode: computed(() => 'off'), isPending: computed(() => false), error: ref(null), token: async () => null }) }))

await registerComponents('AdminReports', 'ReportNotice', 'ReportAppeal')
const { default: AdminReports } = await import('../../src/runtime/vue/components/admin/AdminReports.vue')
const { default: ReportNotice } = await import('../../src/runtime/vue/components/shell/ReportNotice.vue')
const { default: ReportAppeal } = await import('../../src/runtime/vue/components/shell/ReportAppeal.vue')

// Content duties' screens over the backend mock: the admin console's
// Reports tab (an intimate-image request first with its deadline, the
// notices with their notifiers, an appeal) and the decisions it sends to
// backend/admin.ts; the report page's notice form and the author's appeal.

enableAutoUnmount(afterEach)
afterEach(() => resetBackendMock())

const HOUR = 60 * 60 * 1000
const notice = { id: 'n1', kind: 'notice', reason: 'intimate', details: 'This is me, shared without my consent.', url: 'https://app.example.com/strips/s1', notifier: { name: 'Grace Hopper', email: 'grace@example.com' }, signature: 'Grace Hopper', crime: null, createdAt: Date.now() - HOUR }
const reports = {
  subjects: [
    { subject: { table: 'strips', id: 's1' }, described: { title: 'A beach photo', url: '/strips/s1', authorId: 'u1' }, author: { id: 'u1', email: 'ada@example.com' }, open: 2, reasons: { intimate: 1, sexual: 1 }, notices: [notice], deadline: Date.now() + 47 * HOUR, crime: null, updatedAt: Date.now() },
    { subject: { table: 'strips', id: 's2' }, described: null, author: null, open: 1, reasons: { spam: 1 }, notices: [], deadline: null, crime: { at: Date.now(), by: 'admin-1' }, updatedAt: Date.now() },
  ],
  notices: [],
  appeals: [{ id: 'a1', text: 'It is my own photo.', createdAt: Date.now(), decision: { action: 'hidden', reason: 'Nudity.', at: Date.now() - HOUR }, subject: { table: 'strips', id: 's3' }, described: { title: 'Self-portrait' } }],
}

describe('the Reports tab', () => {
  it('lists intimate-image requests with their deadline and sends each decision with its reason', async () => {
    const backend = createBackendMock({ user: { role: 'admin' } })
    backend.stub('admin:getReports', () => reports)
    for (const name of ['admin:decideReport', 'admin:flagCrime', 'admin:decideAppeal'] as const) backend.stub(name, () => null)

    const tab = await mountSuspended(AdminReports, { props: { confirm: () => true } })
    await flushPromises()
    const text = tab.text()
    expect(text).toContain('A beach photo')
    expect(text).toContain('Intimate image without consent (1)')
    expect(text).toContain('By ada@example.com')
    expect(text).toContain('Decide by')
    expect(text).toContain('From Grace Hopper, grace@example.com')
    expect(text).toContain('Signed by Grace Hopper')
    expect(text).toContain('This content is gone.')
    expect(text).toContain('Flagged for the authorities')
    expect(text).toContain('Appeal against hiding "Self-portrait"')

    const [first] = tab.findAll('[data-admin="reports-decision"]')
    // No reason, no decision.
    await first!.trigger('submit')
    expect(backend.callsTo('admin:decideReport')).toEqual([])
    await first!.find('textarea').setValue('Shared without consent.')
    await first!.find('select').setValue('illegal')
    await first!.trigger('submit')
    await flushPromises()
    expect(backend.callsTo('admin:decideReport')).toEqual([{ subject: { table: 'strips', id: 's1' }, action: 'hide', reason: 'Shared without consent.', ground: 'illegal' }])
    expect(tab.text()).toContain('Hidden. The people who reported it and its author were told.')

    await tab.findAll('[data-admin="reports-flag"]')[1]!.trigger('click')
    await flushPromises()
    expect(backend.callsTo('admin:flagCrime')).toEqual([{ subject: { table: 'strips', id: 's2' } }])

    const appeal = tab.findAll('[data-admin="reports-decision"]').at(-1)!
    await appeal.find('textarea').setValue('It is the author\'s own.')
    await appeal.find('[data-admin="reports-reverse"]').trigger('click')
    await flushPromises()
    expect(backend.callsTo('admin:decideAppeal')).toEqual([{ appealId: 'a1', outcome: 'reverse', reason: 'It is the author\'s own.' }])
  })

  it('sorts an intimate-image request it could not place among the reported content by its deadline, and marks it handled', async () => {
    const backend = createBackendMock({ user: { role: 'admin' } })
    const unplaced = { ...notice, id: 'n2', url: 'https://elsewhere.example.com/photo', deadline: Date.now() - HOUR }
    const other = { ...notice, id: 'n3', reason: 'spam', url: 'https://elsewhere.example.com/ad', signature: undefined, deadline: null }
    backend.stub('admin:getReports', () => ({ ...reports, appeals: [], notices: [other, unplaced] }))
    backend.stub('admin:decideReport', () => null)
    const tab = await mountSuspended(AdminReports)
    await flushPromises()

    // Overdue first, then the thing due in 47 hours, then the rest; the other notice waits on its own.
    const items = tab.findAll('[data-admin="reports-subjects"] [data-admin="reports-item"]')
    expect(items.map(item => item.attributes('data-state'))).toEqual(['intimate', 'intimate', 'open'])
    expect(items[0]!.find('[data-admin="reports-deadline"]').attributes()).toMatchObject({ 'data-state': 'overdue', 'role': 'alert' })
    expect(items[1]!.text()).toContain('A beach photo')
    expect(tab.findAll('[data-admin="reports-unplaced"] [data-admin="reports-item"]')).toHaveLength(1)

    // A notice on its own hides nothing of the app's: its action says what it does.
    const hide = items[0]!.find('[data-admin="reports-hide"]')
    expect(hide.text()).toBe('Mark handled')
    await items[0]!.find('textarea').setValue('Taken down at the host.')
    await items[0]!.find('form').trigger('submit')
    await flushPromises()
    expect(backend.callsTo('admin:decideReport')).toEqual([{ notice: 'n2', action: 'hide', reason: 'Taken down at the host.', ground: 'terms' }])
    expect(tab.text()).toContain('Marked handled. Its sender was told you acted on it.')
  })

  it('links an author to their account in the Users tab', async () => {
    const backend = createBackendMock({ user: { role: 'admin' } })
    backend.stub('admin:getReports', () => reports)
    const tab = await mountSuspended(AdminReports)
    await flushPromises()
    expect(tab.find('[data-admin="reports-author"] a').attributes('href')).toBe('?tab=users&user=u1')
  })

  it('tells anyone who is not an administrator so', async () => {
    const backend = createBackendMock({ user: { role: 'user' } })
    backend.stub('admin:getReports', () => null)
    const tab = await mountSuspended(AdminReports)
    await flushPromises()
    expect(tab.text()).toContain('Only administrators see reports.')
  })
})

describe('the report page', () => {
  it('sends a notice with what the law asks for, and says it arrived', async () => {
    const backend = createBackendMock()
    backend.stub('admin:sendNotice', () => null)
    const form = await mountSuspended(ReportNotice)
    await form.find('[data-report="input-url"]').setValue('https://app.example.com/strips/s1')
    await form.find('input[value="intimate"]').setValue(true)
    expect(form.text()).toContain('within 48 hours')
    await form.find('[data-report="input-details"]').setValue('This is me.')
    await form.find('[data-report="input-name"]').setValue('Grace Hopper')
    await form.find('[data-report="input-email"]').setValue('grace@example.com')
    await form.find('[data-report="input-signature"]').setValue('Grace Hopper')
    await form.find('input[name="goodFaith"]').setValue(true)
    await form.find('form').trigger('submit')
    await flushPromises()
    expect(backend.callsTo('admin:sendNotice')).toEqual([expect.objectContaining({ url: 'https://app.example.com/strips/s1', reason: 'intimate', details: 'This is me.', name: 'Grace Hopper', email: 'grace@example.com', signature: 'Grace Hopper', goodFaith: true, human: null })])
    expect(form.text()).toContain('We received your report and will email you our decision.')
  })

  it('shows the decision an appeal link names, and sends the appeal', async () => {
    const backend = createBackendMock()
    backend.stub('admin:getAppeal', () => ({ title: 'A fox', action: 'hidden', reason: 'Harassment.', ground: 'terms', at: Date.UTC(2026, 9, 1), until: Date.now() + 100 * 24 * HOUR, appeal: null }))
    backend.stub('admin:appealDecision', () => null)
    const page = await mountSuspended(ReportAppeal, { props: { token: 'a'.repeat(43) } })
    await flushPromises()
    expect(page.text()).toContain('we removed "A fox"')
    expect(page.text()).toContain('Our reason: Harassment.')
    await page.find('[data-report="input-appeal"]').setValue('The fox is mine.')
    await page.find('form').trigger('submit')
    await flushPromises()
    expect(backend.callsTo('admin:appealDecision')).toEqual([{ token: 'a'.repeat(43), text: 'The fox is mine.' }])
  })

  it('says when an appeal link names no decision', async () => {
    const backend = createBackendMock()
    backend.stub('admin:getAppeal', () => null)
    const page = await mountSuspended(ReportAppeal, { props: { token: 'nope' } })
    await flushPromises()
    expect(page.text()).toContain('This appeal link doesn\'t work.')
  })
})
