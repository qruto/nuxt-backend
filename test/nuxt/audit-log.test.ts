import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick, reactive, ref, toValue, type MaybeRefOrGetter } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import type { AuditEntry, AuditPage } from '../../src/convex/integrations/audit'

// useAuditLog and <AuditLog> over a stand-in for the three reads of
// `backend/audit.ts`: pages by cursor, each scope its own query, a scope
// the caller may not read answering `null`. Then each event as the sentence
// a person reads, and the pager by keyboard.

/** The pages each read answers, by query and cursor; a query not here stays pending. */
const pages = reactive(new Map<string, AuditPage | null | Error>())
/** Every read asked for: query and its arguments. */
const asked: Array<{ query: string, args: unknown }> = []
const authenticated = ref(true)
/** The session the reader is: its account and its active workspace. */
const session = ref<{ data: { user: { id: string }, session: { activeOrganizationId: string | null } } | null }>({ data: null })

vi.mock('../../src/runtime/vue/utils/auth-session', () => ({ useAuthSession: () => ({ session }) }))

vi.mock('nuxt-convex-module/client', async original => ({
  ...await original<Record<string, unknown>>(),
  useQuery_experimental: ({ query, args }: { query: string, args: MaybeRefOrGetter<unknown> }) => computed(() => {
    const value = toValue(args) as 'skip' | { paginationOpts: { cursor: string | null } }
    if (value === 'skip') return { status: 'pending' }
    asked.push({ query, args: value })
    const answer = pages.get(`${query}@${value.paginationOpts.cursor ?? ''}`)
    if (answer === undefined) return { status: 'pending' }
    return answer instanceof Error ? { status: 'error', error: answer } : { status: 'success', data: answer }
  }),
}))

const { useAuditLog } = await import('../../src/runtime/vue/composables/use-audit-log')
const { registerComponents } = await import('../helpers/register-components')
await registerComponents('AuditLog')
const { default: AuditLog } = await import('../../src/runtime/vue/components/workspaces/AuditLog.vue')
const { ConvexAuthStateKey } = await import('nuxt-convex-module/client')
const { BackendApiKey } = await import('../../src/runtime/vue/utils/namespace')

const api = { listActivity: 'audit:listActivity', listWorkspaceActivity: 'audit:listWorkspaceActivity', listAllActivity: 'audit:listAllActivity' } as never
const AT = Date.parse('2026-10-19T10:00:00.000Z')

const me = { kind: 'you', id: 'u_me', name: 'Ada' } as const
const grace = { kind: 'user', id: 'u_grace', name: 'Grace' } as const

function entry(id: string, fields: Partial<AuditEntry>): AuditEntry {
  return { id, type: 'auth.signed_in', at: AT, actor: me, subject: me, workspace: null, impersonated: false, targetId: null, data: {}, ...fields }
}

const provide = {
  [ConvexAuthStateKey as symbol]: { isAuthenticated: computed(() => authenticated.value), isLoading: computed(() => false) },
  // The app's `api`, as the module provides it: the components read `api.audit`.
  [BackendApiKey as symbol]: { audit: api },
}

function inSetup<T>(runner: () => T): T {
  let result: T
  mount(defineComponent({
    setup() {
      result = runner()
      return () => h('div')
    },
  }), { global: { provide } })
  return result!
}

beforeEach(() => {
  pages.clear()
  asked.length = 0
  authenticated.value = true
  session.value = { data: { user: { id: 'u_me' }, session: { activeOrganizationId: 'w1' } } }
})

