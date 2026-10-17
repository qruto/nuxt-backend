import type { BillingContext } from './context.js'
import { readEnv } from './context.js'
import type { CheckoutCreateInput, ProviderCtx, RunQueryCtx } from './types/base.js'
import type { CampaignAttribution, CheckoutTrial } from './types/options.js'
import { backendError } from '../../errors.js'
import { logBackend } from '../../log.js'

// What a buyer may choose and what only the server decides. A client picks
// from the app's catalog, lands back on the app's own site, and attaches its
// own metadata and campaign attribution; the products, the trial, a discount
// by id and the keys the package reads back are the server's. Every refusal
// is `invalid_input` with the field it refuses.

/**
 * Metadata keys the package writes on a checkout and reads back from the
 * order, subscription or customer it becomes: the billing entity a webhook
 * resolves (`userId`), the gift a paid order delivers (`giftId`) and whether
 * that order bought it or claimed it (`phase`). A client that could set them
 * could bill another workspace's plan to itself or claim someone else's
 * gift, so they are refused from the client, in any letter case. The keys
 * earlier releases wrote stay reserved, and the `utm_` prefix is too: the
 * package writes it from {@link CampaignAttribution}.
 */
export const RESERVED_METADATA_KEYS = ['userId', 'gift', 'giftId', 'phase', 'recipientEmail', 'purchaserUserId', 'giftRecipient'] as const

/** The prefix of the attribution keys the package writes. */
export const CAMPAIGN_METADATA_PREFIX = 'utm_'

/** The provider's own limits on a metadata key and a string value. */
const METADATA_KEY_LENGTH = 40
const METADATA_VALUE_LENGTH = 500
/** How many keys a client may set: the provider takes 50, and the package writes some of its own. */
const METADATA_CLIENT_KEYS = 20
/** A campaign value is kept to this many characters; longer ones are cut, not refused. */
const CAMPAIGN_VALUE_LENGTH = 100
/** A discount code longer than this is no code the provider issues. */
const DISCOUNT_CODE_LENGTH = 64
/** The longest trial the server may grant at checkout, in days. */
export const MAX_TRIAL_DAYS = 30

/**
 * Trial units in days. Days and weeks only: the provider counts a month as a
 * calendar month, up to 31 days, so a month would not hold the 30-day cap.
 */
const TRIAL_DAYS: Record<CheckoutTrial['interval'], number> = { day: 1, week: 7 }

const CAMPAIGN_FIELDS = ['source', 'medium', 'campaign', 'term', 'content'] as const

const reservedKeys = new Set<string>(RESERVED_METADATA_KEYS.map(key => key.toLowerCase()))

/** Whether a metadata key is one the package writes and reads back. */
function isReservedKey(key: string): boolean {
  const lower = key.toLowerCase()
  return reservedKeys.has(lower) || lower.startsWith(CAMPAIGN_METADATA_PREFIX)
}

/** The origin of a URL, or `null` when it is not an absolute http(s) URL. */
function originOf(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null
  }
  catch {
    return null
  }
}

const LOOPBACK = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/

