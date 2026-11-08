// One list of categories every moderation provider maps onto, so a policy
// (`block`, `escalate`, thresholds) reads the same whichever provider
// answered. Each category has a score from 0 to 1 and whether the provider
// can judge it at all for the input it read: a category it cannot judge is
// `supported: false`, never a score of 0, so a provider that is blind to
// something never reads as having found it safe. A provider's own codes
// (Llama Guard's `S1` to `S14`, Azure's severities) are kept beside them.

/** A category every moderation provider maps onto. */
export type ModerationCategory
  = | 'sexual'
    | 'suggestive'
    | 'minors_sexual'
    | 'minor_present'
    | 'violence'
    | 'self_harm'
    | 'hate'
    | 'weapons'
    | 'drugs'
    | 'csam_match'

/** Every category, in the order a statement of reasons lists them. */
export const MODERATION_CATEGORIES: readonly ModerationCategory[] = [
  'csam_match',
  'minors_sexual',
  'sexual',
  'suggestive',
  'violence',
  'self_harm',
  'hate',
  'weapons',
  'drugs',
  'minor_present',
]

/** One category's reading: how strongly it was found, from 0 to 1, and whether it could be judged at all. */
export interface CategoryScore {
  score: number
  supported: boolean
}

/** What one provider read in the content: a score per category it reports, and its own codes for what it found. */
export interface ProviderReading {
  /** The provider, as `setupAi({ moderation })` names it: `azure-content-safety`, `openai-moderation`, `llama-guard`… */
  provider: string
  scores: Partial<Record<ModerationCategory, CategoryScore>>
  /** The provider's own codes for what it found, such as `S12` or `Sexual:4`; empty when nothing was. */
  codes: string[]
}

/**
 * The score at or above which a category flags the content. The defaults
 * suit an app that takes no sexual content, as card processors ask of AI
 * image generation: anything sexual flags, a suggestive image does not on
 * its own, and anything about minors flags at the faintest signal.
 * `minor_present` is a signal for the record and never flags alone.
 */
export const DEFAULT_THRESHOLDS: Readonly<Record<Exclude<ModerationCategory, 'minor_present'>, number>> = {
  csam_match: 0.01,
  minors_sexual: 0.05,
  sexual: 0.3,
  suggestive: 0.7,
  violence: 0.5,
  self_harm: 0.5,
  hate: 0.5,
  weapons: 0.7,
  drugs: 0.7,
}

/** The categories that read as sexual: on a prompt or a model's output, any signal of them flags. */
const SEXUAL: readonly ModerationCategory[] = ['sexual', 'suggestive', 'minors_sexual']

/** The threshold every sexual category takes at a prompt or an output, where no hash list can help. */
export const STRICT_SEXUAL_THRESHOLD = 0.05

/** How far below a threshold a score still asks for a second opinion. */
export const GRAY_BAND = 0.15

/** The thresholds one check runs on: the app's over the defaults, the sexual ones strict on a prompt or an output. */
export function thresholdsFor(own: Partial<Record<ModerationCategory, number>> | undefined, stage: string | undefined): Record<string, number> {
  const thresholds: Record<string, number> = { ...DEFAULT_THRESHOLDS, ...own }
  delete thresholds.minor_present
  if (stage === 'prompt' || stage === 'output') {
    for (const category of SEXUAL) thresholds[category] = Math.min(thresholds[category] ?? STRICT_SEXUAL_THRESHOLD, STRICT_SEXUAL_THRESHOLD)
  }
  return thresholds
}

/** Refuse thresholds that cannot work: an unknown category, or a score outside 0 to 1. */
export function requireThresholds(thresholds: unknown): void {
  if (thresholds === undefined) return
  if (typeof thresholds !== 'object' || thresholds === null || Array.isArray(thresholds)) {
    throw new TypeError('[nuxt-backend] setupAi({ moderation }): `thresholds` maps categories, such as `sexual`, to a score from 0 to 1.')
  }
  for (const [category, value] of Object.entries(thresholds)) {
    if (!MODERATION_CATEGORIES.includes(category as ModerationCategory) || category === 'minor_present') {
      throw new TypeError(`[nuxt-backend] setupAi({ moderation }): '${category}' is no category a threshold takes; use one of ${MODERATION_CATEGORIES.filter(name => name !== 'minor_present').join(', ')}.`)
    }
    if (typeof value !== 'number' || !(value > 0 && value <= 1)) {
      throw new TypeError(`[nuxt-backend] setupAi({ moderation }): the threshold for '${category}' is a score above 0 and at most 1.`)
    }
  }
}

/** The readings combined: per category, the highest score among the providers that could judge it. */
export function combineReadings(readings: readonly ProviderReading[]): Partial<Record<ModerationCategory, CategoryScore>> {
  const combined: Partial<Record<ModerationCategory, CategoryScore>> = {}
  for (const reading of readings) {
    for (const [category, value] of Object.entries(reading.scores) as Array<[ModerationCategory, CategoryScore]>) {
      const seen = combined[category]
      if (!value.supported) {
        combined[category] ??= { score: 0, supported: false }
        continue
      }
      if (!seen?.supported || value.score > seen.score) combined[category] = { score: value.score, supported: true }
    }
  }
  return combined
}

/** The categories whose score reaches its threshold. `minor_present` never flags alone. */
export function flaggedCategories(scores: Partial<Record<ModerationCategory, CategoryScore>>, thresholds: Record<string, number>): ModerationCategory[] {
  return MODERATION_CATEGORIES.filter((category) => {
    const reading = scores[category]
    const threshold = thresholds[category]
    return reading?.supported === true && threshold !== undefined && reading.score >= threshold
  })
}

/** Whether a score sits in the gray band below its threshold, where a second opinion is asked for. */
export function inGrayBand(scores: Partial<Record<ModerationCategory, CategoryScore>>, thresholds: Record<string, number>): boolean {
  return Object.entries(scores).some(([category, reading]) => {
    const threshold = thresholds[category]
    return reading?.supported === true && threshold !== undefined && reading.score < threshold && reading.score >= threshold - GRAY_BAND
  })
}

/** What Llama Guard's hazard codes mean in the shared categories: each code found reads as a score of 1. */
const LLAMA_GUARD_CATEGORIES: Readonly<Record<string, ModerationCategory>> = {
  S1: 'violence',
  S2: 'drugs',
  S4: 'minors_sexual',
  S9: 'weapons',
  S10: 'hate',
  S11: 'self_harm',
  S12: 'sexual',
}

/** A classifier's codes (Llama Guard's, or a policy-following classifier answering in them) as a reading. */
export function classifierReading(provider: string, codes: readonly string[]): ProviderReading {
  const scores: Partial<Record<ModerationCategory, CategoryScore>> = {}
  for (const category of new Set(Object.values(LLAMA_GUARD_CATEGORIES))) scores[category] = { score: 0, supported: true }
  for (const code of codes) {
    const category = LLAMA_GUARD_CATEGORIES[code.toUpperCase()]
    if (category) scores[category] = { score: 1, supported: true }
  }
  return { provider, scores, codes: [...codes] }
}
