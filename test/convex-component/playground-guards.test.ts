/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, makeFunctionReference } from 'convex/server'
import { getBackendError } from '../../src/convex/errors'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { rateLimiter } from '../../website/backend/rateLimiter'
import schema from '../../website/backend/schema'

// The public playground's guards, run on the website's own functions. The
// daily sweep clears the app data of sandbox accounts idle for a week, and
// nobody else's; messages go through the aggregate triggers, so the live count
// must still match the table afterwards. The abuse limits refuse what a
// visitor should not be able to do or repeat.

const testApp = defineBackendTestApp(schema, import.meta.glob(['../../website/backend/**/*.ts', '../../website/backend/_generated/*.js', '!**/*.d.ts']))
const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
const clearIdleAccounts = makeFunctionReference<'mutation'>('retention:clearIdleAccounts')
const clearUserData = makeFunctionReference<'mutation'>('demo:clearUserData')
const seedForUser = makeFunctionReference<'mutation'>('seed:seedForUser')
const sendMessage = makeFunctionReference<'mutation'>('messages:send')
const countMessages = makeFunctionReference<'query'>('aggregates:countMessages')
const echo = makeFunctionReference<'action'>('demo:echo')
const generateUploadUrl = makeFunctionReference<'mutation'>('files:generateUploadUrl')
const createTodo = makeFunctionReference<'mutation'>('todos:create')
const increment = makeFunctionReference<'mutation'>('counter:increment')
const runBackfill = makeFunctionReference<'action'>('migrations:runBackfill')

const DAY = 86_400_000

let t: ReturnType<typeof testApp>

beforeEach(() => {
  vi.useFakeTimers()
  t = testApp()
})

afterEach(() => {
  vi.useRealTimers()
})

async function account(email: string, options: { idleDays: number | null, role?: string }): Promise<string> {
  const now = Date.now()
  const user = await t.mutation(components.backend.adapter.create, {
    input: { model: 'user', data: { name: email, email, emailVerified: true, createdAt: now - DAY * 30, updatedAt: now - DAY * 30, ...(options.role ? { role: options.role } : {}) } },
  } as never) as { _id: string }
  // No session: the account signed out (Better Auth deletes the row).
  if (options.idleDays === null) return user._id
  const lastSeen = now - DAY * options.idleDays
  await t.mutation(components.backend.adapter.create, {
    input: { model: 'session', data: { userId: user._id, token: `token-${email}`, createdAt: lastSeen, updatedAt: lastSeen, expiresAt: lastSeen + DAY * 7 } },
  } as never)
  return user._id
}

/** One row in every per-user table, a stored upload, and a message through the triggers. */
async function fill(userId: string, extraLogs = 0): Promise<string> {
  await t.withIdentity({ subject: userId, name: 'Visitor' }).mutation(sendMessage, { text: 'hello' })
  return await t.run(async (ctx) => {
    await ctx.db.insert('todos', { userId, text: 'todo', completed: false })
    await ctx.db.insert('counters', { userId, name: 'demo', value: 3 })
    for (let i = 0; i <= extraLogs; i++) await ctx.db.insert('logs', { userId, level: 'info', message: `log ${i}` })
    await ctx.db.insert('sentEmails', { userId, emailId: 'email_1', to: 'x@resend.dev', subject: 'Hi', createdAt: Date.now() })
    const storageId = await ctx.storage.store(new Blob(['file']))
    await ctx.db.insert('files', { userId, storageId, name: 'file.txt' })
    return storageId
  })
}

async function rowsOf(userId: string): Promise<number> {
  return await t.run(async (ctx) => {
    const counts = await Promise.all([
      ctx.db.query('todos').withIndex('userId', q => q.eq('userId', userId)).collect(),
      ctx.db.query('messages').withIndex('userId', q => q.eq('userId', userId)).collect(),
      ctx.db.query('counters').withIndex('userId_name', q => q.eq('userId', userId)).collect(),
      ctx.db.query('logs').withIndex('userId', q => q.eq('userId', userId)).collect(),
      ctx.db.query('files').withIndex('userId', q => q.eq('userId', userId)).collect(),
      ctx.db.query('sentEmails').withIndex('userId', q => q.eq('userId', userId)).collect(),
    ])
    return counts.flat().length
  })
}

