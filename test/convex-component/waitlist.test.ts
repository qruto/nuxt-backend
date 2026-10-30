/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, type FunctionReference, makeFunctionReference, mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { getBackendError } from '../../src/convex/errors'
import { setupAccount } from '../../src/convex/integrations/account'
import { setupAudit } from '../../src/convex/integrations/audit'
import { setupEmail } from '../../src/convex/integrations/email'
import { type AccessConsole, setupAccess } from '../../src/convex/integrations/launch'
import { setupWaitlist, type WaitlistConsole, type WaitlistStatusView } from '../../src/convex/integrations/waitlist'
import { readStatusToken, statusToken } from '../../src/convex/waitlist-rules'

// The waitlist over the mounted component: a join staged by the action, the
// entry made when the sign-in code checks (the gate), the order people wait
// in (verified time moved up by friends), waves an administrator admits,
// leaving, the launch-news mirror and erasure by address. The routes that
// call the gate are held in test/unit/access-auth-flow.test.ts.

const SECRET = 'a-test-secret-that-is-long-enough-1234'
const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
const audit = setupAudit(components as never)
const access = setupAccess(components as never, { phases: ['early-access', 'invite-only', 'public'], audit })
const email = setupEmail(components as never, {})
// The app moved its sign-in page: the "You're in" email follows the paths file.
const waitlist = setupWaitlist(components as never, { access, email, paths: { login: '/sign-in' }, questions: { role: ['Writer', 'Illustrator', 'Reader'] } })

/** What the sign-in hook does when a new address's code checks in early access. */
const checkCode = mutationGeneric({
  args: { email: v.string(), join: v.optional(v.string()) },
  handler: async (ctx, input) => access.gate.waitlist!(ctx, input),
})
const ticketOf = queryGeneric({
  args: { email: v.string() },
  handler: async (ctx, input) => (await access.gate.admission(ctx, input)).ticket,
})
const redeem = mutationGeneric({
  args: { email: v.string() },
  handler: async (ctx, { email: address }) => access.gate.redeem(ctx, { email: address, ticket: 'waitlist' }),
})
const audience = queryGeneric({ args: {}, handler: async ctx => waitlist.launchAudience(ctx) })
// The account that signs up with the address: the launch-news box it ticked is a consent that moves to it.
const account = setupAccount(components as never, { audit })
const signUp = mutationGeneric({ args: { userId: v.string(), email: v.string() }, handler: async (ctx, input) => account.gate.signUp(ctx as never, input) })

const testApp = defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './access.js': () => Promise.resolve({ ...access.api }),
  './audit.js': () => Promise.resolve(audit.api),
  './waitlist.js': () => Promise.resolve({ ...waitlist.api, checkCode, ticketOf, redeem, audience }),
  './account.js': () => Promise.resolve({ ...account.api, signUp }),
})
type App = ReturnType<typeof testApp>

const joinWaitlist = makeFunctionReference<'action', { email: string, answers?: Record<string, string>, launchNews?: boolean, launchNewsText?: string, source?: string, ref?: string, locale?: string, human?: string | null }, { join: string }>('waitlist:joinWaitlist')
const waitlistStatus = makeFunctionReference<'query', { token: string }, WaitlistStatusView | null>('waitlist:waitlistStatus')
const leaveWaitlist = makeFunctionReference<'mutation', { token: string }, null>('waitlist:leaveWaitlist')
const getWaitlistConsole = makeFunctionReference<'query', { status?: string, domain?: string, source?: string, question?: string, answer?: string }, WaitlistConsole | null>('waitlist:getWaitlistConsole')
const admitWaitlist = makeFunctionReference<'mutation', { ids?: string[], next?: number }, { admitted: number }>('waitlist:admitWaitlist')
const declineWaitlist = makeFunctionReference<'mutation', { ids: string[], abuse?: boolean }, { declined: number }>('waitlist:declineWaitlist')
const noteWaitlist = makeFunctionReference<'mutation', { id: string, note: string }, null>('waitlist:noteWaitlist')
const getWaitlistCaps = makeFunctionReference<'action', Record<string, never>, { codes: { left: number, limit: number } | null, emails: { used: number, limit: number | null } | null } | null>('waitlist:getWaitlistCaps')
const getAccessConsole = makeFunctionReference<'query', Record<string, never>, AccessConsole | null>('access:getAccessConsole')
const setAccessPhase = makeFunctionReference<'mutation', { phase: string }, null>('access:setAccessPhase')
const checkCodeRef = makeFunctionReference<'mutation', { email: string, join?: string }, { id: string, created: boolean, position: number | null, total: number, token: string, source: string, referred: boolean, news: boolean }>('waitlist:checkCode')
const ticketOfRef = makeFunctionReference<'query', { email: string }, string | null>('waitlist:ticketOf')
const redeemRef = makeFunctionReference<'mutation', { email: string }, { ticket: string }>('waitlist:redeem')
const audienceRef = makeFunctionReference<'query', Record<string, never>, { segmentId: string, topicId: string } | null>('waitlist:audience')

