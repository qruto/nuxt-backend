import { discountsCreate } from '@polar-sh/sdk/funcs/discountsCreate.js'
import { discountsDelete } from '@polar-sh/sdk/funcs/discountsDelete.js'
import { discountsList } from '@polar-sh/sdk/funcs/discountsList.js'
import { subscriptionsUpdate } from '@polar-sh/sdk/funcs/subscriptionsUpdate.js'
import type { Auth } from 'convex/server'
import { type BillingContext, resolveLimit, resolvePage } from './context.js'
import type { PurchaseRules } from './purchase.js'
import type { ProviderCtx, ProviderSubscription, RunQueryCtx, RunWriteCtx, SubscriptionUpdatePayload } from './types/base.js'
import type { BillingDiscounts, SubscriptionTarget } from './types/options.js'
import type { Billing } from './types/surface.js'
import { backendError } from '../../errors.js'

/**
 * Subscription statuses the provider considers finished. Everything else —
 * including `past_due` and `paused` — is still manageable, so lifecycle
 * operations stay available on it. Deliberately a deny-list: the provider owns
 * the status vocabulary and adds to it, and refusing an unknown status here
 * would lock customers out of cancelling.
 */
const ENDED_SUBSCRIPTION_STATUSES = new Set(['canceled', 'incomplete_expired'])

/** Discounts and the subscription lifecycle — every write goes to the provider. */
export function createSubscriptions(
  { provider, requireEntity, requireProviderAccess, unwrapProvider, throttle }: BillingContext,
  { requirePlan }: PurchaseRules,
) {
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
  ): Promise<{ id: string, status: string, productId: string }> => {
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
   * One provider `subscriptions.update` call, behind the shared guards: entity
   * resolved (a signed-out caller is `unauthenticated` before anything says
   * billing is unconfigured), token present, rate limit checked, subscription
   * addressed, and `refuse` given the subscription to say no before the
   * provider is asked. Every lifecycle operation is the same call with a
   * different arm of the SDK's `SubscriptionUpdate` union.
   */
  const applySubscriptionUpdate = async (
    ctx: RunWriteCtx & { auth?: Auth },
    operation: string,
    options: SubscriptionTarget,
    update: SubscriptionUpdatePayload,
    refuse?: (subscription: { productId: string }) => void | Promise<void>,
  ): Promise<ProviderSubscription> => {
    const { userId } = await requireEntity(ctx)
    requireProviderAccess(operation)
    await throttle(ctx, userId, `${operation}s`)
    const subscription = await resolveSubscription(ctx, userId, options.subscriptionId)
    await refuse?.(subscription)
    const result = await subscriptionsUpdate(provider.polar, {
      id: subscription.id,
      subscriptionUpdate: update,
    })
    return unwrapProvider(result, operation)
  }

  const updateSubscription: Billing['updateSubscription'] = async (ctx, options = {}) => {
    if (!options.productId && !options.proration) {
      throw backendError('invalid_input', { field: 'productId' }, '[nuxt-backend] updateSubscription: pass `productId` (the plan to switch to) and/or `proration`.')
    }
    return applySubscriptionUpdate(ctx, 'plan change', options, {
      productId: options.productId,
      prorationBehavior: options.proration,
    }, async (subscription) => {
      // The plan to switch to is one the app sells as a plan, whoever asks.
      if (options.productId) await requirePlan(ctx, options.productId)
      if (options.productId && options.productId === subscription.productId) {
        throw backendError('invalid_input', { field: 'productId' }, `[nuxt-backend] updateSubscription: the subscription is already on ${options.productId}.`)
      }
    })
  }

  const cancelSubscription: Billing['cancelSubscription'] = (ctx, options = {}) => {
    // The provider's cancel and revoke arms carry the same customer-supplied
    // churn fields; only the timing differs.
    const churn = {
      customerCancellationReason: options.reason,
      customerCancellationComment: options.comment,
    }
    return applySubscriptionUpdate(
      ctx,
      'cancellation',
      options,
      options.atPeriodEnd === false ? { ...churn, revoke: true } : { ...churn, cancelAtPeriodEnd: true },
    )
  }

  // The provider models "undo the scheduled cancellation" as the cancel arm
  // with the flag flipped off — there is no separate uncancel endpoint.
  const uncancelSubscription: Billing['uncancelSubscription'] = (ctx, options = {}) =>
    applySubscriptionUpdate(ctx, 'uncancellation', options, { cancelAtPeriodEnd: false })

  const pauseSubscription: Billing['pauseSubscription'] = (ctx, options = {}) =>
    applySubscriptionUpdate(ctx, 'pause', options, {
      pauseAtPeriodEnd: true,
      resumesAt: options.resumesAt,
    })

  const resumeSubscription: Billing['resumeSubscription'] = (ctx, options = {}) =>
    applySubscriptionUpdate(ctx, 'resume', options, { resume: true })

  return { discounts, updateSubscription, cancelSubscription, uncancelSubscription, pauseSubscription, resumeSubscription }
}

export type BillingSubscriptions = ReturnType<typeof createSubscriptions>
