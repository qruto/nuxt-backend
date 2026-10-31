import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { useNuxtApp, useRuntimeConfig } from '#imports'
import axe from 'axe-core'
import { ConvexError } from 'convex/values'
import { makeFunctionReference } from 'convex/server'
import { Authenticated, provideConvexAuth, Unauthenticated, usePaginatedQuery, useQuery } from 'nuxt-convex-module/client'
import { backendMockProvides, createBackendMock, resetBackendMock } from '../../src/runtime/test-utils'
import { useAuth as usePublicAuth } from '../../src/runtime/vue/composables/use-auth'
import { useAuthSession as useAuth } from '../../src/runtime/vue/utils/auth-session'
import { useWorkspace } from '../../src/runtime/vue/composables/use-workspace'
import { useCredits } from '../../src/runtime/vue/composables/use-credits'
import { useBilling } from '../../src/runtime/vue/composables/use-billing'
import { useGifts } from '../../src/runtime/vue/composables/use-gifts'
import { useSessions } from '../../src/runtime/vue/composables/use-sessions'
import { useOrders } from '../../src/runtime/vue/composables/use-orders'
import { usePasskeys } from '../../src/runtime/vue/composables/use-passkeys'
import PricingTable from '../../src/runtime/vue/components/billing/PricingTable.vue'
// What Nuxt auto-imports: the base module's own files, by path, no alias in between.
import { useQuery as autoImportedUseQuery } from '../../node_modules/nuxt-convex-module/dist/runtime/vue/composables/use-query.js'
import authMiddleware from '../../node_modules/nuxt-convex-module/dist/runtime/better-auth/nuxt/middleware.js'
import { registerComponents } from '../helpers/register-components'

await registerComponents('PricingTable')

// The backend mock (nuxt-backend/test-utils) under the real composables:
// what an app's test can rely on. The aliases of this project
// (backendTestAliases, vitest.config.ts) put it under every composable
// here; no module is mocked.

enableAutoUnmount(afterEach)
afterEach(() => resetBackendMock())

/** Run a composable inside a mounted component, as a page would. */
function inSetup<T>(composable: () => T): T {
  let result!: T
  mount(defineComponent({
    setup() {
      result = composable()
      return () => h('div')
    },
  }))
  return result
}

const credits = (balance: number) => ({ meters: [{ meterId: 'meter_1', name: 'credits', balance, creditedUnits: 50, consumedUnits: 50 - balance }] })
const DAY = 86_400_000

