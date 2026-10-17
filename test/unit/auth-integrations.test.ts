import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APIError } from 'better-auth/api'
import { buildAuthOptions } from '../../src/convex/client/better-auth-options'
import { replaceEarlierCodes } from '../../src/convex/client/codes'
import { disabledRoutes } from '../../src/convex/client/guards'
import type { EmailMessage } from '../../src/convex/email-templates'
import { setupEmail } from '../../src/convex/integrations/email'

const fakeDb = {} as never

function mutationCtx() {
  return { runMutation: vi.fn(), runQuery: vi.fn(), scheduler: { runAfter: vi.fn() } } as never
}

/** An email instance over a stub component: each send is `ctx.runMutation('backend/email:send', message)`. */
const componentEmail = () => setupEmail({ backend: { email: { send: 'backend/email:send' } } } as never)

/**
 * The email instance as setupAuth receives it, with the packaged templates,
 * that records each send as a call: `(ctx, message, options)`.
 */
function emailSpy() {
  const templates = componentEmail()
  const sent = vi.fn(async (_ctx: unknown, _message: EmailMessage, _options?: { idempotencyKey?: string }) => 'email_1')
  return Object.assign(sent, {
    sendTemplate: (async (ctx: unknown, name: 'otp', data: never, options?: { idempotencyKey?: string }) =>
      options ? sent(ctx, await templates.render(name, data), options) : sent(ctx, await templates.render(name, data))) as ReturnType<typeof setupEmail>['sendTemplate'],
  })
}

// Sign-in codes go out only with a key on the deployment (or to a sandbox
// address); the tests that drop it say so.
beforeEach(() => {
  vi.stubEnv('EMAIL_API_KEY', 're_test')
})
afterEach(() => {
  vi.unstubAllEnvs()
})

type OtpSender = (data: { email: string, otp: string, type: string }) => Promise<void>

/** The emailOTP plugin's `sendVerificationOTP`, as built by the package. */
function otpSender(options: ReturnType<typeof buildAuthOptions>): OtpSender {
  const plugin = options.plugins?.find(entry => (entry as { id?: string }).id === 'email-otp') as
    { options?: { sendVerificationOTP?: OtpSender } } | undefined
  return plugin!.options!.sendVerificationOTP!
}

type OtpGuard = (request: { path: string, body?: unknown, context?: unknown }) => Promise<unknown>

/** The package's request before-hook (the OTP guard), as wired into the options. */
function otpGuard(runtime: unknown): OtpGuard {
  const options = buildAuthOptions(fakeDb, {}, runtime as never)
  return options.hooks!.before as unknown as OtpGuard
}

type RouteGuard = (request: { path: string, context?: unknown }) => Promise<unknown>

/**
 * The same before-hook, driven as the privileged-route limiter.
 * `context.session` is pre-set because `getSessionFromCtx` returns a session
 * already on the context without touching the adapter — which is exactly what
 * happens in production once the route's own middleware has resolved one.
 */
function routeGuard(runtime: unknown): RouteGuard {
  const options = buildAuthOptions(fakeDb, {}, runtime as never)
  return options.hooks!.before as unknown as RouteGuard
}

/** A hook context carrying a resolved session for `userId`. */
function signedIn(userId: string, session: Record<string, unknown> = {}) {
  return { session: { user: { id: userId, email: `${userId}@example.com` }, session: { id: 'session_1', ...session } } }
}

/** A hook context with no session and no credential: what an anonymous request carries. */
function anonymous() {
  return { session: null, authCookies: { sessionToken: { name: 'better-auth.session_token' } } }
}

/** An adapter-backed hook context (what Better Auth hands database hooks). */
function hookCtx(rows: Record<string, unknown>) {
  return {
    context: {
      adapter: {
        findOne: vi.fn(async ({ model }: { model: string }) => rows[model] ?? null),
        create: vi.fn(),
      },
    },
  }
}

const forbidden = (message: string) => expect.objectContaining({ status: 'FORBIDDEN', body: { message } })
const tooMany = expect.objectContaining({ status: 'TOO_MANY_REQUESTS' })

describe('codes, never links', () => {
  const emailOtp = () => buildAuthOptions(fakeDb).plugins.find(plugin => plugin.id === 'email-otp') as { options: Record<string, unknown> }

  it('stores a hash of each code keyed by the auth secret, which nothing reproduces without it', async () => {
    vi.stubEnv('AUTH_SECRET', undefined)
    const storeOTP = (secret?: string) => (buildAuthOptions(fakeDb, { authOptions: secret ? { secret } : {} }).plugins
      .find(plugin => plugin.id === 'email-otp') as { options: { storeOTP: { hash: (otp: string) => Promise<string> } } }).options.storeOTP
    const stored = await storeOTP('the-first-secret-that-is-long-enough').hash('123456')

    expect(stored).toBe(await storeOTP('the-first-secret-that-is-long-enough').hash('123456'))
    expect(stored).not.toBe(await storeOTP('another-secret-that-is-long-enough').hash('123456'))
    expect(stored).not.toBe(await storeOTP('the-first-secret-that-is-long-enough').hash('123457'))
    expect(stored).not.toContain('123456')
    await expect(storeOTP().hash('123456')).rejects.toThrow('AUTH_SECRET is not set')
  })

  it('changes an email with a code from the current address, then one from the new address', () => {
    expect(emailOtp().options.changeEmail).toEqual({ enabled: true, verifyCurrentEmail: true })
    expect(emailOtp().options.overrideDefaultEmailVerification).toBe(true)
  })

  it('turns Better Auth\'s in-memory limiter off unless the app turns it on', () => {
    expect(buildAuthOptions(fakeDb).rateLimit).toEqual({ enabled: false })
    expect(buildAuthOptions(fakeDb, { authOptions: { rateLimit: { enabled: true, storage: 'database' } } }).rateLimit)
      .toEqual({ enabled: true, storage: 'database' })
  })
})

