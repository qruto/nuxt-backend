import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { makeFunctionReference } from 'convex/server'
import { useConvex } from 'nuxt-convex-module/client'
import { createBackendMock, resetBackendMock } from '../../src/runtime/test-utils'
import { useAuthSession as useAuth } from '../../src/runtime/vue/utils/auth-session'
import { useWorkspace } from '../../src/runtime/vue/composables/use-workspace'
import { useSessions } from '../../src/runtime/vue/composables/use-sessions'
import { useAdmin } from '../../src/runtime/vue/composables/use-admin'

// The answers the backend mock (nuxt-backend/test-utils) gives an auth
// client method nobody stubbed, beyond backend-mock.test.ts: the rest of the
// workspace invitations and memberships, the account's own changes, and the
// package's own routes. Each is what Better Auth's server answers for the
// state the mock holds, refusals included, so an app's test can rely on it
// without stubbing the flow. And a one-shot query (what `useAsyncQuery` asks
// in the browser) with no answer yet, which waits as a live read loads.

enableAutoUnmount(afterEach)
afterEach(() => resetBackendMock())

const DAY = 86_400_000

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

describe('the mock\'s workspace answers', () => {
  it('lists everyone in a workspace and its pending invitations, and cancels one it sent', async () => {
    const backend = createBackendMock({
      user: { id: 'u1' },
      workspaces: [{
        id: 'ws1',
        name: 'Acme',
        members: [{ id: 'm1', workspaceId: 'ws1', userId: 'u1', role: 'owner' }, { id: 'm2', workspaceId: 'ws1', userId: 'u2', role: 'member' }] as never,
        invitations: [{ id: 'inv-1', email: 'grace@example.com', role: 'member', status: 'pending', workspaceId: 'ws1', inviterId: 'u1', expiresAt: Date.now() + DAY }],
      }],
    })
    const workspace = inSetup(() => useWorkspace())
    expect(workspace.members.value.map(member => [member.userId, member.role, member.workspaceId])).toEqual([['u1', 'owner', 'ws1'], ['u2', 'member', 'ws1']])
    expect(workspace.invitations.value.map(invitation => invitation.email)).toEqual(['grace@example.com'])

    await workspace.cancelInvitation('inv-1')
    expect(backend.callsTo('organization.cancelInvitation')).toEqual([{ invitationId: 'inv-1' }])
    expect(workspace.invitations.value).toEqual([])
    await expect(workspace.cancelInvitation('inv-gone')).rejects.toThrow()
  })

  it('lets an owner leave a workspace another owner keeps, but not one it is not in', async () => {
    const backend = createBackendMock({
      user: { id: 'u1' },
      workspaces: [
        { id: 'ws1', name: 'Personal' },
        { id: 'ws2', name: 'Acme', members: [{ id: 'm1', workspaceId: 'ws2', userId: 'u1', role: 'owner' }, { id: 'm2', workspaceId: 'ws2', userId: 'u2', role: 'owner' }] as never },
      ],
      activeWorkspace: 'ws2',
    })
    const workspace = inSetup(() => useWorkspace())
    await workspace.leave()
    expect(backend.state.workspaces.map(entry => entry.id)).toEqual(['ws1'])
    expect(backend.state.activeWorkspace).toBeNull()
    await expect(workspace.leave('ws-elsewhere')).rejects.toThrow()
    expect(backend.state.workspaces.map(entry => entry.id)).toEqual(['ws1'])
  })

  it('refuses an invitation with no workspace active to send it from', async () => {
    const backend = createBackendMock({ user: {}, activeWorkspace: null })
    const workspace = inSetup(() => useWorkspace())
    await expect(workspace.invite({ email: 'grace@example.com' })).rejects.toThrow()
    expect(backend.state.workspaces[0]!.invitations).toBeUndefined()
    // Naming the workspace sends it from there.
    await expect(workspace.invite({ email: 'grace@example.com', role: 'admin', workspaceId: 'workspace-1' })).resolves.toMatchObject({ email: 'grace@example.com', role: 'admin', workspaceId: 'workspace-1' })
  })

  it('clears the active workspace when told to, and switches to nothing with none active', async () => {
    const backend = createBackendMock({ user: {} })
    const { client } = inSetup(() => useAuth())
    expect(await client.organization.setActive({ organizationId: null })).toEqual({ data: null, error: null })
    expect(backend.state.activeWorkspace).toBeNull()
    expect(await client.organization.setActive({})).toEqual({ data: null, error: null })
  })

  it('declines an invitation sent to the account, which leaves the list, and refuses to decline it twice', async () => {
    const backend = createBackendMock({
      user: {},
      invitations: [{ id: 'inv-1', email: 'ada@example.com', status: 'pending', workspaceId: 'ws9', inviterId: 'u9', expiresAt: Date.now() + DAY }],
    })
    const workspace = inSetup(() => useWorkspace())
    await workspace.declineInvitation('inv-1')
    expect(backend.state.invitations[0]!.status).toBe('rejected')
    await expect(workspace.listReceivedInvitations()).resolves.toEqual([])
    await expect(workspace.declineInvitation('inv-1')).rejects.toThrow()
    // Declining joins nothing.
    expect(backend.state.workspaces.map(entry => entry.id)).toEqual(['workspace-1'])
  })

  it('describes an invitation by the workspace the account knows, and the inviter it names', async () => {
    createBackendMock({
      user: {},
      workspaces: [{ id: 'ws1', name: 'Personal' }, { id: 'ws2', name: 'Acme', slug: 'acme', role: 'member' }],
      invitations: [{ id: 'inv-2', email: 'ada@example.com', role: 'admin', status: 'pending', workspaceId: 'ws2', inviterId: 'u9', inviterEmail: 'grace@example.com', expiresAt: Date.now() + DAY }],
    })
    const workspace = inSetup(() => useWorkspace())
    await expect(workspace.getInvitation('inv-2')).resolves.toMatchObject({ workspaceId: 'ws2', workspaceName: 'Acme', workspaceSlug: 'acme', inviterEmail: 'grace@example.com' })
    // Accepting it into a workspace the account is already in joins no second copy.
    await expect(workspace.acceptInvitation('inv-2')).resolves.toMatchObject({ workspaceId: 'ws2', role: 'admin' })
    expect(workspace.workspaces.value.map(entry => entry.id)).toEqual(['ws1', 'ws2'])
    expect(workspace.current.value?.name).toBe('Acme')
  })
})

