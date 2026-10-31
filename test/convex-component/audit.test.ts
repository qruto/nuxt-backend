/// <reference types="vite/client" />
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { convexTest } from 'convex-test'
import resendComponent from '@convex-dev/resend/test'
import { componentsGeneric, defineSchema, defineTable, internalActionGeneric, internalMutationGeneric, makeFunctionReference, mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import component, { asUser, defineBackendTestApp, seedWorkspace } from '../../src/convex/test'
import { api, internal } from '../../src/convex/components/backend/_generated/api'
import schema from '../../src/convex/components/backend/schema'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { ERASURE_BATCH } from '../../src/convex/components/backend/audit'
import { AUDIT_EVENT_RETENTION_MS } from '../../src/convex/components/backend/maintenance'
import { setupAuth } from '../../src/convex/client'
import { defineSetUserRole } from '../../src/convex/integrations/authorization'
import { getBackendError } from '../../src/convex/errors'
import { type AuditPage, type OnBackendEvent, setupAudit, vBackendEvent } from '../../src/convex/integrations/audit'
import { setupEmail } from '../../src/convex/integrations/email'

// The shared event path, end to end: the app's own audit instance (as
// `backend/audit.ts` builds it) records into the mounted component, hands
// each event to the app's `onEvent` action, reads the trail back as three
// pages of activity, each for its own reader, and erases an account's part
// of it. The auth layer's own write points record through the same path
// (test/unit/audit-flow.test.ts drives them through Better Auth's routes);
// the last tests here run one of them over the component itself.

const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
// An activation of its own, which no test here records: an account's first
// `app.*` event would otherwise count as its activation and add a row.
const audit = setupAudit(components as never, { onEvent: makeFunctionReference<'action'>('audit:onEvent') as unknown as OnBackendEvent, activation: 'app.project_published' })

/** What the app's `onEvent` heard, one row per event. */
const appSchema = defineSchema({ heard: defineTable({ eventId: v.string(), type: v.string(), actorId: v.optional(v.string()) }) })

const record = mutationGeneric({
  args: { event: v.any(), fail: v.optional(v.boolean()) },
  handler: async (ctx, { event, fail }) => {
    const recorded = await audit.recordBackendEvent(ctx, event)
    if (fail) throw new Error('the caller failed after recording')
    return recorded
  },
})
const onEvent = internalActionGeneric({
  args: { event: vBackendEvent },
  handler: async (ctx, { event }) => {
    await ctx.runMutation(makeFunctionReference<'mutation'>('audit:heard'), { eventId: event.id, type: event.type, ...(event.actorId ? { actorId: event.actorId } : {}) })
  },
})
const heard = internalMutationGeneric({
  args: { eventId: v.string(), type: v.string(), actorId: v.optional(v.string()) },
  handler: async (ctx, row) => {
    await ctx.db.insert('heard', row)
  },
})
const heardRows = queryGeneric({ args: {}, handler: async ctx => ctx.db.query('heard').collect() })

const { revokeSession } = setupAuth(components as never, queryGeneric, { email: setupEmail(components as never), audit })
const setUserRole = defineSetUserRole(components as never)

const testApp = defineBackendTestApp(appSchema, {
  './_generated/api.js': () => Promise.resolve({}),
  './audit.js': () => Promise.resolve({ ...audit.api, record, onEvent, heard, heardRows }),
  './auth.js': () => Promise.resolve({ revokeSession }),
  './functions.js': () => Promise.resolve({ setUserRole }),
})
type App = ReturnType<typeof testApp>

const recordRef = makeFunctionReference<'mutation'>('audit:record')
const heardRef = makeFunctionReference<'query'>('audit:heardRows')
const listActivity = makeFunctionReference<'query'>('audit:listActivity')
const listWorkspaceActivity = makeFunctionReference<'query'>('audit:listWorkspaceActivity')
const listAllActivity = makeFunctionReference<'query'>('audit:listAllActivity')

let t: App

beforeAll(() => {
  vi.stubEnv('SITE_URL', 'http://localhost:3000')
  vi.stubEnv('AUTH_SECRET', 'test-secret-for-the-audit-trail-0123456789abc')
})

afterAll(() => {
  vi.unstubAllEnvs()
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
  t = testApp()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** Every entry of the trail, newest first, as an administrator reads it. */
async function entries() {
  const all = await t.query(components.backend.audit.list, { view: { kind: 'all', viewerId: 'reader' }, paginationOpts: { numItems: 100, cursor: null } })
  return all.page
}

/** Record one event as the app itself (no identity), with explicit ids. */
async function recordAs(event: Record<string, unknown>) {
  return t.mutation(recordRef, { event }) as Promise<{ id: string, deliveries: { inApp: boolean, email: boolean } }>
}

describe('recordBackendEvent', () => {
  test('writes the row, logs its type and id alone, and hands it to onEvent once it commits', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const ada = await asUser(t, { email: 'ada@example.com' })
    const { id, deliveries } = await ada.mutation(recordRef, { event: { type: 'auth.passkey_added', targetId: 'pk_1' } }) as { id: string, deliveries: unknown }
    expect(await entries()).toEqual([expect.objectContaining({ id, type: 'auth.passkey_added', actor: expect.objectContaining({ id: ada.userId }), subject: expect.objectContaining({ id: ada.userId }), targetId: 'pk_1', at: expect.closeTo(Date.now(), -2) })])
    expect(deliveries).toEqual({ inApp: true, email: true })
    // One line, the type and the id: no address, no name.
    expect(info.mock.calls.map(call => call.join(' '))).toEqual([`[nuxt-backend] audit.recorded: auth.passkey_added ${id}`])
    expect(info.mock.calls.join(' ')).not.toContain('ada')
    expect(await t.query(heardRef, {})).toEqual([])
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await t.query(heardRef, {})).toEqual([expect.objectContaining({ eventId: id, type: 'auth.passkey_added', actorId: ada.userId })])
  })

  test('rolls back with the mutation that recorded it, and nothing reaches onEvent', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    await expect(t.mutation(recordRef, { event: { type: 'app.ping' }, fail: true })).rejects.toThrow('the caller failed')
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await entries()).toEqual([])
    expect(await t.query(heardRef, {})).toEqual([])
  })

  test('names the administrator behind an impersonated session, from the claims', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const admin = await asUser(t, { role: 'admin', workspace: false })
    const visited = await asUser(t, { impersonatedBy: admin.userId })
    await visited.mutation(recordRef, { event: { type: 'app.note_saved' } })
    await recordAs({ type: 'app.nightly_sync', subjectId: null })
    const [byApp, byVisit] = await entries()
    expect(byVisit).toMatchObject({ actor: { id: visited.userId }, subject: { id: visited.userId }, impersonated: true })
    expect(byApp).toMatchObject({ actor: { kind: 'app', id: null }, subject: null })
  })

  test.each([
    [{ type: 'project.archived' }, 'type'],
    [{ type: 'auth.signed_in', data: { email: 'ada@example.com' } }, 'data.email'],
    [{ type: 'workspace.member_invited', data: { role: 'member' } }, 'entityId'],
    [{ type: 'workspace.member_invited', entityId: 'w1', data: {} }, 'data.role'],
    [{ type: 'auth.signed_out', entityId: 'w1' }, 'entityId'],
    [{ type: 'app.note', data: { text: 'x'.repeat(200) } }, 'data.text'],
    [{ type: 'app.note', targetId: 'x'.repeat(200) }, 'targetId'],
  ])('refuses %j on %s, and writes nothing', async (event, field) => {
    const error = await t.mutation(recordRef, { event }).catch((caught: unknown) => caught)
    expect(getBackendError(error)).toMatchObject({ code: 'invalid_input', data: { field } })
    expect(await entries()).toEqual([])
  })

  test('derives in-app only for an account\'s workspace role, and nothing without an account to tell', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    expect((await recordAs({ type: 'workspace.member_role_changed', actor: null, subjectId: 'u1', entityId: 'w1', data: { role: 'admin' } })).deliveries).toEqual({ inApp: true, email: false })
    expect((await recordAs({ type: 'auth.signed_out', actor: null, subjectId: 'u1' })).deliveries).toEqual({ inApp: false, email: false })
  })
})

