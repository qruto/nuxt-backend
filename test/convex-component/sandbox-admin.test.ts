/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { actionGeneric, componentsGeneric, defineSchema, makeFunctionReference, mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { getBackendError } from '../../src/convex/errors'
import { type AdminUserPage, setupAdmin } from '../../src/convex/integrations/admin'
import { createFunctions } from '../../src/convex/integrations/functions'

// A sandbox deployment is a public demo whose dev inbox anyone may read: an
// administrator there must be passkey-only and signed in to this session with
// a passkey, so a sign-in code read from that inbox never reaches the admin
// tier or the admin console — not even through a session the code opened
// before the account turned passkey-only. Every other
// deployment lets any administrator in.

const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
const admin = setupAdmin(components as never)
const tiers = createFunctions({ query: queryGeneric, mutation: mutationGeneric, action: actionGeneric }, { components: components as never })

const whoAmI = tiers.admin.query({ args: {}, handler: async ctx => ctx.user.id })
const touch = tiers.admin.mutation({ args: { note: v.string() }, handler: async ctx => ctx.user.id })

const testApp = defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './admin.js': () => Promise.resolve(admin.api),
  './tiers.js': () => Promise.resolve({ whoAmI, touch }),
})

const listUsers = makeFunctionReference<'query', Record<string, unknown>, AdminUserPage | null>('admin:listUsers')
const getFunnel = makeFunctionReference<'query', { weeks: number, until?: number }, unknown>('admin:getFunnel')
const whoAmIRef = makeFunctionReference<'query', Record<string, never>, string>('tiers:whoAmI')
const touchRef = makeFunctionReference<'mutation', { note: string }, string>('tiers:touch')
const page = { numItems: 10, cursor: null }

let t: ReturnType<typeof testApp>

beforeEach(() => {
  t = testApp()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

/** The refusal a call threw, as the client reads it. */
async function refusal(call: Promise<unknown>) {
  const error = await call.then(() => null, (thrown: unknown) => thrown)
  return getBackendError(error)
}

describe('on a sandbox deployment', () => {
  beforeEach(() => {
    vi.stubEnv('BACKEND_ENVIRONMENT', 'sandbox')
  })

  test('the admin tier refuses an administrator who still signs in with codes', async () => {
    const root = await asUser(t, { role: 'admin', workspace: false })
    expect(await refusal(root.query(whoAmIRef, {}))).toMatchObject({ code: 'forbidden', data: { reason: 'passkey_only_admin' } })
    expect(await refusal(root.mutation(touchRef, { note: 'x' }))).toMatchObject({ code: 'forbidden', data: { reason: 'passkey_only_admin' } })
  })

  test('the admin tier refuses a passkey-only administrator whose session a code opened', async () => {
    const root = await asUser(t, { role: 'admin', workspace: false, passkeyOnly: true, signInMethod: 'email-otp' })
    expect(await refusal(root.query(whoAmIRef, {}))).toMatchObject({ code: 'forbidden', data: { reason: 'passkey_only_admin' } })
    expect(await refusal(root.mutation(touchRef, { note: 'x' }))).toMatchObject({ code: 'forbidden', data: { reason: 'passkey_only_admin' } })
    expect(await root.query(listUsers, { paginationOpts: page })).toBeNull()
    expect(await refusal(root.query(getFunnel, { weeks: 4, until: Date.now() }))).toMatchObject({ code: 'forbidden', data: { reason: 'passkey_only_admin' } })
  })

  test('the admin tier lets a passkey-only administrator in', async () => {
    const root = await asUser(t, { role: 'admin', workspace: false, passkeyOnly: true, signInMethod: 'passkey' })
    expect(await root.query(whoAmIRef, {})).toBe(root.userId)
    expect(await root.mutation(touchRef, { note: 'x' })).toBe(root.userId)
  })

  test('the console\'s reads answer nothing to an administrator who is not passkey-only, and refuse where they throw', async () => {
    const root = await asUser(t, { role: 'admin', workspace: false })
    expect(await root.query(listUsers, { paginationOpts: page })).toBeNull()
    expect(await refusal(root.query(getFunnel, { weeks: 4, until: Date.now() }))).toMatchObject({ code: 'forbidden', data: { reason: 'passkey_only_admin' } })

    const keyed = await asUser(t, { role: 'admin', workspace: false, passkeyOnly: true, signInMethod: 'passkey' })
    expect((await keyed.query(listUsers, { paginationOpts: page }))?.page.length).toBe(2)
  })

  test('someone with no admin role is refused as before', async () => {
    const ada = await asUser(t, { passkeyOnly: true })
    expect(await refusal(ada.query(whoAmIRef, {}))).toMatchObject({ code: 'forbidden', data: { reason: 'role' } })
    expect(await refusal(ada.query(getFunnel, { weeks: 4, until: Date.now() }))).toMatchObject({ code: 'forbidden', data: { reason: 'admin_only' } })
  })
})

describe('on every other deployment', () => {
  test.each(['development', 'preview', 'production', ''])('an administrator who signs in with codes is let in (%s)', async (environment) => {
    vi.stubEnv('BACKEND_ENVIRONMENT', environment)
    const root = await asUser(t, { role: 'admin', workspace: false })
    expect(await root.query(whoAmIRef, {})).toBe(root.userId)
    expect(await root.query(listUsers, { paginationOpts: page })).not.toBeNull()
  })
})
