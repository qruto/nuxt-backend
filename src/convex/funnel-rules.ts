import { isBackendEventType } from './events.js'

// The growth funnel's and the experiments' rules, runtime-neutral (no Vue,
// no Convex runtime): the steps and the dimensions a step is broken down
// by, the week a moment falls in, an answer to "How did you hear about
// us?", and the arithmetic the admin console reads results with (a 95%
// interval per rate, and a verdict that names a winner only when the data
// says so). The component counts with these; the admin views read them.

/** One step of the funnel. */
export type FunnelStep = 'waitlist' | 'admitted' | 'signup' | 'activation' | 'trial' | 'paid'

/** One step a person reaches, counted once per account from its sign-up on. */
export type PersonStep = 'signup' | 'activation' | 'trial' | 'paid'

/** The steps, in the order people go through them. */
export const FUNNEL_STEPS = ['waitlist', 'admitted', 'signup', 'activation', 'trial', 'paid'] as const satisfies readonly FunnelStep[]

/** The steps a person reaches, in order. */
export const PERSON_STEPS = ['signup', 'activation', 'trial', 'paid'] as const satisfies readonly PersonStep[]

/**
 * What a person's steps are broken down by:
 * - `invite`: the invite code, access link or label that admitted them;
 * - `campaign`: the first campaign link (UTM) they arrived through;
 * - `referral`: the referral code they claimed;
 * - `promotion`: the catalog promotion they first paid with;
 * - `answer`: what they said when asked how they heard about the app.
 */
export const FUNNEL_DIMENSIONS = ['invite', 'campaign', 'referral', 'promotion', 'answer'] as const satisfies readonly FunnelDimension[]

/** One dimension a person step is broken down by: see `FUNNEL_DIMENSIONS`. */
export type FunnelDimension = 'invite' | 'campaign' | 'referral' | 'promotion' | 'answer'

/** The value of a dimension nothing filled: no campaign, no answer, no invite. Read as "Direct or unknown". */
export const FUNNEL_DIRECT = 'direct'

/** Where the values past the {@link FUNNEL_VALUES_MAX} with the most people are folded in the report. */
export const FUNNEL_OTHER = 'other'

/** The most values of a dimension the report lists apart, those with the most people; the rest read as {@link FUNNEL_OTHER}. */
export const FUNNEL_VALUES_MAX = 20

/** The longest value a dimension keeps, in characters. */
export const FUNNEL_VALUE_MAX = 64

/** The most weeks the funnel and its cohorts read back. */
export const FUNNEL_WEEKS_MAX = 26

/** How long after its sign-up an account may still claim its first campaign: a day, as a referral. */
export const FIRST_TOUCH_WINDOW_MS = 24 * 60 * 60 * 1000

/** One day, in milliseconds. */
const DAY_MS = 24 * 60 * 60 * 1000

/** One week, in milliseconds. */
export const WEEK_MS = 7 * DAY_MS

/** The first Monday after the epoch (1970-01-05), 00:00 UTC: weeks start on Mondays. */
const FIRST_MONDAY_MS = 4 * DAY_MS

/** The start of the week (Monday, 00:00 UTC) a moment falls in, epoch ms. */
export function weekOf(at: number): number {
  return Math.floor((at - FIRST_MONDAY_MS) / WEEK_MS) * WEEK_MS + FIRST_MONDAY_MS
}

/**
 * A dimension's value as the funnel keeps it: trimmed, lower case, at most
 * {@link FUNNEL_VALUE_MAX} characters; {@link FUNNEL_DIRECT} for nothing.
 */
export function funnelValue(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim().toLowerCase().slice(0, FUNNEL_VALUE_MAX)
  return trimmed || FUNNEL_DIRECT
}

/** The UTM parameters a campaign link carries, as `useCampaign` reads them. */
export interface CampaignTouch {
  source?: string
  medium?: string
  campaign?: string
  term?: string
  content?: string
}

/** The campaign a first touch is counted under: its `utm_campaign`, else its `utm_source`; `null` without either. */
export function campaignOf(touch: CampaignTouch | undefined): string | null {
  const name = touch?.campaign?.trim() || touch?.source?.trim()
  return name ? funnelValue(name) : null
}

/** An answer's name: a lower-case letter, then letters, digits and `-`, at most 32 characters. */
const ANSWER = /^[a-z][a-z0-9-]{0,31}$/

/** The longest free text an "Other" answer keeps, in characters. */
export const SOURCE_DETAIL_MAX = 100

