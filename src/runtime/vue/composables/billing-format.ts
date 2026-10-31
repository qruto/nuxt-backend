// Billing values as the provider sends them, made displayable: timestamps
// that arrive as ISO strings or epoch numbers, and minor-unit money.

import { inLocale } from '../utils/intl'

/**
 * Provider timestamps reach the client as ISO strings (the component's cache
 * stores them that way) but as epoch numbers when an action forwards the SDK's
 * `Date` through Convex's JSON wire. Accept both, and never hand a component an
 * `Invalid Date`.
 */
export function toBillingDate(value: unknown): Date | null {
  if (value == null) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Money the way the provider states it — a minor-unit integer plus an ISO
 * currency code — rendered in `locale` (the active `@nuxtjs/i18n` locale a
 * component passes), else the visitor's own. Unknown currency codes fall back
 * to the bare amount rather than throwing mid-render.
 */
export function formatBillingAmount(amount: number, currency?: string | null, locale?: string): string {
  const value = amount / 100
  if (currency) {
    try {
      return inLocale(locale, tag => new Intl.NumberFormat(tag, {
        style: 'currency',
        currency,
        maximumFractionDigits: value % 1 ? 2 : 0,
      }).format(value))
    }
    catch {
      // Unknown currency code — fall through to the bare amount.
    }
  }
  return value % 1 ? value.toFixed(2) : String(value)
}

/**
 * A price per unit — one credit's share of a pack, a fraction of a cent —
 * in minor units, with as many decimals as it takes (up to four) to tell
 * two packs apart.
 *
 * @internal
 */
export function formatUnitPrice(amount: number, currency: string, locale?: string): string {
  const value = amount / 100
  try {
    return inLocale(locale, tag => new Intl.NumberFormat(tag, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value))
  }
  catch {
    return value.toFixed(4).replace(/0{1,2}$/, '')
  }
}

/**
 * A provider timestamp the way the active locale (else the visitor) writes
 * it: the raw string if it will not parse, and its ISO form if `Intl`
 * cannot format it at all (the date alone when `options` show no time).
 *
 * @internal
 */
export function formatBillingDate(value: unknown, options: Intl.DateTimeFormatOptions, locale?: string): string {
  const date = toBillingDate(value)
  if (!date) return typeof value === 'string' ? value : ''
  try {
    return inLocale(locale, tag => new Intl.DateTimeFormat(tag, options).format(date))
  }
  catch {
    const iso = date.toISOString()
    return options.timeStyle ? iso : iso.slice(0, 10)
  }
}
