// The language a person reads in, as the backend stores and matches it.
// Runtime-neutral (no Intl, no Vue, no Convex), so the auth hooks, the email
// renderer and the Nuxt side read a locale the same way.

/** The longest locale the package stores: a language, a script, a region and a variant fit well within it. */
const MAX_LOCALE_LENGTH = 35

/** A language subtag, then up to three more: `de`, `pt-BR`, `zh-Hant-TW`, `ca-ES-valencia`. */
const LOCALE_PATTERN = /^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,3}$/i

/**
 * A locale in the one spelling the package stores and compares: an i18n
 * locale code or a BCP 47 language tag, `_` read as `-`, with the language
 * in lower case, a four-letter script capitalized and a region in upper
 * case (`pt_br` → `pt-BR`, `ZH-hant-tw` → `zh-Hant-TW`). `null` for anything
 * that is not one: an empty value, `*`, a phrase, a tag over 35 characters.
 */
export function normalizeLocale(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const tag = value.trim().replace(/_/g, '-')
  if (tag.length === 0 || tag.length > MAX_LOCALE_LENGTH || !LOCALE_PATTERN.test(tag)) return null
  const [language, ...rest] = tag.split('-')
  return [language!.toLowerCase(), ...rest.map((part, index) => {
    if (part.length === 4 && /^[a-z]+$/i.test(part) && index === 0) return part[0]!.toUpperCase() + part.slice(1).toLowerCase()
    if ((part.length === 2 && /^[a-z]+$/i.test(part)) || /^\d{3}$/.test(part)) return part.toUpperCase()
    return part.toLowerCase()
  })].join('-')
}

/**
 * The language an `Accept-Language` header asks for first: the tag with the
 * highest weight (the first among equals), `null` for an absent or
 * unreadable header and for one that only says `*`.
 */
export function preferredLocale(header: string | null | undefined): string | null {
  if (!header) return null
  let best: { locale: string, weight: number } | null = null
  for (const entry of header.split(',').slice(0, 32)) {
    const [range, ...parameters] = entry.split(';')
    const locale = normalizeLocale(range)
    if (!locale) continue
    const quality = parameters.map(parameter => parameter.trim()).find(parameter => parameter.startsWith('q='))
    const weight = quality === undefined ? 1 : Number(quality.slice(2))
    if (!Number.isFinite(weight) || weight <= 0) continue
    if (!best || weight > best.weight) best = { locale, weight }
  }
  return best?.locale ?? null
}

/** The language subtag of a locale: `pt` for `pt-BR`. */
export function baseLanguage(locale: string): string {
  return locale.split('-')[0]!.toLowerCase()
}

/**
 * Which of `available` serves a reader of `wanted`: the same locale, in any
 * spelling, else one of the same language (`de` for `de-AT`, and `de-DE` for
 * `de` when there is no plain `de`). `undefined` when none does. Returns the
 * entry as `available` spells it, so it can key a messages object.
 */
export function matchLocale(wanted: string | null | undefined, available: readonly string[]): string | undefined {
  const locale = normalizeLocale(wanted)
  if (!locale) return undefined
  const exact = available.find(candidate => normalizeLocale(candidate) === locale)
  if (exact) return exact
  const language = baseLanguage(locale)
  return available.find(candidate => normalizeLocale(candidate) === language)
    ?? available.find(candidate => baseLanguage(candidate) === language)
}

/** The languages written right to left, by their language subtag. */
const RIGHT_TO_LEFT = new Set(['ar', 'arc', 'ckb', 'dv', 'fa', 'he', 'iw', 'ks', 'ps', 'sd', 'syr', 'ug', 'ur', 'yi'])

/** The direction a locale's text runs in: `rtl` for Arabic, Hebrew, Persian, Urdu and the other right-to-left languages. */
export function textDirection(locale: string): 'ltr' | 'rtl' {
  return RIGHT_TO_LEFT.has(baseLanguage(locale)) ? 'rtl' : 'ltr'
}

/**
 * The Standard Schema (https://standardschema.dev) Better Auth runs on the
 * `locale` a request writes to the account (`/update-user`, and the account a
 * code sign-in creates): a locale in the stored spelling, or a refusal.
 *
 * @internal
 */
export const LOCALE_SCHEMA = {
  '~standard': {
    version: 1 as const,
    vendor: 'nuxt-backend',
    validate: (value: unknown) => {
      if (value === null) return { value: null }
      const locale = normalizeLocale(value)
      return locale ? { value: locale } : { issues: [{ message: 'locale must be a language tag, such as en or pt-BR.' }] }
    },
  },
}
