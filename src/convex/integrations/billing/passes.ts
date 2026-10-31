import { customersGetStateExternal } from '@polar-sh/sdk/funcs/customersGetStateExternal.js'
import { subscriptionsCreate } from '@polar-sh/sdk/funcs/subscriptionsCreate.js'
import { subscriptionsGet } from '@polar-sh/sdk/funcs/subscriptionsGet.js'
import { subscriptionsUpdate } from '@polar-sh/sdk/funcs/subscriptionsUpdate.js'
import type { FunctionReference } from 'convex/server'
import { BILLING_MANAGER_ROLES } from '../../constants.js'
import { resolveBackendPaths } from '../../paths.js'
import { backendError } from '../../errors.js'
import { logBackend } from '../../log.js'
import { hasAnyRole } from '../access.js'
import { type BillingContext, isProviderNotFound, readEnv } from './context.js'
import type { BillingCustomers } from './customers.js'
import type { BillingFreePlan } from './free-plan.js'
import type { GiftRecord } from './types/records.js'
import type { RunQueryCtx, RunWriteCtx } from './types/base.js'

// Plan passes: a plan gift, claimed by a workspace that holds no paid plan.
// The workspace's free subscription is switched to the plan's free "pass"
// product, which carries the plan's benefits, so the provider grants its
// features, quotas and monthly credits like any plan's, with no card and no
// renewal. The package keeps the end date: once the pass's last billing cycle
// began, it schedules the switch back to the free plan for the period's end
// (`next_period`, the furthest the provider schedules), and its sweep forces
// the switch at the end date should that have been missed. A week before, the
// workspace's billing managers are offered to keep the plan, an ordinary
// checkout of it that moves the pass subscription to the paid plan in place.

const DAY_MS = 24 * 60 * 60 * 1000

/** The date `months` calendar months after `from`, the way the provider adds a monthly period. */
export function addMonths(from: number, months: number): number {
  const date = new Date(from)
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + months)
  // Jan 31 + 1 month is the end of February, not March 3.
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(day, last))
  return date.getTime()
}

/** The last cycle of a pass is at least this long: from here to the end, the pass is in it. */
export const LAST_CYCLE_MS = 28 * DAY_MS

/** How long a plan pass's claim holds its gift: the provider calls of one claim, with room to spare. */
const CLAIM_HOLD_MS = 5 * 60 * 1000

/** A billing period that ends this close to its pass's end ends with it: the hourly sweep could not switch the pass back any sooner. */
const PERIOD_SLACK_MS = 60 * 60 * 1000

/**
 * From when a pass's return to the free plan may be booked: once its last
 * monthly cycle from `startedAt` began (an hour in, so the provider has
 * turned the cycle over), or at once when its first cycle is its last. A
 * return booked a cycle earlier would end the pass a cycle early, since the
 * provider applies it at the end of the period it is booked in.
 */
export function returnFrom(startedAt: number, endsAt: number): number {
  let cycles = 0
  while (addMonths(startedAt, cycles + 1) < endsAt) cycles++
  return cycles === 0 ? startedAt : addMonths(startedAt, cycles) + 60 * 60 * 1000
}

/** A referral reward of free months, as the steps below take it. */
export interface RewardInput { rewardId: string, userId: string, entityId: string, months: number }

/** The subscription of a pass, as the steps read it. */
interface PassSubscription {
  id: string
  productId: string
  status: string
  currentPeriodEnd?: Date | null
  pendingUpdate?: { productId?: string | null } | null
}

/** One billing manager a notice goes to. */
export interface Manager { userId: string, email: string }

