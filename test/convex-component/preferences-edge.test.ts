/// <reference types="vite/client" />
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, makeFunctionReference, mutationGeneric } from 'convex/server'
import { v } from 'convex/values'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { confirmationToken, DAY_MS, unsubscribeToken } from '../../src/convex/email-preferences'
import { setupEmail } from '../../src/convex/integrations/email'

// The preference center's edges, past email-preferences.test.ts: each
// contact's write to the provider (found there already, its segment, its
// topics, the retries and the give-up), the old address's removal after a
// move, the per-link unsubscribe limit, the rows an address change merges,
// the provider's events about nobody or about older choices, a click that
// restarts the sunset rule, and a contact's part of an export and an erasure.

const SECRET = 'test-secret-for-the-preferences-0123456789'
const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
const email = setupEmail(components as never, {
  brand: { address: 'Panels Ltd, 1 Example Street, Dublin' },
  topics: {
    productNews: { name: 'Product news', description: 'New features, about once a month.', subscribedByDefault: false, doubleOptIn: true },
    stripTips: { name: 'Strip tips', description: 'Ideas for your next strip.', subscribedByDefault: false, softOptIn: true },
    updates: { name: 'Updates', description: 'What changed this week.', subscribedByDefault: true },
  },
  caps: { perWeek: 2 },
})
const TOPICS = [{ key: 'productNews', subscribedByDefault: false }, { key: 'stripTips', subscribedByDefault: false }, { key: 'updates', subscribedByDefault: true }]

const sendUnder = mutationGeneric({
  args: { to: v.string(), topic: v.optional(v.string()) },
  handler: async (ctx, { to, topic }) => email.send(ctx, { to, subject: 'Hello', html: '<p>Hi</p>', text: 'Hi', ...(topic ? { topic } : {}) }),
})
const softOptIn = mutationGeneric({
  args: { email: v.string(), userId: v.optional(v.string()) },
  handler: async (ctx, customer) => email.preferences.softOptIn(ctx, { ...customer, objected: false, checkoutId: 'co_1' }),
})
const engaged = mutationGeneric({
  args: { email: v.optional(v.string()), userId: v.optional(v.string()) },
  handler: async (ctx, who) => email.preferences.engaged(ctx, who),
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
  args: { ids: v.any() },
  handler: async (ctx, { ids }) => ctx.runMutation(components.backend.preferences.saveProviderIds, { ids }),
})
const readAs = mutationGeneric({
  args: { email: v.optional(v.string()), userId: v.optional(v.string()), topics: v.optional(v.any()) },
  handler: async (ctx, { email: address, userId, topics }) => ctx.runQuery(components.backend.preferences.read, { ...(address ? { email: address } : {}), ...(userId ? { userId } : {}), topics: topics ?? TOPICS }),
})
const changeAddress = mutationGeneric({
  args: { userId: v.string(), email: v.string() },
  handler: async (ctx, { userId, email: address }) => {
    await ctx.runMutation(components.backend.adapter.updateOne, { input: { model: 'user', where: [{ field: '_id', value: userId }], update: { email: address } } } as never)
  },
})
const signUp = mutationGeneric({
  args: { userId: v.string(), email: v.string() },
  handler: async (ctx, account) => ctx.runMutation(components.backend.consents.recordSignUp, { ...account, entries: [] }),
})
const consentsOf = mutationGeneric({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => ctx.runQuery(components.backend.consents.history, { userId }),
})
const exportOf = mutationGeneric({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => ctx.runQuery(components.backend.account.exportData, { userId }),
})
const forget = mutationGeneric({
  args: { userId: v.optional(v.string()), email: v.optional(v.string()) },
  handler: async (ctx, target) => ctx.runMutation(components.backend.account.forget, target),
})

const testApp = defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './email.js': () => Promise.resolve({ ...email.api }),
  './test.js': () => Promise.resolve({ sendUnder, softOptIn, engaged, providerChange, providerContact, saveIds, readAs, changeAddress, signUp, consentsOf, exportOf, forget }),
})
type App = ReturnType<typeof testApp>

