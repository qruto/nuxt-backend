// The referral program's vocabulary and arithmetic: the codes people share,
// the rewards a program names, the hold a reward waits out and the caps it
// keeps. Pure (no Convex, no Better Auth), so the `backend` component's
// rows, the app's `setupReferrals`, the waitlist's boost and the Vue side
// read the same names. The share codes are program-wide: a waitlist entry's
// code and an account's code are one kind, and an entry's code is handed to
// the account it becomes.

const DAY_MS = 24 * 60 * 60 * 1000

/** How long a reward waits after the first payment unless the program says otherwise: the refund window, 30 days. */
export const DEFAULT_REFERRAL_HOLD_MS = 30 * DAY_MS
/** The shortest hold: the EU withdrawal period, 14 days. A shorter one is raised to it. */
export const MIN_REFERRAL_HOLD_MS = 14 * DAY_MS
/** The most trial days a program grants the person referred. */
export const REFERRAL_TRIAL_DAYS_MAX = 30
/** The most months a program grants a referrer. */
export const REFERRAL_MONTHS_MAX = 12
/** How long after sign-up a code can still be claimed: attribution is for a new account. */
export const REFERRAL_CLAIM_WINDOW_MS = DAY_MS
/** Claims on one code in an hour that look like a burst. */
export const REFERRAL_BURST = { count: 5, windowMs: 60 * 60 * 1000 } as const
/** The most referrals a console read or an export lists. */
export const REFERRAL_ROWS = 200

/** What the person referred gets: a catalog discount without a code, or trial days, on their first paid checkout. */
export type ReferredReward = { discount: string } | { trialDays: number }
/** What the referrer gets: a credit pack, or free months of their plan. */
export type ReferrerReward = { pack: string } | { months: number, plan?: string }

/** The rewards of a program; either side may be left out. */
export interface ReferralRewards {
  referred?: ReferredReward
  referrer?: ReferrerReward
}

/** The caps of a program. */
export interface ReferralCaps {
  /** The most rewards one referrer earns. */
  perReferrer?: number
  /** The most rewards the program grants in a calendar month. */
  perMonth?: number
}

/** A program's terms as `setupReferrals` checks them: the rewards, the hold in milliseconds and the caps (`null` for none). */
export interface ReferralTerms {
  rewards: ReferralRewards
  holdMs: number
  caps: { perReferrer: number | null, perMonth: number | null }
}