let t: App

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
  vi.stubEnv('AUTH_SECRET', SECRET)
  t = testApp()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

/** Let the queued writes of the rank and the mirror's jobs run. */
async function settle() {
  await t.finishAllScheduledFunctions(() => vi.runAllTimers())
}

async function refusalOf(call: Promise<unknown>) {
  try {
    await call
  }
  catch (error) {
    return getBackendError(error)
  }
  return null
}

/** Join through the form's two steps, as `useWaitlist` does: the staged join, then the code's check. */
async function join(address: string, extra: { answers?: Record<string, string>, launchNews?: boolean, ref?: string, source?: string } = {}) {
  const { join: key } = await t.action(joinWaitlist, { email: address, ...extra })
  const entry = await t.mutation(checkCodeRef, { email: address, join: key })
  await settle()
  return entry
}

const statusOf = async (entry: { token: string }) => t.query(waitlistStatus, { token: entry.token })

describe('joining', () => {
  test('a join nobody verified has no place, and a stranger cannot make one up', async () => {
    await t.action(joinWaitlist, { email: 'mo@panels.example', answers: { role: 'Illustrator' } })
    expect(await t.query(waitlistStatus, { token: 'nope' })).toBeNull()
    expect(await t.query(waitlistStatus, { token: `${'a'.repeat(20)}.${'b'.repeat(22)}` })).toBeNull()
    const admin = await asUser(t, { role: 'admin' })
    const rows = await admin.query(getWaitlistConsole, {})
    expect(rows!.entries).toEqual([])
  })

  test('a stranger\'s join with someone else\'s address applies nothing when the owner signs in elsewhere', async () => {
    const sharer = await join('mallory@panels.example')
    const code = (await statusOf(sharer))!.shareCode
    await t.action(joinWaitlist, { email: 'victim@panels.example', answers: { role: 'Reader' }, launchNews: true, launchNewsText: 'I want weekly promos', ref: code })
    // The owner types their code on the plain sign-in page: no key, so a bare entry.
    const entry = await t.mutation(checkCodeRef, { email: 'victim@panels.example' })
    await settle()
    expect(entry).toMatchObject({ created: true, referred: false, news: false, source: 'sign-in' })
    expect((await statusOf(sharer))!.friends).toBe(0)
    const admin = await asUser(t, { role: 'admin' })
    expect((await admin.query(getWaitlistConsole, {}))!.entries.find(row => row.email === 'victim@panels.example')!.answers).toEqual({})
    // Another browser's key applies nothing either, and the owner's own join still does.
    const { join: own } = await t.action(joinWaitlist, { email: 'victim@panels.example', answers: { role: 'Writer' } })
    await t.action(joinWaitlist, { email: 'victim@panels.example', answers: { role: 'Reader' } })
    await t.mutation(checkCodeRef, { email: 'victim@panels.example', join: 'not-the-key' })
    expect((await admin.query(getWaitlistConsole, {}))!.entries.find(row => row.email === 'victim@panels.example')!.answers).toEqual({})
    await t.mutation(checkCodeRef, { email: 'victim@panels.example', join: own })
    expect((await admin.query(getWaitlistConsole, {}))!.entries.find(row => row.email === 'victim@panels.example')!.answers).toEqual({ role: 'Writer' })
  })

  test('the code\'s check makes the entry, with its answers, and shows the place', async () => {
    const entry = await join('mo@panels.example', { answers: { role: 'Illustrator' }, source: 'launch-week' })
    expect(entry).toMatchObject({ created: true, position: 1, total: 1, source: 'launch-week', referred: false, news: false })
    expect(await statusOf(entry)).toMatchObject({ status: 'waiting', position: 1, total: 1, friends: 0, cap: 10, launchNews: false })
    const admin = await asUser(t, { role: 'admin' })
    const console = await admin.query(getWaitlistConsole, {})
    expect(console!.counts).toEqual({ waiting: 1, admitted: 0, declined: 0, joined: 0 })
    expect(console!.entries[0]).toMatchObject({ email: 'mo@panels.example', source: 'launch-week', answers: { role: 'Illustrator' }, status: 'waiting' })
  })

  test('joining twice finds the first entry, its place and its answers', async () => {
    const first = await join('mo@panels.example', { answers: { role: 'Illustrator' } })
    await join('ada@panels.example')
    const again = await join('mo@panels.example')
    expect(again).toMatchObject({ id: first.id, created: false, position: 1, total: 2 })
    const admin = await asUser(t, { role: 'admin' })
    expect((await admin.query(getWaitlistConsole, {}))!.entries.find(row => row.email === 'mo@panels.example')!.answers).toEqual({ role: 'Illustrator' })
  })

  test('a person who comes through the sign-in page has no answers and the sign-in source', async () => {
    const entry = await t.mutation(checkCodeRef, { email: 'kai@panels.example' })
    expect(entry).toMatchObject({ created: true, source: 'sign-in' })
  })

  test('refuses an answer that is not among the question\'s choices, or to a question nobody asked', async () => {
    expect(await refusalOf(t.action(joinWaitlist, { email: 'mo@panels.example', answers: { role: 'Pirate' } }))).toMatchObject({ code: 'invalid_input', data: { field: 'role', reason: 'unknown_choice' } })
    expect(await refusalOf(t.action(joinWaitlist, { email: 'mo@panels.example', answers: { shoe: '42' } }))).toMatchObject({ code: 'invalid_input', data: { field: 'shoe', reason: 'unknown_question' } })
    expect(await refusalOf(t.action(joinWaitlist, { email: 'not an address' }))).toMatchObject({ code: 'invalid_input', data: { field: 'email' } })
    expect(await refusalOf(t.action(joinWaitlist, { email: 'mo@panels.example', source: 'has spaces' }))).toMatchObject({ code: 'invalid_input', data: { field: 'source' } })
  })

  test('is refused outside early access, and existing entries keep their place', async () => {
    const entry = await join('mo@panels.example')
    const admin = await asUser(t, { role: 'admin' })
    await admin.mutation(setAccessPhase, { phase: 'invite-only' })
    expect(await refusalOf(t.action(joinWaitlist, { email: 'new@panels.example' }))).toMatchObject({ code: 'forbidden', data: { reason: 'waitlist_closed', phase: 'invite-only' } })
    expect(await statusOf(entry)).toMatchObject({ status: 'waiting', position: 1 })
  })

  test('limits the joins of one address', async () => {
    for (let i = 0; i < 3; i++) await t.action(joinWaitlist, { email: 'mo@panels.example' })
    expect(await refusalOf(t.action(joinWaitlist, { email: 'mo@panels.example' }))).toMatchObject({ code: 'rate_limited' })
  })

  test('takes questions it can ask', () => {
    expect(() => setupWaitlist(components as never, { access, email, questions: { 'bad key': ['a'] } })).toThrow(/needs a key/)
    expect(() => setupWaitlist(components as never, { access, email, questions: { role: [] } })).toThrow(/distinct choices/)
    expect(() => setupWaitlist(components as never, { access, email, questions: { role: ['a', 'a'] } })).toThrow(/distinct choices/)
  })
})

