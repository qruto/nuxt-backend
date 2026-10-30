import type { Polar } from '@polar-sh/sdk'
import { productsUpdate } from '@polar-sh/sdk/funcs/productsUpdate.js'
import { productsUpdateBenefits } from '@polar-sh/sdk/funcs/productsUpdateBenefits.js'
import type { BillingCatalog } from '../../convex/catalog'
import { missingCurrencyPrices } from './objects'
import { isManaged, type CatalogIds, type SyncLogEntry } from './provider'

// A pack's gift twin in `billing sync` — the pack's live prices in every
// currency and none of its benefits — and the presentment prices a product
// that exists already gains when the catalog prices another currency.

/** A product as the provider lists it, with the fields the price and gift alignment read. */
interface ListedProduct { id: string, metadata?: unknown, prices?: unknown[], benefits?: unknown[] }

/** A live fixed price: its amount and currency. */
export interface FixedPrice { priceAmount: number, priceCurrency?: string }

type SyncOptions = { dryRun: boolean, log: SyncLogEntry[] }

/** The catalog key of a pack's private gift product. */
export function giftProductKey(packKey: string): string {
  return `${packKey}-gift`
}

/** A product's live fixed prices, one per currency, as the provider lists them. */
export function fixedPrices(product: { prices?: unknown[] } | undefined): FixedPrice[] {
  const prices = (product?.prices ?? []) as Array<{ amountType?: string, isArchived?: boolean, priceAmount?: number, priceCurrency?: string }>
  return prices
    .filter(price => price.amountType === 'fixed' && !price.isArchived && typeof price.priceAmount === 'number')
    .map(price => ({ priceAmount: price.priceAmount!, ...(price.priceCurrency ? { priceCurrency: price.priceCurrency } : {}) }))
}

/**
 * A live fixed price as a create or update payload takes it. The SDK types
 * the currency as a closed enum; it is the one the provider listed.
 */
export function fixedPriceCreate(price: FixedPrice): { amountType: 'fixed', priceAmount: number, priceCurrency?: never } {
  return { amountType: 'fixed', priceAmount: price.priceAmount, ...(price.priceCurrency ? { priceCurrency: price.priceCurrency as never } : {}) }
}

/**
 * The prices a pack's gift twin is created with: the pack's live ones when
 * it exists already (one priced again in the dashboard no longer matches
 * the catalog), each with the pack's tax behaviour, else the catalog's.
 */
export function giftTwinPrices<Price>(live: FixedPrice[], pack: { taxBehavior?: string }, catalog: Price[]): Array<Price | ReturnType<typeof fixedPriceCreate>> {
  if (live.length === 0) return catalog
  const taxBehavior = pack.taxBehavior ? { taxBehavior: pack.taxBehavior as never } : {}
  return live.map(price => ({ ...fixedPriceCreate(price), ...taxBehavior }))
}

/** Fixed prices as the log shows them: each amount, with its currency when the provider names one. */
function showPrices(prices: FixedPrice[]): string {
  if (prices.length === 0) return 'unknown'
  return prices.map(price => [price.priceAmount, price.priceCurrency].filter(part => part !== undefined).join(' ')).join(', ')
}

/** Whether two sets of fixed prices are the same amounts in the same currencies. */
function samePrices(a: FixedPrice[], b: FixedPrice[]): boolean {
  const key = (prices: FixedPrice[]) => prices.map(price => `${price.priceCurrency ?? ''}:${price.priceAmount}`).sort().join('|')
  return key(a) === key(b)
}

/**
 * Add the presentment prices a product that exists lacks: the catalog
 * prices a currency the product has no price in yet. Its prices are kept by
 * id, so no order or subscription on them changes; an amount that differs
 * in a currency both have is drift, reported where the product is found.
 * The listed product takes its new prices, so what reads it later in the
 * run (a pack's gift twin) sees them.
 */
