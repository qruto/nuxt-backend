import { afterEach, describe, expect, it, vi } from 'vitest'
import { UNDER_AGE_SECONDS } from '../../src/convex/consent-rules'
import type { AccountGate } from '../../src/convex/integrations/account'
import { authFlow, wrong } from '../helpers/auth-flow'

// The minimum age and the sign-up record on real Better Auth routes, through
// a gate that answers from memory as `setupAccount` would
// (test/convex-component/consents.test.ts holds the ledger itself). A new
// address gets its code like anyone, and only once that code checks does it
// learn it must say how old it is; the account's creation checks the age on
// every route and hands the account to the gate, which records what it
// agreed to.

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const body = async (response: Response) => ({ status: response.status, ...await response.clone().json() as Record<string, unknown> })

/** A gate over a minimum age, recording the accounts it was told of. */
function memoryGate(minimumAge: number | undefined) {
  const signedUp: Array<{ userId: string, email: string, agreed?: boolean }> = []
  const gate: AccountGate = {
    minimumAge,
    signUp: async (_ctx, input) => {
      signedUp.push(input)
    },
  }
  return { gate, signedUp }
}

async function flowWith(minimumAge: number | undefined, extra: Record<string, unknown> = {}) {
  const { gate, signedUp } = memoryGate(minimumAge)
  const account = { forget: vi.fn(), soleOwnerships: vi.fn(async () => []), gate, ...extra }
  const flow = await authFlow({ runtime: { account: account as never } })
  return { ...flow, signedUp, account }
}

const underAgeCookie = (response: Response) => response.headers.getSetCookie().find(cookie => /under_age=/.test(cookie))

