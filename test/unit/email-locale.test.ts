import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildAuthOptions, sessionClaims } from '../../src/convex/client/better-auth-options'
import { LOCALE_SCHEMA, matchLocale, normalizeLocale, preferredLocale, textDirection } from '../../src/convex/locale'
import { setupEmail } from '../../src/convex/integrations/email'
import { renderEmail } from '../../src/runtime/test-utils/email'
import { authFlow, ORIGIN } from '../helpers/auth-flow'

// The language each email is written in: the account's `user.locale`
// (captured at sign-up from the request, written on /update-user), the order
// `sendTemplate` falls back through for someone without an account, the
// app's messages with English under them, and links in the reader's
// language.

afterEach(() => {
  vi.unstubAllEnvs()
})

const de = { backend: { email: { welcome: { subject: 'Willkommen' }, invite: { subject: 'Tritt {workspace} bei' }, layout: { sentBy: 'Gesendet von {brand}' } } } }
const fr = { backend: { email: { invite: { subject: 'Rejoignez {workspace}' } } }, digest: { subject: 'Votre résumé' } }
const invite = { email: 'grace@example.com', url: 'https://app.example.com/accept-invitation?id=1', inviterName: 'Ada', inviterEmail: 'ada@example.com', workspaceName: 'Acme', role: 'member' }

describe('a locale', () => {
  it('is stored in one spelling, and refused when it is not a language tag', () => {
    expect(['de', 'pt_br', 'ZH-hant-tw', 'en-us', 'es-419', 'ca-ES-VALENCIA'].map(normalizeLocale)).toEqual(['de', 'pt-BR', 'zh-Hant-TW', 'en-US', 'es-419', 'ca-ES-valencia'])
    expect(['', '*', 'english', 'de de', 'x', `de-${'a'.repeat(40)}`, 42, null].map(normalizeLocale)).toEqual([null, null, null, null, null, null, null, null])
  })

  it('is read from Accept-Language by weight, the first among equals', () => {
    expect(preferredLocale('fr-CH, fr;q=0.9, en;q=0.8, *;q=0.5')).toBe('fr-CH')
    expect(preferredLocale('en;q=0.5, de')).toBe('de')
    expect(preferredLocale('de;q=0, it')).toBe('it')
    expect(preferredLocale('*')).toBeNull()
    expect(preferredLocale(undefined)).toBeNull()
  })

  it('matches the messages of its own spelling, then of its language', () => {
    expect(matchLocale('de-AT', ['en', 'de'])).toBe('de')
    expect(matchLocale('pt-BR', ['en', 'pt-br'])).toBe('pt-br')
    expect(matchLocale('de', ['en', 'de-DE'])).toBe('de-DE')
    expect(matchLocale('fr', ['en', 'de'])).toBeUndefined()
  })

  it('runs right to left for Arabic, Hebrew and Persian', () => {
    expect(['ar-EG', 'he', 'fa', 'de', 'en-US'].map(textDirection)).toEqual(['rtl', 'rtl', 'rtl', 'ltr', 'ltr'])
  })

  it('is refused on the account by the schema Better Auth runs', () => {
    expect(LOCALE_SCHEMA['~standard'].validate('pt_br')).toEqual({ value: 'pt-BR' })
    expect(LOCALE_SCHEMA['~standard'].validate('<script>')).toHaveProperty('issues')
  })
})