export async function addCurrencyPrices<Price extends { amountType: string }>(
  client: Polar,
  product: ListedProduct | undefined,
  wanted: Price[],
  key: string,
  { dryRun, log }: SyncOptions,
): Promise<void> {
  if (!product) return
  const missing = missingCurrencyPrices(product, wanted)
  if (missing.length === 0) return
  const note = `adds its price in ${missing.map(price => (price as { priceCurrency?: string }).priceCurrency).join(', ')}`
  if (dryRun) {
    log.push({ action: 'would-update', kind: 'product', key, id: product.id, note })
    return
  }
  const kept = ((product.prices ?? []) as Array<{ id?: string, isArchived?: boolean }>).filter(price => price.id && !price.isArchived).map(price => ({ id: price.id! }))
  const updated = await productsUpdate(client, { id: product.id, productUpdate: { prices: [...kept, ...missing] as never } })
  if (!updated.ok) throw updated.error
  product.prices = updated.value.prices
  log.push({ action: 'updated', kind: 'product', key, id: product.id, note })
}

/**
 * Keep a pack's gift twin at the pack's live prices, amount and currency
 * each: a pack priced again in the dashboard, or in another currency, would
 * otherwise sell its gift at the old price. The twin is the package's own
 * and never subscribed to, so its prices are replaced.
 */
async function alignGiftTwinPrices(client: Polar, pack: FixedPrice[], twin: ListedProduct, giftKey: string, { dryRun, log }: SyncOptions): Promise<void> {
  const twinPrices = fixedPrices(twin)
  if (pack.length === 0 || samePrices(twinPrices, pack)) return
  const note = `priced ${showPrices(twinPrices)}, the pack is ${showPrices(pack)}`
  if (dryRun) {
    log.push({ action: 'would-update', kind: 'product', key: giftKey, id: twin.id, note })
    return
  }
  const updated = await productsUpdate(client, { id: twin.id, productUpdate: { prices: pack.map(fixedPriceCreate) } })
  if (!updated.ok) throw updated.error
  log.push({ action: 'updated', kind: 'product', key: giftKey, id: twin.id, note })
}

/**
 * Detach whatever benefits a gift twin carries: one attached in the
 * dashboard would grant the purchaser credits too, besides the recipient's
 * claim of the pack. A twin grants nothing.
 */
async function detachGiftTwinBenefits(client: Polar, twin: ListedProduct, giftKey: string, { dryRun, log }: SyncOptions): Promise<void> {
  const count = twin.benefits?.length ?? 0
  if (count === 0) return
  const note = `carried ${count} benefit${count === 1 ? '' : 's'}; a gift product grants nothing`
  if (dryRun) {
    log.push({ action: 'would-update', kind: 'product', key: giftKey, id: twin.id, note })
    return
  }
  const updated = await productsUpdateBenefits(client, { id: twin.id, productBenefitsUpdate: { benefits: [] } })
  if (!updated.ok) throw updated.error
  log.push({ action: 'updated', kind: 'product', key: giftKey, id: twin.id, note })
}

/**
 * Hold an existing gift twin to what `billing sync` makes: the pack's live
 * prices, and no benefits. A twin created this run already is.
 */
export async function alignGiftTwin(client: Polar, managedProducts: ListedProduct[], packKey: string, options: SyncOptions): Promise<void> {
  const giftKey = giftProductKey(packKey)
  const twin = managedProducts.find(item => isManaged(item.metadata as Record<string, unknown>, giftKey))
  if (!twin) return
  const pack = fixedPrices(managedProducts.find(item => isManaged(item.metadata as Record<string, unknown>, packKey)))
  await alignGiftTwinPrices(client, pack, twin, giftKey, options)
  await detachGiftTwinBenefits(client, twin, giftKey, options)
}

/**
 * Move each pack's gift twin out of `products` into `gifts`, by pack key: a
 * twin is never sold on its own, so it stays out of the checkout allow-list
 * and the price list.
 */
export function moveGiftTwins(ids: CatalogIds, catalog: BillingCatalog): void {
  const twins = new Map(Object.keys(catalog.packs ?? {}).map(pack => [giftProductKey(pack), pack]))
  const gifts = Object.entries(ids.products).flatMap(([key, id]) => twins.has(key) ? [[twins.get(key)!, id] as const] : [])
  if (gifts.length === 0) return
  ids.gifts = Object.fromEntries(gifts)
  ids.products = Object.fromEntries(Object.entries(ids.products).filter(([key]) => !twins.has(key)))
}
