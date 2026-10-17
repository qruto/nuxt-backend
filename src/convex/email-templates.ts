import { createTranslate, type Translate } from './labels.js'

// The one registry of every email the package sends on the app's behalf:
// the sign-in and email-change codes, the welcome and account-deletion
// emails, workspace invitations and gift notifications. `setupEmail` takes
// the overrides; `setupAuth` and `setupBilling` send through the same set, so
// a restyle lands everywhere at once. Templates are functions of their data,
// so they render anywhere: a preview page, a test, a Convex mutation.

/**
 * A rendered email. `to` travels with the message because the template knows
 * the recipient: the invitation goes to the invitee, the gift to its
 * recipient.
 */
export interface EmailMessage {
  to: string
  subject: string
  html?: string
  text?: string
}

/**
 * The app a message is sent for. `url` is `SITE_URL`; `name` is
 * `setupEmail`'s `brand.name`, or the site's host without one.
 */
export interface EmailBrand {
  name: string
  url: string
}

/** What every template renders with, beside its own data. */
export interface EmailRenderContext {
  /** The package's labels, filled in: `t('email.welcome.subject')`. */
  t: Translate
  /** The recipient's locale. English (`'en'`) until the account says otherwise. */
  locale: string
  brand: EmailBrand
}

/** Which code an OTP email carries; the subject follows it. */
export type OtpPurpose = 'sign-in' | 'email-verification' | 'forget-password' | 'change-email'

/** Data for the `otp` template. */
export interface OtpEmailData {
  email: string
  otp: string
  type: OtpPurpose
  /**
   * Why the code was sent, where its type alone doesn't say: `'email-change'`
   * for the `email-verification` code that confirms the current address at
   * the start of an email change.
   */
  reason?: 'email-change'
}

/** Data for the `emailChanged` template. */
export interface EmailChangedEmailData {
  /** The address the account had: the notice goes there. */
  email: string
  /** The address it has now, as the person typed it: escape it in HTML ({@link escapeHtml}). */
  newEmail: string
}

/** Data for the `welcome` template. */
export interface WelcomeEmailData {
  email: string
  /** The name the person signed up with: their own text, so escape it in HTML ({@link escapeHtml}). */
  name: string
}

/** Data for the `deleteAccount` template. */
export interface DeleteAccountEmailData {
  email: string
  url: string
}

/** Data for the `invite` template. */
export interface InviteEmailData {
  email: string
  url: string
  /** The inviter's own name: user text, so escape it in HTML ({@link escapeHtml}). */
  inviterName: string
  inviterEmail: string
  /** The workspace's name, as a member typed it: escape it in HTML. */
  organizationName: string
  role: string
}

/** Data for the `gift` template. */
export interface GiftEmailData {
  recipientEmail: string
  /** The buyer's name: their own text, so escape it in HTML ({@link escapeHtml}). */
  purchaserName?: string
  purchaserEmail?: string
  /** The buyer's note to the recipient, verbatim: escape it in HTML. */
  message?: string
  /** The app URL where the recipient signs in (or up) to receive the gift. */
  claimUrl: string
}

/**
 * Every email the package sends, as a template. A template returns the
 * message or a promise of it, so an async renderer (`@vue-email/render`,
 * `@react-email/render`) works as is.
 */
export interface EmailTemplates {
  /**
   * A one-time code: for sign-in, for verifying an address
   * (`email-verification`, which also confirms the current address at the
   * start of an email change), and for the new address of an email change
   * (`change-email`).
   */
  otp: (data: OtpEmailData, context: EmailRenderContext) => EmailMessage | Promise<EmailMessage>
  /** Tells the old address that an email change went through. */
  emailChanged: (data: EmailChangedEmailData, context: EmailRenderContext) => EmailMessage | Promise<EmailMessage>
  /** Sent once, right after an account is created. */
  welcome: (data: WelcomeEmailData, context: EmailRenderContext) => EmailMessage | Promise<EmailMessage>
  /** The confirmation link before an account is deleted. */
  deleteAccount: (data: DeleteAccountEmailData, context: EmailRenderContext) => EmailMessage | Promise<EmailMessage>
  /** A workspace invitation with its accept link. */
  invite: (data: InviteEmailData, context: EmailRenderContext) => EmailMessage | Promise<EmailMessage>
  /** Tells a gift's recipient it is paid and waiting for them. */
  gift: (data: GiftEmailData, context: EmailRenderContext) => EmailMessage | Promise<EmailMessage>
}

