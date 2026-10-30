import type { Polar } from '@polar-sh/sdk'
import { productsUpdate } from '@polar-sh/sdk/funcs/productsUpdate.js'
import { type BillingCatalog, CATALOG_INTERVALS, type CatalogInterval, type CatalogPlan, isFreePlan, packPricesByCurrency, planPricesByCurrency, planProductKey, pricedIntervals } from '../../convex/catalog'
import { MANAGED_BY, type CatalogIds, type SyncLogEntry } from './provider'

// A plan's products in `billing sync`: one per priced interval, found by the
// plan's key and the interval, the trial pushed to the ones that exist, and
// a retired plan's archived — the sync's remote writes beyond creating.

/** A managed product as the provider lists it, with the fields the plan sync reads. */
export interface ListedProduct {
  id: string
  metadata?: unknown
  recurringInterval?: string | null
  trialInterval?: string | null
  trialIntervalCount?: number | null
  isArchived?: boolean
  prices?: unknown[]
  benefits?: unknown[]
  name?: string
}

/** A plan as 0.1 wrote it: one `interval` and one `price`, and no `prices`. */
interface LegacyPlan { interval?: unknown, price?: unknown, prices?: unknown, credits?: { units?: unknown } }

/**
 * What to write instead of a plan in the 0.1 shape, or `undefined` for a
 * plan in today's. A number of `units` was a cycle's grant and is now a
 * month's: a yearly plan keeps its grant by naming the year's.
 */
function legacyPlanLine(plan: LegacyPlan): string | undefined {
  if (plan.prices !== undefined || (plan.interval === undefined && plan.price === undefined)) return undefined
  const interval = plan.interval === 'year' ? 'year' : 'month'
  const price = typeof plan.price === 'number' ? plan.price : 0
  const units = plan.credits?.units
  const credits = interval === 'year' && typeof units === 'number'
    ? `, and \`credits: { …, units: { year: ${units} } }\` (a number of units is a month's allowance now)`
    : ''
  return `\`prices: { ${interval}: ${price} }\`${credits}`
}

/**
 * Refuse a catalog still shaped as 0.1 wrote it — a plan with `interval`
 * and `price` — or a plan priced at no interval at all, before the provider
 * hears of anything: the generated map would otherwise lose the plan.
 */
export function refuseUnpricedPlans(catalog: BillingCatalog): void {
  for (const [key, plan] of Object.entries(catalog.plans ?? {})) {
    const line = legacyPlanLine(plan as unknown as LegacyPlan)
    if (line) {
      throw new Error(`[nuxt-backend] billing sync: plans.${key} has \`interval\` and \`price\`, which became \`prices: { month, year }\` — write ${line} (the Upgrade page has the rest).`)
    }
    if (pricedIntervals(plan).length === 0) {
      throw new Error(`[nuxt-backend] billing sync: plans.${key} has no price — give it \`prices: { month }\`, \`prices: { year }\` or both.`)
    }
  }
}

/** A lower-case ISO 4217 code, as the provider names a presentment currency. */
const CURRENCY_CODE = /^[a-z]{3}$/

/** A price the provider takes: a whole number of the currency's smallest unit, zero or more. */
function isAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/** Refuse a per-currency map whose codes are no currency, or which lacks the catalog's own. */
function refuseCurrencies(where: string, codes: Array<string | undefined>, currency: string | undefined): void {
  const named = codes.filter((code): code is string => code !== undefined)
  const bad = named.filter(code => !CURRENCY_CODE.test(code))
  if (bad.length > 0) throw new Error(`[nuxt-backend] billing sync: ${where} prices ${bad.join(', ')}, which ${bad.length === 1 ? 'is' : 'are'} no ISO 4217 currency code — write each as three letters, \`usd\`, \`eur\`.`)
  if (named.length > 0 && currency && !named.includes(currency)) {
    throw new Error(`[nuxt-backend] billing sync: ${where} has no price in ${currency}, the catalog's currency — the provider needs one in it on every product.`)
  }
}

