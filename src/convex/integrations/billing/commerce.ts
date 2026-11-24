import { type BillingCatalog, type CatalogInterval, type CatalogPlan, freePlanOf, isFreePlan, packPricesByCurrency, planCreditUnits, planPricesByCurrency, planProductKey, planQuotasKey, pricedIntervals, providerTrialOf, QUOTA_METADATA_PREFIX } from '../../catalog.js'
import { backendError } from '../../errors.js'
import { billingProviderName, createCommerceProvider, isAdapterProvider } from './providers/index.js'
import type { BillingProviderName, CommerceProvider, ProviderEnvironment } from './providers/types.js'
import { ProviderHttpError, ProviderUnsupportedError } from './providers/types.js'
import type { BillingCatalogIds, CreditMeterConfig } from './types/records.js'
import type { BillingComponents, CommerceConfig } from './types/setup.js'

// Adapter mode: billing on a provider served by the neutral adapters
// (Stripe Managed Payments, Dodo, Creem), named by `BILLING_PROVIDER`.
// None of them holds what Polar holds for the package (benefits, meters,
// customer state), so the catalog definition says what each plan and pack
// grants, and the app keeps it: the catalog's products are written to the
// provider component's products table as Polar's sync would write them
// (every read of pricing, features and quotas works on them unchanged), the
// subscriptions a provider delivers are written to its subscriptions table,
// and the credits land on the entitlement cache through the component's
// grant ledger (`components.backend.commerce`).

/** The prefix of an id the app made rather than the provider: the free plan's product, a catalog benefit. */
export const LOCAL_ID_PREFIX = 'local:'

/** Every synthesized row's timestamp: fixed, so a re-sync of an unchanged catalog writes the same row. */
const CATALOG_EPOCH = '2026-01-01T00:00:00.000Z'

/** The organization the synthesized rows name. */
const LOCAL_ORGANIZATION = 'local'

/** The adapter providers. */
export type AdapterProviderName = Exclude<BillingProviderName, 'polar'>

/** Adapter mode as one `setupBilling` call resolved it. */
export interface CommerceMode {
  name: AdapterProviderName
  config: CommerceConfig
  /** The component's records: customers, orders, grants. */
  refs: NonNullable<BillingComponents['backend']['commerce']>
  /** The adapter, built on first use: a deployment without a key still reads. */
  client: () => CommerceProvider
  /** The ids in force: the deployment's billing environment's. */
  ids: BillingCatalogIds
}

/** The free plan's product id, which no provider holds: the app's own. */
export function localPlanProductId(plan: string): string {
  return `${LOCAL_ID_PREFIX}plan:${plan}`
}

/** A catalog meter as the credit guard reads it: the catalog key is its id, as no provider meter exists. */
function localMeters(definition: BillingCatalog): Record<string, CreditMeterConfig> {
  return Object.fromEntries(Object.entries(definition.meters ?? {}).map(([key, meter]) => [key, {
    meterId: key,
    eventName: meter.eventName ?? key,
    // A count meter has no property: a refund of it is refused, as on Polar.
    ...(meter.aggregation === 'count' ? {} : { property: meter.property ?? 'amount' }),
    ...(meter.unit ? { unit: meter.unit } : {}),
  }]))
}

/** Whether the catalog prices its plans and packs in more than one currency. */
export function pricesManyCurrencies(definition: BillingCatalog): boolean {
  const currency = definition.currency?.toLowerCase()
  const codes = new Set([
    ...Object.values(definition.plans ?? {}).flatMap(plan => planPricesByCurrency(plan, currency).map(([code]) => code)),
    ...Object.values(definition.packs ?? {}).flatMap(pack => packPricesByCurrency(pack, currency).map(([code]) => code)),
  ].filter(Boolean))
  return codes.size > 1
}

/** The fallback currency, written as billing sync writes it: for a catalog that prices more than one. */
function currencyOf(definition: BillingCatalog): string | undefined {
  return pricesManyCurrencies(definition) ? definition.currency?.toLowerCase() : undefined
}

