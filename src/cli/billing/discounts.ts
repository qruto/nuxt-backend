import type { Polar } from '@polar-sh/sdk'
import { discountsCreate } from '@polar-sh/sdk/funcs/discountsCreate.js'
import { discountsList } from '@polar-sh/sdk/funcs/discountsList.js'
import { discountsUpdate } from '@polar-sh/sdk/funcs/discountsUpdate.js'
import { type BillingCatalog, type CatalogDiscount, DISCOUNT_CODE, discountMonths, discountProductKeys, freePlanOf, packPricesByCurrency, planPricesByCurrency, pricedIntervals } from '../../convex/catalog'
import type { BillingCatalogDiscount } from '../../convex/integrations/billing/types/records'
import { type DiscountLimitTarget, readPerCustomerLimit, writePerCustomerLimit } from './discount-limit'
import { listAllPages, MANAGED_BY, type CatalogIds, type SyncLogEntry } from './provider'

// The catalog's promotions against the provider's discounts, for `billing
// sync`. Each discount is found by its managed tag, reading the whole list
// (the provider's list has no metadata filter), and kept in line in place:
// its name, code, dates, redemption cap and product scope always; its
// amount and months only while nobody has redeemed it. A change the
// provider refuses on a redeemed discount (the amount, the months) or on
// any (the type, the duration) is drift: retire the key and declare the new
// terms under another. Nothing is ended unless the catalog retires it.

type DiscountPayload = Parameters<typeof discountsCreate>[1]
type DiscountPatch = Parameters<typeof discountsUpdate>[1]['discountUpdate']

/** A discount as the provider lists it, with the fields the sync reads. */
interface LiveDiscount {
  id: string
  name: string
  code: string | null
  type: string
  basisPoints?: number
  amounts?: Record<string, number>
  duration: string
  durationInMonths?: number
  startsAt: Date | null
  endsAt: Date | null
  maxRedemptions: number | null
  redemptionsCount: number
  products: Array<{ id: string }>
  metadata: Record<string, unknown>
  createdAt: Date
}

/** What one catalog discount asks of the provider, in its terms. */
interface WantedDiscount {
  name: string
  code: string | null
  type: 'percentage' | 'fixed'
  basisPoints?: number
  amounts?: Record<string, number>
  duration: 'once' | 'forever' | 'repeating'
  months?: number
  startsAt: Date | null
  endsAt: Date | null
  maxRedemptions: number | null
  perCustomer: number | null
  productIds: string[]
}

const refuse = (key: string, message: string): never => {
  throw new Error(`[nuxt-backend] billing sync: discount '${key}' ${message}`)
}

/** A catalog date as a `Date`; `null` when unset. */
function dateOf(key: string, field: string, value: string | Date | undefined): Date | null {
  if (value === undefined) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) refuse(key, `has a \`${field}\` that is no date: ${String(value)}.`)
  return date
}

const isWhole = (value: unknown, min = 1): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min

/** A plan or pack named by a discount's scope, refused when the catalog has no such one or does not sell it. */
function requireScope(key: string, discount: CatalogDiscount, catalog: BillingCatalog): void {
  const { plans = [], packs = [], interval } = discount.products ?? {}
  if (plans.length + packs.length === 0) refuse(key, 'applies to nothing: list the `plans` or `packs` it is for in `products` — a discount never applies to every product.')
  const free = freePlanOf(catalog)?.[0]
  for (const plan of plans) {
    const declared = catalog.plans?.[plan]
    if (!declared) refuse(key, `names plan '${plan}', which the catalog does not declare.`)
    if (declared!.retired) refuse(key, `names plan '${plan}', which is retired: it sells to nobody new.`)
    if (plan === free) refuse(key, `names the free plan '${plan}': nobody pays for it, and nobody checks it out.`)
    if (interval && !pricedIntervals(declared!).includes(interval)) refuse(key, `is for plan '${plan}' at '${interval}', which the plan has no price at.`)
  }
  for (const pack of packs) {
    if (!catalog.packs?.[pack]) refuse(key, `names pack '${pack}', which the catalog does not declare.`)
  }
}

