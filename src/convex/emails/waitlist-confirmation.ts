import type { EmailMessage, EmailRenderContext, WaitlistConfirmationEmailData } from '../email-templates.js'
import { linkBlocks } from '../email-helpers.js'

/** The `waitlistConfirmation` email: the person's place in line, how people are admitted, and the link that shows the place again. */
export function waitlistConfirmation({ email, statusUrl, position, total }: WaitlistConfirmationEmailData, context: EmailRenderContext): EmailMessage {
  const { t } = context
  const intro = position && total
    ? t('email.waitlistConfirmation.intro', { position: position.toLocaleString(context.locale), total: total.toLocaleString(context.locale) })
    : t('email.waitlistConfirmation.introUnplaced')
  const note = t('email.waitlistConfirmation.note')
  const link = context.link(statusUrl)
  return {
    to: email,
    subject: t('email.waitlistConfirmation.subject'),
    blocks: [{ paragraph: intro }, { paragraph: note }, ...linkBlocks(link, t('email.waitlistConfirmation.action'), context)],
    text: `${intro}\n\n${note}\n\n${link}`,
    preheader: intro,
  }
}
