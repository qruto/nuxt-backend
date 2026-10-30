// The launch phases and the tickets that admit a new address while the app
// is closed: the shared vocabulary of `setupAccess` (the app's side), the
// `backend` component's access module (the rows) and the sign-in hooks.
// Pure: no Convex or Better Auth code, only types, so every side reads the
// same names.

import type { GenericActionCtx, GenericDataModel } from 'convex/server'

/** A launch phase, in the order an app goes through them. */
export type AccessPhase = 'early-access' | 'invite-only' | 'public'

/** Every launch phase, in order: an app lists the ones it goes through. */
export const ACCESS_PHASES = ['early-access', 'invite-only', 'public'] as const satisfies readonly AccessPhase[]

/**
 * What admitted a new address while the app was closed, as the redemption
 * ledger, the activity trail and `canSignIn` name it:
 *
 * - `invite-code` and `access-link`: an administrator's code or link.
 * - `invitation`: an administrator invited the address (`access.admit`, the Access tab).
 * - `waitlist`: an administrator admitted the address's waitlist entry.
 * - `workspace-invitation`: a pending, unexpired invitation to a workspace.
 * - `gift`: a paid, unclaimed gift addressed to it.
 * - `domain`: its domain is one of `setupAccess`'s `domains`.
 * - `administrator`: an administrator created the account.
 */
export type AccessTicket = 'invite-code' | 'access-link' | 'invitation' | 'waitlist' | 'workspace-invitation' | 'gift' | 'domain' | 'administrator'

/** A context the gate reads in. */
type GateReadCtx = Pick<GenericActionCtx<GenericDataModel>, 'runQuery'>

/** A context the gate writes in. */
type GateWriteCtx = Pick<GenericActionCtx<GenericDataModel>, 'runQuery' | 'runMutation'>

/** How an invite code or an access link checks: `valid`, or why it admits nobody. */
export type InviteStatus = 'valid' | 'expired' | 'used-up' | 'revoked' | 'unknown'

/** The two kinds of shareable ticket: a code a person types, a link a person opens. */
export type InviteKind = 'code' | 'link'

/** The step a new address without a ticket meets after its sign-in code, by phase. */
export const TICKET_STEPS = {
  'early-access': 'waitlisted',
  'invite-only': 'invite-code',
} as const satisfies Record<Exclude<AccessPhase, 'public'>, string>

/**
 * Crockford's base 32: digits and capitals without `I`, `L`, `O` and `U`,
 * so a code read aloud or copied by hand has no look-alike pair.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** An invite code's characters (two groups of five, `7KQ2M-XW9PA`): 50 bits. */
const CODE_LENGTH = 10
/** An access link token's characters: 130 bits, never typed. */
const LINK_LENGTH = 26

/** The most characters a code or token is read with: anything longer is no ticket. */
export const INVITE_INPUT_MAX = 64
/** The longest label, in characters. */
export const INVITE_LABEL_MAX = 64
/** The most uses one code or link takes. */
export const INVITE_USES_MAX = 100_000
/** The most addresses one admission takes (`access.admit`, the Access tab's paste). */
export const ADMIT_BATCH_MAX = 500
/** How long an invitation by address waits for its sign-up: 30 days. */
export const ADMISSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

/** `count` random characters of {@link ALPHABET}. */
function randomCharacters(count: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(count))
  // 256 is a multiple of 32: every character is equally likely.
  return Array.from(bytes, byte => ALPHABET[byte % ALPHABET.length]).join('')
}

/** A new invite code, as a person reads it: `7KQ2M-XW9PA`. */
export function newInviteCode(): string {
  const code = randomCharacters(CODE_LENGTH)
  return `${code.slice(0, 5)}-${code.slice(5)}`
}

/** A new access link token, for the fragment of `/invite#<token>`. */
export function newLinkToken(): string {
  return randomCharacters(LINK_LENGTH)
}

/**
 * A code or token as it is hashed: without case, spaces or dashes, the
 * look-alike characters read as one (`O` as `0`, `I` and `L` as `1`). `null` for
 * anything that can be no ticket: empty, too long, or a character outside
 * the alphabet.
 */
