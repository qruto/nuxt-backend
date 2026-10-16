import { afterEach, describe, expect, it, vi } from 'vitest'
import { authFlow } from '../helpers/auth-flow'

// The workspace every new session activates, against real Better Auth: a
// sign-in through the code route, so the session hook runs inside a request
// as it does on a deployment.

afterEach(() => {
  vi.unstubAllEnvs()
})

const ADA = 'ada@example.com'

async function signIn(flow: Awaited<ReturnType<typeof authFlow>>, address = ADA) {
  const { code } = await flow.sendCode(address)
  return flow.post('/sign-in/email-otp', { email: address, otp: code, name: 'Ada' })
}

const slugs = (flow: Awaited<ReturnType<typeof authFlow>>) => flow.db.organization!.map(row => row.slug)

describe('the personal workspace', () => {
  it('is created on the first sign-in and activated on every session', async () => {
    const flow = await authFlow()
    expect((await signIn(flow)).status).toBe(200)
    const [user] = flow.db.user!
    const [workspace] = flow.db.organization!

    expect(workspace).toMatchObject({ slug: `personal-${String(user!.id).toLowerCase()}`, name: 'Ada\'s workspace' })
    expect(flow.db.member).toEqual([expect.objectContaining({ userId: user!.id, organizationId: workspace!.id, role: 'owner' })])
    expect(flow.db.session!.at(-1)).toMatchObject({ activeOrganizationId: workspace!.id })
  })

  it('is the user\'s again when they come back to it empty', async () => {
    const flow = await authFlow()
    await signIn(flow)
    const [workspace] = flow.db.organization!
    flow.db.member!.length = 0

    expect((await signIn(flow)).status).toBe(200)
    expect(flow.db.organization).toHaveLength(1)
    expect(flow.db.member).toEqual([expect.objectContaining({ organizationId: workspace!.id, role: 'owner' })])
    expect(flow.db.session!.at(-1)).toMatchObject({ activeOrganizationId: workspace!.id })
  })

  it('stays with whoever holds it now, and the user gets a new one under a slug of its own', async () => {
    const flow = await authFlow()
    await signIn(flow)
    const [user] = flow.db.user!
    const [handedOver] = flow.db.organization!
    flow.db.member![0]!.userId = 'someone-else'

    expect((await signIn(flow)).status).toBe(200)
    expect(new Set(slugs(flow)).size).toBe(2)
    expect(slugs(flow)[1]).toMatch(new RegExp(`^personal-${String(user!.id).toLowerCase()}-[0-9a-f]{8}$`))
    const mine = flow.db.member!.find(row => row.userId === user!.id)
    expect(mine).toMatchObject({ role: 'owner' })
    expect(mine!.organizationId).not.toBe(handedOver!.id)
  })
})

describe('a refused sign-in', () => {
  it('leaves no workspace behind when the gate refuses the session', async () => {
    const canSignIn = vi.fn(async (_ctx: unknown, input: { purpose: string }) =>
      input.purpose === 'session' ? { allowed: false as const, message: 'Closed for maintenance.' } : true as const)
    const flow = await authFlow({ runtime: { canSignIn } as never })

    const response = await signIn(flow)
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ message: 'Closed for maintenance.' })
    expect(flow.db.organization).toHaveLength(0)
    expect(flow.db.member).toHaveLength(0)
    expect(flow.db.session).toHaveLength(0)
  })

  it('leaves no workspace behind for a banned account: the ban check runs first', async () => {
    const flow = await authFlow()
    await flow.helpers.saveUser(flow.helpers.createUser({ email: ADA, name: 'Ada', emailVerified: true, banned: true }))

    const response = await signIn(flow)
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'BANNED_USER' })
    expect(flow.db.organization).toHaveLength(0)
    expect(flow.db.member).toHaveLength(0)
  })
})
