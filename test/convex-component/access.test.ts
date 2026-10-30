/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, type FunctionReference, makeFunctionReference, mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { RECENT_SIGN_IN_SECONDS } from '../../src/convex/constants'
import { getBackendError } from '../../src/convex/errors'
import { type AuditPage, setupAudit } from '../../src/convex/integrations/audit'
import { type AccessConsole, type AccessPhaseState, type AdmitResult, setupAccess } from '../../src/convex/integrations/launch'
import { inviteHash, normalizeInvite } from '../../src/convex/access-tickets'
import { formatAuthSecret } from '../../src/convex/auth-secrets'

// Launch access over the mounted component: the phase (stored, read, moved
// by an administrator in person), invite codes and access links (shown once,
// kept as keyed hashes, checked, used up, revoked), invitations by address,
// and the gate `setupAuth` asks: the one read that decides a sign-up and the
// transaction that takes its ticket. The routes it guards are held in
// test/unit/access-auth-flow.test.ts.

const SECRET = 'a-test-secret-that-is-long-enough-1234'
const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
const audit = setupAudit(components as never)
const access = setupAccess(components as never, { phases: ['early-access', 'invite-only', 'public'], domains: ['team.example'], audit })

const makeCode = mutationGeneric({
  args: { label: v.string(), maxUses: v.number() },
  handler: async (ctx, input) => access.invites.create(ctx, input),
})
const admitFromServer = mutationGeneric({
  args: { emails: v.array(v.string()) },
  handler: async (ctx, { emails }) => access.admit(ctx, { emails, label: 'beta-1' }),
})
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
  './access.js': () => Promise.resolve({ ...access.api, makeCode, admitFromServer, admission, redeem, attach }),
  './audit.js': () => Promise.resolve(audit.api),
})
type App = ReturnType<typeof testApp>

const getAccessPhase = makeFunctionReference<'query', Record<string, never>, AccessPhaseState>('access:getAccessPhase')
const checkInvite = makeFunctionReference<'mutation', { code: string }, { status: string }>('access:checkInvite')
const getAccessConsole = makeFunctionReference<'query', Record<string, never>, AccessConsole | null>('access:getAccessConsole')
const setAccessPhase = makeFunctionReference<'mutation', { phase: string }, null>('access:setAccessPhase')
const createInvite = makeFunctionReference<'mutation', { kind: string, label: string, maxUses: number, expiresAt?: number }, { id: string, code: string }>('access:createInvite')
const revokeInvite = makeFunctionReference<'mutation', { id: string }, null>('access:revokeInvite')
const admitEmails = makeFunctionReference<'mutation', { emails: string[], label?: string }, AdmitResult>('access:admitEmails')
const makeCodeRef = makeFunctionReference<'mutation', { label: string, maxUses: number }, string>('access:makeCode')
const admitFromServerRef = makeFunctionReference<'mutation', { emails: string[] }, AdmitResult>('access:admitFromServer')
const attachRef = makeFunctionReference<'mutation', { email: string, userId: string }, unknown>('access:attach')
const admissionRef = makeFunctionReference<'query', { email: string, code?: string }, { phase: string, ticket: string | null, invite: string | null }>('access:admission')
const redeemRef = makeFunctionReference<'mutation', { email: string, code?: string, ticket: string }, { ticket: string } | { refused: string }>('access:redeem')
const listAllActivity = makeFunctionReference<'query', { paginationOpts: { numItems: number, cursor: string | null } }, AuditPage | null>('audit:listAllActivity')

let t: App

