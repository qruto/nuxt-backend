import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick, reactive, ref, toValue, type MaybeRefOrGetter } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useNuxtApp } from '#imports'
import type { AdminUser, AdminUserDetail, AdminUserPage, AdminWorkspaceDetail, AdminWorkspacePage } from '../../src/convex/integrations/admin'
import { ConvexError } from 'convex/values'
import { withoutComments } from '../helpers/html'
import type { AdminFlag, ExperimentResult } from '../../src/convex/integrations/flags'
import type { AccessConsole } from '../../src/convex/integrations/launch'
import type { WaitlistConsole } from '../../src/convex/integrations/waitlist'
import type { InboxConsole } from '../../src/convex/integrations/inbound'
import type { AiCosts } from '../../src/convex/integrations/ai/config'
import type { RevenueReport, RevenueValues } from '../../src/convex/integrations/billing/types/revenue'
import { type FunnelReport, WEEK_MS, weekOf } from '../../src/convex/funnel-rules'
import type { BillingConsole } from '../../src/convex/integrations/billing'

// The admin console over a stand-in for `backend/admin.ts` and the auth
// client: useAdmin's pages, search and actions; <AdminUsers> and its drawer,
// by keyboard; <AdminWorkspaces>, read-only with "impersonate a member";
// the console's tabs; its Flags tab over `backend/flags.ts`; and
// <ImpersonationBanner>, the way out of a visit.

type Answer = { data?: unknown, error?: Record<string, unknown> | null }
const ok = (data: unknown = {}): Answer => ({ data, error: null })

/** What each read answers, by query and its arguments; a read not here stays pending. */
const answers = reactive(new Map<string, unknown>())
const asked: Array<{ query: string, args: unknown }> = []
const key = (query: string, args: unknown) => `${query}@${JSON.stringify(args)}`

const me = ref<Record<string, unknown> | null>({ id: 'u_root', email: 'root@example.com', role: 'admin' })
const sessionData = ref<Record<string, unknown> | null>({ id: 's1' })
const client = {
  admin: {
    checkRolePermission: vi.fn(() => true),
    setRole: vi.fn(async (_input: unknown): Promise<Answer> => ok()),
    banUser: vi.fn(async (_input: unknown): Promise<Answer> => ok()),
    unbanUser: vi.fn(async (_input: unknown): Promise<Answer> => ok()),
    revokeUserSessions: vi.fn(async (_input: unknown): Promise<Answer> => ok()),
    impersonateUser: vi.fn(async (_input: unknown): Promise<Answer> => ok()),
    stopImpersonating: vi.fn(async (): Promise<Answer> => ok()),
  },
  organization: { setActive: vi.fn(async (_input: unknown): Promise<Answer> => ok()) },
}

vi.mock('nuxt-convex-module/better-auth/client', () => ({
  useBetterAuth: () => ({
    isLoading: computed(() => false),
    isAuthenticated: computed(() => me.value !== null),
    fetchAccessToken: vi.fn(async () => 'token'),
    client,
    session: computed(() => ({ data: me.value ? { session: sessionData.value, user: me.value } : null, isPending: false })),
    user: computed(() => me.value),
    authVersion: computed(() => 's1'),
  }),
}))

// The Flags tab's one write, `setFlag`; its list is a read like the others.
const setFlagCall = vi.fn(async (_args: unknown) => null)
// The Inbox tab's one action, `replyToInbox`.
const replyCall = vi.fn(async (_args: unknown) => null)
vi.mock('nuxt-convex-module/client', async original => ({
  ...await original<Record<string, unknown>>(),
  useMutation: () => setFlagCall,
  useAction: () => replyCall,
  useQuery_experimental: ({ query, args }: { query: string, args: MaybeRefOrGetter<unknown> }) => computed(() => {
    const value = toValue(args)
    if (value === 'skip') return { status: 'pending' }
    asked.push({ query, args: value })
    const answer = answers.get(key(query, value))
    if (answer === undefined) return { status: 'pending' }
    return answer instanceof Error ? { status: 'error', error: answer } : { status: 'success', data: answer }
  }),
  // A one-shot read (the Costs tab's query, the Revenue view's action) answers from the same map, as it stands when asked.
  useConvex: () => {
    const read = async (query: string, args: unknown) => {
      asked.push({ query, args })
      const answer = answers.get(key(query, args))
      if (answer instanceof Error) throw answer
      return answer
    }
    return { query: read, action: read }
  },
}))

// A sensitive action runs as it came: the re-authentication is useReauthentication's own test.
const reauthenticated = vi.fn()
vi.mock('../../src/runtime/vue/composables/use-reauthentication', () => ({
  useReauthentication: () => ({
    isRequired: computed(() => false),
    step: ref('choose'),
    email: computed(() => null),
    otp: ref(''),
    isPending: computed(() => false),
    error: ref(null),
    retryAfter: ref(null),
    cancel: vi.fn(),
    withReauthentication: async <T>(action: () => Promise<T>) => {
      reauthenticated()
      return action()
    },
  }),
  useDialogTurn: () => ({ active: computed(() => false), outcome: () => null }),
}))

const { reload } = vi.hoisted(() => ({ reload: vi.fn() }))
mockNuxtImport('reloadNuxtApp', () => reload)

const { useAdmin } = await import('../../src/runtime/vue/composables/use-admin')
const { registerComponents } = await import('../helpers/register-components')
await registerComponents('AdminUsers', 'AdminWorkspaces', 'AdminConsole', 'NoticeImpersonation', 'AdminFlags', 'AdminAccess', 'AdminWaitlist', 'AdminInbox', 'AdminCosts', 'AdminWebhooks', 'AdminSuppressions', 'AdminBilling')
const { default: AdminUsers } = await import('../../src/runtime/vue/components/admin/AdminUsers.vue')
const { default: AdminWorkspaces } = await import('../../src/runtime/vue/components/admin/AdminWorkspaces.vue')
const { default: AdminConsole } = await import('../../src/runtime/vue/components/admin/AdminConsole.vue')
const { default: ImpersonationBanner } = await import('../../src/runtime/vue/components/shell/NoticeImpersonation.vue')
const { default: AdminFlags } = await import('../../src/runtime/vue/components/admin/AdminFlags.vue')
const { default: AdminAccess } = await import('../../src/runtime/vue/components/admin/AdminAccess.vue')
const { default: AdminWaitlist } = await import('../../src/runtime/vue/components/admin/AdminWaitlist.vue')
const { default: AdminInbox } = await import('../../src/runtime/vue/components/admin/AdminInbox.vue')
const { default: AdminCosts } = await import('../../src/runtime/vue/components/admin/AdminCosts.vue')
const { default: AdminWebhooks } = await import('../../src/runtime/vue/components/admin/AdminWebhooks.vue')
const { default: AdminSuppressions } = await import('../../src/runtime/vue/components/admin/AdminSuppressions.vue')
const { default: AdminBilling } = await import('../../src/runtime/vue/components/admin/AdminBilling.vue')
const { costWindowStart } = await import('../../src/runtime/vue/composables/use-ai-costs')
const { default: AdminAnalytics } = await import('../../src/runtime/vue/components/admin/AdminAnalytics.vue')
const { revenueWindowStart } = await import('../../src/runtime/vue/composables/use-revenue')
const { ConvexAuthStateKey } = await import('nuxt-convex-module/client')
const { BackendApiKey } = await import('../../src/runtime/vue/utils/namespace')

const api = { listUsers: 'admin:listUsers', getUser: 'admin:getUser', listWorkspaces: 'admin:listWorkspaces', getWorkspace: 'admin:getWorkspace' } as never
const provide = {
  [ConvexAuthStateKey as symbol]: { isAuthenticated: computed(() => me.value !== null), isLoading: computed(() => false) },
  [BackendApiKey as symbol]: { admin: api, flags: { listFlags: 'flags:listFlags', setFlag: 'flags:setFlag' } },
}
const AT = Date.parse('2026-10-01T10:00:00.000Z')

function account(id: string, fields: Partial<AdminUser> = {}): AdminUser {
  return { id, email: `${id}@example.com`, name: id, image: null, role: 'user', administrator: false, banned: false, banReason: null, banExpires: null, emailVerified: true, lastSignInMethod: 'passkey', passkeyOnly: false, createdAt: AT, ...fields }
}
const page = (rows: AdminUser[], isDone = true, continueCursor = 'end'): AdminUserPage => ({ page: rows, isDone, continueCursor })
const firstPage = (search?: string, numItems = 20) => ({ ...(search ? { search } : {}), paginationOpts: { numItems, cursor: null } })
const detail = (user: AdminUser, fields: Partial<AdminUserDetail> = {}): AdminUserDetail => ({
  user,
  workspaces: [{ workspaceId: 'w1', name: 'Acme', slug: 'acme', role: 'owner', joinedAt: AT }],
  sessions: [{ id: 'ses1', userAgent: 'Firefox Windows', createdAt: AT, updatedAt: AT, expiresAt: Date.now() + 3_600_000, impersonated: false }],
  truncated: false,
  ticket: null,
  ...fields,
})

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

const mounted: VueWrapper[] = []
function render(component: object, props: Record<string, unknown> = {}): VueWrapper {
  const wrapper = mount(component as never, { props: props as never, attachTo: document.body, global: { provide } }) as VueWrapper
  mounted.push(wrapper)
  return wrapper
}

/**
 * A tab says it is loading, in a polite status, while its first read is on
 * its way, and stops once `land` answers it: then `shows` is on screen.
 */
async function loadsFirst(wrapper: VueWrapper, land: () => void, shows: string): Promise<void> {
  await flushPromises()
  const loading = wrapper.find('[data-admin="loading"]')
  expect(loading.text()).toBe('Loading…')
  expect(loading.attributes()).toMatchObject({ 'role': 'status', 'aria-live': 'polite' })
  expect(wrapper.find(shows).exists()).toBe(false)
  land()
  await flushPromises()
  expect(wrapper.find('[data-admin="loading"]').exists()).toBe(false)
  expect(wrapper.find(shows).exists()).toBe(true)
}

beforeEach(() => {
  vi.clearAllMocks()
  answers.clear()
  asked.length = 0
  me.value = { id: 'u_root', email: 'root@example.com', role: 'admin' }
  sessionData.value = { id: 's1' }
})

afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount()
})

