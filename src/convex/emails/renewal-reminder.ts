import type { EmailMessage, EmailRenderContext, RenewalReminderEmailData } from '../email-templates.js'
import { linkBlocks } from '../email-helpers.js'

// The amount arrives in the currency's smallest unit, as the provider
// states it: hundredths, but for the currencies it counts in whole units
// and the ones counted in thousandths. These are money.ts's lists (an
// ejected email imports only from nuxt-backend/email, so it cannot import
// them), and test/unit/billing-money.test.ts holds the two together.
const WHOLE_UNITS = 'BIF CLP DJF GNF JPY KMF KRW MGA PYG RWF VND VUV XAF XOF XPF'.split(' ')
const THOUSANDTHS = 'BHD JOD KWD OMR TND'.split(' ')

/** How many digits below its main unit `code` is stated in: 2 for USD and HUF, 0 for JPY, 3 for KWD. */
function minorUnitDigits(code: string): number {
  return WHOLE_UNITS.includes(code) ? 0 : THOUSANDTHS.includes(code) ? 3 : 2
}

/** The `renewalReminder` email: the plan renews on this date at this price, and the link where it is managed or cancelled. */
export function renewalReminder({ email, plan, amount, currency, interval, intervalCount, renewsAt, manageUrl }: RenewalReminderEmailData, context: EmailRenderContext): EmailMessage {
  const { t } = context
  const date = new Intl.DateTimeFormat(context.locale, { dateStyle: 'long', timeZone: 'UTC' }).format(renewsAt)
  const code = currency.toUpperCase() || 'USD'
  const price = new Intl.NumberFormat(context.locale, { style: 'currency', currency: code }).format(amount / 10 ** minorUnitDigits(code))
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
