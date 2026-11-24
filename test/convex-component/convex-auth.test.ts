/// <reference types="vite/client" />
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, makeFunctionReference, queryGeneric } from 'convex/server'
import { defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { setupAuth } from '../../src/convex/client'

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
