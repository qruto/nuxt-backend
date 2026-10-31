/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, makeFunctionReference, mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { getBackendError } from '../../src/convex/errors'
import { setupAudit } from '../../src/convex/integrations/audit'
import { setupEmail } from '../../src/convex/integrations/email'
import { followSuppressionEvent, type Suppression, type SuppressionsPage } from '../../src/convex/integrations/email-suppressions'
import { setupWebhooks } from '../../src/convex/integrations/webhooks'
import { RECENT_SIGN_IN_SECONDS } from '../../src/convex/constants'
import { NEW_DEVICE_EMAIL_INTERVAL_MS } from '../../src/convex/components/backend/devices'

// The component's two copies OPS1 adds, through the functions the app
// calls: the email provider's suppression list (mirrored from its events,
// listed and lifted by an administrator), the known devices behind the
// new-device alerts, and the webhook log's replay stamp. The sign-in side
// runs on Better Auth's routes in test/unit/sign-in-alerts-flow.test.ts.

const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
const audit = setupAudit(components as never)
const email = setupEmail(components as never, { audit })
const webhooks = setupWebhooks(components as never, { audit })

const follow = mutationGeneric({
  args: { type: v.string(), payload: v.any() },
  handler: async (ctx, { type, payload }) => followSuppressionEvent(ctx, components.backend.suppressions as never, type, payload),
})
const suppressed = queryGeneric({
  args: { email: v.string() },
  handler: async (ctx, args) => ctx.runQuery(components.backend.suppressions.isSuppressed, args),
})
const see = mutationGeneric({
  args: { userId: v.string(), fingerprint: v.string(), device: v.string(), browser: v.optional(v.string()), recovery: v.optional(v.boolean()), sessionId: v.optional(v.string()), previous: v.optional(v.array(v.object({ fingerprint: v.string(), device: v.string() }))) },
  handler: async (ctx, args) => ctx.runMutation(components.backend.devices.see, args),
})
const record = mutationGeneric({
  args: { service: v.string(), deliveryId: v.string(), type: v.string() },
  handler: async (ctx, args) => ctx.runMutation(components.backend.webhooks.record, { ...args, outcome: 'handler_error' }),
})

const testApp = defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './email.js': () => Promise.resolve({ ...email.api }),
  './audit.js': () => Promise.resolve(audit.api),
  './auth.js': async () => {
    const { setupAuth } = await import('../../src/convex/client/index')
    const { listSignInAlerts } = setupAuth(components as never, queryGeneric as never, { email } as never)
    return { listSignInAlerts }
  },
  './webhooks.js': () => Promise.resolve({ ...webhooks.api }),
  './test.js': () => Promise.resolve({ follow, suppressed, see, record }),
})
type App = ReturnType<typeof testApp>

const followRef = makeFunctionReference<'mutation', { type: string, payload: unknown }, null>('test:follow')
const suppressedRef = makeFunctionReference<'query', { email: string }, boolean>('test:suppressed')
const seeRef = makeFunctionReference<'mutation', Record<string, unknown>, { alert: boolean, email: boolean }>('test:see')
const recordRef = makeFunctionReference<'mutation', Record<string, unknown>, null>('test:record')
const getSuppressions = makeFunctionReference<'query', { paginationOpts: { numItems: number, cursor: string | null } }, SuppressionsPage | null>('email:getSuppressions')
const liftSuppression = makeFunctionReference<'action', { email: string }, { lifted: boolean }>('email:liftSuppression')
const listSignInAlerts = makeFunctionReference<'query', Record<string, never>, Array<Record<string, unknown>> | null>('auth:listSignInAlerts')
const getWebhookDeliveries = makeFunctionReference<'query', { limit?: number }, Array<Record<string, unknown>> | null>('webhooks:getWebhookDeliveries')
const replayWebhookDelivery = makeFunctionReference<'action', { service: 'billing' | 'email', deliveryId: string }, { replayedAt: number }>('webhooks:replayWebhookDelivery')
const listAllActivity = makeFunctionReference<'query', { paginationOpts: { numItems: number, cursor: string | null } }, { page: Array<{ type: string, data: Record<string, unknown> }> } | null>('audit:listAllActivity')

let t: App

