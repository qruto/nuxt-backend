import type { EmailMessage, EmailRenderContext, NoticeReceivedEmailData } from '../email-templates.js'

/** The `noticeReceived` email: the receipt of a notice sent through the public form (DSA Art. 16(4)), and the 48-hour promise of an intimate-image removal request. */
export function noticeReceived({ email, url, intimate }: NoticeReceivedEmailData, context: EmailRenderContext): EmailMessage {
  const { t } = context
  const intro = url ? t('email.noticeReceived.intro', { url }) : t('email.noticeReceived.introUnlinked')
  const next = t(intimate ? 'email.noticeReceived.intimate' : 'email.noticeReceived.next')
  return {
    to: email,
    subject: t('email.noticeReceived.subject'),
    blocks: [{ paragraph: intro }, { paragraph: next }],
    text: `${intro}\n\n${next}`,
    preheader: intro,
  }
}
