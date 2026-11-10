import { describe, expect, it } from 'vitest'
import { PresentmentCurrency } from '@polar-sh/sdk/models/components/presentmentcurrency.js'
import { minorUnitDigits, toMajorUnits } from '../../src/convex/money'
import { formatBillingAmount, formatBillingDate, formatUnitPrice } from '../../src/runtime/vue/composables/billing-format'
import { inRuntimeLocale } from '../helpers/runtime-locale'
import { renewalReminder } from '../../src/convex/emails/renewal-reminder'
import type { EmailRenderContext } from '../../src/convex/email-templates'

// Money the provider states as an integer in the currency's smallest unit:
// cents for USD and EUR, hundredths for HUF and ISK too, the yen itself for
// JPY, a fils (a thousandth) for KWD. A price formats, and an email states
// it, by the provider's digits for the currency: never a fixed hundred,
// and never the digits `Intl` writes it with, which say none for HUF and
// ISK and differ between ICU versions.

describe('the minor unit of a currency', () => {
  it('has the currency\'s own digits: two for USD and EUR, none for JPY, three for KWD', () => {
    expect(minorUnitDigits('usd')).toBe(2)
    expect(minorUnitDigits('EUR')).toBe(2)
    expect(minorUnitDigits('jpy')).toBe(0)
    expect(minorUnitDigits('kwd')).toBe(3)
  })

  it('counts hundredths for HUF, ISK, IDR, COP, PKR, UGX and TWD, which Intl writes with fewer digits', () => {
    for (const code of ['huf', 'isk', 'idr', 'cop', 'pkr', 'ugx', 'twd']) expect(minorUnitDigits(code), code).toBe(2)
    expect(minorUnitDigits('krw')).toBe(0)
  })

  it('counts two digits for a code it does not list, without asking Intl', () => {
    expect(minorUnitDigits('not-a-code')).toBe(2)
    const original = Intl.NumberFormat
    Intl.NumberFormat = (() => {
      throw new Error('read no locale data')
    }) as unknown as typeof Intl.NumberFormat
    try {
      expect([minorUnitDigits('usd'), minorUnitDigits('jpy'), minorUnitDigits('kwd')]).toEqual([2, 0, 3])
    }
    finally {
      Intl.NumberFormat = original
    }
  })

  it('turns an amount into the main unit by those digits', () => {
    expect(toMajorUnits(1999, 'usd')).toBe(19.99)
    expect(toMajorUnits(1999, 'eur')).toBe(19.99)
    expect(toMajorUnits(1999, 'jpy')).toBe(1999)
    expect(toMajorUnits(1999, 'kwd')).toBe(1.999)
    expect(toMajorUnits(500000, 'huf')).toBe(5000)
    expect(toMajorUnits(70000, 'isk')).toBe(700)
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

  it('formats HUF and ISK from hundredths: a 5 000 Ft plan is never 500 000 Ft', () => {
    expect(formatBillingAmount(500000, 'huf', 'en-US')).toBe('HUF\u00A05,000')
    expect(formatBillingAmount(500000, 'huf', 'hu-HU')).toBe('5000\u00A0Ft')
    expect(formatBillingAmount(500050, 'huf', 'en-US')).toBe('HUF\u00A05,000.5')
    expect(formatBillingAmount(70000, 'isk', 'en-US')).toBe('ISK\u00A0700')
  })

  it('counts cents without a currency, and falls back to the bare amount for an unknown one', () => {
    expect(formatBillingAmount(1999)).toBe('19.99')
    expect(formatBillingAmount(2000)).toBe('20')
    expect(formatBillingAmount(1999, 'not-a-code')).toBe('19.99')
  })
})

describe('money and dates without a locale', () => {
  // A server render and the browser run under different runtime defaults:
  // with no locale named (no @nuxtjs/i18n), both format in the package's
  // English, never in either default.
  const strings = () => [
    formatBillingAmount(123456, 'usd'),
    formatUnitPrice(5, 'usd'),
    formatBillingDate(Date.parse('2027-02-01T12:00:00Z'), { dateStyle: 'medium', timeZone: 'UTC' }),
  ]

  it('read the same on a server and in a browser whose default locales differ', async () => {
    const server = await inRuntimeLocale('en-US', strings)
    const browser = await inRuntimeLocale('de-DE', strings)
    expect(browser).toEqual(server)
    expect(server).toEqual(['$1,234.56', '$0.05', 'Feb 1, 2027'])
  })

  it('still format in the locale named, and in English for one Intl refuses', async () => {
    await inRuntimeLocale('en-US', () => {
      expect(formatBillingAmount(123456, 'eur', 'de-DE')).toBe('1.234,56\u00A0€')
      expect(formatBillingDate(Date.parse('2027-02-01T12:00:00Z'), { dateStyle: 'medium', timeZone: 'UTC' }, 'fr')).toBe('1 févr. 2027')
    })
    await inRuntimeLocale('de-DE', () => {
      expect(formatBillingAmount(123456, 'usd', 'not a tag')).toBe('$1,234.56')
    })
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

  it('states HUF and ISK from hundredths', () => {
    expect(renewalReminder(data(500000, 'huf') as never, context).text).toContain('"price":"HUF\u00A05,000"')
    expect(renewalReminder(data(70000, 'isk') as never, context).text).toContain('"price":"ISK\u00A0700"')
  })

  // The email restates money.ts's lists (an ejected copy imports only from
  // nuxt-backend/email): for every currency the provider sells, and the
  // three-decimal ones it may add, the two read an amount alike.
  it('reads every currency the provider sells as money.ts does', () => {
    const codes = [...Object.values(PresentmentCurrency), 'bhd', 'jod', 'kwd', 'omr', 'tnd']
    expect(codes).toEqual(expect.arrayContaining(['usd', 'huf', 'isk', 'jpy', 'ugx']))
    for (const code of codes) {
      const expected = new Intl.NumberFormat('en-US', { style: 'currency', currency: code.toUpperCase() }).format(toMajorUnits(123400, code))
      expect(renewalReminder(data(123400, code) as never, context).text, code).toContain(`"price":"${expected}"`)
    }
  })
})
