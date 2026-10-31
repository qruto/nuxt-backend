import { afterEach, describe, expect, it, vi } from 'vitest'
import { releaseRecoverySession, userHandleOf } from '../../src/convex/client/passkey-only'
import { requestOrigin } from '../../src/convex/client/request-origin'
import { authFlow, ORIGIN } from '../helpers/auth-flow'

// Sign-in security against real Better Auth on a memory database
// (test/helpers/auth-flow.ts): a code works only in the browser that asked
// for it, its email names who asked, and a passkey-only account refuses
// codes and recovers with a code of its own.

afterEach(() => {
  vi.unstubAllEnvs()
})

const ADA = 'ada@example.com'

/** A response's refusal body. */
async function refusal(response: Response) {
  return { status: response.status, ...await response.json() as Record<string, unknown> }
}

/** A passkey row on an account, as Better Auth's passkey plugin writes one. */
function passkeyFor(flow: Awaited<ReturnType<typeof authFlow>>, userId: string, id = 'pk-1') {
  flow.db.passkey!.push({ id, userId, name: 'Laptop', publicKey: 'key', credentialID: `cred-${id}`, counter: 0, deviceType: 'multiDevice', backedUp: true, createdAt: new Date() })
}

/** Turn passkey-only on for a fresh session of `address`: its cookie, id and recovery code. */
async function passkeyOnly(flow: Awaited<ReturnType<typeof authFlow>>, address = ADA) {
  const person = await flow.signedIn(address)
  passkeyFor(flow, person.userId)
  const response = await flow.post('/passkey-only/set', { enabled: true }, { cookie: person.cookie })
  expect(response.status).toBe(200)
  const { recoveryCode } = await response.json() as { recoveryCode: string }
  return { ...person, recoveryCode }
}

describe('a sign-in code', () => {
  it('works in the browser that asked for it, and nowhere else', async () => {
    const flow = await authFlow()
    const { response, code } = await flow.sendCode(ADA)
    const cookie = response.headers.getSetCookie().find(entry => entry.includes('.sign_in_code='))
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/Max-Age=300/i)
    expect(cookie).toMatch(/Path=\/api\/auth/i)

    const elsewhere = await flow.post('/sign-in/email-otp', { email: ADA, otp: code }, { codeBrowser: false })
    expect(await refusal(elsewhere)).toMatchObject({ status: 400, code: 'invalid_input', field: 'otp', reason: 'other_browser' })
    expect(flow.db.session).toHaveLength(0)
    // The refusal spent no attempt: the browser that asked still signs in.
    const here = await flow.post('/sign-in/email-otp', { email: ADA, otp: code })
    expect(here.status).toBe(200)
    // Its cookie goes with the code.
    expect(here.headers.getSetCookie().find(entry => entry.includes('.sign_in_code='))).toMatch(/Max-Age=0/i)
  })

  it('is bound to the code it went with: a newer code needs the newer cookie', async () => {
    const flow = await authFlow()
    const first = await flow.sendCode(ADA)
    const stale = first.response.headers.getSetCookie().find(entry => entry.includes('.sign_in_code='))!.split(';')[0]!
    const { code } = await flow.sendCode(ADA)
    const response = await flow.auth.handler(new Request(`${ORIGIN}/api/auth/sign-in/email-otp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': ORIGIN, 'cookie': stale, 'x-test-other-browser': '1' },
      body: JSON.stringify({ email: ADA, otp: code }),
    }))
    expect(await refusal(response)).toMatchObject({ status: 400, field: 'otp', reason: 'other_browser' })
  })

  it('still counts a wrong guess in the right browser, and the cookie outlives it', async () => {
    const flow = await authFlow()
    const { code } = await flow.sendCode(ADA)
    expect((await flow.post('/sign-in/email-otp', { email: ADA, otp: code === '000000' ? '111111' : '000000' })).status).toBe(400)
    expect((await flow.post('/sign-in/email-otp', { email: ADA, otp: code })).status).toBe(200)
  })

  it('names the device, an approximate place and the time it was asked from', async () => {
    const flow = await authFlow()
    await flow.auth.handler(new Request(`${ORIGIN}/api/auth/email-otp/send-verification-otp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'origin': ORIGIN,
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
        'x-vercel-ip-city': 'Lisbon',
        'x-vercel-ip-country': 'PT',
        'x-vercel-ip-timezone': 'Europe/Lisbon',
      },
      body: JSON.stringify({ email: ADA, type: 'sign-in' }),
    }))
    const sent = flow.sent.find(entry => entry.name === 'otp')!
    expect(sent.data.requestedFrom).toMatchObject({ device: { browser: 'Chrome', os: 'macOS' }, place: { city: 'Lisbon', country: 'PT' }, timeZone: 'Europe/Lisbon' })
  })
})

