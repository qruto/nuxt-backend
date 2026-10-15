import { describe, expect, it, vi } from 'vitest'
import { markActive } from '../../website/utils/activity'
import { read } from '../docs/helpers'

// Signing in and out mark a playground account active, so the idle sweep
// reads them once the session row is gone (website/utils/activity.ts).

describe('markActive', () => {
  it('stamps the user\'s updatedAt through Better Auth\'s adapter', async () => {
    const updateUser = vi.fn(async () => ({}))
    await markActive('user_1', { context: { internalAdapter: { updateUser } } })
    expect(updateUser).toHaveBeenCalledWith('user_1', { updatedAt: expect.any(Date) })
  })

  it('does nothing without a request context, and never fails a sign-out', async () => {
    await expect(markActive('user_1', null)).resolves.toBeUndefined()
    const updateUser = vi.fn(async () => {
      throw new Error('user not found')
    })
    await expect(markActive('user_1', { context: { internalAdapter: { updateUser } } })).resolves.toBeUndefined()
  })

  it('runs on every sign-in and sign-out', () => {
    const auth = read('website/backend/auth.ts')
    expect(auth).toContain('create: { after: async (session, ctx) => markActive(session.userId, ctx) }')
    expect(auth).toContain('delete: { after: async (session, ctx) => markActive(session.userId, ctx) }')
  })
})
