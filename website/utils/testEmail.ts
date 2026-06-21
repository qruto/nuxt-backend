/**
 * Resend test-inbox helpers for the playground.
 *
 * The playground never emails real people — it only uses Resend's predefined
 * test addresses, which simulate each delivery outcome:
 * https://resend.com/docs/dashboard/emails/send-test-emails
 *
 *   delivered@resend.dev   → delivers
 *   bounced@resend.dev     → hard bounce
 *   complained@resend.dev  → marked as spam
 *   suppressed@resend.dev  → suppressed (no labels)
 *
 * `delivered`/`bounced`/`complained` support `+label` aliasing, so you can
 * spin up many distinct identities that all land in the same Resend sink
 * (e.g. `delivered+alice@…`). `suppressed` does not support labels.
 *
 * SIGN-UP only accepts the **delivered** inbox (its OTP actually arrives) —
 * the other outcomes are for the dedicated Email page, where you want to *see*
 * a bounce/complaint/suppression rather than receive a code.
 */

export const TEST_EMAIL_DOMAIN = 'resend.dev'

/** Trim + lowercase — the canonical form the auth flows store. */
export function normalizeTestEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** `delivered@resend.dev` or `delivered+label@resend.dev` — the sign-up inbox. */
const DELIVERED_TEST_EMAIL = /^delivered(?:\+[^@\s]+)?@resend\.dev$/i

/** Any accepted test inbox (all outcomes) — used by the Email page. */
const ANY_TEST_EMAIL
  = /^(?:(?:delivered|bounced|complained)(?:\+[^@\s]+)?|suppressed)@resend\.dev$/i

/** True only for the `delivered` inbox (alias-aware) — the sign-up allowlist. */
export function isDeliveredTestEmail(email: string): boolean {
  return DELIVERED_TEST_EMAIL.test(normalizeTestEmail(email))
}

/** True for any accepted Resend test inbox (any outcome, alias-aware). */
export function isAllowedTestEmail(email: string): boolean {
  return ANY_TEST_EMAIL.test(normalizeTestEmail(email))
}

/** One-line guidance shown on the sign-in form when an address is rejected. */
export const TEST_EMAIL_HELP
  = 'Sign-up uses Resend\'s delivered inbox: delivered@resend.dev — add '
    + '+your-label (e.g. delivered+alice@resend.dev) for a distinct account. '
    + 'Test bounce / complaint / suppression on the Email page.'

/** Quick-fill chips for the sign-in form — delivered variants only. */
export const TEST_EMAIL_PRESETS = [
  'delivered@resend.dev',
  'delivered+you@resend.dev',
] as const

/** Outcome inboxes surfaced on the Email page (delivered alias + every outcome). */
export const OUTCOME_TEST_EMAILS = [
  'delivered@resend.dev',
  'delivered+demo@resend.dev',
  'bounced@resend.dev',
  'complained@resend.dev',
  'suppressed@resend.dev',
] as const
