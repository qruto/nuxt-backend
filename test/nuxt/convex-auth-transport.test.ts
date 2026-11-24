import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The browser's half of a Convex Auth app: the Better Auth client's fetch,
// turned into calls to `auth:signIn` (through the app's auth proxy) and
// `auth:authRequest` (on the deployment). The deployment's half is
// test/convex-component/convex-auth.test.ts.

interface Call { url: string, name: string, args: Record<string, unknown>, auth?: string }
const calls: Call[] = []
const answers: unknown[] = []

vi.mock('convex/browser', () => ({
  ConvexHttpClient: class {
    auth: string | undefined
    url: string
    constructor(url: string) {
      this.url = url
    }

    setAuth(token: string) {
      this.auth = token
    }

    async action(reference: unknown, args: Record<string, unknown>) {
      const { getFunctionName } = await import('convex/server')
      calls.push({ url: this.url, name: getFunctionName(reference as never), args, auth: this.auth })
      return answers.shift()
    }
  },
}))

const { createConvexAuthFetch, enginePath } = await import('../../src/runtime/vue/convex-auth/transport')

function transport(token: string | null = null) {
  const context = {
    convexUrl: 'https://happy-otter-123.convex.cloud',
    baseURL: 'http://localhost:3000/',
    authRoute: '/api/session',
    token: () => token,
    setSession: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
  }
  return { context, fetch: createConvexAuthFetch(context) }
}

const post = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({ method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } })
const engine = (status: number, body: unknown, cookies: Array<{ name: string, value: string, maxAge?: number }> = []) => ({ status, body, cookies })

const realFetch = globalThis.fetch
const appFetch = vi.fn<typeof fetch>()

