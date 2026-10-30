/// <reference types="vite/client" />

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { convexTest } from 'convex-test'
import { componentsGeneric, defineSchema, type FunctionReference } from 'convex/server'
import resendComponent from '@convex-dev/resend/test'
import component, { register } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import schema from '../../src/convex/components/backend/schema'
import { api, components, internal } from '../../src/convex/components/backend/_generated/api'
import { MAINTENANCE_BATCH, MAINTENANCE_TASKS } from '../../src/convex/components/backend/maintenance'
import { NOTIFICATION_READ_RETENTION_MS, NOTIFICATION_UNREAD_RETENTION_MS } from '../../src/convex/notifications'

// The backend component's own housekeeping, run the way its cron runs it:
// `maintenance.run` starts a pass, each task deletes a batch and schedules
// the next until it is done. The clock is faked so rows can be aged past
// their windows; the component runs as the root app with its email provider
// child registered, as in email.test.ts.

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

let t: ReturnType<typeof convexTest>

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
  t = convexTest(schema, component.modules)
  resendComponent.register(t, 'resend')
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** Start a pass and run it to the end, every batch it schedules included. */
async function runPass() {
  await t.mutation(internal.maintenance.run, {})
  await t.finishAllScheduledFunctions(() => vi.runAllTimers())
}

/** Every row of a table. */
function rows(table: 'session' | 'verification' | 'rateLimit' | 'aiRequests' | 'invitation' | 'secretOutbox') {
  return t.run(ctx => ctx.db.query(table).collect())
}

/** A session row expiring at `expiresAt`. */
function session(expiresAt: number, token: string) {
  return t.run(ctx => ctx.db.insert('session', { expiresAt, token, createdAt: 0, updatedAt: 0, userId: 'u1' }))
}

