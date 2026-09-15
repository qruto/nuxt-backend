import { describe, expect, it, vi } from 'vitest'
import { type DatabaseHooks, mergeDatabaseHooks } from '../../src/convex/client/hooks'

type BeforeHook = (entity: Record<string, unknown>, ctx: unknown) => Promise<unknown>
type AfterHook = (entity: Record<string, unknown>, ctx: unknown) => Promise<void>

function sessionBefore(hooks: DatabaseHooks | undefined): BeforeHook {
  return hooks!.session!.create!.before as unknown as BeforeHook
}
function userAfter(hooks: DatabaseHooks | undefined): AfterHook {
  return hooks!.user!.create!.after as unknown as AfterHook
}

describe('mergeDatabaseHooks', () => {
  it('passes a lone side through untouched', () => {
    const ours = { user: { create: { after: vi.fn() } } } as unknown as DatabaseHooks
    expect(mergeDatabaseHooks(ours, undefined)).toBe(ours)
    expect(mergeDatabaseHooks(undefined, ours)).toBe(ours)
    expect(mergeDatabaseHooks(undefined, undefined)).toBeUndefined()
  })

  it('runs the package before hook first and hands its { data } to the consumer', async () => {
    const seen: unknown[] = []
    const ours = {
      session: { create: { before: vi.fn(async (session: Record<string, unknown>) => ({ data: { ...session, activeOrganizationId: 'org-1' } })) } },
    } as unknown as DatabaseHooks
    const theirs = {
      session: { create: { before: vi.fn(async (session: Record<string, unknown>) => {
        seen.push(session)
        return { data: { ...session, note: 'seen' } }
      }) } },
    } as unknown as DatabaseHooks

    const result = await sessionBefore(mergeDatabaseHooks(ours, theirs))({ userId: 'u1' }, { ctx: true })

    expect(seen).toEqual([{ userId: 'u1', activeOrganizationId: 'org-1' }])
    expect(result).toEqual({ data: { userId: 'u1', activeOrganizationId: 'org-1', note: 'seen' } })
    expect(theirs.session!.create!.before).toHaveBeenCalledWith(expect.anything(), { ctx: true })
  })

  it('returns undefined when neither before hook transforms the entity', async () => {
    const ours = { session: { create: { before: vi.fn(async () => undefined) } } } as unknown as DatabaseHooks
    const theirs = { session: { create: { before: vi.fn(async () => {}) } } } as unknown as DatabaseHooks
    expect(await sessionBefore(mergeDatabaseHooks(ours, theirs))({ userId: 'u1' }, null)).toBeUndefined()
  })

  it('a false from the package hook aborts without running the consumer', async () => {
    const theirs = { session: { create: { before: vi.fn(async () => ({ data: { x: 1 } })) } } } as unknown as DatabaseHooks
    const ours = { session: { create: { before: vi.fn(async () => false) } } } as unknown as DatabaseHooks
    expect(await sessionBefore(mergeDatabaseHooks(ours, theirs))({}, null)).toBe(false)
    expect(theirs.session!.create!.before).not.toHaveBeenCalled()
  })

  it('a false from the consumer hook aborts too', async () => {
    const ours = { session: { create: { before: vi.fn(async () => ({ data: { x: 1 } })) } } } as unknown as DatabaseHooks
    const theirs = { session: { create: { before: vi.fn(async () => false) } } } as unknown as DatabaseHooks
    expect(await sessionBefore(mergeDatabaseHooks(ours, theirs))({}, null)).toBe(false)
  })

  it('runs after hooks package-first, and keeps ops only one side declares', async () => {
    const order: string[] = []
    const ours = {
      user: { create: { after: vi.fn(async () => { order.push('package') }) } },
      session: { create: { before: vi.fn(async () => undefined) } },
    } as unknown as DatabaseHooks
    const theirs = {
      user: {
        create: { after: vi.fn(async () => { order.push('consumer') }) },
        delete: { before: vi.fn(async () => true) },
      },
      account: { create: { after: vi.fn(async () => {}) } },
    } as unknown as DatabaseHooks

    const merged = mergeDatabaseHooks(ours, theirs)!
    await userAfter(merged)({ id: 'u1' }, null)

    expect(order).toEqual(['package', 'consumer'])
    expect(merged.session?.create?.before).toBeTypeOf('function')
    expect(merged.session?.create?.after).toBeUndefined()
    expect(merged.user?.delete?.before).toBeTypeOf('function')
    expect(merged.account?.create?.after).toBeTypeOf('function')
    expect(merged.user?.create?.before).toBeUndefined()
  })
})
