/// <reference types="vite/client" />
import { beforeEach, describe, expect, test } from 'vitest'
import { componentsGeneric, defineSchema, makeFunctionReference, mutationGeneric } from 'convex/server'
import { v } from 'convex/values'
import presenceTest from '@convex-dev/presence/test'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import { setupPresence } from '../../src/convex/integrations/presence'

// Who is here, behind the backend's sign-in: a heartbeat counts the signed-in
// account, the room may refuse it, and the room lists its people by name.

const components = componentsGeneric() as never
const open = setupPresence(components)
const guarded = setupPresence(components, {
  canJoin: ({ roomId, claims }) => !roomId.startsWith('workspace:') || roomId === `workspace:${String(claims.activeOrganizationId)}`,
})

const small = setupPresence(components, { limit: 1 })

const testApp = defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './presence.js': () => Promise.resolve({ list: open.list, heartbeat: open.heartbeat, disconnect: open.disconnect }),
  './guarded.js': () => Promise.resolve({ heartbeat: guarded.heartbeat }),
  './small.js': () => Promise.resolve({ list: small.list }),
  './rooms.js': () => Promise.resolve({ remove: mutationGeneric({ args: { roomId: v.string(), userId: v.string() }, handler: (ctx, { roomId, userId }) => open.presence.removeRoomUser(ctx, roomId, userId) }) }),
}, { mounts: { presence: presenceTest } })

const refs = {
  list: makeFunctionReference<'query', { roomToken: string }, Array<{ userId: string, online: boolean, name?: string }>>('presence:list'),
  heartbeat: makeFunctionReference<'mutation', { roomId: string, userId: string, sessionId: string, interval: number }, { roomToken: string, sessionToken: string }>('presence:heartbeat'),
  disconnect: makeFunctionReference<'mutation', { sessionToken: string }>('presence:disconnect'),
  small: makeFunctionReference<'query', { roomToken: string }, Array<{ userId: string }>>('small:list'),
  remove: makeFunctionReference<'mutation', { roomId: string, userId: string }>('rooms:remove'),
  guarded: makeFunctionReference<'mutation', { roomId: string, userId: string, sessionId: string, interval: number }, { roomToken: string, sessionToken: string }>('guarded:heartbeat'),
}

let t: ReturnType<typeof testApp>
beforeEach(() => {
  t = testApp()
})

