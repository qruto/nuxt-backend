import { afterEach, describe, expect, it, vi } from 'vitest'
import { RECENT_SIGN_IN_SECONDS, REAUTHENTICATE_HEADER } from '../../src/convex/constants'
import { sessionClaims } from '../../src/convex/client/better-auth-options'
import { assertReauthentication, disabledRoutes, reauthenticatedWorkspace, revokeSuperseded } from '../../src/convex/client/guards'
import { getBackendError } from '../../src/convex/errors'
import { DEFAULT_LIMITS } from '../../src/convex/integrations/rate-limit'
import { SENSITIVE_ACTIONS, type SensitiveAction } from '../../src/convex/sensitive-actions'
import { authFlow, memoryLimiter, ORIGIN } from '../helpers/auth-flow'

// The sensitive-action table (src/convex/sensitive-actions.ts) against the
// auth instance the package builds: every write route has a row, every
// route's row is what the request guard enforces, and re-authentication —
// the sign-in a stale session makes to pass a row that asks for a recent
// one — holds to the session it replaces. The scaffold's functions are held
// to their rows by the probe suite (test/convex-component/authorization-probes.test.ts).

afterEach(() => {
  vi.unstubAllEnvs()
})

/** Every route the auth instance mounts: its path and methods, and whether it is for server code only. */
async function mountedRoutes() {
  const flow = await authFlow({ build: { authOptions: { emailAndPassword: { enabled: true } } } })
  const api = (flow.auth as unknown as { api: Record<string, { path?: string, options?: { method?: string | string[], metadata?: { SERVER_ONLY?: boolean } } }> }).api
  return Object.values(api)
    .filter(endpoint => typeof endpoint.path === 'string' && !endpoint.options?.metadata?.SERVER_ONLY)
    .map(endpoint => ({ path: endpoint.path!, methods: [endpoint.options?.method ?? 'GET'].flat() }))
}

/** The GET routes that write: a passkey challenge for a registration, an emailed deletion's confirmation. */
const GET_WRITES = ['/passkey/generate-register-options', '/delete-user/callback']

const routeRows = Object.entries(SENSITIVE_ACTIONS).filter(([key]) => key.startsWith('/')) as Array<[string, SensitiveAction]>

/** A sign-in older than the window. */
const STALE = new Date(Date.now() - (RECENT_SIGN_IN_SECONDS + 60) * 1000)

/** Age the sessions `token` names, as if the person signed in before the window. */
function age(flow: Awaited<ReturnType<typeof authFlow>>, token: string, at = STALE) {
  for (const row of flow.db.session!.filter(session => session.token === token)) row.createdAt = at
}

/** The methods each route takes, read once. */
const methods = mountedRoutes().then(routes => new Map(routes.map(route => [route.path, route.methods])))

/** A request to `path` with the method it takes: POST where it takes one, GET otherwise. */
async function call(flow: Awaited<ReturnType<typeof authFlow>>, path: string, credential: { cookie?: string }) {
  return (await methods).get(path)?.includes('POST') ? flow.post(path, {}, credential) : flow.get(path, credential)
}

