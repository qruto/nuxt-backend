import { ShardedCounter } from '@convex-dev/sharded-counter'
import type { Auth } from 'convex/server'
import { grantedQuotas, isSeatLikeQuota, quotaLimit } from '../../catalog.js'
import { backendError } from '../../errors.js'
import type { BillingContext } from './context.js'
import { liveGrants } from './features.js'
import type { BillingPricing } from './pricing.js'
import type { RunQueryCtx, RunWriteCtx } from './types/base.js'
import type { FeatureCheckOptions } from './types/options.js'
import type { QuotaUsage } from './types/records.js'
import type { Billing } from './types/surface.js'

/** A granted benefit as a quota read takes it: its metadata, live where the cache has a snapshot. */
type QuotaBenefit = { metadata?: Readonly<Record<string, unknown>> | null }

/** A record's own entry, never one its prototype lends (`constructor`, `toString`): a key a caller may have sent. */
const ownEntry = <T>(record: Readonly<Record<string, T>> | undefined, key: string): T | undefined =>
  record && Object.hasOwn(record, key) ? record[key] : undefined

/** What the counter's reads and writes take: a context with `runQuery`, and `runMutation` to write. */
type CounterCtx = Parameters<ShardedCounter<string>['count']>[0]
type CounterWriteCtx = Parameters<ShardedCounter<string>['add']>[0]

/**
 * A quota's name as a gate takes it: a string that is not about people,
 * else a mistake in the app's code. An empty one is no quota at all.
 */
function checkedQuota(quota: unknown, what: string): string {
  if (typeof quota !== 'string') {
    throw new TypeError(`[nuxt-backend] ${what}: the quota is its catalog key, a string, not ${JSON.stringify(quota) ?? String(quota)}.`)
  }
  if (isSeatLikeQuota(quota)) {
    throw new TypeError(`[nuxt-backend] ${what}: '${quota}' counts people, and a plan here is never priced per seat. Count what people make (projects, sites, boards) instead.`)
  }
  return quota
}

/** How many a claim or a release counts: a whole number above zero, which a caller may have sent. */
function checkedAmount(amount: unknown, what: string): number {
  if (typeof amount === 'number' && Number.isSafeInteger(amount) && amount > 0) return amount
  throw backendError('invalid_input', { field: 'amount' }, `[nuxt-backend] ${what}: the amount is a whole number above zero, not ${JSON.stringify(amount) ?? String(amount)}.`)
}

/**
 * Plan quotas on the server: what the billing entity's plan allows of each,
 * read from the entitlement cache the billing webhooks keep fresh (never a
 * live provider read), and how many it holds, counted by the sharded
 * counter in the mutation that makes or removes the thing. The limit is the
 * most any grant allows, so a plan and an add-on never add up, and a quota
 * no grant names allows none: a gate fails closed.
 *
 * Why the sharded counter, not an aggregate: a quota counts claims, not the
 * rows of one table the package knows, so one counter mount serves every
 * quota of every app, keyed by entity and quota, with no table, index or
 * trigger to wire per quota. Each count lives on one shard: a check reads
 * it and a claim writes it in the same transaction, so two claims at once
 * conflict and one retries against the count the other left, and a limit
 * is never overshot.
 *
 * A thing another module counts (the files storage keeps, by the quota key
 * it registered) is read from that module's count and added to the claims,
 * so a quota shows one number whoever counts it.
 */
