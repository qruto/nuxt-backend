/// <reference types="vite/client" />
import { describe, expect, test } from 'vitest'
import { componentsGeneric, defineSchema, makeFunctionReference, queryGeneric } from 'convex/server'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { setupAuth } from '../../src/convex/client'
import { setupEmail } from '../../src/convex/integrations/email'

// The signed-in account, as the scaffold's `getAuthUser` and an app's own
// `authComponent.safeGetAuthUser` read it: through the caller's session.

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

describe('getAuthUser', () => {
  test('the query clientApi() registers reads the session caller\'s account', async () => {
    const t = testApp()
    const caller = await asUser(t, { email: 'ada@example.com' })
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

  test('a token that names no session reads as signed out', async () => {
    const t = testApp()
    const { userId } = await asUser(t)
    const stranger = t.withIdentity({ subject: userId, issuer: 'https://convex.test' })
    await expect(stranger.query(safeUserRef, {})).resolves.toBeNull()
  })
})

describe('getHeaders', () => {
  test('carries a session caller\'s token and nothing for a token with no session', async () => {
    const t = testApp()
    await expect((await asUser(t)).query(headersRef, {})).resolves.toEqual(['authorization'])
    const { userId } = await asUser(t)
    await expect(t.withIdentity({ subject: userId, issuer: 'https://convex.test' }).query(headersRef, {})).resolves.toEqual([])
  })
})
