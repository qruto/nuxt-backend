/**
 * `nuxt-backend billing sync` — push the code-declared catalog
 * (`backend/billing.catalog.ts`) to the billing provider and write the id map
 * to `backend/billing.generated.ts`.
 *
 * Find-or-create only: every managed object is tagged
 * `metadata: { managedBy: 'nuxt-backend', key }` and looked up by that tag on
 * the next run, so re-running is idempotent. Nothing remote is ever updated
 * (prices on subscribed products are a dashboard task) or deleted — managed
 * objects whose key left the catalog are reported as drift. Granting stays
 * provider-native: plan/pack credits become meter-credit benefits attached to
 * the products, granted by the provider per cycle / at purchase.
 *
 * `--adopt key=<id>` records an existing product/meter/custom field under a
 * catalog key instead of creating a managed twin — benefits of adopted
 * products are left exactly as they are.
 */
import { existsSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { defineCommand } from 'citty'
import { Polar } from '@polar-sh/sdk'
import { metersCreate } from '@polar-sh/sdk/funcs/metersCreate.js'
import { metersList } from '@polar-sh/sdk/funcs/metersList.js'
import { benefitsCreate } from '@polar-sh/sdk/funcs/benefitsCreate.js'
import { benefitsList } from '@polar-sh/sdk/funcs/benefitsList.js'
import { customFieldsCreate } from '@polar-sh/sdk/funcs/customFieldsCreate.js'
import { customFieldsList } from '@polar-sh/sdk/funcs/customFieldsList.js'
import { organizationsListOrganizations } from '@polar-sh/sdk/funcs/organizationsListOrganizations.js'
import { productsCreate } from '@polar-sh/sdk/funcs/productsCreate.js'
import { productsList } from '@polar-sh/sdk/funcs/productsList.js'
import { productsUpdateBenefits } from '@polar-sh/sdk/funcs/productsUpdateBenefits.js'
import { webhooksCreateWebhookEndpoint } from '@polar-sh/sdk/funcs/webhooksCreateWebhookEndpoint.js'
import { webhooksListWebhookEndpoints } from '@polar-sh/sdk/funcs/webhooksListWebhookEndpoints.js'
import type { BillingCatalog, CatalogCreditGrant, CatalogCustomField, CatalogPack, CatalogPlan } from '../convex/catalog'
import { BILLING_WEBHOOK_PROVISION_EVENTS } from '../convex/catalog'
import type { PreflightFinding } from '../preflight'
import { resolveFunctionsDir } from '../scaffold'
import { readEnvFiles } from '../env-push'
import { deriveDeploymentUrls } from '../deployment'

const MANAGED_BY = 'nuxt-backend'

type Environment = 'sandbox' | 'production'

type ProductPrice = NonNullable<Parameters<typeof productsCreate>[1]['prices']>[number]
type PriceCurrency = NonNullable<Extract<ProductPrice, { amountType: 'fixed' }>['priceCurrency']>

interface CreditMeterIds {
  meterId: string
  eventName?: string
  property?: string
}

interface CatalogIds {
  products: Record<string, string>
  meters: Record<string, CreditMeterIds>
}

interface SyncLogEntry {
  action: 'created' | 'exists' | 'adopted' | 'would-create' | 'drift' | 'warn'
  kind: 'meter' | 'benefit' | 'product' | 'webhook' | 'custom-field' | 'currency'
  key: string
  id?: string
  note?: string
}

function isManaged(metadata: Record<string, unknown> | undefined | null, key: string): boolean {
  return metadata?.managedBy === MANAGED_BY && metadata?.key === key
}

/** Load the app's `billing.catalog.ts` via native TS import. */
export async function loadCatalog(rootDir: string): Promise<{ catalog: BillingCatalog, path: string } | null> {
  const functionsDir = resolveFunctionsDir(rootDir)
  const path = join(rootDir, functionsDir, 'billing.catalog.ts')
  if (!existsSync(path)) return null
  const module = await import(pathToFileURL(path).href) as { default?: BillingCatalog }
  return { catalog: module.default ?? {}, path }
}

/** Load the existing generated map (to preserve the other environment). */
async function loadGenerated(rootDir: string): Promise<Partial<Record<Environment, CatalogIds>>> {
  const functionsDir = resolveFunctionsDir(rootDir)
  const path = join(rootDir, functionsDir, 'billing.generated.ts')
  if (!existsSync(path)) return {}
  try {
    // Cache-bust: the file is rewritten between runs in one process (tests).
    const module = await import(`${pathToFileURL(path).href}?t=${Date.now()}`) as { catalog?: Partial<Record<Environment, CatalogIds>> }
    return module.catalog ?? {}
  }
  catch {
    return {}
  }
}

/**
 * Serialize the id map as TypeScript the app's own linter accepts: single
 * quotes, bare keys, trailing commas. `JSON.stringify` output would land in the
 * consumer's repo failing their style rules on a file they must not edit.
 */
function renderValue(value: unknown, indent: string): string {
  if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, '\\\'')}'`
  if (value === null || typeof value !== 'object') return String(value)
  const inner = indent + '  '
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return '{}'
  const body = entries
    .map(([key, item]) => `${inner}${/^[a-z_$][\w$]*$/i.test(key) ? key : `'${key}'`}: ${renderValue(item, inner)},`)
    .join('\n')
  return `{\n${body}\n${indent}}`
}

