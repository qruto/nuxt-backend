import type { EmailMessage, EmailRenderContext, TopicConfirmationEmailData } from '../email-templates.js'
import { linkBlocks } from '../email-helpers.js'

/** The `topicConfirmation` email: the double opt-in's one button, which joins the topic the person asked for. */
export function topicConfirmation({ email, topic, confirmUrl }: TopicConfirmationEmailData, context: EmailRenderContext): EmailMessage {
  const { t } = context
  const intro = t('email.topicConfirmation.intro', { topic })
  const note = t('email.topicConfirmation.note')
  const link = context.link(confirmUrl)
  return {
    to: email,
    subject: t('email.topicConfirmation.subject', { topic }),
    blocks: [{ paragraph: intro }, ...linkBlocks(link, t('email.topicConfirmation.action'), context), { note }],
    text: `${intro}\n\n${link}\n\n${note}`,
    preheader: intro,
  }
}
