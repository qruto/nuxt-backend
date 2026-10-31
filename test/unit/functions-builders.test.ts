import { describe, expect, it, vi } from 'vitest'
import { createFunctions } from '../../src/convex/integrations/functions'
import { backendError, getBackendError } from '../../src/convex/errors'

const component = { backend: { adapter: { findOne: {} as never, updateOne: {} as never } } }
const components = component

/** Fake `_generated/server` builders: capture the composed definition. */
function fakeBuilders() {
  const builder = vi.fn((definition: { handler: (ctx: unknown, args: unknown) => unknown }) => definition)
  return { query: builder as never, mutation: builder as never, action: builder as never }
}

function ctxWith(claims: Record<string, unknown> | null, rowsByModel: Record<string, unknown> = {}) {
  return {
    auth: { getUserIdentity: vi.fn(async () => claims) },
    runQuery: vi.fn(async (_reference: unknown, args: { model: string }) => rowsByModel[args.model] ?? null),
  }
}

const claims = { subject: 'user-1', email: 'a@b.co', name: 'Ada', role: 'admin', activeOrganizationId: 'org-1' }

/** Define a function through a tier builder and invoke its composed handler. */
async function invoke(
  tierBuilder: { query: unknown },
  kind: 'query' | 'mutation' | 'action',
  ctx: unknown,
  handler: (ctx: never, args: never) => unknown,
  extra: { recentSignIn?: boolean | number, impersonation?: string } = {},
): Promise<unknown> {
  const define = (tierBuilder as Record<string, (definition: unknown) => { handler: (ctx: unknown, args: unknown) => unknown }>)[kind]!
  const defined = define({ args: {}, handler, ...extra })
  return defined.handler(ctx, {})
}

