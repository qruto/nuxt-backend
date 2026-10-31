import { normalizeLocale, preferredLocale } from '../../../convex/locale.js'

// The visitor's currency, as a pricing page guesses it before they choose:
// the country the request comes from (the platform's geo header), else the
// region of the language they read the app in, else of the one their
// browser asks for first. Only a guess to start from — the catalog's own
// currency stands in for one it does not price, and the visitor's own
// choice wins over it.

/** The countries that pay in euros. */
const EURO = ['AD', 'AT', 'BE', 'BG', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MC', 'ME', 'MT', 'NL', 'PT', 'SI', 'SK', 'SM', 'VA', 'XK']

/** Country (ISO 3166-1 alpha-2) → currency (lower-case ISO 4217), for the countries with a currency of their own. */
const CURRENCY_BY_COUNTRY: Readonly<Record<string, string>> = {
  ...Object.fromEntries(EURO.map(country => [country, 'eur'])),
  AE: 'aed', AR: 'ars', AU: 'aud', BR: 'brl', CA: 'cad', CH: 'chf', CL: 'clp', CN: 'cny', CO: 'cop', CZ: 'czk',
  DK: 'dkk', EG: 'egp', GB: 'gbp', HK: 'hkd', HU: 'huf', ID: 'idr', IL: 'ils', IN: 'inr', IS: 'isk', JP: 'jpy',
  KE: 'kes', KR: 'krw', LI: 'chf', MX: 'mxn', MY: 'myr', NG: 'ngn', NO: 'nok', NZ: 'nzd', PE: 'pen', PH: 'php',
  PL: 'pln', RO: 'ron', SA: 'sar', SE: 'sek', SG: 'sgd', TH: 'thb', TR: 'try', TW: 'twd', UA: 'uah', US: 'usd',
  VN: 'vnd', ZA: 'zar',
}

/** The currency a country pays in, lower-case ISO 4217; `undefined` for one the table does not know. */
export function currencyOfCountry(country: string | null | undefined): string | undefined {
  const code = country?.trim().toUpperCase()
  return code && Object.hasOwn(CURRENCY_BY_COUNTRY, code) ? CURRENCY_BY_COUNTRY[code] : undefined
}

/** The country a locale names (`de-AT` → `AT`, `zh-Hant-TW` → `TW`), read as the package reads every locale. */
function regionOf(locale: string | null | undefined): string | undefined {
  return normalizeLocale(locale)?.split('-').slice(1).find(part => /^[A-Z]{2}$/.test(part))
}

/**
 * The visitor's currency from their request: the platform's country header
 * (`x-vercel-ip-country`, `cf-ipcountry`), else the region of the app's
 * active language (`locale`, `@nuxtjs/i18n`'s), else of the language
 * their browser weighs highest (`Accept-Language`). `undefined` when none
 * of them names a country the table knows.
 *
 * @internal
 */
export function visitorCurrency(headers: Readonly<Record<string, string | undefined>>, locale?: string): string | undefined {
  return currencyOfCountry(headers['x-vercel-ip-country'] ?? headers['cf-ipcountry'])
    ?? currencyOfCountry(regionOf(locale))
    ?? currencyOfCountry(regionOf(preferredLocale(headers['accept-language'])))
}

/** A currency as an ISO 4217 code reads: three letters, lower-cased; `undefined` for anything else. */
export function currencyCode(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-z]{3}$/i.test(value.trim()) ? value.trim().toLowerCase() : undefined
}
