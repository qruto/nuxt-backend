import type { EmailMessage, EmailRenderContext, NotificationEmailData } from '../email-templates.js'
import { linkBlocks } from '../email-helpers.js'

/**
 * The `notification` email: one notification a person gets by email, in the
 * words the inbox shows it with (its kind's title and body), the link that
 * opens it, and where they choose which notifications reach them by email.
 * Every kind sends this one; switch on `type` to give a kind its own.
 */
export function notification({ email, words, link }: NotificationEmailData, context: EmailRenderContext): EmailMessage {
  const { t } = context
  return {
    to: email,
    subject: words.title,
    blocks: [
      { heading: words.title },
      ...(words.body ? [{ paragraph: words.body }] : []),
      ...linkBlocks(context.link(link), t('notifications.emailOpen'), context),
      { note: t('notifications.emailNote') },
    ],
  }
}
