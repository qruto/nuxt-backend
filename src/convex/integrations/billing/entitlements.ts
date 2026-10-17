import { benefitsGet } from '@polar-sh/sdk/funcs/benefitsGet.js'
import { customersGetState } from '@polar-sh/sdk/funcs/customersGetState.js'
import type { BillingContext } from './context.js'
import type { ProviderCtx, RunWriteCtx } from './types/base.js'
import type { Billing } from './types/surface.js'

/**
 * The longest a cached benefit-metadata snapshot serves an entitlement sync
 * before the sync re-reads it live. The `benefit.updated` webhook patches
 * snapshots immediately regardless.
 */
const BENEFIT_METADATA_TTL_MS = 15 * 60 * 1000

/** The entitlement cache: read live from the provider, written to the component, forgotten on erasure. */
export function createEntitlements({ provider, cache, unwrapProvider }: BillingContext) {
  const getCustomerState: Billing['getCustomerState'] = async (ctx, { userId }) => {
    const customer = await provider.getCustomerByUserId(ctx as unknown as ProviderCtx, userId)
    if (!customer) {
      return { customerId: null, activeProductIds: [], benefits: [], meters: [] }
    }
    // Through the package boundary like every provider read: the raw SDK
    // error carries the provider's response body, which must not reach a caller.
    const state = unwrapProvider(await customersGetState(provider.polar, { id: customer.id }), 'entitlement sync') as {
      activeSubscriptions?: Array<{
        productId: string
        currentPeriodStart?: Date
        currentPeriodEnd?: Date
        meters?: Array<{ meterId: string }>
      }>
      grantedBenefits?: Array<{ id: string, benefitId: string, benefitType: string }>
      activeMeters?: Array<{ meterId: string, consumedUnits: number, creditedUnits: number, balance: number }>
    }
    const grants = state.grantedBenefits ?? []
    // Customer-state `benefitMetadata` is a grant-time snapshot (not updated
    // when a benefit's metadata changes). Live metadata is kept in the
    // component's own snapshot table (patched instantly by the
    // `benefit.updated` webhook) — only missing/stale entries hit the provider
    // API here, so steady-state syncs make zero benefit reads.
    const distinctBenefitIds = [...new Set(grants.map(g => g.benefitId))]
    const snapshots = distinctBenefitIds.length > 0
      ? await ctx.runQuery(cache.getBenefitMetadata, { benefitIds: distinctBenefitIds })
      : []
    const now = Date.now()
    const ttl = BENEFIT_METADATA_TTL_MS
    const metadataByBenefit = new Map<string, Record<string, string | number | boolean>>(
      snapshots.filter(s => now - s.updatedAt < ttl).map(s => [s.benefitId, s.metadata]),
    )
    const staleBenefitIds = distinctBenefitIds.filter(id => !metadataByBenefit.has(id))
    const fetched: Array<{ benefitId: string, metadata: Record<string, string | number | boolean> }> = []
    // Rollover lives on the meter-credit *benefit*, not on customer state — so
    // it is only known on the reads this loop already makes. Absent between
    // reads (the metadata TTL), which is why `rollover` is optional all the way
    // out to `useCredits()`: the UI degrades to "no expiry shown", never lies.
    const rolloverByMeter = new Map<string, boolean>()
    await Promise.all(
      staleBenefitIds.map(async (benefitId) => {
        const benefit = await benefitsGet(provider.polar, { id: benefitId })
        if (benefit.ok) {
          const metadata = benefit.value.metadata ?? {}
          metadataByBenefit.set(benefitId, metadata)
          fetched.push({ benefitId, metadata })
          if (benefit.value.type === 'meter_credit') {
            rolloverByMeter.set(benefit.value.properties.meterId, benefit.value.properties.rollover)
          }
        }
      }),
    )
    if (fetched.length > 0 && 'runMutation' in ctx) {
      await (ctx as RunWriteCtx).runMutation(cache.upsertBenefitMetadata, { entries: fetched })
    }
    // A meter's cycle is its granting subscription's billing period: the
    // provider models the period on the subscription, and the subscription
    // lists the meters it covers. A meter granted only by a one-time pack has
    // no subscription and therefore no cycle — hence the optional fields.
    const cycleByMeter = new Map<string, { cycleStart?: number, cycleEnd?: number }>()
    for (const subscription of state.activeSubscriptions ?? []) {
      for (const subscriptionMeter of subscription.meters ?? []) {
        cycleByMeter.set(subscriptionMeter.meterId, {
          cycleStart: subscription.currentPeriodStart?.getTime(),
          cycleEnd: subscription.currentPeriodEnd?.getTime(),
        })
      }
    }
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
        ...cycleByMeter.get(m.meterId),
        ...(rolloverByMeter.has(m.meterId) ? { rollover: rolloverByMeter.get(m.meterId) } : {}),
      })),
    }
  }

  /** Sync a user's live billing state into the reactive component cache. */
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

  const forgetEntity: Billing['forgetEntity'] = async (ctx, userId) => {
    await ctx.runMutation(cache.deleteByUser, { userId })
  }

  return { getCustomerState, refreshEntitlements, forgetEntity }
}

export type BillingEntitlements = ReturnType<typeof createEntitlements>
