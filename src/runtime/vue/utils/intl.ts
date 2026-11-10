/**
 * The language the package formats in when the app names none: English,
 * the labels' own, as `<html lang>` says without `@nuxtjs/i18n`. Never the
 * visitor's runtime default, which a server render and the browser read
 * apart.
 */
export const PACKAGE_LOCALE = 'en'

/**
 * A language tag `Intl` accepts, or `undefined` for one it would throw on.
 * An i18n locale code is often a tag already (`fr`, `en-GB`), sometimes
 * one written with an underscore (`pt_BR`), and sometimes no tag at all.
 *
 * @internal
 */
export function intlLocale(tag: string | undefined): string | undefined {
  if (!tag) return undefined
  for (const candidate of [tag, tag.replace(/_/g, '-')]) {
    try {
      return Intl.getCanonicalLocales(candidate)[0]
    }
    catch {
      // Not a tag; try the next spelling.
    }
  }
  return undefined
}

/**
 * Format with `Intl` in `locale`, and in {@link PACKAGE_LOCALE} without one
 * or when `Intl` refuses the tag: an i18n locale code is not always a
 * language tag, and a render must never throw over one. The server and the
 * browser format alike, whatever the visitor's own locale.
 */
export function inLocale<T>(locale: string | undefined, format: (locale: string) => T): T {
  if (locale && locale !== PACKAGE_LOCALE) {
    try {
      return format(locale)
    }
    catch {
      // Not a tag Intl takes: the package's own below.
    }
  }
  return format(PACKAGE_LOCALE)
}
