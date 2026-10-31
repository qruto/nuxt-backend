import { benefitsGet } from '@polar-sh/sdk/funcs/benefitsGet.js'
import { customersGetStateExternal } from '@polar-sh/sdk/funcs/customersGetStateExternal.js'
import { type BillingContext, isProviderNotFound } from './context.js'
import type { BillingCustomers } from './customers.js'
import type { RunQueryCtx, RunWriteCtx } from './types/base.js'
import type { BenefitKind, EntitlementBenefit } from './types/records.js'
import type { Billing } from './types/surface.js'

/**
 * The longest a cached benefit-metadata snapshot serves an entitlement sync
 * before the sync re-reads it live. The `benefit.updated` webhook patches
 * snapshots immediately regardless.
 */
const BENEFIT_METADATA_TTL_MS = 15 * 60 * 1000

/** The provider's benefit types, by what each gives (see {@link BenefitKind}). */
const BENEFIT_KINDS: Readonly<Record<string, BenefitKind>> = {
  license_keys: 'license_key',
  downloadables: 'download',
  discord: 'community',
  github_repository: 'repository',
  slack_shared_channel: 'shared_channel',
  custom: 'custom',
  meter_credit: 'credits',
  feature_flag: 'feature',
}

/** What a benefit of the provider's `type` gives, in neutral words: `other` for a type newer than the package. */
export function benefitKindOf(type: string): BenefitKind {
  return Object.hasOwn(BENEFIT_KINDS, type) ? BENEFIT_KINDS[type]! : 'other'
}

/** A grant as the provider's customer state lists it. */
interface StateGrant {
  id: string
  benefitId: string
  benefitType: string
  grantedAt?: Date
  properties?: {
    displayKey?: unknown
    files?: unknown
    repositoryOwner?: unknown
    repositoryName?: unknown
  }
}

/**
 * What a grant holds that the customer may want to see, by its kind: a
 * license key's display key (masked by the provider), how many files a
 * download grants, the repository a repository grant opens. Nothing else of
 * the grant's properties is kept: account and server ids stay with the
 * provider.
 */
function grantDetails(grant: StateGrant): Pick<EntitlementBenefit, 'licenseKey' | 'files' | 'repository'> {
  const properties = grant.properties ?? {}
  const kind = benefitKindOf(grant.benefitType)
  if (kind === 'license_key' && typeof properties.displayKey === 'string') return { licenseKey: properties.displayKey }
  if (kind === 'download' && Array.isArray(properties.files)) return { files: properties.files.length }
  if (kind === 'repository' && typeof properties.repositoryOwner === 'string' && typeof properties.repositoryName === 'string') {
    return { repository: `${properties.repositoryOwner}/${properties.repositoryName}` }
  }
  return {}
}

