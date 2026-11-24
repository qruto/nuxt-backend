import { afterEach, describe, expect, it, vi } from 'vitest'
import { getBackendError } from '../../src/convex/errors'
import { authFlow } from '../helpers/auth-flow'
import { appCode, secretOf } from '../helpers/totp'

// The authenticator app on a Better Auth app, through its routes: turned on
// after a recent sign-in, asked for after every sign-in code (never after a
// passkey, a second factor of its own), and turned off again.

afterEach(() => {
  vi.unstubAllEnvs()
})

const ADA = 'ada@example.com'

/** The cookies an answer set, as the next request's `Cookie` header, merged over `jar`. */
function cookiesOf(response: Response, jar = ''): string {
  const pairs = new Map(jar.split('; ').filter(Boolean).map(pair => [pair.split('=')[0]!, pair]))
  for (const entry of response.headers.getSetCookie()) {
    const pair = entry.split(';')[0]!
    const name = pair.split('=')[0]!
    if (/max-age=0/i.test(entry)) pairs.delete(name)
    else pairs.set(name, pair)
  }
  return [...pairs.values()].join('; ')
}

/** Turn the app on for a signed-in session: its link, its backup codes and the session's cookie after it. */
async function turnOn(flow: Awaited<ReturnType<typeof authFlow>>, cookie: string) {
  const enabled = await flow.post('/two-factor/enable', {}, { cookie })
  expect(enabled.status).toBe(200)
  const { totpURI, backupCodes } = await enabled.json() as { totpURI: string, backupCodes: string[] }
  const secret = secretOf(totpURI)
  const verified = await flow.post('/two-factor/verify-totp', { code: appCode(secret) }, { cookie })
  expect(verified.status).toBe(200)
  return { secret, backupCodes, cookie: cookiesOf(verified, cookie) }
}

describe('the authenticator app', () => {
  it('turns on without a password, then a sign-in code opens no session until the app\'s code', async () => {
    const flow = await authFlow()
    const { cookie, userId } = await flow.signInWithCode(ADA)
    const { secret } = await turnOn(flow, cookie)
    expect(flow.db.user!.find(row => row.id === userId)).toMatchObject({ twoFactorEnabled: true })

    const { code } = await flow.sendCode(ADA)
    const first = await flow.post('/sign-in/email-otp', { email: ADA, otp: code })
    expect(await first.json()).toMatchObject({ twoFactorRedirect: true, twoFactorMethods: ['totp'] })
    expect(first.headers.getSetCookie().some(entry => /session_token=[^;]+/.test(entry) && !/max-age=0/i.test(entry))).toBe(false)
    const challenge = cookiesOf(first)

    const wrong = await flow.post('/two-factor/verify-totp', { code: '000000' }, { cookie: challenge })
    expect(wrong.status).toBe(401)
    const right = await flow.post('/two-factor/verify-totp', { code: appCode(secret) }, { cookie: challenge })
    expect(right.status).toBe(200)
    const session = await (await flow.get('/get-session', { cookie: cookiesOf(right) })).json() as { user: { id: string }, session: { signInMethod?: string } }
    expect(session.user.id).toBe(userId)
    expect(session.session.signInMethod).toBe('email-otp')
  })

  it('takes a backup code in the app\'s place, once', async () => {
    const flow = await authFlow()
    const { cookie } = await flow.signInWithCode(ADA)
    const { backupCodes } = await turnOn(flow, cookie)
    const signIn = async () => {
      const { code } = await flow.sendCode(ADA)
      return cookiesOf(await flow.post('/sign-in/email-otp', { email: ADA, otp: code }))
    }
    expect((await flow.post('/two-factor/verify-backup-code', { code: backupCodes[0] }, { cookie: await signIn() })).status).toBe(200)
    expect((await flow.post('/two-factor/verify-backup-code', { code: backupCodes[0] }, { cookie: await signIn() })).status).toBe(401)
  })

  it('needs a recent sign-in to turn on, and is refused to an administrator visiting the account', async () => {
    const flow = await authFlow()
    const stale = await flow.signedIn(ADA)
    // A session opened outside a sign-in route has no recent sign-in to show.
    for (const row of flow.db.session!) row.createdAt = new Date(Date.now() - 60 * 60_000)
    const refused = await flow.post('/two-factor/enable', {}, { cookie: stale.cookie })
    expect(refused.status).toBe(403)
    expect(getBackendError({ error: { ...await refused.json() as object, status: 403 } })).toMatchObject({ code: 'reauthentication_required' })

    const visited = await flow.signInWithCode('bob@example.com', 'Bob')
    flow.impersonate(visited.token)
    expect((await flow.post('/two-factor/enable', {}, { cookie: visited.cookie })).status).toBe(403)
  })

  it('skips the step on a browser the person trusted, and only there', async () => {
    const flow = await authFlow()
    const { cookie } = await flow.signInWithCode(ADA)
    const { secret } = await turnOn(flow, cookie)
    const first = await flow.post('/sign-in/email-otp', { email: ADA, otp: (await flow.sendCode(ADA)).code })
    const trusted = await flow.post('/two-factor/verify-totp', { code: appCode(secret), trustDevice: true }, { cookie: cookiesOf(first) })
    expect(trusted.status).toBe(200)
    const browser = cookiesOf(trusted).split('; ').filter(pair => pair.includes('trust_device')).join('; ')
    expect(browser).not.toBe('')

    const again = await (await flow.post('/sign-in/email-otp', { email: ADA, otp: (await flow.sendCode(ADA)).code }, { cookie: browser })).json() as { token?: string, twoFactorRedirect?: boolean }
    expect(again.twoFactorRedirect).toBeUndefined()
    expect(typeof again.token).toBe('string')
    const elsewhere = await (await flow.post('/sign-in/email-otp', { email: ADA, otp: (await flow.sendCode(ADA)).code })).json()
    expect(elsewhere).toMatchObject({ twoFactorRedirect: true })
  })

  it('asks for the app\'s code when verifying the address signs the person in', async () => {
    const flow = await authFlow({ build: { authOptions: { emailVerification: { autoSignInAfterVerification: true } } } })
    const { cookie, userId } = await flow.signInWithCode(ADA)
    await turnOn(flow, cookie)
    for (const row of flow.db.user!) if (row.id === userId) row.emailVerified = false
    const { code } = await flow.sendCode(ADA, 'email-verification')
    const verified = await flow.post('/email-otp/verify-email', { email: ADA, otp: code })
    expect(await verified.json()).toMatchObject({ twoFactorRedirect: true })
    expect(verified.headers.getSetCookie().some(entry => /session_token=[^;]+/.test(entry) && !/max-age=0/i.test(entry))).toBe(false)
  })

  it('turned off, a sign-in code opens the session on its own again', async () => {
    const flow = await authFlow()
    const { cookie } = await flow.signInWithCode(ADA)
    const on = await turnOn(flow, cookie)
    expect((await flow.post('/two-factor/disable', {}, { cookie: on.cookie })).status).toBe(200)
    const { code } = await flow.sendCode(ADA)
    const answer = await (await flow.post('/sign-in/email-otp', { email: ADA, otp: code })).json() as { token?: string }
    expect(typeof answer.token).toBe('string')
  })
})