const setTopic = makeFunctionReference<'mutation', { topic: string, subscribed: boolean }, { state: string }>('email:setEmailTopic')
const getLink = makeFunctionReference<'query', { token?: string, confirm?: string }, { kind: string, subscribed: boolean } | null>('email:getEmailLink')
const byLink = makeFunctionReference<'mutation', { token: string, all?: boolean }, boolean>('email:unsubscribeByLink')
const confirmRef = makeFunctionReference<'mutation', { confirm: string }, string>('email:confirmEmailTopic')
const timeZoneRef = makeFunctionReference<'mutation', { timeZone: string }, null>('email:recordTimeZone')
const ref = {
  send: makeFunctionReference<'mutation', { to: string, topic?: string }, string | null>('test:sendUnder'),
  softOptIn: makeFunctionReference<'mutation', { email: string, userId?: string }, null>('test:softOptIn'),
  engaged: makeFunctionReference<'mutation', { email?: string, userId?: string }, null>('test:engaged'),
  providerTopics: makeFunctionReference<'mutation', { data: unknown, at?: number }, null>('test:providerChange'),
  providerContact: makeFunctionReference<'mutation', { data: unknown, at?: number }, null>('test:providerContact'),
  saveIds: makeFunctionReference<'mutation', { ids: unknown }, null>('test:saveIds'),
  read: makeFunctionReference<'mutation', { email?: string, userId?: string, topics?: unknown }, { contactId: string | null, topics: Array<{ key: string, state: string }> }>('test:readAs'),
  changeAddress: makeFunctionReference<'mutation', { userId: string, email: string }, null>('test:changeAddress'),
  signUp: makeFunctionReference<'mutation', { userId: string, email: string }, { carried: Array<{ kind: string, granted: boolean }> }>('test:signUp'),
  consents: makeFunctionReference<'mutation', { userId: string }, Array<{ kind: string, granted: boolean, source: string, reference?: string }>>('test:consentsOf'),
  export: makeFunctionReference<'mutation', { userId: string }, { emailTopics: Array<Record<string, unknown>>, timeZone?: string } | null>('test:exportOf'),
  forget: makeFunctionReference<'mutation', { userId?: string, email?: string }, unknown>('test:forget'),
}

const IDS = [
  { kind: 'segment', key: 'accounts', providerId: 'seg_accounts' },
  { kind: 'topic', key: 'updates', providerId: 'top_updates', version: 'v1' },
  { kind: 'topic', key: 'productNews', providerId: 'top_news', version: 'v1' },
]

let t: App

/** One request to the provider: its method, its decoded path, its body and when it was made. */
interface Call { method: string, path: string, body: unknown, at: number }
let calls: Call[]

/** A provider's refusal, as its API answers one. */
const refused = (status: number, name = 'application_error') => ({ status, body: { name, message: 'refused', statusCode: status } })

/** A stand-in for the email provider: every request answers as `answer` says, else as made. */
function provider(answer: (call: Call) => { status: number, body?: unknown } | undefined = () => undefined) {
  vi.stubEnv('EMAIL_API_KEY', 're_test_key')
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input))
    const call = { method: init?.method ?? 'GET', path: decodeURIComponent(url.pathname), body: init?.body ? JSON.parse(String(init.body)) as unknown : undefined, at: Date.now() }
    calls.push(call)
    const answered = answer(call) ?? { status: 200, body: { object: 'contact', id: 'c_1' } }
    return new Response(JSON.stringify(answered.body ?? {}), { status: answered.status, headers: { 'content-type': 'application/json' } })
  }))
}

const made = (method: string, path: string) => calls.filter(call => call.method === method && call.path === path)
const settle = () => t.finishAllScheduledFunctions(() => vi.runAllTimers())
const states = async (who: { email?: string, userId?: string }) => Object.fromEntries((await t.mutation(ref.read, who)).topics.map(topic => [topic.key, topic.state]))
const warnings = () => vi.mocked(console.warn).mock.calls.flat().map(String).filter(line => line.includes('email.preferences_unsynced'))
const infos = () => vi.mocked(console.info).mock.calls.flat().map(String)

beforeAll(() => {
  vi.stubEnv('SITE_URL', 'https://app.example.com')
  vi.stubEnv('CONVEX_SITE_URL', 'https://example.convex.site')
  vi.stubEnv('AUTH_SECRET', SECRET)
})

afterAll(() => {
  vi.unstubAllEnvs()
})

beforeEach(() => {
  // Noon UTC: outside any quiet hours.
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'], now: Date.UTC(2026, 9, 27, 12) })
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  calls = []
  t = testApp()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.stubEnv('EMAIL_API_KEY', undefined)
  vi.restoreAllMocks()
})