describe('the account\'s language', () => {
  /** Sign up by code, with the request\'s Accept-Language. */
  async function signUp(flow: Awaited<ReturnType<typeof authFlow>>, address: string, language?: string) {
    const { code } = await flow.sendCode(address)
    const response = await flow.auth.handler(new Request(`${ORIGIN}/api/auth/sign-in/email-otp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': ORIGIN, ...(language ? { 'accept-language': language } : {}) },
      body: JSON.stringify({ email: address, otp: code }),
    }))
    expect(response.status).toBe(200)
    return response
  }

  it('is the language of the request that creates the account, and none without one', async () => {
    const flow = await authFlow()
    await signUp(flow, 'ada@example.com', 'de-DE,de;q=0.9,en;q=0.5')
    await signUp(flow, 'grace@example.com')
    expect(flow.db.user!.find(row => row.email === 'ada@example.com')?.locale).toBe('de-DE')
    expect(flow.db.user!.find(row => row.email === 'grace@example.com')?.locale).toBeUndefined()
    // The welcome email reads it.
    const welcome = flow.email.sendTemplate.mock.calls.find(call => call[1] === 'welcome' && (call[2] as { email: string }).email === 'ada@example.com') as unknown[]
    expect(welcome[3]).toMatchObject({ locale: 'de-DE' })
  })

  it('is written on /update-user, and refused when it is not a language tag', async () => {
    const flow = await authFlow()
    const { userId, cookie } = await flow.signedIn('ada@example.com')
    expect((await flow.post('/update-user', { locale: 'pt_br' }, { cookie })).status).toBe(200)
    expect(flow.db.user!.find(row => row.id === userId)?.locale).toBe('pt-BR')
    expect((await flow.post('/update-user', { locale: 'nonsense value' }, { cookie })).status).toBe(400)
    expect(flow.db.user!.find(row => row.id === userId)?.locale).toBe('pt-BR')
  })

  it('writes a code to a new address in the language of the page that asked for it', async () => {
    const flow = await authFlow()
    await flow.auth.handler(new Request(`${ORIGIN}/api/auth/email-otp/send-verification-otp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': ORIGIN, 'accept-language': 'fr' },
      body: JSON.stringify({ email: 'new@example.com', type: 'sign-in' }),
    }))
    const code = flow.email.sendTemplate.mock.calls.find(call => call[1] === 'otp') as unknown[]
    expect(code[3]).toMatchObject({ fallbackLocale: 'fr', expiresAt: expect.any(Number) })
  })

  it('is the session token\'s OpenID locale claim, as a language tag only', () => {
    expect(sessionClaims({ user: { id: 'u1', email: 'ada@example.com', locale: 'de' }, session: {} })).toMatchObject({ locale: 'de' })
    expect(sessionClaims({ user: { id: 'u1', email: 'ada@example.com', locale: '<b>' }, session: {} })).not.toHaveProperty('locale')
  })

  it('names the app for Better Auth as the emails sign: the brand, else EMAIL_FROM, then the site, unless the app names it', () => {
    vi.stubEnv('SITE_URL', 'https://app.example.com')
    expect(buildAuthOptions({} as never).appName).toBe('app.example.com')
    vi.stubEnv('EMAIL_FROM', '"Acme" <hello@acme.dev>')
    expect(buildAuthOptions({} as never).appName).toBe('Acme')
    expect(buildAuthOptions({} as never, { authOptions: { appName: 'Mine' } }).appName).toBe('Mine')
    // setupEmail's brand.name, over a bare sender address.
    vi.stubEnv('EMAIL_FROM', 'hello@acme.dev')
    const email = setupEmail({ backend: { email: {} } } as never, { brand: { name: 'Acme Studio' } })
    expect(email.brand()).toEqual({ name: 'Acme Studio', url: 'https://app.example.com' })
    expect(buildAuthOptions({} as never, {}, { email } as never).appName).toBe('Acme Studio')
    expect(buildAuthOptions({} as never, { authOptions: { appName: 'Mine' } }, { email } as never).appName).toBe('Mine')
  })
})

