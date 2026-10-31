/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { convexTest } from 'convex-test'
import resendComponent from '@convex-dev/resend/test'
import { componentsGeneric, defineSchema, makeFunctionReference, mutationGeneric } from 'convex/server'
import { v } from 'convex/values'
import component, { asUser, defineBackendTestApp } from '../../src/convex/test'
import { api, internal } from '../../src/convex/components/backend/_generated/api'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import schema from '../../src/convex/components/backend/schema'
import { ANNOUNCEMENT_RETENTION_MS, LIVE_ANNOUNCEMENTS_MAX } from '../../src/convex/components/backend/announcements'
import { MAINTENANCE_BATCH } from '../../src/convex/components/backend/maintenance'
import { ERASURE_BATCH } from '../../src/convex/components/backend/audit'
import { getBackendError } from '../../src/convex/errors'
import type { AnnouncementsConsole, LiveAnnouncement } from '../../src/convex/integrations/announcements'
import { setupEmail } from '../../src/convex/integrations/email'

// What announcements.test.ts leaves out: how many notices show at once,
// a broadcast's claim while two sends race or one dies holding it, a
// cancel before, during and after a send, and what an erasure and the
// maintenance pass leave of announcements and their dismissals. The sends
// run through the app's setupEmail against a stand-in provider that can
// hold a call open; the erasure and the retention run the component on its
// own, as account.test.ts and maintenance.test.ts do.

const HOUR = 60 * 60_000
const DAY = 24 * HOUR
const CLAIM_TTL_MS = 2 * 60_000