describe('a contact\'s write to the provider', () => {
  test('is tried again with a doubling wait, and given up after five tries with a warning; the next change writes it', async () => {
    provider(call => (call.method === 'POST' && call.path === '/contacts' ? refused(500) : undefined))
    const ada = await asUser(t, { email: 'delivered+ada@resend.dev' })
    await ada.mutation(setTopic, { topic: 'updates', subscribed: false })
    await settle()
    const tries = made('POST', '/contacts')
    expect(tries).toHaveLength(5)
    expect(tries.slice(1).map((call, index) => call.at - tries[index]!.at)).toEqual([2000, 4000, 8000, 16_000])
    expect(warnings()).toHaveLength(1)

    calls = []
    provider()
    await ada.mutation(setTopic, { topic: 'stripTips', subscribed: true })
    await settle()
    expect(made('POST', '/contacts')).toHaveLength(1)
  })

  test('finds a contact the provider has already, adds an account\'s to the accounts\' segment, then writes its topics', async () => {
    const exists = refused(409, 'already_exists')
    provider(call => (call.method === 'POST' && call.path.startsWith('/contacts') ? exists : undefined))
    await t.mutation(ref.saveIds, { ids: IDS })
    const ada = await asUser(t, { email: 'delivered+ada@resend.dev' })
    await ada.mutation(setTopic, { topic: 'updates', subscribed: false })
    // Bought before it had an account: a contact of its own, never in the accounts' segment.
    await t.mutation(ref.softOptIn, { email: 'delivered+lead@resend.dev' })
    await settle()
    expect(made('POST', '/contacts/delivered+ada@resend.dev/segments/seg_accounts')).toHaveLength(1)
    expect(made('PATCH', '/contacts/delivered+ada@resend.dev/topics').map(call => call.body)).toEqual([[{ id: 'top_updates', subscription: 'opt_out' }]])
    expect(calls.filter(call => call.path.startsWith('/contacts/delivered+lead@resend.dev/segments'))).toEqual([])
    expect(warnings()).toEqual([])
  })

  test('tries again when the segment or the topics are refused, until both land', async () => {
    let segment = 0
    let topics = 0
    provider((call) => {
      if (call.method === 'POST' && call.path === '/contacts') return refused(409, 'already_exists')
      if (call.path.endsWith('/segments/seg_accounts') && ++segment === 1) return refused(500)
      if (call.path.endsWith('/topics') && ++topics === 1) return refused(422, 'validation_error')
      return undefined
    })
    await t.mutation(ref.saveIds, { ids: IDS })
    const ada = await asUser(t, { email: 'delivered+ada@resend.dev' })
    await ada.mutation(setTopic, { topic: 'updates', subscribed: false })
    await settle()
    expect(made('POST', '/contacts')).toHaveLength(3)
    expect({ segment, topics }).toEqual({ segment: 3, topics: 2 })
    expect(warnings()).toEqual([])
  })

  test('writes only the topics the deployment has ids for, never one waiting for its confirmation', async () => {
    provider()
    await t.mutation(ref.saveIds, { ids: IDS })
    const ada = await asUser(t, { email: 'delivered+ada@resend.dev' })
    expect(await ada.mutation(setTopic, { topic: 'productNews', subscribed: true })).toEqual({ state: 'pending' })
    await ada.mutation(setTopic, { topic: 'stripTips', subscribed: true })
    await settle()
    // The contact is made; none of its choices has a topic id to write yet.
    expect(made('POST', '/contacts')).toHaveLength(1)
    expect(calls.filter(call => call.path.endsWith('/topics'))).toEqual([])

    calls = []
    // Already in: nothing changes, so nothing goes to the provider.
    await ada.mutation(setTopic, { topic: 'stripTips', subscribed: true })
    await settle()
    expect(calls).toEqual([])
    await ada.mutation(setTopic, { topic: 'updates', subscribed: false })
    await settle()
    expect(made('PATCH', '/contacts/delivered+ada@resend.dev/topics').map(call => call.body)).toEqual([[{ id: 'top_updates', subscription: 'opt_out' }]])
  })

  test('makes an account the provider\'s contact at its first sign-in, and not again at the next', async () => {
    provider()
    await t.mutation(ref.saveIds, { ids: IDS })
    const ada = await asUser(t, { email: 'delivered+ada@resend.dev' })
    await ada.mutation(timeZoneRef, { timeZone: 'Europe/Dublin' })
    await settle()
    expect(made('POST', '/contacts').map(call => call.body)).toEqual([{ email: 'delivered+ada@resend.dev', segments: [{ id: 'seg_accounts' }] }])
    calls = []
    vi.setSystemTime(Date.now() + 2 * 60 * 60_000)
    await ada.mutation(timeZoneRef, { timeZone: 'Europe/Dublin' })
    await settle()
    expect(calls).toEqual([])
  })

  test('writes nothing for an address the deployment may not mail, and nothing without a key', async () => {
    provider()
    const ada = await asUser(t, { email: 'ada@example.com' })
    await ada.mutation(setTopic, { topic: 'updates', subscribed: false })
    vi.stubEnv('EMAIL_API_KEY', undefined)
    const bob = await asUser(t, { email: 'delivered+bob@resend.dev' })
    await bob.mutation(setTopic, { topic: 'updates', subscribed: false })
    await settle()
    expect(calls.filter(call => call.path.startsWith('/contacts'))).toEqual([])
    expect(warnings()).toEqual([])
  })
})