/** Refuse an amount off that is neither a percentage nor a fixed amount, or both. */
function requireAmount(key: string, discount: CatalogDiscount): void {
  const { percentOff, amountOff } = discount as { percentOff?: unknown, amountOff?: unknown }
  if ((percentOff === undefined) === (amountOff === undefined)) refuse(key, 'needs one of `percentOff` and `amountOff`.')
  const twoDecimals = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-9
  if (percentOff !== undefined && !(typeof percentOff === 'number' && percentOff > 0 && percentOff <= 100 && twoDecimals(percentOff))) {
    refuse(key, 'needs a `percentOff` above 0 and at most 100, with at most two decimals.')
  }
  if (amountOff === undefined) return
  const amounts = typeof amountOff === 'number' ? [amountOff] : Object.values(amountOff ?? {})
  if (amounts.length === 0 || !amounts.every(amount => isWhole(amount))) refuse(key, 'needs an `amountOff` in whole cents above 0, in every currency it names.')
}

/** Refuse a duration the provider does not take, or one that would discount a whole year. */
function requireDuration(key: string, discount: CatalogDiscount, catalog: BillingCatalog): void {
  const { duration } = discount
  const months = discountMonths(duration)
  if (duration !== 'once' && duration !== 'forever' && !isWhole(months)) refuse(key, 'needs a `duration` of \'once\', \'forever\' or { months } (a whole number of months).')
  if (months !== undefined && months > 999) refuse(key, 'lasts more than 999 months.')
  const yearly = discountProductKeys(discount, catalog).some(product => product.endsWith(':year'))
  if (months !== undefined && yearly && months % 12 !== 0) {
    refuse(key, `lasts ${months} months and applies to a yearly price, whose first payment covers a whole year: set \`products.interval: 'month'\`, or a number of months that is whole years.`)
  }
}

/**
 * Refuse a catalog whose discounts the provider would refuse, or that
 * would give away more than it says, before anything is asked of it. A
 * retired discount is only ended, whatever its terms say now.
 *
 * @internal
 */
export function refuseInvalidDiscounts(catalog: BillingCatalog): void {
  const codes = new Map<string, string>()
  for (const [key, discount] of Object.entries(catalog.discounts ?? {})) {
    if (discount.retired) continue
    if (typeof discount.name !== 'string' || discount.name.trim() === '') refuse(key, 'needs a `name`: the customer sees it at checkout.')
    requireAmount(key, discount)
    requireDuration(key, discount, catalog)
    requireScope(key, discount, catalog)
    requireCode(key, discount, codes)
    requireLimits(key, discount)
  }
}

/**
 * Refuse a code that is no code, one another discount of the catalog has
 * (`codes` holds them, lower-case, by the key that took each), and a 100%
 * forever discount anyone with its code could take.
 */
function requireCode(key: string, discount: CatalogDiscount, codes: Map<string, string>): void {
  if (discount.code === undefined) return
  if (!DISCOUNT_CODE.test(discount.code)) refuse(key, 'has a `code` that is not 3 to 64 letters and digits.')
  const taken = codes.get(discount.code.toLowerCase())
  if (taken) refuse(key, `has the code of discount '${taken}': a code names one discount.`)
  codes.set(discount.code.toLowerCase(), key)
  if ((discount as { percentOff?: number }).percentOff === 100 && discount.duration === 'forever') {
    refuse(key, 'is 100% off forever with a code: anyone who finds the code gets the plan for nothing, for good. Remove the code and apply it from the server.')
  }
}

/** Refuse caps that are no whole number above zero, and dates that are no dates or end before they start. */
function requireLimits(key: string, discount: CatalogDiscount): void {
  for (const field of ['maxRedemptions', 'perCustomer'] as const) {
    if (discount[field] !== undefined && !isWhole(discount[field])) refuse(key, `needs \`${field}\` as a whole number above 0.`)
  }
  const startsAt = dateOf(key, 'startsAt', discount.startsAt)
  const endsAt = dateOf(key, 'endsAt', discount.endsAt)
  if (startsAt && endsAt && endsAt <= startsAt) refuse(key, 'ends before it starts.')
}

