import { LAYOUT_FOOTER_END } from './email-preferences.js'
import { type EmailBlock, renderBlocks } from './email-blocks.js'
import { escapeHtml } from './email-html.js'
import { type EmailTheme, layoutStyles, type ResolvedEmailTheme, resolveEmailTheme } from './email-theme.js'
import { deletionCanceled } from './emails/deletion-canceled.js'
import { deletionScheduled } from './emails/deletion-scheduled.js'
import { emailChanged } from './emails/email-changed.js'
import { giftPassEnding } from './emails/gift-pass-ending.js'
import { gift } from './emails/gift.js'
import { invite } from './emails/invite.js'
import { otp } from './emails/otp.js'
import { passkeyRecovered } from './emails/passkey-recovered.js'
import { newDevice } from './emails/new-device.js'
import { topicConfirmation } from './emails/topic-confirmation.js'
import { renewalReminder } from './emails/renewal-reminder.js'
import { waitlistAdmitted } from './emails/waitlist-admitted.js'
import { noticeReceived } from './emails/notice-received.js'
import { noticeDecided } from './emails/notice-decided.js'
import { contentRestricted } from './emails/content-restricted.js'
import { appealDecided } from './emails/appeal-decided.js'
import { waitlistConfirmation } from './emails/waitlist-confirmation.js'
import { welcome } from './emails/welcome.js'
import { withdrawalReceipt } from './emails/withdrawal-receipt.js'
import { TRANSLATED_LOCALES } from './label-format.js'
import { findLabel, formatLabel, LABELS, type LabelParams, type LabelTree, type Translate } from './labels.js'
import { LABEL_TRANSLATIONS } from './label-translations.js'
import { baseLanguage, matchLocale, normalizeLocale, textDirection } from './locale.js'

// The one registry of every email the package sends on the app's behalf:
// the sign-in and email-change codes, the welcome and email-change
// notices, workspace invitations and gift notifications. `setupEmail` takes
// the overrides, the messages and the brand; `setupAuth` and `setupBilling`
// send through the same set, so a restyle lands everywhere at once. Every
// packaged email renders into one layout (the brand's header, a card, a
// footer, light and dark), in the recipient's language. Templates are
// functions of their data, so they render anywhere: a preview, a test, a
// Convex mutation.

export { escapeHtml }
export { describeOrigin, linkBlocks } from './email-helpers.js'
export type { EmailBlock }
export type { EmailColors, EmailFonts, EmailScheme, EmailTheme, ResolvedEmailTheme } from './email-theme.js'

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
  /**
   * The body as parts, in place of `html`: a template or `compose` returns
   * them, and the layout renders them in the theme, escaped, with the text
   * version written for you (unless `text` is given). A rendered message
   * has `html` and `text`, and no blocks.
   */
  blocks?: EmailBlock[]
  /**
   * The hidden line a mailbox previews beside the subject. Without one, the
   * first paragraph of `blocks`, else the heading; never a code, since a
   * locked screen shows the preview.
   */
  preheader?: string
}

/**
 * The app a message is sent for, as every packaged email's header and footer
 * show it.
 */
export interface EmailBrand {
  /**
   * The app's name: `setupEmail`'s `brand.name`, else the display name of
   * `EMAIL_FROM` (`Acme` in `Acme <hello@acme.com>`), else the host of
   * `SITE_URL`.
   */
  name: string
  /** `SITE_URL`: where the footer links to. Empty without one. */
  url: string
  /**
   * An absolute URL of the logo the layout's header shows in place of the
   * name: `setupEmail`'s `brand.logo`, a path read against `SITE_URL`.
   * Absent without one.
   */
  logo?: string
}

/** What every template renders with, beside its own data. */
export interface EmailRenderContext {
  /**
   * The words, in the recipient's language: a package label by its key
   * (`t('email.welcome.subject')`, read from `backend.email.welcome.subject`
   * in `setupEmail`'s `messages`), or a key of the app's own from the root
   * of those messages (`t('digest.subject')`). A key the language leaves out
   * reads English.
   */
  t: Translate
  /**
   * The language the email is written in: the recipient's, matched against
   * the locales `setupEmail` has messages for, else the default locale
   * (`'en'` unless `defaultLocale` says otherwise).
   */
  locale: string
  brand: EmailBrand
  /**
   * The look the layout renders with: both color schemes and the fonts, the
   * package's defaults under `setupEmail`'s `theme`. For an email of your
   * own built as `html`; `blocks` use it for you.
   */
  theme: ResolvedEmailTheme
  /**
   * An app URL as a reader of `locale` opens it: under a prefixing
   * `localePaths`, `https://acme.com/accept-invitation` becomes
   * `https://acme.com/fr/accept-invitation`. Any other URL comes back as
   * it was.
   */
  link: (url: string) => string
}

/** Which code an OTP email carries; the subject follows it. */
export type OtpPurpose = 'sign-in' | 'email-verification' | 'forget-password' | 'change-email'

/**
 * Where and when a request that caused an email was made: what a code email
 * names so a person can tell a request that is not theirs. Every part but
 * the time may be missing; none of it is the requester's own text.
 */
export interface RequestOrigin {
  /** The browser and the system, `Chrome on macOS` style; absent when the user agent names neither. */
  device?: { browser?: string, os?: string }
  /** The city and the country (an ISO 3166 code), as the host's geolocation gives them; absent off such a host. */
  place?: { city?: string, country?: string }
  /** When, in epoch milliseconds. */
  at: number
  /** The requester's IANA time zone, when the host gives one: the email shows the time in it, else in UTC. */
  timeZone?: string
}

/** Data for the `otp` template. */
export interface OtpEmailData {
  email: string
  otp: string
  type: OtpPurpose
  /**
   * Why the code was sent, where its type alone doesn't say: `'email-change'`
   * for the `email-verification` code that confirms the current address at
   * the start of an email change; `'passkey-only'` for a sign-in code asked
   * for a passkey-only account, which sends no code (`otp` is empty) and says
   * the account signs in with a passkey.
   */
  reason?: 'email-change' | 'passkey-only'
  /** Who asked for it: the device, an approximate place and the time ({@link RequestOrigin}). */
  requestedFrom?: RequestOrigin
}

