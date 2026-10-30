import type { EmailMessage, EmailRenderContext, NoticeDecidedEmailData } from '../email-templates.js'

/** The `noticeDecided` email: the decision on a notice, why, and where the notifier may take it (DSA Art. 16(5)). */
export function noticeDecided({ email, url, outcome, reason }: NoticeDecidedEmailData, context: EmailRenderContext): EmailMessage {
  const { t } = context
  const intro = url ? t(`email.noticeDecided.${outcome}`, { url }) : t(`email.noticeDecided.${outcome}Unlinked`)
  const why = t('email.noticeDecided.reason', { reason })
  const redress = t('email.noticeDecided.redress')
  return {
    to: email,
    subject: t('email.noticeDecided.subject'),
    blocks: [{ paragraph: intro }, { paragraph: why }, { note: redress }],
    text: `${intro}\n\n${why}\n\n${redress}`,
    preheader: intro,
  }
}