/** A page of a view, as the caller reads it. */
async function page(caller: Pick<App, 'query'>, ref: typeof listActivity, cursor: string | null = null, numItems = 20) {
  return caller.query(ref, { paginationOpts: { numItems, cursor } }) as Promise<AuditPage | null>
}

describe('the activity views', () => {
  async function seedTrail() {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const workspaceId = await seedWorkspace(t, { name: 'Acme' })
    const owner = await asUser(t, { name: 'Grace', workspace: workspaceId, workspaceRole: 'owner' })
    const member = await asUser(t, { name: 'Ada', workspace: workspaceId, workspaceRole: 'member' })
    const admin = await asUser(t, { name: 'Root', role: 'admin', workspace: false })
    await owner.mutation(recordRef, { event: { type: 'workspace.member_invited', entityId: workspaceId, targetId: 'inv_1', data: { role: 'member' } } })
    vi.advanceTimersByTime(1000)
    await owner.mutation(recordRef, { event: { type: 'workspace.member_role_changed', subjectId: member.userId, entityId: workspaceId, data: { role: 'admin' } } })
    vi.advanceTimersByTime(1000)
    await member.mutation(recordRef, { event: { type: 'auth.signed_in', data: { method: 'passkey' } } })
    vi.advanceTimersByTime(1000)
    await admin.mutation(recordRef, { event: { type: 'admin.role_changed', subjectId: member.userId, data: { role: 'admin' } } })
    return { workspaceId, owner, member, admin }
  }

  test('an account reads what happened to it, newest first, with an administrator unnamed', async () => {
    const { member, owner } = await seedTrail()
    const mine = await page(member, listActivity)
    expect(mine?.isDone).toBe(true)
    expect(mine?.page.map(entry => entry.type)).toEqual(['admin.role_changed', 'auth.signed_in', 'workspace.member_role_changed'])
    const [byAdmin, signIn, roleChange] = mine!.page
    expect(byAdmin!.actor).toEqual({ kind: 'administrator', id: null, name: null })
    expect(byAdmin!.subject).toMatchObject({ kind: 'you', name: 'Ada' })
    expect(signIn).toMatchObject({ actor: { kind: 'you' }, data: { method: 'passkey' }, workspace: null })
    expect(roleChange).toMatchObject({ actor: { kind: 'user', id: owner.userId, name: 'Grace' }, workspace: { name: 'Acme' }, data: { role: 'admin' } })
  })

  test('an administrator who signed an account\'s device out is unnamed in its activity, and named to administrators', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const ada = await asUser(t, { name: 'Ada' })
    const admin = await asUser(t, { name: 'Root', role: 'admin', workspace: false })
    await recordAs({ type: 'auth.session_revoked', actor: { userId: admin.userId }, subjectId: ada.userId, targetId: 's_laptop' })
    await recordAs({ type: 'app.note_shared', actor: { userId: admin.userId }, subjectId: ada.userId })
    const [shared, revoked] = (await page(ada, listActivity))!.page
    expect(revoked).toMatchObject({ type: 'auth.session_revoked', actor: { kind: 'administrator', id: null, name: null }, subject: { kind: 'you' } })
    // An app\'s own kind names whoever acted.
    expect(shared).toMatchObject({ type: 'app.note_shared', actor: { kind: 'user', id: admin.userId, name: 'Root' } })
    expect((await page(admin, listAllActivity))!.page[1]).toMatchObject({ actor: { kind: 'you' }, subject: { kind: 'user', name: 'Ada' } })
  })

  test('the setUserRole bootstrap records the role it changes, by the app, and nothing for the role already held', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const ada = await asUser(t, { email: 'ada@example.com', name: 'Ada' })
    const bootstrap = makeFunctionReference<'mutation'>('functions:setUserRole')
    await t.mutation(bootstrap, { email: 'ada@example.com', role: 'admin' })
    await t.mutation(bootstrap, { email: 'ada@example.com', role: 'admin' })
    expect((await page(ada, listActivity))?.page).toEqual([
      expect.objectContaining({ type: 'admin.role_changed', actor: { kind: 'app', id: null, name: null }, subject: expect.objectContaining({ kind: 'you' }), data: { role: 'admin' } }),
    ])
  })

  test('a workspace\'s owners and admins read everything inside it, and nobody else does', async () => {
    const { owner, member, admin, workspaceId } = await seedTrail()
    const ours = await page(owner, listWorkspaceActivity)
    expect(ours?.page.map(entry => entry.type)).toEqual(['workspace.member_role_changed', 'workspace.member_invited'])
    expect(ours?.page[0]).toMatchObject({ actor: { kind: 'you' }, subject: { kind: 'user', name: 'Ada' }, workspace: { id: workspaceId } })
    // A plain member, an account outside the workspace and a signed-out visitor read nothing.
    expect(await page(member, listWorkspaceActivity)).toBeNull()
    expect(await page(admin, listWorkspaceActivity)).toBeNull()
    expect(await page(t, listWorkspaceActivity)).toBeNull()
  })

  test('an administrator reads every event; nobody else does', async () => {
    const { owner, admin } = await seedTrail()
    expect((await page(admin, listAllActivity))?.page).toHaveLength(4)
    expect(await page(owner, listAllActivity)).toBeNull()
    expect(await page(t, listAllActivity)).toBeNull()
    expect(await page(t, listActivity)).toBeNull()
  })

  test('pages by cursor, newest first, holding still while events arrive, and a cursor never leaves its reader', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const ada = await asUser(t)
    const grace = await asUser(t)
    for (let index = 0; index < 5; index++) {
      await ada.mutation(recordRef, { event: { type: 'app.step', data: { index } } })
      await grace.mutation(recordRef, { event: { type: 'app.step', data: { index } } })
      // Two of Ada's in the same millisecond: the cursor tells them apart.
      if (index !== 2) vi.advanceTimersByTime(10)
    }
    const first = await page(ada, listActivity, null, 2)
    expect(first?.page.map(entry => entry.data.index)).toEqual([4, 3])
    expect(first?.isDone).toBe(false)
    await ada.mutation(recordRef, { event: { type: 'app.step', data: { index: 5 } } })
    const second = await page(ada, listActivity, first!.continueCursor, 2)
    const third = await page(ada, listActivity, second!.continueCursor, 2)
    expect(second?.page.map(entry => entry.data.index)).toEqual([2, 1])
    expect(third?.page.map(entry => entry.data.index)).toEqual([0])
    expect(third?.isDone).toBe(true)
    // Grace's cursor on Ada's view, and a cursor that is not one, read Ada's own rows only.
    const fromGrace = await page(grace, listActivity, null, 1)
    expect((await page(ada, listActivity, fromGrace!.continueCursor, 10))?.page.every(entry => entry.actor.kind === 'you')).toBe(true)
    expect((await page(ada, listActivity, 'not-a-cursor', 1))?.page.map(entry => entry.data.index)).toEqual([5])
  })
})

