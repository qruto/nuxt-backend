import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PausableService } from '../../src/convex/flags'
import { authFlow } from '../helpers/auth-flow'

// The flags on real Better Auth routes. The pause_signups kill switch: a
// code that would create an account is refused before it is sent, every
// route that creates one is refused as the backstop, and an existing
// account signs in as before; the switch is the runtime's pause check,
// which setupAuth reads off the backend component's flags
// (src/convex/pauses.ts). An account's erasure takes its id out of every
// flag's targets inside the component (test/convex-component/account.test.ts).

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

/** A flow whose pause check answers from `paused`, changeable as the test goes. */
async function pausable(options: { userExists?: boolean } = {}) {
  const paused = new Set<PausableService>()
  const check = vi.fn(async (_ctx: unknown, service: PausableService) => paused.has(service))
  const flow = await authFlow({ runtime: { paused: check, ...(options.userExists === false ? { userExists: undefined } : {}) } })
  return { ...flow, paused, check }
}

const refusal = async (response: Response) => ({ status: response.status, ...await response.json() as Record<string, unknown> })

describe('pause_signups', () => {
  it('refuses a code for an address with no account, and sends none', async () => {
    const flow = await pausable()
    flow.paused.add('signups')
    const { response, code } = await flow.sendCode('new@example.com')
    expect(await refusal(response)).toMatchObject({ status: 503, code: 'unavailable', service: 'signups', reason: 'signups_paused' })
    expect(code).toBeUndefined()
    expect(flow.db.user).toHaveLength(0)
    // The refusal says the address has no account, as the sign-in gate's
    // does: like the gate, it spends the deployment's ceiling, so probing
    // addresses is throttled, and leaves the address's own quota.
    expect(flow.limiter.total('emailOtpGlobal')).toBe(1)
    expect(flow.limiter.total('emailOtp')).toBe(0)
  })

  it('throttles probes once the deployment\'s ceiling is spent', async () => {
    const flow = await pausable()
    flow.paused.add('signups')
    flow.limiter.limit.mockResolvedValueOnce({ ok: false, retryAfter: 60_000 })
    const { response } = await flow.sendCode('new@example.com')
    expect(await refusal(response)).toMatchObject({ status: 429, code: 'rate_limited', limit: 'emailOtpGlobal' })
    expect(flow.check).not.toHaveBeenCalled()
  })

  it('lets an existing account ask for a code and sign in', async () => {
    const flow = await pausable()
    await flow.signedIn('ada@example.com')
    flow.paused.add('signups')
    const { response } = await flow.signInWithCode('ada@example.com')
    expect(response.status).toBe(200)
  })

  it('refuses the account itself, the backstop on every route that creates one', async () => {
    // Without the account lookup, the code request cannot tell a new address: the creation hook refuses.
    const flow = await pausable({ userExists: false })
    const { code } = await flow.sendCode('new@example.com')
    expect(code).toBeDefined()
    flow.paused.add('signups')
    const response = await flow.post('/sign-in/email-otp', { email: 'new@example.com', otp: code, name: 'New' })
    expect(await refusal(response)).toMatchObject({ status: 503, code: 'unavailable', reason: 'signups_paused' })
    expect(flow.db.user).toHaveLength(0)
  })

  it('pauses nothing else, and nothing at all once it is off', async () => {
    const flow = await pausable()
    flow.paused.add('checkout')
    flow.paused.add('ai')
    const { response } = await flow.signInWithCode('new@example.com', 'New')
    expect(response.status).toBe(200)
    expect(flow.db.user).toHaveLength(1)
    expect(flow.check).toHaveBeenCalledWith(expect.anything(), 'signups')
  })
})
