/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, makeFunctionReference } from 'convex/server'
import { asUser, defineBackendTestApp, seedWorkspace } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { type AdminUserDetail, type AdminUserPage, type AdminWorkspaceDetail, type AdminWorkspacePage, setupAdmin } from '../../src/convex/integrations/admin'

// The admin console's reads over the mounted component: every account and
// every workspace for an administrator whose role is read fresh, and `null`
// for every other caller and an impersonated session included.
// Who gets through is also held by the probe suite
// (authorization-probes.test.ts), through the scaffold's backend/admin.ts.

const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
const admin = setupAdmin(components as never)
const custom = setupAdmin(components as never, { adminRoles: ['support'] })
// The admin plugin's adminUserIds, as an app gives them to both.
const NAMED_ID = 'named-administrator'
const named = setupAdmin(components as never, { adminUserIds: [NAMED_ID] })

const testApp = defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './admin.js': () => Promise.resolve(admin.api),
  './support.js': () => Promise.resolve({ listUsers: custom.api.listUsers }),
  './named.js': () => Promise.resolve(named.api),
})
type App = ReturnType<typeof testApp>

const listUsers = makeFunctionReference<'query', Record<string, unknown>, AdminUserPage | null>('admin:listUsers')
const getUser = makeFunctionReference<'query', Record<string, unknown>, AdminUserDetail | null>('admin:getUser')
const listWorkspaces = makeFunctionReference<'query', Record<string, unknown>, AdminWorkspacePage | null>('admin:listWorkspaces')
const getWorkspace = makeFunctionReference<'query', Record<string, unknown>, AdminWorkspaceDetail | null>('admin:getWorkspace')
const page = (numItems = 20, cursor: string | null = null) => ({ numItems, cursor })

let t: App

