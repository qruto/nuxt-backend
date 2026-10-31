import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { testUtils, type TestHelpers } from 'better-auth/plugins'
import { buildAuthOptions } from '../../src/convex/client/better-auth-options'
import { tables } from '../../src/convex/components/backend/schema'
import { authFlow, wrong } from '../helpers/auth-flow'

// The email change against real Better Auth on a memory adapter: a code from
// the current address, then one from the new address, and nothing moves
// without both. Codes are stored hashed, so they are read from the dev echo
// (a development BACKEND_ENVIRONMENT) — the database holds nothing usable.

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
  vi.stubEnv('BACKEND_ENVIRONMENT', 'development')
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

describe('the guards around an email change', () => {
  const NEW = 'ada@new.example'
  // The request runtime is live here: the gate, the limits and the delivery
  // check all run on the routes, as on a deployment.
  async function changing(options: Parameters<typeof authFlow>[0] = {}, current = 'ada@old.example') {
    const flow = await authFlow(options)
    const { cookie } = await flow.signInWithCode(current)
    await flow.post('/email-otp/send-verification-otp', { email: current, type: 'email-verification' }, { cookie })
    flow.limiter.limit.mockClear()
    return { flow, cookie, current, otp: flow.codeFor(current, 'email-verification') }
  }
  const spent = (flow: Awaited<ReturnType<typeof authFlow>>) => flow.limiter.limit.mock.calls.map(call => call[1])

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('asks canSignIn about the new address before a code goes to it, and again before the account moves', async () => {
    const canSignIn = vi.fn(async () => true as const)
    const { flow, cookie, otp } = await changing({ runtime: { canSignIn } as never })

    expect((await flow.post('/email-otp/request-email-change', { newEmail: 'Ada@New.Example', otp }, { cookie })).status).toBe(200)
    expect((await flow.post('/email-otp/change-email', { newEmail: NEW, otp: flow.codeFor(NEW) }, { cookie })).status).toBe(200)
    const asked = canSignIn.mock.calls.map(call => (call as unknown[])[1] as { purpose: string })
    expect(asked.filter(input => input.purpose === 'email-change')).toEqual([
      { email: NEW, isNewUser: false, purpose: 'email-change', ticket: null },
      { email: NEW, isNewUser: false, purpose: 'email-change', ticket: null },
    ])
  })

  it('stops at a refused address: no code goes to it, and only the caller\'s own change request is spent', async () => {
    const canSignIn = vi.fn(async (_ctx: unknown, input: { purpose: string }) =>
      input.purpose === 'email-change' ? { allowed: false as const, message: 'Use your work address.' } : true as const)
    const { flow, cookie, otp } = await changing({ runtime: { canSignIn } as never })

    const response = await flow.post('/email-otp/request-email-change', { newEmail: NEW, otp }, { cookie })
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ message: 'Use your work address.' })
    expect(flow.codeFor(NEW)).toBeUndefined()
    // The gate answered about an address the caller typed: that answer costs
    // the caller, never the address.
    expect(spent(flow)).toEqual(['emailChange'])
  })

  it('cannot be used to probe the gate for free: refused answers spend the caller\'s change requests until none are left', async () => {
    const canSignIn = vi.fn(async (_ctx: unknown, input: { email: string, purpose: string }) =>
      input.purpose === 'email-change' && input.email.endsWith('@banned.example') ? { allowed: false as const } : true as const)
    const { flow, cookie, otp } = await changing({ runtime: { canSignIn } as never })
    const probe = (address: string) => flow.post('/email-otp/request-email-change', { newEmail: address, otp }, { cookie })

    // Five an hour (emailChange): the refusals answer, then the bucket does.
    for (let i = 0; i < 5; i++) expect((await probe(`person${i}@banned.example`)).status).toBe(403)
    const closed = await probe('person5@banned.example')
    expect(closed.status).toBe(429)
    expect(await closed.json()).toMatchObject({ code: 'rate_limited', limit: 'emailChange' })
    expect(canSignIn.mock.calls.filter(call => (call[1] as { purpose: string }).purpose === 'email-change')).toHaveLength(5)
  })

  it('asks nothing about the new address until a code to the current one is waiting', async () => {
    const canSignIn = vi.fn(async () => true as const)
    const flow = await authFlow({ runtime: { canSignIn } as never })
    const { cookie } = await flow.signInWithCode('ada@old.example')
    canSignIn.mockClear()
    flow.limiter.limit.mockClear()

    // No code went to the current address: Better Auth refuses on its own.
    expect((await flow.post('/email-otp/request-email-change', { newEmail: NEW, otp: '123456' }, { cookie })).status).toBe(400)
    // And no code is waiting for this pair: nothing moves, and the gate stays quiet.
    expect((await flow.post('/email-otp/change-email', { newEmail: NEW, otp: '' }, { cookie })).status).toBe(400)
    expect((await flow.post('/email-otp/change-email', { newEmail: 'other@new.example', otp: '000000' }, { cookie })).status).toBe(400)
    expect(canSignIn).not.toHaveBeenCalled()
    expect(spent(flow)).toEqual([])
  })

  it('refuses a new address the transport would drop, before a code is minted for it', async () => {
    const { flow, cookie, otp } = await changing({}, 'delivered+ada@resend.dev')
    vi.stubEnv('BACKEND_ENVIRONMENT', 'sandbox')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const response = await flow.post('/email-otp/request-email-change', { newEmail: NEW, otp }, { cookie })
      expect(response.status).toBe(503)
      expect(await response.json()).toMatchObject({ code: 'unavailable', service: 'email', reason: 'test_mode', message: 'This app is in test mode and only emails test addresses, so this address can\'t receive mail here.' })
      expect(flow.codeFor(NEW)).toBeUndefined()
      expect(flow.db.verification!.some(row => String(row.identifier).startsWith('change-email-otp-'))).toBe(false)
      expect(spent(flow)).toEqual(['emailChange'])
    }
    finally {
      warn.mockRestore()
    }
  })

  // The first code of a change has its own words, so the person can tell it
  // from a sign-in code, and a change they didn't ask for stands out.
  it('sends the first code as the start of an email change', async () => {
    const { flow, current } = await changing()
    const first = flow.sent.filter(entry => entry.name === 'otp' && entry.data.email === current && entry.data.type === 'email-verification')
    expect(first.map(entry => entry.data.reason)).toEqual(['email-change'])
    // A sign-in code says nothing of the sort.
    expect(flow.sent.find(entry => entry.data.type === 'sign-in')?.data.reason).toBeUndefined()
  })

  it('tells the old address once the change went through, and nobody when it did not', async () => {
    const { flow, cookie, current, otp } = await changing()
    expect((await flow.post('/email-otp/request-email-change', { newEmail: NEW, otp }, { cookie })).status).toBe(200)
    expect((await flow.post('/email-otp/change-email', { newEmail: NEW, otp: wrong(flow.codeFor(NEW)) }, { cookie })).status).toBe(400)
    expect(flow.sent.filter(entry => entry.name === 'emailChanged')).toEqual([])

    expect((await flow.post('/email-otp/change-email', { newEmail: NEW, otp: flow.codeFor(NEW) }, { cookie })).status).toBe(200)
    expect(flow.sent.filter(entry => entry.name === 'emailChanged')).toEqual([{ name: 'emailChanged', data: { email: current, newEmail: NEW } }])
    const keyed = flow.email.sendTemplate.mock.calls.find(call => call[1] === 'emailChanged') as unknown[]
    expect(keyed[3]).toEqual({ idempotencyKey: expect.stringMatching(/^nuxt-backend:email-changed:.+:ada@new\.example$/) })
  })

  it('lets the change stand when the notice cannot go out', async () => {
    const { flow, cookie, current, otp } = await changing()
    expect((await flow.post('/email-otp/request-email-change', { newEmail: NEW, otp }, { cookie })).status).toBe(200)
    const code = flow.codeFor(NEW)
    flow.email.sendTemplate.mockImplementation(async (_ctx: unknown, name: string) => {
      if (name === 'emailChanged') throw new Error('provider down')
      return 'email_1'
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect((await flow.post('/email-otp/change-email', { newEmail: NEW, otp: code }, { cookie })).status).toBe(200)
      expect(flow.db.user!.find(row => row.email === NEW)).toBeDefined()
      expect(flow.db.user!.find(row => row.email === current)).toBeUndefined()
      expect(warn.mock.calls.flat().join('\n')).toContain('auth.email_change_notice_unsent')
    }
    finally {
      warn.mockRestore()
    }
  })

  it('spends nothing on a request the route refuses on its own', async () => {
    const { flow, cookie, current, otp } = await changing()

    for (const body of [{ newEmail: current, otp }, { newEmail: NEW }, { newEmail: 'not-an-address', otp }]) {
      expect((await flow.post('/email-otp/request-email-change', body, { cookie })).status).toBe(400)
    }
    expect(spent(flow)).toEqual([])
  })

  it('spends the caller\'s change request, an attempt against the address each code went to, then the deployment\'s ceiling', async () => {
    const { flow, cookie, current, otp } = await changing()

    expect((await flow.post('/email-otp/request-email-change', { newEmail: NEW, otp }, { cookie })).status).toBe(200)
    expect(spent(flow)).toEqual(['emailChange', 'emailOtpAttempt', 'emailOtpGlobal'])
    expect((await flow.post('/email-otp/change-email', { newEmail: NEW, otp: wrong(flow.codeFor(NEW)) }, { cookie })).status).toBe(400)
    expect(spent(flow)).toEqual(['emailChange', 'emailOtpAttempt', 'emailOtpGlobal', 'emailOtpAttempt'])

    const keys = flow.limiter.limit.mock.calls.filter(call => call[1] === 'emailOtpAttempt').map(call => call[2]?.key)
    const digest = (address: string) => createHash('sha256').update(address).digest('hex')
    expect(keys).toEqual([digest(current), digest(NEW)])
  })
})
