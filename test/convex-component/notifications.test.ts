/// <reference types="vite/client" />
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { convexTest } from 'convex-test'
import { componentsGeneric, defineSchema, makeFunctionReference, mutationGeneric } from 'convex/server'
import { v } from 'convex/values'
import component, { asUser, defineBackendTestApp, seedWorkspace } from '../../src/convex/test'
import { api } from '../../src/convex/components/backend/_generated/api'
import schema from '../../src/convex/components/backend/schema'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { CHANNEL_GATES, CHANNELS } from '../../src/convex/components/backend/notifications'
import { getBackendError } from '../../src/convex/errors'
import { setupAudit } from '../../src/convex/integrations/audit'
import { type NotificationEntry, type NotificationsPage, setupNotifications, type UnreadCount } from '../../src/convex/integrations/notifications'

// The in-app inbox end to end: the app's audit instance (as `backend/audit.ts`
// builds it, with the notifications instance beside it) records into the
// mounted component, the component writes a notification in the same
// transaction for the people the event is for, and the app's reads page them,
// count the unread ones and mark them read.

const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
const notifications = setupNotifications(components as never, {
  notify: {
    'app.strip_ready': { channels: ['app'], link: event => `/strips/${event.targetId}` },
    'app.strip_shared': { channels: ['app', 'email', 'push'], link: () => 'https://elsewhere.example.com/phish' },
    'app.strip_failed': { channels: ['app'], link: () => { throw new Error('no link for this one') } },
  },
})
const audit = setupAudit(components as never, { notifications })

const record = mutationGeneric({
  args: { event: v.any(), fail: v.optional(v.boolean()) },
  handler: async (ctx, { event, fail }) => {
    const recorded = await audit.recordBackendEvent(ctx, event)
    if (fail) throw new Error('the caller failed after recording')
    return recorded
  },
})

/** What the app's mutation that deletes a strip calls. */
const forget = mutationGeneric({
  args: { kind: v.string(), target: v.string() },
  handler: async (ctx, notification) => await notifications.forget(ctx, notification),
})

/** Many events of one kind about one target, in one transaction. */
const recordMany = mutationGeneric({
  args: { type: v.string(), targetId: v.string(), count: v.number() },
  handler: async (ctx, { type, targetId, count }) => {
    for (let n = 0; n < count; n++) await audit.recordBackendEvent(ctx, { type: type as `app.${string}`, targetId })
  },
})

const testApp = defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './audit.js': () => Promise.resolve({ record, forget, recordMany }),
  './notifications.js': () => Promise.resolve({ ...notifications.api }),
})
type App = ReturnType<typeof testApp>

const recordRef = makeFunctionReference<'mutation'>('audit:record')
const listRef = makeFunctionReference<'query', { paginationOpts: { numItems: number, cursor: string | null } }, NotificationsPage>('notifications:listNotifications')
const countRef = makeFunctionReference<'query', Record<string, never>, UnreadCount>('notifications:getUnreadCount')
const readRef = makeFunctionReference<'mutation', { ids?: string[], all?: boolean }, { marked: number, done: boolean }>('notifications:markNotificationsRead')
const forgetRef = makeFunctionReference<'mutation', { kind: string, target: string }, { deleted: number, done: boolean }>('audit:forget')

let t: App

beforeAll(() => {
  vi.stubEnv('SITE_URL', 'http://localhost:3000')
  vi.stubEnv('AUTH_SECRET', 'test-secret-for-the-inbox-0123456789abcdef')
})

