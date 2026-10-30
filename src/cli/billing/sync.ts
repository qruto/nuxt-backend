import { Polar } from '@polar-sh/sdk'
import { metersCreate } from '@polar-sh/sdk/funcs/metersCreate.js'
import { metersList } from '@polar-sh/sdk/funcs/metersList.js'
import { benefitsCreate } from '@polar-sh/sdk/funcs/benefitsCreate.js'
import { benefitsList } from '@polar-sh/sdk/funcs/benefitsList.js'
import { customFieldsCreate } from '@polar-sh/sdk/funcs/customFieldsCreate.js'
import { customFieldsList } from '@polar-sh/sdk/funcs/customFieldsList.js'
import { productsCreate } from '@polar-sh/sdk/funcs/productsCreate.js'
import { productsList } from '@polar-sh/sdk/funcs/productsList.js'
import { productsUpdateBenefits } from '@polar-sh/sdk/funcs/productsUpdateBenefits.js'
import { webhooksCreateWebhookEndpoint } from '@polar-sh/sdk/funcs/webhooksCreateWebhookEndpoint.js'
import { webhooksListWebhookEndpoints } from '@polar-sh/sdk/funcs/webhooksListWebhookEndpoints.js'
import type { BillingCatalog, CatalogCreditGrant, CatalogInterval, CatalogPack, CatalogPlan } from '../../convex/catalog'
import { providerClientOptions } from '../../convex/integrations/billing/provider-client'
import { BILLING_WEBHOOK_PROVISION_EVENTS, isFreePlan, providerTrialOf, packPricesByCurrency, planCreditUnits, planPricesByCurrency, planProductKey, planQuotasKey, pricedIntervals } from '../../convex/catalog'
import { refuseInvalidDiscounts, refuseUnpricedDiscounts, syncDiscounts } from './discounts'
import { addCurrencyPrices, alignGiftTwin, fixedPrices, giftProductKey, giftTwinPrices, moveGiftTwins } from './gift-twins'
import { derivedPassKeys, refuseInvalidGifts, syncPassProducts } from './passes'
import { customFieldCreatePayload, describeBenefitDrift, describeMeterDrift, describeProductDrift, existsOrDrift, resolvePriceCurrency } from './objects'
import { findPlanProduct, isUntaggedPlanProduct, pushPlanTrial, recordPlanProduct, refuseInvalidPrices, refuseMissingDefaultCurrency, refuseUnpricedPlans, retirePlan, unpricedPlanProducts } from './plans'
import { isManaged, listAllPages, MANAGED_BY, type CatalogIds, type Environment, type SyncLogEntry } from './provider'
import { attachPlanQuotas, attachRetiredPlanQuotas, droppedQuotasKeys, ensurePlanQuotas, planQuotasBenefits, planQuotasKeys, recordQuotaKeys, refuseInvalidQuotas } from './quotas'

// The provider reconciliation behind `nuxt-backend billing sync` — its
// contract (find-or-create, drift reported, nothing deleted; the trial
// pushed, a retired plan archived, a gift twin kept in line, the catalog's
// discounts patched in place) is on the command, in ../billing.ts.

/**
 * The key of the credit benefit a plan grants at one interval:
 * `<plan>-credits` on its monthly price, `<plan>-credits-year` on its
 * yearly one. A plan billed yearly before plans had intervals grants
 * `<plan>-credits` on that yearly product already: it keeps the key, and a
 * monthly price beside it grants `<plan>-credits-month`.
 */
function planCreditKey(plan: string, interval: CatalogInterval, untaggedYearly = false): string {
  if (untaggedYearly) return interval === 'year' ? `${plan}-credits` : `${plan}-credits-month`
  return interval === 'month' ? `${plan}-credits` : `${plan}-credits-${interval}`
}

/** Every key the catalog declares itself, of every kind. */
function catalogKeys(catalog: BillingCatalog): string[] {
  return [catalog.meters, catalog.plans, catalog.packs, catalog.features, catalog.customFields].flatMap(entries => Object.keys(entries ?? {}))
}

/**
 * Record the currency a visitor pays in when the catalog does not price
 * theirs (the catalog's, else the organization's): only for a catalog that
 * prices more than one.
 */
