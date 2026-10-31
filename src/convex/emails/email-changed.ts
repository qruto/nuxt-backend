import type { EmailChangedEmailData, EmailMessage, EmailRenderContext } from '../email-templates.js'

/** The `emailChanged` email: to the old address, once an email change went through, with a warning for a change nobody asked for. */
export function emailChanged({ email, newEmail }: EmailChangedEmailData, context: EmailRenderContext): EmailMessage {
  const { t } = context
  const intro = t('email.emailChanged.intro', { newEmail })
  return {
    to: email,
    subject: t('email.emailChanged.subject'),
    blocks: [{ paragraph: intro }, { note: t('email.emailChanged.warning') }],
    preheader: intro,
  }
}
