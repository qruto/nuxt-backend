import type { AppealDecidedEmailData, EmailMessage, EmailRenderContext } from '../email-templates.js'

/** The `appealDecided` email: the outcome of an appeal against a decision on the person's content (DSA Art. 20(5)), and why. */
export function appealDecided({ email, title, outcome, reason }: AppealDecidedEmailData, context: EmailRenderContext): EmailMessage {
  const { t } = context
  const intro = t(outcome === 'reversed' ? 'email.appealDecided.reversed' : 'email.appealDecided.upheld', { title })
  const why = t('email.appealDecided.reason', { reason })
  const redress = t('email.appealDecided.redress')
  return {
    to: email,
    subject: t('email.appealDecided.subject'),
    blocks: [{ paragraph: intro }, { paragraph: why }, { note: redress }],
    text: `${intro}\n\n${why}\n\n${redress}`,
    preheader: intro,
  }
}