describe('Better Auth cross-component integrations', () => {
  it('wires email + lifecycle hooks when integrations are provided', async () => {
    const email = emailSpy()
    const onUserCreated = vi.fn(async () => {})
    const rateLimiter = { limit: vi.fn(async () => ({ ok: true })) }
    const ctx = mutationCtx()

    const options = buildAuthOptions(fakeDb, {}, { ctx, email, rateLimiter, onUserCreated })

    // Passwordless: delete-account is wired through the transport — but there
    // is NO password-reset flow, and no link proves a mailbox: verification
    // and email change go through the code plugin (below).
    expect(options.emailVerification).toBeUndefined()
    expect(options.emailAndPassword?.sendResetPassword).toBeUndefined()
    expect(options.user?.changeEmail).toBeUndefined()
    expect(options.user?.deleteUser?.sendDeleteAccountVerification).toBeTypeOf('function')
    expect(options.databaseHooks?.user?.create?.after).toBeTypeOf('function')

    // After a user is created: a welcome email is sent (once per account,
    // however often the hook runs) and onUserCreated runs.
    await options.databaseHooks!.user!.create!.after!(
      { id: 'u1', email: 'a@b.com', name: 'Ada' } as never,
      {} as never,
    )
    expect(email).toHaveBeenCalledWith(ctx, expect.objectContaining({ to: 'a@b.com' }), { idempotencyKey: 'nuxt-backend:welcome:u1' })
    expect(onUserCreated).toHaveBeenCalledWith(ctx, { id: 'u1', email: 'a@b.com', name: 'Ada' })
  })

  it('keeps a sign-up that a failed welcome email would have broken: logged, and onUserCreated still runs', async () => {
    const email = emailSpy()
    email.mockRejectedValue(new Error('Test mode is enabled, but email address is not a valid resend test address.'))
    const onUserCreated = vi.fn(async () => {})
    const ctx = mutationCtx()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const options = buildAuthOptions(fakeDb, {}, { ctx, email, onUserCreated })
      await expect(options.databaseHooks!.user!.create!.after!({ id: 'u1', email: 'a@b.com', name: 'Ada' } as never, {} as never)).resolves.toBeUndefined()

      expect(onUserCreated).toHaveBeenCalledWith(ctx, { id: 'u1', email: 'a@b.com', name: 'Ada' })
      const logged = warn.mock.calls.flat().map(String).join('\n')
      expect(logged).toContain('auth.welcome_unsent')
      expect(logged).not.toContain('a@b.com')
    }
    finally {
      warn.mockRestore()
    }
  })

  it('leaves auth behaviour unchanged with no integrations (regression guard)', () => {
    const options = buildAuthOptions(fakeDb)

    expect(options.emailVerification).toBeUndefined()
    expect(options.emailAndPassword.sendResetPassword).toBeUndefined()
    expect(options.user?.changeEmail).toBeUndefined()
    // No email/lifecycle hooks — only the always-on workspace session hook
    // (organizations are a default feature, not an integration).
    expect(options.databaseHooks?.user).toBeUndefined()
    expect(options.databaseHooks?.session?.create?.before).toBeTypeOf('function')
  })
})