/** Data for the `emailChanged` template. */
export interface EmailChangedEmailData {
  /** The address the account had: the notice goes there. */
  email: string
  /** The address it has now, as the person typed it: escape it in HTML ({@link escapeHtml}). */
  newEmail: string
}

/** Data for the `passkeyRecovered` template. */
export interface PasskeyRecoveredEmailData {
  email: string
  /** Where the recovery code was used ({@link RequestOrigin}). */
  requestedFrom?: RequestOrigin
  /** The app's security page, where the person signs every other device out. */
  url: string
}

/** Data for the `newDevice` template. */
export interface NewDeviceEmailData {
  email: string
  /** The device that signed in, from where and when ({@link RequestOrigin}). */
  requestedFrom?: RequestOrigin
  /** The app's security page, where the person signs that device out. */
  url: string
}

/** Data for the `deletionScheduled` template. */
export interface DeletionScheduledEmailData {
  /** The account's address: the notice goes there. */
  email: string
  /** When the account is deleted unless it is kept (epoch ms). */
  deletesAt: number
  /** The link that keeps the account, with its token. It opens a page of the app and needs no sign-in. */
  keepUrl: string
}

/** Data for the `deletionCanceled` template. */
export interface DeletionCanceledEmailData {
  /** The account's address: the confirmation goes there. */
  email: string
}

/** Data for the `welcome` template. */
export interface WelcomeEmailData {
  email: string
  /** The name the person signed up with: their own text, so escape it in HTML ({@link escapeHtml}). */
  name: string
}

/** Data for the `invite` template. */
export interface InviteEmailData {
  email: string
  url: string
  /** The inviter's own name: user text, so escape it in HTML ({@link escapeHtml}). */
  inviterName: string
  inviterEmail: string
  /** The workspace's name, as a member typed it: escape it in HTML. */
  workspaceName: string
  role: string
}

/**
 * Data for the `gift` template. It names who sent what and links to the app,
 * nothing more: the purchaser's email and their message stay out of the
 * email, and the link carries no token — the recipient signs in to claim.
 */
export interface GiftEmailData {
  recipientEmail: string
  /**
   * The sender's name: at most 40 characters with links and domains taken
   * out, but still their own text, so escape it in HTML ({@link escapeHtml}).
   */
  purchaserName?: string
  /** What the gift is: the credit pack's product name, or the plan's name for a plan pass. */
  item: string
  /** For a plan pass, how many months it lasts: the template then writes "3 months of Pro". */
  months?: number
  /** The app URL where the recipient signs in (or up) to receive the gift. */
  claimUrl: string
  /** The one reminder sent a week after the gift: the template then says it is still waiting. */
  reminder?: boolean
}

/**
 * Data for the `giftPassEnding` template. It tells a workspace's billing
 * managers that a plan someone gave it ends, and offers to keep it: an
 * ordinary checkout of the plan, at `keepUrl`.
 */
export interface GiftPassEndingEmailData {
  /** The billing manager written to. */
  email: string
  /** The plan the pass holds: its name. */
  plan: string
  /** The workspace's name, as a member typed it: escape it in HTML. */
  workspace?: string
  /** When the pass ends, epoch milliseconds. */
  endsAt: number
  /** Where the plan is kept: the app's billing settings. */
  keepUrl: string
  /** A reverse trial's pass (LIFECYCLE), which nobody gave: the template says the trial ends. */
  trial?: boolean
}

/**
 * Data for the `renewalReminder` template (LIFECYCLE): the yearly reminder
 * of a renewing subscription's terms that California's automatic renewal
 * law asks for, sent where the billing provider's own reminder does not
 * reach (cycles under six months).
 */
export interface RenewalReminderEmailData {
  /** The billing manager written to. */
  email: string
  /** The plan's name. */
  plan: string
  /** What each renewal charges, in the currency's smallest unit. */
  amount: number
  /** Lower-case ISO 4217. */
  currency: string
  /** The renewal interval: `day`, `week` or `month`. */
  interval: string
  /** How many intervals one cycle is. */
  intervalCount: number
  /** When it next renews, epoch milliseconds. */
  renewsAt: number
  /** Where the plan is managed and cancelled: the app's billing settings. */
  manageUrl: string
}

/**
 * Data for the `withdrawalReceipt` template (LIFECYCLE): the acknowledgement
 * on a durable medium that an EU withdrawal was received, with its date and
 * time (Consumer Rights Directive, Art. 11a).
 */
export interface WithdrawalReceiptEmailData {
  /** The person who withdrew. */
  email: string
  /** The plan withdrawn from: its name. */
  plan: string
  /** When the withdrawal was received, epoch milliseconds. */
  withdrawnAt: number
}

/** Data for the `waitlistConfirmation` template. */
export interface WaitlistConfirmationEmailData {
  email: string
  /** The person's status page, with its signed token in the fragment: it shows their place without a sign-in code. */
  statusUrl: string
  /** Their place, 1-based, among the people waiting; absent when it is not known yet. */
  position?: number
  /** How many people are waiting. */
  total?: number
}

/** Data for the `topicConfirmation` template. */
export interface TopicConfirmationEmailData {
  email: string
  /** The topic's name, as `setupEmail({ topics })` declares it. */
  topic: string
  /** The confirmation link: it joins the topic, once, within 7 days. */
  confirmUrl: string
}

/** Data for the `waitlistAdmitted` template. */
export interface WaitlistAdmittedEmailData {
  email: string
  /** Where the person signs up, with the address they joined with. */
  signInUrl: string
}

/** Data for the `noticeReceived` template. */
export interface NoticeReceivedEmailData {
  /** The notifier's address. */
  email: string
  /** The link to the content, as the notifier gave it; absent for one outside the app, which the email never repeats. */
  url?: string
  /** A request to remove an intimate image shared without consent: decided within 48 hours. */
  intimate?: boolean
}