describe('the minimum age', () => {
  it('sends a new address its code, then asks its age once the code checks, leaving the code unused', async () => {
    const flow = await flowWith(16)
    const { response, code } = await flow.sendCode('new@resend.dev')
    expect(response.status).toBe(200)
    const asked = await flow.post('/sign-in/email-otp', { email: 'new@resend.dev', otp: code })
    expect(await body(asked)).toMatchObject({ status: 403, code: 'forbidden', reason: 'age_required' })
    expect(flow.db.user).toHaveLength(0)
    // The same code again, with the age: the account is made, and the code is used.
    const admitted = await flow.post('/sign-in/email-otp', { email: 'new@resend.dev', otp: code, age: 34 })
    expect(admitted.status).toBe(200)
    expect(flow.db.user).toHaveLength(1)
    expect(flow.signedUp).toEqual([{ userId: flow.db.user![0]!.id, email: 'new@resend.dev', agreed: true }])
    // The age typed is nowhere on the account.
    expect(JSON.stringify(flow.db)).not.toMatch(/"age"/)
  })

  it('tells nothing to a wrong code, and nothing about an address that has an account', async () => {
    const flow = await flowWith(16)
    const { code } = await flow.sendCode('new@resend.dev')
    // A wrong code is the route's own refusal, counted like any other.
    const guess = await flow.post('/sign-in/email-otp', { email: 'new@resend.dev', otp: wrong(code) })
    expect(await body(guess)).toMatchObject({ status: 400 })
    expect(JSON.stringify(await body(guess))).not.toContain('age_required')
    // An existing account signs in with no age at all.
    await flow.signedIn('ada@example.com')
    const again = await flow.sendCode('ada@example.com')
    const back = await flow.post('/sign-in/email-otp', { email: 'ada@example.com', otp: again.code })
    expect(back.status).toBe(200)
    // The account was made outside any request; signing in agrees to nothing new.
    expect(flow.signedUp.filter(entry => entry.agreed)).toEqual([])
  })

  it('refuses an age under the minimum for good in this browser, and creates no account', async () => {
    const flow = await flowWith(16)
    const { code } = await flow.sendCode('kid@resend.dev')
    const refused = await flow.post('/sign-in/email-otp', { email: 'kid@resend.dev', otp: code, age: 12 })
    expect(await body(refused)).toMatchObject({ status: 403, code: 'forbidden', reason: 'under_age' })
    expect(flow.db.user).toHaveLength(0)
    const cookie = underAgeCookie(refused)
    expect(cookie).toBeDefined()
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(new RegExp(`Max-Age=${UNDER_AGE_SECONDS}`, 'i'))
    // The browser carries the cookie: a second answer, however old, is refused.
    const held = cookie!.split(';')[0]!
    const second = await flow.post('/sign-in/email-otp', { email: 'kid@resend.dev', otp: code, age: 40 }, { cookie: held })
    expect(await body(second)).toMatchObject({ status: 403, reason: 'under_age' })
    expect(flow.db.user).toHaveLength(0)
    expect(flow.signedUp).toEqual([])
  })

  it('refuses an age that is no number', async () => {
    const flow = await flowWith(16)
    const { code } = await flow.sendCode('new@resend.dev')
    expect(await body(await flow.post('/sign-in/email-otp', { email: 'new@resend.dev', otp: code, age: 'old' }))).toMatchObject({ status: 400, code: 'invalid_input', field: 'age' })
    expect(await body(await flow.post('/sign-in/email-otp', { email: 'new@resend.dev', otp: code, age: 400 }))).toMatchObject({ status: 400, field: 'age' })
    expect(flow.db.user).toHaveLength(0)
  })

  it('asks the creation itself, so no other route that signs a person up gets round it', async () => {
    const { gate } = memoryGate(16)
    const flow = await authFlow({
      build: { authOptions: { emailAndPassword: { enabled: true } } },
      runtime: { account: { forget: vi.fn(), soleOwnerships: vi.fn(async () => []), gate } as never },
    })
    const sneaky = { email: 'sneaky@resend.dev', name: 'Sneaky', password: 'a-long-enough-password-1' }
    expect(await body(await flow.post('/sign-up/email', sneaky))).toMatchObject({ status: 403, code: 'forbidden', reason: 'age_required' })
    expect(await body(await flow.post('/sign-up/email', { ...sneaky, age: 9 }))).toMatchObject({ status: 403, reason: 'under_age' })
    expect(flow.db.user).toHaveLength(0)
    expect((await flow.post('/sign-up/email', { ...sneaky, age: 30 })).status).toBe(200)
    expect(flow.db.user).toHaveLength(1)
  })

  it('accepts exactly the minimum, and asks nobody when the app sets none', async () => {
    const flow = await flowWith(16)
    const { code } = await flow.sendCode('exact@resend.dev')
    expect((await flow.post('/sign-in/email-otp', { email: 'exact@resend.dev', otp: code, age: '16' })).status).toBe(200)

    const open = await flowWith(undefined)
    const { code: openCode } = await open.sendCode('new@resend.dev')
    expect((await open.post('/sign-in/email-otp', { email: 'new@resend.dev', otp: openCode })).status).toBe(200)
    expect(open.signedUp).toHaveLength(1)
  })

  it('does not ask an account an administrator or the server creates, which agrees to nothing until its first visit', async () => {
    const flow = await flowWith(16)
    const admin = await flow.signedIn('boss@example.com', { role: 'admin' })
    const made = await flow.post('/admin/create-user', { email: 'made@example.com', name: 'Made', password: 'x'.repeat(16), role: 'user' }, { cookie: admin.cookie })
    expect(made.status).toBe(200)
    expect(flow.db.user!.map(row => row.email)).toContain('made@example.com')
    // The gate hears of them, to carry what their address gave before, and records no agreement.
    expect(flow.signedUp.map(entry => [entry.email, entry.agreed])).toEqual([['boss@example.com', false], ['made@example.com', false]])
  })

  it('records a sign-up through the gate even when the app asks no age, and never fails the sign-up when the gate does', async () => {
    const flow = await flowWith(undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    flow.account.gate.signUp = async () => {
      throw new Error('ledger down')
    }
    const { code } = await flow.sendCode('new@resend.dev')
    const signed = await flow.post('/sign-in/email-otp', { email: 'new@resend.dev', otp: code })
    expect(signed.status).toBe(200)
    expect(flow.db.user).toHaveLength(1)
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/consent\.signup_unrecorded/), expect.any(Error))
  })
})
