/// <reference types="vite/client" />
import { afterEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, type FunctionReference, makeFunctionReference, queryGeneric } from 'convex/server'
import { asUser, defineBackendTestApp, seedWorkspace } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { setupEmail } from '../../src/convex/integrations/email'
import { createAuthorization } from '../../src/convex/integrations/authorization'
import { setupBilling } from '../../src/convex/integrations/billing'

// nuxt-backend/test as an app uses it: the app's functions over every
// component the scaffold mounts, and callers who carry the claims a real
// session token carries.

const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
const whoami = queryGeneric({ args: {}, handler: async ctx => await ctx.auth.getUserIdentity() })
const email = setupEmail(components as never)
// What app functions gate on: the membership the authorization helpers read,
// and the entity billing charges.
const { requireMember } = createAuthorization(components as never)
const billing = setupBilling(components as never, { email })
const membership = queryGeneric({ args: {}, handler: async ctx => await requireMember(ctx as never) })
const billingEntity = queryGeneric({ args: {}, handler: async ctx => await billing.resolveEntity(ctx) })
const testApp = defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './whoami.js': () => Promise.resolve({ whoami, membership, billingEntity }),
})
const whoamiRef = makeFunctionReference<'query'>('whoami:whoami')
const membershipRef = makeFunctionReference<'query'>('whoami:membership')
const billingEntityRef = makeFunctionReference<'query'>('whoami:billingEntity')

afterEach(() => {
  vi.unstubAllEnvs()
})

async function rows(t: ReturnType<typeof testApp>, model: string) {
  const result = await t.query(components.backend.adapter.findMany, { model, paginationOpts: { numItems: 100, cursor: null } } as never) as { page: Array<Record<string, unknown>> }
  return result.page
}

describe('defineBackendTestApp', () => {
  test('mounts the components the scaffold mounts, under their names', async () => {
    const t = testApp()
    // A call into a component that is not registered throws.
    const limiter = (componentsGeneric() as unknown as { rateLimiter: { lib: { rateLimit: FunctionReference<'mutation', 'internal'> } } }).rateLimiter
    await expect(t.mutation(limiter.lib.rateLimit, { name: 'probe', config: { kind: 'token bucket', rate: 1, period: 1000 } } as never))
      .resolves.toMatchObject({ ok: true })
    await expect(rows(t, 'user')).resolves.toEqual([])
    // The workpool, the sharded counter and the action cache, as the
    // scaffold has mounted them since F14.
    const mounted = componentsGeneric() as unknown as {
      workpool: { lib: { statusBatch: FunctionReference<'query', 'internal'> } }
      shardedCounter: { public: { count: FunctionReference<'query', 'internal'> } }
      actionCache: { lib: { get: FunctionReference<'query', 'internal'> } }
    }
    await expect(t.query(mounted.workpool.lib.statusBatch, { ids: [] } as never)).resolves.toEqual([])
    await expect(t.query(mounted.shardedCounter.public.count, { name: 'probe' } as never)).resolves.toBe(0)
    await expect(t.query(mounted.actionCache.lib.get, { name: 'probe', args: {}, ttl: null } as never)).resolves.toEqual({ kind: 'miss' })
  })

  test('gives each call a fresh instance', async () => {
    await asUser(testApp())
    await expect(rows(testApp(), 'user')).resolves.toEqual([])
  })
})

