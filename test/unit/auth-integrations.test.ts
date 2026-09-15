import { describe, expect, it, vi } from 'vitest'
import { APIError } from 'better-auth/api'
import { createBetterAuthOptions } from '../../src/convex/client'

const fakeDb = {} as never

function mutationCtx() {
  return { runMutation: vi.fn(), runQuery: vi.fn(), scheduler: { runAfter: vi.fn() } } as never
}

type OtpSender = (data: { email: string, otp: string, type: string }) => Promise<void>

/** The emailOTP plugin's `sendVerificationOTP`, as built by the package. */
function otpSender(options: ReturnType<typeof createBetterAuthOptions>): OtpSender {
  const plugin = options.plugins?.find(entry => (entry as { id?: string }).id === 'email-otp') as
    { options?: { sendVerificationOTP?: OtpSender } } | undefined
  return plugin!.options!.sendVerificationOTP!
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

describe('Better Auth cross-component integrations', () => {
  it('wires email + lifecycle hooks when integrations are provided', async () => {
    const email = vi.fn(async () => 'email_1')
    const onUserCreated = vi.fn(async () => {})
    const rateLimiter = { limit: vi.fn(async () => ({ ok: true })) }
    const ctx = mutationCtx()

    const options = createBetterAuthOptions(fakeDb, {}, { ctx, email, rateLimiter, onUserCreated })

    // Passwordless: email verification, change-email, and delete-account are
    // wired through the transport — but there is NO password-reset flow.
    expect(options.emailVerification?.sendVerificationEmail).toBeTypeOf('function')
    expect(options.emailAndPassword?.sendResetPassword).toBeUndefined()
    expect(options.user?.changeEmail?.sendChangeEmailConfirmation).toBeTypeOf('function')
    expect(options.user?.deleteUser?.sendDeleteAccountVerification).toBeTypeOf('function')
    expect(options.databaseHooks?.user?.create?.after).toBeTypeOf('function')

    // Change-email confirmation goes to the current address.
    await options.user!.changeEmail!.sendChangeEmailConfirmation!(
      { user: { email: 'a@b.com' }, newEmail: 'new@b.com', url: 'https://app/change', token: 't' } as never,
      {} as never,
    )
    expect(email).toHaveBeenCalledWith(ctx, expect.objectContaining({ to: 'a@b.com' }))

    // After a user is created: a welcome email is sent and onUserCreated runs.
    await options.databaseHooks!.user!.create!.after!(
      { id: 'u1', email: 'a@b.com', name: 'Ada' } as never,
      {} as never,
    )
    expect(email).toHaveBeenCalledWith(ctx, expect.objectContaining({ to: 'a@b.com' }))
    expect(onUserCreated).toHaveBeenCalledWith(ctx, { id: 'u1', email: 'a@b.com', name: 'Ada' })
  })

  it('leaves auth behaviour unchanged with no integrations (regression guard)', () => {
    const options = createBetterAuthOptions(fakeDb)

    expect(options.emailVerification).toBeUndefined()
    expect(options.emailAndPassword.sendResetPassword).toBeUndefined()
    expect(options.user?.changeEmail).toBeUndefined()
    // No email/lifecycle hooks — only the always-on workspace session hook
    // (organizations are a default feature, not an integration).
    expect(options.databaseHooks?.user).toBeUndefined()
    expect(options.databaseHooks?.session?.create?.before).toBeTypeOf('function')
  })

  it('has no database hooks at all when organizations are disabled and no integrations given', () => {
    const options = createBetterAuthOptions(fakeDb, { organization: false })
    expect(options.databaseHooks).toBeUndefined()
  })
})

describe('workspace invitation email', () => {
  function orgPluginOptions(options: ReturnType<typeof createBetterAuthOptions>) {
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
    inviter: { user: { name: 'Ada', email: 'ada@example.com' } },
  }

  it('wires sendInvitationEmail through the transport with a SITE_URL accept link', async () => {
    vi.stubEnv('SITE_URL', 'https://app.example.com')
    try {
      const email = vi.fn(async () => 'email_1')
      const ctx = mutationCtx()
      const options = createBetterAuthOptions(fakeDb, {}, { ctx, email })

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

  it('honors a custom invitationPath and the emailTemplates.invite override', async () => {
    vi.stubEnv('SITE_URL', 'https://app.example.com')
    try {
      const email = vi.fn(async () => 'email_1')
      const invite = vi.fn(() => ({ to: 'invitee@example.com', subject: 'custom', text: 'custom body' }))
      const options = createBetterAuthOptions(
        fakeDb,
        { organization: { invitationPath: '/join' } },
        { ctx: mutationCtx(), email, emailTemplates: { invite } },
      )

      await orgPluginOptions(options)!.sendInvitationEmail!(invitationData)
      expect(invite).toHaveBeenCalledWith(expect.objectContaining({
        url: 'https://app.example.com/join?id=inv-1',
        organizationName: 'Acme',
        inviterName: 'Ada',
        role: 'member',
      }))
      expect(email).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ subject: 'custom' }))
    }
    finally {
      vi.unstubAllEnvs()
    }
  })

  it('a consumer-supplied sendInvitationEmail wins over the built-in one', async () => {
    const custom = vi.fn(async () => {})
    const email = vi.fn(async () => 'email_1')
    const options = createBetterAuthOptions(
      fakeDb,
      { organization: { sendInvitationEmail: custom as never } },
      { ctx: mutationCtx(), email },
    )

    await orgPluginOptions(options)!.sendInvitationEmail!(invitationData)
    expect(custom).toHaveBeenCalled()
    expect(email).not.toHaveBeenCalled()
  })

  it('does not inject an invitation email without a transport', () => {
    const options = createBetterAuthOptions(fakeDb)
    expect(orgPluginOptions(options)?.sendInvitationEmail).toBeUndefined()
  })

  describe('OTP delivery without an email transport', () => {
    it('throws loudly instead of silently dropping the code', async () => {
      const send = otpSender(createBetterAuthOptions(fakeDb))
      await expect(send({ email: 'a@b.com', otp: '123456', type: 'sign-in' }))
        .rejects.toThrow('OTP not delivered')
    })

    it('echoes the code to the console with NUXT_BACKEND_LOG_OTP=1', async () => {
      vi.stubEnv('NUXT_BACKEND_LOG_OTP', '1')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const send = otpSender(createBetterAuthOptions(fakeDb))
        await expect(send({ email: 'a@b.com', otp: '123456', type: 'sign-in' })).resolves.toBeUndefined()
        expect(warn.mock.calls.flat().join('\n')).toContain('123456')
      }
      finally {
        warn.mockRestore()
        vi.unstubAllEnvs()
      }
    })

    it('delivers through the transport when one is wired', async () => {
      const email = vi.fn(async () => 'email_1')
      const ctx = mutationCtx()
      const send = otpSender(createBetterAuthOptions(fakeDb, {}, { ctx, email }))
      await send({ email: 'a@b.com', otp: '654321', type: 'sign-in' })
      expect(email).toHaveBeenCalledWith(ctx, expect.objectContaining({ to: 'a@b.com' }))
    })
  })
})

