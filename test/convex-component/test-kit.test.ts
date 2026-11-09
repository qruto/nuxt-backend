/// <reference types="vite/client" />
import { afterEach, describe, expect, test, vi } from 'vitest'
import { actionGeneric, componentsGeneric, defineSchema, type FunctionReference, makeFunctionReference, mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import workflow from '@convex-dev/workflow/test'
import { asUser, defineBackendTestApp, drain, fileExists, seedBilling, seedCredits, seedWorkspace, stubBillingProvider, stubStorageFetch, TEST_PNG, TEST_STORAGE_URL, TEST_UNSAFE_CODE, upload } from '../../src/convex/test'
import { setupAi } from '../../src/convex/integrations/ai'
import { setupStorage } from '../../src/convex/integrations/storage'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { setupEmail } from '../../src/convex/integrations/email'
import { createAuthorization } from '../../src/convex/integrations/authorization'
import { setupBilling } from '../../src/convex/integrations/billing'

// nuxt-backend/test as an app uses it: the app's functions over every
// component the scaffold mounts, callers who carry the claims a real
// session token carries, uploads, scheduled work run to the end, billing
// state as a sync leaves it, and storage URLs answered with no network.

const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
const whoami = queryGeneric({ args: {}, handler: async ctx => await ctx.auth.getUserIdentity() })
const email = setupEmail(components as never)
// What app functions gate on: the membership the authorization helpers read,
// and the entity billing charges.
const { requireMember } = createAuthorization(components as never)
const billing = setupBilling(components as never, { email })
const membership = queryGeneric({ args: {}, handler: async ctx => await requireMember(ctx as never) })
const billingEntity = queryGeneric({ args: {}, handler: async ctx => await billing.resolveEntity(ctx) })
const env = queryGeneric({ args: {}, handler: async () => ({ AUTH_SECRET: process.env.AUTH_SECRET, SITE_URL: process.env.SITE_URL, CONVEX_SITE_URL: process.env.CONVEX_SITE_URL }) })
const feature = queryGeneric({ args: { userId: v.string(), key: v.string() }, handler: async (ctx, { userId, key }) => billing.hasFeature(ctx, key, { userId }) })
// Storage as an app keeps a photo: an upload claimed, then checked and stripped in the background.
const storage = setupStorage(components as never)
const claim = mutationGeneric({
  args: { fileId: v.string() },
  handler: async (ctx, { fileId }) => {
    const identity = (await ctx.auth.getUserIdentity())!
    await storage.claim(ctx, fileId, { userId: identity.subject })
  },
})
const fileUrl = queryGeneric({ args: { fileId: v.string() }, handler: async (ctx, { fileId }) => storage.fileUrl(ctx, fileId) })
const download = actionGeneric({
  args: { url: v.string() },
  handler: async (_ctx, { url }) => {
    const response = await fetch(url)
    return { status: response.status, type: response.headers.get('content-type'), size: (await response.arrayBuffer()).byteLength }
  },
})
// A refund through the package's billing, to the billing provider's fake: a sum meter as `billing sync` writes it.
const metered = setupBilling(components as never, { email, accessToken: 'test-billing-token', catalog: { sandbox: { meters: { credits: { meterId: 'meter_credits', eventName: 'credits', property: 'amount' } } } } as never })
const refund = actionGeneric({
  args: { userId: v.string(), value: v.number(), externalId: v.string() },
  handler: async (ctx, { userId, value, externalId }) => metered.refundCredits(ctx as never, { userId, meter: 'credits', value, externalId }),
})
// The safety classifier an app's tests get by its id, reading text and an upload's bytes.
const ai = setupAi(components as never, { billing })
const classify = actionGeneric({
  args: { text: v.optional(v.string()), images: v.optional(v.array(v.string())) },
  handler: async (ctx, input) => (await ai.moderate(ctx, input)).codes,
})
const testApp = defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './whoami.js': () => Promise.resolve({ whoami, membership, billingEntity, env, feature }),
  './files.js': () => Promise.resolve({ claim, fileUrl, download }),
  './kit.js': () => Promise.resolve({ refund, classify }),
}, { mounts: { generation: workflow } })
const refundRef = makeFunctionReference<'action', { userId: string, value: number, externalId: string }, null>('kit:refund')
const classifyRef = makeFunctionReference<'action', { text?: string, images?: string[] }, string[]>('kit:classify')
const whoamiRef = makeFunctionReference<'query'>('whoami:whoami')
const membershipRef = makeFunctionReference<'query'>('whoami:membership')
const billingEntityRef = makeFunctionReference<'query'>('whoami:billingEntity')
const envRef = makeFunctionReference<'query', Record<string, never>, Record<string, string | undefined>>('whoami:env')
const featureRef = makeFunctionReference<'query', { userId: string, key: string }, boolean>('whoami:feature')
const claimRef = makeFunctionReference<'mutation', { fileId: string }>('files:claim')
const fileUrlRef = makeFunctionReference<'query', { fileId: string }, string | null>('files:fileUrl')
const downloadRef = makeFunctionReference<'action', { url: string }, { status: number, type: string | null, size: number }>('files:download')

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
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

  test('sets the deployment variables the test file left unset, and a stubbed one wins', async () => {
    vi.stubEnv('SITE_URL', 'https://panels.test')
    const values = await testApp().query(envRef, {})
    expect(values).toMatchObject({ SITE_URL: 'https://panels.test', CONVEX_SITE_URL: expect.stringMatching(/^https:/) })
    expect(values.AUTH_SECRET!.length).toBeGreaterThanOrEqual(32)
  })

  test('a variable stubbed to undefined stays unset, and unstubAllEnvs puts the default back', async () => {
    vi.stubEnv('SITE_URL', undefined)
    expect((await testApp().query(envRef, {})).SITE_URL).toBeUndefined()
    vi.unstubAllEnvs()
    expect((await testApp().query(envRef, {})).SITE_URL).toBe('https://app.test')
  })

  test('registers a component the app mounts under a name of its own', async () => {
    const t = testApp()
    const generation = (componentsGeneric() as unknown as { generation: { workflow: { list: FunctionReference<'query', 'internal'> } } }).generation
    await expect(t.query(generation.workflow.list, { order: 'desc', paginationOpts: { numItems: 1, cursor: null } } as never)).resolves.toMatchObject({ page: [] })
  })

  test('refuses a mount that is no test helper', () => {
    expect(() => defineBackendTestApp(defineSchema({}), {}, { mounts: { generation: {} as never } })).toThrow(/mounts\.generation/)
  })
})