function recordFallbackCurrency(ids: CatalogIds, catalog: BillingCatalog, currency: string | undefined): void {
  if (!currency) return
  const codes = new Set([
    currency,
    ...Object.values(catalog.plans ?? {}).flatMap(plan => planPricesByCurrency(plan, currency).map(([code]) => code)),
    ...Object.values(catalog.packs ?? {}).flatMap(pack => packPricesByCurrency(pack, currency).map(([code]) => code)),
  ].filter((code): code is string => code !== undefined))
  if (codes.size > 1) ids.currency = currency
}

/** Record the plan every billing entity starts on, once its monthly product exists: never a retired one. */
function recordFreePlan(ids: CatalogIds, key: string, plan: CatalogPlan): void {
  if (!plan.retired && isFreePlan(plan) && ids.plans?.[key]?.month) ids.free = key
}

/** One fixed price per currency, as a create payload takes them; a currency the provider defaults names none. */
function fixedPricesOf(amounts: Array<[string | undefined, number]>, taxBehavior: { taxBehavior?: CatalogPlan['taxBehavior'] }) {
  return amounts.map(([code, amount]) => ({ amountType: 'fixed' as const, priceAmount: amount, ...(code ? { priceCurrency: code as never } : {}), ...taxBehavior }))
}

/**
 * Refuse a catalog whose own key is one the sync derives: a pack's gift
 * twin (`<pack>-gift`), or a plan's quotas benefit (`<plan>-quotas`, for
 * every plan, since one that sets no quota may set some later). The derived
 * object would be found as that entry, or that entry as it.
 */
function refuseDerivedKeyCollisions(catalog: BillingCatalog): void {
  const keys = new Set(catalogKeys(catalog))
  const taken = Object.keys(catalog.packs ?? {}).map(giftProductKey).filter(key => keys.has(key))
  if (taken.length > 0) {
    throw new Error(`[nuxt-backend] billing sync: ${taken.join(', ')} ${taken.length === 1 ? 'is' : 'are'} the key of a pack's gift product — rename the catalog entry.`)
  }
  const quotas = Object.keys(catalog.plans ?? {}).map(planQuotasKey).filter(key => keys.has(key))
  if (quotas.length > 0) {
    throw new Error(`[nuxt-backend] billing sync: ${quotas.join(', ')} ${quotas.length === 1 ? 'is' : 'are'} the key of a plan's quotas benefit — rename the catalog entry.`)
  }
}

export interface BillingSyncOptions {
  rootDir: string
  environment: Environment
  accessToken: string
  dryRun: boolean
  /** Adopt existing provider objects: catalog key → provider id. */
  adopt: Record<string, string>
  /** Webhook endpoint URL to provision (skipped when absent). */
  webhookUrl?: string
  /**
   * Why a missing endpoint must not be created this run, logged in its
   * place: `billing sync` sets it when the new endpoint's secret would
   * replace one the deployment already holds.
   */
  webhookBlocked?: string
}

/** The webhook endpoint at `webhookUrl`, found or created. */
export interface ProvisionedWebhook {
  id: string
  /** Its signing secret as the provider reports it — stored, never printed. */
  secret: string | undefined
  /** Created by this run, so the secret is new. */
  created: boolean
}

export interface BillingSyncResult {
  log: SyncLogEntry[]
  ids: CatalogIds
  /** The endpoint at `webhookUrl`; absent without one, on a dry run, or when it was not created. */
  webhook?: ProvisionedWebhook
}

/**
 * The whole provider reconciliation behind `nuxt-backend billing sync`.
 * Exported for tests (the provider client is injectable).
 *
 * @internal
 */