function renderGenerated(map: Partial<Record<Environment, CatalogIds>>): string {
  return `/* Generated by \`npx nuxt-backend billing sync\` — do not edit. */
import type { BillingCatalogIds } from 'nuxt-backend/billing'

export const catalog: Partial<Record<'sandbox' | 'production', BillingCatalogIds>> = ${renderValue(map, '')}
`
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
}

export interface BillingSyncResult {
  log: SyncLogEntry[]
  ids: CatalogIds
  webhookSecret?: string
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
      log.push({ action: 'exists', kind: 'meter', key, id: existing.id })
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
      log.push({ action: 'exists', kind: 'product', key, id: existing.id })
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
  let webhookSecret: string | undefined
  if (options.webhookUrl) {
    const endpoints = await listAllPages(page => webhooksListWebhookEndpoints(client, { limit: 100, page }))
    const existing = endpoints.find(endpoint => endpoint.url === options.webhookUrl)
    if (existing) {
      log.push({ action: 'exists', kind: 'webhook', key: options.webhookUrl, id: existing.id })
    }
    else if (dryRun) {
      log.push({ action: 'would-create', kind: 'webhook', key: options.webhookUrl })
    }
    else {
      const created = await webhooksCreateWebhookEndpoint(client, {
        url: options.webhookUrl,
        format: 'raw',
        events: [...BILLING_WEBHOOK_PROVISION_EVENTS],
      })
      if (!created.ok) throw created.error
      webhookSecret = created.value.secret
      log.push({ action: 'created', kind: 'webhook', key: options.webhookUrl, id: created.value.id })
    }
  }

  return { log, ids, webhookSecret }
}

/**
 * The currency every fixed and metered price is created in: the catalog's
 * `currency` when pinned, else the organization's default presentment
 * currency — the provider rejects a product whose prices miss it. Left to
 * the provider default only when the organization cannot be read (a token
 * without the organizations scope), which the log calls out.
 */
