/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, makeFunctionReference, mutationGeneric } from 'convex/server'
import { v } from 'convex/values'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { setupAudit } from '../../src/convex/integrations/audit'
import { setupEmail } from '../../src/convex/integrations/email'
import { type NotificationsPage, setupNotifications } from '../../src/convex/integrations/notifications'
import { base64urlEncode, generatePushKeys } from '../../src/convex/web-push'

// What the email and push channels decide past the happy path, as
// notification-delivery.test.ts sets them up: how an event's fields become
// the words, which kind opens which page, what the weekly cap and the sunset
// rule do to a notification email, and what each answer of a push service
// does to the push and the device. A channel turned off or a delivery that
// fails between the event and its send leaves the event recorded.

const DAY = 24 * 60 * 60 * 1000
const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
const email = setupEmail(components as never, {
  brand: { name: 'Panels' },
  caps: { perWeek: 2 },
  messages: {
    en: {
      backend: {
        notifications: {
          strip_shared: { title: '{actor} shared {panels} in {workspace}', body: 'Public: {public}' },
          strip_note: { title: 'A note on your strip', body: '{note}' },
        },
      },
    },
  },
})
/** What the email channel handed to the sending rules, and the rules' answer: the message, or `null` when they held it back. */
const prepared: Array<{ to: string, subject: string, html?: string } | null> = []
/** Make the next delivery fail inside the sending rules, as a provider outage would. */
let failNext = false
const notifications = setupNotifications(components as never, {
  email: {
    compose: email.compose,
    preferences: {
      caps: email.preferences.caps,
      prepare: (async (ctx, message, topic, words, options) => {
        if (failNext) {
          failNext = false
          throw new Error('The sending rules could not be read.')
        }
        const result = await email.preferences.prepare(ctx, message, topic, words, options)
        prepared.push(result as never)
        return result
      }) as typeof email.preferences.prepare,
    },
  },
  notify: {
    'app.strip_shared': { channels: ['app', 'email', 'push'], link: event => `/strips/${event.targetId}` },
    'app.strip_quiet': { channels: ['app', 'email', 'push'] },
    'app.strip_note': { channels: ['app', 'push'] },
  },
})
const audit = setupAudit(components as never, { notifications })

const record = mutationGeneric({
  args: { event: v.any() },
  handler: async (ctx, { event }) => audit.recordBackendEvent(ctx, event),
})

const testApp = defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './audit.js': () => Promise.resolve({ record }),
  './notifications.js': () => Promise.resolve({ ...notifications.api }),
})
type App = ReturnType<typeof testApp>

const recordRef = makeFunctionReference<'mutation'>('audit:record')
const listRef = makeFunctionReference<'query', { paginationOpts: { numItems: number, cursor: string | null } }, NotificationsPage>('notifications:listNotifications')
const chooseRef = makeFunctionReference<'mutation', { type: string, channel: string, enabled: boolean }, null>('notifications:setNotificationChannel')
const subscribeRef = makeFunctionReference<'mutation', { endpoint: string, p256dh: string, auth: string }, null>('notifications:subscribePush')

let t: App

beforeEach(() => {
  // Noon UTC.
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'], now: Date.UTC(2026, 9, 28, 12) })
  vi.stubEnv('SITE_URL', 'https://app.example.com')
  vi.stubEnv('AUTH_SECRET', 'test-secret-for-the-notifications-0123456789')
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  prepared.length = 0
  failNext = false
  t = testApp()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const settle = () => t.finishAllScheduledFunctions(() => vi.runAllTimers())

/** The log lines of one level that carry a code. */
const logged = (level: 'info' | 'warn' | 'error', code: string) => vi.mocked(console[level]).mock.calls.filter(call => String(call[0]).includes(code))

/** A browser's subscription: an https endpoint and a real P-256 key. */
async function device(endpoint = 'https://fcm.googleapis.com/fcm/send/device-1') {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  return { endpoint, p256dh: base64urlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))), auth: base64urlEncode(crypto.getRandomValues(new Uint8Array(16))) }
}

