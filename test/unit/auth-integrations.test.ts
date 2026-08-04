import { describe, expect, it, vi } from 'vitest'
import { createBetterAuthOptions } from '../../src/convex/client'

const fakeDb = {} as never

function mutationCtx() {
  return { runMutation: vi.fn(), runQuery: vi.fn(), scheduler: { runAfter: vi.fn() } } as never
}

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
})