const added = (address: string, origin: string, at: string) => ({ type: 'suppression.added', created_at: at, data: { id: 'sup_1', email: address, origin, source_id: null, created_at: at } })
const removed = (address: string, at: string) => ({ ...added(address, 'bounce', at), type: 'suppression.removed' })
const page = { paginationOpts: { numItems: 20, cursor: null } }
const administrator = () => asUser(t, { role: 'admin', email: 'root@example.com' })
const refusal = (promise: Promise<unknown>) => promise.then(() => null, error => getBackendError(error))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'], now: Date.UTC(2026, 9, 28, 12) })
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubEnv('EMAIL_API_KEY', 're_test_key')
  vi.stubEnv('BACKEND_ENVIRONMENT', 'development')
  t = testApp()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('the suppression copy', () => {
  test('follows the provider\'s events: added, removed, and a send it dropped', async () => {
    await t.mutation(followRef, { type: 'suppression.added', payload: added('Bounced@Example.com', 'bounce', '2026-10-28T10:00:00Z') })
    expect(await t.query(suppressedRef, { email: ' bounced@example.com ' })).toBe(true)

    await t.mutation(followRef, { type: 'email.suppressed', payload: { type: 'email.suppressed', created_at: '2026-10-28T10:05:00Z', data: { email_id: 're_1', to: ['dropped@example.com'], suppressed: { message: 'suppressed', type: 'suppressed' } } } })
    expect(await t.query(suppressedRef, { email: 'dropped@example.com' })).toBe(true)

    await t.mutation(followRef, { type: 'suppression.removed', payload: removed('bounced@example.com', '2026-10-28T11:00:00Z') })
    expect(await t.query(suppressedRef, { email: 'bounced@example.com' })).toBe(false)

    // A late event from before the lift changes nothing.
    await t.mutation(followRef, { type: 'suppression.added', payload: added('bounced@example.com', 'bounce', '2026-10-28T10:30:00Z') })
    expect(await t.query(suppressedRef, { email: 'bounced@example.com' })).toBe(false)
    // A later suppression stands again.
    await t.mutation(followRef, { type: 'suppression.added', payload: added('bounced@example.com', 'complaint', '2026-10-28T11:30:00Z') })
    expect(await t.query(suppressedRef, { email: 'bounced@example.com' })).toBe(true)
    // Any other event, and a body without data, changes nothing.
    await t.mutation(followRef, { type: 'email.delivered', payload: { type: 'email.delivered', data: { to: ['ok@example.com'] } } })
    await t.mutation(followRef, { type: 'suppression.added', payload: { type: 'suppression.added' } })
    expect(await t.query(suppressedRef, { email: 'ok@example.com' })).toBe(false)
  })

  test('is listed to an administrator in person only, newest first', async () => {
    await t.mutation(followRef, { type: 'suppression.added', payload: added('first@example.com', 'bounce', '2026-10-28T09:00:00Z') })
    await t.mutation(followRef, { type: 'suppression.added', payload: added('second@example.com', 'complaint', '2026-10-28T10:00:00Z') })

    expect(await t.query(getSuppressions, page)).toBeNull()
    const member = await asUser(t, { email: 'member@example.com' })
    expect(await member.query(getSuppressions, page)).toBeNull()
    const admin = await administrator()
    const listed = await admin.query(getSuppressions, page)
    expect(listed?.page.map((row: Suppression) => [row.email, row.origin])).toEqual([['second@example.com', 'complaint'], ['first@example.com', 'bounce']])
  })

  test('lifts through the provider, then the copy, recorded on the trail without the address', async () => {
    const calls: Array<{ method: string, path: string }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input instanceof Request ? input.url : input))
      calls.push({ method: init?.method ?? (input instanceof Request ? input.method : 'GET'), path: decodeURIComponent(url.pathname) })
      return new Response(JSON.stringify({ object: 'suppression', id: 'sup_1', deleted: true }), { status: 200, headers: { 'content-type': 'application/json' } })
    }))
    await t.mutation(followRef, { type: 'suppression.added', payload: added('lift@example.com', 'bounce', '2026-10-28T09:00:00Z') })

    const member = await asUser(t, { email: 'member@example.com' })
    expect(await refusal(member.action(liftSuppression, { email: 'lift@example.com' }))).toMatchObject({ code: 'forbidden' })
    const stale = await asUser(t, { role: 'admin', email: 'old@example.com', signedInAt: Date.now() - (RECENT_SIGN_IN_SECONDS + 60) * 1000 })
    expect(await refusal(stale.action(liftSuppression, { email: 'lift@example.com' }))).toMatchObject({ code: 'reauthentication_required' })
    expect(calls).toEqual([])

    const admin = await administrator()
    // An address nobody suppressed: nothing to lift, no provider call.
    expect(await admin.action(liftSuppression, { email: 'nobody@example.com' })).toEqual({ lifted: false })
    expect(calls).toEqual([])
    expect(await admin.action(liftSuppression, { email: 'LIFT@example.com' })).toEqual({ lifted: true })
    expect(calls).toEqual([{ method: 'DELETE', path: '/suppressions/lift@example.com' }])
    expect(await t.query(suppressedRef, { email: 'lift@example.com' })).toBe(false)
    const trail = await admin.query(listAllActivity, page)
    const event = trail?.page.find(entry => entry.type === 'email.suppression_lifted')
    expect(event).toMatchObject({ data: { origin: 'bounce' } })
    expect(JSON.stringify(trail)).not.toContain('lift@example.com')
  })

  test('says so when the provider refuses the lift, keeping the copy', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ name: 'restricted_api_key', message: 'This API key is restricted to only send emails', statusCode: 401 }), { status: 401, headers: { 'content-type': 'application/json' } })))
    await t.mutation(followRef, { type: 'suppression.added', payload: added('kept@example.com', 'bounce', '2026-10-28T09:00:00Z') })
    const admin = await administrator()
    expect(await refusal(admin.action(liftSuppression, { email: 'kept@example.com' }))).toMatchObject({ code: 'unavailable', data: { service: 'email', reason: 'provider_refused' } })
    expect(await t.query(suppressedRef, { email: 'kept@example.com' })).toBe(true)
  })
})

