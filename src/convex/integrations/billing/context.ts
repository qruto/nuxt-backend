import { Polar } from '@convex-dev/polar'
import type { Auth } from 'convex/server'
import { parseSecretList } from '../webhook-guard.js'
import type { RunWriteCtx } from './types/base.js'
import type { CreditMeterConfig, SpendCreditsEvent } from './types/records.js'
import type { BillingComponents, PolarConfig, ProviderLibRefs, SetupBillingConfig } from './types/setup.js'
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

/** Clamp a page size to the provider's accepted 1–100 window. */
export function resolveLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return 10
  return Math.min(Math.max(Math.trunc(limit!), 1), 100)
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
  entityFromIdentity: (ctx: { auth?: Auth }) => Promise<{ userId: string, email: string } | null>
  getUserInfo: NonNullable<PolarConfig['getUserInfo']>
  provider: Polar
  cache: BillingComponents['backend']['billing']
  providerLib: ProviderLibRefs['lib']
  webhookLog: BillingComponents['backend']['webhooks']
  requireProviderAccess: (operation: string) => void
  unwrapProvider: <T>(result: { ok: true, value: T } | { ok: false, error: unknown }, operation: string) => T
  throttle: (ctx: RunWriteCtx, userId: string, what: string) => Promise<void>
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
   * Resolve the billing entity from identity claims: the active workspace
   * (org mode) or the signed-in user (user mode). Claims carry `email` and
   * `activeOrganizationId` via this package's JWT payload.
   */
  const entityFromIdentity = async (ctx: { auth?: Auth }): Promise<{ userId: string, email: string } | null> => {
    const identity = await ctx.auth?.getUserIdentity()
    if (!identity) return null
    const claims = identity as unknown as Record<string, unknown>
    const entityId = billTo === 'organization'
      ? (typeof claims.activeOrganizationId === 'string' ? claims.activeOrganizationId : null)
      : identity.subject
    if (!entityId) return null
    return { userId: entityId, email: typeof claims.email === 'string' ? claims.email : '' }
  }

  // The provider requires a `getUserInfo`; wrap the entity resolution (or the
  // consumer's override in user mode) with a clear failure for billing
  // operations that need a signed-in entity.
  const getUserInfo: NonNullable<PolarConfig['getUserInfo']> = async (ctx) => {
    if (billTo === 'user' && config.getUserInfo) return config.getUserInfo(ctx)
    const entity = await entityFromIdentity(ctx as unknown as { auth?: Auth })
    if (!entity) {
      throw new Error(billTo === 'organization'
        ? '[nuxt-backend] Billing needs an active workspace — sign in (a personal workspace is created automatically) or activate one.'
        : '[nuxt-backend] Billing needs a signed-in user.')
    }
    return entity
  }

  const provider = new Polar(components.polar, {
    ...config,
    products,
    getUserInfo,
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
    throw new Error(
      `[nuxt-backend] Billing ${operation} needs the BILLING_ACCESS_TOKEN env var — `
      + 'set it on the deployment (`npx nuxt-backend doctor` lists what is missing).',
    )
  }

  /**
   * Unwrap a provider SDK result at the package boundary. Rethrowing the raw
   * SDK error would put the provider's own words — HTTP status, response body,
   * sometimes an expired-token hint — in front of a visitor: `<BillingHistory>`
   * renders `orders.error` verbatim. The detail is logged instead, where it is
   * a debugging aid rather than a leak, and the caller sees the same
   * package-shaped message a missing token produces.
   */
  const unwrapProvider = <T>(
    result: { ok: true, value: T } | { ok: false, error: unknown },
    operation: string,
  ): T => {
    if (result.ok) return result.value
    logBackend('error', 'billing.provider_failed', `Billing ${operation} failed at the provider.`, result.error)
    throw new Error(
      `[nuxt-backend] Billing is temporarily unavailable — the provider refused the ${operation}. Try again shortly.`,
    )
  }

  /**
   * Throttle one live provider fan-out per billing entity against the shared
   * `billingSync` limit. A no-op until a limiter is configured, so the
   * zero-config scaffold behaves exactly as before.
   */
  const throttle = async (ctx: RunWriteCtx, userId: string, what: string): Promise<void> => {
    if (!config.rateLimiter) return
    const { ok } = await config.rateLimiter.limit(ctx, 'billingSync', { key: userId })
    if (!ok) throw new Error(`[nuxt-backend] Too many ${what} — try again shortly.`)
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
    entityFromIdentity,
    getUserInfo,
    provider,
    cache,
    providerLib,
    webhookLog,
    requireProviderAccess,
    unwrapProvider,
    throttle,
  }
}
