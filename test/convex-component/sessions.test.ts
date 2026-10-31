/// <reference types="vite/client" />
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, makeFunctionReference, queryGeneric } from 'convex/server'
import { defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { setupAuth } from '../../src/convex/client'
import { setupEmail } from '../../src/convex/integrations/email'
import { getBackendError } from '../../src/convex/errors'

// The device-session functions, end to end: the app's `listSessions` and
// `revokeSession` (as `backend/auth.ts` re-exports them) over the mounted
// component, with a real Better Auth instance doing the revoke. The sessions
// are days old on purpose — Better Auth's own /list-sessions refuses those.

const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
const { listSessions, revokeSession, updateProfile } = setupAuth(components as never, queryGeneric, { email: setupEmail(components as never) })

const appModules = {
  './_generated/api.js': () => Promise.resolve({}),
  './auth.js': () => Promise.resolve({ listSessions, revokeSession, updateProfile }),
}
const updateProfileRef = makeFunctionReference<'mutation'>('auth:updateProfile')
const listRef = makeFunctionReference<'query'>('auth:listSessions')
const revokeRef = makeFunctionReference<'mutation'>('auth:revokeSession')

const DAY = 86_400_000
beforeAll(() => {
  vi.stubEnv('SITE_URL', 'http://localhost:3000')
  vi.stubEnv('AUTH_SECRET', 'test-secret-for-the-session-functions-0123456789')
})

afterAll(() => {
  vi.unstubAllEnvs()
})

const testApp = defineBackendTestApp(defineSchema({}), appModules)
let t: ReturnType<typeof testApp>

beforeEach(() => {
  t = testApp()
})

async function createRow(model: string, data: Record<string, unknown>): Promise<{ _id: string }> {
  return await t.mutation(components.backend.adapter.create, { input: { model, data } } as never) as { _id: string }
}

async function signIn(userId: string, token: string, overrides: Record<string, unknown> = {}) {
  const now = Date.now()
  return (await createRow('session', {
    userId,
    token,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130.0',
    createdAt: now - DAY * 3,
    updatedAt: now - DAY * 3,
    expiresAt: now + DAY * 4,
    ...overrides,
  }))._id
}

async function seed() {
  const now = Date.now()
  const ada = (await createRow('user', { name: 'Ada', email: 'ada@example.com', emailVerified: true, createdAt: now, updatedAt: now }))._id
  const bob = (await createRow('user', { name: 'Bob', email: 'bob@example.com', emailVerified: true, createdAt: now, updatedAt: now }))._id
  const laptop = await signIn(ada, 'token-laptop')
  const phone = await signIn(ada, 'token-phone', { userAgent: 'Mozilla/5.0 (iPhone) Safari', expiresAt: now + DAY * 6 })
  const expired = await signIn(ada, 'token-expired', { expiresAt: now - DAY })
  const impersonated = await signIn(ada, 'token-impersonated', { impersonatedBy: bob })
  const bobs = await signIn(bob, 'token-bob')
  return { ada, bob, laptop, phone, expired, impersonated, bobs }
}

async function sessionTokens(): Promise<string[]> {
  const rows = await t.query(components.backend.adapter.findMany, {
    model: 'session',
    paginationOpts: { numItems: 100, cursor: null },
  } as never) as { page: Array<{ token: string }> }
  return rows.page.map(row => row.token).sort()
}

describe('listSessions', () => {
  test('lists the caller\'s sessions of any age, latest expiry first, without tokens or impersonations', async () => {
    const ids = await seed()
    const rows = await t.withIdentity({ subject: ids.ada, sessionId: ids.laptop }).query(listRef, {}) as Array<Record<string, unknown>>

    expect(rows.map(row => row.id)).toEqual([ids.phone, ids.laptop, ids.expired])
    expect(rows.find(row => row.id === ids.laptop)).toMatchObject({ current: true, userAgent: expect.stringContaining('Chrome') })
    expect(rows.find(row => row.id === ids.phone)).toMatchObject({ current: false })
    // The composable drops expired rows: a query can't read the clock.
    expect(rows.find(row => row.id === ids.expired)!.expiresAt).toBeLessThan(Date.now())
    expect(JSON.stringify(rows)).not.toContain('token-')
  })

  test('is null for signed-out callers and for tokens that belong to no session', async () => {
    const ids = await seed()
    await expect(t.query(listRef, {})).resolves.toBeNull()
    await expect(t.withIdentity({ subject: ids.ada }).query(listRef, {})).resolves.toBeNull()
  })
})

describe('revokeSession', () => {
  test('signs one of the caller\'s own sessions out through Better Auth', async () => {
    const ids = await seed()
    await t.withIdentity({ subject: ids.ada, sessionId: ids.laptop }).mutation(revokeRef, { sessionId: ids.phone })

    const tokens = await sessionTokens()
    expect(tokens).not.toContain('token-phone')
    expect(tokens).toEqual(expect.arrayContaining(['token-laptop', 'token-bob']))
  })

  test('refuses another user\'s session, an unknown id and an impersonating admin', async () => {
    const ids = await seed()
    const ada = t.withIdentity({ subject: ids.ada, sessionId: ids.laptop })
    await expect(ada.mutation(revokeRef, { sessionId: ids.bobs })).rejects.toThrow('Session not found.')
    await expect(ada.mutation(revokeRef, { sessionId: 'not-an-id' })).rejects.toThrow('Session not found.')
    // Signing Ada's devices out is hers to do, in person.
    const refusal = (caller: typeof ada) => caller.mutation(revokeRef, { sessionId: ids.phone }).catch((error: unknown) => getBackendError(error))
    expect(await refusal(t.withIdentity({ subject: ids.ada, sessionId: ids.impersonated, impersonatedBy: ids.bob })))
      .toMatchObject({ code: 'forbidden', data: { reason: 'impersonating' } })
    await expect(t.mutation(revokeRef, { sessionId: ids.phone })).rejects.toThrow('Sign in to manage your sessions.')
    // Each refusal crosses the function boundary with its code, which production keeps.
    expect(getBackendError(await ada.mutation(revokeRef, { sessionId: ids.bobs }).catch((error: unknown) => error)))
      .toEqual({ code: 'invalid_input', data: { field: 'sessionId' }, message: 'That session has already ended.' })
    expect(getBackendError(await t.mutation(revokeRef, { sessionId: ids.phone }).catch((error: unknown) => error)))
      .toMatchObject({ code: 'unauthenticated' })

    expect(await sessionTokens()).toHaveLength(5)
  })
})

describe('an account banned since its token was minted', () => {
  test('can neither sign its devices out nor change its profile: both read the account fresh', async () => {
    const ids = await seed()
    await t.mutation(components.backend.adapter.updateOne, { input: { model: 'user', where: [{ field: '_id', value: ids.ada }], update: { banned: true } } } as never)
    const ada = t.withIdentity({ subject: ids.ada, sessionId: ids.laptop })
    for (const call of [() => ada.mutation(revokeRef, { sessionId: ids.phone }), () => ada.mutation(updateProfileRef, { name: 'Ada L.' })]) {
      expect(getBackendError(await call().catch((error: unknown) => error))).toMatchObject({ code: 'forbidden', data: { reason: 'banned' } })
    }
    expect(await sessionTokens()).toHaveLength(5)
  })
})

describe('a long session history', () => {
  test('lists and revokes every one of the caller\'s sessions, past the first hundred and behind 250 newer ones of someone else', async () => {
    const now = Date.now()
    const ada = (await createRow('user', { name: 'Ada', email: 'ada@example.com', emailVerified: true, createdAt: now, updatedAt: now }))._id
    const bob = (await createRow('user', { name: 'Bob', email: 'bob@example.com', emailVerified: true, createdAt: now, updatedAt: now }))._id
    // Ada's sessions are the oldest rows in the table, each expiring a second
    // after the one before; every row after them is Bob's.
    const adas: string[] = []
    for (let index = 0; index < 120; index++) adas.push(await signIn(ada, `token-ada-${index}`, { expiresAt: now + DAY + index * 1000 }))
    for (let index = 0; index < 250; index++) await signIn(bob, `token-bob-${index}`)

    const current = adas.at(-1)!
    const caller = t.withIdentity({ subject: ada, sessionId: current })
    const rows = await caller.query(listRef, {}) as Array<{ id: string }>
    expect(rows.map(row => row.id)).toEqual([...adas].reverse())

    // The second to expire sits past the first hundred.
    await caller.mutation(revokeRef, { sessionId: adas[1]! })
    const after = await caller.query(listRef, {}) as Array<{ id: string }>
    expect(after).toHaveLength(119)
    expect(after.map(row => row.id)).not.toContain(adas[1])
  }, 60_000)
})