describe('createFunctions tiers', () => {
  it('authed injects ctx.user and rejects signed-out callers', async () => {
    const { authed } = createFunctions(fakeBuilders(), { components })

    const seen = await invoke(authed, 'query', ctxWith(claims), ctx => (ctx as { user: { id: string } }).user.id)
    expect(seen).toBe('user-1')

    await expect(invoke(authed, 'query', ctxWith(null), () => 'unreachable')).rejects.toThrow(/Unauthenticated/)
  })

  it('workspace injects ctx.workspace from a fresh membership read', async () => {
    const { workspace } = createFunctions(fakeBuilders(), { components })
    const ctx = ctxWith(claims, { member: { role: 'owner' }, organization: { slug: 'acme', name: 'Acme' } })

    const seen = await invoke(workspace, 'query', ctx, c =>
      (c as { workspace: { id: string, role: string } }).workspace)
    expect(seen).toStrictEqual({ id: 'org-1', slug: 'acme', name: 'Acme', role: 'owner' })
    expect(ctx.runQuery).toHaveBeenCalledTimes(2)

    await expect(invoke(workspace, 'query', ctxWith(claims, {}), () => 'unreachable')).rejects.toThrow(/not a member/)
    // A membership of a workspace deleted since is no membership.
    await expect(invoke(workspace, 'query', ctxWith(claims, { member: { role: 'owner' } }), () => 'unreachable')).rejects.toThrow(/not a member/)
  })

  it('admin honors adminRoles; withRole builds custom tiers', async () => {
    const { admin, withRole } = createFunctions(fakeBuilders(), { components, adminRoles: ['owner'] })

    await expect(invoke(admin, 'query', ctxWith(claims, { user: { role: 'admin' } }), () => 'x')).rejects.toThrow(/role/)
    await invoke(admin, 'query', ctxWith({ ...claims, role: 'owner' }, { user: { role: 'owner' } }), () => 'ok')

    const editors = withRole('editor')
    await invoke(editors, 'query', ctxWith({ ...claims, role: 'editor' }), () => 'ok')
    await expect(invoke(editors, 'query', ctxWith(claims), () => 'x')).rejects.toThrow(/role/)
  })

  it('admin reads the role fresh: a demoted admin is refused, a promoted one admitted', async () => {
    const { admin } = createFunctions(fakeBuilders(), { components })
    const demoted = ctxWith(claims, { user: { role: 'user' } })

    await expect(invoke(admin, 'query', demoted, () => 'x')).rejects.toThrow(/role/)
    expect(demoted.runQuery).toHaveBeenCalledWith(expect.anything(), { model: 'user', where: [{ field: '_id', value: 'user-1' }] })
    expect(await invoke(admin, 'query', ctxWith({ ...claims, role: 'user' }, { user: { role: 'admin' } }), () => 'ok')).toBe('ok')
  })

  it('admin writes refuse an impersonated session; admin reads let it through', async () => {
    const { admin } = createFunctions(fakeBuilders(), { components })
    const fresh = { user: { role: 'admin' } }
    const impersonated = { ...claims, impersonatedBy: 'admin-2' }
    for (const kind of ['mutation', 'action'] as const) {
      const refusal = await invoke(admin, kind, ctxWith(impersonated, fresh), () => 'x').catch((error: unknown) => error)
      expect(getBackendError(refusal)).toMatchObject({ code: 'forbidden', data: { reason: 'impersonating' } })
    }
    expect(await invoke(admin, 'query', ctxWith(impersonated, fresh), () => 'read')).toBe('read')
  })

  describe('a recent sign-in', () => {
    const now = Date.now()
    const recent = { ...claims, sessionId: 'session-1', authTime: now - 60_000 }
    const old = { ...claims, sessionId: 'session-1', authTime: now - 11 * 60_000 }
    const rows = { user: { role: 'admin' }, member: { role: 'owner' }, organization: { slug: 'acme', name: 'Acme' } }
    const refusal = (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => getBackendError(error))

    it('is what an admin write takes by default, and a read never', async () => {
      const { admin } = createFunctions(fakeBuilders(), { components })
      for (const kind of ['mutation', 'action'] as const) {
        expect(await invoke(admin, kind, ctxWith(recent, rows), () => 'ran'), kind).toBe('ran')
        expect(await refusal(invoke(admin, kind, ctxWith(old, rows), () => 'x')), kind).toMatchObject({ code: 'reauthentication_required' })
        // A token from before the claim existed names no sign-in time: refused, fail closed.
        expect(await refusal(invoke(admin, kind, ctxWith({ ...claims, sessionId: 'session-1' }, rows), () => 'x')), kind).toMatchObject({ code: 'reauthentication_required' })
        expect(await invoke(admin, kind, ctxWith(old, rows), () => 'routine', { recentSignIn: false }), kind).toBe('routine')
      }
      expect(await invoke(admin, 'query', ctxWith(old, rows), () => 'read')).toBe('read')
    })

    it('is what any tier\'s function takes when it says so, in its own window', async () => {
      const { authed, workspace, withRole } = createFunctions(fakeBuilders(), { components })
      for (const tier of [authed, workspace, withRole('admin')]) {
        expect(await invoke(tier, 'mutation', ctxWith(old, rows), () => 'ran'), 'nothing said').toBe('ran')
        expect(await refusal(invoke(tier, 'mutation', ctxWith(old, rows), () => 'x', { recentSignIn: true }))).toMatchObject({ code: 'reauthentication_required' })
        expect(await invoke(tier, 'mutation', ctxWith(recent, rows), () => 'ran', { recentSignIn: true })).toBe('ran')
        // Thirty seconds: a sign-in a minute old is too old.
        expect(await refusal(invoke(tier, 'mutation', ctxWith(recent, rows), () => 'x', { recentSignIn: 30 }))).toMatchObject({ code: 'reauthentication_required' })
      }
    })

    it('never passes an administrator acting as the account, or a token with no session', async () => {
      const { authed } = createFunctions(fakeBuilders(), { components })
      const visit = { ...recent, impersonatedBy: 'admin-2' }
      expect(await refusal(invoke(authed, 'mutation', ctxWith(visit, rows), () => 'x', { recentSignIn: true }))).toMatchObject({ code: 'forbidden', data: { reason: 'impersonating' } })
      const { sessionId: _sessionId, ...sessionless } = recent
      expect(await refusal(invoke(authed, 'mutation', ctxWith(sessionless, rows), () => 'x', { recentSignIn: true }))).toMatchObject({ code: 'reauthentication_required' })
    })

    it('is asked last: someone who may not act at all is told so, never asked to sign in again first', async () => {
      const { admin, workspace } = createFunctions(fakeBuilders(), { components })
      const plain = { ...old, role: 'user' }
      expect(await refusal(invoke(admin, 'mutation', ctxWith(plain, { user: { role: 'user' } }), () => 'x'))).toMatchObject({ code: 'forbidden', data: { reason: 'role' } })
      expect(await refusal(invoke(workspace, 'mutation', ctxWith(old, { user: { role: 'admin' } }), () => 'x', { recentSignIn: true }))).toMatchObject({ code: 'forbidden', data: { reason: 'not_member' } })
    })

    it('refuses a window that is no number of seconds, when the function is defined', () => {
      const { authed } = createFunctions(fakeBuilders(), { components })
      const define = authed.mutation as unknown as (definition: unknown) => unknown
      expect(() => define({ args: {}, recentSignIn: 0, handler: () => null })).toThrow(TypeError)
    })

    it('is never a query\'s, which is not rerun as time passes: defining one that asks throws', async () => {
      const { authed, admin } = createFunctions(fakeBuilders(), { components })
      for (const tier of [authed, admin]) {
        const define = tier.query as unknown as (definition: unknown) => unknown
        expect(() => define({ args: {}, recentSignIn: true, handler: () => null })).toThrow(TypeError)
        expect(() => define({ args: {}, recentSignIn: 60, handler: () => null })).toThrow(TypeError)
      }
      // `false` asks nothing, of a query as of a write.
      expect(await invoke(authed, 'query', ctxWith(old, rows), () => 'read', { recentSignIn: false })).toBe('read')
    })
  })

  it('reads the account fresh on every tier\'s writes, so a ban lands at once; reads use the token\'s claims', async () => {
    const { authed, workspace, withRole } = createFunctions(fakeBuilders(), { components })
    const banned = { user: { role: 'admin,editor', banned: true }, member: { role: 'owner' }, organization: { slug: 'acme', name: 'Acme' } }
    for (const tier of [authed, workspace, withRole('editor')]) {
      for (const kind of ['mutation', 'action'] as const) {
        await expect(invoke(tier, kind, ctxWith({ ...claims, role: 'admin,editor' }, banned), () => 'x'), kind).rejects.toThrow(/banned/)
      }
      expect(await invoke(tier, 'query', ctxWith({ ...claims, role: 'admin,editor' }, banned), () => 'read')).toBe('read')
    }
  })

  it('consumes the tier rate limit on mutations, keyed by user', async () => {
    const limit = vi.fn(async () => ({ ok: true }))
    const { authed } = createFunctions(fakeBuilders(), {
      components,
      rateLimiter: { limit } as never,
      limits: { authed: 'apiWrites' },
    })

    await invoke(authed as never, 'mutation' as never, ctxWith(claims, { user: { role: 'admin' } }), () => 'done')
    expect(limit).toHaveBeenCalledWith(expect.anything(), 'apiWrites', { key: 'user-1', throws: true })

    // Queries never consume a limit.
    limit.mockClear()
    await invoke(authed, 'query', ctxWith(claims), () => 'read')
    expect(limit).not.toHaveBeenCalled()
  })
})