describe('upload, drain and stubStorageFetch', () => {
  test('an upload is claimed, checked in the background, and served with its bytes', async () => {
    vi.useFakeTimers()
    const restore = stubStorageFetch()
    try {
      const t = testApp()
      const ada = await asUser(t)
      const fileId = await t.upload()
      await ada.mutation(claimRef, { fileId })
      // Checked in the background: no URL until the scheduled check ran.
      expect(await t.query(fileUrlRef, { fileId })).toBeNull()
      await drain(t, vi)
      const url = (await t.query(fileUrlRef, { fileId }))!
      expect(await t.action(downloadRef, { url })).toEqual({ status: 200, type: 'image/png', size: expect.any(Number) })
    }
    finally {
      restore()
    }
  })

  test('upload takes bytes, a Blob or text, as the standalone helper too', async () => {
    const t = testApp()
    const ids = [
      await upload(t, TEST_PNG),
      await t.upload(new Blob([TEST_PNG], { type: 'image/png' })),
      await t.upload('not a photo', { type: 'text/plain' }),
    ]
    expect(new Set(ids).size).toBe(3)
  })

  test('upload sends a Node Buffer\'s own bytes, not the pool it is a window on', async () => {
    const t = testApp()
    const buffer = Buffer.from(btoa(String.fromCharCode(...TEST_PNG)), 'base64')
    expect(buffer.buffer.byteLength).toBeGreaterThan(buffer.byteLength)
    const fileId = await t.upload(buffer)
    const stored = await t.action(components.backend.storage.bytes as unknown as FunctionReference<'action', 'internal'>, { storageId: fileId }) as ArrayBuffer
    expect(new Uint8Array(stored)).toEqual(TEST_PNG)
  })

  test('stubStorageFetch refuses any other request, unless network answers it, and puts fetch back', async () => {
    const original = globalThis.fetch
    const restore = stubStorageFetch()
    await expect(fetch('https://example.com/')).rejects.toThrow(/No network under test: GET https:\/\/example\.com\//)
    expect((await fetch('https://some-deployment.convex.cloud/api/storage/unknown')).status).toBe(404)
    restore()
    expect(globalThis.fetch).toBe(original)
    const answering = stubStorageFetch({ network: () => new Response('hi') })
    expect(await (await fetch('https://example.com/')).text()).toBe('hi')
    answering()
  })

  test('stubStorageFetch serves the latest instance\'s files only: a new instance forgets the earlier ones', async () => {
    const restore = stubStorageFetch()
    try {
      const urlOf = async (bytes: string) => TEST_STORAGE_URL + encodeURIComponent(btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bytes))))))
      await testApp().upload('first instance')
      expect((await fetch(await urlOf('first instance'))).status).toBe(200)
      await testApp().upload('second instance')
      expect((await fetch(await urlOf('first instance'))).status).toBe(404)
      expect(await (await fetch(await urlOf('second instance'))).text()).toBe('second instance')
    }
    finally {
      restore()
    }
  })

  test('drain refuses to run without fake timers', async () => {
    await expect(drain(testApp(), vi)).rejects.toThrow(/vi\.useFakeTimers/)
  })

  test('drain with until stops as soon as the condition holds, and throws when it never does', async () => {
    vi.useFakeTimers()
    const t = testApp()
    const ada = await asUser(t)
    const fileId = await t.upload()
    await ada.mutation(claimRef, { fileId })
    let checks = 0
    // Holds at the first look: the background check has not run yet.
    await drain(t, vi, { until: () => ++checks > 0 })
    expect(checks).toBe(1)
    await drain(t, vi, { until: async () => await t.query(fileUrlRef, { fileId }) !== null })
    expect(await t.query(fileUrlRef, { fileId })).not.toBeNull()
    await expect(drain(t, vi, { until: () => false })).rejects.toThrow(/`until` never held/)
  })

  test('fileExists reads whether a file is still in the component\'s storage', async () => {
    const t = testApp()
    const fileId = await t.upload()
    expect(await t.fileExists(fileId)).toBe(true)
    expect(await fileExists(t, fileId)).toBe(true)
    await t.mutation(components.backend.storage.discard as unknown as FunctionReference<'mutation'>, { storageId: fileId })
    expect(await t.fileExists(fileId)).toBe(false)
    expect(await t.fileExists('no-such-file')).toBe(false)
  })
})

