import type { GenericDataModel } from 'convex/server'
import type { AuthHookCtx } from './request-session.js'
import { type AuthRuntime, asMutationCtx } from './runtime.js'
import { logBackend } from '../log.js'

// What the package tells a person after a route went through: the old
// address hears of an email change.

/** The route that moves an account to its new address. */
const CHANGE_EMAIL_PATH = '/email-otp/change-email'

/**
 * Tell the old address that an email change went through, so whoever holds
 * it hears of a change someone else made. It runs once the route has
 * answered, as a best effort: a notice that fails is logged and the change
 * stands. Keyed by account and new address, so a retried request sends one.
 */
export async function notifyEmailChanged<DM extends GenericDataModel>(runtime: AuthRuntime<DM> | undefined, ctx: AuthHookCtx): Promise<void> {
  if (ctx.path !== CHANGE_EMAIL_PATH) return
  const context = ctx.context as { returned?: unknown, session?: { user?: { id?: string, email?: string, locale?: string | null } } | null }
  // The route refused: nothing moved.
  if (context.returned === undefined || context.returned instanceof Error) return
  // The session the route ran with still holds the old address.
  const user = context.session?.user
  const body = ctx.body as { newEmail?: unknown } | undefined
  const newEmail = typeof body?.newEmail === 'string' ? body.newEmail.trim().toLowerCase() : ''
  const mutationCtx = asMutationCtx(runtime?.ctx)
  if (!runtime?.email || !mutationCtx || !user?.id || !user.email || !newEmail || user.email.toLowerCase() === newEmail) return
  try {
    // In the account's language: the old address no longer finds the account.
    await runtime.email.sendTemplate(mutationCtx, 'emailChanged', { email: user.email, newEmail }, {
      locale: user.locale,
      idempotencyKey: `nuxt-backend:email-changed:${user.id}:${newEmail}`,
    })
  }
  catch (error) {
    logBackend('warn', 'auth.email_change_notice_unsent', 'The old address was not told of an email change; the change went through.', error)
  }
}
