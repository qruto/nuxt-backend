import { describe, expect, it, vi } from 'vitest'
import { setupAuthorization, type AuthorizationCtx } from '../../src/convex/integrations/authorization'

const component = { adapter: { findOne: {} as never, updateOne: {} as never } }

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
  const authorization = setupAuthorization(component)

  it('returns null when signed out', async () => {
    expect(await authorization.getUser(fakeCtx(null))).toBeNull()
  })

  it('maps identity claims, defaulting the role to "user"', async () => {
    const user = await authorization.getUser(fakeCtx({ subject: 'user-2', email: 'g@x.co', name: 'G' }))
    expect(user).toMatchObject({ id: 'user-2', email: 'g@x.co', name: 'G', role: 'user', banned: false, activeOrganizationId: null })
  })

  it('surfaces role, ban state, and the active workspace', async () => {
    const user = await authorization.getUser(fakeCtx({ ...signedIn, banned: true }))
    expect(user).toMatchObject({ role: 'admin', banned: true, activeOrganizationId: 'org-1' })
  })
})

describe('requireUser', () => {
  const authorization = setupAuthorization(component)

  it('throws Unauthenticated when signed out', async () => {
    await expect(authorization.requireUser(fakeCtx(null))).rejects.toThrow(/Unauthenticated/)
  })

  it('rejects banned users', async () => {
    await expect(authorization.requireUser(fakeCtx({ ...signedIn, banned: true }))).rejects.toThrow(/banned/)
  })

  it('returns the user otherwise', async () => {
    expect((await authorization.requireUser(fakeCtx(signedIn))).id).toBe('user-1')
  })
})

describe('requireRole', () => {
  const authorization = setupAuthorization(component)

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

describe('requirePermission', () => {
  const authorization = setupAuthorization(component)

  it('grants admin-plugin default permissions to admins', async () => {
    const user = await authorization.requirePermission(fakeCtx(signedIn), { user: ['ban'] })
    expect(user.role).toBe('admin')
  })

  it('denies regular users', async () => {
    await expect(authorization.requirePermission(fakeCtx({ ...signedIn, role: 'user' }), { user: ['ban'] }))
      .rejects.toThrow(/permission/)
  })

  it('checks custom statement roles', async () => {
    const custom = setupAuthorization(component, {
      roles: { auditor: { authorize: perms => ({ success: 'logs' in perms }) } },
    })
    await custom.requirePermission(fakeCtx({ ...signedIn, role: 'auditor' }), { logs: ['read'] })
    await expect(custom.requirePermission(fakeCtx({ ...signedIn, role: 'auditor' }), { user: ['ban'] }))
      .rejects.toThrow(/permission/)
  })
})

describe('requireOrganization / requireMember', () => {
  const authorization = setupAuthorization(component)

  it('returns the active workspace id', async () => {
    const { organizationId } = await authorization.requireOrganization(fakeCtx(signedIn))
    expect(organizationId).toBe('org-1')
  })

  it('throws without an active workspace', async () => {
    await expect(authorization.requireOrganization(fakeCtx({ ...signedIn, activeOrganizationId: undefined })))
      .rejects.toThrow(/active organization/)
  })

  it('requireMember reads the member row fresh', async () => {
    const ctx = fakeCtx(signedIn, { member: { role: 'owner' } })
    const member = await authorization.requireMember(ctx)
    expect(member).toMatchObject({ organizationId: 'org-1', role: 'owner' })
    expect(ctx.runQuery).toHaveBeenCalledOnce()
  })

  it('requireMember rejects non-members and insufficient workspace roles', async () => {
    await expect(authorization.requireMember(fakeCtx(signedIn, {}))).rejects.toThrow(/not a member/)
    await expect(authorization.requireMember(fakeCtx(signedIn, { member: { role: 'member' } }), { role: 'owner' }))
      .rejects.toThrow(/workspace role/)
  })
})

describe('setUserRole', () => {
  it('is absent without an internalMutation builder', () => {
    expect(setupAuthorization(component).setUserRole).toBeUndefined()
  })

  it('registers a mutation that updates the role by email', async () => {
    const builder = vi.fn(definition => definition)
    const authorization = setupAuthorization(component, { internalMutation: builder as never })
    expect(builder).toHaveBeenCalledOnce()

    const definition = authorization.setUserRole as unknown as { handler: (ctx: unknown, args: { email: string, role: string }) => Promise<null> }
    const runQuery = vi.fn(async () => ({ _id: 'user-1' }))
    const runMutation = vi.fn(async () => null)
    await definition.handler({ runQuery, runMutation }, { email: 'ada@example.com', role: 'admin' })
    expect(runMutation).toHaveBeenCalledWith(expect.anything(), {
      input: { model: 'user', update: { role: 'admin' }, where: [{ field: 'email', value: 'ada@example.com' }] },
    })
  })

  it('throws when no user matches the email', async () => {
    const builder = vi.fn(definition => definition)
    const authorization = setupAuthorization(component, { internalMutation: builder as never })
    const definition = authorization.setUserRole as unknown as { handler: (ctx: unknown, args: { email: string, role: string }) => Promise<null> }
    const runQuery = vi.fn(async () => null)
    await expect(definition.handler({ runQuery, runMutation: vi.fn() }, { email: 'x@x.co', role: 'admin' }))
      .rejects.toThrow(/No user/)
  })
})
