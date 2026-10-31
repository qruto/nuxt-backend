/// <reference types="vite/client" />

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { convexTest } from 'convex-test'
import { componentsGeneric, type FunctionReference } from 'convex/server'
import migrationsComponent from '@convex-dev/migrations/test'
import resendComponent from '@convex-dev/resend/test'
import component from '../../src/convex/test'
import schema from '../../src/convex/components/backend/schema'
import { internal } from '../../src/convex/components/backend/_generated/api'
import * as definitions from '../../src/convex/components/backend/migrations'
import { PACKAGE_MIGRATIONS } from '../../src/convex/package-migrations'

// The package's own data migrations, run the way `nuxt-backend upgrade`
// runs them: `migrations.run` starts the series on the migrations
// component nested in `backend`, the batches it schedules run to the end,
// and `migrations.status` reports each one. The component runs as the root
// app with its children registered at the root, as in maintenance.test.ts.

const DAY = 24 * 60 * 60 * 1000

let t: ReturnType<typeof convexTest>

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
  t = convexTest(schema, component.modules)
  resendComponent.register(t, 'resend')
  migrationsComponent.register(t, 'migrations')
})

afterEach(() => {
  vi.useRealTimers()
})

/** Start the series and run every batch it schedules. */
async function runAll() {
  const started = await t.mutation(internal.migrations.run, {})
  await t.finishAllScheduledFunctions(() => vi.runAllTimers())
  return started
}

const status = () => t.query(internal.migrations.status, {})

/** A user as an app on 0.1 left it: no workspace. */
function user(name: string, extra: { banned?: boolean, banExpires?: number } = {}) {
  return t.run(ctx => ctx.db.insert('user', { name, email: `${name.toLowerCase()}@example.com`, emailVerified: true, createdAt: 0, updatedAt: 0, ...extra })) as Promise<string>
}

/** A session of a user, live for a day unless `expiresAt` says otherwise. */
function session(userId: string, extra: { expiresAt?: number, activeOrganizationId?: string } = {}) {
  return t.run(ctx => ctx.db.insert('session', { expiresAt: Date.now() + DAY, token: `token-${Math.random()}`, createdAt: 0, updatedAt: 0, userId, ...extra })) as Promise<string>
}

const rows = <T extends 'organization' | 'member' | 'session'>(table: T) => t.run(ctx => ctx.db.query(table).collect())

