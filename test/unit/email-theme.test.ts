import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderEmail } from '../../src/runtime/test-utils/email'
import { contrastRatio, DEFAULT_EMAIL_COLORS, layoutStyles, resolveEmailTheme } from '../../src/convex/email-theme'
import { renderBlocks } from '../../src/convex/email-blocks'
import { createEmailRenderer, withLayout } from '../../src/convex/email-templates'
import { type EmailMessage, type EmailTemplateOverrides, forceColorScheme, html, setupEmail } from '../../src/convex/integrations/email'

afterEach(() => {
  vi.unstubAllEnvs()
})

// The branded theme: colors in each scheme, fonts, and the blocks an email is
// made of, rendered in the layout with the plain text written beside them.

const theme = {
  colors: { background: '#fff7e6', card: '#ffffff', text: '#1c1620', accent: '#d500f9', accentText: '#ffffff' },
  dark: { background: '#14111a', card: '#1e1a26', text: '#f4f0f8', accent: '#e36bff', accentText: '#14111a' },
  fonts: { heading: '\'Archivo Black\', \'Arial Black\', Arial, sans-serif', body: '\'Helvetica Neue\', Arial, sans-serif' },
}

const renderer = (options: Parameters<typeof createEmailRenderer>[0] = {}) =>
  createEmailRenderer({ brand: { name: 'Panels' }, ...options }, () => ({ siteUrl: 'https://app.example.com' }))

describe('the theme', () => {
  it('keeps the package\'s look without one', () => {
    const resolved = resolveEmailTheme(undefined)
    expect(resolved.colors).toMatchObject(DEFAULT_EMAIL_COLORS)
    expect(resolved.dark).toMatchObject({ background: '#0a0a0b', card: '#18181b', text: '#f4f4f5', accent: '#f4f4f5', accentText: '#18181b' })
    expect(resolved.fonts.heading).toBe(resolved.fonts.body)
  })

  it('puts the colors and fonts in the layout, and the dark scheme in the stylesheet', async () => {
    const { html: markup } = await renderer({ theme }).render('welcome', { email: 'a@b.com', name: 'Ada' })
    expect(markup).toContain('background:#fff7e6')
    expect(markup).toContain('color:#1c1620')
    expect(markup).toContain('font-family:&#39;Archivo Black&#39;, &#39;Arial Black&#39;, Arial, sans-serif')
    expect(markup).toContain('font-family:&#39;Helvetica Neue&#39;, Arial, sans-serif')
    expect(markup).toContain('.nb-page{background:#14111a!important}')
    expect(markup).toContain('.nb-card{background:#1e1a26!important')
    expect(markup).toContain('.nb-plate,a.nb-button{background:#e36bff!important;color:#14111a!important}')
    expect(forceColorScheme(markup!, 'dark')).toContain('@media all{.nb-page{background:#14111a')
  })

  it('keeps the default for every key it leaves out', () => {
    const resolved = resolveEmailTheme({ colors: { accent: '#0a7' } })
    expect(resolved.colors).toMatchObject({ ...DEFAULT_EMAIL_COLORS, accent: '#0a7' })
    expect(resolved.fonts).toEqual(resolveEmailTheme(undefined).fonts)
  })

  it('derives a dark scheme from the light one, with the accent readable on its card', () => {
    for (const accent of ['#d500f9', '#0a7', '#1d4ed8', '#7c2d12', '#ffb900']) {
      const { dark } = resolveEmailTheme({ colors: { ...theme.colors, accent } })
      expect(dark.card).toBe(theme.colors.text)
      expect(dark.text).toBe(theme.colors.background)
      expect(contrastRatio(dark.accent, dark.card), accent).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(dark.accentText, dark.accent), accent).toBeGreaterThanOrEqual(4.5)
    }
    expect(resolveEmailTheme({ colors: { ...theme.colors, accent: '#ffb900' } }).dark.accent).toBe('#ffb900')
  })

  it('takes the dark keys it is given over the derived ones', () => {
    const resolved = resolveEmailTheme({ colors: theme.colors, dark: { accent: '#00ff88' } })
    expect(resolved.dark.accent).toBe('#00ff88')
    expect(resolved.dark.card).toBe('#1c1620')
    expect(contrastRatio(resolved.dark.accentText, '#00ff88')).toBeGreaterThanOrEqual(4.5)
  })

  it('refuses at setup what could not be a color or a font stack', () => {
    expect(() => resolveEmailTheme({ colors: { accent: 'purple' } })).toThrow(/theme\.colors\.accent must be a hex color/)
    expect(() => resolveEmailTheme({ dark: { text: 'red;}</style><script>' } })).toThrow(/theme\.dark\.text/)
    expect(() => resolveEmailTheme({ fonts: { body: 'Arial;}</style>' } })).toThrow(/theme\.fonts\.body must be a CSS font stack/)
    expect(() => resolveEmailTheme({ colors: { accentColour: '#fff' } as never })).toThrow(/theme\.colors\.accentColour is not a key/)
    expect(() => renderer({ theme: { colors: { card: 'white' } } })).toThrow(/theme\.colors\.card/)
  })

  it('writes the dark styles so the button\'s own colors win over the link color', () => {
    const styles = layoutStyles(resolveEmailTheme(undefined))
    expect(styles.indexOf('a.nb-button')).toBeGreaterThan(styles.indexOf('.nb-ink a'))
  })

  it('reaches a test through renderEmail', async () => {
    const message = await renderEmail('otp', { email: 'kai@example.com', otp: '493021', type: 'sign-in' }, { brand: { name: 'Panels' }, theme })
    expect(message.html).toContain(theme.colors.accent)
    expect(message.html).toContain(theme.dark.background)
  })

  it('reaches an email of your own through the render context', () => {
    expect(renderer({ theme }).context().theme.colors.accent).toBe('#d500f9')
  })
})