/**
 * The generated id map's shape for adapter mode, from the catalog and the
 * provider ids the app named: what `billing sync` writes for Polar. The
 * free plan gets a local product; a product the app named no id for is
 * left out, so it is never sold.
 *
 * @internal
 */
export function adapterCatalogIds(definition: BillingCatalog, providerIds: Readonly<Record<string, string>>): BillingCatalogIds {
  const [free, freePlan] = freePlanOf(definition) ?? []
  const { products, plans } = planIds(definition, providerIds, free)
  const packs = Object.keys(definition.packs ?? {}).filter(key => providerIds[key])
  for (const key of packs) products[key] = providerIds[key]!
  const retired = Object.entries(definition.plans ?? {}).filter(([, plan]) => plan.retired).map(([key]) => key)
  return {
    products,
    plans,
    ...(retired.length > 0 ? { retired } : {}),
    ...(packs.length > 0 ? { packs } : {}),
    meters: localMeters(definition),
    ...optionalIds(definition, free, freePlan),
  }
}

/** Each plan's product ids by interval: the free plan's local one, every other's as the app named them. */
function planIds(definition: BillingCatalog, providerIds: Readonly<Record<string, string>>, free: string | undefined) {
  const products: Record<string, string> = {}
  const plans: NonNullable<BillingCatalogIds['plans']> = {}
  for (const [key, plan] of Object.entries(definition.plans ?? {})) {
    const named = key === free
      ? [['month', localPlanProductId(key)] as const]
      : pricedIntervals(plan).flatMap(interval => providerIds[planProductKey(key, interval)] ? [[interval, providerIds[planProductKey(key, interval)]!] as const] : [])
    for (const [interval, id] of named) {
      products[key === free ? key : planProductKey(key, interval)] = id
      plans[key] = { ...plans[key], [interval]: id }
    }
  }
  return { products, plans }
}

/** The id map's entries a catalog may leave out: the quotas, the free plan and its welcome credits, the fallback currency. */
function optionalIds(definition: BillingCatalog, free: string | undefined, freePlan: CatalogPlan | undefined): Partial<BillingCatalogIds> {
  const quotas = Object.entries(definition.quotas ?? {})
  const welcome = freePlan?.credits?.once && typeof freePlan.credits.units === 'number' ? { meter: freePlan.credits.meter, units: freePlan.credits.units } : undefined
  const currency = currencyOf(definition)
  return {
    ...(quotas.length > 0 ? { quotas: Object.fromEntries(quotas.map(([key, { description }]) => [key, description])) } : {}),
    ...(free ? { free } : {}),
    // Welcome credits are no benefit: the runtime grants them once, as the plan first starts.
    ...(welcome ? { welcome } : {}),
    ...(currency ? { currency } : {}),
  }
}

/** A benefit row as the provider component's products table keeps one. */
function benefitRow(id: string, type: string, description: string, metadata: Record<string, string | number | boolean>, properties: Record<string, unknown> = {}) {
  return { id, createdAt: CATALOG_EPOCH, modifiedAt: CATALOG_EPOCH, type, description, selectable: false, deletable: false, organizationId: LOCAL_ORGANIZATION, metadata, properties }
}

/** The benefits a plan's product at `interval` carries: its features, its quotas, its credit grant. */
function planBenefits(definition: BillingCatalog, key: string, plan: CatalogPlan, interval: CatalogInterval, productKey: string) {
  const benefits = (plan.features ?? []).map(feature => benefitRow(`${LOCAL_ID_PREFIX}feature:${feature}`, 'feature_flag', definition.features?.[feature]?.description ?? feature, { key: feature }))
  const quotas = Object.entries(plan.quotas ?? {})
  if (quotas.length > 0) {
    benefits.push(benefitRow(`${LOCAL_ID_PREFIX}quotas:${key}`, 'feature_flag', `${plan.name} limits`, { key: planQuotasKey(key), ...Object.fromEntries(quotas.map(([quota, limit]) => [`${QUOTA_METADATA_PREFIX}${quota}`, limit])) }))
  }
  // Welcome credits (`once`) are the runtime's, never a grant every cycle.
  const grantInterval = interval === 'year' && plan.meterCycle === 'month' ? 'month' : interval
  const units = plan.credits && !plan.credits.once ? planCreditUnits(plan.credits, grantInterval) : undefined
  if (plan.credits && units) {
    benefits.push(benefitRow(`${LOCAL_ID_PREFIX}credits:${productKey}`, 'meter_credit', `${units} credits`, { key: `${productKey}-credits` }, { units, rollover: plan.credits.rollover ?? false, meterId: plan.credits.meter }))
  }
  return benefits
}

