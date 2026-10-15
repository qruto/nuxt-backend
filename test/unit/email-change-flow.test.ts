import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { testUtils, type TestHelpers } from 'better-auth/plugins'
import { buildAuthOptions } from '../../src/convex/client/better-auth-options'
import { tables } from '../../src/convex/components/backend/schema'

// The email change against real Better Auth on a memory adapter: a code from
// the current address, then one from the new address, and nothing moves
// without both. Codes are stored hashed, so they are read from the dev echo
// (NUXT_BACKEND_LOG_OTP) — the database holds nothing usable.

const ORIGIN = 'https://app.example.com'
const BASE = `${ORIGIN}/api/auth`

let db: Record<string, Array<Record<string, unknown>>>
let auth: { handler: (request: Request) => Promise<Response>, $context: Promise<unknown> }
let helpers: TestHelpers
let warn: ReturnType<typeof vi.spyOn>

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
    authOptions: { baseURL: ORIGIN, secret: 'a-test-secret-that-is-long-enough-1234', plugins: [testUtils()] },
  }) as never)
  helpers = (await auth.$context as unknown as { test: TestHelpers }).test
  vi.stubEnv('NUXT_BACKEND_LOG_OTP', '1')
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warn.mockRestore()
  vi.unstubAllEnvs()
})

/** The last code echoed for an address. */
function codeFor(email: string): string | undefined {
  const echoes = [...warn.mock.calls.flat().join('\n').matchAll(/for (\S+): (\d{6})/g)]
  return echoes.filter(([, to]) => to === email).at(-1)?.[2]
}

async function post(path: string, cookie: string, body: Record<string, unknown>) {
  return auth.handler(new Request(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie, 'origin': ORIGIN },
    body: JSON.stringify(body),
  }))
}

async function signedIn(email: string) {
  const user = await helpers.saveUser(helpers.createUser({ email, name: 'Ada', emailVerified: true }))
  const { headers } = await helpers.login({ userId: user.id })
  return { userId: user.id, cookie: headers.get('cookie') ?? '' }
}

const emailOf = (userId: string) => db.user!.find(row => row.id === userId)?.email

describe('an email change', () => {
  it('moves the account with a code from the current address, then one from the new address', async () => {
    const { userId, cookie } = await signedIn('ada@old.example')

    await post('/email-otp/send-verification-otp', cookie, { email: 'ada@old.example', type: 'email-verification' })
    const current = codeFor('ada@old.example')
    expect(current).toMatch(/^\d{6}$/)

    const request = await post('/email-otp/request-email-change', cookie, { newEmail: 'ada@new.example', otp: current })
    expect(request.status).toBe(200)
    const next = codeFor('ada@new.example')
    expect(next).toMatch(/^\d{6}$/)
    expect(emailOf(userId)).toBe('ada@old.example')

    const change = await post('/email-otp/change-email', cookie, { newEmail: 'ada@new.example', otp: next })
    expect(change.status).toBe(200)
    expect(emailOf(userId)).toBe('ada@new.example')
  })

  it('sends nothing to the new address without the current address\'s code', async () => {
    const { userId, cookie } = await signedIn('ada@old.example')

    const request = await post('/email-otp/request-email-change', cookie, { newEmail: 'ada@new.example', otp: '000000' })
    expect(request.status).toBeGreaterThanOrEqual(400)
    expect(codeFor('ada@new.example')).toBeUndefined()
    expect(emailOf(userId)).toBe('ada@old.example')
  })

  it('keeps no usable code in the database', async () => {
    const { cookie } = await signedIn('ada@old.example')
    await post('/email-otp/send-verification-otp', cookie, { email: 'ada@old.example', type: 'email-verification' })
    const code = codeFor('ada@old.example')!
    expect(db.verification!.length).toBeGreaterThan(0)
    for (const row of db.verification!) expect(String(row.value)).not.toContain(code)
  })

  it('offers no link flow: the core change-email route is off', async () => {
    const { cookie } = await signedIn('ada@old.example')
    const response = await post('/change-email', cookie, { newEmail: 'ada@new.example' })
    expect(response.status).toBeGreaterThanOrEqual(400)
  })
})