describe('the mock\'s account answers', () => {
  it('saves the account\'s own fields, and keeps the account until the email confirms its deletion', async () => {
    const backend = createBackendMock({ user: { name: 'Ada' } })
    const auth = inSetup(() => useAuth())
    await auth.updateUser({ name: 'Ada L.' })
    expect(backend.state.user).toMatchObject({ name: 'Ada L.' })
    expect(auth.user.value).toMatchObject({ name: 'Ada L.' })

    await auth.deleteAccount('DELETE')
    expect(backend.callsTo('deleteUser')).toEqual([{ confirmation: 'DELETE' }])
    expect(auth.isAuthenticated.value).toBe(true)
  })

  it('changes the account\'s address once the code for the new one is given', async () => {
    const backend = createBackendMock({ user: { email: 'ada@example.com' } })
    const { client } = inSetup(() => useAuth())
    expect((await client.emailOtp.requestEmailChange({ newEmail: 'ada@new.example' })).data).toEqual({ success: true })
    expect(backend.state.user!.email).toBe('ada@example.com')
    expect((await client.emailOtp.changeEmail({ newEmail: 'ada@new.example', otp: '123456' })).data).toEqual({ status: true })
    expect(backend.state.user!.email).toBe('ada@new.example')
  })

  it('signs every other device out, and records the request', async () => {
    const backend = createBackendMock({ user: {}, queries: { 'auth:listSessions': [] } })
    const sessions = inSetup(() => useSessions())
    await sessions.revokeOthers()
    expect(backend.callsTo('revokeOtherSessions')).toHaveLength(1)
  })

  it('signs in with the recovery code it handed out, as the address given, and refuses any other', async () => {
    const backend = createBackendMock({ passkeys: [{ id: 'pk1', name: 'Laptop', createdAt: '2026-01-01' }] })
    backend.signIn()
    const auth = inSetup(() => useAuth())
    const { recoveryCode } = await auth.setPasskeyOnly(true)
    backend.signOut()

    await expect(auth.signInWithRecoveryCode({ email: 'ada@example.com', recoveryCode: 'WRONG-CODE0-00000-00000' })).rejects.toThrow('That recovery code isn\'t right, or it was used already.')
    expect(backend.state.user).toBeNull()
    await expect(auth.signInWithRecoveryCode({ email: 'grace@example.com', recoveryCode: recoveryCode! })).resolves.toEqual({ recoveryCode })
    expect(backend.state.user).toMatchObject({ email: 'grace@example.com' })
  })

  it('lets an administrator turn an account\'s passkey-only off, and answers a route it does not know with nothing', async () => {
    const backend = createBackendMock({ user: { role: 'admin' } })
    const admin = inSetup(() => useAdmin())
    await admin.allowSignInCodes('u2')
    expect(backend.callsTo('$fetch')).toEqual([['/admin/disable-passkey-only', { method: 'POST', body: { userId: 'u2' } }]])

    const { client } = inSetup(() => useAuth())
    expect(await client.$fetch('/not-a-route', { method: 'POST' })).toEqual({ data: null, error: null })
  })
})

