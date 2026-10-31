import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { claimGuestJobs } from '../../src/convex/client/guest-claim'
import { SECURE_VISITOR_COOKIE, signVisitor, VISITOR_COOKIE } from '../../src/convex/proof'

// The claim at sign-up, on the auth side: the user-create hook reads the
// visitor cookie the auth proxy forwarded with the sign-up request, and only
// a cookie whose MAC holds under PROTECTION_PROOF_SECRET for this deployment
// claims the visitor's jobs. An account an administrator creates claims
// nothing, and a claim that fails never fails the sign-up.

const SITE = 'https://happy-otter-123.convex.site'
const SECRET = 'a-proof-secret-of-at-least-thirty-two-characters'
const VISITOR = 'AdaAdaAdaAdaAdaAdaAda0'

const claim = vi.fn(async () => 1)
const runtime = { ctx: { runMutation: vi.fn(), runQuery: vi.fn(), scheduler: {} }, guests: { claim } }

/** A database hook's endpoint context for a sign-up route, with the request's cookies and the protocol the auth proxy forwarded. */
// The base module's auth proxy forwards the browser's protocol as Better Auth's own header.
const signUp = (cookie: string, path = '/sign-in/email-otp', protocol = 'http', header = 'x-better-auth-forwarded-proto') => ({ path, headers: new Headers({ cookie: cookie, [header]: protocol }) })

beforeEach(() => {
  claim.mockClear()
  vi.stubEnv('PROTECTION_PROOF_SECRET', SECRET)
  vi.stubEnv('CONVEX_SITE_URL', SITE)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('claimGuestJobs', () => {
  it('claims the jobs of the visitor the signed cookie names, under either of its names over plain HTTP', async () => {
    const value = await signVisitor(SECRET, VISITOR, new URL(SITE).host)
    for (const name of [VISITOR_COOKIE, SECURE_VISITOR_COOKIE]) {
      await claimGuestJobs(runtime as never, { id: 'user-1' }, signUp(`theme=dark; ${name}=${value}`))
    }
    expect(claim.mock.calls).toEqual([
      [runtime.ctx, { visitor: VISITOR, userId: 'user-1' }],
      [runtime.ctx, { visitor: VISITOR, userId: 'user-1' }],
    ])
  })

  it('over HTTPS reads the __Host- cookie only, never one a sibling subdomain or a plain-HTTP response could have planted', async () => {
    const value = await signVisitor(SECRET, VISITOR, new URL(SITE).host)
    await claimGuestJobs(runtime as never, { id: 'user-1' }, signUp(`${VISITOR_COOKIE}=${value}`, '/sign-in/email-otp', 'https'))
    await claimGuestJobs(runtime as never, { id: 'user-1' }, { path: '/sign-in/email-otp', headers: new Headers({ cookie: `${VISITOR_COOKIE}=${value}` }) })
    expect(claim).not.toHaveBeenCalled()
    await claimGuestJobs(runtime as never, { id: 'user-1' }, signUp(`${SECURE_VISITOR_COOKIE}=${value}`, '/sign-in/email-otp', 'https'))
    expect(claim.mock.calls).toEqual([[runtime.ctx, { visitor: VISITOR, userId: 'user-1' }]])
  })

  it('reads the standard x-forwarded-proto when Better Auth\'s own header is absent', async () => {
    const value = await signVisitor(SECRET, VISITOR, new URL(SITE).host)
    await claimGuestJobs(runtime as never, { id: 'user-1' }, signUp(`${VISITOR_COOKIE}=${value}`, '/sign-in/email-otp', 'http', 'x-forwarded-proto'))
    expect(claim).toHaveBeenCalledWith(expect.anything(), { visitor: VISITOR, userId: 'user-1' })
  })

  it('claims nothing for a forged cookie, one another deployment signed, a bare id, or no secret', async () => {
    const elsewhere = await signVisitor(SECRET, VISITOR, 'brave-fox-456.convex.site')
    for (const value of [`${VISITOR}.${'B'.repeat(43)}`, elsewhere, VISITOR]) {
      await claimGuestJobs(runtime as never, { id: 'user-1' }, signUp(`${VISITOR_COOKIE}=${value}`))
    }
    vi.stubEnv('PROTECTION_PROOF_SECRET', '')
    await claimGuestJobs(runtime as never, { id: 'user-1' }, signUp(`${VISITOR_COOKIE}=${await signVisitor(SECRET, VISITOR, new URL(SITE).host)}`))
    expect(claim).not.toHaveBeenCalled()
  })

  it('claims nothing for an account an administrator creates, or one made outside a request', async () => {
    const cookie = `${VISITOR_COOKIE}=${await signVisitor(SECRET, VISITOR, new URL(SITE).host)}`
    await claimGuestJobs(runtime as never, { id: 'user-1' }, signUp(cookie, '/admin/create-user'))
    await claimGuestJobs(runtime as never, { id: 'user-1' }, null)
    expect(claim).not.toHaveBeenCalled()
  })

  it('never fails the sign-up when the claim does', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    claim.mockRejectedValueOnce(new Error('component down'))
    const cookie = `${VISITOR_COOKIE}=${await signVisitor(SECRET, VISITOR, new URL(SITE).host)}`
    await expect(claimGuestJobs(runtime as never, { id: 'user-1' }, signUp(cookie))).resolves.toBeUndefined()
    expect(String(error.mock.calls[0]![0])).toContain('ai.guest_claim_failed')
  })
})
