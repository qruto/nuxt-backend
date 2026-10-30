import { afterEach, describe, expect, it, vi } from 'vitest'
import { auditDatabaseHooks, noteRouteBefore, recordRouteEvent } from '../../src/convex/client/audit'
import { REAUTHENTICATE_HEADER } from '../../src/convex/constants'
import { authFlow, ORIGIN } from '../helpers/auth-flow'

// The auth layer's write points on the shared event path, against real
// Better Auth through its routes (test/helpers/auth-flow.ts): each route
// records its event once it went through, with who acted and who it is
// about, and nothing when it refused, when it changed nothing, or when the
// session it closes was replaced by a re-authentication. The recorder
// stands in for the app's audit instance; test/convex-component/audit.test.ts
// holds what the trail does with an event.

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

/** The app's audit instance, recording what the auth layer hands it. */
function recorder(fail = false) {
  const events: Array<Record<string, unknown>> = []
  const audit = {
    recordBackendEvent: vi.fn(async (_ctx: unknown, event: Record<string, unknown>) => {
      if (fail) throw new Error('the trail is down')
      events.push(event)
      return { id: `evt_${events.length}`, deliveries: { inApp: false, email: false } }
    }),
    forgetSubject: vi.fn(async (_ctx: unknown, _userId: string) => {}),
  }
  return { audit, events, of: (type: string) => events.filter(event => event.type === type) }
}

async function flowWithAudit(fail = false) {
  const trail = recorder(fail)
  const flow = await authFlow({ runtime: { audit: trail.audit as never } })
  return { flow, trail }
}

/** The cookies an answer leaves a browser holding: the last value of each, without the ones it clears. */
function cookiesOf(response: Response): string {
  const jar = new Map<string, string>()
  for (const cookie of response.headers.getSetCookie()) {
    const [pair = ''] = cookie.split(';')
    const name = pair.slice(0, pair.indexOf('='))
    if (pair.endsWith('=')) jar.delete(name)
    else jar.set(name, pair)
  }
  return [...jar.values()].join('; ')
}

/** The JSON a route answered. */
async function json<T>(response: Response): Promise<T> {
  expect(response.status, await response.clone().text()).toBe(200)
  return response.json() as Promise<T>
}

