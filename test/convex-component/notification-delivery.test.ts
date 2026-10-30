/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, makeFunctionReference, mutationGeneric } from 'convex/server'
import { v } from 'convex/values'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { setupAudit } from '../../src/convex/integrations/audit'
import { setupEmail } from '../../src/convex/integrations/email'
import { type NotificationKindChoice, setupNotifications } from '../../src/convex/integrations/notifications'
import { base64urlEncode, generatePushKeys } from '../../src/convex/web-push'

// Email and push notifications end to end: the event is recorded, the
// component writes the inbox row and only enqueues the email and the push
// (the app's deliverNotification, by its handle), which reads the person's
// address and language, words the notification in the app's messages, and
// sends under the person's channel choices and the quiet hours.

const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
const email = setupEmail(components as never, {
  brand: { name: 'Panels' },
  caps: { quietHours: { start: '21:00', end: '08:00' } },
  messages: { en: { backend: { notifications: { strip_shared: { title: '{actor} shared a strip with you', body: 'Open it to read and comment.' } } } } },
})
/** What the email channel handed to the sending rules: the message, as rendered. */
const prepared: Array<{ to: string, subject: string, html?: string, deliverAt?: number }> = []
const notifications = setupNotifications(components as never, {
  email: {
    compose: email.compose,
    preferences: {
      caps: email.preferences.caps,
      prepare: (async (ctx, message, topic, words, options) => {
        const result = await email.preferences.prepare(ctx, message, topic, words, options)
        if (result) prepared.push(result as never)
        return result
      }) as typeof email.preferences.prepare,
    },
  },
  notify: {
    'app.strip_shared': { channels: ['app', 'email', 'push'], link: event => `/strips/${event.targetId}` },
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
const channelsRef = makeFunctionReference<'query', Record<string, never>, NotificationKindChoice[] | null>('notifications:getNotificationChannels')
const chooseRef = makeFunctionReference<'mutation', { type: string, channel: string, enabled: boolean }, null>('notifications:setNotificationChannel')
const configRef = makeFunctionReference<'query', Record<string, never>, { publicKey: string | null }>('notifications:getPushConfig')
const subscribeRef = makeFunctionReference<'mutation', { endpoint: string, p256dh: string, auth: string }, null>('notifications:subscribePush')
const unsubscribeRef = makeFunctionReference<'mutation', { endpoint: string }, null>('notifications:unsubscribePush')

let t: App

beforeEach(async () => {
  // Noon UTC: outside the quiet hours.
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'], now: Date.UTC(2026, 9, 28, 12) })
  vi.stubEnv('SITE_URL', 'https://app.example.com')
  vi.stubEnv('AUTH_SECRET', 'test-secret-for-the-notifications-0123456789')
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  prepared.length = 0
  t = testApp()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** A browser's subscription: an https endpoint and a real P-256 key. */
async function device(endpoint = 'https://fcm.googleapis.com/fcm/send/device-1') {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  return { endpoint, p256dh: base64urlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))), auth: base64urlEncode(crypto.getRandomValues(new Uint8Array(16))) }
}

async function withPushKeys() {
  const keys = await generatePushKeys()
  vi.stubEnv('PUSH_PUBLIC_KEY', keys.publicKey)
  vi.stubEnv('PUSH_PRIVATE_KEY', keys.privateKey)
  return keys
}

const settle = () => t.finishAllScheduledFunctions(() => vi.runAllTimers())

describe('the email channel', () => {
  test('words a package kind in the layout, to the account\'s address, and links its ready-made page', async () => {
    const ada = await asUser(t, { email: 'ada@example.com', workspace: false })
    await ada.mutation(recordRef, { event: { type: 'auth.passkey_added' } })
    await settle()
    expect(prepared).toEqual([expect.objectContaining({ to: 'ada@example.com', subject: 'A passkey was added' })])
    expect(prepared[0]!.html).toContain('https://app.example.com/security')
    expect(prepared[0]!.html).toContain('Panels')
  })

  test('words an app\'s own kind in the app\'s messages, with the actor\'s name and its link', async () => {
    const grace = await asUser(t, { name: 'Grace', workspace: false })
    const ada = await asUser(t, { email: 'ada@example.com', workspace: false })
    await grace.mutation(recordRef, { event: { type: 'app.strip_shared', subjectId: ada.userId, targetId: 'strip_7' } })
    await settle()
    expect(prepared.map(message => message.subject)).toEqual(['Grace shared a strip with you'])
    expect(prepared[0]!.html).toContain('https://app.example.com/strips/strip_7')
  })

  test('never goes out for a billing kind, and the inbox row names the channels it went out on', async () => {
    const ada = await asUser(t, { email: 'ada@example.com', workspace: false })
    await t.mutation(recordRef, { event: { type: 'billing.order_paid', actor: null, subjectId: ada.userId, data: { amount: 1, currency: 'usd' } } })
    await ada.mutation(recordRef, { event: { type: 'auth.passkey_removed' } })
    await settle()
    expect(prepared.map(message => message.subject)).toEqual(['A passkey was removed'])
  })

  test('waits for the end of the person\'s quiet hours', async () => {
    vi.setSystemTime(Date.UTC(2026, 9, 28, 22, 30))
    const ada = await asUser(t, { email: 'ada@example.com', workspace: false })
    await ada.mutation(recordRef, { event: { type: 'auth.passkey_added' } })
    await settle()
    expect(prepared[0]!.deliverAt).toBe(Date.UTC(2026, 9, 29, 8))
  })
})

describe('the person\'s channel choices', () => {
  test('list every kind with the channels it allows, on until turned off, and a channel turned off is skipped', async () => {
    const ada = await asUser(t, { email: 'ada@example.com', workspace: false })
    const kinds = (await ada.query(channelsRef, {}))!
    expect(kinds.find(kind => kind.type === 'auth.passkey_added')!.channels).toEqual([{ channel: 'app', enabled: true }, { channel: 'email', enabled: true }])
    expect(kinds.find(kind => kind.type === 'billing.order_paid')!.channels).toEqual([{ channel: 'app', enabled: true }])
    expect(kinds.find(kind => kind.type === 'app.strip_shared')!.channels.map(choice => choice.channel)).toEqual(['app', 'email', 'push'])

    await ada.mutation(chooseRef, { type: 'auth.passkey_added', channel: 'email', enabled: false })
    expect((await ada.query(channelsRef, {}))!.find(kind => kind.type === 'auth.passkey_added')!.channels[1]).toEqual({ channel: 'email', enabled: false })
    await ada.mutation(recordRef, { event: { type: 'auth.passkey_added' } })
    await settle()
    expect(prepared).toEqual([])
  })

  test('offer the new-device email, which the sign-in sends itself, and hold the auth layer to the choice', async () => {
    const ada = await asUser(t, { email: 'ada@example.com', workspace: false })
    expect((await ada.query(channelsRef, {}))!.find(kind => kind.type === 'auth.new_device')!.channels).toEqual([{ channel: 'app', enabled: true }, { channel: 'email', enabled: true }])
    const open = () => t.run(ctx => ctx.runMutation(components.backend.notifications.channelOpen, { userId: ada.userId, type: 'auth.new_device', channel: 'email' }))
    expect(await open()).toBe(true)
    await ada.mutation(chooseRef, { type: 'auth.new_device', channel: 'email', enabled: false })
    expect(await open()).toBe(false)
    // The notification itself never emails: the sign-in sends the one email, with the place and time.
    await ada.mutation(recordRef, { event: { type: 'auth.new_device', actor: { userId: ada.userId } } })
    await settle()
    expect(prepared).toEqual([])
  })

  test('refuse a channel the kind does not allow, and anyone signed out', async () => {
    const ada = await asUser(t, { workspace: false })
    await expect(ada.mutation(chooseRef, { type: 'billing.order_paid', channel: 'email', enabled: true })).rejects.toThrow(/does not notify by email/)
    expect(await t.query(channelsRef, {})).toBeNull()
  })
})

describe('the push channel', () => {
  test('is off until the key pair is set, and refuses a subscription that is not a browser\'s', async () => {
    const ada = await asUser(t, { workspace: false })
    expect(await ada.query(configRef, {})).toEqual({ publicKey: null })
    await expect(ada.mutation(subscribeRef, await device())).rejects.toThrow(/PUSH_PUBLIC_KEY/)
    const keys = await withPushKeys()
    expect(await ada.query(configRef, {})).toEqual({ publicKey: keys.publicKey })
    await expect(ada.mutation(subscribeRef, { endpoint: 'http://insecure.example.com', p256dh: 'x', auth: 'y' })).rejects.toThrow(/push subscription/)
  })

  test('sends each of the person\'s devices the signed, encrypted message, and drops one that is gone', async () => {
    await withPushKeys()
    const fetcher = vi.fn(async (url: string) => new Response(null, { status: url.endsWith('device-2') ? 410 : 201 }))
    vi.stubGlobal('fetch', fetcher)
    const grace = await asUser(t, { name: 'Grace', workspace: false })
    const ada = await asUser(t, { workspace: false })
    await ada.mutation(subscribeRef, await device())
    await ada.mutation(subscribeRef, await device('https://fcm.googleapis.com/fcm/send/device-2'))
    await grace.mutation(recordRef, { event: { type: 'app.strip_shared', subjectId: ada.userId, targetId: 'strip_7' } })
    await settle()
    const pushes = fetcher.mock.calls.filter(([url]) => new URL(String(url)).host === 'fcm.googleapis.com')
    expect(pushes.map(([url]) => url).sort()).toEqual(['https://fcm.googleapis.com/fcm/send/device-1', 'https://fcm.googleapis.com/fcm/send/device-2'])
    const [, init] = pushes[0] as unknown as [string, RequestInit]
    expect(init.headers).toMatchObject({ 'Content-Encoding': 'aes128gcm', 'Authorization': expect.stringMatching(/^vapid t=/) })
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('notifications.push_device_gone'))

    // The gone device was dropped: the next push reaches the one left.
    fetcher.mockClear()
    await grace.mutation(recordRef, { event: { type: 'app.strip_shared', subjectId: ada.userId, targetId: 'strip_8' } })
    await settle()
    expect(fetcher.mock.calls.filter(([url]) => new URL(String(url)).host === 'fcm.googleapis.com').map(([url]) => url)).toEqual(['https://fcm.googleapis.com/fcm/send/device-1'])
  })

  test('waits for the end of the person\'s quiet hours', async () => {
    await withPushKeys()
    const sentAt: number[] = []
    vi.stubGlobal('fetch', vi.fn(async () => {
      sentAt.push(Date.now())
      return new Response(null, { status: 201 })
    }))
    vi.setSystemTime(Date.UTC(2026, 9, 28, 22, 30))
    const ada = await asUser(t, { workspace: false })
    await ada.mutation(subscribeRef, await device())
    await ada.mutation(recordRef, { event: { type: 'app.strip_shared', subjectId: ada.userId, targetId: 'strip_7' } })
    await settle()
    expect(sentAt).toHaveLength(1)
    expect(sentAt[0]).toBeGreaterThanOrEqual(Date.UTC(2026, 9, 29, 8))
  })

  test('tries a busy push service again after the wait it asks for, and stops at a device unsubscribed', async () => {
    await withPushKeys()
    let busy = true
    const fetcher = vi.fn(async () => {
      if (busy) {
        busy = false
        return new Response(null, { status: 429, headers: { 'Retry-After': '30' } })
      }
      return new Response(null, { status: 201 })
    })
    vi.stubGlobal('fetch', fetcher)
    const ada = await asUser(t, { workspace: false })
    const subscription = await device()
    await ada.mutation(subscribeRef, subscription)
    await ada.mutation(recordRef, { event: { type: 'app.strip_shared', subjectId: ada.userId, targetId: 'strip_7' } })
    await settle()
    expect(fetcher).toHaveBeenCalledTimes(2)

    await ada.mutation(unsubscribeRef, { endpoint: subscription.endpoint })
    fetcher.mockClear()
    await ada.mutation(recordRef, { event: { type: 'app.strip_shared', subjectId: ada.userId, targetId: 'strip_8' } })
    await settle()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
