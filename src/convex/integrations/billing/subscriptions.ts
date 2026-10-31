import { discountsCreate } from '@polar-sh/sdk/funcs/discountsCreate.js'
import { discountsDelete } from '@polar-sh/sdk/funcs/discountsDelete.js'
import { discountsList } from '@polar-sh/sdk/funcs/discountsList.js'
import { subscriptionsUpdate } from '@polar-sh/sdk/funcs/subscriptionsUpdate.js'
import type { Auth } from 'convex/server'
import { BILLING_ACCESS, type BillingContext, resolveLimit, resolvePage } from './context.js'
import { logBackend } from '../../log.js'
import { type CatalogDiscounts, refusedDiscount } from './discounts.js'
import type { BillingFreePlan } from './free-plan.js'
import type { PurchaseRules } from './purchase.js'
import type { ProviderCtx, ProviderSubscription, RunQueryCtx, RunWriteCtx, SubscriptionUpdatePayload } from './types/base.js'
import type { BillingDiscounts, SubscriptionTarget } from './types/options.js'
import type { Billing } from './types/surface.js'
import { backendError } from '../../errors.js'
import { pauseCheck, refusePaused } from '../../pauses.js'

/**
 * Subscription statuses the provider considers finished. Everything else —
 * including `past_due` and `paused` — is still manageable, so lifecycle
 * operations stay available on it. Deliberately a deny-list: the provider owns
 * the status vocabulary and adds to it, and refusing an unknown status here
 * would lock customers out of cancelling.
 */
const ENDED_SUBSCRIPTION_STATUSES = new Set(['canceled', 'incomplete_expired'])

/** A provider timestamp as epoch ms: the SDK hands over a `Date`, a stored row an ISO string. */
export function epochOf(value: unknown): number | null {
  if (value instanceof Date || typeof value === 'string' || typeof value === 'number') {
    const time = new Date(value).getTime()
    return Number.isNaN(time) ? null : time
  }
  return null
}

/** What a client reads off a subscription row besides the synced columns. */
export interface SubscriptionChange {
  /** The plan the subscription switches to at `appliesAt` (ISO), `null` when none is scheduled. */
  pendingChange: { productId: string, appliesAt: string } | null
  /** When a paused subscription resumes by itself (ISO), `null` when nothing is scheduled. */
  resumesAt: string | null
}

/** A subscription row as the synced table keeps it: what a lifecycle operation reads off it. */
export interface SyncedSubscription {
  id: string
  status: string
  productId: string
  /** Set to cancel at the end of the period: the provider refuses a second cancellation. */
  cancelAtPeriodEnd?: boolean
  modifiedAt?: string | null
  createdAt?: string
  startedAt?: string | null
  currentPeriodEnd?: string | null
  endsAt?: string | null
  endedAt?: string | null
  amount?: number | null
  currency?: string | null
  recurringInterval?: string | null
  recurringIntervalCount?: number
}

/**
 * The longest cancellation comment the package sends: the customer's own
 * words, kept with the subscription and read back with it.
 */
export const CANCELLATION_COMMENT_MAX = 500

/** Discounts and the subscription lifecycle — every write goes to the provider. */
/** What `billing.plan_changed` records as its `change`, by the lifecycle operation that made it. */
const PLAN_CHANGES: Readonly<Record<string, string>> = {
  'plan change': 'plan',
  'cancellation': 'cancel',
  'uncancellation': 'uncancel',
  'plan change cancellation': 'cancel_pending',
  'pause': 'pause',
  'resume': 'resume',
}

