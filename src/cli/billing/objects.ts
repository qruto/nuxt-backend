import type { Polar } from '@polar-sh/sdk'
import type { customFieldsCreate } from '@polar-sh/sdk/funcs/customFieldsCreate.js'
import { organizationsListOrganizations } from '@polar-sh/sdk/funcs/organizationsListOrganizations.js'
import type { productsCreate } from '@polar-sh/sdk/funcs/productsCreate.js'
import type { BillingCatalog, CatalogCustomField } from '../../convex/catalog'
import { MANAGED_BY, type SyncLogEntry } from './provider'

// A catalog entry against its provider object, for `billing sync`: the
// currency and create payload it is created with, and what an existing
// managed object no longer matches (drift).

type ProductPrice = NonNullable<Parameters<typeof productsCreate>[1]['prices']>[number]
type PriceCurrency = NonNullable<Extract<ProductPrice, { amountType: 'fixed' }>['priceCurrency']>

/**
 * What an existing managed meter no longer matches in the catalog: its
 * aggregation (`count` vs `sum` of a property) or the event name its
 * filter selects. Returns `undefined` when they agree.
 */
export function describeMeterDrift(
  existing: { aggregation?: Record<string, unknown>, filter?: { clauses?: Array<Record<string, unknown>> } },
  wanted: { property?: string, eventName: string },
): string | undefined {
  const parts: string[] = []
  const liveFunc = typeof existing.aggregation?.func === 'string' ? existing.aggregation.func : undefined
  const liveProperty = typeof existing.aggregation?.property === 'string' ? existing.aggregation.property : undefined
  const wantedFunc = wanted.property ? 'sum' : 'count'
  if (liveFunc !== undefined && (liveFunc !== wantedFunc || (wanted.property !== undefined && liveProperty !== wanted.property))) {
    const describe = (func?: string, property?: string) => (func === 'sum' ? `sum of '${property ?? '?'}'` : func ?? 'unknown')
    parts.push(`aggregates by ${describe(liveFunc, liveProperty)}, catalog says ${describe(wantedFunc, wanted.property)}`)
  }
  const liveEventName = existing.filter?.clauses?.find(clause => clause.property === 'name')?.value
  if (typeof liveEventName === 'string' && liveEventName !== wanted.eventName) {
    parts.push(`counts events named "${liveEventName}", catalog says "${wanted.eventName}"`)
  }
  return parts.length > 0 ? parts.join('; ') : undefined
}

/** A fixed price as a create payload or a listed product carries it. */
interface FixedAmount { priceAmount?: number, priceCurrency?: string }

/**
 * The live fixed price a catalog price compares with: the one in its
 * currency, or the product's only one when neither names a currency (the
 * provider's default).
 */
function liveFixedPrice(live: FixedAmount[], wanted: FixedAmount): FixedAmount | undefined {
  const inCurrency = wanted.priceCurrency ? live.find(price => price.priceCurrency === wanted.priceCurrency) : undefined
  if (inCurrency) return inCurrency
  const only = live.length === 1 ? live[0] : undefined
  return only && (!wanted.priceCurrency || !only.priceCurrency) ? only : undefined
}

/** A product's meter cycle against the catalog's: the provider sets it once, as it makes the product. */
function meterCycleDrift(existing: { meterInterval?: string | null }, wanted: { meterInterval?: string | null }): string[] {
  const live = existing.meterInterval ?? null
  const meant = wanted.meterInterval ?? null
  return 'meterInterval' in existing && live !== meant ? [`meter cycle ${live ?? 'none'}, catalog says ${meant ?? 'none'}`] : []
}

/**
 * What an existing managed product no longer matches in the catalog: its
 * display name, or the amount of a fixed price in a currency both name (one
 * per currency is the shape this CLI creates). A currency the product has
 * no price in yet is no drift: the sync adds it. Returns `undefined` when
 * they agree, or when the live product has a price shape this cannot
 * compare.
 */
