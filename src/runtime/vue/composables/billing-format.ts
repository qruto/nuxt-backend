// Billing values as the provider sends them, made displayable: timestamps
// that arrive as ISO strings or epoch numbers, and minor-unit money.

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
 * currency code — rendered in the visitor's own locale. Unknown currency codes
 * fall back to the bare amount rather than throwing mid-render.
 */
export function formatBillingAmount(amount: number, currency?: string | null): string {
  const value = amount / 100
  if (currency) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        maximumFractionDigits: value % 1 ? 2 : 0,
      }).format(value)
    }
    catch {
      // Unknown currency code — fall through to the bare amount.
    }
  }
  return value % 1 ? value.toFixed(2) : String(value)
}
