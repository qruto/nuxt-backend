import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { buildAuthOptions } from '../../src/convex/client/better-auth-options'
import { tables } from '../../src/convex/components/backend/schema'
import { setupMcp } from '../../src/convex/integrations/mcp'
import { asUser } from '../../src/convex/test'

// nuxt-backend/test's callers against the tokens they stand in for. A real
// sign-up runs on Better Auth's memory adapter with the package's own options
// and mints a session token; the agent exchange signs an agent's. A claim
// added, renamed or dropped on either side fails here, so app tests never run
// on stale claims.

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
    vi.stubEnv('NUXT_BACKEND_LOG_OTP', '1')
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

describe('an agent caller', () => {
  it('carries the claims the agent token exchange signs', async () => {
    const signJWT = vi.fn(async (_args: { body: { payload: Record<string, unknown> } }) => ({ token: 'jwt' }))
    const fake = {
      api: { getMcpSession: async () => ({ userId: 'user-1', clientId: 'client-1', scopes: 'openid billing:read' }), signJWT },
      $context: Promise.resolve({
        adapter: {
          findOne: async ({ model }: { model: string }) => model === 'user'
            ? { name: 'Ada', email: 'ada@example.com', emailVerified: true, role: 'user' }
            : { organizationId: 'org-1' },
        },
      }),
    }
    const { exchangeHandler } = setupMcp({ createAuth: () => fake, createSignerAuth: () => fake })
    await exchangeHandler({} as never, new Request('https://site.test/mcp/exchange', { method: 'POST', headers: { Authorization: 'Bearer opaque' } }))
    const real = signJWT.mock.calls[0]![0].body.payload

    const kit = await kitClaims({ agent: { clientId: 'client-1', scopes: ['openid', 'billing:read'] } })
    expect(names(kit)).toEqual(names(real))
    expect(kinds(kit)).toEqual(kinds(real))
  })
})