describe('the sensitive-action table', () => {
  it('gives every write route of the auth instance a row, and names no route it lacks', async () => {
    const routes = await mountedRoutes()
    // Every administrator and workspace route, whatever its method: each reaches
    // into somebody else's account or a shared workspace, and its row names
    // the caller limit, the visit rule and the sign-in it takes.
    const reaching = (path: string) => path.startsWith('/admin/') || path.startsWith('/organization/')
    const writes = routes.filter(route => route.methods.includes('POST') || GET_WRITES.includes(route.path) || reaching(route.path)).map(route => route.path)
    expect(writes.length).toBeGreaterThan(60)
    expect(writes.filter(path => !Object.hasOwn(SENSITIVE_ACTIONS, path)), 'a write route without a row').toEqual([])
    const mounted = new Set(routes.map(route => route.path))
    expect(routeRows.map(([path]) => path).filter(path => !mounted.has(path)), 'a row for a route nothing mounts').toEqual([])
  })

  it('gives every row the three columns, with limits the package defines', () => {
    for (const [key, row] of Object.entries(SENSITIVE_ACTIONS) as Array<[string, SensitiveAction]>) {
      expect(Object.keys(row).sort(), key).toEqual(['impersonation', 'limit', 'recentSignIn'])
      for (const name of Object.values(row.limit ?? {})) expect(Object.hasOwn(DEFAULT_LIMITS, name), `${key} spends ${name}`).toBe(true)
      expect(row.recentSignIn === null || row.recentSignIn === RECENT_SIGN_IN_SECONDS, `${key} asks in the package's one window`).toBe(true)
      // A recent sign-in is the account's own: an administrator's visit never gives one.
      if (row.recentSignIn !== null) expect(row.impersonation, key).toBe('refused')
    }
    // Signing devices out is the account's defence: it never waits on a sign-in.
    for (const key of ['/revoke-session', '/revoke-sessions', '/revoke-other-sessions', '/admin/revoke-user-session', '/admin/revoke-user-sessions', 'auth:revokeSession']) {
      expect(SENSITIVE_ACTIONS[key]?.recentSignIn, key).toBeNull()
    }
  })

  describe.each(routeRows.filter(([, row]) => row.recentSignIn !== null))('%s', (path) => {
    it('refuses a sign-in older than its window before the route runs, and lets a recent one past the guard', async () => {
      const flow = await authFlow()
      const stale = await flow.signedIn('ada@example.com', { role: 'admin' })
      age(flow, stale.token)
      const refused = await call(flow, path, { cookie: stale.cookie })
      expect(refused.status).toBe(403)
      expect(getBackendError({ error: { ...await refused.json(), status: 403 } })).toMatchObject({ code: 'reauthentication_required' })

      const recent = await flow.signedIn('grace@example.com', { role: 'admin' })
      const passed = await call(flow, path, { cookie: recent.cookie })
      // Past the guard, the route answers for itself: never with this refusal.
      const body = await passed.json().catch(() => null) as { code?: string } | null
      expect(body?.code).not.toBe('reauthentication_required')
    })
  })

  // Every row that takes no recent sign-in, the reads a visit may use
  // included: an old sign-in is never refused as one, by the request guard
  // or by Better Auth's own `freshAge` check (its `/list-sessions` and
  // passkey routes hold every session to the package's window), read as the
  // client reads it.
  describe.each(routeRows.filter(([path, row]) => row.recentSignIn === null && !['/sign-in/email-otp', '/email-otp/send-verification-otp', '/passkey/generate-authenticate-options', '/passkey/verify-authentication'].includes(path)))('%s', (path) => {
    it('lets an old sign-in through, as the client reads the answer', async () => {
      const flow = await authFlow()
      const stale = await flow.signedIn('ada@example.com', { role: 'admin' })
      age(flow, stale.token)
      const answer = await call(flow, path, { cookie: stale.cookie })
      const body = await answer.json().catch(() => null) as Record<string, unknown> | null
      expect(getBackendError({ error: { ...body, status: answer.status } })?.code, `${answer.status} ${JSON.stringify(body)?.slice(0, 120)}`).not.toBe('reauthentication_required')
    })
  })

  it('refuses an administrator acting as the account on every route whose row says so, and lets one use the rest', async () => {
    // With passwords on, so the reset routes answer; the routes the package always turns off answer 404 to everyone.
    const off = disabledRoutes({ emailAndPassword: { enabled: true } })
    for (const [path, row] of routeRows.filter(([path]) => !off.includes(path))) {
      const flow = await authFlow({ build: { authOptions: { emailAndPassword: { enabled: true } } } })
      const person = await flow.signedIn()
      flow.impersonate(person.token)
      const answer = await call(flow, path, { cookie: person.cookie })
      const body = await answer.json().catch(() => null) as { code?: string, reason?: string } | null
      const refused = answer.status === 403 && body?.reason === 'impersonating'
      expect(refused, `${path}: ${answer.status} ${JSON.stringify(body)?.slice(0, 120)}`).toBe(row.impersonation === 'refused')
    }
  }, 60_000)

  it('spends each route\'s caller limit, keyed by the caller', async () => {
    for (const [path, row] of routeRows.filter(([, row]) => row.limit && 'caller' in row.limit && !row.limit.address)) {
      const limiter = memoryLimiter()
      const limit = vi.fn(async (ctx: unknown, name: never, options?: { key?: string }) => (name === row.limit!.caller ? { ok: false, retryAfter: 1000 } : limiter.limit(ctx, name, options)))
      const flow = await authFlow({ runtime: { rateLimiter: { limit } } })
      const caller = await flow.signedIn('root@example.com', { role: 'admin' })
      const answer = await call(flow, path, { cookie: caller.cookie })
      expect(answer.status, path).toBe(429)
      expect(limit, path).toHaveBeenCalledWith(expect.anything(), row.limit!.caller, { key: caller.userId })
    }
  })
})

