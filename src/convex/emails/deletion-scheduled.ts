import type { DeletionScheduledEmailData, EmailMessage, EmailRenderContext } from '../email-templates.js'
import { linkBlocks } from '../email-helpers.js'

/** The `deletionScheduled` email: the account is deleted on this date unless it is kept, and the link that keeps it with no sign-in. */
export function deletionScheduled({ email, deletesAt, keepUrl }: DeletionScheduledEmailData, context: EmailRenderContext): EmailMessage {
  const { t } = context
  const date = new Intl.DateTimeFormat(context.locale, { dateStyle: 'long', timeZone: 'UTC' }).format(deletesAt)
  const intro = t('email.deletionScheduled.intro', { date })
  const warning = t('email.deletionScheduled.warning')
  const link = context.link(keepUrl)
  return {
    to: email,
    subject: t('email.deletionScheduled.subject'),
    blocks: [{ paragraph: intro }, ...linkBlocks(link, t('email.deletionScheduled.action'), context), { note: warning }],
    text: `${intro}\n\n${link}\n\n${warning}`,
    preheader: intro,
  }
}