describe('an account that moved to a new address', () => {
  /** Ada at her old address, written to the provider, then moved to `to`. */
  async function moved(to = 'delivered+ada-new@resend.dev') {
    const ada = await asUser(t, { email: 'delivered+ada@resend.dev' })
    await ada.mutation(setTopic, { topic: 'updates', subscribed: false })
    await settle()
    calls = []
    await t.mutation(ref.changeAddress, { userId: ada.userId, email: to })
    return ada
  }

  test('is fine when the provider no longer has the old address', async () => {
    provider(call => (call.method === 'DELETE' ? refused(404, 'not_found') : undefined))
    await moved()
    await t.mutation(ref.send, { to: 'delivered+ada-new@resend.dev', topic: 'stripTips' })
    await settle()
    expect(made('DELETE', '/contacts/delivered+ada@resend.dev')).toHaveLength(1)
    expect(warnings()).toEqual([])
  })

  test('tries a refused removal again, and gives up after five tries with a warning to remove it by hand', async () => {
    provider(call => (call.method === 'DELETE' ? refused(500) : undefined))
    await moved()
    await t.mutation(ref.send, { to: 'delivered+ada-new@resend.dev', topic: 'stripTips' })
    await settle()
    expect(made('DELETE', '/contacts/delivered+ada@resend.dev')).toHaveLength(5)
    expect(warnings()).toEqual([expect.stringContaining('remove it there by hand')])
  })

  test('leaves the old address at the provider once someone else\'s contact holds it again', async () => {
    provider()
    await moved()
    await t.mutation(ref.send, { to: 'delivered+ada-new@resend.dev', topic: 'stripTips' })
    // Mail to the old address before the removal ran: a contact of its own now.
    await t.mutation(ref.send, { to: 'delivered+ada@resend.dev', topic: 'updates' })
    await settle()
    expect(made('DELETE', '/contacts/delivered+ada@resend.dev')).toEqual([])
  })
})

describe('the one-click limit', () => {
  test('takes 20 unsubscribes a minute by one contact\'s links, ignores more, and counts again the next minute', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await ada.mutation(setTopic, { topic: 'stripTips', subscribed: true })
    const { contactId } = await t.mutation(ref.read, { email: 'ada@example.com' })
    const token = await unsubscribeToken(SECRET, contactId!, 'stripTips')
    for (let hit = 0; hit < 20; hit++) await t.mutation(byLink, { token })
    await ada.mutation(setTopic, { topic: 'stripTips', subscribed: true })
    // The 21st answers as every other, and changes nothing.
    expect(await t.mutation(byLink, { token })).toBe(true)
    expect(await states({ email: 'ada@example.com' })).toMatchObject({ stripTips: 'subscribed' })
    // A minute on (and a second, for the test clock's own millisecond per few commits).
    vi.setSystemTime(Date.now() + 61_000)
    await t.mutation(byLink, { token })
    expect(await states({ email: 'ada@example.com' })).toMatchObject({ stripTips: 'unsubscribed' })
  })

  test('leaving a topic that waited for its confirmation withdraws no consent, since none was given', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    expect(await ada.mutation(setTopic, { topic: 'productNews', subscribed: true })).toEqual({ state: 'pending' })
    await ada.mutation(setTopic, { topic: 'stripTips', subscribed: true })
    await ada.mutation(makeFunctionReference<'mutation'>('email:unsubscribeAllTopics'), {})
    expect(await states({ email: 'ada@example.com' })).toEqual({ productNews: 'unsubscribed', stripTips: 'unsubscribed', updates: 'unsubscribed' })
    expect((await t.mutation(ref.consents, { userId: ada.userId })).map(row => `${row.kind}:${row.granted}`)).toEqual(['email.topic.stripTips:true', 'email.topic.stripTips:false'])
  })

  test('a confirmation link for a contact that is gone confirms nothing', async () => {
    const confirm = await confirmationToken(SECRET, 'k570000000000000000000000000000a', 'productNews', Date.now() + DAY_MS)
    expect(await t.query(getLink, { confirm })).toMatchObject({ kind: 'confirm' })
    expect(await t.mutation(confirmRef, { confirm })).toBe('nothing')
  })
})