const isPositiveInteger = (value: unknown, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= max
const isKey = (value: unknown): value is string => typeof value === 'string' && /^[\w-]{1,64}$/.test(value)

const REFERRED_SHAPE = `rewards.referred is \`{ discount: <catalog discount key> }\` or \`{ trialDays: <1-${REFERRAL_TRIAL_DAYS_MAX}> }\`.`
const REFERRER_SHAPE = `rewards.referrer is \`{ pack: <catalog pack key> }\` or \`{ months: <1-${REFERRAL_MONTHS_MAX}>, plan?: <catalog plan key> }\`.`

/** What the person referred gets, checked. */
function checkedReferred(raw: Record<string, unknown>): ReferredReward {
  const keys = Object.keys(raw)
  if (keys.length === 1 && isKey(raw.discount)) return { discount: raw.discount }
  if (keys.length === 1 && isPositiveInteger(raw.trialDays, REFERRAL_TRIAL_DAYS_MAX)) return { trialDays: raw.trialDays }
  throw new TypeError(`[nuxt-backend] setupReferrals: ${REFERRED_SHAPE}`)
}

/** What the referrer gets, checked. */
function checkedReferrer(raw: Record<string, unknown>): ReferrerReward {
  const keys = Object.keys(raw)
  if (keys.length === 1 && isKey(raw.pack)) return { pack: raw.pack }
  const planned = keys.every(key => key === 'months' || key === 'plan') && (raw.plan === undefined || isKey(raw.plan))
  if (planned && isPositiveInteger(raw.months, REFERRAL_MONTHS_MAX)) return { months: raw.months, ...(raw.plan === undefined ? {} : { plan: raw.plan as string }) }
  throw new TypeError(`[nuxt-backend] setupReferrals: ${REFERRER_SHAPE}`)
}

/** A cap: a whole number of rewards, or none. */
function checkedCap(name: string, cap: number | undefined): number | null {
  if (cap === undefined) return null
  if (!isPositiveInteger(cap, 1_000_000)) throw new TypeError(`[nuxt-backend] setupReferrals: caps.${name} is a whole number of rewards, 1 or more.`)
  return cap
}

/** Check a program's options, refusing what the package could not keep, and fill in the defaults. */
export function checkedReferralTerms(options: { rewards?: ReferralRewards, hold?: number, caps?: ReferralCaps }): ReferralTerms {
  const referred = options.rewards?.referred as Record<string, unknown> | undefined
  const referrer = options.rewards?.referrer as Record<string, unknown> | undefined
  const rewards: ReferralRewards = {
    ...(referred === undefined ? {} : { referred: checkedReferred(referred) }),
    ...(referrer === undefined ? {} : { referrer: checkedReferrer(referrer) }),
  }
  const hold = options.hold ?? DEFAULT_REFERRAL_HOLD_MS
  if (typeof hold !== 'number' || !Number.isFinite(hold) || hold <= 0) throw new TypeError('[nuxt-backend] setupReferrals: hold is a number of milliseconds (`30 * DAY`).')
  const caps = { perReferrer: checkedCap('perReferrer', options.caps?.perReferrer), perMonth: checkedCap('perMonth', options.caps?.perMonth) }
  return { rewards, holdMs: Math.max(hold, MIN_REFERRAL_HOLD_MS), caps }
}

/** The month a reward counts in, `2026-10` (UTC). */
export function monthKey(at: number): string {
  return new Date(at).toISOString().slice(0, 7)
}

/**
 * The mailbox behind an address, for telling whether two addresses are one
 * person: lower-case, without a `+label` and without dots in its local part.
 * A person referring themselves through `me+1@`, `m.e@` and `me@` is one
 * mailbox.
 */
export function mailboxOf(address: string): string {
  const email = address.trim().toLowerCase()
  const at = email.lastIndexOf('@')
  if (at < 1) return email
  const local = email.slice(0, at)
  const plus = local.indexOf('+')
  return `${(plus > 0 ? local.slice(0, plus) : local).replaceAll('.', '')}${email.slice(at)}`
}

/** A person's share code: a short, readable code for a friend's link (`/r/<code>`, `?ref=<code>`), 40 bits. */
export function newShareCode(): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('')
}

/** A share code as it is looked up: upper-case, look-alike characters folded. `null` for input that can be no code. */
export function normalizeShareCode(input: string): string | null {
  const folded = input.trim().toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1')
  return /^[0-9A-HJKMNP-TV-Z]{8}$/.test(folded) ? folded : null
}

/** The code a pasted link or a typed value carries: the last path segment of a `/r/<code>` link, or the value itself. */
export function codeFromInput(input: string): string | null {
  const trimmed = input.trim().slice(0, 256)
  const fromLink = /\/r\/([^/?#\s]+)/.exec(trimmed)?.[1]
  return normalizeShareCode(fromLink ?? trimmed)
}

/** The states a referral goes through: claimed, held (first payment made, waiting out the hold), rewarded, voided. */
export type ReferralState = 'claimed' | 'held' | 'rewarded' | 'voided'

/** Why a referral was flagged for an administrator: it is not refused, its reward waits. */
export const REFERRAL_FLAGS = ['same_network', 'burst'] as const
export type ReferralFlag = typeof REFERRAL_FLAGS[number]

/** Why a referral was voided. */
export const REFERRAL_VOID_REASONS = ['refunded', 'self_referral', 'administrator', 'account_erased'] as const
export type ReferralVoidReason = typeof REFERRAL_VOID_REASONS[number]
