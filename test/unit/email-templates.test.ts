import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTranslate, formatLabel, LABELS } from '../../src/convex/labels'
import { emailRenderContext, type EmailTemplateOverrides, PACKAGED_EMAIL_TEMPLATES } from '../../src/convex/email-templates'
import { escapeHtml, setupEmail } from '../../src/convex/integrations/email'

// The one registry of the emails the package sends: the labels they read
// their words from, the packaged templates, and the overrides an app lays
// over them through setupEmail.

const component = { backend: { email: { send: 'ref:send' } } } as never
const context = emailRenderContext({ siteUrl: 'https://app.example.com' })

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('labels', () => {
  it('fill in named values and leave a missing one as written', () => {
    expect(formatLabel('Join {workspace} as {role}.', { workspace: 'Acme', role: 'admin' })).toBe('Join Acme as admin.')
    expect(formatLabel('Join {workspace}.', {})).toBe('Join {workspace}.')
  })

  it('pick the plural form by count, the way vue-i18n does by default', () => {
    const codes = 'one code | {count} codes'
    expect([0, 1, 2].map(count => formatLabel(codes, { count }))).toEqual(['0 codes', 'one code', '2 codes'])
    const items = 'no items | one item | {count} items'
    expect([0, 1, 7].map(count => formatLabel(items, { count }))).toEqual(['no items', 'one item', '7 items'])
    // Without a count, the first form.
    expect(formatLabel(codes)).toBe('one code')
  })

  it('resolve by dotted key, and answer an unknown key with the key itself', () => {
    const t = createTranslate()
    expect(t('email.invite.subject', { workspace: 'Acme' })).toBe('Join Acme')
    expect(t('email.nothing.here')).toBe('email.nothing.here')
  })
})

describe('packaged templates', () => {
  it('take every word from the labels', () => {
    for (const type of ['sign-in', 'email-verification', 'forget-password', 'change-email'] as const) {
      const message = PACKAGED_EMAIL_TEMPLATES.otp({ email: 'a@b.com', otp: '123456', type }, context)
      expect(message.subject).toBe(LABELS.email.otp.subject[type])
      expect(message.text).toContain('123456')
    }
    expect(PACKAGED_EMAIL_TEMPLATES.welcome({ email: 'a@b.com', name: 'Ada' }, context).text)
      .toBe('Welcome, Ada! Your account is ready — thanks for joining us.\n\n— app.example.com')
    expect(PACKAGED_EMAIL_TEMPLATES.welcome({ email: 'a@b.com', name: '' }, context).text).toMatch(/^Welcome! /)
  })

  it('word the first code of an email change as one, with a warning', () => {
    const change = PACKAGED_EMAIL_TEMPLATES.otp({ email: 'a@b.com', otp: '123456', type: 'email-verification', reason: 'email-change' }, context)
    expect(change.subject).toBe('Confirm your email change')
    expect(change.text).toContain('123456')
    expect(change.text).toContain(LABELS.email.otp.emailChange.warning)
    // Without the reason, the same type reads as a plain verification.
    expect(PACKAGED_EMAIL_TEMPLATES.otp({ email: 'a@b.com', otp: '123456', type: 'email-verification' }, context).subject).toBe('Confirm your email address')
  })

  it('tell the old address the new one, escaped', () => {
    const notice = PACKAGED_EMAIL_TEMPLATES.emailChanged({ email: 'old@b.com', newEmail: 'new<x>@b.com' }, context)
    expect(notice).toMatchObject({ to: 'old@b.com', subject: 'Your email address was changed' })
    expect(notice.text).toContain('The email address on your account is now new<x>@b.com.')
    expect(notice.html).toContain('new&lt;x&gt;@b.com')
  })

  it('escape what a person typed before it reaches the markup', () => {
    const invite = PACKAGED_EMAIL_TEMPLATES.invite({
      email: 'b@c.com',
      url: 'https://app.example.com/accept-invitation?id=1&x=<y>',
      inviterName: '<script>alert(1)</script>',
      inviterEmail: 'ada@example.com',
      organizationName: 'Acme',
      role: 'member',
    }, context)
    expect(invite.html).not.toContain('<script>')
    expect(invite.html).toContain('&lt;script&gt;')
    expect(invite.html).toContain('id=1&amp;x=&lt;y&gt;')

    const gift = PACKAGED_EMAIL_TEMPLATES.gift({ recipientEmail: 'r@c.com', purchaserName: '<b>Ada</b>', item: '500 credits', claimUrl: 'https://app.example.com/' }, context)
    expect(gift.subject).toBe('<b>Ada</b> sent you a gift 🎁')
    expect(gift.html).toContain('&lt;b&gt;Ada&lt;/b&gt; sent you a gift: 500 credits.')
    expect(gift.html).not.toContain('<b>Ada</b>')
  })

  it('names the sender and the pack in a gift email, and nothing the purchaser wrote', () => {
    const gift = PACKAGED_EMAIL_TEMPLATES.gift({ recipientEmail: 'r@c.com', item: '500 credits', claimUrl: 'https://app.example.com/' }, context)
    expect(gift.subject).toBe('Someone sent you a gift 🎁')
    expect(gift.text).toMatch(/^Someone sent you a gift: 500 credits. Sign in to receive it.\n\nhttps:\/\/app.example.com\/\n/)
  })
})

