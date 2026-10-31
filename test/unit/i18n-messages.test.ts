import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Resolver } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { appLocales, packagedLanguage, registerI18nMessages, untranslatedLocales } from '../../src/nuxt/i18n'
import { logger } from '../../src/nuxt/logger'

// The bridge to an app's @nuxtjs/i18n: the package's messages for the app's
// locales in the languages it speaks (English, Russian, German, Spanish,
// French), and the dev-time note naming the locales that would show the
// packaged UI in English.

const src = fileURLToPath(new URL('../../src/', import.meta.url))
const resolver = { resolve: (path: string) => join(src, path) } as Resolver

let root: string | undefined

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true })
  root = undefined
  vi.restoreAllMocks()
})

/** An app with these locales and message files, as Nuxt hands it to a module. */
function app(i18n: Record<string, unknown> | undefined, files: Record<string, unknown> = {}, flags: { dev?: boolean, inline?: boolean } = {}) {
  root = mkdtempSync(join(tmpdir(), 'nuxt-backend-i18n-'))
  mkdirSync(join(root, 'i18n/locales'), { recursive: true })
  for (const [name, content] of Object.entries(files)) writeFileSync(join(root, 'i18n/locales', name), typeof content === 'string' ? content : JSON.stringify(content))
  const config = flags.inline ? { modules: [['@nuxtjs/i18n', i18n]] } : { i18n }
  const hooks = new Map<string, (...args: unknown[]) => unknown>()
  const nuxt = {
    options: { rootDir: root, dev: flags.dev ?? false, test: false, _prepare: false, _layers: [{ config }] },
    hook: (name: string, fn: (...args: unknown[]) => unknown) => hooks.set(name, fn),
  } as unknown as Nuxt
  return { nuxt, hooks }
}

describe('appLocales', () => {
  it('reads the locales and their files from nuxt.config, or from the module entry', () => {
    const locales = [{ code: 'en', file: 'en.json' }, { code: 'fr', language: 'fr-FR', files: ['fr.json', { path: 'fr-extra.json' }] }, 'de']
    for (const inline of [false, true]) {
      const { nuxt } = app({ locales }, {}, { inline })
      expect(appLocales(nuxt)).toEqual([
        { code: 'en', language: undefined, files: [join(root!, 'i18n/locales/en.json')] },
        { code: 'fr', language: 'fr-FR', files: [join(root!, 'i18n/locales/fr.json'), join(root!, 'i18n/locales/fr-extra.json')] },
        { code: 'de', files: [] },
      ])
    }
  })

  it('is empty without @nuxtjs/i18n', () => {
    expect(appLocales(app(undefined).nuxt)).toEqual([])
  })
})

describe('packagedLanguage', () => {
  it('knows a language the package speaks by the locale\'s code or its language', () => {
    expect(['en', 'en-GB', 'EN-us', 'ru', 'de-AT', 'es_MX', 'fr'].map(code => packagedLanguage({ code }))).toEqual(['en', 'en', 'en', 'ru', 'de', 'es', 'fr'])
    expect(packagedLanguage({ code: 'uk', language: 'en-GB' })).toBe('en')
    expect(packagedLanguage({ code: 'austria', language: 'de-AT' })).toBe('de')
    expect(['it', 'eng', 'ena', 'frr'].map(code => packagedLanguage({ code }))).toEqual([undefined, undefined, undefined, undefined])
  })
})

describe('untranslatedLocales', () => {
  it('names the locales whose JSON messages have no backend key', () => {
    const { nuxt } = app({
      locales: [
        { code: 'en', file: 'en.json' },
        { code: 'fr', file: 'fr.json' },
        { code: 'de', file: 'de.json' },
        { code: 'ru', file: 'ru.json' },
        { code: 'es', file: 'es.json' },
        { code: 'it', file: 'it.json' },
        { code: 'pt', file: 'pt.json' },
        { code: 'ja', file: 'ja.ts' },
        { code: 'ko' },
      ],
    }, {
      'en.json': { nav: {} },
      'fr.json': { nav: {} },
      'de.json': { nav: {} },
      'ru.json': { nav: {} },
      'es.json': { nav: {} },
      'it.json': { nav: {}, backend: { auth: { title: 'Accedi' } } },
      'pt.json': { nav: {} },
      'ja.ts': 'export default {}',
    })
    // The package speaks en, ru, de, es and fr; a TypeScript file, or no file, may hold them anywhere.
    expect(untranslatedLocales(appLocales(nuxt))).toEqual(['pt'])
  })
})

describe('registerI18nMessages', () => {
  const locales = [{ code: 'en', file: 'en.json' }, { code: 'en-GB', file: 'en.json' }, { code: 'it', file: 'it.json' }]

  it('registers each language\'s messages for the app\'s locales in it, and none for another language', () => {
    const all = [...locales, { code: 'fr', file: 'fr.json' }, { code: 'de-AT', file: 'de.json' }, { code: 'mx', language: 'es-MX' }, 'ru']
    const { nuxt, hooks } = app({ locales: all }, { 'en.json': {}, 'it.json': { backend: {} } })
    registerI18nMessages(resolver, nuxt)
    const register = vi.fn()
    hooks.get('i18n:registerModule')!(register)
    expect(register).toHaveBeenCalledWith({
      langDir: join(src, 'runtime/locales'),
      locales: [
        { code: 'en', file: 'en.json' },
        { code: 'en-GB', file: 'en.json' },
        { code: 'fr', file: 'fr.json' },
        { code: 'de-AT', file: 'de.json' },
        { code: 'mx', file: 'es.json' },
        { code: 'ru', file: 'ru.json' },
      ],
    })
  })

  it('registers nothing for an app whose locales the package does not speak', () => {
    const { nuxt, hooks } = app({ locales: [{ code: 'it', file: 'it.json' }] })
    registerI18nMessages(resolver, nuxt)
    const register = vi.fn()
    hooks.get('i18n:registerModule')!(register)
    expect(register).not.toHaveBeenCalled()
  })

  it('warns in development when every page needs a locale prefix, which the module\'s redirects lack', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    registerI18nMessages(resolver, app({ locales, strategy: 'prefix_except_default' }, { 'en.json': {}, 'it.json': { backend: {} } }, { dev: true }).nuxt)
    expect(warn).not.toHaveBeenCalled()
    registerI18nMessages(resolver, app({ locales, strategy: 'prefix' }, { 'en.json': {}, 'it.json': { backend: {} } }, { dev: true }).nuxt)
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]![0]).toContain('`strategy: \'prefix\'`')
  })

  it('names the untranslated locales in development, and only there', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    registerI18nMessages(resolver, app({ locales }, { 'en.json': {}, 'it.json': {} }).nuxt)
    expect(warn).not.toHaveBeenCalled()
    registerI18nMessages(resolver, app({ locales }, { 'en.json': {}, 'it.json': {} }, { dev: true }).nuxt)
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]![0]).toContain('show English in it:')
    expect(warn.mock.calls[0]![0]).toContain('https://nuxt-backend.dev/docs/build/ui/customize/translation')
  })
})