export async function syncBillingCatalog(
  catalog: BillingCatalog,
  options: BillingSyncOptions,
  client: Polar = new Polar(providerClientOptions({
    accessToken: options.accessToken,
    environment: options.environment,
  })),
): Promise<BillingSyncResult> {
  const log: SyncLogEntry[] = []
  const ids: CatalogIds = { products: {}, meters: {} }
  const { dryRun, adopt } = options
  refuseDerivedKeyCollisions(catalog)
  refuseUnpricedPlans(catalog)
  refuseInvalidPrices(catalog)
  refuseInvalidGifts(catalog, new Set(catalogKeys(catalog)))
  refuseInvalidQuotas(catalog)
  refuseInvalidDiscounts(catalog)

  // --- Managed inventories (one list call per kind, metadata-filtered) ---
  const managedMeters = await listAllPages(page => metersList(client, { metadata: { managedBy: MANAGED_BY }, limit: 100, page }))
  const managedBenefits = await listAllPages(page => benefitsList(client, { limit: 100, page }))
  const managedProducts = await listAllPages(page => productsList(client, { metadata: { managedBy: MANAGED_BY }, limit: 100, page }))
  // Custom fields have no metadata filter on the list endpoint — drain the
  // pages and match the managed tag locally, exactly like benefits. Only
  // fetched when the catalog declares any, so a token without the
  // `custom_fields` scope keeps working for catalogs that don't use them.
  const managedCustomFields = catalog.customFields
    ? await listAllPages(page => customFieldsList(client, { limit: 100, page }))
    : []

  const currency = await resolvePriceCurrency(catalog, client, log)
  refuseMissingDefaultCurrency(catalog, currency)
  refuseUnpricedDiscounts(catalog, currency)
  recordFallbackCurrency(ids, catalog, currency)

  // --- Meters ---
  for (const [key, meter] of Object.entries(catalog.meters ?? {})) {
    const aggregation = meter.aggregation ?? 'sum'
    const property = aggregation === 'sum' ? meter.property ?? 'amount' : undefined
    const eventName = meter.eventName ?? key
    const record = (meterId: string) => {
      ids.meters[key] = { meterId, eventName, ...(property ? { property } : {}) }
    }
    if (adopt[key]) {
      record(adopt[key])
      log.push({ action: 'adopted', kind: 'meter', key, id: adopt[key] })
      continue
    }
    const existing = managedMeters.find(item => isManaged(item.metadata, key))
    if (existing) {
      record(existing.id)
      // A meter is created once and kept — its aggregation and filter decide
      // whether the events this app ingests count at all, and the provider
      // will not rewrite them under a meter that already has usage. Silence
      // here is expensive: a `count` catalog against a `sum` meter grants
      // credits that no spend ever draws down at the provider.
      log.push(existsOrDrift(
        'meter',
        key,
        existing.id,
        describeMeterDrift(existing, { property, eventName }),
        'spends will not count as the catalog expects; rename the catalog key to publish a new meter',
      ))
      continue
    }
    if (dryRun) {
      log.push({ action: 'would-create', kind: 'meter', key })
      continue
    }
    const created = await metersCreate(client, {
      name: key,
      filter: { conjunction: 'and', clauses: [{ property: 'name', operator: 'eq', value: eventName }] },
      aggregation: property ? { func: 'sum', property } : { func: 'count' },
      metadata: { managedBy: MANAGED_BY, key },
    })
    if (!created.ok) throw created.error
    record(created.value.id)
    log.push({ action: 'created', kind: 'meter', key, id: created.value.id })
  }

  // --- Checkout custom fields (attached to products further down) ---
  const customFieldIdByKey = new Map<string, string>()
  for (const [key, field] of Object.entries(catalog.customFields ?? {})) {
    if (adopt[key]) {
      customFieldIdByKey.set(key, adopt[key])
      log.push({ action: 'adopted', kind: 'custom-field', key, id: adopt[key] })
      continue
    }
    const existing = managedCustomFields.find(item => isManaged(item.metadata, key))
    if (existing) {
      customFieldIdByKey.set(key, existing.id)
      log.push({ action: 'exists', kind: 'custom-field', key, id: existing.id })
      continue
    }
    if (dryRun) {
      log.push({ action: 'would-create', kind: 'custom-field', key })
      continue
    }
    const created = await customFieldsCreate(client, customFieldCreatePayload(key, field))
    if (!created.ok) throw created.error
    customFieldIdByKey.set(key, created.value.id)
    log.push({ action: 'created', kind: 'custom-field', key, id: created.value.id })
  }

  /** Product-side attachment list for a plan/pack's `customFields` keys. */
  const attachCustomFields = (productKey: string, keys: string[] | undefined) =>
    (keys ?? []).flatMap((fieldKey) => {
      const customFieldId = customFieldIdByKey.get(fieldKey)
      if (!customFieldId) {
        if (!dryRun) log.push({ action: 'warn', kind: 'product', key: productKey, note: `custom field '${fieldKey}' is not in the catalog` })
        return []
      }
      return [{ customFieldId, required: catalog.customFields?.[fieldKey]?.required ?? false }]
    })

  // --- Benefits (feature benefits + per-product credit grants) ---
  const benefitIdByKey = new Map<string, string>()
  const createdBenefits = new Map<string, string>()
  const ensureBenefit = async (
    key: string,
    create: () => Parameters<typeof benefitsCreate>[1],
    /** Retried once with this payload when the provider rejects `create`. */
    fallback?: { payload: () => Parameters<typeof benefitsCreate>[1], note: string },
  ): Promise<string | null> => {
    // Made earlier in this run (a plan's monthly grant, shared by its yearly
    // product on a monthly meter cycle and by its pass): the same one again.
    const made = createdBenefits.get(key)
    if (made) return made
    const existing = managedBenefits.find(item => isManaged((item as { metadata?: Record<string, unknown> }).metadata, key))
    if (existing) {
      benefitIdByKey.set(key, existing.id)
      // A credit grant whose units or rollover changed in either place: the
      // provider's grants follow its own figure, so say which one is live.
      log.push(existsOrDrift(
        'benefit',
        key,
        existing.id,
        describeBenefitDrift(existing as { type?: string, properties?: unknown }, create()),
        'change the grant in the provider dashboard (new grants follow it) or put the catalog back',
      ))
      return existing.id
    }
    if (dryRun) {
      log.push({ action: 'would-create', kind: 'benefit', key })
      return null
    }
    let created = await benefitsCreate(client, create())
    if (!created.ok && fallback) {
      const retried = await benefitsCreate(client, fallback.payload())
      if (retried.ok) {
        log.push({ action: 'warn', kind: 'benefit', key, note: fallback.note })
        created = retried
      }
    }
    if (!created.ok) throw created.error
    benefitIdByKey.set(key, created.value.id)
    createdBenefits.set(key, created.value.id)
    log.push({ action: 'created', kind: 'benefit', key, id: created.value.id })
    return created.value.id
  }

  for (const [key, feature] of Object.entries(catalog.features ?? {})) {
    // The provider's dedicated feature-flag benefit type: the customer portal
    // shows it as a feature rather than a note, and the grant is a flag. Older
    // organizations may not have the type — fall back to the generic custom
    // benefit so the sync still lands. Either way `key` rides in the metadata,
    // which is what `useFeatures().has(key)` matches on.
    await ensureBenefit(
      key,
      () => ({
        type: 'feature_flag',
        description: feature.description,
        properties: {},
        metadata: { managedBy: MANAGED_BY, key },
      }),
      {
        payload: () => ({
          type: 'custom',
          description: feature.description,
          properties: { note: null },
          metadata: { managedBy: MANAGED_BY, key },
        }),
        note: 'the provider rejected the native feature-flag benefit — created a custom benefit instead',
      },
    )
  }

  const creditBenefitFor = async (benefitKey: string, grant: CatalogCreditGrant, defaultRollover: boolean): Promise<string | null> => {
    const meterIds = ids.meters[grant.meter]
    if (!meterIds) {
      log.push({ action: 'warn', kind: 'benefit', key: benefitKey, note: `meter '${grant.meter}' is not in the catalog` })
      return null
    }
    return ensureBenefit(benefitKey, () => ({
      type: 'meter_credit',
      description: `${grant.units} credits`,
      properties: { units: grant.units, rollover: grant.rollover ?? defaultRollover, meterId: meterIds.meterId },
      metadata: { managedBy: MANAGED_BY, key: benefitKey },
    }))
  }

  // --- Products (plans + packs) ---
  /**
   * Find or create one product. `existing` is the managed product the
   * caller found for it; `record` keeps its id (in `products` by default).
   * Resolves with the product found, or `undefined` when it was adopted,
   * created or would be.
   */
  const ensureProduct = async (
    key: string,
    benefits: Array<string | null>,
    create: () => Parameters<typeof productsCreate>[1],
    existing: (typeof managedProducts)[number] | undefined,
    record: (id: string) => void = (id) => { ids.products[key] = id },
  ): Promise<(typeof managedProducts)[number] | undefined> => {
    if (adopt[key]) {
      // Adopted products keep their existing benefits untouched — creating
      // managed grant twins would double-grant.
      record(adopt[key])
      log.push({ action: 'adopted', kind: 'product', key, id: adopt[key], note: 'benefits left as-is' })
      return undefined
    }
    if (existing) {
      record(existing.id)
      // A product is created once and then kept: the provider's prices are
      // immutable (an order references one), so a catalog edit to `name` or
      // `price` cannot be pushed to a product customers may already hold.
      // Say so rather than logging a bare "exists" — otherwise the catalog
      // silently stops describing what customers actually see.
      log.push(existsOrDrift(
        'product',
        key,
        existing.id,
        describeProductDrift(existing, create()),
        'a created product is never rewritten; rename the catalog key to publish a new one',
      ))
      return existing
    }
    if (dryRun) {
      log.push({ action: 'would-create', kind: 'product', key })
      return undefined
    }
    const created = await productsCreate(client, create())
    if (!created.ok) throw created.error
    record(created.value.id)
    log.push({ action: 'created', kind: 'product', key, id: created.value.id })
    const attach = benefits.filter((id): id is string => id !== null)
    if (attach.length > 0) {
      const updated = await productsUpdateBenefits(client, { id: created.value.id, productBenefitsUpdate: { benefits: attach } })
      if (!updated.ok) throw updated.error
    }
    return undefined
  }

  /**
   * One fixed price per currency — a native presentment price each, on the
   * same product — plus one metered price per `usage` entry (plans only,
   * which are priced in one currency when they have any).
   */
  const pricesFor = (key: string, product: CatalogPlan | CatalogPack, amounts: Array<[string | undefined, number]>): Parameters<typeof productsCreate>[1]['prices'] => {
    const taxBehavior = product.taxBehavior ? { taxBehavior: product.taxBehavior } : {}
    const priceCurrency = currency ? { priceCurrency: currency as never } : {}
    const usage = 'usage' in product ? product.usage ?? [] : []
    return [
      ...fixedPricesOf(amounts, taxBehavior),
      ...usage.flatMap((price) => {
        if (!(price.meter in (catalog.meters ?? {}))) {
          log.push({ action: 'warn', kind: 'product', key, note: `usage price meter '${price.meter}' is not in the catalog` })
          return []
        }
        // Unresolved id on a dry run — the meter would be created first.
        const meterIds = ids.meters[price.meter]
        if (!meterIds) return []
        return [{
          amountType: 'metered_unit' as const,
          meterId: meterIds.meterId,
          unitAmount: price.unitAmount,
          ...(price.cap === undefined ? {} : { capAmount: price.cap }),
          ...priceCurrency,
          ...taxBehavior,
        }]
      }),
    ]
  }

  /**
   * One plan's product at one interval: its credit grant for that cycle,
   * the plan's features, and the catalog's trial pushed to one that exists.
   * A yearly product made before plans had intervals keeps the credit
   * benefit it carries, checked against the year's grant.
   */
  const ensurePlanProduct = async (key: string, plan: CatalogPlan, interval: CatalogInterval, quotasId: string | null | undefined) => {
    const productKey = planProductKey(key, interval)
    const existing = findPlanProduct(managedProducts, key, interval)
    const untaggedYearly = isUntaggedPlanProduct(findPlanProduct(managedProducts, key, 'year'))
    const benefits: Array<string | null> = []
    // Plan allowances default to use-it-or-lose-it per cycle. With a
    // monthly meter cycle a yearly price grants a month's allowance every
    // month: the monthly product's benefit, on both.
    const monthly = interval === 'year' && plan.meterCycle === 'month'
    const grantInterval = monthly ? 'month' : interval
    const units = plan.credits ? planCreditUnits(plan.credits, grantInterval) : undefined
    if (plan.credits && units !== undefined) benefits.push(await creditBenefitFor(planCreditKey(key, grantInterval, untaggedYearly && !monthly), { ...plan.credits, units }, false))
    for (const featureKey of plan.features ?? []) {
      const id = benefitIdByKey.get(featureKey)
      if (id) benefits.push(id)
      else if (!dryRun) log.push({ action: 'warn', kind: 'product', key: productKey, note: `feature '${featureKey}' is not in the catalog` })
    }
    benefits.push(...planQuotasBenefits(key, productKey, quotasId, { adopt, log }))
    const attachedCustomFields = attachCustomFields(productKey, plan.customFields)
    const amounts = planPricesByCurrency(plan, currency).map(([code, byInterval]) => [code, byInterval[interval]!] as [string | undefined, number])
    const prices = pricesFor(productKey, plan, amounts)
    const trial = providerTrialOf(plan.trial)
    const found = await ensureProduct(productKey, benefits, () => ({
      name: plan.name,
      description: plan.description,
      recurringInterval: interval,
      prices,
      // A trial is interval + count; the provider defaults the count to 1.
      // A reverse trial is a pass the package starts, so the product has none.
      ...(trial ? { trialInterval: trial.interval, trialIntervalCount: trial.count ?? 1 } : {}),
      // The meter cycle is set once, as the product is made: the provider never changes it.
      ...(monthly ? { meterInterval: 'month' as const, meterIntervalCount: 1 } : {}),
      ...(attachedCustomFields.length > 0 ? { attachedCustomFields } : {}),
      metadata: { managedBy: MANAGED_BY, key, interval },
    }), existing, id => recordPlanProduct(ids, key, interval, id))
    if (!found) return
    // A plan priced per currency gains the currencies its product lacks.
    if (amounts.length > 1) await addCurrencyPrices(client, found, prices, productKey, { dryRun, log })
    await pushPlanTrial(client, found, productKey, trial, { dryRun, log })
    await attachPlanQuotas(client, found, productKey, quotasId, { dryRun, log })
  }

  const quotasByPlan = new Map<string, string | null | undefined>()
  for (const [key, plan] of Object.entries(catalog.plans ?? {})) {
    // The quotas benefit first, so each product carries it from the start.
    const quotasId = await ensurePlanQuotas(client, managedBenefits, key, plan, { dryRun, log })
    quotasByPlan.set(key, quotasId)
    if (plan.retired) {
      await retirePlan(client, managedProducts, key, pricedIntervals(plan), { dryRun, log, ids, adopt })
      await attachRetiredPlanQuotas(client, managedProducts, key, quotasId, { dryRun, log, adopt })
    }
    else for (const interval of pricedIntervals(plan)) await ensurePlanProduct(key, plan, interval, quotasId)
    recordFreePlan(ids, key, plan)
  }
  recordQuotaKeys(ids, catalog)

  /**
   * The pack's private gift twin: its prices, one per currency, and none of
   * its benefits, so a purchaser pays for someone else's credits without
   * receiving any. The prices are the pack's live ones when the pack exists
   * already: one priced again in the dashboard no longer matches the catalog.
   */
  const ensureGiftTwin = async (key: string, pack: CatalogPack, prices: ReturnType<typeof pricesFor>) => {
    const giftKey = giftProductKey(key)
    const giftPrices = giftTwinPrices(fixedPrices(managedProducts.find(item => isManaged(item.metadata, key))), pack, prices)
    await ensureProduct(giftKey, [], () => ({
      name: `${pack.name} (gift)`,
      description: pack.description,
      recurringInterval: null,
      prices: giftPrices,
      visibility: 'private',
      metadata: { managedBy: MANAGED_BY, key: giftKey, giftOf: key },
    }), managedProducts.find(item => isManaged(item.metadata, giftKey)))
    await alignGiftTwin(client, managedProducts, key, { dryRun, log })
  }

  for (const [key, pack] of Object.entries(catalog.packs ?? {})) {
    // Purchased credits keep by default (rollover). Without it, what a
    // customer bought lapses at their next billing cycle: say so.
    if (pack.credits.rollover === false) {
      log.push({ action: 'warn', kind: 'product', key, note: 'rollover is off: unspent credits from this pack lapse at the customer\'s next billing cycle, and pricing compares no per-credit price for it' })
    }
    const benefit = await creditBenefitFor(`${key}-credits`, pack.credits, true)
    const attachedCustomFields = attachCustomFields(key, pack.customFields)
    const amounts = packPricesByCurrency(pack, currency)
    const prices = pricesFor(key, pack, amounts)
    const found = await ensureProduct(key, [benefit], () => ({
      name: pack.name,
      description: pack.description,
      recurringInterval: null,
      prices,
      ...(attachedCustomFields.length > 0 ? { attachedCustomFields } : {}),
      metadata: { managedBy: MANAGED_BY, key },
    }), managedProducts.find(item => isManaged(item.metadata, key)))
    // A pack priced per currency gains the currencies its product lacks.
    if (amounts.length > 1) await addCurrencyPrices(client, found, prices, key, { dryRun, log })
    await ensureGiftTwin(key, pack, prices)
  }
  moveGiftTwins(ids, catalog)

  await syncPassProducts(catalog, {
    client,
    ids,
    managedProducts,
    ensureProduct,
    creditBenefitFor,
    benefitIdByKey,
    quotasByPlan,
    planCreditKey,
    price: (amounts, plan) => fixedPricesOf(amounts, plan.taxBehavior ? { taxBehavior: plan.taxBehavior } : {}),
    currency,
    adopt,
    dryRun,
    log,
  })

  // Which products are packs: the runtime lets a gift buy only these.
  const packKeys = Object.keys(catalog.packs ?? {}).filter(key => key in ids.products)
  if (packKeys.length > 0) ids.packs = packKeys

  // --- Discounts (the catalog's promotions), on the products' ids ---
  // Only read for a catalog that declares any, so a token without the
  // discounts scope keeps working for one that does not.
  if (catalog.discounts) {
    await syncDiscounts(catalog, {
      client,
      limitTarget: { environment: options.environment, accessToken: options.accessToken },
      ids,
      currency,
      dryRun,
      adopt,
      log,
    })
  }

  // --- Drift: managed remote objects whose key left the catalog ---
  const knownKeys = new Set([
    ...catalogKeys(catalog),
    ...Object.keys(catalog.plans ?? {}).flatMap(key => [planCreditKey(key, 'month'), planCreditKey(key, 'year'), planCreditKey(key, 'month', true)]),
    // A plan that drops its quotas leaves its quotas benefit attached: drift.
    ...planQuotasKeys(catalog),
    ...Object.keys(catalog.packs ?? {}).map(key => `${key}-credits`),
    ...Object.keys(catalog.packs ?? {}).map(giftProductKey),
    ...derivedPassKeys(catalog),
  ])
  const droppedQuotas = new Set(droppedQuotasKeys(catalog))
  log.push(...unpricedPlanProducts(catalog, managedProducts))
  for (const [kind, items] of [['meter', managedMeters], ['product', managedProducts], ['benefit', managedBenefits], ['custom-field', managedCustomFields]] as const) {
    for (const item of items) {
      const metadata = (item as { metadata?: Record<string, unknown> }).metadata
      if (metadata?.managedBy !== MANAGED_BY) continue
      const key = typeof metadata.key === 'string' ? metadata.key : ''
      if (key && !knownKeys.has(key)) {
        const note = droppedQuotas.has(key)
          ? 'its plan sets no quotas now: emptied above, and still attached to the plan\'s products until you detach it in the provider dashboard'
          : 'managed remotely but no longer in the catalog (never deleted automatically)'
        log.push({ action: 'drift', kind, key, id: item.id, note })
      }
    }
  }

  // --- Webhook endpoint ---
  const webhook = options.webhookUrl ? await ensureWebhookEndpoint(client, options.webhookUrl, options, log) : undefined

  return { log, ids, ...(webhook ? { webhook } : {}) }
}

