import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEmailRenderer, EMAIL_PREVIEW_SAMPLES, type EmailMessages, PACKAGED_EMAIL_TEMPLATES, resolveBrand, senderName, withLayout } from '../../src/convex/email-templates'
import { forceColorScheme, html, setupEmail, trustedHtml } from '../../src/convex/integrations/email'
import { defineEmailSequence } from '../../src/convex/integrations/workflows'

// The one layout every email renders into: a whole document in the
// recipient's language and direction, light and dark, the brand's header,
// the footer; the `html` tag for an app's own emails; the previews and the
// DevTools functions over them; and sequences, whose steps go through the
// same layout.

afterEach(() => {
  vi.unstubAllEnvs()
})

interface ContextOptions { siteUrl: string, brandName?: string, logo?: string, locale?: string, messages?: EmailMessages }
/** The context a message renders with, as `setupEmail` builds it on a deployment with this `SITE_URL`. */
const context = ({ siteUrl, brandName, logo, locale, messages }: ContextOptions = { siteUrl: 'https://app.example.com', brandName: 'Acme' }) =>
  createEmailRenderer({ messages, brand: { name: brandName, logo } }, () => ({ siteUrl })).context(locale)
const welcome = (ctx = context()) => PACKAGED_EMAIL_TEMPLATES.welcome({ email: 'ada@example.com', name: 'Ada' }, ctx)

describe('the layout', () => {
  it('is one document in the recipient\'s language, for light and dark readers', () => {
    const { html: markup } = welcome()
    expect(markup).toMatch(/^<!doctype html><html lang="en" dir="ltr">/)
    expect(markup).toContain('<meta name="color-scheme" content="light dark">')
    expect(markup).toContain('@media (prefers-color-scheme: dark){')
    expect(markup).toContain('<title>Welcome aboard</title>')
    expect(markup).toContain('Welcome, Ada! 🎉')
  })

  it('runs right to left for a right-to-left reader', () => {
    const arabic = context({ siteUrl: 'https://app.example.com', locale: 'ar', messages: { ar: {} } })
    expect(welcome(arabic).html).toContain('<html lang="ar" dir="rtl">')
  })

  it('heads with the logo, linked to the site, else the name, escaped', () => {
    const named = welcome(context({ siteUrl: 'https://app.example.com', brandName: 'A&B <Co>' })).html!
    expect(named).toContain('>A&amp;B &lt;Co&gt;</span>')
    const logo = welcome(context({ siteUrl: 'https://app.example.com/', brandName: 'Acme', logo: '/logo.png?v="1"' })).html!
    expect(logo).toContain('<a href="https://app.example.com/" style="text-decoration:none"><img src="https://app.example.com/logo.png?v=%221%22" alt="Acme"')
  })

  it('keeps a sign-in code out of the preview a locked screen shows', () => {
    const code = PACKAGED_EMAIL_TEMPLATES.otp({ email: 'a@b.com', otp: '493021', type: 'sign-in' }, context())
    const preheader = /<div style="display:none[^>]*>([^<]*)<\/div>/.exec(code.html!)?.[1]
    expect(preheader).toBe('Your sign-in code')
    expect(code.html).toContain('493021')
  })

  it('leaves a whole document of the app\'s own as it is, and signs its text', () => {
    const own = withLayout({ to: 'a@b.com', subject: 'Hi', html: '<!DOCTYPE html><html><body>mine</body></html>', text: 'mine' }, context())
    expect(own.html).toBe('<!DOCTYPE html><html><body>mine</body></html>')
    expect(own.text).toBe('mine\n\n— Sent by Acme\nhttps://app.example.com')
  })

  it('shows a light or a dark reader\'s rendering, whatever the previewing page prefers', () => {
    const { html: markup } = welcome()
    expect(forceColorScheme(markup!, 'dark')).toContain('@media all{.nb-page')
    expect(forceColorScheme(markup!, 'light')).toContain('@media not all{.nb-page')
    expect(forceColorScheme('<p>plain</p>', 'dark')).toBe('<p>plain</p>')
  })
})