describe('the stored trail', () => {
  // The component as the root app, so its rows read as they are stored.
  let root: ReturnType<typeof convexTest>
  beforeEach(() => {
    root = convexTest(schema, component.modules)
    resendComponent.register(root, 'resend')
    vi.spyOn(console, 'info').mockImplementation(() => {})
  })
  const stored = () => root.run(ctx => ctx.db.query('auditEvents').collect())
  const recordRow = (event: Record<string, unknown>) => root.mutation(api.audit.record, { event: event as never })
  const forget = async (userId: string) => {
    await root.mutation(api.audit.forgetSubject, { userId })
    await root.finishAllScheduledFunctions(() => vi.runAllTimers())
  }

  test('keeps a row a year, then the hourly maintenance deletes it', async () => {
    const now = Date.now()
    await root.run(async (ctx) => {
      await ctx.db.insert('auditEvents', { type: 'auth.signed_in', actorId: 'u1', subjectId: 'u1', at: now - AUDIT_EVENT_RETENTION_MS - 1 })
      await ctx.db.insert('auditEvents', { type: 'auth.signed_out', actorId: 'u1', subjectId: 'u1', at: now - AUDIT_EVENT_RETENTION_MS + 60_000 })
    })
    await root.mutation(internal.maintenance.run, {})
    await root.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect((await stored()).map(row => row.type)).toEqual(['auth.signed_out'])
  })

  test('removes an account\'s own rows and pseudonymizes the ones that stay, one pseudonym throughout', async () => {
    await recordRow({ type: 'auth.signed_in', actorId: 'gone', subjectId: 'gone' })
    await recordRow({ type: 'workspace.member_removed', actorId: 'gone', subjectId: 'stays', entityId: 'w1' })
    await recordRow({ type: 'workspace.invitation_accepted', actorId: 'gone', subjectId: 'gone', entityId: 'w1', data: { role: 'member' } })
    await recordRow({ type: 'auth.signed_in', actorId: 'stays', impersonatorId: 'gone', subjectId: 'stays' })
    await recordRow({ type: 'app.note_saved', actorId: 'gone', subjectId: 'gone' })
    await forget('gone')
    const left = await stored()
    expect(left.map(row => row.type)).toEqual(['workspace.member_removed', 'workspace.invitation_accepted', 'auth.signed_in'])
    expect(JSON.stringify(left)).not.toContain('"gone"')
    const aliases = new Set(left.flatMap(row => [row.actorId, row.subjectId, row.impersonatorId]).filter(id => id?.startsWith('erased:')))
    expect(aliases.size).toBe(1)
    expect(left[0]).toMatchObject({ subjectId: 'stays', entityId: 'w1' })
    expect(left[2]).toMatchObject({ actorId: 'stays', subjectId: 'stays' })
  })

  test('keeps what administrators did to the account, and did while acting as it', async () => {
    await recordRow({ type: 'admin.role_changed', actorId: 'root', subjectId: 'gone', data: { role: 'user' } })
    await recordRow({ type: 'admin.impersonation_started', actorId: 'root', subjectId: 'gone', targetId: 's1' })
    await recordRow({ type: 'auth.session_revoked', actorId: 'root', subjectId: 'gone', targetId: 's2' })
    await recordRow({ type: 'auth.passkey_removed', actorId: 'gone', impersonatorId: 'root', subjectId: 'gone', targetId: 'pk' })
    // The account\'s own: removed.
    await recordRow({ type: 'auth.session_revoked', actorId: 'gone', subjectId: 'gone', targetId: 's3' })
    await forget('gone')
    const left = await stored()
    expect(left.map(row => row.type)).toEqual(['admin.role_changed', 'admin.impersonation_started', 'auth.session_revoked', 'auth.passkey_removed'])
    expect(left.every(row => row.subjectId?.startsWith('erased:') && (row.actorId === 'root' || row.impersonatorId === 'root'))).toBe(true)
    expect(JSON.stringify(left)).not.toContain('"gone"')
  })

  test('removes the rows of the account\'s personal workspace, which is named after it', async () => {
    const [personal, shared] = await root.run(async ctx => [
      await ctx.db.insert('organization', { name: 'Gone\'s workspace', slug: 'personal-gone', createdAt: 0 }),
      await ctx.db.insert('organization', { name: 'Acme', slug: 'acme', createdAt: 0 }),
    ])
    await recordRow({ type: 'workspace.member_invited', actorId: 'gone', subjectId: 'gone', entityId: personal, data: { role: 'member' } })
    await recordRow({ type: 'workspace.member_removed', actorId: 'gone', subjectId: 'stays', entityId: personal })
    await recordRow({ type: 'workspace.member_removed', actorId: 'gone', subjectId: 'stays', entityId: shared })
    // An administrator acting as it in its personal workspace: kept, as an administrator\'s record.
    await recordRow({ type: 'workspace.member_invited', actorId: 'gone', impersonatorId: 'root', subjectId: 'gone', entityId: personal, data: { role: 'member' } })
    await forget('gone')
    const left = await stored()
    expect(left.map(row => [row.type, row.entityId])).toEqual([['workspace.member_removed', shared], ['workspace.member_invited', personal]])
    expect(left[1]).toMatchObject({ impersonatorId: 'root' })
  })

  test('finishes a trail longer than one transaction', async () => {
    await root.run(async (ctx) => {
      for (let index = 0; index < ERASURE_BATCH + 30; index++) {
        await ctx.db.insert('auditEvents', { type: 'workspace.created', actorId: 'gone', subjectId: 'gone', entityId: 'w1', at: index })
        await ctx.db.insert('auditEvents', { type: 'auth.signed_out', actorId: 'gone', subjectId: 'gone', at: index })
      }
    })
    await forget('gone')
    const left = await stored()
    expect(left).toHaveLength(ERASURE_BATCH + 30)
    expect(left.every(row => row.type === 'workspace.created' && row.actorId?.startsWith('erased:') && row.actorId === row.subjectId)).toBe(true)
  })

  test('names an erased account as such in what stays', async () => {
    await recordRow({ type: 'workspace.member_removed', actorId: 'gone', subjectId: 'stays', entityId: 'w1' })
    await forget('gone')
    const { page } = await root.query(api.audit.list, { view: { kind: 'workspace', workspaceId: 'w1', viewerId: 'stays' }, paginationOpts: { numItems: 5, cursor: null } })
    expect(page[0]).toMatchObject({ actor: { kind: 'erased', id: null, name: null }, subject: { kind: 'you' } })
  })
})

describe('the auth layer\'s events, over the component', () => {
  test('signing a device out records it on the account\'s activity, by the person who did it', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const ada = await asUser(t)
    const other = await t.mutation(components.backend.adapter.create, {
      input: { model: 'session', data: { userId: ada.userId, token: 'other-device', createdAt: Date.now(), updatedAt: Date.now(), expiresAt: Date.now() + 86_400_000 } },
    } as never) as { _id: string }
    await ada.mutation(makeFunctionReference<'mutation'>('auth:revokeSession'), { sessionId: other._id })
    const mine = await page(ada, listActivity)
    expect(mine?.page).toEqual([expect.objectContaining({ type: 'auth.session_revoked', actor: expect.objectContaining({ kind: 'you' }), targetId: other._id })])
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await t.query(heardRef, {})).toEqual([expect.objectContaining({ type: 'auth.session_revoked' })])
  })
})