describe('re-authentication', () => {
  const marked = { [REAUTHENTICATE_HEADER]: '1' }

  /** POST with the session cookie and the marker. */
  async function reauthPost(flow: Awaited<ReturnType<typeof authFlow>>, path: string, body: Record<string, unknown>, cookie: string) {
    return flow.auth.handler(new Request(`${ORIGIN}/api/auth${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': ORIGIN, cookie, ...marked },
      body: JSON.stringify(body),
    }))
  }

  /** A person signed in by code, so their session has a workspace, then left past the window. */
  async function staleSession() {
    const flow = await authFlow()
    const first = await flow.signInWithCode('ada@example.com', 'Ada')
    age(flow, first.token)
    const old = flow.db.session!.find(row => row.token === first.token)!
    return { flow, first, old }
  }

  it('signs the same account in again by code: a new session, the workspace kept, the old one signed out', async () => {
    const { flow, first, old } = await staleSession()
    // A second workspace, active on the old session: a new sign-in on its own
    // would land on the first membership, the personal workspace.
    const personal = old.activeOrganizationId
    flow.db.organization!.push({ id: 'team-1', name: 'Team', slug: 'team', createdAt: new Date() })
    flow.db.member!.push({ id: 'member-team-1', organizationId: 'team-1', userId: first.userId, role: 'admin', createdAt: new Date() })
    old.activeOrganizationId = 'team-1'
    expect(personal).toBeTruthy()
    expect((await flow.post('/passkey/delete-passkey', { id: 'pk' }, { cookie: first.cookie })).status).toBe(403)

    expect((await reauthPost(flow, '/email-otp/send-verification-otp', { email: 'ada@example.com', type: 'sign-in' }, first.cookie)).status).toBe(200)
    const answer = await reauthPost(flow, '/sign-in/email-otp', { email: 'ada@example.com', otp: flow.codeFor('ada@example.com') }, first.cookie)
    expect(answer.status).toBe(200)
    const { token } = await answer.json() as { token: string }
    const cookie = answer.headers.getSetCookie().map(entry => entry.split(';')[0]).join('; ')

    const sessions = flow.db.session!.filter(row => row.userId === first.userId)
    expect(sessions.map(row => row.token)).toEqual([token])
    expect(sessions[0]!.activeOrganizationId).toBe('team-1')
    // The new sign-in passes the guard: the route itself answers.
    const body = await (await flow.post('/passkey/delete-passkey', { id: 'pk' }, { cookie })).json() as { code?: string }
    expect(body.code).not.toBe('reauthentication_required')
  })

  it('carries the new sign-in time on the new session\'s token', () => {
    const at = new Date('2026-10-19T09:00:00.000Z')
    expect(sessionClaims({ user: { id: 'u1', email: 'a@b.co', authTime: 1 }, session: { createdAt: at } })).toMatchObject({ authTime: at.getTime() })
    expect(sessionClaims({ user: { id: 'u1', authTime: 1 }, session: {} })).not.toHaveProperty('authTime')
  })

  it('refuses a code to another address, and sends nothing', async () => {
    const { flow, first } = await staleSession()
    await flow.signedIn('grace@example.com')
    const refused = await reauthPost(flow, '/email-otp/send-verification-otp', { email: 'grace@example.com', type: 'sign-in' }, first.cookie)
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ code: 'forbidden', reason: 'other_account' })
    expect(flow.codeFor('grace@example.com')).toBeUndefined()
    // A code that reached another address by a sign-in of its own does not re-authenticate this one.
    await flow.sendCode('grace@example.com')
    const crossed = await reauthPost(flow, '/sign-in/email-otp', { email: 'grace@example.com', otp: flow.codeFor('grace@example.com') }, first.cookie)
    expect(crossed.status).toBe(403)
    expect(flow.db.session!.some(row => row.token === first.token)).toBe(true)
  })

  it('needs a session of the person\'s own', async () => {
    const flow = await authFlow()
    await flow.signedIn()
    expect((await reauthPost(flow, '/email-otp/send-verification-otp', { email: 'ada@example.com', type: 'sign-in' }, '')).status).toBe(401)
    const person = await flow.signedIn('grace@example.com')
    flow.impersonate(person.token)
    const visit = await reauthPost(flow, '/email-otp/send-verification-otp', { email: 'grace@example.com', type: 'sign-in' }, person.cookie)
    expect(visit.status).toBe(403)
    expect(await visit.json()).toMatchObject({ reason: 'impersonating' })
  })

  it('leaves a sign-in without the mark as it was: the old session stays', async () => {
    const { flow, first } = await staleSession()
    await flow.sendCode('ada@example.com')
    const answer = await flow.post('/sign-in/email-otp', { email: 'ada@example.com', otp: flow.codeFor('ada@example.com') }, { cookie: first.cookie })
    expect(answer.status).toBe(200)
    expect(flow.db.session!.filter(row => row.userId === first.userId)).toHaveLength(2)
  })

  it('refuses another account\'s session before it is written, and keeps the workspace only while the account belongs to it', async () => {
    const request = new Request(`${ORIGIN}/api/auth/passkey/verify-authentication`, { method: 'POST', headers: marked })
    const findOne = vi.fn(async () => ({ id: 'member-1' }))
    const hookCtx = { request, context: { adapter: { findOne } } }
    // What the before-hook records for a marked request.
    await assertReauthentication({
      path: '/passkey/verify-authentication',
      request,
      headers: request.headers,
      body: {},
      context: { session: { user: { id: 'u1', email: 'ada@example.com' }, session: { id: 's1', token: 'old-token', createdAt: STALE, activeOrganizationId: 'org-1' } } },
    } as never)
    await expect(reauthenticatedWorkspace({ userId: 'u2' }, hookCtx)).rejects.toMatchObject({ body: { code: 'forbidden', reason: 'other_account' } })
    expect(await reauthenticatedWorkspace({ userId: 'u1' }, hookCtx)).toBe('org-1')
    findOne.mockResolvedValueOnce(null as never)
    expect(await reauthenticatedWorkspace({ userId: 'u1' }, hookCtx)).toBeUndefined()

    // A marked sign-in the before-hook recorded nothing for fails closed: never
    // an ordinary sign-in of whichever account answered.
    const unrecorded = new Request(`${ORIGIN}/api/auth/sign-in/email`, { method: 'POST', headers: marked })
    await expect(reauthenticatedWorkspace({ userId: 'u1' }, { request: unrecorded, context: { adapter: { findOne } } })).rejects.toMatchObject({ body: { code: 'forbidden', reason: 'other_account' } })
    // An unmarked sign-in is an ordinary one.
    expect(await reauthenticatedWorkspace({ userId: 'u1' }, { request: new Request(`${ORIGIN}/api/auth/sign-in/email`, { method: 'POST' }) })).toBeUndefined()

    // Once the new session is open, the old one goes; a refused sign-in opened none.
    const deleteSession = vi.fn(async () => {})
    await revokeSuperseded({ request, context: { newSession: null, internalAdapter: { deleteSession } } })
    expect(deleteSession).not.toHaveBeenCalled()
  })

  it('reads Better Auth\'s own stale-session refusals as the same code', () => {
    expect(getBackendError({ error: { code: 'SESSION_NOT_FRESH', message: 'Session is not fresh', status: 403 } })).toMatchObject({ code: 'reauthentication_required' })
    expect(getBackendError({ error: { code: 'SESSION_EXPIRED', message: 'Session expired', status: 400 } })).toMatchObject({ code: 'reauthentication_required' })
  })
})
