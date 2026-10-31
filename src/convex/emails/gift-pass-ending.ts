import type { EmailMessage, EmailRenderContext, GiftPassEndingEmailData } from '../email-templates.js'
import { linkBlocks } from '../email-helpers.js'

/** The `giftPassEnding` email: the plan a pass holds ends on this date, and the link that keeps it with an ordinary checkout. */
export function giftPassEnding({ email, plan, workspace, endsAt, keepUrl, trial }: GiftPassEndingEmailData, context: EmailRenderContext): EmailMessage {
  const { t } = context
  const date = new Date(endsAt).toLocaleDateString(context.locale, { dateStyle: 'long' })
  // A reverse trial's pass was nobody's gift: it says the trial ends.
  const intro = t(trial ? 'email.giftPassEnding.trialIntro' : 'email.giftPassEnding.intro', { plan, date, workspace: workspace || t('email.giftPassEnding.workspace') })
  const link = context.link(keepUrl)
  return {
    to: email,
    subject: t('email.giftPassEnding.subject', { plan, date }),
    blocks: [{ paragraph: intro }, ...linkBlocks(link, t('email.giftPassEnding.action', { plan }), context)],
    text: `${intro}\n\n${link}`,
    preheader: intro,
  }
}
