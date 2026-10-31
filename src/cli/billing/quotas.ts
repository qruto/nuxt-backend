import type { Polar } from '@polar-sh/sdk'
import { benefitsCreate } from '@polar-sh/sdk/funcs/benefitsCreate.js'
import { benefitsUpdate } from '@polar-sh/sdk/funcs/benefitsUpdate.js'
import { productsUpdateBenefits } from '@polar-sh/sdk/funcs/productsUpdateBenefits.js'
import { type BillingCatalog, CATALOG_INTERVALS, type CatalogPlan, isSeatLikeQuota, planProductKey, planQuotasKey, QUOTA_KEY, QUOTA_METADATA_PREFIX } from '../../convex/catalog'
import { findPlanProduct, type ListedProduct } from './plans'
import { type CatalogIds, isManaged, MANAGED_BY, type SyncLogEntry } from './provider'

// A plan's quotas in `billing sync`: refused before anything is written when
// they are malformed or count people, carried by one feature-flag benefit
// per plan (`<plan>-quotas`, each quota as `quota_<key>` metadata), pushed
// when they change, and attached to each of the plan's products, the ones
// that exist already included. Unlike a price, a quota is a promise about
// what the app counts, not money a customer holds, so a change is pushed:
// the provider tells the deployment with `benefit.updated`, and every
// subscriber's limit moves at once. A plan that drops every quota keeps
// the benefit, its limits cleared, the way a dropped key's limit is.

type Metadata = Record<string, string | number | boolean>

/** The provider caps a benefit's description at 42 characters. */
const DESCRIPTION_LIMIT = 42

/** The provider caps an object's metadata at 50 keys; the quotas benefit carries `managedBy` and `key` beside its quotas. */
const METADATA_KEY_LIMIT = 50
const QUOTAS_PER_PLAN = METADATA_KEY_LIMIT - 2

/** Refuse a declared quota that counts people, or whose `quota_<key>` would not fit the provider's metadata. */
function refuseQuotaKey(key: string): void {
  if (isSeatLikeQuota(key)) {
    throw new Error(`[nuxt-backend] billing sync: quotas.${key} counts people, and a plan here is never priced per seat — count what people make (projects, sites, boards) instead.`)
  }
  if (!QUOTA_KEY.test(key)) {
    throw new Error(`[nuxt-backend] billing sync: quotas.${key} is not a quota key — a letter, then letters, digits, _ or -, at most 34 in all.`)
  }
}

/** Refuse a plan's quota the catalog does not declare, or a limit that is neither a whole number nor `'unlimited'`. */
function refusePlanQuota(plan: string, key: string, limit: unknown, declared: string[]): void {
  if (!declared.includes(key)) {
    throw new Error(`[nuxt-backend] billing sync: plans.${plan}.quotas.${key} is not declared — add \`quotas: { ${key}: { description: '…' } }\` to the catalog.`)
  }
  if (limit !== 'unlimited' && !(Number.isSafeInteger(limit) && (limit as number) >= 0)) {
    throw new Error(`[nuxt-backend] billing sync: plans.${plan}.quotas.${key} is ${JSON.stringify(limit)} — a whole number of at least 0, or 'unlimited'.`)
  }
}

/**
 * Refuse a catalog whose quotas the provider or the gate could not hold,
 * before the provider hears of anything: a key that counts people (no plan
 * here is priced per seat), a key `quota_<key>` would not fit, a plan's
 * quota the catalog does not declare, a limit that is neither a whole
 * number nor `'unlimited'`, or more quotas on one plan than the
 * provider's metadata holds.
 */
export function refuseInvalidQuotas(catalog: BillingCatalog): void {
  const declared = Object.keys(catalog.quotas ?? {})
  declared.forEach(refuseQuotaKey)
  for (const [plan, { quotas }] of Object.entries(catalog.plans ?? {})) {
    const entries = Object.entries(quotas ?? {})
    if (entries.length > QUOTAS_PER_PLAN) {
      throw new Error(`[nuxt-backend] billing sync: plans.${plan} sets ${entries.length} quotas, and its <plan>-quotas benefit holds at most ${QUOTAS_PER_PLAN} (the provider keeps ${METADATA_KEY_LIMIT} metadata keys).`)
    }
    for (const [key, limit] of entries) refusePlanQuota(plan, key, limit, declared)
  }
}

/** Whether a plan sets any quota. */
function hasQuotas(plan: CatalogPlan): boolean {
  return Object.keys(plan.quotas ?? {}).length > 0
}

