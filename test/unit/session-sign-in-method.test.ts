import { afterEach, describe, expect, it, vi } from 'vitest'
import { sessionClaims } from '../../src/convex/client/better-auth-options'
import { sessionSignInMethod } from '../../src/convex/client/plugins'
import { createAuthorization } from '../../src/convex/integrations/authorization'
import { authFlow } from '../helpers/auth-flow'

// How the person signed in to the session a call runs as: the session's own
// `signInMethod`, set when it opens and carried on its token, never the
// account's last sign-in, which another browser changes.

afterEach(() => {
  vi.unstubAllEnvs()
})

/** The claims of the token `/convex/token` mints for a session's cookie. */
async function tokenClaims(flow: Awaited<ReturnType<typeof authFlow>>, cookie: string): Promise<Record<string, unknown>> {
  const response = await flow.get('/convex/token', { cookie })
  const { token } = await response.json() as { token: string }
  return JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as Record<string, unknown>
}

describe('a session\'s sign-in method', () => {
  it('is set when a code opens the session, and its token carries it', async () => {
    const flow = await authFlow()
    const { cookie, token } = await flow.signInWithCode('ada@example.com')
    expect(flow.db.session!.find(row => row.token === token)).toMatchObject({ signInMethod: 'email-otp' })
    expect(await tokenClaims(flow, cookie)).toMatchObject({ signInMethod: 'email-otp' })
  })

  it('names the route that opened the session: a passkey, a code, or neither', () => {
    expect(sessionSignInMethod('/passkey/verify-authentication')).toBe('passkey')
    expect(sessionSignInMethod('/sign-in/email-otp')).toBe('email-otp')
    expect(sessionSignInMethod('/email-otp/verify-email')).toBe('email-otp')
    for (const path of ['/sign-in/recovery-code', '/admin/impersonate-user', '/email-otp/change-email', '/toString', undefined]) {
      expect(sessionSignInMethod(path), String(path)).toBeNull()
    }
  })

  it('reaches the token from the session alone: never from an account field, a visit or an unknown value', () => {
    expect(sessionClaims({ user: { id: 'u1', name: 'Ada' }, session: { signInMethod: 'passkey' } })).toMatchObject({ signInMethod: 'passkey' })
    // An app's own user field of that name, the account's last sign-in, and a visit say nothing.
    expect(sessionClaims({ user: { id: 'u1', name: 'Ada', signInMethod: 'passkey', lastLoginMethod: 'passkey' }, session: {} })).not.toHaveProperty('signInMethod')
    expect(sessionClaims({ user: { id: 'u1' }, session: { signInMethod: 'passkey', impersonatedBy: 'admin-1' } })).not.toHaveProperty('signInMethod')
    expect(sessionClaims({ user: { id: 'u1' }, session: { signInMethod: 'password' } })).not.toHaveProperty('signInMethod')
  })
})

describe('ctx.user.signInMethod', () => {
  const authorization = createAuthorization({ backend: { adapter: { findOne: {}, updateOne: {} } } })
  const ctxWith = (claims: Record<string, unknown>) => ({ auth: { getUserIdentity: async () => ({ subject: 'u1', ...claims }) }, runQuery: vi.fn() }) as never

  it('reads the session\'s method from its token', async () => {
    expect(await authorization.getUser(ctxWith({ signInMethod: 'passkey' }))).toMatchObject({ signInMethod: 'passkey' })
    expect(await authorization.getUser(ctxWith({ signInMethod: 'email-otp' }))).toMatchObject({ signInMethod: 'email-otp' })
  })

  it('is null for a token without one, an unknown value and an administrator\'s visit', async () => {
    expect(await authorization.getUser(ctxWith({}))).toMatchObject({ signInMethod: null })
    expect(await authorization.getUser(ctxWith({ signInMethod: 'password' }))).toMatchObject({ signInMethod: null })
    expect(await authorization.getUser(ctxWith({ signInMethod: 'passkey', impersonatedBy: 'admin-1' }))).toMatchObject({ signInMethod: null })
  })
})
