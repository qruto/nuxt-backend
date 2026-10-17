import { readEnv } from './runtime.js'

// Whether a message would arrive at all: the reading the code sender and the
// request guard both take of the deployment's email settings.

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
export function reachesSandboxInbox(email: string): boolean {
  return readEnv('EMAIL_TEST_MODE') !== 'false' && SANDBOX_ADDRESS.test(email.trim().toLowerCase())
}

/**
 * Whether the deployment opted in to printing sign-in codes to its logs: only
 * `NUXT_BACKEND_LOG_OTP=1`, the value `env push` provisions. Any other value,
 * `false` included, keeps a live credential out of the logs.
 */
export function logsOtp(): boolean {
  return readEnv('NUXT_BACKEND_LOG_OTP') === '1'
}

/** Why a message would not arrive: see {@link undeliverableReason}. */
export type UndeliverableReason = 'no-key' | 'test-mode' | 'no-sender'

/**
 * Why a message to `address` would not arrive, or `null` when it would — the
 * same reading the component's send makes. Without EMAIL_API_KEY nothing is
 * sent: a sandbox address keeps its copy in the sandbox inbox, and a sign-in
 * code can be echoed to the logs (`echo`), but anything else is gone. In test
 * mode the provider accepts only its sandbox addresses. Out of test mode the
 * fallback sender (the provider's onboarding address) reaches only those and
 * the provider account's own address, which the deployment cannot tell from
 * any other, so a real address needs EMAIL_FROM.
 */
export function undeliverableReason(address: string, options: { echo?: boolean } = {}): UndeliverableReason | null {
  const testMode = readEnv('EMAIL_TEST_MODE') !== 'false'
  const sandbox = SANDBOX_ADDRESS.test(address.trim().toLowerCase())
  if (!readEnv('EMAIL_API_KEY')) return (testMode && sandbox) || options.echo ? null : 'no-key'
  if (testMode) return sandbox ? null : 'test-mode'
  return readEnv('EMAIL_FROM') || sandbox ? null : 'no-sender'
}