describe('one createFunctions call', () => {
  it('takes the generated components, and says so when they are missing', () => {
    expect(() => createFunctions(fakeBuilders(), {} as never)).toThrow(/takes your generated components/)
  })

  it('returns setUserRole, an internal mutation, beside the tiers', () => {
    const { setUserRole } = createFunctions(fakeBuilders(), { components })
    expect(setUserRole.isInternal).toBe(true)
    expect(setUserRole.isMutation).toBe(true)
  })

  it('refuses an administrator\'s visit on a function that declares impersonation: refused, in every kind', async () => {
    const { authed, workspace } = createFunctions(fakeBuilders(), { components })
    const visit = { ...claims, impersonatedBy: 'admin-1' }
    const rows = { user: { role: 'user' }, member: { role: 'member' }, organization: { slug: 'acme', name: 'Acme' } }
    const refusal = (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => getBackendError(error))
    for (const kind of ['query', 'mutation', 'action'] as const) {
      for (const tier of [authed, workspace]) {
        expect(await refusal(invoke(tier, kind, ctxWith(visit, rows), () => 'x', { impersonation: 'refused' })), kind)
          .toMatchObject({ code: 'forbidden', data: { reason: 'impersonating' } })
        expect(await invoke(tier, kind, ctxWith(visit, rows), () => 'ran'), kind).toBe('ran')
      }
    }
  })

  it('refuses a misspelt impersonation rule when the function is defined', async () => {
    const { authed } = createFunctions(fakeBuilders(), { components })
    await expect(invoke(authed, 'mutation', ctxWith(claims), () => 'x', { impersonation: 'refuse' })).rejects.toThrow(/impersonation is 'allowed' or 'refused'/)
  })

  it('names the import cycle when billing is handed over before billing.ts has loaded', () => {
    expect(() => createFunctions(fakeBuilders(), { components, billing: undefined })).toThrow(/import cycle/)
  })
})

