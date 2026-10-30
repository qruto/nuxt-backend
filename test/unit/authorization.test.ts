import { describe, expect, it, vi } from 'vitest'
import { type AuthorizationCtx, createAuthorization, defineSetUserRole } from '../../src/convex/integrations/authorization'
import { getBackendError } from '../../src/convex/errors'

const component = { backend: { adapter: { findOne: {} as never, updateOne: {} as never } } }

type Identity = Record<string, unknown> | null

function fakeCtx(identity: Identity, rowsByModel: Record<string, unknown> = {}): AuthorizationCtx {
  return {
    auth: { getUserIdentity: vi.fn(async () => identity) },
    runQuery: vi.fn(async (_reference: unknown, args: { model: string }) => rowsByModel[args.model] ?? null),
  } as unknown as AuthorizationCtx
}

const signedIn = {
  subject: 'user-1',
  email: 'ada@example.com',
  name: 'Ada',
  role: 'admin',
  activeOrganizationId: 'org-1',
}

describe('getUser', () => {
  const authorization = createAuthorization(component)

  it('returns null when signed out', async () => {
    expect(await authorization.getUser(fakeCtx(null))).toBeNull()
  })

  it('maps identity claims, defaulting the role to "user"', async () => {
    const user = await authorization.getUser(fakeCtx({ subject: 'user-2', email: 'g@x.co', name: 'G' }))
    expect(user).toMatchObject({ id: 'user-2', email: 'g@x.co', name: 'G', role: 'user', banned: false, activeWorkspaceId: null })
  })

  it('surfaces role, ban state, and the active workspace', async () => {
    const user = await authorization.getUser(fakeCtx({ ...signedIn, banned: true }))
    expect(user).toMatchObject({ role: 'admin', banned: true, activeWorkspaceId: 'org-1' })
  })
})

describe('requireUser', () => {
  const authorization = createAuthorization(component)

  it('throws Unauthenticated when signed out', async () => {
    await expect(authorization.requireUser(fakeCtx(null))).rejects.toThrow(/Unauthenticated/)
  })

  it('rejects banned users', async () => {
    await expect(authorization.requireUser(fakeCtx({ ...signedIn, banned: true }))).rejects.toThrow(/banned/)
  })

  it('returns the user otherwise', async () => {
    expect((await authorization.requireUser(fakeCtx(signedIn))).id).toBe('user-1')
  })

  it('refuses an impersonated session where the rule says, and lets it through otherwise', async () => {
    const impersonated = fakeCtx({ ...signedIn, impersonatedBy: 'admin-2' })
    const refusal = (promise: Promise<unknown>) => promise.catch((error: unknown) => getBackendError(error))

    expect(await refusal(authorization.requireUser(impersonated, { impersonation: 'refused' }))).toMatchObject({ code: 'forbidden', data: { reason: 'impersonating' } })
    expect(await refusal(authorization.requireRole(impersonated, 'admin', { impersonation: 'refused' }))).toMatchObject({ data: { reason: 'impersonating' } })
    expect(await authorization.requireUser(impersonated)).toMatchObject({ impersonatedBy: 'admin-2' })
  })

  it('refuses an impersonated session on any rule but an explicit allowed: a misspelt rule fails closed', async () => {
    const impersonated = fakeCtx({ ...signedIn, impersonatedBy: 'admin-2' })
    await expect(authorization.requireUser(impersonated, { impersonation: 'nope' } as never)).rejects.toMatchObject({ data: { code: 'forbidden', reason: 'impersonating' } })
    expect(await authorization.requireUser(impersonated, { impersonation: 'allowed' })).toMatchObject({ impersonatedBy: 'admin-2' })
  })

  it('reads the account fresh when asked: a ban or a deletion since the token lands at once', async () => {
    await expect(authorization.requireUser(fakeCtx(signedIn, { user: { role: 'admin', banned: true } }), { fresh: true })).rejects.toThrow(/banned/)
    await expect(authorization.requireUser(fakeCtx(signedIn, {}), { fresh: true })).rejects.toMatchObject({ data: { code: 'unauthenticated' } })
    await expect(authorization.requireMember(fakeCtx(signedIn, { member: { role: 'owner' }, user: { banned: true } }), { fresh: true })).rejects.toThrow(/banned/)
    // The token's claims, without it.
    expect(await authorization.requireUser(fakeCtx(signedIn, {}))).toMatchObject({ id: 'user-1' })
  })
})