beforeEach(() => {
  vi.stubEnv('AUTH_SECRET', SECRET)
  t = testApp()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

const administrator = (app: App = t) => asUser(app, { role: 'admin' })

async function refusalOf(call: Promise<unknown>) {
  try {
    await call
  }
  catch (error) {
    return getBackendError(error)
  }
  return null
}

describe('the phase', () => {
  test('a new deployment opens on its first phase, for anyone, signed in or not', async () => {
    const ada = await asUser(t, { email: 'ada@panels.example' })
    expect(await ada.query(getAccessPhase, {})).toMatchObject({ phase: 'early-access' })
    expect(await t.query(getAccessPhase, {})).toEqual({ phase: 'early-access', phases: ['early-access', 'invite-only', 'public'] })
  })

  test('an administrator moves it, in person and recently signed in, and it lands on the trail', async () => {
    const admin = await administrator()
    await admin.mutation(setAccessPhase, { phase: 'invite-only' })
    expect((await t.query(getAccessPhase, {})).phase).toBe('invite-only')
    const page = await admin.query(listAllActivity, { paginationOpts: { numItems: 10, cursor: null } })
    expect(page!.page.find(event => event.type === 'access.phase_changed')).toMatchObject({ data: { phase: 'invite-only', from: 'early-access' } })
  })

  test('is refused to anyone else', async () => {
    const ada = await asUser(t)
    expect(await refusalOf(ada.mutation(setAccessPhase, { phase: 'public' }))).toMatchObject({ code: 'forbidden', data: { reason: 'admin_only' } })
    const admin = await administrator()
    const visiting = await asUser(t, { role: 'admin', impersonatedBy: admin.userId })
    expect(await refusalOf(visiting.mutation(setAccessPhase, { phase: 'public' }))).toMatchObject({ code: 'forbidden', data: { reason: 'impersonating' } })
    const stale = await asUser(t, { role: 'admin', signedInAt: Date.now() - (RECENT_SIGN_IN_SECONDS + 60) * 1000 })
    expect(await refusalOf(stale.mutation(setAccessPhase, { phase: 'public' }))).toMatchObject({ code: 'reauthentication_required' })
    expect((await t.query(getAccessPhase, {})).phase).toBe('early-access')
  })

  test('refuses a phase the app skips', async () => {
    const skipping = setupAccess(components as never, { phases: ['invite-only', 'public'], audit })
    const app = defineBackendTestApp(defineSchema({}), {
      './_generated/api.js': () => Promise.resolve({}),
      './access.js': () => Promise.resolve(skipping.api),
      './audit.js': () => Promise.resolve(audit.api),
    })()
    const admin = await administrator(app as App)
    expect((await app.query(getAccessPhase, {})).phase).toBe('invite-only')
    expect(await refusalOf(admin.mutation(setAccessPhase, { phase: 'early-access' }))).toMatchObject({ code: 'invalid_input', data: { field: 'phase' } })
  })

  test('takes only phases it knows, each once', () => {
    expect(() => setupAccess(components as never, { phases: ['public', 'public'], audit })).toThrow(/at most once/)
    expect(() => setupAccess(components as never, { phases: [], audit })).toThrow(/at least one/)
  })
})

describe('invite codes and access links', () => {
  test('a new meetup code checks as valid until its uses run out', async () => {
    const admin = await administrator()
    const code = await admin.mutation(makeCodeRef, { label: 'meetup', maxUses: 1 })
    expect(code).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/)
    expect(await t.mutation(checkInvite, { code })).toEqual({ status: 'valid' })
    // Without case or the dash, a look-alike read as one.
    expect(await t.mutation(checkInvite, { code: code.toLowerCase().replace('-', '') })).toEqual({ status: 'valid' })
    expect(await t.mutation(redeemRef, { email: 'new@resend.dev', code, ticket: 'invite-code' })).toEqual({ ticket: 'invite-code', label: 'meetup' })
    expect(await t.mutation(checkInvite, { code })).toEqual({ status: 'used-up' })
    expect(await t.mutation(redeemRef, { email: 'late@resend.dev', code, ticket: 'invite-code' })).toEqual({ refused: 'used-up' })
  })

  test('keeps a keyed hash, never the code, and shows the code once', async () => {
    const admin = await administrator()
    const { id, code } = await admin.mutation(createInvite, { kind: 'code', label: 'friends', maxUses: 5 })
    const console = (await admin.query(getAccessConsole, {}))!
    expect(console.invites).toEqual([expect.objectContaining({ id, kind: 'code', label: 'friends', uses: 0, maxUses: 5, status: 'valid' })])
    expect(JSON.stringify(console)).not.toContain(code)
    expect(await inviteHash(SECRET, code)).not.toBe(normalizeInvite(code))
  })

  test('an access link needs an expiry, and checks as expired once it passes', async () => {
    const admin = await administrator()
    expect(await refusalOf(admin.mutation(createInvite, { kind: 'link', label: 'launch-post', maxUses: 100 }))).toMatchObject({ code: 'invalid_input', data: { field: 'expiresAt' } })
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const { code } = await admin.mutation(createInvite, { kind: 'link', label: 'launch-post', maxUses: 100, expiresAt: Date.now() + 60_000 })
      expect(code).toMatch(/^[0-9A-Z]{26}$/)
      expect(await t.query(admissionRef, { email: 'new@resend.dev', code })).toMatchObject({ ticket: 'access-link', invite: 'valid' })
      vi.setSystemTime(Date.now() + 120_000)
      expect(await t.mutation(checkInvite, { code })).toEqual({ status: 'expired' })
    }
    finally {
      vi.useRealTimers()
    }
  })

  test('revoking closes a code at once', async () => {
    const admin = await administrator()
    const { id, code } = await admin.mutation(createInvite, { kind: 'code', label: 'oops', maxUses: 3 })
    await admin.mutation(revokeInvite, { id })
    expect(await t.mutation(checkInvite, { code })).toEqual({ status: 'revoked' })
    // An id nothing has does nothing.
    await admin.mutation(revokeInvite, { id })
    expect(await t.mutation(checkInvite, { code: 'not a code!' })).toEqual({ status: 'unknown' })
  })

  test('a code made before an AUTH_SECRET rotation is re-keyed in the window, and works once the old secret retires', async () => {
    const admin = await administrator()
    const code = await admin.mutation(makeCodeRef, { label: 'pre-rotation', maxUses: 5 })
    const NEW = 'the-secret-a-rotation-writes-9876543210abcd'
    vi.stubEnv('AUTH_SECRET', formatAuthSecret([{ version: Math.floor(Date.now() / 1000), value: NEW }, { version: 0, value: SECRET }]))
    // A read can't write: it finds the row under the old secret.
    expect(await t.query(admissionRef, { email: 'new@resend.dev', code })).toMatchObject({ invite: 'valid' })
    // The first check during the window moves the row to the current secret.
    expect(await t.mutation(checkInvite, { code })).toEqual({ status: 'valid' })
    vi.stubEnv('AUTH_SECRET', formatAuthSecret([{ version: Math.floor(Date.now() / 1000), value: NEW }]))
    expect(await t.mutation(checkInvite, { code })).toEqual({ status: 'valid' })
    expect(await t.mutation(redeemRef, { email: 'new@resend.dev', code, ticket: 'invite-code' })).toEqual({ ticket: 'invite-code', label: 'pre-rotation' })
  })

  test('the open codes still under an older secret are counted before it retires', async () => {
    const admin = await administrator()
    const VERSION = Math.floor(Date.now() / 1000)
    // What `env rotate` runs: the component's internal query, which no app code calls.
    const stale = (components.backend.access as unknown as { staleInvites: FunctionReference<'query', 'internal', { keyVersion: number, now: number }, { count: number, more: boolean }> }).staleInvites
    const countStale = (args: { keyVersion: number, now: number }) => t.query(stale, args)
    const kept = await admin.mutation(makeCodeRef, { label: 'kept', maxUses: 5 })
    await admin.mutation(makeCodeRef, { label: 'forgotten', maxUses: 5 })
    const { id: revoked } = await admin.mutation(createInvite, { kind: 'code', label: 'revoked', maxUses: 1 })
    await admin.mutation(revokeInvite, { id: revoked })
    vi.stubEnv('AUTH_SECRET', formatAuthSecret([{ version: VERSION, value: 'the-secret-a-rotation-writes-9876543210abcd' }, { version: 0, value: SECRET }]))
    // Two open codes under the plain secret; the revoked one does not count.
    expect(await countStale({ keyVersion: VERSION, now: Date.now() })).toEqual({ count: 2, more: false })
    // One is checked in the window and moves to the current secret.
    expect(await t.mutation(checkInvite, { code: kept })).toEqual({ status: 'valid' })
    expect(await countStale({ keyVersion: VERSION, now: Date.now() })).toEqual({ count: 1, more: false })
    // A code made in the window is under the current secret already.
    await admin.mutation(makeCodeRef, { label: 'new', maxUses: 5 })
    expect(await countStale({ keyVersion: VERSION, now: Date.now() })).toEqual({ count: 1, more: false })
  })

  test('a code made before a rotation and never looked up in the window stops working once the old secret retires', async () => {
    const admin = await administrator()
    const code = await admin.mutation(makeCodeRef, { label: 'forgotten', maxUses: 5 })
    vi.stubEnv('AUTH_SECRET', formatAuthSecret([{ version: 1, value: 'the-secret-a-rotation-writes-9876543210abcd' }]))
    expect(await t.mutation(checkInvite, { code })).toEqual({ status: 'unknown' })
  })

  test('only administrators make and revoke them', async () => {
    const ada = await asUser(t)
    expect(await refusalOf(ada.mutation(createInvite, { kind: 'code', label: 'mine', maxUses: 1 }))).toMatchObject({ code: 'forbidden', data: { reason: 'admin_only' } })
    expect(await ada.query(getAccessConsole, {})).toBeNull()
  })
})

