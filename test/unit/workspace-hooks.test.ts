import { describe, expect, it, vi } from 'vitest'
import { organizationOptions } from '../../src/convex/client/workspaces'

// The workspace hooks an app passes to setupAuth reach Better Auth's
// organization plugin as its after-hooks, with the request's ctx and the
// workspace in the package's own shape.

const organization = { id: 'ws_1', name: 'Studio', slug: 'studio', createdAt: new Date() }
const runtime = { ctx: { runMutation: vi.fn(), runQuery: vi.fn() } } as never

describe('workspace hooks', () => {
  it('runs onMemberRemoved after a member is removed, with the workspace and the member', async () => {
    const onMemberRemoved = vi.fn(async () => {})
    const { organizationHooks } = organizationOptions({ onMemberRemoved }, runtime, undefined)
    await organizationHooks!.afterRemoveMember!({ member: { userId: 'user_1', role: 'member' }, organization, user: {} } as never)
    expect(onMemberRemoved).toHaveBeenCalledWith((runtime as { ctx: unknown }).ctx, { workspace: { id: 'ws_1', name: 'Studio', slug: 'studio' }, userId: 'user_1', role: 'member' })
  })

  it('passes no after-remove hook without a ctx that can write', () => {
    const { organizationHooks } = organizationOptions({ onMemberRemoved: async () => {} }, undefined, undefined)
    expect(organizationHooks?.afterRemoveMember).toBeUndefined()
  })
})