describe('known devices', () => {
  const sees = (args: Record<string, unknown>) => t.mutation(seeRef, { userId: 'u1', device: 'chrome-mac', ...args })

  test('alert a new device after the first, once by email per browser and system a day', async () => {
    // The first device is not news.
    expect(await sees({ fingerprint: 'home' })).toEqual({ alert: false, email: false })
    expect(await sees({ fingerprint: 'home' })).toEqual({ alert: false, email: false })
    // A new network range for the same browser: news, emailed.
    expect(await sees({ fingerprint: 'cafe', sessionId: 's2' })).toEqual({ alert: true, email: true })
    // Another range the same day: the alert, but no second email.
    expect(await sees({ fingerprint: 'train', sessionId: 's3' })).toEqual({ alert: true, email: false })
    // Another browser: its own email.
    expect(await sees({ fingerprint: 'phone', device: 'safari-ios', browser: 'Safari', sessionId: 's4' })).toEqual({ alert: true, email: true })
    vi.advanceTimersByTime(NEW_DEVICE_EMAIL_INTERVAL_MS + 1)
    expect(await sees({ fingerprint: 'office', sessionId: 's5' })).toEqual({ alert: true, email: true })
    // Another account's first device is its own.
    expect(await t.mutation(seeRef, { userId: 'u2', device: 'chrome-mac', fingerprint: 'home' })).toEqual({ alert: false, email: false })
  })

  test('count a recovery as news even on a known device, its email the recovery\'s own', async () => {
    await sees({ fingerprint: 'home' })
    expect(await sees({ fingerprint: 'home', recovery: true, sessionId: 'r1' })).toEqual({ alert: true, email: false })
    expect(await t.mutation(seeRef, { userId: 'u3', device: 'd', fingerprint: 'new', recovery: true })).toEqual({ alert: true, email: false })
  })

  test('know a device through an AUTH_SECRET rotation, re-keying its row to the current secret', async () => {
    await sees({ fingerprint: 'home-old', device: 'chrome-old' })
    await sees({ fingerprint: 'cafe-old', device: 'chrome-old', sessionId: 's1' })
    // The rotation: the same device hashes differently under the new secret, and its old hashes come along.
    expect(await sees({ fingerprint: 'home-new', device: 'chrome-new', previous: [{ fingerprint: 'home-old', device: 'chrome-old' }] })).toEqual({ alert: false, email: false })
    // Re-keyed: once the old secret retires, the new hash alone still knows it.
    expect(await sees({ fingerprint: 'home-new', device: 'chrome-new' })).toEqual({ alert: false, email: false })
    // A new range the same day: alerted, and the day's email, sent under the old secret, still counts.
    expect(await sees({ fingerprint: 'train-new', device: 'chrome-new', sessionId: 's2', previous: [{ fingerprint: 'train-old', device: 'chrome-old' }] })).toEqual({ alert: true, email: false })
  })

  test('list the account\'s alerts to it, newest first, with the session to sign out', async () => {
    await sees({ fingerprint: 'home' })
    await sees({ fingerprint: 'cafe', browser: 'Chrome', sessionId: 's2' })
    vi.advanceTimersByTime(60_000)
    await sees({ fingerprint: 'home', recovery: true, sessionId: 'r1' })

    expect(await t.query(listSignInAlerts, {})).toBeNull()
    const person = await asUser(t, { email: 'person@example.com' })
    expect(await person.query(listSignInAlerts, {})).toEqual([])
    const owner = t.withIdentity({ subject: 'u1', sessionId: 'sx' })
    const alerts = await owner.query(listSignInAlerts, {})
    expect(alerts).toEqual([
      expect.objectContaining({ recovery: true, sessionId: 'r1' }),
      expect.objectContaining({ recovery: false, browser: 'Chrome', sessionId: 's2' }),
    ])
  })
})