/** The rules every purchase goes through, bound to one `setupBilling` call. */
export function createPurchaseRules({ config, environment, products, provider }: BillingContext) {
  // An entry without a scheme (`app.example.com`) is no origin and never
  // matches: say so when billing is set up, not on a refused checkout.
  for (const entry of config.trustedOrigins ?? []) {
    if (originOf(entry) === null) {
      logBackend('warn', 'billing.trusted_origin_invalid', 'A setupBilling trustedOrigins entry is no http(s) origin, so it trusts nothing: write it with its scheme, as https://app.example.com.')
    }
  }
  // The catalog keys `billing sync` wrote as packs, when the generated catalog has them.
  const packKeys = config.catalog?.[environment]?.packs
  // Each pack's private gift product, which `billing sync` creates beside it.
  const giftProducts = config.catalog?.[environment]?.gifts

  /**
   * The origins a buyer may return to: `SITE_URL`'s, then
   * `setupBilling({ trustedOrigins })`, read per call so an env change
   * applies without a redeploy of the code. With `AUTH_TRUST_LOCAL_ORIGINS=1`
   * (local development, the same switch auth reads) any loopback origin too.
   */
  const isTrustedOrigin = (origin: string): boolean => {
    const trusted = [readEnv('SITE_URL'), ...config.trustedOrigins ?? []].map(originOf)
    if (trusted.includes(origin)) return true
    return readEnv('AUTH_TRUST_LOCAL_ORIGINS') === '1' && LOOPBACK.test(origin)
  }

  /**
   * Refuse a redirect, return or embed URL off the app's own origins: the
   * provider sends the buyer there with a checkout id in the query, so an
   * open redirect would hand a paid session to anyone's page.
   */
  const requireTrustedUrl = (value: string | undefined, field: string): void => {
    if (value === undefined) return
    const origin = originOf(value)
    if (origin && isTrustedOrigin(origin)) return
    throw backendError(
      'invalid_input',
      { field },
      `[nuxt-backend] Billing: \`${field}\` must be on the site's own origin (SITE_URL) or one of setupBilling's \`trustedOrigins\`.`,
    )
  }

  /**
   * The provider product ids of the app's catalog: `setupBilling({ products })`,
   * else the generated catalog's. An app with none sells nothing yet, which
   * is `not_ready`, not the buyer's mistake.
   */
  const catalogIds = (): Set<string> => {
    const known = new Set(Object.values(products ?? {}))
    if (known.size > 0) return known
    throw backendError(
      'not_ready',
      { reason: 'no_catalog' },
      '[nuxt-backend] Billing has no catalog to sell yet — declare plans and packs in billing.catalog.ts and run `npx nuxt-backend billing sync` (or pass setupBilling\'s `products`).',
    )
  }

  /** Refuse any product the app's catalog does not list. */
  const requireCatalogProducts = (productIds: readonly string[], field: string): void => {
    const known = catalogIds()
    if (productIds.length > 0 && productIds.every(id => known.has(id))) return
    throw backendError(
      'invalid_input',
      { field },
      `[nuxt-backend] Billing: \`${field}\` names a product outside the app's catalog — sell the plans and packs in billing.catalog.ts (or setupBilling's \`products\`).`,
    )
  }

  /** A catalog product as `billing sync` loaded it, or `null` when the products table has no live row for it. */
  const syncedProduct = async (ctx: RunQueryCtx, productId: string) => {
    const product = await provider.getProduct(ctx as unknown as ProviderCtx, { productId })
    return product && !product.isArchived ? product : null
  }

  /**
   * The provider product of a catalog pack, by its catalog key. With the
   * generated catalog's `packs` (written by `billing sync`), the key must
   * be one of them; with `setupBilling({ products })` alone, the product
   * must be one the provider sells once. Either way the product must be
   * synced and one-time, never a plan. The key is not repeated back: it is
   * the client's.
   */
  const requirePack = async (ctx: RunQueryCtx, key: string): Promise<string> => {
    const known = catalogIds()
    const productId = Object.hasOwn(products!, key) ? products![key] : undefined
    const listed = productId !== undefined && known.has(productId) && (packKeys === undefined || packKeys.includes(key))
    const product = listed ? await syncedProduct(ctx, productId) : null
    if (productId && product && !product.isRecurring) return productId
    throw backendError(
      'invalid_input',
      { field: 'pack' },
      '[nuxt-backend] Billing: the gift names no credit pack of the app\'s catalog. Gifts are packs only, by their catalog key, once `billing sync` has loaded the product.',
    )
  }

  /**
   * The private gift product of a catalog pack: what a purchaser buys for
   * someone else. `billing sync` creates it beside the pack, with its prices
   * and none of its benefits, so the purchase grants the purchaser nothing.
   * An app without one has not synced since gifts changed: `not_ready`.
   */
  const requireGiftProduct = (key: string): string => {
    const productId = giftProducts && Object.hasOwn(giftProducts, key) ? giftProducts[key] : undefined
    if (productId) return productId
    throw backendError(
      'not_ready',
      { reason: 'no_catalog' },
      '[nuxt-backend] Billing: this pack has no gift product yet — run `npx nuxt-backend billing sync`, which creates a private gift product beside each pack.',
    )
  }

  /**
   * A plan to switch a subscription to: in the catalog, and a recurring
   * product the products table has loaded — never a pack, which the
   * provider could not bill as a subscription.
   */
  const requirePlan = async (ctx: RunQueryCtx, productId: string): Promise<void> => {
    requireCatalogProducts([productId], 'productId')
    const product = await syncedProduct(ctx, productId)
    if (product?.isRecurring) return
    throw backendError(
      'invalid_input',
      { field: 'productId' },
      '[nuxt-backend] Billing: a plan change switches to a recurring plan of the catalog, once `billing sync` has loaded it — not to a credit pack.',
    )
  }

  /**
   * The client's own metadata, checked: no key the package reads back, and
   * within the provider's limits, with room left for the package's keys.
   */
  const requireClientMetadata = (metadata: Record<string, unknown> | undefined): void => {
    if (metadata === undefined) return
    const entries = Object.entries(metadata)
    if (entries.some(([key]) => isReservedKey(key))) {
      throw backendError(
        'invalid_input',
        { field: 'metadata' },
        `[nuxt-backend] Billing: a metadata key is the package's own (${RESERVED_METADATA_KEYS.join(', ')}, ${CAMPAIGN_METADATA_PREFIX}*) — pick another name; campaign attribution goes in \`utm\`.`,
      )
    }
    const unfit = entries.length > METADATA_CLIENT_KEYS
      || entries.some(([key, value]) => key.length === 0 || key.length > METADATA_KEY_LENGTH || typeof value !== 'string' || value.length > METADATA_VALUE_LENGTH)
    if (unfit) {
      throw backendError(
        'invalid_input',
        { field: 'metadata' },
        `[nuxt-backend] Billing: metadata takes at most ${METADATA_CLIENT_KEYS} keys of 1–${METADATA_KEY_LENGTH} characters, with string values of at most ${METADATA_VALUE_LENGTH}.`,
      )
    }
  }

  return { requireTrustedUrl, requireCatalogProducts, requirePack, requireGiftProduct, requirePlan, requireClientMetadata }
}

