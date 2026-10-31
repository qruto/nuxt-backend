import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveIntegrations } from '../../src/convex/client/component'
import { RECENT_SIGN_IN_SECONDS } from '../../src/convex/constants'
import { authFlow } from '../helpers/auth-flow'

// An account's own deletion on real Better Auth routes: immediate, once the
// person typed their address to confirm it and signed in recently, refused
// to the only owner of a workspace others belong to, under its own limit,
// and followed by the erasure of everything else of the account, through
// the app's account instance (setupAccount). No email confirms it any
// more. An administrator's removal is held to the same refusal and erases
// the same way. The erasure itself runs on the component
// (test/convex-component/account.test.ts).

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const refusal = async (response: Response) => ({ status: response.status, ...await response.json() as Record<string, unknown> })

/** A flow whose account instance records each erasure, with the workspaces `blocked` names as owned alone among others. */
async function deleting(blocked: string[] = []) {
  const forget = vi.fn(async (_ctx: unknown, _target: { userId?: string, email?: string }) => ({ deleted: [], left: [] }))
  const soleOwnerships = vi.fn(async (_ctx: unknown, _userId: string) => blocked)
  const flow = await authFlow({ runtime: { account: { forget, soleOwnerships } } })
  return { ...flow, forget, soleOwnerships }
}