const sandbox = (label: string) => `delivered+${label.padEnd(16, '0')}@resend.dev`

describe('the idle-account sweep', () => {
  test('clears idle sandbox accounts only, in batches, and keeps the message count right', async () => {
    const idle = await account(sandbox('idle'), { idleDays: 9 })
    const active = await account(sandbox('active'), { idleDays: 1 })
    const admin = await account(sandbox('admin'), { idleDays: 30, role: 'admin' })
    const outsider = await account('ada@example.com', { idleDays: 30 })
    // More rows than one batch, so the clear has to continue in a second run.
    // Written nine days ago: fresh rows would count as activity.
    const now = Date.now()
    vi.setSystemTime(now - DAY * 9)
    const idleUpload = await fill(idle, 600)
    vi.setSystemTime(now)
    for (const userId of [active, admin, outsider]) await fill(userId)

    // Two accounts a page, so the walk continues across pages too.
    await t.mutation(clearIdleAccounts, { paginationOpts: { numItems: 2, cursor: null } })
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    expect(await rowsOf(idle)).toBe(0)
    expect(await t.run(ctx => ctx.storage.get(idleUpload))).toBeNull()
    for (const userId of [active, admin, outsider]) expect(await rowsOf(userId)).toBe(6)
    expect(await t.query(countMessages, {})).toBe(3)
  })

  test('clears a seeded account, and judges a signed-out one by what it last wrote', async () => {
    const now = Date.now()
    const seeded = await account(sandbox('seeded'), { idleDays: 9 })
    const recent = await account(sandbox('recent'), { idleDays: null })
    const gone = await account(sandbox('gone'), { idleDays: null })
    vi.setSystemTime(now - DAY * 9)
    await t.mutation(seedForUser, { userId: seeded, email: sandbox('seeded') })
    await fill(gone)
    vi.setSystemTime(now - DAY)
    await fill(recent)
    vi.setSystemTime(now)

    await t.mutation(clearIdleAccounts, { paginationOpts: { numItems: 10, cursor: null } })
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    expect(await rowsOf(seeded)).toBe(0)
    expect(await rowsOf(gone)).toBe(0)
    expect(await rowsOf(recent)).toBe(6)
  })

  test('keeps a signed-out account that signed in this week, whatever it wrote', async () => {
    const now = Date.now()
    vi.setSystemTime(now - DAY * 9)
    const reader = await account(sandbox('reader'), { idleDays: null })
    await fill(reader)
    vi.setSystemTime(now)
    // Signing in and out stamp updatedAt (website/utils/activity.ts).
    await t.mutation(components.backend.adapter.updateOne, {
      input: { model: 'user', where: [{ field: '_id', value: reader }], update: { updatedAt: now - DAY } },
    } as never)

    await t.mutation(clearIdleAccounts, { paginationOpts: { numItems: 10, cursor: null } })
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    expect(await rowsOf(reader)).toBe(6)
  })
})

describe('clearUserData', () => {
  test('clears the caller\'s files and sent emails too, and nobody else\'s data', async () => {
    const me = await account(sandbox('me'), { idleDays: 0 })
    const other = await account(sandbox('other'), { idleDays: 0 })
    const upload = await fill(me)
    await fill(other)

    await t.withIdentity({ subject: me }).mutation(clearUserData, {})
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    expect(await rowsOf(me)).toBe(0)
    expect(await t.run(ctx => ctx.storage.get(upload))).toBeNull()
    expect(await rowsOf(other)).toBe(6)
    expect(await t.query(countMessages, {})).toBe(1)
  })

  test('clears a seeded account, and messages the counts never saw', async () => {
    const me = await account(sandbox('seed'), { idleDays: 0 })
    await t.mutation(seedForUser, { userId: me, email: sandbox('seed') })
    // A message written before the seed was counted, as production still holds.
    await t.run(ctx => ctx.db.insert('messages', { userId: me, author: 'Visitor', text: 'uncounted' }))

    await t.withIdentity({ subject: me }).mutation(clearUserData, {})
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    expect(await rowsOf(me)).toBe(0)
    expect(await t.query(countMessages, {})).toBe(0)
  })
})

