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
  /** Share another flow's database: a second instance over the same rows, as after a redeploy. */
  db?: Record<string, Row[]>
}

/** One Better Auth instance and its database, for one test. */
export async function authFlow(options: AuthFlowOptions = {}) {
  vi.stubEnv('EMAIL_API_KEY', 're_test')
  vi.stubEnv('BACKEND_ENVIRONMENT', 'production')
  vi.stubEnv('EMAIL_FROM', 'Acme <hello@acme.dev>')

  const db: Record<string, Row[]> = options.db ?? Object.fromEntries(Object.keys(tables).map(table => [table, []]))
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
  sameCodeBrowser(auth)

  /** POST a JSON body as a browser would (a session cookie), as an API client would (a Bearer token), or anonymously. */
  async function post(path: string, body: Record<string, unknown> = {}, credential: { cookie?: string, bearer?: string, codeBrowser?: boolean } = {}) {
    const cookie = credential.cookie
    return auth.handler(new Request(`${BASE}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'origin': ORIGIN,
        ...(cookie ? { cookie } : {}),
        ...(credential.bearer ? { authorization: `Bearer ${credential.bearer}` } : {}),
        ...(credential.codeBrowser === false ? { [OTHER_BROWSER]: '1' } : {}),
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
  async function signInWithCode(address = 'ada@example.com', name = 'Ada', credential: { cookie?: string } = {}) {
    const { code } = await sendCode(address)
    const response = await post('/sign-in/email-otp', { email: address, otp: code, name }, credential)
    const cookie = response.headers.getSetCookie().filter(entry => !/max-age=0/i.test(entry)).map(entry => entry.split(';')[0]).join('; ')
    const { token, user } = await response.json() as { token: string, user: { id: string } }
    return { response, cookie, token, userId: user.id }
  }

  return { db, auth, helpers, sent, email, limiter, runtime, post, get, signedIn, signInWithCode, impersonate, codeFor, sendCode }
}

/** A request header a test sets to check a code from another browser than the one that asked; never sent on. */
const OTHER_BROWSER = 'x-test-other-browser'

/**
 * Make `auth.handler` one browser for sign-in codes: the cookie a code
 * request sets, per address, rides along with the check of that address's
 * code, as it would in the browser that asked. A request carrying
 * {@link OTHER_BROWSER} checks from another browser.
 */
export function sameCodeBrowser(auth: { handler: (request: Request) => Promise<Response> }): void {
  const handler = auth.handler.bind(auth)
  const cookies = new Map<string, string>()
  const addressOf = async (request: Request) => {
    const body = await request.clone().json().catch(() => ({})) as { email?: unknown }
    return typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  }
  auth.handler = async (request: Request) => {
    const path = new URL(request.url).pathname
    let sent = request
    if (path.endsWith('/sign-in/email-otp')) {
      const headers = new Headers(request.headers)
      const bound = headers.has(OTHER_BROWSER) ? undefined : cookies.get(await addressOf(request))
      headers.delete(OTHER_BROWSER)
      if (bound) headers.set('cookie', [headers.get('cookie'), bound].filter(Boolean).join('; '))
      sent = new Request(request, { headers })
    }
    const address = path.endsWith('/email-otp/send-verification-otp') ? await addressOf(request) : ''
    const response = await handler(sent)
    const set = response.headers.getSetCookie().find(entry => entry.split('=')[0]!.endsWith('.sign_in_code'))
    if (set && address) cookies.set(address, set.split(';')[0]!)
    return response
  }
}

/**
 * A `fetch` for a Better Auth client, wired to `auth.handler` as a browser
 * would be: the app's origin on every request and a cookie jar for the
 * session. `onAnswer` sees the jar after each answer.
 */
export function browserFetch(auth: { handler: (request: Request) => Promise<Response> }, onAnswer?: (jar: ReadonlyMap<string, string>) => void) {
  const jar = new Map<string, string>()
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init)
    const headers = new Headers(request.headers)
    headers.set('origin', ORIGIN)
    if (jar.size > 0) headers.set('cookie', [...jar].map(([name, value]) => `${name}=${value}`).join('; '))
    const response = await auth.handler(new Request(request, { headers }))
    for (const cookie of response.headers.getSetCookie()) {
      const [pair = ''] = cookie.split(';')
      const at = pair.indexOf('=')
      const name = pair.slice(0, at)
      const value = pair.slice(at + 1)
      if (!value || /max-age=0/i.test(cookie)) jar.delete(name)
      else jar.set(name, value)
    }
    onAnswer?.(jar)
    return response
  }
}

/** A code that is not `code`: the guess a test makes. */
export function wrong(code: string | undefined): string {
  return code === '000000' ? '111111' : '000000'
}