describe('an address with no account', () => {
  test('consents by a hash of the address, which the account it signs up with takes', async () => {
    const lead = 'lead@example.com'
    await t.mutation(ref.softOptIn, { email: lead })
    const { contactId } = await t.mutation(ref.read, { email: lead })
    await t.mutation(byLink, { token: await unsubscribeToken(SECRET, contactId!, 'stripTips') })
    const account = await asUser(t, { email: lead })
    const { carried } = await t.mutation(ref.signUp, { userId: account.userId, email: lead })
    expect(carried.map(row => `${row.kind}:${row.granted}`)).toEqual(['email.topic.stripTips:true', 'email.topic.stripTips:false'])
    expect(await t.mutation(ref.consents, { userId: account.userId })).toEqual([
      expect.objectContaining({ kind: 'email.topic.stripTips', granted: true, source: 'soft-opt-in', reference: 'checkout:co_1' }),
      expect.objectContaining({ kind: 'email.topic.stripTips', granted: false, source: 'unsubscribe-page' }),
    ])
  })

  test('becomes the account\'s contact once the account chooses: it joins the accounts\' segment', async () => {
    provider(call => (call.method === 'POST' && call.path === '/contacts' ? refused(409, 'already_exists') : undefined))
    await t.mutation(ref.saveIds, { ids: IDS })
    await t.mutation(ref.softOptIn, { email: 'delivered+lead@resend.dev' })
    await settle()
    expect(calls.filter(call => call.path.includes('/segments/'))).toEqual([])
    const account = await asUser(t, { email: 'delivered+lead@resend.dev' })
    const { contactId } = await t.mutation(ref.read, { email: 'delivered+lead@resend.dev' })
    await account.mutation(setTopic, { topic: 'updates', subscribed: false })
    await settle()
    expect(made('POST', '/contacts/delivered+lead@resend.dev/segments/seg_accounts')).toHaveLength(1)
    // The same row, its choices kept.
    expect(await t.mutation(ref.read, { userId: account.userId })).toMatchObject({ contactId, topics: expect.arrayContaining([{ key: 'stripTips', state: 'subscribed' }]) })
  })
})

describe('an address change onto a row that chose too', () => {
  const NEW = 'ada@new.example.com'

  test('keeps the account\'s choice where it is the newer one, and counts both rows\' sends in the weekly cap', async () => {
    await t.mutation(ref.softOptIn, { email: NEW })
    await t.mutation(ref.send, { to: NEW, topic: 'updates' })
    vi.setSystemTime(Date.now() + 60_000)
    const ada = await asUser(t, { email: 'ada@example.com' })
    await ada.mutation(setTopic, { topic: 'stripTips', subscribed: true })
    vi.setSystemTime(Date.now() + 60_000)
    await ada.mutation(setTopic, { topic: 'stripTips', subscribed: false })
    await t.mutation(ref.send, { to: 'ada@example.com', topic: 'updates' })
    await t.mutation(ref.changeAddress, { userId: ada.userId, email: NEW })
    vi.mocked(console.info).mockClear()
    // The next send moves the account onto the row: one send each this week, so the cap of 2 holds it.
    expect(await t.mutation(ref.send, { to: NEW, topic: 'updates' })).toBeNull()
    expect(infos()).toContainEqual(expect.stringContaining('email.skipped_capped'))
    expect(await states({ email: NEW })).toMatchObject({ stripTips: 'unsubscribed' })
  })

  test('keeps the other row\'s choice where it is the newer one', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await ada.mutation(setTopic, { topic: 'stripTips', subscribed: true })
    vi.setSystemTime(Date.now() + 60_000)
    await t.mutation(ref.softOptIn, { email: NEW })
    const { contactId } = await t.mutation(ref.read, { email: NEW })
    vi.setSystemTime(Date.now() + 60_000)
    await t.mutation(byLink, { token: await unsubscribeToken(SECRET, contactId!, 'stripTips') })
    await t.mutation(ref.changeAddress, { userId: ada.userId, email: NEW })
    await t.mutation(ref.send, { to: NEW, topic: 'updates' })
    expect(await t.mutation(ref.read, { userId: ada.userId })).toMatchObject({ contactId, topics: expect.arrayContaining([{ key: 'stripTips', state: 'unsubscribed' }]) })
  })
})

