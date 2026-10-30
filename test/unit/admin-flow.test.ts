import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAccessControl } from 'better-auth/plugins/access'
import { admin } from 'better-auth/plugins'
import { adminAc, defaultStatements, userAc } from 'better-auth/plugins/admin/access'
import { IMPERSONATION_SESSION_SECONDS } from '../../src/convex/constants'
import { getBackendError } from '../../src/convex/errors'
import { administratorsOf, impersonationSeconds } from '../../src/convex/client/plugins'
import { isAdministrator } from '../../src/convex/integrations/access'
import { authFlow } from '../helpers/auth-flow'

// The administrator's routes, against real Better Auth (test/helpers/
// auth-flow.ts): an impersonation is short and never of an administrator,
// whatever the app's roles grant, and a ban or its end lands on the
// activity trail without the reason given.

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

/** The app's audit instance, recording what the auth layer hands it. */
function recorder() {
  const events: Array<Record<string, unknown>> = []
  const audit = {
    recordBackendEvent: vi.fn(async (_ctx: unknown, event: Record<string, unknown>) => {
      events.push(event)
      return { id: `evt_${events.length}`, deliveries: { inApp: false, email: false } }
    }),
    forgetSubject: vi.fn(async () => {}),
  }
  return { audit, of: (type: string) => events.filter(event => event.type === type) }
}

/** What a refused route answers, as the client reads it. */
async function refusal(response: Response) {
  return getBackendError({ error: { status: response.status, ...await response.json() as Record<string, unknown> } })
}

/** Roles of an app that lets its administrators impersonate each other, as Better Auth allows. */
function permissiveRoles() {
  const ac = createAccessControl(defaultStatements)
  return {
    ac,
    roles: {
      admin: ac.newRole({ ...adminAc.statements, user: [...adminAc.statements.user, 'impersonate-admins'] }),
      user: ac.newRole({ ...userAc.statements }),
    },
  }
}