/** Why a plan's prices can't be synced, if they can't: currencies, amounts, intervals that disagree, a free plan's shape. */
function planPricesProblem(key: string, plan: CatalogPlan, currency: string | undefined): string | undefined {
  const byCurrency = planPricesByCurrency(plan, currency)
  refuseCurrencies(`plans.${key}`, byCurrency.map(([code]) => code), currency)
  const amounts = byCurrency.flatMap(([, prices]) => CATALOG_INTERVALS.flatMap(interval => interval in prices ? [prices[interval]] : []))
  if (!amounts.every(isAmount)) return `plans.${key} has a price that is no whole number of cents (or is below 0)`
  const intervals = new Set(byCurrency.map(([, prices]) => CATALOG_INTERVALS.filter(interval => typeof prices[interval] === 'number').join('+')))
  if (intervals.size > 1) return `plans.${key} prices other intervals in each currency — price the same ones in all of them`
  if (amounts.includes(0) && !isFreePlan(plan)) return `plans.${key} is priced 0 somewhere and above 0 elsewhere — a free plan is free in every currency, and a paid one paid`
  if (byCurrency.length > 1 && (plan.usage?.length ?? 0) > 0) return `plans.${key} has \`usage\` prices, which are billed in one currency — price the plan in the catalog's currency alone, or drop \`usage\``
  if (!isFreePlan(plan)) return undefined
  if (pricedIntervals(plan).includes('year') || byCurrency.length > 1) return `plans.${key} is the free plan, which is priced once, by the month — write \`prices: { month: 0 }\` (it reads as free in every currency)`
  if (plan.trial) return `plans.${key} is the free plan, which has no trial to offer — drop its \`trial\``
  if ((plan.usage?.length ?? 0) > 0) return `plans.${key} is the free plan, which the provider can't bill \`usage\` on — drop it, or price the plan`
  return undefined
}

/**
 * Refuse prices the provider would reject or the package could not sell,
 * before the provider hears of anything: currency codes that are none, a
 * per-currency map without the catalog's own currency, amounts that are no
 * whole number of cents, currencies that price other intervals, a plan free
 * somewhere and paid elsewhere, `usage` on a plan in several currencies,
 * more than one free plan, and a free plan with a yearly price, a trial or
 * `usage`. A retired plan is checked like a sold one, but is never the free
 * plan.
 */
export function refuseInvalidPrices(catalog: BillingCatalog): void {
  const currency = catalog.currency?.toLowerCase()
  for (const [key, plan] of Object.entries(catalog.plans ?? {})) {
    const problem = planPricesProblem(key, plan, currency)
    if (problem) throw new Error(`[nuxt-backend] billing sync: ${problem}.`)
  }
  for (const [key, pack] of Object.entries(catalog.packs ?? {})) {
    const byCurrency = packPricesByCurrency(pack, currency)
    refuseCurrencies(`packs.${key}`, byCurrency.map(([code]) => code), currency)
    if (byCurrency.length === 0 || !byCurrency.every(([, amount]) => isAmount(amount))) {
      throw new Error(`[nuxt-backend] billing sync: packs.${key} has a price that is no whole number of cents (or is below 0).`)
    }
  }
  const free = Object.entries(catalog.plans ?? {}).filter(([, plan]) => !plan.retired && isFreePlan(plan)).map(([key]) => key)
  if (free.length > 1) {
    throw new Error(`[nuxt-backend] billing sync: ${free.join(', ')} are all free plans — a catalog has at most one, which every new billing entity starts on. Price the others, or retire them.`)
  }
}

/**
 * Refuse a per-currency price without the provider's default currency, once
 * the sync knows it (a catalog without `currency` uses the organization's):
 * the provider rejects a product with no price in it.
 */
export function refuseMissingDefaultCurrency(catalog: BillingCatalog, currency: string | undefined): void {
  if (!currency || catalog.currency) return
  for (const [key, plan] of Object.entries(catalog.plans ?? {})) refuseCurrencies(`plans.${key}`, planPricesByCurrency(plan, currency).map(([code]) => code), currency)
  for (const [key, pack] of Object.entries(catalog.packs ?? {})) refuseCurrencies(`packs.${key}`, packPricesByCurrency(pack, currency).map(([code]) => code), currency)
}

/**
 * The managed product of a plan at one interval: tagged with the plan's
 * key and that interval, or — made before plans had intervals — tagged with
 * the key alone and billed at that interval.
 */
export function findPlanProduct<T extends ListedProduct>(products: T[], key: string, interval: CatalogInterval): T | undefined {
  const tagged = (product: T) => product.metadata as Record<string, unknown> | undefined
  return products.find(product => tagged(product)?.managedBy === MANAGED_BY && tagged(product)?.key === key && tagged(product)?.interval === interval)
    ?? products.find(product => tagged(product)?.managedBy === MANAGED_BY && tagged(product)?.key === key && tagged(product)?.interval === undefined && product.recurringInterval === interval)
}

/** A plan product made before plans had intervals: tagged with the plan's key alone. */
export function isUntaggedPlanProduct(product: ListedProduct | undefined): boolean {
  return product !== undefined && (product.metadata as Record<string, unknown> | undefined)?.interval === undefined
}

/** A product's live trial as the log shows it. */
function showTrial(trial: { interval?: string | null, count?: number | null } | undefined): string {
  return trial?.interval ? `${trial.count ?? 1} ${trial.interval}` : 'none'
}

/**
 * Put the catalog's trial on a plan product that offers another: the trial
 * only decides what a new checkout gets, so a change is pushed rather than
 * reported. A subscriber already trialing keeps the one they started.
 */