describe('the provider\'s events', () => {
  test('change nothing for an address with no contact, skip a subscription they do not name, and follow a topic never chosen here', async () => {
    await t.mutation(ref.saveIds, { ids: IDS })
    await t.mutation(ref.providerTopics, { data: { email: 'nobody@example.com', topics: [{ id: 'top_news', subscription: 'opt_in' }] } })
    expect((await t.mutation(ref.read, { email: 'nobody@example.com' })).contactId).toBeNull()

    const ada = await asUser(t, { email: 'ada@example.com' })
    await ada.mutation(setTopic, { topic: 'updates', subscribed: false })
    await t.mutation(ref.providerTopics, { data: { email: 'ada@example.com', topics: [{ id: 'top_updates', subscription: 'subscribed' }, { id: 'top_news', subscription: 'opt_in' }] } })
    expect(await states({ email: 'ada@example.com' })).toMatchObject({ updates: 'unsubscribed', productNews: 'subscribed' })
    // A grant at the provider was recorded where it was given: nothing here.
    expect((await t.mutation(ref.consents, { userId: ada.userId })).filter(row => row.kind === 'email.topic.productNews')).toEqual([])
  })

  test('follow the topic id a later email sync kept, never the one it replaced', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await ada.mutation(setTopic, { topic: 'updates', subscribed: false })
    await t.mutation(ref.saveIds, { ids: [{ kind: 'topic', key: 'stripTips', providerId: 'top_tips_old', version: 'v1' }] })
    await t.mutation(ref.saveIds, { ids: [{ kind: 'topic', key: 'stripTips', providerId: 'top_tips', version: 'v2' }] })
    await t.mutation(ref.providerTopics, { data: { email: ada.email, topics: [{ id: 'top_tips_old', subscription: 'opt_in' }] } })
    expect(await states({ email: ada.email })).toMatchObject({ stripTips: 'unsubscribed' })
    await t.mutation(ref.providerTopics, { data: { email: ada.email, topics: [{ id: 'top_tips', subscription: 'opt_in' }] } })
    expect(await states({ email: ada.email })).toMatchObject({ stripTips: 'subscribed' })
  })

  test('unsubscribed from everything there keeps a topic chosen here after the event, and changes nothing for an address with no contact', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const before = Date.now()
    vi.setSystemTime(Date.now() + 60_000)
    await ada.mutation(setTopic, { topic: 'stripTips', subscribed: true })
    await t.mutation(ref.providerContact, { data: { email: 'ada@example.com', unsubscribed: true }, at: before })
    expect(await states({ email: 'ada@example.com' })).toEqual({ productNews: 'unsubscribed', stripTips: 'subscribed', updates: 'unsubscribed' })
    await t.mutation(ref.providerContact, { data: { email: 'nobody@example.com', unsubscribed: true } })
    expect((await t.mutation(ref.read, { email: 'nobody@example.com' })).contactId).toBeNull()
  })
})