describe('the blocks', () => {
  const resolved = resolveEmailTheme(theme)
  const all = [
    { kicker: 'Ready' },
    { heading: 'Your strip' },
    { paragraph: 'It is done.\nCome and see.' },
    { code: '493021' },
    { button: { label: 'Open', url: 'https://app.example.com/strips/1?a=1&b=2' } },
    { note: 'Not you? Ignore this.' },
  ] as const

  it('render each as themed markup, with the text version written beside it', () => {
    const { html: markup, text } = renderBlocks(all, resolved)
    expect(markup).toContain('class="nb-accent"')
    expect(markup).toMatch(/<p class="nb-accent"[^>]*color:#d500f9[^>]*>Ready<\/p>/)
    expect(markup).toMatch(/<h1 class="nb-ink"[^>]*>Your strip<\/h1>/)
    expect(markup).toContain('It is done.<br>Come and see.')
    expect(markup).toMatch(/<td class="nb-plate"[^>]*background:#d500f9;color:#ffffff[^>]*>493021<\/td>/)
    expect(markup).toContain('<a class="nb-button" href="https://app.example.com/strips/1?a=1&amp;b=2"')
    expect(markup).toMatch(/<p class="nb-muted"[^>]*>Not you\? Ignore this\.<\/p>/)
    expect(text).toBe('Ready\n\nYour strip\n\nIt is done.\nCome and see.\n\n493021\n\nOpen: https://app.example.com/strips/1?a=1&b=2\n\nNot you? Ignore this.')
  })

  it('escape every value, so a title cannot put markup into the email', () => {
    const title = '<img src=x onerror=alert(1)>'
    const { html: markup } = renderBlocks([{ kicker: title }, { heading: title }, { paragraph: title }, { code: title }, { button: { label: title, url: 'https://example.com/"><b>' } }, { note: title }], resolved)
    expect(markup).not.toContain('<img')
    expect(markup).not.toContain('"><b>')
    expect(markup).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('refuse what is no block, no text, and no web address', () => {
    expect(() => renderBlocks([{ title: 'x' } as never], resolved)).toThrow(/blocks\[0\] must have exactly one of/)
    expect(() => renderBlocks([{ paragraph: 'a', note: 'b' } as never], resolved)).toThrow(/exactly one/)
    expect(() => renderBlocks([{ paragraph: 4 } as never], resolved)).toThrow(/blocks\[0\]\.paragraph must be text/)
    expect(() => renderBlocks([{ button: { label: 'Go', url: 'javascript:alert(1)' } }], resolved)).toThrow(/must start with https/)
    expect(() => renderBlocks([{ button: { label: 'Go' } } as never], resolved)).toThrow(/must be \{ label, url \}/)
    expect(renderBlocks([{ button: { label: 'Write', url: 'mailto:hi@example.com' } }], resolved).html).toContain('href="mailto:hi@example.com"')
  })

  it('preview the first paragraph, else the heading, and never the code', () => {
    expect(renderBlocks(all, resolved).preheader).toBe('It is done.\nCome and see.')
    expect(renderBlocks([{ heading: 'Hello' }, { code: '123456' }], resolved).preheader).toBe('Hello')
    expect(renderBlocks([{ code: '123456' }], resolved).preheader).toBeUndefined()
  })
})

describe('an email of blocks', () => {
  it('is composed in the layout, in the reader\'s language, with the text written for it', async () => {
    vi.stubEnv('SITE_URL', 'https://app.example.com')
    const email = setupEmail({ backend: { email: {} } } as never, {
      brand: { name: 'Panels' },
      theme,
      messages: { de: { strips: { readyKicker: 'Fertig', readyBody: 'Dein Strip steht bereit.', open: 'Öffnen' } } },
    })
    const message: EmailMessage = await email.compose(({ t, brand }) => ({
      to: 'a@b.com',
      subject: 'Ready',
      blocks: [
        { kicker: t('strips.readyKicker') },
        { heading: 'Strip <1>' },
        { paragraph: t('strips.readyBody') },
        { button: { label: t('strips.open'), url: `${brand.url}/strips/1` } },
      ],
    }), { locale: 'de' })
    expect(message.html).toContain('<html lang="de" dir="ltr">')
    expect(message.html).toContain('>Strip &lt;1&gt;</h1>')
    expect(message.html).toContain('background:#fff7e6')
    expect(message.html).toContain('<div style="display:none;max-height:0;overflow:hidden;opacity:0">Dein Strip steht bereit.</div>')
    expect(message.text).toBe('Fertig\n\nStrip <1>\n\nDein Strip steht bereit.\n\nÖffnen: https://app.example.com/strips/1\n\n— Gesendet von Panels\nhttps://app.example.com')
    expect(message).not.toHaveProperty('blocks')
    expect(message).not.toHaveProperty('preheader')
  })

  it('takes the text it is given over the one written for it, and refuses blocks beside html', () => {
    const context = renderer({ theme }).context()
    expect(withLayout({ to: 'a@b.com', subject: 'Hi', blocks: [{ paragraph: 'Hello' }], text: 'Hand-written' }, context).text).toMatch(/^Hand-written\n\n— Sent by Panels/)
    expect(() => withLayout({ to: 'a@b.com', subject: 'Hi', blocks: [{ paragraph: 'Hello' }], html: html`<p>x</p>` }, context)).toThrow(/`blocks` or `html`, not both/)
  })

  it('is what a template override may return, sync or async, while its html is sent as it is', async () => {
    const templates: EmailTemplateOverrides = {
      welcome: ({ email, name }) => ({ to: email, subject: 'Hi', blocks: [{ kicker: 'New' }, { heading: name }] }),
      emailChanged: async ({ email }) => ({ to: email, subject: 'Changed', blocks: [{ paragraph: 'Done.' }] }),
      gift: ({ recipientEmail }) => ({ to: recipientEmail, subject: 'Gift', html: '<p>mine</p>', text: 'mine' }),
    }
    const themed = renderer({ theme, templates })
    const welcome = await themed.render('welcome', { email: 'a@b.com', name: 'Ada' })
    expect(welcome.html).toMatch(/^<!doctype html>/)
    expect(welcome.html).toContain('>Ada</h1>')
    expect(welcome).not.toHaveProperty('blocks')
    expect((await themed.render('emailChanged', { email: 'a@b.com', newEmail: 'c@d.com' })).html).toContain('>Done.</p>')
    expect(await themed.render('gift', { recipientEmail: 'a@b.com', item: 'x', claimUrl: 'https://app.example.com/' })).toEqual({ to: 'a@b.com', subject: 'Gift', html: '<p>mine</p>', text: 'mine' })
  })

  it('is what every packaged email is made of, in the theme', async () => {
    const themed = renderer({ theme })
    for (const preview of await themed.previews()) {
      expect(preview.html, preview.key).toContain('background:#fff7e6')
      // A notice with nothing to press or copy (a welcome, a changed address, a kept account, a withdrawal's receipt, a code not sent to a passkey-only account, a report's receipt or outcome, an appeal's outcome) wears no accent.
      const plain = ['welcome', 'emailChanged', 'deletionCanceled', 'noticeReceived', 'noticeDecided', 'appealDecided', 'withdrawalReceipt'].includes(preview.template) || preview.key === 'otp-passkey-only'
      expect(preview.html, preview.key).toContain(plain ? 'color:#1c1620' : 'background:#d500f9')
      expect(preview.html, preview.key).toContain('font-family:&#39;Helvetica Neue&#39;')
    }
    const code = await themed.render('otp', { email: 'a@b.com', otp: '493021', type: 'sign-in' })
    expect(code.html).toMatch(/<td class="nb-plate"[^>]*>493021<\/td>/)
  })
})
