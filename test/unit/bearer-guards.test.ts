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
      expect(await response.json()).toMatchObject({ code: 'forbidden', reason: 'impersonating', message: 'An administrator acting as this account can\'t do this.' })
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

  it('cannot sign the account\'s devices out, one, several or all at once', async () => {
    const { flow, person } = await impersonated()
    const phone = await flow.helpers.login({ userId: person.userId })
    const sessions = flow.db.session!.length
    for (const [path, body] of [['/revoke-session', { token: phone.token }], ['/revoke-sessions', {}], ['/revoke-other-sessions', {}]] as const) {
      const response = await flow.post(path, body, { bearer: person.token })
      expect(response.status, path).toBe(403)
      expect(await response.json()).toMatchObject({ code: 'forbidden', reason: 'impersonating', message: 'An administrator acting as this account can\'t do this.' })
    }
    expect(flow.db.session).toHaveLength(sessions)
    // The person, in a session of their own, may.
    const own = await flow.helpers.login({ userId: person.userId })
    expect((await flow.post('/revoke-session', { token: phone.token }, { bearer: own.token })).status).toBe(200)
    expect(flow.db.session).toHaveLength(sessions)
  })

  it('cannot leave or delete the account\'s workspaces, change who belongs, or join one; may switch and rename', async () => {
    const flow = await authFlow()
    const person = await flow.signedIn()
    const created = await flow.post('/organization/create', { name: 'Acme', slug: 'acme' }, { bearer: person.token })
    const workspace = await created.json() as { id: string }
    flow.impersonate(person.token)
    for (const [path, body] of [
      ['/organization/leave', { organizationId: workspace.id }],
      ['/organization/remove-member', { memberIdOrEmail: 'bob@example.com', organizationId: workspace.id }],
      ['/organization/update-member-role', { memberId: 'member-1', role: 'admin', organizationId: workspace.id }],
      ['/organization/accept-invitation', { invitationId: 'invitation-1' }],
      ['/organization/delete', { organizationId: workspace.id }],
    ] as const) {
      const response = await flow.post(path, body, { bearer: person.token })
      expect(response.status, path).toBe(403)
      expect(await response.json(), path).toMatchObject({ code: 'forbidden', reason: 'impersonating' })
    }
    expect(flow.db.organization).toHaveLength(1)
    expect(flow.db.member).toHaveLength(1)
    // Support work stays open: switching workspaces, renaming one, the profile's name.
    expect((await flow.post('/organization/set-active', { organizationId: workspace.id }, { bearer: person.token })).status).toBe(200)
    expect((await flow.post('/organization/update', { data: { name: 'Acme Inc.' }, organizationId: workspace.id }, { bearer: person.token })).status).toBe(200)
    expect((await flow.post('/update-user', { name: 'Ada L.' }, { bearer: person.token })).status).toBe(200)
  })

  it('is refused every route off the allowlist: tokens, accounts, sign-in methods, passwords, admin routes', async () => {
    const flow = await authFlow({ build: { authOptions: { emailAndPassword: { enabled: true } } } })
    const person = await flow.signedIn()
    flow.impersonate(person.token)
    for (const [method, path, body] of [
      ['POST', '/unlink-account', { providerId: 'google' }],
      ['POST', '/change-password', { currentPassword: 'old-password-1', newPassword: 'new-password-1' }],
      ['POST', '/get-access-token', { providerId: 'google' }],
      ['POST', '/refresh-token', { providerId: 'google' }],
      ['GET', '/account-info', undefined],
      ['GET', '/admin/list-users', undefined],
    ] as const) {
      const response = method === 'GET' ? await flow.get(path, { bearer: person.token }) : await flow.post(path, body, { bearer: person.token })
      expect(response.status, path).toBe(403)
      expect(await response.json(), path).toMatchObject({ code: 'forbidden', reason: 'impersonating' })
    }
    // What the visit runs on stays open: the session, and the Convex token.
    expect((await flow.get('/get-session', { bearer: person.token })).status).toBe(200)
    expect((await flow.get('/convex/token', { bearer: person.token })).status).not.toBe(403)
    // The person's own session may change the password.
    const own = await flow.helpers.login({ userId: person.userId })
    expect(await (await flow.post('/change-password', { currentPassword: 'old-password-1', newPassword: 'new-password-1' }, { bearer: own.token })).json()).not.toMatchObject({ reason: 'impersonating' })
  })

  it('may change the profile\'s name and picture, and no field of the app\'s own', async () => {
    const flow = await authFlow({ build: { authOptions: { user: { additionalFields: { plan: { type: 'string', required: false, input: true } } } } } })
    const person = await flow.signedIn()
    flow.impersonate(person.token)
    const refused = await flow.post('/update-user', { name: 'Ada L.', plan: 'enterprise' }, { bearer: person.token })
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ code: 'forbidden', reason: 'impersonating' })
    expect(flow.db.user![0]!.plan).toBeUndefined()
    expect((await flow.post('/update-user', { name: 'Ada L.', image: 'https://cdn.example/ada.png' }, { bearer: person.token })).status).toBe(200)
  })

  it('may still read, and leave', async () => {
    const { flow, person } = await impersonated()
    expect((await flow.get('/get-session', { bearer: person.token })).status).toBe(200)
    expect((await flow.get('/passkey/list-user-passkeys', { bearer: person.token })).status).toBe(200)
  })
})

describe('the impersonation check on a route with no rule', () => {
  it('reads no session for a request without a credential', async () => {
    let sessionReads = 0
    const flow = await authFlow({
      adapter: (adapter) => {
        const findOne = adapter.findOne as (args: { model: string }) => Promise<unknown>
        adapter.findOne = async (args: { model: string }) => {
          if (args.model === 'session') sessionReads++
          return findOne(args)
        }
      },
    })
    await flow.post('/email-otp/send-verification-otp', { email: 'ada@example.com', type: 'sign-in' })
    expect(sessionReads).toBe(0)
  })

  it('never lets a failed session read through as no impersonation', async () => {
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
    const person = await flow.signedIn()
    flow.impersonate(person.token)
    failReads = 1
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      // `/account-info` has no rule: only the impersonation check reads its session.
      // The route never runs as the visit: without its session it answers 401 itself.
      const response = await flow.get('/account-info?accountId=account-1', { bearer: person.token })
      expect(response.status).toBe(401)
    }
    finally {
      error.mockRestore()
    }
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
    vi.stubEnv('BACKEND_ENVIRONMENT', 'sandbox')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect((await flow.post('/organization/invite-member', { email: 'bob@example.com', role: 'member' })).status).toBe(401)
      expect(warn.mock.calls.flat().join('\n')).not.toContain('email.undeliverable')

      const { token } = await flow.signedIn()
      const refused = await flow.post('/organization/invite-member', { email: 'bob@example.com', role: 'member' }, { bearer: token })
      // `unavailable` from the email service: 503, with the code in the body.
      expect(refused.status).toBe(503)
      expect(await refused.json()).toMatchObject({ code: 'unavailable', service: 'email', reason: 'test_mode' })
      expect(warn.mock.calls.flat().join('\n')).toContain('email.undeliverable')
      // Refused before the inviter's bucket or the deployment's was spent.
      expect(flow.limiter.limit).not.toHaveBeenCalled()
    }
    finally {
      warn.mockRestore()
    }
  })
})