describe('the package migrations', () => {
  test('are the registry\'s, defined in its order, each a migration of its table', async () => {
    expect(PACKAGE_MIGRATIONS.map(migration => migration.name).filter(name => !(name in definitions))).toEqual([])
    expect((await status()).map(({ name, state, processed }) => ({ name, state, processed })))
      .toEqual(PACKAGE_MIGRATIONS.map(({ name }) => ({ name, state: 'pending', processed: 0 })))
  })

  test('give a signed-in user without a workspace the personal one a sign-in makes, and activate it on their live sessions', async () => {
    const ada = await user('Ada')
    const live = await session(ada)
    const expired = await session(ada, { expiresAt: Date.now() - DAY })
    // Not signed in: their next sign-in asks the app's gate, which a migration cannot.
    const away = await user('Away')
    await session(away, { expiresAt: Date.now() - DAY })
    await user('Never')

    await runAll()

    const organizations = await rows('organization')
    expect(organizations).toEqual([expect.objectContaining({ name: 'Ada\'s workspace', slug: `personal-${ada.toLowerCase()}` })])
    const workspace = organizations[0]!._id
    expect(await rows('member')).toEqual([expect.objectContaining({ organizationId: workspace, userId: ada, role: 'owner' })])
    const sessions = new Map((await rows('session')).map(row => [row._id, row]))
    expect(sessions.get(live as never)?.activeOrganizationId).toBe(workspace)
    // An expired session is the maintenance cron's to delete, not to activate.
    expect(sessions.get(expired as never)?.activeOrganizationId).toBeUndefined()
    expect((await status()).map(({ name, state }) => ({ name, state }))).toEqual(PACKAGE_MIGRATIONS.map(({ name }) => ({ name, state: 'done' })))
  })

  test('leave a user with a workspace, and a session with one active, as they are', async () => {
    const bob = await user('Bob')
    const shared = await t.run(ctx => ctx.db.insert('organization', { name: 'Shared', slug: 'shared', createdAt: 0 }))
    const other = await t.run(ctx => ctx.db.insert('organization', { name: 'Other', slug: 'other', createdAt: 0 }))
    await t.run(ctx => ctx.db.insert('member', { organizationId: shared, userId: bob, role: 'member', createdAt: 0 }))
    const unset = await session(bob)
    const chosen = await session(bob, { activeOrganizationId: other })

    await runAll()

    expect((await rows('organization')).map(row => row.slug).sort()).toEqual(['other', 'shared'])
    const sessions = new Map((await rows('session')).map(row => [row._id, row]))
    expect(sessions.get(unset as never)?.activeOrganizationId).toBe(shared)
    expect(sessions.get(chosen as never)?.activeOrganizationId).toBe(other)
  })

  test('take back an empty personal workspace, and give a fresh slug beside one others hold', async () => {
    const ada = await user('Ada')
    const bob = await user('Bob')
    await session(ada)
    await session(bob)
    const empty = await t.run(ctx => ctx.db.insert('organization', { name: 'Ada\'s workspace', slug: `personal-${ada.toLowerCase()}`, createdAt: 0 }))
    const held = await t.run(ctx => ctx.db.insert('organization', { name: 'Bob\'s workspace', slug: `personal-${bob.toLowerCase()}`, createdAt: 0 }))
    const carol = await user('Carol')
    await t.run(ctx => ctx.db.insert('member', { organizationId: held, userId: carol, role: 'owner', createdAt: 0 }))

    await runAll()

    const members = await rows('member')
    expect(members.find(row => row.userId === ada)?.organizationId).toBe(empty)
    const bobs = members.find(row => row.userId === bob)?.organizationId
    expect(bobs).not.toBe(held)
    const organizations = await rows('organization')
    expect(organizations.find(row => row._id === bobs)?.slug).toMatch(new RegExp(`^personal-${bob.toLowerCase()}-[0-9a-f]{8}$`))
  })

  test('leave a banned user to their first sign-in once the ban ends', async () => {
    await session(await user('Mallory', { banned: true }))
    const lapsed = await user('Eve', { banned: true, banExpires: Date.now() - DAY })
    await session(lapsed)

    await runAll()

    expect((await rows('member')).map(row => row.userId)).toEqual([lapsed])
  })

  test('resume one that was canceled, when run again', async () => {
    // More users than a batch, so the first migration is still going when it is canceled.
    const users = await Promise.all(Array.from({ length: 120 }, (_, index) => user(`User${index}`)))
    await Promise.all(users.map(id => session(id)))
    await t.mutation(internal.migrations.run, {})
    const migrationsLib = (componentsGeneric() as unknown as { migrations: { lib: { cancel: FunctionReference<'mutation', 'internal'> } } }).migrations.lib
    await t.mutation(migrationsLib.cancel, { name: 'migrations:personalWorkspaces' })
    expect((await status())[0]).toMatchObject({ name: 'personalWorkspaces', state: 'failed', error: 'canceled' })

    await runAll()

    expect((await status()).map(({ state }) => state)).toEqual(PACKAGE_MIGRATIONS.map(() => 'done'))
    expect(new Set((await rows('member')).map(row => row.userId))).toEqual(new Set(users))
  })

  test('start again from the first unfinished one, so what they report is that one\'s retry', async () => {
    const users = await Promise.all(Array.from({ length: 120 }, (_, index) => user(`User${index}`)))
    await Promise.all(users.map(id => session(id)))
    await t.mutation(internal.migrations.run, {})
    // Batch by batch, until the first is done and the second is going.
    for (let step = 0; step < 20 && (await status())[1]!.state !== 'running'; step++) {
      vi.runOnlyPendingTimers()
      await t.finishInProgressScheduledFunctions()
    }
    const migrationsLib = (componentsGeneric() as unknown as { migrations: { lib: { cancel: FunctionReference<'mutation', 'internal'> } } }).migrations.lib
    await t.mutation(migrationsLib.cancel, { name: 'migrations:activeWorkspaces' })
    expect((await status()).map(({ state }) => state)).toEqual(['done', 'failed'])

    // The retry's batch runs in `run` itself (the 20 sessions left fit one): a series begun at the
    // finished first one would only schedule it, and report it failed still.
    expect((await t.mutation(internal.migrations.run, {})).map(({ state }) => state)).toEqual(['done', 'done'])
  })

  test('change nothing when run again', async () => {
    const ada = await user('Ada')
    await session(ada)
    await runAll()
    const before = { organizations: await rows('organization'), members: await rows('member'), sessions: await rows('session') }

    const again = await runAll()

    expect(again.map(({ state }) => state)).toEqual(PACKAGE_MIGRATIONS.map(() => 'done'))
    expect({ organizations: await rows('organization'), members: await rows('member'), sessions: await rows('session') }).toEqual(before)
  })
})

describe('register(t)', () => {
  test('mounts the package migrations beneath the component, at <name>/migrations', async () => {
    // As the app mounts it: the component under its name, both children beneath it.
    const app = convexTest(schema, component.modules)
    component.register(app as never, 'backend')
    const backend = (componentsGeneric() as unknown as { backend: { migrations: { status: FunctionReference<'query', 'internal'> } } }).backend
    expect((await app.query(backend.migrations.status, {})).map(({ name }: { name: string }) => name)).toEqual(PACKAGE_MIGRATIONS.map(({ name }) => name))
  })
})
