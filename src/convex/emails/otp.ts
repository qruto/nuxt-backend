import type { EmailBlock, EmailMessage, EmailRenderContext, OtpEmailData } from '../email-templates.js'
import { describeOrigin } from '../email-helpers.js'

/**
 * The `otp` email: a one-time code, its purpose in the subject, who asked
 * for it, and when it expires. A passkey-only account gets no code, only
 * the way back in; the first code of an email change warns about a change
 * nobody asked for. The code stays out of the preheader, which a locked
 * screen shows.
 */
export function otp({ email, otp, type, reason, requestedFrom }: OtpEmailData, context: EmailRenderContext): EmailMessage {
  const { t } = context
  // Who asked: the device, an approximate place and the time.
  const origin = requestedFrom ? describeOrigin(requestedFrom, context) : ''
  const originText = origin ? `\n\n${origin}` : ''
  const originBlocks: EmailBlock[] = origin ? [{ note: origin }] : []
  if (reason === 'passkey-only') {
    const intro = t('email.otp.passkeyOnly.intro')
    const recover = t('email.otp.passkeyOnly.recover')
    return {
      to: email,
      subject: t('email.otp.passkeyOnly.subject'),
      blocks: [{ paragraph: intro }, { paragraph: recover }, ...originBlocks],
      text: `${intro}\n\n${recover}${originText}`,
      preheader: intro,
    }
  }
  if (reason === 'email-change') {
    const intro = t('email.otp.emailChange.intro')
    const warning = t('email.otp.emailChange.warning')
    return {
      to: email,
      subject: t('email.otp.emailChange.subject'),
      blocks: [{ paragraph: intro }, { code: otp }, ...originBlocks, { note: warning }],
      text: `${intro}\n\n${otp}${originText}\n\n${warning}`,
      preheader: intro,
    }
  }
  const subject = t(`email.otp.subject.${type}`)
  const expiry = t('email.otp.expiry')
  return {
    to: email,
    subject,
    blocks: [{ paragraph: `${subject}:` }, { code: otp }, ...originBlocks, { note: expiry }],
    text: `${subject}: ${otp}${originText}\n\n${expiry}`,
    preheader: subject,
  }
}
