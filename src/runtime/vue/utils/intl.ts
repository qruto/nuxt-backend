/**
 * Format with `Intl` in `locale`, and in the visitor's own when `Intl`
 * refuses the tag: an i18n locale code is not always a language tag, and a
 * render must never throw over one.
 */
export function inLocale<T>(locale: string | undefined, format: (locale: string | undefined) => T): T {
  if (locale) {
    try {
      return format(locale)
    }
    catch {
      // Not a tag Intl takes: the visitor's own locale below.
    }
  }
  return format(undefined)
}
