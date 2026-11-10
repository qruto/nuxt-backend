/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, type FunctionReference, makeFunctionReference, mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { getBackendError } from '../../src/convex/errors'
import { setupAudit } from '../../src/convex/integrations/audit'
import { setupBilling, setupReferrals } from '../../src/convex/integrations/billing'
import { setupEmail } from '../../src/convex/integrations/email'
import { type AccessConsole, type MemberTicket, type MemberTicketsOptions, setupAccess } from '../../src/convex/integrations/launch'
import type { ReferralCodeView, ReferralsView } from '../../src/convex/integrations/referrals'
import { formatAuthSecret } from '../../src/convex/auth-secrets'
import { inviteHash, memberTicketToken } from '../../src/convex/access-tickets'

// Member tickets (`access.memberTickets`) over the mounted component: while
// the app is closed, each member holds one access link of `uses`, minted on
// the first ask and read back after, whose token is derived under the auth
// secret so only its hash is kept; it admits as the `member-ticket` ticket,
// labelled with its member, until it is used up or expires, and each sign-up
// checks it against its member and the program; it is off while the app is
// public or the app's own switch says so, nobody else's to read, revoked by
// an administrator from the Access tab, and gone with its member's erasure.
// With the app's referral program, each friend it admits is the member's
// referral from the moment their account is made.

const SECRET = 'a-test-secret-that-is-long-enough-1234'
const NEXT_SECRET = 'the-secret-a-rotation-writes-9876543210abcd'
const DAY = 24 * 60 * 60 * 1000
const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
const audit = setupAudit(components as never)
const program = { on: true }
/** The app's referral program, attributing sign-ups: what a member's ticket claims its friends under. */
const referrals = setupReferrals(components as never, { billing: setupBilling(components as never, { email: setupEmail(components as never), catalog: {} }) })

/** An app whose access runs member tickets, its gate re-exported for the tests. */
function memberApp(options: Pick<MemberTicketsOptions, 'chain' | 'referrals'> = {}) {
  const access = setupAccess(components as never, { phases: ['early-access', 'invite-only', 'public'], audit })
  const memberTickets = access.memberTickets({ uses: 3, lifetime: 60 * DAY, enabled: () => program.on, ...options })
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
  return defineBackendTestApp(defineSchema({}), {
    './_generated/api.js': () => Promise.resolve({}),
    './access.js': () => Promise.resolve({ ...access.api, ...memberTickets.api, admission, redeem, attach }),
    './audit.js': () => Promise.resolve(audit.api),
    './referrals.js': () => Promise.resolve(referrals.api),
  })
}
const testApp = memberApp()
type App = ReturnType<typeof testApp>

const getMemberTicket = makeFunctionReference<'query', Record<string, never>, MemberTicket | null>('access:getMemberTicket')
const issueMemberTicket = makeFunctionReference<'mutation', Record<string, never>, MemberTicket>('access:issueMemberTicket')
const setAccessPhase = makeFunctionReference<'mutation', { phase: string }, null>('access:setAccessPhase')
const getAccessConsole = makeFunctionReference<'query', Record<string, never>, AccessConsole | null>('access:getAccessConsole')
const revokeInvite = makeFunctionReference<'mutation', { id: string }, null>('access:revokeInvite')
const checkInvite = makeFunctionReference<'mutation', { code: string }, { status: string }>('access:checkInvite')
const admissionRef = makeFunctionReference<'query', { email: string, code?: string }, { phase: string, ticket: string | null, invite: string | null }>('access:admission')
const redeemRef = makeFunctionReference<'mutation', { email: string, code?: string, ticket: string }, { ticket: string, label?: string } | { refused: string }>('access:redeem')
const attachRef = makeFunctionReference<'mutation', { email: string, userId: string }, { ticket: string, label?: string } | null>('access:attach')
const listActivity = makeFunctionReference<'query', { paginationOpts: { numItems: number, cursor: string | null } }, { page: Array<{ type: string, data: Record<string, unknown> }> } | null>('audit:listActivity')
const getReferralCode = makeFunctionReference<'mutation', Record<string, never>, ReferralCodeView>('referrals:getReferralCode')
const getReferrals = makeFunctionReference<'query', Record<string, never>, ReferralsView | null>('referrals:getReferrals')
const claimReferral = makeFunctionReference<'mutation', { code: string }, { claimed: boolean, reason?: string }>('referrals:claimReferral')
const ticketOf = components.backend.access.ticketOf as unknown as FunctionReference<'query', 'public', { userId: string }, { kind: string, label?: string } | null>

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