/** The currencies a product is priced in: a plan's or a pack's, lower-case; `currency` for one priced in the catalog's. */
function productCurrencies(catalog: BillingCatalog, discount: CatalogDiscount, currency: string | undefined): Set<string | undefined> {
  const { plans = [], packs = [] } = discount.products ?? {}
  return new Set([
    ...plans.flatMap(plan => planPricesByCurrency(catalog.plans![plan]!, currency).map(([code]) => code)),
    ...packs.flatMap(pack => packPricesByCurrency(catalog.packs![pack]!, currency).map(([code]) => code)),
  ])
}

/** A fixed discount's amount per currency, refused unless it names every currency its products are priced in. */
function fixedAmounts(key: string, catalog: BillingCatalog, discount: CatalogDiscount, currency: string | undefined): Record<string, number> {
  const amountOff = (discount as { amountOff: number | Record<string, number> }).amountOff
  const priced = productCurrencies(catalog, discount, currency)
  if (typeof amountOff === 'number') {
    if (!currency) refuse(key, 'has an `amountOff` without a currency, and the organization\'s default currency could not be read: set `currency` in the catalog, or name it (`amountOff: { usd: 500 }`).')
    const others = [...priced].filter(code => code !== currency)
    if (others.length > 0) refuse(key, `has one \`amountOff\` while its products are priced in ${others.join(', ')} too: name an amount for each currency.`)
    return { [currency!]: amountOff }
  }
  const amounts = Object.fromEntries(Object.entries(amountOff).map(([code, amount]) => [code.toLowerCase(), amount]))
  const codes = [...priced].map(code => code ?? currency)
  if (codes.includes(undefined)) refuse(key, 'is a fixed amount off products priced in the organization\'s default currency, which could not be read: set `currency` in the catalog.')
  const missing = codes.filter(code => !(code! in amounts))
  if (missing.length > 0) refuse(key, `has no \`amountOff\` in ${missing.join(', ')}, which its products are priced in: the provider would not take it off there.`)
  return amounts
}

/**
 * Refuse a fixed discount that does not name an amount in every currency
 * its products are priced in, once the catalog's currency is known and
 * before anything is created.
 *
 * @internal
 */
export function refuseUnpricedDiscounts(catalog: BillingCatalog, currency: string | undefined): void {
  for (const [key, discount] of Object.entries(catalog.discounts ?? {})) {
    if (!discount.retired && (discount as { amountOff?: unknown }).amountOff !== undefined) fixedAmounts(key, catalog, discount, currency)
  }
}

/** What one catalog discount asks of the provider. */
function wantedOf(key: string, discount: CatalogDiscount, catalog: BillingCatalog, currency: string | undefined, ids: CatalogIds): WantedDiscount {
  const months = discountMonths(discount.duration)
  const percentOff = (discount as { percentOff?: number }).percentOff
  return {
    name: discount.name,
    code: discount.code ?? null,
    ...(percentOff === undefined
      ? { type: 'fixed' as const, amounts: fixedAmounts(key, catalog, discount, currency) }
      : { type: 'percentage' as const, basisPoints: Math.round(percentOff * 100) }),
    duration: months === undefined ? discount.duration as 'once' | 'forever' : 'repeating',
    ...(months === undefined ? {} : { months }),
    startsAt: dateOf(key, 'startsAt', discount.startsAt),
    endsAt: dateOf(key, 'endsAt', discount.endsAt),
    maxRedemptions: discount.maxRedemptions ?? null,
    perCustomer: discount.perCustomer ?? null,
    productIds: discountProductKeys(discount, catalog).flatMap(product => ids.products[product] ?? []),
  }
}

/** The create payload of a wanted discount, tagged with its key. */
function createPayload(key: string, wanted: WantedDiscount): DiscountPayload {
  const base = {
    name: wanted.name,
    code: wanted.code,
    startsAt: wanted.startsAt,
    endsAt: wanted.endsAt,
    maxRedemptions: wanted.maxRedemptions,
    products: wanted.productIds,
    duration: wanted.duration,
    ...(wanted.months === undefined ? {} : { durationInMonths: wanted.months }),
    metadata: { managedBy: MANAGED_BY, key },
  }
  return wanted.type === 'percentage'
    ? { ...base, type: 'percentage', basisPoints: wanted.basisPoints! }
    : { ...base, type: 'fixed', amounts: wanted.amounts! }
}

