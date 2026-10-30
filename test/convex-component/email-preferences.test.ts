/// <reference types="vite/client" />
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { actionGeneric, componentsGeneric, defineSchema, makeFunctionReference, mutationGeneric } from 'convex/server'
import { v } from 'convex/values'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { confirmationToken, DAY_MS, unsubscribeToken } from '../../src/convex/email-preferences'
import { getBackendError } from '../../src/convex/errors'
import { type EmailLinkView, type EmailTopicPreference, setupEmail } from '../../src/convex/integrations/email'

// The preference center end to end: the app's setupEmail (topics, caps and
// a postal address, as `backend/email.ts` declares them) over the mounted
// component's copy of each person's choices. The profile reads and sets
// topics, a double opt-in waits for its signed link, an unsubscribe link and
// the RFC 8058 route take a person out, the provider's own changes come back
// by webhook, and every send under a topic passes the choice, the sunset,
// the weekly cap and the quiet hours.

const SECRET = 'test-secret-for-the-preferences-0123456789'
const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
const email = setupEmail(components as never, {
  brand: { address: 'Panels Ltd, 1 Example Street, Dublin' },
  topics: {
    productNews: { name: 'Product news', description: 'New features, about once a month.', subscribedByDefault: false, doubleOptIn: true },
    stripTips: { name: 'Strip tips', description: 'Ideas for your next strip.', subscribedByDefault: false },
    updates: { name: 'Updates', description: 'What changed this week.', subscribedByDefault: true },
  },
  caps: { perWeek: 2, quietHours: { start: '21:00', end: '08:00' } },
})

const sendUnder = mutationGeneric({
  args: { to: v.string(), topic: v.optional(v.string()) },
  handler: async (ctx, { to, topic }) => email.send(ctx, { to, subject: 'Hello', html: '<p>Hi</p>', text: 'Hi', ...(topic ? { topic } : {}) }),
})
const oneClick = actionGeneric({
  args: { method: v.string(), token: v.string() },
  handler: async (ctx, { method, token }) => {
    const response = await email.preferences.unsubscribeHandler(ctx, new Request(`https://example.convex.site/email/unsubscribe?token=${encodeURIComponent(token)}`, { method, body: method === 'POST' ? 'List-Unsubscribe=One-Click' : undefined }))
    return { status: response.status, location: response.headers.get('location'), body: await response.text() }
  },
})
const providerChange = mutationGeneric({
  args: { data: v.any(), at: v.optional(v.number()) },
  handler: async (ctx, { data, at }) => email.preferences.providerTopics(ctx, data, at),
})
const providerContact = mutationGeneric({
  args: { data: v.any(), at: v.optional(v.number()) },
  handler: async (ctx, { data, at }) => email.preferences.providerContact(ctx, data, at),
})
const saveIds = mutationGeneric({
  args: { topics: v.any() },
  handler: async (ctx, { topics }) => ctx.runMutation(components.backend.preferences.saveProviderIds, { ids: topics }),
})
const readAs = mutationGeneric({
  args: { email: v.string() },
  handler: async (ctx, args) => ctx.runQuery(components.backend.preferences.read, { email: args.email, topics: [{ key: 'productNews', subscribedByDefault: false }, { key: 'stripTips', subscribedByDefault: false }, { key: 'updates', subscribedByDefault: true }] }),
})
const changeAddress = mutationGeneric({
  args: { userId: v.string(), email: v.string() },
  handler: async (ctx, { userId, email }) => {
    await ctx.runMutation(components.backend.adapter.updateOne, { input: { model: 'user', where: [{ field: '_id', value: userId }], update: { email } } } as never)
  },
})
const consentsOf = mutationGeneric({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => ctx.runQuery(components.backend.consents.history, { userId }),
})

const testApp = defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './email.js': () => Promise.resolve({ ...email.api }),
  './test.js': () => Promise.resolve({ sendUnder, oneClick, providerChange, providerContact, saveIds, readAs, changeAddress, consentsOf }),
})
type App = ReturnType<typeof testApp>

