import type { EmailMessage, EmailRenderContext, WithdrawalReceiptEmailData } from '../email-templates.js'

/** The `withdrawalReceipt` email: the withdrawal from this plan was received on this date, at this time, and what follows. */
export function withdrawalReceipt({ email, plan, withdrawnAt }: WithdrawalReceiptEmailData, context: EmailRenderContext): EmailMessage {
  const { t } = context
  const at = new Intl.DateTimeFormat(context.locale, { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }).format(withdrawnAt)
  const intro = t('email.withdrawalReceipt.intro', { plan, at })
  const next = t('email.withdrawalReceipt.next')
  return {
    to: email,
    subject: t('email.withdrawalReceipt.subject', { plan }),
    blocks: [{ paragraph: intro }, { paragraph: next }],
    text: `${intro}\n\n${next}`,
    preheader: intro,
  }
}