describe('useAuditLog', () => {
  it('reads a page at a time by cursor, newer and older, and back to the first on a new scope', async () => {
    pages.set('audit:listActivity@', { page: [entry('e2', {}), entry('e1', {})], isDone: false, continueCursor: 'c1' })
    pages.set('audit:listActivity@c1', { page: [entry('e0', {})], isDone: true, continueCursor: 'c2' })
    pages.set('audit:listWorkspaceActivity@', { page: [entry('w1', { type: 'workspace.created' })], isDone: true, continueCursor: 'cw' })
    const scope = ref<'mine' | 'workspace'>('mine')
    const log = inSetup(() => useAuditLog({ api, scope, limit: 2 }))

    expect(log.events.value?.map(event => event.id)).toEqual(['e2', 'e1'])
    expect([log.page.value, log.hasMore.value, log.hasPrevious.value]).toEqual([1, true, false])
    await log.next()
    expect(log.events.value?.map(event => event.id)).toEqual(['e0'])
    expect([log.page.value, log.hasMore.value, log.hasPrevious.value]).toEqual([2, false, true])
    expect(asked.at(-1)).toEqual({ query: 'audit:listActivity', args: { paginationOpts: { numItems: 2, cursor: 'c1' } } })
    // At the end, nothing older to read.
    await log.next()
    expect(log.page.value).toBe(2)
    await log.previous()
    expect(log.events.value?.map(event => event.id)).toEqual(['e2', 'e1'])

    await log.next()
    scope.value = 'workspace'
    await nextTick()
    expect(log.page.value).toBe(1)
    expect(log.events.value?.map(event => event.id)).toEqual(['w1'])
    expect(asked.some(({ query }) => query === 'audit:listAllActivity')).toBe(false)
  })

  it('goes back to the first page when another workspace is made active, or another account signs in', async () => {
    pages.set('audit:listWorkspaceActivity@', { page: [entry('w2', {}), entry('w1', {})], isDone: false, continueCursor: 'c1' })
    pages.set('audit:listWorkspaceActivity@c1', { page: [entry('w0', {})], isDone: true, continueCursor: 'c2' })
    const log = inSetup(() => useAuditLog({ api, scope: 'workspace', limit: 2 }))
    await log.next()
    expect([log.page.value, log.hasPrevious.value]).toEqual([2, true])

    session.value = { data: { user: { id: 'u_me' }, session: { activeOrganizationId: 'w9' } } }
    await nextTick()
    expect([log.page.value, log.hasPrevious.value]).toEqual([1, false])
    expect(log.events.value?.map(event => event.id)).toEqual(['w2', 'w1'])

    await log.next()
    session.value = { data: { user: { id: 'u_grace' }, session: { activeOrganizationId: 'w9' } } }
    await nextTick()
    expect(log.page.value).toBe(1)
  })

  it('reads nothing signed out, an empty list for a scope the caller may not read, and a failure into error', async () => {
    authenticated.value = false
    pages.set('audit:listAllActivity@', null)
    const scope = ref<'mine' | 'all'>('all')
    const log = inSetup(() => useAuditLog({ api, scope }))
    expect(log.events.value).toEqual([])
    expect(asked).toEqual([])

    expect(log.isRefused.value).toBe(false)

    authenticated.value = true
    await nextTick()
    expect(log.events.value).toEqual([])
    expect(log.isRefused.value).toBe(true)
    expect(log.error.value).toBeNull()

    pages.set('audit:listActivity@', new Error('read failed'))
    scope.value = 'mine'
    await nextTick()
    expect(log.events.value).toBeUndefined()
    expect(log.error.value).not.toBeNull()
  })
})

