import type { DeletionCanceledEmailData, EmailMessage, EmailRenderContext } from '../email-templates.js'

/** The `deletionCanceled` email: the scheduled deletion is cancelled, and the account stays. */
export function deletionCanceled({ email }: DeletionCanceledEmailData, context: EmailRenderContext): EmailMessage {
  const { t } = context
  const body = t('email.deletionCanceled.body')
  return { to: email, subject: t('email.deletionCanceled.subject'), blocks: [{ paragraph: body }], preheader: body }
}