/**
 * The endpoint at `url`, found by URL or created. The provider reports an
 * endpoint's secret on every read, so one found here can still have its
 * secret stored — a run that created it but could not store the secret is
 * recovered by the next. Nothing is created on a dry run, or when
 * `webhookBlocked` says why not.
 */
async function ensureWebhookEndpoint(
  client: Polar,
  url: string,
  { dryRun, webhookBlocked }: Pick<BillingSyncOptions, 'dryRun' | 'webhookBlocked'>,
  log: SyncLogEntry[],
): Promise<ProvisionedWebhook | undefined> {
  const endpoints = await listAllPages(page => webhooksListWebhookEndpoints(client, { limit: 100, page }))
  const existing = endpoints.find(endpoint => endpoint.url === url)
  if (existing) {
    const disabled = existing.enabled === false ? { note: 'disabled at the provider — it receives nothing until it is enabled again' } : {}
    log.push({ action: 'exists', kind: 'webhook', key: url, id: existing.id, ...disabled })
    return dryRun ? undefined : { id: existing.id, secret: existing.secret || undefined, created: false }
  }
  if (webhookBlocked) {
    log.push({ action: 'warn', kind: 'webhook', key: url, note: webhookBlocked })
    return undefined
  }
  if (dryRun) {
    log.push({ action: 'would-create', kind: 'webhook', key: url })
    return undefined
  }
  const created = await webhooksCreateWebhookEndpoint(client, { url, format: 'raw', events: [...BILLING_WEBHOOK_PROVISION_EVENTS] })
  if (!created.ok) throw created.error
  log.push({ action: 'created', kind: 'webhook', key: url, id: created.value.id })
  return { id: created.value.id, secret: created.value.secret, created: true }
}
