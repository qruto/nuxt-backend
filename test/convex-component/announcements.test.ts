/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, makeFunctionReference, mutationGeneric } from 'convex/server'
import { v } from 'convex/values'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { getBackendError } from '../../src/convex/errors'
import { setupAudit } from '../../src/convex/integrations/audit'
import type { AnnouncementsConsole, LiveAnnouncement } from '../../src/convex/integrations/announcements'
import { setupEmail } from '../../src/convex/integrations/email'
import { RECENT_SIGN_IN_SECONDS } from '../../src/convex/constants'

// Announcements end to end: an administrator publishes a notice from the
// admin console's Announcements tab, every signed-in person sees it live
// until it expires, they dismiss it or it is ended, and its broadcast is
// created once at the provider and sent by its id, from production only,
// with the postal address and the provider's unsubscribe link in it.

const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
const audit = setupAudit(components as never)
const email = setupEmail(components as never, {
  brand: { name: 'Panels', address: 'Panels Ltd, 1 Example Street, Dublin' },
  topics: { productNews: { name: 'Product news', description: 'New features, about once a month.', subscribedByDefault: false } },
  audit,
})
const saveIds = mutationGeneric({
  args: { ids: v.any() },
  handler: async (ctx, { ids }) => ctx.runMutation(components.backend.preferences.saveProviderIds, { ids }),
})

const testApp = defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './email.js': () => Promise.resolve({ ...email.api }),
  './audit.js': () => Promise.resolve(audit.api),
  './test.js': () => Promise.resolve({ saveIds }),
})
type App = ReturnType<typeof testApp>

const getAnnouncements = makeFunctionReference<'query', Record<string, never>, LiveAnnouncement[]>('email:getAnnouncements')
const dismiss = makeFunctionReference<'mutation', { id: string }, null>('email:dismissAnnouncement')
const consoleRef = makeFunctionReference<'query', Record<string, never>, AnnouncementsConsole | null>('email:getAnnouncementsConsole')
const publish = makeFunctionReference<'mutation', Record<string, unknown>, { id: string }>('email:publishAnnouncement')
const end = makeFunctionReference<'mutation', { id: string }, { ended: boolean }>('email:endAnnouncement')
const preview = makeFunctionReference<'mutation', { id: string }, { emailId: string | null }>('email:previewAnnouncement')
const send = makeFunctionReference<'action', { id: string, scheduledAt?: number }, { sendAt: number | null }>('email:sendAnnouncement')
const cancel = makeFunctionReference<'action', { id: string }, { cancelled: boolean }>('email:cancelAnnouncement')
const listActivity = makeFunctionReference<'query', { paginationOpts: { numItems: number, cursor: string | null } }, { page: Array<{ type: string, data: Record<string, unknown> }> } | null>('audit:listActivity')
const saveIdsRef = makeFunctionReference<'mutation', { ids: unknown }, null>('test:saveIds')

const HOUR = 60 * 60_000
let t: App
let calls: Array<{ method: string, path: string, body: Record<string, unknown> | undefined }>

/** A stand-in for the email provider: makes a broadcast, sends it, deletes it, and fails as told. */
function provider(fail?: (path: string, method: string) => boolean) {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input))
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined
    calls.push({ method, path: url.pathname, body })
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
    if (fail?.(url.pathname, method)) return json({ name: 'application_error', message: 'try later', statusCode: 500 }, 500)
    if (url.pathname === '/broadcasts' && method === 'POST') return json({ id: 'bc_1' })
    return json({ id: 'bc_1', object: 'broadcast' })
  }))
}