const getPrefs = makeFunctionReference<'query', Record<string, never>, EmailTopicPreference[] | null>('email:getEmailPreferences')
const setTopic = makeFunctionReference<'mutation', { topic: string, subscribed: boolean }, { state: string }>('email:setEmailTopic')
const unsubscribeAll = makeFunctionReference<'mutation'>('email:unsubscribeAllTopics')
const getLink = makeFunctionReference<'query', { token?: string, confirm?: string }, EmailLinkView | null>('email:getEmailLink')
const byLink = makeFunctionReference<'mutation', { token: string, all?: boolean }, boolean>('email:unsubscribeByLink')
const confirmRef = makeFunctionReference<'mutation', { confirm: string }, string>('email:confirmEmailTopic')
const timeZoneRef = makeFunctionReference<'mutation', { timeZone: string }, null>('email:recordTimeZone')
const sendRef = makeFunctionReference<'mutation', { to: string, topic?: string }, string | null>('test:sendUnder')
const oneClickRef = makeFunctionReference<'action', { method: string, token: string }, { status: number, location: string | null, body: string }>('test:oneClick')
const providerRef = makeFunctionReference<'mutation', { data: unknown, at?: number }, null>('test:providerChange')
const providerContactRef = makeFunctionReference<'mutation', { data: unknown, at?: number }, null>('test:providerContact')
const saveIdsRef = makeFunctionReference<'mutation', { topics: unknown }, null>('test:saveIds')
const readRef = makeFunctionReference<'mutation', { email: string }, { contactId: string | null, topics: Array<{ key: string, state: string }> }>('test:readAs')
const changeAddressRef = makeFunctionReference<'mutation', { userId: string, email: string }, null>('test:changeAddress')
const consentsRef = makeFunctionReference<'mutation', { userId: string }, Array<{ kind: string, granted: boolean, source: string, version: string, text?: string }>>('test:consentsOf')

let t: App

beforeAll(() => {
  vi.stubEnv('SITE_URL', 'https://app.example.com')
  vi.stubEnv('CONVEX_SITE_URL', 'https://example.convex.site')
  vi.stubEnv('AUTH_SECRET', SECRET)
})

afterAll(() => {
  vi.unstubAllEnvs()
})

beforeEach(() => {
  // Noon UTC: outside the quiet hours.
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'], now: Date.UTC(2026, 9, 27, 12) })
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  t = testApp()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const states = async (address: string) => Object.fromEntries((await t.mutation(readRef, { email: address })).topics.map(topic => [topic.key, topic.state]))

describe('the profile', () => {
  test('reads each topic with its words and the default for a person who chose nothing', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    expect(await ada.query(getPrefs, {})).toEqual([
      { key: 'productNews', name: 'Product news', description: 'New features, about once a month.', subscribed: false, pending: false },
      { key: 'stripTips', name: 'Strip tips', description: 'Ideas for your next strip.', subscribed: false, pending: false },
      { key: 'updates', name: 'Updates', description: 'What changed this week.', subscribed: true, pending: false },
    ])
    expect(await t.query(getPrefs, {})).toBeNull()
  })

  test('joins a topic at once, and records the consent with the words agreed to', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    expect(await ada.mutation(setTopic, { topic: 'stripTips', subscribed: true })).toEqual({ state: 'subscribed' })
    expect(await states('ada@example.com')).toMatchObject({ stripTips: 'subscribed' })
    expect(await t.mutation(consentsRef, { userId: ada.userId })).toEqual([
      expect.objectContaining({ kind: 'email.topic.stripTips', granted: true, source: 'profile', text: 'Ideas for your next strip.' }),
    ])
    await ada.mutation(setTopic, { topic: 'stripTips', subscribed: false })
    expect((await t.mutation(consentsRef, { userId: ada.userId })).map(row => row.granted)).toEqual([true, false])
  })

  test('records no consent for a topic everyone is in by default', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await ada.mutation(setTopic, { topic: 'updates', subscribed: false })
    expect(await states('ada@example.com')).toMatchObject({ updates: 'unsubscribed' })
    expect(await t.mutation(consentsRef, { userId: ada.userId })).toEqual([])
  })

  test('refuses a topic that is not declared', async () => {
    const ada = await asUser(t)
    const error = await ada.mutation(setTopic, { topic: 'nope', subscribed: true }).catch(caught => caught)
    expect(getBackendError(error)).toMatchObject({ code: 'invalid_input', data: { field: 'topic' } })
  })

  test('leaves every topic at once', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await ada.mutation(setTopic, { topic: 'stripTips', subscribed: true })
    await ada.mutation(unsubscribeAll, {})
    expect(await states('ada@example.com')).toEqual({ productNews: 'unsubscribed', stripTips: 'unsubscribed', updates: 'unsubscribed' })
  })
})

