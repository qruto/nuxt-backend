import { describe, expect, it } from 'vitest'
import { minorUnitDigits, toMajorUnits } from '../../src/convex/money'
import { formatBillingAmount, formatUnitPrice } from '../../src/runtime/vue/composables/billing-format'
import { renewalReminder } from '../../src/convex/emails/renewal-reminder'
import type { EmailRenderContext } from '../../src/convex/email-templates'

// Money the provider states as an integer in the currency's smallest unit:
// cents for USD and EUR, the yen itself for JPY, a fils (a thousandth) for
// KWD. A price formats, and an email states it, by the currency's own
// digits, never by a fixed hundred.

describe('the minor unit of a currency', () => {
  it('has the currency\'s own digits: two for USD and EUR, none for JPY, three for KWD', () => {
    expect(minorUnitDigits('usd')).toBe(2)
    expect(minorUnitDigits('EUR')).toBe(2)
    expect(minorUnitDigits('jpy')).toBe(0)
    expect(minorUnitDigits('kwd')).toBe(3)
  })

  it('counts two digits for a code Intl does not know', () => {
    expect(minorUnitDigits('not-a-code')).toBe(2)
  })

  it('turns an amount into the main unit by those digits', () => {
    expect(toMajorUnits(1999, 'usd')).toBe(19.99)
    expect(toMajorUnits(1999, 'eur')).toBe(19.99)
    expect(toMajorUnits(1999, 'jpy')).toBe(1999)
    expect(toMajorUnits(1999, 'kwd')).toBe(1.999)
  })
})

describe('formatBillingAmount', () => {
  it('formats USD and EUR from cents, a whole amount without decimals', () => {
    expect(formatBillingAmount(1999, 'usd', 'en-US')).toBe('$19.99')
    expect(formatBillingAmount(2000, 'usd', 'en-US')).toBe('$20')
    expect(formatBillingAmount(1950, 'eur', 'en-US')).toBe('€19.50')
    expect(formatBillingAmount(1999, 'eur', 'de-DE')).toBe('19,99 €')
  })

  it('formats JPY from the yen itself: no hundredfold shrink, no decimals', () => {
    expect(formatBillingAmount(1500, 'jpy', 'en-US')).toBe('¥1,500')
    expect(formatBillingAmount(1500, 'JPY', 'ja-JP')).toBe('￥1,500')
  })

  it('counts cents without a currency, and falls back to the bare amount for an unknown one', () => {
    expect(formatBillingAmount(1999)).toBe('19.99')
    expect(formatBillingAmount(2000)).toBe('20')
    expect(formatBillingAmount(1999, 'not-a-code')).toBe('19.99')
  })
})

describe('formatUnitPrice', () => {
  it('shows a share of the smallest unit, two digits past the currency\'s own', () => {
    expect(formatUnitPrice(1.25, 'usd', 'en-US')).toBe('$0.0125')
    expect(formatUnitPrice(8, 'usd', 'en-US')).toBe('$0.08')
    expect(formatUnitPrice(1.25, 'jpy', 'en-US')).toBe('¥1.25')
    expect(formatUnitPrice(3, 'jpy', 'en-US')).toBe('¥3')
  })
})

describe('the renewal reminder\'s price', () => {
  const context = { locale: 'en-US', t: (key: string, params: Record<string, unknown> = {}) => `${key} ${JSON.stringify(params)}`, link: (url: string) => url } as unknown as EmailRenderContext
  const data = (amount: number, currency: string) => ({ email: 'a@example.com', plan: 'Pro', amount, currency, interval: 'year', intervalCount: 1, renewsAt: Date.UTC(2027, 0, 1), manageUrl: 'https://example.com/settings' })

  it('states USD from cents and JPY from the yen', () => {
    expect(renewalReminder(data(9900, 'usd') as never, context).text).toContain('"price":"$99.00"')
    expect(renewalReminder(data(9900, 'jpy') as never, context).text).toContain('"price":"¥9,900"')
  })
})
