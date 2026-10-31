import axe from 'axe-core'
import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { createBackendMock } from '../../src/runtime/test-utils'
import { backendError } from '../../src/convex/errors'
import NotificationInbox from '../../src/runtime/vue/components/shell/NotificationInbox.vue'
import type { NotificationEntry } from '../../src/convex/integrations/notifications'
import { registerComponents } from '../helpers/register-components'

await registerComponents('NotificationInbox')

// <NotificationInbox> over the backend mock, the way an app tests a header
// with a bell: the reads answer what the deployment would, the page is the
// framework's own paginated query, and the words come from the labels.

const entry = (id: string, fields: Partial<NotificationEntry> = {}): NotificationEntry => ({
  id,
  type: 'workspace.member_role_changed',
  at: Date.parse('2026-08-02T10:00:00.000Z'),
  readAt: null,
  channels: ['app'],
  actor: { kind: 'user', name: 'Grace' },
  workspace: { id: 'w1', name: 'Acme' },
  targetId: null,
  link: null,
  data: { role: 'admin' },
  ...fields,
})

/** What the deployment keeps, newest first: the mock reads this ref, so a change moves every query. */
const rows = ref<NotificationEntry[]>([])

const unread = () => rows.value.filter(row => row.readAt === null).length

/** Mark rows read the way the deployment's mutation does. */
function mark(ids: string[] | undefined, all: boolean | undefined) {
  const before = unread()
  rows.value = rows.value.map(row => (all || ids?.includes(row.id)) && row.readAt === null ? { ...row, readAt: Date.now() } : row)
  return { marked: before - unread(), done: true }
}

beforeEach(() => {
  rows.value = [
    entry('n4', { type: 'app.other', data: {}, actor: { kind: 'app', name: null }, workspace: null }),
    entry('n3', { type: 'billing.credits_low', actor: { kind: 'app', name: null }, data: { balance: 10, threshold: 20 } }),
    entry('n2', { type: 'app.strip_ready', link: '/strips/s1', data: {}, actor: { kind: 'app', name: null }, workspace: null }),
    entry('n1', { type: 'auth.passkey_added', readAt: 1, data: {}, actor: { kind: 'you', name: 'Ada' }, workspace: null }),
  ]
  const backend = createBackendMock({ user: { name: 'Ada' } })
  backend.stub('notifications:listNotifications', ({ paginationOpts }: { paginationOpts: { numItems: number, cursor: string | null } }) => {
    const start = paginationOpts.cursor ? Number(paginationOpts.cursor) : 0
    const page = rows.value.slice(start, start + paginationOpts.numItems)
    const end = start + page.length
    return { page, isDone: end >= rows.value.length, continueCursor: String(end) }
  })
  backend.stub('notifications:getUnreadCount', () => ({ count: unread(), more: false }))
  backend.stub('notifications:markNotificationsRead', ({ ids, all }: { ids?: string[], all?: boolean }) => mark(ids, all))
})

