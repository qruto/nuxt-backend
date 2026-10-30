import {
  createEmailRenderer,
  type EmailMessage,
  type EmailRenderOptions,
  type EmailTemplateData,
  type EmailTemplateName,
} from '../../convex/email-templates.js'

/** What {@link renderEmail} renders with: `setupEmail`'s rendering options, and the deployment's settings it would read. */
export interface RenderEmailOptions extends EmailRenderOptions {
  /** The recipient's language, as `user.locale` holds it. Default: the default locale. */
  locale?: string
  /** The site the brand links to and the links point at, as `SITE_URL`. Default `https://app.example.com`. */
  siteUrl?: string
  /** The sender, as `EMAIL_FROM`: its display name names the brand when `brand.name` does not. */
  from?: string
}

/**
 * Render one of the emails the package sends, as `setupEmail` with the same
 * options would send it, without a deployment: the template in effect (an
 * override in `templates`, else the packaged one) in the shared layout, in
 * `locale` read through `messages`. Pass the options your
 * `backend/email.ts` gives `setupEmail` (`templates`, `messages`,
 * `defaultLocale`, `localePaths`, `brand`, `theme`) to test what your users get.
 * Experimental, with the rest of `nuxt-backend/test-utils`.
 *
 * @example
 * ```ts
 * import { renderEmail } from 'nuxt-backend/test-utils'
 * import de from '../i18n/locales/de.json'
 *
 * const message = await renderEmail('welcome', { email: 'ada@example.com', name: 'Ada' }, { locale: 'de', messages: { de } })
 * expect(message.subject).toBe('Willkommen')
 * ```
 */
export async function renderEmail<Name extends EmailTemplateName>(name: Name, data: EmailTemplateData<Name>, options: RenderEmailOptions = {}): Promise<EmailMessage> {
  const { locale, siteUrl = 'https://app.example.com', from, ...rendering } = options
  return await createEmailRenderer(rendering, () => ({ siteUrl, from })).render(name, data, locale)
}