describe('an impersonation', () => {
  it('lasts thirty minutes at most', async () => {
    const flow = await authFlow({ build: { admin: { impersonationSessionDuration: 3600 } } })
    const ada = await flow.signedIn('ada@example.com')
    const root = await flow.signedIn('root@example.com', { role: 'admin' })
    const started = Date.now()
    const response = await flow.post('/admin/impersonate-user', { userId: ada.userId }, { cookie: root.cookie })
    expect(response.status).toBe(200)
    const { session } = await response.json() as { session: { expiresAt: string, impersonatedBy: string } }
    expect(session.impersonatedBy).toBe(root.userId)
    const lasts = new Date(session.expiresAt).getTime() - started
    expect(lasts).toBeLessThanOrEqual(IMPERSONATION_SESSION_SECONDS * 1000 + 5_000)
    expect(lasts).toBeGreaterThan((IMPERSONATION_SESSION_SECONDS - 60) * 1000)
  })

  it('keeps an app\'s shorter duration, and holds a longer or missing one to the package\'s', () => {
    expect(impersonationSeconds({ impersonationSessionDuration: 600 })).toBe(600)
    expect(impersonationSeconds({ impersonationSessionDuration: 86_400 })).toBe(IMPERSONATION_SESSION_SECONDS)
    expect(impersonationSeconds({ impersonationSessionDuration: 0 })).toBe(IMPERSONATION_SESSION_SECONDS)
    expect(impersonationSeconds(undefined)).toBe(IMPERSONATION_SESSION_SECONDS)
  })

  it('is refused for an administrator\'s account, even where the app\'s roles grant impersonate-admins', async () => {
    const flow = await authFlow({ build: { admin: permissiveRoles() } })
    const other = await flow.signedIn('other@example.com', { role: 'admin' })
    const root = await flow.signedIn('root@example.com', { role: 'admin' })
    const response = await flow.post('/admin/impersonate-user', { userId: other.userId }, { cookie: root.cookie })
    expect(response.status).toBe(403)
    expect(await refusal(response)).toMatchObject({ code: 'forbidden', data: { reason: 'admin_target' } })
    expect(flow.db.session!.filter(session => session.impersonatedBy)).toEqual([])
    // Their own account too.
    const self = await flow.post('/admin/impersonate-user', { userId: root.userId }, { cookie: root.cookie })
    expect(await refusal(self)).toMatchObject({ code: 'forbidden', data: { reason: 'admin_target' } })
  })

  it('is refused for an account an app names as an administrator by id, or by a role of its own', async () => {
    const { ac, roles } = permissiveRoles()
    const flow = await authFlow({ build: { admin: { ac, roles: { ...roles, support: roles.admin }, adminRoles: ['admin', 'support'] } } })
    const support = await flow.signedIn('support@example.com', { role: 'support' })
    const root = await flow.signedIn('root@example.com', { role: 'admin' })
    const response = await flow.post('/admin/impersonate-user', { userId: support.userId }, { cookie: root.cookie })
    expect(await refusal(response)).toMatchObject({ code: 'forbidden', data: { reason: 'admin_target' } })
    expect(administratorsOf({ adminRoles: 'admin, support', adminUserIds: ['u1'] })).toEqual({ roles: ['admin', 'support'], userIds: ['u1'] })
    expect(administratorsOf(undefined)).toEqual({ roles: ['admin'], userIds: [] })
    const named = administratorsOf({ adminUserIds: ['u1'] })
    expect(isAdministrator({ id: 'u1', role: 'user' }, named)).toBe(true)
    expect(isAdministrator({ id: 'u2', role: 'user, admin' }, named)).toBe(true)
    expect(isAdministrator({ id: 'u2', role: null }, named)).toBe(false)
  })

  it('is refused for an administrator\'s account to a role outside adminRoles that may impersonate admins', async () => {
    const { ac, roles } = permissiveRoles()
    const support = ac.newRole({ user: ['impersonate', 'impersonate-admins'] })
    const flow = await authFlow({ build: { admin: { ac, roles: { ...roles, support }, adminRoles: ['admin'] } } })
    const root = await flow.signedIn('root@example.com', { role: 'admin' })
    const ada = await flow.signedIn('ada@example.com')
    const helper = await flow.signedIn('helper@example.com', { role: 'support' })
    const response = await flow.post('/admin/impersonate-user', { userId: root.userId }, { cookie: helper.cookie })
    expect(response.status).toBe(403)
    expect(await refusal(response)).toMatchObject({ code: 'forbidden', data: { reason: 'admin_target' } })
    expect(flow.db.session!.filter(session => session.impersonatedBy)).toEqual([])
    // The role still visits an account that is no administrator's.
    expect((await flow.post('/admin/impersonate-user', { userId: ada.userId }, { cookie: helper.cookie })).status).toBe(200)
  })

  it('is refused for an administrator\'s account where the app sets allowImpersonatingAdmins', async () => {
    const { ac, roles } = permissiveRoles()
    const support = ac.newRole({ user: ['impersonate'] })
    const flow = await authFlow({ build: { admin: { ac, roles: { ...roles, support }, allowImpersonatingAdmins: true } } })
    const root = await flow.signedIn('root@example.com', { role: 'admin' })
    const helper = await flow.signedIn('helper@example.com', { role: 'support' })
    const response = await flow.post('/admin/impersonate-user', { userId: root.userId }, { cookie: helper.cookie })
    expect(await refusal(response)).toMatchObject({ code: 'forbidden', data: { reason: 'admin_target' } })
    expect(flow.db.session!.filter(session => session.impersonatedBy)).toEqual([])
  })

  it('is refused for an administrator an app\'s own admin plugin names', async () => {
    const { ac, roles } = permissiveRoles()
    const flow = await authFlow({ build: { authOptions: { plugins: [admin({ ac, roles: { ...roles, owner: roles.admin }, adminRoles: ['admin', 'owner'] })] } } })
    const owner = await flow.signedIn('owner@example.com', { role: 'owner' })
    const root = await flow.signedIn('root@example.com', { role: 'admin' })
    const response = await flow.post('/admin/impersonate-user', { userId: owner.userId }, { cookie: root.cookie })
    expect(await refusal(response)).toMatchObject({ code: 'forbidden', data: { reason: 'admin_target' } })
  })

  it('tells a caller who is no administrator nothing about who holds the role', async () => {
    const flow = await authFlow()
    const root = await flow.signedIn('root@example.com', { role: 'admin' })
    const ada = await flow.signedIn('ada@example.com')
    const response = await flow.post('/admin/impersonate-user', { userId: root.userId }, { cookie: ada.cookie })
    expect(response.status).toBe(403)
    expect((await refusal(response))?.data).not.toMatchObject({ reason: 'admin_target' })
  })

  it('reads Better Auth\'s own refusal of an administrator\'s account as admin_target', () => {
    expect(getBackendError({ error: { status: 403, code: 'YOU_CANNOT_IMPERSONATE_ADMINS', message: 'You cannot impersonate admins' } }))
      .toMatchObject({ code: 'forbidden', data: { reason: 'admin_target' } })
  })
})

