/// <reference types="vite/client" />
import { describe, expect, test } from 'vitest'
import { componentsGeneric, defineSchema, makeFunctionReference, queryGeneric } from 'convex/server'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { setupAuth } from '../../src/convex/client'
import { setupEmail } from '../../src/convex/integrations/email'

// The signed-in account, as the scaffold's `getAuthUser` and an app's own
// `authComponent.safeGetAuthUser` read it: a session caller through its
// session, an agent through its token's subject. Agent tokens belong to no
// session, and a session lookup without an id used to throw for every agent.

const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
const { getAuthUser, authComponent } = setupAuth(components as never, queryGeneric, { email: setupEmail(components as never) })
const safeUser = queryGeneric({ args: {}, handler: async ctx => (await authComponent.safeGetAuthUser(ctx as never)) ?? null })
const headers = queryGeneric({ args: {}, handler: async ctx => [...(await authComponent.getHeaders(ctx as never)).keys()] })

const testApp = defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './auth.js': () => Promise.resolve({ getAuthUser, safeUser, headers, clientUser: authComponent.clientApi().getAuthUser }),
})
const getAuthUserRef = makeFunctionReference<'query'>('auth:getAuthUser')
const safeUserRef = makeFunctionReference<'query'>('auth:safeUser')
const headersRef = makeFunctionReference<'query'>('auth:headers')
const clientUserRef = makeFunctionReference<'query'>('auth:clientUser')
const agent = { clientId: 'client-1', scopes: ['profile:read'] }

async function update(t: ReturnType<typeof testApp>, model: string, id: string, data: Record<string, unknown>) {
  await t.mutation(components.backend.adapter.updateOne, { input: { model, where: [{ field: '_id', value: id }], update: data } } as never)
}

describe('getAuthUser', () => {
  test('reads an agent\'s account through its token\'s subject', async () => {
    const t = testApp()
    const caller = await asUser(t, { email: 'ada@example.com', agent })
    await expect(caller.query(getAuthUserRef, {})).resolves.toMatchObject({ _id: caller.userId, email: 'ada@example.com' })
    await expect(caller.query(safeUserRef, {})).resolves.toMatchObject({ _id: caller.userId })
  })

  test('the query clientApi() registers reads an agent\'s account too', async () => {
    const t = testApp()
    const caller = await asUser(t, { email: 'ada@example.com', agent })
    await expect(caller.query(clientUserRef, {})).resolves.toMatchObject({ _id: caller.userId, email: 'ada@example.com' })
  })

  test('reads a session caller\'s account through the session', async () => {
    const t = testApp()
    const caller = await asUser(t, { email: 'ada@example.com' })
    await expect(caller.query(getAuthUserRef, {})).resolves.toMatchObject({ _id: caller.userId, email: 'ada@example.com' })
  })

  test('a session caller whose session ended reads as signed out', async () => {
    const t = testApp()
    const caller = await asUser(t)
    await t.mutation(components.backend.adapter.deleteOne, { input: { model: 'session', where: [{ field: '_id', value: caller.sessionId }] } } as never)
    await expect(caller.query(getAuthUserRef, {})).rejects.toThrow('Unauthenticated')
    await expect(caller.query(safeUserRef, {})).resolves.toBeNull()
  })

  test('an agent of a banned or deleted account reads as signed out', async () => {
    const t = testApp()
    const banned = await asUser(t, { agent })
    await update(t, 'user', banned.userId, { banned: true })
    await expect(banned.query(getAuthUserRef, {})).rejects.toThrow('Unauthenticated')

    const deleted = await asUser(t, { agent })
    await t.mutation(components.backend.adapter.deleteOne, { input: { model: 'user', where: [{ field: '_id', value: deleted.userId }] } } as never)
    await expect(deleted.query(safeUserRef, {})).resolves.toBeNull()
  })

  test('a token with neither a session nor an agent client reads as signed out', async () => {
    const t = testApp()
    const { userId } = await asUser(t)
    const stranger = t.withIdentity({ subject: userId, issuer: 'https://convex.test' })
    await expect(stranger.query(safeUserRef, {})).resolves.toBeNull()
  })
})

describe('getHeaders', () => {
  test('carries a session caller\'s token and nothing for an agent, which has no session', async () => {
    const t = testApp()
    await expect((await asUser(t)).query(headersRef, {})).resolves.toEqual(['authorization'])
    await expect((await asUser(t, { agent })).query(headersRef, {})).resolves.toEqual([])
  })
})
