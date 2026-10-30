import type { EmailMessage, EmailRenderContext, WaitlistAdmittedEmailData } from '../email-templates.js'
import { linkBlocks } from '../email-helpers.js'

/** The `waitlistAdmitted` email: a plain "You're in", and the link to sign up with the address the person joined with. */
export function waitlistAdmitted({ email, signInUrl }: WaitlistAdmittedEmailData, context: EmailRenderContext): EmailMessage {
  const { t } = context
  const intro = t('email.waitlistAdmitted.intro')
  const link = context.link(signInUrl)
  return {
    to: email,
    subject: t('email.waitlistAdmitted.subject'),
    blocks: [{ paragraph: intro }, ...linkBlocks(link, t('email.waitlistAdmitted.action'), context)],
    text: `${intro}\n\n${link}`,
    preheader: intro,
  }
}