/** A price row of a synthesized product. */
function priceRow(productId: string, currency: string, amount: number, interval: CatalogInterval | null) {
  return {
    id: `${productId}:${currency}`,
    createdAt: CATALOG_EPOCH,
    modifiedAt: CATALOG_EPOCH,
    amountType: amount === 0 ? 'free' : 'fixed',
    isArchived: false,
    productId,
    priceCurrency: currency,
    priceAmount: amount,
    type: interval ? 'recurring' : 'one_time',
    recurringInterval: interval,
  }
}

/** A product row with the fields every synthesized one shares. */
function productRow(id: string, fields: { name: string, description?: string, interval: CatalogInterval | null, archived: boolean, metadata: Record<string, string>, prices: ReturnType<typeof priceRow>[], benefits: ReturnType<typeof benefitRow>[], trial?: { interval: string, count?: number } }) {
  return {
    id,
    organizationId: LOCAL_ORGANIZATION,
    name: fields.name,
    description: fields.description ?? null,
    isRecurring: fields.interval !== null,
    isArchived: fields.archived,
    createdAt: CATALOG_EPOCH,
    modifiedAt: CATALOG_EPOCH,
    recurringInterval: fields.interval,
    metadata: fields.metadata,
    trialInterval: fields.trial?.interval ?? null,
    trialIntervalCount: fields.trial ? fields.trial.count ?? 1 : null,
    prices: fields.prices,
    benefits: fields.benefits,
    medias: [],
  }
}

/**
 * The catalog's products as the provider component's products table keeps
 * them, by the ids in force: what pricing, features and quotas read. Each
 * product a plan or pack has an id for; prices in every currency the
 * catalog names.
 *
 * @internal
 */
export function catalogProductRows(definition: BillingCatalog, ids: BillingCatalogIds): Array<ReturnType<typeof productRow>> {
  const plans = Object.entries(definition.plans ?? {}).flatMap(([key, plan]) => planRows(definition, ids, key, plan))
  const packs = (ids.packs ?? []).flatMap((key) => {
    const pack = definition.packs?.[key]
    const id = ids.products?.[key]
    return pack && id ? [packRow(definition, key, pack, id)] : []
  })
  return [...plans, ...packs]
}

/** A plan's product rows, one per interval it has an id for. */
function planRows(definition: BillingCatalog, ids: BillingCatalogIds, key: string, plan: CatalogPlan) {
  const trial = isFreePlan(plan) ? undefined : providerTrialOf(plan.trial)
  return (Object.entries(ids.plans?.[key] ?? {}) as Array<[CatalogInterval, string]>).map(([interval, id]) => {
    const productKey = planProductKey(key, interval)
    const prices = planPricesByCurrency(plan, definition.currency).flatMap(([currency, amounts]) => typeof amounts[interval] === 'number' ? [priceRow(id, currency ?? 'usd', amounts[interval], interval)] : [])
    return productRow(id, { name: plan.name, description: plan.description, interval, archived: plan.retired === true, metadata: { key: productKey }, prices, benefits: planBenefits(definition, key, plan, interval, productKey), ...(trial ? { trial } : {}) })
  })
}