describe('asUser', () => {
  test('with no options, signs in the way a real sign-in leaves a caller: the user role and an own personal workspace, active', async () => {
    const t = testApp()
    const ada = await asUser(t)
    expect(await ada.query(whoamiRef, {})).toMatchObject({ role: 'user', activeOrganizationId: ada.workspaceId, banned: false })
    expect(await ada.query(membershipRef, {})).toMatchObject({ workspaceId: ada.workspaceId, role: 'owner' })
    expect(await ada.query(billingEntityRef, {})).toEqual({ userId: ada.workspaceId, email: ada.email })
    expect(await rows(t, 'organization')).toEqual([expect.objectContaining({ _id: ada.workspaceId, slug: `personal-${ada.userId.toLowerCase()}` })])
    expect(await rows(t, 'user')).toEqual([expect.objectContaining({ _id: ada.userId, role: 'user' })])
  })

  test('with workspace: false, leaves the caller in none, as after leaving every workspace', async () => {
    const t = testApp()
    const loner = await asUser(t, { workspace: false })
    expect(loner.workspaceId).toBeUndefined()
    expect((await loner.query(whoamiRef, {}) as Record<string, unknown>).activeOrganizationId).toBeUndefined()
    await expect(loner.query(membershipRef, {})).rejects.toThrow()
    expect(await loner.query(billingEntityRef, {})).toBeNull()
    expect(await rows(t, 'organization')).toEqual([])
  })

  test('is issued by the site, as production tokens are, so tokenIdentifier matches', async () => {
    vi.stubEnv('CONVEX_SITE_URL', 'https://happy-otter-123.convex.site')
    const ada = await asUser(testApp())
    expect(await ada.query(whoamiRef, {})).toMatchObject({
      issuer: 'https://happy-otter-123.convex.site',
      tokenIdentifier: `https://happy-otter-123.convex.site|${ada.userId}`,
    })
  })

  test('signs in a session: the account, the session and its id in the identity', async () => {
    const t = testApp()
    const ada = await asUser(t, { email: 'Ada@Example.com', name: 'Ada' })
    expect(await ada.query(whoamiRef, {})).toMatchObject({ subject: ada.userId, sessionId: ada.sessionId, email: 'ada@example.com', name: 'Ada', emailVerified: true })
    expect(await rows(t, 'user')).toEqual([expect.objectContaining({ _id: ada.userId, email: 'ada@example.com' })])
    expect(await rows(t, 'session')).toEqual([expect.objectContaining({ _id: ada.sessionId, userId: ada.userId })])
  })

  test('carries the app-wide role, the active workspace and its membership', async () => {
    const t = testApp()
    const admin = await asUser(t, { role: 'admin', workspace: true })
    expect(await admin.query(whoamiRef, {})).toMatchObject({ role: 'admin', activeOrganizationId: admin.workspaceId })
    const shared = await seedWorkspace(t, { name: 'Acme' })
    const editor = await asUser(t, { workspace: shared, workspaceRole: 'admin' })
    expect(editor.workspaceId).toBe(shared)
    expect(await rows(t, 'member')).toEqual(expect.arrayContaining([
      expect.objectContaining({ organizationId: admin.workspaceId, userId: admin.userId, role: 'owner' }),
      expect.objectContaining({ organizationId: shared, userId: editor.userId, role: 'admin' }),
    ]))
  })

  test('puts several callers in one workspace, as the member table holds it', async () => {
    const t = testApp()
    const workspace = await seedWorkspace(t)
    const owner = await asUser(t, { workspace, workspaceRole: 'owner' })
    await asUser(t, { workspace })
    expect(await owner.query(membershipRef, {})).toMatchObject({ workspaceId: workspace, role: 'owner' })
    const members = (await rows(t, 'member')).filter(member => member.organizationId === workspace)
    expect(members.map(member => member.role).sort()).toEqual(['member', 'owner'])
  })

  test('marks a session an admin opened by impersonating the user', async () => {
    const t = testApp()
    const admin = await asUser(t, { role: 'admin' })
    const visited = await asUser(t, { impersonatedBy: admin.userId })
    expect(await visited.query(whoamiRef, {})).toMatchObject({ impersonatedBy: admin.userId })
    expect(await rows(t, 'session')).toEqual(expect.arrayContaining([expect.objectContaining({ _id: visited.sessionId, impersonatedBy: admin.userId })]))
  })
})
