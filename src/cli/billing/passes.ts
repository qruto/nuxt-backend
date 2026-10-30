import type { Polar } from '@polar-sh/sdk'
import type { productsCreate } from '@polar-sh/sdk/funcs/productsCreate.js'
import type { Product } from '@polar-sh/sdk/models/components/product.js'
import { type BillingCatalog, type CatalogCreditGrant, type CatalogInterval, type CatalogPlan, freePlanOf, PASS_LENGTHS, planCreditUnits, planPricesByCurrency, TRIAL_PASS_MAX_DAYS, trialPassDays } from '../../convex/catalog'
import { isManaged, MANAGED_BY, type CatalogIds, type SyncLogEntry } from './provider'
import { attachPlanQuotas, planQuotasBenefits } from './quotas'

// A plan's gift as a pass in `billing sync`: the private purchase product per
// length, and the one free pass product that carries the plan's benefits. The
// keys are derived from the plan's, so a catalog entry may not take one.

/** The catalog key of a plan's purchase product for one length. */
export function passPurchaseKey(plan: string, months: number): string {
  return `${plan}-gift-${months}`
}

/** The catalog key of a plan's free pass product. */
export function passProductKey(plan: string): string {
  return `${plan}-pass`
}

/**
 * The plans held as a pass, with the lengths each is sold for as a gift:
 * the plans the catalog offers as gifts, and those whose trial is a reverse
 * trial (`trial: { pass: true }`), which need the pass product and no
 * purchase product of their own.
 */
export function giftablePlans(catalog: BillingCatalog): Array<[string, CatalogPlan, number[]]> {
  return Object.entries(catalog.plans ?? {}).flatMap(([key, plan]) => {
    if (plan.retired) return []
    const lengths = plan.gift ? [...new Set(plan.gift.months)].sort((a, b) => a - b) : []
    return lengths.length > 0 || plan.trial?.pass ? [[key, plan, lengths] as [string, CatalogPlan, number[]]] : []
  })
}

/** Every key a plan's gift derives, for the catalog's collision and drift checks. */
export function derivedPassKeys(catalog: BillingCatalog): string[] {
  return giftablePlans(catalog).flatMap(([key, , lengths]) => [passProductKey(key), ...lengths.map(months => passPurchaseKey(key, months))])
}

/** What is wrong with one plan's reverse trial, if anything: `freeKey` is the catalog's free plan. */
function trialPassProblem(key: string, plan: CatalogPlan, freeKey: string | undefined): string | undefined {
  const days = trialPassDays(plan.trial)
  if (days === undefined) return undefined
  const where = `plans.${key}.trial`
  if (!Number.isInteger(days) || days < 1 || days > TRIAL_PASS_MAX_DAYS) return `${where} runs a reverse trial of 1 to ${TRIAL_PASS_MAX_DAYS} days — write \`trial: { interval: 'day', count: 14, pass: true }\`.`
  if (key === freeKey) return `plans.${key} is the free plan, which a reverse trial returns to — drop ${where}.`
  return freeKey ? undefined : `${where} needs a free plan for the reverse trial to return to — add a plan priced \`{ month: 0 }\`.`
}

/**
 * Refuse a gift the provider could not sell or the package could not apply,
 * before the provider hears of anything: a length that is not 1, 3 or 12; a
 * free or retired plan (a pass is a paid plan's); a catalog with no free
 * plan, which a pass returns to; a plan with no monthly price for the lengths
 * that count months; and a derived key a catalog entry already has.
 */
export function refuseInvalidGifts(catalog: BillingCatalog, keys: ReadonlySet<string>): void {
  const free = freePlanOf(catalog)
  for (const [key, plan] of Object.entries(catalog.plans ?? {})) {
    const problem = (plan.gift ? giftProblem(key, plan, plan.gift, free?.[0]) : undefined) ?? trialPassProblem(key, plan, free?.[0])
    if (problem) throw new Error(`[nuxt-backend] billing sync: ${problem}`)
  }
  // A new workspace starts on one plan's pass: two would leave it to chance.
  const reverse = Object.entries(catalog.plans ?? {}).filter(([, plan]) => plan.trial?.pass && !plan.retired).map(([key]) => key)
  if (reverse.length > 1) throw new Error(`[nuxt-backend] billing sync: ${reverse.join(', ')} all run a reverse trial — a new workspace starts on one plan's pass, so keep \`pass: true\` on one.`)
  const taken = derivedPassKeys(catalog).filter(key => keys.has(key))
  if (taken.length > 0) {
    throw new Error(`[nuxt-backend] billing sync: ${taken.join(', ')} ${taken.length === 1 ? 'is' : 'are'} the key of a plan's gift product — rename the catalog entry.`)
  }
}