describe('the session', () => {
  it('is signed out unless given an account, and signs in and out', async () => {
    const backend = createBackendMock()
    const auth = inSetup(() => useAuth())
    expect(auth.isAuthenticated.value).toBe(false)
    expect(auth.user.value).toBeNull()

    backend.signIn({ name: 'Grace', role: 'admin' })
    await nextTick()
    expect(auth.isAuthenticated.value).toBe(true)
    expect(auth.user.value).toMatchObject({ name: 'Grace', email: 'ada@example.com', role: 'admin' })
    expect(auth.hasRole('admin')).toBe(true)
    // What an app reads: the slim useAuth over the same session.
    const app = inSetup(() => usePublicAuth())
    expect(app.isSignedIn.value).toBe(true)
    expect(app.role.value).toBe('admin')
    expect(app.user.value).toMatchObject({ name: 'Grace' })

    await auth.signOut()
    expect(auth.isAuthenticated.value).toBe(false)
    expect(backend.callsTo('signOut')).toHaveLength(1)
  })

  it('records how the account signed in, as Better Auth does, and the form reads it', async () => {
    const backend = createBackendMock()
    const auth = inSetup(() => useAuth())
    await auth.signInWithOtp({ email: 'grace@example.com', otp: '123456' })
    expect(backend.state.user).toMatchObject({ email: 'grace@example.com', lastLoginMethod: 'email-otp' })
    expect(auth.lastSignInMethod.value).toBe('email-otp')

    await auth.signOut()
    await auth.signInWithPasskey()
    expect(backend.state.user).toMatchObject({ lastLoginMethod: 'passkey' })
    expect(auth.lastSignInMethod.value).toBe('passkey')
  })

  it('reads as pending with no account while the session loads, as Better Auth does', async () => {
    const backend = createBackendMock({ user: {}, isLoading: true })
    const auth = inSetup(() => useAuth())
    expect(auth.isLoading.value).toBe(true)
    expect(auth.isAuthenticated.value).toBe(false)
    expect(auth.user.value).toBeNull()
    backend.state.isLoading = false
    await nextTick()
    expect(auth.isAuthenticated.value).toBe(true)
  })

  it('versions the session per account, and reads a failed session as signed out', async () => {
    const backend = createBackendMock({ user: { id: 'u1' } })
    const auth = inSetup(() => useAuth())
    expect(auth.authVersion.value).toBe('session-u1')
    backend.signIn({ id: 'u2' })
    await nextTick()
    expect(auth.authVersion.value).toBe('session-u2')

    backend.fail('useSession', { status: 500, message: 'Down' })
    await nextTick()
    expect(auth.isAuthenticated.value).toBe(false)
  })

  it('answers a stubbed auth call with its data, and a failed one as Better Auth does', async () => {
    const backend = createBackendMock({ user: {} })
    const auth = inSetup(() => useAuth())
    backend.stub('updateUser', () => ({ status: true }))
    await auth.updateUser({ name: 'Ada L.' })
    expect(backend.callsTo('updateUser')).toEqual([{ name: 'Ada L.' }])

    backend.fail('updateUser', { status: 403, code: 'BANNED_USER', message: 'Banned', statusText: 'Forbidden' })
    await expect(auth.updateUser({ name: 'x' })).rejects.toThrow('Banned')
    expect(auth.error.value).toMatchObject({ code: 'forbidden', data: { reason: 'banned' } })
  })

  it('keeps passkeys in its state, and refuses one it does not know', async () => {
    const backend = createBackendMock({ user: {}, passkeys: [{ id: 'pk1', name: 'Laptop', createdAt: '2026-01-01' }] })
    const passkeys = inSetup(() => usePasskeys())
    await flushPromises()
    expect(passkeys.passkeys.value?.map(passkey => passkey.name)).toEqual(['Laptop'])
    await passkeys.rename('pk1', 'Work laptop')
    expect(backend.callsTo('passkey.updatePasskey')).toEqual([{ id: 'pk1', name: 'Work laptop' }])
    await passkeys.remove('pk1')
    expect(passkeys.passkeys.value).toEqual([])

    await expect(passkeys.remove('pk1')).rejects.toThrow('Passkey not found')
    await expect(passkeys.rename('gone', 'x')).rejects.toThrow('Passkey not found')
  })

  it('turns passkey-only on with a passkey, and answers a recovery code', async () => {
    createBackendMock({ user: {}, passkeys: [] })
    const passkeys = inSetup(() => usePasskeys())
    await flushPromises()
    await expect(passkeys.setPasskeyOnly(true)).rejects.toThrow('A passkey-only account needs a passkey.')
    await passkeys.add({ name: 'Laptop' })
    const { recoveryCode } = await passkeys.setPasskeyOnly(true)
    expect(recoveryCode).toMatch(/^[0-9A-Z]{5}(?:-[0-9A-Z]{5}){3}$/)
    expect(passkeys.passkeyOnly.value).toBe(true)
    expect(await passkeys.setPasskeyOnly(false)).toEqual({ recoveryCode: null })
    expect(passkeys.passkeyOnly.value).toBe(false)
  })
})