describe('sendTemplate\'s language', () => {
  const users: Record<string, { _id: string, email: string, locale?: string | null }> = {
    ada: { _id: 'ada', email: 'ada@example.com', locale: 'de-AT' },
    gus: { _id: 'gus', email: 'gus@example.com', locale: 'fr' },
    rita: { _id: 'rita', email: 'rita@example.com', locale: null },
  }
  const components = { backend: { email: { send: 'ref:send', sendSecret: 'ref:secret' }, adapter: { findOne: 'ref:findOne' } } } as never

  /** A ctx whose adapter reads find the users above, by address or by id. */
  function ctx() {
    return {
      runMutation: vi.fn(async (_ref: unknown, message: { subject: string }) => message.subject),
      runQuery: vi.fn(async (_ref: unknown, { where }: { where: Array<{ field: string, value: string }> }) => {
        const [{ field, value }] = where as [{ field: string, value: string }]
        return Object.values(users).find(user => (field === 'email' ? user.email === value : user._id === value)) ?? null
      }),
    }
  }

  const email = setupEmail(components, { messages: { de, fr } })
  const to = (address: string) => ({ ...invite, email: address })

  it('writes in the recipient account\'s language, its base language when only that has messages', async () => {
    const run = ctx()
    expect(await email.sendTemplate(run as never, 'invite', to('ADA@example.com '))).toBe('Tritt Acme bei')
    // The address is read as the account stores it.
    expect(run.runQuery).toHaveBeenCalledWith('ref:findOne', { model: 'user', where: [{ field: 'email', value: 'ada@example.com' }] })
  })

  it('goes in the order: the caller\'s locale, the account\'s, the request\'s, the sender\'s, the default', async () => {
    expect(await email.sendTemplate(ctx() as never, 'invite', to('ada@example.com'), { locale: 'fr', senderId: 'ada' })).toBe('Rejoignez Acme')
    expect(await email.sendTemplate(ctx() as never, 'invite', to('ada@example.com'), { fallbackLocale: 'fr' })).toBe('Tritt Acme bei')
    expect(await email.sendTemplate(ctx() as never, 'invite', to('new@example.com'), { fallbackLocale: 'de', senderId: 'gus' })).toBe('Tritt Acme bei')
    expect(await email.sendTemplate(ctx() as never, 'invite', to('new@example.com'), { senderId: 'gus' })).toBe('Rejoignez Acme')
    expect(await email.sendTemplate(ctx() as never, 'invite', to('rita@example.com'), { senderId: 'rita' })).toBe('Join Acme')
    const german = setupEmail(components, { messages: { de }, defaultLocale: 'de' })
    expect(await german.sendTemplate(ctx() as never, 'invite', to('new@example.com'))).toBe('Tritt Acme bei')
  })

  it('sends in the next language known when an account\'s cannot be read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const run = ctx()
    // An id that is no account's: the adapter's read throws.
    run.runQuery.mockImplementation(async (_ref, { where }) => {
      if (where[0]!.field === '_id') throw new Error('Invalid argument `id`')
      return null
    })
    expect(await email.sendTemplate(run as never, 'invite', to('new@example.com'), { senderId: 'users_table_id' })).toBe('Join Acme')
    expect(run.runMutation).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[nuxt-backend] email.locale_unread: The sender account\'s language'), expect.any(Error))
    warn.mockRestore()
  })

  it('reads English for a language without messages, and reads nothing without runQuery', async () => {
    expect(await email.sendTemplate(ctx() as never, 'invite', to('new@example.com'), { locale: 'ja' })).toBe('Join Acme')
    const sendOnly = { runMutation: vi.fn(async (_ref: unknown, message: { subject: string }) => message.subject) }
    expect(await email.sendTemplate(sendOnly as never, 'invite', to('ada@example.com'))).toBe('Join Acme')
  })

  it('reads a key a language leaves out in English, your en messages first, and your own keys from the root', async () => {
    const english = { backend: { email: { welcome: { subject: 'Hello there' } } } }
    const it = { backend: { email: { invite: { subject: 'Unisciti a {workspace}' } } }, digest: { subject: 'Il tuo riepilogo' } }
    const app = setupEmail(components, { messages: { it, en: english } })
    expect((await app.render('welcome', { email: 'a@b.com', name: '' }, { locale: 'it' })).subject).toBe('Hello there')
    expect((await app.render('emailChanged', { email: 'a@b.com', newEmail: 'b@c.com' }, { locale: 'it' })).subject).toBe('Your email address was changed')
    expect((await app.compose(({ t, locale }) => ({ to: 'a@b.com', subject: `${t('digest.subject')} (${locale})` }), { locale: 'it-CH' })).subject).toBe('Il tuo riepilogo (it)')
    // The languages the app serves: its default and its messages', no packaged one it never named.
    expect(app.locales).toEqual(['en', 'it'])
    expect(setupEmail(components, {}).locales).toEqual(['en', 'ru', 'de', 'es', 'fr'])
    expect(setupEmail(components, { messages: { it }, locales: ['en', 'it', 'es'] }).locales).toEqual(['en', 'it', 'es'])
  })

  it('reads the package\'s own translation of a key your messages leave out, before your en messages', async () => {
    const english = { backend: { email: { welcome: { subject: 'Hello there' } } } }
    const app = setupEmail(components, { messages: { fr, en: english } })
    expect((await app.render('invite', to('a@b.com'), { locale: 'fr' })).subject).toBe('Rejoignez Acme')
    expect((await app.render('welcome', { email: 'a@b.com', name: '' }, { locale: 'fr' })).subject).not.toBe('Hello there')
    expect((await app.render('welcome', { email: 'a@b.com', name: '' }, { locale: 'fr' })).subject).not.toBe('Welcome')
  })
})

