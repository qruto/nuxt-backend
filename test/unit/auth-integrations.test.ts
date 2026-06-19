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
    expect(options.databaseHooks).toBeUndefined()
  })
})