describe('<AuditLog>', () => {
  const texts = (wrapper: ReturnType<typeof mount>) => wrapper.findAll('[data-audit="event"]').map(row => [
    row.find('[data-audit="event-text"]').text(),
    row.find('[data-audit="event-details"]').exists() ? row.find('[data-audit="event-details"]').text() : '',
  ])

  it('reads each event as a sentence, who acted first, then what the sentence leaves out', async () => {
    const acme = { id: 'w1', name: 'Acme' }
    pages.set('audit:listActivity@', {
      page: [
        entry('1', { type: 'auth.signed_in', data: { method: 'passkey' } }),
        entry('2', { type: 'workspace.member_role_changed', actor: grace, workspace: acme, data: { role: 'admin' } }),
        entry('3', { type: 'admin.impersonation_started', actor: { kind: 'administrator', id: null, name: null } }),
        entry('4', { type: 'auth.session_revoked', actor: { kind: 'administrator', id: null, name: null } }),
        entry('5', { type: 'auth.passkey_removed', impersonated: true }),
        entry('6', { type: 'app.nightly_sync', actor: { kind: 'app', id: null, name: null }, subject: null }),
        entry('7', { type: 'workspace.invitation_accepted', workspace: { id: 'w2', name: null }, data: { role: 'member' } }),
      ],
      isDone: true,
      continueCursor: '',
    })
    const wrapper = mount(AuditLog, { global: { provide } })
    await flushPromises()
    expect(texts(wrapper)).toEqual([
      ['You signed in', 'with a passkey'],
      ['Grace made you admin of Acme', ''],
      ['An administrator began acting as you', ''],
      ['An administrator signed a session out', 'for you'],
      ['You removed a passkey', 'by an administrator acting for the account'],
      ['The app: app.nightly_sync', ''],
      ['You joined a workspace as member', ''],
    ])
    expect(wrapper.find('[data-audit="header"]').text()).toBe('Recent activity')
    expect(wrapper.find('time').attributes('datetime')).toBe('2026-10-19T10:00:00.000Z')
  })

  it('reads a workspace\'s activity with its members\' names, under its own title, in the labels it is given', async () => {
    pages.set('audit:listWorkspaceActivity@', {
      page: [entry('1', { type: 'workspace.member_removed', subject: grace, workspace: { id: 'w1', name: 'Acme' } })],
      isDone: true,
      continueCursor: '',
    })
    const wrapper = mount(AuditLog, { props: { scope: 'workspace', labels: { events: { workspace: { member_removed: '{actor} showed {subject} the door' } } } }, global: { provide } })
    await flushPromises()
    expect(texts(wrapper)).toEqual([['You showed Grace the door', 'in Acme']])
    expect(wrapper.find('[data-audit="header"]').text()).toBe('Workspace activity')
  })

  it('renders nothing for a scope the caller may not read, so a page mounts it for everyone', async () => {
    pages.set('audit:listWorkspaceActivity@', null)
    const wrapper = mount(AuditLog, { props: { scope: 'workspace' }, global: { provide } })
    await flushPromises()
    expect(wrapper.find('[data-audit]').exists()).toBe(false)
  })

  it('turns pages by keyboard: the pressed button keeps focus while its page loads, then focus moves where a page is left', async () => {
    pages.set('audit:listActivity@', { page: [entry('e1', {})], isDone: false, continueCursor: 'c1' })
    const wrapper = mount(AuditLog, { attachTo: document.body, global: { provide } })
    await flushPromises()
    const older = wrapper.get<HTMLButtonElement>('[data-audit="older"]')
    expect(wrapper.get<HTMLButtonElement>('[data-audit="newer"]').element.disabled).toBe(true)
    older.element.focus()
    await older.trigger('click')
    // The next page is still being read: the button keeps focus, busy, and says so.
    expect(document.activeElement).toBe(older.element)
    expect(older.attributes('aria-disabled')).toBe('true')
    expect(older.text()).toBe('Loading the page…')
    expect(wrapper.get('[data-audit="status"]').text()).toBe('Loading the page…')

    // The older page arrives, the last one: Older has nowhere to go, so focus moves to Newer.
    pages.set('audit:listActivity@c1', { page: [entry('e0', {})], isDone: true, continueCursor: 'c2' })
    await flushPromises()
    await nextTick()
    const newer = wrapper.get<HTMLButtonElement>('[data-audit="newer"]')
    expect(wrapper.findAll('[data-audit="event"]')).toHaveLength(1)
    expect(older.element.disabled).toBe(true)
    expect(document.activeElement).toBe(newer.element)
    expect(wrapper.get('[data-audit="status"]').text()).toBe('')
    wrapper.unmount()
  })
})
