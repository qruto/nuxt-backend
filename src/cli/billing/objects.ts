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

/**
 * What an existing managed product no longer matches in the catalog: its
 * display name, or the amount of its single fixed price (the shape this
 * CLI creates). Returns `undefined` when they agree, or when the live
 * product has a price shape this cannot compare.
 */
export function describeProductDrift(
  existing: { name?: string, prices?: Array<Record<string, unknown>> },
  wanted: Parameters<typeof productsCreate>[1],
): string | undefined {
  const parts: string[] = []
  if (typeof existing.name === 'string' && existing.name !== wanted.name) {
    parts.push(`named "${existing.name}", catalog says "${wanted.name}"`)
  }
  const wantedPrice = (wanted.prices ?? []).find(price => 'priceAmount' in price) as { priceAmount?: number } | undefined
  const livePrices = (existing.prices ?? []).filter(price => price.amountType === 'fixed')
  const livePrice = livePrices.length === 1 ? livePrices[0] as { priceAmount?: number } : undefined
  if (wantedPrice?.priceAmount !== undefined && livePrice?.priceAmount !== undefined && livePrice.priceAmount !== wantedPrice.priceAmount) {
    parts.push(`priced ${livePrice.priceAmount}, catalog says ${wantedPrice.priceAmount}`)
  }
  return parts.length > 0 ? parts.join('; ') : undefined
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

/**
 * The currency every fixed and metered price is created in: the catalog's
 * `currency` when pinned, else the organization's default presentment
 * currency — the provider rejects a product whose prices miss it. Left to
 * the provider default only when the organization cannot be read (a token
 * without the organizations scope), which the log calls out.
 */
export async function resolvePriceCurrency(catalog: BillingCatalog, client: Polar, log: SyncLogEntry[]): Promise<PriceCurrency | undefined> {
  if (catalog.currency) return catalog.currency.toLowerCase() as PriceCurrency
  if (!catalog.plans && !catalog.packs) return undefined
  let organizations: Awaited<ReturnType<typeof organizationsListOrganizations>> | undefined
  try {
    organizations = await organizationsListOrganizations(client, { limit: 1 })
  }
  catch {
    organizations = undefined
  }
  const organization = organizations?.ok ? organizations.value?.result.items[0] : undefined
  if (!organization) {
    log.push({ action: 'warn', kind: 'currency', key: 'provider default', note: 'organization unreadable — set `currency` in the catalog to pin one' })
    return undefined
  }
  const currency = organization.defaultPresentmentCurrency as PriceCurrency
  log.push({ action: 'exists', kind: 'currency', key: currency, note: 'organization default — set `currency` in the catalog to pin one' })
  return currency
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