describe('double opt-in', () => {
  test('waits for the signed link, which works once', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    expect(await ada.mutation(setTopic, { topic: 'productNews', subscribed: true })).toEqual({ state: 'pending' })
    expect((await ada.query(getPrefs, {}))![0]).toMatchObject({ subscribed: false, pending: true })
    const { contactId } = await t.mutation(readRef, { email: 'ada@example.com' })
    const confirm = await confirmationToken(SECRET, contactId!, 'productNews', Date.now() + DAY_MS)

    expect(await t.query(getLink, { confirm })).toEqual({ kind: 'confirm', topic: { key: 'productNews', name: 'Product news', description: 'New features, about once a month.' }, subscribed: false })
    expect(await t.mutation(confirmRef, { confirm })).toBe('confirmed')
    expect(await t.mutation(confirmRef, { confirm })).toBe('nothing')
    expect(await states('ada@example.com')).toMatchObject({ productNews: 'subscribed' })
    expect(await t.mutation(consentsRef, { userId: ada.userId })).toEqual([expect.objectContaining({ kind: 'email.topic.productNews', source: 'double-opt-in', granted: true })])
  })

  test('sends one confirmation in five minutes, however often the person asks or leaves and joins again', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    // No EMAIL_API_KEY: each confirmation the app sends is logged as skipped.
    const confirmations = () => vi.mocked(console.warn).mock.calls.flat().filter(line => String(line).includes('email.skipped_no_api_key')).length
    expect(await ada.mutation(setTopic, { topic: 'productNews', subscribed: true })).toEqual({ state: 'pending' })
    await ada.mutation(setTopic, { topic: 'productNews', subscribed: true })
    await ada.mutation(setTopic, { topic: 'productNews', subscribed: false })
    expect(await ada.mutation(setTopic, { topic: 'productNews', subscribed: true })).toEqual({ state: 'pending' })
    expect(confirmations()).toBe(1)
    vi.setSystemTime(Date.now() + 5 * 60_000 + 1000)
    await ada.mutation(setTopic, { topic: 'productNews', subscribed: true })
    expect(confirmations()).toBe(2)
  })

  test('lapses after 7 days, and a forged link does nothing', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await ada.mutation(setTopic, { topic: 'productNews', subscribed: true })
    const { contactId } = await t.mutation(readRef, { email: 'ada@example.com' })
    const confirm = await confirmationToken(SECRET, contactId!, 'productNews', Date.now() + 7 * DAY_MS)
    expect(await t.mutation(confirmRef, { confirm: await confirmationToken('another-secret-entirely-0123456789', contactId!, 'productNews', Date.now() + DAY_MS) })).toBe('nothing')
    vi.setSystemTime(Date.now() + 7 * DAY_MS + 1)
    expect(await t.mutation(confirmRef, { confirm })).toBe('nothing')
    expect(await states('ada@example.com')).toMatchObject({ productNews: 'unsubscribed' })
  })
})

describe('sending under a topic', () => {
  test('goes only to people in the topic, and logs a skip without the address', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    expect(await t.mutation(sendRef, { to: 'ada@example.com', topic: 'stripTips' })).toBeNull()
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('email.skipped_unsubscribed'))
    expect(vi.mocked(console.info).mock.calls.flat().join(' ')).not.toContain('ada@example.com')
    await ada.mutation(setTopic, { topic: 'stripTips', subscribed: true })
    vi.mocked(console.info).mockClear()
    // No EMAIL_API_KEY on the component: the send passes the gate and no-ops there.
    await t.mutation(sendRef, { to: 'ada@example.com', topic: 'stripTips' })
    expect(console.info).not.toHaveBeenCalledWith(expect.stringContaining('email.skipped'))
  })

  test('refuses a topic that is not declared', async () => {
    const declared = await t.mutation(sendRef, { to: 'ada@example.com', topic: 'nope' }).catch(caught => caught)
    expect(getBackendError(declared)).toMatchObject({ code: 'invalid_input', data: { field: 'topic' } })
  })

  test('stops at the weekly cap, across every topic', async () => {
    await t.mutation(sendRef, { to: 'ada@example.com', topic: 'updates' })
    await t.mutation(sendRef, { to: 'ada@example.com', topic: 'updates' })
    vi.mocked(console.info).mockClear()
    expect(await t.mutation(sendRef, { to: 'ada@example.com', topic: 'updates' })).toBeNull()
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('email.skipped_capped'))
    vi.setSystemTime(Date.now() + 7 * DAY_MS)
    vi.mocked(console.info).mockClear()
    await t.mutation(sendRef, { to: 'ada@example.com', topic: 'updates' })
    expect(console.info).not.toHaveBeenCalledWith(expect.stringContaining('email.skipped'))
  })

  test('sunsets a reader with no click and no activity for 180 days, until they come back', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await t.mutation(sendRef, { to: 'ada@example.com', topic: 'updates' })
    vi.setSystemTime(Date.now() + 181 * DAY_MS)
    vi.mocked(console.info).mockClear()
    expect(await t.mutation(sendRef, { to: 'ada@example.com', topic: 'updates' })).toBeNull()
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('email.skipped_sunset'))
    await ada.mutation(timeZoneRef, { timeZone: 'Europe/Dublin' })
    vi.mocked(console.info).mockClear()
    await t.mutation(sendRef, { to: 'ada@example.com', topic: 'updates' })
    expect(console.info).not.toHaveBeenCalledWith(expect.stringContaining('email.skipped'))
  })
})