describe('workspaces', () => {
  it('gives a signed-in account a personal workspace it owns, as sign-up does', () => {
    createBackendMock({ user: { id: 'u1' } })
    const workspace = inSetup(() => useWorkspace())
    expect(workspace.workspaces.value.map(workspace => workspace.name)).toEqual(['Personal'])
    expect(workspace.current.value).toMatchObject({ name: 'Personal', members: [{ role: 'owner', user: { id: 'u1' } }] })
    expect(workspace.role.value).toBe('owner')
  })

  it('switches the active workspace, and every read follows', async () => {
    const backend = createBackendMock({
      user: {},
      workspaces: [{ id: 'ws1', name: 'Personal' }, { id: 'ws2', name: 'Acme', role: 'member' }],
    })
    const workspace = inSetup(() => useWorkspace())
    await workspace.setActive('ws2')
    expect(workspace.current.value?.name).toBe('Acme')
    expect(workspace.role.value).toBe('member')
    expect(backend.callsTo('organization.setActive')).toEqual([{ organizationId: 'ws2' }])

    await expect(workspace.setActive('elsewhere')).rejects.toThrow('You\'re not a member of this workspace.')
    expect(workspace.error.value).toMatchObject({ code: 'forbidden', data: { reason: 'not_member' } })
    // Better Auth clears the active workspace before it refuses.
    expect(backend.state.activeWorkspace).toBeNull()
  })

  it('switches by slug, falls back to the active workspace, and answers the plain workspace', async () => {
    const backend = createBackendMock({ user: {}, workspaces: [{ id: 'ws1', slug: 'personal' }, { id: 'ws2', slug: 'acme', role: 'member' }] })
    const { client } = inSetup(() => useAuth())
    const bySlug = await client.organization.setActive({ organizationSlug: 'acme' })
    expect(bySlug.data).toEqual({ id: 'ws2', name: 'ws2', slug: 'acme', logo: null, createdAt: 0 })
    expect((await client.organization.setActive({})).data).toMatchObject({ id: 'ws2' })
    expect((await client.organization.setActive({ organizationSlug: 'nowhere' })).error).toMatchObject({ status: 400, code: 'ORGANIZATION_NOT_FOUND' })
    expect(backend.state.activeWorkspace).toBe('ws2')
  })

  it('keeps the active workspace when asked to on create', async () => {
    const backend = createBackendMock({ user: {} })
    const { client } = inSetup(() => useAuth())
    const created = await client.organization.create({ name: 'Beta', slug: 'beta', keepCurrentActiveOrganization: true })
    expect(created.data).toMatchObject({ slug: 'beta', members: [{ role: 'owner' }] })
    expect(backend.state.activeWorkspace).toBe('workspace-1')
  })

  it('creates and invites to a workspace, with the ids the mock counts', async () => {
    createBackendMock({ user: {} })
    const workspace = inSetup(() => useWorkspace())
    await expect(workspace.create({ name: 'Beta', slug: 'beta' })).resolves.toMatchObject({ id: 'workspace-mock-1', slug: 'beta' })
    expect(workspace.current.value?.id).toBe('workspace-mock-1')
    await expect(workspace.invite({ email: 'grace@example.com' })).resolves.toMatchObject({ id: 'invitation-mock-2', role: 'member', status: 'pending' })
    expect(workspace.current.value?.invitations).toHaveLength(1)
    await expect(workspace.create({ name: 'Again', slug: 'beta' })).rejects.toThrow('That name is taken. Try another one.')
  })

  it('leaves a workspace it is a member of, but not one it alone owns', async () => {
    const backend = createBackendMock({ user: {}, workspaces: [{ id: 'ws1', name: 'Personal' }, { id: 'ws2', name: 'Acme', role: 'member' }], activeWorkspace: 'ws2' })
    const workspace = inSetup(() => useWorkspace())
    await workspace.leave()
    expect(workspace.current.value).toBeNull()
    expect(backend.state.workspaces.map(workspace => workspace.id)).toEqual(['ws1'])

    await expect(workspace.leave('ws1')).rejects.toThrow('Something went wrong.')
    expect(backend.state.activeWorkspace).toBeNull()
  })

  it('accepts an invitation sent to the account, makes its workspace active, and reads it as gone after', async () => {
    createBackendMock({
      user: {},
      invitations: [{ id: 'inv-1', email: 'Ada@example.com', role: 'admin', status: 'pending', workspaceId: 'ws9', workspaceName: 'Acme', inviterId: 'u9', expiresAt: Date.now() + DAY }],
    })
    const workspace = inSetup(() => useWorkspace())
    await expect(workspace.listReceivedInvitations()).resolves.toHaveLength(1)
    await expect(workspace.getInvitation('inv-1')).resolves.toMatchObject({ workspaceName: 'Acme', workspaceSlug: 'ws9', inviterEmail: 'inviter@example.com' })
    await expect(workspace.acceptInvitation('inv-1')).resolves.toMatchObject({ workspaceId: 'ws9', role: 'admin' })
    expect(workspace.current.value).toMatchObject({ id: 'ws9', name: 'Acme' })
    expect(workspace.role.value).toBe('admin')
    await expect(workspace.getInvitation('inv-1')).resolves.toBeNull()
  })

  it('refuses an expired invitation and one sent to someone else', async () => {
    const backend = createBackendMock({
      user: {},
      invitations: [
        { id: 'old', email: 'ada@example.com', status: 'pending', workspaceId: 'ws9', inviterId: 'u9', expiresAt: Date.now() - DAY },
        { id: 'theirs', email: 'grace@example.com', status: 'pending', workspaceId: 'ws9', inviterId: 'u9', expiresAt: Date.now() + DAY },
      ],
    })
    const workspace = inSetup(() => useWorkspace())
    await expect(workspace.acceptInvitation('old')).rejects.toThrow('Something went wrong.')
    await expect(workspace.getInvitation('old')).resolves.toBeNull()
    await expect(workspace.acceptInvitation('theirs')).rejects.toThrow('You don\'t have access to this.')
    await expect(workspace.declineInvitation('theirs')).rejects.toThrow('You don\'t have access to this.')
    expect(backend.state.activeWorkspace).toBe('workspace-1')
    expect(backend.state.workspaces.map(workspace => workspace.id)).toEqual(['workspace-1'])
  })

  it('fails a read by its hook\'s name', () => {
    const backend = createBackendMock({ user: {} })
    backend.fail('useActiveOrganization', { status: 500, message: 'Database down', statusText: 'Internal Server Error' })
    const workspace = inSetup(() => useWorkspace())
    expect(workspace.error.value).toMatchObject({ code: 'unavailable', message: 'Database down' })
  })
})