describe('the status link', () => {
  test('is signed with a key derived from the auth secret, and carries nothing else', async () => {
    const token = await statusToken(SECRET, 'k17abc')
    expect(await readStatusToken(SECRET, token)).toBe('k17abc')
    expect(await readStatusToken('another-secret-that-is-long-enough-99', token)).toBeNull()
    expect(await readStatusToken(SECRET, token.replace('k17abc', 'k17abz'))).toBeNull()
    expect(await readStatusToken(SECRET, 'k17abc')).toBeNull()
  })

  test('shows a place only to the holder of the signed token', async () => {
    const entry = await join('mo@panels.example')
    expect(await statusOf(entry)).not.toBeNull()
    const [id] = entry.token.split('.')
    expect(await t.query(waitlistStatus, { token: `${id}.${'A'.repeat(22)}` })).toBeNull()
  })
})

describe('the order', () => {
  test('goes by when people were verified', async () => {
    const first = await join('first@panels.example')
    vi.advanceTimersByTime(60_000)
    const second = await join('second@panels.example')
    vi.advanceTimersByTime(60_000)
    const third = await join('third@panels.example')
    expect([await statusOf(first), await statusOf(second), await statusOf(third)].map(view => view!.position)).toEqual([1, 2, 3])
    expect((await statusOf(third))!.total).toBe(3)
  })

  test('moves a person up a day for each friend who joins through their link, up to the cap', async () => {
    const first = await join('first@panels.example')
    vi.advanceTimersByTime(12 * 60 * 60 * 1000)
    const second = await join('second@panels.example')
    const code = (await statusOf(second))!.shareCode
    expect((await statusOf(second))!.position).toBe(2)
    // A friend joins through the second's link: the second moves a day up, ahead of the first.
    const friend = await join('friend@panels.example', { ref: code })
    expect(friend).toMatchObject({ referred: true })
    expect(await statusOf(second)).toMatchObject({ position: 1, friends: 1 })
    expect((await statusOf(first))!.position).toBe(2)
    expect((await statusOf(friend))!.position).toBe(3)
  })

  test('does not count a person\'s own link, a mailbox they own, or a code nobody holds', async () => {
    const mo = await join('mo@panels.example')
    const code = (await statusOf(mo))!.shareCode
    expect(await join('mo+two@panels.example', { ref: code })).toMatchObject({ referred: false })
    expect(await join('other@panels.example', { ref: 'ZZZZZZZZ' })).toMatchObject({ referred: false })
    expect(await join('third@panels.example', { ref: 'not a code' })).toMatchObject({ referred: false })
    expect((await statusOf(mo))!.friends).toBe(0)
    // An address already on the list cannot be claimed as a friend afterwards.
    const late = await join('late@panels.example')
    expect(await join('late@panels.example', { ref: code })).toMatchObject({ created: false, referred: false })
    expect(late.id).toBeTruthy()
    expect((await statusOf(mo))!.friends).toBe(0)
  })

  test('shares its codes with the referral program: dots and tags make one mailbox, and the code goes to the account the address becomes', async () => {
    const mo = await join('m.o@panels.example')
    const code = (await statusOf(mo))!.shareCode
    expect(await join('mo+two@panels.example', { ref: code })).toMatchObject({ referred: false })
    // A person's code is made with the entry, and it is the program's kind: nobody else holds it.
    expect(await t.query(components.backend.referrals.peekCode, { userId: 'nobody' })).toBeNull()
    // The address signs up: the link it shared before launch is now the account's referral link.
    const account = await asUser(t, { email: 'm.o@panels.example' })
    await t.mutation(components.backend.access.attachUser, { email: 'm.o@panels.example', userId: account.userId })
    expect(await t.query(components.backend.referrals.peekCode, { userId: account.userId })).toEqual({ code, sharePages: true })
    expect(await t.query(components.backend.referrals.preview, { code })).toMatchObject({ inviter: expect.any(String) })
  })

  test('stops counting at the cap', async () => {
    const mo = await join('mo@panels.example')
    const code = (await statusOf(mo))!.shareCode
    for (let i = 0; i < 12; i++) await join(`friend${i}@panels.example`, { ref: code })
    expect((await statusOf(mo))!.friends).toBe(10)
  })

  test('takes a friend\'s boost back when the friend is removed as abuse or leaves', async () => {
    const admin = await asUser(t, { role: 'admin' })
    const mo = await join('mo@panels.example')
    const code = (await statusOf(mo))!.shareCode
    const bot = await join('bot@panels.example', { ref: code })
    const real = await join('real@panels.example', { ref: code })
    expect((await statusOf(mo))!.friends).toBe(2)
    const rows = (await admin.query(getWaitlistConsole, {}))!.entries
    await admin.mutation(declineWaitlist, { ids: [rows.find(row => row.email === 'bot@panels.example')!.id], abuse: true })
    await settle()
    expect((await statusOf(mo))!.friends).toBe(1)
    expect(await statusOf(bot)).toMatchObject({ status: 'declined', position: null })
    await t.mutation(leaveWaitlist, { token: real.token })
    await settle()
    expect((await statusOf(mo))!.friends).toBe(0)
    expect(await statusOf(real)).toBeNull()
  })
})