describe('an address change', () => {
  test('a send right after it reads the account\'s choices, which move to the new address', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await ada.mutation(setTopic, { topic: 'updates', subscribed: false })
    await t.mutation(changeAddressRef, { userId: ada.userId, email: 'ada@new.example.com' })
    vi.mocked(console.info).mockClear()
    await t.mutation(sendRef, { to: 'ada@new.example.com', topic: 'updates' })
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('email.skipped_unsubscribed'))
    expect(await states('ada@new.example.com')).toMatchObject({ updates: 'unsubscribed' })
    expect((await t.mutation(readRef, { email: 'ada@example.com' })).contactId).toBeNull()
  })

  test('an address another contact holds takes the account\'s choices, and no row keeps the old address', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await ada.mutation(setTopic, { topic: 'updates', subscribed: false })
    // Mail to the new address before the account moved to it: a contact of its own, with no account.
    await t.mutation(sendRef, { to: 'ada@new.example.com', topic: 'updates' })
    const { contactId: theirs } = await t.mutation(readRef, { email: 'ada@new.example.com' })
    await t.mutation(changeAddressRef, { userId: ada.userId, email: 'ada@new.example.com' })
    vi.mocked(console.info).mockClear()
    await t.mutation(sendRef, { to: 'ada@new.example.com', topic: 'updates' })
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('email.skipped_unsubscribed'))
    expect((await t.mutation(readRef, { email: 'ada@new.example.com' })).contactId).toBe(theirs)
    expect((await t.mutation(readRef, { email: 'ada@example.com' })).contactId).toBeNull()
    expect((await ada.query(getPrefs, {}))!.find(topic => topic.key === 'updates')).toMatchObject({ subscribed: false })
  })

  test('removes the old address\'s contact at the provider, and writes the new one', async () => {
    vi.stubEnv('EMAIL_API_KEY', 're_test_key')
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input instanceof Request ? input.url : input))
      calls.push(`${init?.method ?? 'GET'} ${decodeURIComponent(url.pathname)}`)
      return new Response(JSON.stringify({ object: 'contact', id: 'c_1' }), { status: 200, headers: { 'content-type': 'application/json' } })
    }))
    try {
      const ada = await asUser(t, { email: 'delivered+ada@resend.dev' })
      await ada.mutation(setTopic, { topic: 'updates', subscribed: false })
      await t.finishAllScheduledFunctions(() => vi.runAllTimers())
      calls.length = 0
      await t.mutation(changeAddressRef, { userId: ada.userId, email: 'delivered+ada-new@resend.dev' })
      await t.mutation(sendRef, { to: 'delivered+ada-new@resend.dev', topic: 'updates' })
      await t.finishAllScheduledFunctions(() => vi.runAllTimers())
      expect(calls).toContain('DELETE /contacts/delivered+ada@resend.dev')
      expect(calls).toContain('POST /contacts')
      expect(calls).not.toContain('DELETE /contacts/delivered+ada-new@resend.dev')
    }
    finally {
      vi.unstubAllGlobals()
      vi.stubEnv('EMAIL_API_KEY', undefined)
    }
  })
})