describe('the webhook log\'s replay', () => {
  test('serves the log to an administrator and stamps a replayed delivery', async () => {
    await t.mutation(recordRef, { service: 'billing', deliveryId: 'wh_1', type: 'order.paid' })
    vi.stubEnv('BILLING_ACCESS_TOKEN', 'polar_test_token')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('null', { status: 202, headers: { 'content-type': 'application/json' } })))

    expect(await t.query(getWebhookDeliveries, {})).toBeNull()
    const admin = await administrator()
    expect(await admin.query(getWebhookDeliveries, {})).toEqual([expect.objectContaining({ deliveryId: 'wh_1', outcome: 'handler_error' })])

    const { replayedAt } = await admin.action(replayWebhookDelivery, { service: 'billing', deliveryId: 'wh_1' })
    expect(replayedAt).toBeGreaterThan(0)
    expect(await admin.query(getWebhookDeliveries, {})).toEqual([expect.objectContaining({ deliveryId: 'wh_1', replayedAt })])
    const trail = await admin.query(listAllActivity, page)
    expect(trail?.page).toContainEqual(expect.objectContaining({ type: 'webhook.replayed', data: { service: 'billing', delivery: 'wh_1', type: 'order.paid' } }))
  })
})

describe('a deployment that is neither production nor development', () => {
  test.each([
    ['preview', 'preview'],
    ['unset', ''],
    ['mistyped', 'prod'],
  ])('refuses a webhook replay and a suppression lift when %s, and calls no provider', async (_kind, value) => {
    const fetch = vi.fn(async () => new Response('null', { status: 202, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetch)
    vi.stubEnv('BACKEND_ENVIRONMENT', value)
    vi.stubEnv('BILLING_ACCESS_TOKEN', 'polar_test_token')
    await t.mutation(recordRef, { service: 'billing', deliveryId: 'wh_1', type: 'order.paid' })
    await t.mutation(followRef, { type: 'suppression.added', payload: added('kept@example.com', 'bounce', '2026-10-28T09:00:00Z') })
    const admin = await administrator()
    expect(await refusal(admin.action(replayWebhookDelivery, { service: 'billing', deliveryId: 'wh_1' }))).toMatchObject({ code: 'not_ready', data: { reason: 'environment' } })
    expect(await refusal(admin.action(liftSuppression, { email: 'kept@example.com' }))).toMatchObject({ code: 'not_ready', data: { reason: 'environment' } })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('a sandbox deployment', () => {
  test('refuses a webhook replay and a suppression lift, and calls no provider', async () => {
    const fetch = vi.fn(async () => new Response('null', { status: 202, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetch)
    vi.stubEnv('BACKEND_ENVIRONMENT', 'sandbox')
    vi.stubEnv('BILLING_ACCESS_TOKEN', 'polar_test_token')
    await t.mutation(recordRef, { service: 'billing', deliveryId: 'wh_1', type: 'order.paid' })
    await t.mutation(followRef, { type: 'suppression.added', payload: added('kept@example.com', 'bounce', '2026-10-28T09:00:00Z') })
    // A sandbox's administrator is passkey-only and signed in with a passkey, or nothing of the console reaches them.
    const admin = await asUser(t, { role: 'admin', email: 'root@example.com', passkeyOnly: true, signInMethod: 'passkey' })
    expect(await refusal(admin.action(replayWebhookDelivery, { service: 'billing', deliveryId: 'wh_1' }))).toMatchObject({ code: 'not_ready', data: { reason: 'sandbox' } })
    expect(await refusal(admin.action(liftSuppression, { email: 'kept@example.com' }))).toMatchObject({ code: 'not_ready', data: { reason: 'sandbox' } })
    expect(fetch).not.toHaveBeenCalled()
    expect(await t.query(suppressedRef, { email: 'kept@example.com' })).toBe(true)
    expect(await admin.query(getWebhookDeliveries, {})).toEqual([expect.not.objectContaining({ replayedAt: expect.anything() })])
  })
})