describe('useAdmin', () => {
  it('reads every account a page at a time, searches, and goes back to the first page on a new search', async () => {
    answers.set(key('admin:listUsers', firstPage(undefined, 2)), page([account('b'), account('a')], false, 'c1'))
    answers.set(key('admin:listUsers', { paginationOpts: { numItems: 2, cursor: 'c1' } }), page([account('root')]))
    answers.set(key('admin:listUsers', firstPage('ada', 2)), page([account('ada')]))
    const search = ref('')
    const admin = inSetup(() => useAdmin({ api, search, limit: 2 }))
    expect(admin.users.value?.map(user => user.id)).toEqual(['b', 'a'])
    expect([admin.hasMore.value, admin.hasPrevious.value]).toEqual([true, false])
    await admin.next()
    expect(admin.users.value?.map(user => user.id)).toEqual(['root'])
    expect(admin.page.value).toBe(2)
    search.value = ' ada '
    await nextTick()
    expect(admin.page.value).toBe(1)
    expect(admin.users.value?.map(user => user.id)).toEqual(['ada'])
    expect(admin.workspaces.value).toBeUndefined()
  })

  it('reads one account in full, and the workspaces list', async () => {
    answers.set(key('admin:getUser', { userId: 'ada' }), detail(account('ada')))
    answers.set(key('admin:listWorkspaces', firstPage()), { page: [{ id: 'w1', name: 'Acme', slug: 'acme', logo: null, createdAt: AT }], isDone: true, continueCursor: 'e' } satisfies AdminWorkspacePage)
    const admin = inSetup(() => useAdmin({ api, list: 'workspaces', userId: 'ada' }))
    expect(admin.user.value?.user.id).toBe('ada')
    expect(admin.workspaces.value?.map(workspace => workspace.name)).toEqual(['Acme'])
    expect(admin.users.value).toBeUndefined()
  })

  it('answers a caller who is no administrator with empty lists and isRefused', () => {
    answers.set(key('admin:listUsers', firstPage()), null)
    const admin = inSetup(() => useAdmin({ api }))
    expect(admin.users.value).toEqual([])
    expect(admin.isRefused.value).toBe(true)
  })

  it('runs the admin routes with their own arguments, and opens a visit in a workspace', async () => {
    const admin = inSetup(() => useAdmin({ api }))
    await admin.setRole('ada', 'admin')
    await admin.ban('ada', { reason: '  Spam ', expiresIn: 86_400 })
    await admin.ban('grace')
    await admin.unban('ada')
    await admin.revokeSessions('ada')
    await admin.impersonate('ada', { workspaceId: 'w1' })
    expect(client.admin.setRole).toHaveBeenCalledWith({ userId: 'ada', role: 'admin' })
    expect(client.admin.banUser.mock.calls).toEqual([[{ userId: 'ada', banReason: 'Spam', banExpiresIn: 86_400 }], [{ userId: 'grace' }]])
    expect(client.admin.unbanUser).toHaveBeenCalledWith({ userId: 'ada' })
    expect(client.admin.revokeUserSessions).toHaveBeenCalledWith({ userId: 'ada' })
    expect(client.admin.impersonateUser).toHaveBeenCalledWith({ userId: 'ada' })
    expect(client.organization.setActive).toHaveBeenCalledWith({ organizationId: 'w1' })
  })

  it('resolves once a visit began, even when its workspace could not be made active', async () => {
    client.organization.setActive.mockResolvedValueOnce({ data: null, error: { status: 403, code: 'USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION', message: 'Not a member' } })
    const admin = inSetup(() => useAdmin({ api }))
    await expect(admin.impersonate('ada', { workspaceId: 'w1' })).resolves.toBeUndefined()
    expect(client.admin.impersonateUser).toHaveBeenCalledOnce()
    expect(admin.error.value).not.toBeNull()
  })

  it('rejects a refused route and keeps why in error', async () => {
    client.admin.impersonateUser.mockResolvedValueOnce({ data: null, error: { status: 403, code: 'YOU_CANNOT_IMPERSONATE_ADMINS', message: 'You cannot impersonate admins' } })
    const admin = inSetup(() => useAdmin({ api }))
    await expect(admin.impersonate('other_admin')).rejects.toBeTruthy()
    expect(admin.error.value).toMatchObject({ code: 'forbidden', data: { reason: 'admin_target' } })
    expect(admin.isPending.value).toBe(false)
  })
})

