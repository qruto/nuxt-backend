import { createHash, randomBytes } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { testUtils } from 'better-auth/plugins'
import { buildAuthOptions } from '../../src/convex/client/better-auth-options'
import { tables } from '../../src/convex/components/backend/schema'

// The agent OAuth flow end to end, on Better Auth's memory adapter with the
// package's own options: what an agent gets from /mcp/authorize, what the
// consent page reads, and what /mcp/token will and will not trade.

const ORIGIN = 'http://localhost:3000'
const BASE = `${ORIGIN}/api/auth`
const REDIRECT_URI = 'http://127.0.0.1:9999/callback'

interface TestHelpers {
  createUser: (user: object) => object
  saveUser: (user: object) => Promise<{ id: string }>
  login: (options: { userId: string }) => Promise<{ headers: Headers, token: string }>
  getOTP: (email: string) => string | undefined
}

let db: Record<string, Array<Record<string, unknown>>>
let auth: { handler: (request: Request) => Promise<Response>, $context: Promise<unknown> }
let helpers: TestHelpers

beforeEach(async () => {
  db = Object.fromEntries(Object.keys(tables).map(table => [table, []]))
  const memory = memoryAdapter(db)
  // The convex plugin no-ops writes outside a mutation; this adapter is one.
  const database = ((options: unknown) => {
    const adapter = (memory as (options: unknown) => { options?: Record<string, unknown> })(options)
    adapter.options = { ...adapter.options, isRunMutationCtx: true }
    return adapter
  }) as never
  auth = betterAuth(buildAuthOptions(database, {
    authOptions: { baseURL: ORIGIN, secret: 'a-test-secret-that-is-long-enough-1234', plugins: [testUtils({ captureOTP: true })] },
  }) as never)
  helpers = (await auth.$context as unknown as { test: TestHelpers }).test
  process.env.NUXT_BACKEND_LOG_OTP = '1'
})

async function signedIn(email = 'ada@example.com') {
  const user = await helpers.saveUser(helpers.createUser({ email, name: email.split('@')[0], emailVerified: true }))
  const { headers, token } = await helpers.login({ userId: user.id })
  return { userId: user.id, cookie: headers.get('cookie') ?? '', token }
}

describe('agent registration', () => {
  it('refuses a script-capable redirect URI (the provider\'s own guard, pinned)', async () => {
    const response = await auth.handler(new Request(`${BASE}/mcp/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirect_uris: ['javascript:alert(1)'], client_name: 'Evil agent', token_endpoint_auth_method: 'none' }),
    }))
    expect(response.status).toBe(400)
  })
})

async function registerAgent(): Promise<string> {
  const response = await auth.handler(new Request(`${BASE}/mcp/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ redirect_uris: [REDIRECT_URI], client_name: 'Helpful agent', token_endpoint_auth_method: 'none' }),
  }))
  expect(response.status).toBe(201)
  return (await response.json() as { client_id: string }).client_id
}

function pkce() {
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}

/** The cookies a response sets, as a request `cookie` header. */
function cookiesOf(response: Response): string {
  return response.headers.getSetCookie().map(cookie => cookie.split(';')[0]).join('; ')
}

async function authorize(clientId: string, cookie: string, extra: Record<string, string> = {}) {
  const query = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: 'openid profile billing:read',
    state: 'state-1',
    ...extra,
  })
  return auth.handler(new Request(`${BASE}/mcp/authorize?${query}`, { headers: { cookie } }))
}

async function post(path: string, cookie: string, body: Record<string, unknown>, bearer?: string) {
  return auth.handler(new Request(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie, 'origin': ORIGIN, ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
    body: JSON.stringify(body),
  }))
}

