import { describe, expect, it, vi } from 'vitest'
import { createFunctions } from '../../src/convex/integrations/functions'
import { setupAuthorization } from '../../src/convex/integrations/authorization'

const component = { backend: { adapter: { findOne: {} as never, updateOne: {} as never } } }
const authorization = setupAuthorization(component)

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
  kind: 'query',
  ctx: unknown,
  handler: (ctx: never, args: never) => unknown,
): Promise<unknown> {
  const define = (tierBuilder as Record<string, (definition: unknown) => { handler: (ctx: unknown, args: unknown) => unknown }>)[kind]!
  const defined = define({ args: {}, handler })
  return defined.handler(ctx, {})
}

describe('createFunctions tiers', () => {
  it('authed injects ctx.user and rejects signed-out callers', async () => {
    const { authed } = createFunctions(fakeBuilders(), authorization)

    const seen = await invoke(authed, 'query', ctxWith(claims), ctx => (ctx as { user: { id: string } }).user.id)
    expect(seen).toBe('user-1')

    await expect(invoke(authed, 'query', ctxWith(null), () => 'unreachable')).rejects.toThrow(/Unauthenticated/)
  })

  it('org injects ctx.organization from a fresh membership read', async () => {
    const { org } = createFunctions(fakeBuilders(), authorization)
    const ctx = ctxWith(claims, { member: { role: 'owner' } })

    const seen = await invoke(org, 'query', ctx, c =>
      (c as { organization: { id: string, role: string } }).organization)
    expect(seen).toStrictEqual({ id: 'org-1', role: 'owner' })
    expect(ctx.runQuery).toHaveBeenCalledOnce()

    await expect(invoke(org, 'query', ctxWith(claims, {}), () => 'unreachable')).rejects.toThrow(/not a member/)
  })

  it('admin honors adminRoles; withRole builds custom tiers', async () => {
    const { admin, withRole } = createFunctions(fakeBuilders(), authorization, { adminRoles: ['owner'] })

    await expect(invoke(admin, 'query', ctxWith(claims), () => 'x')).rejects.toThrow(/role/)
    await invoke(admin, 'query', ctxWith({ ...claims, role: 'owner' }), () => 'ok')

    const editors = withRole('editor')
    await invoke(editors, 'query', ctxWith({ ...claims, role: 'editor' }), () => 'ok')
    await expect(invoke(editors, 'query', ctxWith(claims), () => 'x')).rejects.toThrow(/role/)
  })

  it('consumes the tier rate limit on mutations, keyed by user', async () => {
    const limit = vi.fn(async () => ({ ok: true }))
    const { authed } = createFunctions(fakeBuilders(), authorization, {
      rateLimiter: { limit } as never,
      limits: { authed: 'apiWrites' },
    })

    await invoke(authed as never, 'mutation' as never, ctxWith(claims), () => 'done')
    expect(limit).toHaveBeenCalledWith(expect.anything(), 'apiWrites', { key: 'user-1', throws: true })

    // Queries never consume a limit.
    limit.mockClear()
    await invoke(authed, 'query', ctxWith(claims), () => 'read')
    expect(limit).not.toHaveBeenCalled()
  })
})