const administrator = () => asUser(t, { role: 'admin', email: 'root@example.com' })
const refusal = (promise: Promise<unknown>) => promise.then(() => null, error => getBackendError(error))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'], now: Date.UTC(2026, 9, 27, 12) })
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubEnv('SITE_URL', 'https://panels.example.com')
  vi.stubEnv('EMAIL_API_KEY', 're_test_key')
  vi.stubEnv('EMAIL_MARKETING_FROM', 'Panels <news@news.panels.example>')
  calls = []
  t = testApp()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the notice', () => {
  test('shows to every signed-in person until it expires, newest first, and to nobody signed out', async () => {
    const root = await administrator()
    const first = await root.mutation(publish, { message: 'Boards are here.', expiresAt: Date.now() + 2 * HOUR })
    vi.advanceTimersByTime(1000)
    await root.mutation(publish, { message: 'Dark mode too.', link: { url: '/changelog' }, expiresAt: Date.now() + 24 * HOUR })
    const ada = await asUser(t)
    expect((await ada.query(getAnnouncements, {})).map(item => item.message)).toEqual(['Dark mode too.', 'Boards are here.'])
    expect((await ada.query(getAnnouncements, {}))[0]).toMatchObject({ link: { url: '/changelog' } })
    expect(await t.query(getAnnouncements, {})).toEqual([])
    vi.advanceTimersByTime(3 * HOUR)
    expect((await ada.query(getAnnouncements, {})).map(item => item.id)).not.toContain(first.id)
  })

  test('stays dismissed for the person who dismissed it, and only for them', async () => {
    const root = await administrator()
    const { id } = await root.mutation(publish, { message: 'Boards are here.', expiresAt: Date.now() + HOUR })
    const ada = await asUser(t)
    const bob = await asUser(t)
    await ada.mutation(dismiss, { id })
    await ada.mutation(dismiss, { id })
    expect(await ada.query(getAnnouncements, {})).toEqual([])
    expect(await bob.query(getAnnouncements, {})).toHaveLength(1)
    expect(await refusal(t.mutation(dismiss, { id }))).toMatchObject({ code: 'unauthenticated' })
  })

  test('goes for everyone once an administrator ends it', async () => {
    const root = await administrator()
    const { id } = await root.mutation(publish, { message: 'Boards are here.', expiresAt: Date.now() + HOUR })
    expect(await root.mutation(end, { id })).toEqual({ ended: true })
    expect(await root.mutation(end, { id })).toEqual({ ended: false })
    expect(await (await asUser(t)).query(getAnnouncements, {})).toEqual([])
    expect((await root.query(consoleRef, {}))!.announcements[0]).toMatchObject({ id, endedAt: expect.any(Number) })
  })
})

describe('the Announcements tab', () => {
  test('is for an administrator in person with a recent sign-in', async () => {
    const input = { message: 'Hi', expiresAt: Date.now() + HOUR }
    expect(await (await asUser(t)).query(consoleRef, {})).toBeNull()
    expect(await refusal((await asUser(t)).mutation(publish, input))).toMatchObject({ code: 'forbidden', data: { reason: 'admin_only' } })
    const root = await administrator()
    expect(await refusal((await asUser(t, { role: 'admin', impersonatedBy: root.userId })).mutation(publish, input))).toMatchObject({ code: 'forbidden', data: { reason: 'impersonating' } })
    const stale = await asUser(t, { role: 'admin', signedInAt: Date.now() - (RECENT_SIGN_IN_SECONDS + 60) * 1000 })
    expect(await refusal(stale.mutation(publish, input))).toMatchObject({ code: 'reauthentication_required' })
    expect(await root.query(consoleRef, {})).toMatchObject({ topics: [{ key: 'productNews', name: 'Product news' }], canBroadcast: false, postalAddress: true, audiences: { accounts: false, waitlist: false } })
  })

  test('refuses a notice it cannot show, naming the field', async () => {
    const root = await administrator()
    const field = async (input: Record<string, unknown>) => (await refusal(root.mutation(publish, { message: 'Hi', expiresAt: Date.now() + HOUR, ...input })))?.data
    expect(await field({ message: ' ' })).toMatchObject({ field: 'message' })
    expect(await field({ message: 'x'.repeat(281) })).toMatchObject({ field: 'message' })
    expect(await field({ link: { url: 'javascript:alert(1)' } })).toMatchObject({ field: 'link' })
    expect(await field({ link: { url: '//evil.example' } })).toMatchObject({ field: 'link' })
    expect(await field({ link: { url: 'http://insecure.example' } })).toMatchObject({ field: 'link' })
    expect(await field({ expiresAt: Date.now() - 1 })).toMatchObject({ field: 'expiresAt' })
    expect(await field({ expiresAt: Date.now() + 91 * 24 * HOUR })).toMatchObject({ field: 'expiresAt' })
    expect(await field({ broadcast: { audience: 'accounts', subject: 'S', body: 'B' } })).toMatchObject({ field: 'topic' })
    expect(await field({ broadcast: { audience: 'accounts', topic: 'nope', subject: 'S', body: 'B' } })).toMatchObject({ field: 'topic' })
    expect(await field({ broadcast: { audience: 'accounts', topic: 'productNews', subject: '', body: 'B' } })).toMatchObject({ field: 'subject' })
  })

  test('records each change on the activity trail, never the words', async () => {
    const root = await administrator()
    const { id } = await root.mutation(publish, { message: 'Boards are here.', expiresAt: Date.now() + HOUR })
    await root.mutation(end, { id })
    const rows = (await root.query(listActivity, { paginationOpts: { numItems: 10, cursor: null } }))!.page
    expect(rows.map(row => row.type)).toEqual(['announcement.ended', 'announcement.published'])
    expect(JSON.stringify(rows)).not.toContain('Boards are here.')
  })
})

