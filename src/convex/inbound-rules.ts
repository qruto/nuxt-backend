// Inbound mail and the contact form: the vocabulary and arithmetic they
// share. Pure (no Convex, no provider SDK), so the `backend` component's rows,
// the app's `setupEmail` and the tests read the same names, limits and
// checks.

/** The shortest message the contact form takes, in characters (after trimming). */
export const CONTACT_MESSAGE_MIN = 10
/** The longest message the contact form takes, in characters. */
export const CONTACT_MESSAGE_MAX = 2000
/** The longest name the contact form takes, in characters. */
export const CONTACT_NAME_MAX = 100
/** The longest address an email can have (RFC 5321). */
export const EMAIL_ADDRESS_MAX = 254

/** How long a contact message and an inbound message are kept: 90 days. */
export const INBOUND_RETENTION_MS = 90 * 24 * 60 * 60 * 1000
/** How long a reply address is kept after the last email it went out in: a year, long enough for a reply to a mail that waits in an inbox. */
export const REPLY_ADDRESS_RETENTION_MS = 365 * 24 * 60 * 60 * 1000

/** The most characters of an inbound message's text the deployment keeps. */
export const INBOUND_TEXT_MAX = 20_000
/** The most attachments of one message that are listed (name and size). */
export const INBOUND_ATTACHMENTS_MAX = 20
/** The most messages the Inbox tab lists. */
export const INBOX_CONSOLE_ROWS = 100
/** The longest reply an administrator sends from the Inbox tab. */
export const INBOX_REPLY_MAX = 10_000

/** The prefix of a reply address's local part: `reply-<token>@in.example.com`. */
export const REPLY_PREFIX = 'reply-'
/** The characters of a reply token: lower-case base 32, so an address that mail servers fold to lower case still matches. */
const TOKEN_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'
/** A reply token's length: 16 characters of base 32, 80 bits. */
export const REPLY_TOKEN_LENGTH = 16
const REPLY_LOCAL = new RegExp(`^${REPLY_PREFIX}([a-z2-7]{${REPLY_TOKEN_LENGTH}})$`)

/**
 * The names mail servers and people expect at a domain (RFC 2142, and the
 * usual neighbours): never given to a workspace as its address.
 */
export const RESERVED_LOCAL_PARTS: readonly string[] = [
  'postmaster', 'abuse', 'hostmaster', 'webmaster', 'noc', 'security', 'mailer-daemon', 'root', 'admin', 'administrator',
  'info', 'support', 'sales', 'marketing', 'billing', 'help', 'contact', 'privacy', 'legal', 'noreply', 'no-reply', 'donotreply',
  'www', 'ftp', 'news', 'usenet', 'uucp', 'inbox', 'mail', 'email',
]

/** Why an inbound message was dropped; the `reason` of the `email.inbound_rejected` log line. */
export type InboundRejection = 'dmarc' | 'rate_limited' | 'sender_mismatch' | 'unknown_recipient'

/** A random reply token: 80 bits, lower-case base 32. */
export function newReplyToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(REPLY_TOKEN_LENGTH))
  return Array.from(bytes, byte => TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length]).join('')
}

/** The reply address for a token on a receiving domain. */
export function replyAddressFor(token: string, domain: string): string {
  return `${REPLY_PREFIX}${token}@${domain.trim().toLowerCase()}`
}

/** A mailbox taken apart: the address as written, lower-case, its local part and its domain. */
export interface ParsedAddress {
  address: string
  local: string
  domain: string
  /** The display name, when the value had one (`Ana <ana@example.com>`). */
  name?: string
}