describe('stubBillingProvider', () => {
  const ingest = (events: Array<Record<string, unknown>>) => fetch('https://sandbox-api.polar.sh/v1/events/ingest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events }) })

  test('takes each usage event once by its key, and tells charges from refunds and reports', async () => {
    const provider = stubBillingProvider()
    try {
      const charge = { name: 'credits', external_customer_id: 'ws-1', external_id: 'job-1', metadata: { job: 'comics:print', amount: 3 } }
      expect(await (await ingest([charge])).json()).toEqual({ inserted: 1, duplicates: 0 })
      expect(await (await ingest([charge])).json()).toEqual({ inserted: 0, duplicates: 1 })
      await ingest([{ name: 'job.cost', external_customer_id: 'ws-1', external_id: 'job-1-cost', metadata: { _cost: { amount: 1, currency: 'usd' } } }])
      expect(provider.charges).toEqual([{ name: 'credits', customer: 'ws-1', externalId: 'job-1', value: 3, metadata: { job: 'comics:print', amount: 3 } }])
      expect(provider.events).toHaveLength(2)
      expect(provider.refunds).toEqual([])
    }
    finally {
      provider.restore()
    }
  })

  test('refuses the next charges with a 503 when asked, keeping none of them, then takes them again', async () => {
    const provider = stubBillingProvider()
    try {
      const charge = { name: 'credits', external_customer_id: 'ws-1', external_id: 'job-2', metadata: { amount: 2 } }
      provider.refuse('charges', 1)
      expect((await ingest([charge])).status).toBe(503)
      expect((await ingest([charge])).status).toBe(200)
      provider.refuse()
      expect((await ingest([{ ...charge, external_id: 'job-3' }])).status).toBe(503)
      expect((await ingest([{ ...charge, external_id: 'job-3' }])).status).toBe(503)
      provider.accept()
      expect((await ingest([{ ...charge, external_id: 'job-3' }])).status).toBe(200)
      expect(provider.refused).toBe(3)
      expect(provider.charges.map(event => event.externalId)).toEqual(['job-2', 'job-3'])
    }
    finally {
      provider.restore()
    }
  })

  test('takes a refund the package\'s billing sends, passes every other request on, and puts fetch back', async () => {
    const original = globalThis.fetch
    const restoreStorage = stubStorageFetch({ network: () => new Response('elsewhere') })
    const provider = stubBillingProvider()
    try {
      const t = testApp()
      await seedBilling(t, 'ws-refund', { customer: true, credits: { meter_credits: 5 } })
      provider.refuse('refunds', 1)
      await expect(t.action(refundRef, { userId: 'ws-refund', value: 2, externalId: 'job-4-refund' })).rejects.toThrow()
      await t.action(refundRef, { userId: 'ws-refund', value: 2, externalId: 'job-4-refund' })
      expect(provider.refunds).toEqual([expect.objectContaining({ customer: 'ws-refund', externalId: 'job-4-refund', value: -2 })])
      expect(await (await fetch('https://example.com/')).text()).toBe('elsewhere')
      expect((await fetch('https://sandbox-api.polar.sh/v1/customers/')).status).toBe(404)
    }
    finally {
      provider.restore()
      restoreStorage()
    }
    expect(globalThis.fetch).toBe(original)
  })
})

describe('the safety classifier under test', () => {
  test('answers the codes a marker chooses, in text and in an upload\'s bytes, and S1 for the bare marker', async () => {
    const t = testApp()
    expect(await t.action(classifyRef, { text: 'A fox who wants to fly' })).toEqual([])
    expect(await t.action(classifyRef, { text: `My address: ${TEST_UNSAFE_CODE('S7')}` })).toEqual(['S7'])
    expect(await t.action(classifyRef, { text: '[[unsafe]]' })).toEqual(['S1'])
    const marked = await t.upload(new Uint8Array([...TEST_PNG, ...new TextEncoder().encode(TEST_UNSAFE_CODE('S12'))]))
    expect(await t.action(classifyRef, { images: [marked] })).toEqual(['S12'])
    expect(await t.action(classifyRef, { images: [await t.upload()] })).toEqual([])
  })
})

describe('seedBilling and seedCredits', () => {
  const getByUser = components.backend.billing.getByUser as unknown as FunctionReference<'query', 'internal', { userId: string }, { customerId: string | null, activeProductIds: string[], meters: Array<{ meterId: string, balance: number }> } | null>

  test('leave the entitlement cache a sync would: products, features and balances', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await seedBilling(t, ada.workspaceId!, { products: ['prod_pro'], features: ['export'], credits: { meter_coins: 5 } })
    expect(await t.query(featureRef, { userId: ada.workspaceId!, key: 'export' })).toBe(true)
    expect(await t.query(featureRef, { userId: ada.workspaceId!, key: 'print' })).toBe(false)
    expect(await t.query(getByUser, { userId: ada.workspaceId! })).toMatchObject({ customerId: null, activeProductIds: ['prod_pro'], meters: [{ meterId: 'meter_coins', balance: 5 }] })

    // One meter set, the rest kept.
    await seedCredits(t, ada.workspaceId!, 'meter_pages', 12)
    await seedCredits(t, ada.workspaceId!, 'meter_coins', 2)
    const cached = await t.query(getByUser, { userId: ada.workspaceId! })
    expect(cached?.meters).toEqual(expect.arrayContaining([expect.objectContaining({ meterId: 'meter_coins', balance: 2 }), expect.objectContaining({ meterId: 'meter_pages', balance: 12 })]))
    expect(await t.query(featureRef, { userId: ada.workspaceId!, key: 'export' })).toBe(true)
  })

  test('make the provider\'s customer when asked, and keep it through seedCredits', async () => {
    const t = testApp()
    const ada = await asUser(t)
    await seedBilling(t, ada.workspaceId!, { customer: true })
    const polar = (componentsGeneric() as unknown as { polar: { lib: { getCustomerByUserId: FunctionReference<'query', 'internal'> } } }).polar
    const customer = await t.query(polar.lib.getCustomerByUserId, { userId: ada.workspaceId! } as never) as { id: string } | null
    expect(customer?.id).toMatch(/^cus_test_/)
    await seedCredits(t, ada.workspaceId!, 'meter_coins', 3)
    expect((await t.query(getByUser, { userId: ada.workspaceId! }))?.customerId).toBe(customer?.id)
    // Seeded again, the entity is still the same customer, in both caches.
    await seedBilling(t, ada.workspaceId!, { customer: true, products: ['prod_pro'] })
    expect((await t.query(getByUser, { userId: ada.workspaceId! }))?.customerId).toBe(customer?.id)
    await seedBilling(t, ada.workspaceId!, { customer: customer!.id })
    await expect(seedBilling(t, ada.workspaceId!, { customer: 'cus_other' })).rejects.toThrow(/one customer/)
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