const time = (date: Date | null | undefined) => (date ? new Date(date).getTime() : null)
const sameAmounts = (a: Record<string, number> | undefined, b: Record<string, number> | undefined) =>
  JSON.stringify(Object.entries(a ?? {}).sort()) === JSON.stringify(Object.entries(b ?? {}).sort())

/** One field a discount's patch sets: the provider's name for it, its value, and the catalog's name for it in the log. */
interface PatchedField {
  field: keyof DiscountPatch
  value: unknown
  label: string
}

const sortedIds = (ids: string[]) => [...ids].sort().join()

/** The fields the catalog moved that may always change: name, code, dates, cap and products. */
function mutableChanges(live: LiveDiscount, wanted: WantedDiscount): PatchedField[] {
  const fields: Array<[keyof DiscountPatch, boolean, unknown]> = [
    ['name', live.name !== wanted.name, wanted.name],
    ['code', live.code !== wanted.code, wanted.code],
    ['startsAt', time(live.startsAt) !== time(wanted.startsAt), wanted.startsAt],
    ['endsAt', time(live.endsAt) !== time(wanted.endsAt), wanted.endsAt],
    ['maxRedemptions', live.maxRedemptions !== wanted.maxRedemptions, wanted.maxRedemptions],
    ['products', sortedIds(live.products.map(product => product.id)) !== sortedIds(wanted.productIds), wanted.productIds],
  ]
  return fields.filter(([, changed]) => changed).map(([field, , value]) => ({ field, value, label: field }))
}

/**
 * The terms the catalog moved that may change only while nobody has
 * redeemed the discount: its amount and its months, each with what the
 * drift says of it.
 */
function termChanges(live: LiveDiscount, wanted: WantedDiscount): Array<PatchedField & { says: string }> {
  const changes: Array<PatchedField & { says: string }> = []
  if (wanted.type === 'percentage' && live.basisPoints !== wanted.basisPoints) {
    changes.push({ field: 'basisPoints', value: wanted.basisPoints, label: 'percentOff', says: `${(live.basisPoints ?? 0) / 100}% off, catalog says ${wanted.basisPoints! / 100}%` })
  }
  if (wanted.type === 'fixed' && !sameAmounts(live.amounts, wanted.amounts)) {
    changes.push({ field: 'amounts', value: wanted.amounts, label: 'amountOff', says: `takes off ${JSON.stringify(live.amounts ?? {})}, catalog says ${JSON.stringify(wanted.amounts)}` })
  }
  if (wanted.months !== undefined && live.durationInMonths !== wanted.months) {
    changes.push({ field: 'durationInMonths', value: wanted.months, label: 'months', says: `lasts ${live.durationInMonths ?? '?'} months, catalog says ${wanted.months}` })
  }
  return changes
}

/**
 * How a live discount differs from the catalog's: the patch that brings
 * it in line, and what can't be patched (drift). The provider never
 * changes a type or a duration, and keeps the amount and the months once
 * the discount is redeemed.
 */
function compare(live: LiveDiscount, wanted: WantedDiscount): { patch: DiscountPatch, fields: string[], drift: string[] } {
  const fixed = [
    live.type === wanted.type ? null : `a ${live.type} discount, catalog says ${wanted.type}`,
    live.duration === wanted.duration ? null : `lasts ${live.duration}, catalog says ${wanted.duration}`,
  ].filter((entry): entry is string => entry !== null)
  const terms = fixed.length > 0 ? [] : termChanges(live, wanted)
  const redeemed = live.redemptionsCount > 0
  const changes = [...mutableChanges(live, wanted), ...(redeemed ? [] : terms)]
  return {
    patch: Object.fromEntries(changes.map(change => [change.field, change.value])) as DiscountPatch,
    fields: changes.map(change => change.label),
    drift: [...fixed, ...(redeemed ? terms.map(change => change.says) : [])],
  }
}