describe('workspace invitation email', () => {
  // The link origin is read from the environment: start every test from none,
  // so a SITE_URL or CONVEX_SITE_URL set on the runner can't decide the result.
  beforeEach(() => {
    vi.stubEnv('SITE_URL', undefined)
    vi.stubEnv('CONVEX_SITE_URL', undefined)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  function orgPluginOptions(options: ReturnType<typeof buildAuthOptions>) {
    const plugin = options.plugins?.find(entry => entry.id === 'organization') as
      | { options?: { sendInvitationEmail?: (data: unknown) => Promise<void> } }
      | undefined
    return plugin?.options
  }

  const invitationData = {
    id: 'inv-1',
    role: 'member',
    email: 'invitee@example.com',
    organization: { name: 'Acme' },
    invitation: { expiresAt: new Date('2026-10-20T00:00:00Z') },
    inviter: { user: { name: 'Ada', email: 'ada@example.com' } },
  }

  it('wires sendInvitationEmail through the transport with a SITE_URL accept link', async () => {
    vi.stubEnv('SITE_URL', 'https://app.example.com')
    try {
      const email = emailSpy()
      const ctx = mutationCtx()
      const options = buildAuthOptions(fakeDb, {}, { ctx, email })

      const sendInvitationEmail = orgPluginOptions(options)?.sendInvitationEmail
      expect(sendInvitationEmail).toBeTypeOf('function')

      await sendInvitationEmail!(invitationData)
      expect(email).toHaveBeenCalledWith(ctx, expect.objectContaining({
        to: 'invitee@example.com',
        subject: 'Join Acme',
      }))
      const message = (email.mock.calls[0] as unknown[])[1] as { text: string }
      expect(message.text).toContain('https://app.example.com/accept-invitation?id=inv-1')
      expect(message.text).toContain('Ada invited you to join Acme as member.')
    }
    finally {
      vi.unstubAllEnvs()
    }
  })

  it('uses a dynamic baseURL\'s fallback when SITE_URL is unset, never the config object', async () => {
    // Better Auth's multi-domain form has no single origin; stringifying it
    // would email a link that starts with "[object Object]".
    const email = emailSpy()
    const options = buildAuthOptions(
      fakeDb,
      { authOptions: { baseURL: { allowedHosts: ['app.example.com', '*.vercel.app'], fallback: 'https://app.example.com' } } },
      { ctx: mutationCtx(), email },
    )

    await orgPluginOptions(options)!.sendInvitationEmail!(invitationData)
    const message = (email.mock.calls[0] as unknown[])[1] as { text: string }
    expect(message.text).toContain('https://app.example.com/accept-invitation?id=inv-1')
    expect(message.text).not.toContain('[object Object]')
  })

  it('uses an explicit string baseURL when SITE_URL is unset', async () => {
    const email = emailSpy()
    const options = buildAuthOptions(fakeDb, { authOptions: { baseURL: 'https://app.example.com' } }, { ctx: mutationCtx(), email })

    await orgPluginOptions(options)!.sendInvitationEmail!(invitationData)
    const message = (email.mock.calls[0] as unknown[])[1] as { text: string }
    expect(message.text).toContain('https://app.example.com/accept-invitation?id=inv-1')
  })

  it('never points the accept link at the Convex site URL', async () => {
    // CONVEX_SITE_URL is Better Auth's own fallback origin (the proxied API),
    // not the app: the invitation page is not served there.
    vi.stubEnv('CONVEX_SITE_URL', 'https://happy-otter-123.convex.site')
    const email = emailSpy()
    const options = buildAuthOptions(fakeDb, {}, { ctx: mutationCtx(), email })

    await orgPluginOptions(options)!.sendInvitationEmail!(invitationData)
    const message = (email.mock.calls[0] as unknown[])[1] as { text: string }
    expect(message.text).not.toContain('convex.site')
    expect(message.text).toContain('/accept-invitation?id=inv-1')
  })

  it('honors a custom invitationPath', async () => {
    vi.stubEnv('SITE_URL', 'https://app.example.com')
    const email = emailSpy()
    const options = buildAuthOptions(fakeDb, { organization: { invitationPath: '/join' } }, { ctx: mutationCtx(), email })

    await orgPluginOptions(options)!.sendInvitationEmail!(invitationData)
    const message = (email.mock.calls[0] as unknown[])[1] as { text: string }
    expect(message.text).toContain('https://app.example.com/join?id=inv-1')
  })

  it('sends every issuance, a resend included: no idempotency key, which no second send would ever match', async () => {
    const email = emailSpy()
    const options = buildAuthOptions(fakeDb, {}, { ctx: mutationCtx(), email })
    const send = orgPluginOptions(options)!.sendInvitationEmail!

    await send(invitationData)
    await send({ ...invitationData, invitation: { expiresAt: new Date('2026-10-22T00:00:00Z') } })
    expect(email).toHaveBeenCalledTimes(2)
    expect(email.mock.calls.map(call => call[2])).toEqual([undefined, undefined])
  })

  it('a consumer-supplied sendInvitationEmail wins over the built-in one', async () => {
    const custom = vi.fn(async () => {})
    const email = emailSpy()
    const options = buildAuthOptions(
      fakeDb,
      { organization: { sendInvitationEmail: custom as never } },
      { ctx: mutationCtx(), email },
    )

    await orgPluginOptions(options)!.sendInvitationEmail!(invitationData)
    expect(custom).toHaveBeenCalled()
    expect(email).not.toHaveBeenCalled()
  })

  it('does not inject an invitation email without a transport', () => {
    const options = buildAuthOptions(fakeDb)
    expect(orgPluginOptions(options)?.sendInvitationEmail).toBeUndefined()
  })

  describe('OTP delivery without an email transport', () => {
    it('throws loudly instead of silently dropping the code', async () => {
      const send = otpSender(buildAuthOptions(fakeDb))
      await expect(send({ email: 'a@b.com', otp: '123456', type: 'sign-in' }))
        .rejects.toThrow('OTP not delivered')
    })

    it('echoes the code to the console with NUXT_BACKEND_LOG_OTP=1', async () => {
      vi.stubEnv('NUXT_BACKEND_LOG_OTP', '1')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const send = otpSender(buildAuthOptions(fakeDb))
        await expect(send({ email: 'a@b.com', otp: '123456', type: 'sign-in' })).resolves.toBeUndefined()
        expect(warn.mock.calls.flat().join('\n')).toContain('123456')
      }
      finally {
        warn.mockRestore()
        vi.unstubAllEnvs()
      }
    })

    it('delivers through the transport when one is wired', async () => {
      const email = emailSpy()
      const ctx = mutationCtx()
      const send = otpSender(buildAuthOptions(fakeDb, {}, { ctx, email }))
      await send({ email: 'a@b.com', otp: '654321', type: 'sign-in' })
      expect(email).toHaveBeenCalledWith(ctx, expect.objectContaining({ to: 'a@b.com' }))
    })
  })

  // Every send goes through the component's email module, so the question is
  // whether the deployment has the key it needs. Without it the module sends
  // nothing, and the OTP must take the no-transport path instead of vanishing
  // behind "we sent a code".
  describe('OTP delivery without EMAIL_API_KEY', () => {
    // What setupAuth builds per request, with the app's email instance.
    const otpOver = (ctx: unknown) => otpSender(buildAuthOptions(fakeDb, {}, { ctx: ctx as never, email: componentEmail() }))

    it('throws loudly, naming the missing key', async () => {
      vi.stubEnv('EMAIL_API_KEY', '')
      try {
        const ctx = mutationCtx()
        await expect(otpOver(ctx)({ email: 'a@b.com', otp: '123456', type: 'sign-in' }))
          .rejects.toThrow('EMAIL_API_KEY is not set on this deployment')
        expect((ctx as { runMutation: ReturnType<typeof vi.fn> }).runMutation).not.toHaveBeenCalled()
      }
      finally {
        vi.unstubAllEnvs()
      }
    })

    it('echoes the code with NUXT_BACKEND_LOG_OTP=1 — what the dev boot provisions', async () => {
      vi.stubEnv('EMAIL_API_KEY', '')
      vi.stubEnv('NUXT_BACKEND_LOG_OTP', '1')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        await expect(otpOver(mutationCtx())({ email: 'a@b.com', otp: '123456', type: 'sign-in' })).resolves.toBeUndefined()
        expect(warn.mock.calls.flat().join('\n')).toContain('123456')
      }
      finally {
        warn.mockRestore()
        vi.unstubAllEnvs()
      }
    })

    // The component keeps test-mode mail to a sandbox address in the sandbox
    // inbox, key or not: that copy is the code for a keyless demo or e2e run.
    it('hands a sandbox address to the component, which keeps it for the sandbox inbox', async () => {
      vi.stubEnv('EMAIL_API_KEY', '')
      try {
        const ctx = mutationCtx()
        await expect(otpOver(ctx)({ email: 'Delivered+e2e@resend.dev', otp: '123456', type: 'sign-in' })).resolves.toBeUndefined()
        expect((ctx as { runMutation: ReturnType<typeof vi.fn> }).runMutation)
          .toHaveBeenCalledWith('backend/email:send', expect.objectContaining({ to: 'Delivered+e2e@resend.dev' }))
      }
      finally {
        vi.unstubAllEnvs()
      }
    })

    it('still echoes a sandbox address\'s code with NUXT_BACKEND_LOG_OTP=1', async () => {
      vi.stubEnv('EMAIL_API_KEY', '')
      vi.stubEnv('NUXT_BACKEND_LOG_OTP', '1')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const ctx = mutationCtx()
        await otpOver(ctx)({ email: 'delivered+e2e@resend.dev', otp: '123456', type: 'sign-in' })
        expect(warn.mock.calls.flat().join('\n')).toContain('123456')
        expect((ctx as { runMutation: ReturnType<typeof vi.fn> }).runMutation).toHaveBeenCalledWith('backend/email:send', expect.anything())
      }
      finally {
        warn.mockRestore()
        vi.unstubAllEnvs()
      }
    })

    it('logs codes only for NUXT_BACKEND_LOG_OTP=1, never for another value', async () => {
      vi.stubEnv('EMAIL_API_KEY', '')
      vi.stubEnv('NUXT_BACKEND_LOG_OTP', 'false')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        await expect(otpOver(mutationCtx())({ email: 'a@b.com', otp: '123456', type: 'sign-in' }))
          .rejects.toThrow('EMAIL_API_KEY is not set on this deployment')
        const ctx = mutationCtx()
        await otpOver(ctx)({ email: 'delivered+e2e@resend.dev', otp: '654321', type: 'sign-in' })
        expect((ctx as { runMutation: ReturnType<typeof vi.fn> }).runMutation).toHaveBeenCalledWith('backend/email:send', expect.anything())
        expect(warn.mock.calls.flat().join('\n')).not.toMatch(/123456|654321/)
      }
      finally {
        warn.mockRestore()
        vi.unstubAllEnvs()
      }
    })

    it('treats a sandbox address like any other once test mode is off', async () => {
      vi.stubEnv('EMAIL_API_KEY', '')
      vi.stubEnv('EMAIL_TEST_MODE', 'false')
      try {
        const ctx = mutationCtx()
        await expect(otpOver(ctx)({ email: 'delivered+e2e@resend.dev', otp: '123456', type: 'sign-in' }))
          .rejects.toThrow('EMAIL_API_KEY is not set on this deployment')
        expect((ctx as { runMutation: ReturnType<typeof vi.fn> }).runMutation).not.toHaveBeenCalled()
      }
      finally {
        vi.unstubAllEnvs()
      }
    })

    it('sends through the component once the key is set, whatever NUXT_BACKEND_LOG_OTP says', async () => {
      vi.stubEnv('EMAIL_API_KEY', 're_test')
      vi.stubEnv('NUXT_BACKEND_LOG_OTP', '1')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const ctx = mutationCtx()
        await otpOver(ctx)({ email: 'a@b.com', otp: '123456', type: 'sign-in' })
        expect((ctx as { runMutation: ReturnType<typeof vi.fn> }).runMutation).toHaveBeenCalledWith('backend/email:send', expect.objectContaining({ to: 'a@b.com' }))
        expect(warn).not.toHaveBeenCalled()
      }
      finally {
        warn.mockRestore()
        vi.unstubAllEnvs()
      }
    })
  })
})