describe('maintenance', () => {
  test('deletes a read notification 90 days after it was read and an unread one 365 days after it was recorded', async () => {
    const now = Date.now()
    const add = (eventId: string, fields: { at: number, readAt?: number }) => t.run(ctx => ctx.db.insert('notifications', { userId: 'u1', type: 'billing.credits_low', eventId, channels: ['app'], ...fields }))
    await add('read-long-ago', { at: now - 2 * NOTIFICATION_READ_RETENTION_MS, readAt: now - NOTIFICATION_READ_RETENTION_MS - 1000 })
    await add('read-recently', { at: now - 2 * NOTIFICATION_READ_RETENTION_MS, readAt: now - DAY })
    await add('unread-old', { at: now - NOTIFICATION_UNREAD_RETENTION_MS - 1000 })
    await add('unread-recent', { at: now - NOTIFICATION_READ_RETENTION_MS - DAY })
    await runPass()
    expect((await t.run(ctx => ctx.db.query('notifications').collect())).map(row => row.eventId).sort()).toEqual(['read-recently', 'unread-recent'])
  })

  test('deletes a known device a year after it was last seen, and a lifted suppression a week after the lift', async () => {
    const now = Date.now()
    const device = (fingerprint: string, lastSeenAt: number) => t.run(ctx => ctx.db.insert('knownDevices', { userId: 'u1', fingerprint, device: 'kind', firstSeenAt: lastSeenAt, lastSeenAt }))
    await device('old', now - 365 * DAY - 1000)
    await device('recent', now - 364 * DAY)
    const suppression = (email: string, liftedAt?: number) => t.run(ctx => ctx.db.insert('suppressions', { email, origin: 'bounce', suppressedAt: now - 30 * DAY, changedAt: liftedAt ?? now - 30 * DAY, ...(liftedAt === undefined ? {} : { liftedAt }) }))
    await suppression('standing@example.com')
    await suppression('lifted-long-ago@example.com', now - 7 * DAY - 1000)
    await suppression('lifted-lately@example.com', now - DAY)
    await runPass()
    expect((await t.run(ctx => ctx.db.query('knownDevices').collect())).map(row => row.fingerprint)).toEqual(['recent'])
    expect((await t.run(ctx => ctx.db.query('suppressions').collect())).map(row => row.email).sort()).toEqual(['lifted-lately@example.com', 'standing@example.com'])
  })

  test('deletes sessions a day past their expiry and keeps the rest', async () => {
    const now = Date.now()
    await session(now - DAY - 1, 'long-expired')
    await session(now - HOUR, 'just-expired')
    await session(now + DAY, 'live')
    await runPass()
    expect((await rows('session')).map(row => row.token).sort()).toEqual(['just-expired', 'live'])
  })

  test('deletes verifications an hour past their expiry, so a late code still reads as expired', async () => {
    const now = Date.now()
    await t.run(async (ctx) => {
      await ctx.db.insert('verification', { identifier: 'old', value: 'x', expiresAt: now - HOUR - 1, createdAt: 0, updatedAt: 0 })
      await ctx.db.insert('verification', { identifier: 'late', value: 'x', expiresAt: now - 10 * 60 * 1000, createdAt: 0, updatedAt: 0 })
      await ctx.db.insert('verification', { identifier: 'live', value: 'x', expiresAt: now + 5 * 60 * 1000, createdAt: 0, updatedAt: 0 })
    })
    await runPass()
    expect((await rows('verification')).map(row => row.identifier).sort()).toEqual(['late', 'live'])
  })

  test('deletes rate-limit counters idle for a day', async () => {
    const now = Date.now()
    await t.run(async (ctx) => {
      await ctx.db.insert('rateLimit', { key: 'idle', count: 3, lastRequest: now - DAY - 1 })
      await ctx.db.insert('rateLimit', { key: 'active', count: 1, lastRequest: now - 60_000 })
    })
    await runPass()
    expect((await rows('rateLimit')).map(row => row.key)).toEqual(['active'])
  })

  test('deletes finished AI requests after a day, and one stuck in reserved after a week', async () => {
    const now = Date.now()
    const request = (streamId: string, status: 'reserved' | 'settled' | 'released', createdAt: number) => ({
      streamId, name: 'echo', entityId: 'e', userId: 'u', args: '{}', cost: 1, externalId: streamId, status, createdAt,
    })
    await t.run(async (ctx) => {
      await ctx.db.insert('aiRequests', request('settled-old', 'settled', now - 2 * DAY))
      await ctx.db.insert('aiRequests', request('released-old', 'released', now - 2 * DAY))
      await ctx.db.insert('aiRequests', request('reserved-old', 'reserved', now - 2 * DAY))
      await ctx.db.insert('aiRequests', request('reserved-stuck', 'reserved', now - 8 * DAY))
      await ctx.db.insert('aiRequests', request('settled-new', 'settled', now - HOUR))
    })
    await runPass()
    expect((await rows('aiRequests')).map(row => row.streamId).sort()).toEqual(['reserved-old', 'settled-new'])
  })

  test('keeps an expired invitation for 30 days, so it can still show as expired', async () => {
    const now = Date.now()
    const invitation = (email: string, status: string, expiresAt: number) => ({ organizationId: 'o', email, status, expiresAt, createdAt: 0, inviterId: 'u' })
    await t.run(async (ctx) => {
      await ctx.db.insert('invitation', invitation('gone@example.com', 'pending', now - 31 * DAY))
      await ctx.db.insert('invitation', invitation('expired@example.com', 'pending', now - 29 * DAY))
      await ctx.db.insert('invitation', invitation('accepted@example.com', 'accepted', now - 60 * DAY))
    })
    await runPass()
    expect((await rows('invitation')).map(row => row.email).sort()).toEqual(['accepted@example.com', 'expired@example.com'])
  })

  test('works through a backlog in batches of at most MAINTENANCE_BATCH rows, rescheduling itself until done', async () => {
    const now = Date.now()
    const total = MAINTENANCE_BATCH * 2 + 17
    await t.run(async (ctx) => {
      for (let index = 0; index < total; index++) {
        await ctx.db.insert('session', { expiresAt: now - 2 * DAY, token: `s${index}`, createdAt: 0, updatedAt: 0, userId: 'u1' })
      }
    })
    await t.mutation(internal.maintenance.run, {})
    // One sweep per task is scheduled, each deleting at most a batch.
    await t.mutation(internal.maintenance.sweep, { task: 'sessions', startedAt: now, pruned: 0 })
    expect(await rows('session')).toHaveLength(total - MAINTENANCE_BATCH)
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await rows('session')).toEqual([])
  })

  test('reports each task\'s last pass and rows pruned, for DevTools', async () => {
    const now = Date.now()
    await session(now - 2 * DAY, 'old-1')
    await session(now - 2 * DAY, 'old-2')
    await runPass()
    const status = await t.query(api.maintenance.status, {})
    // The deployment's clock runs a tick ahead of a frozen test clock per commit.
    expect(status.find(task => task.task === 'sessions')).toMatchObject({ pruned: 2, totalPruned: 2, startedAt: expect.closeTo(now, -2) })
    expect(status.find(task => task.task === 'verifications')).toMatchObject({ pruned: 0, totalPruned: 0 })
    // The provider component prunes email records itself and does not count them.
    const emails = status.find(task => task.task === 'emailRecords')
    expect(emails?.finishedAt).toBeGreaterThanOrEqual(now)
    expect(emails).not.toHaveProperty('pruned')

    vi.setSystemTime(now + HOUR)
    await session(now - 2 * DAY, 'old-3')
    await runPass()
    expect((await t.query(api.maintenance.status, {})).find(task => task.task === 'sessions')).toMatchObject({ pruned: 1, totalPruned: 3 })
  })

  test('does not start a task again while its pass is still running', async () => {
    await t.mutation(internal.maintenance.run, {})
    const jobs = async () => (await t.run(ctx => ctx.db.system.query('_scheduled_functions').collect()))
      .filter(job => job.name.includes('sweep') && job.state.kind === 'pending')
    const pending = (await jobs()).length
    await t.mutation(internal.maintenance.run, {})
    expect((await jobs()).length).toBe(pending)
  })

  test('prunes old and abandoned email records through the provider component', async () => {
    const finalized = await t.mutation(components.resend.lib.createManualEmail, { from: 'a@b.c', to: 'delivered@resend.dev', subject: 'Old' })
    await t.mutation(components.resend.lib.updateManualEmail, { emailId: finalized, status: 'failed', errorMessage: 'x' })
    const abandoned = await t.mutation(components.resend.lib.createManualEmail, { from: 'a@b.c', to: 'delivered@resend.dev', subject: 'Never finished' })
    vi.setSystemTime(Date.now() + 8 * DAY)
    const recent = await t.mutation(components.resend.lib.createManualEmail, { from: 'a@b.c', to: 'delivered@resend.dev', subject: 'Recent' })
    await runPass()
    expect(await t.query(api.email.get, { emailId: finalized })).toBeNull()
    expect(await t.query(api.email.get, { emailId: abandoned })).not.toBeNull()
    vi.setSystemTime(Date.now() + 23 * DAY)
    await runPass()
    expect(await t.query(api.email.get, { emailId: abandoned })).toBeNull()
    expect(await t.query(api.email.get, { emailId: recent })).not.toBeNull()
  })

  test('prunes email records by the retention the app\'s sends carried, a longer one included', async () => {
    const finalized = await t.mutation(components.resend.lib.createManualEmail, { from: 'a@b.c', to: 'delivered@resend.dev', subject: 'Old' })
    await t.mutation(components.resend.lib.updateManualEmail, { emailId: finalized, status: 'failed', errorMessage: 'x' })
    await t.run(ctx => ctx.db.insert('emailSettings', { finalizedMs: 90 * DAY }))
    vi.setSystemTime(Date.now() + 8 * DAY)
    await runPass()
    expect(await t.query(api.email.get, { emailId: finalized })).not.toBeNull()
  })

  test('deletes a secret email still waiting past its time, and logs it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await t.run(ctx => ctx.db.insert('secretOutbox', { message: { to: 'delivered@resend.dev', subject: 'Code', text: '123456' }, attempts: 3, nextAttemptAt: 0, generation: 3, expiresAt: Date.now() + 15 * 60 * 1000 }))
    vi.setSystemTime(Date.now() + 16 * 60 * 1000)
    await runPass()
    expect(await rows('secretOutbox')).toEqual([])
    expect(warn.mock.calls.flat().join('\n')).toContain('email.secret_failed')
  })

  test('a task that throws ends its own pass, is recorded, and does not stop the others or the next pass', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const now = Date.now()
    await session(now - 2 * DAY, 'old')
    await t.run(ctx => ctx.db.insert('rateLimit', { key: 'idle', count: 1, lastRequest: now - 2 * DAY }))
    const sessions = vi.spyOn(MAINTENANCE_TASKS, 'sessions').mockRejectedValueOnce(new Error('poison row'))
    await runPass()
    const status = await t.query(api.maintenance.status, {})
    expect(status.find(task => task.task === 'sessions')).toMatchObject({ error: 'poison row' })
    expect(status.find(task => task.task === 'sessions')!.finishedAt).toBeGreaterThanOrEqual(now)
    expect(await rows('rateLimit')).toEqual([])
    expect(error.mock.calls.flat().join('\n')).toContain('maintenance.task_failed')
    // The lock was released: the next pass runs the task again, and clears the error.
    sessions.mockRestore()
    vi.setSystemTime(now + HOUR)
    await runPass()
    expect(await rows('session')).toEqual([])
    expect((await t.query(api.maintenance.status, {})).find(task => task.task === 'sessions')).not.toHaveProperty('error')
  })

  test('starts a task again once its pass has run for six hours without finishing', async () => {
    const now = Date.now()
    await session(now - 2 * DAY, 'old')
    await t.run(ctx => ctx.db.insert('maintenanceTasks', { task: 'sessions', startedAt: now - HOUR, totalPruned: 0 }))
    await runPass()
    expect(await rows('session')).toHaveLength(1)
    await t.run(async (ctx) => {
      const row = (await ctx.db.query('maintenanceTasks').collect()).find(task => task.task === 'sessions')
      await ctx.db.patch('maintenanceTasks', row!._id, { startedAt: now - 7 * HOUR, finishedAt: undefined })
    })
    await runPass()
    expect(await rows('session')).toEqual([])
  })

  test('a batch of large rows stops short of the transaction budget and the rest follows in later batches', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const html = 'x'.repeat(700 * 1024)
    await t.run(async (ctx) => {
      for (let index = 0; index < 30; index++) await ctx.db.insert('secretOutbox', { message: { to: 'delivered@resend.dev', from: 'a@b.c', subject: `m${index}`, html }, attempts: 0, generation: 0, nextAttemptAt: 0, expiresAt: 0 })
    })
    vi.setSystemTime(Date.now() + 2 * HOUR)
    const now = Date.now()
    const first = await t.mutation(internal.maintenance.batch, { task: 'secretOutbox', startedAt: now })
    expect(first.done).toBe(false)
    expect(first.pruned).toBeLessThan(30)
    await runPass()
    expect(await rows('secretOutbox')).toEqual([])
    expect((await t.query(api.maintenance.status, {})).find(task => task.task === 'secretOutbox')).not.toHaveProperty('error')
  })
})