describe('requireRole', () => {
  const authorization = createAuthorization(component)

  it('passes on a claims role match (no db read)', async () => {
    const ctx = fakeCtx(signedIn)
    await authorization.requireRole(ctx, 'admin')
    expect(ctx.runQuery).not.toHaveBeenCalled()
  })

  it('throws on a role mismatch', async () => {
    await expect(authorization.requireRole(fakeCtx({ ...signedIn, role: 'user' }), 'admin')).rejects.toThrow(/role/)
  })

  it('accepts any of several roles and comma-separated user roles', async () => {
    await authorization.requireRole(fakeCtx({ ...signedIn, role: 'support,editor' }), ['admin', 'editor'])
  })

  it('re-reads the user document with fresh: true', async () => {
    // Claims say admin, the database says demoted.
    const ctx = fakeCtx(signedIn, { user: { role: 'user' } })
    await expect(authorization.requireRole(ctx, 'admin', { fresh: true })).rejects.toThrow(/role/)
    expect(ctx.runQuery).toHaveBeenCalledOnce()
  })

  it('fresh check rejects a freshly banned user', async () => {
    const ctx = fakeCtx(signedIn, { user: { role: 'admin', banned: true } })
    await expect(authorization.requireRole(ctx, 'admin', { fresh: true })).rejects.toThrow(/banned/)
  })
})

describe('requireWorkspace / requireMember', () => {
  const authorization = createAuthorization(component)

  it('returns the active workspace, read fresh: a removed member is refused whatever the token says', async () => {
    const { workspace } = await authorization.requireWorkspace(fakeCtx(signedIn, { member: { role: 'member' }, organization: { slug: 'acme', name: 'Acme' } }))
    expect(workspace).toStrictEqual({ id: 'org-1', slug: 'acme', name: 'Acme', role: 'member' })
    const removed = fakeCtx(signedIn, {})
    await expect(authorization.requireWorkspace(removed)).rejects.toMatchObject({ data: { code: 'forbidden', reason: 'not_member' } })
    expect(removed.runQuery).toHaveBeenCalledWith(expect.anything(), { model: 'member', where: [{ field: 'organizationId', value: 'org-1' }, { field: 'userId', value: 'user-1' }] })
  })

  it('throws without an active workspace', async () => {
    await expect(authorization.requireWorkspace(fakeCtx({ ...signedIn, activeOrganizationId: undefined })))
      .rejects.toMatchObject({ data: { code: 'no_workspace' } })
  })

  it('requireMember reads the member row fresh', async () => {
    const ctx = fakeCtx(signedIn, { member: { role: 'owner' } })
    const member = await authorization.requireMember(ctx)
    expect(member).toMatchObject({ workspaceId: 'org-1', role: 'owner' })
    expect(ctx.runQuery).toHaveBeenCalledOnce()
  })

  it('reads once per call, and again with reread', async () => {
    const rows: Record<string, unknown> = { member: { role: 'owner' } }
    const ctx = fakeCtx(signedIn, rows)
    await authorization.requireMember(ctx)
    // The call removes the member, then checks again.
    delete rows.member
    expect(await authorization.requireMember(ctx)).toMatchObject({ role: 'owner' })
    expect(ctx.runQuery).toHaveBeenCalledOnce()
    await expect(authorization.requireMember(ctx, { reread: true })).rejects.toThrow(/not a member/)
    expect(ctx.runQuery).toHaveBeenCalledTimes(2)
  })

  it('requireMember rejects non-members and insufficient workspace roles', async () => {
    await expect(authorization.requireMember(fakeCtx(signedIn, {}))).rejects.toThrow(/not a member/)
    await expect(authorization.requireMember(fakeCtx(signedIn, { member: { role: 'member' } }), { role: 'owner' }))
      .rejects.toThrow(/workspace role/)
  })
})