describe('OTP rate limits', () => {
  const otp = { email: 'Ada@Example.com', otp: '111111', type: 'sign-in' }

  it('the sender consumes no bucket — Better Auth would swallow its refusal', async () => {
    // The sender runs inside runInBackgroundOrAwait, which catches whatever it
    // throws and still answers success: a limit here would mean "code sent"
    // with no code. Every limit lives on the request instead.
    const email = emailSpy()
    const limit = vi.fn(async (_ctx: unknown, _name: string, _options?: { key?: string }) => ({ ok: false }))
    await otpSender(buildAuthOptions(fakeDb, {}, { ctx: mutationCtx(), email, rateLimiter: { limit } }))(otp)

    expect(limit).not.toHaveBeenCalled()
    expect(email).toHaveBeenCalledOnce()
  })

  it('the request guard consumes the deployment window, then the per-address bucket keyed by a digest', async () => {
    const limit = vi.fn(async (_ctx: unknown, _name: string, _options?: { key?: string }) => ({ ok: true }))
    const ctx = mutationCtx()
    await otpGuard({ ctx, rateLimiter: { limit } })({ path: '/email-otp/send-verification-otp', body: otp })

    expect(limit.mock.calls.map(call => call[1])).toEqual(['emailOtpGlobal', 'emailOtp'])
    const key = (limit.mock.calls[1] as unknown[])[2] as { key: string }
    // SHA-256 hex of the normalized address — never the address itself.
    expect(key.key).toMatch(/^[0-9a-f]{64}$/)
    expect(key.key).not.toContain('ada')
  })

  it('the request guard consumes the deployment-wide window and a closed one answers TOO_MANY_REQUESTS', async () => {
    const limit = vi.fn(async (_ctx: unknown, _name: string, _options?: { key?: string }) => ({ ok: false, retryAfter: 1000 }))
    const ctx = mutationCtx()
    const request = { path: '/email-otp/send-verification-otp', body: otp }

    const guard = otpGuard({ ctx, rateLimiter: { limit } })
    await expect(guard(request)).rejects.toThrow(APIError)
    await expect(guard(request)).rejects.toEqual(tooMany)
    expect(limit.mock.calls.map(call => call[1])).toEqual(['emailOtpGlobal', 'emailOtpGlobal'])
    expect(limit).toHaveBeenNthCalledWith(1, ctx, 'emailOtpGlobal')
  })

  it('the request guard ignores other routes and requests without an address', async () => {
    const limit = vi.fn(async (_ctx: unknown, _name: string, _options?: { key?: string }) => ({ ok: false }))
    const guard = otpGuard({ ctx: mutationCtx(), rateLimiter: { limit } })
    await guard({ path: '/sign-in/email', body: otp })
    await guard({ path: '/email-otp/send-verification-otp', body: { type: 'sign-in' } })
    expect(limit).not.toHaveBeenCalled()
  })

  it('a closed per-address bucket answers TOO_MANY_REQUESTS on the request, before any code exists', async () => {
    const limit = vi.fn(async (_ctx: unknown, name: string) => ({ ok: name === 'emailOtpGlobal' }))
    const guard = otpGuard({ ctx: mutationCtx(), rateLimiter: { limit } })

    await expect(guard({ path: '/email-otp/send-verification-otp', body: otp }))
      .rejects.toEqual(expect.objectContaining({ status: 'TOO_MANY_REQUESTS', body: { message: expect.stringContaining('Too many') } }))
  })

  it('both refusals carry the limiter\'s wait as retryAfter (ms) next to the message', async () => {
    const request = { path: '/email-otp/send-verification-otp', body: otp }
    const perAddress = vi.fn(async (_ctx: unknown, name: string) => (name === 'emailOtpGlobal' ? { ok: true } : { ok: false, retryAfter: 4200 }))
    const global = vi.fn(async () => ({ ok: false, retryAfter: 1500 }))

    await expect(otpGuard({ ctx: mutationCtx(), rateLimiter: { limit: perAddress } })(request)).rejects.toEqual(expect.objectContaining({
      status: 'TOO_MANY_REQUESTS',
      body: { message: expect.stringContaining('Too many'), retryAfter: 4200 },
    }))
    await expect(otpGuard({ ctx: mutationCtx(), rateLimiter: { limit: global } })(request)).rejects.toEqual(expect.objectContaining({
      status: 'TOO_MANY_REQUESTS',
      body: { message: expect.stringContaining('unavailable'), retryAfter: 1500 },
    }))
  })

  it('a refusal without a wait puts nothing but the message on the wire', async () => {
    const limit = vi.fn(async () => ({ ok: false }))
    const guard = otpGuard({ ctx: mutationCtx(), rateLimiter: { limit } })
    const refusal = await guard({ path: '/email-otp/send-verification-otp', body: otp }).catch((cause: unknown) => cause) as APIError
    expect(refusal).toBeInstanceOf(APIError)
    // What better-call serializes: JSON drops an undefined `retryAfter`.
    expect(JSON.parse(JSON.stringify(refusal.body))).toEqual({ message: expect.any(String) })
  })
})