export function normalizeInvite(input: string): string | null {
  if (input.length > INVITE_INPUT_MAX) return null
  const folded = input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1')
  if (!folded || [...folded].some(character => !ALPHABET.includes(character))) return null
  return folded
}

/** Bytes as lower-case hex. */
function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}

const encoder = new TextEncoder()

/**
 * What the database keeps of a code or token: an HMAC-SHA-256 under the
 * auth secret, tagged for invites, of its normalized form. A code has 50
 * bits, which a plain digest would let anyone holding a backup search
 * through; keyed, the stored value yields nothing without the secret.
 * `null` for input that can be no ticket.
 */
export async function inviteHash(secret: string, input: string): Promise<string | null> {
  const normalized = normalizeInvite(input)
  if (!normalized) return null
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(`invite:${normalized}`)))
}

/** An address as admissions keep it: trimmed, lower-cased. */
export function admissionEmail(address: string): string {
  return address.trim().toLowerCase()
}

/** An address shape check, before anything is stored for it. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/

/** The domains no invitation by address is stored for: reserved for documentation and tests (RFC 2606, RFC 6761). */
const RESERVED_DOMAINS = /(?:^|\.)(?:example\.(?:com|net|org)|example|test|invalid|localhost)$/

/** Why an address takes no admission, or `null` when it does. */
export function admissionProblem(address: string): 'malformed' | 'reserved' | null {
  if (address.length > 254 || !EMAIL_SHAPE.test(address)) return 'malformed'
  return RESERVED_DOMAINS.test(address.slice(address.lastIndexOf('@') + 1)) ? 'reserved' : null
}

/** Whether an address's domain is one of `domains`, exactly (no subdomains). */
export function inDomains(address: string, domains: readonly string[]): boolean {
  const normalized = admissionEmail(address)
  const domain = normalized.slice(normalized.lastIndexOf('@') + 1)
  return domains.some(entry => entry.trim().toLowerCase() === domain)
}

/** The phase an app is in: the stored one while the app lists it, else the first it lists. */
export function effectivePhase(stored: string | null | undefined, phases: readonly AccessPhase[]): AccessPhase {
  return phases.find(phase => phase === stored) ?? phases[0] ?? 'public'
}

/** Where an address stands on the waitlist once its sign-in code checked in early access. */
export interface WaitlistRecord {
  /** The entry's id. */
  id: string
  /** `true` the first time the address's code checked: the entry was made now. */
  created: boolean
  /** The place among the people waiting, 1-based; `null` when the entry is not waiting. */
  position: number | null
  /** How many people wait. */
  total: number
  /** The signed token of the status link, `/waitlist#<token>`. */
  token: string
  /** Where the entry came from, and whether it came through a friend and asked for launch news: what the event records. */
  source: string
  referred: boolean
  news: boolean
}

/**
 * What `setupAuth` asks while a new address signs up: whether the phase
 * lets it in, and the ticket it takes. Pass the whole `setupAccess`
 * instance as `setupAuth({ access })`; nothing else calls it.
 */
export interface AccessGate {
  /** The phase now, and the ticket the address holds (or the valid code given); never a write. */
  admission: (ctx: GateReadCtx, input: { email: string, code?: string }) => Promise<{ phase: AccessPhase, ticket: AccessTicket | null, invite: InviteStatus | null }>
  /** Take the ticket for the account about to be created, in one transaction; `refused` while none admits it. */
  redeem: (ctx: GateWriteCtx, input: { email: string, code?: string, ticket: AccessTicket }) => Promise<{ ticket: AccessTicket, label?: string } | { refused: InviteStatus }>
  /** Name the new account on its ledger row. */
  attach: (ctx: GateWriteCtx, input: { email: string, userId: string }) => Promise<{ ticket: AccessTicket, label?: string } | null>
  /**
   * Record the waitlist entry of an address whose code checked in early
   * access (once; a later check finds it), and answer its place. `join` is
   * the key `joinWaitlist` handed the browser: only that join's answers,
   * launch news and share link apply. Only an app whose phases include
   * early access has it.
   */
  waitlist?: (ctx: GateWriteCtx, input: { email: string, locale?: string, join?: string }) => Promise<WaitlistRecord>
}