/** A pack's product row: one-time, its credits kept. */
function packRow(definition: BillingCatalog, key: string, pack: NonNullable<BillingCatalog['packs']>[string], id: string) {
  const prices = packPricesByCurrency(pack, definition.currency).map(([currency, amount]) => priceRow(id, currency ?? 'usd', amount, null))
  const credits = benefitRow(`${LOCAL_ID_PREFIX}credits:${key}`, 'meter_credit', `${pack.credits.units} credits`, { key: `${key}-credits` }, { units: pack.credits.units, rollover: pack.credits.rollover ?? true, meterId: pack.credits.meter })
  return productRow(id, { name: pack.name, description: pack.description, interval: null, archived: false, metadata: { key }, prices, benefits: [credits] })
}

/** What a catalog product id sells: a plan at an interval, a pack, or nothing of the catalog. */
export type CatalogProduct = { kind: 'plan', key: string, plan: CatalogPlan, interval: CatalogInterval } | { kind: 'pack', key: string } | null

/** The catalog product an id names, by the ids in force. */
export function catalogProductOf(definition: BillingCatalog, ids: BillingCatalogIds, productId: string | null | undefined): CatalogProduct {
  if (!productId) return null
  for (const [key, prices] of Object.entries(ids.plans ?? {})) {
    for (const [interval, id] of Object.entries(prices ?? {})) {
      if (id === productId && definition.plans?.[key]) return { kind: 'plan', key, plan: definition.plans[key], interval: interval as CatalogInterval }
    }
  }
  const pack = (ids.packs ?? []).find(key => ids.products?.[key] === productId)
  return pack ? { kind: 'pack', key: pack } : null
}

/**
 * What an adapter's refusal reads as at the package boundary, like a
 * Polar SDK error through `unwrapProvider`: `unavailable`, reason
 * `provider_unsupported` for a call the provider has no API for (its hint
 * kept, which names what to do instead), else `provider_refused`.
 */
export function commerceFailure(error: unknown, operation: string): Error {
  if (error instanceof ProviderUnsupportedError) {
    return backendError('unavailable', { service: 'billing', reason: 'provider_unsupported' }, error.message)
  }
  if (error instanceof ProviderHttpError || error instanceof TypeError) {
    return backendError('unavailable', { service: 'billing', reason: 'provider_refused' }, `[nuxt-backend] Billing is temporarily unavailable — the provider refused the ${operation}. Try again shortly.`)
  }
  return error instanceof Error ? error : new Error(String(error))
}

/** Run one adapter call, its failure turned into the package's refusal (see {@link commerceFailure}). */
export async function commerceCall<T>(operation: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  }
  catch (error) {
    throw commerceFailure(error, operation)
  }
}

/** The refusal of a feature only Polar serves, on an adapter provider. */
export function polarOnly(name: AdapterProviderName, what: string): Error {
  return backendError('unavailable', { service: 'billing', reason: 'provider_unsupported' }, `[nuxt-backend] Billing: ${what} is Polar's for now — ${name} billing does not offer it.`)
}

/**
 * The Polar SDK client in adapter mode: any use of it is refused (see
 * {@link polarOnly}), so a path the adapters do not serve yet (gifts,
 * passes, discounts, revenue, usage history, rewards) fails clearly
 * instead of calling Polar with a key of another provider.
 */
export function refusingPolarClient<T extends object>(name: AdapterProviderName): T {
  return new Proxy({} as T, {
    get(_target, property) {
      // Promise resolution and inspection probe these: answer them as an object would.
      if (property === 'then' || typeof property === 'symbol') return undefined
      throw polarOnly(name, 'this billing feature')
    },
  })
}

/**
 * Adapter mode for one `setupBilling` call, or `null` on Polar. An adapter
 * provider without `commerce` config, or on a component without its
 * records, is a setup error, said at once.
 */