describe('sign-in gate (canSignIn)', () => {
  const signIn = { email: 'ada@example.com', otp: '111111', type: 'sign-in' }
  // A deployment that delivers to real addresses, so the gate is what decides.
  beforeEach(() => {
    vi.stubEnv('EMAIL_TEST_MODE', 'false')
    vi.stubEnv('EMAIL_FROM', 'Acme <hello@acme.dev>')
  })
  const inviteOnly = vi.fn(async (_ctx: unknown, input: { isNewUser: boolean }) =>
    input.isNewUser ? { allowed: false as const, message: 'Invite only' } : true as const)

  function setup(overrides: { canSignIn?: typeof inviteOnly, userExists?: boolean, rateLimiter?: { limit: ReturnType<typeof vi.fn> } } = {}) {
    const email = emailSpy()
    const ctx = mutationCtx()
    const canSignIn = overrides.canSignIn ?? vi.fn(async () => true as const)
    const options = buildAuthOptions(fakeDb, {}, {
      ctx,
      email,
      canSignIn,
      userExists: async () => overrides.userExists ?? false,
      ...(overrides.rateLimiter ? { rateLimiter: overrides.rateLimiter } : {}),
    } as never)
    return { options, email, ctx, canSignIn }
  }

  it('is asked for sign-in codes with whether the address has an account', async () => {
    const { options, email, ctx, canSignIn } = setup()
    await otpSender(options)(signIn)
    expect(canSignIn).toHaveBeenCalledWith(ctx, { email: 'ada@example.com', isNewUser: true, purpose: 'sign-in' })
    expect(email).toHaveBeenCalledOnce()
  })

  it('is not asked for verification or change-email codes', async () => {
    const { options, email, canSignIn } = setup({ canSignIn: inviteOnly })
    await otpSender(options)({ ...signIn, type: 'email-verification' })
    await otpSender(options)({ ...signIn, type: 'change-email' })
    expect(canSignIn).not.toHaveBeenCalled()
    expect(email).toHaveBeenCalledTimes(2)
  })

  it('lets an existing address through an invite-only gate', async () => {
    const { options, email, ctx } = setup({ canSignIn: inviteOnly, userExists: true })
    await otpSender(options)(signIn)
    expect(inviteOnly).toHaveBeenCalledWith(ctx, { email: 'ada@example.com', isNewUser: false, purpose: 'sign-in' })
    expect(email).toHaveBeenCalledOnce()
  })

  it('refuses a new address before any email and before the per-address limit is consumed', async () => {
    const limit = vi.fn(async (_ctx: unknown, _name: string, _options?: { key?: string }) => ({ ok: true }))
    const { options, email } = setup({ canSignIn: inviteOnly, rateLimiter: { limit } })

    await expect(otpSender(options)(signIn)).rejects.toThrow(APIError)
    await expect(otpSender(options)(signIn)).rejects.toEqual(forbidden('Invite only'))
    expect(email).not.toHaveBeenCalled()
    // A refused address consumes no quota at all in the sender.
    expect(limit.mock.calls.map(call => call[1])).toEqual([])
  })

  it('refuses an uninvited sign-in on the request itself, before any code exists', async () => {
    const limit = vi.fn(async (_ctx: unknown, _name: string, _options?: { key?: string }) => ({ ok: true }))
    const runtime = { ctx: mutationCtx(), email: emailSpy(), rateLimiter: { limit }, canSignIn: inviteOnly, userExists: async () => false }
    const request = { path: '/email-otp/send-verification-otp', body: signIn }

    await expect(otpGuard(runtime)(request)).rejects.toEqual(forbidden('Invite only'))
    expect(limit.mock.calls.map(call => call[1])).toEqual(['emailOtpGlobal'])
    // Existing accounts pass, and non-sign-in codes are never gated.
    await expect(otpGuard({ ...runtime, userExists: async () => true })(request)).resolves.toBeUndefined()
    await expect(otpGuard(runtime)({ ...request, body: { ...signIn, type: 'email-verification' } })).resolves.toBeUndefined()
  })

  it('wires the guard as the before-hook, ahead of a consumer hook', async () => {
    const consumerBefore = vi.fn(async () => 'consumer')
    const options = buildAuthOptions(fakeDb, { authOptions: { hooks: { before: consumerBefore as never } } }, {
      ctx: mutationCtx(), email: emailSpy(), canSignIn: inviteOnly, userExists: async () => false,
    } as never)
    const before = options.hooks!.before as unknown as (ctx: unknown) => Promise<unknown>

    await expect(before({ path: '/email-otp/send-verification-otp', body: signIn })).rejects.toEqual(forbidden('Invite only'))
    expect(consumerBefore).not.toHaveBeenCalled()
    await expect(before({ path: '/get-session', body: undefined })).resolves.toBe('consumer')
  })

  it('falls back to the default refusal message', async () => {
    const { options } = setup({ canSignIn: vi.fn(async () => ({ allowed: false as const })) as never })
    await expect(otpSender(options)(signIn)).rejects.toEqual(forbidden('Sign-in is by invitation right now.'))
  })

  it('user.create.before is the backstop for every account-creation path', async () => {
    const { options, ctx, canSignIn } = setup({ canSignIn: inviteOnly })
    const before = options.databaseHooks!.user!.create!.before!
    await expect(before({ email: 'new@example.com' } as never, null)).rejects.toEqual(forbidden('Invite only'))
    expect(canSignIn).toHaveBeenCalledWith(ctx, { email: 'new@example.com', isNewUser: true, purpose: 'user-create' })

    const open = setup()
    await expect(open.options.databaseHooks!.user!.create!.before!({ email: 'new@example.com' } as never, null)).resolves.toBeUndefined()
  })

  it('session.create.before consults the gate for the existing account and keeps the workspace patch', async () => {
    const { options, ctx, canSignIn } = setup({ canSignIn: inviteOnly })
    const before = options.databaseHooks!.session!.create!.before!
    const context = hookCtx({ user: { email: 'ada@example.com' }, member: { organizationId: 'org-1' } })

    const result = await before({ userId: 'u1' } as never, context as never)

    expect(canSignIn).toHaveBeenCalledWith(ctx, { email: 'ada@example.com', isNewUser: false, purpose: 'session' })
    expect(result).toEqual({ data: { userId: 'u1', activeOrganizationId: 'org-1' } })
  })

  it('session.create.before refuses when the gate says no, and fails closed when the account cannot be read', async () => {
    const refuseAll = vi.fn(async () => ({ allowed: false as const, message: 'Banned' }))
    const { options } = setup({ canSignIn: refuseAll as never })
    const before = options.databaseHooks!.session!.create!.before!

    await expect(before({ userId: 'u1' } as never, hookCtx({ user: { email: 'ada@example.com' }, member: { organizationId: 'org-1' } }) as never)).rejects.toEqual(forbidden('Banned'))
    await expect(before({ userId: 'u1' } as never, hookCtx({ member: { organizationId: 'org-1' } }) as never)).rejects.toEqual(forbidden('Sign-in is by invitation right now.'))
  })

  it('adds no gate hooks without a request ctx (the static options object)', () => {
    const options = buildAuthOptions(fakeDb, {}, { canSignIn: inviteOnly } as never)
    expect(options.databaseHooks?.user).toBeUndefined()
  })
})

describe('email that would not arrive', () => {
  // Better Auth answers success whatever the sender throws, so the request is
  // where a code or an invitation the transport would drop gets refused.
  const otpRequest = (email: string) => ({ path: '/email-otp/send-verification-otp', body: { email, type: 'sign-in' } })
  const inviteRequest = (email: string) => ({ path: '/organization/invite-member', body: { email, role: 'member' }, context: signedIn('user_inviter') })
  const refused = (message: string) => expect.objectContaining({ status: 'BAD_REQUEST', body: { message } })
  const testModeRefusal = refused('This app is in test mode and only emails test addresses right now.')
  const unconfiguredRefusal = refused('This app can\'t send email yet.')
  const runtime = () => ({ ctx: mutationCtx(), email: emailSpy() })
  let warn: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    warn.mockRestore()
  })

  it('refuses a real address in test mode, and logs the setting to change without the address', async () => {
    await expect(otpGuard(runtime())(otpRequest('ada@example.com'))).rejects.toEqual(testModeRefusal)
    await expect(otpGuard(runtime())(inviteRequest('ada@example.com'))).rejects.toEqual(testModeRefusal)
    const logged = warn.mock.calls.flat().join('\n')
    expect(logged).toContain('email.undeliverable')
    expect(logged).toContain('EMAIL_TEST_MODE')
    expect(logged).not.toContain('ada@example.com')
  })

  it('lets a sandbox address through in test mode', async () => {
    await expect(otpGuard(runtime())(otpRequest('Delivered+e2e@resend.dev'))).resolves.toBeUndefined()
    await expect(otpGuard(runtime())(inviteRequest('delivered@resend.dev'))).resolves.toBeUndefined()
  })

  it('lets a keyless deployment send a code to a sandbox address, kept for the sandbox inbox', async () => {
    vi.stubEnv('EMAIL_API_KEY', '')
    await expect(otpGuard(runtime())(otpRequest('delivered+demo@resend.dev'))).resolves.toBeUndefined()
    await expect(otpGuard(runtime())(otpRequest('ada@example.com'))).rejects.toEqual(unconfiguredRefusal)
    expect(warn.mock.calls.flat().join('\n')).toContain('EMAIL_API_KEY')
  })

  it('lets a keyless dev deployment send any code it echoes to the logs, but no invitation', async () => {
    vi.stubEnv('EMAIL_API_KEY', '')
    vi.stubEnv('NUXT_BACKEND_LOG_OTP', '1')
    await expect(otpGuard(runtime())(otpRequest('ada@example.com'))).resolves.toBeUndefined()
    await expect(otpGuard(runtime())(inviteRequest('ada@example.com'))).rejects.toEqual(unconfiguredRefusal)
  })

  it('out of test mode, refuses a real address until EMAIL_FROM names a sender', async () => {
    vi.stubEnv('EMAIL_TEST_MODE', 'false')
    await expect(otpGuard(runtime())(otpRequest('ada@example.com'))).rejects.toEqual(unconfiguredRefusal)
    // The fallback sender still reaches the provider's test addresses.
    await expect(otpGuard(runtime())(otpRequest('delivered@resend.dev'))).resolves.toBeUndefined()
    expect(warn.mock.calls.flat().join('\n')).toContain('EMAIL_FROM')
    vi.stubEnv('EMAIL_FROM', 'Acme <hello@acme.dev>')
    await expect(otpGuard(runtime())(otpRequest('ada@example.com'))).resolves.toBeUndefined()
  })

  it('asks the sign-in gate first, so the app\'s own refusal is the one a person reads', async () => {
    const canSignIn = vi.fn(async () => ({ allowed: false as const, message: 'Use your work address.' }))
    await expect(otpGuard({ ...runtime(), canSignIn })(otpRequest('ada@example.com'))).rejects.toEqual(forbidden('Use your work address.'))
    expect(canSignIn).toHaveBeenCalled()
  })

  it('leaves alone the email the app sends itself', async () => {
    const before = (options: ReturnType<typeof buildAuthOptions>) => options.hooks!.before as unknown as OtpGuard
    const ownInvitations = buildAuthOptions(fakeDb, { organization: { sendInvitationEmail: vi.fn() as never } }, runtime())
    await expect(before(ownInvitations)(inviteRequest('ada@example.com'))).resolves.toBeUndefined()
    const ownOrganizationPlugin = buildAuthOptions(fakeDb, { authOptions: { plugins: [{ id: 'organization' } as never] } }, runtime())
    await expect(before(ownOrganizationPlugin)(inviteRequest('ada@example.com'))).resolves.toBeUndefined()
    const ownCodes = buildAuthOptions(fakeDb, { authOptions: { plugins: [{ id: 'email-otp' } as never] } }, runtime())
    await expect(before(ownCodes)(otpRequest('ada@example.com'))).resolves.toBeUndefined()
  })

  it('judges an invitation only once the inviter is known, and an anonymous request logs nothing', async () => {
    await expect(otpGuard(runtime())({ ...inviteRequest('ada@example.com'), context: anonymous() })).resolves.toBeUndefined()
    expect(warn).not.toHaveBeenCalled()
  })

  it('names the fallback sender\'s real reach in the cause it logs', async () => {
    vi.stubEnv('EMAIL_TEST_MODE', 'false')
    await expect(otpGuard(runtime())(otpRequest('ada@example.com'))).rejects.toEqual(unconfiguredRefusal)
    expect(warn.mock.calls.flat().join('\n')).toContain('reaches only the provider\'s test addresses and your own account\'s address')
  })
})