/** Data for the `noticeDecided` template. */
export interface NoticeDecidedEmailData {
  /** The notifier's address. */
  email: string
  /** The link to the content: the notifier's, when it is into the app, else where `describe` says it is shown; absent without either. */
  url?: string
  /**
   * `removed` when the content was hidden, `kept` when the notice was
   * dismissed, `handled` when an administrator marked a notice the app
   * could not place handled: nothing of the app's was hidden for it.
   */
  outcome: 'removed' | 'kept' | 'handled'
  /** Why, as the administrator wrote it. */
  reason: string
}

/** Data for the `contentRestricted` template: a statement of reasons. */
export interface ContentRestrictedEmailData {
  /** The author's address. */
  email: string
  /** What was hidden, as `reports.describe` names it. */
  title: string
  /** The facts and the term or law the decision rests on, as the administrator wrote them. */
  reason: string
  /** Whether the content was found illegal or against the app's terms. */
  ground: 'illegal' | 'terms'
  /** Whether a notice through the public form led to the decision, rather than people's reports alone. */
  notice: boolean
  /** Where the author appeals: the `report` page with the decision's token in the fragment. */
  appealUrl: string
  /** Until when the decision may be appealed, epoch ms. */
  appealUntil: number
}

/** Data for the `appealDecided` template. */
export interface AppealDecidedEmailData {
  /** The author's address. */
  email: string
  /** What the appeal was about, as `reports.describe` names it. */
  title: string
  /** `upheld` when the decision stands, `reversed` when it was undone. */
  outcome: 'upheld' | 'reversed'
  /** Why, as the administrator wrote it. */
  reason: string
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
  /**
   * Tells a passkey-only account that its recovery code signed in, from
   * where, and links to the security page, which signs every other device
   * out.
   */
  passkeyRecovered: (data: PasskeyRecoveredEmailData, context: EmailRenderContext) => EmailMessage | Promise<EmailMessage>
  /**
   * Tells the account that a device it had not used before signed in,
   * from where and when, and links to the security page, where that device
   * is signed out.
   */
  newDevice: (data: NewDeviceEmailData, context: EmailRenderContext) => EmailMessage | Promise<EmailMessage>
  /** Tells the old address that an email change went through. */
  emailChanged: (data: EmailChangedEmailData, context: EmailRenderContext) => EmailMessage | Promise<EmailMessage>
  /** Tells the account that its deletion is scheduled, when it happens and the link that keeps it. */
  deletionScheduled: (data: DeletionScheduledEmailData, context: EmailRenderContext) => EmailMessage | Promise<EmailMessage>
  /** Confirms that a scheduled deletion was cancelled. */
  deletionCanceled: (data: DeletionCanceledEmailData, context: EmailRenderContext) => EmailMessage | Promise<EmailMessage>
  /** Sent once, right after an account is created. */
  welcome: (data: WelcomeEmailData, context: EmailRenderContext) => EmailMessage | Promise<EmailMessage>
  /** A workspace invitation with its accept link. */
  invite: (data: InviteEmailData, context: EmailRenderContext) => EmailMessage | Promise<EmailMessage>
  /** Tells a gift's recipient it is paid and waiting for them. */
  gift: (data: GiftEmailData, context: EmailRenderContext) => EmailMessage | Promise<EmailMessage>
  /** Tells a workspace's billing managers that a plan pass ends in a week, and offers to keep the plan. */
  giftPassEnding: (data: GiftPassEndingEmailData, context: EmailRenderContext) => EmailMessage | Promise<EmailMessage>
  /** The yearly reminder of a renewing subscription's terms, where the billing provider sends none (LIFECYCLE). */
  renewalReminder: (data: RenewalReminderEmailData, context: EmailRenderContext) => EmailMessage | Promise<EmailMessage>
  /** The receipt of an EU withdrawal, with its date and time (LIFECYCLE). */
  withdrawalReceipt: (data: WithdrawalReceiptEmailData, context: EmailRenderContext) => EmailMessage | Promise<EmailMessage>
  /** Sent once to a person whose sign-in code checked while the app is in early access: their place, and the link that shows it again. */
  waitlistConfirmation: (data: WaitlistConfirmationEmailData, context: EmailRenderContext) => EmailMessage | Promise<EmailMessage>
  /** Sent once when an administrator admits a waitlist entry: a plain "You're in", with no token and no promotion. */
  waitlistAdmitted: (data: WaitlistAdmittedEmailData, context: EmailRenderContext) => EmailMessage | Promise<EmailMessage>
  /** A double opt-in's confirmation: one button that joins the topic the person asked for. */
  topicConfirmation: (data: TopicConfirmationEmailData, context: EmailRenderContext) => EmailMessage | Promise<EmailMessage>
  /** Confirms to a notifier that their notice through the `report` page arrived (DSA Art. 16(4)). */
  noticeReceived: (data: NoticeReceivedEmailData, context: EmailRenderContext) => EmailMessage | Promise<EmailMessage>
  /** Tells a notifier the decision on their notice and where they may take it (DSA Art. 16(5)). */
  noticeDecided: (data: NoticeDecidedEmailData, context: EmailRenderContext) => EmailMessage | Promise<EmailMessage>
  /** The statement of reasons to the person whose content was hidden, with the appeal link (DSA Art. 17). */
  contentRestricted: (data: ContentRestrictedEmailData, context: EmailRenderContext) => EmailMessage | Promise<EmailMessage>
  /** Tells the author the outcome of their appeal (DSA Art. 20). */
  appealDecided: (data: AppealDecidedEmailData, context: EmailRenderContext) => EmailMessage | Promise<EmailMessage>
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
 * The words of the emails in other languages, by locale: each an app's own
 * i18n messages, as its JSON file holds them. The package's labels sit
 * under `backend` (`backend.email.welcome.subject`), an app's own keys at the
 * root. Key them by the locale codes the app's i18n uses (`de`, `pt-BR`).
 */
export type EmailMessages = Record<string, Record<string, unknown>>

/**
 * How the app's pages answer in each language, as `@nuxtjs/i18n`'s
 * `strategy` names it: what {@link EmailRenderContext.link} adds to an app
 * URL. `no_prefix` (the default) leaves every URL as it is;
 * `prefix_except_default` prefixes every locale but the default one;
 * `prefix` and `prefix_and_default` prefix them all.
 */
export type EmailLocalePaths = 'no_prefix' | 'prefix_except_default' | 'prefix' | 'prefix_and_default'

/** Everything a rendering depends on beyond its data: what `setupEmail` takes, and `renderEmail` in tests. */
export interface EmailRenderOptions {
  /** Overrides by template name; see {@link EmailTemplateOverrides}. */
  templates?: EmailTemplateOverrides
  /** The words in other languages; see {@link EmailMessages}. */
  messages?: EmailMessages
  /** The language for a recipient whose own has no messages, and for one nobody knows. Default `'en'`. */
  defaultLocale?: string
  /**
   * The languages the app serves, as its `@nuxtjs/i18n` `locales` codes.
   * An email is written, and its links prefixed, only in one of these or
   * `defaultLocale`. Default: the languages `messages` carries; without
   * `messages`, the package's own translations, unless `localePaths`
   * prefixes the links.
   */
  locales?: readonly string[]
  /** Whether email links carry the language in their path; see {@link EmailLocalePaths}. */
  localePaths?: EmailLocalePaths
  /** The app's name and logo; see {@link EmailBrand}. */
  brand?: { name?: string, logo?: string }
  /** The layout's colors in each scheme and its fonts; see {@link EmailTheme}. Every key is optional. */
  theme?: EmailTheme
}

/** Where a rendering reads the deployment's settings from: `SITE_URL` and `EMAIL_FROM`. */
export interface EmailEnvironment {
  siteUrl?: string
  from?: string
}

const TRUSTED = Symbol.for('nuxt-backend.trustedHtml')

/** Markup {@link html} inserts as it is: made by {@link trustedHtml}. */
export interface TrustedHtml {
  readonly [TRUSTED]: string
}

/**
 * Mark markup as safe for {@link html} to insert unescaped: a fragment you
 * built with `html` itself, or markup of your own that holds nothing a user
 * typed.
 *
 * @example
 * ```ts
 * const items = names.map(name => trustedHtml(html`<li>${name}</li>`))
 * html`<ul>${items}</ul>`
 * ```
 */
export function trustedHtml(markup: string): TrustedHtml {
  return { [TRUSTED]: markup }
}

function interpolate(value: unknown): string {
  if (value === null || value === undefined || value === false) return ''
  if (Array.isArray(value)) return value.map(interpolate).join('')
  if (typeof value === 'object' && TRUSTED in value) return (value as TrustedHtml)[TRUSTED]
  // An object would read `[object Object]`: a mistake to say, not to send.
  if (typeof value === 'object' || typeof value === 'function' || typeof value === 'symbol') {
    throw new TypeError('[nuxt-backend] html: interpolate text, a number, an array, or trustedHtml(markup).')
  }
  return escapeHtml(`${value as string | number | boolean | bigint}`)
}

/**
 * A tagged template for an email's HTML: every value it interpolates is
 * escaped ({@link escapeHtml}), so a name or anything else a user typed
 * cannot put markup into an email your domain sends. An array is joined, and
 * `null`, `undefined` and `false` leave nothing; wrap markup that must go in
 * as it is with {@link trustedHtml}.
 *
 * @example
 * ```ts
 * import { html } from 'nuxt-backend/email'
 *
 * html`<p>Welcome back, ${user.name}!</p>`  // <p>Welcome back, &lt;b&gt;Ada&lt;/b&gt;!</p> for the name <b>Ada</b>
 * ```
 */
export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  let out = strings[0] ?? ''
  for (let index = 0; index < values.length; index++) out += interpolate(values[index]) + (strings[index + 1] ?? '')
  return out
}