describe('a ban', () => {
  it('is recorded with how long it lasts and never the reason, and so is its end', async () => {
    const trail = recorder()
    const flow = await authFlow({ runtime: { audit: trail.audit as never } })
    const ada = await flow.signedIn('ada@example.com')
    const root = await flow.signedIn('root@example.com', { role: 'admin' })
    expect((await flow.post('/admin/ban-user', { userId: ada.userId, banReason: 'Wrote to ada@example.com', banExpiresIn: 3600 }, { cookie: root.cookie })).status).toBe(200)
    expect(trail.of('admin.user_banned')).toEqual([{ type: 'admin.user_banned', actor: { userId: root.userId }, subjectId: ada.userId, data: { expiresIn: 3600 } }])
    expect(JSON.stringify(trail.of('admin.user_banned'))).not.toContain('Wrote')
    // Banning signs the account out everywhere.
    expect(flow.db.session!.filter(session => session.userId === ada.userId)).toEqual([])

    expect((await flow.post('/admin/unban-user', { userId: ada.userId }, { cookie: root.cookie })).status).toBe(200)
    expect(trail.of('admin.user_unbanned')).toEqual([{ type: 'admin.user_unbanned', actor: { userId: root.userId }, subjectId: ada.userId }])
  })

  it('records a ban until lifted with no end', async () => {
    const trail = recorder()
    const flow = await authFlow({ runtime: { audit: trail.audit as never } })
    const ada = await flow.signedIn('ada@example.com')
    const root = await flow.signedIn('root@example.com', { role: 'admin' })
    await flow.post('/admin/ban-user', { userId: ada.userId }, { cookie: root.cookie })
    expect(trail.of('admin.user_banned')).toEqual([expect.objectContaining({ subjectId: ada.userId, data: {} })])
  })

  it('records the end an app\'s defaultBanExpiresIn gives a ban the request left open', async () => {
    const trail = recorder()
    const flow = await authFlow({ build: { admin: { defaultBanExpiresIn: 86_400 } }, runtime: { audit: trail.audit as never } })
    const ada = await flow.signedIn('ada@example.com')
    const root = await flow.signedIn('root@example.com', { role: 'admin' })
    await flow.post('/admin/ban-user', { userId: ada.userId }, { cookie: root.cookie })
    expect(trail.of('admin.user_banned')).toEqual([expect.objectContaining({ subjectId: ada.userId, data: { expiresIn: 86_400 } })])
  })

  it('records nothing when the route refused', async () => {
    const trail = recorder()
    const flow = await authFlow({ runtime: { audit: trail.audit as never } })
    const ada = await flow.signedIn('ada@example.com')
    const grace = await flow.signedIn('grace@example.com')
    expect((await flow.post('/admin/ban-user', { userId: ada.userId }, { cookie: grace.cookie })).status).toBe(403)
    expect(trail.of('admin.user_banned')).toEqual([])
  })
})

// A sandbox is a public demo whose dev inbox anyone may read: Better Auth's
// own admin routes are a passkey-only administrator's there, as the admin
// tier and the console are (test/convex-component/sandbox-admin.test.ts).
// authFlow stubs `production`, so each test names its deployment after it.
/** Say how a session was signed in to, as the session hook records it. */
function signedInWith(flow: { db: Record<string, Array<Record<string, unknown>>> }, token: string, method: string | null) {
  for (const row of flow.db.session!.filter(session => session.token === token)) row.signInMethod = method
}

