import type { BillingContext } from './context.js'
import type { ProviderCtx, RunQueryCtx, RunWriteCtx } from './types/base.js'
import type { CustomerEntitlements } from './types/records.js'
import type { Billing } from './types/surface.js'

// The entitlements of adapter mode (commerce.ts), read from what the app
// keeps instead of a provider's customer state: the plan is the entity's
// live subscriptions (the free plan's product when it holds none), what it
// grants is the catalog products' benefits, and the meters are the cache's
// own, which only the grant ledger and the spends move.

/** Statuses of a subscription the entity still holds. */
const LIVE_STATUSES = new Set(['active', 'trialing', 'past_due', 'paused'])

/** A synced subscription as this module reads it. */
interface SyncedSubscription { productId: string, status: string, endedAt?: string | null, trialEnd?: string | null }

/** A product row's benefit, as the synthesized rows carry one. */
interface ProductBenefit { id: string, type: string, description: string, metadata?: Record<string, string | number | boolean> }

/** The entitlement reads and writes of adapter mode, in the shape {@link createEntitlements} returns. */
export function createCommerceEntitlements(context: BillingContext) {
  const { provider, cache, freePlan, syncProducts } = context
  const commerce = context.commerce!

  /** The products the entity's plan is now: its live subscriptions', else the free plan's. */
  const activeProducts = async (ctx: RunQueryCtx, userId: string): Promise<string[]> => {
    const now = new Date().toISOString()
    const live = (await provider.listAllUserSubscriptions(ctx as unknown as ProviderCtx, { userId }) as SyncedSubscription[])
      .filter(subscription => subscription.endedAt == null && LIVE_STATUSES.has(subscription.status)
        && !(subscription.status === 'trialing' && subscription.trialEnd != null && subscription.trialEnd <= now))
      .map(subscription => subscription.productId)
    if (live.length > 0) return [...new Set(live)]
    return freePlan ? [freePlan.productId] : []
  }

  /** The benefits the products carry, each once, and whether every product's row was found. */
  const benefitsOf = async (ctx: RunQueryCtx, productIds: string[]) => {
    const rows = await Promise.all(productIds.map(productId => provider.getProduct(ctx as unknown as ProviderCtx, { productId })))
    const seen = new Map<string, ProductBenefit>()
    for (const row of rows) {
      for (const benefit of (row?.benefits ?? []) as ProductBenefit[]) if (!seen.has(benefit.id)) seen.set(benefit.id, benefit)
    }
    return { benefits: [...seen.values()], complete: rows.every(Boolean) }
  }

  const getCustomerState: Billing['getCustomerState'] = async (ctx, { userId }): Promise<CustomerEntitlements> => {
    const customerId = await ctx.runQuery(commerce.refs.customerOf, { entityId: userId, provider: commerce.name })
    const activeProductIds = await activeProducts(ctx, userId)
    const { benefits } = await benefitsOf(ctx, activeProductIds)
    const meters = (await ctx.runQuery(cache.getByUser, { userId }))?.meters ?? []
    return {
      customerId,
      activeProductIds,
      benefits: benefits.map(benefit => ({
        id: benefit.id,
        benefitId: benefit.id,
        type: benefit.type,
        // The catalog's benefits are features and credit grants only.
        kind: benefit.type === 'meter_credit' ? 'credits' as const : 'feature' as const,
        name: benefit.description,
        metadata: benefit.metadata ?? {},
      })),
      meters,
    }
  }

  /**
   * Write the entity's plan and benefits to the cache, its meters kept. A
   * product whose row is not there yet (a catalog never synced on this
   * deployment) writes the catalog's rows first.
   */
  const refreshEntitlements = async (ctx: RunWriteCtx, userId: string): Promise<void> => {
    const activeProductIds = await activeProducts(ctx, userId)
    if (!(await benefitsOf(ctx, activeProductIds)).complete) await syncProducts(ctx)
    const { benefits } = await benefitsOf(ctx, activeProductIds)
    const customerId = await ctx.runQuery(commerce.refs.customerOf, { entityId: userId, provider: commerce.name })
    await ctx.runMutation(commerce.refs.setPlanState, {
      userId,
      ...(customerId ? { customerId } : {}),
      activeProductIds,
      benefits: benefits.map(benefit => ({ id: benefit.id, benefitId: benefit.id, type: benefit.type, metadata: benefit.metadata ?? {} })),
    })
  }

  const forgetEntity: Billing['forgetEntity'] = async (ctx, userId) => {
    await ctx.runMutation(cache.deleteByUser, { userId })
    await ctx.runMutation(commerce.refs.forgetEntity, { entityId: userId })
  }

  return { getCustomerState, refreshEntitlements, forgetEntity }
}