// The suite above runs the component as the root app, as email.test.ts does.
// A deployment mounts it as a component, where the platform refuses some of
// what the root app may do (`paginate()`, for one): here every task runs
// through a pass of a component mounted as an app mounts it.
describe('maintenance in a mounted component', () => {
  const mounted = componentsGeneric() as unknown as {
    backend: ComponentApi<'backend'> & { maintenance: { run: FunctionReference<'mutation', 'internal'> } }
  }
  const { backend } = mounted

  /** An app with nothing but the component, mounted under its name. */
  function app() {
    const t = convexTest(defineSchema({}), { './_generated/api.js': () => Promise.resolve({}) })
    register(t)
    return t
  }

  test('runs every task to the end, a task with more rows than a batch across batches', async () => {
    const t = app()
    const now = Date.now()
    const create = (model: string, data: Record<string, unknown>) => t.mutation(backend.adapter.create, { input: { model, data } } as never)
    // More expired sessions than a batch deletes, and one still alive.
    const old = MAINTENANCE_BATCH + 5
    for (let index = 0; index < old; index++) await create('session', { userId: 'u1', token: `old-${index}`, createdAt: 0, updatedAt: 0, expiresAt: now - 2 * DAY })
    await create('session', { userId: 'u1', token: 'recent', createdAt: now, updatedAt: now, expiresAt: now + DAY })

    await t.mutation(backend.maintenance.run, {})
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())

    const status = await t.query(backend.maintenance.status, {})
    expect(status.map(task => task.task).sort()).toEqual([...Object.keys(MAINTENANCE_TASKS), 'emailRecords'].sort())
    expect(status.filter(task => task.error !== undefined)).toEqual([])
    expect(status.find(task => task.task === 'sessions')).toMatchObject({ pruned: old })
    const sessions = await t.query(backend.adapter.findMany, { model: 'session', paginationOpts: { numItems: 400, cursor: null } } as never) as { page: Array<{ token: string }> }
    expect(sessions.page.map(row => row.token)).toEqual(['recent'])
  })
})
