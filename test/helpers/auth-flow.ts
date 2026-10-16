import { vi } from 'vitest'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { testUtils, type TestHelpers } from 'better-auth/plugins'
import type { AuthBuildOptions, AuthRateLimitName } from '../../src/convex/client/auth-types'
import { buildAuthOptions } from '../../src/convex/client/better-auth-options'
import type { AuthRuntime } from '../../src/convex/client/runtime'
import { tables } from '../../src/convex/components/backend/schema'
import { DEFAULT_LIMITS } from '../../src/convex/integrations/rate-limit'

// Real Better Auth on a memory database, with the package's options and a
// request runtime: what the route-level tests drive through `auth.handler`.
// The runtime's ctx can "run mutations", so every request guard is live; the
// rate limiter counts in memory against DEFAULT_LIMITS (no refill); the email
// instance records each send instead of delivering it, so a test reads a
// code from what was "sent". It stubs the EMAIL_* env so every address is
// deliverable: call `vi.unstubAllEnvs()` after each test.

export const ORIGIN = 'https://app.example.com'
export const SECRET = 'a-test-secret-that-is-long-enough-1234'
const BASE = `${ORIGIN}/api/auth`

type Row = Record<string, unknown>

/** A limiter over DEFAULT_LIMITS' capacities that never refills: a test spends a bucket by hand. */
export function memoryLimiter() {
  const spent = new Map<string, number>()
  const limit = vi.fn(async (_ctx: unknown, name: AuthRateLimitName, options?: { key?: string }) => {
    const config = DEFAULT_LIMITS[name]
    const capacity = 'capacity' in config ? config.capacity : config.rate
    const bucket = `${name}:${options?.key ?? ''}`
    const used = (spent.get(bucket) ?? 0) + 1
    if (used > capacity) return { ok: false, retryAfter: 60_000 }
    spent.set(bucket, used)
    return { ok: true }
  })
  /** How many tokens of a limit were spent, across every key. */
  const total = (name: AuthRateLimitName) => [...spent].filter(([bucket]) => bucket.startsWith(`${name}:`)).reduce((sum, [, used]) => sum + used, 0)
  return { limit, total }
}

interface SentEmail { name: string, data: Record<string, unknown> }

export interface AuthFlowOptions {
  /** `setupAuth` options beside the integrations; `authOptions` merge over the test defaults. */
  build?: AuthBuildOptions
  /** The integrations: `canSignIn`, `onUserCreated`, … (`email` and `rateLimiter` default to recorders). */
  runtime?: Partial<AuthRuntime>
  /** Change the database adapter Better Auth gets, e.g. to make a read fail. */
  adapter?: (adapter: Record<string, unknown>) => void
}

/** One Better Auth instance and its database, for one test. */
export async function authFlow(options: AuthFlowOptions = {}) {
  vi.stubEnv('EMAIL_API_KEY', 're_test')
  vi.stubEnv('EMAIL_TEST_MODE', 'false')
  vi.stubEnv('EMAIL_FROM', 'Acme <hello@acme.dev>')

  const db: Record<string, Row[]> = Object.fromEntries(Object.keys(tables).map(table => [table, []]))
  const memory = memoryAdapter(db)
  // The convex plugin no-ops writes outside a mutation; this adapter is one.
  const database = ((adapterOptions: unknown) => {
    const adapter = (memory as (options: unknown) => { options?: Record<string, unknown> })(adapterOptions)
    adapter.options = { ...adapter.options, isRunMutationCtx: true }
    options.adapter?.(adapter)
    return adapter
  }) as never

  const sent: SentEmail[] = []
  const email = {
    sendTemplate: vi.fn(async (_ctx: unknown, name: string, data: Record<string, unknown>) => {
      sent.push({ name, data })
      return 'email_1'
    }),
  }
  const limiter = memoryLimiter()
  const runtime = {
    ctx: { runMutation: vi.fn(), runQuery: vi.fn(), scheduler: { runAfter: vi.fn() } },
    email,
    rateLimiter: limiter,
    userExists: async (_ctx: unknown, address: string) => db.user!.some(row => row.email === address.trim().toLowerCase()),
    ...options.runtime,
  } as unknown as AuthRuntime

  const { authOptions, ...build } = options.build ?? {}
  const auth = betterAuth(buildAuthOptions(database, {
    ...build,
    authOptions: { baseURL: ORIGIN, secret: SECRET, ...authOptions, plugins: [testUtils(), ...authOptions?.plugins ?? []] },
  }, runtime) as never) as unknown as { handler: (request: Request) => Promise<Response>, $context: Promise<{ test: TestHelpers }> }
  const helpers = (await auth.$context).test

  /** POST a JSON body as a browser would (a session cookie), as an API client would (a Bearer token), or anonymously. */
  async function post(path: string, body: Record<string, unknown> = {}, credential: { cookie?: string, bearer?: string } = {}) {
    return auth.handler(new Request(`${BASE}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'origin': ORIGIN,
        ...(credential.cookie ? { cookie: credential.cookie } : {}),
        ...(credential.bearer ? { authorization: `Bearer ${credential.bearer}` } : {}),
      },
      body: JSON.stringify(body),
    }))
  }

  /** GET, with the same credentials as {@link post}. */
  async function get(path: string, credential: { cookie?: string, bearer?: string } = {}) {
    return auth.handler(new Request(`${BASE}${path}`, {
      headers: {
        origin: ORIGIN,
        ...(credential.cookie ? { cookie: credential.cookie } : {}),
        ...(credential.bearer ? { authorization: `Bearer ${credential.bearer}` } : {}),
      },
    }))
  }

  /** An account with a session: its id, the session's cookie header, and the raw token a Bearer carries. */
  async function signedIn(address = 'ada@example.com', fields: Row = {}) {
    const user = await helpers.saveUser(helpers.createUser({ email: address, name: address.split('@')[0], emailVerified: true, ...fields }))
    const { headers, token } = await helpers.login({ userId: user.id })
    return { userId: user.id, cookie: headers.get('cookie') ?? '', token }
  }

  /** Mark a session as opened by an administrator impersonating its user. */
  function impersonate(token: string, adminId = 'admin-1') {
    for (const row of db.session!.filter(session => session.token === token)) row.impersonatedBy = adminId
  }

  /** The last code sent to an address. */
  function codeFor(address: string, type?: string): string | undefined {
    return sent.filter(entry => entry.name === 'otp' && entry.data.email === address && (!type || entry.data.type === type)).at(-1)?.data.otp as string | undefined
  }

  /** Ask for a sign-in code and read it back. */
  async function sendCode(address: string, type = 'sign-in') {
    const response = await post('/email-otp/send-verification-otp', { email: address, type })
    return { response, code: codeFor(address, type) }
  }

  /**
   * Sign in through the code routes, as a person does, so the session hooks
   * run inside the request (`signedIn` creates its session outside one).
   */
  async function signInWithCode(address = 'ada@example.com', name = 'Ada') {
    const { code } = await sendCode(address)
    const response = await post('/sign-in/email-otp', { email: address, otp: code, name })
    const cookie = response.headers.getSetCookie().map(entry => entry.split(';')[0]).join('; ')
    const { token, user } = await response.json() as { token: string, user: { id: string } }
    return { response, cookie, token, userId: user.id }
  }

  return { db, auth, helpers, sent, email, limiter, runtime, post, get, signedIn, signInWithCode, impersonate, codeFor, sendCode }
}

/** A code that is not `code`: the guess a test makes. */
export function wrong(code: string | undefined): string {
  return code === '000000' ? '111111' : '000000'
}