describe('OTP rate limits', () => {
  const otp = { email: 'Ada@Example.com', otp: '111111', type: 'sign-in' }

  it('consumes the deployment-wide window first, then the per-address bucket keyed by a digest', async () => {
    const email = vi.fn(async () => 'email_1')
    const limit = vi.fn(async (_ctx: unknown, _name: string, _options?: { key?: string }) => ({ ok: true }))
    const ctx = mutationCtx()
    await otpSender(createBetterAuthOptions(fakeDb, {}, { ctx, email, rateLimiter: { limit } }))(otp)

    expect(limit.mock.calls.map(call => call[1])).toEqual(['emailOtpGlobal', 'emailOtp'])
    expect(limit).toHaveBeenNthCalledWith(1, ctx, 'emailOtpGlobal')
    const key = (limit.mock.calls[1] as unknown[])[2] as { key: string }
    // SHA-256 hex of the normalized address — never the address itself.
    expect(key.key).toMatch(/^[0-9a-f]{64}$/)
    expect(key.key).not.toContain('ada')
    expect(email).toHaveBeenCalledOnce()
  })

  it('a closed global window aborts before the per-address limit and the send', async () => {
    const email = vi.fn(async () => 'email_1')
    const limit = vi.fn(async (_ctx: unknown, _name: string, _options?: { key?: string }) => ({ ok: false, retryAfter: 1000 }))
    const send = otpSender(createBetterAuthOptions(fakeDb, {}, { ctx: mutationCtx(), email, rateLimiter: { limit } }))

    await expect(send(otp)).rejects.toThrow(APIError)
    await expect(send(otp)).rejects.toEqual(tooMany)
    expect(limit.mock.calls.map(call => call[1])).toEqual(['emailOtpGlobal', 'emailOtpGlobal'])
    expect(email).not.toHaveBeenCalled()
  })

  it('a closed per-address bucket answers TOO_MANY_REQUESTS without sending', async () => {
    const email = vi.fn(async () => 'email_1')
    const limit = vi.fn(async (_ctx: unknown, name: string) => ({ ok: name === 'emailOtpGlobal' }))
    const send = otpSender(createBetterAuthOptions(fakeDb, {}, { ctx: mutationCtx(), email, rateLimiter: { limit } }))

    await expect(send(otp)).rejects.toEqual(expect.objectContaining({ status: 'TOO_MANY_REQUESTS', body: { message: expect.stringContaining('Too many') } }))
    expect(email).not.toHaveBeenCalled()
  })
})

