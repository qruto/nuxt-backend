import type { EmailMessage, EmailRenderContext, GiftEmailData } from '../email-templates.js'
import { linkBlocks } from '../email-helpers.js'

/** The `gift` email: who sent what, and the link where the recipient signs in to claim it. It names neither the purchaser's address nor their message. */
export function gift({ recipientEmail, purchaserName, item, months, claimUrl, reminder }: GiftEmailData, context: EmailRenderContext): EmailMessage {
  const { t } = context
  const sender = purchaserName || t('email.gift.sender')
  const what = months === undefined ? item : t('email.gift.itemPass', { count: months, plan: item })
  const intro = reminder ? t('email.gift.reminderIntro', { sender, item: what }) : t('email.gift.intro', { sender, item: what })
  const link = context.link(claimUrl)
  return {
    to: recipientEmail,
    subject: reminder ? t('email.gift.reminderSubject', { sender }) : t('email.gift.subject', { sender }),
    blocks: [{ paragraph: intro }, ...linkBlocks(link, t('email.gift.action'), context)],
    text: `${intro}\n\n${link}`,
    preheader: intro,
  }
}
