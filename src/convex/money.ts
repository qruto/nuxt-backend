// Money as the billing provider states it: an integer in the currency's
// smallest unit. Most currencies have two digits after the point (cents),
// but not all: JPY and KRW have none, KWD and BHD three. Shared by the
// pages, which format prices, and the emails, which state them.

const DIGITS = new Map<string, number>()

/**
 * How many digits after the point `currency` (ISO 4217, either case) is
 * written with, which is also how many its smallest unit is below its main
 * one: 2 for USD and EUR, 0 for JPY, 3 for KWD. A code `Intl` does not know
 * counts as 2, the provider's own default.
 */
export function minorUnitDigits(currency: string): number {
  const code = currency.toUpperCase()
  const known = DIGITS.get(code)
  if (known !== undefined) return known
  let digits = 2
  try {
    digits = new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? 2
  }
  catch {
    // Not a currency code `Intl` knows: two digits, as the provider assumes.
  }
  DIGITS.set(code, digits)
  return digits
}

/** An amount in `currency`'s smallest unit, in its main one: 1999 USD cents are 19.99, 1999 JPY are 1999. */
export function toMajorUnits(amount: number, currency: string): number {
  return amount / 10 ** minorUnitDigits(currency)
}