describe('presence behind the sign-in', () => {
  test('lists who joined a room, by name', async () => {
    const ada = await asUser(t, { name: 'Ada' })
    const grace = await asUser(t, { name: 'Grace' })
    const first = await ada.mutation(refs.heartbeat, { roomId: 'doc:1', userId: ada.userId, sessionId: 'tab-a', interval: 10_000 })
    await grace.mutation(refs.heartbeat, { roomId: 'doc:1', userId: grace.userId, sessionId: 'tab-g', interval: 10_000 })
    const people = await ada.query(refs.list, { roomToken: first.roomToken })
    expect(people.map(({ userId, online, name }) => ({ userId, online, name })).sort((a, b) => a.name!.localeCompare(b.name!))).toEqual([
      { userId: ada.userId, online: true, name: 'Ada' },
      { userId: grace.userId, online: true, name: 'Grace' },
    ])
  })

  test('refuses a heartbeat signed out', async () => {
    await expect(t.mutation(refs.heartbeat, { roomId: 'doc:1', userId: 'someone', sessionId: 's', interval: 10_000 })).rejects.toThrow(/unauthenticated|sign in/i)
  })

  test('lists nobody to a token held signed out', async () => {
    const ada = await asUser(t, { name: 'Ada' })
    const { roomToken } = await ada.mutation(refs.heartbeat, { roomId: 'doc:1', userId: ada.userId, sessionId: 'tab-a', interval: 10_000 })
    await expect(t.query(refs.list, { roomToken })).rejects.toThrow(/unauthenticated|sign in/i)
  })

  test('refuses the room token to someone taken out of the room, and to someone never in it', async () => {
    const ada = await asUser(t, { name: 'Ada' })
    const grace = await asUser(t, { name: 'Grace' })
    const { roomToken } = await ada.mutation(refs.heartbeat, { roomId: 'doc:1', userId: ada.userId, sessionId: 'tab-a', interval: 10_000 })
    await grace.mutation(refs.heartbeat, { roomId: 'doc:1', userId: grace.userId, sessionId: 'tab-g', interval: 10_000 })
    await t.mutation(refs.remove, { roomId: 'doc:1', userId: grace.userId })
    await expect(grace.query(refs.list, { roomToken })).rejects.toThrow(/not in this room/)
    const stranger = await asUser(t)
    await expect(stranger.query(refs.list, { roomToken })).rejects.toThrow(/not in this room/)
    expect((await ada.query(refs.list, { roomToken })).map(person => person.userId)).toEqual([ada.userId])
  })

  test('finds the caller in a room fuller than the list', async () => {
    const ada = await asUser(t)
    const grace = await asUser(t)
    const { roomToken } = await ada.mutation(refs.heartbeat, { roomId: 'doc:1', userId: ada.userId, sessionId: 'a', interval: 10_000 })
    await grace.mutation(refs.heartbeat, { roomId: 'doc:1', userId: grace.userId, sessionId: 'g', interval: 10_000 })
    for (const person of [ada, grace]) expect(await person.query(refs.small, { roomToken })).toHaveLength(1)
    await expect((await asUser(t)).query(refs.small, { roomToken })).rejects.toThrow(/not in this room/)
  })

  test('counts the signed-in account only, never an id the browser names', async () => {
    const ada = await asUser(t)
    const grace = await asUser(t)
    await expect(ada.mutation(refs.heartbeat, { roomId: 'doc:1', userId: grace.userId, sessionId: 's', interval: 10_000 })).rejects.toThrow(/presence_user|signed-in account only/)
  })

  test('sends no heartbeat for an administrator acting as someone', async () => {
    const admin = await asUser(t, { role: 'admin' })
    const visited = await asUser(t, { impersonatedBy: admin.userId })
    await expect(visited.mutation(refs.heartbeat, { roomId: 'doc:1', userId: visited.userId, sessionId: 's', interval: 10_000 })).rejects.toThrow(/impersonating|acting as/)
  })

  test('lets a room refuse an account', async () => {
    const ada = await asUser(t, { workspace: true })
    await expect(ada.mutation(refs.guarded, { roomId: 'workspace:elsewhere', userId: ada.userId, sessionId: 's', interval: 10_000 })).rejects.toThrow(/does not let this account in/)
    const own = await ada.mutation(refs.guarded, { roomId: `workspace:${ada.workspaceId}`, userId: ada.userId, sessionId: 's', interval: 10_000 })
    expect(own.roomToken).toEqual(expect.any(String))
  })

  test('refuses a room id it cannot keep', async () => {
    const ada = await asUser(t)
    await expect(ada.mutation(refs.heartbeat, { roomId: '', userId: ada.userId, sessionId: 's', interval: 10_000 })).rejects.toThrow(/room id/)
    await expect(ada.mutation(refs.heartbeat, { roomId: 'x'.repeat(257), userId: ada.userId, sessionId: 's', interval: 10_000 })).rejects.toThrow(/room id/)
  })

  test('shows someone who left as offline, with no sign-in needed to leave', async () => {
    const ada = await asUser(t, { name: 'Ada' })
    const grace = await asUser(t, { name: 'Grace' })
    const mine = await ada.mutation(refs.heartbeat, { roomId: 'doc:2', userId: ada.userId, sessionId: 'a', interval: 10_000 })
    const theirs = await grace.mutation(refs.heartbeat, { roomId: 'doc:2', userId: grace.userId, sessionId: 'g', interval: 10_000 })
    // The unload beacon carries no token.
    await t.mutation(refs.disconnect, { sessionToken: theirs.sessionToken })
    const people = await ada.query(refs.list, { roomToken: mine.roomToken })
    expect(people.find(person => person.userId === grace.userId)).toMatchObject({ online: false, name: 'Grace' })
    // Someone who left still reads the room they were in.
    expect(await grace.query(refs.list, { roomToken: theirs.roomToken })).toHaveLength(2)
  })

  test('takes a limit from 1 to 200 only', () => {
    expect(() => setupPresence(components, { limit: 0 })).toThrow(/limit/)
    expect(() => setupPresence(components, { limit: 201 })).toThrow(/limit/)
  })
})