describe('the request origin', () => {
  const at = Date.UTC(2026, 9, 27, 13, 2)
  const headers = (entries: Record<string, string>) => ({ headers: new Headers(entries) })

  it('names known browsers and systems only, iOS before macOS', () => {
    expect(requestOrigin(headers({ 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' }), at).device).toEqual({ browser: 'Safari', os: 'iOS' })
    expect(requestOrigin(headers({ 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0' }), at).device).toEqual({ browser: 'Edge', os: 'Windows' })
    expect(requestOrigin(headers({ 'user-agent': '<script>alert(1)</script>' }), at)).toEqual({ at })
  })

  it('shows nothing a request wrote that is no place or no time zone', () => {
    expect(requestOrigin(headers({ 'x-vercel-ip-city': 'S%C3%A3o%20Paulo', 'x-vercel-ip-country': 'br' }), at).place).toEqual({ city: 'São Paulo', country: 'BR' })
    const forged = requestOrigin(headers({ 'x-vercel-ip-city': 'Call 555-0100 now', 'x-vercel-ip-country': 'Nowhere', 'x-vercel-ip-timezone': 'Mars/Olympus' }), at)
    expect(forged).toEqual({ at })
    expect(requestOrigin(headers({ 'x-vercel-ip-city': '%E0%A4%A' }), at)).toEqual({ at })
  })
})

describe('a passkey-only account', () => {
  it('turns on only with a passkey, behind a recent sign-in, and answers a recovery code', async () => {
    const flow = await authFlow()
    const person = await flow.signedIn(ADA)
    expect(await refusal(await flow.post('/passkey-only/set', { enabled: true }, { cookie: person.cookie }))).toMatchObject({ status: 400, field: 'passkeys' })
    passkeyFor(flow, person.userId)
    const on = await flow.post('/passkey-only/set', { enabled: true }, { cookie: person.cookie })
    const { recoveryCode } = await on.json() as { recoveryCode: string }
    expect(recoveryCode).toMatch(/^[0-9A-Z]{5}(?:-[0-9A-Z]{5}){3}$/)
    const user = flow.db.user!.find(row => row.id === person.userId)!
    expect(user.passkeyOnly).toBe(true)
    // Only a hash is kept, and the session never carries it.
    expect(String(user.recoveryCodeHash)).not.toContain(recoveryCode.replace(/-/g, ''))
    const session = await (await flow.get('/get-session', { cookie: person.cookie })).json() as { user: Record<string, unknown> }
    expect(session.user.passkeyOnly).toBe(true)
    expect(session.user).not.toHaveProperty('recoveryCodeHash')

    for (const row of flow.db.session!) row.createdAt = new Date(Date.now() - 3600_000)
    expect(await refusal(await flow.post('/passkey-only/set', { enabled: false }, { cookie: person.cookie }))).toMatchObject({ status: 403, code: 'reauthentication_required' })
  })

  it('signs every other session of the account out when it turns on', async () => {
    const flow = await authFlow()
    const person = await flow.signedIn(ADA)
    // Another session, as a code read from a stolen mailbox would open.
    const other = await flow.helpers.login({ userId: person.userId })
    const grace = await flow.signedIn('grace@example.com')
    passkeyFor(flow, person.userId)
    expect((await flow.post('/passkey-only/set', { enabled: true }, { cookie: person.cookie })).status).toBe(200)
    const tokens = flow.db.session!.map(row => row.token)
    expect(tokens).toContain(person.token)
    expect(tokens).not.toContain(other.token)
    expect(tokens).toContain(grace.token)
  })

  it('is refused to an administrator\'s visit', async () => {
    const flow = await authFlow()
    const person = await flow.signedIn(ADA)
    passkeyFor(flow, person.userId)
    flow.impersonate(person.token)
    expect(await refusal(await flow.post('/passkey-only/set', { enabled: true }, { cookie: person.cookie }))).toMatchObject({ status: 403, reason: 'impersonating' })
  })

  it('sends no code: the answer and the cookie are a code request\'s, the email says to use a passkey', async () => {
    const flow = await authFlow()
    await passkeyOnly(flow)
    flow.sent.length = 0
    const response = await flow.post('/email-otp/send-verification-otp', { email: ADA, type: 'sign-in' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(response.headers.getSetCookie().find(entry => entry.includes('.sign_in_code='))).toMatch(/=[0-9a-f]{64};/)
    expect(flow.db.verification!.filter(row => String(row.identifier).startsWith('sign-in-otp-'))).toHaveLength(0)
    expect(flow.sent).toEqual([{ name: 'otp', data: expect.objectContaining({ email: ADA, otp: '', type: 'sign-in', reason: 'passkey-only' }) }])
    // Spent like any other request: a probe costs what a code does.
    expect(flow.limiter.total('emailOtp')).toBe(1)
  })

  it('never opens a session from a code, whatever route checked it', async () => {
    const flow = await authFlow()
    const { code } = await flow.sendCode(ADA)
    // The account turned passkey-only after the code went out.
    flow.db.user!.push({ id: 'ada', email: ADA, name: 'Ada', emailVerified: true, passkeyOnly: true, createdAt: new Date(), updatedAt: new Date() })
    const response = await flow.post('/sign-in/email-otp', { email: ADA, otp: code })
    expect(await refusal(response)).toMatchObject({ status: 400, field: 'otp' })
    expect(flow.db.session).toHaveLength(0)
  })

  it('keeps its last passkey', async () => {
    const flow = await authFlow()
    const person = await passkeyOnly(flow)
    expect(await refusal(await flow.post('/passkey/delete-passkey', { id: 'pk-1' }, { cookie: person.cookie }))).toMatchObject({ status: 400, field: 'passkeys' })
    expect(flow.db.passkey).toHaveLength(1)
  })

  it('recovers with its code into a session that can only save a passkey, and the code is used up', async () => {
    const flow = await authFlow()
    const { recoveryCode, userId } = await passkeyOnly(flow)
    flow.sent.length = 0

    expect(await refusal(await flow.post('/sign-in/recovery-code', { email: ADA, recoveryCode: 'AAAAA-BBBBB-CCCCC-DDDDD' }))).toMatchObject({ status: 400, field: 'recoveryCode' })
    expect(await refusal(await flow.post('/sign-in/recovery-code', { email: 'nobody@example.com', recoveryCode }))).toMatchObject({ status: 400, field: 'recoveryCode' })

    // Typed loosely: lower case, without dashes.
    const response = await flow.post('/sign-in/recovery-code', { email: ADA, recoveryCode: recoveryCode.toLowerCase().replace(/-/g, '') })
    expect(response.status).toBe(200)
    const answer = await response.json() as { recoveryCode: string, user: { id: string } }
    expect(answer.user.id).toBe(userId)
    expect(answer.recoveryCode).not.toBe(recoveryCode)
    const cookie = response.headers.getSetCookie().map(entry => entry.split(';')[0]).join('; ')
    const opened = flow.db.session!.find(row => row.userId === userId && row.passkeyRecovery === true)!
    expect(new Date(opened.expiresAt as Date).getTime() - Date.now()).toBeLessThanOrEqual(15 * 60 * 1000)

    // The person hears of it.
    expect(flow.sent).toEqual([{ name: 'passkeyRecovered', data: expect.objectContaining({ email: ADA, url: expect.stringMatching(/\/security$/) }) }])
    // Nothing but saving a passkey: no Convex token, no profile change.
    expect(await refusal(await flow.get('/convex/token', { cookie }))).toMatchObject({ status: 403, reason: 'passkey_required' })
    expect(await refusal(await flow.post('/update-user', { name: 'Eve' }, { cookie }))).toMatchObject({ status: 403, reason: 'passkey_required' })
    expect((await flow.get('/get-session', { cookie })).status).toBe(200)
    const options = await flow.get('/passkey/generate-register-options', { cookie })
    expect(options.status).toBe(200)

    // The used code stops working; the new one works.
    expect((await flow.post('/sign-in/recovery-code', { email: ADA, recoveryCode })).status).toBe(400)
    expect((await flow.post('/sign-in/recovery-code', { email: ADA, recoveryCode: answer.recoveryCode })).status).toBe(200)
  })

  it('becomes an ordinary session once its passkey is saved', async () => {
    const updateSession = vi.fn(async () => null)
    await releaseRecoverySession({
      path: '/passkey/verify-registration',
      context: { returned: { id: 'pk-2' }, session: { session: { token: 't', passkeyRecovery: true } }, options: { session: { expiresIn: 60 } }, internalAdapter: { updateSession } } as never,
    })
    expect(updateSession).toHaveBeenCalledWith('t', { passkeyRecovery: false, expiresAt: expect.any(Date) })
    updateSession.mockClear()
    await releaseRecoverySession({ path: '/passkey/verify-registration', context: { returned: new Error('no'), session: { session: { token: 't', passkeyRecovery: true } }, internalAdapter: { updateSession } } as never })
    expect(updateSession).not.toHaveBeenCalled()
  })

  it('is turned off by an administrator, after a recent sign-in, and by nobody else', async () => {
    const flow = await authFlow()
    const { userId } = await passkeyOnly(flow)
    const eve = await flow.signedIn('eve@example.com')
    expect(await refusal(await flow.post('/admin/disable-passkey-only', { userId }, { cookie: eve.cookie }))).toMatchObject({ status: 403, reason: 'role' })
    const root = await flow.signedIn('root@example.com', { role: 'admin' })
    expect((await flow.post('/admin/disable-passkey-only', { userId }, { cookie: root.cookie })).status).toBe(200)
    const user = flow.db.user!.find(row => row.id === userId)!
    expect(user.passkeyOnly).toBe(false)
    expect(user.recoveryCodeHash).toBeNull()
  })
})

describe('a passkey-only account, beside what an app turns on', () => {
  /** The Convex token cookie a response set, with a value; `undefined` for none. */
  const convexToken = (response: Response) => response.headers.getSetCookie().find(entry => /convex_jwt=[^;]+/.test(entry))

  it('mints no Convex token for a recovery session, which an ordinary session gets', async () => {
    const flow = await authFlow()
    const { recoveryCode } = await passkeyOnly(flow)
    const other = await flow.signedIn('bo@example.com')
    expect(convexToken(await flow.get('/get-session', { cookie: other.cookie }))).toBeDefined()

    const response = await flow.post('/sign-in/recovery-code', { email: ADA, recoveryCode })
    expect(response.status).toBe(200)
    expect(convexToken(response)).toBeUndefined()
    const cookie = response.headers.getSetCookie().map(entry => entry.split(';')[0]).join('; ')
    const session = await flow.get('/get-session', { cookie })
    expect(session.status).toBe(200)
    expect(convexToken(session)).toBeUndefined()
  })

  it('with passwords on, gets no reset code, and a password opens no session for it', async () => {
    const flow = await authFlow({ build: { authOptions: { emailAndPassword: { enabled: true } } } })
    expect((await flow.post('/sign-up/email', { email: ADA, password: 'a long password 123', name: 'Ada' })).status).toBe(200)
    const user = flow.db.user!.find(row => row.email === ADA)!
    passkeyFor(flow, String(user.id))
    user.passkeyOnly = true
    flow.sent.length = 0
    const sessions = flow.db.session!.length

    const reset = await flow.post('/email-otp/request-password-reset', { email: ADA })
    expect(reset.status).toBe(200)
    expect(flow.sent).toEqual([{ name: 'otp', data: expect.objectContaining({ email: ADA, otp: '', reason: 'passkey-only' }) }])
    expect(flow.db.verification!.filter(row => String(row.identifier).startsWith('forget-password-otp-'))).toHaveLength(0)
    expect((await flow.post('/email-otp/send-verification-otp', { email: ADA, type: 'forget-password' })).status).toBe(200)
    expect(flow.db.verification!.filter(row => String(row.identifier).startsWith('forget-password-otp-'))).toHaveLength(0)
    expect(await refusal(await flow.post('/email-otp/reset-password', { email: ADA, otp: '123456', password: 'attacker password 1' }))).toMatchObject({ status: 400, field: 'otp' })

    expect((await flow.post('/sign-in/email', { email: ADA, password: 'a long password 123' })).status).toBe(400)
    expect(flow.db.session).toHaveLength(sessions)
  })

  it('records each turn of its codes, the administrator\'s included, and refuses another administrator\'s', async () => {
    const recordBackendEvent = vi.fn(async () => 'event_1')
    const flow = await authFlow({ runtime: { audit: { recordBackendEvent } } as never })
    const { userId } = await passkeyOnly(flow)
    expect(recordBackendEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'auth.passkey_only_changed', data: { enabled: true } }))
    const root = await flow.signedIn('root@example.com', { role: 'admin' })
    expect((await flow.post('/admin/disable-passkey-only', { userId }, { cookie: root.cookie })).status).toBe(200)
    expect(recordBackendEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'auth.passkey_only_changed', subjectId: userId, data: { enabled: false } }))

    const other = await flow.signedIn('ops@example.com', { role: 'admin', passkeyOnly: true })
    expect(await refusal(await flow.post('/admin/disable-passkey-only', { userId: other.userId }, { cookie: root.cookie }))).toMatchObject({ status: 403, reason: 'admin_target' })
    expect(flow.db.user!.find(row => row.id === other.userId)!.passkeyOnly).toBe(true)
  })
})

describe('the passkey user handle', () => {
  it('is the account\'s id, so the browser can be told which passkeys the account holds', async () => {
    const flow = await authFlow()
    const person = await flow.signedIn(ADA)
    const response = await flow.get('/passkey/generate-register-options', { cookie: person.cookie })
    const options = await response.json() as { user: { id: string } }
    expect(options.user.id).toBe(userHandleOf(person.userId))
    expect(Buffer.from(options.user.id, 'base64url').toString('utf8')).toBe(person.userId)
  })
})