describe('deleting an account', () => {
  it('deletes it at once when the address typed matches, and erases the rest of it', async () => {
    const flow = await deleting()
    const ada = await flow.signedIn('ada@example.com')
    const response = await flow.post('/delete-user', { confirmation: ' Ada@Example.com ' }, { cookie: ada.cookie })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, message: 'User deleted' })
    expect(flow.db.user).toHaveLength(0)
    expect(flow.db.session).toHaveLength(0)
    expect(flow.forget).toHaveBeenCalledWith(expect.anything(), { userId: ada.userId, email: 'ada@example.com' })
    // No confirmation email any more: the welcome is all that went out.
    expect(flow.sent.map(entry => entry.name)).toEqual(['welcome'])
  })

  it('refuses it without the address typed, or with another one, each try spending the account\'s bucket', async () => {
    const flow = await deleting()
    const ada = await flow.signedIn('ada@example.com')
    for (const body of [{}, { confirmation: 'grace@example.com' }, { confirmation: 42 }]) {
      expect(await refusal(await flow.post('/delete-user', body, { cookie: ada.cookie }))).toMatchObject({ status: 400, code: 'invalid_input', field: 'confirmation' })
    }
    expect(flow.db.user).toHaveLength(1)
    expect(flow.forget).not.toHaveBeenCalled()
    // A script guessing at it runs out of tries: three an hour.
    expect(flow.limiter.total('accountDelete')).toBe(3)
    expect(await refusal(await flow.post('/delete-user', { confirmation: 'ada@example.com' }, { cookie: ada.cookie }))).toMatchObject({ status: 429, code: 'rate_limited' })
  })

  it('refuses the only owner of a workspace others belong to', async () => {
    const flow = await deleting(['workspace_acme'])
    const ada = await flow.signedIn('ada@example.com')
    expect(await refusal(await flow.post('/delete-user', { confirmation: 'ada@example.com' }, { cookie: ada.cookie }))).toMatchObject({ status: 403, code: 'forbidden', reason: 'sole_owner' })
    expect(flow.soleOwnerships).toHaveBeenCalledWith(expect.anything(), ada.userId)
    expect(flow.db.user).toHaveLength(1)
  })

  it('asks for a recent sign-in, and refuses an administrator acting as the account', async () => {
    const flow = await deleting()
    const ada = await flow.signedIn('ada@example.com')
    for (const row of flow.db.session!) row.createdAt = new Date(Date.now() - (RECENT_SIGN_IN_SECONDS + 60) * 1000)
    expect(await refusal(await flow.post('/delete-user', { confirmation: 'ada@example.com' }, { cookie: ada.cookie }))).toMatchObject({ status: 403, code: 'reauthentication_required' })
    const grace = await flow.signedIn('grace@example.com')
    flow.impersonate(grace.token)
    expect(await refusal(await flow.post('/delete-user', { confirmation: 'grace@example.com' }, { cookie: grace.cookie }))).toMatchObject({ status: 403, code: 'forbidden', reason: 'impersonating' })
    expect(flow.db.user).toHaveLength(2)
  })

  it('spends the account\'s own accountDelete limit, keyed by the account', async () => {
    const flow = await deleting(['workspace_acme'])
    const ada = await flow.signedIn('ada@example.com')
    for (let tries = 0; tries < 3; tries++) await flow.post('/delete-user', { confirmation: 'ada@example.com' }, { cookie: ada.cookie })
    expect(await refusal(await flow.post('/delete-user', { confirmation: 'ada@example.com' }, { cookie: ada.cookie }))).toMatchObject({ status: 429, code: 'rate_limited', limit: 'accountDelete' })
    expect(flow.limiter.limit).toHaveBeenCalledWith(expect.anything(), 'accountDelete', { key: ada.userId })
  })

  it('deletes the account all the same when its erasure cannot start, and logs account.erasure_failed', async () => {
    const flow = await deleting()
    flow.forget.mockRejectedValueOnce(new Error('component down'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const ada = await flow.signedIn('ada@example.com')
    expect((await flow.post('/delete-user', { confirmation: 'ada@example.com' }, { cookie: ada.cookie })).status).toBe(200)
    expect(flow.db.user).toHaveLength(0)
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/^\[nuxt-backend\] account\.erasure_failed: /), expect.any(Error))
    expect(JSON.stringify(error.mock.calls)).not.toContain('ada@example.com')
  })

  it('holds a confirmation link an earlier release emailed to the same refusal', async () => {
    const flow = await deleting(['workspace_acme'])
    const ada = await flow.signedIn('ada@example.com')
    const now = new Date()
    flow.db.verification!.push({ id: 'v-delete', identifier: 'delete-account-old-link', value: ada.userId, expiresAt: new Date(now.getTime() + 3_600_000), createdAt: now, updatedAt: now })
    expect(await refusal(await flow.get('/delete-user/callback?token=old-link', { cookie: ada.cookie }))).toMatchObject({ status: 403, code: 'forbidden', reason: 'sole_owner' })
    expect(flow.db.user).toHaveLength(1)
    // Once ownership moved, the link deletes the account, and the erasure runs.
    flow.soleOwnerships.mockResolvedValue([])
    expect((await flow.get('/delete-user/callback?token=old-link', { cookie: ada.cookie })).status).toBe(200)
    expect(flow.db.user).toHaveLength(0)
    expect(flow.forget).toHaveBeenCalledWith(expect.anything(), { userId: ada.userId, email: 'ada@example.com' })
  })

  it('holds an administrator\'s removal to the same refusal, and erases what it removes', async () => {
    const flow = await deleting()
    const root = await flow.signedIn('root@example.com', { role: 'admin' })
    const ada = await flow.signedIn('ada@example.com')
    flow.soleOwnerships.mockResolvedValueOnce(['workspace_acme'])
    expect(await refusal(await flow.post('/admin/remove-user', { userId: ada.userId }, { cookie: root.cookie }))).toMatchObject({ status: 403, code: 'forbidden', reason: 'sole_owner' })
    expect((await flow.post('/admin/remove-user', { userId: ada.userId }, { cookie: root.cookie })).status).toBe(200)
    expect(flow.db.user!.map(row => row.email)).toEqual(['root@example.com'])
    expect(flow.forget).toHaveBeenCalledWith(expect.anything(), { userId: ada.userId, email: 'ada@example.com' })
  })
})

