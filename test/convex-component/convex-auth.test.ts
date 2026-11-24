/// <reference types="vite/client" />
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, makeFunctionReference, queryGeneric } from 'convex/server'
import { defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { setupAuth } from '../../src/convex/client'
import { appCode, secretOf } from '../helpers/totp'

// A Convex Auth app end to end: `setupAuth({ provider: 'convex-auth' })`
// over the mounted `backend` component and Convex Auth's core at `auth`.
// The engine runs in-process inside the functions; the browser's transport
// is played by the calls below, its cookie jar included. Every code that
// goes out is recorded, so a test reads it from what was sent.

const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'>, auth: unknown }

interface Sent { name: string, data: Record<string, unknown> }
const sent: Sent[] = []
const email = {
  sendTemplate: vi.fn(async (_ctx: unknown, name: string, data: Record<string, unknown>) => {
    sent.push({ name, data })
    return 'email_1'
  }),
}

const auth = setupAuth(components as never, queryGeneric, { provider: 'convex-auth', email: email as never })
const { refreshSession, signOut, isAuthenticated, signIn, authRequest, listSessions, getAuthUser } = auth

const appModules = {
  './_generated/api.js': () => Promise.resolve({}),
  './auth.js': () => Promise.resolve({ refreshSession, signOut, isAuthenticated, signIn, authRequest, listSessions, getAuthUser }),
}
const refs = {
  refreshSession: makeFunctionReference<'mutation'>('auth:refreshSession'),
  signOut: makeFunctionReference<'mutation'>('auth:signOut'),
  isAuthenticated: makeFunctionReference<'query'>('auth:isAuthenticated'),
  signIn: makeFunctionReference<'action'>('auth:signIn'),
  authRequest: makeFunctionReference<'action'>('auth:authRequest'),
  listSessions: makeFunctionReference<'query'>('auth:listSessions'),
  getAuthUser: makeFunctionReference<'query'>('auth:getAuthUser'),
}

beforeAll(() => {
  vi.stubEnv('SITE_URL', 'http://localhost:3000')
  vi.stubEnv('AUTH_SECRET', 'test-secret-for-convex-auth-sessions-0123456789')
  vi.stubEnv('EMAIL_API_KEY', 're_test')
  vi.stubEnv('EMAIL_FROM', 'Acme <hello@acme.dev>')
  vi.stubEnv('BACKEND_ENVIRONMENT', 'production')
})

afterAll(() => {
  vi.unstubAllEnvs()
})

const testApp = defineBackendTestApp(defineSchema({}), appModules)
let t: ReturnType<typeof testApp>

beforeEach(() => {
  t = testApp()
  sent.length = 0
})

interface Answer { status: number, body: unknown, cookies: Array<{ name: string, value: string, maxAge?: number }> }
type Jar = Record<string, string>

/** Keep the cookies an answer set, as the browser's transport does: one with no life left goes. */
function keep(jar: Jar, answer: Answer): Jar {
  for (const cookie of answer.cookies) {
    if (cookie.maxAge === 0) Reflect.deleteProperty(jar, cookie.name)
    else jar[cookie.name] = cookie.value
  }
  return jar
}

/** A JWT's claims, unverified: what the test reads of a token it was just handed. */
function decodeJwt(token: string): Record<string, unknown> {
  const payload = token.split('.')[1] ?? ''
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>
}

const BROWSER = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130.0', language: 'en-US' }

/** The code the last email to `address` carried. */
function codeFor(address: string): string {
  const email = [...sent].reverse().find(entry => entry.name === 'otp' && entry.data.email === address)
  if (!email) throw new Error(`no code went to ${address}`)
  return String(email.data.otp)
}

/** Sign in by code, as the login form does: ask for a code, then sign in with it. */
async function signInByCode(address: string, jar: Jar = {}) {
  const asked = await t.action(refs.authRequest, { method: 'POST', path: '/email-otp/send-verification-otp', body: { email: address, type: 'sign-in' }, jar, client: BROWSER }) as Answer
  expect(asked.status).toBe(200)
  keep(jar, asked)
  const result = await t.action(refs.signIn, { method: 'POST', path: '/sign-in/email-otp', body: { email: address, otp: codeFor(address) }, jar, client: BROWSER }) as
    { status: 'complete', tokens: { accessToken: string, refreshToken: string, refreshTokenExpiresAt: number, userId: string }, response: Answer } | { status: 'error', userError: { response: Answer } }
  return { result, jar }
}

/** The identity Convex derives from an access token: its claims, the subject as `subject`. */
function identityOf(accessToken: string) {
  const claims = decodeJwt(accessToken) as Record<string, unknown> & { sub: string }
  return { ...claims, subject: claims.sub, issuer: String(claims.iss), tokenIdentifier: `${String(claims.iss)}|${claims.sub}` }
}

describe('a Convex Auth session opened by a sign-in code', () => {
  test('answers Convex Auth tokens whose access token carries the engine session\'s claims', async () => {
    const { result } = await signInByCode('ada@example.com')
    expect(result.status).toBe('complete')
    if (result.status !== 'complete') return
    const claims = decodeJwt(result.tokens.accessToken)
    expect(claims.aud).toBe('nuxt-backend')
    expect(claims.iss).toMatch(/\/components\/backend$/)
    expect(claims.sub).toBe(result.tokens.userId)
    expect(claims.email).toBe('ada@example.com')
    expect(typeof claims.sessionId).toBe('string')
    expect(claims.signInMethod).toBe('email-otp')
    expect(typeof claims.authTime).toBe('number')
    // A new account gets its personal workspace, active in the session.
    expect(typeof claims.activeOrganizationId).toBe('string')
    // The engine's session token never reaches the browser.
    expect(JSON.stringify(result.response.body)).not.toMatch(/"token"/)
    expect(result.response.cookies.some(cookie => /session_token|admin_session/.test(cookie.name))).toBe(false)
  })

  test('stands beside a core session that refreshes, signs out and stops authenticating', async () => {
    const { result } = await signInByCode('ada@example.com')
    if (result.status !== 'complete') throw new Error('sign-in failed')
    const ada = t.withIdentity(identityOf(result.tokens.accessToken))
    expect(await ada.query(refs.isAuthenticated, {})).toBe(true)
    expect((await ada.query(refs.getAuthUser, {}) as { email: string }).email).toBe('ada@example.com')

    const refreshed = await t.mutation(refs.refreshSession, { refreshToken: result.tokens.refreshToken }) as { kind: string, tokens: { accessToken: string, refreshToken: string } }
    expect(refreshed.kind).toBe('rotated')
    expect(refreshed.tokens.refreshToken).not.toBe(result.tokens.refreshToken)
    expect(decodeJwt(refreshed.tokens.accessToken).sessionId).toBe(decodeJwt(result.tokens.accessToken).sessionId)

    await t.mutation(refs.signOut, { refreshToken: refreshed.tokens.refreshToken })
    expect(await ada.query(refs.isAuthenticated, {})).toBe(false)
    expect(await t.mutation(refs.refreshSession, { refreshToken: refreshed.tokens.refreshToken })).toEqual({ kind: 'noSession' })
  })

  test('refuses a code checked in another browser than the one that asked', async () => {
    const asked = await t.action(refs.authRequest, { method: 'POST', path: '/email-otp/send-verification-otp', body: { email: 'ada@example.com', type: 'sign-in' }, jar: {}, client: BROWSER }) as Answer
    expect(asked.status).toBe(200)
    const elsewhere = await t.action(refs.signIn, { method: 'POST', path: '/sign-in/email-otp', body: { email: 'ada@example.com', otp: codeFor('ada@example.com') }, jar: {}, client: BROWSER }) as { status: string, userError: { response: Answer } }
    expect(elsewhere.status).toBe('error')
    expect(elsewhere.userError.response.status).toBe(400)
    expect(elsewhere.userError.response.body).toMatchObject({ code: 'invalid_input', field: 'otp', reason: 'other_browser' })
  })

  test('ends when the engine session is revoked elsewhere', async () => {
    const laptop = await signInByCode('ada@example.com')
    const phone = await signInByCode('ada@example.com')
    if (laptop.result.status !== 'complete' || phone.result.status !== 'complete') throw new Error('sign-in failed')
    const fromPhone = t.withIdentity(identityOf(phone.result.tokens.accessToken))
    const sessions = await fromPhone.query(refs.listSessions, {}) as Array<{ id: string, current: boolean }>
    expect(sessions).toHaveLength(2)
    const answer = await fromPhone.action(refs.authRequest, { method: 'POST', path: '/revoke-other-sessions', body: {}, client: BROWSER }) as Answer
    expect(answer.status).toBe(200)
    const fromLaptop = t.withIdentity(identityOf(laptop.result.tokens.accessToken))
    expect(await fromLaptop.query(refs.isAuthenticated, {})).toBe(false)
    expect(await t.mutation(refs.refreshSession, { refreshToken: laptop.result.tokens.refreshToken })).toEqual({ kind: 'noSession' })
    expect(await fromPhone.query(refs.isAuthenticated, {})).toBe(true)
  })
})

describe('the engine transport', () => {
  test('refuses the routes Convex Auth replaces, and the sign-in routes', async () => {
    for (const path of ['/sign-out', '/convex/token', '/sign-in/email-otp']) {
      const answer = await t.action(refs.authRequest, { method: 'POST', path, body: {} }) as Answer
      expect(answer.status, path).toBe(404)
    }
    await expect(t.action(refs.signIn, { method: 'POST', path: '/organization/create', body: {} })).rejects.toThrow(/signIn runs the routes that open a session/)
  })

  test('reads the session as the signed-in caller, without its token', async () => {
    const { result } = await signInByCode('ada@example.com')
    if (result.status !== 'complete') throw new Error('sign-in failed')
    const ada = t.withIdentity(identityOf(result.tokens.accessToken))
    const answer = await ada.action(refs.authRequest, { method: 'GET', path: '/get-session', client: BROWSER }) as Answer
    expect(answer.status).toBe(200)
    const body = answer.body as { user: { email: string }, session: Record<string, unknown> }
    expect(body.user.email).toBe('ada@example.com')
    expect(body.session.token).toBeUndefined()
    // Signed out, nobody.
    const nobody = await t.action(refs.authRequest, { method: 'GET', path: '/get-session' }) as Answer
    expect(nobody.body).toBeNull()
  })

  test('a workspace switched reaches the claims at the next refresh', async () => {
    const { result } = await signInByCode('ada@example.com')
    if (result.status !== 'complete') throw new Error('sign-in failed')
    const ada = t.withIdentity(identityOf(result.tokens.accessToken))
    const created = await ada.action(refs.authRequest, { method: 'POST', path: '/organization/create', body: { name: 'Acme', slug: 'acme' }, client: BROWSER }) as Answer
    expect(created.status).toBe(200)
    const workspace = (created.body as { id: string }).id
    const switched = await ada.action(refs.authRequest, { method: 'POST', path: '/organization/set-active', body: { organizationId: workspace }, client: BROWSER }) as Answer
    expect(switched.status).toBe(200)
    const refreshed = await t.mutation(refs.refreshSession, { refreshToken: result.tokens.refreshToken }) as { tokens: { accessToken: string } }
    expect(decodeJwt(refreshed.tokens.accessToken).activeOrganizationId).toBe(workspace)
  })
})

/** Make an account an administrator, as `nuxt-backend admin` does. */
async function makeAdmin(userId: string): Promise<void> {
  await t.mutation(components.backend.adapter.updateOne, { input: { model: 'user', where: [{ field: '_id', value: userId }], update: { role: 'admin' } } } as never)
}

type Complete = { status: 'complete', tokens: { accessToken: string, refreshToken: string, userId: string }, response: Answer }

/** A sign-in that must have completed. */
function completed(result: unknown): Complete {
  const done = result as Complete | { status: 'error', userError: { response: Answer } }
  if (done.status !== 'complete') throw new Error(`sign-in failed: ${JSON.stringify(done.userError.response.body)}`)
  return done
}

describe('sessions the engine replaces', () => {
  test('a re-authentication opens a new session and ends the one it replaces, keeping its workspace', async () => {
    const first = completed((await signInByCode('ada@example.com')).result)
    const ada = t.withIdentity(identityOf(first.tokens.accessToken))
    const jar: Jar = {}
    const asked = await ada.action(refs.authRequest, { method: 'POST', path: '/email-otp/send-verification-otp', body: { email: 'ada@example.com', type: 'sign-in' }, jar, client: BROWSER, reauthenticate: true }) as Answer
    expect(asked.status).toBe(200)
    keep(jar, asked)
    const again = completed(await ada.action(refs.signIn, { method: 'POST', path: '/sign-in/email-otp', body: { email: 'ada@example.com', otp: codeFor('ada@example.com') }, jar, client: BROWSER, reauthenticate: true }))
    const before = decodeJwt(first.tokens.accessToken)
    const after = decodeJwt(again.tokens.accessToken)
    expect(after.sub).toBe(before.sub)
    expect(after.sessionId).not.toBe(before.sessionId)
    expect(after.activeOrganizationId).toBe(before.activeOrganizationId)
    expect(await t.mutation(refs.refreshSession, { refreshToken: first.tokens.refreshToken })).toEqual({ kind: 'noSession' })
    expect(await ada.query(refs.isAuthenticated, {})).toBe(false)
    expect(await t.withIdentity(identityOf(again.tokens.accessToken)).query(refs.isAuthenticated, {})).toBe(true)
  })

  test('a code for another account refuses the re-authentication and keeps the session', async () => {
    const first = completed((await signInByCode('ada@example.com')).result)
    const ada = t.withIdentity(identityOf(first.tokens.accessToken))
    const asked = await ada.action(refs.authRequest, { method: 'POST', path: '/email-otp/send-verification-otp', body: { email: 'mallory@example.com', type: 'sign-in' }, jar: {}, client: BROWSER, reauthenticate: true }) as Answer
    expect(asked.status).toBe(403)
    expect(asked.body).toMatchObject({ code: 'forbidden', reason: 'other_account' })
    expect(await ada.query(refs.isAuthenticated, {})).toBe(true)
  })

  test('an administrator\'s visit is a session of the account visited, and its end hands the administrator a session back', async () => {
    const admin = completed((await signInByCode('root@example.com')).result)
    await makeAdmin(admin.tokens.userId)
    const ada = completed((await signInByCode('ada@example.com')).result)
    // The role reaches the administrator's claims at their next refresh.
    const refreshed = await t.mutation(refs.refreshSession, { refreshToken: admin.tokens.refreshToken }) as { tokens: { accessToken: string, refreshToken: string } }
    expect(decodeJwt(refreshed.tokens.accessToken).role).toBe('admin')
    const asAdmin = t.withIdentity(identityOf(refreshed.tokens.accessToken))

    const visit = completed(await asAdmin.action(refs.signIn, { method: 'POST', path: '/admin/impersonate-user', body: { userId: ada.tokens.userId }, client: BROWSER }))
    const visitClaims = decodeJwt(visit.tokens.accessToken)
    expect(visitClaims.sub).toBe(ada.tokens.userId)
    expect(visitClaims.impersonatedBy).toBe(admin.tokens.userId)
    expect(visitClaims.signInMethod).toBeUndefined()
    // The administrator's browser holds the visit now: their own session waits aside.
    expect(await t.mutation(refs.refreshSession, { refreshToken: refreshed.tokens.refreshToken })).toEqual({ kind: 'noSession' })

    const visiting = t.withIdentity(identityOf(visit.tokens.accessToken))
    const back = completed(await visiting.action(refs.signIn, { method: 'POST', path: '/admin/stop-impersonating', body: {}, client: BROWSER }))
    const backClaims = decodeJwt(back.tokens.accessToken)
    expect(backClaims.sub).toBe(admin.tokens.userId)
    expect(backClaims.impersonatedBy).toBeUndefined()
    expect(backClaims.sessionId).toBe(decodeJwt(refreshed.tokens.accessToken).sessionId)
    expect(await t.mutation(refs.refreshSession, { refreshToken: visit.tokens.refreshToken })).toEqual({ kind: 'noSession' })
    expect(await t.withIdentity(identityOf(back.tokens.accessToken)).query(refs.isAuthenticated, {})).toBe(true)
    // Ada's own session never moved.
    expect(await t.withIdentity(identityOf(ada.tokens.accessToken)).query(refs.isAuthenticated, {})).toBe(true)
  })

  test('a ban ends every session of the account', async () => {
    const admin = completed((await signInByCode('root@example.com')).result)
    await makeAdmin(admin.tokens.userId)
    const refreshed = await t.mutation(refs.refreshSession, { refreshToken: admin.tokens.refreshToken }) as { tokens: { accessToken: string } }
    const ada = completed((await signInByCode('ada@example.com')).result)
    const banned = await t.withIdentity(identityOf(refreshed.tokens.accessToken)).action(refs.authRequest, { method: 'POST', path: '/admin/ban-user', body: { userId: ada.tokens.userId, banReason: 'spam' }, client: BROWSER }) as Answer
    expect(banned.status).toBe(200)
    expect(await t.withIdentity(identityOf(ada.tokens.accessToken)).query(refs.isAuthenticated, {})).toBe(false)
    expect(await t.mutation(refs.refreshSession, { refreshToken: ada.tokens.refreshToken })).toEqual({ kind: 'noSession' })
    // And no new one opens.
    const again = await signInByCode('ada@example.com').catch(error => error as Error)
    expect(again instanceof Error ? again.message : (again.result as { status: string }).status).not.toBe('complete')
  })
})

describe('the authenticator app, on a Convex Auth session', () => {
  test('turns on after a recent sign-in, then asks for its code after every sign-in code, and opens the session on it', async () => {
    const first = completed((await signInByCode('ada@example.com')).result)
    const ada = t.withIdentity(identityOf(first.tokens.accessToken))
    const enabled = await ada.action(refs.authRequest, { method: 'POST', path: '/two-factor/enable', body: {}, client: BROWSER }) as Answer
    expect(enabled.status).toBe(200)
    const { totpURI, backupCodes } = enabled.body as { totpURI: string, backupCodes: string[] }
    expect(totpURI).toMatch(/^otpauth:\/\/totp\//)
    expect(backupCodes.length).toBeGreaterThan(0)
    const secret = secretOf(totpURI)

    // The app's first code turns it on, in a new session that replaces the one that asked.
    const on = completed(await ada.action(refs.signIn, { method: 'POST', path: '/two-factor/verify-totp', body: { code: appCode(secret) }, client: BROWSER }))
    expect(decodeJwt(on.tokens.accessToken).twoFactorEnabled).not.toBe(false)
    expect(await t.mutation(refs.refreshSession, { refreshToken: first.tokens.refreshToken })).toEqual({ kind: 'noSession' })

    // A sign-in code now opens no session: the app's code is asked for.
    const jar: Jar = {}
    const pending = (await signInByCode('ada@example.com', jar)).result
    expect(pending.status).toBe('error')
    const asked = (pending as { userError: { response: Answer } }).userError.response
    expect(asked.body).toMatchObject({ twoFactorRedirect: true, twoFactorMethods: ['totp'] })
    keep(jar, asked)
    expect(Object.keys(jar).some(name => name.endsWith('two_factor'))).toBe(true)

    // A wrong code opens nothing; the right one opens the session the code began.
    const wrong = await t.action(refs.signIn, { method: 'POST', path: '/two-factor/verify-totp', body: { code: '000000' }, jar, client: BROWSER }) as { status: string }
    expect(wrong.status).toBe('error')
    const signedIn = completed(await t.action(refs.signIn, { method: 'POST', path: '/two-factor/verify-totp', body: { code: appCode(secret) }, jar, client: BROWSER }))
    const claims = decodeJwt(signedIn.tokens.accessToken)
    expect(claims.sub).toBe(first.tokens.userId)
    expect(claims.signInMethod).toBe('email-otp')
    expect(await t.withIdentity(identityOf(signedIn.tokens.accessToken)).query(refs.isAuthenticated, {})).toBe(true)

    // A backup code stands in for the app once.
    const again: Jar = {}
    const second = (await signInByCode('ada@example.com', again)).result as { userError: { response: Answer } }
    keep(again, second.userError.response)
    completed(await t.action(refs.signIn, { method: 'POST', path: '/two-factor/verify-backup-code', body: { code: backupCodes[0] }, jar: again, client: BROWSER }))
    const third: Jar = {}
    const reused = (await signInByCode('ada@example.com', third)).result as { userError: { response: Answer } }
    keep(third, reused.userError.response)
    const refused = await t.action(refs.signIn, { method: 'POST', path: '/two-factor/verify-backup-code', body: { code: backupCodes[0] }, jar: third, client: BROWSER }) as { status: string }
    expect(refused.status).toBe('error')
  })

  test('turned off, a sign-in code opens the session on its own again', async () => {
    const first = completed((await signInByCode('ada@example.com')).result)
    const ada = t.withIdentity(identityOf(first.tokens.accessToken))
    const enabled = await ada.action(refs.authRequest, { method: 'POST', path: '/two-factor/enable', body: {}, client: BROWSER }) as Answer
    const secret = secretOf((enabled.body as { totpURI: string }).totpURI)
    const on = completed(await ada.action(refs.signIn, { method: 'POST', path: '/two-factor/verify-totp', body: { code: appCode(secret) }, client: BROWSER }))
    const off = await t.withIdentity(identityOf(on.tokens.accessToken)).action(refs.authRequest, { method: 'POST', path: '/two-factor/disable', body: {}, client: BROWSER }) as Answer
    expect(off.status).toBe(200)
    expect((await signInByCode('ada@example.com')).result.status).toBe('complete')
  })

  test('is never turned on by an administrator visiting the account', async () => {
    const admin = completed((await signInByCode('root@example.com')).result)
    await makeAdmin(admin.tokens.userId)
    const ada = completed((await signInByCode('ada@example.com')).result)
    const refreshed = await t.mutation(refs.refreshSession, { refreshToken: admin.tokens.refreshToken }) as { tokens: { accessToken: string } }
    const visit = completed(await t.withIdentity(identityOf(refreshed.tokens.accessToken)).action(refs.signIn, { method: 'POST', path: '/admin/impersonate-user', body: { userId: ada.tokens.userId }, client: BROWSER }))
    const refused = await t.withIdentity(identityOf(visit.tokens.accessToken)).action(refs.authRequest, { method: 'POST', path: '/two-factor/enable', body: {}, client: BROWSER }) as Answer
    expect(refused.status).toBe(403)
  })
})
