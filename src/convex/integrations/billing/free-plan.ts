import { customersGetStateExternal } from '@polar-sh/sdk/funcs/customersGetStateExternal.js'
import { subscriptionsCreate } from '@polar-sh/sdk/funcs/subscriptionsCreate.js'
import { type FunctionReference, makeFunctionReference, type Scheduler } from 'convex/server'
import { START_FREE_PLAN_FUNCTION } from '../../constants.js'
import { getBackendError } from '../../errors.js'
import { logBackend } from '../../log.js'
import { Workpool } from '@convex-dev/workpool'
import { type BillingContext, isProviderNotFound } from './context.js'
import type { BillingCustomers, Caller } from './customers.js'
import type { ProviderCtx, RunQueryCtx, RunWriteCtx } from './types/base.js'
import type { BillingEntity, EntityProfile } from './types/setup.js'

// The free plan as a real subscription at the provider (A7b): every billing
// entity is subscribed to the catalog's $0 plan when it is created, through
// the workpool so a wave of sign-ups queues its provider requests, and again
// when a paid plan ends; a checkout of a paid plan upgrades it in place.
// Its credits and features are granted by the provider like any plan's.

/** Statuses of a subscription the entity still holds. */
const LIVE_STATUSES = new Set(['active', 'trialing', 'past_due', 'paused'])

/** Entities the backfill reads per page. */
const BACKFILL_PAGE = 100

/**
 * The queue's retries of a refused start: the component's five attempts,
 * spaced from two seconds rather than its quarter second, since what
 * refuses one is mostly the provider's rate limit in a wave of sign-ups.
 */
const START_RETRIES = { maxAttempts: 5, initialBackoffMs: 2000, base: 2 }

/** A context that can queue work: a mutation's or an action's. */
export type QueueCtx = RunWriteCtx & { scheduler: Scheduler }

/** The refusals a start stops at, as `code/reason`, and the outcome each answers. */
const START_STOPS = new Map<string, 'customer_taken' | 'customer_unknown'>([['forbidden/customer_taken', 'customer_taken'], ['unavailable/customer_unknown', 'customer_unknown']])

/**
 * Where a start stops when its customer is refused: an account whose email
 * another account's customer holds, or a mapping of another organization,
 * neither of which a retry heals. `null` for a failure the workpool retries.
 */
function refusedStart(error: unknown): 'customer_taken' | 'customer_unknown' | null {
  const refusal = getBackendError(error)
  const outcome = START_STOPS.get(`${refusal?.code}/${(refusal?.data as { reason?: string } | undefined)?.reason}`) ?? null
  // A stale mapping was logged where it was refused, as `billing.customer_mapping_stale`.
  if (outcome === 'customer_taken') logBackend('warn', 'billing.free_plan_customer_taken', 'An account was not put on the free plan: its email belongs to another account\'s billing customer at the provider.')
  return outcome
}

/** What one start did, as the internal action answers it. */
export type FreePlanStart = 'started' | 'subscribed' | 'gone' | 'not_billed' | 'customer_taken' | 'customer_unknown' | 'no_plan' | 'not_configured'

/** The kind of billing entity the auth layer made: one billing does not bill is no entity of it. */
export type CreatedEntityKind = 'workspace' | 'user'

/** A revoked subscription, as `restartAfterRevoke` reads it off the event. */
export interface RevokedSubscription {
  id: string
  /** Its customer was deleted at the provider: an erasure there, which the free plan never undoes. */
  customerDeleted: boolean
}

/** A subscription row as the synced table keeps it. */
interface SyncedSubscription { id: string, productId: string, status: string, endedAt?: string | null, cancelAtPeriodEnd?: boolean }

/** One page of the auth adapter's `findMany`. */
interface AdapterPage { page: Array<{ _id?: string, id?: string }>, isDone: boolean, continueCursor: string }

/** One page of billing entities' ids, and where the next one starts. */
export interface EntityPage { ids: string[], isDone: boolean, continueCursor: string }

