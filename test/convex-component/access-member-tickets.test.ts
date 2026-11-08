/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, type FunctionReference, makeFunctionReference, mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { getBackendError } from '../../src/convex/errors'
import { setupAudit } from '../../src/convex/integrations/audit'
import { type AccessConsole, type MemberTicket, setupAccess } from '../../src/convex/integrations/launch'
import { formatAuthSecret } from '../../src/convex/auth-secrets'

// Member tickets (`access.memberTickets`) over the mounted component: while
// the app is closed, each member holds one access link of `uses`, minted on
// the first ask and read back after, whose token is derived under the auth
// secret so only its hash is kept; it admits as the `member-ticket` ticket,
// labelled with its member, until it is used up or expires; it is off while
// the app is public or the app's own switch says so, nobody else's to read,
// and gone with its member's erasure.

const SECRET = 'a-test-secret-that-is-long-enough-1234'
const DAY = 24 * 60 * 60 * 1000
const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
const audit = setupAudit(components as never)
const access = setupAccess(components as never, { phases: ['early-access', 'invite-only', 'public'], audit })
const program = { on: true }
const memberTickets = access.memberTickets({ uses: 3, lifetime: 60 * DAY, enabled: () => program.on })

const admission = queryGeneric({
  args: { email: v.string(), code: v.optional(v.string()) },
  handler: async (ctx, input) => access.gate.admission(ctx, input),
})
const redeem = mutationGeneric({
  args: { email: v.string(), code: v.optional(v.string()), ticket: v.string() },
  handler: async (ctx, input) => access.gate.redeem(ctx, input as never),
})

const attach = mutationGeneric({
  args: { email: v.string(), userId: v.string() },
  handler: async (ctx, input) => access.gate.attach(ctx, input),
})

const testApp = defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './access.js': () => Promise.resolve({ ...access.api, ...memberTickets.api, admission, redeem, attach }),
  './audit.js': () => Promise.resolve(audit.api),
})
type App = ReturnType<typeof testApp>

const getMemberTicket = makeFunctionReference<'query', Record<string, never>, MemberTicket | null>('access:getMemberTicket')
const issueMemberTicket = makeFunctionReference<'mutation', Record<string, never>, MemberTicket>('access:issueMemberTicket')
const setAccessPhase = makeFunctionReference<'mutation', { phase: string }, null>('access:setAccessPhase')
const getAccessConsole = makeFunctionReference<'query', Record<string, never>, AccessConsole | null>('access:getAccessConsole')
const checkInvite = makeFunctionReference<'mutation', { code: string }, { status: string }>('access:checkInvite')
const admissionRef = makeFunctionReference<'query', { email: string, code?: string }, { phase: string, ticket: string | null, invite: string | null }>('access:admission')
const redeemRef = makeFunctionReference<'mutation', { email: string, code?: string, ticket: string }, { ticket: string, label?: string } | { refused: string }>('access:redeem')
const attachRef = makeFunctionReference<'mutation', { email: string, userId: string }, unknown>('access:attach')

let t: App