describe('the brand', () => {
  it('is the configured name, else EMAIL_FROM\'s display name, else the site\'s host', () => {
    expect(senderName('Acme <hello@acme.dev>')).toBe('Acme')
    expect(senderName('"Acme, Inc." <hello@acme.dev>')).toBe('Acme, Inc.')
    expect(senderName('hello@acme.dev')).toBeUndefined()
    expect(resolveBrand(undefined, { siteUrl: 'https://app.example.com', from: 'Acme <hello@acme.dev>' })).toEqual({ name: 'Acme', url: 'https://app.example.com' })
    expect(resolveBrand({ name: 'Mine' }, { siteUrl: 'https://app.example.com', from: 'Acme <hello@acme.dev>' }).name).toBe('Mine')
    expect(resolveBrand(undefined, { siteUrl: 'https://app.example.com', from: 'hello@acme.dev' }).name).toBe('app.example.com')
  })

  it('reaches every email from the deployment\'s EMAIL_FROM', async () => {
    vi.stubEnv('SITE_URL', 'https://app.example.com')
    vi.stubEnv('EMAIL_FROM', 'Acme <hello@acme.dev>')
    const email = setupEmail({ backend: { email: {} } } as never)
    expect((await email.render('welcome', { email: 'a@b.com', name: '' })).text).toMatch(/— Sent by Acme\nhttps:\/\/app\.example\.com$/)
  })
})

describe('the html tag', () => {
  it('escapes every value it interpolates, and inserts trusted markup as it is', () => {
    const name = '<img src=x onerror=alert(1)>'
    expect(html`<p>Hi ${name}</p>`).toBe('<p>Hi &lt;img src=x onerror=alert(1)&gt;</p>')
    const items = ['a&b', '<c>'].map(item => trustedHtml(html`<li>${item}</li>`))
    expect(html`<ul>${items}</ul>`).toBe('<ul><li>a&amp;b</li><li>&lt;c&gt;</li></ul>')
    expect(html`<p>${null}${undefined}${false}${0}</p>`).toBe('<p>0</p>')
    // An object would read [object Object]: a mistake, said at once.
    expect(() => html`<p>${{ name: 'Ada' }}</p>`).toThrow(TypeError)
  })

  it('builds an app\'s own email in the layout, in the reader\'s language', async () => {
    const email = setupEmail({ backend: { email: {} } } as never, { messages: { de: { digest: { intro: 'Hallo {name}' } } } })
    const message = await email.compose(({ t }) => ({ to: 'a@b.com', subject: 'Digest', html: html`<p>${t('digest.intro', { name: '<Ada>' })}</p>`, text: 'x' }), { locale: 'de' })
    expect(message.html).toContain('<html lang="de" dir="ltr">')
    expect(message.html).toContain('<p>Hallo &lt;Ada&gt;</p>')
    expect(await email.compose(() => null)).toBeNull()
  })
})

describe('the previews', () => {
  const refs = { send: 'ref:send', sendSecret: 'ref:secret' }

  it('render every packaged email with sample data, in a language', async () => {
    const email = setupEmail({ backend: { email: refs } } as never, { messages: { de: { backend: { email: { welcome: { subject: 'Willkommen' } } } } } })
    const previews = await email.previews({ locale: 'de' })
    expect(previews.map(preview => preview.key)).toEqual(EMAIL_PREVIEW_SAMPLES.map(sample => sample.key))
    expect(new Set(previews.map(preview => preview.template))).toEqual(new Set(Object.keys(PACKAGED_EMAIL_TEMPLATES)))
    expect(previews.find(preview => preview.key === 'welcome')).toMatchObject({ locale: 'de', subject: 'Willkommen' })
    for (const preview of previews) expect(preview.html, preview.key).toMatch(/^<!doctype html>/)
  })

  it('back the DevTools functions: one language at a time, and a test send to a sandbox address only', async () => {
    const email = setupEmail({ backend: { email: refs } } as never, { messages: { fr: {} } })
    const { previewEmails, sendEmailPreview } = email.api as unknown as Record<string, { _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown> }>
    const read = await previewEmails!._handler({}, { locale: 'fr-CA' }) as { locales: string[], locale: string, previews: unknown[] }
    // The languages the app serves: its default and its messages'.
    expect(read).toMatchObject({ locales: ['en', 'fr'], locale: 'fr' })
    expect(read.previews).toHaveLength(EMAIL_PREVIEW_SAMPLES.length)

    const ctx = { runMutation: vi.fn(async () => 'email_1') }
    expect(await sendEmailPreview!._handler(ctx, { key: 'welcome' })).toBe('email_1')
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:send', expect.objectContaining({ to: 'delivered@resend.dev', subject: 'Welcome aboard' }))
    await expect(sendEmailPreview!._handler(ctx, { key: 'welcome', to: 'ada@example.com' })).rejects.toMatchObject({ data: { code: 'invalid_input', field: 'to' } })
    await expect(sendEmailPreview!._handler(ctx, { key: 'nothing' })).rejects.toMatchObject({ data: { code: 'invalid_input', field: 'key' } })
    expect(ctx.runMutation).toHaveBeenCalledTimes(1)
  })
})

