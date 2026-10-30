import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { buildAuthOptions, sessionClaims } from '../../src/convex/client/better-auth-options'
import { tables } from '../../src/convex/components/backend/schema'
import { asUser } from '../../src/convex/test'
import { sameCodeBrowser } from '../helpers/auth-flow'

// nuxt-backend/test's callers against the tokens they stand in for. A real
// sign-up runs on Better Auth's memory adapter with the package's own options
// and mints a session token. A claim added, renamed or dropped fails here, so
// app tests never run on stale claims.

const ORIGIN = 'https://app.example.com'
const BASE = `${ORIGIN}/api/auth`

/** What only a signed token carries: the signature's frame, not the caller. */
const FRAME = ['iat', 'exp', 'iss', 'aud', 'sub']

/** The claims `asUser` hands convex-test, read from a stand-in instance. */
async function kitClaims(options: Parameters<typeof asUser>[1] = {}): Promise<Record<string, unknown>> {
  let rows = 0
  const t = {
    mutation: vi.fn(async () => ({ _id: `row-${++rows}` })),
    withIdentity: (identity: Record<string, unknown>) => ({ identity }),
  }
  const caller = await asUser(t as never, options) as unknown as { identity: Record<string, unknown> }
  const { subject: _subject, issuer: _issuer, ...claims } = caller.identity
  return claims
}

const names = (claims: Record<string, unknown>) => Object.keys(claims).filter(name => !FRAME.includes(name)).sort()
const kinds = (claims: Record<string, unknown>) => Object.fromEntries(names(claims).map(name => [name, typeof claims[name]]))

describe('a session caller', () => {
  let auth: { handler: (request: Request) => Promise<Response> }

  beforeEach(() => {
    const db = Object.fromEntries(Object.keys(tables).map(table => [table, []]))
    const memory = memoryAdapter(db)
    // The convex plugin no-ops writes outside a mutation; this adapter is one.
    const database = ((options: unknown) => {
      const adapter = (memory as (options: unknown) => { options?: Record<string, unknown> })(options)
      adapter.options = { ...adapter.options, isRunMutationCtx: true }
      return adapter
    }) as never
    auth = betterAuth(buildAuthOptions(database, {
      authOptions: { baseURL: ORIGIN, secret: 'a-test-secret-that-is-long-enough-1234' },
    }) as never)
    // One browser asks for the code and checks it.
    sameCodeBrowser(auth)
    vi.stubEnv('BACKEND_ENVIRONMENT', 'development')
    vi.stubEnv('CONVEX_SITE_URL', 'https://happy-otter-123.convex.site')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const post = (path: string, body: Record<string, unknown>, cookie = '') => auth.handler(new Request(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'origin': ORIGIN, cookie },
    body: JSON.stringify(body),
  }))

  /** A real sign-up by code, then the token the client trades its session for. */
  async function sessionTokenClaims(): Promise<Record<string, unknown>> {
    // Codes are stored hashed: read this one from the dev echo.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await post('/email-otp/send-verification-otp', { email: 'ada@example.com', type: 'sign-in' })
    const otp = warn.mock.calls.flat().join('\n').match(/for ada@example\.com: (\d{6})/)?.[1]
    warn.mockRestore()
    const signIn = await post('/sign-in/email-otp', { email: 'ada@example.com', otp, name: 'Ada' })
    expect(signIn.status).toBe(200)
    const cookie = signIn.headers.getSetCookie().map(set => set.split(';')[0]).join('; ')

    const response = await auth.handler(new Request(`${BASE}/convex/token`, { headers: { cookie, origin: ORIGIN } }))
    const { token } = await response.json() as { token: string }
    return JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as Record<string, unknown>
  }

  it('carries the claims a real session token carries, of the same kinds', async () => {
    const real = await sessionTokenClaims()
    const kit = await kitClaims()
    expect(names(kit)).toEqual(names(real))
    // Dates leave the Convex adapter as numbers and the memory adapter as
    // strings; every other claim keeps its kind.
    const { createdAt: _c, updatedAt: _u, ...realKinds } = kinds(real)
    expect(kinds(kit)).toMatchObject({ ...realKinds, createdAt: 'number', updatedAt: 'number' })
  })
})

describe('a session token', () => {
  it('never takes a claim only the package writes from a field of the user', () => {
    // An app's own user fields, named like the claims that make an impersonation or a session.
    const user = {
      id: 'user-1', name: 'Ada', email: 'ada@example.com', impersonatedBy: 'nobody', activeOrganizationId: 'org-x', sessionId: 's-x', sub: 'other',
      // The identity Convex reads: a field like these must never make the session somebody else's.
      subject: 'user-2', issuer: 'https://evil.example', tokenIdentifier: 'https://evil.example|user-2', email_verified: true, preferred_username: 'root', given_name: 'Root',
    }
    expect(sessionClaims({ user, session: {} })).toEqual({ name: 'Ada', email: 'ada@example.com' })
    expect(sessionClaims({ user, session: { activeOrganizationId: 'org-1', impersonatedBy: 'admin-1' } }))
      .toEqual({ name: 'Ada', email: 'ada@example.com', activeOrganizationId: 'org-1', impersonatedBy: 'admin-1' })
  })
})