// ── The layout ──────────────────────────────────────────────────────────

/** A message's font, as its style attribute carries it. */
const fontOf = (stack: string) => `font-family:${escapeHtml(stack)}`

/** Whether a message's HTML is a whole document already, which the layout leaves as it is. */
function isDocument(markup: string): boolean {
  return /^\s*(?:<!doctype|<html)/i.test(markup)
}

/** A label whose `{param}` is a node: the label's words escaped, the node's markup kept. */
function withNode(t: Translate, key: string, param: string, node: string, text: string): { html: string, text: string } {
  const marker = '\u0000node\u0000'
  return {
    html: escapeHtml(t(key, { [param]: marker })).replace(marker, node),
    text: t(key, { [param]: text }),
  }
}

/** The footer's words: "Sent by Acme", the name linked to the site. Nothing without a name. */
function footer({ t, brand, theme }: EmailRenderContext): { html: string, text: string } {
  if (!brand.name) return { html: '', text: '' }
  const name = escapeHtml(brand.name)
  const node = brand.url ? `<a href="${escapeHtml(brand.url)}" style="color:${theme.colors.muted};text-decoration:underline">${name}</a>` : name
  const words = withNode(t, 'email.layout.sentBy', 'brand', node, brand.name)
  // The text form spells the site out, unless the name is its host already.
  const site = brand.url && brand.name !== hostOf(brand.url) ? `\n${brand.url}` : ''
  return { html: words.html, text: `\n\n— ${words.text}${site}` }
}

/** The header: the logo, else the name. Nothing without either. */
function header({ brand, theme }: EmailRenderContext): string {
  if (brand.logo) {
    const image = `<img src="${escapeHtml(brand.logo)}" alt="${escapeHtml(brand.name)}" height="32" style="display:block;height:32px;width:auto;border:0;outline:none">`
    return brand.url ? `<a href="${escapeHtml(brand.url)}" style="text-decoration:none">${image}</a>` : image
  }
  if (!brand.name) return ''
  return `<span class="nb-ink" style="${fontOf(theme.fonts.heading)};font-size:18px;font-weight:700;color:${theme.colors.text}">${escapeHtml(brand.name)}</span>`
}

/** The preview text a mailbox shows beside the subject: one line, never longer than it reads. */
function previewText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 140)
}

/** The body of a message: its blocks rendered, else its own `html`; the text and the preview that go with it. */
function bodyOf(message: EmailMessage, context: EmailRenderContext): { html?: string, text?: string, preheader?: string } {
  const { blocks, preheader, html: own, text } = message
  if (blocks === undefined) return { html: own, text, preheader }
  if (own !== undefined) throw new TypeError('[nuxt-backend] an email takes `blocks` or `html`, not both.')
  const rendered = renderBlocks(blocks, context.theme)
  return { html: rendered.html, text: text ?? rendered.text, preheader: preheader ?? rendered.preheader }
}