describe('sessions', () => {
  it('records a sign-in with its method, and a sign-out', async () => {
    const { flow, trail } = await flowWithAudit()
    const ada = await flow.signInWithCode('ada@example.com')
    const session = flow.db.session!.find(row => row.token === ada.token)!
    expect(trail.of('auth.signed_in')).toEqual([{ type: 'auth.signed_in', actor: { userId: ada.userId }, targetId: session.id, data: { method: 'email-otp' } }])

    await json(await flow.post('/sign-out', {}, { cookie: ada.cookie }))
    expect(trail.of('auth.signed_out')).toEqual([{ type: 'auth.signed_out', actor: { userId: ada.userId }, targetId: session.id }])
  })

  it('records the sessions signed out from elsewhere, by whoever did it', async () => {
    const { flow, trail } = await flowWithAudit()
    const ada = await flow.signedIn('ada@example.com')
    const laptop = await flow.helpers.login({ userId: ada.userId })
    const laptopId = flow.db.session!.find(row => row.token === laptop.token)!.id
    await json(await flow.post('/revoke-other-sessions', {}, { cookie: ada.cookie }))
    expect(trail.of('auth.session_revoked')).toEqual([{ type: 'auth.session_revoked', actor: { userId: ada.userId }, subjectId: ada.userId, targetId: laptopId }])
  })

  it('records every session its owner signs out at once, each by its owner', async () => {
    const { flow, trail } = await flowWithAudit()
    const ada = await flow.signedIn('ada@example.com')
    await flow.helpers.login({ userId: ada.userId })
    const sessions = flow.db.session!.filter(row => row.userId === ada.userId).map(row => row.id as string)
    await json(await flow.post('/revoke-sessions', {}, { cookie: ada.cookie }))
    expect(trail.of('auth.session_revoked')).toEqual(sessions.map(targetId => ({ type: 'auth.session_revoked', actor: { userId: ada.userId }, subjectId: ada.userId, targetId })))
  })

  it('records the sessions an administrator signs out, by the administrator, one row per session', async () => {
    const { flow, trail } = await flowWithAudit()
    const ada = await flow.signedIn('ada@example.com')
    const laptop = await flow.helpers.login({ userId: ada.userId })
    const admin = await flow.signedIn('root@example.com', { role: 'admin' })
    const laptopId = flow.db.session!.find(row => row.token === laptop.token)!.id as string
    await json(await flow.post('/admin/revoke-user-session', { sessionToken: laptop.token }, { cookie: admin.cookie }))
    expect(trail.of('auth.session_revoked')).toEqual([{ type: 'auth.session_revoked', actor: { userId: admin.userId }, subjectId: ada.userId, targetId: laptopId }])

    const left = flow.db.session!.filter(row => row.userId === ada.userId).map(row => row.id as string)
    await json(await flow.post('/admin/revoke-user-sessions', { userId: ada.userId }, { cookie: admin.cookie }))
    expect(trail.of('auth.session_revoked').slice(1)).toEqual(left.map(targetId => ({ type: 'auth.session_revoked', actor: { userId: admin.userId }, subjectId: ada.userId, targetId })))
    // The administrator's own session is untouched, and nothing but its sign-up names it.
    expect(trail.events.filter(event => event.subjectId === admin.userId && event.type !== 'account.created')).toEqual([])
  })

  it('records a sign-up as the growth funnel\'s `account.created`, by the new account', async () => {
    const { flow, trail } = await flowWithAudit()
    const ada = await flow.signedIn('ada@example.com')
    expect(trail.of('account.created')).toEqual([{ type: 'account.created', actor: { userId: ada.userId }, subjectId: ada.userId, data: {} }])
  })

  it('records a re-authentication as one, and not the session it replaces as signed out', async () => {
    const { flow, trail } = await flowWithAudit()
    const ada = await flow.signInWithCode('ada@example.com', 'Ada')
    const marked = (path: string, body: Record<string, unknown>) => flow.auth.handler(new Request(`${ORIGIN}/api/auth${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': ORIGIN, 'cookie': ada.cookie, [REAUTHENTICATE_HEADER]: '1' },
      body: JSON.stringify(body),
    }))
    await json(await marked('/email-otp/send-verification-otp', { email: 'ada@example.com', type: 'sign-in' }))
    await json(await marked('/sign-in/email-otp', { email: 'ada@example.com', otp: flow.codeFor('ada@example.com') }))
    expect(trail.of('auth.reauthenticated')).toEqual([expect.objectContaining({ actor: { userId: ada.userId }, data: { method: 'email-otp' } })])
    expect(trail.of('auth.signed_in')).toHaveLength(1)
    expect(trail.of('auth.signed_out')).toEqual([])
  })

  it('records an administrator\'s visit when it starts and when it stops, by the administrator', async () => {
    const { flow, trail } = await flowWithAudit()
    const ada = await flow.signedIn('ada@example.com')
    const admin = await flow.signedIn('root@example.com', { role: 'admin' })
    const visit = await flow.post('/admin/impersonate-user', { userId: ada.userId }, { cookie: admin.cookie })
    const { session } = await json<{ session: { id: string, token: string } }>(visit)
    expect(trail.of('admin.impersonation_started')).toEqual([{ type: 'admin.impersonation_started', actor: { userId: admin.userId }, subjectId: ada.userId, targetId: session.id }])
    // The visit is no sign-in of Ada's.
    expect(trail.of('auth.signed_in').filter(event => (event.actor as { userId: string }).userId === ada.userId)).toHaveLength(1)

    const visiting = cookiesOf(visit)
    await json(await flow.post('/admin/stop-impersonating', {}, { cookie: visiting }))
    expect(trail.of('admin.impersonation_stopped')).toEqual([{ type: 'admin.impersonation_stopped', actor: { userId: admin.userId }, subjectId: ada.userId, targetId: session.id }])
  })
})

describe('the account', () => {
  it('records a passkey removed, by its id', async () => {
    const { flow, trail } = await flowWithAudit()
    const ada = await flow.signedIn('ada@example.com')
    flow.db.passkey!.push({ id: 'pk_1', userId: ada.userId, publicKey: 'key', credentialID: 'cred', counter: 0, deviceType: 'singleDevice', backedUp: false, createdAt: new Date() })
    await json(await flow.post('/passkey/delete-passkey', { id: 'pk_1' }, { cookie: ada.cookie }))
    expect(trail.of('auth.passkey_removed')).toEqual([{ type: 'auth.passkey_removed', actor: { userId: ada.userId }, targetId: 'pk_1' }])
  })

  it('records a passkey saved, by the id the route answers with, and nothing when the ceremony failed', async () => {
    // The registration's WebAuthn ceremony needs an authenticator, so its after-hook runs here as Better Auth hands it over.
    const trail = recorder()
    const runtime = { ctx: { runMutation: vi.fn() }, audit: trail.audit } as never
    const session = { user: { id: 'user_ada' }, session: { impersonatedBy: null } }
    await recordRouteEvent(runtime, { path: '/passkey/verify-registration', body: {}, context: { session, returned: { id: 'pk_new', name: 'Laptop' } } } as never)
    await recordRouteEvent(runtime, { path: '/passkey/verify-registration', body: {}, context: { session, returned: new Error('ceremony failed') } } as never)
    expect(trail.events).toEqual([{ type: 'auth.passkey_added', actor: { userId: 'user_ada' }, targetId: 'pk_new' }])
  })

  it('records an email change once it went through, with neither address', async () => {
    const { flow, trail } = await flowWithAudit()
    const ada = await flow.signedIn('ada@old.example')
    await json(await flow.post('/email-otp/send-verification-otp', { email: 'ada@old.example', type: 'email-verification' }, { cookie: ada.cookie }))
    await json(await flow.post('/email-otp/request-email-change', { newEmail: 'ada@new.example', otp: flow.codeFor('ada@old.example', 'email-verification') }, { cookie: ada.cookie }))
    expect(trail.of('auth.email_changed')).toEqual([])
    await json(await flow.post('/email-otp/change-email', { newEmail: 'ada@new.example', otp: flow.codeFor('ada@new.example', 'change-email') }, { cookie: ada.cookie }))
    expect(trail.of('auth.email_changed')).toEqual([{ type: 'auth.email_changed', actor: { userId: ada.userId } }])
    expect(JSON.stringify(trail.events)).not.toContain('example')
  })

  it('leaves the account\'s part of the trail to its erasure, which the account instance runs, when an administrator removes it', async () => {
    const trail = recorder(false)
    const forget = vi.fn(async () => ({ deleted: [], left: [] }))
    const flow = await authFlow({ runtime: { audit: trail.audit as never, account: { forget, soleOwnerships: async () => [] } } })
    const ada = await flow.signedIn('ada@example.com')
    const admin = await flow.signedIn('root@example.com', { role: 'admin' })
    await json(await flow.post('/admin/remove-user', { userId: ada.userId }, { cookie: admin.cookie }))
    expect(forget).toHaveBeenCalledWith(expect.anything(), { userId: ada.userId, email: 'ada@example.com' })
    expect(trail.audit.forgetSubject).not.toHaveBeenCalled()
  })
})

describe('workspaces', () => {
  it('records a workspace created, an invitation sent and accepted, a role changed and a member removed', async () => {
    const { flow, trail } = await flowWithAudit()
    const grace = await flow.signedIn('grace@example.com')
    const ada = await flow.signedIn('ada@example.com')
    const workspace = await json<{ id: string }>(await flow.post('/organization/create', { name: 'Acme', slug: 'acme' }, { cookie: grace.cookie }))
    expect(trail.of('workspace.created')).toEqual([{ type: 'workspace.created', actor: { userId: grace.userId }, entityId: workspace.id }])

    const invitation = await json<{ id: string }>(await flow.post('/organization/invite-member', { email: 'ada@example.com', role: 'member', organizationId: workspace.id }, { cookie: grace.cookie }))
    expect(trail.of('workspace.member_invited')).toEqual([{ type: 'workspace.member_invited', actor: { userId: grace.userId }, entityId: workspace.id, targetId: invitation.id, data: { role: 'member' } }])

    const { member } = await json<{ member: { id: string } }>(await flow.post('/organization/accept-invitation', { invitationId: invitation.id }, { cookie: ada.cookie }))
    expect(trail.of('workspace.invitation_accepted')).toEqual([{ type: 'workspace.invitation_accepted', actor: { userId: ada.userId }, entityId: workspace.id, targetId: invitation.id, data: { role: 'member' } }])

    await json(await flow.post('/organization/update-member-role', { memberId: member.id, role: 'admin', organizationId: workspace.id }, { cookie: grace.cookie }))
    // The role it already holds: a no-op records nothing.
    await json(await flow.post('/organization/update-member-role', { memberId: member.id, role: 'admin', organizationId: workspace.id }, { cookie: grace.cookie }))
    expect(trail.of('workspace.member_role_changed')).toEqual([{ type: 'workspace.member_role_changed', actor: { userId: grace.userId }, subjectId: ada.userId, entityId: workspace.id, targetId: member.id, data: { role: 'admin' } }])

    await json(await flow.post('/organization/remove-member', { memberIdOrEmail: member.id, organizationId: workspace.id }, { cookie: grace.cookie }))
    expect(trail.of('workspace.member_removed')).toEqual([{ type: 'workspace.member_removed', actor: { userId: grace.userId }, subjectId: ada.userId, entityId: workspace.id, targetId: member.id }])
    // No address anywhere: the invitee is the invitation's id.
    expect(JSON.stringify(trail.events)).not.toContain('@')
  })

  it('records nothing for a route that refused', async () => {
    const { flow, trail } = await flowWithAudit()
    const grace = await flow.signedIn('grace@example.com')
    const stranger = await flow.signedIn('mallory@example.com')
    const workspace = await json<{ id: string }>(await flow.post('/organization/create', { name: 'Acme', slug: 'acme' }, { cookie: grace.cookie }))
    const refused = await flow.post('/organization/invite-member', { email: 'eve@example.com', role: 'member', organizationId: workspace.id }, { cookie: stranger.cookie })
    expect(refused.status).toBeGreaterThanOrEqual(400)
    expect(trail.of('workspace.member_invited')).toEqual([])
  })
})

describe('administration', () => {
  it('records an app-wide role change by the administrator, and nothing for the role already held', async () => {
    const { flow, trail } = await flowWithAudit()
    const ada = await flow.signedIn('ada@example.com')
    const admin = await flow.signedIn('root@example.com', { role: 'admin' })
    await json(await flow.post('/admin/set-role', { userId: ada.userId, role: 'admin' }, { cookie: admin.cookie }))
    await json(await flow.post('/admin/set-role', { userId: ada.userId, role: 'admin' }, { cookie: admin.cookie }))
    expect(trail.of('admin.role_changed')).toEqual([{ type: 'admin.role_changed', actor: { userId: admin.userId }, subjectId: ada.userId, data: { role: 'admin' } }])
  })

  it('reads the same roles in another order as the role already held', async () => {
    const { flow, trail } = await flowWithAudit()
    const ada = await flow.signedIn('ada@example.com')
    const admin = await flow.signedIn('root@example.com', { role: 'admin' })
    await json(await flow.post('/admin/set-role', { userId: ada.userId, role: ['user', 'admin'] }, { cookie: admin.cookie }))
    await json(await flow.post('/admin/set-role', { userId: ada.userId, role: ['admin', 'user'] }, { cookie: admin.cookie }))
    expect(trail.of('admin.role_changed')).toEqual([{ type: 'admin.role_changed', actor: { userId: admin.userId }, subjectId: ada.userId, data: { role: 'admin,user' } }])
  })

  it('names no account as the administrator when the admin route carries no session, and records nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const trail = recorder()
    const hooks = auditDatabaseHooks({ ctx: { runMutation: vi.fn() }, audit: trail.audit } as never, () => false)!
    await hooks.session!.delete!.after!({ id: 's1', userId: 'user_ada' } as never, { path: '/admin/revoke-user-session', context: {} } as never)
    expect(trail.events).toEqual([])
    expect(warn.mock.calls.flat().join(' ')).toContain('audit.record_failed')
  })
})

describe('a trail that fails', () => {
  it('never fails a route over what its event needs from before it runs', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ctx = {
      path: '/organization/update-member-role',
      body: { memberId: 'm1', role: 'admin' },
      headers: new Headers(),
      context: { adapter: { findOne: async () => { throw new Error('the adapter is down') } } },
    }
    await expect(noteRouteBefore(ctx as never)).resolves.toBeUndefined()
    expect(warn.mock.calls.flat().join(' ')).toContain('audit.record_failed')
  })

  it('never fails what it records: the route answers, and the failure is logged', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { flow } = await flowWithAudit(true)
    const grace = await flow.signedIn('grace@example.com')
    const answer = await flow.post('/organization/create', { name: 'Acme', slug: 'acme' }, { cookie: grace.cookie })
    expect(answer.status).toBe(200)
    expect(warn.mock.calls.flat().join(' ')).toContain('audit.record_failed')
    expect(warn.mock.calls.flat().join(' ')).not.toContain('grace')
  })
})
