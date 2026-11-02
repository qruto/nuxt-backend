// The waitlist's vocabulary and arithmetic: the statuses an entry goes
// through, the order people wait in, the signed link that shows a person
// their place, and the checks on what a join carries. Pure (no Convex, no
// Better Auth), so the `backend` component's rows, the app's `setupWaitlist`
// and the sign-in hooks read the same names.

import { base64url, sameText, taggedHmacKey } from './tokens.js'

/** Where an entry stands: waiting for a wave, admitted (it holds a ticket), declined, or joined (it became an account). */
export type WaitlistStatus = 'waiting' | 'admitted' | 'declined' | 'joined'

/** Every status, in the order the Waitlist tab counts them. */
export const WAITLIST_STATUSES = ['waiting', 'admitted', 'declined', 'joined'] as const satisfies readonly WaitlistStatus[]

/** The questions an app asks beside the address: each key holds the choices an answer must be one of. */
export type WaitlistQuestions = Readonly<Record<string, readonly string[]>>

/** The most questions an app asks. */
export const WAITLIST_QUESTIONS_MAX = 5
/** The most choices one question offers. */
export const WAITLIST_CHOICES_MAX = 20
/** The longest source, in characters (`landing`, `launch-week`). */
export const WAITLIST_SOURCE_MAX = 64
/** The longest note an administrator keeps on an entry. */
export const WAITLIST_NOTE_MAX = 500
/** The most entries one admission takes (the tab's "next N"). */
export const WAITLIST_WAVE_MAX = 200
/** The most entries a console read lists. */
export const WAITLIST_CONSOLE_ROWS = 200
/** How many of a status's oldest entries a filtered console read looks through. */
export const WAITLIST_FILTER_SCAN = 1000

// The mailbox rule is the referral program's, one for every sharer.
export { mailboxOf } from './referral-rules.js'

/** The source of an entry made on the sign-in page. */
export const SOURCE_SIGN_IN = 'sign-in'
/** The source of an entry made on a form, when the app names none. */
export const SOURCE_FORM = 'form'

/** How many friends move a person up, by default, and how far each moves them. */
export const DEFAULT_BOOST = { cap: 10, days: 1 } as const

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The key people queue by: when they were verified, moved up by their
 * boost. A friend is worth `days` days, up to the cap, so one sharer never
 * jumps a whole list and a long wait still counts. Ties break by entry id.
 */
export function queueKey(verifiedAt: number, boost: number, days: number = DEFAULT_BOOST.days): number {
  return verifiedAt - boost * days * DAY_MS
}

/** An address as the waitlist keeps it: trimmed, lower-cased. */
export function waitlistEmail(address: string): string {
  return address.trim().toLowerCase()
}

/** SHA-256 of an address, hex: what a rate-limit row carries, so the limiter's table holds no address. */
export async function addressDigest(address: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(waitlistEmail(address)))
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}

/** The domain of an address, lower-case. */
export function domainOf(address: string): string {
  const email = waitlistEmail(address)
  return email.slice(email.lastIndexOf('@') + 1)
}

/** Why a join's answers are refused: the question (a field of the join) and what is wrong with it. */
export interface AnswerProblem {
  field: string
  reason: 'unknown_question' | 'unknown_choice'
}

/**
 * Check a join's answers against the app's questions: every answer belongs
 * to a question the app asks and is one of its choices. A question left
 * unanswered is fine. `null` when they pass.
 */
export function answersProblem(questions: WaitlistQuestions | undefined, answers: Readonly<Record<string, string>> | undefined): AnswerProblem | null {
  for (const [key, answer] of Object.entries(answers ?? {})) {
    const choices = questions?.[key]
    if (!choices) return { field: key, reason: 'unknown_question' }
    if (!choices.includes(answer)) return { field: key, reason: 'unknown_choice' }
  }
  return null
}

/** The questions as `setupWaitlist` takes them, checked: a few keys, each with a few distinct, non-empty choices. */
export function checkedQuestions(questions: WaitlistQuestions | undefined): WaitlistQuestions {
  const entries = Object.entries(questions ?? {})
  if (entries.length > WAITLIST_QUESTIONS_MAX) throw new TypeError(`[nuxt-backend] setupWaitlist: at most ${WAITLIST_QUESTIONS_MAX} questions.`)
  for (const [key, choices] of entries) {
    if (!/^[\w-]{1,32}$/.test(key)) throw new TypeError(`[nuxt-backend] setupWaitlist: the question "${key}" needs a key of letters, digits, "_" or "-", up to 32 characters.`)
    if (!choices.length || choices.length > WAITLIST_CHOICES_MAX || new Set(choices).size !== choices.length || choices.some(choice => !choice.trim() || choice.length > 64)) {
      throw new TypeError(`[nuxt-backend] setupWaitlist: the question "${key}" needs 1-${WAITLIST_CHOICES_MAX} distinct choices of up to 64 characters.`)
    }
  }
  return Object.fromEntries(entries)
}

// ── The signed status link ───────────────────────────────────────────────

const encoder = new TextEncoder()

/** The key the links are signed with: derived from the auth secret, tagged for this use, so it signs nothing else. */
function statusKey(secret: string): Promise<CryptoKey> {
  return taggedHmacKey(secret, 'nuxt-backend:waitlist-status:v1')
}

/** The signature length kept, in base64url characters: 128 bits. */
const SIGNATURE_LENGTH = 22

/** The token that shows an entry's place: `<entry id>.<signature>`. Nothing is stored for it. */
export async function statusToken(secret: string, entryId: string): Promise<string> {
  const signature = base64url(new Uint8Array(await crypto.subtle.sign('HMAC', await statusKey(secret), encoder.encode(entryId))))
  return `${entryId}.${signature.slice(0, SIGNATURE_LENGTH)}`
}

/** The entry id a status token names, or `null` when it was not signed with this secret. */
export async function readStatusToken(secret: string, token: string): Promise<string | null> {
  const trimmed = token.trim()
  if (trimmed.length > 128) return null
  const dot = trimmed.lastIndexOf('.')
  if (dot < 1) return null
  const id = trimmed.slice(0, dot)
  return sameText(await statusToken(secret, id), trimmed) ? id : null
}