/**
 * The terms a discount carries in the generated map, as the provider
 * holds them: what checkout applies by key and `getPricing` shows.
 *
 * @internal
 */
export function discountTerms(live: LiveDiscount): BillingCatalogDiscount {
  const iso = (date: Date | null) => (date ? new Date(date).toISOString() : undefined)
  const startsAt = iso(live.startsAt)
  const endsAt = iso(live.endsAt)
  return {
    id: live.id,
    name: live.name,
    ...(live.code ? { code: live.code } : {}),
    ...(live.type === 'percentage' ? { percentOff: (live.basisPoints ?? 0) / 100 } : { amountOff: live.amounts ?? {} }),
    duration: live.duration as BillingCatalogDiscount['duration'],
    ...(live.duration === 'repeating' && live.durationInMonths !== undefined ? { months: live.durationInMonths } : {}),
    ...(startsAt ? { startsAt } : {}),
    ...(endsAt ? { endsAt } : {}),
    productIds: live.products.map(product => product.id),
  }
}

/** Whether a managed discount was retired: ended, its code freed, tagged so the key finds it no more. */
const isRetiredTag = (metadata: Record<string, unknown>) => metadata.retired === true

/** What a public promotion lacks to keep it from running without limit. */
function openEnded(discount: CatalogDiscount): string[] {
  return [
    discount.maxRedemptions === undefined ? 'maxRedemptions' : null,
    discount.endsAt === undefined ? 'endsAt' : null,
    discount.perCustomer === undefined ? 'perCustomer' : null,
  ].filter((field): field is string => field !== null)
}

export interface DiscountSyncContext {
  client: Polar
  /** Where the per-customer limit's raw calls go. */
  limitTarget: DiscountLimitTarget
  /** The products' ids, written by the sync before the discounts. */
  ids: CatalogIds
  currency: string | undefined
  dryRun: boolean
  adopt: Record<string, string>
  log: SyncLogEntry[]
}

/**
 * Push the catalog's discounts: retire, then find or create, patch, set the
 * per-customer limit; record their terms in `ids.discounts`; report managed
 * discounts whose key left the catalog. Only called for a catalog that
 * declares discounts, so a token without the discounts scope keeps working
 * for one that does not.
 *
 * @internal
 */
export async function syncDiscounts(catalog: BillingCatalog, context: DiscountSyncContext): Promise<void> {
  const { client, ids } = context
  const now = Date.now()
  const listed = await listAllPages(page => discountsList(client, { limit: 100, page })) as unknown as LiveDiscount[]
  const managed = listed.filter(discount => discount.metadata?.managedBy === MANAGED_BY)
  const live = (key: string) => managed.filter(discount => discount.metadata.key === key && !isRetiredTag(discount.metadata))
  const recorded: Record<string, BillingCatalogDiscount> = {}
  // Retired first: a retired discount frees the code a new key may take over.
  const entries = Object.entries(catalog.discounts ?? {}).sort(([, a], [, b]) => Number(Boolean(b.retired)) - Number(Boolean(a.retired)))
  for (const [key, discount] of entries) {
    if (discount.retired) await retireDiscount(key, live(key), context, now)
    else if (context.adopt[key]) adoptDiscount(key, listed, recorded, context)
    else await syncDiscount(key, discount, live(key), catalog, recorded, context, now)
  }
  if (Object.keys(recorded).length > 0) ids.discounts = recorded
  reportLeftKeys(catalog, managed, context.log)
}

/** Record an adopted discount's terms under its key, as it is; say so when the provider has no such id. */
function adoptDiscount(key: string, listed: LiveDiscount[], recorded: Record<string, BillingCatalogDiscount>, { adopt, log }: DiscountSyncContext): void {
  const adopted = listed.find(item => item.id === adopt[key])
  if (adopted) recorded[key] = discountTerms(adopted)
  log.push(adopted
    ? { action: 'adopted', kind: 'discount', key, id: adopt[key], note: 'left as it is' }
    : { action: 'warn', kind: 'discount', key, id: adopt[key], note: 'no discount at the provider has this id: nothing was recorded for the key' })
}