describe('abuse limits', () => {
  test('the demo action needs a sign-in and a short text', async () => {
    const me = await asUser(t, { email: sandbox('echo') })
    await expect(t.action(echo, { text: 'hi', delayMs: 0 })).rejects.toThrow('Sign in to run the demo action.')
    await expect(me.action(echo, { text: 'x'.repeat(501), delayMs: 0 })).rejects.toThrow('Up to 500 characters.')
  })

  test('upload URLs are rationed per user and refused to a full library', async () => {
    const me = await asUser(t, { email: sandbox('upload') })
    for (let i = 0; i < 10; i++) await me.mutation(generateUploadUrl, {})
    // The limiter's own refusal, which the page reads as rate_limited with the wait.
    const limited = await me.mutation(generateUploadUrl, {}).catch((error: unknown) => error)
    expect(getBackendError(limited)).toMatchObject({ code: 'rate_limited', data: { limit: 'playgroundUpload' } })

    const full = await asUser(t, { email: sandbox('full') })
    await t.run(async (ctx) => {
      for (let i = 0; i < 50; i++) {
        await ctx.db.insert('files', { userId: full.userId, storageId: await ctx.storage.store(new Blob([String(i)])), name: `${i}.txt` })
      }
    })
    await expect(full.mutation(generateUploadUrl, {})).rejects.toThrow('50 files per account')
  })

  test('a refusal the limiter answers without a wait still refuses, as rate_limited', async () => {
    // With `throws: true` the limiter throws only when it knows the wait; a
    // closed limit without one comes back as `{ ok: false }`.
    const me = await asUser(t, { email: sandbox('nowait') })
    vi.spyOn(rateLimiter, 'limit').mockResolvedValueOnce({ ok: false, retryAfter: undefined } as never)
    const limited = await me.mutation(generateUploadUrl, {}).catch((error: unknown) => error)
    expect(getBackendError(limited)).toEqual({ code: 'rate_limited', data: { limit: 'playgroundUpload' }, message: 'Too many requests. Try again in a moment.' })
  })

  test('todos and counters take bounded input', async () => {
    const me = await asUser(t, { email: sandbox('input') })
    await expect(me.mutation(createTodo, { text: ' ' })).rejects.toThrow('A todo needs some text.')
    await expect(me.mutation(createTodo, { text: 'x'.repeat(201) })).rejects.toThrow('up to 200 characters')
    await expect(me.mutation(increment, { name: 'x'.repeat(65) })).rejects.toThrow('Counter names')
    await expect(me.mutation(increment, { by: 1001 })).rejects.toThrow('Steps are whole numbers')
    await expect(me.mutation(increment, { by: 0.5 })).rejects.toThrow('Steps are whole numbers')
  })

  test('an account keeps up to 200 todos', async () => {
    const me = await asUser(t, { email: sandbox('todos') })
    await t.run(async (ctx) => {
      for (let i = 0; i < 200; i++) await ctx.db.insert('todos', { userId: me.userId, text: `todo ${i}`, completed: false })
    })
    await expect(me.mutation(createTodo, { text: 'one more' })).rejects.toThrow('up to 200 todos per account')
  })

  test('a backfill needs the admin role', async () => {
    const visitor = await asUser(t, { email: sandbox('visitor') })
    await expect(visitor.action(runBackfill, { name: 'backfillMessagesCount', dryRun: true }))
      .rejects.toThrow('Forbidden')
  })
})
