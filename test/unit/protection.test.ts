import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { captcha } from 'better-auth/plugins'
import { createApp, toPlainHandler, toWebHandler, type App } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { probeProof, protectionFindings, type ProtectionDoctorInput } from '../../src/cli/protection'
import { getBackendError } from '../../src/convex/errors'
import { verifyHuman } from '../../src/convex/integrations/functions'
import { CALL_METHOD, CLIENT_ADDRESS_HEADER, HUMAN_PROOF_ROUTE, PROOF_HEADER, readClientAddress, type ProofTarget, proofVisitor, signProof as signProofFor, signVisitor, TEST_CHALLENGE_SECRET_KEYS, TEST_CHALLENGE_SITE_KEYS, verifyProof as verifyProofFor, VISITOR_METHOD, withVisitor } from '../../src/convex/proof'
import { provenVisitor, requestVisitor } from '../../src/convex/visitor'
import { authFlow, ORIGIN } from '../helpers/auth-flow'

// Bot protection end to end, with every provider stood in for and no
// network: the deployment's half against real Better Auth (the request
// guard that refuses a protected route without a proof the app's server
// signed, Better Auth's captcha plugin verifying a challenge answer with
// the provider's documented test keys, and verifyHuman for an app's own
// calls); the app's server in front of the auth proxy (BotID's verdict
// decides, and a person's request leaves with a proof); and doctor's checks
// of the two sides. Secrets are generated per test.

/** The deployment's site URL, which the app's server forwards to and the deployment reads as its own. */
const SITE = 'https://happy-otter-123.convex.site'
/** Another deployment's: a dev deployment beside production. */
const OTHER_SITE = 'https://brave-fox-456.convex.site'

// BotID's server SDK and Nitro's runtime config, for the app's server.
const checkBotId = vi.fn()
vi.mock('botid/server', () => ({ checkBotId }))
const runtimeConfig = { public: { backend: { authRoute: '/api/auth', challengeSiteKey: '', botDetection: true }, convex: { siteUrl: SITE } } }
vi.mock('nitropack/runtime', () => ({
  useRuntimeConfig: () => runtimeConfig,
}))

const SEND = '/api/auth/email-otp/send-verification-otp'
const ADA = 'ada@example.com'

/** A proof's target, for the deployment at SITE unless it names another. */
type Target = Omit<ProofTarget, 'audience'> & { audience?: string }
const forSite = ({ audience = 'happy-otter-123.convex.site', ...target }: Target): ProofTarget => ({ audience, ...target })
/** Sign for the deployment at SITE unless the target names another audience. */
const signProof = (secret: string, target: Target) => signProofFor(secret, forSite(target))
const verifyProof = (secret: string, proof: string | null | undefined, target: Target) => verifyProofFor(secret, proof, forSite(target))

/** A fresh proof secret, as `openssl rand -base64 32` would print one. */
const newSecret = () => randomBytes(32).toString('base64')