/** A push service that answers each push with `status`; its calls, by endpoint. */
function pushService(status: (call: number) => number, headers: Record<string, string> = {}) {
  const fetcher = vi.fn(async () => new Response(null, { status: status(fetcher.mock.calls.length), headers }))
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}

async function withPushKeys() {
  const keys = await generatePushKeys()
  vi.stubEnv('PUSH_PUBLIC_KEY', keys.publicKey)
  vi.stubEnv('PUSH_PRIVATE_KEY', keys.privateKey)
}

describe('setupNotifications({ notify })', () => {
  test('refuses a kind it could not deliver, naming the kind', () => {
    const setup = (notify: Record<string, unknown>) => () => setupNotifications(components as never, { notify: notify as never })
    expect(setup({ strip_shared: { channels: ['app'] } })).toThrow(/strip_shared: a notify key is one of your own event types, under `app\.`/)
    expect(setup({ 'app.strip_shared': { channels: [] } })).toThrow(/app\.strip_shared: channels are/)
    expect(setup({ 'app.strip_shared': { channels: ['sms'] } })).toThrow(/channels are `app`, `email`, `push`/)
    // Its words would sit where a package kind's are.
    expect(setup({ 'app.auth.passkey_added': { channels: ['app'] } })).toThrow(/would replace a package kind's/)
  })
})

describe('the words of a notification email', () => {
  test('list an event\'s fields as text, name the app as its actor and the workspace by its name', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await t.mutation(recordRef, { event: { type: 'app.strip_shared', actor: null, subjectId: ada.userId, entityId: ada.workspaceId, targetId: 'strip_7', data: { panels: ['Dawn', 'Dusk'], public: true } } })
    await settle()
    expect(prepared).toHaveLength(1)
    expect(prepared[0]!.subject).toBe('The app shared Dawn, Dusk in ada\'s workspace')
    expect(prepared[0]!.html).toContain('Public: true')
    expect(prepared[0]!.html).toContain('https://app.example.com/strips/strip_7')
  })

  test('name an administrator for what was done in a session they opened as an account', async () => {
    const admin = await asUser(t, { role: 'admin', workspace: false })
    const visit = await asUser(t, { name: 'Grace', impersonatedBy: admin.userId })
    const ada = await asUser(t, { email: 'ada@example.com', workspace: false })
    await visit.mutation(recordRef, { event: { type: 'app.strip_shared', subjectId: ada.userId, targetId: 'strip_7', data: { panels: ['Dawn'], public: false } } })
    await settle()
    expect(prepared.map(message => message!.subject)).toEqual(['An administrator shared Dawn in a workspace'])
  })

  test('fall back to the inbox\'s title for a kind with no words of its own, and open the profile for one with no link', async () => {
    const ada = await asUser(t, { email: 'ada@example.com', workspace: false })
    await t.mutation(recordRef, { event: { type: 'app.strip_quiet', actor: null, subjectId: ada.userId } })
    await settle()
    expect(prepared.map(message => message!.subject)).toEqual(['New activity'])
    expect(prepared[0]!.html).toContain('https://app.example.com/profile')
  })
})

describe('the sending rules of a notification email', () => {
  test('hold back one past the weekly cap, and let the next week\'s go', async () => {
    const ada = await asUser(t, { email: 'ada@example.com', workspace: false })
    const share = (targetId: string) => t.mutation(recordRef, { event: { type: 'app.strip_shared', actor: null, subjectId: ada.userId, targetId, data: { panels: ['Dawn'], public: true } } })
    for (const id of ['s1', 's2', 's3']) {
      await share(id)
      await settle()
    }
    expect(prepared.map(message => message === null ? 'held' : 'sent')).toEqual(['sent', 'sent', 'held'])
    expect(logged('info', 'email.skipped_capped')).toHaveLength(1)
    // Every one of them is in the inbox all the same.
    expect((await ada.query(listRef, { paginationOpts: { numItems: 10, cursor: null } })).page).toHaveLength(3)

    vi.setSystemTime(Date.now() + 7 * DAY)
    await share('s4')
    await settle()
    expect(prepared.at(-1)).not.toBeNull()
  })

  test('never apply the sunset rule: an account quiet for half a year still hears about its own work', async () => {
    const ada = await asUser(t, { email: 'ada@example.com', workspace: false })
    const share = () => t.mutation(recordRef, { event: { type: 'app.strip_quiet', actor: null, subjectId: ada.userId } })
    await share()
    await settle()
    vi.setSystemTime(Date.now() + 200 * DAY)
    await share()
    await settle()
    expect(prepared.map(message => message === null ? 'held' : 'sent')).toEqual(['sent', 'sent'])
    expect(logged('info', 'email.skipped_sunset')).toEqual([])
  })
})

