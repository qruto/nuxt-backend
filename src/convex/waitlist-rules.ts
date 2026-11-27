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
/** The largest wave an administrator may plan; it is admitted 200 at a time. */
export const WAITLIST_WAVE_PLAN_MAX = 10_000
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

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * How the line rewards sharing, as the component applies it: how far each
 * friend moves the sharer up, how many friends count, and how far a friend
 * who came through a link starts up the line themselves. Durations in ms.
 */
export interface WaitlistBoostRule {
  /** How far each friend moves the sharer up the line. */
  perFriend: number
  /** The most friends that count for one person; `null` for no limit, 0 when sharing is off. */
  cap: number | null
  /** How far a friend who came through a link starts up the line. */
  welcome: number
}

/** The package's rule: a day for each friend, up to ten, and nothing for the friend. */
export const DEFAULT_BOOST: WaitlistBoostRule = { perFriend: DAY_MS, cap: 10, welcome: 0 }

/** The most a single friend, or a welcome, may be worth: a year. */
export const WAITLIST_BOOST_MAX_MS = 365 * DAY_MS

/**
 * The waitlist's rule, checked, as the sign-in gate and `setupWaitlist`
 * read it: how sharing moves people, whether a person may read their place
 * and the size of the list, and whether a sharer hears of a friend.
 */
export interface WaitlistRule {
  boost: WaitlistBoostRule
  /** Whether a person reads their place and how many wait. */
  rank: boolean
  /** Whether a sharer is emailed when a friend joins with their link. */
  notify: boolean
}

/** How sharing moves people up the line, as `setupAccess({ waitlist: { boost } })` takes it. Durations in milliseconds. */
export interface WaitlistBoostOptions {
  /** How far each friend who joins through a person's link moves them up the line. Default a day; at most a year. */
  perFriend?: number
  /** The most friends that count for one person. Default 10; `null` for no limit. */
  cap?: number | null
  /** How far the friend starts up the line themselves, for coming through a link. Default 0. */
  welcome?: number
  /** Email the person, at most once a day, when a friend joins with their link (`waitlistFriendJoined`). Default false. */
  notify?: boolean
}

/** The waitlist's rule as `setupAccess({ waitlist })` takes it. */
export interface WaitlistOptions {
  /** How sharing moves people; `false` turns it off. Default: a day a friend, up to ten, nothing for the friend. */
  boost?: WaitlistBoostOptions | false
  /** What a person reads of their standing; `{ rank: false }` keeps their position and the list's size to the administrators. */
  place?: { rank?: boolean }
}

/** The rule `setupAccess({ waitlist })` names, checked: whole milliseconds, a positive step, a cap of at least one friend or none. */
export function checkedWaitlistRule(options: WaitlistOptions | undefined): WaitlistRule {
  const rank = options?.place?.rank !== false
  const boost = options?.boost
  if (boost === false) return { boost: { ...DEFAULT_BOOST, cap: 0, welcome: 0 }, rank, notify: false }
  const perFriend = boost?.perFriend ?? DEFAULT_BOOST.perFriend
  const cap = boost?.cap === undefined ? DEFAULT_BOOST.cap : boost.cap
  const welcome = boost?.welcome ?? DEFAULT_BOOST.welcome
  if (!Number.isInteger(perFriend) || perFriend < 60_000 || perFriend > WAITLIST_BOOST_MAX_MS) throw new TypeError('[nuxt-backend] setupAccess: `waitlist.boost.perFriend` is a whole number of milliseconds, from a minute to a year.')
  if (cap !== null && (!Number.isInteger(cap) || cap < 1)) throw new TypeError('[nuxt-backend] setupAccess: `waitlist.boost.cap` is a whole number of friends, at least 1, or `null` for no limit. To turn sharing off, pass `boost: false`.')
  if (!Number.isInteger(welcome) || welcome < 0 || welcome > WAITLIST_BOOST_MAX_MS) throw new TypeError('[nuxt-backend] setupAccess: `waitlist.boost.welcome` is a whole number of milliseconds, from 0 to a year.')
  return { boost: { perFriend, cap, welcome }, rank, notify: boost?.notify === true }
}

/**
 * The key people queue by: when they were verified, moved up by the credit
 * their friends earned them (and the welcome a link gave them). The date
 * itself is never rewritten: only the key moves. Ties break by entry id.
 */
export function queueKey(verifiedAt: number, credit = 0): number {
  return verifiedAt - credit
}

/**
 * How many more friends put a person ahead of a cutoff key, each friend
 * moving them `perFriend` up: 0 when they stand ahead of it already. A key
 * equal to the cutoff counts as behind it, as a tie may break either way.
 */
export function friendsShortOf(key: number, cutoff: number, perFriend: number): number {
  if (key < cutoff) return 0
  return Math.floor((key - cutoff) / perFriend) + 1
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
