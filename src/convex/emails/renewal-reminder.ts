import type { EmailMessage, EmailRenderContext, RenewalReminderEmailData } from '../email-templates.js'
import { linkBlocks } from '../email-helpers.js'

/** The `renewalReminder` email: the plan renews on this date at this price, and the link where it is managed or cancelled. */
export function renewalReminder({ email, plan, amount, currency, interval, intervalCount, renewsAt, manageUrl }: RenewalReminderEmailData, context: EmailRenderContext): EmailMessage {
  const { t } = context
  const date = new Intl.DateTimeFormat(context.locale, { dateStyle: 'long', timeZone: 'UTC' }).format(renewsAt)
  const code = currency.toUpperCase() || 'USD'
  // The amount is in the currency's smallest unit: as many digits as the currency writes (2 for USD, 0 for JPY).
  const format = new Intl.NumberFormat(context.locale, { style: 'currency', currency: code })
  const price = format.format(amount / 10 ** (format.resolvedOptions().maximumFractionDigits ?? 2))
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