describe('the mock\'s one-shot queries', () => {
  const PHASE = makeFunctionReference<'query'>('access:getAccessPhase')

  /** Ask `PHASE` once, as `useAsyncQuery` does in the browser, and whether the answer came yet. */
  function askOnce() {
    const convex = inSetup(() => useConvex())!
    const asked = { settled: false, answer: convex.query(PHASE, {}) }
    asked.answer.then(() => (asked.settled = true), () => (asked.settled = true))
    return asked
  }

  it('waits for a query with no answer yet, and settles once the test answers it', async () => {
    const backend = createBackendMock()
    const asked = askOnce()
    await flushPromises()
    expect(asked.settled).toBe(false)
    expect(backend.callsTo(PHASE)).toEqual([{}])

    backend.state.queries['access:getAccessPhase'] = { phase: 'public' }
    await expect(asked.answer).resolves.toEqual({ phase: 'public' })
  })

  it('waits while a function answers undefined, and rejects once the query fails', async () => {
    const backend = createBackendMock({ queries: { 'access:getAccessPhase': () => undefined } })
    const asked = askOnce()
    await flushPromises()
    expect(asked.settled).toBe(false)

    backend.fail(PHASE, new Error('offline'))
    await expect(asked.answer).rejects.toThrow('offline')
  })

  it('answers at once a query that has its answer, or its stub\'s', async () => {
    const backend = createBackendMock({ queries: { 'access:getAccessPhase': { phase: 'invite-only' } } })
    await expect(askOnce().answer).resolves.toEqual({ phase: 'invite-only' })
    backend.stub(PHASE, async () => ({ phase: 'public' }))
    await expect(askOnce().answer).resolves.toEqual({ phase: 'public' })
  })

  it('leaves nothing waiting on a mock the next one replaced, nor on a reset one', async () => {
    const first = createBackendMock()
    const asked = askOnce()
    // The next test's mock answers it, and the old one is answered too late: neither reaches it.
    createBackendMock({ queries: { 'access:getAccessPhase': { phase: 'public' } } })
    first.state.queries['access:getAccessPhase'] = { phase: 'public' }
    await flushPromises()
    expect(asked.settled).toBe(false)

    const second = createBackendMock()
    const again = askOnce()
    resetBackendMock()
    second.state.queries['access:getAccessPhase'] = { phase: 'public' }
    await flushPromises()
    expect(again.settled).toBe(false)
  })
})
