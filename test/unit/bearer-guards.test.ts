import { afterEach, describe, expect, it, vi } from 'vitest'
import { authFlow, memoryLimiter } from '../helpers/auth-flow'

// The request guards against a caller who authenticates with
// `Authorization: Bearer` and no cookie. The convex plugin's bearer hook turns
// the token into a session cookie only after every before-hook has run, so a
// guard that read the cookie alone saw nobody: the route authenticated the
// caller while its limits and refusals let them through.

afterEach(() => {
  vi.unstubAllEnvs()
})

/** A limiter that refuses `name` and allows everything else. */
function refusing(name: string) {
  const { limit } = memoryLimiter()
  return { limit: vi.fn(async (ctx: unknown, limitName: never, options?: { key?: string }) => limitName === name ? { ok: false, retryAfter: 1000 } : limit(ctx, limitName, options)) }
}

describe('a Bearer-only caller spends their own limits', () => {
  it('on an invitation', async () => {
    const flow = await authFlow({ runtime: { rateLimiter: refusing('invitation') } })
    const { token, userId } = await flow.signedIn()

    const response = await flow.post('/organization/invite-member', { email: 'bob@example.com', role: 'member' }, { bearer: token })
    expect(response.status).toBe(429)
    expect(flow.db.invitation).toHaveLength(0)
    expect(flow.runtime.rateLimiter!.limit).toHaveBeenCalledWith(expect.anything(), 'invitation', { key: userId })
  })

  it('on an administrator route', async () => {
    const flow = await authFlow({ runtime: { rateLimiter: refusing('admin') } })
    const { token } = await flow.signedIn('root@example.com', { role: 'admin' })

    expect((await flow.get('/admin/list-users', { bearer: token })).status).toBe(429)
  })

  it('on an email change', async () => {
    const flow = await authFlow({ runtime: { rateLimiter: refusing('emailChange') } })
    const { token } = await flow.signedIn()
    await flow.post('/email-otp/send-verification-otp', { email: 'ada@example.com', type: 'email-verification' }, { bearer: token })
    const otp = flow.codeFor('ada@example.com', 'email-verification')

    const response = await flow.post('/email-otp/request-email-change', { newEmail: 'ada@new.example', otp }, { bearer: token })
    expect(response.status).toBe(429)
    expect(flow.codeFor('ada@new.example')).toBeUndefined()
  })

  it('and the route still runs for them when the limits allow it', async () => {
    const flow = await authFlow()
    const { token } = await flow.signedIn()
    expect((await flow.post('/organization/create', { name: 'Acme', slug: 'acme' }, { bearer: token })).status).toBe(200)

    const response = await flow.post('/organization/invite-member', { email: 'bob@example.com', role: 'member' }, { bearer: token })
    expect(response.status).toBe(200)
    expect(flow.limiter.total('invitation')).toBe(1)
    expect(flow.limiter.total('invitationGlobal')).toBe(1)
  })
})