beforeEach(() => {
  vi.stubEnv('AUTH_SECRET', SECRET)
  program.on = true
  t = testApp()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function refusalOf(call: Promise<unknown>) {
  try {
    await call
  }
  catch (error) {
    return getBackendError(error)
  }
  return null
}

/** The token of a ticket that was issued. */
function tokenOf(ticket: MemberTicket | null): string {
  if (ticket?.state !== 'issued') throw new Error(`no ticket: ${JSON.stringify(ticket)}`)
  return ticket.token
}

describe('a member\'s ticket', () => {
  test('is none until the member asks, then the same one every time they read or ask', async () => {
    const ada = await asUser(t, { email: 'ada@panels.example' })
    expect(await ada.query(getMemberTicket, {})).toEqual({ state: 'none', uses: 3 })
    const issued = await ada.mutation(issueMemberTicket, {})
    expect(issued).toMatchObject({ state: 'issued', uses: 3, left: 3 })
    expect(tokenOf(issued)).toMatch(/^[0-9A-Z]{26}$/)
    expect(await ada.mutation(issueMemberTicket, {})).toEqual(issued)
    expect(await ada.query(getMemberTicket, {})).toEqual(issued)
    // A link anyone may check, like any access link.
    expect(await t.mutation(checkInvite, { code: tokenOf(issued) })).toEqual({ status: 'valid' })
  })

  test('is each member\'s own', async () => {
    const ada = await asUser(t, { email: 'ada@panels.example' })
    const grace = await asUser(t, { email: 'grace@panels.example' })
    expect(tokenOf(await ada.mutation(issueMemberTicket, {}))).not.toBe(tokenOf(await grace.mutation(issueMemberTicket, {})))
  })

  test('admits its uses as the member-ticket ticket, labelled with its member, then stays the member\'s, used up', async () => {
    const ada = await asUser(t, { email: 'ada@panels.example' })
    const token = tokenOf(await ada.mutation(issueMemberTicket, {}))
    expect(await t.query(admissionRef, { email: 'friend1@example.org', code: token })).toMatchObject({ phase: 'early-access', ticket: 'access-link', invite: 'valid' })
    for (const friend of ['friend1@example.org', 'friend2@example.org', 'friend3@example.org']) {
      expect(await t.mutation(redeemRef, { email: friend, code: token, ticket: 'access-link' })).toEqual({ ticket: 'member-ticket', label: `member:${ada.userId}` })
    }
    expect(await t.mutation(redeemRef, { email: 'friend4@example.org', code: token, ticket: 'access-link' })).toEqual({ refused: 'used-up' })
    expect(await ada.query(getMemberTicket, {})).toMatchObject({ state: 'issued', token, uses: 3, left: 0 })
    // Asking again before it expires answers the same, used up.
    expect(await ada.mutation(issueMemberTicket, {})).toMatchObject({ state: 'issued', token, left: 0 })
  })

  test('is a fresh one once the last expired', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const ada = await asUser(t, { email: 'ada@panels.example' })
    const first = tokenOf(await ada.mutation(issueMemberTicket, {}))
    vi.setSystemTime(Date.now() + 61 * DAY)
    expect(await ada.query(getMemberTicket, {})).toEqual({ state: 'none', uses: 3 })
    const second = tokenOf(await ada.mutation(issueMemberTicket, {}))
    expect(second).not.toBe(first)
    expect(await t.mutation(checkInvite, { code: first })).toEqual({ status: 'expired' })
  })

  test('reads back the same token after an AUTH_SECRET rotation, and its link keeps working', async () => {
    const ada = await asUser(t, { email: 'ada@panels.example' })
    const token = tokenOf(await ada.mutation(issueMemberTicket, {}))
    vi.stubEnv('AUTH_SECRET', formatAuthSecret([{ version: Math.floor(Date.now() / 1000), value: 'the-secret-a-rotation-writes-9876543210abcd' }, { version: 0, value: SECRET }]))
    expect(await ada.query(getMemberTicket, {})).toMatchObject({ state: 'issued', token })
    expect(await t.mutation(redeemRef, { email: 'friend@example.org', code: token, ticket: 'access-link' })).toMatchObject({ ticket: 'member-ticket' })
  })

  test('is open once the app is public, and off while the app\'s switch is', async () => {
    const ada = await asUser(t, { email: 'ada@panels.example' })
    program.on = false
    expect(await ada.query(getMemberTicket, {})).toEqual({ state: 'off' })
    expect(await ada.mutation(issueMemberTicket, {})).toEqual({ state: 'off' })
    program.on = true
    const admin = await asUser(t, { role: 'admin' })
    await admin.mutation(setAccessPhase, { phase: 'public' })
    expect(await ada.query(getMemberTicket, {})).toEqual({ state: 'open' })
    expect(await ada.mutation(issueMemberTicket, {})).toEqual({ state: 'open' })
  })

  test('is nobody else\'s to read or mint: a visitor, and an administrator acting as the member', async () => {
    expect(await t.query(getMemberTicket, {})).toBeNull()
    expect(await refusalOf(t.mutation(issueMemberTicket, {}))).toMatchObject({ code: 'unauthenticated' })
    const admin = await asUser(t, { role: 'admin' })
    // An administrator's visit to a member: the session names the visitor.
    const visiting = await asUser(t, { email: 'visited@panels.example', impersonatedBy: admin.userId })
    expect(await visiting.query(getMemberTicket, {})).toBeNull()
    expect(await refusalOf(visiting.mutation(issueMemberTicket, {}))).toMatchObject({ code: 'forbidden', data: { reason: 'impersonating' } })
  })

  test('stays out of the Access tab, whose codes and links are the administrators\'', async () => {
    const ada = await asUser(t, { email: 'ada@panels.example' })
    await ada.mutation(issueMemberTicket, {})
    const admin = await asUser(t, { role: 'admin' })
    expect((await admin.query(getAccessConsole, {}))!.invites).toEqual([])
  })

  test('goes with its member\'s erasure', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date'] })
    const ada = await asUser(t, { email: 'ada@panels.example' })
    const token = tokenOf(await ada.mutation(issueMemberTicket, {}))
    await t.mutation(components.backend.account.forget as unknown as FunctionReference<'mutation'>, { userId: ada.userId })
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await t.mutation(checkInvite, { code: token })).toEqual({ status: 'unknown' })
  })

  test('is none of its own for an account a member ticket admitted, unless the app asks for chains', async () => {
    const ada = await asUser(t, { email: 'ada@panels.example' })
    const token = tokenOf(await ada.mutation(issueMemberTicket, {}))
    await t.mutation(redeemRef, { email: 'friend@example.org', code: token, ticket: 'access-link' })
    const friend = await asUser(t, { email: 'friend@example.org' })
    await t.mutation(attachRef, { email: 'friend@example.org', userId: friend.userId })
    expect(await friend.query(getMemberTicket, {})).toEqual({ state: 'off' })
    expect(await friend.mutation(issueMemberTicket, {})).toEqual({ state: 'off' })
    // With chains, the friend holds one of their own.
    const chained = defineBackendTestApp(defineSchema({}), {
      './_generated/api.js': () => Promise.resolve({}),
      './access.js': () => Promise.resolve({ ...access.api, ...access.memberTickets({ chain: true }).api, redeem, attach }),
      './audit.js': () => Promise.resolve(audit.api),
    })()
    const host = await asUser(chained, { email: 'ada@panels.example' })
    const hostToken = tokenOf(await host.mutation(issueMemberTicket, {}))
    await chained.mutation(redeemRef, { email: 'friend@example.org', code: hostToken, ticket: 'access-link' })
    const guest = await asUser(chained, { email: 'friend@example.org' })
    await chained.mutation(attachRef, { email: 'friend@example.org', userId: guest.userId })
    expect(await guest.query(getMemberTicket, {})).toEqual({ state: 'none', uses: 3 })
  })

  test('takes uses and a lifetime it can keep', () => {
    expect(() => access.memberTickets({ uses: 0 })).toThrow(/uses/)
    expect(() => access.memberTickets({ uses: 1.5 })).toThrow(/uses/)
    expect(() => access.memberTickets({ lifetime: 400 * DAY })).toThrow(/lifetime/)
    expect(access.memberTickets()).toMatchObject({ uses: 3, lifetime: 60 * DAY })
  })
})