/** A function of the scaffold's `billing.ts`, run by name for one billing entity or one page of them. */
export type EntityFunction = FunctionReference<'action', 'internal', { entityId?: string, cursor?: string }>

/**
 * One page of every existing billing entity, workspaces or users as
 * `billTo` bills: what a backfill over all of them reads, a page at a time
 * (`caller` names it in the error when the adapter cannot page).
 */
export async function pageBillingEntities(ctx: RunQueryCtx, { components, billTo }: Pick<BillingContext, 'components' | 'billTo'>, cursor: string | null, caller: string): Promise<EntityPage> {
  const findMany = components.backend.adapter.findMany as FunctionReference<'query', 'internal'> | undefined
  if (!findMany) throw new Error(`[nuxt-backend] ${caller} needs the backend component's adapter \`findMany\` to page the billing entities.`)
  const read = await ctx.runQuery(findMany, {
    model: billTo === 'workspace' ? 'organization' : 'user',
    paginationOpts: { cursor, numItems: BACKFILL_PAGE },
  }) as AdapterPage
  return { ids: read.page.flatMap(row => row._id ?? row.id ?? []), isDone: read.isDone, continueCursor: read.continueCursor }
}

/** The free plan of one `setupBilling` call: started, recognised, and restarted when a paid plan ends. */
export function createFreePlan(
  { freePlan, billTo, provider, components, accessToken, unwrapProvider, entityDeleting: deleting, catalogIds }: BillingContext,
  { ensureCustomer, profileOf }: Pick<BillingCustomers, 'ensureCustomer' | 'profileOf'>,
) {
  // The scaffold's `startFreePlan` (`billing.api.startFreePlan`), by the
  // module name every billing function goes by: what the queue runs.
  const reference = makeFunctionReference<'action', { entityId?: string, cursor?: string }>(START_FREE_PLAN_FUNCTION) as unknown as EntityFunction
  // No `maxParallelism`: the queue is the app's, and keeps the app's own.
  const pool = components.workpool
    ? new Workpool(components.workpool, { retryActionsByDefault: true, defaultRetryBehavior: START_RETRIES })
    : null
  /**
   * Run `fn` for one billing entity: on the workpool, which retries a
   * request the provider refused, else on the scheduler. The pool writes
   * through `runMutation`, which a mutation's and an action's context both
   * have.
   */
  const enqueue = async (ctx: QueueCtx, fn: EntityFunction, entityId: string): Promise<void> => {
    if (pool) await pool.enqueueAction(ctx as never, fn, { entityId })
    else await ctx.scheduler.runAfter(0, fn, { entityId })
  }
  const billedKind: CreatedEntityKind = billTo === 'user' ? 'user' : 'workspace'
  /**
   * What runs once an entity's very first subscription, its free plan,
   * started: the reverse trial (LIFECYCLE) hooks in here. Never fails the
   * start.
   */
  const hooks: { firstStart?: (ctx: RunWriteCtx, entityId: string, owner: { userId: string, email: string }, subscriptionId: string) => Promise<void> } = {}

  /**
   * Whether a product is a free plan's: the catalog's, or one whose live
   * price is $0 — a retired free plan, say, which its subscribers keep and
   * which reads as free through the subscription's product.
   */
  // A plan pass's product is free too (it holds a plan for a time, with no card), and is known without a sync.
  const passProductIds = new Set(Object.values(catalogIds?.passes ?? {}).map(entry => entry.pass))
  const isFreeProduct = async (ctx: RunQueryCtx, productId: string): Promise<boolean> => {
    if (freePlan?.productId === productId || passProductIds.has(productId)) return true
    const product = await provider.getProduct(ctx as unknown as ProviderCtx, { productId })
    const prices = (product?.prices ?? []).filter(price => !price.isArchived && (price.amountType === 'fixed' || price.amountType === 'free'))
    return Boolean(product?.isRecurring) && prices.length > 0 && prices.every(price => price.amountType === 'free' || price.priceAmount === 0)
  }

  /** The entity's subscriptions it still holds, as the synced table lists them. */
  const liveSubscriptions = async (ctx: RunQueryCtx, userId: string): Promise<SyncedSubscription[]> =>
    (await provider.listAllUserSubscriptions(ctx as unknown as ProviderCtx, { userId }) as SyncedSubscription[])
      .filter(subscription => subscription.endedAt == null && LIVE_STATUSES.has(subscription.status))

  /** The entity's live free subscription, if it is on one: what a checkout of a paid plan upgrades in place. */
  const freeSubscriptionOf = async (ctx: RunQueryCtx, userId: string): Promise<SyncedSubscription | null> => {
    for (const subscription of await liveSubscriptions(ctx, userId)) {
      if (await isFreeProduct(ctx, subscription.productId)) return subscription
    }
    return null
  }

  /**
   * Queue the free plan for one entity, when the catalog has one: on the
   * workpool, which retries a refused request, else on the scheduler.
   * Never throws for the caller's sake beyond the queue's own write.
   */
  const queue = async (ctx: QueueCtx, entityId: string): Promise<void> => {
    if (freePlan) await enqueue(ctx, reference, entityId)
  }

  /**
   * The entity and what its customer needs, or `null` once it no longer
   * exists: a workspace by its profile (its owner's email), a user by their
   * account. A workspace whose owner left can't own a customer: `null` too.
   */
  const entityOf = async (ctx: RunQueryCtx, entityId: string): Promise<{ entity: BillingEntity, profile: EntityProfile | null, account?: Caller } | null> => {
    if (billTo === 'workspace') {
      const profile = await profileOf(ctx, entityId)
      return profile?.owner ? { entity: { userId: entityId, email: profile.owner.email }, profile } : null
    }
    const user = await ctx.runQuery(components.backend.adapter.findOne as FunctionReference<'query', 'internal'>, { model: 'user', where: [{ field: '_id', value: entityId }] }) as { email?: string, emailVerified?: boolean, name?: string } | null
    if (!user?.email) return null
    // Nobody is signed in to a start: the account stands for itself, so an
    // earlier customer of its proven email is adopted as a checkout would.
    const account: Caller = { userId: entityId, email: user.email.toLowerCase(), emailVerified: user.emailVerified === true, ...(user.name ? { name: user.name } : {}) }
    return { entity: { userId: entityId, email: user.email }, profile: null, account }
  }

  /** Whether the entity's customer holds a live subscription at the provider, read live: a webhook may not have landed yet. */
  const holdsProviderSubscription = async (entityId: string): Promise<boolean> => {
    const state = await customersGetStateExternal(provider.polar, { externalId: entityId })
    if (!state.ok && isProviderNotFound(state.error)) return false
    return unwrapProvider(state, 'free plan').activeSubscriptions.length > 0
  }

  /** An entity's very first subscription started: the `firstStart` hook, for its owner. */
  const firstStarted = async (ctx: RunWriteCtx, entityId: string, owner: { userId: string, email: string } | null | undefined, subscriptionId: string): Promise<void> => {
    if (owner && hooks.firstStart) await hooks.firstStart(ctx, entityId, { userId: owner.userId, email: owner.email }, subscriptionId)
  }

  /**
   * Subscribe one entity to the free plan, once: nothing for an entity that
   * no longer exists, nor for one that holds a subscription already at the
   * provider, an adopted customer's included. The provider decides, never
   * the synced table: a revoke can land before the update that ends the
   * subscription there. Its customer is found or made as a checkout's is;
   * an account whose email another account's customer holds is left off
   * the plan, logged, rather than retried. Two starts at once can't leave
   * it on two: the provider refuses the second, which reads back as
   * subscribed.
   */
  const start = async (ctx: RunWriteCtx, entityId: string, kind?: CreatedEntityKind): Promise<FreePlanStart> => {
    if (!freePlan) return 'no_plan'
    // A workspace with `billTo: 'user'`, an account without: queued by name, never billed.
    if (kind && kind !== billedKind) return 'not_billed'
    if (!accessToken) return 'not_configured'
    const found = await deleting(ctx, entityId) ? null : await entityOf(ctx, entityId)
    if (!found) return 'gone'
    try {
      await ensureCustomer(ctx, found.entity, found.profile, 'free plan', found.account)
    }
    catch (error) {
      const outcome = refusedStart(error)
      if (!outcome) throw error
      return outcome
    }
    if (await holdsProviderSubscription(entityId)) return 'subscribed'
    // Its first subscription ever: none was synced for it, ended or not.
    const first = (await provider.listAllUserSubscriptions(ctx as unknown as ProviderCtx, { userId: entityId })).length === 0
    const created = await subscriptionsCreate(provider.polar, { productId: freePlan.productId, externalCustomerId: entityId })
    if (!created.ok && await holdsProviderSubscription(entityId)) return 'subscribed'
    const subscription = unwrapProvider(created, 'free plan')
    if (first) await firstStarted(ctx, entityId, found.profile?.owner ?? found.account, subscription.id)
    return 'started'
  }

  /**
   * Queue the free plan for every existing entity, a page at a time, each
   * page scheduling the next: the backfill for entities created before the
   * catalog had a free plan (`npx convex run billing:startFreePlan '{}'`).
   */
  const backfill = async (ctx: QueueCtx, cursor: string | null): Promise<void> => {
    if (!freePlan) return
    const read = await pageBillingEntities(ctx, { components, billTo }, cursor, START_FREE_PLAN_FUNCTION)
    for (const id of read.ids) await queue(ctx, id)
    if (!read.isDone) await ctx.scheduler.runAfter(0, reference, { cursor: read.continueCursor })
  }

  /**
   * After a subscription ended (`subscription.revoked`): back on the free
   * plan, unless the entity no longer exists or still holds another plan.
   * The free subscription ending itself counts too: an entity is never left
   * on nothing while the catalog has a free plan. The revoked one is left
   * out of the check, whatever the synced table still says of it: the
   * provider does not order its deliveries, and the update that ends it
   * there may come later. A revoke whose customer the provider deleted is
   * an erasure there, and so is one of an entity an account's erasure is
   * deleting, marked before its customer is deleted: the entity is not
   * made a customer again.
   */
  const restartAfterRevoke = async (ctx: QueueCtx, entityId: string, revoked: RevokedSubscription): Promise<void> => {
    if (!freePlan || revoked.customerDeleted || await deleting(ctx, entityId)) return
    if ((await liveSubscriptions(ctx, entityId)).some(subscription => subscription.id !== revoked.id)) return
    if (!await entityOf(ctx, entityId)) return
    await queue(ctx, entityId)
  }

  /** A new entity the auth layer made: queued when it is the kind billing bills. */
  const entityCreated = async (ctx: QueueCtx, entity: { kind: CreatedEntityKind, id: string }): Promise<void> => {
    if (entity.kind === billedKind) await queue(ctx, entity.id)
  }

  /**
   * Why the auth layer may not delete an entity now, or `null`: a workspace
   * that still holds a paid subscription set to renew would go on being
   * billed with nobody left in the app to cancel it (`paid_subscription`).
   * One set to cancel at its period's end, or a free plan, is no reason.
   */
  const deletionRefusal = async (ctx: RunQueryCtx, entity: { kind: CreatedEntityKind, id: string }): Promise<'paid_subscription' | null> => {
    if (entity.kind !== billedKind) return null
    for (const subscription of await liveSubscriptions(ctx, entity.id)) {
      if (!subscription.cancelAtPeriodEnd && !await isFreeProduct(ctx, subscription.productId)) return 'paid_subscription'
    }
    return null
  }

  return { isFreeProduct, freeSubscriptionOf, queue, enqueue, start, backfill, restartAfterRevoke, entityCreated, deletionRefusal, hooks }
}

/** The free plan of one `setupBilling` call. */
export type BillingFreePlan = ReturnType<typeof createFreePlan>