describe('waves', () => {
  test('are admitted by an administrator in person, next in line first, each with one ticket', async () => {
    const first = await join('first@panels.example')
    vi.advanceTimersByTime(60_000)
    await join('second@panels.example')
    vi.advanceTimersByTime(60_000)
    await join('third@panels.example')
    const admin = await asUser(t, { role: 'admin' })
    expect(await admin.mutation(admitWaitlist, { next: 2 })).toEqual({ admitted: 2 })
    await settle()
    expect(await t.query(ticketOfRef, { email: 'first@panels.example' })).toBe('waitlist')
    expect(await t.query(ticketOfRef, { email: 'second@panels.example' })).toBe('waitlist')
    expect(await t.query(ticketOfRef, { email: 'third@panels.example' })).toBeNull()
    expect(await statusOf(first)).toMatchObject({ status: 'admitted', position: null })
    const console = await admin.query(getWaitlistConsole, {})
    expect(console!.counts).toEqual({ waiting: 1, admitted: 2, declined: 0, joined: 0 })
    // The Access tab lists the invitations they made.
    expect((await admin.query(getAccessConsole, {}))!.admissions.filter(row => row.source === 'waitlist')).toHaveLength(2)
    // The next wave starts from the third.
    expect(await admin.mutation(admitWaitlist, { next: 5 })).toEqual({ admitted: 1 })
  })

  test('are sent to their chosen entries, and a signed-up address turns its entry into an account', async () => {
    const mo = await join('mo@panels.example')
    const admin = await asUser(t, { role: 'admin' })
    const [row] = (await admin.query(getWaitlistConsole, {}))!.entries
    expect(await admin.mutation(admitWaitlist, { ids: [row!.id] })).toEqual({ admitted: 1 })
    expect(await t.mutation(redeemRef, { email: 'mo@panels.example' })).toMatchObject({ ticket: 'waitlist' })
    expect(await statusOf(mo)).toMatchObject({ status: 'joined', position: null })
    // Admitting again does nothing: it is no longer waiting.
    expect(await admin.mutation(admitWaitlist, { ids: [row!.id] })).toEqual({ admitted: 0 })
  })

  test('email each person admitted a link to the sign-in page nuxt.config names', async () => {
    vi.stubEnv('SITE_URL', 'https://panels.example/')
    const sent = vi.spyOn(email, 'sendTemplate')
    await join('mo@panels.example')
    const admin = await asUser(t, { role: 'admin' })
    await admin.mutation(admitWaitlist, { next: 1 })
    expect(sent).toHaveBeenCalledWith(expect.anything(), 'waitlistAdmitted', { email: 'mo@panels.example', signInUrl: 'https://panels.example/sign-in' }, expect.anything())
    sent.mockRestore()
    expect(() => setupWaitlist(components as never, { access, email, paths: { login: 'sign-in' } })).toThrow(/paths\.login is "sign-in"/)
  })

  test('are refused to anyone but an administrator in person, and ask for what to admit', async () => {
    const ada = await asUser(t)
    expect(await refusalOf(ada.mutation(admitWaitlist, { next: 1 }))).toMatchObject({ code: 'forbidden', data: { reason: 'admin_only' } })
    expect(await refusalOf(t.mutation(declineWaitlist, { ids: [] }))).toMatchObject({ code: 'unauthenticated' })
    expect(await ada.query(getWaitlistConsole, {})).toBeNull()
    const admin = await asUser(t, { role: 'admin' })
    expect(await refusalOf(admin.mutation(admitWaitlist, {}))).toMatchObject({ code: 'invalid_input', data: { field: 'ids' } })
    expect(await refusalOf(admin.mutation(admitWaitlist, { next: 0 }))).toMatchObject({ code: 'invalid_input', data: { field: 'next' } })
    expect(await refusalOf(admin.mutation(admitWaitlist, { next: 1000 }))).toMatchObject({ code: 'invalid_input', data: { field: 'next' } })
  })

  test('record what the administrator did on the trail, never an address', async () => {
    await join('mo@panels.example')
    const admin = await asUser(t, { role: 'admin' })
    await admin.mutation(admitWaitlist, { next: 1 })
    const list = makeFunctionReference<'query', { paginationOpts: { numItems: number, cursor: string | null } }, { page: Array<{ type: string, data?: Record<string, unknown> }> } | null>('audit:listAllActivity')
    const page = await admin.query(list, { paginationOpts: { numItems: 20, cursor: null } })
    expect(page!.page.find(event => event.type === 'waitlist.admitted')).toMatchObject({ data: { count: 1 } })
    expect(JSON.stringify(page)).not.toContain('mo@panels.example')
  })

  test('decline entries, withdraw a ticket and keep a note', async () => {
    const mo = await join('mo@panels.example')
    const admin = await asUser(t, { role: 'admin' })
    const [row] = (await admin.query(getWaitlistConsole, {}))!.entries
    await admin.mutation(admitWaitlist, { ids: [row!.id] })
    expect(await admin.mutation(declineWaitlist, { ids: [row!.id] })).toEqual({ declined: 1 })
    expect(await t.query(ticketOfRef, { email: 'mo@panels.example' })).toBeNull()
    expect(await statusOf(mo)).toMatchObject({ status: 'declined', position: null })
    await admin.mutation(noteWaitlist, { id: row!.id, note: ' spoke on the phone ' })
    const declined = await admin.query(getWaitlistConsole, { status: 'declined' })
    expect(declined!.entries[0]).toMatchObject({ note: 'spoke on the phone', status: 'declined' })
    expect(declined!.counts).toMatchObject({ waiting: 0, declined: 1 })
  })

  test('show the room a wave has: the sign-in codes left this hour, and the email plan\'s quota when the provider answers', async () => {
    const admin = await asUser(t, { role: 'admin' })
    expect(await admin.action(getWaitlistCaps, {})).toEqual({ codes: { left: 200, limit: 200 }, emails: null })
    const ada = await asUser(t)
    expect(await ada.action(getWaitlistCaps, {})).toBeNull()
    vi.stubEnv('EMAIL_API_KEY', 're_test_key')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ object: 'usage', emails: { daily: { used: 12, limit: 100, sent: 12, received: 0, resets_at: '2026-10-28T00:00:00Z' }, monthly: { used: 12, limit: 3000, sent: 12, received: 0, resets_at: '2026-11-01T00:00:00Z' } }, contacts: {} }), { status: 200, headers: { 'content-type': 'application/json' } })))
    expect(await admin.action(getWaitlistCaps, {})).toMatchObject({ emails: { used: 12, limit: 100 } })
  })

  test('are listed oldest first, narrowed by domain, source or answer', async () => {
    await join('a@one.example', { source: 'landing', answers: { role: 'Writer' } })
    vi.advanceTimersByTime(1000)
    await join('b@two.example', { source: 'press', answers: { role: 'Reader' } })
    vi.advanceTimersByTime(1000)
    await join('c@two.example', { source: 'landing', answers: { role: 'Reader' } })
    const admin = await asUser(t, { role: 'admin' })
    const emails = async (filter: Parameters<typeof admin.query<typeof getWaitlistConsole>>[1]) => (await admin.query(getWaitlistConsole, filter))!.entries.map(row => row.email)
    expect(await emails({})).toEqual(['a@one.example', 'b@two.example', 'c@two.example'])
    expect(await emails({ domain: '@two.example' })).toEqual(['b@two.example', 'c@two.example'])
    expect(await emails({ source: 'landing' })).toEqual(['a@one.example', 'c@two.example'])
    expect(await emails({ question: 'role', answer: 'Reader' })).toEqual(['b@two.example', 'c@two.example'])
    expect(await emails({ domain: 'two.example', source: 'landing', question: 'role', answer: 'Reader' })).toEqual(['c@two.example'])
    expect((await admin.query(getWaitlistConsole, {}))!.questions).toEqual({ role: ['Writer', 'Illustrator', 'Reader'] })
  })
})

