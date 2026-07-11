import { Polar, type PolarWebhookEvent, type WebhookEventHandlers } from '@convex-dev/polar'
import { benefitsGet } from '@polar-sh/sdk/funcs/benefitsGet.js'
import { customersGetState } from '@polar-sh/sdk/funcs/customersGetState.js'
import { discountsCreate } from '@polar-sh/sdk/funcs/discountsCreate.js'
import { eventsIngest } from '@polar-sh/sdk/funcs/eventsIngest.js'
import {
  actionGeneric,
  type Auth,
  type FunctionReference,
  type GenericActionCtx,
  type GenericDataModel,
  type GenericQueryCtx,
  queryGeneric,
} from 'convex/server'

/**
 * Any query context — the consumer's `currentUserId` resolver runs inside the
 * lib's generic query, but its body uses the consumer's concrete ctx (e.g.
 * `authComponent.getAuthUser(ctx)`). Typing the data model as `any` makes both
 * sides assignable across the library boundary.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQueryCtx = GenericQueryCtx<any>

/** The component reference accepted by the Polar client (`components.polar`). */
type PolarComponent = ConstructorParameters<typeof Polar>[0]

/**
 * A minimal Convex context (just `runQuery`) — kept DataModel-independent and
 * decoupled from the Polar package's own (possibly older) ctx typings, so any
 * app query/action ctx is assignable. Cast to Polar's exact type internally.
 */
type RunQueryCtx = Pick<GenericActionCtx<GenericDataModel>, 'runQuery'>
/** A context that can both read and write (sync + upsert the cache). */
type RunWriteCtx = Pick<GenericActionCtx<GenericDataModel>, 'runQuery' | 'runMutation'>
type PolarRunQueryCtx = Parameters<Polar['getCustomerByUserId']>[0]

/** Full Polar event-ingest payload (derived from the SDK). */
type EventsIngestRequest = Parameters<typeof eventsIngest>[1]
/** Full Polar discount-create payload (derived from the SDK) — fixed or percentage. */
export type DiscountInput = Parameters<typeof discountsCreate>[1]

/** A single granted benefit (entitlement) in a customer's Polar state. */
export interface EntitlementBenefit {
  id: string
  benefitId: string
  type: string
  /**
   * The benefit's **live** Polar metadata (read from the benefit, not the
   * grant-time snapshot in customer state). Lets consumers feature-gate by a
   * friendly key — set e.g. `{ key: 'premium' }` on the Polar benefit and check
   * `useFeatures().has('premium')`.
   */
  metadata?: Record<string, string | number | boolean>
}

/** A credit-meter balance in a customer's Polar state (prepaid credits). */
export interface EntitlementMeter {
  meterId: string
  consumedUnits: number
  creditedUnits: number
  balance: number
}

/**
 * A user's full Polar entitlement state — active plans, granted benefits, and
 * credit-meter balances — normalized for caching into the reactive component table.
 */
export interface CustomerEntitlements {
  customerId: string | null
  activeProductIds: string[]
  benefits: EntitlementBenefit[]
  meters: EntitlementMeter[]
}

/** A prepaid-credit consumption event (drawn from the customer's meter balance). */
export interface SpendCreditsEvent {
  /**
   * The billing entity id — the workspace id (`billTo: 'organization'`, the
   * default) or the auth user id (`billTo: 'user'`). Omit to resolve it from
   * the caller's identity (the active workspace / signed-in user).
   */
  userId?: string
  /** The meter event name (must match the credit meter's filter, e.g. `"credits"`). */
  name: string
  /**
   * The credit meter id to guard against. When set, the spend is **blocked**
   * (throws) if the balance is below `value` — keeping credits strictly prepaid
   * (never billed as overage). Omit to skip the balance check.
   */
  meterId?: string
  /** Credits required for this spend (default `1`) — used for the balance guard. */
  value?: number
  /** Event properties used by the meter's aggregation/filter. */
  metadata?: Record<string, string | number | boolean>
  /** Idempotency key to prevent double-counting. */
  externalId?: string
  /** Event time (defaults to now). */
  timestamp?: Date
}

/** The cached entitlement state served by the component (`getByUser` shape). */
type CachedEntitlements = Omit<CustomerEntitlements, 'customerId'> & { customerId: string | null }

/**
 * The `billing` function group exposed by the `backend` component (see
 * `src/convex/component/billing.ts`), reachable from the app as
 * `components.backend.billing`. Stores the reactive entitlement/credit cache so
 * consumers add nothing to their own schema.
 */