afterAll(() => {
  vi.unstubAllEnvs()
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
  vi.spyOn(console, 'info').mockImplementation(() => {})
  t = testApp()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** A person's first page, as they read it. */
const inbox = async (who: Pick<App, 'query'>, numItems = 20): Promise<NotificationEntry[]> => (await who.query(listRef, { paginationOpts: { numItems, cursor: null } })).page

describe('a package kind', () => {
  test('reaches the account it is about, in the transaction that recorded it, and nobody else', async () => {
    const ada = await asUser(t, { name: 'Ada' })
    const grace = await asUser(t, { name: 'Grace' })
    await ada.mutation(recordRef, { event: { type: 'auth.passkey_added', targetId: 'pk_1' } })

    expect(await inbox(grace)).toEqual([])
    expect(await inbox(ada)).toEqual([expect.objectContaining({ type: 'auth.passkey_added', readAt: null, channels: ['app'], targetId: 'pk_1', link: null, actor: { kind: 'you', name: 'Ada' } })])
    expect(await ada.query(countRef, {})).toEqual({ count: 1, more: false })
    expect(await grace.query(countRef, {})).toEqual({ count: 0, more: false })
  })

  test('rolls back with the mutation that recorded it', async () => {
    const ada = await asUser(t)
    await expect(ada.mutation(recordRef, { event: { type: 'auth.passkey_added' }, fail: true })).rejects.toThrow('the caller failed')
    expect(await inbox(ada)).toEqual([])
  })

  test('is not made for a kind that only sits on the trail, or for an event no account is about', async () => {
    const ada = await asUser(t)
    await ada.mutation(recordRef, { event: { type: 'auth.signed_in' } })
    await t.mutation(recordRef, { event: { type: 'auth.passkey_added', actor: null, subjectId: null } })
    expect(await inbox(ada)).toEqual([])
  })

  test('skips the account that did it itself, and tells the one it was done to, without naming an administrator', async () => {
    const workspaceId = await seedWorkspace(t, { name: 'Acme' })
    const owner = await asUser(t, { name: 'Grace', workspace: workspaceId, workspaceRole: 'owner' })
    const member = await asUser(t, { name: 'Ada', workspace: workspaceId, workspaceRole: 'member' })
    await member.mutation(recordRef, { event: { type: 'workspace.member_role_changed', entityId: workspaceId, data: { role: 'member' } } })
    expect(await inbox(member)).toEqual([])
    await owner.mutation(recordRef, { event: { type: 'workspace.member_role_changed', subjectId: member.userId, entityId: workspaceId, data: { role: 'admin' } } })
    expect(await inbox(member)).toEqual([expect.objectContaining({
      type: 'workspace.member_role_changed',
      actor: { kind: 'user', name: 'Grace' },
      workspace: { id: workspaceId, name: 'Acme' },
      data: { role: 'admin' },
    })])

    const admin = await asUser(t, { role: 'admin', workspace: false })
    await admin.mutation(recordRef, { event: { type: 'admin.role_changed', subjectId: member.userId, data: { role: 'admin' } } })
    expect((await inbox(member))[0]).toMatchObject({ type: 'admin.role_changed', actor: { kind: 'administrator', name: null } })
  })

  test('tells whoever sent an invitation that it was accepted', async () => {
    const workspaceId = await seedWorkspace(t, { name: 'Acme' })
    const inviter = await asUser(t, { workspace: workspaceId, workspaceRole: 'owner' })
    const invitee = await asUser(t, { workspace: false })
    const created = await t.mutation(components.backend.adapter.create, {
      input: { model: 'invitation', data: { organizationId: workspaceId, email: 'new@example.com', role: 'member', status: 'pending', expiresAt: Date.now() + 1000, inviterId: inviter.userId, createdAt: Date.now() } },
    } as never) as unknown as { _id: string }
    await invitee.mutation(recordRef, { event: { type: 'workspace.invitation_accepted', entityId: workspaceId, targetId: created._id, data: { role: 'member' } } })
    expect(await inbox(inviter)).toEqual([expect.objectContaining({ type: 'workspace.invitation_accepted', actor: expect.objectContaining({ kind: 'user' }) })])
    expect(await inbox(invitee)).toEqual([])
  })

  test('tells the workspace\'s managers instead of an inviter who is no longer a member', async () => {
    const workspaceId = await seedWorkspace(t, { name: 'Acme' })
    const owner = await asUser(t, { workspace: workspaceId, workspaceRole: 'owner' })
    const inviter = await asUser(t, { workspace: workspaceId, workspaceRole: 'admin' })
    const invitee = await asUser(t, { workspace: false })
    const created = await t.mutation(components.backend.adapter.create, {
      input: { model: 'invitation', data: { organizationId: workspaceId, email: 'new@example.com', role: 'member', status: 'pending', expiresAt: Date.now() + 1000, inviterId: inviter.userId, createdAt: Date.now() } },
    } as never) as unknown as { _id: string }
    // Taken out of the workspace before the invitation was accepted.
    await t.mutation(components.backend.adapter.deleteOne, { input: { model: 'member', where: [{ field: 'organizationId', value: workspaceId }, { field: 'userId', value: inviter.userId }] } } as never)
    await invitee.mutation(recordRef, { event: { type: 'workspace.invitation_accepted', entityId: workspaceId, targetId: created._id, data: { role: 'member' } } })
    expect(await inbox(inviter)).toEqual([])
    expect(await inbox(owner)).toEqual([expect.objectContaining({ type: 'workspace.invitation_accepted' })])
  })

  test('tells the workspace\'s managers instead when the invitation is not one it can read', async () => {
    const workspaceId = await seedWorkspace(t, { name: 'Acme' })
    const owner = await asUser(t, { workspace: workspaceId, workspaceRole: 'owner' })
    const member = await asUser(t, { workspace: workspaceId, workspaceRole: 'member' })
    await member.mutation(recordRef, { event: { type: 'workspace.invitation_accepted', entityId: workspaceId, data: { role: 'member' } } })
    expect(await inbox(owner)).toEqual([expect.objectContaining({ type: 'workspace.invitation_accepted' })])
    expect(await inbox(member)).toEqual([])
  })

  test('tells a billing entity\'s owners and admins, and an account billed on its own', async () => {
    const workspaceId = await seedWorkspace(t, { name: 'Acme' })
    const owner = await asUser(t, { workspace: workspaceId, workspaceRole: 'owner' })
    const admin = await asUser(t, { workspace: workspaceId, workspaceRole: 'admin' })
    const member = await asUser(t, { workspace: workspaceId, workspaceRole: 'member' })
    await t.mutation(recordRef, { event: { type: 'billing.credits_low', actor: null, entityId: workspaceId, data: { balance: 10, threshold: 20 } } })
    expect(await inbox(owner)).toHaveLength(1)
    expect(await inbox(admin)).toHaveLength(1)
    expect(await inbox(member)).toEqual([])

    const solo = await asUser(t, { workspace: false })
    await t.mutation(recordRef, { event: { type: 'billing.order_paid', actor: null, subjectId: solo.userId, targetId: 'ord_1', data: { amount: 900, currency: 'usd' } } })
    expect(await inbox(solo)).toEqual([expect.objectContaining({ type: 'billing.order_paid', data: { amount: 900, currency: 'usd' }, actor: { kind: 'app', name: null } })])
  })

  test('finds a large workspace\'s owners and admins without reading its members', async () => {
    // A read of more than 200 rows fails, and the workspace has 300 members before its admin.
    const limited = convexTest({ schema, modules: component.modules, transactionLimits: { documentsRead: 200 } })
    const { workspaceId, adminId } = await limited.run(async (ctx) => {
      const workspaceId = await ctx.db.insert('organization', { name: 'Big', slug: 'big', createdAt: Date.now() })
      for (let n = 0; n < 300; n++) await ctx.db.insert('member', { organizationId: workspaceId, userId: `member-${n}`, role: 'member', createdAt: Date.now() })
      const adminId = await ctx.db.insert('user', { name: 'Ada', email: 'ada@example.com', emailVerified: true, createdAt: Date.now(), updatedAt: Date.now() })
      await ctx.db.insert('member', { organizationId: workspaceId, userId: adminId, role: 'admin', createdAt: Date.now() })
      return { workspaceId, adminId }
    })
    await limited.mutation(api.audit.record, { event: { type: 'billing.credits_low', entityId: workspaceId, data: { balance: 10, threshold: 20 } } })
    const told = await limited.run(ctx => ctx.db.query('notifications').collect())
    expect(told.map(row => row.userId)).toEqual([adminId])
  })

  test('tells the manager who changed a plan nothing about it, and the other managers of it', async () => {
    const workspaceId = await seedWorkspace(t)
    const owner = await asUser(t, { workspace: workspaceId, workspaceRole: 'owner' })
    const admin = await asUser(t, { workspace: workspaceId, workspaceRole: 'admin' })
    await owner.mutation(recordRef, { event: { type: 'billing.plan_changed', entityId: workspaceId, data: { change: 'cancel' } } })
    expect(await inbox(owner)).toEqual([])
    expect(await inbox(admin)).toEqual([expect.objectContaining({ type: 'billing.plan_changed' })])
  })

  test('never sends a billing kind anywhere but the app, whatever it declares', async () => {
    const seen: string[] = []
    const email = {
      deliver: async (_ctx: unknown, { event }: { event: { type: string } }) => {
        seen.push(event.type)
        return true
      },
    }
    const before = { ...CHANNELS }
    CHANNELS.email = email as never
    try {
      const ada = await asUser(t, { workspace: false })
      await t.mutation(recordRef, { event: { type: 'billing.order_paid', actor: null, subjectId: ada.userId, data: { amount: 1, currency: 'usd' } } })
      await t.mutation(recordRef, { event: { type: 'auth.passkey_added', actor: { userId: ada.userId } } })
      expect(seen).toEqual(['auth.passkey_added'])
    }
    finally {
      delete CHANNELS.email
      expect(CHANNELS).toEqual(before)
    }
  })

  test('asks the gates before each channel, and skips the one a gate refuses without holding back the others', async () => {
    const sent: string[] = []
    CHANNELS.email = {
      deliver: async (_ctx, { event }) => {
        sent.push(event.type)
        return true
      },
    }
    const gates = [...CHANNEL_GATES]
    CHANNEL_GATES.push(async (_ctx, _userId, type, channel) => !(type === 'auth.passkey_added' && channel === 'email'))
    try {
      const ada = await asUser(t, { workspace: false })
      await ada.mutation(recordRef, { event: { type: 'auth.passkey_added' } })
      await ada.mutation(recordRef, { event: { type: 'auth.passkey_removed' } })
      expect(sent).toEqual(['auth.passkey_removed'])
      expect((await inbox(ada)).map(item => item.type)).toEqual(['auth.passkey_removed', 'auth.passkey_added'])
    }
    finally {
      delete CHANNELS.email
      CHANNEL_GATES.splice(0, CHANNEL_GATES.length, ...gates)
    }
  })
})

describe('a kind of the app\'s own', () => {
  test('is made by notify, with the link it reads from the event', async () => {
    const ada = await asUser(t, { workspace: false })
    await ada.mutation(recordRef, { event: { type: 'app.strip_ready', targetId: 'strip_7', data: { panels: 3 } } })
    expect(await inbox(ada)).toEqual([expect.objectContaining({ type: 'app.strip_ready', link: '/strips/strip_7', channels: ['app'], data: { panels: 3 } })])
  })

  test('stays a row on the trail when notify does not name it', async () => {
    const ada = await asUser(t, { workspace: false })
    await ada.mutation(recordRef, { event: { type: 'app.strip_archived' } })
    expect(await inbox(ada)).toEqual([])
  })

  test('drops a link that leaves the app, and one that throws, and still notifies', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ada = await asUser(t, { workspace: false })
    await ada.mutation(recordRef, { event: { type: 'app.strip_shared' } })
    await ada.mutation(recordRef, { event: { type: 'app.strip_failed' } })
    const items = await inbox(ada)
    expect(items.map(item => [item.type, item.link])).toEqual([['app.strip_failed', null], ['app.strip_shared', null]])
    expect(warn.mock.calls.join(' ')).toContain('notifications.deliver_failed')
  })

  test('goes out on the inbox alone while email and push have no channel to deliver them', async () => {
    const ada = await asUser(t, { workspace: false })
    await ada.mutation(recordRef, { event: { type: 'app.strip_shared' } })
    expect((await inbox(ada))[0]!.channels).toEqual(['app'])
  })

  test('is forgotten with its target: every recipient\'s, read or not, and nothing else', async () => {
    const ada = await asUser(t, { workspace: false })
    const bob = await asUser(t, { workspace: false })
    await ada.mutation(recordRef, { event: { type: 'app.strip_ready', targetId: 's1' } })
    await ada.mutation(recordRef, { event: { type: 'app.strip_ready', targetId: 's1', subjectId: bob.userId } })
    await ada.mutation(recordRef, { event: { type: 'app.strip_ready', targetId: 's2' } })
    await ada.mutation(recordRef, { event: { type: 'app.strip_shared', targetId: 's1' } })
    await ada.mutation(readRef, { all: true })
    expect(await inbox(bob)).toHaveLength(1)

    expect(await t.mutation(forgetRef, { kind: 'app.strip_ready', target: 's1' })).toEqual({ deleted: 2, done: true })
    expect((await inbox(ada)).map(item => [item.type, item.targetId])).toEqual([['app.strip_shared', 's1'], ['app.strip_ready', 's2']])
    expect(await inbox(bob)).toEqual([])
    // Nothing left: a second call deletes nothing.
    expect(await t.mutation(forgetRef, { kind: 'app.strip_ready', target: 's1' })).toEqual({ deleted: 0, done: true })
  })

  test('is forgotten in batches of 200, saying while more are left', async () => {
    const ada = await asUser(t, { workspace: false })
    await ada.mutation(makeFunctionReference<'mutation'>('audit:recordMany'), { type: 'app.strip_ready', targetId: 's1', count: 201 })
    expect(await t.mutation(forgetRef, { kind: 'app.strip_ready', target: 's1' })).toEqual({ deleted: 200, done: false })
    expect(await t.mutation(forgetRef, { kind: 'app.strip_ready', target: 's1' })).toEqual({ deleted: 1, done: true })
  })

  test('forgets only a kind notify names, never a package kind', async () => {
    await expect(t.mutation(forgetRef, { kind: 'member.role_changed', target: 's1' })).rejects.toThrow('is no kind setupNotifications({ notify }) names')
    await expect(t.mutation(forgetRef, { kind: 'app.strip_archived', target: 's1' })).rejects.toThrow('is no kind')
    await expect(t.mutation(forgetRef, { kind: 'app.strip_ready', target: '' })).rejects.toThrow('targetId')
  })
})

describe('the inbox', () => {
  /** Ada's inbox, with `count` notifications recorded a second apart. */
  async function fill(count: number) {
    const ada = await asUser(t, { workspace: false })
    for (let n = 0; n < count; n++) {
      vi.advanceTimersByTime(1000)
      await ada.mutation(recordRef, { event: { type: 'app.strip_ready', targetId: `s${n}` } })
    }
    return ada
  }

  test('pages newest first with the framework\'s own cursor', async () => {
    const ada = await fill(5)
    const first = await ada.query(listRef, { paginationOpts: { numItems: 2, cursor: null } })
    expect(first.page.map(item => item.targetId)).toEqual(['s4', 's3'])
    expect(first.isDone).toBe(false)
    const second = await ada.query(listRef, { paginationOpts: { numItems: 2, cursor: first.continueCursor } })
    expect(second.page.map(item => item.targetId)).toEqual(['s2', 's1'])
    const last = await ada.query(listRef, { paginationOpts: { numItems: 2, cursor: second.continueCursor } })
    expect(last.page.map(item => item.targetId)).toEqual(['s0'])
    expect(last.isDone).toBe(true)
  })

  test('counts the unread exactly up to 99, then says there are more', async () => {
    const ada = await fill(100)
    expect(await ada.query(countRef, {})).toEqual({ count: 99, more: true })
    await ada.mutation(readRef, { all: true })
    expect(await ada.query(countRef, {})).toEqual({ count: 0, more: false })
  })

  test('marks the ones named read, and only the caller\'s own', async () => {
    const ada = await fill(3)
    const grace = await fill(1)
    const [newest, middle] = await inbox(ada)
    const [graces] = await inbox(grace)
    expect(await ada.mutation(readRef, { ids: [newest!.id, graces!.id, 'not-an-id'] })).toEqual({ marked: 1, done: true })
    expect(await ada.query(countRef, {})).toEqual({ count: 2, more: false })
    expect((await inbox(grace))[0]!.readAt).toBeNull()
    expect((await inbox(ada))[0]!.readAt).toEqual(expect.any(Number))
    // Again changes nothing.
    expect(await ada.mutation(readRef, { ids: [newest!.id, middle!.id] })).toEqual({ marked: 1, done: true })
  })

  test('marks everything read in batches until none are left', async () => {
    const ada = await fill(3)
    expect(await ada.mutation(readRef, { all: true })).toEqual({ marked: 3, done: true })
    expect(await ada.mutation(readRef, { all: true })).toEqual({ marked: 0, done: true })
  })

  test('refuses nobody signed in, an empty or oversized list of ids, and an administrator acting as the account', async () => {
    const ada = await fill(1)
    expect(getBackendError(await t.mutation(readRef, { all: true }).catch((caught: unknown) => caught))).toMatchObject({ code: 'unauthenticated' })
    expect(getBackendError(await ada.mutation(readRef, { ids: [] }).catch((caught: unknown) => caught))).toMatchObject({ code: 'invalid_input', data: { field: 'ids' } })
    expect(getBackendError(await ada.mutation(readRef, { ids: Array.from({ length: 201 }, (_, n) => String(n)) }).catch((caught: unknown) => caught))).toMatchObject({ code: 'invalid_input' })
  })

  test('refuses a caller who has no inbox: signed out, or an administrator acting as the account', async () => {
    const ada = await fill(1)
    const admin = await asUser(t, { role: 'admin', workspace: false })
    const visit = await asUser(t, { impersonatedBy: admin.userId, workspace: false })
    await t.mutation(recordRef, { event: { type: 'auth.passkey_added', actor: null, subjectId: visit.userId } })
    const codeOf = async (call: Promise<unknown>) => getBackendError(await call.catch((caught: unknown) => caught))
    const page = { paginationOpts: { numItems: 5, cursor: null } }
    expect(await codeOf(t.query(listRef, page))).toMatchObject({ code: 'unauthenticated' })
    expect(await codeOf(t.query(countRef, {}))).toMatchObject({ code: 'unauthenticated' })
    for (const call of [visit.query(listRef, page), visit.query(countRef, {}), visit.mutation(readRef, { all: true })]) {
      expect(await codeOf(call)).toMatchObject({ code: 'forbidden', data: { reason: 'impersonating' } })
    }
    expect(await inbox(ada)).toHaveLength(1)
  })

  test('names an administrator, never the account, for what was done in a session they opened as it', async () => {
    const admin = await asUser(t, { role: 'admin', workspace: false })
    const visit = await asUser(t, { name: 'Ada', impersonatedBy: admin.userId })
    const bob = await asUser(t, { name: 'Bob', workspace: false })
    await visit.mutation(recordRef, { event: { type: 'app.strip_ready', subjectId: bob.userId, targetId: 's1' } })
    vi.advanceTimersByTime(1000)
    await visit.mutation(recordRef, { event: { type: 'app.strip_ready', targetId: 's2' } })
    vi.advanceTimersByTime(1000)
    // A kind that skips whoever did it reaches the account: it did not do it.
    await visit.mutation(recordRef, { event: { type: 'billing.plan_changed', entityId: visit.workspaceId, data: { change: 'cancel' } } })
    expect((await inbox(bob)).map(item => item.actor)).toEqual([{ kind: 'administrator', name: null }])
    const own = (await t.query(components.backend.notifications.list, { userId: visit.userId, paginationOpts: { numItems: 5, cursor: null } })).page
    expect(own.map(item => [item.type, item.actor])).toEqual([
      ['billing.plan_changed', { kind: 'administrator', name: null }],
      ['app.strip_ready', { kind: 'administrator', name: null }],
    ])
  })

  test('words an actor that was erased or is the app without a name', async () => {
    const ada = await asUser(t, { workspace: false })
    await t.mutation(recordRef, { event: { type: 'app.strip_ready', actor: { userId: 'erased:0123456789abcdef' }, subjectId: ada.userId } })
    expect((await inbox(ada))[0]!.actor).toEqual({ kind: 'erased', name: null })
  })
})