describe('invitations by address', () => {
  test('cleans the list, skips accounts and reserved domains, and admits the rest for 30 days', async () => {
    const admin = await administrator()
    await asUser(t, { email: 'member@resend.dev' })
    const result = await admin.mutation(admitEmails, { emails: ['Grace@Resend.dev ', 'member@resend.dev', 'someone@example.com', 'not-an-address'], label: 'beta-1' })
    expect(result.admitted).toEqual(['grace@resend.dev'])
    expect(result.skipped).toEqual(expect.arrayContaining([
      { email: 'someone@example.com', reason: 'reserved' },
      { email: 'not-an-address', reason: 'malformed' },
      { email: 'member@resend.dev', reason: 'account' },
    ]))
    expect(await t.query(admissionRef, { email: 'grace@resend.dev' })).toMatchObject({ ticket: 'invitation' })
    expect(await t.mutation(redeemRef, { email: 'grace@resend.dev', ticket: 'invitation' })).toEqual({ ticket: 'invitation', label: 'beta-1' })
    // Used: it admits nobody again, and stays as the account's record.
    expect(await t.query(admissionRef, { email: 'grace@resend.dev' })).toMatchObject({ ticket: null })
  })

  test('server code admits the same way, with no email', async () => {
    const result = await t.mutation(admitFromServerRef, { emails: ['ada@resend.dev'] })
    expect(result.admitted).toEqual(['ada@resend.dev'])
  })

  test('refuses more than 500 at a time', async () => {
    const admin = await administrator()
    const emails = Array.from({ length: 501 }, (_, index) => `person-${index}@resend.dev`)
    expect(await refusalOf(admin.mutation(admitEmails, { emails }))).toMatchObject({ code: 'invalid_input', data: { field: 'emails' } })
  })
})

