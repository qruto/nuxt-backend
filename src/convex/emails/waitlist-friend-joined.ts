import type { EmailMessage, EmailRenderContext, WaitlistFriendJoinedEmailData } from '../email-templates.js'
import { linkBlocks } from '../email-helpers.js'

/**
 * The `waitlistFriendJoined` email: a friend joined with the person's link,
 * how many have so far, and the link that shows their place. The labels get
 * `count` (the friends), `days` and `weeks` (the credit they earned), so an
 * app can say it in its own unit.
 */
export function waitlistFriendJoined({ email, statusUrl, friends, days }: WaitlistFriendJoinedEmailData, context: EmailRenderContext): EmailMessage {
  const { t } = context
  const params = { count: friends, days, weeks: Math.floor(days / 7) }
  const intro = t('email.waitlistFriendJoined.intro', params)
  const note = t('email.waitlistFriendJoined.note', params)
  const link = context.link(statusUrl)
  return {
    to: email,
    subject: t('email.waitlistFriendJoined.subject', params),
    blocks: [{ paragraph: intro }, { paragraph: note }, ...linkBlocks(link, t('email.waitlistFriendJoined.action'), context)],
    text: `${intro}\n\n${note}\n\n${link}`,
    preheader: intro,
  }
}