/** The whole HTML document: the head with the theme's stylesheet, the header, the body on its card, the footer. */
function documentOf(subject: string, body: { html: string, preheader?: string }, footerHtml: string, context: EmailRenderContext): string {
  const { theme } = context
  const { colors } = theme
  const top = header(context)
  const font = fontOf(theme.fonts.body)
  return '<!doctype html>'
    + `<html lang="${escapeHtml(context.locale)}" dir="${textDirection(context.locale)}">`
    + '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">'
    + `<title>${escapeHtml(subject)}</title><style>${layoutStyles(theme)}</style></head>`
    + `<body class="nb-page" style="margin:0;padding:0;background:${colors.background}">`
    + (body.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(previewText(body.preheader))}</div>` : '')
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="nb-page" style="background:${colors.background}"><tr><td align="center" style="padding:32px 12px">`
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">'
    + (top ? `<tr><td style="padding:0 4px 16px;${font}">${top}</td></tr>` : '')
    + `<tr><td class="nb-card nb-ink" style="background:${colors.card};border:1px solid ${colors.rule};border-radius:12px;padding:28px 24px;${font};font-size:16px;line-height:1.5;color:${colors.text}">${body.html}</td></tr>`
    + (footerHtml ? `<tr><td class="nb-muted" style="padding:16px 4px;${font};font-size:13px;line-height:1.5;color:${colors.muted}">${footerHtml}${LAYOUT_FOOTER_END}</td></tr>` : '')
    + '</table></td></tr></table></body></html>'
}

/**
 * Put a message's body in the layout every packaged email uses: the HTML
 * document (light and dark, the recipient's language and direction), the
 * brand's header, the body in a card, the footer; the text form ends with
 * the footer's words. The body is `blocks` (rendered in the theme, with the
 * text written for you unless `text` is given) or `html`, not both. A message
 * whose `html` is a whole document already keeps it, and gets the text
 * footer only. The rendered message has no `blocks` and no `preheader`.
 */
export function withLayout(message: EmailMessage, context: EmailRenderContext): EmailMessage {
  const { blocks: _blocks, preheader: _preheader, html: _html, text: _text, ...rest } = message
  const body = bodyOf(message, context)
  const foot = footer(context)
  const text = body.text === undefined ? {} : { text: `${body.text}${foot.text}` }
  if (body.html === undefined) return { ...rest, ...text }
  const html = isDocument(body.html) ? body.html : documentOf(rest.subject, { html: body.html, preheader: body.preheader }, foot.html, context)
  return { ...rest, html, ...text }
}

/**
 * The packaged templates: dependency-free HTML in the shared layout (no
 * remote image unless the brand has a logo) and plain text, in the
 * recipient's language. Each is a file of its own under emails/, written as
 * an app's override is (the blocks `compose` takes, every string from the
 * labels through `t`), so `eject email:<name>` copies it as it is; here it
 * renders into the layout. They render synchronously, so an override can
 * spread `byDefault(data)`.
 *
 * @internal
 */
export const PACKAGED_EMAIL_TEMPLATES: { [Name in EmailTemplateName]: (data: EmailTemplateData<Name>, context: EmailRenderContext) => EmailMessage } = {
  otp: inLayout(otp),
  passkeyRecovered: inLayout(passkeyRecovered),
  newDevice: inLayout(newDevice),
  emailChanged: inLayout(emailChanged),
  deletionScheduled: inLayout(deletionScheduled),
  deletionCanceled: inLayout(deletionCanceled),
  welcome: inLayout(welcome),
  invite: inLayout(invite),
  gift: inLayout(gift),
  giftPassEnding: inLayout(giftPassEnding),
  waitlistConfirmation: inLayout(waitlistConfirmation),
  waitlistAdmitted: inLayout(waitlistAdmitted),
  topicConfirmation: inLayout(topicConfirmation),
  noticeReceived: inLayout(noticeReceived),
  noticeDecided: inLayout(noticeDecided),
  contentRestricted: inLayout(contentRestricted),
  appealDecided: inLayout(appealDecided),
  renewalReminder: inLayout(renewalReminder),
  withdrawalReceipt: inLayout(withdrawalReceipt),
}

/** A packaged template's message, its blocks rendered into the layout. */
function inLayout<Data>(template: (data: Data, context: EmailRenderContext) => EmailMessage): (data: Data, context: EmailRenderContext) => EmailMessage {
  return (data, context) => withLayout(template(data, context), context)
}

/**
 * The packaged template of each name, by the file it is in under emails/:
 * `emailChanged` is `email-changed.ts`. What `eject` copies and `upgrade` diffs.
 *
 * @internal
 */
export function emailTemplateFile(name: EmailTemplateName): string {
  return `${name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}.ts`
}

/**
 * The address each packaged template writes to, from its data: whose
 * language the email is written in.
 *
 * @internal
 */
export function recipientOf<Name extends EmailTemplateName>(name: Name, data: EmailTemplateData<Name>): string | undefined {
  const value = name === 'gift' ? (data as GiftEmailData).recipientEmail : (data as { email?: string }).email
  return typeof value === 'string' ? value : undefined
}

/**
 * The templates in effect: each override in place of its default, called
 * with the default bound to the same context. An override that returns
 * `blocks` gets them rendered in the layout, as `compose` does; one that
 * returns `html` is sent as it is.
 *
 * @internal
 */
export function resolveEmailTemplates(overrides: EmailTemplateOverrides = {}): EmailTemplates {
  const resolved: Record<string, unknown> = { ...PACKAGED_EMAIL_TEMPLATES }
  for (const [name, override] of Object.entries(overrides)) {
    if (!override) continue
    const byDefault = PACKAGED_EMAIL_TEMPLATES[name as EmailTemplateName] as (data: never, context: EmailRenderContext) => EmailMessage
    resolved[name] = (data: never, context: EmailRenderContext) => {
      const built = (override as unknown as (data: never, context: EmailRenderContext & { byDefault: (data: never) => EmailMessage }) => EmailMessage | Promise<EmailMessage>)(
        data,
        { ...context, byDefault: (input: never) => byDefault(input, context) },
      )
      const settle = (message: EmailMessage) => message.blocks === undefined ? message : withLayout(message, context)
      return typeof (built as Promise<EmailMessage>).then === 'function' ? (built as Promise<EmailMessage>).then(settle) : settle(built as EmailMessage)
    }
  }
  return resolved as unknown as EmailTemplates
}