describe('<AdminUsers>', () => {
  beforeEach(() => {
    answers.set(key('admin:listUsers', firstPage()), page([account('ada', { banned: true, banExpires: AT + 86_400_000 }), account('helper', { role: 'admin', administrator: true }), account('u_root', { email: 'root@example.com', name: '', role: 'admin', administrator: true })]))
  })

  it('lists every account with its role and status, each named by its view button', () => {
    const wrapper = render(AdminUsers)
    const rows = wrapper.findAll('[data-admin="user"]')
    expect(rows).toHaveLength(3)
    expect(rows[0]!.find('[data-admin="user-status"]').text()).toMatch(/^Banned until /)
    expect(rows[1]!.find('[data-admin="user-role"]').text()).toBe('Administrator')
    expect(rows[2]!.find('[data-admin="badge"]').text()).toBe('You')
    expect(wrapper.find('[data-admin="view"]').attributes('aria-label')).toBe('View ada')
    expect(wrapper.find('[data-admin="search"] label').text()).toBe('Search by email')
  })

  it('renders nothing for a caller who is no administrator', () => {
    answers.set(key('admin:listUsers', firstPage()), null)
    expect(withoutComments(render(AdminUsers).html())).toBe('')
  })

  it('searches as the person types, after a pause', async () => {
    vi.useFakeTimers()
    try {
      answers.set(key('admin:listUsers', firstPage('ada')), page([account('ada')]))
      const wrapper = render(AdminUsers)
      await wrapper.find('[data-admin="input-search"]').setValue('ada')
      await vi.advanceTimersByTimeAsync(350)
      expect(wrapper.findAll('[data-admin="user"]')).toHaveLength(1)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('opens an account in a drawer from the keyboard, and gives focus back on Escape', async () => {
    answers.set(key('admin:getUser', { userId: 'ada' }), detail(account('ada', { banned: true, banReason: 'Spam' })))
    const wrapper = render(AdminUsers)
    const view = wrapper.find<HTMLButtonElement>('[data-admin="view"]')
    view.element.focus()
    await view.trigger('click')
    await flushPromises()
    const drawer = wrapper.find('[data-admin="drawer"]')
    expect(drawer.attributes('aria-labelledby')).toBe(drawer.find('h2').attributes('id'))
    expect(document.activeElement).toBe(drawer.find('[data-admin="close"]').element)
    expect(drawer.find('[data-admin="ban-note"]').text()).toBe('Banned. Spam')
    expect(drawer.find('[data-admin="session"]').text()).toContain('Firefox on Windows')
    expect(drawer.find('[data-admin="membership"]').text()).toBe('Acme, as owner')
    await drawer.trigger('cancel')
    await flushPromises()
    expect(wrapper.find('[data-admin="drawer"]').exists()).toBe(false)
    expect(document.activeElement).toBe(view.element)
  })

  it('opens the account a link names, whatever page of the list shows', async () => {
    answers.set(key('admin:getUser', { userId: 'zed' }), detail(account('zed', { email: 'zed@example.com' })))
    const wrapper = render(AdminUsers, { userId: 'zed' })
    await flushPromises()
    const drawer = wrapper.find('[data-admin="drawer"]')
    expect(drawer.exists()).toBe(true)
    expect(drawer.text()).toContain('zed@example.com')
    expect(document.activeElement).toBe(drawer.find('[data-admin="close"]').element)
  })

  it('lets a linked account go that is on no page and cannot be read, and says why the list failed', async () => {
    answers.set(key('admin:getUser', { userId: 'gone' }), null)
    answers.set(key('admin:listUsers', firstPage()), new Error('Server unreachable'))
    const wrapper = render(AdminUsers, { userId: 'gone' })
    await flushPromises()
    expect(wrapper.find('[data-admin="drawer"]').exists()).toBe(false)
    expect(wrapper.find('[data-admin="users"] > [data-admin="error"]').attributes('role')).toBe('alert')
  })

  it('offers the app\'s own roles, and the account\'s, and says when a list holds only its first rows', async () => {
    answers.set(key('admin:getUser', { userId: 'ada' }), detail(account('ada', { role: 'editor' }), { truncated: true }))
    const wrapper = render(AdminUsers, { roles: ['user', 'support'] })
    await wrapper.find('[data-admin="view"]').trigger('click')
    await flushPromises()
    const options = wrapper.findAll<HTMLOptionElement>('[data-admin="select-role"] option').map(option => option.element.value)
    expect(options).toEqual(['user', 'support', 'editor'])
    expect(wrapper.find('[data-admin="truncated"]').exists()).toBe(true)
  })

  it('bans after confirming it is the person, and says so', async () => {
    answers.set(key('admin:getUser', { userId: 'grace' }), detail(account('grace')))
    answers.set(key('admin:listUsers', firstPage()), page([account('grace')]))
    const wrapper = render(AdminUsers, { confirm: () => true })
    await wrapper.find('[data-admin="view"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-admin="input-ban-reason"]').setValue('Spam')
    await wrapper.find('[data-admin="select-ban-duration"]').setValue('week')
    await wrapper.find('[data-admin="ban-form"]').trigger('submit')
    await flushPromises()
    expect(reauthenticated).toHaveBeenCalled()
    expect(client.admin.banUser).toHaveBeenCalledWith({ userId: 'grace', banReason: 'Spam', banExpiresIn: 604_800 })
    expect(wrapper.find('[data-admin="message"][role="status"]').text()).toBe('The account is banned.')
    expect(wrapper.emitted('banned')).toEqual([['grace']])
  })

  it('keeps a pressed button focusable and says it waits', async () => {
    let finish!: (answer: Answer) => void
    client.admin.revokeUserSessions.mockImplementationOnce(() => new Promise(resolve => (finish = resolve)))
    answers.set(key('admin:getUser', { userId: 'ada' }), detail(account('ada')))
    const wrapper = render(AdminUsers)
    await wrapper.find('[data-admin="view"]').trigger('click')
    await flushPromises()
    const button = wrapper.find<HTMLButtonElement>('[data-admin="revoke-sessions"]')
    button.element.focus()
    await button.trigger('click')
    expect(button.attributes('aria-disabled')).toBe('true')
    expect(button.text()).toBe('Signing out…')
    expect(document.activeElement).toBe(button.element)
    finish(ok())
    await flushPromises()
    expect(wrapper.find('[data-admin="message"]').text()).toBe('Every session is signed out.')
  })

  it('impersonates an account and reloads the app as it, at the landing', async () => {
    answers.set(key('admin:getUser', { userId: 'ada' }), detail(account('ada')))
    const wrapper = render(AdminUsers, { landing: '/dashboard' })
    await wrapper.find('[data-admin="view"]').trigger('click')
    await flushPromises()
    const impersonate = wrapper.find('[data-admin="impersonate"]')
    expect(impersonate.attributes('aria-label')).toBe('Impersonate ada')
    await impersonate.trigger('click')
    await flushPromises()
    expect(client.admin.impersonateUser).toHaveBeenCalledWith({ userId: 'ada' })
    expect(reload).toHaveBeenCalledWith({ path: '/dashboard', force: true })
  })

  it('offers no impersonation of an administrator, and nothing but reading on the caller\'s own account', async () => {
    answers.set(key('admin:getUser', { userId: 'helper' }), detail(account('helper', { role: 'admin', administrator: true })))
    answers.set(key('admin:getUser', { userId: 'u_root' }), detail(account('u_root', { role: 'admin', administrator: true })))
    const wrapper = render(AdminUsers)
    const views = wrapper.findAll('[data-admin="view"]')
    await views[1]!.trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-admin="impersonate"]').exists()).toBe(false)
    expect(wrapper.find('[data-admin="impersonate-note"]').text()).toBe('An administrator\'s account can\'t be impersonated.')
    await wrapper.find('[data-admin="close"]').trigger('click')
    await flushPromises()
    await wrapper.findAll('[data-admin="view"]')[2]!.trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-admin="self-note"]').exists()).toBe(true)
    expect(wrapper.find('[data-admin="ban-form"]').exists()).toBe(false)
    expect(wrapper.find('[data-admin="role-form"]').exists()).toBe(false)
  })
})

describe('<AdminWorkspaces>', () => {
  it('reads a workspace and impersonates a member in it, never an administrator', async () => {
    answers.set(key('admin:listWorkspaces', firstPage()), { page: [{ id: 'w1', name: 'Acme', slug: 'acme', logo: null, createdAt: AT }], isDone: true, continueCursor: 'e' })
    answers.set(key('admin:getWorkspace', { workspaceId: 'w1' }), {
      workspace: { id: 'w1', name: 'Acme', slug: 'acme', logo: null, createdAt: AT },
      members: [
        { userId: 'grace', name: 'Grace', email: 'grace@example.com', role: 'owner', administrator: false, banned: false, joinedAt: AT },
        { userId: 'helper', name: 'Helper', email: 'helper@example.com', role: 'member', administrator: true, banned: false, joinedAt: AT },
      ],
      invitations: [{ id: 'i1', email: 'new@example.com', role: 'member', expiresAt: AT }],
      truncated: true,
    } satisfies AdminWorkspaceDetail)
    const wrapper = render(AdminWorkspaces)
    expect(wrapper.find('[data-admin="read-only-note"]').exists()).toBe(true)
    await wrapper.find('[data-admin="view"]').trigger('click')
    await flushPromises()
    const members = wrapper.findAll('[data-admin="member"]')
    expect(members[0]!.find('[data-admin="member-name"]').text()).toBe('Grace, owner')
    expect(members[1]!.find('[data-admin="impersonate"]').exists()).toBe(false)
    expect(wrapper.find('[data-admin="invitation"]').text()).toBe('new@example.com, as member')
    expect(wrapper.find('[data-admin="truncated"]').text()).toBe('Only the first 100 of each list show here.')
    await members[0]!.find('[data-admin="impersonate"]').trigger('click')
    await flushPromises()
    expect(client.admin.impersonateUser).toHaveBeenCalledWith({ userId: 'grace' })
    expect(client.organization.setActive).toHaveBeenCalledWith({ organizationId: 'w1' })
    expect(reload).toHaveBeenCalledWith({ path: '/', force: true })
  })
})

describe('the admin console', () => {
  it('moves between tabs with the arrow keys, Home and End, and loads each panel when its tab opens', async () => {
    answers.set(key('admin:listUsers', firstPage()), page([account('ada')]))
    const wrapper = render(AdminConsole)
    const tabs = () => wrapper.findAll<HTMLButtonElement>('[role="tab"]')
    expect(tabs().map(tab => tab.text())).toEqual(['Users', 'Workspaces', 'Activity', 'Flags', 'System'])
    expect(tabs().map(tab => tab.attributes('tabindex'))).toEqual(['0', '-1', '-1', '-1', '-1'])
    const panel = wrapper.find('[role="tabpanel"]')
    expect(panel.attributes('aria-labelledby')).toBe(tabs()[0]!.attributes('id'))
    await flushPromises()
    expect(wrapper.find('[data-admin="users"]').exists()).toBe(true)

    tabs()[0]!.element.focus()
    await wrapper.find('[role="tablist"]').trigger('keydown', { key: 'ArrowRight' })
    await flushPromises()
    expect(tabs()[1]!.attributes('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tabs()[1]!.element)
    expect(wrapper.emitted('update:tab')).toEqual([['workspaces']])
    await wrapper.find('[role="tablist"]').trigger('keydown', { key: 'End' })
    expect(tabs()[4]!.attributes('aria-selected')).toBe('true')
    await wrapper.find('[role="tablist"]').trigger('keydown', { key: 'ArrowRight' })
    expect(tabs()[0]!.attributes('aria-selected')).toBe('true')
    await wrapper.find('[role="tablist"]').trigger('keydown', { key: 'ArrowLeft' })
    await wrapper.find('[role="tablist"]').trigger('keydown', { key: 'Home' })
    expect(tabs()[0]!.attributes('aria-selected')).toBe('true')
  })

  it('opens on the tab the address names, and on the first for one it does not know', () => {
    expect(render(AdminConsole, { tab: 'system' }).find('[aria-selected="true"]').text()).toBe('System')
    expect(render(AdminConsole, { tab: 'nope' }).find('[aria-selected="true"]').text()).toBe('Users')
  })

  it('opens the Users tab on the account the address names (?tab=users&user=)', async () => {
    answers.set(key('admin:listUsers', firstPage()), page([account('ada')]))
    answers.set(key('admin:getUser', { userId: 'zed' }), detail(account('zed')))
    const wrapper = render(AdminConsole, { tab: 'users', userId: 'zed' })
    await flushPromises()
    expect(wrapper.find('[data-admin="drawer"]').text()).toContain('zed@example.com')
  })

  it('follows the address after a tab was picked: a link or back and forward wins', async () => {
    const wrapper = render(AdminConsole, { tab: 'users' })
    await wrapper.findAll('[role="tab"]')[4]!.trigger('click')
    expect(wrapper.find('[aria-selected="true"]').text()).toBe('System')
    await wrapper.setProps({ tab: 'system' })
    await wrapper.setProps({ tab: 'workspaces' })
    expect(wrapper.find('[aria-selected="true"]').text()).toBe('Workspaces')
  })
})

describe('the console with the app\'s own tabs', () => {
  const appTabs = [
    { key: 'app:featured', path: '/admin/featured', label: 'Featured', icon: 'i-lucide-star', order: 25 },
    { key: 'app:queue', path: '/admin/queue', label: 'Queue', order: 1000 },
  ]
  const labels = (wrapper: VueWrapper) => wrapper.findAll('[role="tab"]').map(tab => tab.text())

  it('lists them among the built-in tabs by order, with the icon before the label', () => {
    const wrapper = render(AdminConsole, { appTabs })
    expect(labels(wrapper)).toEqual(['Users', 'Workspaces', 'Featured', 'Activity', 'Flags', 'System', 'Queue'])
    const featured = wrapper.find('[data-admin-tab="app:featured"]')
    expect(featured.find('[data-admin="tab-icon"]').classes()).toContain('i-lucide-star')
    expect(featured.find('[data-admin="tab-icon"]').attributes('aria-hidden')).toBe('true')
    expect(wrapper.find('[data-admin-tab="app:queue"] [data-admin="tab-icon"]').exists()).toBe(false)
    // The console still opens on the first built-in tab.
    expect(wrapper.find('[aria-selected="true"]').text()).toBe('Users')
  })

  it('sorts two tabs that share an order by label', () => {
    const same = [{ key: 'app:b', path: '/admin/b', label: 'Beta', order: 25 }, { key: 'app:a', path: '/admin/a', label: 'Alpha', order: 25 }]
    expect(labels(render(AdminConsole, { appTabs: same }))).toEqual(['Users', 'Workspaces', 'Alpha', 'Beta', 'Activity', 'Flags', 'System'])
  })

  it('asks the page to open an app tab instead of switching panels, by click and by keyboard', async () => {
    const wrapper = render(AdminConsole, { appTabs })
    await wrapper.find('[data-admin-tab="app:featured"]').trigger('click')
    expect(wrapper.emitted('open')).toEqual([['/admin/featured']])
    expect(wrapper.emitted('update:tab')).toBeUndefined()
    await wrapper.find('[role="tablist"]').trigger('keydown', { key: 'End' })
    expect(wrapper.emitted('open')?.at(-1)).toEqual(['/admin/queue'])
    // A built-in tab still selects itself and updates the address.
    await wrapper.find('[data-admin-tab="flags"]').trigger('click')
    expect(wrapper.emitted('update:tab')).toEqual([['flags']])
  })

  it('shows the page in the panel, the tab it belongs to selected', () => {
    const wrapper = mount(AdminConsole as never, {
      props: { appTabs, page: true, pageTab: 'app:featured' } as never,
      slots: { default: '<p data-testid="featured">Featured strips</p>' },
      attachTo: document.body,
      global: { provide },
    }) as VueWrapper
    mounted.push(wrapper)
    expect(wrapper.find('[aria-selected="true"]').text()).toBe('Featured')
    expect(wrapper.findAll('[aria-selected="true"]')).toHaveLength(1)
    expect(wrapper.find('[role="tabpanel"] [data-testid="featured"]').text()).toBe('Featured strips')
    expect(wrapper.find('[role="tabpanel"]').attributes('aria-labelledby')).toBe(wrapper.find('[data-admin-tab="app:featured"]').attributes('id'))
    expect(wrapper.find('[data-admin="users"]').exists()).toBe(false)
  })

  it('shows a page the bar does not list with no tab selected, and the first tab as the keyboard\'s one stop', () => {
    const wrapper = mount(AdminConsole as never, {
      props: { appTabs, page: true } as never,
      slots: { default: '<p data-testid="unlisted">Unlisted</p>' },
      attachTo: document.body,
      global: { provide },
    }) as VueWrapper
    mounted.push(wrapper)
    expect(wrapper.findAll('[aria-selected="true"]')).toHaveLength(0)
    expect(wrapper.findAll('[role="tab"]').map(tab => tab.attributes('tabindex'))).toEqual(['0', '-1', '-1', '-1', '-1', '-1', '-1'])
    expect(wrapper.find('[role="tabpanel"]').attributes('aria-labelledby')).toBeUndefined()
    expect(wrapper.find('[role="tabpanel"]').attributes('aria-label')).toBe('Admin')
    expect(wrapper.find('[data-testid="unlisted"]').exists()).toBe(true)
  })

  it('keeps a built-in tab and an app tab of the same name apart', async () => {
    const wrapper = render(AdminConsole, { appTabs: [{ key: 'app:users', path: '/admin/users', label: 'Staff', order: 5 }] })
    expect(labels(wrapper).slice(0, 2)).toEqual(['Staff', 'Users'])
    await wrapper.find('[data-admin-tab="app:users"]').trigger('click')
    expect(wrapper.emitted('open')).toEqual([['/admin/users']])
    expect(wrapper.find('[aria-selected="true"]').text()).toBe('Users')
  })
})

describe('the Flags tab', () => {
  const flag = (key: string, fields: Partial<AdminFlag> = {}): AdminFlag => ({ key, description: `${key}.`, builtIn: false, declared: true, default: false, by: 'user', override: null, updatedAt: null, ...fields })
  const FLAGS: AdminFlag[] = [
    flag('pause_signups', { builtIn: true }),
    flag('pause_checkout', { builtIn: true, override: { enabled: true }, updatedAt: AT }),
    flag('pause_ai', { builtIn: true }),
    flag('maintenance', { builtIn: true, override: { enabled: false, message: 'Back at 3 pm.' } }),
    flag('newEditor', { override: { users: ['ada'], rollout: 25 }, updatedAt: AT }),
    flag('boards', { by: 'workspace' }),
    flag('tips', { default: true }),
  ]
  const tab = (props: Record<string, unknown> = {}) => {
    answers.set(key('flags:listFlags', {}), FLAGS)
    return render(AdminFlags, props)
  }

  it('lists the kill switches as switches, then the app\'s flags with what each is now', () => {
    const wrapper = tab()
    const switches = wrapper.findAll('[data-admin="switch-toggle"]')
    expect(switches.map(toggle => [toggle.text(), toggle.attributes('role'), toggle.attributes('aria-checked')])).toEqual([
      ['Pause sign-ups', 'switch', 'false'],
      ['Pause checkout', 'switch', 'true'],
      ['Pause AI', 'switch', 'false'],
      ['Maintenance banner', 'switch', 'false'],
    ])
    // Each says what it does, by its description.
    const description = wrapper.find(`#${switches[1]!.attributes('aria-describedby')}`)
    expect(description.text()).toContain('New checkouts, plan switches and gift purchases are refused')
    expect(wrapper.find<HTMLTextAreaElement>('[data-admin="maintenance-message"]').element.value).toBe('Back at 3 pm.')
    expect(wrapper.findAll('[data-admin="flag"]').map(row => [row.find('code').text(), row.find('[data-admin="flag-state"]').text().replace(/Changed.*/, '').trim()])).toEqual([
      ['newEditor', 'On for some · 25% rolled out'],
      ['boards', 'Default: off'],
      ['tips', 'Default: on'],
    ])
  })

  it('turns a switch on from the keyboard, after asking, through a recent sign-in, and keeps focus while it saves', async () => {
    let finish!: () => void
    setFlagCall.mockImplementationOnce(() => new Promise(resolve => (finish = () => resolve(null))))
    const confirm = vi.fn(() => true)
    const wrapper = tab({ confirm })
    const toggle = wrapper.findAll<HTMLButtonElement>('[data-admin="switch-toggle"]')[0]!
    // A native button: Tab reaches it, and Enter or Space press it.
    expect(toggle.element.tagName).toBe('BUTTON')
    expect(toggle.attributes('type')).toBe('button')
    toggle.element.focus()
    await toggle.trigger('click')
    expect(confirm).toHaveBeenCalledWith('Turn on “Pause sign-ups” for everyone?')
    await flushPromises()
    expect(reauthenticated).toHaveBeenCalledTimes(1)
    expect(setFlagCall).toHaveBeenCalledWith({ key: 'pause_signups', override: { enabled: true } })
    expect(toggle.attributes('aria-disabled')).toBe('true')
    expect(document.activeElement).toBe(toggle.element)
    // A second press while it saves starts nothing.
    await toggle.trigger('click')
    expect(setFlagCall).toHaveBeenCalledTimes(1)
    finish()
    await flushPromises()
    expect(wrapper.find('[data-admin="message"][role="status"]').text()).toBe('Saved.')
  })

  it('asks before turning a switch on, never before turning one off, and keeps the banner\'s message when it goes off', async () => {
    const confirm = vi.fn(() => false)
    const wrapper = tab({ confirm })
    const [, checkout, , banner] = wrapper.findAll('[data-admin="switch-toggle"]')
    await wrapper.findAll('[data-admin="switch-toggle"]')[2]!.trigger('click')
    await flushPromises()
    expect(setFlagCall).not.toHaveBeenCalled()
    await checkout!.trigger('click')
    await flushPromises()
    expect(setFlagCall).toHaveBeenLastCalledWith({ key: 'pause_checkout', override: null })
    // The banner's message: saved on its own, and sent with the switch.
    await wrapper.find('[data-admin="maintenance-message"]').setValue('  Down until 4 pm.  ')
    await wrapper.find('[data-admin="save-message"]').trigger('click')
    await flushPromises()
    expect(setFlagCall).toHaveBeenLastCalledWith({ key: 'maintenance', override: { enabled: false, message: 'Down until 4 pm.' } })
    confirm.mockReturnValue(true)
    await banner!.trigger('click')
    await flushPromises()
    expect(setFlagCall).toHaveBeenLastCalledWith({ key: 'maintenance', override: { enabled: true, message: 'Back at 3 pm.' } })
    expect(confirm).toHaveBeenCalledTimes(2)
  })

  it('edits a flag\'s override in place, by keyboard, and gives focus back to its Edit button', async () => {
    const wrapper = tab()
    const edit = wrapper.findAll<HTMLButtonElement>('[data-admin="flag-edit"]')[0]!
    edit.element.focus()
    await edit.trigger('click')
    await flushPromises()
    const editor = wrapper.find('[data-admin="flag-editor"]')
    expect(editor.attributes('aria-label')).toBe('Edit newEditor')
    expect(edit.attributes('aria-expanded')).toBe('true')
    // Focus lands on the first choice; the fields hold the stored override.
    expect(document.activeElement).toBe(editor.find('input').element)
    expect(wrapper.find<HTMLTextAreaElement>('[data-admin="flag-users"]').element.value).toBe('ada')
    expect(wrapper.find<HTMLInputElement>('[data-admin="flag-rollout"]').element.value).toBe('25')
    await wrapper.find('[data-admin="flag-users"]').setValue('ada, bob\ncleo')
    await wrapper.find('[data-admin="flag-plans"]').setValue('pro')
    await wrapper.find('[data-admin="flag-rollout"]').setValue('50')
    await editor.trigger('submit')
    await flushPromises()
    expect(reauthenticated).toHaveBeenCalled()
    expect(setFlagCall).toHaveBeenCalledWith({ key: 'newEditor', override: { users: ['ada', 'bob', 'cleo'], plans: ['pro'], rollout: 50 } })
    expect(wrapper.find('[data-admin="flag-editor"]').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.findAll('[data-admin="flag-edit"]')[0]!.element)
  })

  it('puts a flag back to its default, and cancels without saving', async () => {
    const wrapper = tab()
    await wrapper.findAll('[data-admin="flag-edit"]')[0]!.trigger('click')
    await wrapper.find('[data-admin="flag-reset"]').trigger('click')
    await flushPromises()
    expect(setFlagCall).toHaveBeenLastCalledWith({ key: 'newEditor', override: null })
    // A flag with no override offers nothing to put back.
    await wrapper.findAll('[data-admin="flag-edit"]')[1]!.trigger('click')
    expect(wrapper.find('[data-admin="flag-reset"]').exists()).toBe(false)
    await wrapper.find('[data-admin="flag-cancel"]').trigger('click')
    await flushPromises()
    expect(setFlagCall).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(wrapper.findAll('[data-admin="flag-edit"]')[1]!.element)
  })

  it('says why a change was refused, as the server words it', async () => {
    setFlagCall.mockRejectedValueOnce(new ConvexError({ code: 'invalid_input', field: 'rollout', reason: 'a percentage from 0 to 100' }))
    const wrapper = tab()
    await wrapper.findAll('[data-admin="flag-edit"]')[0]!.trigger('click')
    await wrapper.find('[data-admin="flag-editor"]').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-admin="message"][data-tone="error"]').text()).toBe('That input isn\'t valid. Check it and try again.')
    expect(wrapper.find('[data-admin="flag-editor"]').exists()).toBe(true)
  })

  it('says a flag on for everyone is on, whatever targets it names, and that they wait until it is off', () => {
    answers.set(key('flags:listFlags', {}), [
      ...FLAGS.filter(each => each.builtIn),
      flag('tips', { default: true, override: { users: ['ada'], rollout: 10 } }),
      flag('newEditor', { override: { enabled: true, workspaces: ['acme'] } }),
    ])
    const wrapper = render(AdminFlags)
    expect(wrapper.findAll('[data-admin="flag-state"]').map(cell => cell.text())).toEqual([
      'Default: on · its targets apply once it is off',
      'On for everyone · its targets apply once it is off',
    ])
  })

  it('lists an override the code no longer declares, with a Remove button that keeps focus on the page', async () => {
    const stale = flag('oldEditor', { declared: false, description: '', override: { enabled: true }, updatedAt: AT })
    answers.set(key('flags:listFlags', {}), [...FLAGS, stale])
    const wrapper = render(AdminFlags)
    const row = wrapper.find('[data-flag="oldEditor"]')
    expect(row.find('[data-admin="flag-state"]').text()).toMatch(/^Not in code: it turns nothing on/)
    expect(row.find('[data-admin="flag-edit"]').exists()).toBe(false)
    const remove = row.find<HTMLButtonElement>('[data-admin="flag-remove"]')
    expect(remove.text()).toBe('Remove')
    remove.element.focus()
    // The row goes once the override does.
    setFlagCall.mockImplementationOnce(async () => {
      answers.set(key('flags:listFlags', {}), FLAGS)
      return null
    })
    await remove.trigger('click')
    await flushPromises()
    expect(reauthenticated).toHaveBeenCalled()
    expect(setFlagCall).toHaveBeenCalledWith({ key: 'oldEditor', override: null })
    expect(document.activeElement?.getAttribute('data-admin')).toMatch(/^(?:flag-edit|switch-toggle)$/)
  })

  it('shows nothing to change to a caller who is no administrator', () => {
    answers.set(key('flags:listFlags', {}), null)
    const wrapper = render(AdminFlags)
    expect(wrapper.find('[data-admin="error"][role="alert"]').text()).toBe('Only administrators see and change flags.')
    expect(wrapper.find('[data-admin="switch-toggle"]').exists()).toBe(false)
  })
})

describe('<ImpersonationBanner>', () => {
  it('renders nothing for a person\'s own session', () => {
    expect(withoutComments(render(ImpersonationBanner).html())).toBe('')
  })

  it('says whose account this is and when the visit ends, and ends it at the admin console', async () => {
    me.value = { id: 'ada', email: 'ada@example.com', name: 'Ada' }
    sessionData.value = { id: 's2', impersonatedBy: 'u_root', expiresAt: new Date(Date.now() + 1_800_000).toISOString() }
    const wrapper = render(ImpersonationBanner)
    const banner = wrapper.find('aside[data-impersonation="banner"]')
    expect(banner.attributes('aria-label')).toBe('Administrator visit')
    expect(banner.find('[data-impersonation="message"]').text()).toBe('You are acting as Ada.')
    expect(banner.find('[data-impersonation="ends"]').text()).toMatch(/^The visit ends at /)
    await banner.find('[data-impersonation="stop"]').trigger('click')
    await flushPromises()
    expect(client.admin.stopImpersonating).toHaveBeenCalled()
    expect(reload).toHaveBeenCalledWith({ path: '/admin', force: true })
    expect(wrapper.emitted('stopped')).toHaveLength(1)
  })

  it('names no time in its first render, the one a server render must match', async () => {
    me.value = { id: 'ada', email: 'ada@example.com', name: 'Ada' }
    sessionData.value = { id: 's2', impersonatedBy: 'u_root', expiresAt: new Date(Date.now() + 1_800_000).toISOString() }
    const nuxtApp = useNuxtApp()
    nuxtApp.isHydrating = true
    try {
      const wrapper = render(ImpersonationBanner)
      expect(wrapper.find('[data-impersonation="message"]').exists()).toBe(true)
      expect(wrapper.find('[data-impersonation="ends"]').exists()).toBe(false)
      await nextTick()
      expect(wrapper.find('[data-impersonation="ends"]').exists()).toBe(true)
    }
    finally {
      nuxtApp.isHydrating = false
    }
  })

  it('shows once however many are mounted, and the next takes over when the first goes', async () => {
    me.value = { id: 'ada', email: 'ada@example.com', name: 'Ada' }
    sessionData.value = { id: 's2', impersonatedBy: 'u_root' }
    const layout = ref(true)
    const wrapper = render(defineComponent({
      setup: () => () => h('div', [layout.value ? h(ImpersonationBanner, { to: '/layout' }) : null, h('main', [h(ImpersonationBanner, { to: '/frame' })])]),
    }))
    expect(wrapper.findAll('aside[data-impersonation="banner"]')).toHaveLength(1)
    expect(wrapper.find('main').find('aside').exists()).toBe(false)
    layout.value = false
    await nextTick()
    await nextTick()
    expect(wrapper.findAll('aside[data-impersonation="banner"]')).toHaveLength(1)
    expect(wrapper.find('main').find('aside').exists()).toBe(true)
  })

  it('says why, as an alert, when the visit could not end', async () => {
    me.value = { id: 'ada', email: 'ada@example.com' }
    sessionData.value = { id: 's2', impersonatedBy: 'u_root' }
    client.admin.stopImpersonating.mockResolvedValueOnce({ data: null, error: { status: 500, message: 'Failed to find admin session' } })
    const wrapper = render(ImpersonationBanner, { to: '/home' })
    expect(wrapper.find('[data-impersonation="message"]').text()).toBe('You are acting as ada@example.com.')
    await wrapper.find('[data-impersonation="stop"]').trigger('click')
    await flushPromises()
    expect(reload).not.toHaveBeenCalled()
    expect(wrapper.find('[data-impersonation="error"][role="alert"]').exists()).toBe(true)
    expect(wrapper.emitted('error')).toHaveLength(1)
  })
})

describe('the Access tab', () => {
  const accessConsole = (fields: Partial<AccessConsole> = {}): AccessConsole => ({
    phase: 'early-access',
    phases: ['early-access', 'invite-only', 'public'],
    invites: [{ id: 'i1', kind: 'code', label: 'meetup', maxUses: 30, uses: 2, status: 'valid', expiresAt: null, createdAt: AT }],
    admissions: [{ id: 'a1', email: 'grace@resend.dev', source: 'invitation', label: 'beta-1', expiresAt: AT + 1000, usedAt: null, createdAt: AT }],
    ...fields,
  })

  function access(props: Record<string, unknown> = {}) {
    answers.set(key('access:getAccessConsole', {}), accessConsole())
    return mount(AdminAccess as never, {
      props: { confirm: () => true, ...props } as never,
      attachTo: document.body,
      global: { provide: { ...provide, [BackendApiKey as symbol]: { access: { getAccessConsole: 'access:getAccessConsole', setAccessPhase: 'access:setAccessPhase', createInvite: 'access:createInvite', revokeInvite: 'access:revokeInvite', admitEmails: 'access:admitEmails' } } } },
    }) as VueWrapper
  }

  it('says it is loading until the console lands', async () => {
    const wrapper = access()
    answers.delete(key('access:getAccessConsole', {}))
    await loadsFirst(wrapper, () => answers.set(key('access:getAccessConsole', {}), accessConsole()), '[data-admin="access-current"]')
    wrapper.unmount()
  })

  it('shows the phase and moves it to another the app lists', async () => {
    const wrapper = access()
    await flushPromises()
    expect(wrapper.find('[data-admin="access-current"]').text()).toBe('Now: Early access')
    const moves = wrapper.findAll('[data-admin="access-move"]')
    expect(moves.map(button => button.text())).toEqual(['Move to Invite only', 'Move to Public'])
    await moves[0]!.trigger('click')
    await flushPromises()
    expect(setFlagCall).toHaveBeenCalledWith({ phase: 'invite-only' })
    wrapper.unmount()
  })

  it('makes a code and shows it once; lists codes without ever the code, and invitations by address', async () => {
    setFlagCall.mockResolvedValueOnce({ id: 'i2', code: '7KQ2M-XW9PA' } as never)
    const wrapper = access()
    await flushPromises()
    expect(wrapper.find('[data-admin="access-invites-table"] tbody tr').text()).toContain('meetup')
    expect(wrapper.find('[data-admin="access-admissions-table"] tbody tr').text()).toContain('grace@resend.dev')
    await wrapper.find('[data-admin="access-create"] input[type="text"]').setValue('friends')
    await wrapper.find('[data-admin="access-create"]').trigger('submit')
    await flushPromises()
    expect(setFlagCall).toHaveBeenCalledWith({ kind: 'code', label: 'friends', maxUses: 1 })
    expect(wrapper.find('[data-admin="access-secret"]').text()).toBe('7KQ2M-XW9PA')
    wrapper.unmount()
  })

  it('says the tab is for administrators to anyone else', async () => {
    const wrapper = access()
    answers.set(key('access:getAccessConsole', {}), null)
    await flushPromises()
    expect(wrapper.find('[data-admin="refused"]').exists()).toBe(true)
    wrapper.unmount()
  })
})

describe('the Waitlist tab', () => {
  const waitlistConsole = (fields: Partial<WaitlistConsole> = {}): WaitlistConsole => ({
    counts: { waiting: 2, admitted: 1, declined: 0, joined: 4 },
    mirror: { pending: 0, drift: 1 },
    entries: [
      { id: 'e1', email: 'mo@panels.example', status: 'waiting', source: 'landing', answers: { role: 'Illustrator' }, locale: 'en', note: null, verifiedAt: AT, boost: 2, launchNews: true, mirror: 'drift', declinedFor: null },
      { id: 'e2', email: 'kai@panels.example', status: 'waiting', source: 'sign-in', answers: {}, locale: null, note: 'press', verifiedAt: AT + 1000, boost: 0, launchNews: false, mirror: null, declinedFor: null },
    ],
    questions: { role: ['Writer', 'Illustrator'] },
    ...fields,
  })
  const apis = { getWaitlistConsole: 'waitlist:getWaitlistConsole', admitWaitlist: 'waitlist:admitWaitlist', declineWaitlist: 'waitlist:declineWaitlist', noteWaitlist: 'waitlist:noteWaitlist' }

  function waitlistTab(props: Record<string, unknown> = {}, filter: Record<string, unknown> = {}) {
    answers.set(key('waitlist:getWaitlistConsole', filter), waitlistConsole())
    return mount(AdminWaitlist as never, {
      props: { confirm: () => true, ...props } as never,
      attachTo: document.body,
      global: { provide: { ...provide, [BackendApiKey as symbol]: { waitlist: apis } } },
    }) as VueWrapper
  }

  it('says it is loading until the console lands', async () => {
    const wrapper = waitlistTab({}, { status: 'waiting' })
    answers.delete(key('waitlist:getWaitlistConsole', { status: 'waiting' }))
    await loadsFirst(wrapper, () => answers.set(key('waitlist:getWaitlistConsole', { status: 'waiting' }), waitlistConsole()), '[data-admin="waitlist-table"]')
    wrapper.unmount()
  })

  it('counts each status and lists the oldest waiting first, with the drifted contacts said', async () => {
    const wrapper = waitlistTab({}, { status: 'waiting' })
    await flushPromises()
    expect(wrapper.findAll('[data-admin="waitlist-count"]').map(count => count.text())).toEqual(['2', '1', '0', '4'])
    expect(wrapper.findAll('[data-admin="waitlist-table"] tbody tr').map(row => row.find('th').text())).toEqual(['mo@panels.example', 'kai@panels.example'])
    expect(wrapper.find('[data-admin="waitlist-drift"]').text()).toContain('1 contact has drifted')
    wrapper.unmount()
  })

  it('approves the ones ticked, and the next N, each behind a recent sign-in', async () => {
    setFlagCall.mockResolvedValueOnce({ admitted: 1 } as never).mockResolvedValueOnce({ admitted: 50 } as never)
    const wrapper = waitlistTab({}, { status: 'waiting' })
    await flushPromises()
    await wrapper.findAll('[data-admin="waitlist-table"] tbody input[type="checkbox"]')[1]!.setValue(true)
    await wrapper.find('[data-admin="waitlist-approve"]').trigger('click')
    await flushPromises()
    expect(setFlagCall).toHaveBeenLastCalledWith({ ids: ['e2'] })
    expect(wrapper.find('[data-admin="message"]').text()).toBe('1 person admitted and emailed.')
    await wrapper.find('[data-admin="waitlist-wave"]').trigger('submit')
    await flushPromises()
    expect(setFlagCall).toHaveBeenLastCalledWith({ next: 50 })
    expect(reauthenticated).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('declines only the ticked rows still on screen, never ones a wave admitted meanwhile', async () => {
    setFlagCall.mockResolvedValueOnce({ admitted: 2 } as never).mockResolvedValueOnce({ declined: 1 } as never)
    const wrapper = waitlistTab({}, { status: 'waiting' })
    await flushPromises()
    await wrapper.findAll('[data-admin="waitlist-table"] tbody input[type="checkbox"]')[0]!.setValue(true)
    await wrapper.find('[data-admin="waitlist-wave"]').trigger('submit')
    await flushPromises()
    // The wave admitted both: they leave the waiting list, and a newcomer joins it.
    const newcomer = { ...waitlistConsole().entries[1]!, id: 'e3', email: 'ida@panels.example' }
    answers.set(key('waitlist:getWaitlistConsole', { status: 'waiting' }), waitlistConsole({ entries: [newcomer] }))
    await flushPromises()
    await wrapper.findAll('[data-admin="waitlist-table"] tbody input[type="checkbox"]')[0]!.setValue(true)
    await wrapper.find('[data-admin="waitlist-decline"]').trigger('click')
    await flushPromises()
    expect(setFlagCall).toHaveBeenLastCalledWith({ ids: ['e3'] })
    wrapper.unmount()
  })

  it('asks before declining, and before removing as abuse, and declines nobody unticked', async () => {
    const confirm = vi.fn(() => false)
    setFlagCall.mockResolvedValue({ declined: 1 } as never)
    const wrapper = waitlistTab({ confirm }, { status: 'waiting' })
    await flushPromises()
    await wrapper.find('[data-admin="waitlist-decline"]').trigger('click')
    expect(confirm).not.toHaveBeenCalled()
    await wrapper.findAll('[data-admin="waitlist-table"] tbody input[type="checkbox"]')[0]!.setValue(true)
    await wrapper.find('[data-admin="waitlist-abuse"]').trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledOnce()
    expect(setFlagCall).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    await wrapper.find('[data-admin="waitlist-abuse"]').trigger('click')
    await flushPromises()
    expect(setFlagCall).toHaveBeenLastCalledWith({ ids: ['e1'], abuse: true })
    wrapper.unmount()
  })

  it('keeps a note on an entry', async () => {
    setFlagCall.mockResolvedValue(null as never)
    const wrapper = waitlistTab({}, { status: 'waiting' })
    await flushPromises()
    const form = wrapper.findAll('[data-admin="waitlist-note"]')[0]!
    await form.find('input').setValue('met at the fair')
    await form.trigger('submit')
    await flushPromises()
    expect(setFlagCall).toHaveBeenLastCalledWith({ id: 'e1', note: 'met at the fair' })
    wrapper.unmount()
  })

  it('narrows the list by a filter, once it is sent', async () => {
    const wrapper = waitlistTab({}, { status: 'waiting' })
    answers.set(key('waitlist:getWaitlistConsole', { status: 'waiting', domain: 'panels.example', question: 'role', answer: 'Illustrator' }), waitlistConsole({ entries: [waitlistConsole().entries[0]!] }))
    await flushPromises()
    await wrapper.find('[data-admin="waitlist-filter"] input[type="text"]').setValue('panels.example')
    await wrapper.findAll('[data-admin="waitlist-filter"] select')[1]!.setValue('role')
    await wrapper.findAll('[data-admin="waitlist-filter"] select')[2]!.setValue('Illustrator')
    expect(wrapper.findAll('[data-admin="waitlist-table"] tbody tr')).toHaveLength(2)
    await wrapper.find('[data-admin="waitlist-filter"]').trigger('submit')
    await flushPromises()
    expect(wrapper.findAll('[data-admin="waitlist-table"] tbody tr')).toHaveLength(1)
    wrapper.unmount()
  })

  it('says the tab is for administrators to anyone else', async () => {
    const wrapper = waitlistTab({}, { status: 'waiting' })
    answers.set(key('waitlist:getWaitlistConsole', { status: 'waiting' }), null)
    await flushPromises()
    expect(wrapper.find('[data-admin="refused"]').exists()).toBe(true)
    wrapper.unmount()
  })
})

describe('the Inbox tab', () => {
  const inboxConsole = (fields: Partial<InboxConsole> = {}): InboxConsole => ({
    support: 'support@panels.example',
    rows: [
      { id: 'c1', kind: 'contact', at: AT + 2000, from: 'mo@example.com', name: 'Mo', account: null, subject: null, text: 'Where do I find my invoices? <img src=x onerror=alert(1)>', attachments: [], delivery: 'held', workspaceId: null, thread: null, canReply: false, repliedAt: null },
      { id: 's1', kind: 'support', at: AT + 1000, from: 'steve@example.com', name: 'Steve', account: { id: 'u9', name: 'Steve W', email: 'steve@example.com' }, subject: 'Question about my invoice', text: 'Why was I charged twice?', attachments: [{ name: 'invoice.pdf', size: 48213 }], delivery: null, workspaceId: null, thread: null, canReply: true, repliedAt: null },
      { id: 'r1', kind: 'reply', at: AT, from: 'ana@example.com', name: null, account: null, subject: 'Re: a new comment', text: 'I agree.', attachments: [], delivery: null, workspaceId: null, thread: 'strip:1', canReply: false, repliedAt: null },
    ],
    ...fields,
  })
  const apis = { getInboxConsole: 'email:getInboxConsole', replyToInbox: 'email:replyToInbox' }

  function inboxTab(console: InboxConsole | null = inboxConsole()) {
    answers.set(key('email:getInboxConsole', {}), console)
    return mount(AdminInbox as never, {
      attachTo: document.body,
      global: { provide: { ...provide, [BackendApiKey as symbol]: { email: apis } } },
    }) as VueWrapper
  }

  it('says it is loading until the inbox lands', async () => {
    const wrapper = inboxTab()
    answers.delete(key('email:getInboxConsole', {}))
    await loadsFirst(wrapper, () => answers.set(key('email:getInboxConsole', {}), inboxConsole()), '[data-admin="inbox-list"]')
    wrapper.unmount()
  })

  it('lists what arrived newest first: who wrote, where from, and what became of a contact message', async () => {
    const wrapper = inboxTab()
    await flushPromises()
    const rows = wrapper.findAll('[data-admin="inbox-row"]')
    expect(rows.map(row => row.find('[data-admin="inbox-sender"]').text())).toEqual(['Mo', 'Steve W', 'ana@example.com'])
    expect(rows.map(row => row.find('[data-admin="inbox-kind"]').text())).toEqual(['Contact form', 'Support inbox', 'Reply by email'])
    expect(rows[0]!.find('[data-admin="inbox-delivery"]').text()).toBe('Not sent: test mode, or no email key')
    expect(wrapper.find('[data-admin="inbox-support"]').text()).toBe('Replies go out from support@panels.example.')
    wrapper.unmount()
  })

  it('narrows the list by where a message came from', async () => {
    const wrapper = inboxTab()
    await flushPromises()
    await wrapper.find('[data-admin="inbox-filter"] select').setValue('reply')
    expect(wrapper.findAll('[data-admin="inbox-row"]')).toHaveLength(1)
    await wrapper.find('[data-admin="inbox-filter"] select').setValue('workspace')
    expect(wrapper.find('[data-admin="inbox-empty"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('opens one message at a time, as text and never as markup', async () => {
    const wrapper = inboxTab()
    await flushPromises()
    const open = wrapper.findAll('[data-admin="inbox-open"]')
    await open[0]!.trigger('click')
    expect(open[0]!.attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('[data-admin="inbox-text"]').text()).toContain('<img src=x onerror=alert(1)>')
    expect(wrapper.find('[data-admin="inbox-body"] img').exists()).toBe(false)
    await open[1]!.trigger('click')
    expect(wrapper.findAll('[data-admin="inbox-body"]')).toHaveLength(1)
    expect(wrapper.find('[data-admin="inbox-attachment"]').text()).toBe('invoice.pdf')
    wrapper.unmount()
  })

  it('answers a thread of the support inbox behind a recent sign-in, and offers no reply to a row that is none', async () => {
    replyCall.mockClear()
    const wrapper = inboxTab()
    await flushPromises()
    await wrapper.findAll('[data-admin="inbox-open"]')[0]!.trigger('click')
    expect(wrapper.find('[data-admin="inbox-reply"]').exists()).toBe(false)
    expect(wrapper.find('[data-admin="inbox-no-reply"]').exists()).toBe(true)
    await wrapper.findAll('[data-admin="inbox-open"]')[1]!.trigger('click')
    await wrapper.find('[data-admin="inbox-reply"] textarea').setValue('  Sorry about that, refunded.  ')
    await wrapper.find('[data-admin="inbox-reply"]').trigger('submit')
    await flushPromises()
    expect(replyCall).toHaveBeenCalledWith({ kind: 'inbound', id: 's1', text: 'Sorry about that, refunded.' })
    expect(reauthenticated).toHaveBeenCalled()
    expect(wrapper.find('[data-admin="message"]').text()).toBe('The reply was sent.')
    wrapper.unmount()
  })

  it('answers a contact message the support inbox handed back as a contact row', async () => {
    replyCall.mockClear()
    const wrapper = inboxTab(inboxConsole({ rows: [{ ...inboxConsole().rows[0]!, delivery: 'support', canReply: true }] }))
    await flushPromises()
    await wrapper.find('[data-admin="inbox-open"]').trigger('click')
    await wrapper.find('[data-admin="inbox-reply"] textarea').setValue('Under Billing.')
    await wrapper.find('[data-admin="inbox-reply"]').trigger('submit')
    await flushPromises()
    expect(replyCall).toHaveBeenCalledWith({ kind: 'contact', id: 'c1', text: 'Under Billing.' })
    wrapper.unmount()
  })

  it('says the tab is for administrators to anyone else', async () => {
    const wrapper = inboxTab(null)
    await flushPromises()
    expect(wrapper.find('[data-admin="refused"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows its tab only while backend/email.ts re-exports getInboxConsole', async () => {
    const { ADMIN_TABS } = await import('../../src/runtime/vue/components/admin/admin-tabs')
    expect(ADMIN_TABS.find(tab => tab.key === 'inbox')).toMatchObject({ needs: 'email', has: 'getInboxConsole' })
  })
})

describe('the Billing tab', () => {
  const records: BillingConsole = {
    saveOffers: [
      { id: 'off_2', entityId: 'org_2', subscriptionId: 'sub_2', reason: 'too_expensive', kind: 'discount', months: null, plan: null, discount: 'stay30', madeAt: AT + 2000, acceptedAt: AT + 3000 },
      { id: 'off_1', entityId: 'org_1', subscriptionId: 'sub_1', reason: 'unused', kind: 'pause', months: 2, plan: null, discount: null, madeAt: AT, acceptedAt: null },
    ],
    withdrawals: [{ entityId: 'org_1', subscriptionId: 'sub_1', userId: 'u1', plan: 'Pro', at: AT }],
    consents: [{ entityId: 'org_1', subscriptionId: 'sub_1', userId: 'u1', plan: 'Pro', amount: 2900, currency: 'usd', interval: 'month', intervalCount: 1, termsVersion: '2026-10-01', consentedAt: AT }],
  }

  function billingTab() {
    return mount(AdminBilling as never, {
      attachTo: document.body,
      global: { provide: { ...provide, [BackendApiKey as symbol]: { billing: { getBillingConsole: 'billing:getBillingConsole' } } } },
    }) as VueWrapper
  }

  it('says it is loading until the records land', async () => {
    const wrapper = billingTab()
    await loadsFirst(wrapper, () => answers.set(key('billing:getBillingConsole', {}), records), '[data-admin="billing-offers"]')
    wrapper.unmount()
  })

  it('lists the save offers with their reason and outcome, the withdrawals and the consent proofs', async () => {
    answers.set(key('billing:getBillingConsole', {}), records)
    const wrapper = billingTab()
    await flushPromises()
    const offers = wrapper.findAll('[data-admin="billing-offers"] tbody tr')
    expect(offers.map(row => row.findAll('td').map(cell => cell.text()))).toEqual([
      ['org_2', 'Too expensive', 'Discount stay30', expect.stringMatching(/^Taken on /)],
      ['org_1', 'Not using it enough', 'Pause for 2 months', 'Not taken'],
    ])
    expect(offers.map(row => row.attributes('data-state'))).toEqual(['accepted', 'declined'])
    expect(wrapper.find('[data-admin="billing-withdrawals"] a').attributes('href')).toBe('?tab=users&user=u1')
    expect(wrapper.find('[data-admin="billing-consents"] tbody tr').findAll('td').map(cell => cell.text()).slice(1, 4)).toEqual(['Pro', '$29 every month', '2026-10-01'])
    wrapper.unmount()
  })

  it('narrows every list to one billing entity', async () => {
    vi.useFakeTimers()
    try {
      answers.set(key('billing:getBillingConsole', {}), records)
      answers.set(key('billing:getBillingConsole', { entityId: 'org_9' }), { saveOffers: [], withdrawals: [], consents: [] })
      const wrapper = billingTab()
      await flushPromises()
      await wrapper.find('[data-admin="billing-filter"] input').setValue(' org_9 ')
      await vi.advanceTimersByTimeAsync(350)
      await flushPromises()
      expect(wrapper.findAll('[data-admin="billing-empty"]').map(note => note.text())).toEqual(['No save offers yet.', 'No withdrawals.', 'No consent proofs yet.'])
      wrapper.unmount()
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('says the tab is for administrators to anyone else', async () => {
    answers.set(key('billing:getBillingConsole', {}), null)
    const wrapper = billingTab()
    await flushPromises()
    expect(wrapper.text()).toContain('Only administrators see billing records.')
    wrapper.unmount()
  })

  it('shows its tab only while backend/billing.ts re-exports getBillingConsole', async () => {
    const { ADMIN_TABS } = await import('../../src/runtime/vue/components/admin/admin-tabs')
    expect(ADMIN_TABS.find(tab => tab.key === 'billing')).toMatchObject({ needs: 'billing', has: 'getBillingConsole' })
  })
})

describe('the Costs tab', () => {
  const costs = (fields: Partial<AiCosts> = {}): AiCosts => ({
    since: costWindowStart(30),
    usd: 12.5,
    runs: 9,
    days: [{ day: costWindowStart(1), usd: 12.5, runs: 9 }],
    people: [
      { who: 'u1', name: 'Ada', email: 'ada@example.com', usd: 10, input: 12000, output: 3400, runs: 6 },
      { who: 'guest', usd: 2.25, input: 900, output: 100, runs: 2 },
      { who: 'ws_9', usd: 0.25, input: 10, output: 5, runs: 1 },
    ],
    truncated: false,
    ...fields,
  })

  function costsTab(answer: AiCosts | null, days = 30) {
    answers.set(key('ai:getCosts', { since: costWindowStart(days) }), answer)
    return mount(AdminCosts as never, {
      attachTo: document.body,
      global: { provide: { ...provide, [BackendApiKey as symbol]: { ai: { getCosts: 'ai:getCosts' } } } },
    }) as VueWrapper
  }

  it('shows the window\'s total and the costliest people, visitors named as such', async () => {
    const wrapper = costsTab(costs())
    await flushPromises()
    expect(wrapper.find('[data-admin="costs-total"]').text()).toBe('$12.50 for 9 runs')
    const rows = wrapper.findAll('[data-admin="costs-person"]')
    expect(rows.map(row => row.findAll('th, td').map(cell => cell.text()))).toEqual([
      ['Ada', '$10.00', '6', '12,000 / 3,400'],
      ['Visitors, before signing up', '$2.25', '2', '900 / 100'],
      ['ws_9', '$0.25', '1', '10 / 5'],
    ])
    expect(rows[1]!.attributes('data-state')).toBe('guest')
    wrapper.unmount()
  })

  it('reads another window when the administrator picks one', async () => {
    answers.set(key('ai:getCosts', { since: costWindowStart(7) }), costs({ usd: 0, runs: 0, days: [], people: [] }))
    const wrapper = costsTab(costs())
    await flushPromises()
    await wrapper.find('[data-admin="costs-window"] select').setValue('7')
    await flushPromises()
    expect(wrapper.find('[data-admin="costs-empty"]').text()).toBe('No AI call ran in this window.')
    wrapper.unmount()
  })

  it('reads once, not live, and again on Refresh', async () => {
    const wrapper = costsTab(costs())
    await flushPromises()
    const reads = () => asked.filter(read => read.query === 'ai:getCosts').length
    const before = reads()
    // A run that ends changes nothing on screen until the administrator asks.
    answers.set(key('ai:getCosts', { since: costWindowStart(30) }), costs({ usd: 13, runs: 10 }))
    await flushPromises()
    expect(wrapper.find('[data-admin="costs-total"]').text()).toBe('$12.50 for 9 runs')
    await wrapper.find('[data-admin="refresh"]').trigger('click')
    await flushPromises()
    expect(reads()).toBe(before + 1)
    expect(wrapper.find('[data-admin="costs-total"]').text()).toBe('$13.00 for 10 runs')
    wrapper.unmount()
  })

  it('says it is loading until the first read lands, and not while Refresh reads again with the total on screen', async () => {
    let land!: (value: AiCosts) => void
    const wrapper = costsTab(new Promise<AiCosts>(resolve => (land = resolve)) as never)
    await loadsFirst(wrapper, () => land(costs()), '[data-admin="costs-total"]')
    let again!: (value: AiCosts) => void
    answers.set(key('ai:getCosts', { since: costWindowStart(30) }), new Promise<AiCosts>(resolve => (again = resolve)))
    await wrapper.find('[data-admin="refresh"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-admin="costs"]').attributes('aria-busy')).toBe('true')
    expect(wrapper.find('[data-admin="loading"]').exists()).toBe(false)
    expect(wrapper.find('[data-admin="costs-total"]').text()).toBe('$12.50 for 9 runs')
    again(costs({ usd: 13, runs: 10 }))
    await flushPromises()
    expect(wrapper.find('[data-admin="costs"]').attributes('aria-busy')).toBeUndefined()
    expect(wrapper.find('[data-admin="costs-total"]').text()).toBe('$13.00 for 10 runs')
    wrapper.unmount()
  })

  it('says so to anyone who is no administrator', async () => {
    const wrapper = costsTab(null)
    await flushPromises()
    expect(wrapper.find('[data-admin="refused"]').text()).toBe('Only administrators see what AI costs.')
    wrapper.unmount()
  })

  it('shows its tab only while backend/ai.ts re-exports getCosts', async () => {
    const { ADMIN_TABS } = await import('../../src/runtime/vue/components/admin/admin-tabs')
    expect(ADMIN_TABS.find(tab => tab.key === 'costs')).toMatchObject({ needs: 'ai', has: 'getCosts', order: 130 })
  })
})

describe('the Webhooks tab', () => {
  const log = [
    { service: 'billing', deliveryId: 'wh_2', type: 'order.paid', outcome: 'handler_error', note: 'boom', receivedAt: AT + 2000 },
    { service: 'email', deliveryId: 'msg_1', type: 'email.delivered', outcome: 'ok', receivedAt: AT + 1000, replayedAt: AT + 1500 },
    { service: 'billing', deliveryId: 'wh_x', outcome: 'invalid_signature', receivedAt: AT, count: 12 },
  ]

  function webhooksTab(answer: unknown = log) {
    answers.set(key('webhooks:getWebhookDeliveries', { limit: 200 }), answer)
    return mount(AdminWebhooks as never, {
      attachTo: document.body,
      global: { provide: { ...provide, [BackendApiKey as symbol]: { webhooks: { getWebhookDeliveries: 'webhooks:getWebhookDeliveries', replayWebhookDelivery: 'webhooks:replayWebhookDelivery' } } } },
    }) as VueWrapper
  }

  it('says it is loading until the log lands', async () => {
    const wrapper = webhooksTab()
    answers.delete(key('webhooks:getWebhookDeliveries', { limit: 200 }))
    await loadsFirst(wrapper, () => answers.set(key('webhooks:getWebhookDeliveries', { limit: 200 }), log), '[data-admin="webhook"]')
    wrapper.unmount()
  })

  it('lists both providers\' deliveries, a replay on each verified one and none on a tally', async () => {
    const wrapper = webhooksTab()
    await flushPromises()
    const rows = wrapper.findAll('[data-admin="webhook"]')
    expect(rows.map(row => row.attributes('data-outcome'))).toEqual(['handler_error', 'ok', 'invalid_signature'])
    expect(rows.map(row => row.find('[data-admin="replay"]').exists())).toEqual([true, true, false])
    expect(rows[1]!.find('[data-admin="webhook-replayed"]').exists()).toBe(true)
    expect(rows[2]!.find('[data-admin="webhook-count"]').text()).toBe('Counted, not logged: 12')
    await wrapper.find('[data-admin="webhooks-filter"] select').setValue('email')
    expect(wrapper.findAll('[data-admin="webhook"]')).toHaveLength(1)
    wrapper.unmount()
  })

  it('replays a delivery behind a recent sign-in, the outcome in the tab\'s message', async () => {
    replyCall.mockClear()
    const wrapper = webhooksTab()
    await flushPromises()
    const button = wrapper.find('[data-admin="replay"]')
    expect(button.attributes('aria-label')).toContain('order.paid')
    await button.trigger('click')
    await flushPromises()
    expect(replyCall).toHaveBeenCalledWith({ service: 'billing', deliveryId: 'wh_2' })
    expect(reauthenticated).toHaveBeenCalled()
    expect(wrapper.find('[data-admin="message"]').text()).toBe('The provider will send it again.')
    wrapper.unmount()
  })

  it('says the tab is for administrators to anyone else, and shows only while backend/webhooks.ts exists', async () => {
    const wrapper = webhooksTab(null)
    await flushPromises()
    expect(wrapper.find('[data-admin="refused"]').text()).toBe('Only administrators read the webhook log.')
    wrapper.unmount()
    const { ADMIN_TABS } = await import('../../src/runtime/vue/components/admin/admin-tabs')
    expect(ADMIN_TABS.find(tab => tab.key === 'webhooks')).toMatchObject({ needs: 'webhooks' })
  })
})

describe('the Suppressions tab', () => {
  const page = { page: [{ email: 'bounced@example.com', origin: 'bounce', suppressedAt: AT }, { email: 'spam@example.com', origin: 'complaint', suppressedAt: AT - 1000 }], isDone: true, continueCursor: 'end' }

  function suppressionsTab(answer: unknown = page) {
    answers.set(key('email:getSuppressions', { paginationOpts: { numItems: 100, cursor: null } }), answer)
    return mount(AdminSuppressions as never, {
      attachTo: document.body,
      global: { provide: { ...provide, [BackendApiKey as symbol]: { email: { getSuppressions: 'email:getSuppressions', liftSuppression: 'email:liftSuppression' } } } },
    }) as VueWrapper
  }

  const confirmDialog = () => document.querySelector<HTMLDialogElement>('dialog[data-confirm="dialog"]')

  it('says it is loading until the first page lands, and not again while it reads with rows on screen', async () => {
    const wrapper = mount(AdminSuppressions as never, {
      attachTo: document.body,
      global: { provide: { ...provide, [BackendApiKey as symbol]: { email: { getSuppressions: 'email:getSuppressions', liftSuppression: 'email:liftSuppression' } } } },
    }) as VueWrapper
    await flushPromises()
    const loading = wrapper.find('[data-admin="loading"]')
    expect(loading.text()).toBe('Loading…')
    expect(loading.attributes()).toMatchObject({ 'role': 'status', 'aria-live': 'polite' })
    expect(wrapper.find('[data-admin="suppressions"]').attributes('aria-busy')).toBe('true')
    answers.set(key('email:getSuppressions', { paginationOpts: { numItems: 100, cursor: null } }), page)
    await flushPromises()
    expect(wrapper.find('[data-admin="loading"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-admin="suppression"]')).toHaveLength(2)
    wrapper.unmount()
  })

  it('lists the suppressed addresses with why, and lifts one after a confirmation in its own dialog and a recent sign-in', async () => {
    replyCall.mockClear()
    replyCall.mockResolvedValueOnce({ lifted: true } as never)
    const wrapper = suppressionsTab()
    await flushPromises()
    const rows = wrapper.findAll('[data-admin="suppression"]')
    expect(rows.map(row => row.findAll('th, td').slice(0, 2).map(cell => cell.text()))).toEqual([['bounced@example.com', 'Bounced'], ['spam@example.com', 'Marked as spam']])
    const lift = rows[0]!.find<HTMLButtonElement>('[data-admin="lift"]')
    lift.element.focus()
    await lift.trigger('click')
    await flushPromises()
    const dialog = confirmDialog()!
    expect(dialog.open).toBe(true)
    expect(dialog.querySelector('[data-confirm="text"]')!.textContent!.trim()).toBe('Lift the suppression of bounced@example.com? Mail goes to it again.')
    expect(document.activeElement).toBe(dialog.querySelector('[data-confirm="cancel"]'))
    expect(replyCall).not.toHaveBeenCalled()
    dialog.querySelector<HTMLButtonElement>('[data-confirm="accept"]')!.click()
    await flushPromises()
    expect(confirmDialog()).toBeNull()
    expect(replyCall).toHaveBeenCalledWith({ email: 'bounced@example.com' })
    expect(reauthenticated).toHaveBeenCalled()
    expect(wrapper.find('[data-admin="message"]').text()).toBe('Lifted: mail reaches bounced@example.com again.')
    expect(document.activeElement).toBe(lift.element)
    wrapper.unmount()
  })

  it('lifts nothing when the administrator cancels, by the button or by Escape, and focus goes back', async () => {
    replyCall.mockClear()
    const wrapper = suppressionsTab()
    await flushPromises()
    const lift = wrapper.find<HTMLButtonElement>('[data-admin="lift"]')
    lift.element.focus()
    await lift.trigger('click')
    await flushPromises()
    confirmDialog()!.querySelector<HTMLButtonElement>('[data-confirm="cancel"]')!.click()
    await flushPromises()
    expect(confirmDialog()).toBeNull()
    expect(document.activeElement).toBe(lift.element)
    await lift.trigger('click')
    await flushPromises()
    confirmDialog()!.dispatchEvent(new Event('cancel', { cancelable: true }))
    await flushPromises()
    expect(confirmDialog()).toBeNull()
    expect(document.activeElement).toBe(lift.element)
    expect(replyCall).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('says the tab is for administrators to anyone else, and shows only while email.ts re-exports getSuppressions', async () => {
    const wrapper = suppressionsTab(null)
    await flushPromises()
    expect(wrapper.find('[data-admin="refused"]').exists()).toBe(true)
    wrapper.unmount()
    const { ADMIN_TABS } = await import('../../src/runtime/vue/components/admin/admin-tabs')
    expect(ADMIN_TABS.find(tab => tab.key === 'suppressions')).toMatchObject({ needs: 'email', has: 'getSuppressions' })
  })
})

describe('the Analytics tab', () => {
  const DAY = 24 * 60 * 60 * 1000
  const values = (fields: Partial<RevenueValues> = {}): RevenueValues => ({
    monthlyRecurringRevenue: 0, annualRecurringRevenue: 0, revenue: 0, netRevenue: 0, activeSubscriptions: 0, newSubscriptions: 0, renewedSubscriptions: 0,
    churnedSubscriptions: 0, canceledSubscriptions: 0, churnRate: 0, checkouts: 0, succeededCheckouts: 0, checkoutsConversion: 0, lifetimeValue: 0,
    costs: 0, costPerUser: 0, grossMargin: 0, grossMarginPercentage: 0, ...fields,
  })
  const report = (fields: Partial<RevenueReport> = {}): RevenueReport => {
    const since = revenueWindowStart(30)
    return {
      since,
      until: since + 30 * DAY,
      interval: 'day',
      totals: values({ monthlyRecurringRevenue: 2400, annualRecurringRevenue: 28800, revenue: 3600, activeSubscriptions: 2, churnRate: 0.05, lifetimeValue: 14400, checkouts: 4, succeededCheckouts: 3, checkoutsConversion: 0.75, newSubscriptions: 2, renewedSubscriptions: 1, churnedSubscriptions: 1 }),
      periods: [
        { at: since, ...values({ revenue: 1200, newSubscriptions: 1, checkouts: 2, succeededCheckouts: 1 }) },
        { at: since + DAY, ...values({ revenue: 2400, newSubscriptions: 1, renewedSubscriptions: 1, churnedSubscriptions: 1, checkouts: 2, succeededCheckouts: 2 }) },
      ],
      cancellations: {
        reasons: { customer_service: 0, low_quality: 0, missing_features: 0, switched_service: 0, too_complex: 0, too_expensive: 2, unused: 1, other: 0 },
        saveOffers: { made: 3, accepted: 1, truncated: false },
      },
      meters: [{ meter: 'credits', total: 42, periods: [{ at: since, quantity: 30 }, { at: since + DAY, quantity: 12 }] }],
      ...fields,
    }
  }

  async function analyticsTab(answer: RevenueReport | Error, billing: Record<string, unknown> = { getRevenue: 'billing:getRevenue' }) {
    answers.set(key('billing:getRevenue', { since: revenueWindowStart(30), interval: 'day' }), answer)
    const wrapper = mount(AdminAnalytics as never, {
      attachTo: document.body,
      global: { provide: { ...provide, [BackendApiKey as symbol]: { billing } } },
    }) as VueWrapper
    // The view's panel loads the first time it shows, then reads.
    await vi.dynamicImportSettled()
    await flushPromises()
    return wrapper
  }

  it('shows the provider\'s figures, a chart per series, the reasons people left and usage per meter', async () => {
    const wrapper = await analyticsTab(report())
    // One view: the tab is the Revenue view, with no switch.
    expect(wrapper.find('[data-admin="analytics-views"]').exists()).toBe(false)
    expect(wrapper.find('[data-admin="analytics"]').attributes('data-admin-view')).toBe('revenue')
    const figures = wrapper.findAll('[data-admin="revenue-figure"]').map(figure => [figure.find('dt').text(), figure.find('dd').text()])
    expect(figures).toEqual([
      ['Monthly recurring revenue', '$24.00'],
      ['Annual recurring revenue', '$288.00'],
      ['Revenue', '$36.00'],
      ['Active subscriptions', '2'],
      ['Churn rate', '5%'],
      ['Lifetime value', '$144.00'],
    ])
    const charts = wrapper.findAll('[data-admin="chart"]')
    expect(charts.map(chart => chart.find('[data-admin="chart-label"]').text())).toEqual(['Revenue', 'New', 'Renewed', 'Churned', 'Started', 'Completed', 'credits'])
    expect(charts[0]!.find('[data-admin="chart-total"]').text()).toBe('$36.00 in total')
    const bars = charts[0]!.findAll('[data-admin="chart-bar"]')
    expect(bars.map(bar => bar.attributes('style'))).toEqual(['--admin-chart-value: 0.5;', '--admin-chart-value: 1;'])
    expect(charts[3]!.attributes('data-tone')).toBe('loss')
    expect(charts[6]!.find('[data-admin="chart-total"]').text()).toBe('42 in total')
    const reasons = wrapper.findAll('[data-admin="revenue-reason"]')
    expect(reasons[0]!.text()).toBe('Too expensive2')
    expect(reasons.find(row => row.attributes('data-reason') === 'unused')!.text()).toBe('Not using it enough1')
    expect(wrapper.find('[data-admin="revenue-save-offers"]').text()).toBe('1 of 3 save offers accepted')
    expect(wrapper.find('[data-admin="revenue-conversion"]').text()).toBe('75% of checkouts completed')
    expect(wrapper.find('[data-admin="revenue-no-costs"]').text()).toBe('Margin reads as revenue alone until usage events carry a cost.')
    wrapper.unmount()
  })

  it('shows costs and margin once the provider has them', async () => {
    const wrapper = await analyticsTab(report({ totals: values({ revenue: 3600, costs: 450, costPerUser: 225, grossMargin: 3150, grossMarginPercentage: 0.875 }) }))
    const costs = wrapper.findAll('[data-figure="costs"], [data-figure="costPerUser"], [data-figure="grossMargin"]').map(figure => figure.find('dd').text())
    expect(costs).toEqual(['$4.50', '$2.25', '$31.50 (87.5%)'])
    wrapper.unmount()
  })

  it('reads a year by month when the administrator picks it', async () => {
    answers.set(key('billing:getRevenue', { since: revenueWindowStart(365), interval: 'month' }), report({ interval: 'month' }))
    const wrapper = await analyticsTab(report())
    await wrapper.find('[data-admin="revenue-window"] select').setValue('365')
    await flushPromises()
    expect(asked.at(-1)).toEqual({ query: 'billing:getRevenue', args: { since: revenueWindowStart(365), interval: 'month' } })
    expect((wrapper.find('[data-admin="revenue-interval"] select').element as HTMLSelectElement).value).toBe('month')
    wrapper.unmount()
  })

  it('says why when the read is refused', async () => {
    const wrapper = await analyticsTab(new ConvexError({ code: 'unavailable', service: 'billing', reason: 'provider_refused' }) as never)
    expect(wrapper.find('[data-admin="error"]').exists()).toBe(true)
    expect(wrapper.find('[data-admin="revenue-figures"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('sits right after Costs, before System, and shows while the app re-exports what one of its views reads', async () => {
    const { ADMIN_TABS } = await import('../../src/runtime/vue/components/admin/admin-tabs')
    const { ANALYTICS_VIEWS } = await import('../../src/runtime/vue/components/admin/admin-views')
    const keys = ADMIN_TABS.map(tab => tab.key)
    expect(keys.indexOf('analytics')).toBe(keys.indexOf('costs') + 1)
    expect(keys.at(-1)).toBe('system')
    expect(ADMIN_TABS.find(tab => tab.key === 'analytics')!.anyOf).toBe(ANALYTICS_VIEWS)
    expect(ANALYTICS_VIEWS.map(view => [view.key, view.needs, view.has])).toEqual([['revenue', 'billing', 'getRevenue'], ['growth', 'admin', 'getFunnel'], ['experiments', 'flags', 'getExperiments']])
    const wrapper = await analyticsTab(report(), { getOrders: 'billing:getOrders' })
    expect(wrapper.find('[data-admin="revenue"]').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('the Analytics tab\'s growth views', () => {
  const counts = (signup: number, activation = 0, trial = 0, paid = 0) => ({ signup, activation, trial, paid })
  const week = weekOf(Date.now())
  const funnel = (fields: Partial<FunnelReport> = {}): FunnelReport => ({
    weeks: 12,
    since: week - 11 * WEEK_MS,
    until: week,
    waitlist: 40,
    admitted: 20,
    signup: 10,
    activation: 5,
    trial: 2,
    paid: 1,
    breakdowns: {
      invite: [],
      campaign: [{ value: 'direct', counts: counts(6, 2) }, { value: 'autumn', counts: counts(4, 3, 2, 1) }],
      referral: [{ value: 'abcd2345', label: 'Ada', counts: counts(1) }],
      promotion: [],
      answer: [{ value: 'other', counts: counts(2) }],
    },
    cohorts: [{ week, size: 4, active: [3] }],
    otherAnswers: ['A comic shop'],
    ...fields,
  })

  async function growthTab(answer: FunnelReport | Error) {
    answers.set(key('admin:getFunnel', { weeks: 12, until: week }), answer)
    const wrapper = mount(AdminAnalytics as never, {
      attachTo: document.body,
      global: { provide: { ...provide, [BackendApiKey as symbol]: { admin: { getFunnel: 'admin:getFunnel' } } } },
    }) as VueWrapper
    await vi.dynamicImportSettled()
    await flushPromises()
    return wrapper
  }

  it('shows each step with its share of the step before, a breakdown, the "Other" answers and the cohorts', async () => {
    const wrapper = await growthTab(funnel())
    expect(wrapper.find('[data-admin="analytics"]').attributes('data-admin-view')).toBe('growth')
    const steps = wrapper.findAll('[data-admin="growth-step"]').map(step => [step.attributes('data-step'), step.find('[data-admin="growth-step-count"]').text()])
    expect(steps).toEqual([['waitlist', '40'], ['admitted', '20'], ['signup', '10'], ['activation', '5'], ['trial', '2'], ['paid', '1']])
    expect(wrapper.findAll('[data-admin="growth-step-rate"]')[0]!.text()).toBe('50% of the step before')
    // Campaigns first, "Direct or unknown" in words.
    const rows = wrapper.findAll('[data-admin="growth-row"]').map(row => row.findAll('th, td').map(cell => cell.text()))
    expect(rows).toEqual([['Direct or unknown', '6', '2', '0', '0'], ['autumn', '4', '3', '2', '1']])
    await wrapper.find('[data-admin="growth-dimension"]').setValue('referral')
    expect(wrapper.find('[data-admin="growth-row"] th').text()).toBe('Ada (abcd2345)')
    await wrapper.find('[data-admin="growth-dimension"]').setValue('answer')
    expect(wrapper.find('[data-admin="growth-other-answers"]').text()).toBe('A comic shop')
    const cohort = wrapper.find('[data-admin="growth-cohort"]')
    expect(cohort.findAll('td').map(cell => cell.text())).toEqual(['4', '75% (3)'])
    wrapper.unmount()
  })

  it('says when nothing was counted yet, and why a read was refused', async () => {
    const empty = await growthTab(funnel({ waitlist: 0, admitted: 0, signup: 0, activation: 0, trial: 0, paid: 0 }))
    expect(empty.find('[data-admin="empty"]').text()).toContain('Nothing has been counted yet')
    empty.unmount()
    const refused = await growthTab(new ConvexError({ code: 'forbidden', reason: 'admin_only', message: 'getFunnel is for administrators.' }))
    expect(refused.find('[data-admin="error"]').attributes('role')).toBe('alert')
    refused.unmount()
  })

  it('compares each experiment\'s variants, and picks a winner for everyone', async () => {
    const interval = (rate: number) => ({ rate, low: rate / 2, high: Math.min(1, rate * 1.5) })
    const results: ExperimentResult[] = [{
      key: 'pricingHeadline',
      description: 'The headline.',
      goal: 'billing.subscription_created',
      guardrails: ['billing.order_refunded'],
      by: 'user',
      running: true,
      winner: null,
      override: { enabled: true },
      startedAt: Date.now() - 15 * 24 * 60 * 60 * 1000,
      variants: [
        { name: 'plans', share: 0.5, exposed: 120, goal: { count: 12, ...interval(0.1) }, guardrails: [{ kind: 'billing.order_refunded', count: 1, worse: false, ...interval(0.01) }], discount: null },
        { name: 'strip', share: 0.5, exposed: 118, goal: { count: 24, ...interval(0.2) }, guardrails: [{ kind: 'billing.order_refunded', count: 9, worse: true, ...interval(0.08) }], discount: 'annual20' },
      ],
      verdict: { kind: 'leading', leader: 'strip' },
    }]
    answers.set(key('flags:getExperiments', {}), results)
    const wrapper = mount(AdminAnalytics as never, {
      attachTo: document.body,
      global: { provide: { ...provide, [BackendApiKey as symbol]: { flags: { getExperiments: 'flags:getExperiments', setFlag: 'flags:setFlag' } } } },
    }) as VueWrapper
    await vi.dynamicImportSettled()
    await flushPromises()
    const experiment = wrapper.find('[data-admin="experiment"]')
    expect(experiment.attributes('data-state')).toBe('running')
    expect(experiment.find('[data-admin="experiment-meta"]').text()).toContain('15 days, 2 full weeks')
    const strip = experiment.find('[data-variant="strip"]')
    expect(strip.find('[data-admin="experiment-discount"]').text()).toBe('Shows the promotion annual20')
    expect(strip.find('[data-admin="experiment-guardrail"]').attributes('data-state')).toBe('worse')
    expect(experiment.find('[data-admin="experiment-verdict"]').text()).toBe('strip leads: its interval is clear of the control\'s.')
    setFlagCall.mockClear()
    await experiment.findAll('[data-admin="experiment-pick"]')[1]!.trigger('click')
    await flushPromises()
    expect(setFlagCall).toHaveBeenCalledWith({ key: 'pricingHeadline', override: { enabled: true, winner: 'strip' } })
    wrapper.unmount()
  })
})