beforeEach(() => {
  t = testApp()
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** Write a field of an account, as an admin route would. */
async function update(userId: string, update: Record<string, unknown>) {
  await t.mutation(components.backend.adapter.updateOne, { input: { model: 'user', where: [{ field: '_id', value: userId }], update } } as never)
}

describe('listUsers', () => {
  test('lists every account, newest first, and searches by address', async () => {
    const root = await asUser(t, { role: 'admin', email: 'root@example.com', workspace: false })
    await asUser(t, { email: 'ada@example.com' })
    await asUser(t, { email: 'grace@example.com' })
    const all = await root.query(listUsers, { paginationOpts: page() })
    expect(all?.page.map(user => user.email)).toEqual(['grace@example.com', 'ada@example.com', 'root@example.com'])
    expect(all?.page.at(-1)).toMatchObject({ role: 'admin', administrator: true, banned: false, banReason: null })
    const found = await root.query(listUsers, { search: '  ADA ', paginationOpts: page() })
    expect(found?.page.map(user => user.email)).toEqual(['ada@example.com'])
  })

  test('pages by cursor', async () => {
    const root = await asUser(t, { role: 'admin', email: 'root@example.com', workspace: false })
    for (const name of ['a', 'b', 'c']) await asUser(t, { email: `${name}@example.com`, workspace: false })
    const first = await root.query(listUsers, { paginationOpts: page(2) })
    expect(first?.page.map(user => user.email)).toEqual(['c@example.com', 'b@example.com'])
    expect(first?.isDone).toBe(false)
    const second = await root.query(listUsers, { paginationOpts: page(2, first!.continueCursor) })
    expect(second?.page.map(user => user.email)).toEqual(['a@example.com', 'root@example.com'])
  })

  test('shows a ban with its reason and end', async () => {
    const root = await asUser(t, { role: 'admin', workspace: false })
    const ada = await asUser(t, { email: 'ada@example.com' })
    await update(ada.userId, { banned: true, banReason: 'Spam', banExpires: 1_900_000_000_000 })
    const { page: [row] } = (await root.query(listUsers, { search: 'ada', paginationOpts: page() }))!
    expect(row).toMatchObject({ banned: true, banReason: 'Spam', banExpires: 1_900_000_000_000 })
  })

  test('answers null to anyone who is not an administrator now', async () => {
    const member = await asUser(t)
    const visit = await asUser(t, { role: 'admin', impersonatedBy: 'someone' })
    const demoted = await asUser(t, { role: 'admin' })
    await update(demoted.userId, { role: 'user' })
    const banned = await asUser(t, { role: 'admin' })
    await update(banned.userId, { banned: true })
    for (const caller of [t, member, visit, demoted, banned]) {
      expect(await caller.query(listUsers, { paginationOpts: page() })).toBeNull()
    }
  })

  test('reads the app\'s own administrator roles, comma-separated roles included', async () => {
    const support = await asUser(t, { role: 'editor, support' })
    const admin = await asUser(t, { role: 'admin' })
    expect(await support.query(makeFunctionReference<'query'>('support:listUsers'), { paginationOpts: page() })).not.toBeNull()
    expect(await admin.query(makeFunctionReference<'query'>('support:listUsers'), { paginationOpts: page() })).toBeNull()
  })
})

describe('getUser', () => {
  test('reads an account with its workspaces and sessions, never a token', async () => {
    const root = await asUser(t, { role: 'admin', workspace: false })
    const ada = await asUser(t, { email: 'ada@example.com' })
    const team = await seedWorkspace(t, { name: 'Acme' })
    await asUser(t, { email: 'grace@example.com', workspace: team, workspaceRole: 'owner' })
    await t.mutation(components.backend.adapter.create, { input: { model: 'member', data: { organizationId: team, userId: ada.userId, role: 'admin', createdAt: Date.now() } } } as never)
    await t.mutation(components.backend.adapter.create, { input: { model: 'session', data: { userId: ada.userId, token: 'visit-token', createdAt: Date.now(), updatedAt: Date.now(), expiresAt: Date.now() + 1_000, impersonatedBy: root.userId } } } as never)
    const detail = await root.query(getUser, { userId: ada.userId })
    expect(detail?.user).toMatchObject({ id: ada.userId, email: 'ada@example.com', role: 'user', administrator: false })
    expect(detail?.workspaces.map(workspace => [workspace.name, workspace.role])).toEqual([[expect.stringContaining('workspace'), 'owner'], ['Acme', 'admin']])
    expect(detail?.sessions).toHaveLength(2)
    expect(detail?.sessions.filter(session => session.impersonated)).toHaveLength(1)
    expect(JSON.stringify(detail)).not.toContain('token')
  })

  test('answers null for an account that does not exist, and for an id of another table', async () => {
    const root = await asUser(t, { role: 'admin' })
    const ada = await asUser(t, { email: 'ada@example.com' })
    const invitation = await t.mutation(components.backend.adapter.create, { input: { model: 'invitation', data: { organizationId: root.workspaceId!, email: 'new@example.com', role: 'admin', status: 'pending', expiresAt: 1, createdAt: 1, inviterId: root.userId } } } as never) as { _id: string }
    const session = await t.mutation(components.backend.adapter.create, { input: { model: 'session', data: { userId: ada.userId, token: 'a-token', createdAt: 1, updatedAt: 1, expiresAt: 2 } } } as never) as { _id: string }
    const member = await t.mutation(components.backend.adapter.create, { input: { model: 'member', data: { organizationId: root.workspaceId!, userId: ada.userId, role: 'member', createdAt: 1 } } } as never) as { _id: string }
    expect(await root.query(getUser, { userId: 'nobody' })).toBeNull()
    // An invitation carries an email, as an account does; a member and a session carry a user id.
    for (const userId of [root.workspaceId!, invitation._id, session._id, member._id]) {
      expect(await root.query(getUser, { userId })).toBeNull()
    }
    for (const workspaceId of [ada.userId, invitation._id, member._id]) {
      expect(await root.query(getWorkspace, { workspaceId })).toBeNull()
    }
  })

  test('says when an account has more sessions than it lists', async () => {
    const root = await asUser(t, { role: 'admin', workspace: false })
    const ada = await asUser(t, { email: 'ada@example.com' })
    expect((await root.query(getUser, { userId: ada.userId }))?.truncated).toBe(false)
    for (let index = 0; index < 101; index++) {
      await t.mutation(components.backend.adapter.create, { input: { model: 'session', data: { userId: ada.userId, token: `token-${index}`, createdAt: index, updatedAt: index, expiresAt: index + 1 } } } as never)
    }
    const detail = await root.query(getUser, { userId: ada.userId })
    expect(detail?.sessions).toHaveLength(100)
    expect(detail?.truncated).toBe(true)
  })

  test('answers null to anyone who is not an administrator', async () => {
    const ada = await asUser(t)
    expect(await ada.query(getUser, { userId: ada.userId })).toBeNull()
  })
})

describe('workspaces', () => {
  test('lists every workspace, searches by name, and reads one with its members and open invitations', async () => {
    const root = await asUser(t, { role: 'admin', workspace: false })
    const team = await seedWorkspace(t, { name: 'Acme' })
    const owner = await asUser(t, { email: 'grace@example.com', name: 'Grace', workspace: team, workspaceRole: 'owner' })
    const other = await asUser(t, { role: 'admin', email: 'helper@example.com', workspace: team, workspaceRole: 'member' })
    await t.mutation(components.backend.adapter.create, { input: { model: 'invitation', data: { organizationId: team, email: 'new@example.com', role: 'member', status: 'pending', expiresAt: 1, createdAt: 1, inviterId: owner.userId } } } as never)
    await t.mutation(components.backend.adapter.create, { input: { model: 'invitation', data: { organizationId: team, email: 'old@example.com', role: 'member', status: 'accepted', expiresAt: 1, createdAt: 1, inviterId: owner.userId } } } as never)

    const listed = await root.query(listWorkspaces, { paginationOpts: page() })
    expect(listed?.page.map(workspace => workspace.name)).toContain('Acme')
    const found = await root.query(listWorkspaces, { search: 'Acm', paginationOpts: page() })
    expect(found?.page.map(workspace => workspace.id)).toEqual([team])

    const detail = await root.query(getWorkspace, { workspaceId: team })
    expect(detail?.workspace).toMatchObject({ id: team, name: 'Acme' })
    expect(detail?.members).toEqual([
      expect.objectContaining({ userId: owner.userId, email: 'grace@example.com', role: 'owner', administrator: false }),
      expect.objectContaining({ userId: other.userId, role: 'member', administrator: true }),
    ])
    expect(detail?.invitations).toEqual([expect.objectContaining({ email: 'new@example.com', role: 'member' })])
  })

  test('counts an account the admin plugin names by id as an administrator', async () => {
    const root = await asUser(t, { role: 'admin', workspace: false })
    const team = await seedWorkspace(t, { name: 'Acme' })
    await t.mutation(components.backend.adapter.create, { input: { model: 'member', data: { organizationId: team, userId: NAMED_ID, role: 'member', createdAt: 1 } } } as never)
    const detail = await root.query(makeFunctionReference<'query', Record<string, unknown>, AdminWorkspaceDetail | null>('named:getWorkspace'), { workspaceId: team })
    expect(detail?.members).toEqual([expect.objectContaining({ userId: NAMED_ID, administrator: true })])
    expect(detail?.truncated).toBe(false)
  })

  test('answer null to a workspace\'s own owner, who is no administrator', async () => {
    const owner = await asUser(t)
    expect(await owner.query(listWorkspaces, { paginationOpts: page() })).toBeNull()
    expect(await owner.query(getWorkspace, { workspaceId: owner.workspaceId })).toBeNull()
  })
})
