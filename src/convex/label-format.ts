// The labels' syntax and how it is filled in, apart from the labels
// themselves: what every reader of a label group needs (the Vue runtime,
// which loads the groups a page shows, and the emails, which read them all).
// Runtime-neutral (no Vue, no Convex). The syntax is vue-i18n's: `{name}`
// interpolates, `|` separates plural forms.

/** Values a label interpolates. `count` also picks the plural form. */
export type LabelParams = Record<string, string | number>

/** Resolve a label by its dotted key and fill it in. */
export type Translate = (key: string, params?: LabelParams) => string

/** A tree of labels: groups of named message templates. */
export interface LabelTree {
  [key: string]: string | LabelTree
}

/**
 * The plural form vue-i18n picks by default: with two forms the first is for
 * one and the second for everything else (zero included); with three, zero,
 * one and many. A count that is not a whole number (`1.5` credits) takes
 * the last form, the one for many.
 */
function pluralIndex(forms: number, count: number): number {
  const choice = Math.abs(count)
  if (!Number.isInteger(choice)) return forms - 1
  if (forms === 2) return choice === 1 ? 0 : 1
  return Math.min(choice, forms - 1, 2)
}

/**
 * Fill in one message: choose the plural form by `params.count` when the
 * message has several (`one code | {count} codes`), then replace each
 * `{name}` with its value. A placeholder without a value stays as written,
 * so a missing parameter shows up instead of vanishing. The syntax is the
 * part of vue-i18n's the labels use: `{name}` written without spaces, and
 * `|` between forms; linked messages and literals are not read.
 */
export function formatLabel(message: string, params: LabelParams = {}): string {
  const forms = message.split('|').map(form => form.trim())
  const count = typeof params.count === 'number' ? params.count : Number(params.count)
  const chosen = forms.length > 1 && Number.isFinite(count) ? forms[pluralIndex(forms.length, count)]! : forms[0]!
  // Own parameters only: `{constructor}` without a `constructor` parameter
  // stays as written instead of reading what every object inherits.
  return chosen.replace(/\{(\w+)\}/g, (placeholder, name: string) => Object.hasOwn(params, name) ? String(params[name]) : placeholder)
}

/** The message at a dotted key, or `undefined` when the tree has none. */
export function findLabel(tree: LabelTree, key: string): string | undefined {
  let node: string | LabelTree | undefined = tree
  for (const part of key.split('.')) {
    if (node === undefined || typeof node === 'string') return undefined
    node = node[part]
  }
  return typeof node === 'string' ? node : undefined
}

/**
 * A {@link Translate} over `labels`. An unknown key comes back as the key
 * itself, the way vue-i18n shows a missing message.
 */
export function translator(labels: LabelTree): Translate {
  return (key, params) => {
    const message = findLabel(labels, key)
    return message === undefined ? key : formatLabel(message, params)
  }
}

/** The languages the package translates its labels into, beside English: `src/runtime/locales/<code>.json`. */
export const TRANSLATED_LOCALES = ['ru', 'de', 'es', 'fr'] as const

/** The label groups the backend renders: the emails' words, and the notifications' and onboarding's they send. */
export const BACKEND_LABEL_GROUPS = ['email', 'notifications', 'onboarding'] as const