/** Write fields on an account, as the auth routes do (a ban, an unban). */
async function updateUser(app: App, userId: string, update: Record<string, unknown>) {
  await app.mutation(components.backend.adapter.updateOne as unknown as FunctionReference<'mutation'>, { input: { model: 'user', where: [{ field: '_id', value: userId }], update } })
}

/** A friend signs up through the token, and the account is made. */
async function signUp(app: App, email: string, token: string) {
  const taken = await app.mutation(redeemRef, { email, code: token, ticket: 'access-link' })
  const friend = await asUser(app, { email })
  await app.mutation(attachRef, { email, userId: friend.userId })
  return { taken, friend }
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

  test('records its mint on the member\'s activity, labelled member', async () => {
    const ada = await asUser(t, { email: 'ada@panels.example' })
    await ada.mutation(issueMemberTicket, {})
    await ada.mutation(issueMemberTicket, {})
    const trail = (await ada.query(listActivity, { paginationOpts: { numItems: 20, cursor: null } }))!.page.filter(row => row.type === 'access.invite_created')
    expect(trail).toEqual([expect.objectContaining({ data: { kind: 'link', label: 'member', maxUses: 3 } })])
  })

  test('is each member\'s own', async () => {
    const ada = await asUser(t, { email: 'ada@panels.example' })
    const grace = await asUser(t, { email: 'grace@panels.example' })
    expect(tokenOf(await ada.mutation(issueMemberTicket, {}))).not.toBe(tokenOf(await grace.mutation(issueMemberTicket, {})))
  })

  test('admits its uses as the member-ticket ticket, labelled with its member on the ledger, then stays the member\'s, used up', async () => {
    const ada = await asUser(t, { email: 'ada@panels.example' })
    const token = tokenOf(await ada.mutation(issueMemberTicket, {}))
    expect(await t.query(admissionRef, { email: 'friend1@example.org', code: token })).toMatchObject({ phase: 'early-access', ticket: 'access-link', invite: 'valid' })
    for (const friend of ['friend1@example.org', 'friend2@example.org', 'friend3@example.org']) {
      // The sign-up's hooks see the cohort, never the member's id.
      expect(await t.mutation(redeemRef, { email: friend, code: token, ticket: 'access-link' })).toEqual({ ticket: 'member-ticket', label: 'member' })
    }
    expect(await t.mutation(redeemRef, { email: 'friend4@example.org', code: token, ticket: 'access-link' })).toEqual({ refused: 'used-up' })
    const friend = await asUser(t, { email: 'friend1@example.org' })
    expect(await t.mutation(attachRef, { email: 'friend1@example.org', userId: friend.userId })).toEqual({ ticket: 'member-ticket', label: 'member' })
    // The Users tab reads who brought them.
    expect(await t.query(ticketOf, { userId: friend.userId })).toEqual({ kind: 'member-ticket', label: `member:${ada.userId}` })
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
    vi.stubEnv('AUTH_SECRET', formatAuthSecret([{ version: Math.floor(Date.now() / 1000), value: NEXT_SECRET }, { version: 0, value: SECRET }]))
    expect(await ada.query(getMemberTicket, {})).toMatchObject({ state: 'issued', token })
    expect(await t.mutation(redeemRef, { email: 'friend@example.org', code: token, ticket: 'access-link' })).toMatchObject({ ticket: 'member-ticket' })
  })

  test('gets a new link for the same ticket once the previous secret retires: the old one stops, and its uses left and end stay', async () => {
    const ada = await asUser(t, { email: 'ada@panels.example' })
    const issued = await ada.mutation(issueMemberTicket, {})
    const token = tokenOf(issued)
    vi.stubEnv('AUTH_SECRET', formatAuthSecret([{ version: Math.floor(Date.now() / 1000), value: NEXT_SECRET }, { version: 0, value: SECRET }]))
    // A friend's sign-up during the rotation re-keys the row under the new secret.
    await t.mutation(redeemRef, { email: 'friend@example.org', code: token, ticket: 'access-link' })
    vi.stubEnv('AUTH_SECRET', NEXT_SECRET)
    expect(await ada.query(getMemberTicket, {})).toEqual({ state: 'none', uses: 2 })
    const again = await ada.mutation(issueMemberTicket, {})
    expect(again).toMatchObject({ state: 'issued', uses: 3, left: 2, expiresAt: issued.state === 'issued' ? issued.expiresAt : 0 })
    expect(tokenOf(again)).not.toBe(token)
    expect(await t.mutation(checkInvite, { code: token })).toEqual({ status: 'unknown' })
    expect(await t.mutation(checkInvite, { code: tokenOf(again) })).toEqual({ status: 'valid' })
    expect(await ada.query(getMemberTicket, {})).toEqual(again)
    // Still one ticket: no second one beside the first.
    const admin = await asUser(t, { role: 'admin' })
    expect((await admin.query(getAccessConsole, {}))!.memberTickets).toHaveLength(1)
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

  test('admits nobody while the app\'s switch is off, and again once it is on', async () => {
    const ada = await asUser(t, { email: 'ada@panels.example' })
    const token = tokenOf(await ada.mutation(issueMemberTicket, {}))
    program.on = false
    expect(await t.mutation(checkInvite, { code: token })).toEqual({ status: 'revoked' })
    expect(await t.query(admissionRef, { email: 'friend@example.org', code: token })).toMatchObject({ ticket: null, invite: 'revoked' })
    expect(await t.mutation(redeemRef, { email: 'friend@example.org', code: token, ticket: 'access-link' })).toEqual({ refused: 'revoked' })
    program.on = true
    expect(await t.mutation(redeemRef, { email: 'friend@example.org', code: token, ticket: 'access-link' })).toMatchObject({ ticket: 'member-ticket' })
  })

  test('admits nobody once its member is banned, and again once the ban lifts', async () => {
    const ada = await asUser(t, { email: 'ada@panels.example' })
    const token = tokenOf(await ada.mutation(issueMemberTicket, {}))
    await updateUser(t, ada.userId, { banned: true })
    expect(await ada.query(getMemberTicket, {})).toBeNull()
    expect(await refusalOf(ada.mutation(issueMemberTicket, {}))).toMatchObject({ code: 'forbidden', data: { reason: 'banned' } })
    expect(await t.mutation(checkInvite, { code: token })).toEqual({ status: 'revoked' })
    expect(await t.query(admissionRef, { email: 'friend@example.org', code: token })).toMatchObject({ ticket: null, invite: 'revoked' })
    expect(await t.mutation(redeemRef, { email: 'friend@example.org', code: token, ticket: 'access-link' })).toEqual({ refused: 'revoked' })
    // A ban whose end has passed is lifted, as at the member's next sign-in.
    await updateUser(t, ada.userId, { banExpires: Date.now() - 1000 })
    expect(await t.mutation(checkInvite, { code: token })).toEqual({ status: 'valid' })
    await updateUser(t, ada.userId, { banned: false, banExpires: null })
    expect(await t.mutation(redeemRef, { email: 'friend@example.org', code: token, ticket: 'access-link' })).toMatchObject({ ticket: 'member-ticket' })
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

  test('lists in the Access tab apart from the codes and links, by member, never its token', async () => {
    const ada = await asUser(t, { email: 'ada@panels.example' })
    const issued = await ada.mutation(issueMemberTicket, {})
    const admin = await asUser(t, { role: 'admin' })
    const view = (await admin.query(getAccessConsole, {}))!
    expect(view.invites).toEqual([])
    expect(view.memberTickets).toEqual([{ id: expect.any(String), holder: ada.userId, email: 'ada@panels.example', maxUses: 3, uses: 0, status: 'valid', expiresAt: issued.state === 'issued' ? issued.expiresAt : 0, createdAt: expect.any(Number) }])
    expect(JSON.stringify(view)).not.toContain(tokenOf(issued))
  })

  test('revoked by an administrator, stops at once, and its member reads off until it would have ended', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const ada = await asUser(t, { email: 'ada@panels.example' })
    const token = tokenOf(await ada.mutation(issueMemberTicket, {}))
    const admin = await asUser(t, { role: 'admin' })
    const [row] = (await admin.query(getAccessConsole, {}))!.memberTickets
    await admin.mutation(revokeInvite, { id: row!.id })
    expect(await t.mutation(checkInvite, { code: token })).toEqual({ status: 'revoked' })
    expect(await ada.query(getMemberTicket, {})).toEqual({ state: 'off' })
    // Asking again is no fresh start.
    expect(await ada.mutation(issueMemberTicket, {})).toEqual({ state: 'off' })
    expect((await admin.query(getAccessConsole, {}))!.memberTickets).toEqual([expect.objectContaining({ status: 'revoked' })])
    vi.setSystemTime(Date.now() + 61 * DAY)
    expect(await ada.query(getMemberTicket, {})).toEqual({ state: 'none', uses: 3 })
  })

  test('goes with its member\'s erasure, and the friends it admitted keep their ticket without the member\'s name', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date'] })
    const ada = await asUser(t, { email: 'ada@panels.example' })
    const token = tokenOf(await ada.mutation(issueMemberTicket, {}))
    const { friend } = await signUp(t, 'friend@example.org', token)
    await t.mutation(components.backend.account.forget as unknown as FunctionReference<'mutation'>, { userId: ada.userId })
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await t.mutation(checkInvite, { code: token })).toEqual({ status: 'unknown' })
    expect(await t.query(ticketOf, { userId: friend.userId })).toEqual({ kind: 'member-ticket', label: 'member' })
  })

  test('is none of its own for an account a member ticket admitted, unless the app asks for chains', async () => {
    const ada = await asUser(t, { email: 'ada@panels.example' })
    const { friend } = await signUp(t, 'friend@example.org', tokenOf(await ada.mutation(issueMemberTicket, {})))
    expect(await friend.query(getMemberTicket, {})).toEqual({ state: 'off' })
    expect(await friend.mutation(issueMemberTicket, {})).toEqual({ state: 'off' })
    // With chains, the friend holds one of their own, and it admits.
    const chained = memberApp({ chain: true })()
    const host = await asUser(chained, { email: 'ada@panels.example' })
    const { friend: guest } = await signUp(chained, 'friend@example.org', tokenOf(await host.mutation(issueMemberTicket, {})))
    expect(await guest.query(getMemberTicket, {})).toEqual({ state: 'none', uses: 3 })
    const guestToken = tokenOf(await guest.mutation(issueMemberTicket, {}))
    expect(await chained.mutation(redeemRef, { email: 'friend-of-friend@example.org', code: guestToken, ticket: 'access-link' })).toMatchObject({ ticket: 'member-ticket' })
  })

  test('claims each friend it admits as its member\'s referral with `referrals`, as the account is made, whatever code a link carries', async () => {
    const referring = memberApp({ referrals })()
    const ada = await asUser(referring, { email: 'ada@panels.example' })
    const mallory = await asUser(referring, { email: 'mallory@elsewhere.example' })
    const token = tokenOf(await ada.mutation(issueMemberTicket, {}))
    // The ticket carries no code: who let the friend in decides, never the link.
    expect(await ada.query(getMemberTicket, {})).not.toHaveProperty('referral')
    // The friend signs up through it from anywhere: nothing of their own claims anything.
    const { friend } = await signUp(referring, 'friend@example.org', token)
    expect(await ada.query(getReferrals, {})).toMatchObject({ claimed: 1 })
    // Another code put on the link (`?ref=`) or claimed after takes nothing from the member.
    const theirs = (await mallory.mutation(getReferralCode, {})).code
    expect(await friend.mutation(claimReferral, { code: theirs })).toEqual({ claimed: false, reason: 'already_claimed' })
    expect(await mallory.query(getReferrals, {})).toMatchObject({ claimed: 0 })
    // The claim's own checks hold: an address that is the member's own claims nothing, and still signs up.
    const { taken } = await signUp(referring, 'ada+2@panels.example', token)
    expect(taken).toEqual({ ticket: 'member-ticket', label: 'member' })
    expect(await ada.query(getReferrals, {})).toMatchObject({ claimed: 1 })
  })

  test('claims nobody without `referrals`, and a program that fails never fails the sign-up', async () => {
    const ada = await asUser(t, { email: 'ada@panels.example' })
    const { friend } = await signUp(t, 'friend@example.org', tokenOf(await ada.mutation(issueMemberTicket, {})))
    expect(await ada.query(getReferrals, {})).toMatchObject({ claimed: 0 })
    // Not claimed, so the friend may still claim a referral of their choosing.
    const theirs = (await (await asUser(t, { email: 'grace@panels.example' })).mutation(getReferralCode, {})).code
    expect(await friend.mutation(claimReferral, { code: theirs })).toEqual({ claimed: true })

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const failing = memberApp({ referrals: { claimFor: () => Promise.reject(new Error('down')) } })()
    const host = await asUser(failing, { email: 'ada@panels.example' })
    const { taken } = await signUp(failing, 'friend@example.org', tokenOf(await host.mutation(issueMemberTicket, {})))
    expect(taken).toEqual({ ticket: 'member-ticket', label: 'member' })
    expect(warn.mock.calls.flat().join(' ')).toContain('access.referral_unclaimed')

    // A program that throws once its claim is made leaves the friend counted: the warning says they may not be, never that they are not.
    warn.mockClear()
    const late = memberApp({
      referrals: {
        claimFor: async (ctx, input) => {
          await referrals.claimFor(ctx, input)
          throw new Error('activity down')
        },
      },
    })()
    const grace = await asUser(late, { email: 'grace@panels.example' })
    await signUp(late, 'friend-of-grace@example.org', tokenOf(await grace.mutation(issueMemberTicket, {})))
    expect(await grace.query(getReferrals, {})).toMatchObject({ claimed: 1 })
    expect(warn.mock.calls.flat().join(' ')).toContain('may not count as the member\'s referral')
    warn.mockRestore()
  })

  test('admits nobody through an app that declares no program', async () => {
    const access = setupAccess(components as never, { phases: ['early-access', 'invite-only', 'public'], audit })
    const without = defineBackendTestApp(defineSchema({}), {
      './_generated/api.js': () => Promise.resolve({}),
      './access.js': () => Promise.resolve({ ...access.api }),
      './audit.js': () => Promise.resolve(audit.api),
    })()
    // A member ticket left from when the app ran the program.
    const ada = await asUser(without, { email: 'ada@panels.example' })
    const expiresAt = Date.now() + DAY
    const token = await memberTicketToken(SECRET, ada.userId, expiresAt)
    await without.mutation(components.backend.access.createInvite as unknown as FunctionReference<'mutation'>, { kind: 'link', tokenHash: (await inviteHash(SECRET, token))!, label: `member:${ada.userId}`, maxUses: 3, expiresAt, holder: ada.userId })
    expect(await without.mutation(checkInvite, { code: token })).toEqual({ status: 'revoked' })
  })

  test('takes uses and a lifetime it can keep, declared once', () => {
    const fresh = () => setupAccess(components as never, { phases: ['early-access', 'invite-only', 'public'], audit })
    expect(() => fresh().memberTickets({ uses: 0 })).toThrow(/uses/)
    expect(() => fresh().memberTickets({ uses: 1.5 })).toThrow(/uses/)
    expect(() => fresh().memberTickets({ lifetime: 400 * DAY })).toThrow(/lifetime/)
    expect(() => fresh().memberTickets({ referrals: true as never })).toThrow(/`referrals` is not a setupReferrals instance/)
    const access = fresh()
    expect(access.memberTickets()).toMatchObject({ uses: 3, lifetime: 60 * DAY })
    expect(() => access.memberTickets()).toThrow(/once/)
  })
})