describe('the provider\'s contact', () => {
  test('joins the accounts\' segment for an account, and never for an address with no account', async () => {
    vi.stubEnv('EMAIL_API_KEY', 're_test_key')
    const created: Array<Record<string, unknown>> = []
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input instanceof Request ? input.url : input))
      if ((init?.method ?? 'GET') === 'POST' && url.pathname === '/contacts') created.push(JSON.parse(String(init!.body)) as Record<string, unknown>)
      return new Response(JSON.stringify({ object: 'contact', id: 'c_1' }), { status: 200, headers: { 'content-type': 'application/json' } })
    }))
    try {
      await t.mutation(saveIdsRef, { topics: [{ kind: 'segment', key: 'accounts', providerId: 'seg_accounts' }, { kind: 'topic', key: 'updates', providerId: 'top_updates', version: 'v1' }] })
      // An address with no account leaves a topic by its one-click link.
      await t.mutation(sendRef, { to: 'delivered+lead@resend.dev', topic: 'updates' })
      const { contactId } = await t.mutation(readRef, { email: 'delivered+lead@resend.dev' })
      await t.action(oneClickRef, { method: 'POST', token: await unsubscribeToken(SECRET, contactId!, 'updates') })
      const ada = await asUser(t, { email: 'delivered+ada@resend.dev' })
      await ada.mutation(setTopic, { topic: 'updates', subscribed: false })
      await t.finishAllScheduledFunctions(() => vi.runAllTimers())
      expect(created).toEqual([
        { email: 'delivered+lead@resend.dev' },
        { email: 'delivered+ada@resend.dev', segments: [{ id: 'seg_accounts' }] },
      ])
    }
    finally {
      vi.unstubAllGlobals()
      vi.stubEnv('EMAIL_API_KEY', undefined)
    }
  })
})

describe('the quiet hours', () => {
  test('hold a send to their end, and it asks the topic again as it goes', async () => {
    vi.stubEnv('EMAIL_API_KEY', 're_test_key')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ object: 'contact', id: 'c_1' }), { status: 200, headers: { 'content-type': 'application/json' } })))
    try {
      const ada = await asUser(t, { email: 'delivered+ada@resend.dev' })
      await ada.mutation(setTopic, { topic: 'stripTips', subscribed: true })
      // 22:30 UTC, in the quiet hours of a person with no time zone known: no id until they end.
      vi.setSystemTime(Date.UTC(2026, 9, 27, 22, 30))
      expect(await t.mutation(sendRef, { to: 'delivered+ada@resend.dev', topic: 'stripTips' })).toBeNull()
      await ada.mutation(setTopic, { topic: 'stripTips', subscribed: false })
      vi.mocked(console.info).mockClear()
      await t.finishAllScheduledFunctions(() => vi.runAllTimers())
      expect(console.info).toHaveBeenCalledWith(expect.stringContaining('held by the quiet hours, was not sent'))
    }
    finally {
      vi.unstubAllGlobals()
      vi.stubEnv('EMAIL_API_KEY', undefined)
    }
  })
})

describe('the unsubscribe link', () => {
  const tokenFor = async (address: string, topic: string) => {
    const { contactId } = await t.mutation(readRef, { email: address })
    return unsubscribeToken(SECRET, contactId!, topic)
  }

  test('names its topic, and leaves it with one press on the page', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await ada.mutation(setTopic, { topic: 'stripTips', subscribed: true })
    const token = await tokenFor('ada@example.com', 'stripTips')
    expect(await t.query(getLink, { token })).toEqual({ kind: 'unsubscribe', topic: { key: 'stripTips', name: 'Strip tips', description: 'Ideas for your next strip.' }, subscribed: true })
    expect(await t.mutation(byLink, { token })).toBe(true)
    expect(await states('ada@example.com')).toMatchObject({ stripTips: 'unsubscribed', updates: 'subscribed' })
    expect(await t.query(getLink, { token })).toMatchObject({ subscribed: false })
    await t.mutation(byLink, { token, all: true })
    expect(await states('ada@example.com')).toMatchObject({ updates: 'unsubscribed' })
  })

  test('refuses a forged token on the page, and reads nothing from it', async () => {
    const forged = await unsubscribeToken('another-secret-entirely-0123456789', 'k1234', 'stripTips')
    expect(await t.query(getLink, { token: forged })).toBeNull()
    expect(getBackendError(await t.mutation(byLink, { token: forged }).catch(caught => caught))).toMatchObject({ code: 'invalid_input', data: { field: 'token' } })
  })
})