/** What is wrong with one plan's `gift`, if anything: `freeKey` is the catalog's free plan. */
function giftProblem(key: string, plan: CatalogPlan, gift: NonNullable<CatalogPlan['gift']>, freeKey: string | undefined): string | undefined {
  const where = `plans.${key}.gift`
  const lengths = gift.months
  if (!Array.isArray(lengths) || lengths.length === 0 || !lengths.every(months => (PASS_LENGTHS as readonly number[]).includes(months))) {
    return `${where} lists the lengths the plan can be gifted for, any of ${PASS_LENGTHS.join(', ')} months — write \`gift: { months: [1, 3, 12] }\`.`
  }
  if (plan.retired) return `plans.${key} is retired, and a retired plan is not sold as a gift — drop ${where}.`
  if (key === freeKey) return `plans.${key} is the free plan, which a pass returns to — it is not itself a gift. Drop ${where}.`
  if (!freeKey) return `${where} needs a free plan for a pass to return to — add a plan priced \`{ month: 0 }\`.`
  const unpriced = planPricesByCurrency(plan, undefined).some(([, prices]) => typeof prices.month !== 'number' && (lengths.some(months => months !== 12) || typeof prices.year !== 'number'))
  return unpriced ? `${where} sells months at the plan's monthly price (12 months at its yearly one), and the plan has none in some currency.` : undefined
}

/**
 * What a plan's purchase product costs for one length, per currency: the
 * months at the monthly price, and 12 months at the yearly price when the
 * plan has one (else twelve monthly prices).
 */
export function passPurchaseAmounts(plan: Pick<CatalogPlan, 'prices'>, months: number, currency: string | undefined): Array<[string | undefined, number]> {
  return planPricesByCurrency(plan, currency).map(([code, prices]) => [code, months === 12 && typeof prices.year === 'number' ? prices.year : prices.month! * months] as [string | undefined, number])
}

/** The benefits a plan grants a month at a time, as the pass product carries them: its credits and its features. */
async function planBenefits(key: string, plan: CatalogPlan, { creditBenefitFor, planCreditKey, benefitIdByKey }: PassSyncContext): Promise<Array<string | null>> {
  const units = plan.credits ? planCreditUnits(plan.credits, 'month') : undefined
  const credits = plan.credits && units !== undefined ? [await creditBenefitFor(planCreditKey(key, 'month'), { ...plan.credits, units }, false)] : []
  return [...credits, ...(plan.features ?? []).flatMap(featureKey => benefitIdByKey.get(featureKey) ?? [])]
}

/** What a pass sync needs from the sync run it belongs to: its provider client, its id map and its find-or-create helpers. */
export interface PassSyncContext {
  client: Polar
  ids: CatalogIds
  managedProducts: Product[]
  ensureProduct: (key: string, benefits: Array<string | null>, create: () => Parameters<typeof productsCreate>[1], existing: Product | undefined, record?: (id: string) => void) => Promise<Product | undefined>
  creditBenefitFor: (benefitKey: string, grant: CatalogCreditGrant, defaultRollover: boolean) => Promise<string | null>
  benefitIdByKey: Map<string, string>
  quotasByPlan: Map<string, string | null | undefined>
  planCreditKey: (plan: string, interval: CatalogInterval) => string
  /** A plan's fixed prices, one per currency, as a create payload takes them. */
  price: (amounts: Array<[string | undefined, number]>, plan: CatalogPlan) => Parameters<typeof productsCreate>[1]['prices']
  currency: string | undefined
  adopt: Record<string, string>
  dryRun: boolean
  log: SyncLogEntry[]
}

/**
 * A plan's gift as a pass: one private purchase product per length (a
 * one-time product with none of the plan's benefits, at the months' price)
 * and one free, monthly pass product that carries the plan's benefits, so a
 * workspace on it holds the plan for as long as the package keeps it there.
 * Neither is sold on its own: both are private and outside `products`, and
 * the generated map lists them under `passes`.
 */
export async function syncPassProducts(catalog: BillingCatalog, context: PassSyncContext): Promise<void> {
  const { client, ids, managedProducts, ensureProduct, price, currency, quotasByPlan, adopt, dryRun, log } = context
  for (const [key, plan, lengths] of giftablePlans(catalog)) {
    const trialDays = trialPassDays(plan.trial)
    const entry = { pass: '', months: {} as Record<string, string>, ...(trialDays === undefined ? {} : { trialDays }) }
    const quotasId = quotasByPlan.get(key)
    const passKey = passProductKey(key)
    const benefits = [...await planBenefits(key, plan, context), ...planQuotasBenefits(key, passKey, quotasId, { adopt, log })]
    const foundPass = await ensureProduct(passKey, benefits, () => ({
      name: `${plan.name} (pass)`,
      description: plan.description,
      recurringInterval: 'month',
      // Free is a fixed price of nothing, as the free plan's is.
      prices: price([[currency, 0]], plan),
      visibility: 'private',
      metadata: { managedBy: MANAGED_BY, key: passKey, passOf: key },
    }), managedProducts.find(item => isManaged(item.metadata as Record<string, unknown>, passKey)), (id) => { entry.pass = id })
    if (foundPass) await attachPlanQuotas(client, foundPass, passKey, quotasId, { dryRun, log })
    for (const months of lengths) {
      const purchaseKey = passPurchaseKey(key, months)
      await ensureProduct(purchaseKey, [], () => ({
        name: `${plan.name} (${months} ${months === 1 ? 'month' : 'months'}, gift)`,
        description: plan.description,
        recurringInterval: null,
        prices: price(passPurchaseAmounts(plan, months, currency), plan),
        visibility: 'private',
        metadata: { managedBy: MANAGED_BY, key: purchaseKey, giftOf: key, giftMonths: months },
      }), managedProducts.find(item => isManaged(item.metadata as Record<string, unknown>, purchaseKey)), (id) => { entry.months[String(months)] = id })
    }
    if (entry.pass || Object.keys(entry.months).length > 0) (ids.passes ??= {})[key] = entry
  }
}
