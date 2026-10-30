import { createHash, createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { lastLoginMethod } from 'better-auth/plugins'
import { resolveSignInMethod as publicResolver } from '../../src/convex/client/index'
import { defaultLastLoginMethod, resolveSignInMethod } from '../../src/convex/client/plugins'
import { STORAGE_COOKIE } from '../../src/convex/consent-rules'
import { LAST_SIGN_IN_COOKIE } from '../../src/convex/constants'
import { DEFAULT_LIMITS } from '../../src/convex/integrations/rate-limit'
import { authFlow, ORIGIN, SECRET } from '../helpers/auth-flow'

// How a person last signed in, against real Better Auth through its routes:
// Better Auth's lastLoginMethod plugin records it on the account and in a
// cookie the sign-in form reads, and the package names a code sign-in,
// which Better Auth's own resolver does not know. Then the passkey sign-in
// challenge, the route every passkey sign-in (autofill included) starts
// with, and the limits it spends.

afterEach(() => {
  vi.unstubAllEnvs()
})

const ADA = 'ada@example.com'

/** The `Set-Cookie` an answer sends for `name`, or `undefined`. */
function setCookie(response: Response, name: string): string | undefined {
  return response.headers.getSetCookie().find(cookie => cookie.startsWith(`${name}=`))
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
/** The key of a client address's bucket: an HMAC under the auth secret, which a table reader cannot reverse by hashing every address. */
const addressKey = (address: string) => createHmac('sha256', SECRET).update(`client-address:${address}`).digest('hex')

/** The consent manager's cookie, as a browser that allowed optional storage for `preferences` sends it. */
const ALLOWED = `${STORAGE_COOKIE}=preferences%2Creplay`

describe('the last sign-in method', () => {
  it('records a code sign-in, a sign-up included, on the account and, once the browser allowed it, in a cookie the page reads', async () => {
    const flow = await authFlow()
    const { response, cookie, userId } = await flow.signInWithCode(ADA, 'Ada', { cookie: ALLOWED })

    const lastUsed = setCookie(response, LAST_SIGN_IN_COOKIE)
    expect(lastUsed).toMatch(/^better-auth\.last_used_login_method=email-otp;/)
    // The page reads it (and so does the server render): never HttpOnly, for 30 days.
    expect(lastUsed).not.toMatch(/HttpOnly/i)
    expect(lastUsed).toMatch(/Max-Age=2592000/i)
    expect(flow.db.user!.find(row => row.id === userId)).toMatchObject({ lastLoginMethod: 'email-otp' })

    // The session answers with it, which is what `useAuth().user` reads.
    const session = await (await flow.get('/get-session', { cookie })).json() as { user: Record<string, unknown> }
    expect(session.user.lastLoginMethod).toBe('email-otp')
  })

  it('sets the cookie only for a browser that allowed it: not asked, declined, or allowed for another purpose', async () => {
    for (const cookie of [undefined, `${STORAGE_COOKIE}=none`, `${STORAGE_COOKIE}=analytics`, `${STORAGE_COOKIE}=garbage`]) {
      const flow = await authFlow()
      const { response, userId } = await flow.signInWithCode(ADA, 'Ada', cookie ? { cookie } : {})
      expect(setCookie(response, LAST_SIGN_IN_COOKIE), cookie).toBeUndefined()
      // The account still records how it signed in; only the browser's cookie waits for a yes.
      expect(flow.db.user!.find(row => row.id === userId)).toMatchObject({ lastLoginMethod: 'email-otp' })
    }
  })

  it('records nothing for a session an administrator opened as someone else', async () => {
    const flow = await authFlow()
    const ada = await flow.signInWithCode(ADA)
    const admin = await flow.signedIn('grace@example.com', { role: 'admin' })

    const visit = await flow.post('/admin/impersonate-user', { userId: ada.userId }, { cookie: admin.cookie })
    expect(visit.status).toBe(200)
    expect(setCookie(visit, LAST_SIGN_IN_COOKIE)).toBeUndefined()
    expect(flow.db.user!.find(row => row.id === ada.userId)).toMatchObject({ lastLoginMethod: 'email-otp' })
  })

  it('names a passkey sign-in `passkey` and a code sign-in `email-otp`, and nothing else', async () => {
    expect(resolveSignInMethod({ path: '/sign-in/email-otp' })).toBe('email-otp')
    expect(resolveSignInMethod({ path: '/passkey/verify-authentication' })).toBeNull()

    // The plugin's own hook, as Better Auth runs it after a session is
    // created: our resolver first, then Better Auth's, which knows passkeys.
    const updateUser = vi.fn(async () => {})
    const plugin = defaultLastLoginMethod()
    const hooks = plugin.init({ internalAdapter: { updateUser }, logger: { error: vi.fn() } } as never).options.databaseHooks
    for (const path of ['/passkey/verify-authentication', '/sign-in/email-otp', '/admin/impersonate-user', '/email-otp/change-email']) {
      await hooks.session.create.after({ userId: 'user_1' } as never, { path } as never)
    }
    expect(updateUser.mock.calls).toEqual([
      ['user_1', { lastLoginMethod: 'passkey' }],
      ['user_1', { lastLoginMethod: 'email-otp' }],
    ])
    expect(plugin.options).toMatchObject({ storeInDatabase: true, cookieName: LAST_SIGN_IN_COOKIE })
  })
})

describe('an app\'s own lastLoginMethod', () => {
  // The documented override, for a cookie set only with consent: the app's
  // plugin replaces the package's, and the exported resolver keeps naming a
  // code sign-in.
  it('records a code sign-in on the account with the exported resolver, and no cookie when the app says no', async () => {
    const flow = await authFlow({ build: { authOptions: { plugins: [lastLoginMethod({ storeInDatabase: true, customResolveMethod: publicResolver, beforeStoreCookie: () => false })] } } })
    const { response, userId } = await flow.signInWithCode(ADA)
    expect(setCookie(response, LAST_SIGN_IN_COOKIE)).toBeUndefined()
    expect(flow.db.user!.find(row => row.id === userId)).toMatchObject({ lastLoginMethod: 'email-otp' })
  })
})

describe('the passkey sign-in challenge', () => {
  /** Ask for a challenge as a browser behind `forwardedFor` would. */
  function challenge(flow: Awaited<ReturnType<typeof authFlow>>, forwardedFor: string) {
    return flow.auth.handler(new Request(`${ORIGIN}/api/auth/passkey/generate-authenticate-options`, {
      headers: { 'origin': ORIGIN, 'x-forwarded-for': forwardedFor },
    }))
  }

  it('spends a bucket per client address, keyed by an HMAC of it, then the deployment ceiling', async () => {
    const flow = await authFlow()
    const answer = await challenge(flow, '203.0.113.7')
    expect(answer.status).toBe(200)
    expect(await answer.json()).toHaveProperty('challenge')
    expect(flow.limiter.limit.mock.calls.map(([, name, options]) => [name, options?.key])).toEqual([
      ['passkeySignIn', addressKey('203.0.113.7')],
      ['passkeySignInGlobal', undefined],
    ])
    // Never the plain digest, which hashing all four billion IPv4 addresses reverses.
    expect(flow.limiter.limit.mock.calls[0]![2]?.key).not.toBe(sha256('203.0.113.7'))
  })

  it('refuses an address past its bucket with the wait, and leaves other addresses and the ceiling alone', async () => {
    const flow = await authFlow()
    const capacity = DEFAULT_LIMITS.passkeySignIn.capacity
    for (let request = 0; request < capacity; request++) {
      expect((await challenge(flow, '203.0.113.7')).status).toBe(200)
    }
    const refused = await challenge(flow, '203.0.113.7')
    expect(refused.status).toBe(429)
    expect(await refused.json()).toMatchObject({ code: 'rate_limited', limit: 'passkeySignIn', retryAfter: 60_000 })
    // The refused request spent no share of the ceiling, and stored no challenge.
    expect(flow.limiter.total('passkeySignInGlobal')).toBe(capacity)
    expect(flow.db.verification).toHaveLength(capacity)

    expect((await challenge(flow, '198.51.100.4')).status).toBe(200)
  })

  it('spends only the ceiling when the headers name no address Better Auth trusts', async () => {
    const flow = await authFlow({ build: { authOptions: { advanced: { ipAddress: { disableIpTracking: true } } } } })
    expect((await challenge(flow, '203.0.113.7')).status).toBe(200)
    expect(flow.limiter.limit.mock.calls.map(([, name]) => name)).toEqual(['passkeySignInGlobal'])
  })

  it('reads the address through the proxies the app trusts', async () => {
    const flow = await authFlow({ build: { authOptions: { advanced: { ipAddress: { trustedProxies: ['10.0.0.0/8'] } } } } })
    // The client, then the proxy in front of the deployment.
    expect((await challenge(flow, '203.0.113.7, 10.1.2.3')).status).toBe(200)
    expect(flow.limiter.limit.mock.calls[0]).toEqual([expect.anything(), 'passkeySignIn', { key: addressKey('203.0.113.7') }])
  })

  it('spends nothing on the answer, which uses its challenge up', async () => {
    const flow = await authFlow()
    const answer = await flow.post('/passkey/verify-authentication', { response: { id: 'credential_1' } })
    expect(answer.status).toBe(400)
    expect(flow.limiter.limit).not.toHaveBeenCalled()
  })
})