/** The pass logic of one `setupBilling` call. */
export function createPasses(
  { components, config, billTo, freePlan, catalogIds, provider, requireProviderAccess, unwrapProvider, throttle, recordEvent }: BillingContext,
  { ensureCustomer, profileOf }: Pick<BillingCustomers, 'ensureCustomer' | 'profileOf'>,
  { isFreeProduct }: Pick<BillingFreePlan, 'isFreeProduct'>,
) {
  const settingsPath = resolveBackendPaths(config.paths, 'setupBilling').settings
  const gifts = components.backend.gifts

  /** The plan a pass product belongs to, by its catalog key. */
  const planOfPass = (productId: string): string | undefined =>
    Object.entries(catalogIds?.passes ?? {}).find(([, entry]) => entry.pass === productId)?.[0]

  /** A plan's name as the app sells it, for a notice. */
  const planName = async (ctx: RunQueryCtx, plan: string): Promise<string> => {
    const productId = catalogIds?.plans?.[plan]?.month ?? Object.values(catalogIds?.plans?.[plan] ?? {})[0]
    const product = productId ? await provider.getProduct(ctx as never, { productId }) : null
    return product?.name ?? plan
  }

  /** The subscriptions an entity holds right now, read from the provider: the synced table may lag a claim by seconds. */
  const heldSubscriptions = async (entityId: string): Promise<PassSubscription[]> => {
    const state = await customersGetStateExternal(provider.polar, { externalId: entityId })
    if (!state.ok && isProviderNotFound(state.error)) return []
    return unwrapProvider(state, 'pass claim').activeSubscriptions as unknown as PassSubscription[]
  }

  /**
   * Claim a plan pass into a workspace the recipient manages. Only a
   * workspace without a paid subscription takes it, and only one without a
   * pass running: `forbidden`, reason `already_subscribed`. The gift is held
   * for this claim before the provider switches anything, so a second claim,
   * the purchaser's cancellation or a refund can't land half way: they wait,
   * or are refused (`gift_claimed`). The free subscription becomes the pass
   * in place, at once and with no charge; a workspace on no subscription at
   * all gets the pass as a new one. A claim that fails after the switch
   * switches back to the free plan and lets go of the gift. The pass lasts
   * `months` from now, and its billing period is aligned to that, so each
   * monthly cycle grants the plan's allowance.
   */
  const claimPass = async (ctx: RunWriteCtx, gift: GiftRecord, recipient: { userId: string, email: string, name?: string, emailVerified?: boolean }, entityId: string): Promise<void> => {
    requireProviderAccess('plan pass claim')
    const passProductId = gift.productIds[0]
    if (!gift.plan || !gift.months || !passProductId || !freePlan) {
      throw backendError('not_ready', { reason: 'no_catalog' }, '[nuxt-backend] claimGift: this plan pass cannot be applied — the catalog has no free plan for it to return to.')
    }
    await throttle(ctx, recipient.userId, 'gift claims')
    const taken = backendError('forbidden', { reason: 'already_subscribed' }, '[nuxt-backend] claimGift: this billing account already holds a plan. A pass goes to a workspace on the free plan — claim it into another, or later.')
    if (await ctx.runQuery(gifts.activePass, { entityId })) throw taken
    const hold = { giftId: gift.id, userId: recipient.userId, entityId, until: Date.now() + CLAIM_HOLD_MS }
    const held = await ctx.runMutation(gifts.reservePass, hold)
    if (held === 'taken') throw taken
    if (held !== 'reserved') throw await holdRefusal(ctx, gift.id)
    const switched: { id?: string } = {}
    let endsAt: number
    try {
      endsAt = await switchToPass(ctx, { gift, months: gift.months, passProductId, recipient, entityId, taken, switched })
    }
    catch (error) {
      if (switched.id) await backToFree(switched.id, 'pass claim')
      // This claim's own hold only: one that lapsed meanwhile may be another claim's now.
      await ctx.runMutation(gifts.releasePass, hold)
      throw error
    }
    const data = { plan: gift.plan, months: gift.months, endsAt }
    await recordEvent(ctx, entityId, { type: 'gift.pass_started', actor: { userId: recipient.userId }, targetId: gift.id, data })
  }

  /** Why a pass claim could not hold its gift: it was refunded, or another claim or a cancellation holds it, or it was claimed. */
  const holdRefusal = async (ctx: RunQueryCtx, giftId: string): Promise<Error> => {
    if ((await ctx.runQuery(gifts.get, { giftId }))?.status === 'refunded') {
      return backendError('forbidden', { reason: 'gift_refunded' }, '[nuxt-backend] claimGift: this gift was refunded, so it can\'t be received.')
    }
    return backendError('forbidden', { reason: 'gift_claimed' }, '[nuxt-backend] claimGift: this gift was claimed, or is being claimed or cancelled right now.')
  }

  /**
   * The provider's half of a pass claim the gift is held for: the entity's
   * free subscription switched to the pass (or a new one started, its id
   * kept in `switched` for an undo), its period aligned, and the pass
   * recorded. Answers when the pass ends.
   */
  const switchToPass = async (ctx: RunWriteCtx, { gift, months, passProductId, recipient, entityId, taken, switched }: { gift: GiftRecord, months: number, passProductId: string, recipient: { userId: string, email: string }, entityId: string, taken: Error, switched: { id?: string } }): Promise<number> => {
    await ensureCustomer(ctx, { userId: entityId, email: recipient.email }, await profileOf(ctx, entityId), 'pass claim')
    let free: PassSubscription | undefined
    for (const subscription of await heldSubscriptions(entityId)) {
      if (!await isFreeProduct(ctx, subscription.productId)) throw taken
      free ??= subscription
    }
    const now = Date.now()
    const endsAt = addMonths(now, months)
    // Both products are free, so the provider applies the switch at once and bills nothing.
    if (free) {
      unwrapProvider(await subscriptionsUpdate(provider.polar, { id: free.id, subscriptionUpdate: { productId: passProductId, prorationBehavior: 'invoice' } }), 'pass claim')
      switched.id = free.id
    }
    else {
      switched.id = unwrapProvider(await subscriptionsCreate(provider.polar, { productId: passProductId, externalCustomerId: entityId }), 'pass claim').id
    }
    // The first month runs from the claim, so every cycle and the end date fall on the same day.
    const aligned = await subscriptionsUpdate(provider.polar, { id: switched.id, subscriptionUpdate: { currentBillingPeriodEnd: new Date(addMonths(now, 1)) } })
    if (!aligned.ok) logBackend('warn', 'billing.pass_period_unaligned', 'A plan pass kept the provider\'s billing period; its end date still holds, enforced by the sweep.')
    if (!await ctx.runMutation(gifts.startPass, { giftId: gift.id, userId: recipient.userId, entityId, subscriptionId: switched.id, endsAt, returnFrom: returnFrom(now, endsAt) })) {
      throw backendError('forbidden', { reason: 'gift_claimed' }, '[nuxt-backend] claimGift: this gift was claimed, or is being claimed right now.')
    }
    return endsAt
  }

  /**
   * Switch a subscription a pass took back to the free plan, for a start
   * that did not finish: nothing of it stays. A switch the provider refuses
   * is logged, never thrown over the failure that undid the start.
   */
  const backToFree = async (subscriptionId: string, operation: string): Promise<void> => {
    if (!freePlan) return
    const undone = await subscriptionsUpdate(provider.polar, { id: subscriptionId, subscriptionUpdate: { productId: freePlan.productId, prorationBehavior: 'invoice' } })
    if (!undone.ok) logBackend('error', 'billing.pass_claim_unrecorded', `A ${operation} that did not finish left its subscription on the pass product: switch it back to the free plan by hand.`, undone.error)
  }

  /** Read a pass's subscription live; `null` once it is gone at the provider. */
  const readSubscription = async (subscriptionId: string): Promise<PassSubscription | null> => {
    const read = await subscriptionsGet(provider.polar, { id: subscriptionId })
    if (!read.ok && isProviderNotFound(read.error)) return null
    return unwrapProvider(read, 'pass follow') as unknown as PassSubscription
  }

  /** The people who manage an entity's billing, with the address each is written to. */
  const managersOf = async (ctx: RunQueryCtx, entityId: string): Promise<Manager[]> => {
    const findOne = components.backend.adapter.findOne as FunctionReference<'query', 'internal'>
    const userEmail = async (userId: string): Promise<Manager | null> => {
      const user = await ctx.runQuery(findOne, { model: 'user', where: [{ field: '_id', value: userId }] }) as { email?: string, banned?: boolean } | null
      return user?.email && !user.banned ? { userId, email: user.email.toLowerCase() } : null
    }
    if (billTo === 'user') return [await userEmail(entityId)].filter((manager): manager is Manager => manager !== null)
    const findMany = components.backend.adapter.findMany as FunctionReference<'query', 'internal'>
    const page = await ctx.runQuery(findMany, { model: 'member', where: [{ field: 'organizationId', value: entityId }], paginationOpts: { cursor: null, numItems: 100 } }) as { page: Array<{ userId: string, role: string }> }
    const found = await Promise.all(page.page.filter(member => hasAnyRole(member.role, BILLING_MANAGER_ROLES)).map(member => userEmail(member.userId)))
    return found.filter((manager): manager is Manager => manager !== null)
  }

  /**
   * Tell the entity's billing managers a pass ends in a week, in the app and
   * by email, with the one offer: keep the plan. The email is the package's:
   * no provider tells a workspace its gifted plan is ending.
   */
  const noticeEnding = async (ctx: RunWriteCtx, gift: GiftRecord): Promise<void> => {
    const entityId = gift.claimedEntityId
    if (!entityId || !gift.plan || gift.passEndsAt === undefined) return
    const site = readEnv('SITE_URL')
    const plan = await planName(ctx, gift.plan)
    const profile = await profileOf(ctx, entityId)
    for (const manager of await managersOf(ctx, entityId)) {
      if (!site) break
      await config.email.sendTemplate(ctx, 'giftPassEnding', {
        email: manager.email,
        plan,
        ...(gift.reverseTrial ? { trial: true } : {}),
        ...(profile?.name ? { workspace: profile.name } : {}),
        endsAt: gift.passEndsAt,
        keepUrl: `${site}${settingsPath}`,
      }, { senderId: manager.userId, idempotencyKey: `nuxt-backend:gift-pass-ending:${gift.id}:${manager.userId}` })
    }
    await recordEvent(ctx, entityId, { type: 'gift.pass_ending', actor: null, targetId: gift.id, data: { plan: gift.plan, endsAt: gift.passEndsAt } })
    await ctx.runMutation(gifts.notePass, { giftId: gift.id, step: 'noticed' })
  }

  /** A pass that is over: the entity returned to the free plan, or kept the plan by paying for it. */
  const finish = async (ctx: RunWriteCtx, gift: GiftRecord, outcome: 'returned' | 'kept'): Promise<void> => {
    const taken = await ctx.runMutation(gifts.notePass, { giftId: gift.id, step: 'ended' })
    if (taken && gift.claimedEntityId && gift.plan) {
      await recordEvent(ctx, gift.claimedEntityId, { type: 'gift.pass_ended', actor: null, targetId: gift.id, data: { plan: gift.plan, outcome } })
    }
  }

  /**
   * Follow a pass for one sweep step. A subscription that is no longer on the
   * pass product is over: back on the free plan, or on a paid one the
   * workspace kept (its scheduled return cleared, so it can't undo the
   * plan). On the pass still, `schedule_return` books the switch to the free
   * plan for the period's end, and `end_pass` forces it when the end date came.
   * A period that ends before the pass does (the provider kept its own when
   * the start could not align it) gets no booking, which would end the pass
   * early: `end_pass` alone switches it back, on its end date.
   */
  const follow = async (ctx: RunWriteCtx, gift: GiftRecord, step: 'schedule_return' | 'end_pass'): Promise<void> => {
    if (!gift.passSubscriptionId || gift.passEndedAt !== undefined || !freePlan) return
    const passProductId = gift.productIds[0]
    const subscription = await readSubscription(gift.passSubscriptionId)
    if (!subscription || subscription.status === 'canceled' || subscription.status === 'incomplete_expired') {
      await finish(ctx, gift, 'returned')
      return
    }
    if (subscription.productId !== passProductId) {
      const kept = subscription.productId !== freePlan.productId
      if (kept && subscription.pendingUpdate) {
        unwrapProvider(await subscriptionsUpdate(provider.polar, { id: subscription.id, subscriptionUpdate: { pendingUpdate: null } }), 'pass follow')
      }
      await finish(ctx, gift, kept ? 'kept' : 'returned')
      return
    }
    if (step === 'schedule_return') {
      const periodEnd = subscription.currentPeriodEnd?.getTime()
      const endsFirst = periodEnd !== undefined && gift.passEndsAt !== undefined && periodEnd < gift.passEndsAt - PERIOD_SLACK_MS
      if (!endsFirst && subscription.pendingUpdate?.productId !== freePlan.productId) {
        unwrapProvider(await subscriptionsUpdate(provider.polar, { id: subscription.id, subscriptionUpdate: { productId: freePlan.productId, prorationBehavior: 'next_period' } }), 'pass follow')
      }
      await ctx.runMutation(gifts.notePass, { giftId: gift.id, step: 'return_scheduled' })
      return
    }
    unwrapProvider(await subscriptionsUpdate(provider.polar, { id: subscription.id, subscriptionUpdate: { productId: freePlan.productId, prorationBehavior: 'invoice' } }), 'pass end')
    await finish(ctx, gift, 'returned')
  }

  /**
   * A subscription changed at the provider: when it is a running pass that
   * now sits on another product, the workspace kept the plan. The return the
   * package scheduled is cleared, and the pass is over. Called from the
   * subscription webhooks.
   */
  const onSubscriptionChanged = async (ctx: RunWriteCtx, entityId: string | null, subscription: { id?: string, productId?: string }): Promise<void> => {
    if (!entityId || !subscription.id || !subscription.productId || !freePlan) return
    const pass = await ctx.runQuery(gifts.activePass, { entityId })
    if (pass?.subscriptionId !== subscription.id || planOfPass(subscription.productId) !== undefined) return
    const gift = await ctx.runQuery(gifts.get, { giftId: pass.id })
    if (gift) await follow(ctx, gift, 'schedule_return')
  }

  /**
   * Start a reverse trial (LIFECYCLE): a new workspace's free subscription
   * becomes the plan's pass for `days`, with no card, followed by the gift
   * sweep like a gifted pass. Nothing when the address (its hash, plus tags
   * and dots taken out) already started one, or the workspace holds more
   * than its free plan. A start that loses a race to another is switched
   * back.
   */
  const startTrialPass = async (ctx: RunWriteCtx, { entityId, owner, plan, passProductId, days, address, subscriptionId }: { entityId: string, owner: { userId: string, email: string }, plan: string, passProductId: string, days: number, address: string, subscriptionId: string }): Promise<boolean> => {
    if (!freePlan || await ctx.runQuery(gifts.trialPassTaken, { address })) return false
    const now = Date.now()
    const endsAt = now + days * DAY_MS
    unwrapProvider(await subscriptionsUpdate(provider.polar, { id: subscriptionId, subscriptionUpdate: { productId: passProductId, prorationBehavior: 'invoice' } }), 'reverse trial')
    let started = false
    try {
      // The period ends with the trial (or a month in, for a longer one), so the return lands on its end date.
      const aligned = await subscriptionsUpdate(provider.polar, { id: subscriptionId, subscriptionUpdate: { currentBillingPeriodEnd: new Date(Math.min(endsAt, addMonths(now, 1))) } })
      if (!aligned.ok) logBackend('warn', 'billing.pass_period_unaligned', 'A reverse trial kept the provider\'s billing period; its end date still holds, enforced by the sweep.')
      started = await ctx.runMutation(gifts.startTrialPass, { address, userId: owner.userId, entityId, plan, productId: passProductId, subscriptionId, endsAt, returnFrom: returnFrom(now, endsAt) })
    }
    finally {
      // A start that lost its race, or failed to record, is switched back: no pass runs that nothing follows.
      if (!started) await backToFree(subscriptionId, 'reverse trial')
    }
    if (!started) return false
    await recordEvent(ctx, entityId, { type: 'billing.trial_pass_started', actor: { userId: owner.userId }, targetId: subscriptionId, data: { plan, endsAt } })
    return true
  }

  /**
   * Move a paid plan's renewal date later by the months. The new date is kept
   * before the provider is asked and set as an absolute date, so a run that
   * stopped after the provider answered sets the same date again.
   */
  const extendPlan = async (subscriptionId: string, months: number, target: number | undefined, remember: (endsAt: number) => Promise<void>): Promise<'extended' | { waitUntil: number }> => {
    const current = unwrapProvider(await subscriptionsGet(provider.polar, { id: subscriptionId }), 'referral reward') as unknown as { currentPeriodEnd?: Date | null }
    // No period to move: the months wait for one.
    if (!current.currentPeriodEnd) return { waitUntil: Date.now() + DAY_MS }
    const end = target ?? addMonths(current.currentPeriodEnd.getTime(), months)
    if (target === undefined) await remember(end)
    unwrapProvider(await subscriptionsUpdate(provider.polar, { id: subscriptionId, subscriptionUpdate: { currentBillingPeriodEnd: new Date(end) } }), 'referral reward')
    return 'extended'
  }

  /**
   * Put a workspace on the free plan on a plan's pass for the months: its
   * free subscription switches to the pass product (or a new one starts),
   * and the pass is recorded for the gift sweep to follow. A run that
   * stopped after the switch finds the subscription on the pass already.
   */
  const startRewardPass = async (ctx: RunWriteCtx, input: RewardInput & { plan?: string }, free: PassSubscription | undefined): Promise<'pass' | { waitUntil: number }> => {
    const { rewardId, userId, entityId, months } = input
    const keys = Object.keys(catalogIds?.passes ?? {})
    const planKey = input.plan ?? (keys.length === 1 ? keys[0] : undefined)
    const pass = planKey ? catalogIds?.passes?.[planKey] : undefined
    if (!pass || !planKey || !freePlan) {
      throw backendError('not_ready', { reason: 'no_catalog' }, '[nuxt-backend] referral reward: free months on the free plan need a plan with `gift: { months }` in the catalog (name it with `rewards.referrer.plan` when there are several) and a free plan to return to, then `npx nuxt-backend billing sync`.')
    }
    const now = Date.now()
    const endsAt = addMonths(now, months)
    const switched = free !== undefined && free.productId !== pass.pass
    if (free && switched) {
      unwrapProvider(await subscriptionsUpdate(provider.polar, { id: free.id, subscriptionUpdate: { productId: pass.pass, prorationBehavior: 'invoice' } }), 'referral reward')
    }
    const subscriptionId = free?.id ?? unwrapProvider(await subscriptionsCreate(provider.polar, { productId: pass.pass, externalCustomerId: entityId }), 'referral reward').id
    const aligned = await subscriptionsUpdate(provider.polar, { id: subscriptionId, subscriptionUpdate: { currentBillingPeriodEnd: new Date(Math.min(endsAt, addMonths(now, 1))) } })
    if (!aligned.ok) logBackend('warn', 'billing.pass_period_unaligned', 'A referral reward\'s pass kept the provider\'s billing period; its end date still holds, enforced by the sweep.')
    if (await ctx.runMutation(gifts.startRewardPass, { rewardId, userId, entityId, plan: planKey, months, productId: pass.pass, subscriptionId, endsAt, returnFrom: returnFrom(now, endsAt) })) return 'pass'
    return await rewardPassRefused(ctx, input, switched ? subscriptionId : undefined)
  }

  /**
   * A reward's pass the component did not record: another run recorded this
   * reward, so it is granted; or the workspace took a pass meanwhile, so the
   * switch this run made is undone and the months wait for that pass to end.
   */
  const rewardPassRefused = async (ctx: RunWriteCtx, { rewardId, entityId }: RewardInput, switched: string | undefined): Promise<'pass' | { waitUntil: number }> => {
    const active = await ctx.runQuery(gifts.activePass, { entityId })
    if (active?.rewardId === rewardId) return 'pass'
    if (switched && freePlan) unwrapProvider(await subscriptionsUpdate(provider.polar, { id: switched, subscriptionUpdate: { productId: freePlan.productId, prorationBehavior: 'invoice' } }), 'referral reward')
    return { waitUntil: active?.endsAt ?? Date.now() + DAY_MS }
  }

  /**
   * Free months for a referrer (REF). A paid plan's renewal date moves later
   * by the months, so the next payment is that much later (the provider
   * grants a plan's credits when a cycle starts, so a moved date skips them
   * for those months). A workspace on the free plan gets the plan's pass for
   * the months instead, which the gift sweep follows like a gifted one.
   * Answers what was done: `extended` or `pass` (also for this reward's own
   * pass, from a run that stopped before it was noted), or `waitUntil` for a
   * workspace that holds another pass: the months are not stacked on it, and
   * are granted once it ends.
   */
  const rewardMonths = async (ctx: RunWriteCtx, input: RewardInput & { email: string, plan?: string, target?: number, remember: (endsAt: number) => Promise<void> }): Promise<'extended' | 'pass' | { waitUntil: number }> => {
    requireProviderAccess('referral reward')
    const { entityId } = input
    await ensureCustomer(ctx, { userId: entityId, email: input.email }, await profileOf(ctx, entityId), 'referral reward')
    const active = await ctx.runQuery(gifts.activePass, { entityId })
    if (active) return active.rewardId === input.rewardId ? 'pass' : { waitUntil: active.endsAt }
    let free: PassSubscription | undefined
    let paid: PassSubscription | undefined
    for (const subscription of await heldSubscriptions(entityId)) {
      if (await isFreeProduct(ctx, subscription.productId)) free ??= subscription
      else paid ??= subscription
    }
    return paid ? await extendPlan(paid.id, input.months, input.target, input.remember) : await startRewardPass(ctx, input, free)
  }

  return { claimPass, follow, noticeEnding, onSubscriptionChanged, planOfPass, planName, managersOf, startTrialPass, rewardMonths }
}

/** The passes of one `setupBilling` call. */
export type BillingPasses = ReturnType<typeof createPasses>