export function createQuotas(
  { components, cache, catalogIds, billTo, requireEntity, allowedEntity }: BillingContext,
  { readPricing }: Pick<BillingPricing, 'readPricing'>,
) {
  // One shard per count: a check reads the document a claim writes.
  const counter = components.shardedCounter ? new ShardedCounter(components.shardedCounter, { defaultShards: 1 }) : null
  const holder = billTo === 'workspace' ? 'workspace' : 'account'

  /** One entity's count of one quota, in the app's counter, beside its own counts. */
  const counterName = (entityId: string, quota: string) => `billing:quota:${quota}:${entityId}`

  const requireCounter = (what: string): ShardedCounter<string> => {
    if (counter) return counter
    throw new TypeError(`[nuxt-backend] ${what} counts with the sharded counter component, which this app does not pass to setupBilling: mount it in convex.config.ts as the scaffold does (\`app.use(shardedCounter)\`; \`npx nuxt-backend doctor --fix\` adds it) and pass \`components\` whole.`)
  }

  /** What the entity's quotas hold in the modules that count them (storage's files and bytes), by quota key. */
  const externalOf = async (ctx: RunQueryCtx, entityId: string): Promise<Record<string, number>> =>
    components.backend.storage ? await ctx.runQuery(components.backend.storage.quotaUsage, { holder: entityId }) : {}

  /** The claims the app counted itself, in the sharded counter. */
  const claimedOf = async (ctx: RunQueryCtx, entityId: string, quota: string): Promise<number> =>
    counter ? await counter.count(ctx as CounterCtx, counterName(entityId, quota)) : 0

  const usedOf = async (ctx: RunQueryCtx, entityId: string, quota: string): Promise<number> =>
    await claimedOf(ctx, entityId, quota) + (ownEntry(await externalOf(ctx, entityId), quota) ?? 0)

  /** The limits the entity's cached grants allow, each benefit's metadata read live. */
  const limitsOf = async (ctx: RunQueryCtx, entityId: string): Promise<Map<string, number>> =>
    grantedQuotas(await liveGrants(ctx, cache, entityId))

  /** The quotas a read reports: every one the catalog declares, and every one a grant names. */
  const reportedKeys = (limits: Map<string, number>, external: Record<string, number> = {}): string[] =>
    [...new Set([...Object.keys(catalogIds?.quotas ?? {}), ...limits.keys(), ...Object.keys(external)])].filter(key => !isSeatLikeQuota(key))

  /** A quota as a read answers it: its limit, its count, and what it counts when the catalog says. */
  const usageOf = (key: string, limit: number, used: number): QuotaUsage => {
    const description = ownEntry(catalogIds?.quotas, key)
    return { limit: quotaLimit(limit), used, ...(description === undefined ? {} : { description }) }
  }

  /**
   * Every quota of an entity whose granted benefits (with their live
   * metadata) are already read: what `getFeatures` answers beside them.
   */
  const readQuotas = async (ctx: RunQueryCtx, entityId: string, benefits: QuotaBenefit[]): Promise<Record<string, QuotaUsage>> => {
    const limits = grantedQuotas(benefits)
    const external = await externalOf(ctx, entityId)
    const entries = await Promise.all(reportedKeys(limits, external).map(async key =>
      [key, usageOf(key, limits.get(key) ?? 0, await claimedOf(ctx, entityId, key) + (ownEntry(external, key) ?? 0))] as const))
    return Object.fromEntries(entries)
  }

  /** The plans on sale whose quota fits `needed`, by catalog key, in pricing order. */
  const plansAllowing = async (ctx: RunQueryCtx, quota: string, needed: number): Promise<string[]> =>
    (await readPricing(ctx)).plans
      .filter((plan) => {
        const limit = ownEntry(plan.quotas, quota)
        return !plan.retired && (limit === 'unlimited' || (limit ?? 0) >= needed)
      })
      .map(plan => plan.key)

  /** The entity a check is for: the one the server named, else the caller's, checked as a member. */
  const entityFor = async (ctx: RunQueryCtx & { auth?: Auth }, options: FeatureCheckOptions): Promise<string> =>
    options.userId ?? (await requireEntity(ctx, { access: 'member' })).userId

  /**
   * Refuse any context but a mutation's: an action's read and write could
   * not be one transaction, and a query writes nothing.
   */
  const refuseAction = (ctx: object, what: string): void => {
    if ('runAction' in ctx || !('runMutation' in ctx)) {
      throw new TypeError(`[nuxt-backend] ${what} counts in the mutation that makes or removes the thing, where the check and the count are one transaction. Call it there, not in an action or a query.`)
    }
  }

  const getQuota: Billing['getQuota'] = async (ctx, quota, options = {}) => {
    const key = checkedQuota(quota, 'getQuota')
    const entityId = options.userId ?? (await allowedEntity(ctx, { access: 'member' }))?.userId
    if (key === '' || !entityId) return usageOf(key, 0, 0)
    const limit = (await limitsOf(ctx, entityId)).get(key) ?? 0
    return usageOf(key, limit, await usedOf(ctx, entityId, key))
  }

  const requireQuota: Billing['requireQuota'] = async (ctx, quota, amount = 1, options = {}) => {
    refuseAction(ctx, 'requireQuota')
    const key = checkedQuota(quota, 'requireQuota')
    if (key === '') throw backendError('invalid_input', { field: 'quota' }, '[nuxt-backend] requireQuota: name the quota, by its catalog key.')
    const count = checkedAmount(amount, 'requireQuota')
    const entityId = await entityFor(ctx, options)
    const tally = requireCounter('requireQuota')
    const limit = (await limitsOf(ctx, entityId)).get(key) ?? 0
    const name = counterName(entityId, key)
    const claimed = await tally.count(ctx as CounterCtx, name)
    // What another module counts under the key (storage's files) holds room too.
    const used = claimed + (ownEntry(await externalOf(ctx, entityId), key) ?? 0)
    if (used + count > limit) {
      const plans = await plansAllowing(ctx, key, used + count)
      throw backendError(
        'quota_exceeded',
        { quota: key, limit, used, amount: count, plans },
        `[nuxt-backend] This ${holder}'s plan allows ${limit} ${key} and ${used} ${used === 1 ? 'is' : 'are'} used, so ${count} more ${count === 1 ? 'does' : 'do'} not fit${plans.length > 0 ? `; ${plans.join(', ')} ${plans.length === 1 ? 'allows' : 'allow'} enough` : ', and no plan on sale allows enough'}.`,
      )
    }
    // The entity's first claim notes the key, so forgetting it finds this count whatever the catalog says by then.
    if (claimed === 0) await ctx.runMutation(cache.recordQuotaKey, { userId: entityId, key })
    await tally.add(ctx as CounterWriteCtx, name, count)
    return usageOf(key, limit, used + count)
  }

  const releaseQuota: Billing['releaseQuota'] = async (ctx, quota, amount = 1, options = {}) => {
    refuseAction(ctx, 'releaseQuota')
    const key = checkedQuota(quota, 'releaseQuota')
    if (key === '') throw backendError('invalid_input', { field: 'quota' }, '[nuxt-backend] releaseQuota: name the quota, by its catalog key.')
    const count = checkedAmount(amount, 'releaseQuota')
    const entityId = await entityFor(ctx, options)
    const tally = requireCounter('releaseQuota')
    const name = counterName(entityId, key)
    const claimed = await tally.count(ctx as CounterCtx, name)
    // Never below zero: a count released twice must not open room the plan never gave.
    const released = Math.min(count, claimed)
    if (released > 0) await tally.subtract(ctx as CounterWriteCtx, name, released)
    const limit = (await limitsOf(ctx, entityId)).get(key) ?? 0
    return usageOf(key, limit, claimed - released + (ownEntry(await externalOf(ctx, entityId), key) ?? 0))
  }

  /**
   * Clear an entity's counts, part of forgetting it: every quota it ever
   * counted (noted with its first claim), and every one the catalog
   * declares or its grants name. The notes go with the entity's cache rows.
   */
  const forgetQuotas = async (ctx: RunWriteCtx, entityId: string): Promise<void> => {
    if (!counter) return
    const counted = await ctx.runQuery(cache.quotaKeys, { userId: entityId })
    const keys = new Set([...counted, ...reportedKeys(await limitsOf(ctx, entityId))])
    for (const key of keys) await counter.reset(ctx as CounterWriteCtx, counterName(entityId, key))
  }

  return { getQuota, requireQuota, releaseQuota, readQuotas, forgetQuotas, plansAllowing }
}

export type BillingQuotas = ReturnType<typeof createQuotas>