describe('the gate', () => {
  test('admits an allowed domain and a pending workspace invitation; a gift only once it is paid', async () => {
    expect(await t.query(admissionRef, { email: 'ada@team.example' })).toMatchObject({ phase: 'early-access', ticket: 'domain' })
    expect(await t.query(admissionRef, { email: 'stranger@resend.dev' })).toMatchObject({ ticket: null, invite: null })
    await t.mutation(components.backend.adapter.create, { input: { model: 'invitation', data: { organizationId: 'w1', email: 'invited@resend.dev', role: 'member', status: 'pending', expiresAt: Date.now() + 60_000, createdAt: Date.now(), inviterId: 'u1' } } } as never)
    expect(await t.query(admissionRef, { email: 'invited@resend.dev' })).toMatchObject({ ticket: 'workspace-invitation' })
    // A gift whose purchase is not paid yet admits nobody.
    await t.mutation(components.backend.gifts.create, { recipientEmail: 'gifted@resend.dev', purchaserUserId: 'u1', productIds: ['prod_pack'] } as never)
    expect(await t.query(admissionRef, { email: 'gifted@resend.dev' })).toMatchObject({ ticket: null })
  })

  test('one account\'s workspace invitations admit ten new addresses, and the people they admitted admit nobody', async () => {
    const invite = (email: string, inviterId: string) => t.mutation(components.backend.adapter.create, { input: { model: 'invitation', data: { organizationId: `w-${inviterId}`, email, role: 'member', status: 'pending', expiresAt: Date.now() + 60_000, createdAt: Date.now(), inviterId } } } as never)
    for (let index = 0; index < 11; index++) await invite(`friend-${index}@resend.dev`, 'alice')
    for (let index = 0; index < 10; index++) {
      const email = `friend-${index}@resend.dev`
      expect(await t.query(admissionRef, { email })).toMatchObject({ ticket: 'workspace-invitation' })
      expect(await t.mutation(redeemRef, { email, ticket: 'workspace-invitation' })).toEqual({ ticket: 'workspace-invitation' })
      await t.mutation(attachRef, { email, userId: `friend-${index}` })
    }
    // Alice's share is used up.
    expect(await t.query(admissionRef, { email: 'friend-10@resend.dev' })).toMatchObject({ ticket: null })
    // A friend a workspace invitation admitted opens the closed phase to nobody.
    await invite('chain@resend.dev', 'friend-0')
    expect(await t.query(admissionRef, { email: 'chain@resend.dev' })).toMatchObject({ ticket: null })
  })

  test('two sign-ups racing for the last use: one gets it', async () => {
    const code = await (await administrator()).mutation(makeCodeRef, { label: 'last', maxUses: 1 })
    const [first, second] = await Promise.all([
      t.mutation(redeemRef, { email: 'one@resend.dev', code, ticket: 'invite-code' }),
      t.mutation(redeemRef, { email: 'two@resend.dev', code, ticket: 'invite-code' }),
    ])
    expect([first, second].filter(answer => 'ticket' in answer)).toHaveLength(1)
  })
})