describe('queries, mutations and actions', () => {
  it('reads a query from the state, loading until it has an entry, and follows it', async () => {
    const backend = createBackendMock({ user: {} })
    const balance = inSetup(() => useCredits())
    expect(balance.isLoading.value).toBe(true)
    backend.state.queries['billing:getCredits'] = credits(42)
    await nextTick()
    expect(balance.balance.value).toBe(42)
    backend.state.queries['billing:getCredits'] = credits(7)
    await nextTick()
    expect(balance.balance.value).toBe(7)
  })

  it('answers a query from a function of its arguments, by name or reference', () => {
    const backend = createBackendMock({ user: {} })
    backend.stub(makeFunctionReference<'query'>('billing:getCredits'), () => credits(3))
    expect(inSetup(() => useCredits()).balance.value).toBe(3)
  })

  it('reads a failed query as its error', () => {
    const backend = createBackendMock({ user: {} })
    backend.fail('billing:getCredits', new ConvexError({ code: 'unauthenticated' }))
    expect(inSetup(() => useCredits()).error.value).toMatchObject({ code: 'unauthenticated' })
  })

  it('records an action and answers it with its stub, and warns once about one with none', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const backend = createBackendMock({ user: {}, queries: { 'billing:getCurrentSubscription': null, 'billing:listAllSubscriptions': [] } })
    const billing = inSetup(() => useBilling())
    await billing.changePlan('prod_pro')
    await billing.changePlan('prod_team')
    expect(backend.callsTo('billing:updateSubscription')).toEqual([{ productId: 'prod_pro' }, { productId: 'prod_team' }])
    expect(warn.mock.calls.filter(([message]) => String(message).includes('no stub for the action billing:updateSubscription'))).toHaveLength(1)

    backend.stub('billing:generateCustomerPortalUrl', () => ({ url: 'https://billing.example/portal' }))
    await expect(billing.portal({ redirect: false })).resolves.toBe('https://billing.example/portal')

    backend.fail('billing:updateSubscription', new ConvexError({ code: 'forbidden', reason: 'billing_managed_by_owner' }))
    await expect(billing.changePlan('prod_pro')).rejects.toThrow()
    expect(billing.error.value).toMatchObject({ code: 'forbidden' })
    warn.mockRestore()
  })

  it('lists sessions while signed in and records a revoke, and none once signed out', async () => {
    const backend = createBackendMock({
      user: {},
      queries: { 'auth:listSessions': [{ id: 's1', current: true, expiresAt: Date.now() + 60_000 }, { id: 's2', current: false, expiresAt: Date.now() + 60_000 }] },
    })
    backend.stub('auth:revokeSession', () => null)
    const sessions = inSetup(() => useSessions())
    expect(sessions.sessions.value?.map(session => session.id)).toEqual(['s1', 's2'])
    await sessions.revoke('s2')
    expect(backend.callsTo('auth:revokeSession')).toEqual([{ sessionId: 's2' }])

    backend.signOut()
    await nextTick()
    expect(sessions.sessions.value).toEqual([])
  })

  it('gates a composable given its functions explicitly on the mock\'s session too', async () => {
    const api = { getReceivedGifts: makeFunctionReference<'query'>('billing:getReceivedGifts'), claimGift: makeFunctionReference<'action'>('billing:claimGift') }
    const backend = createBackendMock({ user: {}, queries: { 'billing:getReceivedGifts': [{ id: 'g1', status: 'paid' }] } })
    const gifts = (await mountSuspended(defineComponent({
      setup: () => ({ gifts: useGifts({ api: api as never }) }),
      render: () => h('div'),
    }))).vm.gifts
    expect(gifts.received.value).toEqual([{ id: 'g1', status: 'paid' }])
    backend.signOut()
    await nextTick()
    expect(gifts.received.value).toEqual([])
  })
})

