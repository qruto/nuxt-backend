import type { GenericDataModel } from 'convex/server'
import { getSessionFromCtx } from 'better-auth/api'
import type { OtpEmailData, OtpPurpose } from '../email-templates.js'
import { logsOtp, reachesSandboxInbox } from './delivery.js'
import { assertCanSignIn } from './guards.js'
import { type AuthRuntime, asMutationCtx, readEnv } from './runtime.js'
import { logBackend } from '../log.js'

// The sign-in code sender: delivery through the app's email instance, or the
// local-dev echo when the deployment cannot deliver.

/** Why a code was not delivered, for the error that reaches the logs. */
function undeliveredCause(hasEmail: boolean, hasCtx: boolean): string {
  if (!hasEmail) return 'setupAuth has no email instance to send through.'
  if (!hasCtx) return 'the request has no mutation or action ctx to send it from.'
  return 'EMAIL_API_KEY is not set on this deployment. Set it to send email, or NUXT_BACKEND_LOG_OTP=1 to echo codes to the console during local dev.'
}

/**
 * Why a code goes out, where its type alone doesn't say. An
 * `email-verification` code to the signed-in person's own address, already
 * verified, is the first step of an email change: a verified address needs
 * no other code. The route's session is the one the request guard read, so
 * this costs no second lookup.
 */
async function codeReason(data: { email: string, type: OtpPurpose }, endpoint: unknown): Promise<OtpEmailData['reason']> {
  if (data.type !== 'email-verification' || !endpoint) return undefined
  const session = await getSessionFromCtx(endpoint as never).catch(() => null) as { user?: { email?: string, emailVerified?: boolean } } | null
  const user = session?.user
  return user?.emailVerified === true && user.email?.toLowerCase() === data.email.toLowerCase() ? 'email-change' : undefined
}

/** Build the emailOTP `sendVerificationOTP` handler, routed through the integrations. */
export function makeSendVerificationOTP<DM extends GenericDataModel>(runtime?: AuthRuntime<DM>) {
  return async (data: { email: string, otp: string, type: OtpPurpose }, endpoint?: unknown): Promise<void> => {
    const ctx = asMutationCtx(runtime?.ctx)
    // Without EMAIL_API_KEY on the deployment the component sends nothing (it
    // logs "Email skipped"), and the code would be gone while the sign-in UI
    // waits for it.
    const unconfigured = !readEnv('EMAIL_API_KEY')
    // Except for a sandbox address: the module skips the provider but keeps
    // the message in the sandbox inbox, so the code is not gone.
    const sandboxOnly = unconfigured && reachesSandboxInbox(data.email)
    if (!runtime?.email || !ctx || (unconfigured && !sandboxOnly)) {
      // The OTP is a live credential and Convex logs are durable — never echo it
      // to logs unless a deployment explicitly opts in (local dev without email).
      if (logsOtp()) {
        logBackend('warn', 'auth.otp_echo', `No email transport configured. Email OTP (${data.type}) for ${data.email}: ${data.otp}`)
        return
      }
      // Better Auth catches what a sender throws, logs "Failed to run
      // background task" and still answers success, so this reaches the logs
      // only. The request guard refuses a code the deployment cannot deliver
      // before one is stored (assertCodeSendAllowed), and the form says why;
      // this is the backstop for a code that reached the sender anyway.
      throw new Error(`[nuxt-backend] OTP not delivered — ${undeliveredCause(Boolean(runtime?.email), Boolean(ctx))}`)
    }
    if (sandboxOnly && logsOtp()) {
      // Local dev keeps its terminal echo; the inbox copy is for the page.
      logBackend('warn', 'auth.otp_echo', `No email transport configured. Email OTP (${data.type}) for ${data.email}: ${data.otp}`)
    }
    // Every limit and the sign-in gate already ran on the request (see
    // assertCodeSendAllowed): Better Auth runs this sender through
    // `runInBackgroundOrAwait`, which catches and logs whatever it throws and
    // still answers success — so a refusal raised here never reaches the
    // client. The gate stays as the belt to that hook's braces (it stops the
    // send even though nobody sees why); a rate limit here would only fail
    // silently, so there is none.
    if (runtime.canSignIn && data.type === 'sign-in') {
      const isNewUser = runtime.userExists ? !(await runtime.userExists(ctx, data.email)) : true
      await assertCanSignIn(runtime.canSignIn, ctx, { email: data.email, isNewUser, purpose: 'sign-in' })
    }
    const reason = await codeReason(data, endpoint)
    await runtime.email.sendTemplate(ctx, 'otp', reason ? { ...data, reason } : data)
  }
}