describe('the erasure the auth layer runs', () => {
  it('is the component\'s own when the app passes no account instance, and none on a component built before it', () => {
    const account = resolveIntegrations({ backend: { account: { forget: 'backend.account.forget', soleOwnerships: 'backend.account.soleOwnerships' }, adapter: { findOne: 'backend.adapter.findOne' } } } as never, {} as never).account
    expect(account).toMatchObject({ forget: expect.any(Function), soleOwnerships: expect.any(Function) })
    expect(resolveIntegrations({ backend: {} } as never, {} as never).account).toBeUndefined()
  })

  it('runs the app\'s own instance when setupAuth gets one', () => {
    const mine = { forget: vi.fn(), soleOwnerships: vi.fn() }
    expect(resolveIntegrations({ backend: {} } as never, { account: mine } as never).account).toBe(mine)
  })
})

describe('deleting an account with a grace period', () => {
  /** A flow whose account instance can schedule a deletion. */
  async function scheduling() {
    const forget = vi.fn(async (_ctx: unknown, _target: { userId?: string, email?: string }) => ({ deleted: [], left: [] }))
    const scheduleDeletion = vi.fn(async (_ctx: unknown, _userId: string) => ({ requestedAt: 1_000, deletesAt: 2_000 }))
    const soleOwnerships = vi.fn(async (_ctx: unknown, _userId: string): Promise<string[]> => [])
    const flow = await authFlow({ runtime: { account: { forget, soleOwnerships, scheduleDeletion } } })
    return { ...flow, forget, scheduleDeletion, soleOwnerships }
  }

  it('schedules the deletion instead of running it: the account and its sessions stay', async () => {
    const flow = await scheduling()
    const ada = await flow.signedIn('ada@example.com')
    const response = await flow.post('/delete-user', { confirmation: ' Ada@Example.com ' }, { cookie: ada.cookie })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, scheduled: true, requestedAt: 1_000, deletesAt: 2_000 })
    expect(flow.scheduleDeletion).toHaveBeenCalledWith(expect.anything(), ada.userId)
    expect(flow.db.user).toHaveLength(1)
    expect(flow.db.session).toHaveLength(1)
    expect(flow.forget).not.toHaveBeenCalled()
  })

  it('holds the request to the same checks first: the address typed, the only-owner refusal and a recent sign-in', async () => {
    const flow = await scheduling()
    const ada = await flow.signedIn('ada@example.com')
    expect(await refusal(await flow.post('/delete-user', { confirmation: 'grace@example.com' }, { cookie: ada.cookie }))).toMatchObject({ status: 400, code: 'invalid_input', field: 'confirmation' })
    flow.soleOwnerships.mockResolvedValueOnce(['workspace_acme'])
    expect(await refusal(await flow.post('/delete-user', { confirmation: 'ada@example.com' }, { cookie: ada.cookie }))).toMatchObject({ status: 403, code: 'forbidden', reason: 'sole_owner' })
    for (const row of flow.db.session!) row.createdAt = new Date(Date.now() - (RECENT_SIGN_IN_SECONDS + 60) * 1000)
    expect(await refusal(await flow.post('/delete-user', { confirmation: 'ada@example.com' }, { cookie: ada.cookie }))).toMatchObject({ status: 403, code: 'reauthentication_required' })
    expect(flow.scheduleDeletion).not.toHaveBeenCalled()
    // The two tries that reached the account's bucket spent it; the stale sign-in never did.
    expect(flow.limiter.total('accountDelete')).toBe(2)
  })

  it('leaves an administrator\'s removal immediate: moderation skips the grace period', async () => {
    const flow = await scheduling()
    const root = await flow.signedIn('root@example.com', { role: 'admin' })
    const ada = await flow.signedIn('ada@example.com')
    expect((await flow.post('/admin/remove-user', { userId: ada.userId }, { cookie: root.cookie })).status).toBe(200)
    expect(flow.db.user!.map(row => row.email)).toEqual(['root@example.com'])
    expect(flow.forget).toHaveBeenCalledWith(expect.anything(), { userId: ada.userId, email: 'ada@example.com' })
    expect(flow.scheduleDeletion).not.toHaveBeenCalled()
  })
})