describe('<NotificationInbox>, on the backend mock', () => {
  it('names the button with the unread count, and lists the notifications worded, newest first', async () => {
    const inbox = await mountSuspended(NotificationInbox)
    await flushPromises()
    const bell = inbox.get('button[data-notifications="bell"]')
    expect(bell.text()).toContain('Notifications, 3 unread')
    expect(bell.get('[data-notifications="count"]').attributes('aria-hidden')).toBe('true')
    expect(bell.attributes('popovertarget')).toBe(inbox.get('[data-notifications="panel"]').attributes('id'))
    expect(inbox.findAll('[data-notifications="title"]').map(title => title.text())).toEqual(['New activity', 'Credits are running low', 'New activity', 'A passkey was added'])
    expect(inbox.findAll('[data-notifications="body"]').map(body => body.text())).toEqual(['10 credits are left in Acme.', 'If this was not you, remove it in your security settings.'])
    expect(inbox.findAll('[data-notifications="item"]').map(item => item.attributes('data-state'))).toEqual(['unread', 'unread', 'unread', 'read'])
  })

  it('links a package kind to the ready-made page it belongs to, and a kind of the app\'s own to the path it made', async () => {
    const inbox = await mountSuspended(NotificationInbox)
    await flushPromises()
    const target = (link: { attributes: (name: string) => string | undefined }) => link.attributes('to') ?? link.attributes('href')
    expect(inbox.findAll('a[data-notifications="link"]').map(target)).toEqual(['/settings', '/strips/s1', '/security'])
    // The one without a place to go is a button.
    expect(inbox.findAll('button[data-notifications="link"]')).toHaveLength(1)
  })

  it('words a kind of the app\'s own from its labels', async () => {
    const inbox = await mountSuspended(NotificationInbox, { props: { labels: { strip_ready: { title: 'Your strip is ready', body: 'Open it to read and share it.' } } as never } })
    await flushPromises()
    expect(inbox.findAll('[data-notifications="title"]').map(title => title.text())).toContain('Your strip is ready')
    expect(inbox.findAll('[data-notifications="body"]').map(body => body.text())).toContain('Open it to read and share it.')
  })

  it('marks one read when it is followed, and the count follows', async () => {
    const inbox = await mountSuspended(NotificationInbox)
    await flushPromises()
    await inbox.get('a[data-notifications="link"][href="/strips/s1"]').trigger('click')
    await flushPromises()
    expect(rows.value.find(row => row.id === 'n2')!.readAt).not.toBeNull()
    expect(inbox.get('button[data-notifications="bell"]').text()).toContain('Notifications, 2 unread')
  })

  it('marks a notification without a place to go read from its own button, keeping the list open', async () => {
    const inbox = await mountSuspended(NotificationInbox)
    await flushPromises()
    await inbox.get('button[data-notifications="link"]').trigger('click')
    await flushPromises()
    expect(rows.value.find(row => row.id === 'n4')!.readAt).not.toBeNull()
    expect(inbox.findAll('[data-notifications="item"]')[0]!.attributes('data-state')).toBe('read')
  })

  it('marks every notification read at once, and the button loses its count', async () => {
    const inbox = await mountSuspended(NotificationInbox)
    await flushPromises()
    await inbox.get('button[data-notifications="mark-all"]').trigger('click')
    await flushPromises()
    expect(unread()).toBe(0)
    expect(inbox.get('button[data-notifications="bell"]').text()).toBe('Notifications')
    expect(inbox.get('button[data-notifications="mark-all"]').attributes('aria-disabled')).toBe('true')
  })

  it('loads older notifications on request', async () => {
    rows.value = Array.from({ length: 30 }, (_, n) => entry(`n${n}`, { data: {}, type: 'auth.passkey_added', workspace: null }))
    const inbox = await mountSuspended(NotificationInbox, { props: { limit: 20 } })
    await flushPromises()
    expect(inbox.findAll('[data-notifications="item"]')).toHaveLength(20)
    await inbox.get('button[data-notifications="more"]').trigger('click')
    await flushPromises()
    expect(inbox.findAll('[data-notifications="item"]')).toHaveLength(30)
    expect(inbox.find('button[data-notifications="more"]').exists()).toBe(false)
  })

  it('says "99+" past the count it keeps exactly, and shows an empty inbox in a polite status', async () => {
    const backend = createBackendMock({ user: { name: 'Ada' } })
    backend.stub('notifications:listNotifications', () => ({ page: [], isDone: true, continueCursor: '' }))
    backend.stub('notifications:getUnreadCount', () => ({ count: 99, more: true }))
    const inbox = await mountSuspended(NotificationInbox)
    await flushPromises()
    expect(inbox.get('[data-notifications="count"]').text()).toBe('99+')
    expect(inbox.get('button[data-notifications="bell"]').text()).toContain('Notifications, more than 99 unread')
    expect(inbox.get('[data-notifications="empty"]').attributes('role')).toBe('status')
  })

  it('renders nothing for a visitor who is signed out', async () => {
    createBackendMock({ user: null })
    const inbox = await mountSuspended(NotificationInbox)
    await flushPromises()
    expect(inbox.find('[data-notifications="root"]').exists()).toBe(false)
  })

  it('renders nothing while an administrator acts as the account, and reads nothing the deployment would refuse', async () => {
    const backend = createBackendMock({ user: { name: 'Ada' }, session: { impersonatedBy: 'admin-1' } })
    const refused = backendError('forbidden', { reason: 'impersonating' }, 'An administrator acting as this account cannot do this.')
    backend.fail('notifications:listNotifications', refused)
    backend.fail('notifications:getUnreadCount', refused)
    const inbox = await mountSuspended(NotificationInbox)
    await flushPromises()
    expect(inbox.find('[data-notifications="root"]').exists()).toBe(false)
  })

  it('marks every notification read, however many calls it takes', async () => {
    let left = 6000
    const backend = createBackendMock({ user: { name: 'Ada' } })
    backend.stub('notifications:listNotifications', () => ({ page: [entry('n1')], isDone: true, continueCursor: '' }))
    backend.stub('notifications:getUnreadCount', () => ({ count: Math.min(left, 99), more: left > 99 }))
    backend.stub('notifications:markNotificationsRead', () => {
      const marked = Math.min(left, 200)
      left -= marked
      return { marked, done: left === 0 }
    })
    const inbox = await mountSuspended(NotificationInbox)
    await flushPromises()
    await inbox.get('button[data-notifications="mark-all"]').trigger('click')
    await flushPromises()
    expect(left).toBe(0)
    expect(backend.callsTo('notifications:markNotificationsRead')).toHaveLength(30)
  })

  it('is reached by keyboard alone: only buttons and links, the bell first, none taken out of the tab order', async () => {
    const inbox = await mountSuspended(NotificationInbox)
    await flushPromises()
    const controls = inbox.findAll('button, a')
    expect(controls.every(control => ['BUTTON', 'A'].includes(control.element.tagName))).toBe(true)
    expect(controls.slice(0, 2).map(control => control.attributes('data-notifications'))).toEqual(['bell', 'mark-all'])
    for (const control of controls) expect(control.attributes('tabindex')).toBeUndefined()
  })

  // axe-core runs in happy-dom: every WCAG A and AA rule it can decide, contrast aside.
  it('passes axe-core\'s WCAG 2.2 A and AA rules, contrast aside', async () => {
    const inbox = await mountSuspended(NotificationInbox, { attachTo: document.body })
    await flushPromises()
    const results = await axe.run(inbox.element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, rules: { 'color-contrast': { enabled: false } } })
    expect(results.violations.map(violation => `${violation.id}: ${violation.nodes.map(node => node.html.slice(0, 80)).join(' | ')}`)).toEqual([])
    inbox.unmount()
  })
})