describe('on the deployment', () => {
  const [PASSING_KEY, FAILING_KEY, SPENT_KEY] = TEST_CHALLENGE_SECRET_KEYS as [string, string, string]

  /**
   * The challenge provider's siteverify, as it answers the documented test
   * secret keys: the first passes every answer, the second refuses it, the
   * third says it was already spent. Anything else fails the test.
   */
  function siteverify(options: { down?: boolean } = {}) {
    const fetch = vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
      if (options.down) throw new TypeError('fetch failed')
      const { secret } = JSON.parse(String(init?.body)) as { secret: string }
      if (secret === PASSING_KEY) return Response.json({ 'success': true, 'error-codes': [], 'action': '', 'hostname': 'example.com' })
      if (secret === FAILING_KEY) return Response.json({ 'success': false, 'error-codes': ['invalid-input-response'] })
      if (secret === SPENT_KEY) return Response.json({ 'success': false, 'error-codes': ['timeout-or-duplicate'] })
      throw new Error(`siteverify got an unknown secret key: ${secret}`)
    })
    vi.stubGlobal('fetch', fetch)
    return fetch
  }

  /** A sign-in code request through the auth routes, with the headers a proxy or a browser would add. */
  async function requestCode(flow: Awaited<ReturnType<typeof authFlow>>, headers: Record<string, string> = {}, path = SEND) {
    return flow.auth.handler(new Request(`${ORIGIN}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': ORIGIN, ...headers },
      body: JSON.stringify({ email: ADA, type: 'sign-in' }),
    }))
  }

  async function refusal(response: Response) {
    return { status: response.status, ...await response.json() as Record<string, unknown> }
  }

  beforeEach(() => {
    // Each refusal writes its log line; Better Auth logs the provider's own failure.
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // The Convex runtime sets the deployment's own site URL.
    vi.stubEnv('CONVEX_SITE_URL', SITE)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  describe('the request guard, when the deployment takes proofs (BotID on Vercel)', () => {
    async function proofFlow() {
      const secret = newSecret()
      vi.stubEnv('PROTECTION_PROOF_SECRET', secret)
      return { secret, flow: await authFlow() }
    }

    it('refuses a code request that skipped the app\'s server, before anything is sent or spent', async () => {
      const { flow } = await proofFlow()
      const response = await requestCode(flow)
      expect(await refusal(response)).toMatchObject({ status: 403, code: 'forbidden', reason: 'bot_check', message: 'We couldn\'t confirm you\'re a person. Try again.' })
      expect(flow.sent).toHaveLength(0)
      expect(flow.limiter.limit).not.toHaveBeenCalled()
      expect(getBackendError({ error: { ...await requestCode(flow).then(answer => answer.json()), status: 403 } })).toMatchObject({ code: 'forbidden', data: { reason: 'bot_check' } })
    })

    it('takes a request carrying the proof the app\'s server signed for its method, path and address', async () => {
      const { flow, secret } = await proofFlow()
      const response = await requestCode(flow, { [PROOF_HEADER]: await signProof(secret, { method: 'POST', path: SEND, subject: ADA }) })
      expect(response.status).toBe(200)
      expect(flow.codeFor(ADA)).toMatch(/^\d{6}$/)
    })

    it('refuses a proof signed under another secret, for another route, address or deployment, or more than a minute ago', async () => {
      const { flow, secret } = await proofFlow()
      const cases = {
        'another secret': await signProof(newSecret(), { method: 'POST', path: SEND, subject: ADA }),
        'another route': await signProof(secret, { method: 'POST', path: '/api/auth/sign-up/email', subject: ADA }),
        'another method': await signProof(secret, { method: 'GET', path: SEND, subject: ADA }),
        'a call': await signProof(secret, { method: CALL_METHOD, path: SEND, subject: ADA }),
        // One bot check buys one address: the proof never sends a code to another.
        'another address': await signProof(secret, { method: 'POST', path: SEND, subject: 'bob@example.com' }),
        // A dev server signs a proof for every request: never one another deployment takes.
        'another deployment': await signProof(secret, { method: 'POST', path: SEND, subject: ADA, audience: new URL(OTHER_SITE).host }),
        'expired': await signProof(secret, { method: 'POST', path: SEND, subject: ADA, now: Date.now() - 61_000 }),
        'malformed': 'v1.123.not-a-signature',
      }
      for (const [name, proof] of Object.entries(cases)) {
        const response = await requestCode(flow, { [PROOF_HEADER]: proof })
        expect(await refusal(response), name).toMatchObject({ status: 403, reason: 'bot_check' })
      }
      expect(flow.sent).toHaveLength(0)
    })

    it('leaves the routes that send no mail alone: checking a code takes no proof', async () => {
      const { flow, secret } = await proofFlow()
      await requestCode(flow, { [PROOF_HEADER]: await signProof(secret, { method: 'POST', path: SEND, subject: ADA }) })
      const signIn = await flow.post('/sign-in/email-otp', { email: ADA, otp: flow.codeFor(ADA) })
      expect(signIn.status).toBe(200)
    })

    it('trusts the app\'s own server code: an in-process call has no request to check', async () => {
      const { flow } = await proofFlow()
      const api = (flow.auth as unknown as { api: { sendVerificationOTP: (input: { body: Record<string, string> }) => Promise<unknown> } }).api
      await expect(api.sendVerificationOTP({ body: { email: ADA, type: 'sign-in' } })).resolves.toMatchObject({ success: true })
    })

    it('checks nothing while the deployment has no secret', async () => {
      const flow = await authFlow()
      expect((await requestCode(flow)).status).toBe(200)
    })

    it('keeps checking proofs when the app brings its own captcha plugin, which replaces the package\'s challenge', async () => {
      const fetch = siteverify()
      const secret = newSecret()
      vi.stubEnv('PROTECTION_PROOF_SECRET', secret)
      vi.stubEnv('PROTECTION_CHALLENGE_SECRET_KEY', PASSING_KEY)
      // The app's plugin guards sign-up only: the code request is still the proof's.
      const flow = await authFlow({ build: { authOptions: { plugins: [captcha({ provider: 'cloudflare-turnstile', secretKey: PASSING_KEY, endpoints: ['/sign-up/email'] })] } } })
      expect(await refusal(await requestCode(flow, { 'x-captcha-response': 'XXXX.DUMMY.TOKEN.XXXX' }))).toMatchObject({ status: 403, reason: 'bot_check' })
      expect(flow.sent).toHaveLength(0)
      expect(fetch).not.toHaveBeenCalled()
      expect((await requestCode(flow, { [PROOF_HEADER]: await signProof(secret, { method: 'POST', path: SEND, subject: ADA }) })).status).toBe(200)
    })

    it('guards password sign-in too, the route credential stuffing aims at, when an app turns passwords on', async () => {
      const { flow, secret } = await proofFlow()
      const signIn = (headers: Record<string, string>) => flow.auth.handler(new Request(`${ORIGIN}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'origin': ORIGIN, ...headers },
        body: JSON.stringify({ email: ADA, password: 'not-the-password' }),
      }))
      expect(await refusal(await signIn({}))).toMatchObject({ status: 403, reason: 'bot_check' })
      // With a proof, the route itself answers (no passwords here: not a bot check).
      expect(await refusal(await signIn({ [PROOF_HEADER]: await signProof(secret, { method: 'POST', path: '/api/auth/sign-in/email', subject: ADA }) }))).not.toMatchObject({ reason: 'bot_check' })
    })
  })

  describe('the challenge, verified on the deployment (Turnstile off Vercel)', () => {
    async function challengeFlow(secretKey: string, proofSecret?: string) {
      vi.stubEnv('PROTECTION_CHALLENGE_SECRET_KEY', secretKey)
      if (proofSecret) vi.stubEnv('PROTECTION_PROOF_SECRET', proofSecret)
      return authFlow()
    }

    it('verifies the answer with the provider through Better Auth\'s captcha plugin', async () => {
      const fetch = siteverify()
      const flow = await challengeFlow(PASSING_KEY)
      const response = await requestCode(flow, { 'x-captcha-response': 'XXXX.DUMMY.TOKEN.XXXX' })
      expect(response.status).toBe(200)
      expect(fetch).toHaveBeenCalledOnce()
      expect(String(fetch.mock.calls[0]![0])).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
      expect(flow.codeFor(ADA)).toMatch(/^\d{6}$/)
    })

    it('refuses a missing, failed or spent answer the way it refuses a bot, and sends nothing', async () => {
      siteverify()
      const missing = await requestCode(await challengeFlow(PASSING_KEY))
      expect(await refusal(missing)).toMatchObject({ status: 403, code: 'forbidden', reason: 'bot_check' })
      for (const key of [FAILING_KEY, SPENT_KEY]) {
        const flow = await challengeFlow(key)
        const response = await requestCode(flow, { 'x-captcha-response': 'XXXX.DUMMY.TOKEN.XXXX' })
        expect(await refusal(response), key).toMatchObject({ status: 403, code: 'forbidden', reason: 'bot_check' })
        expect(flow.sent).toHaveLength(0)
      }
    })

    it('refuses as unavailable when the provider cannot be reached: an answer it never checked is no answer', async () => {
      siteverify({ down: true })
      const flow = await challengeFlow(PASSING_KEY)
      const response = await requestCode(flow, { 'x-captcha-response': 'XXXX.DUMMY.TOKEN.XXXX' })
      expect(await refusal(response)).toMatchObject({ status: 503, code: 'unavailable', service: 'protection', reason: 'provider_refused' })
    })

    it('takes either with both secrets: a proof needs no answer, and no proof falls back to the challenge', async () => {
      const fetch = siteverify()
      const secret = newSecret()
      const flow = await challengeFlow(FAILING_KEY, secret)
      const proven = await requestCode(flow, { [PROOF_HEADER]: await signProof(secret, { method: 'POST', path: SEND, subject: ADA }) })
      expect(proven.status).toBe(200)
      expect(fetch).not.toHaveBeenCalled()
      // A proof for another address is no proof: the challenge decides, and refuses.
      const elsewhere = await requestCode(flow, { [PROOF_HEADER]: await signProof(secret, { method: 'POST', path: SEND, subject: 'bob@example.com' }), 'x-captcha-response': 'XXXX.DUMMY.TOKEN.XXXX' })
      expect(await refusal(elsewhere)).toMatchObject({ status: 403, reason: 'bot_check' })
      const answered = await requestCode(flow, { 'x-captcha-response': 'XXXX.DUMMY.TOKEN.XXXX' })
      expect(await refusal(answered)).toMatchObject({ status: 403, reason: 'bot_check' })
    })

    it('reads Better Auth\'s own refusal of a failed answer as bot_check, for an app\'s own captcha plugin', () => {
      expect(getBackendError({ error: { status: 403, code: 'VERIFICATION_FAILED', message: 'Captcha verification failed' } })).toMatchObject({ code: 'forbidden', data: { reason: 'bot_check' }, message: 'We couldn\'t confirm you\'re a person. Try again.' })
    })
  })

  describe('verifyHuman', () => {
    const mutationCtx = { db: {}, runQuery: vi.fn(), runMutation: vi.fn() }
    const actionCtx = { ...mutationCtx, runAction: vi.fn() }

    async function refused(promise: Promise<unknown>) {
      const error = await promise.then(() => null, (cause: unknown) => cause)
      return getBackendError(error)
    }

    it('lets every call through while the deployment checks nobody', async () => {
      await expect(verifyHuman(mutationCtx, null, { action: 'waitlist' })).resolves.toBeUndefined()
      await expect(verifyHuman(mutationCtx, 'anything', { action: 'waitlist' })).resolves.toBeUndefined()
    })

    it('refuses an action name the provider would not take, whatever is set', async () => {
      for (const action of ['', 'has space', 'x'.repeat(33), 'dots.not.allowed']) {
        await expect(verifyHuman(mutationCtx, null, { action })).rejects.toThrow(TypeError)
      }
    })

    it('takes a proof signed for its action within a minute, in a query or mutation too', async () => {
      const secret = newSecret()
      vi.stubEnv('PROTECTION_PROOF_SECRET', secret)
      const proof = await signProof(secret, { method: CALL_METHOD, path: 'waitlist' })
      await expect(verifyHuman(mutationCtx, proof, { action: 'waitlist' })).resolves.toBeUndefined()
      expect(await refused(verifyHuman(mutationCtx, proof, { action: 'contact' }))).toMatchObject({ code: 'forbidden', data: { reason: 'bot_check' } })
      // Signed for another deployment: refused here.
      expect(await refused(verifyHuman(mutationCtx, await signProof(secret, { method: CALL_METHOD, path: 'waitlist', audience: new URL(OTHER_SITE).host }), { action: 'waitlist' }))).toMatchObject({ data: { reason: 'bot_check' } })
      expect(await refused(verifyHuman(mutationCtx, null, { action: 'waitlist' }))).toMatchObject({ code: 'forbidden', data: { reason: 'bot_check' } })
      // A request's proof is not a call's.
      expect(await refused(verifyHuman(mutationCtx, await signProof(secret, { method: 'POST', path: 'waitlist' }), { action: 'waitlist' }))).toMatchObject({ data: { reason: 'bot_check' } })
      vi.useFakeTimers({ now: Date.now() + 61_000 })
      expect(await refused(verifyHuman(mutationCtx, proof, { action: 'waitlist' }))).toMatchObject({ data: { reason: 'bot_check' } })
    })

    it('binds a proof to the subject a call names, read without case or edge spaces', async () => {
      const secret = newSecret()
      vi.stubEnv('PROTECTION_PROOF_SECRET', secret)
      const proof = await signProof(secret, { method: CALL_METHOD, path: 'waitlist', subject: ADA })
      await expect(verifyHuman(mutationCtx, proof, { action: 'waitlist', subject: ' Ada@Example.com ' })).resolves.toBeUndefined()
      expect(await refused(verifyHuman(mutationCtx, proof, { action: 'waitlist', subject: 'bob@example.com' }))).toMatchObject({ data: { reason: 'bot_check' } })
      // A proof for no subject passes only a call that names none.
      expect(await refused(verifyHuman(mutationCtx, await signProof(secret, { method: CALL_METHOD, path: 'waitlist' }), { action: 'waitlist', subject: ADA }))).toMatchObject({ data: { reason: 'bot_check' } })
    })

    it('takes a visitor\'s proof for a call that names no subject, and keeps the visitor for jobs.enqueue in the same call', async () => {
      const secret = newSecret()
      vi.stubEnv('PROTECTION_PROOF_SECRET', secret)
      const visitor = `${'V'.repeat(21)}x`
      const proof = withVisitor(await signProof(secret, { method: VISITOR_METHOD, path: 'try-once', subject: visitor }), visitor)
      const ctx = { db: {} }
      await expect(verifyHuman(ctx, proof, { action: 'try-once' })).resolves.toBeUndefined()
      expect(provenVisitor(ctx)).toBe(visitor)
      // A wrapped ctx that keeps the call's db reads the same visitor; another call's does not.
      expect(provenVisitor({ db: ctx.db })).toBe(visitor)
      expect(provenVisitor({ db: {} })).toBeUndefined()
      // Bound to the browser, never to a subject a call names.
      expect(await refused(verifyHuman({ db: {} }, proof, { action: 'try-once', subject: ADA }))).toMatchObject({ data: { reason: 'bot_check' } })
      // Another visitor's id put on it, or a subject's proof passed off as a visitor's, is refused.
      expect(await refused(verifyHuman({ db: {} }, withVisitor(proof.slice(0, -(visitor.length + 1)), 'W'.repeat(22)), { action: 'try-once' }))).toMatchObject({ data: { reason: 'bot_check' } })
      const lower = visitor.toLowerCase()
      const forSubject = await signProof(secret, { method: CALL_METHOD, path: 'try-once', subject: lower })
      const passedOff = { db: {} }
      expect(await refused(verifyHuman(passedOff, withVisitor(forSubject, lower), { action: 'try-once' }))).toMatchObject({ data: { reason: 'bot_check' } })
      expect(provenVisitor(passedOff)).toBeUndefined()
    })

    it('verifies a challenge answer in an action, never in a query or mutation, which cannot fetch', async () => {
      const fetch = siteverify()
      vi.stubEnv('PROTECTION_CHALLENGE_SECRET_KEY', PASSING_KEY)
      await expect(verifyHuman(actionCtx, 'XXXX.DUMMY.TOKEN.XXXX', { action: 'contact' })).resolves.toBeUndefined()
      expect(JSON.parse(String(fetch.mock.calls[0]![1]!.body))).toMatchObject({ secret: PASSING_KEY, response: 'XXXX.DUMMY.TOKEN.XXXX' })
      fetch.mockClear()
      expect(await refused(verifyHuman(mutationCtx, 'XXXX.DUMMY.TOKEN.XXXX', { action: 'contact' }))).toMatchObject({ data: { reason: 'bot_check' } })
      expect(fetch).not.toHaveBeenCalled()
    })

    it('refuses a failed answer, and an answer given for another action under a real key', async () => {
      const fetch = siteverify()
      vi.stubEnv('PROTECTION_CHALLENGE_SECRET_KEY', FAILING_KEY)
      expect(await refused(verifyHuman(actionCtx, 'XXXX.DUMMY.TOKEN.XXXX', { action: 'contact' }))).toMatchObject({ code: 'forbidden', data: { reason: 'bot_check' } })
      const realKey = `0x${randomBytes(16).toString('hex')}`
      vi.stubEnv('PROTECTION_CHALLENGE_SECRET_KEY', realKey)
      fetch.mockImplementation(async () => Response.json({ success: true, action: 'waitlist' }))
      expect(await refused(verifyHuman(actionCtx, 'token', { action: 'contact' }))).toMatchObject({ data: { reason: 'bot_check' } })
      await expect(verifyHuman(actionCtx, 'token', { action: 'waitlist' })).resolves.toBeUndefined()
    })

    it('refuses as unavailable when the provider cannot be reached', async () => {
      siteverify({ down: true })
      vi.stubEnv('PROTECTION_CHALLENGE_SECRET_KEY', PASSING_KEY)
      expect(await refused(verifyHuman(actionCtx, 'XXXX.DUMMY.TOKEN.XXXX', { action: 'contact' }))).toMatchObject({ code: 'unavailable', data: { service: 'protection', reason: 'provider_refused' } })
    })

    it('takes either with both secrets set', async () => {
      siteverify()
      const secret = newSecret()
      vi.stubEnv('PROTECTION_PROOF_SECRET', secret)
      vi.stubEnv('PROTECTION_CHALLENGE_SECRET_KEY', PASSING_KEY)
      await expect(verifyHuman(actionCtx, await signProof(secret, { method: CALL_METHOD, path: 'referral' }), { action: 'referral' })).resolves.toBeUndefined()
      await expect(verifyHuman(actionCtx, 'XXXX.DUMMY.TOKEN.XXXX', { action: 'referral' })).resolves.toBeUndefined()
    })
  })
})

