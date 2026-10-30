import { queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import { type CatalogInterval, featureKeyOf, grantedQuotas, planQuotasKey, quotaLimit } from '../../catalog.js'
import type { BillingContext } from './context.js'
import { type CatalogDiscounts, type KeyedDiscount, offerOf, promotionOf } from './discounts.js'
import type { ProviderCtx, RunQueryCtx } from './types/base.js'
import type { PricedCredits, PricedPack, PricedPlan, PricedPlanPrice, PricedTrial, Pricing } from './types/records.js'

// The catalog as a pricing page shows it: one public query over the products
// table `billing sync` loads, so `/pricing` renders on the server for anyone,
// signed in or not. Every figure is the live product's — its price, its
// trial and the units of its credit benefit — never the catalog file's.

/** A product row as the billing component keeps it, with the fields pricing reads. */
interface ProductRow {
  id: string
  name: string
  description?: string | null
  isRecurring: boolean
  isArchived: boolean
  recurringInterval?: string | null
  trialInterval?: string | null
  trialIntervalCount?: number | null
  metadata?: Record<string, unknown>
  prices: Array<{ amountType?: string, isArchived: boolean, priceAmount?: number, priceCurrency?: string }>
  benefits?: Array<{ id?: string, type: string, description: string, metadata?: Record<string, unknown>, properties?: unknown }>
}

/** What the pricing reads beside the rows. */
export interface PricingSources {
  /** The flat id map: product key → product id, in catalog order. */
  products: Record<string, string> | undefined
  /** Products sold to nobody new: a retired plan's. */
  retired: Set<string>
  /** Products never on a pricing page: a pack's gift twin, and its kin. */
  hidden: Set<string>
  /** Meter id → the catalog's name for it. */
  meterNames: Map<string, string>
  /**
   * Benefit id → its live metadata, where the entitlement cache holds a
   * snapshot (the `benefit.updated` webhook patches it): what a feature
   * gate matches, so it wins over the row's own copy, which changes only
   * when the products are synced again.
   */
  benefitMetadata?: ReadonlyMap<string, Readonly<Record<string, unknown>>>
  /** The free plan's key, when the catalog has one. */
  free?: string
  /**
   * The currencies to show a price in, in order: the one asked for, then
   * the catalog's own. A product priced in neither shows its first.
   */
  currencies?: string[]
  /** The catalog's own currency, as `billing sync` wrote it: first among those offered. */
  catalogCurrency?: string
  /** The public promotion asked for: each price and pack it applies to carries its offer. */
  promotion?: KeyedDiscount
}

/**
 * A synced price's currency, lower-case: the provider's default when a row
 * names none. What `getPricing` shows a price in and what a checkout's
 * currency is checked against, read the same way.
 */
export function currencyOf(price: { priceCurrency?: string | null }): string {
  return (price.priceCurrency ?? 'usd').toLowerCase()
}

/** A product's live prices with a figure to show: fixed and free ones. */
function shownPrices(row: ProductRow): ProductRow['prices'] {
  return row.prices.filter(price => !price.isArchived && (price.amountType === 'fixed' || price.amountType === 'free'))
}

/**
 * The product's live fixed price (or a free one) in the first of
 * `currencies` it is priced in, else its first: one per currency, the
 * provider's native presentment prices. `undefined` without one, or with
 * two in one currency: a custom price shape has no figure to show.
 */
function priceOf(row: ProductRow, currencies: readonly string[] = []): { amount: number, currency: string } | undefined {
  const live = shownPrices(row)
  if (live.length === 0 || new Set(live.map(currencyOf)).size !== live.length) return undefined
  const price = currencies.map(code => live.find(entry => currencyOf(entry) === code)).find(Boolean) ?? live[0]!
  const amount = price.amountType === 'free' ? 0 : price.priceAmount
  return typeof amount === 'number' ? { amount, currency: currencyOf(price) } : undefined
}

/** The credits of the product's one meter-credit benefit; none with zero or several. */
function creditsOf(row: ProductRow, meterNames: Map<string, string>): PricedCredits | undefined {
  const grants = (row.benefits ?? []).filter(benefit => benefit.type === 'meter_credit')
  if (grants.length !== 1) return undefined
  const { units, rollover, meterId } = (grants[0]!.properties ?? {}) as { units?: unknown, rollover?: unknown, meterId?: unknown }
  if (typeof units !== 'number') return undefined
  const meter = typeof meterId === 'string' ? meterNames.get(meterId) : undefined
  return { ...(meter === undefined ? {} : { meter }), units, rollover: rollover === true }
}

function trialOf(row: ProductRow): PricedTrial | undefined {
  const count = row.trialIntervalCount ?? 1
  return row.trialInterval && count > 0 ? { interval: row.trialInterval, count } : undefined
}

/** A product's benefits, each with its metadata as the gate reads it: live where the cache has it, else the row's. */
function liveBenefits(row: ProductRow, live: PricingSources['benefitMetadata']): Array<{ benefit: NonNullable<ProductRow['benefits']>[number], metadata: Readonly<Record<string, unknown>> | undefined }> {
  return (row.benefits ?? []).map(benefit => ({ benefit, metadata: live?.get(benefit.id ?? '') ?? benefit.metadata }))
}

/**
 * The names of what a plan unlocks: its feature and custom benefits, but
 * one that carries quotas, which {@link PricedPlan.quotas} lists instead,
 * and the plan's own quotas benefit once its quotas are dropped.
 */
function featuresOf(row: ProductRow, plan: string, live: PricingSources['benefitMetadata']): string[] {
  return liveBenefits(row, live)
    .filter(({ benefit, metadata }) => (benefit.type === 'feature_flag' || benefit.type === 'custom')
      && grantedQuotas([{ metadata }]).size === 0 && metadata?.key !== planQuotasKey(plan))
    .map(({ benefit }) => benefit.description)
}

/**
 * The name a feature gate knows each of the product's benefits by, credits
 * and every other kind included: by its live metadata where the cache has
 * it, as `requireFeature` reads it, else the row's.
 */
function featureKeysOf(row: ProductRow, live: PricingSources['benefitMetadata']): string[] {
  return liveBenefits(row, live).flatMap(({ benefit, metadata }) => {
    const key = featureKeyOf({ benefitId: benefit.id ?? '', metadata })
    return key === '' ? [] : [key]
  })
}

/** A row that is no catalog plan or pack: a gift's or a pass's twin. */
function isTwin(row: ProductRow, hidden: Set<string>): boolean {
  return hidden.has(row.id) || row.metadata?.giftOf !== undefined || row.metadata?.passOf !== undefined
}

/** The promotion's offer on a product that sells, at its price: none where it does not apply. */
function promotionOn(row: ProductRow, price: { amount: number, currency: string }, promotion: KeyedDiscount | undefined, archived: boolean) {
  const offer = promotion && !archived && promotion.productIds.includes(row.id) ? offerOf(promotion, price.amount, price.currency) : undefined
  return offer ? { promotion: offer } : {}
}

/** One price of a plan, from its product at `interval`; marked `archived` when that product sells to nobody new. */
function planPrice(row: ProductRow, interval: CatalogInterval, { meterNames, currencies, promotion }: Pick<PricingSources, 'meterNames' | 'currencies' | 'promotion'>, archived: boolean): PricedPlanPrice | undefined {
  const price = priceOf(row, currencies)
  if (!price) return undefined
  const credits = creditsOf(row, meterNames)
  const trial = trialOf(row)
  return {
    productId: row.id,
    ...price,
    monthly: interval === 'year' ? price.amount / 12 : price.amount,
    ...(credits ? { credits } : {}),
    ...(trial ? { trial } : {}),
    ...(archived ? { archived: true as const } : {}),
    ...promotionOn(row, price, promotion, archived),
  }
}

/** What a yearly price saves against twelve monthly ones that both still sell, in whole percent rounded down. */
function savingsOf(plan: PricedPlan): number | undefined {
  const { month, year } = plan.prices
  if (!month || !year || month.archived || year.archived || month.currency !== year.currency || month.amount <= 0) return undefined
  const percent = Math.floor(((month.amount * 12 - year.amount) / (month.amount * 12)) * 100)
  return percent > 0 ? percent : undefined
}

/**
 * Compare the packs credit for credit: per meter and currency, each pack's
 * price per credit, how much less that is than the costliest one, and the
 * one cheapest. A pack with no single credit benefit, a $0 price or credits
 * that lapse is left out of the comparison.
 */
function comparePacks(packs: PricedPack[]): void {
  const groups = new Map<string, PricedPack[]>()
  for (const pack of packs) {
    if (!pack.credits || pack.credits.units <= 0 || !pack.credits.rollover || pack.amount <= 0) continue
    pack.perCredit = pack.amount / pack.credits.units
    const group = `${pack.credits.meter ?? ''}\u0000${pack.currency}`
    groups.set(group, [...groups.get(group) ?? [], pack])
  }
  for (const group of groups.values()) {
    const costliest = Math.max(...group.map(pack => pack.perCredit!))
    for (const pack of group) {
      const less = Math.floor(((costliest - pack.perCredit!) / costliest) * 100)
      if (less > 0) pack.lessPerCredit = less
    }
    const cheapest = Math.min(...group.map(pack => pack.perCredit!))
    const atCheapest = group.filter(pack => pack.perCredit === cheapest)
    if (group.length > 1 && atCheapest.length === 1) atCheapest[0]!.isBestValue = true
  }
}

/** A pack on sale, from its product row: none for an archived one or one without a price to show. */
function packOf(productKey: string, row: ProductRow, { meterNames, currencies, promotion }: Pick<PricingSources, 'meterNames' | 'currencies' | 'promotion'>): PricedPack | undefined {
  const price = priceOf(row, currencies)
  if (row.isArchived || !price) return undefined
  const credits = creditsOf(row, meterNames)
  return { key: productKey, productId: row.id, name: row.name, description: row.description ?? null, ...price, ...(credits ? { credits } : {}), isBestValue: false, ...promotionOn(row, price, promotion, false) }
}

/**
 * A plan in the making: its prices so far, whether any of them still
 * sells, and how near the product it reads as is to the one it prefers.
 */
type PlanDraft = Omit<PricedPlan, 'quotas'> & { live: boolean, rank: number, liveKeys: string[], allGrants: QuotaGrant[], liveGrants: QuotaGrant[] }

/** A benefit as a plan's quotas are read from it: its metadata, live where the cache has it. */
type QuotaGrant = { metadata: Readonly<Record<string, unknown>> | undefined }

/**
 * Add one interval product to its plan: the plan key is the product key
 * without its `:<interval>`. The plan takes its name, description and
 * features from a product that sells over an archived one, and from its
 * monthly product over its yearly one. A price whose product is archived
 * (in the dashboard, or as a retired plan's) stays listed, marked, for the
 * people on it; a plan none of whose prices sells is retired.
 */
function addPlanProduct(plans: Map<string, PlanDraft>, productKey: string, row: ProductRow, { retired, meterNames, benefitMetadata, currencies, free, promotion }: Pick<PricingSources, 'retired' | 'meterNames' | 'benefitMetadata' | 'currencies' | 'free' | 'promotion'>): void {
  const interval = row.recurringInterval
  if (interval !== 'month' && interval !== 'year') return
  const archived = row.isArchived || retired.has(row.id)
  const price = planPrice(row, interval, { meterNames, currencies, promotion }, archived)
  if (!price) return
  const key = productKey.endsWith(`:${interval}`) ? productKey.slice(0, -interval.length - 1) : productKey
  const rank = (archived ? 2 : 0) + (interval === 'year' ? 1 : 0)
  const plan: PlanDraft = plans.get(key) ?? { key, name: row.name, description: row.description ?? null, retired: true, prices: {}, features: featuresOf(row, key, benefitMetadata), featureKeys: [], live: false, rank, liveKeys: [], allGrants: [], liveGrants: [] }
  if (rank < plan.rank) Object.assign(plan, { name: row.name, description: row.description ?? null, features: featuresOf(row, key, benefitMetadata), rank })
  // What its prices grant, any of them: what a price that still sells
  // grants, once one does, since buying an archived one is not possible.
  const keys = featureKeysOf(row, benefitMetadata)
  plan.featureKeys = [...new Set([...plan.featureKeys, ...keys])]
  if (!archived) plan.liveKeys = [...new Set([...plan.liveKeys, ...keys])]
  const grants = liveBenefits(row, benefitMetadata).map(({ metadata }) => ({ metadata }))
  plan.allGrants.push(...grants)
  if (!archived) plan.liveGrants.push(...grants)
  plan.prices[interval] = price
  plan.live ||= !archived
  plan.retired = !plan.live
  // The catalog's free plan, or a plan at nothing everywhere (a retired free plan, say).
  if (key === free || Object.values(plan.prices).every(entry => entry?.amount === 0)) plan.free = true
  else delete plan.free
  plans.set(key, plan)
}

/**
 * A finished plan: what its yearly price saves, what its prices on sale
 * grant (its quotas the most any of their benefits allows), and no draft
 * field left.
 */
function finishPlan({ live, rank: _rank, liveKeys, allGrants, liveGrants, ...draft }: PlanDraft): PricedPlan {
  const quotas = grantedQuotas(live ? liveGrants : allGrants)
  const plan: PricedPlan = { ...draft, quotas: Object.fromEntries([...quotas].map(([key, limit]) => [key, quotaLimit(limit)])) }
  const savings = savingsOf(plan)
  if (savings !== undefined) plan.prices.year!.savings = savings
  if (live) plan.featureKeys = liveKeys
  return plan
}

/**
 * The pricing of an id map against the product rows: plans grouped from
 * their interval products (`<plan>`, `<plan>:year`), packs as they are, in
 * the map's order. A product the table has not loaded yet is left out, and
 * so is an archived pack; a retired plan, and a plan's archived price, are
 * kept, marked.
 *
 * @internal
 */
export function buildPricing(rows: ProductRow[], given: PricingSources): Pricing {
  const byId = new Map(rows.map(row => [row.id, row]))
  // One table, one currency: a currency every product on sale is priced in
  // wins over one only some are, so a plan priced in no currency asked for
  // never shows beside packs in another.
  const shared = sharedCurrencies(rows, given)
  const sources = shared.length === 0
    ? given
    : { ...given, currencies: [...new Set([...(given.currencies ?? []).filter(code => shared.includes(code)), ...shared])] }
  const plans = new Map<string, PlanDraft>()
  const packs: PricedPack[] = []
  for (const [productKey, productId] of Object.entries(sources.products ?? {})) {
    const row = byId.get(productId)
    if (!row || isTwin(row, sources.hidden)) continue
    if (row.isRecurring) {
      addPlanProduct(plans, productKey, row, sources)
      continue
    }
    const pack = packOf(productKey, row, sources)
    if (pack) packs.push(pack)
  }
  comparePacks(packs)
  const offered = [...plans.values()].flatMap(plan => Object.values(plan.prices).map(price => price!.currency)).concat(packs.map(pack => pack.currency))
  const currency = sources.currencies?.find(code => offered.includes(code)) ?? offered[0]
  return {
    plans: [...plans.values()].map(finishPlan),
    packs,
    ...(currency ? { currency } : {}),
    currencies: shared.length === 0 ? catalogCurrencies(rows, sources) : shared,
    ...(sources.promotion ? { promotion: promotionOf(sources.promotion) } : {}),
  }
}

/**
 * The currencies every product on sale is priced in (live, neither
 * retired nor a twin, and not free: a free plan is free in any currency),
 * the catalog's own first: what a currency switch
 * offers, so each choice prices the whole table. Empty when no one
 * currency prices them all.
 */
function sharedCurrencies(rows: ProductRow[], sources: PricingSources): string[] {
  const onSale = new Set(Object.values(sources.products ?? {}))
  const sets = rows
    .filter(row => onSale.has(row.id) && !row.isArchived && !sources.retired.has(row.id) && !isTwin(row, sources.hidden))
    .map(row => shownPrices(row).filter(price => price.amountType !== 'free' && price.priceAmount !== 0))
    .filter(prices => prices.length > 0)
    .map(prices => new Set(prices.map(currencyOf)))
  if (sets.length === 0) return []
  const common = [...sets[0]!].filter(code => sets.every(codes => codes.has(code)))
  const own = sources.catalogCurrency?.toLowerCase()
  return own && common.includes(own) ? [own, ...common.filter(code => code !== own)] : common
}

/**
 * Every currency the catalog's live products are priced in, the catalog's
 * own first: what a currency switch offers, in the same order whichever
 * one is shown. Twins and archived products count for nothing.
 */
function catalogCurrencies(rows: ProductRow[], sources: PricingSources): string[] {
  const catalog = new Set(Object.values(sources.products ?? {}))
  const codes = rows
    .filter(row => catalog.has(row.id) && !row.isArchived && !isTwin(row, sources.hidden))
    .flatMap(row => shownPrices(row).map(currencyOf))
  const own = sources.catalogCurrency?.toLowerCase()
  return [...new Set([...(own && codes.includes(own) ? [own] : []), ...codes])]
}

/** The `getPricing` query of one `setupBilling` call, and the read behind it. */
export function createPricing({ provider, cache, products, retiredProductIds, catalogIds, meterNameById }: BillingContext, { promotionNamed }: Pick<CatalogDiscounts, 'promotionNamed'>) {
  /**
   * The pricing as the products table holds it now: what `getPricing`
   * answers, and where a refusal finds the plans to offer. Each catalog
   * product's benefits are named by their live metadata, as the gate reads
   * it, so a key re-set in the dashboard is offered as soon as it counts.
   * Prices are in `currency` where the catalog prices it, else in its own.
   * `discount` names a public promotion, by its key or its code, whose
   * offer each price it applies to carries.
   */
  const readPricing = async (ctx: RunQueryCtx, currency?: string, discount?: string): Promise<Pricing> => {
    const promotion = discount ? promotionNamed(discount) : undefined
    const rows = await provider.listProducts(ctx as unknown as ProviderCtx, { includeArchived: true }) as ProductRow[]
    const catalog = new Set(Object.values(products ?? {}))
    const benefitIds = [...new Set(rows.filter(row => catalog.has(row.id)).flatMap(row => (row.benefits ?? []).flatMap(benefit => benefit.id ? [benefit.id] : [])))]
    const snapshots = benefitIds.length > 0 ? await ctx.runQuery(cache.getBenefitMetadata, { benefitIds }) : []
    return buildPricing(rows, {
      products,
      retired: retiredProductIds,
      hidden: new Set(Object.values(catalogIds?.gifts ?? {})),
      meterNames: meterNameById,
      benefitMetadata: new Map(snapshots.map(snapshot => [snapshot.benefitId, snapshot.metadata])),
      ...(catalogIds?.free ? { free: catalogIds.free } : {}),
      currencies: [currency?.trim().toLowerCase(), catalogIds?.currency].filter((code): code is string => Boolean(code)),
      ...(catalogIds?.currency ? { catalogCurrency: catalogIds.currency } : {}),
      ...(promotion ? { promotion } : {}),
    })
  }

  /**
   * The plans and packs on sale, as `<PricingTable>` and `/pricing` render
   * them: public, so a visitor sees them before signing in, and the same
   * for everyone, so a page can render it on the server. In `currency`
   * (the visitor's) where the catalog prices it. With `discount` (a
   * public promotion's key, or its code from a campaign link) the
   * promotion's terms and each price's offer; nothing for a name that is no
   * public promotion. Its dates are the page's to compare with its own
   * clock: the read never depends on the time. Answers empty plans and
   * packs until `billing sync` has loaded the products.
   */
  const getPricing = queryGeneric({
    args: { currency: v.optional(v.string()), discount: v.optional(v.string()) },
    handler: (ctx, { currency, discount }): Promise<Pricing> => readPricing(ctx, currency, discount),
  })
  return { getPricing, readPricing }
}

export type BillingPricing = ReturnType<typeof createPricing>