describe('Better Auth\'s admin routes on a sandbox deployment', () => {
  it('refuse an administrator who still signs in with codes, and change nothing', async () => {
    const flow = await authFlow()
    vi.stubEnv('BACKEND_ENVIRONMENT', 'sandbox')
    const ada = await flow.signedIn('ada@example.com')
    const root = await flow.signedIn('root@example.com', { role: 'admin' })
    for (const [path, body] of [
      ['/admin/impersonate-user', { userId: ada.userId }],
      ['/admin/ban-user', { userId: ada.userId }],
      ['/admin/set-role', { userId: ada.userId, role: 'admin' }],
      ['/admin/revoke-user-sessions', { userId: ada.userId }],
      ['/admin/disable-passkey-only', { userId: ada.userId }],
    ] as const) {
      const response = await flow.post(path, body, { cookie: root.cookie })
      expect(response.status, path).toBe(403)
      expect(await refusal(response), path).toMatchObject({ code: 'forbidden', data: { reason: 'passkey_only_admin' } })
    }
    expect(flow.db.session!.filter(session => session.impersonatedBy)).toEqual([])
    expect(flow.db.user!.find(user => user.id === ada.userId)).toMatchObject({ role: 'user' })
    expect(flow.db.user!.find(user => user.id === ada.userId)?.banned).toBeFalsy()
  })

  it('let a passkey-only administrator in who signed in to this session with a passkey', async () => {
    const flow = await authFlow()
    vi.stubEnv('BACKEND_ENVIRONMENT', 'sandbox')
    const ada = await flow.signedIn('ada@example.com')
    const grace = await flow.signedIn('grace@example.com')
    const root = await flow.signedIn('root@example.com', { role: 'admin', passkeyOnly: true })
    signedInWith(flow, root.token, 'passkey')
    expect((await flow.post('/admin/ban-user', { userId: grace.userId }, { cookie: root.cookie })).status).toBe(200)
    const visit = await flow.post('/admin/impersonate-user', { userId: ada.userId }, { cookie: root.cookie })
    expect(visit.status).toBe(200)
    // The way out of the visit is open: it only gives power back.
    const visiting = visit.headers.getSetCookie().map(entry => entry.split(';')[0]!).filter(pair => !pair.endsWith('=')).join('; ')
    expect((await flow.post('/admin/stop-impersonating', {}, { cookie: visiting })).status).toBe(200)
  })

  it('refuse a passkey-only administrator whose session a code opened, before or after the switch', async () => {
    const flow = await authFlow()
    vi.stubEnv('BACKEND_ENVIRONMENT', 'sandbox')
    const ada = await flow.signedIn('ada@example.com')
    const root = await flow.signedIn('root@example.com', { role: 'admin', passkeyOnly: true })
    signedInWith(flow, root.token, 'email-otp')
    for (const path of ['/admin/ban-user', '/admin/impersonate-user']) {
      const response = await flow.post(path, { userId: ada.userId }, { cookie: root.cookie })
      expect(response.status, path).toBe(403)
      expect(await refusal(response), path).toMatchObject({ code: 'forbidden', data: { reason: 'passkey_only_admin' } })
    }
    // A session that names no method (made before the field) is a code's.
    signedInWith(flow, root.token, null)
    expect((await flow.post('/admin/ban-user', { userId: ada.userId }, { cookie: root.cookie })).status).toBe(403)
  })

  it('check the administrator\'s own session during a visit, and leave the way out open', async () => {
    const flow = await authFlow()
    vi.stubEnv('BACKEND_ENVIRONMENT', 'sandbox')
    const grace = await flow.signedIn('grace@example.com')
    const ada = await flow.signedIn('ada@example.com')
    const root = await flow.signedIn('root@example.com', { role: 'admin', passkeyOnly: true })
    signedInWith(flow, root.token, 'passkey')
    const visit = await flow.post('/admin/impersonate-user', { userId: ada.userId }, { cookie: root.cookie })
    expect(visit.status).toBe(200)
    const visiting = visit.headers.getSetCookie().map(entry => entry.split(';')[0]!).filter(pair => !pair.endsWith('=')).join('; ')
    // The administrator's own session was signed in with a passkey: the
    // sandbox rule passes, and the route answers for the visited account.
    const passed = await flow.post('/admin/ban-user', { userId: grace.userId }, { cookie: visiting })
    expect(await refusal(passed)).not.toMatchObject({ data: { reason: 'passkey_only_admin' } })
    // Once that session is a code's, the sandbox rule refuses the visit.
    signedInWith(flow, root.token, 'email-otp')
    const refused = await flow.post('/admin/ban-user', { userId: grace.userId }, { cookie: visiting })
    expect(await refusal(refused)).toMatchObject({ code: 'forbidden', data: { reason: 'passkey_only_admin' } })
    // Without the administrator's session cookie, no sign-in stands behind the visit.
    signedInWith(flow, root.token, 'passkey')
    const bare = visiting.split('; ').filter(pair => !pair.includes('admin_session')).join('; ')
    expect(await refusal(await flow.post('/admin/ban-user', { userId: grace.userId }, { cookie: bare }))).toMatchObject({ data: { reason: 'passkey_only_admin' } })
    // The way out stays open, whatever the administrator's session.
    signedInWith(flow, root.token, 'email-otp')
    expect((await flow.post('/admin/stop-impersonating', {}, { cookie: visiting })).status).toBe(200)
  })

  it('leave a request without a session to the route, and someone with no admin role to Better Auth\'s own check', async () => {
    const flow = await authFlow()
    vi.stubEnv('BACKEND_ENVIRONMENT', 'sandbox')
    const ada = await flow.signedIn('ada@example.com', { passkeyOnly: true })
    expect((await flow.post('/admin/ban-user', { userId: ada.userId })).status).toBe(401)
    expect((await flow.post('/admin/ban-user', { userId: ada.userId }, { cookie: ada.cookie })).status).toBe(403)
  })

  it.each(['development', 'preview', 'production', ''])('are an administrator\'s who signs in with codes on every other deployment (%s)', async (environment) => {
    const flow = await authFlow()
    vi.stubEnv('BACKEND_ENVIRONMENT', environment)
    const ada = await flow.signedIn('ada@example.com')
    const root = await flow.signedIn('root@example.com', { role: 'admin' })
    expect((await flow.post('/admin/ban-user', { userId: ada.userId }, { cookie: root.cookie })).status).toBe(200)
  })
})
