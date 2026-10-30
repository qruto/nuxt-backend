import { computed, type ComputedRef } from 'vue'
import { tryUseNuxtApp } from '#imports'
import { normalizeLocale } from '../../../convex/locale.js'

/** A locale as `@nuxtjs/i18n` lists it in `locales`: a code, or an object with its display name. */
type I18nLocaleEntry = string | { code: string, name?: string }

/** The part of the `@nuxtjs/i18n` global composer read here. */
interface I18nLocales {
  locale: { value: string } | string
  locales?: { value: I18nLocaleEntry[] } | I18nLocaleEntry[]
  setLocale?: (code: string) => Promise<void> | void
}

/** The app's `@nuxtjs/i18n` composer, or `undefined` without it. */
function appI18n(): I18nLocales | undefined {
  return (tryUseNuxtApp() as { $i18n?: I18nLocales } | null)?.$i18n
}

/** The active locale's code, as the app's i18n spells it. */
function currentCode(i18n: I18nLocales): string {
  return typeof i18n.locale === 'string' ? i18n.locale : i18n.locale.value
}

/**
 * The app's language now: the active `@nuxtjs/i18n` locale's code, in the
 * spelling the backend stores (`pt-BR`), or `undefined` without
 * `@nuxtjs/i18n` (the browser's own `Accept-Language` speaks for it then).
 * A reader for the current app: call it inside a setup or a plugin.
 */
export function useActiveLocale(): () => string | undefined {
  const i18n = appI18n()
  return () => (i18n ? normalizeLocale(currentCode(i18n)) ?? undefined : undefined)
}

/** One language a person can pick: its i18n code and the name the app gives it. */
export interface AppLanguage {
  code: string
  name: string
}

/** The app's languages, the active one, and switching between them. */
export interface AppLanguages {
  /** Every locale `@nuxtjs/i18n` lists; empty without it. */
  available: ComputedRef<AppLanguage[]>
  /** The active locale's code; `undefined` without `@nuxtjs/i18n`. */
  current: ComputedRef<string | undefined>
  /** Switch the app to a listed locale: a signed-in account stores it too (the locale-sync plugin). */
  select: (code: string) => Promise<void>
}

/**
 * The languages the app is offered in, as `@nuxtjs/i18n` lists them, for a
 * language picker: `<ProfileSettings>` renders one when there are two or
 * more. Switching goes through `@nuxtjs/i18n`'s own `setLocale`, so the
 * pages follow, and a signed-in account stores the new language for its
 * emails.
 */
export function useAppLanguages(): AppLanguages {
  const i18n = appI18n()
  const entries = (): I18nLocaleEntry[] => {
    const locales = i18n?.locales
    return (Array.isArray(locales) ? locales : locales?.value) ?? []
  }
  return {
    available: computed(() => entries().map(entry => (typeof entry === 'string' ? { code: entry, name: entry } : { code: entry.code, name: entry.name ?? entry.code }))),
    current: computed(() => (i18n ? currentCode(i18n) : undefined)),
    select: async (code) => {
      if (!i18n?.setLocale || (i18n && currentCode(i18n) === code)) return
      await i18n.setLocale(code)
    },
  }
}
