import type { ContentRestrictedEmailData, EmailMessage, EmailRenderContext } from '../email-templates.js'
import { linkBlocks } from '../email-helpers.js'

/**
 * The `contentRestricted` email: the statement of reasons to the person
 * whose content was hidden (DSA Art. 17): what was restricted, the facts,
 * whether a notice led to it, that a person decided it, the ground, and how
 * to challenge it, with the appeal link.
 */
export function contentRestricted({ email, title, reason, ground, notice, appealUrl, appealUntil }: ContentRestrictedEmailData, context: EmailRenderContext): EmailMessage {
  const { t } = context
  const intro = t('email.contentRestricted.intro', { title })
  const why = t('email.contentRestricted.reason', { reason })
  const basis = t(notice ? 'email.contentRestricted.notice' : 'email.contentRestricted.reports')
  const grounds = t(ground === 'illegal' ? 'email.contentRestricted.illegal' : 'email.contentRestricted.terms')
  const person = t('email.contentRestricted.person')
  const date = new Intl.DateTimeFormat(context.locale, { dateStyle: 'long', timeZone: 'UTC' }).format(appealUntil)
  const appeal = t('email.contentRestricted.appeal', { date })
  const redress = t('email.contentRestricted.redress')
  const link = context.link(appealUrl)
  const facts = [why, basis, grounds, person].join(' ')
  return {
    to: email,
    subject: t('email.contentRestricted.subject'),
    blocks: [{ paragraph: intro }, { paragraph: facts }, { paragraph: appeal }, ...linkBlocks(link, t('email.contentRestricted.action'), context), { note: redress }],
    text: `${intro}\n\n${facts}\n\n${appeal}\n${link}\n\n${redress}`,
    preheader: intro,
  }
}