/** The keys of the quotas benefits the catalog's plans keep: drift once a plan drops its quotas. */
export function planQuotasKeys(catalog: BillingCatalog): string[] {
  return Object.entries(catalog.plans ?? {}).filter(([, plan]) => hasQuotas(plan)).map(([key]) => planQuotasKey(key))
}

/** The quotas benefits of the catalog's plans that set no quotas: emptied by the sync, still attached to their products. */
export function droppedQuotasKeys(catalog: BillingCatalog): string[] {
  return Object.entries(catalog.plans ?? {}).filter(([, plan]) => !hasQuotas(plan)).map(([key]) => planQuotasKey(key))
}

/**
 * Write the catalog's quotas to the generated map, each key with what it
 * counts: `getFeatures` reports every one, granted or not, by that name.
 */
export function recordQuotaKeys(ids: CatalogIds, catalog: BillingCatalog): void {
  const quotas = Object.entries(catalog.quotas ?? {})
  if (quotas.length > 0) ids.quotas = Object.fromEntries(quotas.map(([key, { description }]) => [key, description]))
}

/** A plan's quotas as the benefit's metadata carries them. */
function quotaEntries(plan: CatalogPlan): Metadata {
  return Object.fromEntries(Object.entries(plan.quotas ?? {}).map(([key, limit]) => [`${QUOTA_METADATA_PREFIX}${key}`, limit]))
}

/** A benefit's metadata split in two: its quota entries, and the rest. */
function splitEntries(metadata: Metadata | undefined): { quotas: Metadata, rest: Metadata } {
  const entries = Object.entries(metadata ?? {})
  return {
    quotas: Object.fromEntries(entries.filter(([name]) => name.startsWith(QUOTA_METADATA_PREFIX))),
    rest: Object.fromEntries(entries.filter(([name]) => !name.startsWith(QUOTA_METADATA_PREFIX))),
  }
}

/** What changed between the live quotas and the catalog's, in the log's words; `undefined` when nothing did. */
function describeQuotaChange(live: Metadata, wanted: Metadata): string | undefined {
  const names = [...new Set([...Object.keys(live), ...Object.keys(wanted)])].sort()
  const show = (value: Metadata[string] | undefined) => value === undefined ? 'none' : String(value)
  const changed = names
    .filter(name => live[name] !== wanted[name])
    .map(name => `${name.slice(QUOTA_METADATA_PREFIX.length)} ${show(live[name])} → ${show(wanted[name])}`)
  return changed.length > 0 ? changed.join(', ') : undefined
}

/** A managed benefit as the provider lists it, with the fields the quota sync reads. */
interface ListedBenefit {
  id: string
  type?: string
  metadata?: Metadata
}

interface QuotaSyncOptions {
  dryRun: boolean
  log: SyncLogEntry[]
}

/** Push the catalog's quotas to the benefit carrying them, unless they are already its own. */
async function pushPlanQuotas(client: Polar, existing: ListedBenefit, key: string, wanted: Metadata, { dryRun, log }: QuotaSyncOptions): Promise<string> {
  const { quotas, rest } = splitEntries(existing.metadata)
  const change = describeQuotaChange(quotas, wanted)
  if (!change || dryRun) {
    log.push(change ? { action: 'would-update', kind: 'benefit', key, id: existing.id, note: change } : { action: 'exists', kind: 'benefit', key, id: existing.id })
    return existing.id
  }
  const metadata = { ...rest, ...wanted }
  const updated = await benefitsUpdate(client, { id: existing.id, requestBody: existing.type === 'custom' ? { type: 'custom', metadata } : { type: 'feature_flag', metadata } })
  if (!updated.ok) throw updated.error
  log.push({ action: 'updated', kind: 'benefit', key, id: existing.id, note: `${change}: every subscriber's limit follows` })
  return existing.id
}

/**
 * Create the benefit carrying a plan's quotas: the provider's feature-flag
 * benefit, or the generic one where the organization lacks that type, as
 * for features. `null` on a dry run.
 */
async function createPlanQuotas(client: Polar, key: string, plan: CatalogPlan, wanted: Metadata, { dryRun, log }: QuotaSyncOptions): Promise<string | null> {
  if (dryRun) {
    log.push({ action: 'would-create', kind: 'benefit', key })
    return null
  }
  const description = `${plan.name} limits`.slice(0, DESCRIPTION_LIMIT)
  const metadata = { managedBy: MANAGED_BY, key, ...wanted }
  const native = await benefitsCreate(client, { type: 'feature_flag', description, properties: {}, metadata })
  const created = native.ok ? native : await benefitsCreate(client, { type: 'custom', description, properties: { note: null }, metadata })
  if (!created.ok) throw native.ok ? created.error : native.error
  if (!native.ok) log.push({ action: 'warn', kind: 'benefit', key, note: 'the provider rejected the native feature-flag benefit — created a custom benefit instead' })
  log.push({ action: 'created', kind: 'benefit', key, id: created.value.id })
  return created.value.id
}