beforeEach(() => {
  calls.length = 0
  answers.length = 0
  sessionStorage.clear()
  localStorage.clear()
  appFetch.mockReset()
  globalThis.fetch = appFetch
})

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('the Convex Auth transport', () => {
  it('reads a route under the client\'s base path or the app\'s auth route, and nothing else', () => {
    expect(enginePath('/api/auth/get-session', '/api/auth')).toBe('/get-session')
    expect(enginePath('/api/session', '/api/session/')).toBe('/')
    expect(enginePath('/api/sessions/x', '/api/session')).toBeNull()
  })

  it('passes a request that is no engine route on to the network unchanged', async () => {
    appFetch.mockResolvedValue(new Response('ok'))
    const { fetch } = transport()
    await fetch('http://localhost:3000/elsewhere', { method: 'GET' })
    expect(appFetch).toHaveBeenCalledWith('http://localhost:3000/elsewhere', { method: 'GET' })
    expect(calls).toEqual([])
  })

  it('answers a plain route through authRequest on the deployment, as the signed-in person', async () => {
    answers.push(engine(200, { session: { id: 's1' } }))
    const { fetch } = transport('access-token')
    const response = await fetch('http://localhost:3000/api/auth/get-session?disableCookieCache=true')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ session: { id: 's1' } })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      url: 'https://happy-otter-123.convex.cloud',
      name: 'auth:authRequest',
      auth: 'access-token',
      args: { method: 'GET', path: '/get-session', query: { disableCookieCache: 'true' }, jar: {} },
    })
    expect(calls[0]!.args).not.toHaveProperty('body')
  })

  it('opens the session a code sign-in completes, through the app\'s auth proxy', async () => {
    answers.push({ status: 'complete', tokens: { accessToken: 'new-token' }, response: engine(200, { token: 'x' }, [{ name: 'better-auth.last_used_login_method', value: 'email-otp' }]) })
    const { context, fetch } = transport()
    const response = await fetch('http://localhost:3000/api/auth/sign-in/email-otp', post({ email: 'ada@example.com', otp: '123456' }))
    expect(response.status).toBe(200)
    expect(calls[0]).toMatchObject({ url: 'http://localhost:3000/api/_convex/auth/signin?path=', name: 'auth:signIn', args: { path: '/sign-in/email-otp', body: { email: 'ada@example.com', otp: '123456' } } })
    expect(context.setSession).toHaveBeenCalledWith({ accessToken: 'new-token' })
    expect(document.cookie).toContain('better-auth.last_used_login_method=email-otp')
  })

  it('keeps a refused sign-in\'s cookies for the next call, so the two-factor step reads its challenge', async () => {
    answers.push({ status: 'error', userError: { response: engine(200, { twoFactorRedirect: true }, [{ name: 'better-auth.two_factor', value: 'challenge' }]) } })
    answers.push({ status: 'complete', tokens: { accessToken: 't' }, response: engine(200, { token: 't' }, [{ name: 'better-auth.two_factor', value: '', maxAge: 0 }]) })
    const { context, fetch } = transport()
    const first = await fetch('http://localhost:3000/api/auth/sign-in/email-otp', post({ email: 'ada@example.com', otp: '123456' }))
    expect(await first.json()).toEqual({ twoFactorRedirect: true })
    expect(context.setSession).not.toHaveBeenCalled()
    await fetch('http://localhost:3000/api/auth/two-factor/verify-totp', post({ code: '654321' }))
    expect(calls[1]).toMatchObject({ name: 'auth:signIn', args: { path: '/two-factor/verify-totp', jar: { 'better-auth.two_factor': 'challenge' } } })
    expect(context.setSession).toHaveBeenCalledWith({ accessToken: 't' })
    // The deleted cookie leaves the jar.
    answers.push(engine(200, null))
    await fetch('http://localhost:3000/api/auth/get-session')
    expect(calls[2]!.args.jar).toEqual({})
  })

  it('answers a sign-in that opened nothing as unauthorized', async () => {
    answers.push({ status: 'error' })
    const { fetch } = transport()
    const response = await fetch('http://localhost:3000/api/auth/passkey/verify-authentication', post({ response: {} }))
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('saves a recovery session\'s passkey through signIn, and an ordinary one through authRequest', async () => {
    answers.push({ status: 'error', userError: { response: engine(200, { passkeyRequired: true }), recoveryToken: 'recover-me' } })
    answers.push({ status: 'complete', tokens: { accessToken: 'r' }, response: engine(200, {}) })
    const { fetch } = transport()
    await fetch('http://localhost:3000/api/auth/sign-in/recovery-code', post({ email: 'ada@example.com', code: 'abcd' }))
    await fetch('http://localhost:3000/api/auth/passkey/verify-registration', post({ response: {} }))
    expect(calls[1]).toMatchObject({ name: 'auth:signIn', args: { recoveryToken: 'recover-me' } })
    // Spent once the session is open: the next passkey is an ordinary one.
    answers.push(engine(200, {}))
    await fetch('http://localhost:3000/api/auth/passkey/verify-registration', post({ response: {} }))
    expect(calls[2]).toMatchObject({ name: 'auth:authRequest' })
    expect(calls[2]!.args).not.toHaveProperty('recoveryToken')
  })

  it('signs out through Convex Auth, with no engine call', async () => {
    const { context, fetch } = transport('t')
    const response = await fetch('http://localhost:3000/api/auth/sign-out', post({}))
    expect(await response.json()).toEqual({ success: true })
    expect(context.signOut).toHaveBeenCalled()
    expect(calls).toEqual([])
  })

  it('asks the app\'s server to sign a code send, and passes the proof, the address and the challenge on', async () => {
    appFetch.mockResolvedValue(new Response(JSON.stringify({ proof: 'signed', address: '203.0.113.7' }), { status: 200 }))
    answers.push(engine(200, { success: true }))
    const { fetch } = transport()
    await fetch('http://localhost:3000/api/auth/email-otp/send-verification-otp', post({ email: 'ada@example.com', type: 'sign-in' }, { 'x-captcha-response': 'turnstile-token', 'accept-language': 'de' }))
    expect(appFetch).toHaveBeenCalledTimes(1)
    const [url, init] = appFetch.mock.calls[0]!
    expect(url).toBe('http://localhost:3000/api/human-proof')
    expect(JSON.parse(init!.body as string)).toEqual({ auth: { path: '/api/session/email-otp/send-verification-otp', body: { email: 'ada@example.com', type: 'sign-in' } } })
    expect(calls[0]!.args.client).toMatchObject({ proof: 'signed', address: '203.0.113.7', challenge: 'turnstile-token', language: 'de' })
  })

  it('hands a bot check\'s refusal back as the answer, and calls no engine route', async () => {
    appFetch.mockResolvedValue(new Response(JSON.stringify({ code: 'FORBIDDEN' }), { status: 403 }))
    const { fetch } = transport()
    const response = await fetch('http://localhost:3000/api/auth/email-otp/send-verification-otp', post({ email: 'ada@example.com', type: 'sign-in' }))
    expect(response.status).toBe(403)
    expect(calls).toEqual([])
  })

  it('leaves the call to the deployment\'s own limits when the app\'s server signs nothing', async () => {
    appFetch.mockRejectedValue(new TypeError('offline'))
    answers.push(engine(200, { success: true }))
    const { fetch } = transport()
    await fetch('http://localhost:3000/api/auth/email-otp/send-verification-otp', post({ email: 'ada@example.com', type: 'sign-in' }))
    expect(calls[0]!.args.client).not.toHaveProperty('proof')
  })

  it('asks no proof for a passkey tap, where a wait could cost the prompt', async () => {
    answers.push({ status: 'complete', tokens: { accessToken: 'p' }, response: engine(200, {}) })
    const { fetch } = transport()
    await fetch('http://localhost:3000/api/auth/passkey/verify-authentication', post({ response: {} }))
    expect(appFetch).not.toHaveBeenCalled()
  })

  it('marks a request the re-authentication header asks for', async () => {
    answers.push(engine(200, {}))
    const { fetch } = transport('t')
    await fetch('http://localhost:3000/api/auth/passkey/delete-passkey', post({ id: 'p1' }, { 'x-backend-reauthenticate': '1' }))
    expect(calls[0]!.args).toMatchObject({ reauthenticate: true })
  })
})