// ── Brand, language, links ──────────────────────────────────────────────

/** The site's host, the brand name a message falls back to last. */
function hostOf(url: string): string {
  try {
    return new URL(url).host
  }
  catch {
    return ''
  }
}

/**
 * The display name of a sender address: `Acme` in `Acme <hello@acme.com>`
 * and in `"Acme" <hello@acme.com>`; `undefined` for a bare address.
 *
 * @internal
 */
export function senderName(from: string | undefined): string | undefined {
  const address = (from ?? '').trim()
  const open = address.lastIndexOf('<')
  if (open <= 0 || !address.endsWith('>')) return undefined
  let name = address.slice(0, open).trim()
  if (name.length > 1 && name.startsWith('"') && name.endsWith('"')) name = name.slice(1, -1).trim()
  return name || undefined
}

/**
 * The brand a message signs with: the configured name, else the sender's
 * display name, else the site's host; the logo read against the site.
 *
 * @internal
 */
export function resolveBrand(brand: EmailRenderOptions['brand'], env: EmailEnvironment): EmailBrand {
  const url = env.siteUrl ?? ''
  const name = brand?.name?.trim() || senderName(env.from) || hostOf(url)
  let logo: string | undefined
  if (brand?.logo) {
    try {
      logo = new URL(brand.logo, url || undefined).href
    }
    catch {
      logo = undefined
    }
  }
  return { name, url, ...(logo ? { logo } : {}) }
}

/**
 * A {@link Translate} for one language: a package key reads `backend.<key>`
 * from that language's messages, then the package's own translation into
 * that language (ru, de, es, fr), then the `en` messages, then the
 * package's English; any other key (the app's own) reads from the root of
 * the same messages, then of `defaultLocale`'s, then of `en`'s.
 * An unknown key comes back as itself.
 *
 * @internal
 */
export function emailTranslate(messages: EmailMessages | undefined, locale: string, defaultLocale?: string): Translate {
  const tree = (code: string) => {
    const found = messages?.[code] as LabelTree | undefined
    return typeof found === 'object' && found !== null ? found : undefined
  }
  const backend = (messages?: LabelTree) => typeof messages?.backend === 'object' ? messages.backend : undefined
  const own = tree(locale)
  const english = locale === 'en' ? undefined : tree('en')
  const language = normalizeLocale(locale)
  const translation = language === null ? undefined : LABEL_TRANSLATIONS[baseLanguage(language)]
  // A package key: the app's messages in the reader's language, the package's translation into it, the app's `en`.
  const packagedSources = [backend(own), translation, backend(english)].filter(source => source !== undefined)
  // An app key: the reader's language, then the app's default language, then its `en`.
  const fallback = defaultLocale && defaultLocale !== locale && defaultLocale !== 'en' ? tree(defaultLocale) : undefined
  const ownSources = [own, fallback, english].filter(source => source !== undefined)
  return (key: string, params?: LabelParams) => {
    const packaged = findLabel(LABELS, key)
    for (const source of packaged === undefined ? ownSources : packagedSources) {
      const found = findLabel(source, key)
      if (found !== undefined) return formatLabel(found, params)
    }
    return packaged === undefined ? key : formatLabel(packaged, params)
  }
}

/** An app URL as a reader of `locale` opens it, under `localePaths`. */
function localizedLink(url: string, locale: string, options: { siteUrl: string, localePaths: EmailLocalePaths, defaultLocale: string }): string {
  const { siteUrl, localePaths, defaultLocale } = options
  if (localePaths === 'no_prefix' || !siteUrl) return url
  if (localePaths === 'prefix_except_default' && normalizeLocale(locale) === normalizeLocale(defaultLocale)) return url
  let target: URL
  let site: URL
  try {
    target = new URL(url)
    site = new URL(siteUrl)
  }
  catch {
    return url
  }
  if (target.origin !== site.origin) return url
  const base = site.pathname.replace(/\/$/, '')
  if (target.pathname !== base && !target.pathname.startsWith(`${base}/`)) return url
  const rest = target.pathname.slice(base.length) || '/'
  const prefix = `/${locale}`
  if (rest === prefix || rest.startsWith(`${prefix}/`)) return url
  target.pathname = `${base}${prefix}${rest === '/' ? '' : rest}`
  return target.href
}

// ── The renderer ────────────────────────────────────────────────────────

/**
 * One packaged email, rendered with sample data: what a preview shows.
 *
 * @experimental With the DevTools Email tab (STABILITY.md).
 */
export interface EmailPreview {
  /** Unique among the previews: the template's name, with its variant (`otp-sign-in`). */
  key: string
  template: EmailTemplateName
  /** Which form of the template it is, where it has several: a code's purpose. */
  variant?: string
  /** When the package sends it, in a sentence. */
  note: string
  /** The language it is written in. */
  locale: string
  to: string
  subject: string
  html: string
  text: string
}

interface PreviewSample<Name extends EmailTemplateName = EmailTemplateName> {
  key: string
  template: Name
  variant?: string
  note: string
  data: (site: string) => EmailTemplateData<Name>
}

const SAMPLE_EMAIL = 'ada@example.com'
const SAMPLE_NAME = 'Ada Lovelace'
const SAMPLE_CODE = '493021'

/** Where a sample request came from: a browser, a city, and a fixed time. */
const SAMPLE_ORIGIN: RequestOrigin = { device: { browser: 'Chrome', os: 'macOS' }, place: { city: 'Lisbon', country: 'PT' }, at: Date.UTC(2026, 9, 27, 13, 2), timeZone: 'Europe/Lisbon' }