describe('a language the app doesn\'t serve', () => {
  // The app serves German alone, under the prefix strategy; a Russian reader
  // must get German words and a /de link, never the package's Russian with
  // a /ru link that 404s, nor the app's own keys raw.
  const app = { ...de, digest: { subject: 'Ihre Zusammenfassung' } }
  const render = (localePaths: 'prefix' | 'prefix_except_default') =>
    renderEmail('invite', invite, { locale: 'ru-RU', messages: { de: app }, defaultLocale: 'de', localePaths, siteUrl: 'https://app.example.com' })

  it('is written in the default language, its links prefixed per the strategy', async () => {
    const prefixed = await render('prefix')
    expect(prefixed.subject).toBe('Tritt Acme bei')
    expect(prefixed.html).toContain('<html lang="de"')
    expect(prefixed.text).toContain('https://app.example.com/de/accept-invitation?id=1')
    expect(prefixed.text).not.toContain('/ru/')
    expect((await render('prefix_except_default')).text).toContain('https://app.example.com/accept-invitation?id=1')
  })

  it('reads the app\'s own keys in the default language before English', async () => {
    const email = setupEmail({ backend: { email: { send: 'ref:send' } } } as never, { messages: { de: app, fr: { backend: {} } }, defaultLocale: 'de' })
    const subject = async (locale: string) => (await email.compose(({ t }) => ({ to: 'a@b.com', subject: t('digest.subject') }), { locale })).subject
    expect(await subject('ru-RU')).toBe('Ihre Zusammenfassung')
    // A served language that leaves the key out reads the default's too.
    expect(await subject('fr')).toBe('Ihre Zusammenfassung')
  })

  it('is one the app names in locales: the package\'s own translation, and a link in it', async () => {
    const message = await renderEmail('invite', invite, { locale: 'es', messages: { de }, locales: ['en', 'de', 'es'], localePaths: 'prefix', siteUrl: 'https://app.example.com' })
    expect(message.subject).not.toBe('Join Acme')
    expect(message.text).toContain('https://app.example.com/es/accept-invitation?id=1')
  })

  it('stays the default under a prefix strategy when the app names no language', async () => {
    const message = await renderEmail('invite', invite, { locale: 'ru', localePaths: 'prefix', siteUrl: 'https://app.example.com' })
    expect(message.subject).toBe('Join Acme')
    expect(message.text).toContain('https://app.example.com/en/accept-invitation?id=1')
  })
})

describe('links in the reader\'s language', () => {
  const send = (localePaths: 'prefix_except_default' | 'prefix', locale: string, url = invite.url) =>
    renderEmail('invite', { ...invite, url }, { locale, messages: { de }, localePaths, siteUrl: 'https://app.example.com' })

  it('prefix an app page with the locale, except the default one under prefix_except_default', async () => {
    expect((await send('prefix_except_default', 'de')).text).toContain('https://app.example.com/de/accept-invitation?id=1')
    expect((await send('prefix_except_default', 'en')).text).toContain('https://app.example.com/accept-invitation?id=1')
    expect((await send('prefix', 'en')).text).toContain('https://app.example.com/en/accept-invitation?id=1')
  })

  it('leave a link off the site, and one already in the language, as they are', async () => {
    expect((await send('prefix', 'de', 'https://elsewhere.example.com/join')).text).toContain('https://elsewhere.example.com/join')
    expect((await send('prefix', 'de', 'https://app.example.com/de/accept-invitation')).text).toContain('https://app.example.com/de/accept-invitation\n')
  })

  it('read a default locale in the spelling its messages and the app\'s routes use', async () => {
    const ptBr = { backend: { email: { invite: { subject: 'Entre em {workspace}' } } } }
    const message = await renderEmail('invite', invite, { messages: { 'pt-br': ptBr }, defaultLocale: 'pt-br', localePaths: 'prefix', siteUrl: 'https://app.example.com' })
    expect(message.subject).toBe('Entre em Acme')
    expect(message.text).toContain('https://app.example.com/pt-br/accept-invitation?id=1')
  })

  it('stay as they are without localePaths', async () => {
    const message = await renderEmail('gift', { recipientEmail: 'r@c.com', item: '500 credits', claimUrl: 'https://app.example.com/' }, { locale: 'de', messages: { de } })
    expect(message.text).toContain('https://app.example.com/\n')
  })
})

describe('renderEmail', () => {
  it('renders as setupEmail with the same options, without a deployment', async () => {
    const message = await renderEmail('welcome', { email: 'ada@example.com', name: 'Ada' }, {
      locale: 'de',
      messages: { de },
      templates: { welcome: (data, { byDefault }) => ({ ...byDefault(data), to: 'override@example.com' }) },
      from: 'Acme <hello@acme.dev>',
    })
    expect(message).toMatchObject({ to: 'override@example.com', subject: 'Willkommen' })
    expect(message.text).toMatch(/— Gesendet von Acme\nhttps:\/\/app\.example\.com$/)
    expect(message.html).toContain('<html lang="de" dir="ltr">')
  })
})

describe('the notice decision email', () => {
  it('says a notice the app could not place was acted on, never that the content was removed', async () => {
    const handled = await renderEmail('noticeDecided', { email: 'grace@example.com', url: 'https://elsewhere.example.com/photo', outcome: 'handled', reason: 'Taken down at the host.' })
    expect(handled.text).toContain('We reviewed your report about https://elsewhere.example.com/photo and acted on it.')
    expect(handled.text).not.toContain('removed')
    const unlinked = await renderEmail('noticeDecided', { email: 'grace@example.com', outcome: 'handled', reason: 'Taken down.' })
    expect(unlinked.text).toContain('We reviewed your report and acted on it.')
  })
})
