/**
 * Sandbox addresses for the playground, shared by the pages and by
 * `backend/`, so the browser and the server enforce the same rules.
 *
 * The public playground is a sandbox: it never emails a real person, stores
 * no real address and charges nothing. Email runs in Resend's test mode,
 * which delivers only to its predefined inboxes, each simulating an outcome:
 * https://resend.com/docs/dashboard/emails/send-test-emails
 *
 *   delivered@resend.dev   → delivers
 *   bounced@resend.dev     → hard bounce
 *   complained@resend.dev  → marked as spam
 *
 * All three take a `+label`. Test mode matches them case-sensitively, so the
 * helpers compare the lower-cased form.
 *
 * ACCOUNTS use a sandbox identity: `delivered+<label>@resend.dev` with a long
 * random label. Nobody can open that inbox, so the package's sandbox inbox
 * shows its mail on the sign-in page (`useSandboxInbox`). Whoever knows the
 * address can therefore read its sign-in codes: the label is the password,
 * generated and never guessable.
 */

export const TEST_EMAIL_DOMAIN = 'resend.dev'

/** Trim + lowercase — the canonical form the auth flows store. */
export function normalizeTestEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Any Resend test inbox: an outcome, with or without a `+label`. */
const SANDBOX_ADDRESS = /^(?:delivered|bounced|complained)(?:\+[^@\s]+)?@resend\.dev$/

/** A sandbox identity: the delivered inbox with a random label of 16+ characters. */
const SANDBOX_IDENTITY = /^delivered\+[a-z0-9]{16,}@resend\.dev$/

/** True for any Resend test inbox — the only recipients the playground sends to. */
export function isAllowedTestEmail(email: string): boolean {
  return SANDBOX_ADDRESS.test(normalizeTestEmail(email))
}

/** True for an address an account may use: a generated sandbox identity. */
export function isSandboxIdentity(email: string): boolean {
  return SANDBOX_IDENTITY.test(normalizeTestEmail(email))
}

const LABEL_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'

/** A fresh sandbox identity: 20 random base-32 characters (100 bits) as the label. */
export function newSandboxIdentity(): string {
  // 256 is a multiple of 32, so `byte % 32` is uniform.
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  const label = Array.from(bytes, byte => LABEL_ALPHABET[byte % LABEL_ALPHABET.length]).join('')
  return `delivered+${label}@${TEST_EMAIL_DOMAIN}`
}

/** Why an address was refused for an account — shown by the forms and the server. */
export const SANDBOX_IDENTITY_HELP
  = 'The playground is a sandbox: accounts use a generated address '
    + '(delivered+…@resend.dev), and its mail shows up on the sign-in page.'

/** Why a recipient was refused — shown by the Email page and the server. */
export const TEST_EMAIL_HELP
  = 'Resend test inboxes only: delivered, bounced or complained@resend.dev, '
    + 'optionally with a +label.'

/** Outcome inboxes surfaced on the Email page (a delivered alias + every outcome). */
export const OUTCOME_TEST_EMAILS = [
  'delivered@resend.dev',
  'delivered+demo@resend.dev',
  'bounced@resend.dev',
  'complained@resend.dev',
] as const