/** The answers `<HowDidYouHear>` offers by default, in order: `ai-assistant` makes the channel no referrer shows visible. */
export const SOURCE_ANSWERS = ['friend', 'search', 'ai-assistant', 'social', 'podcast', 'other'] as const

/** Whether `answer` can be an answer's name. */
export function isSourceAnswer(answer: string): boolean {
  return ANSWER.test(answer)
}

/** A rate with its 95% interval. */
export interface RateInterval {
  /** Conversions over exposures, 0 to 1; 0 with no exposures. */
  rate: number
  /** The interval's low end. */
  low: number
  /** The interval's high end. */
  high: number
}

/** The z score of a two-sided 95% interval. */
const Z95 = 1.959964

/**
 * A proportion with its 95% Wilson score interval, which stays inside 0 to
 * 1 and behaves for small counts, where the normal approximation does not.
 */
export function wilsonInterval(successes: number, trials: number): RateInterval {
  if (trials <= 0) return { rate: 0, low: 0, high: 0 }
  const rate = Math.min(successes, trials) / trials
  const z2 = Z95 * Z95
  const denominator = 1 + z2 / trials
  const centre = (rate + z2 / (2 * trials)) / denominator
  const margin = (Z95 * Math.sqrt((rate * (1 - rate)) / trials + z2 / (4 * trials * trials))) / denominator
  return { rate, low: Math.max(0, centre - margin), high: Math.min(1, centre + margin) }
}

/** The fewest exposures each variant needs before the console names a leader. */
export const EXPERIMENT_MIN_EXPOSURES = 100

/**
 * What the results say, for the console:
 * - `too_few`: some variant has fewer than 100 exposures, or the experiment has no goal;
 * - `no_difference`: every interval overlaps the control's;
 * - `leading`: the `leader`'s interval is clear of the control's.
 */
export type ExperimentVerdict = { kind: 'too_few' } | { kind: 'no_difference' } | { kind: 'leading', leader: string }

/** The verdict over each variant's goal rate, the control first. */
export function experimentVerdict(variants: ReadonlyArray<{ name: string, exposed: number, goal: RateInterval }>): ExperimentVerdict {
  if (variants.length < 2 || variants.some(variant => variant.exposed < EXPERIMENT_MIN_EXPOSURES)) return { kind: 'too_few' }
  const [control, ...rest] = variants
  const clear = [control!, ...rest].filter(variant => variant === control
    ? rest.every(other => other.goal.high < control!.goal.low)
    : variant.goal.low > control!.goal.high)
  if (clear.length === 0) return { kind: 'no_difference' }
  const leader = clear.reduce((best, variant) => variant.goal.rate > best.goal.rate ? variant : best)
  return { kind: 'leading', leader: leader.name }
}

/** Whether a guardrail is worse in a variant than in the control: its rate's interval sits above the control's rate. */
export function guardrailWorse(variant: RateInterval, control: RateInterval): boolean {
  return variant.low > control.rate
}

/** A variant's name: a lower-case letter, then letters, digits, `-` and `_`, at most 32 characters. */
const VARIANT = /^[a-z][\w-]{0,31}$/

/** The fewest and the most variants an experiment splits people between. */
export const EXPERIMENT_VARIANTS_MIN = 2
export const EXPERIMENT_VARIANTS_MAX = 4

/** The most guardrails one experiment watches. */
export const EXPERIMENT_GUARDRAILS_MAX = 8

/** An app's own kind, as the event path takes one. */
const APP_KIND = /^app(?:\.[a-z][a-z0-9_]*)+$/

/** Whether `kind` is an event kind the path can record: one of the package's, or an app's own under `app.`. */
export function isEventKind(kind: string): boolean {
  return isBackendEventType(kind) || APP_KIND.test(kind)
}

/** What an experiment declares beside its flag's default. */
export interface ExperimentShape {
  variants?: readonly string[]
  weights?: readonly number[]
  goal?: string
  guardrails?: readonly string[]
  discounts?: Readonly<Record<string, string>>
}