describe('a plain mount()', () => {
  // mount() starts an app of its own, without what the Nuxt app provides.
  const api = {
    getReceivedGifts: makeFunctionReference<'query'>('billing:getReceivedGifts'),
    getOrders: makeFunctionReference<'action'>('billing:getOrders'),
    listSessions: makeFunctionReference<'query'>('auth:listSessions'),
  }
  const Probe = defineComponent({
    setup: () => ({
      gifts: useGifts({ api: api as never }),
      orders: useOrders({ api: api as never }),
      sessions: useSessions({ api: api as never }),
    }),
    render: () => h(Authenticated, null, { default: () => 'signed in' }),
  })

  it('reaches the mock everywhere through backendMockProvides()', async () => {
    const backend = createBackendMock({
      user: {},
      queries: { 'billing:getReceivedGifts': [{ id: 'g1', status: 'paid' }], 'auth:listSessions': [{ id: 's1', current: true, expiresAt: Date.now() + 60_000 }] },
    })
    backend.stub('billing:getOrders', () => ({ items: [], total: 0 }))
    const probe = mount(Probe, { global: { provide: backendMockProvides() } })
    await flushPromises()
    expect(probe.text()).toBe('signed in')
    expect(probe.vm.sessions.sessions.value?.map(session => session.id)).toEqual(['s1'])

    backend.signOut()
    await flushPromises()
    expect(probe.text()).toBe('')
    expect(probe.vm.gifts.received.value).toEqual([])
  })

  it('misses it without them, where nothing provides it first', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    createBackendMock({ user: {}, queries: { 'billing:getReceivedGifts': [{ id: 'g1', status: 'paid' }] } })
    expect(() => mount(Authenticated, { slots: { default: () => 'signed in' } })).toThrow(/Convex auth context/)
    // Given its api, useGifts looks for the session before anything provided
    // it, finds none, and reads a signed-in account as signed out.
    const gifts = mount(defineComponent({ setup: () => ({ gifts: useGifts({ api: api as never }) }), render: () => h('div') })).vm.gifts
    await flushPromises()
    expect(gifts.received.value).toEqual([])
    vi.restoreAllMocks()
  })
})