describe('one-click unsubscribe (RFC 8058)', () => {
  test('a GET changes nothing and sends the reader to the page; a POST unsubscribes and answers 200 with an empty body', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await ada.mutation(setTopic, { topic: 'stripTips', subscribed: true })
    const { contactId } = await t.mutation(readRef, { email: 'ada@example.com' })
    const token = await unsubscribeToken(SECRET, contactId!, 'stripTips')

    const opened = await t.action(oneClickRef, { method: 'GET', token })
    expect(opened.status).toBe(302)
    expect(opened.location).toBe(`https://app.example.com/unsubscribe?token=${encodeURIComponent(token)}`)
    expect(await states('ada@example.com')).toMatchObject({ stripTips: 'subscribed' })

    expect(await t.action(oneClickRef, { method: 'POST', token })).toEqual({ status: 200, location: null, body: '' })
    expect(await states('ada@example.com')).toMatchObject({ stripTips: 'unsubscribed' })
  })

  test('answers 200 for a token that names nobody, so the status reveals nothing', async () => {
    expect((await t.action(oneClickRef, { method: 'POST', token: 'garbage' })).status).toBe(200)
    expect((await t.action(oneClickRef, { method: 'POST', token: await unsubscribeToken(SECRET, 'k000000000000000', 'stripTips') })).status).toBe(200)
  })
})

describe('the provider\'s own changes', () => {
  test('come back by webhook, by the topic ids email sync kept', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await ada.mutation(setTopic, { topic: 'stripTips', subscribed: true })
    await t.mutation(saveIdsRef, { topics: [{ kind: 'topic', key: 'stripTips', providerId: 'top_tips', version: 'v1' }] })
    await t.mutation(providerRef, { data: { email: 'Ada@Example.com', topics: [{ id: 'top_tips', subscription: 'opt_out' }, { id: 'top_unknown', subscription: 'opt_in' }] } })
    expect(await states('ada@example.com')).toMatchObject({ stripTips: 'unsubscribed' })
    expect((await t.mutation(consentsRef, { userId: ada.userId })).at(-1)).toMatchObject({ kind: 'email.topic.stripTips', granted: false, source: 'provider' })
  })

  test('never undo a newer choice with a late or repeated event', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await t.mutation(saveIdsRef, { topics: [{ kind: 'topic', key: 'stripTips', providerId: 'top_tips', version: 'v1' }] })
    // The echo of joining arrives after the person left again.
    const joinedAt = Date.now()
    await ada.mutation(setTopic, { topic: 'stripTips', subscribed: true })
    vi.setSystemTime(Date.now() + 60_000)
    await ada.mutation(setTopic, { topic: 'stripTips', subscribed: false })
    await t.mutation(providerRef, { data: { email: 'ada@example.com', topics: [{ id: 'top_tips', subscription: 'opt_in' }] }, at: joinedAt + 1000 })
    expect(await states('ada@example.com')).toMatchObject({ stripTips: 'unsubscribed' })
    // A change at the provider after it is followed, and so is a later one there.
    await t.mutation(providerRef, { data: { email: 'ada@example.com', topics: [{ id: 'top_tips', subscription: 'opt_in' }] }, at: Date.now() + 1000 })
    expect(await states('ada@example.com')).toMatchObject({ stripTips: 'subscribed' })
    await t.mutation(providerRef, { data: { email: 'ada@example.com', topics: [{ id: 'top_tips', subscription: 'opt_out' }] }, at: Date.now() + 2000 })
    expect(await states('ada@example.com')).toMatchObject({ stripTips: 'unsubscribed' })
  })

  test('unsubscribed from everything at the provider leaves every topic once, and a later rejoin stands', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await ada.mutation(setTopic, { topic: 'stripTips', subscribed: true })
    vi.setSystemTime(Date.now() + 60_000)
    await t.mutation(providerContactRef, { data: { email: 'Ada@Example.com', unsubscribed: true }, at: Date.now() })
    expect(await states('ada@example.com')).toEqual({ productNews: 'unsubscribed', stripTips: 'unsubscribed', updates: 'unsubscribed' })
    expect((await t.mutation(consentsRef, { userId: ada.userId })).at(-1)).toMatchObject({ kind: 'email.topic.stripTips', granted: false, source: 'provider' })
    // The person joins again here: each later change of the contact repeats the flag, and leaves the choice alone.
    vi.setSystemTime(Date.now() + 60_000)
    await ada.mutation(setTopic, { topic: 'stripTips', subscribed: true })
    await t.mutation(providerContactRef, { data: { email: 'ada@example.com', unsubscribed: true }, at: Date.now() + 1000 })
    expect(await states('ada@example.com')).toMatchObject({ stripTips: 'subscribed' })
    // Subscribed again there subscribes nobody here.
    await t.mutation(providerContactRef, { data: { email: 'ada@example.com', unsubscribed: false }, at: Date.now() + 2000 })
    expect(await states('ada@example.com')).toMatchObject({ updates: 'unsubscribed' })
  })
})