/** `Name <local@domain>` or a bare `local@domain`, taken apart; `null` for anything else. */
export function parseAddress(value: unknown): ParsedAddress | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  const angle = /^(.*)<([^<>]+)>\s*$/.exec(text)
  const raw = (angle ? angle[2]! : text).trim()
  const at = raw.lastIndexOf('@')
  if (at < 1 || at === raw.length - 1 || raw.length > EMAIL_ADDRESS_MAX || /[\s<>(),;:"]/.test(raw)) return null
  const address = raw.toLowerCase()
  const name = angle?.[1]?.trim().replace(/^"|"$/g, '').trim()
  return { address, local: address.slice(0, at), domain: address.slice(at + 1), ...(name ? { name } : {}) }
}

/** The token a reply address's local part carries; `null` when it is no reply address. */
export function replyTokenOf(local: string): string | null {
  return REPLY_LOCAL.exec(local.toLowerCase())?.[1] ?? null
}

/** Whether a local part is one a workspace may never hold: a reserved name, or shaped like a reply address. */
export function isReservedLocal(local: string): boolean {
  const name = local.toLowerCase()
  return RESERVED_LOCAL_PARTS.includes(name) || name.startsWith(REPLY_PREFIX)
}

/** Where an address on the receiving domain leads. */
export type InboundRoute
  = | { kind: 'reply', token: string }
    | { kind: 'support' }
    | { kind: 'workspace', slug: string }

/**
 * What a recipient is: a reply address, the support address, or a workspace's
 * slug; `null` for an address off the receiving domain. A reserved name that
 * is not the support address leads nowhere, so `postmaster@` is never a
 * workspace's.
 */
export function routeOf(recipient: string, { domain, support }: { domain: string, support?: string }): InboundRoute | null {
  const parsed = parseAddress(recipient)
  if (!parsed) return null
  if (support && parsed.address === support.trim().toLowerCase()) return { kind: 'support' }
  if (parsed.domain !== domain.trim().toLowerCase()) return null
  const token = replyTokenOf(parsed.local)
  if (token) return { kind: 'reply', token }
  if (isReservedLocal(parsed.local)) return null
  return { kind: 'workspace', slug: parsed.local }
}

/** The results the receiving mail server computed for a message. */
export interface InboundAuthentication {
  spf?: string | null
  dkim?: string | null
  dmarc?: string | null
}

/**
 * Whether a message's sender is authentic enough. A message that fails DMARC
 * never is. A message that stands in for a person (a reply: `strict`) must
 * also pass it: a sender whose domain publishes no policy, or whose results
 * are unknown, cannot be told from a forgery.
 */
export function authenticSender(authentication: InboundAuthentication | null | undefined, { strict }: { strict: boolean }): boolean {
  const dmarc = authentication?.dmarc
  if (dmarc === 'fail') return false
  return strict ? dmarc === 'pass' : true
}

/** What the contact form sends, as the deployment checks it. */
export interface ContactInput {
  name?: string
  email?: string
  message: string
}

/** The first thing wrong with a contact message, as the field and the reason; `null` when it is fine. */
export function contactProblem(input: ContactInput, { signedIn }: { signedIn: boolean }): { field: 'name' | 'email' | 'message', reason: 'required' | 'too_short' | 'too_long' | 'malformed' } | null {
  const message = input.message.trim()
  if (message.length < CONTACT_MESSAGE_MIN) return { field: 'message', reason: 'too_short' }
  if (message.length > CONTACT_MESSAGE_MAX) return { field: 'message', reason: 'too_long' }
  if ((input.name?.trim().length ?? 0) > CONTACT_NAME_MAX) return { field: 'name', reason: 'too_long' }
  if (!signedIn) {
    if (!input.name?.trim()) return { field: 'name', reason: 'required' }
    if (!input.email?.trim()) return { field: 'email', reason: 'required' }
    if (!parseAddress(input.email) || /<|>/.test(input.email)) return { field: 'email', reason: 'malformed' }
  }
  return null
}

/** The label of a contact message in its subject and its reference line. */
const REFERENCE_LINE = /^Reference: ([a-z0-9]{12})[ \t]*$/gm

/** A fresh reference for a contact message: 12 characters, lower-case letters and digits. */
export function newContactRef(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, byte => TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length]).join('')
}

/** Strip what could pass as a header or a second line from a name that goes into a subject. */
function oneLine(text: string, max: number): string {
  return text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

/**
 * The email the team receives for a contact message: the message, who wrote
 * it, and a reference line the deployment finds again when the support inbox
 * hands the thread back. Plain text only; the visitor's words are never
 * rendered as HTML.
 */
export function contactEmail(message: { name?: string, email?: string, accountId?: string, body: string, ref: string }): { subject: string, text: string } {
  const who = oneLine(message.name ?? message.email ?? 'a signed-in account', 60)
  const from = [message.name ? oneLine(message.name, CONTACT_NAME_MAX) : '', message.email ? `<${oneLine(message.email, EMAIL_ADDRESS_MAX)}>` : ''].filter(Boolean).join(' ')
  return {
    subject: `Message from ${who}`,
    text: [
      message.body.trim(),
      '',
      '--',
      from ? `From: ${from}` : 'From: a signed-in account',
      ...(message.accountId ? [`Account: ${message.accountId}`] : []),
      `Reference: ${message.ref}`,
      '',
    ].join('\n'),
  }
}

/**
 * The reference a contact email's text carries; `null` when it has none.
 * The last line that reads as one: the visitor's words come first, and a
 * booking number of theirs can look the same.
 */
export function contactRefOf(text: string | null | undefined): string | null {
  return text ? [...text.matchAll(REFERENCE_LINE)].at(-1)?.[1] ?? null : null
}

/** The reply an administrator writes, cleaned: trimmed, and within {@link INBOX_REPLY_MAX}; `null` when nothing is left. */
export function checkedReply(text: string): string | null {
  const reply = text.trim()
  return reply && reply.length <= INBOX_REPLY_MAX ? reply : null
}

/** An object without its `undefined` values: for the optional arguments of a call, which Convex refuses as `undefined`. */
export function defined<T extends Record<string, unknown>>(object: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined)) as { [K in keyof T]?: Exclude<T[K], undefined> }
}