/**
 * One catalog discount: the newest the provider has for its key kept in
 * line, or a new one, its per-customer limit set, and its terms recorded.
 */
async function syncDiscount(key: string, discount: CatalogDiscount, found: LiveDiscount[], catalog: BillingCatalog, recorded: Record<string, BillingCatalogDiscount>, context: DiscountSyncContext, now: number): Promise<void> {
  const { ids, currency, log } = context
  const wanted = wantedOf(key, discount, catalog, currency, ids)
  if (found.length > 1) log.push({ action: 'warn', kind: 'discount', key, note: `${found.length} discounts at the provider carry this key: the newest is kept in line, the others are left as they are` })
  const existing = found.sort((a, b) => time(b.createdAt)! - time(a.createdAt)!)[0]
  // A product with no id yet (a dry run's would-create) can't be named, and
  // the provider reads a discount for no products as one for every product.
  const unsynced = discountProductKeys(discount, catalog).filter(product => !ids.products[product])
  if (unsynced.length > 0) {
    if (!context.dryRun) refuse(key, `applies to ${unsynced.join(', ')}, which the sync has no product id for: it never pushes a discount for fewer products, or for every one.`)
    log.push({ action: existing ? 'would-update' : 'would-create', kind: 'discount', key, ...(existing ? { id: existing.id } : {}), note: `once ${unsynced.join(', ')} exist` })
    return
  }
  const open = discount.code ? openEnded(discount) : []
  if (open.length > 0) log.push({ action: 'warn', kind: 'discount', key, note: `a public code with no ${open.join(', ')}: coupon sites list codes, and anyone who finds it may redeem it without that limit` })
  const synced = existing ? await updateDiscount(key, existing, wanted, context, now) : await createDiscount(key, wanted, context)
  if (!synced) return
  recorded[key] = discountTerms(synced)
  await alignPerCustomer(key, synced.id, wanted.perCustomer, context)
}

/** Report each managed discount whose key left the catalog: it stays redeemable, and nothing ends it but a retirement. */
function reportLeftKeys(catalog: BillingCatalog, managed: LiveDiscount[], log: SyncLogEntry[]): void {
  const known = new Set(Object.keys(catalog.discounts ?? {}))
  for (const discount of managed) {
    const key = typeof discount.metadata.key === 'string' ? discount.metadata.key : ''
    if (key && !known.has(key) && !isRetiredTag(discount.metadata)) {
      log.push({ action: 'drift', kind: 'discount', key, id: discount.id, note: 'managed remotely but no longer in the catalog: it stays redeemable until it is retired (`retired: true`) or ended at the provider' })
    }
  }
}

/** Create a discount the provider has none of for its key; on a dry run, only say so. */
async function createDiscount(key: string, wanted: WantedDiscount, { client, dryRun, log }: DiscountSyncContext): Promise<LiveDiscount | undefined> {
  if (dryRun) {
    log.push({ action: 'would-create', kind: 'discount', key })
    return undefined
  }
  const created = await discountsCreate(client, createPayload(key, wanted))
  if (!created.ok) throw created.error
  log.push({ action: 'created', kind: 'discount', key, id: created.value.id })
  return created.value as unknown as LiveDiscount
}

/**
 * Bring an existing discount in line: patch what may change, report what
 * may not. A later end on a public discount that has started is a new
 * promotion, not the same one running longer: said, and patched.
 */
