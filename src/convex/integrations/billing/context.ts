import { Polar } from '@convex-dev/polar'
import { productsList } from '@polar-sh/sdk/funcs/productsList.js'
import type { Auth } from 'convex/server'
import { BILLING_MANAGER_ROLES, RECENT_SIGN_IN_SECONDS } from '../../constants.js'
import { type AdapterFindOne, type CallerRule, callerRefusal, createAccessReads, hasAnyRole, refuseCaller, refuseStaleSignIn, sandboxAdminRefusal } from '../access.js'
import { createBillingActivity, type RecordBillingEvent } from './activity.js'
import { syncProviderProducts } from './provider-events.js'
import type { ProviderCtx, RunQueryCtx, RunWriteCtx } from './types/base.js'
import type { BillingCatalogIds, CreditMeterConfig, SpendCreditsEvent } from './types/records.js'
import type { BillingAccessRule, BillingComponents, BillingEntity, BillingEntityCtx, ProviderLibRefs, SetupBillingConfig } from './types/setup.js'
import { backendEnvironment, readEnv } from '../../delivery.js'
import { billingEnvironment } from '../../environment.js'
import { backendError, getBackendError } from '../../errors.js'
import { logBackend } from '../../log.js'

/** The refusals that say who the caller is, which a resolver of the app's own may answer with. */
const CALLER_REFUSALS = new Set(['unauthenticated', 'forbidden', 'no_workspace'])

/** What a workspace member who manages none of its billing reads when they try to. */
const NOT_BILLING_MANAGER = 'Only the workspace\'s owner and admins manage its billing. Ask one of them.'

/** Each `setupBilling` instance's meter lookup: `jobs.define` refuses a count meter with it. */
export const BILLING_METERS = new WeakMap<object, BillingContext['resolveMeter']>()

/** Each `setupBilling` instance's `billTo`: a guest job claimed at sign-up moves to the account's billing entity with it. */
export const BILLING_TO = new WeakMap<object, BillingContext['billTo']>()

/**
 * Who each of the package's billing calls is for: the runtime rows every
 * function of `billing.api` checks its caller
 * against. The probe suite's policy registry mirrors them.
 *
 * - `read`: the plan, features, credits and usage — any member, an
 *   impersonating administrator included;
 * - `spend`: credits, through `spendCredits` and `setupAi` — any member,
 *   never an impersonating administrator;
 * - `checkout`: a checkout link — the billing managers, never an
 *   impersonating administrator;
 * - `portal`: the customer portal, where the plan, the payment method and
 *   the invoices change — the billing managers, in person;
 * - `change`: the plan's lifecycle — the billing managers, in person;
 * - `records`: orders and invoices — the billing managers;
 * - `provider`: the provider client's own checkout and portal actions,
 *   which the package never mounts, held to the strictest row should one
 *   ever run.
 */
export const BILLING_ACCESS = {
  read: { access: 'member' },
  spend: { access: 'member', impersonation: 'refused' },
  checkout: { access: 'manage', impersonation: 'refused' },
  portal: { access: 'manage', impersonation: 'refused' },
  change: { access: 'manage', impersonation: 'refused' },
  records: { access: 'manage' },
  provider: { access: 'manage', impersonation: 'refused' },
} as const satisfies Record<string, BillingAccessRule>

/**
 * The admin functions that move money: a sign-in from the last ten minutes,
 * never an impersonated session. Their row of
 * the sensitive-action table (`billing:refundOrder`) says the same.
 */
export const ADMIN_WRITE: CallerRule = { impersonation: 'refused', recentSignIn: RECENT_SIGN_IN_SECONDS }