describe('the withFeature tier', () => {
  const rows = { user: { role: 'admin' }, member: { role: 'member' }, organization: { slug: 'acme', name: 'Acme' } }
  const refusal = (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => getBackendError(error))

  /** A billing whose plan grants `granted`. */
  function billingGranting(...granted: string[]) {
    return {
      requireFeature: vi.fn(async (_ctx: unknown, feature: string) => {
        if (!granted.includes(feature)) throw backendError('feature_required', { feature, plans: ['pro'] })
      }),
    }
  }

  it('needs billing in the options, and a feature key, when the function is defined', () => {
    const { withFeature } = createFunctions(fakeBuilders(), { components })
    expect(() => withFeature('reports')).toThrow(/withFeature needs billing/)
    const { withFeature: gated } = createFunctions(fakeBuilders(), { components, billing: billingGranting() })
    expect(() => gated('')).toThrow(/non-empty string/)
  })

  it('is the workspace tier plus the feature: ctx.workspace for a plan that grants it, feature_required otherwise', async () => {
    const billing = billingGranting('reports')
    const { withFeature } = createFunctions(fakeBuilders(), { components, billing })
    for (const kind of ['query', 'mutation', 'action'] as const) {
      expect(await invoke(withFeature('reports'), kind, ctxWith(claims, rows), ctx => (ctx as { workspace: unknown }).workspace), kind)
        .toStrictEqual({ id: 'org-1', slug: 'acme', name: 'Acme', role: 'member' })
      expect(await refusal(invoke(withFeature('audit'), kind, ctxWith(claims, rows), () => 'x')), kind)
        .toMatchObject({ code: 'feature_required', data: { feature: 'audit', plans: ['pro'] } })
    }
  })

  it('refuses who may not call it at all before the feature is read: a stranger, a non-member', async () => {
    const billing = billingGranting()
    const { withFeature } = createFunctions(fakeBuilders(), { components, billing })
    expect(await refusal(invoke(withFeature('reports'), 'query', ctxWith(null), () => 'x'))).toMatchObject({ code: 'unauthenticated' })
    expect(await refusal(invoke(withFeature('reports'), 'query', ctxWith(claims, {}), () => 'x'))).toMatchObject({ code: 'forbidden', data: { reason: 'not_member' } })
    expect(billing.requireFeature).not.toHaveBeenCalled()
  })

  it('asks for a recent sign-in last, of a caller the feature lets in', async () => {
    const { withFeature } = createFunctions(fakeBuilders(), { components, billing: billingGranting('reports') })
    const old = { ...claims, sessionId: 'session-1', authTime: Date.now() - 11 * 60_000 }
    expect(await refusal(invoke(withFeature('audit'), 'mutation', ctxWith(old, rows), () => 'x', { recentSignIn: true }))).toMatchObject({ code: 'feature_required' })
    expect(await refusal(invoke(withFeature('reports'), 'mutation', ctxWith(old, rows), () => 'x', { recentSignIn: true }))).toMatchObject({ code: 'reauthentication_required' })
    const recent = { ...old, authTime: Date.now() - 60_000 }
    expect(await invoke(withFeature('reports'), 'mutation', ctxWith(recent, rows), () => 'ran', { recentSignIn: true })).toBe('ran')
  })

  it('is built from the builders and options it is created with: its writes go through that mutation and spend limits.workspace', async () => {
    const limit = vi.fn(async () => ({ ok: true }))
    // An app's trigger-wrapped mutation, passed to the one createFunctions call.
    const builders = fakeBuilders()
    const triggered = vi.fn((definition: unknown) => (builders.mutation as unknown as (definition: unknown) => unknown)(definition))
    const { withFeature } = createFunctions({ ...builders, mutation: triggered as never }, {
      components,
      rateLimiter: { limit } as never,
      limits: { workspace: 'apiWrites' },
      billing: billingGranting('reports'),
    })
    expect(await invoke(withFeature('reports'), 'mutation', ctxWith(claims, rows), () => 'done')).toBe('done')
    expect(triggered).toHaveBeenCalledOnce()
    expect(limit).toHaveBeenCalledWith(expect.anything(), 'apiWrites', { key: 'user-1', throws: true })
    // A refusal spends nothing: the limit is taken of a caller the feature lets in.
    limit.mockClear()
    expect(await refusal(invoke(withFeature('audit'), 'action', ctxWith(claims, rows), () => 'x'))).toMatchObject({ code: 'feature_required' })
    expect(limit).not.toHaveBeenCalled()
  })
})