describe('an email sequence', () => {
  it('sends every step in the layout, in the account\'s language', async () => {
    vi.stubEnv('SITE_URL', 'https://app.example.com')
    let definition: { handler: (step: unknown, args: Record<string, unknown>) => Promise<void> } | undefined
    const workflow = { define: (value: typeof definition) => (definition = value) } as never
    const email = setupEmail({ backend: { email: {} } } as never, { messages: { de: { onboarding: { subject: 'Wie läuft es?' } } } })
    defineEmailSequence(workflow, { backend: { email: { send: 'ref:send' }, adapter: { findOne: 'ref:findOne' } } }, {
      email,
      args: {},
      steps: [{ after: 0, email: (data, { t, locale }) => ({ to: (data as { email: string }).email, subject: t('onboarding.subject'), html: html`<p>${locale}</p>`, text: 'Hi' }) }],
    })
    const step = {
      sleep: vi.fn(),
      runQuery: vi.fn(async () => ({ email: 'ada@example.com', name: 'Ada', locale: 'de' })),
      runMutation: vi.fn(async () => null),
    }
    await definition!.handler(step, { userId: 'u1', email: 'old@example.com' })
    expect(step.runMutation).toHaveBeenCalledWith('ref:send', expect.objectContaining({
      to: 'ada@example.com',
      subject: 'Wie läuft es?',
      html: expect.stringMatching(/<html lang="de" dir="ltr">.*<p>de<\/p>/),
      text: 'Hi\n\n— Gesendet von app.example.com',
    }), { unstableArgs: true })
  })

  it('goes on after a step it sent renders differently on a replay', async () => {
    // The workflow component's journal, as @convex-dev/workflow keeps it: a
    // replayed step answers from the journal, and is refused when its
    // arguments changed, unless the step said they may (`unstableArgs`).
    const journal: Array<{ name: string, args: string }> = []
    let cursor = 0
    const run = async (name: string, args: unknown, options?: { unstableArgs?: boolean }) => {
      const entry = journal[cursor++]
      if (!entry) {
        journal.push({ name, args: JSON.stringify(args) })
        return null
      }
      if (entry.name !== name || (!options?.unstableArgs && entry.args !== JSON.stringify(args))) throw new Error('Journal entry mismatch')
      return null
    }
    const sent: unknown[] = []
    const step = {
      sleep: vi.fn(async (_ms: number, { name }: { name: string }) => run(name, {})),
      runQuery: vi.fn(),
      runMutation: vi.fn(async (ref: string, message: unknown, options?: { unstableArgs?: boolean }) => {
        const fresh = cursor >= journal.length
        await run(ref, message, options)
        if (fresh) sent.push(message)
        return null
      }),
    }
    let definition: { handler: (step: unknown, args: Record<string, unknown>) => Promise<void> } | undefined
    const workflow = { define: (value: typeof definition) => (definition = value) } as never
    defineEmailSequence(workflow, { backend: { email: { send: 'ref:send' } } }, {
      args: {},
      steps: [
        { after: 0, email: () => ({ to: 'ada@example.com', subject: 'Day one', text: 'Hi' }) },
        { after: 1000, email: () => ({ to: 'ada@example.com', subject: 'Day two', text: 'Again' }) },
      ],
    })

    // The first wake sends day one, and the run sleeps (the sleep is journaled, its wake is the next replay).
    vi.stubEnv('SITE_URL', 'https://app.example.com')
    step.sleep.mockImplementationOnce(async (_ms, { name }) => {
      await run(name, {})
      throw new Error('asleep')
    })
    await expect(definition!.handler(step, {})).rejects.toThrow('asleep')
    // Between the wakes the site moved: day one renders with another footer now.
    vi.stubEnv('SITE_URL', 'https://acme.example.com')
    cursor = 0
    await definition!.handler(step, {})
    expect(sent).toEqual([
      expect.objectContaining({ subject: 'Day one', text: 'Hi\n\n— Sent by app.example.com' }),
      expect.objectContaining({ subject: 'Day two', text: 'Again\n\n— Sent by acme.example.com' }),
    ])
  })
})
