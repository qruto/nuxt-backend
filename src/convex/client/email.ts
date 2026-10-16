import type { FunctionReference, GenericDataModel } from 'convex/server'
import type { AuthEmailMessage, AuthEmailSender, AuthEmailTemplates, AuthSetupComponents, OtpPurpose } from './auth-types.js'
import { assertCanSignIn } from './guards.js'
import { type AuthRuntime, asMutationCtx, readEnv } from './runtime.js'
import { logBackend } from '../log.js'

// The auth emails: the packaged templates, the OTP sender (delivery, or the
// local-dev echo when there is no transport), and the transport the `backend`
// component provides on its own.

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c] ?? c
  ))
}

const OTP_SUBJECTS: Record<OtpPurpose, string> = {
  'sign-in': 'Your sign-in code',
  // Also the code an email change sends to the current address first.
  'email-verification': 'Confirm your email address',
  'forget-password': 'Reset your password',
  'change-email': 'Confirm your new email',
}

/** Minimal, dependency-free default templates. Override by supplying your own plugins. */
function otpEmail(data: { email: string, otp: string, type: OtpPurpose }): AuthEmailMessage {
  const subject = OTP_SUBJECTS[data.type] ?? 'Your verification code'
  const code = escapeHtml(data.otp)
  return {
    to: data.email,
    subject,
    text: `${subject}: ${data.otp}\n\nThis code expires shortly. If you didn't request it, you can ignore this email.`,
    html: `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5">`
      + `<p>${subject}:</p>`
      + `<p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p>`
      + `<p style="color:#666">This code expires shortly. If you didn't request it, you can ignore this email.</p>`
      + `</div>`,
  }
}

function linkEmail(to: string, subject: string, intro: string, url: string, cta: string): AuthEmailMessage {
  const safeUrl = escapeHtml(url)
  return {
    to,
    subject,
    text: `${intro}\n\n${url}`,
    html: `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5">`
      + `<p>${escapeHtml(intro)}</p>`
      + `<p><a href="${safeUrl}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;border-radius:8px;text-decoration:none">${escapeHtml(cta)}</a></p>`
      + `<p style="color:#666">Or paste this link into your browser:<br>${safeUrl}</p>`
      + `</div>`,
  }
}

/**
 * The packaged default auth-email templates (OTP, welcome, delete-account,
 * invite) — minimal, dependency-free HTML/text. `setupAuth` returns the
 * resolved set, overrides included, as `emailTemplates`, for previews.
 *
 * @internal
 */
export const PACKAGED_EMAIL_TEMPLATES: AuthEmailTemplates = {
  otp: otpEmail,
  welcome: ({ email, name }) => ({
    to: email,
    subject: 'Welcome aboard',
    text: `Welcome${name ? `, ${name}` : ''}! Your account is ready.`,
    html: `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5">`
      + `<p>Welcome${name ? `, ${escapeHtml(name)}` : ''}! 🎉</p>`
      + `<p>Your account is ready — thanks for joining us.</p>`
      + `</div>`,
  }),
  deleteAccount: ({ email, url }) => linkEmail(
    email,
    'Confirm account deletion',
    'Confirm you want to permanently delete your account. This cannot be undone.',
    url,
    'Delete account',
  ),
  invite: ({ email, url, inviterName, inviterEmail, organizationName, role }) => linkEmail(
    email,
    `Join ${organizationName}`,
    `${inviterName || inviterEmail} invited you to join ${organizationName} as ${role}.`,
    url,
    'Accept invitation',
  ),
}

/**
 * The active template set: each override in place of its default, called
 * with the data and the default it replaces.
 */
export function resolveTemplates<DM extends GenericDataModel>(runtime?: AuthRuntime<DM>): AuthEmailTemplates {
  const resolved: Record<string, unknown> = { ...PACKAGED_EMAIL_TEMPLATES }
  for (const [key, override] of Object.entries(runtime?.emailTemplates ?? {})) {
    if (!override) continue
    const byDefault = PACKAGED_EMAIL_TEMPLATES[key as keyof AuthEmailTemplates]
    resolved[key] = (data: never) => (override as (data: never, byDefault: unknown) => AuthEmailMessage)(data, byDefault)
  }
  return resolved as unknown as AuthEmailTemplates
}

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
    // The automatic transport is wired whenever the component has an email
    // module — but without EMAIL_API_KEY on the deployment that module sends
    // nothing (it logs "Email skipped"), and the code would be gone while the
    // sign-in UI waits for it. That is the "no transport" case too. A custom
    // sender is the consumer's own and is trusted as is.
    const unconfigured = runtime?.email !== undefined && isAutomaticEmailSender(runtime.email) && !readEnv('EMAIL_API_KEY')
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
        `[nuxt-backend] OTP not delivered — ${unconfigured ? 'EMAIL_API_KEY is not set on this deployment' : 'the backend component has no email transport'}. `
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
    await runtime.email(ctx, resolveTemplates(runtime).otp(data))
  }
}

/**
 * The email-send function the `backend` component exposes via its nested email
 * provider (see `src/convex/components/backend/email.ts`).
 */
type ComponentEmailRef = FunctionReference<
  'mutation',
  'internal',
  { to: string, subject: string, html?: string, text?: string, from?: string },
  string | null
>

/**
 * Build an {@link AuthEmailSender} that routes auth emails through the
 * `backend` component's email module. This is what makes transactional email
 * work out of the box — the scaffolded `convex.config.ts` mounts `backend`,
 * and the consumer just sets `EMAIL_API_KEY`.
 *
 * Returns `undefined` if the component ref has no `email` module (a test
 * double, say), in which case OTP requests
 * throw unless `NUXT_BACKEND_LOG_OTP=1` is set (see {@link AuthIntegrations}).
 */
export function componentEmailSender(components: AuthSetupComponents): AuthEmailSender | undefined {
  // The backend component exposes `email.send`, but the loose component-ref
  // type doesn't surface it; read it structurally.
  const send = (components.backend as { email?: { send?: ComponentEmailRef } } | undefined)?.email?.send
  if (!send) return undefined
  const sender: AuthEmailSender = async (ctx, message) => {
    await ctx.runMutation(send, {
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    })
  }
  return Object.assign(sender, { [AUTOMATIC_SENDER]: true })
}

/**
 * Marks the sender {@link componentEmailSender} builds, so the OTP path can
 * tell "the package's own transport, which needs EMAIL_API_KEY" from a
 * consumer's override.
 */
const AUTOMATIC_SENDER = Symbol.for('nuxt-backend.automaticEmailSender')

function isAutomaticEmailSender(sender: AuthEmailSender): boolean {
  return (sender as AuthEmailSender & { [AUTOMATIC_SENDER]?: boolean })[AUTOMATIC_SENDER] === true
}
