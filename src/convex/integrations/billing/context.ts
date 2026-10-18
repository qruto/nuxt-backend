import { Polar } from '@convex-dev/polar'
import type { Auth } from 'convex/server'
import { parseSecretList } from '../webhook-guard.js'
import type { ProviderCtx, RunQueryCtx, RunWriteCtx } from './types/base.js'
import type { CreditMeterConfig, SpendCreditsEvent } from './types/records.js'
import type { BillingComponents, BillingEntity, BillingEntityCtx, ProviderLibRefs, SetupBillingConfig } from './types/setup.js'
import { backendError } from '../../errors.js'
import { logBackend } from '../../log.js'

type EnvHost = typeof globalThis & {
  process?: { env?: Record<string, string | undefined> }
}

export function readEnv(name: string) {
  return (globalThis as EnvHost).process?.env?.[name]
}

/**
 * The provider paginates by page number, so the opaque `cursor` this package
 * hands out is just that number as a string — kept opaque at the boundary so
 * the pagination scheme can change without a breaking argument change.
 */
export function resolvePage(options: { cursor?: string, page?: number }): number {
  const fromCursor = options.cursor === undefined ? Number.NaN : Number(options.cursor)
  const page = Number.isInteger(fromCursor) ? fromCursor : options.page
  // A malformed cursor or page reads as "the first page" rather than an error:
  // pagination tokens are opaque, so a stale one should not break the view.
  return Number.isFinite(page) ? Math.max(1, Math.trunc(page!)) : 1
}

/** Whether a refused provider request means the object is not there: the SDK's 404 or its `ResourceNotFound`. */
export function isProviderNotFound(error: unknown): boolean {
  const fields = (typeof error === 'object' && error !== null ? error : {}) as { statusCode?: unknown, error?: unknown }
  return fields.statusCode === 404 || fields.error === 'ResourceNotFound'
}

/** Clamp a page size to the provider's accepted 1–100 window. */
export function resolveLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return 10
  return Math.min(Math.max(Math.trunc(limit!), 1), 100)
}

/** What a refused provider request leaves in the deployment log — see {@link summarizeProviderError}. */
interface ProviderErrorSummary {
  name: string
  status?: number
  code?: string
  message?: string
  refused?: string[]
}

/**
 * Reduce a provider SDK error to what may sit in the deployment log: its
 * class, the HTTP status, the provider's error code, and for a validation
 * refusal which fields were refused and by which rule. Never the error
 * itself: the SDK's messages carry the raw response body, and the provider
 * echoes rejected input back in it — emails, names, billing addresses —
 * which Convex would keep.
 */
function summarizeProviderError(error: unknown): ProviderErrorSummary {
  const fields = (typeof error === 'object' && error !== null ? error : {}) as Record<string, unknown>
  const summary: ProviderErrorSummary = { name: error instanceof Error ? error.name : typeof error }
  if (typeof fields.statusCode === 'number') summary.status = fields.statusCode
  // The provider's own code for a typed refusal: `ResourceNotFound`, `NotPermitted`, …
  if (typeof fields.error === 'string') summary.code = fields.error
  // The SDK's fixed phrase for a payload it could not validate ("Input
  // validation failed"); its full message appends the offending value.
  if (typeof fields.rawMessage === 'string') summary.message = fields.rawMessage
  if (Array.isArray(fields.detail)) summary.refused = fields.detail.slice(0, 10).map(describeRefusal)
  return summary
}

/** One validation refusal as `body.email (value_error)`: where and which rule, never the value. */
function describeRefusal(entry: unknown): string {
  const { loc, type } = (typeof entry === 'object' && entry !== null ? entry : {}) as { loc?: unknown, type?: unknown }
  const field = Array.isArray(loc) ? loc.join('.') : 'unknown field'
  return typeof type === 'string' ? `${field} (${type})` : field
}

/**
 * What the billing modules share, resolved once per `setupBilling` call: the
 * configuration with its env-var fallbacks, the provider client, the component
 * handles, and the guards every provider call goes through.
 */
export interface BillingContext {
  components: BillingComponents
  config: SetupBillingConfig
  billTo: 'organization' | 'user'
  accessToken: string | undefined
  environment: 'sandbox' | 'production'
  webhookSecret: string | undefined
  products: Record<string, string> | undefined
  creditMeters: Record<string, CreditMeterConfig>
  meterNameById: Map<string, string>
  resolveMeter: (event: Pick<SpendCreditsEvent, 'meter' | 'meterId'>) => (CreditMeterConfig & { key?: string }) | null
  resolveEntity: (ctx: BillingEntityCtx) => Promise<BillingEntity | null>
  requireEntity: (ctx: ProviderCtx | (RunQueryCtx & { auth?: Auth })) => Promise<BillingEntity>
  provider: Polar
  cache: BillingComponents['backend']['billing']
  providerLib: ProviderLibRefs['lib']
  webhookLog: BillingComponents['backend']['webhooks']
  requireProviderAccess: (operation: string) => void
  unwrapProvider: <T>(result: { ok: true, value: T } | { ok: false, error: unknown }, operation: string) => T
  throttle: (ctx: RunWriteCtx, userId: string, what: string) => Promise<void>
  customerOwner: (ctx: RunWriteCtx, customer: { id: string, metadata?: Record<string, unknown> | null }) => Promise<string | null>
  requireAdmin: (ctx: { auth?: Auth }, what: string) => Promise<void>
}