describe('the broadcast', () => {
  const withBroadcast = { message: 'Boards are here.', link: { url: '/boards', label: 'See boards' }, expiresAt: Date.now() + 24 * HOUR, broadcast: { audience: 'accounts', topic: 'productNews', subject: 'Boards are here', body: 'Plan a strip with friends.\n\nTry it today.' } }

  async function synced() {
    await t.mutation(saveIdsRef, { ids: [{ kind: 'segment', key: 'accounts', providerId: 'seg_accounts' }, { kind: 'topic', key: 'productNews', providerId: 'top_news' }] })
  }

  test('is refused outside production: test mode keeps mail from real people', async () => {
    vi.stubEnv('BACKEND_ENVIRONMENT', 'development')
    provider()
    const root = await administrator()
    const { id } = await root.mutation(publish, withBroadcast)
    expect(await refusal(root.action(send, { id }))).toMatchObject({ code: 'unavailable', data: { service: 'email', reason: 'test_mode' } })
    expect(calls).toEqual([])
  })

  test('is created once to the topic\'s people, with the address and the provider\'s unsubscribe link, and sent by its id', async () => {
    vi.stubEnv('BACKEND_ENVIRONMENT', 'production')
    provider()
    await synced()
    const root = await administrator()
    const { id } = await root.mutation(publish, withBroadcast)
    expect(await root.action(send, { id })).toEqual({ sendAt: Date.now() })
    const created = calls.find(call => call.method === 'POST' && call.path === '/broadcasts')!
    expect(created.body).toMatchObject({ segment_id: 'seg_accounts', topic_id: 'top_news', from: 'Panels <news@news.panels.example>', subject: 'Boards are here' })
    expect(created.body!.send).not.toBe(true)
    const html = String(created.body!.html)
    expect(html).toContain('{{{RESEND_UNSUBSCRIBE_URL}}}')
    expect(html).toContain('Panels Ltd, 1 Example Street, Dublin')
    expect(html).toContain('https://panels.example.com/boards')
    expect(calls.filter(call => call.path === '/broadcasts/bc_1/send')).toHaveLength(1)

    // A retried send sends nothing twice.
    expect(await root.action(send, { id })).toEqual({ sendAt: Date.now() })
    expect(calls.filter(call => call.method === 'POST' && call.path === '/broadcasts')).toHaveLength(1)
    expect(calls.filter(call => call.path === '/broadcasts/bc_1/send')).toHaveLength(1)
    expect((await root.query(consoleRef, {}))!.announcements[0]!.broadcast).toMatchObject({ state: 'sent', sendAt: Date.now() })
  })

  test('sends the broadcast it already made when the first send failed after making it', async () => {
    vi.stubEnv('BACKEND_ENVIRONMENT', 'production')
    await synced()
    provider((path, method) => path === '/broadcasts/bc_1/send' && method === 'POST')
    const root = await administrator()
    const { id } = await root.mutation(publish, withBroadcast)
    expect(await refusal(root.action(send, { id }))).toMatchObject({ code: 'unavailable', data: { reason: 'provider_refused' } })
    calls = []
    provider()
    await root.action(send, { id })
    expect(calls.filter(call => call.method === 'POST' && call.path === '/broadcasts')).toHaveLength(0)
    expect(calls.filter(call => call.path === '/broadcasts/bc_1/send')).toHaveLength(1)
  })

  test('waits for `email sync`, and for the postal address', async () => {
    vi.stubEnv('BACKEND_ENVIRONMENT', 'production')
    provider()
    const root = await administrator()
    const { id } = await root.mutation(publish, withBroadcast)
    expect(await refusal(root.action(send, { id }))).toMatchObject({ code: 'not_ready', data: { reason: 'not_synced' } })
    // The claim was let go: the next send tries again.
    await synced()
    expect(await root.action(send, { id, scheduledAt: Date.now() + 2 * HOUR })).toEqual({ sendAt: Date.now() + 2 * HOUR })
    expect(calls.find(call => call.path === '/broadcasts/bc_1/send')!.body).toMatchObject({ scheduled_at: new Date(Date.now() + 2 * HOUR).toISOString() })
  })

  test('can be cancelled while it waits, and the provider deletes the scheduled one', async () => {
    vi.stubEnv('BACKEND_ENVIRONMENT', 'production')
    provider()
    await synced()
    const root = await administrator()
    const { id } = await root.mutation(publish, withBroadcast)
    await root.action(send, { id, scheduledAt: Date.now() + 2 * HOUR })
    expect(await root.action(cancel, { id })).toEqual({ cancelled: true })
    expect(calls.filter(call => call.method === 'DELETE' && call.path === '/broadcasts/bc_1')).toHaveLength(1)
    expect(await refusal(root.action(send, { id }))).toMatchObject({ code: 'invalid_input', data: { reason: 'cancelled' } })
  })

  test('stays scheduled when the provider refuses to delete it, and is cancelled once it does', async () => {
    vi.stubEnv('BACKEND_ENVIRONMENT', 'production')
    provider((path, method) => method === 'DELETE' && path === '/broadcasts/bc_1')
    await synced()
    const root = await administrator()
    const { id } = await root.mutation(publish, withBroadcast)
    await root.action(send, { id, scheduledAt: Date.now() + 2 * HOUR })
    expect(await refusal(root.action(cancel, { id }))).toMatchObject({ code: 'unavailable', data: { reason: 'provider_refused' } })
    // Still going out as scheduled, as the console says.
    expect((await root.query(consoleRef, {}))!.announcements[0]!.broadcast).toMatchObject({ state: 'sent', sendAt: Date.now() + 2 * HOUR })
    provider()
    expect(await root.action(cancel, { id })).toEqual({ cancelled: true })
    expect((await root.query(consoleRef, {}))!.announcements[0]!.broadcast).toMatchObject({ state: 'cancelled' })
    const trail = (await root.query(listActivity, { paginationOpts: { numItems: 20, cursor: null } }))!.page.map(row => row.type)
    expect(trail.filter(type => type === 'announcement.cancelled')).toHaveLength(1)
  })

  test('previews to the administrator\'s own address through the transactional path', async () => {
    const root = await asUser(t, { role: 'admin', email: 'delivered+preview@resend.dev' })
    const { id } = await root.mutation(publish, withBroadcast)
    expect(await root.mutation(preview, { id })).toEqual({ emailId: expect.any(String) })
    const plain = await root.mutation(publish, { message: 'No email', expiresAt: Date.now() + HOUR })
    expect(await refusal(root.mutation(preview, { id: plain.id }))).toMatchObject({ code: 'invalid_input', data: { reason: 'no_broadcast' } })
  })
})