/**
 * The benefit carrying a plan's quotas, found or created, its quotas pushed
 * when the catalog's changed. Resolves with its id, `null` on a dry run
 * that would create it, and `undefined` for a plan that sets no quota.
 * The benefit of a plan that dropped every quota stays (nothing remote is
 * deleted), its quotas cleared, so its subscribers' limits fall to none as
 * a dropped key's do; it is drift from then on.
 */
export async function ensurePlanQuotas(
  client: Polar,
  benefits: ListedBenefit[],
  planKey: string,
  plan: CatalogPlan,
  options: QuotaSyncOptions,
): Promise<string | null | undefined> {
  const key = planQuotasKey(planKey)
  const existing = benefits.find(benefit => isManaged(benefit.metadata, key))
  if (!hasQuotas(plan)) {
    if (existing && Object.keys(splitEntries(existing.metadata).quotas).length > 0) await pushPlanQuotas(client, existing, key, {}, options)
    return undefined
  }
  const wanted = quotaEntries(plan)
  return existing ? pushPlanQuotas(client, existing, key, wanted, options) : createPlanQuotas(client, key, plan, wanted, options)
}

/**
 * The quotas benefit a new product of the plan is created with: none for a
 * plan without quotas. An adopted product keeps its benefits as they are,
 * so the log says where to attach it instead.
 */
export function planQuotasBenefits(planKey: string, productKey: string, quotasId: string | null | undefined, { adopt, log }: { adopt: Record<string, string>, log: SyncLogEntry[] }): Array<string | null> {
  if (quotasId === undefined) return []
  const adopted = adopt[productKey]
  if (adopted) log.push({ action: 'warn', kind: 'product', key: productKey, id: adopted, note: `adopted: its benefits are left as they are, so attach ${planQuotasKey(planKey)} in the provider dashboard for its quotas to count` })
  return [quotasId]
}

/** The benefit ids a listed product carries. */
function benefitIdsOf(product: { benefits?: unknown[] }): string[] {
  return (product.benefits ?? []).flatMap(benefit => typeof (benefit as { id?: unknown }).id === 'string' ? [(benefit as { id: string }).id] : [])
}

/**
 * Attach a plan's quotas benefit to one of its products that exists already
 * and lacks it, keeping every benefit it carries. The provider grants a
 * benefit attached to a product to the product's current subscribers as
 * well, which is how the quotas reach them without a new checkout. `quotasId` is `null` on a dry run that would
 * create the benefit, and `undefined` for a plan that sets no quota.
 */
export async function attachPlanQuotas(
  client: Polar,
  product: { id: string, benefits?: unknown[] },
  productKey: string,
  quotasId: string | null | undefined,
  { dryRun, log }: QuotaSyncOptions,
): Promise<void> {
  const carried = benefitIdsOf(product)
  if (quotasId === undefined || (quotasId !== null && carried.includes(quotasId))) return
  const note = 'attached its plan\'s quotas, which the provider grants its current subscribers too: check one in DevTools (Billing → Quotas)'
  if (dryRun || quotasId === null) {
    log.push({ action: 'would-update', kind: 'product', key: productKey, id: product.id, note })
    return
  }
  const updated = await productsUpdateBenefits(client, { id: product.id, productBenefitsUpdate: { benefits: [...carried, quotasId] } })
  if (!updated.ok) throw updated.error
  log.push({ action: 'updated', kind: 'product', key: productKey, id: product.id, note })
}

/**
 * Keep a retired plan's quotas on its products, at every interval it was
 * sold at: its subscribers keep the plan, and the limits they count on with
 * it. An adopted product is left as it is.
 */
export async function attachRetiredPlanQuotas(
  client: Polar,
  products: ListedProduct[],
  planKey: string,
  quotasId: string | null | undefined,
  options: QuotaSyncOptions & { adopt: Record<string, string> },
): Promise<void> {
  for (const interval of CATALOG_INTERVALS) {
    const productKey = planProductKey(planKey, interval)
    const product = options.adopt[productKey] ? undefined : findPlanProduct(products, planKey, interval)
    if (product) await attachPlanQuotas(client, product, productKey, quotasId, options)
  }
}