/** The entitlement cache: read live from the provider, written to the component, forgotten on erasure. */
export function createEntitlements(
  { provider, cache, unwrapProvider }: BillingContext,
  { keyedCustomer }: Pick<BillingCustomers, 'keyedCustomer'>,
) {
  /**
   * An entity's customer state, by the entity's id, the customer's external
   * id. An entity that never paid has no customer, and the provider says so.
   * One the component maps to a customer from before 0.2, with no external
   * id yet, gets its id on this first read; one mapped onto another
   * entity's customer reads as having none.
   */
  const readState = async (ctx: RunQueryCtx, userId: string) => {
    const read = await customersGetStateExternal(provider.polar, { externalId: userId })
    if (read.ok || !isProviderNotFound(read.error)) return read
    if (!await keyedCustomer(ctx, userId, 'entitlement sync')) return null
    const keyed = await customersGetStateExternal(provider.polar, { externalId: userId })
    return keyed.ok || !isProviderNotFound(keyed.error) ? keyed : null
  }

  const getCustomerState: Billing['getCustomerState'] = async (ctx, { userId }) => {
    const read = await readState(ctx, userId)
    if (!read) {
      return { customerId: null, activeProductIds: [], benefits: [], meters: [] }
    }
    // Through the package boundary like every provider read: the raw SDK
    // error carries the provider's response body, which must not reach a caller.
    const state = unwrapProvider(read, 'entitlement sync') as {
      id: string
      activeSubscriptions?: Array<{
        productId: string
        currentPeriodStart?: Date
        currentPeriodEnd?: Date
        meters?: Array<{ meterId: string }>
      }>
      grantedBenefits?: StateGrant[]
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
    const metadataByBenefit = new Map<string, Record<string, string | number | boolean>>(snapshots.map(s => [s.benefitId, s.metadata]))
    // A benefit's name: the snapshot's, or the live read's below.
    const nameByBenefit = new Map(snapshots.flatMap(s => (s.description === undefined ? [] : [[s.benefitId, s.description] as const])))
    // A snapshot from before names were kept has none: it is read again once.
    const fresh = new Set(snapshots.filter(s => now - s.updatedAt < ttl && s.description !== undefined).map(s => s.benefitId))
    const staleBenefitIds = distinctBenefitIds.filter(id => !fresh.has(id))
    const fetched: Array<{ benefitId: string, metadata: Record<string, string | number | boolean>, description?: string }> = []
    // Rollover lives on the meter-credit *benefit*, not on customer state — so
    // it is only known on the reads this loop already makes. Absent between
    // reads (the metadata TTL), which is why `rollover` is optional all the way
    // out to `useCredits()`: the UI degrades to "no expiry shown", never lies.
    //
    // One meter can be credited by several benefits — a plan's monthly
    // allowance that lapses and a pack's purchase that keeps — so a meter
    // rolls over when any of them does, and reads as expiring only when
    // every credit benefit was read this pass and none on it rolls over:
    // a balance that partly carries over is never said to expire.
    const rolloverByMeter = new Map<string, boolean>()
    const readCreditBenefits = new Set<string>()
    await Promise.all(
      staleBenefitIds.map(async (benefitId) => {
        const benefit = await benefitsGet(provider.polar, { id: benefitId })
        if (benefit.ok) {
          const metadata = benefit.value.metadata ?? {}
          metadataByBenefit.set(benefitId, metadata)
          const description = benefit.value.description
          if (typeof description === 'string') nameByBenefit.set(benefitId, description)
          fetched.push({ benefitId, metadata, ...(typeof description === 'string' ? { description } : {}) })
          if (benefit.value.type === 'meter_credit') {
            const { meterId, rollover } = benefit.value.properties
            readCreditBenefits.add(benefitId)
            rolloverByMeter.set(meterId, rolloverByMeter.get(meterId) === true || rollover)
          }
        }
      }),
    )
    if (fetched.length > 0 && 'runMutation' in ctx) {
      await (ctx as RunWriteCtx).runMutation(cache.upsertBenefitMetadata, { entries: fetched })
    }
    const creditUnread = grants.some(grant => grant.benefitType === 'meter_credit' && !readCreditBenefits.has(grant.benefitId))
    /** What a meter's rollover is known to be: `true` from any one benefit, `false` only from all of them. */
    const rolloverOf = (meterId: string): { rollover?: boolean } => {
      const known = rolloverByMeter.get(meterId)
      return known === true || (known === false && !creditUnread) ? { rollover: known } : {}
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
      customerId: state.id,
      activeProductIds: (state.activeSubscriptions ?? []).map(s => s.productId),
      benefits: grants.map(b => ({
        id: b.id,
        benefitId: b.benefitId,
        type: b.benefitType,
        kind: benefitKindOf(b.benefitType),
        ...(nameByBenefit.has(b.benefitId) ? { name: nameByBenefit.get(b.benefitId) } : {}),
        ...(b.grantedAt instanceof Date ? { grantedAt: b.grantedAt.getTime() } : {}),
        ...grantDetails(b),
        metadata: metadataByBenefit.get(b.benefitId) ?? {},
      })),
      meters: (state.activeMeters ?? []).map(m => ({
        meterId: m.meterId,
        consumedUnits: m.consumedUnits,
        creditedUnits: m.creditedUnits,
        balance: m.balance,
        ...cycleByMeter.get(m.meterId),
        ...rolloverOf(m.meterId),
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
      // The kind and the name are read off the type and the benefit's
      // snapshot when the cache is read, so a renamed benefit shows at once.
      benefits: state.benefits.map(({ kind: _kind, name: _name, ...benefit }) => benefit),
      meters: state.meters,
    })
  }

  const forgetEntity: Billing['forgetEntity'] = async (ctx, userId) => {
    await ctx.runMutation(cache.deleteByUser, { userId })
  }

  return { getCustomerState, refreshEntitlements, forgetEntity }
}

export type BillingEntitlements = ReturnType<typeof createEntitlements>
