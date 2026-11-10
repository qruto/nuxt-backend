// Money as the billing provider states it: an integer in the currency's
// smallest unit. The provider counts every currency in hundredths except a
// fixed few: the ones it counts in whole units (JPY, KRW) and the dinars
// its payment processor counts in thousandths (KWD, BHD). Shared by the
// pages, which format prices, and the emails, which state them.
//
// A fixed table, never `Intl`'s digits: the CLDR data behind `Intl` writes
// HUF, ISK, IDR, COP and PKR with no decimals while the provider still
// states them in hundredths (a 5 000 Ft plan arrives as 500000), and it
// differs between ICU versions, so the server, the Convex runtime and each
// browser could disagree. The lists are Polar's own
// (`get_currency_decimal_factor` in its `server/polar/kit/currency.py`):
// Stripe's zero-decimal currencies but UGX, which Stripe still takes in
// hundredths, as it does ISK; and Stripe's three-decimal currencies
// (docs.stripe.com/currencies), none of which Polar sells yet. The renewal
// reminder email restates them, since an ejected email imports only from
// `nuxt-backend/email`; test/unit/billing-money.test.ts holds the two
// together.

/** The currencies the provider states in whole units: `1500` JPY is ¥1,500. */
const WHOLE_UNITS = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'])

/** The currencies stated in thousandths: `1999` KWD is 1.999 KWD. */
const THOUSANDTHS = new Set(['BHD', 'JOD', 'KWD', 'OMR', 'TND'])

/**
 * How many digits below its main unit the provider states `currency`
 * (ISO 4217, either case) in: 2 for USD, EUR, HUF and ISK, 0 for JPY and
 * KRW, 3 for KWD. Any other code counts as 2, the provider's own default.
 * The same answer on every runtime: it reads no locale data.
 */
export function minorUnitDigits(currency: string): number {
  const code = currency.toUpperCase()
  return WHOLE_UNITS.has(code) ? 0 : THOUSANDTHS.has(code) ? 3 : 2
}

/** An amount in `currency`'s smallest unit, in its main one: 1999 USD cents are 19.99, 1999 JPY are 1999, 500000 HUF are 5000. */
export function toMajorUnits(amount: number, currency: string): number {
  return amount / 10 ** minorUnitDigits(currency)
}