/** A template's name. */
export type EmailTemplateName = keyof EmailTemplates

/** The data a template renders from. */
export type EmailTemplateData<Name extends EmailTemplateName> = Parameters<EmailTemplates[Name]>[0]

/**
 * Overrides for any template in {@link EmailTemplates}. Each gets the same
 * data and context as the default, and the default itself, already bound to
 * that context, so an override can keep the packaged body and change only
 * what it needs:
 * `invite: (data, { byDefault }) => ({ ...byDefault(data), subject: 'Join us' })`.
 * An override may be async; the packaged default never is.
 */
export type EmailTemplateOverrides = {
  [Name in EmailTemplateName]?: (
    data: EmailTemplateData<Name>,
    context: EmailRenderContext & { byDefault: (data: EmailTemplateData<Name>) => EmailMessage },
  ) => EmailMessage | Promise<EmailMessage>
}

/**
 * Escape text for HTML: `&`, `<`, `>`, `"` and `'`. Every packaged template
 * runs each value through it; an override that writes its own HTML should do
 * the same with anything a user typed (a name, a workspace name, a gift
 * message), or that user can put markup into an email your domain sends.
 *
 * @example
 * ```ts
 * gift: (data, { byDefault }) => ({ ...byDefault(data), html: `<p>${escapeHtml(data.message ?? '')}</p>` })
 * ```
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c] ?? c
  ))
}

/**
 * The sign-off every packaged email ends with: the app's name, linked to its
 * site, so the recipient can tell who wrote. The text form spells the site
 * out unless the name is its host already. Nothing without a name.
 */
function signOff(brand: EmailBrand): { text: string, html: string } {
  if (!brand.name) return { text: '', html: '' }
  const site = brand.url && brand.name !== hostOf(brand.url) ? `\n${brand.url}` : ''
  return {
    text: `\n\n— ${brand.name}${site}`,
    html: muted(brand.url
      ? `— <a href="${escapeHtml(brand.url)}" style="color:#666">${escapeHtml(brand.name)}</a>`
      : `— ${escapeHtml(brand.name)}`),
  }
}

/** A packaged message: the body in the shell every one renders into (no stylesheet, no images), signed. */
function message(to: string, subject: string, text: string, body: string, brand: EmailBrand): EmailMessage {
  const signature = signOff(brand)
  return {
    to,
    subject,
    text: `${text}${signature.text}`,
    html: `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5">${body}${signature.html}</div>`,
  }
}

/** A muted paragraph: the "or paste this link" and "ignore this" register. */
function muted(html: string): string {
  return `<p style="color:#666">${html}</p>`
}

/** An email whose point is one link: a sentence, a button, the bare URL. */
function linkEmail({ t, brand }: EmailRenderContext, to: string, subject: string, intro: string, url: string, action: string, quote?: string): EmailMessage {
  const safeUrl = escapeHtml(url)
  return message(
    to,
    subject,
    `${intro}${quote ? `\n\n“${quote}”` : ''}\n\n${url}`,
    `<p>${escapeHtml(intro)}</p>`
    + (quote ? `<blockquote style="margin:0 0 12px;padding:8px 12px;border-left:3px solid #ddd;color:#444">${escapeHtml(quote)}</blockquote>` : '')
    + `<p><a href="${safeUrl}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;border-radius:8px;text-decoration:none">${escapeHtml(action)}</a></p>`
    + muted(`${escapeHtml(t('email.link.fallback'))}<br>${safeUrl}`),
    brand,
  )
}

/**
 * The packaged templates: minimal, dependency-free HTML and text that renders
 * in every client and never waits on a remote image, signed with the brand.
 * Every string comes from the labels, through `t`. They render
 * synchronously, so an override can spread `byDefault(data)`.
 *
 * @internal
 */