export interface BillingComponentApi {
  billing: {
    getByUser: FunctionReference<'query', 'public', { userId: string }, CachedEntitlements | null>
    upsert: FunctionReference<'mutation', 'public', {
      userId: string
      customerId?: string
      activeProductIds: string[]
      benefits: EntitlementBenefit[]
      meters: EntitlementMeter[]
    }, null>
    userByCustomer: FunctionReference<'query', 'public', { customerId: string }, string | null>
  }
}

type PolarConfig = ConstructorParameters<typeof Polar>[1]

/**
 * Polar client configuration. Mirrors `@convex-dev/polar`'s constructor config
 * (product map / organization token / server — token, webhook secret, and
 * server fall back to the `POLAR_*` env vars when omitted), plus `billTo`.
 *
 * The billing entity resolves from identity claims out of the box — the
 * active workspace (`billTo: 'organization'`, the default) or the signed-in
 * user (`billTo: 'user'`) — so `getUserInfo` / `currentUserId` are optional
 * overrides, not required wiring.
 */
export type SetupBillingConfig = Omit<PolarConfig, 'getUserInfo'> & {
  /**
   * Who owns subscriptions and credits: the active workspace (`'organization'`,
   * the default — members share the workspace's plan and credits) or the
   * individual user (`'user'`, for B2C apps without shared billing).
   */
  billTo?: 'organization' | 'user'
  /**
   * Override the billing-entity resolution for **action** contexts (checkout /
   * portal / sync). Only consulted with `billTo: 'user'`; the default reads
   * the signed-in user from identity claims.
   */
  getUserInfo?: PolarConfig['getUserInfo']
  /**
   * Override the billing-entity resolution for **query** contexts (the
   * reactive `getCurrentSubscription` / `getFeatures` / `getCredits` reads).
   * Only consulted with `billTo: 'user'`; the default reads identity claims.
   * Return `null` when signed out so reads degrade gracefully.
   */
  currentUserId?: (ctx: AnyQueryCtx) => Promise<string | null>
  /**
   * React to Polar webhook events, keyed by Polar's own event names
   * (`'order.paid'`, `'subscription.active'`, …). Your handler runs **after**
   * the built-in entitlement-cache refresh, so features/credits read fresh
   * inside it. Events outside the built-in refresh set are mounted too.
   */
  events?: Partial<WebhookEventHandlers>
}

/** Webhook events that signal a customer's plans / benefits / credits may have changed. */
const REFRESH_EVENTS = [
  'customer.state_changed',
  'order.created',
  'order.paid',
  'order.refunded',
  'subscription.created',
  'subscription.updated',
  'subscription.active',
  'subscription.canceled',
  'subscription.revoked',
  'benefit_grant.created',
  'benefit_grant.updated',
  'benefit_grant.cycled',
  'benefit_grant.revoked',
] as const satisfies ReadonlyArray<keyof WebhookEventHandlers>

export interface Billing {
  /** The underlying Polar component client (use `polar.polar` for the raw SDK). */
  polar: Polar
  /**
   * The ready-made checkout / portal / subscription functions to re-export from
   * your Convex module (the result of `polar.api()`).
   */
  api: ReturnType<Polar['api']>
  /**
   * Ready-made, client-callable functions to re-export from your `backend/billing.ts`
   * so `useBilling` / `useFeatures` / `useCredits` work with zero hand-wiring:
   * the reactive current-subscription, feature-gating and credit-balance queries,
   * plus a `syncEntitlements` action to refresh the cache after checkout / top-up.
   */
  functions: {
    getCurrentSubscription: ReturnType<typeof queryGeneric>
    getFeatures: ReturnType<typeof queryGeneric>
    getCredits: ReturnType<typeof queryGeneric>
    syncEntitlements: ReturnType<typeof actionGeneric>
  }
  /**
   * Typed Polar webhook handlers for `polar.registerRoutes(http, { events })` that
   * keep the reactive cache fresh (subscriptions, benefit grants, credit balances).
   */
  webhookEvents: WebhookEventHandlers
  /**
   * Resolve a user's full Polar entitlement state (active plans, benefits, and
   * credit-meter balances) live from Polar. Call from an **action**; the ready-made
   * `syncEntitlements` already caches the result for you.
   */
  getCustomerState: (ctx: RunQueryCtx, args: { userId: string }) => Promise<CustomerEntitlements>
  /**
   * Spend prepaid credits (Polar `events.ingest`) — call from your own
   * **server** action when a metered feature is used. The billing entity
   * (workspace or user, per `billTo`) resolves from the caller's identity;
   * pass `userId` to spend for a specific entity. With `meterId` set, the
   * spend is blocked when the balance is insufficient (strictly prepaid).
   */
  spendCredits: (ctx: RunQueryCtx & { auth?: Auth }, event: SpendCreditsEvent) => Promise<void>
  /**
   * Create a discount / coupon (Polar `discounts.create`). Call from an **action**.
   * Accepts the full Polar `DiscountCreate` shape (fixed or percentage).
   */
  createDiscount: (discount: DiscountInput) => Promise<{ id: string, code: string | null }>
}