export function createBillingContext(components: BillingComponents, config: SetupBillingConfig): BillingContext {
  const billTo = config.billTo ?? 'organization'
  // Service-neutral config: explicit values win, then the BILLING_* env vars
  // — passed explicitly to the provider client so its own service-named env
  // fallbacks never engage.
  const accessToken = config.accessToken ?? readEnv('BILLING_ACCESS_TOKEN')
  const environment = config.environment
    ?? (readEnv('BILLING_ENVIRONMENT') as 'sandbox' | 'production' | undefined)
    ?? 'sandbox'
  const webhookSecret = config.webhookSecret ?? readEnv('BILLING_WEBHOOK_SECRET')

  // The generated catalog (billing.generated.ts) supplies the environment's
  // product ids and named credit meters; explicit config wins over it.
  const catalogIds = config.catalog?.[environment]
  const products = config.products ?? catalogIds?.products
  const creditMeters: Record<string, CreditMeterConfig> = { ...catalogIds?.meters, ...config.credits }
  const meterNameById = new Map(Object.entries(creditMeters).map(([key, meter]) => [meter.meterId, key]))

  /** Resolve a spend's target meter from its friendly name or raw meter id. */
  const resolveMeter = (event: Pick<SpendCreditsEvent, 'meter' | 'meterId'>): (CreditMeterConfig & { key?: string }) | null => {
    if (event.meter) {
      const found = creditMeters[event.meter]
      if (!found) {
        throw new Error(
          `[nuxt-backend] Unknown credit meter '${event.meter}' — declare it in setupBilling({ credits }) `
          + 'or generate it with `nuxt-backend billing sync`.',
        )
      }
      return { key: event.meter, ...found }
    }
    if (event.meterId) {
      const key = meterNameById.get(event.meterId)
      return key ? { key, ...creditMeters[key]! } : { meterId: event.meterId }
    }
    return null
  }

  /**
   * Resolve the billing entity: `setupBilling`'s `resolveEntity` when given,
   * else identity claims — the active workspace (org mode) or the signed-in
   * user (user mode). Claims carry `email` and `activeOrganizationId` via
   * this package's JWT payload. Every Convex context has `auth`, and an
   * internal call with no caller has a `null` identity: the default resolves
   * it to nobody, and a custom resolver is handed the context to do the same.
   */
  const resolveEntity = async (ctx: BillingEntityCtx): Promise<BillingEntity | null> => {
    if (config.resolveEntity) return config.resolveEntity(ctx)
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    const claims = identity as unknown as Record<string, unknown>
    const entityId = billTo === 'organization'
      ? (typeof claims.activeOrganizationId === 'string' ? claims.activeOrganizationId : null)
      : identity.subject
    if (!entityId) return null
    return { userId: entityId, email: typeof claims.email === 'string' ? claims.email : '' }
  }

  /**
   * The entity a provider operation runs for, or a clear refusal. Also the
   * provider client's `getUserInfo`, which its own checkout and portal
   * actions call. A hand-built context with no `auth` has no caller to
   * resolve. A caller nobody signed in as is `unauthenticated`; a signed-in
   * one without an entity is `no_workspace`. The detail names what the
   * default resolver reads; a custom one is the app's own, so it is only named.
   */
  const requireEntity = async (ctx: ProviderCtx | (RunQueryCtx & { auth?: Auth })): Promise<BillingEntity> => {
    const caller = ctx as RunQueryCtx & { auth?: Auth }
    const entity = caller.auth ? await resolveEntity(caller as BillingEntityCtx) : null
    if (entity) return entity
    const detail = billTo === 'organization'
      ? '[nuxt-backend] Billing needs an active workspace — sign in (a personal workspace is created automatically) or activate one.'
      : '[nuxt-backend] Billing needs a signed-in user.'
    const signedIn = Boolean(await caller.auth?.getUserIdentity())
    if (!signedIn) throw backendError('unauthenticated', {}, detail)
    if (config.resolveEntity) throw backendError('no_workspace', {}, '[nuxt-backend] Billing found no billing entity for this caller: setupBilling\'s resolveEntity returned null.')
    throw backendError('no_workspace', {}, detail)
  }

  const provider = new Polar(components.polar, {
    products,
    getUserInfo: requireEntity,
    organizationToken: accessToken,
    server: environment,
    // Primary secret only — the raw value may be a comma-separated rotation
    // list; per-secret verification happens in the captured webhook handlers.
    webhookSecret: parseSecretList(webhookSecret)[0],
  })
  const cache = components.backend.billing
  const providerLib = (components.polar as unknown as ProviderLibRefs).lib
  const webhookLog = components.backend.webhooks

  /**
   * Operations that *write* at the provider fail loudly without a token —
   * silently doing nothing with someone's money would be worse than an error.
   * Reads degrade to `null` instead (see `getOrders` / `getInvoiceUrl`), so a
   * mid-configuration deployment still renders.
   */
  const requireProviderAccess = (operation: string): void => {
    if (accessToken) return
    throw backendError(
      'unavailable',
      { service: 'billing', reason: 'not_configured' },
      `[nuxt-backend] Billing ${operation} needs the BILLING_ACCESS_TOKEN env var — `
      + 'set it on the deployment (`npx nuxt-backend doctor` lists what is missing).',
    )
  }

  /**
   * Unwrap a provider SDK result at the package boundary. Rethrowing the raw
   * SDK error would put the provider's own words — HTTP status, response body,
   * sometimes an expired-token hint — in front of a visitor: `<BillingHistory>`
   * renders `orders.error` verbatim. A summary is logged instead (class,
   * status, provider code, refused fields — never the body, which echoes the
   * request), and the caller sees `unavailable` (reason `provider_refused`),
   * the code a missing token produces with another reason.
   */
  const unwrapProvider = <T>(
    result: { ok: true, value: T } | { ok: false, error: unknown },
    operation: string,
  ): T => {
    if (result.ok) return result.value
    logBackend('error', 'billing.provider_failed', `Billing ${operation} failed at the provider.`, summarizeProviderError(result.error))
    throw backendError(
      'unavailable',
      { service: 'billing', reason: 'provider_refused' },
      `[nuxt-backend] Billing is temporarily unavailable — the provider refused the ${operation}. Try again shortly.`,
    )
  }

  /**
   * Throttle one live provider fan-out per billing entity against the shared
   * `billingSync` limit. A no-op until a limiter is configured, so the
   * zero-config scaffold behaves exactly as before. The limiter throws its own
   * `RateLimited` error (`throws: true`), which `getBackendError` reads as
   * `rate_limited`; a structural limiter that answers `{ ok: false }`
   * instead gets the same code from here.
   */
  const throttle = async (ctx: RunWriteCtx, userId: string, what: string): Promise<void> => {
    if (!config.rateLimiter) return
    const { ok, retryAfter } = await config.rateLimiter.limit(ctx, 'billingSync', { key: userId, throws: true })
    // A structural limiter may answer a wait that is no number: refuse without one.
    if (!ok) throw backendError('rate_limited', { limit: 'billingSync', retryAfter: Number.isFinite(retryAfter) ? retryAfter : undefined }, `[nuxt-backend] Too many ${what} — try again shortly.`)
  }

  /**
   * The billing entity a provider customer already pays for: the `userId` its
   * metadata carries (every customer this package binds is tagged with it),
   * else the entity the entitlement cache last synced it for. `null` for a
   * customer no entity has claimed yet.
   */
  const customerOwner = async (
    ctx: RunWriteCtx,
    customer: { id: string, metadata?: Record<string, unknown> | null },
  ): Promise<string | null> => {
    const tagged = customer.metadata?.userId
    if (typeof tagged === 'string' && tagged !== '') return tagged
    const synced = await ctx.runQuery(cache.userByCustomer, { customerId: customer.id })
    return typeof synced === 'string' && synced !== '' ? synced : null
  }

  /**
   * The one gate of the admin-tier functions (`refundOrder`, the webhook
   * log): `setupBilling`'s `requireAdmin` when given; otherwise an `admin`
   * entry in the caller's `role` claim, which the admin plugin writes
   * comma-separated, on an account that is not banned. Throws `forbidden`
   * (reason `admin_only`) to refuse.
   */
  const requireAdmin = async (ctx: { auth?: Auth }, what: string): Promise<void> => {
    if (config.requireAdmin) {
      await config.requireAdmin(ctx)
      return
    }
    const claims = await ctx.auth?.getUserIdentity() as unknown as { role?: unknown, banned?: unknown } | null | undefined
    const roles = typeof claims?.role === 'string' ? claims.role.split(',').map(entry => entry.trim()) : []
    if (!roles.includes('admin') || claims?.banned === true) {
      throw backendError('forbidden', { reason: 'admin_only' }, `[nuxt-backend] ${what} is admin-only — sign in as an admin, or pass \`requireAdmin\` to setupBilling to define your own gate.`)
    }
  }

  return {
    components,
    config,
    billTo,
    accessToken,
    environment,
    webhookSecret,
    products,
    creditMeters,
    meterNameById,
    resolveMeter,
    resolveEntity,
    requireEntity,
    provider,
    cache,
    providerLib,
    webhookLog,
    requireProviderAccess,
    unwrapProvider,
    throttle,
    customerOwner,
    requireAdmin,
  }
}