export function createSubscriptions(
  { components, provider, cache, requireEntity, requireProviderAccess, unwrapProvider, throttle, recordEvent }: BillingContext,
  { requirePlan }: PurchaseRules,
  { isFreeProduct }: Pick<BillingFreePlan, 'isFreeProduct'>,
  catalogDiscounts: CatalogDiscounts,
) {
  // The pause_checkout kill switch: a plan switch charges like a purchase.
  const paused = pauseCheck(components.backend)
  const createDiscount: BillingDiscounts['create'] = async (discount) => {
    requireProviderAccess('discount creation')
    const created = unwrapProvider(await discountsCreate(provider.polar, discount), 'discount creation')
    return { id: created.id, code: created.code ?? null }
  }

  const listDiscounts: BillingDiscounts['list'] = async (options = {}) => {
    requireProviderAccess('discount listing')
    const page = resolvePage(options)
    const result = await discountsList(provider.polar, {
      query: options.query,
      page,
      limit: resolveLimit(options.limit),
    })
    const { items, pagination } = unwrapProvider(result, 'discount listing').result
    return {
      items,
      pagination,
      ...(page < pagination.maxPage ? { nextCursor: String(page + 1) } : {}),
    }
  }

  const discounts: BillingDiscounts = {
    create: createDiscount,
    list: listDiscounts,
    remove: async (discountId) => {
      requireProviderAccess('discount deletion')
      unwrapProvider(await discountsDelete(provider.polar, { id: discountId }), 'discount deletion')
    },
  }

  // --- Scheduled changes: what the synced subscriptions table does not carry ---

  /**
   * Keep what a provider subscription says about its scheduled plan change
   * and its resume date, for {@link withChanges}. Called with every
   * `subscription.*` webhook's payload and every lifecycle call's response;
   * the component keeps the newest state. A state is as new as the later of
   * the subscription's own `modifiedAt` and its pending update's: the
   * provider can schedule a change without touching the subscription's
   * time, and a stale delivery must not clear it. A payload without an id
   * or a timestamp says nothing to order by and is skipped. A pending update
   * that changes no product (a seat count, which this package does not bill)
   * is no plan change.
   */
  const recordChange = async (ctx: RunWriteCtx, userId: string, subscription: unknown): Promise<void> => {
    const data = subscription as {
      id?: unknown
      modifiedAt?: unknown
      createdAt?: unknown
      resumesAt?: unknown
      pendingUpdate?: { productId?: unknown, appliesAt?: unknown, modifiedAt?: unknown, createdAt?: unknown } | null
    }
    const own = epochOf(data.modifiedAt) ?? epochOf(data.createdAt)
    const update = epochOf(data.pendingUpdate?.modifiedAt) ?? epochOf(data.pendingUpdate?.createdAt)
    const modifiedAt = own === null ? update : Math.max(own, update ?? own)
    if (typeof data.id !== 'string' || modifiedAt === null) return
    const appliesAt = epochOf(data.pendingUpdate?.appliesAt)
    const productId = data.pendingUpdate?.productId
    await ctx.runMutation(cache.recordSubscriptionChange, {
      subscriptionId: data.id,
      userId,
      pendingChange: typeof productId === 'string' && appliesAt !== null ? { productId, appliesAt } : null,
      resumesAt: epochOf(data.resumesAt),
      modifiedAt,
    })
  }

  /**
   * Keep a lifecycle response's changes without ever failing the call: the
   * provider already applied it, and the next `subscription.*` webhook
   * records the same state, so a failed write is logged and dropped.
   */
  const recordApplied = async (ctx: RunWriteCtx, userId: string, subscription: unknown): Promise<void> => {
    try {
      await recordChange(ctx, userId, subscription)
    }
    catch (error) {
      logBackend('warn', 'billing.subscription_change_unrecorded', 'A subscription change went through, but its scheduled plan change or resume date could not be kept; the next subscription webhook records it.', error)
    }
  }

  /**
   * Subscription rows with `pendingChange` and `resumesAt` joined on, as ISO
   * strings like the rows' own dates, read by the rows' own ids. `null` for
   * a subscription nothing was recorded for, and for a record that is out of
   * date: older than the synced row (the subscription moved on since), or a
   * date that has already passed (the change applied, the pause ended).
   */
  const withChanges = async <Row extends { id: string, modifiedAt?: unknown, createdAt?: unknown }>(ctx: RunQueryCtx, rows: Row[]): Promise<Array<Row & SubscriptionChange>> => {
    if (rows.length === 0) return []
    const recorded = new Map((await ctx.runQuery(cache.subscriptionChanges, { subscriptionIds: rows.map(row => row.id) })).map(change => [change.subscriptionId, change]))
    const now = Date.now()
    return rows.map((row) => {
      const synced = epochOf(row.modifiedAt) ?? epochOf(row.createdAt) ?? 0
      const change = recorded.get(row.id)
      const current = change && change.modifiedAt >= synced ? change : undefined
      const pending = current?.pendingChange && current.pendingChange.appliesAt > now ? current.pendingChange : null
      const resumesAt = current?.resumesAt != null && current.resumesAt > now ? current.resumesAt : null
      return {
        ...row,
        pendingChange: pending ? { productId: pending.productId, appliesAt: new Date(pending.appliesAt).toISOString() } : null,
        resumesAt: resumesAt === null ? null : new Date(resumesAt).toISOString(),
      }
    })
  }

  // --- Subscription lifecycle ---

  /**
   * The subscription a lifecycle operation acts on, read from the component's
   * synced table. Never the upstream single-subscription read: that one is a
   * `.unique()` and throws the moment an entity holds two live subscriptions,
   * which is exactly the case `multipleSubscriptions` exists for.
   */
  const resolveSubscription = async (
    ctx: RunQueryCtx,
    userId: string,
    subscriptionId?: string,
  ): Promise<SyncedSubscription> => {
    const all = await provider.listAllUserSubscriptions(ctx as unknown as ProviderCtx, { userId })
    if (subscriptionId) {
      const found = all.find(subscription => subscription.id === subscriptionId)
      if (!found) {
        throw backendError('forbidden', { reason: 'not_owner' }, `[nuxt-backend] Subscription ${subscriptionId} is not on this billing account.`)
      }
      return found
    }
    const live = all.filter(subscription =>
      subscription.endedAt == null && !ENDED_SUBSCRIPTION_STATUSES.has(subscription.status))
    if (live.length === 0) {
      throw backendError('invalid_input', { field: 'subscriptionId' }, '[nuxt-backend] No subscription to change — this billing account has none running.')
    }
    if (live.length > 1) {
      throw backendError(
        'invalid_input',
        { field: 'subscriptionId' },
        '[nuxt-backend] This billing account has several running subscriptions — pass `subscriptionId` to say which one.',
      )
    }
    return live[0]!
  }

  /**
   * The free plan is no plan to change, cancel, pause or withdraw from: a
   * checkout upgrades it, and it comes back when a paid plan ends. No
   * message of its own: the `errors.invalid_input_free_plan` label says
   * it, in the app's words.
   */
  const refuseFreePlan = async (ctx: RunQueryCtx, operation: string, subscription: SyncedSubscription): Promise<void> => {
    if (!await isFreeProduct(ctx, subscription.productId)) return
    throw backendError('invalid_input', { field: 'subscriptionId', reason: 'free_plan' }, `[nuxt-backend] ${operation}: this is the free plan — upgrade it through checkout; it returns by itself when a paid plan ends.`)
  }

  /**
   * One provider `subscriptions.update` call, behind the shared guards: entity
   * resolved for one of its billing managers in person (a signed-out caller
   * is `unauthenticated` before anything says billing is unconfigured; a
   * member and an impersonating administrator are
   * `forbidden`), token present, rate limit checked, subscription
   * addressed, and `refuse` given the subscription to say no before the
   * provider is asked. Every lifecycle operation is the same call with a
   * different arm of the SDK's `SubscriptionUpdate` union. A `purchase`
   * (a plan switch) is refused while checkout is paused, right after the
   * caller's check.
   */
  const applySubscriptionUpdate = async (
    ctx: RunWriteCtx & { auth?: Auth },
    operation: string,
    options: SubscriptionTarget,
    update: SubscriptionUpdatePayload | ((subscription: SyncedSubscription) => SubscriptionUpdatePayload),
    refuse?: (subscription: SyncedSubscription) => void | Promise<void>,
    purchase = false,
  ): Promise<ProviderSubscription> => {
    const { userId } = await requireEntity(ctx, BILLING_ACCESS.change)
    if (purchase) await refusePaused(paused, ctx, 'checkout')
    requireProviderAccess(operation)
    await throttle(ctx, userId, `${operation}s`)
    const subscription = await resolveSubscription(ctx, userId, options.subscriptionId)
    await refuseFreePlan(ctx, operation, subscription)
    await refuse?.(subscription)
    const result = await subscriptionsUpdate(provider.polar, {
      id: subscription.id,
      subscriptionUpdate: typeof update === 'function' ? update(subscription) : update,
    })
    const updated = unwrapProvider(result, operation)
    // The response is the subscription as the change left it: a scheduled
    // plan change or a resume date reads back before its webhook lands.
    await recordApplied(ctx, userId, updated)
    // The billing manager who made it acted; the webhook that follows records the provider's side.
    const productId = 'productId' in options && typeof options.productId === 'string' ? options.productId : undefined
    await recordEvent(ctx, userId, { type: 'billing.plan_changed', targetId: subscription.id, data: { change: PLAN_CHANGES[operation] ?? operation, ...(productId ? { productId } : {}) } })
    return updated
  }

  /**
   * Whether a plan change leaves a yearly price for a monthly one. A
   * yearly price grants its whole year's credits when the year starts, so
   * such a change waits for the paid year's end: made at once, it would
   * hand back most of the year's price while the year's credits stay spent.
   */
  const leavesPaidYear = async (ctx: RunWriteCtx, from: string, to: { recurringInterval?: string | null }): Promise<boolean> => {
    if (to.recurringInterval !== 'month') return false
    const current = await provider.getProduct(ctx as unknown as ProviderCtx, { productId: from })
    return current?.recurringInterval === 'year'
  }

  /**
   * The subscription a billing manager's lifecycle call is about, before
   * anything is asked of the provider: the caller checked in person, the
   * subscription addressed, and the free plan refused, as
   * {@link applySubscriptionUpdate} does. The cancel flow reads it to decide
   * on an offer, and the withdrawal to check its period.
   */
  const subscriptionToChange = async (ctx: RunWriteCtx & { auth?: Auth }, operation: string, options: SubscriptionTarget): Promise<{ userId: string, subscription: SyncedSubscription }> => {
    const { userId } = await requireEntity(ctx, BILLING_ACCESS.change)
    requireProviderAccess(operation)
    const subscription = await resolveSubscription(ctx, userId, options.subscriptionId)
    await refuseFreePlan(ctx, operation, subscription)
    return { userId, subscription }
  }

  const updateSubscription: Billing['updateSubscription'] = async (ctx, options = {}) => {
    if (!options.productId && !options.proration) {
      throw backendError('invalid_input', { field: 'productId' }, '[nuxt-backend] updateSubscription: pass `productId` (the plan to switch to) and/or `proration`.')
    }
    let atPeriodEnd = false
    return applySubscriptionUpdate(ctx, 'plan change', options, () => ({
      productId: options.productId,
      // From a yearly price to a monthly one: at the paid year's end,
      // whatever proration was asked for.
      prorationBehavior: atPeriodEnd ? 'next_period' : options.proration,
    }), async (subscription) => {
      if (!options.productId) return
      // The plan to switch to is one the app sells as a plan, whoever asks.
      const target = await requirePlan(ctx, options.productId)
      if (options.productId === subscription.productId) {
        throw backendError('invalid_input', { field: 'productId' }, `[nuxt-backend] updateSubscription: the subscription is already on ${options.productId}.`)
      }
      atPeriodEnd = await leavesPaidYear(ctx, subscription.productId, target)
    }, Boolean(options.productId))
  }

  const cancelSubscription: Billing['cancelSubscription'] = (ctx, options = {}) => {
    // The provider's cancel and revoke arms carry the same customer-supplied
    // churn fields; only the timing differs.
    const comment = options.comment?.trim() || undefined
    const churn = {
      customerCancellationReason: options.reason,
      customerCancellationComment: comment,
    }
    const atPeriodEnd = options.atPeriodEnd !== false
    return applySubscriptionUpdate(
      ctx,
      'cancellation',
      options,
      atPeriodEnd ? { ...churn, cancelAtPeriodEnd: true } : { ...churn, revoke: true },
      (subscription) => {
        if (comment && comment.length > CANCELLATION_COMMENT_MAX) {
          throw backendError('invalid_input', { field: 'comment' }, `[nuxt-backend] cancelSubscription: the comment is longer than ${CANCELLATION_COMMENT_MAX} characters.`)
        }
        // The provider takes one cancellation per period and refuses a second
        // (its reason went with the first): say so before it is asked, rather
        // than as a provider failure worth retrying.
        if (atPeriodEnd && subscription.cancelAtPeriodEnd) {
          throw backendError('invalid_input', { field: 'subscriptionId', reason: 'cancel_scheduled' }, '[nuxt-backend] cancelSubscription: this subscription is already set to cancel at the end of its period.')
        }
      },
    )
  }

  // The provider models "undo the scheduled cancellation" as the cancel arm
  // with the flag flipped off — there is no separate uncancel endpoint. It
  // refuses one with nothing to undo, and so does this, before it is asked.
  const uncancelSubscription: Billing['uncancelSubscription'] = (ctx, options = {}) =>
    applySubscriptionUpdate(ctx, 'uncancellation', options, { cancelAtPeriodEnd: false }, (subscription) => {
      if (!subscription.cancelAtPeriodEnd) {
        throw backendError('invalid_input', { field: 'subscriptionId', reason: 'no_cancel_scheduled' }, '[nuxt-backend] uncancelSubscription: this subscription is not set to cancel.')
      }
    })

  // The provider clears a scheduled plan change with an update arm of its
  // own, `pendingUpdate: null`, and refuses it with nothing scheduled: say so
  // before it is asked, from the change this package keeps for the row.
  const cancelPendingChange: Billing['cancelPendingChange'] = (ctx, options = {}) =>
    applySubscriptionUpdate(ctx, 'plan change cancellation', options, { pendingUpdate: null }, async (subscription) => {
      const [current] = await withChanges(ctx, [subscription])
      if (!current?.pendingChange) {
        throw backendError('invalid_input', { field: 'subscriptionId', reason: 'no_change_scheduled' }, '[nuxt-backend] cancelPendingChange: no plan change is scheduled on this subscription.')
      }
    })

  const pauseSubscription: Billing['pauseSubscription'] = (ctx, options = {}) =>
    applySubscriptionUpdate(ctx, 'pause', options, {
      pauseAtPeriodEnd: true,
      resumesAt: options.resumesAt,
    })

  const resumeSubscription: Billing['resumeSubscription'] = (ctx, options = {}) =>
    applySubscriptionUpdate(ctx, 'resume', options, { resume: true })

  /**
   * Put a catalog discount on an entity's subscription, from server code
   * that decided the entity qualifies: nobody's caller rights are checked.
   * The provider takes it off from the next payment, in place of any
   * discount the subscription had; `null` removes it. The provider checks
   * its dates, its total cap and the subscription's product, but not its
   * per-customer limit: that guard is the caller's.
   */
  const applyDiscount: Billing['applyDiscount'] = async (ctx, { entityId, discount, subscriptionId }) => {
    requireProviderAccess('discount change')
    const found = discount === null ? null : catalogDiscounts.discountOf(discount)
    if (discount !== null && !found) {
      throw backendError('invalid_input', { field: 'discount' }, '[nuxt-backend] applyDiscount: `discount` names no discount of the catalog — declare it in billing.catalog.ts and run `npx nuxt-backend billing sync`.')
    }
    const subscription = await resolveSubscription(ctx, entityId, subscriptionId)
    if (await isFreeProduct(ctx, subscription.productId)) {
      throw backendError('invalid_input', { field: 'subscriptionId', reason: 'free_plan' }, '[nuxt-backend] applyDiscount: this is the free plan, which nobody pays for.')
    }
    if (found && !found.productIds.includes(subscription.productId)) {
      throw backendError('invalid_input', { field: 'discount' }, `[nuxt-backend] applyDiscount: discount '${found.key}' does not apply to this subscription's plan.`)
    }
    const result = await subscriptionsUpdate(provider.polar, { id: subscription.id, subscriptionUpdate: { discountId: found?.id ?? null } })
    if (!result.ok && found && refusedDiscount(result.error)) {
      throw backendError('invalid_input', { field: 'discount' }, `[nuxt-backend] applyDiscount: the provider refused discount '${found.key}' — it has ended, is used up, or the subscription holds it already.`)
    }
    const updated = unwrapProvider(result, 'discount change')
    await recordApplied(ctx, entityId, updated)
    return updated
  }

  return { discounts, applyDiscount, recordChange, withChanges, subscriptionToChange, resolveSubscription, updateSubscription, cancelSubscription, uncancelSubscription, cancelPendingChange, pauseSubscription, resumeSubscription }
}

export type BillingSubscriptions = ReturnType<typeof createSubscriptions>