export function commerceModeOf(components: BillingComponents, config: { commerce?: CommerceConfig }, provider: string | undefined, environment: ProviderEnvironment, accessToken: string | undefined): CommerceMode | null {
  const name = billingProviderName(provider)
  if (!isAdapterProvider(name)) return null
  if (!config.commerce?.definition) {
    throw new TypeError(`[nuxt-backend] setupBilling: BILLING_PROVIDER is ${name}, which needs \`commerce: { definition, products }\` — the catalog (billing.catalog.ts) and ${name}'s id for each product.`)
  }
  const refs = components.backend.commerce
  if (!refs) throw new TypeError(`[nuxt-backend] setupBilling: BILLING_PROVIDER is ${name}, and this backend component has no commerce records — update nuxt-backend.`)
  const commerce = config.commerce
  let client: CommerceProvider | undefined
  return {
    name,
    config: commerce,
    refs,
    client: () => client ??= createCommerceProvider(name, { apiKey: accessToken ?? '', environment, fetch: (input, init) => globalThis.fetch(input, init) }),
    ids: adapterCatalogIds(commerce.definition, commerce.products[environment] ?? {}),
  }
}

/** A lifecycle change as the Polar SDK's `subscriptions.update` takes it: the arms adapter mode reads. */
interface LifecycleUpdate {
  productId?: string | null
  prorationBehavior?: string | null
  cancelAtPeriodEnd?: boolean | null
  revoke?: boolean | null
  pendingUpdate?: null
  pauseAtPeriodEnd?: boolean | null
  resumesAt?: Date | string | null
  resume?: boolean | null
  discountId?: string | null
}

/**
 * Make one lifecycle change at an adapter provider, as Polar's update arm
 * names it, and answer the subscription as the provider now has it, in the
 * shape a lifecycle caller reads (`endsAt`, `currentPeriodEnd` as dates).
 * An arm the adapters have no call for (a scheduled change's removal, a
 * discount, a pause that resumes on a date) is refused as Polar's. A plan
 * change for the next period answers the change it scheduled, which the
 * read back does not show.
 */
export async function applyCommerceUpdate(mode: CommerceMode, subscriptionId: string, update: LifecycleUpdate, operation: string) {
  const client = mode.client()
  await commerceCall(operation, async () => {
    if ('pendingUpdate' in update) throw polarOnly(mode.name, 'taking back a scheduled plan change')
    if ('discountId' in update) throw polarOnly(mode.name, 'a discount on a subscription')
    if (update.pauseAtPeriodEnd && update.resumesAt) throw polarOnly(mode.name, 'a pause that resumes on a date')
    if (update.productId) {
      await client.changePlan({ subscriptionId, productId: update.productId, proration: update.prorationBehavior === 'next_period' ? 'next_period' : 'immediately' })
    }
    else if (update.revoke) await client.cancelSubscription(subscriptionId, { immediately: true })
    else if (update.cancelAtPeriodEnd === true) await client.cancelSubscription(subscriptionId)
    else if (update.cancelAtPeriodEnd === false) await client.uncancelSubscription(subscriptionId)
    else if (update.pauseAtPeriodEnd) await client.pauseSubscription(subscriptionId)
    else if (update.resume) await client.resumeSubscription(subscriptionId)
    else throw polarOnly(mode.name, operation)
  })
  const now = new Date()
  // Read back for the caller; the provider's webhook brings the same into the synced table.
  const read = await commerceCall(operation, () => client.getSubscription(subscriptionId))
  const periodEnd = read.currentPeriodEnd === null ? null : new Date(read.currentPeriodEnd)
  const scheduled = update.productId && update.prorationBehavior === 'next_period' && read.productId !== update.productId && periodEnd
  return {
    id: read.id,
    productId: read.productId,
    status: read.status === 'ended' ? 'canceled' : read.status,
    cancelAtPeriodEnd: read.cancelAtPeriodEnd,
    currentPeriodEnd: periodEnd,
    endsAt: read.status === 'ended' ? now : read.cancelAtPeriodEnd ? periodEnd : null,
    createdAt: now,
    modifiedAt: now,
    ...(scheduled ? { pendingUpdate: { productId: update.productId, appliesAt: periodEnd, modifiedAt: now } } : {}),
  }
}