describe('leaving and erasure', () => {
  test('leaving removes the entry for good, and the others move up', async () => {
    const first = await join('first@panels.example')
    vi.advanceTimersByTime(1000)
    const second = await join('second@panels.example')
    await t.mutation(leaveWaitlist, { token: first.token })
    await settle()
    expect(await statusOf(first)).toBeNull()
    expect(await statusOf(second)).toMatchObject({ position: 1, total: 1 })
    const admin = await asUser(t, { role: 'admin' })
    expect((await admin.query(getWaitlistConsole, {}))!.counts.waiting).toBe(1)
    // A forged token leaves nobody.
    await t.mutation(leaveWaitlist, { token: 'forged' })
    expect(await statusOf(second)).not.toBeNull()
  })

  test('erasing an address removes its entry, its staged join and what it gave a friend', async () => {
    const mo = await join('mo@panels.example')
    const code = (await statusOf(mo))!.shareCode
    await join('friend@panels.example', { ref: code })
    await t.action(joinWaitlist, { email: 'friend@panels.example', launchNews: true })
    await t.mutation(componentRef('account:forget'), { email: 'friend@panels.example' })
    await settle()
    const admin = await asUser(t, { role: 'admin' })
    const rows = (await admin.query(getWaitlistConsole, {}))!
    expect(rows.entries.map(row => row.email)).toEqual(['mo@panels.example'])
    expect((await statusOf(mo))!.friends).toBe(0)
  })
})