async function updateDiscount(key: string, existing: LiveDiscount, wanted: WantedDiscount, { client, dryRun, log }: DiscountSyncContext, now: number): Promise<LiveDiscount> {
  const { patch, fields, drift } = compare(existing, wanted)
  const started = (time(existing.startsAt) ?? time(existing.createdAt)!) <= now
  const liveEnd = time(existing.endsAt)
  const wantedEnd = time(wanted.endsAt)
  if (wanted.code && started && liveEnd !== null && (wantedEnd === null || wantedEnd > liveEnd)) {
    log.push({ action: 'warn', kind: 'discount', key, note: `its end moves from ${new Date(liveEnd).toISOString()} to ${wantedEnd === null ? 'never' : new Date(wantedEnd).toISOString()} after it started: a deadline that moves is not a real one — announce the later end as a new promotion` })
  }
  if (drift.length > 0) {
    log.push({ action: 'drift', kind: 'discount', key, id: existing.id, note: `${drift.join('; ')} — the provider keeps these once a discount is redeemed (its type and duration always): retire the key and declare the new terms under another` })
  }
  if (fields.length === 0) {
    if (drift.length === 0) log.push({ action: 'exists', kind: 'discount', key, id: existing.id })
    return existing
  }
  if (dryRun) {
    log.push({ action: 'would-update', kind: 'discount', key, id: existing.id, note: fields.join(', ') })
    return existing
  }
  const updated = await discountsUpdate(client, { id: existing.id, discountUpdate: patch })
  if (!updated.ok) throw updated.error
  log.push({ action: 'updated', kind: 'discount', key, id: existing.id, note: fields.join(', ') })
  return updated.value as unknown as LiveDiscount
}

/**
 * Retire a discount: end it now (unless it ended already), free its code,
 * and tag it retired, so its key finds it no more. Whoever redeemed it
 * keeps it for its duration.
 */
async function retireDiscount(key: string, found: LiveDiscount[], { client, dryRun, log }: DiscountSyncContext, now: number): Promise<void> {
  if (found.length === 0) {
    log.push({ action: 'exists', kind: 'discount', key, note: 'retired' })
    return
  }
  for (const discount of found) {
    if (dryRun) {
      log.push({ action: 'would-archive', kind: 'discount', key, id: discount.id, note: 'would end now and free its code' })
      continue
    }
    const ended = time(discount.endsAt)
    const updated = await discountsUpdate(client, {
      id: discount.id,
      discountUpdate: {
        ...(ended === null || ended > now ? { endsAt: new Date(now) } : {}),
        code: null,
        metadata: { ...discount.metadata as Record<string, string | number | boolean>, managedBy: MANAGED_BY, key, retired: true },
      },
    })
    if (!updated.ok) throw updated.error
    log.push({ action: 'archived', kind: 'discount', key, id: discount.id, note: 'ended, its code freed; whoever redeemed it keeps it for its duration' })
  }
}

/**
 * Set the per-customer limit through the raw helper when it differs (on a
 * dry run, only say so); a failure is said, not thrown.
 */
async function alignPerCustomer(key: string, id: string, wanted: number | null, { limitTarget, dryRun, log }: DiscountSyncContext): Promise<void> {
  try {
    const current = await readPerCustomerLimit(limitTarget, id)
    if (current === wanted) return
    if (dryRun) {
      log.push({ action: 'would-update', kind: 'discount', key, id, note: `per-customer limit ${current ?? 'none'} → ${wanted ?? 'none'}` })
      return
    }
    await writePerCustomerLimit(limitTarget, id, wanted)
    log.push({ action: 'updated', kind: 'discount', key, id, note: wanted === null ? 'per-customer limit lifted' : `at most ${wanted} per customer` })
  }
  catch (error) {
    log.push({ action: 'warn', kind: 'discount', key, id, note: `the per-customer limit could not be read or set (${error instanceof Error ? error.message : String(error)}): set it in the provider's dashboard` })
  }
}

/**
 * The catalog's forever discounts that apply to some plans and not others:
 * a forever discount follows its subscription onto any plan, so a portal
 * that changes plans carries it beyond its scope.
 *
 * @internal
 */
export function scopedForeverDiscounts(catalog: BillingCatalog): string[] {
  const sold = Object.entries(catalog.plans ?? {}).filter(([key, plan]) => !plan.retired && key !== freePlanOf(catalog)?.[0]).map(([key]) => key)
  return Object.entries(catalog.discounts ?? {})
    .filter(([, discount]) => !discount.retired && discount.duration === 'forever')
    .filter(([, discount]) => {
      const plans = discount.products?.plans ?? []
      return plans.length > 0 && (sold.some(plan => !plans.includes(plan)) || discount.products?.interval !== undefined)
    })
    .map(([key]) => key)
}
