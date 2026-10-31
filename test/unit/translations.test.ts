import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { baseCompile } from '@intlify/message-compiler'
import { createI18n } from 'vue-i18n'
import { describe, expect, it, vi } from 'vitest'
import { BACKEND_LABEL_GROUPS, findLabel, formatLabel, type LabelTree, TRANSLATED_LOCALES } from '../../src/convex/label-format'
import { LABEL_TRANSLATIONS } from '../../src/convex/label-translations'
import { LABELS } from '../../src/convex/labels'
import { registerI18nMessages } from '../../src/nuxt/i18n'
import { logger } from '../../src/nuxt/logger'
import { renderEmail } from '../../src/runtime/test-utils/email'

// The package's own translations (src/runtime/locales/<locale>.json): every
// key of the English messages, the same placeholders, plural forms vue-i18n
// reads, the backend's copy of the emails' groups, and the emails written in
// them for a reader of that language.

/** Every message of a tree, by its dotted key. */
function messages(tree: LabelTree, prefix = ''): Array<[string, string]> {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [[`${prefix}${key}`, value] as [string, string]] : messages(value, `${prefix}${key}.`))
}

const placeholders = (message: string) => [...new Set([...message.matchAll(/\{(\w+)\}/g)].map(([, name]) => name))].sort()

const english = new Map(messages(LABELS))
const locales = Object.fromEntries(TRANSLATED_LOCALES.map(locale => [locale,
  JSON.parse(readFileSync(new URL(`../../src/runtime/locales/${locale}.json`, import.meta.url), 'utf8')) as { backend: LabelTree }]))

describe.each(TRANSLATED_LOCALES)('the %s messages', (locale) => {
  const translated = new Map(messages(locales[locale]!.backend))

  it('have every key of the English messages, and no other', () => {
    expect([...translated.keys()].filter(key => !english.has(key))).toEqual([])
    expect([...english.keys()].filter(key => !translated.has(key))).toEqual([])
  })

  it('keep each message\'s placeholders and its number of plural forms', () => {
    const drifted = [...english].flatMap(([key, message]) => {
      const theirs = translated.get(key) ?? ''
      return placeholders(theirs).join() === placeholders(message).join() && theirs.split('|').length === message.split('|').length ? [] : [key]
    })
    expect(drifted).toEqual([])
  })

  it('compile as vue-i18n messages, and fill in the way vue-i18n does', () => {
    const i18n = createI18n({ legacy: false, locale, missingWarn: false, fallbackWarn: false, messages: { [locale]: locales[locale]! } })
    const failures: string[] = []
    for (const [key, message] of translated) {
      baseCompile(message, { onError: error => failures.push(`${key}: ${error.message}`) })
      const params = Object.fromEntries(placeholders(message).map(name => [name!, `<${name}>`]))
      for (const count of message.includes('|') ? [0, 1, 2, 5, 21] : [undefined]) {
        const filled = count === undefined ? params : { ...params, count }
        const theirs = count === undefined ? i18n.global.t(`backend.${key}`, filled) : i18n.global.t(`backend.${key}`, filled, count)
        if (formatLabel(message, filled) !== theirs) failures.push(`${key} (count ${count}): ${theirs}`)
      }
    }
    expect(failures).toEqual([])
  })

  it('are what the backend reads for the groups it renders', () => {
    const groups = Object.fromEntries(BACKEND_LABEL_GROUPS.map(group => [group, locales[locale]!.backend[group]]))
    expect(LABEL_TRANSLATIONS[locale]).toEqual(groups)
  })
})

/** The package's translation at a dotted key, as the backend reads it. */
const translated = (locale: string, key: string) => findLabel(LABEL_TRANSLATIONS[locale]!, key)!

describe('an email to a reader of a translated language', () => {
  const invite = { email: 'grace@example.com', url: 'https://app.example.com/accept-invitation?id=1', inviterName: 'Ada', inviterEmail: 'ada@example.com', workspaceName: 'Acme', role: 'member' }

  it('is written in it, with no messages of the app\'s', async () => {
    const german = await renderEmail('invite', invite, { locale: 'de-AT' })
    expect(german.subject).toBe(formatLabel(translated('de', 'email.invite.subject'), { workspace: 'Acme' }))
    expect(german.subject).not.toBe(formatLabel(LABELS.email.invite.subject, { workspace: 'Acme' }))
    expect(german.html).toContain('lang="de"')
    const russian = await renderEmail('welcome', { email: 'ada@example.com', name: 'Ada' }, { locale: 'ru' })
    expect(russian.subject).toBe(translated('ru', 'email.welcome.subject'))
  })

  it('reads the app\'s own message first, key by key, and English for a language the package does not speak', async () => {
    const de = { backend: { email: { invite: { subject: 'Komm zu {workspace}' } } } }
    expect((await renderEmail('invite', invite, { locale: 'de', messages: { de } })).subject).toBe('Komm zu Acme')
    expect((await renderEmail('welcome', { email: 'a@b.com', name: '' }, { locale: 'de', messages: { de } })).subject).toBe(translated('de', 'email.welcome.subject'))
    expect((await renderEmail('invite', invite, { locale: 'ja' })).subject).toBe(formatLabel(LABELS.email.invite.subject, { workspace: 'Acme' }))
  })
})

describe('the development note on untranslated locales', () => {
  it('no longer names a Russian, German, Spanish or French locale', () => {
    const root = mkdtempSync(join(tmpdir(), 'nuxt-backend-translations-'))
    try {
      const codes = ['ru', 'de-AT', 'es', 'fr', 'it']
      mkdirSync(join(root, 'i18n/locales'), { recursive: true })
      for (const code of codes) writeFileSync(join(root, 'i18n/locales', `${code}.json`), JSON.stringify({ nav: {} }))
      const config = { i18n: { locales: codes.map(code => ({ code, file: `${code}.json` })) } }
      const nuxt = { options: { rootDir: root, dev: true, test: false, _prepare: false, _layers: [{ config }] }, hook: () => {} }
      const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
      registerI18nMessages({ resolve: (path: string) => path } as never, nuxt as never)
      expect(warn).toHaveBeenCalledOnce()
      expect(warn.mock.calls[0]![0]).toContain('show English in it:')
    }
    finally {
      vi.restoreAllMocks()
      rmSync(root, { recursive: true, force: true })
    }
  })
})
