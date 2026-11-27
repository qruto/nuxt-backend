/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, makeFunctionReference, mutationGeneric } from 'convex/server'
import { v } from 'convex/values'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { getBackendError } from '../../src/convex/errors'
import { setupAudit } from '../../src/convex/integrations/audit'
import { setupEmail } from '../../src/convex/integrations/email'
import { setupAccess } from '../../src/convex/integrations/launch'
import { setupWaitlist, type WaitlistConsole, type WaitlistStatusView } from '../../src/convex/integrations/waitlist'
import type { WaitlistRecord } from '../../src/convex/access-tickets'

// A waitlist on a rule of its own: a week up the line for every friend, no
// limit to how many count, a week for the friend too, and rank kept to the
// administrators, who plan the next wave. The package's default rule (a day
// a friend, up to ten, rank shown) is held in waitlist.test.ts.

const SECRET = 'a-test-secret-that-is-long-enough-1234'
const DAY = 24 * 60 * 60 * 1000
const WEEK = 7 * DAY
const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
const audit = setupAudit(components as never)
// The rule is the access's: the sign-in page records entries by it, without loading the waitlist.
const access = setupAccess(components as never, {
  phases: ['early-access', 'public'],
  audit,
  waitlist: { boost: { perFriend: WEEK, cap: null, welcome: WEEK, notify: true }, place: { rank: false } },
})
const email = setupEmail(components as never, {})
const waitlist = setupWaitlist(components as never, { access, email })

const checkCode = mutationGeneric({
  args: { email: v.string(), join: v.optional(v.string()) },
  handler: async (ctx, input) => access.gate.waitlist!(ctx, input),
})

const testApp = defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './access.js': () => Promise.resolve({ ...access.api }),
  './audit.js': () => Promise.resolve(audit.api),
  './waitlist.js': () => Promise.resolve({ ...waitlist.api, checkCode }),
})
type App = ReturnType<typeof testApp>

const joinWaitlist = makeFunctionReference<'action', { email: string, ref?: string }, { join: string }>('waitlist:joinWaitlist')
const waitlistStatus = makeFunctionReference<'query', { token: string }, WaitlistStatusView | null>('waitlist:waitlistStatus')
const getWaitlistConsole = makeFunctionReference<'query', Record<string, never>, WaitlistConsole | null>('waitlist:getWaitlistConsole')
const planWaitlistWave = makeFunctionReference<'mutation', { size: number | null, opensAt?: number | null }, null>('waitlist:planWaitlistWave')
const checkCodeRef = makeFunctionReference<'mutation', { email: string, join?: string }, WaitlistRecord>('waitlist:checkCode')

let t: App

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
  vi.stubEnv('AUTH_SECRET', SECRET)
  t = testApp()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function settle() {
  await t.finishAllScheduledFunctions(() => vi.runAllTimers())
}

async function join(address: string, ref?: string) {
  const { join: key } = await t.action(joinWaitlist, { email: address, ...(ref ? { ref } : {}) })
  const entry = await t.mutation(checkCodeRef, { email: address, join: key })
  await settle()
  return entry
}

const statusOf = async (entry: { token: string }) => (await t.query(waitlistStatus, { token: entry.token }))!

describe('the rule', () => {
  test('is the access\'s, checked when the access is set up, and the waitlist reads the same one', () => {
    const accessWith = (rule: Parameters<typeof setupAccess>[1]['waitlist']) => setupAccess(components as never, { phases: ['early-access'], audit, waitlist: rule })
    expect(() => accessWith({ boost: { perFriend: 10 } })).toThrow(/perFriend/)
    expect(() => accessWith({ boost: { cap: 0 } })).toThrow(/boost: false/)
    expect(() => accessWith({ boost: { welcome: -1 } })).toThrow(/welcome/)
    expect(accessWith({ boost: false }).internals.waitlistRule).toEqual({ boost: { perFriend: DAY, cap: 0, welcome: 0 }, rank: true, notify: false })
    expect(accessWith(undefined).internals.waitlistRule).toEqual({ boost: { perFriend: DAY, cap: 10, welcome: 0 }, rank: true, notify: false })
    expect(waitlist.rule).toBe(access.internals.waitlistRule)
    expect(waitlist.rule).toEqual({ boost: { perFriend: WEEK, cap: null, welcome: WEEK }, rank: false, notify: true })
  })
})