describe('through the app', () => {
  const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
  const email = setupEmail(components as never, {
    brand: { name: 'Panels', address: 'Panels Ltd, 1 Example Street, Dublin' },
    topics: { productNews: { name: 'Product news', description: 'New features, about once a month.', subscribedByDefault: false } },
  })
  const saveIds = mutationGeneric({
    args: { ids: v.any() },
    handler: async (ctx, { ids }) => ctx.runMutation(components.backend.preferences.saveProviderIds, { ids }),
  })
  const testApp = defineBackendTestApp(defineSchema({}), {
    './_generated/api.js': () => Promise.resolve({}),
    './email.js': () => Promise.resolve({ ...email.api }),
    './test.js': () => Promise.resolve({ saveIds }),
  })

  const getAnnouncements = makeFunctionReference<'query', Record<string, never>, LiveAnnouncement[]>('email:getAnnouncements')
  const consoleRef = makeFunctionReference<'query', Record<string, never>, AnnouncementsConsole | null>('email:getAnnouncementsConsole')
  const publish = makeFunctionReference<'mutation', Record<string, unknown>, { id: string }>('email:publishAnnouncement')
  const send = makeFunctionReference<'action', { id: string, scheduledAt?: number }, { sendAt: number | null }>('email:sendAnnouncement')
  const cancel = makeFunctionReference<'action', { id: string }, { cancelled: boolean }>('email:cancelAnnouncement')
  const saveIdsRef = makeFunctionReference<'mutation', { ids: unknown }, null>('test:saveIds')

  let t: ReturnType<typeof testApp>
  let calls: Array<{ method: string, path: string }>

  /** A provider call held open until `release`, and `reached` once it is made: a slow provider, or a send that died waiting on it. */
  function holdOpen() {
    const reached = Promise.withResolvers<undefined>()
    const held = Promise.withResolvers<undefined>()
    const wait = () => {
      reached.resolve(undefined)
      return held.promise
    }
    return { gate: { reached: reached.promise, release: () => held.resolve(undefined) }, wait }
  }

  /** A stand-in for the email provider: makes a broadcast with a fresh id, sends and deletes it; `hold` keeps the first call it names open. */
  function provider(hold?: { path: string, method: string, wait: () => Promise<undefined> }) {
    let made = 0
    let held = false
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input instanceof Request ? input.url : input))
      const method = init?.method ?? 'GET'
      calls.push({ method, path: url.pathname })
      if (hold && !held && url.pathname === hold.path && method === hold.method) {
        held = true
        await hold.wait()
      }
      const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } })
      if (url.pathname === '/broadcasts' && method === 'POST') return json({ id: `bc_${++made}` })
      return json({ id: 'bc_1', object: 'broadcast' })
    }))
  }

  const posted = (path: string) => calls.filter(call => call.method === 'POST' && call.path === path)
  const withBroadcast = () => ({ message: 'Boards are here.', expiresAt: Date.now() + 24 * HOUR, broadcast: { audience: 'accounts', topic: 'productNews', subject: 'Boards are here', body: 'Try it today.' } })
  const administrator = () => asUser(t, { role: 'admin', email: 'root@example.com' })
  const refusal = (promise: Promise<unknown>) => promise.then(() => null, error => getBackendError(error))
  const broadcastOf = async (root: Awaited<ReturnType<typeof administrator>>) => (await root.query(consoleRef, {}))!.announcements[0]!.broadcast

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'], now: Date.UTC(2026, 9, 27, 12) })
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('SITE_URL', 'https://panels.example.com')
    vi.stubEnv('EMAIL_API_KEY', 're_test_key')
    vi.stubEnv('BACKEND_ENVIRONMENT', 'production')
    calls = []
    t = testApp()
    await t.mutation(saveIdsRef, { ids: [{ kind: 'segment', key: 'accounts', providerId: 'seg_accounts' }, { kind: 'topic', key: 'productNews', providerId: 'top_news' }] })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  test(`shows each person the ${LIVE_ANNOUNCEMENTS_MAX} newest live notices, and the next once one is dismissed`, async () => {
    const root = await administrator()
    for (const message of ['First.', 'Second.', 'Third.', 'Fourth.']) {
      await root.mutation(publish, { message, expiresAt: Date.now() + HOUR })
      vi.advanceTimersByTime(1000)
    }
    const ada = await asUser(t)
    const shown = await ada.query(getAnnouncements, {})
    expect(shown.map(item => item.message)).toEqual(['Fourth.', 'Third.', 'Second.'])
    await ada.mutation(makeFunctionReference<'mutation', { id: string }, null>('email:dismissAnnouncement'), { id: shown[0]!.id })
    expect((await ada.query(getAnnouncements, {})).map(item => item.message)).toEqual(['Third.', 'Second.', 'First.'])
  })

  test('a second send while the first holds the claim is told to wait, and the provider makes and sends one broadcast', async () => {
    const { gate, wait } = holdOpen()
    provider({ path: '/broadcasts', method: 'POST', wait })
    const root = await administrator()
    const { id } = await root.mutation(publish, withBroadcast())
    const first = root.action(send, { id })
    await gate.reached
    expect(await refusal(root.action(send, { id }))).toMatchObject({ code: 'rate_limited', data: { retryAfter: 60_000 } })
    gate.release()
    expect(await first).toEqual({ sendAt: Date.now() })
    expect(posted('/broadcasts')).toHaveLength(1)
    expect(posted('/broadcasts/bc_1/send')).toHaveLength(1)
  })

  test('a claim a send died holding lapses after two minutes, and the next send makes the broadcast', async () => {
    // The first send never comes back from the provider.
    const { gate, wait } = holdOpen()
    provider({ path: '/broadcasts', method: 'POST', wait })
    const root = await administrator()
    const { id } = await root.mutation(publish, withBroadcast())
    void root.action(send, { id })
    await gate.reached
    vi.advanceTimersByTime(CLAIM_TTL_MS - 1000)
    expect(await refusal(root.action(send, { id }))).toMatchObject({ code: 'rate_limited' })
    vi.advanceTimersByTime(2000)
    expect(await root.action(send, { id })).toEqual({ sendAt: Date.now() })
    expect(posted('/broadcasts')).toHaveLength(2)
    expect(calls.filter(call => /^\/broadcasts\/[^/]+\/send$/.test(call.path))).toHaveLength(1)
    expect(await broadcastOf(root)).toMatchObject({ state: 'sent' })
  })

  test('a send whose claim lapsed while the provider made its broadcast keeps none of it: the provider deletes it, and one broadcast goes out', async () => {
    // The first send's create comes back only after its claim lapsed.
    const { gate, wait } = holdOpen()
    provider({ path: '/broadcasts', method: 'POST', wait })
    const root = await administrator()
    const { id } = await root.mutation(publish, withBroadcast())
    const first = root.action(send, { id })
    await gate.reached
    vi.advanceTimersByTime(CLAIM_TTL_MS + 1000)
    // A second send takes the lapsed claim, makes bc_1 and sends it.
    expect(await root.action(send, { id })).toEqual({ sendAt: Date.now() })
    gate.release()
    // The first one's create answers bc_2: it is not the broadcast's.
    expect(await refusal(first)).toMatchObject({ code: 'rate_limited' })
    expect(posted('/broadcasts')).toHaveLength(2)
    expect(calls.filter(call => /^\/broadcasts\/[^/]+\/send$/.test(call.path))).toEqual([{ method: 'POST', path: '/broadcasts/bc_1/send' }])
    expect(calls.filter(call => call.method === 'DELETE')).toEqual([{ method: 'DELETE', path: '/broadcasts/bc_2' }])
    expect(await broadcastOf(root)).toMatchObject({ state: 'sent' })
  })

  test('a broadcast cancelled while the provider makes it is never sent: the provider deletes what the send made', async () => {
    const { gate, wait } = holdOpen()
    provider({ path: '/broadcasts', method: 'POST', wait })
    const root = await administrator()
    const { id } = await root.mutation(publish, withBroadcast())
    const sending = root.action(send, { id })
    await gate.reached
    expect(await root.action(cancel, { id })).toEqual({ cancelled: true })
    gate.release()
    expect(await refusal(sending)).toMatchObject({ code: 'rate_limited' })
    expect(calls.filter(call => /^\/broadcasts\/[^/]+\/send$/.test(call.path))).toEqual([])
    expect(calls.filter(call => call.method === 'DELETE')).toEqual([{ method: 'DELETE', path: '/broadcasts/bc_1' }])
    expect(await broadcastOf(root)).toMatchObject({ state: 'cancelled' })
  })

  test('a draft is cancelled at once, without the provider, and is never sent', async () => {
    provider()
    const root = await administrator()
    const { id } = await root.mutation(publish, withBroadcast())
    expect(await root.action(cancel, { id })).toEqual({ cancelled: true })
    expect(calls).toEqual([])
    expect(await broadcastOf(root)).toMatchObject({ state: 'cancelled' })
    // Cancelled twice is cancelled once.
    expect(await root.action(cancel, { id })).toEqual({ cancelled: false })
    expect(await refusal(root.action(send, { id }))).toMatchObject({ code: 'invalid_input', data: { reason: 'cancelled' } })
  })

  test('a broadcast that went out cannot be called back', async () => {
    provider()
    const root = await administrator()
    const { id } = await root.mutation(publish, withBroadcast())
    await root.action(send, { id })
    calls = []
    expect(await root.action(cancel, { id })).toEqual({ cancelled: false })
    expect(calls).toEqual([])
    expect(await broadcastOf(root)).toMatchObject({ state: 'sent' })
  })

  test('two cancels at once stop the broadcast once: the provider deletes it, and one of them says it cancelled it', async () => {
    const { gate, wait } = holdOpen()
    provider({ path: '/broadcasts/bc_1', method: 'DELETE', wait })
    const root = await administrator()
    const { id } = await root.mutation(publish, withBroadcast())
    await root.action(send, { id, scheduledAt: Date.now() + 2 * HOUR })
    const first = root.action(cancel, { id })
    await gate.reached
    expect(await root.action(cancel, { id })).toEqual({ cancelled: true })
    gate.release()
    expect(await first).toEqual({ cancelled: false })
    expect(await broadcastOf(root)).toMatchObject({ state: 'cancelled' })
  })

  test('a broadcast cancelled while its send is on its way stays cancelled, and the send says it did not go', async () => {
    const { gate, wait } = holdOpen()
    provider({ path: '/broadcasts/bc_1/send', method: 'POST', wait })
    const root = await administrator()
    const { id } = await root.mutation(publish, withBroadcast())
    const sending = root.action(send, { id })
    await gate.reached
    expect(await root.action(cancel, { id })).toEqual({ cancelled: true })
    expect(calls.filter(call => call.method === 'DELETE' && call.path === '/broadcasts/bc_1')).toHaveLength(1)
    gate.release()
    expect(await sending).toEqual({ sendAt: null })
    expect(await broadcastOf(root)).toMatchObject({ state: 'cancelled' })
  })
})