describe('the base module over the mock', () => {
  it('pages a paginated query through the cursor it is asked for', async () => {
    const pages: Record<string, { page: string[], isDone: boolean, continueCursor: string }> = {
      start: { page: ['a', 'b'], isDone: false, continueCursor: 'c2' },
      c2: { page: ['c'], isDone: true, continueCursor: 'end' },
    }
    createBackendMock({ queries: { 'messages:list': ({ paginationOpts }: { paginationOpts: { cursor: string | null } }) => pages[paginationOpts.cursor ?? 'start'] } })
    const list = (await mountSuspended(defineComponent({
      setup: () => ({ list: usePaginatedQuery(makeFunctionReference<'query'>('messages:list'), {}, { initialNumItems: 2 }) }),
      render: () => h('div'),
    }))).vm.list
    expect(list.results.value).toEqual(['a', 'b'])
    expect(list.status.value).toBe('CanLoadMore')
    list.loadMore(2)
    await flushPromises()
    expect(list.results.value).toEqual(['a', 'b', 'c'])
    expect(list.status.value).toBe('Exhausted')
  })

  it('keeps every export of its entry, so an app\'s own explicit imports still work', () => {
    expect(provideConvexAuth).toBeTypeOf('function')
  })

  it('answers an app\'s own useQuery, auto-imported or imported, from the mock', async () => {
    const backend = createBackendMock({ user: {}, queries: { 'todos:list': [{ text: 'Ship it' }] } })
    const page = await mountSuspended(defineComponent({
      setup: () => ({ auto: autoImportedUseQuery(makeFunctionReference<'query'>('todos:list')), explicit: useQuery(makeFunctionReference<'query'>('todos:list')) }),
      render: () => h('div'),
    }))
    expect(page.vm.auto).toEqual([{ text: 'Ship it' }])
    expect(page.vm.explicit).toEqual([{ text: 'Ship it' }])
    backend.state.queries['todos:list'] = []
    await nextTick()
    expect(page.vm.auto).toEqual([])
  })

  it('shows <Authenticated> to a signed-in account and <Unauthenticated> to a visitor', async () => {
    const backend = createBackendMock({ user: {} })
    const slots = { default: () => h('p', 'inside') }
    expect((await mountSuspended(Authenticated, { slots })).text()).toBe('inside')
    backend.signOut()
    expect((await mountSuspended(Authenticated, { slots })).text()).toBe('')
    expect((await mountSuspended(Unauthenticated, { slots })).text()).toBe('inside')
  })

  it('lets a signed-in account through the auth middleware and sends a visitor to sign in', async () => {
    const config = useRuntimeConfig().public as Record<string, unknown>
    config.convex = { loginPath: '/login' }
    const to = { path: '/settings', fullPath: '/settings' } as never
    const push = vi.spyOn(useNuxtApp().$router, 'push').mockResolvedValue(undefined)
    const backend = createBackendMock({ user: {} })
    await expect(authMiddleware(to, to)).resolves.toBeUndefined()
    expect(push).not.toHaveBeenCalled()
    backend.signOut()
    await authMiddleware(to, to)
    expect(push).toHaveBeenCalledWith({ path: '/login', query: { redirect: '/settings' } })
    push.mockRestore()
  })
})

