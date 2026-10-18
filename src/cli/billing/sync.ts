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
import type { BillingCatalog, CatalogCreditGrant, CatalogPack, CatalogPlan } from '../../convex/catalog'
import { BILLING_WEBHOOK_PROVISION_EVENTS } from '../../convex/catalog'
import { customFieldCreatePayload, describeMeterDrift, describeProductDrift, existsOrDrift, resolvePriceCurrency } from './objects'
import { isManaged, listAllPages, MANAGED_BY, type CatalogIds, type Environment, type SyncLogEntry } from './provider'

// The provider reconciliation behind `nuxt-backend billing sync` — its
// contract (find-or-create, never update or delete, drift reported) is on the
// command, in ../billing.ts.

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
  client: Polar = new Polar({ accessToken: options.accessToken, server: options.environment }),
): Promise<BillingSyncResult> {
  const log: SyncLogEntry[] = []
  const ids: CatalogIds = { products: {}, meters: {} }
  const { dryRun, adopt } = options

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
  const ensureBenefit = async (
    key: string,
    create: () => Parameters<typeof benefitsCreate>[1],
    /** Retried once with this payload when the provider rejects `create`. */
    fallback?: { payload: () => Parameters<typeof benefitsCreate>[1], note: string },
  ): Promise<string | null> => {
    const existing = managedBenefits.find(item => isManaged((item as { metadata?: Record<string, unknown> }).metadata, key))
    if (existing) {
      benefitIdByKey.set(key, existing.id)
      log.push({ action: 'exists', kind: 'benefit', key, id: existing.id })
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

  const creditBenefitFor = async (productKey: string, grant: CatalogCreditGrant, defaultRollover: boolean): Promise<string | null> => {
    const meterIds = ids.meters[grant.meter]
    if (!meterIds) {
      log.push({ action: 'warn', kind: 'benefit', key: `${productKey}-credits`, note: `meter '${grant.meter}' is not in the catalog` })
      return null
    }
    return ensureBenefit(`${productKey}-credits`, () => ({
      type: 'meter_credit',
      description: `${grant.units} credits`,
      properties: { units: grant.units, rollover: grant.rollover ?? defaultRollover, meterId: meterIds.meterId },
      metadata: { managedBy: MANAGED_BY, key: `${productKey}-credits` },
    }))
  }

  // --- Products (plans + packs) ---
  const ensureProduct = async (
    key: string,
    benefits: Array<string | null>,
    create: () => Parameters<typeof productsCreate>[1],
  ): Promise<void> => {
    if (adopt[key]) {
      // Adopted products keep their existing benefits untouched — creating
      // managed grant twins would double-grant.
      ids.products[key] = adopt[key]
      log.push({ action: 'adopted', kind: 'product', key, id: adopt[key], note: 'benefits left as-is' })
      return
    }
    const existing = managedProducts.find(item => isManaged(item.metadata, key))
    if (existing) {
      ids.products[key] = existing.id
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
      return
    }
    if (dryRun) {
      log.push({ action: 'would-create', kind: 'product', key })
      return
    }
    const created = await productsCreate(client, create())
    if (!created.ok) throw created.error
    ids.products[key] = created.value.id
    log.push({ action: 'created', kind: 'product', key, id: created.value.id })
    const attach = benefits.filter((id): id is string => id !== null)
    if (attach.length > 0) {
      const updated = await productsUpdateBenefits(client, { id: created.value.id, productBenefitsUpdate: { benefits: attach } })
      if (!updated.ok) throw updated.error
    }
  }

  /** The fixed price, plus one metered price per `usage` entry (plans only). */
  const pricesFor = (key: string, product: CatalogPlan | CatalogPack): Parameters<typeof productsCreate>[1]['prices'] => {
    const taxBehavior = product.taxBehavior ? { taxBehavior: product.taxBehavior } : {}
    const priceCurrency = currency ? { priceCurrency: currency } : {}
    const usage = 'usage' in product ? product.usage ?? [] : []
    return [
      { amountType: 'fixed', priceAmount: product.price, ...priceCurrency, ...taxBehavior },
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

  for (const [key, plan] of Object.entries(catalog.plans ?? {})) {
    const benefits: Array<string | null> = []
    // Plan allowances default to use-it-or-lose-it per cycle.
    if (plan.credits) benefits.push(await creditBenefitFor(key, plan.credits, false))
    for (const featureKey of plan.features ?? []) {
      const id = benefitIdByKey.get(featureKey)
      if (id) benefits.push(id)
      else if (!dryRun) log.push({ action: 'warn', kind: 'product', key, note: `feature '${featureKey}' is not in the catalog` })
    }
    const attachedCustomFields = attachCustomFields(key, plan.customFields)
    const prices = pricesFor(key, plan)
    await ensureProduct(key, benefits, () => ({
      name: plan.name,
      description: plan.description,
      recurringInterval: plan.interval,
      prices,
      // A trial is interval + count; the provider defaults the count to 1.
      ...(plan.trial ? { trialInterval: plan.trial.interval, trialIntervalCount: plan.trial.count ?? 1 } : {}),
      ...(attachedCustomFields.length > 0 ? { attachedCustomFields } : {}),
      metadata: { managedBy: MANAGED_BY, key },
    }))
  }

  for (const [key, pack] of Object.entries(catalog.packs ?? {})) {
    // Purchased credits keep by default (rollover).
    const benefit = await creditBenefitFor(key, pack.credits, true)
    const attachedCustomFields = attachCustomFields(key, pack.customFields)
    const prices = pricesFor(key, pack)
    await ensureProduct(key, [benefit], () => ({
      name: pack.name,
      description: pack.description,
      recurringInterval: null,
      prices,
      ...(attachedCustomFields.length > 0 ? { attachedCustomFields } : {}),
      metadata: { managedBy: MANAGED_BY, key },
    }))
  }

  // Which products are packs: the runtime lets a gift buy only these.
  const packKeys = Object.keys(catalog.packs ?? {}).filter(key => key in ids.products)
  if (packKeys.length > 0) ids.packs = packKeys

  // --- Drift: managed remote objects whose key left the catalog ---
  const knownKeys = new Set([
    ...Object.keys(catalog.meters ?? {}),
    ...Object.keys(catalog.plans ?? {}),
    ...Object.keys(catalog.packs ?? {}),
    ...Object.keys(catalog.features ?? {}),
    ...Object.keys(catalog.customFields ?? {}),
    ...[...Object.keys(catalog.plans ?? {}), ...Object.keys(catalog.packs ?? {})].map(key => `${key}-credits`),
  ])
  for (const [kind, items] of [['meter', managedMeters], ['product', managedProducts], ['benefit', managedBenefits], ['custom-field', managedCustomFields]] as const) {
    for (const item of items) {
      const metadata = (item as { metadata?: Record<string, unknown> }).metadata
      if (metadata?.managedBy !== MANAGED_BY) continue
      const key = typeof metadata.key === 'string' ? metadata.key : ''
      if (key && !knownKeys.has(key)) {
        log.push({ action: 'drift', kind, key, id: item.id, note: 'managed remotely but no longer in the catalog (never deleted automatically)' })
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
