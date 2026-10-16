import { createHash, createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { authFlow, SECRET, wrong } from '../helpers/auth-flow'

// One-time codes against real Better Auth, through its routes: what a guess
// loop gets, what the database keeps of a code, and which code routes a
// passwordless app leaves open at all.

afterEach(() => {
  vi.unstubAllEnvs()
})

const ADA = 'ada@example.com'

describe('guessing a code', () => {
  it('refuses the fourth try at a code, the right code included, though two were minted', async () => {
    const flow = await authFlow()
    await flow.sendCode(ADA)
    const { code } = await flow.sendCode(ADA)

    for (let guess = 0; guess < 3; guess++) {
      expect((await flow.post('/sign-in/email-otp', { email: ADA, otp: wrong(code) })).status).toBe(400)
    }
    const fourth = await flow.post('/sign-in/email-otp', { email: ADA, otp: code })
    expect(fourth.status).toBe(403)
    expect(await fourth.json()).toMatchObject({ code: 'TOO_MANY_ATTEMPTS' })
    expect(flow.db.session).toHaveLength(0)
  })

  it('keeps one live code per address and purpose: a new code replaces the last', async () => {
    const flow = await authFlow()
    await flow.signedIn(ADA)
    await flow.sendCode(ADA)
    await flow.sendCode(ADA)
    await flow.sendCode(ADA, 'email-verification')
    await flow.sendCode(ADA, 'email-verification')

    const identifiers = flow.db.verification!.map(row => row.identifier).sort()
    expect(identifiers).toEqual([`email-verification-otp-${ADA}`, `sign-in-otp-${ADA}`])
  })

  it('throttles a guess loop that keeps asking for new codes, per address', async () => {
    const flow = await authFlow()
    // Three codes, three wrong guesses each, then a fourth code: the tenth
    // guess is the last one the address gets this hour.
    for (let round = 0; round < 3; round++) {
      const { code } = await flow.sendCode(ADA)
      for (let guess = 0; guess < 3; guess++) {
        expect((await flow.post('/sign-in/email-otp', { email: ADA, otp: wrong(code) })).status).toBe(400)
      }
    }
    const { code } = await flow.sendCode(ADA)
    expect((await flow.post('/sign-in/email-otp', { email: ADA, otp: wrong(code) })).status).toBe(400)

    const right = await flow.post('/sign-in/email-otp', { email: ADA, otp: code })
    expect(right.status).toBe(429)
    expect(await right.json()).toMatchObject({ message: 'Too many code attempts. Please try again later.', retryAfter: 60_000 })
    expect(flow.db.session).toHaveLength(0)

    // Keyed by a digest of the address: never the address itself, and
    // another address keeps its own budget.
    const keys = flow.limiter.limit.mock.calls.filter(call => call[1] === 'emailOtpAttempt').map(call => call[2]?.key)
    expect(new Set(keys).size).toBe(1)
    expect(keys[0]).toMatch(/^[0-9a-f]{64}$/)
    const bob = await flow.sendCode('bob@example.com')
    expect((await flow.post('/sign-in/email-otp', { email: 'bob@example.com', otp: bob.code })).status).toBe(200)
  })

  it('spends the same budget when the address is typed differently, whichever route checks the code', async () => {
    const flow = await authFlow()
    await flow.signedIn(ADA)
    const { code } = await flow.sendCode(ADA)
    await flow.sendCode(ADA, 'email-verification')
    await flow.post('/sign-in/email-otp', { email: 'Ada@Example.com', otp: wrong(code) })
    await flow.post('/email-otp/verify-email', { email: 'ADA@example.com', otp: wrong(code) })

    const keys = flow.limiter.limit.mock.calls.filter(call => call[1] === 'emailOtpAttempt').map(call => call[2]?.key)
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
  })

  it('spends nothing on a check while no code is waiting: no one locks an address out without codes going to it', async () => {
    const flow = await authFlow()
    await flow.signedIn(ADA)
    for (let guess = 0; guess < 20; guess++) {
      expect((await flow.post('/sign-in/email-otp', { email: ADA, otp: String(100000 + guess) })).status).toBe(400)
    }
    expect(flow.limiter.total('emailOtpAttempt')).toBe(0)

    const { code } = await flow.sendCode(ADA)
    expect((await flow.post('/sign-in/email-otp', { email: ADA, otp: code })).status).toBe(200)
  })

  it('offers no way to check a code without using it up', async () => {
    const flow = await authFlow()
    await flow.signedIn(ADA)
    const { code } = await flow.sendCode(ADA)

    for (const path of ['/email-otp/check-verification-otp', '/email-otp/check%2Dverification-otp']) {
      expect((await flow.post(path, { email: ADA, type: 'sign-in', otp: code })).status).toBe(404)
    }
    // The code is still the live one: nothing was learned, nothing was spent.
    expect((await flow.post('/sign-in/email-otp', { email: ADA, otp: code })).status).toBe(200)
  })
})

describe('what the database keeps of a code', () => {
  it('a hash keyed by the auth secret: neither the code nor its unkeyed digest, and no other key reproduces it', async () => {
    const flow = await authFlow()
    const { code } = await flow.sendCode(ADA)
    const [row] = flow.db.verification!
    const stored = String(row!.value).split(':')[0]!

    expect(stored).not.toContain(code!)
    // Better Auth's own `storeOTP: 'hashed'`, which a million guesses invert.
    expect(stored).not.toBe(createHash('sha256').update(code!).digest('base64url'))
    expect(stored).not.toBe(createHash('sha256').update(code!).digest('hex'))
    expect(stored).not.toBe(createHmac('sha256', 'another-secret-that-is-long-enough').update(`email-otp:${code}`).digest('hex'))
    // Only the deployment's secret reproduces it.
    expect(stored).toBe(createHmac('sha256', SECRET).update(`email-otp:${code}`).digest('hex'))
  })
})

describe('a passwordless app', () => {
  const RESET_ROUTES = ['/email-otp/request-password-reset', '/forget-password/email-otp']

  it('mints and sends no password-reset code, and sets no password', async () => {
    const flow = await authFlow()
    await flow.signedIn(ADA)

    for (const path of RESET_ROUTES) expect((await flow.post(path, { email: ADA })).status).toBe(404)
    expect((await flow.post('/email-otp/reset-password', { email: ADA, otp: '123456', password: 'a-new-password-1234' })).status).toBe(404)
    const viaSend = await flow.post('/email-otp/send-verification-otp', { email: ADA, type: 'forget-password' })
    expect(viaSend.status).toBe(400)

    expect(flow.db.verification).toHaveLength(0)
    expect(flow.sent.filter(entry => entry.name === 'otp')).toHaveLength(0)
    expect(flow.db.account!.filter(row => row.providerId === 'credential')).toHaveLength(0)
    expect(flow.limiter.limit).not.toHaveBeenCalled()
  })

  it('turns off the link routes: no link verifies an address or changes one', async () => {
    const flow = await authFlow()
    const { cookie } = await flow.signedIn(ADA)

    expect((await flow.post('/send-verification-email', { email: ADA })).status).toBe(404)
    expect((await flow.get('/verify-email?token=anything')).status).toBe(404)
    expect((await flow.post('/change-email', { newEmail: 'ada@new.example' }, { cookie })).status).toBe(404)
  })
})

describe('an app that turns passwords on', () => {
  const passwords = { build: { authOptions: { emailAndPassword: { enabled: true } } } }

  it('sends reset codes under the send limits, per address and deployment-wide', async () => {
    const flow = await authFlow(passwords)
    await flow.signedIn(ADA)

    const response = await flow.post('/email-otp/request-password-reset', { email: ADA })
    expect(response.status).toBe(200)
    expect(flow.codeFor(ADA, 'forget-password')).toMatch(/^\d{6}$/)
    expect(flow.limiter.limit.mock.calls.map(call => call[1])).toEqual(['emailOtpGlobal', 'emailOtp'])

    // The per-address bucket holds five; the sixth request is refused.
    for (let send = 0; send < 4; send++) await flow.post('/forget-password/email-otp', { email: ADA })
    expect((await flow.post('/email-otp/request-password-reset', { email: ADA })).status).toBe(429)
  })

  it('counts every reset attempt against the address', async () => {
    const flow = await authFlow(passwords)
    await flow.signedIn(ADA)
    await flow.post('/email-otp/request-password-reset', { email: ADA })
    const code = flow.codeFor(ADA, 'forget-password')

    expect((await flow.post('/email-otp/reset-password', { email: ADA, otp: wrong(code), password: 'a-new-password-1234' })).status).toBe(400)
    expect(flow.limiter.total('emailOtpAttempt')).toBe(1)
    expect((await flow.post('/email-otp/reset-password', { email: ADA, otp: code, password: 'a-new-password-1234' })).status).toBe(200)
    expect(flow.limiter.total('emailOtpAttempt')).toBe(2)
  })
})
