import type { EmailMessage, EmailRenderContext, PasskeyRecoveredEmailData } from '../email-templates.js'
import { describeOrigin, linkBlocks } from '../email-helpers.js'

/**
 * The `passkeyRecovered` email: a passkey-only account's recovery code
 * signed in, from where, and the link to the security page that signs
 * every other device out.
 */
export function passkeyRecovered({ email, requestedFrom, url }: PasskeyRecoveredEmailData, context: EmailRenderContext): EmailMessage {
  const { t } = context
  const origin = requestedFrom ? ` ${describeOrigin(requestedFrom, context)}` : ''
  const intro = `${t('email.passkeyRecovered.intro')}${origin} ${t('email.passkeyRecovered.warning')}`
  const link = context.link(url)
  return {
    to: email,
    subject: t('email.passkeyRecovered.subject'),
    blocks: [{ paragraph: intro }, ...linkBlocks(link, t('email.passkeyRecovered.action'), context)],
    text: `${intro}\n\n${link}`,
    preheader: intro,
  }
}