describe('the component on its own', () => {
  let root: ReturnType<typeof convexTest>

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
    root = convexTest(schema, component.modules)
    resendComponent.register(root, 'resend')
    vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  /** An account row, as the auth library writes one. */
  const user = (address: string) => root.run(ctx => ctx.db.insert('user', { name: address, email: address, emailVerified: true, createdAt: Date.now(), updatedAt: Date.now(), role: 'admin' }))
  const announcements = () => root.run(ctx => ctx.db.query('announcements').collect())
  const dismissals = () => root.run(ctx => ctx.db.query('announcementDismissals').collect())

  describe('a broadcast\'s claim', () => {
    test('is completed or let go only by the send that holds it, never by one whose claim lapsed', async () => {
      const id = await root.mutation(api.announcements.publish, { message: 'Boards are here.', expiresAt: Date.now() + DAY, publishedBy: 'admin', broadcast: { audience: 'accounts', topic: 'news', subject: 'S', body: 'B' } })
      const claim = async () => {
        const claimed = await root.mutation(api.announcements.claimBroadcast, { id })
        if (claimed.next !== 'create') throw new Error(`expected a claim to create, got ${claimed.next}`)
        return claimed.claimedAt
      }
      const lapsed = await claim()
      vi.advanceTimersByTime(CLAIM_TTL_MS + 1000)
      const taken = await claim()
      // The send whose claim lapsed comes back: it lets go of nothing, and keeps nothing.
      await root.mutation(api.announcements.releaseBroadcast, { id, claimedAt: lapsed })
      expect(await root.mutation(api.announcements.broadcastCreated, { id, providerId: 'bc_2', claimedAt: lapsed })).toBe(false)
      expect(await root.mutation(api.announcements.broadcastCreated, { id, providerId: 'bc_1', claimedAt: taken })).toBe(true)
      expect((await announcements())[0]!.broadcast).toMatchObject({ state: 'created', providerId: 'bc_1' })
    })
  })

  describe('an erasure', () => {
    const erase = async (userId: string) => {
      await root.mutation(api.account.forget, { userId })
      await root.finishAllScheduledFunctions(() => vi.runAllTimers())
    }

    test('deletes the account\'s dismissals, and names it by its pseudonym on what it published or sent', async () => {
      const gone = await user('gone@example.com')
      const stays = await user('stays@example.com')
      const expiresAt = Date.now() + DAY
      const own = await root.mutation(api.announcements.publish, { message: 'Gone\'s', expiresAt, publishedBy: gone })
      const broadcast = { audience: 'accounts' as const, topic: 'news', subject: 'S', body: 'B' }
      const theirs = await root.mutation(api.announcements.publish, { message: 'Stays\'s', expiresAt, publishedBy: stays, broadcast })
      const claim = await root.mutation(api.announcements.claimBroadcast, { id: theirs })
      await root.mutation(api.announcements.broadcastCreated, { id: theirs, providerId: 'bc_1', claimedAt: claim.next === 'create' ? claim.claimedAt : 0 })
      await root.mutation(api.announcements.broadcastSent, { id: theirs, sentBy: gone, sendAt: Date.now() })
      for (const id of [own, theirs]) {
        await root.mutation(api.announcements.dismiss, { id, userId: gone })
        await root.mutation(api.announcements.dismiss, { id, userId: stays })
      }

      await erase(gone)
      expect((await dismissals()).map(row => row.userId)).toEqual([stays, stays])
      const rows = await announcements()
      const byMessage = Object.fromEntries(rows.map(row => [row.message, row]))
      expect(byMessage['Gone\'s']!.publishedBy).toMatch(/^erased:/)
      expect(byMessage['Stays\'s']!.publishedBy).toBe(stays)
      expect(byMessage['Stays\'s']!.broadcast).toMatchObject({ state: 'sent', sentBy: byMessage['Gone\'s']!.publishedBy, providerId: 'bc_1' })
      expect(JSON.stringify(rows)).not.toContain(gone)
    })

    test(`deletes more dismissals than one batch of ${ERASURE_BATCH} holds`, async () => {
      const gone = await user('gone@example.com')
      await root.run(async (ctx) => {
        for (let index = 0; index <= ERASURE_BATCH; index++) {
          const id = await ctx.db.insert('announcements', { message: `Notice ${index}`, expiresAt: Date.now() + DAY, publishedBy: 'someone' })
          await ctx.db.insert('announcementDismissals', { announcementId: id, userId: gone })
        }
      })
      await erase(gone)
      expect(await dismissals()).toEqual([])
      expect(await announcements()).toHaveLength(ERASURE_BATCH + 1)
    })
  })

  describe('the maintenance pass', () => {
    const runPass = async () => {
      await root.mutation(internal.maintenance.run, {})
      await root.finishAllScheduledFunctions(() => vi.runAllTimers())
    }

    test('deletes an announcement and its dismissals 90 days after it expired, and keeps the rest', async () => {
      const now = Date.now()
      await root.run(async (ctx) => {
        for (const [message, expiresAt] of [['Long gone', now - ANNOUNCEMENT_RETENTION_MS - 1000], ['Lately gone', now - ANNOUNCEMENT_RETENTION_MS + DAY], ['Live', now + DAY]] as const) {
          const id = await ctx.db.insert('announcements', { message, expiresAt, publishedBy: 'admin' })
          for (const userId of ['u1', 'u2']) await ctx.db.insert('announcementDismissals', { announcementId: id, userId })
        }
      })
      await runPass()
      expect((await announcements()).map(row => row.message).sort()).toEqual(['Lately gone', 'Live'])
      expect(await dismissals()).toHaveLength(4)
    })

    test(`works through a backlog in batches: more dismissals than ${MAINTENANCE_BATCH} on one, and more old announcements than one read takes`, async () => {
      const old = Date.now() - ANNOUNCEMENT_RETENTION_MS - DAY
      await root.run(async (ctx) => {
        const crowded = await ctx.db.insert('announcements', { message: 'Crowded', expiresAt: old, publishedBy: 'admin' })
        for (let index = 0; index <= MAINTENANCE_BATCH; index++) await ctx.db.insert('announcementDismissals', { announcementId: crowded, userId: `u${index}` })
        for (let index = 0; index < 7; index++) await ctx.db.insert('announcements', { message: `Old ${index}`, expiresAt: old + index, publishedBy: 'admin' })
        await ctx.db.insert('announcements', { message: 'Live', expiresAt: Date.now() + DAY, publishedBy: 'admin' })
      })
      await runPass()
      expect((await announcements()).map(row => row.message)).toEqual(['Live'])
      expect(await dismissals()).toEqual([])
    })
  })
})