describe('account deletion', () => {
  const user = { id: 'u1', email: 'ada@example.com', name: 'Ada' }

  it('chains onUserDeleted after a consumer afterDelete', async () => {
    const order: string[] = []
    const afterDelete = vi.fn(async () => {
      order.push('consumer')
    })
    const onUserDeleted = vi.fn(async () => {
      order.push('package')
    })
    const ctx = mutationCtx()
    const options = buildAuthOptions(
      fakeDb,
      { authOptions: { user: { deleteUser: { afterDelete } } } },
      { ctx, email: emailSpy(), onUserDeleted },
    )

    const request = new Request('https://app.example.com/api/auth/delete-user')
    await options.user!.deleteUser!.afterDelete!({ ...user, emailVerified: true, createdAt: new Date(), updatedAt: new Date() }, request)

    expect(order).toEqual(['consumer', 'package'])
    expect(afterDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1' }), request)
    expect(onUserDeleted).toHaveBeenCalledWith(ctx, user)
    expect(options.user!.deleteUser!.enabled).toBe(true)
  })

  it('keeps the emailed confirmation when the consumer only adds a beforeDelete', () => {
    const beforeDelete = vi.fn(async () => {})
    const options = buildAuthOptions(
      fakeDb,
      { authOptions: { user: { deleteUser: { beforeDelete } } } },
      { ctx: mutationCtx(), email: emailSpy() },
    )
    expect(options.user!.deleteUser).toMatchObject({ enabled: true, beforeDelete })
    expect(options.user!.deleteUser!.sendDeleteAccountVerification).toBeTypeOf('function')
    expect(options.user!.deleteUser!.afterDelete).toBeUndefined()
  })

  it('runs onUserDeleted alone without a transport, and the consumer’s enabled: false still wins', async () => {
    const onUserDeleted = vi.fn(async () => {})
    const ctx = mutationCtx()
    const options = buildAuthOptions(fakeDb, {}, { ctx, onUserDeleted })
    expect(options.user!.deleteUser!.sendDeleteAccountVerification).toBeUndefined()
    await options.user!.deleteUser!.afterDelete!({ ...user, emailVerified: true, createdAt: new Date(), updatedAt: new Date() })
    expect(onUserDeleted).toHaveBeenCalledWith(ctx, user)

    const disabled = buildAuthOptions(fakeDb, { authOptions: { user: { deleteUser: { enabled: false } } } }, { ctx, onUserDeleted })
    expect(disabled.user!.deleteUser!.enabled).toBe(false)
  })

  it('leaves deleteUser unset when nothing opts in', () => {
    expect(buildAuthOptions(fakeDb).user?.deleteUser).toBeUndefined()
  })
})

describe('consumer databaseHooks compose with the package hooks', () => {
  it('runs a consumer user.create.after after the welcome email and onUserCreated', async () => {
    const order: string[] = []
    const email = emailSpy()
    email.mockImplementation(async () => {
      order.push('welcome')
      return 'email_1'
    })
    const onUserCreated = vi.fn(async () => {
      order.push('onUserCreated')
    })
    const consumerAfter = vi.fn(async () => {
      order.push('consumer')
    })
    const options = buildAuthOptions(
      fakeDb,
      { authOptions: { databaseHooks: { user: { create: { after: consumerAfter } } } } },
      { ctx: mutationCtx(), email, onUserCreated },
    )

    await options.databaseHooks!.user!.create!.after!({ id: 'u1', email: 'a@b.com', name: 'Ada' } as never, null)
    expect(order).toEqual(['welcome', 'onUserCreated', 'consumer'])
  })

  it('hands a consumer session.create.before the session with its active workspace', async () => {
    const seen: unknown[] = []
    const consumerBefore = vi.fn(async (session: Record<string, unknown>) => {
      seen.push(session)
      return { data: { ...session, source: 'consumer' } }
    })
    const options = buildAuthOptions(fakeDb, {
      authOptions: { databaseHooks: { session: { create: { before: consumerBefore as never } } } },
    })

    const result = await options.databaseHooks!.session!.create!.before!(
      { userId: 'u1' } as never,
      hookCtx({ member: { organizationId: 'org-1' } }) as never,
    )
    expect(seen).toEqual([{ userId: 'u1', activeOrganizationId: 'org-1' }])
    expect(result).toEqual({ data: { userId: 'u1', activeOrganizationId: 'org-1', source: 'consumer' } })
  })

  it('keeps consumer hooks for models the package does not touch', () => {
    const accountAfter = vi.fn(async () => {})
    const options = buildAuthOptions(fakeDb, {
      authOptions: { databaseHooks: { account: { create: { after: accountAfter } } } },
    })
    expect(options.databaseHooks!.account!.create!.after).toBeTypeOf('function')
    expect(options.databaseHooks!.session!.create!.before).toBeTypeOf('function')
  })
})

describe('privileged route rate limits', () => {
  const admin = { path: '/admin/ban-user', context: signedIn('user_admin') }

  it('an admin route consumes the admin bucket keyed by the administrator', async () => {
    const limit = vi.fn(async (_ctx: unknown, _name: string, _options?: { key?: string }) => ({ ok: true }))
    const ctx = mutationCtx()
    await routeGuard({ ctx, rateLimiter: { limit } })(admin)

    expect(limit).toHaveBeenCalledExactlyOnceWith(ctx, 'admin', { key: 'user_admin' })
  })

  it('a closed admin bucket answers TOO_MANY_REQUESTS before the route runs', async () => {
    const limit = vi.fn(async (_ctx: unknown, _name: string, _options?: { key?: string }) => ({ ok: false, retryAfter: 1000 }))
    const guard = routeGuard({ ctx: mutationCtx(), rateLimiter: { limit } })

    await expect(guard(admin)).rejects.toThrow(APIError)
    await expect(guard(admin)).rejects.toEqual(tooMany)
  })

  it('every /admin/* route that acts on someone else is covered', async () => {
    const limit = vi.fn(async (_ctx: unknown, _name: string, _options?: { key?: string }) => ({ ok: true }))
    const guard = routeGuard({ ctx: mutationCtx(), rateLimiter: { limit } })
    const paths = [
      '/admin/list-users',
      '/admin/create-user',
      '/admin/update-user',
      '/admin/set-role',
      '/admin/unban-user',
      '/admin/impersonate-user',
      '/admin/list-user-sessions',
      '/admin/revoke-user-session',
      '/admin/revoke-user-sessions',
      '/admin/remove-user',
      '/admin/set-user-password',
      '/admin/get-user',
    ]
    for (const path of paths) await guard({ path, context: signedIn('user_admin') })

    expect(limit.mock.calls.map(call => call[1])).toEqual(paths.map(() => 'admin'))
  })

  it('leaves the escape hatch and the read-only check alone', async () => {
    const limit = vi.fn(async (_ctx: unknown, _name: string, _options?: { key?: string }) => ({ ok: false }))
    const guard = routeGuard({ ctx: mutationCtx(), rateLimiter: { limit } })

    // Throttling the way *out* of an impersonated session would strand the
    // administrator inside someone else's account.
    await guard({ path: '/admin/stop-impersonating', context: signedIn('user_admin') })
    await guard({ path: '/admin/has-permission', context: signedIn('user_admin') })
    expect(limit).not.toHaveBeenCalled()
  })

  it('an invitation consumes the inviter\'s bucket, then the deployment ceiling', async () => {
    const limit = vi.fn(async (_ctx: unknown, _name: string, _options?: { key?: string }) => ({ ok: true }))
    const ctx = mutationCtx()
    await routeGuard({ ctx, rateLimiter: { limit } })({
      path: '/organization/invite-member',
      context: signedIn('user_inviter'),
    })

    // Per-inviter first, unkeyed ceiling second.
    expect(limit.mock.calls).toEqual([
      [ctx, 'invitation', { key: 'user_inviter' }],
      [ctx, 'invitationGlobal'],
    ])
  })

  it('a refused inviter never spends the deployment ceiling', async () => {
    // The per-caller bucket closes first, so one account's excess cannot eat
    // the budget every other workspace shares.
    const limit = vi.fn(async (_ctx: unknown, name: string, _options?: { key?: string }) => ({ ok: name !== 'invitation' }))
    const guard = routeGuard({ ctx: mutationCtx(), rateLimiter: { limit } })

    await expect(guard({ path: '/organization/invite-member', context: signedIn('user_inviter') })).rejects.toEqual(tooMany)
    expect(limit.mock.calls.map(call => call[1])).toEqual(['invitation'])
  })

  it('a closed deployment ceiling stops an inviter who is still within their own budget', async () => {
    const limit = vi.fn(async (_ctx: unknown, name: string, _options?: { key?: string }) => ({ ok: name !== 'invitationGlobal' }))
    const guard = routeGuard({ ctx: mutationCtx(), rateLimiter: { limit } })

    await expect(guard({ path: '/organization/invite-member', context: signedIn('user_inviter') }))
      .rejects.toEqual(expect.objectContaining({ status: 'TOO_MANY_REQUESTS', body: { message: expect.stringContaining('temporarily unavailable') } }))
    expect(limit.mock.calls.map(call => call[1])).toEqual(['invitation', 'invitationGlobal'])
  })

  it('route refusals carry the limiter\'s wait as retryAfter (ms), per caller and for the ceiling', async () => {
    const request = { path: '/organization/invite-member', context: signedIn('user_inviter') }
    const perCaller = vi.fn(async (_ctx: unknown, name: string) => (name === 'invitation' ? { ok: false, retryAfter: 90_000 } : { ok: true }))
    const ceiling = vi.fn(async (_ctx: unknown, name: string) => (name === 'invitationGlobal' ? { ok: false, retryAfter: 600_000 } : { ok: true }))

    await expect(routeGuard({ ctx: mutationCtx(), rateLimiter: { limit: perCaller } })(request))
      .rejects.toEqual(expect.objectContaining({ body: { message: expect.stringContaining('Too many invitations'), retryAfter: 90_000 } }))
    await expect(routeGuard({ ctx: mutationCtx(), rateLimiter: { limit: ceiling } })(request))
      .rejects.toEqual(expect.objectContaining({ body: { message: expect.stringContaining('temporarily unavailable'), retryAfter: 600_000 } }))
  })

  it('an admin route has no deployment ceiling — it spends nobody else\'s resource', async () => {
    const limit = vi.fn(async (_ctx: unknown, _name: string, _options?: { key?: string }) => ({ ok: true }))
    const ctx = mutationCtx()
    await routeGuard({ ctx, rateLimiter: { limit } })(admin)

    expect(limit).toHaveBeenCalledExactlyOnceWith(ctx, 'admin', { key: 'user_admin' })
  })

  it('a closed invitation bucket answers TOO_MANY_REQUESTS', async () => {
    const limit = vi.fn(async (_ctx: unknown, _name: string, _options?: { key?: string }) => ({ ok: false }))
    const guard = routeGuard({ ctx: mutationCtx(), rateLimiter: { limit } })

    await expect(guard({ path: '/organization/invite-member', context: signedIn('user_inviter') }))
      .rejects.toEqual(tooMany)
  })

  it('ignores unprivileged routes, including the rest of the organization surface', async () => {
    const limit = vi.fn(async (_ctx: unknown, _name: string, _options?: { key?: string }) => ({ ok: false }))
    const guard = routeGuard({ ctx: mutationCtx(), rateLimiter: { limit } })

    for (const path of ['/sign-in/email', '/organization/list', '/organization/set-active', '/passkey/register']) {
      await guard({ path, context: signedIn('user_1') })
    }
    expect(limit).not.toHaveBeenCalled()
  })

  it('leaves a caller with no session to the route, which answers 401 itself', async () => {
    const limit = vi.fn(async (_ctx: unknown, _name: string, _options?: { key?: string }) => ({ ok: false }))
    const guard = routeGuard({ ctx: mutationCtx(), rateLimiter: { limit } })

    // No bucket is consumed, so an unauthenticated flood cannot poison the
    // bucket of whoever happens to share a key with it.
    await guard({ path: '/admin/ban-user', context: anonymous() })
    expect(limit).not.toHaveBeenCalled()
  })

  it('bounds anonymous agent registration by the deployment ceiling alone, with no session lookup', async () => {
    const limit = vi.fn(async (_ctx: unknown, _name: string, _options?: { key?: string }) => ({ ok: false, retryAfter: 120_000 }))
    const ctx = mutationCtx()
    const guard = routeGuard({ ctx, rateLimiter: { limit } })

    await expect(guard({ path: '/mcp/register', context: {} }))
      .rejects.toEqual(new APIError('TOO_MANY_REQUESTS', { message: 'Too many agents are registering right now. Please try again later.', retryAfter: 120_000 }))
    expect(limit.mock.calls).toEqual([[ctx, 'agentRegistrationGlobal']])
  })

  it('does nothing when the deployment configured no rate limiter', async () => {
    await expect(routeGuard({ ctx: mutationCtx() })(admin)).resolves.toBeUndefined()
  })
})

describe('routes the package turns off', () => {
  it('turns off code checks that use nothing up, the link routes, and the reset routes a passwordless app never uses', () => {
    expect(disabledRoutes({})).toEqual([
      '/email-otp/check-verification-otp',
      '/send-verification-email',
      '/verify-email',
      '/change-email',
      '/email-otp/request-password-reset',
      '/forget-password/email-otp',
      '/email-otp/reset-password',
    ])
  })

  it('leaves the reset routes on for an app that turns passwords on', () => {
    expect(disabledRoutes({ emailAndPassword: { enabled: true } })).toEqual([
      '/email-otp/check-verification-otp',
      '/send-verification-email',
      '/verify-email',
      '/change-email',
    ])
  })

  it('merges them into the app\'s own disabledPaths', () => {
    const options = buildAuthOptions(fakeDb, { authOptions: { disabledPaths: ['/sign-up/email', '/verify-email'] } })
    expect(options.disabledPaths).toEqual(['/sign-up/email', '/verify-email', ...disabledRoutes({}).filter(path => path !== '/verify-email')])
  })

  it('refuses them by the route\'s own path too, so a server-side call cannot reach them', async () => {
    const before = buildAuthOptions(fakeDb).hooks!.before as unknown as OtpGuard
    await expect(before({ path: '/email-otp/check-verification-otp', body: { email: 'ada@example.com', otp: '123456', type: 'sign-in' } }))
      .rejects.toEqual(expect.objectContaining({ status: 'NOT_FOUND' }))
    // An app's own disabledPaths stay the router's business: it may still call them from the server.
    const own = buildAuthOptions(fakeDb, { authOptions: { disabledPaths: ['/sign-up/email'] } }).hooks!.before as unknown as OtpGuard
    await expect(own({ path: '/sign-up/email', body: {} })).resolves.toBeUndefined()
  })

  it('lets a server-only endpoint, which has no path, through to the app\'s hook', async () => {
    const consumerBefore = vi.fn(async () => 'consumer')
    const before = buildAuthOptions(fakeDb, { authOptions: { hooks: { before: consumerBefore as never } } }).hooks!.before as unknown as (ctx: unknown) => Promise<unknown>
    await expect(before({ path: undefined, body: {} })).resolves.toBe('consumer')
  })
})

describe('code requests the route would refuse', () => {
  it('refuse a password-reset code without passwords, and send one with them', async () => {
    const limit = vi.fn(async () => ({ ok: true }))
    const request = { path: '/email-otp/send-verification-otp', body: { email: 'ada@example.com', type: 'forget-password' } }
    await expect(otpGuard({ ctx: mutationCtx(), email: emailSpy(), rateLimiter: { limit } })(request))
      .rejects.toEqual(expect.objectContaining({ status: 'BAD_REQUEST' }))
    expect(limit).not.toHaveBeenCalled()

    vi.stubEnv('EMAIL_TEST_MODE', 'false')
    vi.stubEnv('EMAIL_FROM', 'Acme <hello@acme.dev>')
    const withPasswords = buildAuthOptions(fakeDb, { authOptions: { emailAndPassword: { enabled: true } } }, { ctx: mutationCtx(), email: emailSpy(), rateLimiter: { limit } })
    await expect((withPasswords.hooks!.before as unknown as OtpGuard)(request)).resolves.toBeUndefined()
    expect(limit.mock.calls.map(call => (call as unknown[])[1])).toEqual(['emailOtpGlobal', 'emailOtp'])
  })

  it('spend nothing when the address or the type is one the route refuses on its own', async () => {
    const limit = vi.fn(async () => ({ ok: true }))
    const guard = otpGuard({ ctx: mutationCtx(), email: emailSpy(), rateLimiter: { limit } })
    await guard({ path: '/email-otp/send-verification-otp', body: { email: 'not-an-address', type: 'sign-in' } })
    await guard({ path: '/email-otp/send-verification-otp', body: { email: 'ada@example.com', type: 'change-email' } })
    await guard({ path: '/email-otp/send-verification-otp', body: { email: 'ada@example.com', type: 'anything' } })
    expect(limit).not.toHaveBeenCalled()
  })

  it('ask the gate about the address as Better Auth holds it, lower-cased', async () => {
    vi.stubEnv('EMAIL_TEST_MODE', 'false')
    vi.stubEnv('EMAIL_FROM', 'Acme <hello@acme.dev>')
    const canSignIn = vi.fn(async () => true as const)
    await otpGuard({ ctx: mutationCtx(), email: emailSpy(), canSignIn, userExists: async () => false })({
      path: '/email-otp/send-verification-otp',
      body: { email: 'Ada@Example.COM', type: 'sign-in' },
    })
    expect(canSignIn).toHaveBeenCalledWith(expect.anything(), { email: 'ada@example.com', isNewUser: true, purpose: 'sign-in' })
  })
})

describe('one live code per address and purpose', () => {
  const adapter = () => ({ findOne: vi.fn(), create: vi.fn(), deleteMany: vi.fn(async () => 1) })

  it('deletes the earlier codes for the identifier a new code is stored under', async () => {
    const db = adapter()
    await replaceEarlierCodes({ identifier: 'sign-in-otp-ada@example.com' }, { context: { adapter: db } })
    expect(db.deleteMany).toHaveBeenCalledWith({ model: 'verification', where: [{ field: 'identifier', value: 'sign-in-otp-ada@example.com' }] })
  })

  it('leaves every other verification row alone: consent codes, passkey challenges, deletion tokens', async () => {
    const db = adapter()
    for (const identifier of ['a-random-consent-code', 'delete-account-abc123', 'sign-in-otp', 'reserve:sign-in-otp-x']) {
      await replaceEarlierCodes({ identifier }, { context: { adapter: db } })
    }
    await replaceEarlierCodes({ identifier: 'change-email-otp-a@b.com-c@d.com' }, null)
    expect(db.deleteMany).not.toHaveBeenCalled()
  })

  it('is wired as the verification create hook', () => {
    expect(buildAuthOptions(fakeDb).databaseHooks?.verification?.create?.before).toBe(replaceEarlierCodes)
  })
})