async function resolvePriceCurrency(catalog: BillingCatalog, client: Polar, log: SyncLogEntry[]): Promise<PriceCurrency | undefined> {
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
function customFieldCreatePayload(key: string, field: CatalogCustomField): Parameters<typeof customFieldsCreate>[1] {
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

/** Drain a paginated list endpoint (`{ result: { items, pagination } }`). */
async function listAllPages<T extends { id: string, metadata?: unknown }>(
  fetchPage: (page: number) => Promise<{ ok: boolean, error?: unknown, value?: { result: { items: T[], pagination: { maxPage: number } } } }>,
): Promise<T[]> {
  const items: T[] = []
  for (let page = 1; ; page++) {
    const result = await fetchPage(page)
    if (!result.ok || !result.value) throw result.error ?? new Error('[nuxt-backend] billing sync: list request failed')
    items.push(...result.value.result.items)
    if (page >= result.value.result.pagination.maxPage) break
  }
  return items
}

// --- doctor: catalog ↔ provider cross-checks ---

/**
 * The provider-side state `doctor` reads once and cross-checks against the
 * catalog: the organization's subscription + customer-portal settings, plus
 * the benefit type behind every managed catalog key. Flattened out of the
 * provider payloads so {@link collectBillingFindings} stays pure.
 */
export interface BillingOrganizationState {
  slug: string
  /** A customer may hold several subscriptions at the same time. */
  allowMultipleSubscriptions: boolean
  /** How a mid-cycle plan change is charged (`invoice` | `prorate` | `next_period` | …). */
  prorationBehavior: string
  /** How long benefits stay granted after a subscription ends (provider units; 0 = immediately). */
  benefitRevocationGracePeriod: number
  /** One trial per customer, enforced by the provider. */
  preventTrialAbuse: boolean
  /** Customer-portal toggles. */
  portal: { updatePlan: boolean, pause: boolean }
  /** Managed catalog key → benefit type (`custom` is the legacy feature shape). */
  benefitTypeByKey: Record<string, string>
}

/**
 * Read {@link BillingOrganizationState}. Returns `null` when the provider
 * cannot be read at all — an expired or wrong-environment token, a missing
 * scope, or no network — so every check built on it degrades to a skip
 * instead of failing the doctor run.
 *
 * @internal
 */
export async function readBillingOrganizationState(
  options: { accessToken: string, environment: Environment },
  client?: Polar,
): Promise<BillingOrganizationState | null> {
  try {
    const polar = client ?? new Polar({ accessToken: options.accessToken, server: options.environment })
    // An organization access token scopes the list to its own organization.
    const organizations = await organizationsListOrganizations(polar, { limit: 1 })
    const organization = organizations.ok ? organizations.value?.result.items[0] : undefined
    if (!organization) return null

    const benefitTypeByKey: Record<string, string> = {}
    for (const benefit of await listAllPages(page => benefitsList(polar, { limit: 100, page }))) {
      const metadata = (benefit as { metadata?: Record<string, unknown> }).metadata
      if (metadata?.managedBy !== MANAGED_BY || typeof metadata.key !== 'string') continue
      benefitTypeByKey[metadata.key] = (benefit as { type?: string }).type ?? ''
    }

    const { subscriptionSettings: subscription, customerPortalSettings: portal } = organization
    return {
      slug: organization.slug,
      allowMultipleSubscriptions: subscription.allowMultipleSubscriptions,
      prorationBehavior: String(subscription.prorationBehavior),
      benefitRevocationGracePeriod: subscription.benefitRevocationGracePeriod,
      preventTrialAbuse: subscription.preventTrialAbuse,
      portal: { updatePlan: portal.subscription.updatePlan, pause: portal.subscription.pause ?? false },
      benefitTypeByKey,
    }
  }
  catch {
    return null
  }
}

function billingFinding(id: string, title: string, status: PreflightFinding['status'], message: string, fixHint = ''): PreflightFinding {
  return { id, title, status, message, fixHint }
}

/**
 * Doctor's billing findings: the code-declared catalog against the provider's
 * organization settings. Pure — `state` is `null` whenever the provider could
 * not be read, and each check then degrades to a skip (no finding at all when
 * there is no token to try, one warning when a token was tried and refused).
 * The meter check needs no provider at all: it is a catalog-only truth.
 *
 * @internal
 */
export function collectBillingFindings(
  catalog: BillingCatalog | null,
  state: BillingOrganizationState | null,
  { tokenPresent }: { tokenPresent: boolean },
): PreflightFinding[] {
  // No catalog declared: nothing to cross-check, and every finding would be
  // about a file the app never wrote.
  if (!catalog) return []

  const findings: PreflightFinding[] = []
  const plans = Object.entries(catalog.plans ?? {})
  const packs = Object.entries(catalog.packs ?? {})
  const meters = Object.keys(catalog.meters ?? {})
  const features = Object.keys(catalog.features ?? {})
  const grantsCredits = [...plans, ...packs].some(([, product]) => product.credits)

  // A meter nothing grants and nothing prices is dead weight: spends against
  // it draw on a balance that never gets funded and never gets invoiced.
  if (meters.length > 0) {
    const referenced = new Set([
      ...[...plans, ...packs].flatMap(([, product]) => product.credits ? [product.credits.meter] : []),
      ...plans.flatMap(([, plan]) => (plan.usage ?? []).map(price => price.meter)),
    ])
    const orphans = meters.filter(meter => !referenced.has(meter))
    findings.push(orphans.length === 0
      ? billingFinding('billing-meter-usage', 'Billing meters', 'pass', `Every catalog meter is funded by a credit grant or billed by a usage price (${meters.join(', ')}).`)
      : billingFinding(
          'billing-meter-usage',
          'Billing meters',
          'warn',
          `No plan or pack grants credits on ${orphans.join(', ')}, and no plan prices usage against ${orphans.length === 1 ? 'it' : 'them'} — spends draw on a balance nothing funds and nothing invoices.`,
          'Give a plan or pack `credits: { meter: … }`, add a `usage` price for it, or drop the meter from billing.catalog.ts.',
        ))
  }

  if (!state) {
    // No token here is the designed degradation `billing-access` already
    // reports — a second warning would be noise. A token that was refused is
    // worth its own finding: the checks below silently did not run.
    if (tokenPresent) {
      findings.push(billingFinding(
        'billing-organization',
        'Billing organization',
        'warn',
        'BILLING_ACCESS_TOKEN is set here but the provider would not answer with it (expired, revoked, or issued for the other environment) — the catalog cross-checks were skipped.',
        'Issue a fresh organization access token for the active BILLING_ENVIRONMENT, put it in .env.local, and run `npx nuxt-backend env push`.',
      ))
    }
    return findings
  }

  findings.push(state.allowMultipleSubscriptions && plans.length > 1
    ? billingFinding(
        'billing-multiple-subscriptions',
        'Multiple subscriptions',
        'warn',
        `The organization lets a customer hold several subscriptions at once while the catalog offers ${plans.length} plans — someone can end up on two of them, and useBilling() reports only the first.`,
        'Turn multiple subscriptions off in the provider dashboard, or keep a single plan in billing.catalog.ts.',
      )
    : billingFinding('billing-multiple-subscriptions', 'Multiple subscriptions', 'pass', state.allowMultipleSubscriptions
        ? 'Multiple subscriptions are allowed, and the catalog offers at most one plan.'
        : 'A customer holds one subscription at a time.'))

  findings.push(plans.length > 1 && state.prorationBehavior === 'next_period'
    ? billingFinding(
        'billing-proration',
        'Plan change proration',
        'warn',
        `Plan changes are settled as '${state.prorationBehavior}' — an upgrade grants the new plan's credits and features immediately but is not charged until the next cycle.`,
        'Set the organization\'s proration behaviour to `invoice` or `prorate` if an upgrade should be charged when it happens.',
      )
    : billingFinding('billing-proration', 'Plan change proration', 'pass', `Plan changes are settled as '${state.prorationBehavior}'.`))

  findings.push(state.benefitRevocationGracePeriod > 0 && (features.length > 0 || grantsCredits)
    ? billingFinding(
        'billing-benefit-grace',
        'Benefit revocation',
        'warn',
        `Benefits stay granted for a grace period (${state.benefitRevocationGracePeriod}) after a subscription ends — useFeatures().has() keeps returning true and granted credits stay spendable for that long.`,
        'Set the benefit revocation grace period to 0 in the provider dashboard if access must stop the moment a subscription ends.',
      )
    : billingFinding('billing-benefit-grace', 'Benefit revocation', 'pass', state.benefitRevocationGracePeriod > 0
        ? `A benefit revocation grace period (${state.benefitRevocationGracePeriod}) is set, and the catalog grants no benefits.`
        : 'Benefits are revoked as soon as a subscription ends.'))

  const trialPlans = plans.filter(([, plan]) => plan.trial)
  findings.push(trialPlans.length > 0 && !state.preventTrialAbuse
    ? billingFinding(
        'billing-trial-abuse',
        'Trial abuse prevention',
        'warn',
        `${trialPlans.map(([key]) => key).join(', ')} offer${trialPlans.length === 1 ? 's' : ''} a trial but the organization does not prevent trial abuse — the same customer can start the trial again and again.`,
        'Turn on trial abuse prevention in the provider dashboard.',
      )
    : billingFinding('billing-trial-abuse', 'Trial abuse prevention', 'pass', trialPlans.length === 0
        ? 'No plan declares a trial.'
        : 'Trials are limited to one per customer.'))

  const pause = `pause: ${state.portal.pause ? 'on' : 'off'}`
  findings.push(plans.length > 1 && !state.portal.updatePlan
    ? billingFinding(
        'billing-portal',
        'Customer portal',
        'warn',
        `The customer portal cannot change plan while the catalog offers ${plans.length} of them — upgrades and downgrades have to go through a fresh checkout (${pause}).`,
        'Enable plan updates in the provider\'s customer portal settings, or drive upgrades through your own checkout.',
      )
    : billingFinding('billing-portal', 'Customer portal', 'pass', state.portal.updatePlan
        ? `The customer portal offers plan changes (${pause}).`
        : `The customer portal does not offer plan changes, and the catalog offers at most one plan (${pause}).`))

  if (features.length > 0) {
    const legacy = features.filter(key => state.benefitTypeByKey[key] === 'custom')
    findings.push(legacy.length === 0
      ? billingFinding('billing-feature-benefits', 'Feature benefits', 'pass', 'Feature benefits use the provider\'s native feature-flag type.')
      : billingFinding(
          'billing-feature-benefits',
          'Feature benefits',
          'warn',
          `Feature benefit${legacy.length === 1 ? '' : 's'} ${legacy.join(', ')} still ${legacy.length === 1 ? 'is' : 'are'} the generic custom type — the customer portal lists ${legacy.length === 1 ? 'it' : 'them'} as a note rather than a feature.`,
          'Delete them in the provider dashboard (or drop their managed tag) and re-run `npx nuxt-backend billing sync` to recreate them as feature flags — gating matches on the metadata key either way, so useFeatures() keeps working meanwhile.',
        ))
  }

  return findings
}

export const billingSync = defineCommand({
  meta: { name: 'sync', description: 'Push backend/billing.catalog.ts — meters, custom fields, feature/credit benefits, plans (trials, usage prices, tax behaviour) and packs — to the billing provider and write billing.generated.ts (find-or-create, never deletes)' },
  args: {
    'cwd': { type: 'string', description: 'Project directory', default: '.' },
    'env': { type: 'string', description: 'Target environment: sandbox | production (default: BILLING_ENVIRONMENT or sandbox)' },
    'dry-run': { type: 'boolean', description: 'Print the plan without creating anything', default: false },
    'webhook': { type: 'string', description: 'Provision the webhook endpoint at this URL (default: derived <site>/billing/events; pass "off" to skip)' },
    'adopt': { type: 'string', description: 'Adopt existing objects (products, meters, custom fields): key=<id>[,key=<id>…] — recorded as-is, benefits untouched' },
  },
  async run({ args }) {
    const rootDir = resolve(process.cwd(), args.cwd)
    const localEnv = readEnvFiles(rootDir)
    const environment = (args.env ?? process.env.BILLING_ENVIRONMENT ?? localEnv.BILLING_ENVIRONMENT ?? 'sandbox') as Environment
    if (environment !== 'sandbox' && environment !== 'production') {
      console.error(`[nuxt-backend] Unknown billing environment '${environment}' — use sandbox or production.`)
      process.exitCode = 1
      return
    }
    const accessToken = process.env.BILLING_ACCESS_TOKEN ?? localEnv.BILLING_ACCESS_TOKEN
    if (!accessToken) {
      console.error('[nuxt-backend] BILLING_ACCESS_TOKEN is not set (env or .env.local) — create an organization access token in the provider dashboard.')
      process.exitCode = 1
      return
    }

    const loaded = await loadCatalog(rootDir)
    if (!loaded) {
      console.error('[nuxt-backend] No billing.catalog.ts found — run `npx nuxt-backend init` (or create backend/billing.catalog.ts) first.')
      process.exitCode = 1
      return
    }

    const adopt: Record<string, string> = {}
    for (const pair of (args.adopt ?? '').split(',').filter(Boolean)) {
      const [key, id] = pair.split('=')
      if (key && id) adopt[key.trim()] = id.trim()
    }

    const webhookUrl = args.webhook === 'off'
      ? undefined
      : args.webhook ?? (() => {
        const siteUrl = deriveDeploymentUrls(rootDir)?.siteUrl
        return siteUrl ? `${siteUrl}/billing/events` : undefined
      })()

    console.log(`[nuxt-backend] billing sync → ${environment}${args['dry-run'] ? ' — dry run' : ''}`)
    const result = await syncBillingCatalog(loaded.catalog, {
      rootDir,
      environment,
      accessToken,
      dryRun: args['dry-run'],
      adopt,
      webhookUrl,
    })

    for (const entry of result.log) {
      const id = entry.id ? ` (${entry.id})` : ''
      const note = entry.note ? ` — ${entry.note}` : ''
      console.log(`  ${entry.action.padEnd(12)} ${entry.kind.padEnd(8)} ${entry.key}${id}${note}`)
    }

    if (!args['dry-run']) {
      const generated = await loadGenerated(rootDir)
      generated[environment] = result.ids
      const functionsDir = resolveFunctionsDir(rootDir)
      const outPath = join(rootDir, functionsDir, 'billing.generated.ts')
      writeFileSync(outPath, renderGenerated(generated))
      console.log(`[nuxt-backend] Wrote ${outPath}`)
    }

    if (result.webhookSecret) {
      console.log('\n[nuxt-backend] Webhook endpoint created. Store its secret on the deployment:')
      console.log(`  npx convex env set BILLING_WEBHOOK_SECRET ${result.webhookSecret}`)
    }
  },
})

export const billing = defineCommand({
  meta: { name: 'billing', description: 'Billing catalog helpers' },
  subCommands: { sync: billingSync },
})