async function token(clientId: string, code: string, verifier: string) {
  return auth.handler(new Request(`${BASE}/mcp/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, code, redirect_uri: REDIRECT_URI, code_verifier: verifier }),
  }))
}

/** Authorize with PKCE as a signed-in person, up to the consent page. */
async function pendingConsent() {
  const person = await signedIn()
  const clientId = await registerAgent()
  const { verifier, challenge } = pkce()
  const response = await authorize(clientId, person.cookie, { code_challenge: challenge, code_challenge_method: 'S256' })
  const location = new URL(response.headers.get('location')!, ORIGIN)
  return { person, clientId, verifier, location, cookie: `${person.cookie}; ${cookiesOf(response)}` }
}

describe('agent authorization', () => {
  it('sends the person to the consent page, even when the agent asks for no prompt', async () => {
    const { location, clientId } = await pendingConsent()

    expect(location.pathname).toBe('/oauth/consent')
    expect(location.searchParams.get('client_id')).toBe(clientId)
    expect(location.searchParams.get('consent_code')).toBeTruthy()
  })

  it('refuses an authorization without PKCE', async () => {
    const person = await signedIn()
    const clientId = await registerAgent()
    const response = await authorize(clientId, person.cookie)

    const location = new URL(response.headers.get('location')!)
    expect(`${location.origin}${location.pathname}`).toBe(REDIRECT_URI)
    expect(location.searchParams.get('error')).toBe('invalid_request')
  })

  it('will not trade a code that is still waiting for consent', async () => {
    const { clientId, verifier, location } = await pendingConsent()
    const response = await token(clientId, location.searchParams.get('consent_code')!, verifier)

    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ error: 'invalid_grant' })
  })
})

describe('the consent page', () => {
  it('reads the request from the server: the agent, where it redirects, and every scope', async () => {
    const { cookie, clientId } = await pendingConsent()
    const response = await post('/agent-consent/request', cookie, {})

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      clientId,
      clientName: 'Helpful agent',
      redirectHost: '127.0.0.1:9999',
      scopes: ['openid', 'profile', 'billing:read'],
    })
  })

  it('approving issues a code the agent trades for a token, with its PKCE verifier', async () => {
    const { cookie, clientId, verifier } = await pendingConsent()
    const consent = await post('/oauth2/consent', cookie, { accept: true })
    const redirect = new URL((await consent.json() as { redirectURI: string }).redirectURI)

    expect(redirect.searchParams.get('state')).toBe('state-1')
    const response = await token(clientId, redirect.searchParams.get('code')!, verifier)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ token_type: 'Bearer', scope: 'openid profile billing:read' })
  })

  it('denying sends the agent access_denied', async () => {
    const { cookie } = await pendingConsent()
    const consent = await post('/oauth2/consent', cookie, { accept: false })
    const redirect = new URL((await consent.json() as { redirectURI: string }).redirectURI)

    expect(redirect.searchParams.get('error')).toBe('access_denied')
  })

  it('answers only the account the request was made for', async () => {
    const { location } = await pendingConsent()
    const other = await signedIn('mallory@example.com')
    const code = location.searchParams.get('consent_code')!

    expect((await post('/agent-consent/request', other.cookie, { consent_code: code })).status).toBe(404)
    expect((await post('/oauth2/consent', other.cookie, { accept: true, consent_code: code })).status).toBe(403)
  })

  it('refuses approval from an administrator impersonating the person', async () => {
    const { cookie, person } = await pendingConsent()
    for (const session of db.session!.filter(row => row.userId === person.userId)) session.impersonatedBy = 'admin-1'

    expect((await post('/oauth2/consent', cookie, { accept: true })).status).toBe(403)
    // Denying stays possible.
    expect((await post('/oauth2/consent', cookie, { accept: false })).status).toBe(200)
  })

  // A Bearer token becomes the session cookie only after every before-hook
  // has run: the consent checks must read the session the route will use.
  it('holds both refusals against a caller who signs in with a Bearer token', async () => {
    const { location, person } = await pendingConsent()
    const code = location.searchParams.get('consent_code')!
    const other = await signedIn('mallory@example.com')

    expect((await post('/oauth2/consent', '', { accept: true, consent_code: code }, other.token)).status).toBe(403)
    for (const session of db.session!.filter(row => row.userId === person.userId)) session.impersonatedBy = 'admin-1'
    expect((await post('/oauth2/consent', '', { accept: true, consent_code: code }, person.token)).status).toBe(403)
    // The person's own Bearer session, not impersonated, answers.
    const own = await helpers.login({ userId: person.userId })
    const approved = await post('/oauth2/consent', '', { accept: true, consent_code: code }, own.token)
    expect(approved.status).toBe(200)
    expect(new URL((await approved.json() as { redirectURI: string }).redirectURI).searchParams.get('code')).toBeTruthy()
  })
})

describe('signing in mid-authorization', () => {
  it('resumes into the consent page, never straight to the agent', async () => {
    await helpers.saveUser(helpers.createUser({ email: 'ada@example.com', name: 'Ada', emailVerified: true }))
    const clientId = await registerAgent()
    const { challenge } = pkce()
    const signedOut = await authorize(clientId, '', { code_challenge: challenge, code_challenge_method: 'S256' })
    expect(signedOut.headers.get('location')).toMatch(/^\/login\?/)

    // Codes are stored hashed, so the database holds nothing to read back: take
    // the code from the dev echo (NUXT_BACKEND_LOG_OTP), as a developer would.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await post('/email-otp/send-verification-otp', '', { email: 'ada@example.com', type: 'sign-in' })
    const otp = warn.mock.calls.flat().join('\n').match(/for ada@example\.com: (\d{6})/)?.[1]
    warn.mockRestore()
    const signIn = await post('/sign-in/email-otp', cookiesOf(signedOut), { email: 'ada@example.com', otp })

    expect(new URL(signIn.headers.get('location')!, ORIGIN).pathname).toBe('/oauth/consent')
  })
})