describe('setUserRole', () => {
  const handlerOf = (registered: unknown) => (registered as { _handler: (ctx: unknown, args: { email: string, role: string }) => Promise<null> })._handler

  it('registers an internal mutation that updates the role by email', async () => {
    const setUserRole = defineSetUserRole(component)
    expect(setUserRole.isInternal).toBe(true)
    const definition = { handler: handlerOf(setUserRole) }
    const runQuery = vi.fn(async () => ({ _id: 'user-1' }))
    const runMutation = vi.fn(async () => null)
    await definition.handler({ runQuery, runMutation }, { email: 'ada@example.com', role: 'admin' })
    expect(runMutation).toHaveBeenCalledWith(expect.anything(), {
      input: { model: 'user', update: { role: 'admin' }, where: [{ field: 'email', value: 'ada@example.com' }] },
    })
  })

  it('throws when no user matches the email', async () => {
    const definition = { handler: handlerOf(defineSetUserRole(component)) }
    const runQuery = vi.fn(async () => null)
    await expect(definition.handler({ runQuery, runMutation: vi.fn() }, { email: 'x@x.co', role: 'admin' }))
      .rejects.toThrow(/No user/)
  })
})

describe('requireRecentSignIn', () => {
  const authorization = createAuthorization(component)
  const now = Date.now()
  const session = { ...signedIn, sessionId: 'session-1' }
  const refusal = (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => getBackendError(error))

  it('passes a sign-in from the last ten minutes, and surfaces when it was', async () => {
    const user = await authorization.requireRecentSignIn(fakeCtx({ ...session, authTime: now - 9 * 60_000 }))
    expect(user).toMatchObject({ id: 'user-1', authTime: now - 9 * 60_000 })
  })

  it('refuses an older one, or one inside a shorter window it was given, as reauthentication_required', async () => {
    expect(await refusal(authorization.requireRecentSignIn(fakeCtx({ ...session, authTime: now - 11 * 60_000 })))).toMatchObject({ code: 'reauthentication_required' })
    expect(await refusal(authorization.requireRecentSignIn(fakeCtx({ ...session, authTime: now - 2 * 60_000 }), { within: 60 }))).toMatchObject({ code: 'reauthentication_required' })
    expect(await authorization.requireRecentSignIn(fakeCtx({ ...session, authTime: now - 2 * 60_000 }), { within: 300 })).toMatchObject({ id: 'user-1' })
  })

  it('fails closed: no session, no sign-in time, an administrator\'s visit', async () => {
    const { sessionId: _sessionId, ...noSession } = { ...session, authTime: now }
    expect(await refusal(authorization.requireRecentSignIn(fakeCtx(noSession)))).toMatchObject({ code: 'reauthentication_required' })
    expect(await refusal(authorization.requireRecentSignIn(fakeCtx(session)))).toMatchObject({ code: 'reauthentication_required' })
    expect(await refusal(authorization.requireRecentSignIn(fakeCtx({ ...session, authTime: now, impersonatedBy: 'admin-2' })))).toMatchObject({ code: 'forbidden', data: { reason: 'impersonating' } })
    expect(await refusal(authorization.requireRecentSignIn(fakeCtx(null)))).toMatchObject({ code: 'unauthenticated' })
  })

  it('reads the account fresh when asked, so one banned since the sign-in is refused', async () => {
    const recent = { ...session, authTime: now }
    expect(await refusal(authorization.requireRecentSignIn(fakeCtx(recent, { user: { role: 'admin', banned: true } }), { fresh: true }))).toMatchObject({ code: 'forbidden', data: { reason: 'banned' } })
  })

  it('takes a window of seconds above zero', async () => {
    await expect(authorization.requireRecentSignIn(fakeCtx({ ...session, authTime: now }), { within: 0 })).rejects.toThrow(TypeError)
  })

  it('is never a query\'s, which is not rerun as time passes: from one it throws, as a recentSignIn rule does', async () => {
    const recent = { ...session, authTime: now }
    // A query's ctx reads the database and can write nothing.
    const inQuery = { ...fakeCtx(recent), db: { get: vi.fn(), query: vi.fn() } }
    await expect(authorization.requireRecentSignIn(inQuery)).rejects.toThrow(TypeError)
    await expect(authorization.requireUser(inQuery, { recentSignIn: 600 })).rejects.toThrow(TypeError)
    await expect(authorization.requireRole(inQuery, 'admin', { recentSignIn: 600 })).rejects.toThrow(TypeError)
    // Without one, a query checks as it always did; a mutation's ctx asks.
    expect(await authorization.requireUser(inQuery)).toMatchObject({ id: 'user-1' })
    const inMutation = { ...fakeCtx(recent), db: { get: vi.fn(), insert: vi.fn() } }
    expect(await authorization.requireRecentSignIn(inMutation)).toMatchObject({ id: 'user-1' })
  })
})