/** What is wrong with an experiment's variants and their weights, or `null`. */
function variantsProblem(variants: readonly string[], weights: readonly number[] | undefined): string | null {
  if (!Array.isArray(variants) || variants.length < EXPERIMENT_VARIANTS_MIN || variants.length > EXPERIMENT_VARIANTS_MAX) return `declares ${EXPERIMENT_VARIANTS_MIN} to ${EXPERIMENT_VARIANTS_MAX} \`variants\`, the control first`
  if (variants.some(name => typeof name !== 'string' || !VARIANT.test(name))) return 'names each variant with a lower-case letter, then letters, digits, `-` and `_`'
  if (new Set(variants).size !== variants.length) return 'names each variant once'
  const badWeight = (weight: unknown) => typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0
  if (weights !== undefined && (!Array.isArray(weights) || weights.length !== variants.length || weights.some(badWeight))) return 'gives `weights` one positive number per variant'
  return null
}

/** What is wrong with the kinds an experiment counts, or `null`. */
function kindsProblem(goal: string | undefined, guardrails: readonly string[] | undefined): string | null {
  if (goal !== undefined && !isEventKind(goal)) return `has \`goal\` ${goal}, which is no event kind: one of the package's, or one of yours under \`app.\``
  if (guardrails === undefined) return null
  if (!Array.isArray(guardrails) || guardrails.length > EXPERIMENT_GUARDRAILS_MAX) return `watches at most ${EXPERIMENT_GUARDRAILS_MAX} \`guardrails\``
  const unknown = guardrails.find(kind => typeof kind !== 'string' || !isEventKind(kind))
  return unknown === undefined ? null : `has guardrail ${String(unknown)}, which is no event kind`
}

/** What is wrong with a price test's discounts, or `null`: each from a variant that is not the control. */
function discountsProblem(variants: readonly string[], discounts: Readonly<Record<string, string>> | undefined): string | null {
  const entry = Object.entries(discounts ?? {}).find(([variant, key]) => !variants.includes(variant) || variant === variants[0] || typeof key !== 'string' || !key.trim())
  return entry ? `maps \`discounts\` from a variant that is not the control to a catalog discount's key: ${entry[0]} is not one` : null
}

/** What is wrong with an experiment's fields, or `null`. A flag without `variants` takes none of the others. */
export function experimentProblem(shape: ExperimentShape): string | null {
  const { variants, weights, goal, guardrails, discounts } = shape
  if (variants !== undefined) return variantsProblem(variants, weights) ?? kindsProblem(goal, guardrails) ?? discountsProblem(variants, discounts)
  const extra = [weights, goal, guardrails, discounts].some(field => field !== undefined)
  return extra ? 'takes `weights`, `goal`, `guardrails` and `discounts` only with `variants`' : null
}

/** How finely a variant split is cut: a bucket is one of this many. */
const VARIANT_BUCKETS = 10_000

/**
 * The variant a bucket (0 to 9 999) lands in, by the weights (equal when
 * none are given): the first variant whose share of the buckets, added up
 * in order, passes the bucket.
 */
export function variantForBucket(variants: readonly string[], weights: readonly number[] | undefined, bucket: number): string {
  const shares = weights ?? variants.map(() => 1)
  const total = shares.reduce((sum, weight) => sum + weight, 0)
  let edge = 0
  for (const [index, variant] of variants.entries()) {
    edge += (shares[index]! / total) * VARIANT_BUCKETS
    if (bucket < edge) return variant
  }
  return variants.at(-1)!
}

/** One value of a dimension, with the people of each step counted under it. */
export interface FunnelBreakdownRow {
  /** The value: a campaign, an answer's name, an invite's label, a referral code, a promotion's key; `direct` for none, `other` past the values kept apart. */
  value: string
  /** A referral code's owner, by name, while the account exists. */
  label?: string
  /** The people of each step counted under it. */
  counts: Record<PersonStep, number>
}

/** One sign-up week's cohort. */
export interface FunnelCohort {
  /** The week's start (Monday, 00:00 UTC), epoch ms. */
  week: number
  /** The accounts that signed up in it. */
  size: number
  /** How many of them were active in each week from it on: the first is its own week. */
  active: number[]
}

/** The growth funnel over a run of weeks, as `getFunnel` answers it. */
export interface FunnelReport extends Record<FunnelStep, number> {
  /** How many weeks it covers. */
  weeks: number
  /** The first week's start, epoch ms. */
  since: number
  /** The last week's start, epoch ms. */
  until: number
  /** Each person step broken down by each dimension: the values with anyone in them. */
  breakdowns: Record<FunnelDimension, FunnelBreakdownRow[]>
  /** The sign-up weeks, oldest first, with their retention. */
  cohorts: FunnelCohort[]
  /** The latest "Other" answers' own words, newest first. */
  otherAnswers: string[]
}