export async function pushPlanTrial(
  client: Polar,
  product: ListedProduct,
  productKey: string,
  trial: { interval: 'day' | 'week' | 'month' | 'year', count?: number } | undefined,
  { dryRun, log }: { dryRun: boolean, log: SyncLogEntry[] },
): Promise<void> {
  const wanted = trial ? { interval: trial.interval, count: trial.count ?? 1 } : undefined
  const live = product.trialInterval ? { interval: product.trialInterval, count: product.trialIntervalCount ?? 1 } : undefined
  if (live?.interval === wanted?.interval && (live === undefined || live.count === wanted?.count)) return
  const note = `trial ${showTrial(live)}, catalog says ${showTrial(wanted)}`
  if (dryRun) {
    log.push({ action: 'would-update', kind: 'product', key: productKey, id: product.id, note })
    return
  }
  const updated = await productsUpdate(client, {
    id: product.id,
    productUpdate: { trialInterval: wanted?.interval ?? null, trialIntervalCount: wanted?.count ?? null },
  })
  if (!updated.ok) throw updated.error
  log.push({ action: 'updated', kind: 'product', key: productKey, id: product.id, note })
}

/**
 * Retire a plan: archive each of its products — at every interval it was
 * ever sold at, priced in the catalog still or not — so no new checkout or
 * plan change reaches them, and keep their ids, so a subscriber's plan
 * still reads back by its key. An adopted product is recorded and left as
 * it is, like every adopted product. Nothing is created for a plan
 * retired before its first sync.
 */
export async function retirePlan(
  client: Polar,
  products: ListedProduct[],
  key: string,
  priced: CatalogInterval[],
  { dryRun, log, ids, adopt }: { dryRun: boolean, log: SyncLogEntry[], ids: CatalogIds, adopt: Record<string, string> },
): Promise<void> {
  for (const interval of CATALOG_INTERVALS) {
    const productKey = planProductKey(key, interval)
    const adopted = adopt[productKey]
    if (adopted) {
      recordPlanProduct(ids, key, interval, adopted)
      log.push({ action: 'adopted', kind: 'product', key: productKey, id: adopted, note: 'retired: an adopted product is left as-is — archive it in the provider dashboard if it still sells' })
      continue
    }
    const product = findPlanProduct(products, key, interval)
    if (product) {
      recordPlanProduct(ids, key, interval, product.id)
      await archivePlanProduct(client, product, productKey, { dryRun, log })
    }
    else if (priced.includes(interval)) {
      log.push({ action: 'warn', kind: 'product', key: productKey, note: 'retired before it was ever synced — nothing to archive, nothing created' })
    }
  }
  if (Object.keys(ids.plans?.[key] ?? {}).length > 0) ids.retired = [...ids.retired ?? [], key]
}

/** Archive one product of a retired plan, unless it is already. */
async function archivePlanProduct(
  client: Polar,
  product: ListedProduct,
  productKey: string,
  { dryRun, log }: { dryRun: boolean, log: SyncLogEntry[] },
): Promise<void> {
  if (product.isArchived) {
    log.push({ action: 'exists', kind: 'product', key: productKey, id: product.id, note: 'retired (archived)' })
    return
  }
  const note = 'retired: archived, so it is sold to nobody new; subscribers keep it'
  if (dryRun) {
    log.push({ action: 'would-archive', kind: 'product', key: productKey, id: product.id, note })
    return
  }
  const updated = await productsUpdate(client, { id: product.id, productUpdate: { isArchived: true } })
  if (!updated.ok) throw updated.error
  log.push({ action: 'archived', kind: 'product', key: productKey, id: product.id, note })
}

/** Record a plan's product at one interval, in both the flat map and the plan's own. */
export function recordPlanProduct(ids: CatalogIds, key: string, interval: CatalogInterval, id: string): void {
  ids.products[planProductKey(key, interval)] = id
  ids.plans = { ...ids.plans, [key]: { ...ids.plans?.[key], [interval]: id } }
}

/**
 * Managed plan products whose interval the catalog no longer prices: kept
 * and still sold, and so reported, never archived on their own — retiring
 * the whole plan, or the dashboard, does that. A retired plan's are
 * archived with it, so none is reported.
 */
export function unpricedPlanProducts(catalog: BillingCatalog, products: ListedProduct[]): SyncLogEntry[] {
  return Object.entries(catalog.plans ?? {}).flatMap(([key, plan]) => {
    if (plan.retired) return []
    const priced = new Set(pricedIntervals(plan))
    return CATALOG_INTERVALS
      .filter(interval => !priced.has(interval))
      .flatMap((interval) => {
        const product = findPlanProduct(products, key, interval)
        return product && !product.isArchived
          ? [{ action: 'drift' as const, kind: 'product' as const, key: planProductKey(key, interval), id: product.id, note: `the catalog no longer prices ${key} by the ${interval}, but this product still sells — retire the plan, or archive it in the provider dashboard` }]
          : []
      })
  })
}