/**
 * Configure the {@link https://www.convex.dev/components/polar | Polar} component
 * for subscriptions, discounts, and prepaid credits — linked to your auth users and
 * cached reactively inside the `backend` component (so consumers add nothing to their
 * own schema).
 *
 * Subscription / feature / credit reads return `null`/empty until Polar has synced,
 * so an unconfigured deployment degrades gracefully; checkout / portal / credit /
 * discount operations require a `POLAR_ORGANIZATION_TOKEN`.
 *
 * Billing follows the tenant: with the default `billTo: 'organization'` the
 * active workspace owns the subscription and credits (every member shares
 * them); with `billTo: 'user'` each user is their own customer. Either way
 * the entity resolves from identity claims — zero wiring.
 *
 * @example
 * ```ts
 * import { setupBilling } from 'nuxt-backend/convex/billing'
 * import { components } from './_generated/api'
 * import { env } from './_generated/server'
 *
 * const billing = setupBilling(components.polar, components.backend, {
 *   organizationToken: env.POLAR_ORGANIZATION_TOKEN,
 *   server: env.POLAR_SERVER ?? 'sandbox',
 * })
 *
 * export const { polar } = billing
 * export const { generateCheckoutLink, generateCustomerPortalUrl } = billing.api
 * export const { getCurrentSubscription, getFeatures, getCredits, syncEntitlements } = billing.functions
 * ```
 */
