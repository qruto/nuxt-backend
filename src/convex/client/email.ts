import type { GenericDataModel } from 'convex/server'
import type { OtpPurpose } from '../email-templates.js'
import { assertCanSignIn } from './guards.js'
import { type AuthRuntime, asMutationCtx, readEnv } from './runtime.js'
import { logBackend } from '../log.js'

// The sign-in code sender: delivery through the app's email instance, or the
// local-dev echo when the deployment cannot deliver.

/**
 * The email provider's sandbox inboxes, `+label` aliases included — the same
 * pattern the component's sandbox inbox captures (components/backend/email.ts).
 */
const SANDBOX_ADDRESS = /^(?:delivered|bounced|complained)(?:\+[^@\s]+)?@resend\.dev$/

/**
 * Whether the component keeps a copy of mail to this address: a sandbox
 * address, in test mode (the default). It does so with or without
 * EMAIL_API_KEY, which is how a keyless demo, preview or e2e run reads a
 * sign-in code (`useSandboxInbox`).
 */
function reachesSandboxInbox(email: string): boolean {
  return readEnv('EMAIL_TEST_MODE') !== 'false' && SANDBOX_ADDRESS.test(email.trim().toLowerCase())
}

/**
 * Whether the deployment opted in to printing sign-in codes to its logs: only
 * `NUXT_BACKEND_LOG_OTP=1`, the value `env push` provisions. Any other value,
 * `false` included, keeps a live credential out of the logs.
 */
function logsOtp(): boolean {
  return readEnv('NUXT_BACKEND_LOG_OTP') === '1'
}

/** Build the emailOTP `sendVerificationOTP` handler, routed through the integrations. */
export function makeSendVerificationOTP<DM extends GenericDataModel>(runtime?: AuthRuntime<DM>) {
  return async (data: { email: string, otp: string, type: OtpPurpose }): Promise<void> => {
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
      // Failing loudly beats a login screen waiting for an email that will
      // never arrive — the thrown message surfaces in the sign-in UI.
      throw new Error(
        `[nuxt-backend] OTP not delivered — ${runtime?.email && ctx ? 'EMAIL_API_KEY is not set on this deployment' : 'setupAuth has no email instance to send through'}. `
        + `Set the required EMAIL_API_KEY env var to send email, or NUXT_BACKEND_LOG_OTP=1 to echo codes to the console during local dev.`,
      )
    }
    if (sandboxOnly && logsOtp()) {
      // Local dev keeps its terminal echo; the inbox copy is for the page.
      logBackend('warn', 'auth.otp_echo', `No email transport configured. Email OTP (${data.type}) for ${data.email}: ${data.otp}`)
    }
    // Every limit and the sign-in gate already ran on the request (see
    // assertOtpRequestAllowed): Better Auth runs this sender through
    // `runInBackgroundOrAwait`, which catches and logs whatever it throws and
    // still answers success — so a refusal raised here never reaches the
    // client. The gate stays as the belt to that hook's braces (it stops the
    // send even though nobody sees why); a rate limit here would only fail
    // silently, so there is none.
    if (runtime.canSignIn && data.type === 'sign-in') {
      const isNewUser = runtime.userExists ? !(await runtime.userExists(ctx, data.email)) : true
      await assertCanSignIn(runtime.canSignIn, ctx, { email: data.email, isNewUser, purpose: 'sign-in' })
    }
    await runtime.email.sendTemplate(ctx, 'otp', data)
  }
}