const otpSample = (type: OtpPurpose, note: string): PreviewSample<'otp'> => ({
  key: `otp-${type}`,
  template: 'otp',
  variant: type,
  note,
  data: () => ({ email: SAMPLE_EMAIL, otp: SAMPLE_CODE, type, requestedFrom: SAMPLE_ORIGIN }),
})

/**
 * Every packaged email with sample data, in the order a person meets them.
 *
 * @internal
 */
export const EMAIL_PREVIEW_SAMPLES: readonly PreviewSample[] = [
  otpSample('sign-in', 'A sign-in code, for an account or a new one.'),
  otpSample('email-verification', 'A code that confirms an address.'),
  { key: 'otp-email-change', template: 'otp', variant: 'email-change', note: 'The first code of an email change, to the current address, with a warning for a change nobody asked for.', data: () => ({ email: SAMPLE_EMAIL, otp: SAMPLE_CODE, type: 'email-verification', reason: 'email-change' }) } satisfies PreviewSample<'otp'>,
  otpSample('change-email', 'The second code of an email change, to the new address.'),
  { key: 'otp-passkey-only', template: 'otp', variant: 'passkey-only', note: 'A sign-in code asked for a passkey-only account: no code, and the way back in.', data: () => ({ email: SAMPLE_EMAIL, otp: '', type: 'sign-in', reason: 'passkey-only', requestedFrom: SAMPLE_ORIGIN }) } satisfies PreviewSample<'otp'>,
  { key: 'passkeyRecovered', template: 'passkeyRecovered', note: 'To a passkey-only account, once its recovery code signed in.', data: site => ({ email: SAMPLE_EMAIL, requestedFrom: SAMPLE_ORIGIN, url: `${site}/security` }) } satisfies PreviewSample<'passkeyRecovered'>,
  { key: 'newDevice', template: 'newDevice', note: 'To an account, once a device it had not used before signed in.', data: site => ({ email: SAMPLE_EMAIL, requestedFrom: SAMPLE_ORIGIN, url: `${site}/security` }) } satisfies PreviewSample<'newDevice'>,
  { key: 'emailChanged', template: 'emailChanged', note: 'To the old address, once an email change went through.', data: () => ({ email: SAMPLE_EMAIL, newEmail: 'ada.lovelace@example.com' }) } satisfies PreviewSample<'emailChanged'>,
  { key: 'deletionScheduled', template: 'deletionScheduled', note: 'To an account that asked to be deleted, with the date and the link that keeps it.', data: site => ({ email: SAMPLE_EMAIL, deletesAt: Date.UTC(2027, 0, 15), keepUrl: `${site}/account/keep?token=sample` }) } satisfies PreviewSample<'deletionScheduled'>,
  { key: 'deletionCanceled', template: 'deletionCanceled', note: 'To an account that kept itself, once a scheduled deletion is cancelled.', data: () => ({ email: SAMPLE_EMAIL }) } satisfies PreviewSample<'deletionCanceled'>,
  { key: 'welcome', template: 'welcome', note: 'Once, right after an account is created.', data: () => ({ email: SAMPLE_EMAIL, name: SAMPLE_NAME }) } satisfies PreviewSample<'welcome'>,
  { key: 'invite', template: 'invite', note: 'A workspace invitation, with its accept link.', data: site => ({ email: 'grace@example.com', url: `${site}/accept-invitation?id=sample`, inviterName: SAMPLE_NAME, inviterEmail: SAMPLE_EMAIL, workspaceName: 'Analytical Engines', role: 'member' }) } satisfies PreviewSample<'invite'>,
  { key: 'waitlistConfirmation', template: 'waitlistConfirmation', note: 'Once, to a person whose sign-in code checked while the app is in early access.', data: site => ({ email: SAMPLE_EMAIL, statusUrl: `${site}/waitlist#sample`, position: 48, total: 1204 }) } satisfies PreviewSample<'waitlistConfirmation'>,
  { key: 'waitlistAdmitted', template: 'waitlistAdmitted', note: 'Once, when an administrator admits a waitlist entry.', data: site => ({ email: SAMPLE_EMAIL, signInUrl: `${site}/login` }) } satisfies PreviewSample<'waitlistAdmitted'>,
  { key: 'topicConfirmation', template: 'topicConfirmation', note: 'When a person asks to join a topic with double opt-in.', data: site => ({ email: SAMPLE_EMAIL, topic: 'Product news', confirmUrl: `${site}/unsubscribe?confirm=c1.sample` }) } satisfies PreviewSample<'topicConfirmation'>,
  { key: 'noticeReceived', template: 'noticeReceived', note: 'To a person who sent a notice through the report page, as it arrives.', data: site => ({ email: SAMPLE_EMAIL, url: `${site}/strips/sample`, intimate: false }) } satisfies PreviewSample<'noticeReceived'>,
  { key: 'noticeDecided', template: 'noticeDecided', note: 'To that person once an administrator decided their notice.', data: site => ({ email: SAMPLE_EMAIL, url: `${site}/strips/sample`, outcome: 'removed', reason: 'The strip shows a real person\'s address, which our terms forbid.' }) } satisfies PreviewSample<'noticeDecided'>,
  { key: 'contentRestricted', template: 'contentRestricted', note: 'The statement of reasons, to the author of content an administrator hid.', data: site => ({ email: SAMPLE_EMAIL, title: 'A fox who wants to fly', reason: 'The strip shows a real person\'s address, which section 4 of our terms forbids.', ground: 'terms', notice: true, appealUrl: `${site}/report#appeal=sample`, appealUntil: Date.UTC(2027, 3, 27) }) } satisfies PreviewSample<'contentRestricted'>,
  { key: 'appealDecided', template: 'appealDecided', note: 'To the author, once an administrator decided their appeal.', data: () => ({ email: SAMPLE_EMAIL, title: 'A fox who wants to fly', outcome: 'reversed', reason: 'The address shown is the author\'s own, which they may share.' }) } satisfies PreviewSample<'appealDecided'>,
  { key: 'gift', template: 'gift', note: 'To a gift\'s recipient, once it is delivered.', data: site => ({ recipientEmail: 'grace@example.com', purchaserName: SAMPLE_NAME, item: '500 credits', claimUrl: `${site}/` }) } satisfies PreviewSample<'gift'>,
  { key: 'renewalReminder', template: 'renewalReminder', note: 'Once a year, to the billing managers of a plan renewing every month (LIFECYCLE).', data: site => ({ email: SAMPLE_EMAIL, plan: 'Pro', amount: 2900, currency: 'usd', interval: 'month', intervalCount: 1, renewsAt: Date.UTC(2027, 0, 15), manageUrl: `${site}/settings` }) } satisfies PreviewSample<'renewalReminder'>,
  { key: 'withdrawalReceipt', template: 'withdrawalReceipt', note: 'To the person who pressed the withdrawal button (LIFECYCLE).', data: () => ({ email: SAMPLE_EMAIL, plan: 'Pro', withdrawnAt: Date.UTC(2027, 0, 15, 14, 2) }) } satisfies PreviewSample<'withdrawalReceipt'>,
  { key: 'giftPassEnding', template: 'giftPassEnding', note: 'To a workspace\'s billing managers, a week before a plan pass ends.', data: site => ({ email: SAMPLE_EMAIL, plan: 'Pro', workspace: 'Analytical Engines', endsAt: Date.UTC(2027, 0, 15), keepUrl: `${site}/settings` }) } satisfies PreviewSample<'giftPassEnding'>,
] as readonly PreviewSample[]