export function setupBilling(
  component: PolarComponent,
  backend: BillingComponentApi,
  config: SetupBillingConfig = {},
): Billing {
  const billTo = config.billTo ?? 'organization'

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

  // Polar requires a `getUserInfo`; wrap the entity resolution (or the
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

  const polar = new Polar(component, { ...config, getUserInfo })
  const cache = backend.billing

  const getCustomerState: Billing['getCustomerState'] = async (ctx, { userId }) => {
    const customer = await polar.getCustomerByUserId(ctx as unknown as PolarRunQueryCtx, userId)
    if (!customer) {
      return { customerId: null, activeProductIds: [], benefits: [], meters: [] }
    }
    const result = await customersGetState(polar.polar, { id: customer.id })
    if (!result.ok) throw result.error
    const state = result.value as {
      activeSubscriptions?: Array<{ productId: string }>
      grantedBenefits?: Array<{ id: string, benefitId: string, benefitType: string }>
      activeMeters?: Array<{ meterId: string, consumedUnits: number, creditedUnits: number, balance: number }>
    }
    const grants = state.grantedBenefits ?? []
    // Customer-state `benefitMetadata` is a grant-time snapshot (not updated when a
    // benefit's metadata changes), so read each distinct benefit's metadata live —
    // this is what powers friendly-name feature-gating (`has('premium')`).
    const metadataByBenefit = new Map<string, Record<string, string | number | boolean>>()
    await Promise.all(
      [...new Set(grants.map(g => g.benefitId))].map(async (benefitId) => {
        const benefit = await benefitsGet(polar.polar, { id: benefitId })
        if (benefit.ok) metadataByBenefit.set(benefitId, benefit.value.metadata ?? {})
      }),
    )
    return {
      customerId: customer.id,
      activeProductIds: (state.activeSubscriptions ?? []).map(s => s.productId),
      benefits: grants.map(b => ({
        id: b.id,
        benefitId: b.benefitId,
        type: b.benefitType,
        metadata: metadataByBenefit.get(b.benefitId) ?? {},
      })),
      meters: (state.activeMeters ?? []).map(m => ({
        meterId: m.meterId,
        consumedUnits: m.consumedUnits,
        creditedUnits: m.creditedUnits,
        balance: m.balance,
      })),
    }
  }

  /** Sync a user's live Polar state into the reactive component cache. */
  const refreshEntitlements = async (ctx: RunWriteCtx, userId: string): Promise<void> => {
    const state = await getCustomerState(ctx, { userId })
    await ctx.runMutation(cache.upsert, {
      userId,
      customerId: state.customerId ?? undefined,
      activeProductIds: state.activeProductIds,
      benefits: state.benefits,
      meters: state.meters,
    })
  }

  const spendCredits: Billing['spendCredits'] = async (ctx, event) => {
    const entityId = event.userId
      ?? (await entityFromIdentity(ctx as { auth?: Auth }))?.userId
    if (!entityId) {
      throw new Error('[nuxt-backend] spendCredits: no billing entity — pass `userId` or call from an authenticated context.')
    }
    const customer = await polar.getCustomerByUserId(ctx as unknown as PolarRunQueryCtx, entityId)
    if (!customer) {
      throw new Error(`[nuxt-backend] No Polar customer for ${entityId}. Start a checkout first.`)
    }
    if (event.meterId) {
      const state = await getCustomerState(ctx, { userId: entityId })
      const meter = state.meters.find(m => m.meterId === event.meterId)
      const need = event.value ?? 1
      if (!meter || meter.balance < need) {
        throw new Error(
          `[nuxt-backend] Insufficient credits — balance ${meter?.balance ?? 0}, need ${need}. Top up to continue.`,
        )
      }
    }
    const events: EventsIngestRequest['events'] = [{
      name: event.name,
      customerId: customer.id,
      metadata: event.metadata,
      externalId: event.externalId,
      timestamp: event.timestamp,
    }]
    const result = await eventsIngest(polar.polar, { events })
    if (!result.ok) throw result.error
  }

  const createDiscount: Billing['createDiscount'] = async (discount) => {
    const result = await discountsCreate(polar.polar, discount)
    if (!result.ok) throw result.error
    return { id: result.value.id, code: result.value.code ?? null }
  }

  // --- Ready-made reactive functions (re-exported by the consumer's billing.ts) ---

  const resolveUserId = async (ctx: GenericQueryCtx<GenericDataModel>): Promise<string | null> => {
    if (billTo === 'user' && config.currentUserId) return config.currentUserId(ctx)
    return (await entityFromIdentity(ctx))?.userId ?? null
  }

  const getCurrentSubscription = queryGeneric({
    args: {},
    handler: async (ctx) => {
      const userId = await resolveUserId(ctx)
      if (!userId) return null
      return polar.getCurrentSubscription(ctx as unknown as PolarRunQueryCtx, { userId })
    },
  })

  const getFeatures = queryGeneric({
    args: {},
    handler: async (ctx) => {
      const userId = await resolveUserId(ctx)
      if (!userId) return null
      const row = await ctx.runQuery(cache.getByUser, { userId })
      return { plans: row?.activeProductIds ?? [], benefits: row?.benefits ?? [] }
    },
  })

  const getCredits = queryGeneric({
    args: {},
    handler: async (ctx) => {
      const userId = await resolveUserId(ctx)
      if (!userId) return null
      const row = await ctx.runQuery(cache.getByUser, { userId })
      return { meters: row?.meters ?? [] }
    },
  })

  const syncEntitlements = actionGeneric({
    args: {},
    handler: async (ctx) => {
      const { userId } = await getUserInfo(ctx as unknown as PolarRunQueryCtx)
      if (userId) await refreshEntitlements(ctx, userId)
      return null
    },
  })

  // --- Webhook handlers: keep the cache fresh as Polar state changes ---

  // Handlers run inside an httpAction at runtime, so we can refresh inline.
  const handleRefreshEvent = async (ctx: RunWriteCtx, event: PolarWebhookEvent): Promise<void> => {
    const data = event.data as {
      id?: string
      customerId?: string
      customer?: { id?: string, metadata?: Record<string, unknown> }
      metadata?: Record<string, unknown>
    }
    const customerId = data.customerId ?? data.customer?.id ?? data.id
    if (typeof customerId !== 'string') return
    // Resolve the auth user: prefer the Polar customer metadata (set at checkout, so
    // first-time webhooks self-bootstrap), then fall back to the synced cache.
    const metaUserId = data.customer?.metadata?.userId ?? data.metadata?.userId
    const userId = typeof metaUserId === 'string'
      ? metaUserId
      : await ctx.runQuery(cache.userByCustomer, { customerId })
    if (!userId) return
    await refreshEntitlements(ctx, userId)
  }

  // One handler per event type: the built-in cache refresh (for the refresh
  // set), then the consumer's hook — which therefore reads fresh entitlements.
  const consumerEvents = config.events ?? {}
  const eventTypes = new Set<string>([...REFRESH_EVENTS, ...Object.keys(consumerEvents)])
  const webhookEvents = Object.fromEntries(
    [...eventTypes].map((type) => {
      const refreshes = (REFRESH_EVENTS as readonly string[]).includes(type)
      const consumerHandler = consumerEvents[type as keyof WebhookEventHandlers]
      return [type, async (ctx: RunWriteCtx, event: PolarWebhookEvent) => {
        if (refreshes) await handleRefreshEvent(ctx, event)
        if (consumerHandler) await (consumerHandler as (ctx: RunWriteCtx, event: PolarWebhookEvent) => Promise<void>)(ctx, event)
      }]
    }),
  ) as WebhookEventHandlers

  return {
    polar,
    api: polar.api(),
    functions: { getCurrentSubscription, getFeatures, getCredits, syncEntitlements },
    webhookEvents,
    getCustomerState,
    spendCredits,
    createDiscount,
  }
}