describe('an administrator acting as someone else', () => {
  async function impersonated() {
    const flow = await authFlow()
    const person = await flow.signedIn()
    flow.impersonate(person.token)
    return { flow, person }
  }

  it('cannot add a passkey, by cookie or by Bearer', async () => {
    const { flow, person } = await impersonated()
    for (const credential of [{ cookie: person.cookie }, { bearer: person.token }]) {
      const response = await flow.get('/passkey/generate-register-options', credential)
      expect(response.status).toBe(403)
      expect(await response.json()).toMatchObject({ message: 'An administrator acting as this account cannot change its passkeys.' })
    }
    expect((await flow.post('/passkey/verify-registration', { response: {} }, { bearer: person.token })).status).toBe(403)
    expect((await flow.post('/passkey/delete-passkey', { id: 'passkey-1' }, { bearer: person.token })).status).toBe(403)
    expect((await flow.post('/passkey/update-passkey', { id: 'passkey-1', name: 'Mine now' }, { bearer: person.token })).status).toBe(403)
  })

  it('cannot move the account to another address, or delete it', async () => {
    const { flow, person } = await impersonated()
    const change = await flow.post('/email-otp/request-email-change', { newEmail: 'admin@example.com', otp: '123456' }, { bearer: person.token })
    expect(change.status).toBe(403)
    expect((await flow.post('/email-otp/change-email', { newEmail: 'admin@example.com', otp: '123456' }, { bearer: person.token })).status).toBe(403)
    expect((await flow.post('/delete-user', {}, { bearer: person.token })).status).toBe(403)
    expect(flow.db.user).toHaveLength(1)
    expect(flow.limiter.limit).not.toHaveBeenCalled()
  })

  it('cannot invite anyone into the account\'s workspaces', async () => {
    const { flow, person } = await impersonated()
    const response = await flow.post('/organization/invite-member', { email: 'admin@example.com', role: 'owner' }, { bearer: person.token })
    expect(response.status).toBe(403)
    expect(flow.db.invitation).toHaveLength(0)
  })

  it('is refused by the Bearer session, whatever cookie rides along', async () => {
    const flow = await authFlow()
    const own = await flow.signedIn()
    const visit = await flow.helpers.login({ userId: own.userId })
    flow.impersonate(visit.token)

    // The route runs with the Bearer token's session, and so does the guard.
    const response = await flow.get('/passkey/generate-register-options', { cookie: own.cookie, bearer: visit.token })
    expect(response.status).toBe(403)
    // The person's own session, alone, may.
    expect((await flow.get('/passkey/generate-register-options', { cookie: own.cookie })).status).toBe(200)
  })

  it('may still read, and leave', async () => {
    const { flow, person } = await impersonated()
    expect((await flow.get('/get-session', { bearer: person.token })).status).toBe(200)
    expect((await flow.get('/passkey/list-user-passkeys', { bearer: person.token })).status).toBe(200)
  })
})

describe('a credential that resolves to no session', () => {
  it('is refused on a guarded route, even when the route\'s own read would succeed', async () => {
    let failReads = 0
    const flow = await authFlow({
      adapter: (adapter) => {
        const findOne = adapter.findOne as (args: { model: string }) => Promise<unknown>
        adapter.findOne = async (args: { model: string }) => {
          if (args.model === 'session' && failReads > 0) {
            failReads--
            throw new Error('a read that failed once')
          }
          return findOne(args)
        }
      },
    })
    const { token } = await flow.signedIn()
    failReads = 1
    // Better Auth logs the failed read; the test expects it.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const response = await flow.post('/organization/invite-member', { email: 'bob@example.com', role: 'member' }, { bearer: token })
      expect(response.status).toBe(401)
      expect(flow.db.invitation).toHaveLength(0)
    }
    finally {
      error.mockRestore()
    }
  })

  it('is refused too when it never matched a session: a stale or forged token', async () => {
    const flow = await authFlow()
    await flow.signedIn()
    expect((await flow.post('/organization/invite-member', { email: 'bob@example.com', role: 'member' }, { bearer: 'not-a-session' })).status).toBe(401)
    expect(flow.limiter.limit).not.toHaveBeenCalled()
  })

  it('leaves an anonymous request to the route, which answers 401 itself and spends nothing', async () => {
    const flow = await authFlow()
    expect((await flow.post('/organization/invite-member', { email: 'bob@example.com', role: 'member' })).status).toBe(401)
    expect(flow.limiter.limit).not.toHaveBeenCalled()
  })
})

describe('an invitation the transport would drop', () => {
  it('is judged only for a signed-in inviter, so an anonymous caller learns nothing and logs nothing', async () => {
    const flow = await authFlow()
    vi.stubEnv('EMAIL_TEST_MODE', 'true')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect((await flow.post('/organization/invite-member', { email: 'bob@example.com', role: 'member' })).status).toBe(401)
      expect(warn.mock.calls.flat().join('\n')).not.toContain('email.undeliverable')

      const { token } = await flow.signedIn()
      const refused = await flow.post('/organization/invite-member', { email: 'bob@example.com', role: 'member' }, { bearer: token })
      expect(refused.status).toBe(400)
      expect(warn.mock.calls.flat().join('\n')).toContain('email.undeliverable')
      // Refused before the inviter's bucket or the deployment's was spent.
      expect(flow.limiter.limit).not.toHaveBeenCalled()
    }
    finally {
      warn.mockRestore()
    }
  })
})