describe('launch news', () => {
  const calls: Array<{ method: string, url: string, body: unknown }> = []

  beforeEach(() => {
    calls.length = 0
    vi.stubEnv('EMAIL_API_KEY', 're_test_key')
    vi.stubEnv('BACKEND_ENVIRONMENT', 'production')
    vi.stubEnv('EMAIL_FROM', 'Panels <hello@panels.example>')
  })

  /** A stand-in for the email provider's API: lists nothing, makes what is asked for, and fails as told. */
  function provider(fail?: (url: string) => number | null) {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input)
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      calls.push({ method: init?.method ?? 'GET', url, body })
      const status = fail?.(url) ?? 200
      if (status !== 200) return new Response(JSON.stringify({ name: 'application_error', message: 'try later', statusCode: status }), { status })
      const path = new URL(url).pathname
      const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } })
      if (init?.method === 'GET' && (path === '/segments' || path === '/topics')) return json({ object: 'list', has_more: false, data: [] })
      if (path === '/segments') return json({ object: 'segment', id: 'seg_1', name: 'Waitlist' })
      if (path === '/topics') return json({ id: 'top_1' })
      return json({ object: 'contact', id: 'con_1' })
    }))
  }

  test('only the people who ticked the box become contacts, in a segment of their own, subscribed to the topic', async () => {
    provider()
    await join('asked@panels.example', { launchNews: true })
    await join('quiet@panels.example')
    const contacts = calls.filter(call => call.method === 'POST' && new URL(call.url).pathname === '/contacts')
    expect(contacts).toHaveLength(1)
    expect(contacts[0]!.body).toMatchObject({ email: 'asked@panels.example', segments: [{ id: 'seg_1' }], topics: [{ id: 'top_1', subscription: 'opt_in' }] })
    const admin = await asUser(t, { role: 'admin' })
    const rows = (await admin.query(getWaitlistConsole, {}))!
    expect(rows.entries.find(row => row.email === 'asked@panels.example')).toMatchObject({ launchNews: true, mirror: 'synced' })
    expect(rows.entries.find(row => row.email === 'quiet@panels.example')).toMatchObject({ launchNews: false, mirror: null })
    expect(await t.query(audienceRef, {})).toEqual({ segmentId: 'seg_1', topicId: 'top_1' })
  })

  test('flags a contact the provider kept refusing, and writes it again on the next pass', async () => {
    provider(url => (new URL(url).pathname === '/contacts' ? 503 : null))
    await join('asked@panels.example', { launchNews: true })
    const admin = await asUser(t, { role: 'admin' })
    expect((await admin.query(getWaitlistConsole, {}))!.entries[0]).toMatchObject({ mirror: 'drift' })
    expect((await admin.query(getWaitlistConsole, {}))!.mirror).toEqual({ pending: 0, drift: 1 })
    // The provider is back; an hour on, the maintenance pass writes the contact again.
    provider()
    vi.advanceTimersByTime(2 * 60 * 60 * 1000)
    await t.mutation(componentRef('maintenance:run'), {})
    await settle()
    expect((await admin.query(getWaitlistConsole, {}))!.entries[0]).toMatchObject({ mirror: 'synced' })
  })

  test('writes nothing where the deployment would not deliver to the address (test mode)', async () => {
    vi.stubEnv('BACKEND_ENVIRONMENT', 'development')
    provider()
    await join('asked@panels.example', { launchNews: true })
    expect(calls).toEqual([])
    const admin = await asUser(t, { role: 'admin' })
    expect((await admin.query(getWaitlistConsole, {}))!.entries[0]).toMatchObject({ launchNews: true, mirror: 'skipped' })
  })

  test('removes the contact of a person who leaves', async () => {
    provider()
    const entry = await join('asked@panels.example', { launchNews: true })
    await t.mutation(leaveWaitlist, { token: entry.token })
    await settle()
    expect(calls.some(call => call.method === 'DELETE' && call.url.includes('/contacts/'))).toBe(true)
  })

  test('is a consent on the ledger, kept by a hash of the address, carried to the account at sign-up and withdrawn on leaving', async () => {
    provider()
    const kept = await join('asked@panels.example', { launchNews: true })
    await join('quiet@panels.example')
    const asked = await asUser(t, { email: 'asked@panels.example' })
    const quiet = await asUser(t, { email: 'quiet@panels.example' })
    const ledger = (userId: string) => t.query(components.backend.consents.history, { userId })
    await t.mutation(makeFunctionReference<'mutation'>('account:signUp'), { userId: asked.userId, email: 'asked@panels.example' })
    await t.mutation(makeFunctionReference<'mutation'>('account:signUp'), { userId: quiet.userId, email: 'quiet@panels.example' })
    expect(await ledger(asked.userId)).toEqual([expect.objectContaining({ kind: 'launch-news', version: 'waitlist', granted: true, source: 'waitlist', text: 'Email me when it launches' })])
    expect(await ledger(quiet.userId)).toEqual([])

    // A person who leaves before signing up withdraws it on the ledger.
    const leaver = await join('leaver@panels.example', { launchNews: true })
    await t.mutation(leaveWaitlist, { token: leaver.token })
    await settle()
    const later = await asUser(t, { email: 'leaver@panels.example' })
    await t.mutation(makeFunctionReference<'mutation'>('account:signUp'), { userId: later.userId, email: 'leaver@panels.example' })
    expect(await ledger(later.userId)).toEqual([expect.objectContaining({ kind: 'launch-news', granted: true }), expect.objectContaining({ kind: 'launch-news', granted: false })])
    expect(kept.news).toBe(true)
  })

  test('is joined by a person who ticks the box on a later join, not before', async () => {
    provider()
    await join('late@panels.example')
    expect(calls).toEqual([])
    await join('late@panels.example', { launchNews: true })
    expect(calls.filter(call => new URL(call.url).pathname === '/contacts')).toHaveLength(1)
  })
})

/** A function of the `backend` component, by path, the way the component's own tests reach it. */
function componentRef(path: string) {
  const [module, name] = path.split(':')
  return (componentsGeneric() as unknown as { backend: Record<string, Record<string, FunctionReference<'mutation', 'public' | 'internal', any, any>>> }).backend[module!]![name!]!
}
