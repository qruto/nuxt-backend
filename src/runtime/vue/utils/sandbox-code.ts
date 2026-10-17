/** What a sign-in code looks like: six digits standing on their own. */
const CODE = /\b(\d{6})\b/

/**
 * The provider's sandbox addresses, `+label` aliases included: the only ones
 * with a sandbox inbox (the component's `email.inbox` keeps the same list).
 */
const SANDBOX_ADDRESS = /^(?:delivered|bounced|complained)(?:\+[^@\s]+)?@resend\.dev$/

/** Whether an address is one of the provider's sandbox addresses, which alone have an inbox. */
export function isSandboxAddress(address: string): boolean {
  return SANDBOX_ADDRESS.test(address.trim().toLowerCase())
}

/** HTML reduced to its visible text: style and script bodies (a `#123456` colour) go first, then the tags. */
function visibleText(html: string | undefined): string | undefined {
  return html?.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<[^>]*>/g, ' ')
}

/**
 * The first six-digit code in a sandbox message: its text, then its subject,
 * then its visible HTML text. Shared by `useSandboxInbox` and `nuxt-backend inbox`.
 */
export function findCode(message: { subject: string, text?: string, html?: string } | undefined): string | undefined {
  if (!message) return undefined
  for (const source of [message.text, message.subject, visibleText(message.html)]) {
    const match = source?.match(CODE)
    if (match) return match[1]
  }
  return undefined
}