export const PACKAGED_EMAIL_TEMPLATES: { [Name in EmailTemplateName]: (data: EmailTemplateData<Name>, context: EmailRenderContext) => EmailMessage } = {
  otp: ({ email, otp, type, reason }, { t, brand }) => {
    if (reason === 'email-change') {
      const subject = t('email.otp.emailChange.subject')
      const intro = t('email.otp.emailChange.intro')
      const warning = t('email.otp.emailChange.warning')
      return message(
        email,
        subject,
        `${intro}\n\n${otp}\n\n${warning}`,
        `<p>${escapeHtml(intro)}</p>`
        + `<p style="font-size:28px;font-weight:700;letter-spacing:4px">${escapeHtml(otp)}</p>`
        + muted(escapeHtml(warning)),
        brand,
      )
    }
    const subject = t(`email.otp.subject.${type}`)
    const expiry = t('email.otp.expiry')
    return message(
      email,
      subject,
      `${subject}: ${otp}\n\n${expiry}`,
      `<p>${escapeHtml(subject)}:</p>`
      + `<p style="font-size:28px;font-weight:700;letter-spacing:4px">${escapeHtml(otp)}</p>`
      + muted(escapeHtml(expiry)),
      brand,
    )
  },
  emailChanged: ({ email, newEmail }, { t, brand }) => {
    const intro = t('email.emailChanged.intro', { newEmail })
    const warning = t('email.emailChanged.warning')
    return message(email, t('email.emailChanged.subject'), `${intro}\n\n${warning}`, `<p>${escapeHtml(intro)}</p>` + muted(escapeHtml(warning)), brand)
  },
  welcome: ({ email, name }, { t, brand }) => {
    const greeting = name ? t('email.welcome.greetingNamed', { name }) : t('email.welcome.greeting')
    const body = t('email.welcome.body')
    return message(email, t('email.welcome.subject'), `${greeting} ${body}`, `<p>${escapeHtml(greeting)} 🎉</p><p>${escapeHtml(body)}</p>`, brand)
  },
  deleteAccount: ({ email, url }, context) => linkEmail(
    context,
    email,
    context.t('email.deleteAccount.subject'),
    context.t('email.deleteAccount.intro'),
    url,
    context.t('email.deleteAccount.action'),
  ),
  invite: ({ email, url, inviterName, inviterEmail, organizationName, role }, context) => linkEmail(
    context,
    email,
    context.t('email.invite.subject', { workspace: organizationName }),
    context.t('email.invite.intro', { inviter: inviterName || inviterEmail, workspace: organizationName, role }),
    url,
    context.t('email.invite.action'),
  ),
  gift: ({ recipientEmail, purchaserName, purchaserEmail, message: note, claimUrl }, context) => {
    const { t } = context
    const sender = purchaserName || purchaserEmail || t('email.gift.sender')
    return linkEmail(
      context,
      recipientEmail,
      t('email.gift.subject', { sender }),
      t('email.gift.intro', { sender }),
      claimUrl,
      t('email.gift.action'),
      note,
    )
  },
}

/**
 * The templates in effect: each override in place of its default, called
 * with the default bound to the same context.
 *
 * @internal
 */
export function resolveEmailTemplates(overrides: EmailTemplateOverrides = {}): EmailTemplates {
  const resolved: Record<string, unknown> = { ...PACKAGED_EMAIL_TEMPLATES }
  for (const [name, override] of Object.entries(overrides)) {
    if (!override) continue
    const byDefault = PACKAGED_EMAIL_TEMPLATES[name as EmailTemplateName] as (data: never, context: EmailRenderContext) => EmailMessage
    resolved[name] = (data: never, context: EmailRenderContext) =>
      (override as unknown as (data: never, context: EmailRenderContext & { byDefault: (data: never) => EmailMessage }) => EmailMessage | Promise<EmailMessage>)(
        data,
        { ...context, byDefault: (input: never) => byDefault(input, context) },
      )
  }
  return resolved as unknown as EmailTemplates
}

/** The site's host, the brand name a message falls back to. */
function hostOf(url: string): string {
  try {
    return new URL(url).host
  }
  catch {
    return ''
  }
}

/**
 * The context a message renders with: English labels, the given locale, and
 * the brand from `SITE_URL` and the configured name.
 *
 * @internal
 */
export function emailRenderContext(options: { siteUrl: string, brandName?: string, locale?: string }): EmailRenderContext {
  return {
    t: createTranslate(),
    locale: options.locale ?? 'en',
    brand: { name: options.brandName ?? hostOf(options.siteUrl), url: options.siteUrl },
  }
}
