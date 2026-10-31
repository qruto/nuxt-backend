import type { EmailMessage, EmailRenderContext, NewDeviceEmailData } from '../email-templates.js'
import { describeOrigin, linkBlocks } from '../email-helpers.js'

/**
 * The `newDevice` email: the account signed in from a device it had not
 * used before, which device, from where and when, and the link to the
 * security page, where the person signs that device out.
 */
export function newDevice({ email, requestedFrom, url }: NewDeviceEmailData, context: EmailRenderContext): EmailMessage {
  const { t } = context
  const origin = requestedFrom ? ` ${describeOrigin(requestedFrom, context)}` : ''
  const intro = `${t('email.newDevice.intro')}${origin} ${t('email.newDevice.warning')}`
  const link = context.link(url)
  return {
    to: email,
    subject: t('email.newDevice.subject'),
    blocks: [{ paragraph: intro }, ...linkBlocks(link, t('email.newDevice.action'), context)],
    text: `${intro}\n\n${link}`,
    preheader: intro,
  }
}