describe('between the event and its delivery', () => {
  test('a channel turned off before the email goes stops it, and the inbox keeps the event', async () => {
    const ada = await asUser(t, { email: 'ada@example.com', workspace: false })
    await t.mutation(recordRef, { event: { type: 'app.strip_quiet', actor: null, subjectId: ada.userId } })
    await ada.mutation(chooseRef, { type: 'app.strip_quiet', channel: 'email', enabled: false })
    await settle()
    expect(prepared).toEqual([])
    expect((await ada.query(listRef, { paginationOpts: { numItems: 10, cursor: null } })).page.map(item => item.type)).toEqual(['app.strip_quiet'])
  })

  test('a delivery that fails is logged, and the next one goes', async () => {
    const ada = await asUser(t, { email: 'ada@example.com', workspace: false })
    failNext = true
    await t.mutation(recordRef, { event: { type: 'app.strip_quiet', actor: null, subjectId: ada.userId } })
    await settle()
    expect(logged('warn', 'notifications.deliver_failed')).toHaveLength(1)
    expect(String(logged('warn', 'notifications.deliver_failed')[0]![0])).toContain('app.strip_quiet')
    await t.mutation(recordRef, { event: { type: 'app.strip_quiet', actor: null, subjectId: ada.userId } })
    await settle()
    expect(prepared).toHaveLength(1)
  })
})

describe('a push service\'s answer', () => {
  test('a message too large for any push service is dropped before it is sent, and logged', async () => {
    // The most an event's fields hold: 32 values of 128 characters, which the body lists.
    await withPushKeys()
    const fetcher = pushService(() => 201)
    const ada = await asUser(t, { workspace: false })
    await ada.mutation(subscribeRef, await device())
    await t.mutation(recordRef, { event: { type: 'app.strip_note', actor: null, subjectId: ada.userId, data: { note: Array.from({ length: 32 }, () => 'x'.repeat(128)) } } })
    await settle()
    expect(fetcher).not.toHaveBeenCalled()
    expect(logged('warn', 'notifications.push_too_large')).toHaveLength(1)
  })

  test('a refusal is logged as a key problem and keeps the device, which the next push reaches', async () => {
    await withPushKeys()
    const fetcher = pushService(call => (call === 1 ? 403 : 201))
    const ada = await asUser(t, { workspace: false })
    await ada.mutation(subscribeRef, await device())
    await t.mutation(recordRef, { event: { type: 'app.strip_note', actor: null, subjectId: ada.userId, data: { note: 'First.' } } })
    await settle()
    expect(logged('error', 'notifications.push_refused')).toHaveLength(1)
    expect(String(logged('error', 'notifications.push_refused')[0]![0])).toContain('with 403')
    // Not tried again, and not dropped either.
    expect(fetcher).toHaveBeenCalledTimes(1)
    await t.mutation(recordRef, { event: { type: 'app.strip_note', actor: null, subjectId: ada.userId, data: { note: 'Second.' } } })
    await settle()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  test('a push service that stays busy is tried five times, then the push is given up and logged', async () => {
    await withPushKeys()
    const fetcher = pushService(() => 503, { 'Retry-After': '30' })
    const ada = await asUser(t, { workspace: false })
    await ada.mutation(subscribeRef, await device())
    await t.mutation(recordRef, { event: { type: 'app.strip_note', actor: null, subjectId: ada.userId, data: { note: 'Busy.' } } })
    await settle()
    expect(fetcher).toHaveBeenCalledTimes(5)
    expect(logged('warn', 'notifications.push_failed')).toHaveLength(1)
  })
})
