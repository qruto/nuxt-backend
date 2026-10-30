import type { EmailMessage, EmailRenderContext, RenewalReminderEmailData } from '../email-templates.js'
import { linkBlocks } from '../email-helpers.js'

/** The `renewalReminder` email: the plan renews on this date at this price, and the link where it is managed or cancelled. */
export function renewalReminder({ email, plan, amount, currency, interval, intervalCount, renewsAt, manageUrl }: RenewalReminderEmailData, context: EmailRenderContext): EmailMessage {
  const { t } = context
  const date = new Intl.DateTimeFormat(context.locale, { dateStyle: 'long', timeZone: 'UTC' }).format(renewsAt)
  const price = new Intl.NumberFormat(context.locale, { style: 'currency', currency: currency.toUpperCase() || 'USD' }).format(amount / 100)
  const every = t(`email.renewalReminder.every.${interval === 'day' || interval === 'week' ? interval : 'month'}`, { count: intervalCount })
  const intro = t('email.renewalReminder.intro', { plan, price, every, date })
  const cancel = t('email.renewalReminder.cancel')
  const link = context.link(manageUrl)
  return {
    to: email,
    subject: t('email.renewalReminder.subject', { plan }),
    blocks: [{ paragraph: intro }, { paragraph: cancel }, ...linkBlocks(link, t('email.renewalReminder.action'), context)],
    text: `${intro}\n\n${cancel}\n\n${link}`,
    preheader: intro,
  }
}