describe('a component rendered over the mock', () => {
  // The example on the Testing page (website/content/docs/03.develop/7.testing).
  it('records a subscriber\'s cancellation, and follows the session out', async () => {
    const backend = createBackendMock({
      user: { name: 'Ada' },
      queries: {
        'billing:getPricing': {
          plans: [{ key: 'pro', name: 'Pro', description: null, retired: false, features: [], featureKeys: [], prices: { month: { productId: 'prod_pro', amount: 900, currency: 'eur', monthly: 900 } } }],
          packs: [],
        },
        'billing:getCurrentSubscription': { id: 'sub_1', status: 'active', productId: 'prod_pro' },
      },
    })
    backend.stub('billing:cancelSubscription', () => null)
    const table = await mountSuspended(PricingTable, { props: { plans: [{ key: 'pro' }] } })
    await table.find('[data-intent="cancel"]').trigger('click')
    await table.find('[data-pricing="confirm-cancel"]').trigger('click')
    await flushPromises()
    expect(backend.callsTo('billing:cancelSubscription')).toEqual([{ atPeriodEnd: true }])

    backend.signOut()
    await flushPromises()
    expect(table.find('[data-intent="sign-in"]').exists()).toBe(true)
  })

  // axe-core runs in happy-dom: every WCAG A and AA rule it can decide
  // without layout. Contrast needs a real browser, so it comes back
  // undecided here; the starter's e2e smoke checks it in Chromium.
  it('passes axe-core\'s WCAG 2.2 A and AA rules, contrast aside', async () => {
    createBackendMock({
      user: {},
      queries: {
        'billing:getPricing': {
          plans: [
            { key: 'starter', name: 'Starter', description: null, retired: false, features: [], featureKeys: [], prices: { month: { productId: 'prod_starter', amount: 500, currency: 'eur', monthly: 500 } } },
            { key: 'pro', name: 'Pro', description: null, retired: false, features: ['Priority support'], featureKeys: ['priority'], prices: { month: { productId: 'prod_pro', amount: 900, currency: 'eur', monthly: 900 }, year: { productId: 'prod_pro_year', amount: 9000, currency: 'eur', monthly: 750, savings: 16 } } },
          ],
          packs: [{ key: 'credits100', productId: 'prod_pack', name: '100 credits', description: null, amount: 500, currency: 'eur', credits: { units: 100, rollover: true }, perCredit: 5, isBestValue: false }],
        },
        'billing:getCurrentSubscription': { id: 'sub_1', status: 'active', productId: 'prod_starter' },
        'billing:listAllSubscriptions': [],
        'billing:getBillingAccess': { canManage: true },
        'billing:getCredits': credits(42),
      },
    })
    const table = await mountSuspended(PricingTable, {
      props: { title: 'Plans', plans: [{ key: 'starter' }, { key: 'pro', highlight: true }], packs: [{ key: 'credits100' }], contact: { name: 'Enterprise', href: 'mailto:sales@example.com' } },
      attachTo: document.body,
    })
    expect(table.findAll('[data-pricing="plan"]')).toHaveLength(2)
    // The monthly / yearly switch is in the tree axe checks.
    expect(table.find('fieldset[data-pricing="interval"]').exists()).toBe(true)

    const results = await axe.run(table.element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    expect(results.violations.map(violation => `${violation.id}: ${violation.nodes.map(node => node.target.join(' ')).join(', ')}`)).toEqual([])
    expect(results.passes.length).toBeGreaterThan(5)
  })
})

describe('resetBackendMock', () => {
  it('forgets the mock: reads answer from a fresh signed-out one', () => {
    createBackendMock({ user: {} })
    resetBackendMock()
    expect(inSetup(() => useAuth()).isAuthenticated.value).toBe(false)
  })
})