describe('a private rank', () => {
  test('shows a person their join date and their credit, never a place or the size of the list', async () => {
    const before = Date.now()
    const first = await join('first@panels.example')
    const after = Date.now()
    await join('second@panels.example')
    expect(first).toMatchObject({ waiting: true, position: null, total: 0 })
    const view = await statusOf(first)
    expect(view).toMatchObject({ status: 'waiting', position: null, total: 0, friends: 0, cap: null, credit: 0, perFriend: WEEK, wave: null })
    expect(view.joinedAt).toBeGreaterThanOrEqual(before)
    expect(view.joinedAt).toBeLessThanOrEqual(after)
  })
})

describe('the credit', () => {
  test('moves a person a week up for each friend, with no limit, and never rewrites the day they joined', async () => {
    const early = await join('early@panels.example')
    vi.advanceTimersByTime(3 * WEEK)
    const late = await join('late@panels.example')
    const joinedAt = (await statusOf(late)).joinedAt
    const code = (await statusOf(late)).shareCode
    for (let i = 0; i < 12; i++) await join(`friend${i}@panels.example`, code)
    const view = await statusOf(late)
    expect(view).toMatchObject({ friends: 12, credit: 12 * WEEK, joinedAt })
    // Twelve weeks of credit put the late joiner ahead of a person three weeks earlier.
    const admin = await asUser(t, { role: 'admin' })
    const line = (await admin.query(getWaitlistConsole, {}))!.entries.map(entry => entry.email)
    expect(line.indexOf('late@panels.example')).toBeLessThan(line.indexOf('early@panels.example'))
    expect(early.id).toBeTruthy()
  })

  test('gives the friend a week of their own, and tells the sharer while they wait', async () => {
    const sharer = await join('sharer@panels.example')
    const friend = await join('friend@panels.example', (await statusOf(sharer)).shareCode)
    expect(friend).toMatchObject({ referred: true, sharer: { email: 'sharer@panels.example', friends: 1, credit: WEEK, token: sharer.token } })
    expect((await statusOf(friend)).credit).toBe(WEEK)
  })

  test('counts one mailbox once: a second address of it brings its sharer nothing', async () => {
    const sharer = await join('sharer@panels.example')
    const code = (await statusOf(sharer)).shareCode
    expect(await join('pat@panels.example', code)).toMatchObject({ referred: true })
    expect(await join('p.a.t+again@panels.example', code)).toMatchObject({ referred: false })
    expect((await statusOf(sharer)).friends).toBe(1)
  })
})

describe('the planned wave', () => {
  test('tells each waiting person whether they are in it, or how many friends short, never its size', async () => {
    const first = await join('first@panels.example')
    vi.advanceTimersByTime(DAY)
    const second = await join('second@panels.example')
    vi.advanceTimersByTime(3 * WEEK)
    const third = await join('third@panels.example')
    // Signed in just now: planning takes a recent sign-in.
    const admin = await asUser(t, { role: 'admin' })
    const opensAt = Date.UTC(2026, 11, 15)
    await admin.mutation(planWaitlistWave, { size: 2, opensAt })
    expect((await admin.query(getWaitlistConsole, {}))!.wave).toEqual({ size: 2, opensAt })
    expect((await statusOf(first)).wave).toEqual({ opensAt, included: true, friendsShort: 0 })
    expect((await statusOf(second)).wave).toEqual({ opensAt, included: true, friendsShort: 0 })
    // Three weeks and a bit behind the last person in it: four friends carry the third past them.
    expect((await statusOf(third)).wave).toEqual({ opensAt, included: false, friendsShort: 4 })
    const code = (await statusOf(third)).shareCode
    for (let i = 0; i < 4; i++) await join(`friend${i}@panels.example`, code)
    expect((await statusOf(third)).wave).toMatchObject({ included: true })
    expect((await statusOf(second)).wave).toMatchObject({ included: false, friendsShort: 1 })
  })

  test('is planned and cleared by an administrator only, within bounds, on the trail', async () => {
    const person = await asUser(t, { role: 'user' })
    expect(getBackendError(await person.mutation(planWaitlistWave, { size: 5 }).catch(error => error))).toMatchObject({ code: 'forbidden' })
    const admin = await asUser(t, { role: 'admin' })
    expect(getBackendError(await admin.mutation(planWaitlistWave, { size: 0 }).catch(error => error))).toMatchObject({ code: 'invalid_input', data: { field: 'size' } })
    await admin.mutation(planWaitlistWave, { size: 5 })
    expect((await admin.query(getWaitlistConsole, {}))!.wave).toEqual({ size: 5, opensAt: null })
    await admin.mutation(planWaitlistWave, { size: null })
    expect((await admin.query(getWaitlistConsole, {}))!.wave).toBeNull()
    const entry = await join('mo@panels.example')
    expect((await statusOf(entry)).wave).toBeNull()
  })
})