describe('sign-in gate (canSignIn)', () => {
  const signIn = { email: 'ada@example.com', otp: '111111', type: 'sign-in' }
  const inviteOnly = vi.fn(async (_ctx: unknown, input: { isNewUser: boolean }) =>
    input.isNewUser ? { allowed: false as const, message: 'Invite only' } : true as const)

  function setup(overrides: { canSignIn?: typeof inviteOnly, userExists?: boolean, rateLimiter?: { limit: ReturnType<typeof vi.fn> } } = {}) {
    const email = vi.fn(async () => 'email_1')
    const ctx = mutationCtx()
    const canSignIn = overrides.canSignIn ?? vi.fn(async () => true as const)
    const options = createBetterAuthOptions(fakeDb, {}, {
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
    expect(limit.mock.calls.map(call => call[1])).toEqual(['emailOtpGlobal', 'emailOtpGlobal'])
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

  it('still consults the gate on sessions when organizations are disabled', async () => {
    const email = vi.fn(async () => 'email_1')
    const options = createBetterAuthOptions(fakeDb, { organization: false }, { ctx: mutationCtx(), email, canSignIn: inviteOnly })
    const before = options.databaseHooks!.session!.create!.before!
    await expect(before({ userId: 'u1' } as never, hookCtx({ user: { email: 'ada@example.com' } }) as never)).resolves.toBeUndefined()
    expect(options.databaseHooks!.user!.create!.before).toBeTypeOf('function')
  })

  it('adds no hooks without a request ctx (the static options object)', () => {
    const options = createBetterAuthOptions(fakeDb, { organization: false }, { canSignIn: inviteOnly } as never)
    expect(options.databaseHooks).toBeUndefined()
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
    const options = createBetterAuthOptions(
      fakeDb,
      { authOptions: { user: { deleteUser: { afterDelete } } } },
      { ctx, email: vi.fn(async () => 'email_1'), onUserDeleted },
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
    const options = createBetterAuthOptions(
      fakeDb,
      { authOptions: { user: { deleteUser: { beforeDelete } } } },
      { ctx: mutationCtx(), email: vi.fn(async () => 'email_1') },
    )
    expect(options.user!.deleteUser).toMatchObject({ enabled: true, beforeDelete })
    expect(options.user!.deleteUser!.sendDeleteAccountVerification).toBeTypeOf('function')
    expect(options.user!.deleteUser!.afterDelete).toBeUndefined()
  })

  it('runs onUserDeleted alone without a transport, and the consumer’s enabled: false still wins', async () => {
    const onUserDeleted = vi.fn(async () => {})
    const ctx = mutationCtx()
    const options = createBetterAuthOptions(fakeDb, {}, { ctx, onUserDeleted })
    expect(options.user!.deleteUser!.sendDeleteAccountVerification).toBeUndefined()
    await options.user!.deleteUser!.afterDelete!({ ...user, emailVerified: true, createdAt: new Date(), updatedAt: new Date() })
    expect(onUserDeleted).toHaveBeenCalledWith(ctx, user)

    const disabled = createBetterAuthOptions(fakeDb, { authOptions: { user: { deleteUser: { enabled: false } } } }, { ctx, onUserDeleted })
    expect(disabled.user!.deleteUser!.enabled).toBe(false)
  })

  it('leaves deleteUser unset when nothing opts in', () => {
    expect(createBetterAuthOptions(fakeDb).user?.deleteUser).toBeUndefined()
  })
})

describe('consumer databaseHooks compose with the package hooks', () => {
  it('runs a consumer user.create.after after the welcome email and onUserCreated', async () => {
    const order: string[] = []
    const email = vi.fn(async () => {
      order.push('welcome')
    })
    const onUserCreated = vi.fn(async () => {
      order.push('onUserCreated')
    })
    const consumerAfter = vi.fn(async () => {
      order.push('consumer')
    })
    const options = createBetterAuthOptions(
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
    const options = createBetterAuthOptions(fakeDb, {
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
    const options = createBetterAuthOptions(fakeDb, {
      authOptions: { databaseHooks: { account: { create: { after: accountAfter } } } },
    })
    expect(options.databaseHooks!.account!.create!.after).toBeTypeOf('function')
    expect(options.databaseHooks!.session!.create!.before).toBeTypeOf('function')
  })
})