/** The admin reads (the webhook log): an impersonated session may. */
export const ADMIN_READ: CallerRule = {}

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
  billTo: 'workspace' | 'user'
  accessToken: string | undefined
  environment: 'sandbox' | 'production'
  webhookSecret: string | undefined
  /** The generated catalog's ids in force: the environment's. */
  catalogIds: BillingCatalogIds | undefined
  products: Record<string, string> | undefined
  /** The product ids of retired plans: still a subscriber's plan, never sold again. */
  retiredProductIds: Set<string>
  /** The catalog's free plan, its key and its product; `null` when it sells none. */
  freePlan: { key: string, productId: string } | null
  creditMeters: Record<string, CreditMeterConfig>
  meterNameById: Map<string, string>
  resolveMeter: (event: Pick<SpendCreditsEvent, 'meter' | 'meterId'>) => (CreditMeterConfig & { key?: string }) | null
  resolveEntity: (ctx: BillingEntityCtx) => Promise<BillingEntity | null>
  requireEntity: (ctx: ProviderCtx | (RunQueryCtx & { auth?: Auth }), rule: BillingAccessRule) => Promise<BillingEntity>
  allowedEntity: (ctx: RunQueryCtx & { auth?: Auth }, rule: BillingAccessRule) => Promise<BillingEntity | null>
  /** A person's role in a workspace as its member table holds it now; `null` for a non-member. */
  memberRole: (ctx: RunQueryCtx, userId: string, workspaceId: string) => Promise<string | null>
  /** The account as the user table holds it now (role, ban), read once per call; `null` once it is deleted. */
  account: (ctx: RunQueryCtx, userId: string) => Promise<{ role: string, banned: boolean } | null>
  provider: Polar
  cache: BillingComponents['backend']['billing']
  providerLib: ProviderLibRefs['lib']
  webhookLog: BillingComponents['backend']['webhooks']
  requireProviderAccess: (operation: string) => void
  unwrapProvider: <T>(result: { ok: true, value: T } | { ok: false, error: unknown }, operation: string) => T
  /** Reload the products table from the provider, every product as a delivery stores it. */
  syncProducts: (ctx: RunWriteCtx) => Promise<void>
  throttle: (ctx: RunWriteCtx, userId: string, what: string) => Promise<void>
  customerOwner: (ctx: RunWriteCtx, customer: { id: string, metadata?: Record<string, unknown> | null }) => Promise<string | null>
  requireAdmin: (ctx: RunQueryCtx & { auth?: Auth }, what: string, rule: CallerRule) => Promise<void>
  /** Record a billing event for one entity on the shared event path, never failing the caller. */
  recordEvent: RecordBillingEvent
  /**
   * Whether an account's erasure is deleting a billing entity (`account.forget`
   * marks it before any provider call): no free plan starts for it, and the
   * provider's deliveries about it sync and record nothing, so the erasure
   * leaves nothing behind. `false` on a component built before it.
   */
  entityDeleting: (ctx: RunQueryCtx, entityId: string) => Promise<boolean>
}

/** The catalog's free plan by its key and its monthly product, as `billing sync` wrote it; `null` without one. */
function freePlanIds(catalogIds: BillingCatalogIds | undefined): BillingContext['freePlan'] {
  const key = catalogIds?.free
  const productId = key ? catalogIds?.plans?.[key]?.month : undefined
  return key && productId ? { key, productId } : null
}

