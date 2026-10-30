import type { BillingContext } from './context.js'
import type { BillingCatalogDiscount, PricedOffer, PricedPromotion } from './types/records.js'
import { backendError } from '../../errors.js'

// The catalog's promotions at runtime: a discount by its catalog key, with
// the terms `billing sync` left it with at the provider (the generated map
// holds them; no provider call reads them). Checkout applies one by key,
// `applyDiscount` puts one on a subscription, and `getPricing` shows a
// public one. The provider stays the judge of whether it is redeemable:
// its dates, its caps and its per-customer limit are checked when it is
// applied, never here.

/** A catalog discount with its key. */
export type KeyedDiscount = BillingCatalogDiscount & { key: string }

/**
 * Whether a provider refusal is of a discount it was asked to apply: its
 * validation answer names `discount_id` (ended, not started, used up, not
 * for this product or currency).
 */
export function refusedDiscount(error: unknown): boolean {
  const detail = (error as { detail?: unknown } | null)?.detail
  return Array.isArray(detail) && detail.some(entry => Array.isArray((entry as { loc?: unknown } | null)?.loc) && (entry as { loc: unknown[] }).loc.includes('discount_id'))
}

/** What one payment of `amount` in `currency` costs with a discount; `undefined` when it takes nothing off there. */
export function offerOf(discount: BillingCatalogDiscount, amount: number, currency: string): PricedOffer | undefined {
  const off = discount.percentOff !== undefined
    ? Math.round(amount * discount.percentOff / 100)
    : discount.amountOff?.[currency.toLowerCase()]
  if (off === undefined || off <= 0 || amount <= 0) return undefined
  const taken = Math.min(amount, off)
  return { amount: amount - taken, off: taken }
}

/** A public promotion's terms as a pricing page shows them: never its code. */
export function promotionOf(discount: KeyedDiscount): PricedPromotion {
  return {
    key: discount.key,
    name: discount.name,
    ...(discount.percentOff === undefined ? {} : { percentOff: discount.percentOff }),
    duration: discount.duration,
    ...(discount.months === undefined ? {} : { months: discount.months }),
    ...(discount.startsAt ? { startsAt: discount.startsAt } : {}),
    ...(discount.endsAt ? { endsAt: discount.endsAt } : {}),
  }
}

/** The catalog discounts of one `setupBilling` call. */
export function createCatalogDiscounts({ catalogIds }: Pick<BillingContext, 'catalogIds'>) {
  const discounts = catalogIds?.discounts ?? {}

  /** A catalog discount by its key, or `undefined`. */
  const discountOf = (key: string): KeyedDiscount | undefined =>
    Object.hasOwn(discounts, key) ? { key, ...discounts[key]! } : undefined

  /**
   * The discount a checkout names by key, for products it applies to.
   * A client may name only a public one (with a code): any other key is
   * refused the same way as one the catalog does not have, so a client
   * learns nothing of the server's own. Server code may name any.
   */
  const requireDiscount = (key: string, productIds: readonly string[], { client }: { client: boolean }): KeyedDiscount => {
    const found = discountOf(key)
    if (!found || (client && !found.code)) {
      throw backendError(
        'invalid_input',
        { field: 'discount' },
        client
          ? '[nuxt-backend] Billing: `discount` names no public promotion of the catalog (a discount with a `code`).'
          : '[nuxt-backend] Billing: `discount` names no discount of the catalog — declare it in billing.catalog.ts and run `npx nuxt-backend billing sync`.',
      )
    }
    if (!productIds.some(id => found.productIds.includes(id))) {
      throw backendError('invalid_input', { field: 'discount' }, `[nuxt-backend] Billing: discount '${key}' applies to none of this checkout's products.`)
    }
    return found
  }

  /**
   * The public promotion a page names: by its key, or by its code, as a
   * campaign link carries it (letter case aside). `undefined` for anything
   * else, a discount only the server applies included.
   */
  const promotionNamed = (name: string): KeyedDiscount | undefined => {
    const byKey = discountOf(name)
    if (byKey?.code) return byKey
    const code = name.trim().toLowerCase()
    const key = Object.keys(discounts).find(entry => discounts[entry]!.code?.toLowerCase() === code)
    return key === undefined ? undefined : discountOf(key)
  }

  return { discountOf, requireDiscount, promotionNamed }
}

export type CatalogDiscounts = ReturnType<typeof createCatalogDiscounts>