describe('on the app\'s server', () => {
  /**
   * The app: the gate as global middleware (it answers the proof route too),
   * and a stand-in proxy that echoes what it would forward, as the base
   * module's auth proxy reads it (`event.req`, from `nuxt/server`).
   */
  async function app(): Promise<App> {
    const { default: gate } = await import('../../src/runtime/server/protection/gate')
    // The same module instance as the gate's (the modules reset per test): one
    // request's event, and its `req`, is shared by every handler, as in Nitro.
    const { defineEventHandler } = await import('nuxt/server')
    const instance = createApp()
    instance.use(gate as never)
    instance.use('/api/auth', defineEventHandler(async (event: { req: Request }) => {
      return { forwarded: event.req.headers.get(PROOF_HEADER), client: event.req.headers.get(CLIENT_ADDRESS_HEADER), body: await event.req.text() }
    }) as never)
    return instance
  }

  /** POST through the app, as a Node server (`plain`) or an edge runtime (`web`) receives it. */
  async function post(shape: 'plain' | 'web', path: string, body: unknown = { email: 'ada@example.com' }, headers: Record<string, string> = {}) {
    const instance = await app()
    const init = { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }
    if (shape === 'web') {
      const response = await toWebHandler(instance)(new Request(`${ORIGIN}${path}`, init))
      return { status: response.status, body: await response.json() as Record<string, unknown>, cookies: response.headers.getSetCookie() }
    }
    const response = await toPlainHandler(instance)({ method: 'POST', path, headers: { host: 'app.example.com', ...init.headers }, body: init.body })
    // A handler that returns a Response hands its body over as a stream.
    const text = typeof response.body === 'string' ? response.body : await new Response(response.body as BodyInit).text()
    const cookies = (response.headers as Array<[string, string]>).filter(([name]) => name.toLowerCase() === 'set-cookie').map(([, value]) => value)
    return { status: response.status, body: JSON.parse(text) as Record<string, unknown>, cookies }
  }

  /** GET through the app, from a client the host's proxy names in `x-forwarded-for`. */
  async function get(shape: 'plain' | 'web', path: string, headers: Record<string, string> = {}) {
    const instance = await app()
    if (shape === 'web') {
      const response = await toWebHandler(instance)(new Request(`${ORIGIN}${path}`, { headers }))
      return await response.json() as Record<string, unknown>
    }
    const response = await toPlainHandler(instance)({ method: 'GET', path, headers: { host: 'app.example.com', ...headers } })
    const text = typeof response.body === 'string' ? response.body : await new Response(response.body as BodyInit).text()
    return JSON.parse(text) as Record<string, unknown>
  }

  let secret: string

  beforeEach(() => {
    vi.resetModules()
    secret = randomBytes(32).toString('base64')
    vi.stubEnv('VERCEL', '1')
    vi.stubEnv('PROTECTION_PROOF_SECRET', secret)
    checkBotId.mockReset().mockResolvedValue({ isBot: false, isHuman: true, isVerifiedBot: false, bypassed: false })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  describe.each(['plain', 'web'] as const)('the bot check in front of the auth proxy (%s request)', (shape) => {
    it('forwards a person\'s code request with a proof signed for its method, path, address and deployment, and its body intact', async () => {
      const { status, body } = await post(shape, SEND, { email: ' Ada@Example.com', type: 'sign-in' })
      expect(status).toBe(200)
      expect(checkBotId).toHaveBeenCalledOnce()
      expect(await verifyProof(secret, body.forwarded as string, { method: 'POST', path: SEND, subject: ADA })).toEqual({ ok: true })
      expect(await verifyProof(secret, body.forwarded as string, { method: 'POST', path: SEND, subject: 'bob@example.com' })).toEqual({ ok: false, reason: 'mismatch' })
      expect(await verifyProof(secret, body.forwarded as string, { method: 'POST', path: SEND, subject: ADA, audience: new URL(OTHER_SITE).host })).toEqual({ ok: false, reason: 'mismatch' })
      // Reading the address left the body for the proxy to forward.
      expect(JSON.parse(body.body as string)).toEqual({ email: ' Ada@Example.com', type: 'sign-in' })
    })

    it('refuses a bot before the proxy runs, as the deployment would', async () => {
      checkBotId.mockResolvedValue({ isBot: true, isHuman: false, isVerifiedBot: false, bypassed: false })
      expect(await post(shape, SEND)).toMatchObject({ status: 403, body: { code: 'forbidden', reason: 'bot_check' } })
      // A verified bot (a crawler, an agent) asks for no sign-in code either.
      checkBotId.mockResolvedValue({ isBot: true, isHuman: false, isVerifiedBot: true, bypassed: false })
      expect(await post(shape, SEND)).toMatchObject({ status: 403, body: { reason: 'bot_check' } })
    })

    it('signs the client\'s address into every auth request, a GET included, for the deployment the proxy forwards to', async () => {
      const CHALLENGE = '/api/auth/passkey/generate-authenticate-options'
      const { client } = await get(shape, CHALLENGE, { 'x-forwarded-for': '203.0.113.9' })
      expect(await readClientAddress(secret, client as string, 'happy-otter-123.convex.site')).toBe('203.0.113.9')
      expect(await readClientAddress(secret, client as string, new URL(OTHER_SITE).host)).toBeNull()
      // One the caller wrote is replaced, and without a secret dropped.
      const replaced = await get(shape, CHALLENGE, { 'x-forwarded-for': '203.0.113.9', [CLIENT_ADDRESS_HEADER]: '198.51.100.1;v1.1.forged' })
      expect(await readClientAddress(secret, replaced.client as string, 'happy-otter-123.convex.site')).toBe('203.0.113.9')
      vi.stubEnv('PROTECTION_PROOF_SECRET', '')
      expect((await get(shape, CHALLENGE, { 'x-forwarded-for': '203.0.113.9', [CLIENT_ADDRESS_HEADER]: '198.51.100.1;v1.1.forged' })).client).toBeNull()
    })

    it('never forwards a proof the caller wrote', async () => {
      // With a secret, the server's own proof replaces it; without one, it is dropped all the same.
      const signed = await post(shape, SEND, undefined, { [PROOF_HEADER]: 'v1.1.forged' })
      expect(await verifyProof(secret, signed.body.forwarded as string, { method: 'POST', path: SEND, subject: ADA })).toEqual({ ok: true })
      vi.stubEnv('PROTECTION_PROOF_SECRET', '')
      const unsigned = await post(shape, SEND, undefined, { [PROOF_HEADER]: 'v1.1.forged' })
      expect(unsigned.body.forwarded).toBeNull()
    })

    it('refuses as unavailable when BotID cannot check, rather than let the request through unchecked', async () => {
      checkBotId.mockRejectedValue(new Error('The \'x-vercel-oidc-token\' header is missing from the request.'))
      expect(await post(shape, SEND)).toMatchObject({ status: 503, body: { code: 'unavailable', service: 'protection', reason: 'provider_refused' } })
    })

    it('checks only the protected routes, and only their POSTs', async () => {
      const other = await post(shape, '/api/auth/sign-in/email-otp')
      expect(other.body.forwarded).toBeNull()
      expect(checkBotId).not.toHaveBeenCalled()
    })

    it('runs no check off Vercel, signs nothing it did not check, and says once that its proof secret signs nothing', async () => {
      vi.stubEnv('VERCEL', '')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { body } = await post(shape, SEND, undefined, { [PROOF_HEADER]: 'v1.1.forged' })
      expect(checkBotId).not.toHaveBeenCalled()
      expect(body.forwarded).toBeNull()
      await post(shape, SEND)
      expect(warn).toHaveBeenCalledOnce()
      expect(String(warn.mock.calls[0]![0])).toContain('not on Vercel')
    })

    it('runs no check on Vercel when the build had no botid to wire, and says so once', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      runtimeConfig.public.backend.botDetection = false
      try {
        const { body } = await post(shape, SEND, undefined, { [PROOF_HEADER]: 'v1.1.forged' })
        expect(checkBotId).not.toHaveBeenCalled()
        expect(body.forwarded).toBeNull()
        await post(shape, SEND)
        expect(warn).toHaveBeenCalledOnce()
        expect(String(warn.mock.calls[0]![0])).toContain('without botid installed')
      }
      finally {
        runtimeConfig.public.backend.botDetection = true
      }
    })

    it('says nothing of an unsigned proof off Vercel when a challenge does the work', async () => {
      vi.stubEnv('VERCEL', '')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      runtimeConfig.public.backend.challengeSiteKey = '1x00000000000000000000AA'
      try {
        expect((await post(shape, SEND)).body.forwarded).toBeNull()
        expect(warn).not.toHaveBeenCalled()
      }
      finally {
        runtimeConfig.public.backend.challengeSiteKey = ''
      }
    })
  })

  describe('the proof route, for the calls that skip the app\'s server', () => {
    it('binds a call that names no subject to the browser: a signed HttpOnly visitor cookie, and a proof for that visitor', async () => {
      const { status, body, cookies } = await post('plain', HUMAN_PROOF_ROUTE, { action: 'try-once' })
      expect(status).toBe(200)
      const proof = body.proof as string
      const visitor = proofVisitor(proof)!
      expect(visitor).toMatch(/^[\w-]{22}$/)
      const signed = proof.slice(0, -(visitor.length + 1))
      expect(await verifyProof(secret, signed, { method: VISITOR_METHOD, path: 'try-once', subject: visitor })).toEqual({ ok: true })
      expect(await verifyProof(secret, signed, { method: VISITOR_METHOD, path: 'contact', subject: visitor })).toEqual({ ok: false, reason: 'mismatch' })
      // Over plain HTTP the cookie has no __Host- prefix; it is HttpOnly, Lax, for the whole site, for a year.
      expect(cookies).toHaveLength(1)
      const [cookie, ...attributes] = cookies[0]!.split('; ')
      expect(cookie).toMatch(new RegExp(`^backend\\.visitor=${visitor}\\.[\\w-]{43}$`))
      expect(attributes).toEqual(['Max-Age=31536000', 'Path=/', 'HttpOnly', 'SameSite=Lax'])
      // The deployment reads the same visitor from it, and only under the same secret.
      vi.stubEnv('CONVEX_SITE_URL', SITE)
      expect(await requestVisitor(`other=1; ${cookie}`, 'http')).toBe(visitor)
      // Over HTTPS the unprefixed name is never read.
      expect(await requestVisitor(`other=1; ${cookie}`, 'https')).toBeNull()
      vi.stubEnv('PROTECTION_PROOF_SECRET', newSecret())
      expect(await requestVisitor(cookie, 'http')).toBeNull()
      vi.stubEnv('PROTECTION_PROOF_SECRET', secret)

      // The same browser keeps its visitor, and is set no new cookie.
      const again = await post('plain', HUMAN_PROOF_ROUTE, { action: 'try-once' }, { cookie: cookie! })
      expect(proofVisitor(again.body.proof as string)).toBe(visitor)
      expect(again.cookies).toEqual([])
    })

    it('mints a new visitor for a cookie whose MAC does not hold, or that another deployment signed', async () => {
      const forged = `backend.visitor=${'A'.repeat(22)}.${'B'.repeat(43)}`
      const elsewhere = `backend.visitor=${await signVisitor(secret, 'C'.repeat(22), new URL(OTHER_SITE).host)}`
      for (const cookie of [forged, elsewhere]) {
        const { body, cookies } = await post('plain', HUMAN_PROOF_ROUTE, { action: 'try-once' }, { cookie })
        expect(proofVisitor(body.proof as string)).not.toMatch(/^[ABC]{22}$/)
        expect(cookies).toHaveLength(1)
      }
    })

    it('sets the __Host- cookie, Secure, over HTTPS', async () => {
      const { cookies } = await post('plain', HUMAN_PROOF_ROUTE, { action: 'try-once' }, { 'x-forwarded-proto': 'https' })
      expect(cookies[0]!.split('; ')[0]).toMatch(/^__Host-backend\.visitor=/)
      expect(cookies[0]!.split('; ').slice(1)).toEqual(['Max-Age=31536000', 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax'])
    })

    it('binds the proof to the subject the call names, and sets no visitor cookie for it', async () => {
      const { body, cookies } = await post('plain', HUMAN_PROOF_ROUTE, { action: 'waitlist', subject: 'Ada@Example.com' })
      expect(cookies).toEqual([])
      expect(proofVisitor(body.proof as string)).toBeUndefined()
      expect(await verifyProof(secret, body.proof as string, { method: CALL_METHOD, path: 'waitlist', subject: ADA })).toEqual({ ok: true })
      expect(await verifyProof(secret, body.proof as string, { method: CALL_METHOD, path: 'waitlist' })).toEqual({ ok: false, reason: 'mismatch' })
    })

    it('refuses a bot, and a body that names no action or a subject that is no text', async () => {
      expect(await post('plain', HUMAN_PROOF_ROUTE, { action: 'not an action' })).toMatchObject({ status: 400, body: { code: 'invalid_input', field: 'action' } })
      expect(await post('plain', HUMAN_PROOF_ROUTE, { action: 'waitlist', subject: 42 })).toMatchObject({ status: 400, body: { code: 'invalid_input', field: 'subject' } })
      expect(await post('plain', HUMAN_PROOF_ROUTE, { action: 'waitlist', subject: 'x'.repeat(321) })).toMatchObject({ status: 400, body: { field: 'subject' } })
      checkBotId.mockResolvedValue({ isBot: true, isHuman: false, isVerifiedBot: false, bypassed: false })
      expect(await post('plain', HUMAN_PROOF_ROUTE, { action: 'waitlist' })).toMatchObject({ status: 403, body: { reason: 'bot_check' } })
    })

    it('signs nothing without a secret, or where no check runs', async () => {
      vi.stubEnv('PROTECTION_PROOF_SECRET', '')
      expect(await post('plain', HUMAN_PROOF_ROUTE, { action: 'waitlist' })).toMatchObject({ status: 200, body: { proof: null } })
      vi.stubEnv('PROTECTION_PROOF_SECRET', secret)
      vi.stubEnv('VERCEL', '')
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(await post('plain', HUMAN_PROOF_ROUTE, { action: 'waitlist' })).toMatchObject({ status: 200, body: { proof: null } })
    })
  })

  describe('the security headers, with a challenge', () => {
    /** The policy nuxt-security hands the hook, after the plugin ran. */
    async function policy(csp: Record<string, unknown>, siteKey: string) {
      runtimeConfig.public.backend.challengeSiteKey = siteKey
      const { default: plugin } = await import('../../src/runtime/server/protection/csp')
      let run: ((rules: Record<string, unknown>) => void) | undefined
      plugin({ hooks: { hook: (_name, fn) => (run = fn) } })
      const rules = { '/**': { headers: { contentSecurityPolicy: csp } } }
      run!(rules)
      runtimeConfig.public.backend.challengeSiteKey = ''
      return rules['/**'].headers.contentSecurityPolicy
    }

    it('lets the challenge\'s script in, and its frame where the policy restricts frames', async () => {
      expect(await policy({ 'script-src': ['\'self\'', '\'strict-dynamic\''], 'frame-src': '\'self\'' }, '1x00000000000000000000AA')).toEqual({
        'script-src': ['\'self\'', '\'strict-dynamic\'', 'https://challenges.cloudflare.com'],
        'frame-src': ['\'self\'', 'https://challenges.cloudflare.com'],
      })
    })

    it('leaves an unrestricted directive unrestricted, and the policy alone without a site key', async () => {
      expect(await policy({ 'script-src': ['\'self\''] }, '1x00000000000000000000AA')).toEqual({ 'script-src': ['\'self\'', 'https://challenges.cloudflare.com'] })
      expect(await policy({ 'script-src': ['\'self\''] }, '')).toEqual({ 'script-src': ['\'self\''] })
    })

    it('follows CSP\'s fallbacks: frames under child-src, and a default-src-only policy gains its own script-src and frame-src', async () => {
      expect(await policy({ 'script-src': ['\'self\''], 'child-src': ['\'self\''] }, '1x00000000000000000000AA')).toEqual({
        'script-src': ['\'self\'', 'https://challenges.cloudflare.com'],
        'child-src': ['\'self\'', 'https://challenges.cloudflare.com'],
      })
      expect(await policy({ 'default-src': '\'self\'' }, '1x00000000000000000000AA')).toEqual({
        'default-src': '\'self\'',
        'script-src': ['\'self\'', 'https://challenges.cloudflare.com'],
        'frame-src': ['\'self\'', 'https://challenges.cloudflare.com'],
      })
      // `'none'` stands alone: the origin replaces it rather than sit beside it.
      expect(await policy({ 'default-src': ['\'none\''], 'script-src': ['\'self\''] }, '1x00000000000000000000AA')).toMatchObject({ 'frame-src': ['https://challenges.cloudflare.com'] })
    })
  })
})

describe('doctor', () => {
  /** The deployment's code route as the guard answers: a proof under `secret` passes to the route's own 400, anything else is refused. */
  function deploymentTaking(secret: string | null) {
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      const proof = new Headers(init.headers).get(PROOF_HEADER)
      const passes = secret === null || (await verifyProof(secret, proof, { method: 'POST', path: SEND })).ok
      return passes
        ? Response.json({ code: 'VALIDATION_ERROR', message: 'Invalid body' }, { status: 400 })
        : Response.json({ code: 'forbidden', reason: 'bot_check' }, { status: 403 })
    })
    vi.stubGlobal('fetch', fetch)
    return fetch
  }

  const input = (overrides: Partial<ProtectionDoctorInput>): ProtectionDoctorInput => ({ env: {}, deployed: [], prod: false, local: false, siteUrl: SITE, ...overrides })
  const byId = async (overrides: Partial<ProtectionDoctorInput>) => Object.fromEntries((await protectionFindings(input(overrides))).map(found => [found.id, found]))

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('whether anything checks for bots', () => {
    it('passes in development, as test mode on a local deployment', async () => {
      expect((await byId({ local: true }))['bot-protection']).toMatchObject({ status: 'pass', capability: 'protection', message: expect.stringContaining('Test mode') })
      expect((await byId({}))['bot-protection']).toMatchObject({ status: 'pass' })
    })

    it('warns on production when the deployment takes neither proofs nor answers, or its names cannot be read', async () => {
      expect((await byId({ prod: true }))['bot-protection']).toMatchObject({ status: 'warn', message: expect.stringContaining('No bot protection is live on production') })
      expect((await byId({ prod: true, deployed: null }))['bot-protection']).toMatchObject({ status: 'warn', message: expect.stringContaining('could not be read') })
    })

    it('passes once the deployment takes either, and says which', async () => {
      deploymentTaking(null)
      expect((await byId({ prod: true, vercel: true, deployed: ['PROTECTION_PROOF_SECRET'] }))['bot-protection']).toMatchObject({ status: 'pass', message: expect.stringContaining('BotID on Vercel') })
      expect((await byId({ prod: true, deployed: ['PROTECTION_CHALLENGE_SECRET_KEY'] }))['bot-protection']).toMatchObject({ status: 'pass', message: expect.stringContaining('challenge answers') })
    })
  })

  it('warns on production when only proofs are taken and nothing says the app runs on Vercel, where they are signed', async () => {
    expect((await byId({ prod: true, deployed: ['PROTECTION_PROOF_SECRET'] }))['bot-protection']).toMatchObject({ status: 'warn', message: expect.stringContaining('says the app runs on Vercel') })
    // A challenge stands in off Vercel.
    expect((await byId({ prod: true, deployed: ['PROTECTION_PROOF_SECRET', 'PROTECTION_CHALLENGE_SECRET_KEY'] }))['bot-protection']).toMatchObject({ status: 'pass' })
  })

  describe('the proof secret both sides hold', () => {
    it('passes when the deployment takes a proof signed with the secret here, which it never sees', async () => {
      const secret = newSecret()
      const fetch = deploymentTaking(secret)
      expect((await byId({ env: { PROTECTION_PROOF_SECRET: secret }, deployed: ['PROTECTION_PROOF_SECRET'] }))['protection-proof']).toMatchObject({ status: 'pass' })
      const [url, init] = fetch.mock.calls[0]!
      expect(url).toBe(`${SITE}${SEND}`)
      // An empty body: no address, so no code is sent and no limit is spent.
      expect(init.body).toBe('{}')
      expect(JSON.stringify([url, init])).not.toContain(secret)
    })

    it('fails when the two secrets differ: every protected request would be refused', async () => {
      deploymentTaking(newSecret())
      expect((await byId({ env: { PROTECTION_PROOF_SECRET: newSecret() }, deployed: ['PROTECTION_PROOF_SECRET'] }))['protection-proof']).toMatchObject({ status: 'fail', message: expect.stringContaining('differ') })
    })

    it('warns when production shares .env.local\'s secret, and never suggests pushing development\'s value there', async () => {
      const secret = newSecret()
      deploymentTaking(secret)
      const shared = await byId({ prod: true, vercel: true, env: { PROTECTION_PROOF_SECRET: secret }, devEnv: { PROTECTION_PROOF_SECRET: `${newSecret()},${secret}` }, deployed: ['PROTECTION_PROOF_SECRET'] })
      expect(shared['protection-proof']).toMatchObject({ status: 'warn', message: expect.stringContaining('.env.local'), fixHint: expect.stringContaining('convex env set --prod') })
      expect((await byId({ prod: true, vercel: true, env: { PROTECTION_PROOF_SECRET: secret }, devEnv: { PROTECTION_PROOF_SECRET: newSecret() }, deployed: ['PROTECTION_PROOF_SECRET'] }))['protection-proof']).toMatchObject({ status: 'pass' })
      deploymentTaking(newSecret())
      expect((await byId({ prod: true, vercel: true, env: { PROTECTION_PROOF_SECRET: secret }, deployed: ['PROTECTION_PROOF_SECRET'] }))['protection-proof']).toMatchObject({ status: 'fail', fixHint: expect.not.stringContaining('env push') })
    })

    it('warns when the deployment cannot be asked', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => {
        throw new TypeError('fetch failed')
      }))
      expect((await byId({ env: { PROTECTION_PROOF_SECRET: newSecret() }, deployed: ['PROTECTION_PROOF_SECRET'] }))['protection-proof']).toMatchObject({ status: 'warn' })
      vi.stubGlobal('fetch', vi.fn(async () => new Response('Not found', { status: 404 })))
      expect(await probeProof(SITE, newSecret())).toBe('unreachable')
    })

    it('fails in development when the deployment takes proofs the dev server cannot sign, unless a challenge stands in', async () => {
      expect((await byId({ deployed: ['PROTECTION_PROOF_SECRET'] }))['protection-proof']).toMatchObject({ status: 'fail' })
      expect((await byId({ deployed: ['PROTECTION_PROOF_SECRET', 'PROTECTION_CHALLENGE_SECRET_KEY'], env: { NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY: TEST_CHALLENGE_SITE_KEYS[0]! } }))['protection-proof']).toMatchObject({ status: 'warn' })
      // On production the app's env is not visible here: it cannot be compared, and says so.
      expect((await byId({ prod: true, deployed: ['PROTECTION_PROOF_SECRET'] }))['protection-proof']).toMatchObject({ status: 'warn', message: expect.stringContaining('cannot check') })
    })

    it('warns when the app signs proofs the deployment ignores, and the push that fixes it', async () => {
      const found = await byId({ env: { PROTECTION_PROOF_SECRET: newSecret() } })
      expect(found['protection-proof']).toMatchObject({ status: 'warn', fixHint: expect.stringContaining('env push') })
      expect(found['deployment-protection-proof-secret']).toMatchObject({ status: 'warn' })
    })

    it('warns about a short secret', async () => {
      expect((await byId({ env: { PROTECTION_PROOF_SECRET: 'short' }, deployed: ['PROTECTION_PROOF_SECRET'] }))['protection-proof']).toMatchObject({ status: 'warn', message: expect.stringContaining('32 characters') })
    })

    it('reports nothing about proofs when neither side has a secret', async () => {
      expect(await byId({})).not.toHaveProperty('protection-proof')
    })
  })

  describe('a waitlist\'s join', () => {
    it('warns on production when the deployment verifies neither a proof nor a challenge answer', async () => {
      expect((await byId({ prod: true, waitlist: true, deployed: [] }))['waitlist-bot-check']).toMatchObject({ status: 'warn', message: expect.stringContaining('nothing checks who joins') })
      expect((await byId({ prod: true, waitlist: true, deployed: null }))['waitlist-bot-check']).toMatchObject({ status: 'warn', message: expect.stringContaining('could not be read') })
    })

    it('passes when either secret stands on the deployment', async () => {
      expect((await byId({ prod: true, waitlist: true, deployed: ['PROTECTION_CHALLENGE_SECRET_KEY'] }))['waitlist-bot-check']).toMatchObject({ status: 'pass' })
      expect((await byId({ prod: true, waitlist: true, vercel: true, deployed: ['PROTECTION_PROOF_SECRET'] }))['waitlist-bot-check']).toMatchObject({ status: 'pass' })
    })

    it('says nothing in development, or for an app without a waitlist', async () => {
      expect(await byId({ waitlist: true, deployed: [] })).not.toHaveProperty('waitlist-bot-check')
      expect(await byId({ prod: true, deployed: [] })).not.toHaveProperty('waitlist-bot-check')
    })
  })

  describe('a contact form', () => {
    it('warns on production when the deployment verifies neither a proof nor a challenge answer, so the form is refused', async () => {
      expect((await byId({ prod: true, contact: true, deployed: [] }))['contact-bot-check']).toMatchObject({ status: 'warn', message: expect.stringContaining('the form is refused') })
      expect((await byId({ prod: true, contact: true, deployed: null }))['contact-bot-check']).toMatchObject({ status: 'warn', message: expect.stringContaining('could not be read') })
    })

    it('passes when either secret stands on the deployment', async () => {
      expect((await byId({ prod: true, contact: true, deployed: ['PROTECTION_CHALLENGE_SECRET_KEY'] }))['contact-bot-check']).toMatchObject({ status: 'pass' })
      expect((await byId({ prod: true, contact: true, vercel: true, deployed: ['PROTECTION_PROOF_SECRET'] }))['contact-bot-check']).toMatchObject({ status: 'pass' })
    })

    it('says nothing in development, or for an app without a contact form', async () => {
      expect(await byId({ contact: true, deployed: [] })).not.toHaveProperty('contact-bot-check')
      expect(await byId({ prod: true, deployed: [] })).not.toHaveProperty('contact-bot-check')
    })
  })

  describe('the challenge\'s two keys', () => {
    const siteKey = `0x${randomBytes(11).toString('hex')}`

    it('warns when the app shows a challenge the deployment never verifies', async () => {
      expect((await byId({ env: { NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY: siteKey } }))['protection-challenge-keys']).toMatchObject({ status: 'warn' })
    })

    it('fails when the deployment asks for answers the app never gives, and warns when a proof stands in', async () => {
      expect((await byId({ deployed: ['PROTECTION_CHALLENGE_SECRET_KEY'] }))['protection-challenge-keys']).toMatchObject({ status: 'fail' })
      deploymentTaking(null)
      expect((await byId({ deployed: ['PROTECTION_CHALLENGE_SECRET_KEY', 'PROTECTION_PROOF_SECRET'], env: { PROTECTION_PROOF_SECRET: newSecret() } }))['protection-challenge-keys']).toMatchObject({ status: 'warn' })
    })

    it('warns on production when the deployment verifies answers and the app\'s env is not visible here', async () => {
      expect((await byId({ prod: true, deployed: ['PROTECTION_CHALLENGE_SECRET_KEY'] }))['protection-challenge-keys']).toMatchObject({ status: 'warn', message: expect.stringContaining('not visible here') })
    })

    it('passes both keys, calling the provider\'s test keys test mode, and fails them on production', async () => {
      expect((await byId({ deployed: ['PROTECTION_CHALLENGE_SECRET_KEY'], env: { NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY: siteKey } }))['protection-challenge-keys']).toMatchObject({ status: 'pass' })
      expect((await byId({ deployed: ['PROTECTION_CHALLENGE_SECRET_KEY'], env: { NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY: TEST_CHALLENGE_SITE_KEYS[0]! } }))['protection-challenge-keys']).toMatchObject({ status: 'pass', message: expect.stringContaining('test mode') })
      for (const env of [{ NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY: TEST_CHALLENGE_SITE_KEYS[0]! }, { PROTECTION_CHALLENGE_SECRET_KEY: TEST_CHALLENGE_SECRET_KEYS[0]! }]) {
        expect((await byId({ prod: true, deployed: ['PROTECTION_CHALLENGE_SECRET_KEY'], env }))['protection-challenge-keys']).toMatchObject({ status: 'fail', message: expect.stringContaining('test keys') })
      }
    })

    it('reports each secret\'s presence on the deployment, never as a gap on its own', async () => {
      const found = await byId({})
      expect(found['deployment-protection-proof-secret']).toMatchObject({ status: 'pass' })
      expect(found['deployment-protection-challenge-secret-key']).toMatchObject({ status: 'pass' })
      expect(await byId({ deployed: null })).not.toHaveProperty('deployment-protection-proof-secret')
    })
  })
})

describe('botid, an optional peer', () => {
  it('is found from the app\'s root, as its build would find it', async () => {
    const { botIdInstalled } = await import('../../src/nuxt/protection')
    expect(botIdInstalled(process.cwd())).toBe(true)
    expect(botIdInstalled(tmpdir())).toBe(false)
  })

  it('stands in with a client that starts nothing and a check that refuses, never a missing import', async () => {
    const absent = await import('../../src/runtime/protection/botid-absent')
    expect(absent.initBotId({ protect: [] })).toBeUndefined()
    await expect(absent.checkBotId()).rejects.toThrow('botid is not installed')
  })
})
