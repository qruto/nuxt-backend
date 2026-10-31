import { grantsFeature } from '../../catalog.js'
import { backendError } from '../../errors.js'
import type { BillingContext } from './context.js'
import type { BillingPricing } from './pricing.js'
import type { Billing } from './types/surface.js'
import type { RunQueryCtx } from './types/base.js'

/**
 * An entity's cached grants, each with its benefit's metadata read live:
 * a key or a quota changed in the dashboard (the `benefit.updated`
 * webhook) counts at once, as `getFeatures` reads it. Empty for an entity
 * with none.
 */
export async function liveGrants(ctx: RunQueryCtx, cache: BillingContext['cache'], entityId: string): Promise<Array<{ benefitId: string, metadata: Readonly<Record<string, unknown>> | undefined }>> {
  const benefits = (await ctx.runQuery(cache.getByUser, { userId: entityId }))?.benefits ?? []
  if (benefits.length === 0) return []
  const snapshots = await ctx.runQuery(cache.getBenefitMetadata, { benefitIds: [...new Set(benefits.map(benefit => benefit.benefitId))] })
  const live = new Map(snapshots.map(snapshot => [snapshot.benefitId, snapshot.metadata]))
  return benefits.map(benefit => ({ benefitId: benefit.benefitId, metadata: live.get(benefit.benefitId) ?? benefit.metadata }))
}

/**
 * A feature name as a gate takes it: a string, else a mistake in the app's
 * code. An empty one is no feature at all, which a function may have been
 * handed by a caller: `hasFeature` answers no for it, `requireFeature`
 * refuses it as `invalid_input`.
 */
function checkedFeature(feature: unknown, what: string): string {
  if (typeof feature === 'string') return feature
  throw new TypeError(`[nuxt-backend] ${what}: the feature is its catalog key (or a benefit id), a string, not ${JSON.stringify(feature) ?? String(feature)}.`)
}

/**
 * Feature gates on the server: whether the billing entity's plan grants a
 * feature, read from the entitlement cache the billing webhooks keep fresh
 * (never a live provider read), and the refusal when it does not. The
 * match is the one `useFeatures().has()` makes in the browser
 * (`grantsFeature`), so the two gates agree on every benefit.
 */
export function createFeatures(
  { cache, billTo, allowedEntity, requireEntity, products, catalogIds }: BillingContext,
  { readPricing }: Pick<BillingPricing, 'readPricing'>,
) {
  /** Each plan product's catalog key: a plan's monthly and yearly products are both the plan. Packs are no plan. */
  const planKeyOf = new Map<string, string>()
  const packs = new Set(catalogIds?.packs ?? [])
  for (const [key, productId] of Object.entries(products ?? {})) {
    if (!packs.has(key)) planKeyOf.set(productId, key.replace(/:(?:month|year)$/, ''))
  }
  for (const [plan, prices] of Object.entries(catalogIds?.plans ?? {})) {
    for (const productId of Object.values(prices)) if (productId) planKeyOf.set(productId, plan)
  }

  const activePlans: Billing['activePlans'] = async (ctx, options = {}) => {
    const entityId = options.userId ?? (await allowedEntity(ctx, { access: 'member' }))?.userId
    if (!entityId) return []
    const productIds = (await ctx.runQuery(cache.getByUser, { userId: entityId }))?.activeProductIds ?? []
    return [...new Set(productIds.flatMap(productId => planKeyOf.get(productId) ?? []))]
  }

  /** Whether the entity's cached entitlements, their metadata read live, grant `feature`. */
  const granted = async (ctx: RunQueryCtx, entityId: string, feature: string): Promise<boolean> =>
    (await liveGrants(ctx, cache, entityId)).some(grant => grantsFeature(grant, feature))

  /** The plans on sale that include `feature`, by catalog key, in pricing order. */
  const plansWith = async (ctx: RunQueryCtx, feature: string): Promise<string[]> =>
    (await readPricing(ctx)).plans.filter(plan => !plan.retired && plan.featureKeys.includes(feature)).map(plan => plan.key)

  const hasFeature: Billing['hasFeature'] = async (ctx, feature, options = {}) => {
    const key = checkedFeature(feature, 'hasFeature')
    if (key === '') return false
    const entityId = options.userId ?? (await allowedEntity(ctx, { access: 'member' }))?.userId
    return entityId ? granted(ctx, entityId, key) : false
  }

  const requireFeature: Billing['requireFeature'] = async (ctx, feature, options = {}) => {
    const key = checkedFeature(feature, 'requireFeature')
    if (key === '') throw backendError('invalid_input', { field: 'feature' }, '[nuxt-backend] requireFeature: name the feature, by its catalog key.')
    const entityId = options.userId ?? (await requireEntity(ctx, { access: 'member' })).userId
    if (await granted(ctx, entityId, key)) return
    const plans = await plansWith(ctx, key)
    const holder = billTo === 'workspace' ? 'workspace' : 'account'
    throw backendError(
      'feature_required',
      { feature: key, plans },
      `[nuxt-backend] This ${holder}'s plan does not include "${key}"${plans.length > 0 ? `; ${plans.join(', ')} ${plans.length === 1 ? 'does' : 'do'}` : ', and no plan on sale does'}.`,
    )
  }

  return { hasFeature, requireFeature, activePlans }
}