export function describeProductDrift(
  existing: { name?: string, prices?: Array<Record<string, unknown>>, meterInterval?: string | null },
  wanted: Parameters<typeof productsCreate>[1],
): string | undefined {
  const parts: string[] = meterCycleDrift(existing, wanted as { meterInterval?: string | null })
  if (typeof existing.name === 'string' && existing.name !== wanted.name) {
    parts.push(`named "${existing.name}", catalog says "${wanted.name}"`)
  }
  const live = (existing.prices ?? []).filter(price => price.amountType === 'fixed' && price.isArchived !== true) as FixedAmount[]
  const fixed = (wanted.prices ?? []).filter(entry => entry.amountType === 'fixed') as FixedAmount[]
  for (const price of fixed) {
    const current = liveFixedPrice(live, price)
    if (price.priceAmount === undefined || current?.priceAmount === undefined || current.priceAmount === price.priceAmount) continue
    // The currency is named once there are several to tell apart.
    const currency = fixed.length > 1 && price.priceCurrency ? ` ${price.priceCurrency}` : ''
    parts.push(`priced ${current.priceAmount}${currency}, catalog says ${price.priceAmount}${currency}`)
  }
  return parts.length > 0 ? parts.join('; ') : undefined
}

/**
 * The fixed prices a catalog product wants that its live product has none
 * in the currency of: what the sync adds to a product that exists. Prices
 * that name no currency (the provider's default) are never missing.
 */
export function missingCurrencyPrices<Price extends { amountType: string }>(
  existing: { prices?: unknown[] },
  wanted: Price[],
): Price[] {
  const live = new Set(((existing.prices ?? []) as Array<{ amountType?: string, isArchived?: boolean, priceCurrency?: string }>)
    .filter(price => price.amountType === 'fixed' && !price.isArchived)
    .map(price => price.priceCurrency))
  // No live price, or one that names no currency, is in one this can't tell: nothing is added beside it.
  if (live.size === 0 || live.has(undefined)) return []
  return wanted.filter((price) => {
    const currency = (price as FixedAmount).priceCurrency
    return price.amountType === 'fixed' && currency !== undefined && !live.has(currency)
  })
}

/**
 * What an existing managed credit benefit no longer matches in the catalog:
 * the units it grants, or whether unspent ones roll over. A grant is the
 * provider's to change (new grants follow it), so a change is reported, not
 * pushed. Returns `undefined` when they agree, or for a benefit that grants
 * no credits.
 */
export function describeBenefitDrift(
  existing: { type?: string, properties?: unknown },
  wanted: { type?: string, properties?: unknown },
): string | undefined {
  if (existing.type !== 'meter_credit' || wanted.type !== 'meter_credit') return undefined
  const live = (existing.properties ?? {}) as { units?: unknown, rollover?: unknown }
  const catalog = (wanted.properties ?? {}) as { units?: unknown, rollover?: unknown }
  const parts: string[] = []
  if (typeof live.units === 'number' && live.units !== catalog.units) parts.push(`grants ${live.units} units, catalog says ${String(catalog.units)}`)
  if (typeof live.rollover === 'boolean' && live.rollover !== catalog.rollover) parts.push(`rollover ${live.rollover ? 'on' : 'off'}, catalog says ${catalog.rollover ? 'on' : 'off'}`)
  return parts.length > 0 ? parts.join('; ') : undefined
}

/** A benefit as a listed product carries it: what it grants, and its catalog key. */
export interface CarriedBenefit { id: string, type?: string, properties?: { meterId?: unknown }, metadata?: Record<string, unknown> }

/** A benefit the catalog gives a product: its id, its catalog key, and the meter a credit grant credits. */
export interface WantedBenefit { id: string, key: string, meterId?: string }

/**
 * The catalog's benefits a product lacks (`missing`, by id), and the credit
 * grants among them it can't take (`doubled`): one on a meter the product
 * grants on already, with the benefit it grants there instead, by key.
 */