describe('the sign-off', () => {
  const welcome = (siteUrl: string, brandName?: string) =>
    PACKAGED_EMAIL_TEMPLATES.welcome({ email: 'a@b.com', name: 'Ada' }, emailRenderContext({ siteUrl, brandName }))

  it('signs with the brand, linked to the site, escaped', () => {
    const message = welcome('https://app.example.com', 'A&B <Co>')
    expect(message.text).toMatch(/\n\n— A&B <Co>\nhttps:\/\/app\.example\.com$/)
    expect(message.html).toContain('— <a href="https://app.example.com" style="color:#666">A&amp;B &lt;Co&gt;</a>')
    expect(message.html).not.toContain('<Co>')
  })

  it('names the host alone when there is no brand name, and nothing without a site', () => {
    expect(welcome('https://app.example.com').text).toMatch(/\n\n— app\.example\.com$/)
    const bare = welcome('')
    expect(bare.text).toBe('Welcome, Ada! Your account is ready — thanks for joining us.')
    expect(bare.html).not.toContain('<a ')
  })
})

describe('escapeHtml', () => {
  it('escapes the five characters that can open markup or an attribute', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;')
  })
})

describe('setupEmail templates', () => {
  it('renders the packaged default for a template nobody overrode', async () => {
    const email = setupEmail(component)
    expect(await email.render('invite', {
      email: 'b@c.com',
      url: 'https://app.example.com/join',
      inviterName: 'Ada',
      inviterEmail: 'ada@example.com',
      organizationName: 'Acme',
      role: 'member',
    })).toMatchObject({ to: 'b@c.com', subject: 'Join Acme' })
  })

  it('hands an override the data, the render context and the default bound to it', async () => {
    vi.stubEnv('SITE_URL', 'https://app.example.com')
    type WelcomeContext = Parameters<NonNullable<EmailTemplateOverrides['welcome']>>[1]
    const welcome = vi.fn((data: { email: string, name: string }, { byDefault, brand, locale, t }: WelcomeContext) =>
      ({ ...byDefault(data), subject: `${t('email.welcome.subject')} to ${brand.name} (${locale})` }))
    const email = setupEmail(component, { templates: { welcome } })

    const message = await email.render('welcome', { email: 'a@b.com', name: 'Ada' })
    expect(message.subject).toBe('Welcome aboard to app.example.com (en)')
    // The rest of the body is the packaged one.
    expect(message.text).toContain('Welcome, Ada!')
    expect(welcome).toHaveBeenCalledWith({ email: 'a@b.com', name: 'Ada' }, expect.objectContaining({ locale: 'en', brand: { name: 'app.example.com', url: 'https://app.example.com' } }))
  })

  it('names the brand after brand.name when the app sets one', async () => {
    vi.stubEnv('SITE_URL', 'https://app.example.com')
    const email = setupEmail(component, { brand: { name: 'Acme' }, templates: { welcome: (data, { brand }) => ({ to: data.email, subject: brand.name }) } })
    expect((await email.render('welcome', { email: 'a@b.com', name: 'Ada' })).subject).toBe('Acme')
  })

  // `@vue-email/render` and `@react-email/render` return promises.
  it('renders an async override, and sends what it resolved', async () => {
    const email = setupEmail(component, {
      templates: { gift: async (data, { byDefault }) => ({ ...byDefault(data), subject: await Promise.resolve('Rendered later') }) },
    })
    const gift = { recipientEmail: 'r@c.com', item: '500 credits', claimUrl: 'https://app.example.com/' }
    expect(await email.render('gift', gift)).toMatchObject({ to: 'r@c.com', subject: 'Rendered later' })

    const ctx = { runMutation: vi.fn(async () => 'email_1') }
    await email.sendTemplate(ctx, 'gift', gift)
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:send', expect.objectContaining({ to: 'r@c.com', subject: 'Rendered later' }))
  })

  it('sends a rendered template, with its idempotency key when there is one', async () => {
    const email = setupEmail(component)
    const ctx = { runMutation: vi.fn(async () => 'email_1') }
    const gift = { recipientEmail: 'r@c.com', item: '500 credits', claimUrl: 'https://app.example.com/' }

    await email.sendTemplate(ctx, 'gift', gift, { idempotencyKey: 'gift:gift-1' })
    await email.sendTemplate(ctx, 'gift', gift)
    expect(ctx.runMutation).toHaveBeenNthCalledWith(1, 'ref:send', expect.objectContaining({ to: 'r@c.com', idempotencyKey: 'gift:gift-1' }))
    expect(ctx.runMutation).toHaveBeenNthCalledWith(2, 'ref:send', expect.not.objectContaining({ idempotencyKey: expect.anything() }))
  })
})
