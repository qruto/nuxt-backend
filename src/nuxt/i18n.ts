import { existsSync, readFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { addPlugin, hasNuxtModule, type Resolver } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { TRANSLATED_LOCALES } from '../convex/label-format'
import { logger } from './logger'

// The bridge to @nuxtjs/i18n, which is optional: the package's messages for
// the app's locales in the languages it speaks (English, Russian, German,
// Spanish, French), the plugin that stores a language
// switch on the account (`user.locale`, the emails' language), and a dev-time
// note naming the locales whose messages have no `backend.*` keys yet. Nothing here runs a
// line of @nuxtjs/i18n; without it the hook never fires and the note has no
// locales to read.

const TRANSLATION_DOCS_URL = 'https://nuxt-backend.dev/docs/build/ui/customize/translation'

/** A locale as `i18n.locales` lists it: a code, or an object with its message files. */
type LocaleEntry = string | { code: string, language?: string, file?: LocaleFile, files?: LocaleFile[] }
type LocaleFile = string | { path: string }

/** One app locale: its code and language, and its message files, absolute. */
export interface AppLocale {
  code: string
  language?: string
  files: string[]
}

interface I18nLayerOptions {
  locales?: LocaleEntry[]
  langDir?: string
  restructureDir?: string
  strategy?: string
}

/**
 * The project's @nuxtjs/i18n options, read the way the module reads a layer:
 * the `i18n` key of nuxt.config over the inline options of its module entry.
 */
function appI18nOptions(nuxt: Nuxt): I18nLayerOptions {
  type LayerConfig = { modules?: unknown[], i18n?: I18nLayerOptions }
  const { _layers: layers } = nuxt.options as unknown as { _layers: Array<{ config: LayerConfig }> }
  const layer = layers[0]?.config ?? (nuxt.options as unknown as LayerConfig)
  const inline = (layer.modules ?? []).find((entry): entry is [string, I18nLayerOptions] => Array.isArray(entry) && entry[0] === '@nuxtjs/i18n')?.[1]
  return { ...inline, ...layer.i18n }
}

/**
 * The project's own locales, with their message files under
 * `<restructureDir>/<langDir>` (`i18n/locales`).
 */
export function appLocales(nuxt: Nuxt): AppLocale[] {
  const options = appI18nOptions(nuxt)
  const langDir = resolve(nuxt.options.rootDir, options.restructureDir ?? 'i18n', options.langDir ?? 'locales')
  return (options.locales ?? []).map((entry) => {
    if (typeof entry === 'string') return { code: entry, files: [] }
    const files = [entry.file, ...(entry.files ?? [])].filter((file): file is LocaleFile => file !== undefined)
    return { code: entry.code, language: entry.language, files: files.map(file => resolve(langDir, typeof file === 'string' ? file : file.path)) }
  })
}

/** The languages the package has messages in: `runtime/locales/<language>.json`. */
export const PACKAGED_LANGUAGES: readonly string[] = ['en', ...TRANSLATED_LOCALES]

/**
 * The language of the package's messages a locale reads: its code's
 * language, else its `language`'s (`de-AT`, or a code `austria` whose
 * `language` is `de-AT`, read `de`). `undefined` for a language the
 * package does not speak.
 */
export function packagedLanguage(locale: Pick<AppLocale, 'code' | 'language'>): string | undefined {
  return [locale.code, locale.language]
    .map(tag => tag?.split(/[-_]/)[0]?.toLowerCase())
    .find(language => language !== undefined && PACKAGED_LANGUAGES.includes(language))
}

/**
 * Locales that will show the packaged UI in English: in a language the
 * package does not speak, and every message file JSON without a top-level
 * `backend` key. A locale with a
 * JavaScript or YAML file, or none, may have its messages anywhere, so it is
 * never named.
 */
export function untranslatedLocales(locales: AppLocale[]): string[] {
  return locales.filter((locale) => {
    if (packagedLanguage(locale) !== undefined || locale.files.length === 0) return false
    return locale.files.every((file) => {
      if (extname(file) !== '.json' || !existsSync(file)) return false
      try {
        const messages = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
        return !(typeof messages === 'object' && messages !== null && 'backend' in messages)
      }
      catch {
        return false
      }
    })
  }).map(locale => locale.code)
}

/** The register function @nuxtjs/i18n hands its `i18n:registerModule` hook. */
type RegisterI18nModule = (config: { langDir: string, locales: Array<{ code: string, file: string }> }) => void

/**
 * Register the package's messages (`backend.*`, one JSON file per language,
 * which @nuxtjs/i18n precompiles like an app's own) for each of the app's
 * locales in a language the package speaks (English, Russian, German,
 * Spanish, French) through `i18n:registerModule`, so `$t('backend.errors.forbidden')` works in an
 * app's own templates, and an app's own `backend.*` message still wins. A
 * locale the app does not list is never added. In development, name the
 * locales that will show English, and warn about a routing strategy the
 * module's redirects do not follow. Beside @nuxtjs/i18n, a language switch
 * is stored on the signed-in account (`runtime/vue/plugins/locale-sync`).
 */
export function registerI18nMessages(resolver: Resolver, nuxt: Nuxt): void {
  const langDir = resolver.resolve('./runtime/locales')
  if (Array.isArray(nuxt.options.modules) && hasNuxtModule('@nuxtjs/i18n', nuxt)) addPlugin({ src: resolver.resolve('./runtime/vue/plugins/locale-sync'), mode: 'client' })
  const hook = nuxt.hook as unknown as (name: 'i18n:registerModule', fn: (register: RegisterI18nModule) => void) => void
  hook('i18n:registerModule', (register) => {
    const locales = appLocales(nuxt).flatMap((locale) => {
      const language = packagedLanguage(locale)
      return language === undefined ? [] : [{ code: locale.code, file: `${language}.json` }]
    })
    if (locales.length > 0) register({ langDir, locales })
  })

  if (!nuxt.options.dev || nuxt.options.test || nuxt.options._prepare) return
  // Under `prefix` no page answers without a locale, and the module's own
  // redirects (to sign in, after a session ends, from an emailed invitation
  // link) name unprefixed paths.
  if (appI18nOptions(nuxt).strategy === 'prefix') {
    logger.warn(
      'With @nuxtjs/i18n\'s `strategy: \'prefix\'`, the module\'s redirects (sign-in, a session that ended, invitation links) go to paths without a locale, which no page serves.'
      + `\n  ↳ Use \`prefix_except_default\` or \`prefix_and_default\`, or redirect the unprefixed paths yourself: ${TRANSLATION_DOCS_URL}#routing-strategies`,
    )
  }
  const missing = untranslatedLocales(appLocales(nuxt))
  if (missing.length > 0) {
    logger.warn(
      `The packaged pages and components show English in ${missing.join(', ')}: those locales have no \`backend.*\` messages.`
      + `\n  ↳ Translate them as \`backend.<group>.<key>\`: ${TRANSLATION_DOCS_URL}`,
    )
  }
}