describe('a click or a visit', () => {
  test('restarts the sunset, by address or by account, and moves it at most once an hour', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await t.mutation(ref.send, { to: 'ada@example.com', topic: 'updates' })
    vi.setSystemTime(Date.now() + 100 * DAY_MS)
    await t.mutation(ref.engaged, { email: 'Ada@Example.com' })
    // A second click within the hour moves nothing: the sunset still counts from the first.
    vi.setSystemTime(Date.now() + 59 * 60_000)
    await t.mutation(ref.engaged, { userId: ada.userId })
    vi.setSystemTime(Date.now() - 59 * 60_000 + 180 * DAY_MS + 30 * 60_000)
    vi.mocked(console.info).mockClear()
    expect(await t.mutation(ref.send, { to: 'ada@example.com', topic: 'updates' })).toBeNull()
    expect(infos()).toContainEqual(expect.stringContaining('email.skipped_sunset'))
    await t.mutation(ref.engaged, { userId: ada.userId })
    vi.mocked(console.info).mockClear()
    await t.mutation(ref.send, { to: 'ada@example.com', topic: 'updates' })
    expect(infos().filter(line => line.includes('email.skipped'))).toEqual([])
    // Nobody to engage: no contact is made.
    await t.mutation(ref.engaged, { email: 'nobody@example.com' })
    expect((await t.mutation(ref.read, { email: 'nobody@example.com' })).contactId).toBeNull()
  })
})

describe('a contact\'s part of an export and an erasure', () => {
  test('the export lists each topic choice and the time zone, and an account with none lists none', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await ada.mutation(setTopic, { topic: 'stripTips', subscribed: true })
    await ada.mutation(timeZoneRef, { timeZone: 'Europe/Dublin' })
    expect(await t.mutation(ref.export, { userId: ada.userId })).toMatchObject({
      emailTopics: [{ topic: 'stripTips', state: 'subscribed', source: 'profile', at: expect.any(Number) }],
      timeZone: 'Europe/Dublin',
    })
    const bob = await asUser(t)
    const exported = await t.mutation(ref.export, { userId: bob.userId })
    expect(exported!.emailTopics).toEqual([])
    expect(exported).not.toHaveProperty('timeZone')
    await bob.mutation(setTopic, { topic: 'updates', subscribed: false })
    const chosen = await t.mutation(ref.export, { userId: bob.userId })
    expect(chosen!.emailTopics).toEqual([expect.objectContaining({ topic: 'updates', state: 'unsubscribed' })])
    expect(chosen).not.toHaveProperty('timeZone')
  })

  test('an erasure deletes a contact with more choices than one batch takes, and the links its old row was known by', async () => {
    const NEW = 'ada@new.example.com'
    // More choices than the 200 one erasure batch deletes: the provider's, so no write to it is queued for each.
    const keys = Array.from({ length: 210 }, (_, index) => `topic${index}`)
    const all = keys.map(key => ({ key, subscribedByDefault: false }))
    await t.mutation(ref.saveIds, { ids: keys.map(key => ({ kind: 'topic', key, providerId: `top_${key}`, version: 'v1' })) })
    await t.mutation(ref.send, { to: NEW, topic: 'updates' })
    for (let start = 0; start < keys.length; start += 100) {
      await t.mutation(ref.providerTopics, { data: { email: NEW, topics: keys.slice(start, start + 100).map(key => ({ id: `top_${key}`, subscription: 'opt_in' })) } })
    }
    expect((await t.mutation(ref.read, { email: NEW, topics: all })).topics.every(topic => topic.state === 'subscribed')).toBe(true)
    const ada = await asUser(t, { email: 'ada@example.com' })
    await t.mutation(ref.send, { to: 'ada@example.com', topic: 'updates' })
    const { contactId: former } = await t.mutation(ref.read, { email: 'ada@example.com' })
    const link = await unsubscribeToken(SECRET, former!, 'updates')
    await t.mutation(ref.changeAddress, { userId: ada.userId, email: NEW })
    await t.mutation(ref.send, { to: NEW, topic: 'updates' })
    // The old row merged away; its link reaches the row kept.
    expect(await t.query(getLink, { token: link })).toMatchObject({ kind: 'unsubscribe', subscribed: true })

    await t.mutation(ref.forget, { userId: ada.userId })
    await settle()
    expect(await t.mutation(ref.read, { email: NEW, topics: all })).toMatchObject({ contactId: null })
    expect(await t.mutation(ref.read, { userId: ada.userId })).toMatchObject({ contactId: null })
    expect(await t.query(getLink, { token: link })).toMatchObject({ kind: 'unsubscribe', subscribed: false })
  })

  test('an erasure by address reaches a contact with no account', async () => {
    await t.mutation(ref.softOptIn, { email: 'lead@example.com' })
    await t.mutation(ref.forget, { email: 'Lead@Example.com' })
    await settle()
    expect((await t.mutation(ref.read, { email: 'lead@example.com' })).contactId).toBeNull()
  })
})