export function missingBenefits(carried: CarriedBenefit[], wanted: WantedBenefit[]): { missing: string[], doubled: Array<{ key: string, granted: string }> } {
  const carriedIds = new Set(carried.map(benefit => benefit.id))
  const onMeter = (meterId: string | undefined) => meterId === undefined ? undefined : carried.find(benefit => benefit.type === 'meter_credit' && benefit.properties?.meterId === meterId)
  const missing: string[] = []
  const doubled: Array<{ key: string, granted: string }> = []
  for (const benefit of wanted) {
    if (carriedIds.has(benefit.id) || missing.includes(benefit.id)) continue
    const rival = onMeter(benefit.meterId)
    if (rival) doubled.push({ key: benefit.key, granted: typeof rival.metadata?.key === 'string' ? rival.metadata.key : rival.id })
    else missing.push(benefit.id)
  }
  return { missing, doubled }
}

/**
 * The log entry for an object that already exists at the provider: plain
 * `exists`, or `drift` carrying what no longer matches the catalog and what
 * to do about it. Created objects are never rewritten — the provider forbids
 * it once they carry usage or orders — so drift is reported, not repaired.
 */
export function existsOrDrift(
  kind: SyncLogEntry['kind'],
  key: string,
  id: string,
  drifted: string | undefined,
  remedy: string,
): SyncLogEntry {
  if (!drifted) return { action: 'exists', kind, key, id }
  return { action: 'drift', kind, key, id, note: `${drifted} — ${remedy}` }
}

/** The organization's default presentment currency, lower-cased, or `undefined` when it cannot be read (a token without the organizations scope). */
async function readOrganizationCurrency(client: Polar): Promise<string | undefined> {
  try {
    const organizations = await organizationsListOrganizations(client, { limit: 1 })
    const currency = organizations.ok ? organizations.value?.result.items[0]?.defaultPresentmentCurrency : undefined
    return typeof currency === 'string' ? currency.toLowerCase() : undefined
  }
  catch {
    return undefined
  }
}

/**
 * The currency every fixed and metered price is created in, and the
 * organization's default presentment currency, which the provider wants on
 * every product it makes. The first is the catalog's `currency` when
 * pinned, else the organization's. Both are left to the provider default
 * only when the organization cannot be read (a token without the
 * organizations scope): the log calls that out for a catalog that pins none.
 */
export async function resolvePriceCurrency(catalog: BillingCatalog, client: Polar, log: SyncLogEntry[]): Promise<{ currency: PriceCurrency | undefined, organizationCurrency: string | undefined }> {
  const pinned = catalog.currency ? catalog.currency.toLowerCase() as PriceCurrency : undefined
  if (!catalog.plans && !catalog.packs) return { currency: pinned, organizationCurrency: undefined }
  const organizationCurrency = await readOrganizationCurrency(client)
  if (pinned) return { currency: pinned, organizationCurrency }
  if (!organizationCurrency) {
    log.push({ action: 'warn', kind: 'currency', key: 'provider default', note: 'organization unreadable — set `currency` in the catalog to pin one' })
    return { currency: undefined, organizationCurrency }
  }
  log.push({ action: 'exists', kind: 'currency', key: organizationCurrency, note: 'organization default — set `currency` in the catalog to pin one' })
  return { currency: organizationCurrency as PriceCurrency, organizationCurrency }
}

/**
 * A custom field's create payload. The provider's create schema is a
 * discriminated union — one member per field type — so the switch is what
 * makes `type` narrow rather than a cast.
 */
export function customFieldCreatePayload(key: string, field: CatalogCustomField): Parameters<typeof customFieldsCreate>[1] {
  const base = {
    slug: field.slug ?? key,
    name: field.name ?? key,
    metadata: { managedBy: MANAGED_BY, key },
  }
  switch (field.type) {
    case 'select':
      return { ...base, type: 'select', properties: { options: field.options ?? [] } }
    case 'number':
      return { ...base, type: 'number', properties: {} }
    case 'checkbox':
      return { ...base, type: 'checkbox', properties: {} }
    case 'date':
      return { ...base, type: 'date', properties: {} }
    default:
      return { ...base, type: 'text', properties: {} }
  }
}