/**
 * Campaign attribution as flat `utm_*` metadata, the way the provider's own
 * checkout links store it. Values are trimmed and cut to 100 characters, and
 * empty ones dropped: attribution comes from a URL anyone can edit, so a
 * long one is shortened rather than turned into a failed checkout.
 */
export function campaignMetadata(utm: CampaignAttribution | undefined): Record<string, string> {
  const flat: Record<string, string> = {}
  for (const field of CAMPAIGN_FIELDS) {
    const value = utm?.[field]?.trim().slice(0, CAMPAIGN_VALUE_LENGTH)
    if (value) flat[`${CAMPAIGN_METADATA_PREFIX}${field}`] = value
  }
  return flat
}

/** A typed discount code, trimmed; `undefined` for none, refused when no code could be that long. */
export function discountCodeOf(code: string | undefined): string | undefined {
  const trimmed = code?.trim()
  if (!trimmed) return undefined
  if (trimmed.length > DISCOUNT_CODE_LENGTH) {
    throw backendError('invalid_input', { field: 'discountCode' }, `[nuxt-backend] Billing: a discount code is at most ${DISCOUNT_CODE_LENGTH} characters.`)
  }
  return trimmed
}

/**
 * The provider's trial fields for a server-chosen trial: `undefined` keeps
 * the product's own trial (the catalog's `trial`), `false` removes it, and
 * an override grants at most {@link MAX_TRIAL_DAYS} days, in days or weeks.
 * Anything else — `null`, a month, a year, a count that is no whole
 * number — is refused.
 */
export function trialPayload(trial: CheckoutTrial | false | undefined): Pick<CheckoutCreateInput, 'allowTrial' | 'trialInterval' | 'trialIntervalCount'> {
  if (trial === undefined) return {}
  if (trial === false) return { allowTrial: false }
  const shape = (typeof trial === 'object' && trial !== null ? trial : {}) as Partial<CheckoutTrial>
  const count = shape.count ?? 1
  const unit = shape.interval !== undefined && Object.hasOwn(TRIAL_DAYS, shape.interval) ? TRIAL_DAYS[shape.interval] : Number.NaN
  if (!Number.isInteger(count) || count < 1 || !(unit * count <= MAX_TRIAL_DAYS)) {
    throw backendError(
      'invalid_input',
      { field: 'trial' },
      `[nuxt-backend] Billing: a checkout trial is 1 to ${MAX_TRIAL_DAYS} days, counted in days or weeks.`,
    )
  }
  return { allowTrial: true, trialInterval: shape.interval, trialIntervalCount: count }
}

/** The purchase rules of one `setupBilling` call. */
export type PurchaseRules = ReturnType<typeof createPurchaseRules>
