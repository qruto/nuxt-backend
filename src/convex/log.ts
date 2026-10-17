/**
 * The one way this package writes to a deployment's logs. Every line reads
 * `[nuxt-backend] <code>: <message>` with a stable dotted code, so a log
 * search finds each occurrence and the Troubleshooting page explains it.
 *
 * Convex keeps logs, so a message never carries an address, a name, a subject
 * line or a credential. The one exception is `auth.otp_echo`, the sign-in
 * code a deployment opts into echoing for local development
 * (`NUXT_BACKEND_LOG_OTP`). test/unit/log-redaction.test.ts holds every call
 * to that rule and every code to a Troubleshooting entry.
 *
 * @internal
 */
export const LOG_CODES = {
  'auth.otp_echo': 'A sign-in code, echoed because NUXT_BACKEND_LOG_OTP is set and no email transport is configured.',
  'email.skipped_no_api_key': 'An email was not sent: EMAIL_API_KEY is not set on the deployment.',
  'auth.email_change_notice_unsent': 'The old address was not told of an email change; the change itself went through.',
  'auth.welcome_unsent': 'A new account\'s welcome email was not sent; the account was created and onUserCreated still ran.',
  'email.undeliverable': 'A one-time code or an invitation was refused on the request: its email would not arrive (no EMAIL_API_KEY, test mode, or no EMAIL_FROM).',
  'webhook.secret_missing': 'A webhook route is mounted but its secret is not set, so every delivery is refused with 503.',
  'webhook.log_write_failed': 'A webhook delivery was handled but its row in the delivery log could not be written.',
  'billing.provider_failed': 'The billing provider refused a request; the caller sees "Billing is temporarily unavailable".',
  'billing.gift_attach_failed': 'A paid gift could not be attached to the recipient automatically; they can still claim it after signing in.',
  'billing.gift_misdirected': 'A gift order was paid under another email than the recipient\'s, so the gift was not delivered and stays pending.',
  'ai.cost_over_reservation': 'A metered action finished above the credits it reserved, or its finalized cost was not an amount; the reservation was charged.',
  'ai.balance_hook_failed': 'An onCreditsLow or onCreditsExhausted hook threw; the spend itself settled.',
  'ai.reservation_close_failed': 'A spend was recorded at the provider but its reservation could not be closed; the balance re-syncs on the next refresh.',
  'ai.stream_release_unscheduled': 'The release timer for a stream\'s reservation could not be scheduled; the pending-spend TTL releases it instead.',
  'ai.stream_spend_lost': 'A stream was delivered but its spend never reached the provider; the reservation was released.',
} as const

/** @internal */
export type LogCode = keyof typeof LOG_CODES

/**
 * Write one line to the deployment's logs. `error`, when given, follows the
 * message as its own argument so the platform renders its stack.
 *
 * @internal
 */
export function logBackend(level: 'warn' | 'error', code: LogCode, message: string, error?: unknown): void {
  const line = `[nuxt-backend] ${code}: ${message}`
  if (error === undefined) console[level](line)
  else console[level](line, error)
}