/** The emails of one setup, rendered: what `setupEmail` holds, and `renderEmail` runs on. */
export interface EmailRenderer {
  /** The languages with messages, the default first, and English last unless it is the default. */
  readonly locales: readonly string[]
  /** The language a reader of `wanted` gets: theirs when there are messages for it, else the default. */
  resolveLocale: (wanted?: string | null) => string
  /** The context a message for a reader of `locale` renders with. */
  context: (locale?: string | null) => EmailRenderContext
  /** Render one email the package sends, the override in effect included. */
  render: <Name extends EmailTemplateName>(name: Name, data: EmailTemplateData<Name>, locale?: string | null) => Promise<EmailMessage>
  /** Render every packaged email with sample data. */
  previews: (locale?: string | null) => Promise<EmailPreview[]>
  /** Build an email of the app's own in the layout, in the reader's language; `null` from `build` comes back as is. */
  compose: <Message extends EmailMessage | null>(build: (context: EmailRenderContext) => Message | Promise<Message>, locale?: string | null) => Promise<Message>
}

/**
 * The languages an app serves, beside its default: an email is written in
 * one of them or in `defaultLocale`, never in a language the app's pages
 * don't answer in, so a link never carries a prefix that 404s. The app's
 * `locales` when it names them; else the languages its `messages` carry;
 * else, for an app that passes neither and keeps its paths unprefixed, the
 * package's own translations and English. An app that prefixes its paths and
 * names no language gets `defaultLocale` alone.
 */
function servedLocales(options: EmailRenderOptions, messageLocales: readonly string[], localePaths: EmailLocalePaths): readonly string[] {
  if (options.locales) return options.locales
  if (options.messages) return messageLocales
  return localePaths === 'no_prefix' ? [...TRANSLATED_LOCALES, 'en'] : []
}

/**
 * The renderer of one setup: its templates, messages and brand, reading the
 * deployment's `SITE_URL` and `EMAIL_FROM` through `env` at every render.
 * What `setupEmail` renders with, and `renderEmail` in `nuxt-backend/test-utils`.
 */
export function createEmailRenderer(options: EmailRenderOptions, env: () => EmailEnvironment): EmailRenderer {
  const templates = resolveEmailTemplates(options.templates)
  const theme = resolveEmailTheme(options.theme)
  const localePaths = options.localePaths ?? 'no_prefix'
  const messageLocales = Object.keys(options.messages ?? {}).filter(code => normalizeLocale(code) !== null)
  // The default as the messages spell it (`pt-br` keys `pt-br`, not `pt-BR`), so
  // its readers get its words and its links the path the app's i18n serves.
  const requested = normalizeLocale(options.defaultLocale) ?? 'en'
  const defaultLocale = messageLocales.find(code => normalizeLocale(code) === requested) ?? requested
  const locales = [defaultLocale, ...servedLocales(options, messageLocales, localePaths)]
    .filter(code => normalizeLocale(code) !== null)
    .filter((code, index, all) => all.findIndex(other => normalizeLocale(other) === normalizeLocale(code)) === index)

  const resolveLocale = (wanted?: string | null): string => matchLocale(wanted, locales) ?? defaultLocale

  const context = (wanted?: string | null): EmailRenderContext => {
    const locale = resolveLocale(wanted)
    const settings = env()
    const siteUrl = settings.siteUrl ?? ''
    return {
      t: emailTranslate(options.messages, locale, defaultLocale),
      locale,
      brand: resolveBrand(options.brand, settings),
      theme,
      link: url => localizedLink(url, locale, { siteUrl, localePaths, defaultLocale }),
    }
  }

  const render: EmailRenderer['render'] = async (name, data, locale) =>
    await (templates[name] as (data: unknown, context: EmailRenderContext) => EmailMessage | Promise<EmailMessage>)(data, context(locale))

  return {
    locales,
    resolveLocale,
    context,
    render,
    previews: async (locale) => {
      const resolved = resolveLocale(locale)
      const site = (env().siteUrl ?? '').replace(/\/$/, '') || 'https://app.example.com'
      return await Promise.all(EMAIL_PREVIEW_SAMPLES.map(async (sample) => {
        const rendered = await render(sample.template, sample.data(site) as never, resolved)
        return {
          key: sample.key,
          template: sample.template,
          ...(sample.variant ? { variant: sample.variant } : {}),
          note: sample.note,
          locale: resolved,
          to: rendered.to,
          subject: rendered.subject,
          html: rendered.html ?? '',
          text: rendered.text ?? '',
        }
      }))
    },
    compose: async <Message extends EmailMessage | null>(build: (context: EmailRenderContext) => Message | Promise<Message>, locale?: string | null): Promise<Message> => {
      const rendered = context(locale)
      const built = await build(rendered)
      return (built === null ? null : withLayout(built, rendered)) as Message
    },
  }
}