export function createBillingContext(components: BillingComponents, config: SetupBillingConfig): BillingContext {
  const billTo = config.billTo ?? 'workspace'
  // Service-neutral config: explicit values win, then the BILLING_* env vars
  // — passed explicitly to the provider client so its own service-named env
  // fallbacks never engage. The billing environment is the deployment's:
  // the provider's production only on a `production` BACKEND_ENVIRONMENT.
  const environment = billingEnvironment(backendEnvironment())
  const accessToken = config.accessToken ?? readEnv('BILLING_ACCESS_TOKEN')
  const webhookSecret = config.webhookSecret ?? readEnv('BILLING_WEBHOOK_SECRET')

  // The generated catalog (billing.generated.ts) supplies the environment's
  // product ids and named credit meters; explicit config wins over it.
  const catalogIds = config.catalog?.[environment]
  const products = config.products ?? catalogIds?.products
  const retiredProductIds = new Set((catalogIds?.retired ?? []).flatMap(key => Object.values(catalogIds?.plans?.[key] ?? {})))
  const freePlan = freePlanIds(catalogIds)
  const creditMeters: Record<string, CreditMeterConfig> = { ...catalogIds?.meters, ...config.credits }
  const meterNameById = new Map(Object.entries(creditMeters).map(([key, meter]) => [meter.meterId, key]))

  /** Resolve a spend's target meter from its friendly name or raw meter id. */
  const resolveMeter = (event: Pick<SpendCreditsEvent, 'meter' | 'meterId'>): (CreditMeterConfig & { key?: string }) | null => {
    if (event.meter) {
      const found = creditMeters[event.meter]
      // A catalog not synced yet: nothing can be bought or spent until it is.
      if (!found) {
        throw backendError(
          'not_ready',
          { reason: 'no_catalog' },
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
    const entityId = billTo === 'workspace'
      ? (typeof claims.activeOrganizationId === 'string' ? claims.activeOrganizationId : null)
      : identity.subject
    if (!entityId) return null
    return { userId: entityId, email: typeof claims.email === 'string' ? claims.email : '' }
  }

  const reads = createAccessReads(components.backend.adapter.findOne as AdapterFindOne)

  /**
   * The entity a call acts for, or the refusal, decided in this order: a
   * caller nobody signed in as (a hand-built context with no `auth`
   * included) is `unauthenticated`; a session or token the rule refuses is
   * `forbidden` (`impersonating`);
   * an account deleted since its token was minted is `unauthenticated`, a
   * banned one `forbidden` (`banned`), read fresh; a signed-in caller
   * without an entity is `no_workspace`. With `billTo: 'workspace'` the
   * entity is a workspace, and the caller's membership is read fresh from
   * its member table, never from the token: someone removed is `forbidden`
   * (`not_member`) on their next call, and anything but `access: 'member'`
   * needs an owner or an admin of it (`not_billing_manager`). With
   * `billTo: 'user'` the caller is their own entity's manager, or your
   * `resolveEntity`, which gets the rule, decides. The detail names what the
   * default resolver reads; a custom one is the app's own, so it is only named.
   */
  /**
   * The entity the resolver names for this rule. A resolver's own refusal of
   * the caller (`unauthenticated`, `forbidden`, `no_workspace`) is the
   * decision: a read answers `null` for it like for any other. Anything
   * else — a crash, a service that is `unavailable`, a `rate_limited` —
   * stays a failure, never "no billing".
   */
  const resolveFor = async (ctx: RunQueryCtx & { auth?: Auth }, rule: BillingAccessRule): Promise<BillingEntity | Error | null> => {
    try {
      return config.resolveEntity ? await config.resolveEntity(ctx as BillingEntityCtx, rule) : await resolveEntity(ctx as BillingEntityCtx)
    }
    catch (error) {
      if (error instanceof Error && CALLER_REFUSALS.has(getBackendError(error)?.code ?? '')) return error
      throw error
    }
  }

  const decide = async (ctx: RunQueryCtx & { auth?: Auth }, rule: BillingAccessRule): Promise<BillingEntity | Error> => {
    // Fail closed on a rule the package does not know: a JavaScript caller
    // of `billing.requireEntity` is not held to the type.
    if (rule.access !== 'member' && rule.access !== 'manage') {
      return backendError('forbidden', { reason: 'permission' }, `[nuxt-backend] Billing: unknown access ${JSON.stringify(rule.access)} — use 'member' or 'manage'.`)
    }
    const identity = await ctx.auth?.getUserIdentity()
    const detail = billTo === 'workspace'
      ? '[nuxt-backend] Billing needs an active workspace — sign in (a personal workspace is created automatically) or activate one.'
      : '[nuxt-backend] Billing needs a signed-in user.'
    if (!identity) return backendError('unauthenticated', {}, detail)
    const refused = callerRefusal(identity as unknown as Record<string, unknown>, rule, 'Billing')
    if (refused) return refused
    const account = await reads.account(ctx, identity.subject, rule.reread)
    if (!account) return backendError('unauthenticated', {}, '[nuxt-backend] Billing: this account no longer exists.')
    if (account.banned) return backendError('forbidden', { reason: 'banned' }, '[nuxt-backend] Billing: this account is banned.')
    const entity = await resolveFor(ctx, rule)
    if (entity instanceof Error) return entity
    if (!entity) {
      return config.resolveEntity
        ? backendError('no_workspace', {}, '[nuxt-backend] Billing found no billing entity for this caller: setupBilling\'s resolveEntity returned null.')
        : backendError('no_workspace', {}, detail)
    }
    if (billTo !== 'workspace') return entity
    const role = await reads.memberRole(ctx, identity.subject, entity.userId, rule.reread)
    if (!role) return backendError('forbidden', { reason: 'not_member' }, '[nuxt-backend] Billing: the caller is no member of this workspace (any more).')
    if (rule.access !== 'member' && !hasAnyRole(role, BILLING_MANAGER_ROLES)) {
      return backendError('forbidden', { reason: 'not_billing_manager', message: NOT_BILLING_MANAGER }, `[nuxt-backend] ${NOT_BILLING_MANAGER}`)
    }
    return entity
  }

  const isRefusal = (decided: BillingEntity | Error): decided is Error => decided instanceof Error

  /** The entity a call acts for under `rule`, or the refusal thrown (see {@link decide}). */
  const requireEntity = async (ctx: ProviderCtx | (RunQueryCtx & { auth?: Auth }), rule: BillingAccessRule): Promise<BillingEntity> => {
    const decided = await decide(ctx as RunQueryCtx & { auth?: Auth }, rule)
    if (isRefusal(decided)) throw decided
    return decided
  }

  /**
   * The same decision for a reactive read: `null` for whoever it refuses,
   * so a client subscribed through a sign-out, a removal or a reconnect
   * settles instead of retrying a throw.
   */
  const allowedEntity = async (ctx: RunQueryCtx & { auth?: Auth }, rule: BillingAccessRule): Promise<BillingEntity | null> => {
    const decided = await decide(ctx, rule)
    return isRefusal(decided) ? null : decided
  }

  // The provider component's client, for its reads and its customer and
  // product calls. It verifies no webhook: `/billing/events` checks every
  // delivery with the package's one verifier (webhook-signatures.ts).
  const provider = new Polar(components.polar, {
    products,
    getUserInfo: ctx => requireEntity(ctx, BILLING_ACCESS.provider),
    organizationToken: accessToken,
    server: environment,
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
   * log). The rule goes first, whoever decides the rest: for `refundOrder`
   * no impersonated session. Then
   * `setupBilling`'s `requireAdmin` when given; otherwise an `admin` entry
   * in the account's role, read fresh from the user table (the admin
   * plugin writes it comma-separated), on an account that is not banned: a
   * demoted admin is refused on their next call, whatever their token
   * still says. Throws `forbidden` (reason `admin_only`) to refuse. On a
   * sandbox, whichever gate decided, the package's admin rule follows
   * (`passkey_only_admin`): a passkey-only account, signed in to this
   * session with a passkey.
   */
  const requireAdmin = async (ctx: RunQueryCtx & { auth?: Auth }, what: string, rule: CallerRule): Promise<void> => {
    const identity = await ctx.auth?.getUserIdentity()
    // Nobody signed in is asked to sign in, before any gate is asked.
    if (!identity) throw backendError('unauthenticated', {}, `[nuxt-backend] ${what} is admin-only — sign in as an admin.`)
    const { recentSignIn, ...callerRule } = rule
    const claims = identity as unknown as Record<string, unknown>
    refuseCaller(claims, callerRule, what)
    if (config.requireAdmin) await config.requireAdmin(ctx)
    else {
      const account = await reads.account(ctx, identity.subject)
      if (!account || account.banned || !hasAnyRole(account.role, 'admin')) {
        throw backendError('forbidden', { reason: 'admin_only' }, `[nuxt-backend] ${what} is admin-only — sign in as an admin, or pass \`requireAdmin\` to setupBilling to define your own gate.`)
      }
    }
    const sandbox = await sandboxAdminRefusal(ctx, reads, identity, what)
    if (sandbox) throw sandbox
    // Last: an admin is asked for a recent sign-in, anyone else told they are none.
    refuseStaleSignIn(claims, recentSignIn, what)
  }

  const isDeleting = components.backend.account?.isDeleting
  const entityDeleting = async (ctx: RunQueryCtx, entityId: string): Promise<boolean> => isDeleting ? await ctx.runQuery(isDeleting, { entityId }) : false

  return {
    components,
    config,
    billTo,
    accessToken,
    environment,
    webhookSecret,
    catalogIds,
    products,
    retiredProductIds,
    freePlan,
    creditMeters,
    meterNameById,
    resolveMeter,
    resolveEntity,
    requireEntity,
    allowedEntity,
    memberRole: (ctx, userId, workspaceId) => reads.memberRole(ctx, userId, workspaceId),
    account: (ctx, userId) => reads.account(ctx, userId),
    provider,
    cache,
    providerLib,
    webhookLog,
    requireProviderAccess,
    unwrapProvider,
    syncProducts: ctx => syncProviderProducts(ctx, async page => unwrapProvider(await productsList(provider.polar, { page, limit: 100 }), 'product sync'), providerLib.updateProduct),
    throttle,
    customerOwner,
    requireAdmin,
    recordEvent: createBillingActivity(components, billTo, config.audit, entityDeleting),
    entityDeleting,
  }
}
