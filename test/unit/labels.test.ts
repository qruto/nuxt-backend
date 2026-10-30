import { readFileSync } from 'node:fs'
import { baseCompile } from '@intlify/message-compiler'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'
import { findLabel, formatLabel, LABELS, type LabelTree } from '../../src/convex/labels'
import { BACKEND_APP_CONFIG_KEYS } from '../../src/runtime/config'
import english from '../../src/runtime/locales/en.json'

// The label registry: every message the package renders, held to the rules
// that let an app translate it. Each one compiles as a vue-i18n message, and
// the package's own formatter fills it in exactly as vue-i18n does, so a
// label reads the same whether it comes from the English defaults, app
// config or an app's @nuxtjs/i18n messages.

/** Every message of a tree, by its dotted key. */
function messages(tree: LabelTree, prefix = ''): Array<[string, string]> {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [[`${prefix}${key}`, value] as [string, string]] : messages(value, `${prefix}${key}.`))
}

const all = messages(LABELS)

/** Sample values for a message's placeholders: each one names itself. */
function sampleParams(message: string): Record<string, string | number> {
  return Object.fromEntries([...message.matchAll(/\{(\w+)\}/g)].map(([, name]) => [name!, name === 'count' ? 0 : `<${name}>`]))
}

describe('the label registry', () => {
  it('holds every group a packaged component renders', () => {
    expect(Object.keys(LABELS).sort()).toEqual(['access', 'account', 'activation', 'admin', 'ai', 'announcement', 'audit', 'auth', 'connection', 'consent', 'contact', 'credits', 'deletion', 'email', 'errors', 'feedback', 'gift', 'history', 'impersonation', 'invitation', 'legal', 'maintenance', 'notifications', 'onboarding', 'preferences', 'pricing', 'profile', 'quota', 'reauthenticate', 'report', 'security', 'settings', 'shell', 'source', 'upgrade', 'upload', 'usage', 'waitlist', 'cancelFlow', 'withdrawal', 'pastDue', 'referral'].sort())

    expect(all.length).toBeGreaterThan(200)
  })

  it.each(all)('%s compiles as a vue-i18n message', (_key, message) => {
    const errors: string[] = []
    baseCompile(message, { onError: error => errors.push(error.message) })
    expect(errors).toEqual([])
  })

  const i18n = createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en: english } })

  it.each(all)('%s fills in the way vue-i18n does', (key, message) => {
    const params = sampleParams(message)
    for (const count of message.includes('|') ? [0, 1, 2, 7] : [undefined]) {
      const filled = count === undefined ? params : { ...params, count }
      const theirs = count === undefined ? i18n.global.t(`backend.${key}`, filled) : i18n.global.t(`backend.${key}`, filled, count)
      expect(formatLabel(message, filled), `count ${count}`).toBe(theirs)
    }
  })

  it('picks the last form for a count that is not a whole number', () => {
    expect(formatLabel('one credit | {count} credits', { count: 1.5 })).toBe('1.5 credits')
    expect(formatLabel('no credits | one credit | {count} credits', { count: 1.5 })).toBe('1.5 credits')
    expect(formatLabel('no credits | one credit | {count} credits', { count: 0.5 })).toBe('0.5 credits')
  })

  it('starts each accessible name with the visible label it names', () => {
    // `removeNamed` is the name of the button that shows `remove`: speech
    // input finds a button by what it shows (WCAG 2.5.3).
    // The emails' `greetingNamed` is a sentence with a name in it, not an accessible name.
    const named = all.filter(([key]) => key.endsWith('Named') && !key.startsWith('email.'))
    expect(named.length).toBeGreaterThan(3)
    for (const [key, message] of named) {
      const visible = findLabel(LABELS, key.replace(/Named$/, ''))
      expect(visible, key).toBeDefined()
      expect(message.toLowerCase().startsWith(visible!.toLowerCase()), `${key}: "${message}" starts with "${visible}"`).toBe(true)
    }
  })

  it('ships the labels as the English messages, under `backend`', () => {
    expect(english).toEqual({ backend: LABELS })
  })

  it('lets app config override every group but the emails', () => {
    // Emails render on the backend, which never reads app config.
    const groups = BACKEND_APP_CONFIG_KEYS.filter(key => key.startsWith('labels.')).map(key => key.slice('labels.'.length))
    expect(groups.sort()).toEqual(Object.keys(LABELS).filter(group => group !== 'email').sort())
  })
})

describe('the label keys', () => {
  // The keys and their placeholders are a frozen surface (STABILITY.md): an
  // app's overrides and translations name them. Adding a key, or a
  // placeholder, is an edit to label-keys.json in the same change; renaming
  // or removing one goes through the deprecation cycle.
  const frozen = JSON.parse(readFileSync(new URL('./label-keys.json', import.meta.url), 'utf8')) as Record<string, string[]>
  const current = Object.fromEntries(all.map(([key, message]) => [key, [...new Set([...message.matchAll(/\{(\w+)\}/g)].map(([, name]) => name!))].sort()]))

  it('keeps every frozen key, with its placeholders', () => {
    const removed = Object.keys(frozen).filter(key => !(key in current))
    const changed = Object.keys(frozen).filter(key => key in current && JSON.stringify(current[key]) !== JSON.stringify(frozen[key]))
    expect({ removed, changed }).toEqual({ removed: [], changed: [] })
  })

  it('lists every key there is', () => {
    expect(Object.keys(current).filter(key => !(key in frozen))).toEqual([])
  })
})

describe('the advanced example\'s French messages', () => {
  // The translation the docs point at: it may leave keys out, never invent
  // one, and keeps every placeholder the English message fills.
  const french = JSON.parse(readFileSync(new URL('../../examples/advanced/i18n/locales/fr.json', import.meta.url), 'utf8')) as { backend: LabelTree }
  const translated = messages(french.backend)
  const placeholders = (message: string) => [...new Set([...message.matchAll(/\{(\w+)\}/g)].map(([, name]) => name))].sort()

  it('translates the whole sign-in form', () => {
    expect(translated.filter(([key]) => key.startsWith('auth.')).length).toBeGreaterThan(10)
  })

  it.each(translated)('%s is a real key with the same placeholders, and compiles', (key, message) => {
    const source = findLabel(LABELS, key)
    expect(source, key).toBeDefined()
    expect(placeholders(message)).toEqual(placeholders(source!))
    const errors: string[] = []
    baseCompile(message, { onError: error => errors.push(error.message) })
    expect(errors).toEqual([])
  })
})
