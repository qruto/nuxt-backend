import { subscriptionsUpdate } from '@polar-sh/sdk/funcs/subscriptionsUpdate.js'
import type { Auth, FunctionReference } from 'convex/server'
import { resolveBackendPaths } from '../../paths.js'
import { backendError } from '../../errors.js'
import { logBackend } from '../../log.js'
import { BILLING_ACCESS, type BillingContext } from './context.js'
import { readEnv } from '../../delivery.js'
import type { CatalogDiscounts } from './discounts.js'
import type { BillingFreePlan } from './free-plan.js'
import { addMonths, type BillingPasses } from './passes.js'
import { EMAIL_OPT_OUT_METADATA } from './purchase.js'
import { type BillingSubscriptions, CANCELLATION_COMMENT_MAX, epochOf, type SyncedSubscription } from './subscriptions.js'
import type { CancellationReason, ProviderCtx, RunQueryCtx, RunWriteCtx } from './types/base.js'
import type { BillingLifecycle, CancelOutcome, BillingConsole, SaveOffer, SaveOfferRule, WithdrawalPeriod } from './types/lifecycle.js'
import type { CancelSubscriptionOptions, SubscriptionTarget } from './types/options.js'

// The billing lifecycle (LIFECYCLE): what the package does around a
// subscription's life beyond the provider's own. The cancel flow's save
// offers, the EU withdrawal button, the renewal consent proof, the annual
// renewal reminder for short cycles, an abandoned checkout's hand-off to the
// lifecycle emails, and the reverse trial on a plan pass. Every rule that
// keeps a save offer lawful is the server's: the browser only names one.

const DAY_MS = 24 * 60 * 60 * 1000

/** The EU withdrawal period: 14 days from the purchase (Consumer Rights Directive, Art. 9). */
export const WITHDRAWAL_PERIOD_MS = 14 * DAY_MS

/** One save offer per billing entity in this window: someone who cancels again within the year cancels in one step. */
export const SAVE_OFFER_WINDOW_MS = 365 * DAY_MS

/**
 * How long after the last renewal reminder (and the subscription's start)
 * the next is due: about eleven months, so each lands once a year at a
 * monthly renewal close to the anniversary.
 */
export const RENEWAL_REMINDER_EVERY_MS = 330 * DAY_MS

/** The provider's eight cancellation reasons: the keys `saveOffers` takes. */
export const CANCELLATION_REASONS: readonly CancellationReason[] = ['customer_service', 'low_quality', 'missing_features', 'switched_service', 'too_complex', 'too_expensive', 'unused', 'other']

/** Statuses of a subscription that is held: what a withdrawal can end. */
const HELD_STATUSES = new Set(['active', 'trialing', 'past_due'])

/**
 * Whether the provider's own renewal reminder leaves this cycle out: it
 * covers cycles of six months or more, however they are counted (a year,
 * 6 months, 25 weeks, 180 days).
 */
export function remindsItself(interval: string | null | undefined, count = 1): boolean {
  if (interval === 'year') return true
  if (interval === 'month') return count >= 6
  if (interval === 'week') return count >= 25
  if (interval === 'day') return count >= 180
  return true
}

/**
 * The plus tag and the dots taken out of an address's local part, lower-cased:
 * the form a reverse trial is counted by, so `ana+2@example.com` and
 * `a.na@example.com` are the address that already had one.
 */
export function trialAddress(email: string): string {
  const [local = '', domain = ''] = email.trim().toLowerCase().split('@')
  return `${local.split('+')[0]!.replaceAll('.', '')}@${domain}`
}

/** SHA-256 of a string, hex: what the reverse trial keeps instead of the address. */
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Refuse a `lifecycle` the package could not keep, as `setupBilling` runs:
 * a reason that is none of the provider's eight, a pause outside 1 to 3
 * months, an offer that names nothing.
 */
export function refuseInvalidLifecycle(lifecycle: BillingLifecycle | undefined): void {
  for (const [reason, rule] of Object.entries(lifecycle?.saveOffers ?? {}) as Array<[string, SaveOfferRule | undefined]>) {
    const problem = CANCELLATION_REASONS.includes(reason as CancellationReason)
      ? rule && offerRuleProblem(rule)
      : `'${reason}' is none of the provider's cancellation reasons (${CANCELLATION_REASONS.join(', ')})`
    if (problem) throw new TypeError(`[nuxt-backend] setupBilling({ lifecycle: { saveOffers: { ${reason} } } }): ${problem}.`)
  }
}

/** What is wrong with one save offer, if anything. */
function offerRuleProblem(rule: SaveOfferRule): string | undefined {
  const named = (value: unknown) => typeof value === 'string' && value !== ''
  if ('pause' in rule) return [1, 2, 3].includes(rule.pause?.months) ? undefined : 'a pause lasts 1 to 3 months — write `{ pause: { months: 2 } }`'
  if ('downgrade' in rule) return named(rule.downgrade) ? undefined : '`downgrade` names a plan of the catalog by its key'
  return named(rule.discount) ? undefined : '`discount` names a discount of the catalog without a code, by its key'
}

/** The billing lifecycle of one `setupBilling` call. */
export function createLifecycle(
  { components, config, catalogIds, provider, requireEntity, allowedEntity, unwrapProvider, throttle, recordEvent, cache }: BillingContext,
  subscriptions: BillingSubscriptions,
  discounts: CatalogDiscounts,
  passes: Pick<BillingPasses, 'managersOf' | 'planName' | 'startTrialPass'>,
  freePlan: Pick<BillingFreePlan, 'isFreeProduct'>,
) {
  const lifecycle = config.lifecycle ?? {}
  refuseInvalidLifecycle(lifecycle)
  const settingsPath = resolveBackendPaths(config.paths, 'setupBilling').settings
  const records = components.backend.subscriptions

  /** A product's catalog plan and the interval it prices, or `null` for one the catalog does not name. */
  const planOf = (productId: string): { plan: string, interval: string } | null => {
    for (const [plan, prices] of Object.entries(catalogIds?.plans ?? {})) {
      for (const [interval, id] of Object.entries(prices ?? {})) if (id === productId) return { plan, interval }
    }
    return null
  }

  /** A product's name as the app sells it: its plan's, else the provider's. */
  const nameOf = async (ctx: RunQueryCtx, productId: string): Promise<string> => {
    const plan = planOf(productId)?.plan
    if (plan) return await passes.planName(ctx, plan)
    return (await provider.getProduct(ctx as unknown as ProviderCtx, { productId }))?.name ?? ''
  }

  /** When a subscription started, epoch ms. */
  const startOf = (subscription: SyncedSubscription): number | null => epochOf(subscription.startedAt) ?? epochOf(subscription.createdAt)

  /**
   * When a subscription's plan was bought, epoch ms: its renewing checkout's
   * confirmed consent proof, else its start. A plan bought from the free
   * plan is an upgrade of the free plan's subscription in place, which keeps
   * the free plan's start; the withdrawal period and a renewal reminder's age
   * run from the purchase.
   */
  const purchaseOf = async (ctx: RunQueryCtx, subscription: SyncedSubscription): Promise<number | null> =>
    await ctx.runQuery(records.purchasedAt, { subscriptionId: subscription.id }) ?? startOf(subscription)

  /** Whether a subscription is inside its withdrawal period at `now`, while the withdrawal button is on. */
  const inWithdrawalPeriod = async (ctx: RunQueryCtx, subscription: SyncedSubscription, now: number): Promise<boolean> => {
    const purchase = lifecycle.withdrawal ? await purchaseOf(ctx, subscription) : null
    return purchase !== null && now < purchase + WITHDRAWAL_PERIOD_MS
  }

  // ── Save offers ────────────────────────────────────────────────────────

  /**
   * The terms of the offer a rule makes for this subscription, or `null`
   * when it can make none: a pause needs a running period to follow, a
   * downgrade a cheaper plan of the catalog at the same interval, and a
   * discount one of the catalog without a code that applies to the plan.
   */
  const termsOf = async (ctx: RunQueryCtx, subscription: SyncedSubscription, rule: SaveOfferRule) => {
    const periodEnd = epochOf(subscription.currentPeriodEnd)
    if ('pause' in rule) {
      if (periodEnd === null || subscription.status !== 'active') return null
      return { kind: 'pause' as const, months: rule.pause.months, resumesAt: addMonths(periodEnd, rule.pause.months) }
    }
    if ('downgrade' in rule) {
      const current = planOf(subscription.productId)
      const prices = catalogIds?.plans?.[rule.downgrade]
      const productId = prices?.[(current?.interval ?? 'month') as 'month'] ?? prices?.month
      if (!productId || productId === subscription.productId || catalogIds?.retired?.includes(rule.downgrade) || await freePlan.isFreeProduct(ctx, productId)) return null
      return { kind: 'downgrade' as const, plan: rule.downgrade, productId }
    }
    const discount = discounts.discountOf(rule.discount)
    if (!discount || discount.code || !discount.productIds.includes(subscription.productId)) return null
    return { kind: 'discount' as const, discount: discount.key }
  }

  /** An offer as the browser reads it, from what the server made. */
  const toOffer = (id: string, reason: CancellationReason, subscription: Pick<SyncedSubscription, 'productId' | 'currentPeriodEnd'>, terms: { kind: 'pause' | 'downgrade' | 'discount', months?: number, resumesAt?: number, plan?: string, discount?: string }): SaveOffer => {
    if (terms.kind === 'pause') return { id, reason, kind: 'pause', months: terms.months!, resumesAt: terms.resumesAt!, plan: planOf(subscription.productId)?.plan ?? null }
    if (terms.kind === 'downgrade') return { id, reason, kind: 'downgrade', plan: terms.plan!, appliesAt: epochOf(subscription.currentPeriodEnd) }
    const discount = discounts.discountOf(terms.discount!)!
    return {
      id,
      reason,
      kind: 'discount',
      discount: discount.key,
      name: discount.name,
      ...(discount.percentOff === undefined ? {} : { percentOff: discount.percentOff }),
      ...(discount.amountOff === undefined ? {} : { amountOff: discount.amountOff }),
      duration: discount.duration,
      ...(discount.months === undefined ? {} : { months: discount.months }),
    }
  }

  /**
   * Whether no save offer may stand before this cancellation: on a plan
   * already set to end (the provider refuses the cancellation itself), a
   * trial, a past-due plan, inside the withdrawal period, or when the entity
   * had one in the last 12 months.
   */
  const offerBarred = async (ctx: RunQueryCtx, entityId: string, subscription: SyncedSubscription): Promise<boolean> => {
    if (subscription.cancelAtPeriodEnd || subscription.status !== 'active' || await inWithdrawalPeriod(ctx, subscription, Date.now())) return true
    return await ctx.runQuery(records.lastOffer, { entityId, since: Date.now() - SAVE_OFFER_WINDOW_MS }) !== null
  }

  /**
   * Cancel, or answer with the save offer for the reason first. Cancelling
   * takes one step: an offer comes only where `saveOffers` names one for the
   * reason, nothing bars it, and `offer` is not `false`; the next call, or
   * one with `offer: false`, cancels. Revoking at once never offers.
   */
  const cancel = async (ctx: RunWriteCtx & { auth?: Auth }, options: CancelSubscriptionOptions & { offer?: false }): Promise<CancelOutcome> => {
    const { offer: wanted, ...cancellation } = options
    const rule = cancellation.reason ? lifecycle.saveOffers?.[cancellation.reason] : undefined
    if (rule && wanted !== false && cancellation.atPeriodEnd !== false && (cancellation.comment?.trim().length ?? 0) <= CANCELLATION_COMMENT_MAX) {
      const { userId, subscription } = await subscriptions.subscriptionToChange(ctx, 'cancellation', cancellation)
      const terms = await offerBarred(ctx, userId, subscription) ? null : await termsOf(ctx, subscription, rule)
      // Kept only when no other offer was made in the window meanwhile: a second cancellation at once cancels.
      const id = terms ? await ctx.runMutation(records.recordOffer, { entityId: userId, subscriptionId: subscription.id, reason: cancellation.reason!, offer: terms, since: Date.now() - SAVE_OFFER_WINDOW_MS }) : null
      if (terms && id) {
        await recordEvent(ctx, userId, { type: 'billing.save_offer_made', targetId: subscription.id, data: { reason: cancellation.reason!, offer: terms.kind } })
        return { offer: toOffer(id, cancellation.reason!, subscription, terms) }
      }
    }
    const updated = await subscriptions.cancelSubscription(ctx, cancellation) as { endsAt?: unknown, currentPeriodEnd?: unknown }
    return { canceled: true, endsAt: epochOf(updated.endsAt) ?? epochOf(updated.currentPeriodEnd) }
  }

  /**
   * Apply a save offer the server made: the caller's entity's own, still
   * open, taken once. A pause and a downgrade go through the lifecycle
   * operations (the same checks, the same activity), a discount through
   * `applyDiscount`. An offer the provider then refuses is given back.
   */
  const acceptOffer = async (ctx: RunWriteCtx & { auth?: Auth }, { offerId }: { offerId: string }): Promise<void> => {
    const { userId } = await requireEntity(ctx, BILLING_ACCESS.change)
    const taken = await ctx.runMutation(records.takeOffer, { offerId, entityId: userId })
    if (!taken) throw backendError('invalid_input', { field: 'offer' }, '[nuxt-backend] acceptSaveOffer: this offer was not made to this billing account, was taken already, or is no longer open.')
    const { subscriptionId, offer } = taken
    try {
      if (offer.kind === 'pause') await subscriptions.pauseSubscription(ctx, { subscriptionId, resumesAt: new Date(offer.resumesAt!) })
      else if (offer.kind === 'downgrade') await subscriptions.updateSubscription(ctx, { subscriptionId, productId: offer.productId!, proration: 'next_period' })
      else await subscriptions.applyDiscount(ctx, { entityId: userId, discount: offer.discount!, subscriptionId })
    }
    catch (error) {
      await ctx.runMutation(records.releaseOffer, { offerId })
      throw error
    }
    await recordEvent(ctx, userId, { type: 'billing.save_offer_accepted', targetId: subscriptionId, data: { reason: taken.reason, offer: offer.kind } })
  }

  // ── The withdrawal button ──────────────────────────────────────────────

  /**
   * The entity's latest purchase that was not withdrawn from, with its
   * withdrawal period, if any: the one still open at `now` when `now` is
   * given. A query passes none, since it can't read the clock and stay
   * fresh: the period's `endsAt` says when it closes.
   */
  const openWithdrawal = async (ctx: RunQueryCtx, entityId: string, { subscriptionId, now }: { subscriptionId?: string, now?: number } = {}): Promise<{ period: WithdrawalPeriod, subscription: SyncedSubscription } | null> => {
    if (!lifecycle.withdrawal) return null
    const all = await provider.listAllUserSubscriptions(ctx as unknown as ProviderCtx, { userId: entityId }) as SyncedSubscription[]
    let latest: { period: WithdrawalPeriod, subscription: SyncedSubscription } | null = null
    for (const subscription of all) {
      if (subscriptionId !== undefined && subscription.id !== subscriptionId) continue
      const period = await periodOf(ctx, subscription, now)
      if (period && (!latest || period.startedAt > latest.period.startedAt)) latest = { period, subscription }
    }
    return latest
  }

  /** A held, paid subscription's withdrawal period, not withdrawn from: open at `now` when given. `null` otherwise. */
  const periodOf = async (ctx: RunQueryCtx, subscription: SyncedSubscription, now: number | undefined): Promise<WithdrawalPeriod | null> => {
    if (subscription.endedAt != null || !HELD_STATUSES.has(subscription.status)) return null
    const startedAt = await purchaseOf(ctx, subscription)
    if (startedAt === null || (now !== undefined && now >= startedAt + WITHDRAWAL_PERIOD_MS)) return null
    if (await freePlan.isFreeProduct(ctx, subscription.productId) || await ctx.runQuery(records.withdrawalOf, { subscriptionId: subscription.id })) return null
    return { subscriptionId: subscription.id, plan: planOf(subscription.productId)?.plan ?? null, startedAt, endsAt: startedAt + WITHDRAWAL_PERIOD_MS }
  }

  /**
   * What `<WithdrawalButton>` shows, for a billing manager: the caller's
   * entity's latest purchase with its withdrawal period (`period`, `null`
   * without one or with the button off), open until `period.endsAt`, which
   * the button compares with the clock. `null` for anyone who may not
   * manage the billing.
   */
  const getWithdrawal = async (ctx: RunQueryCtx & { auth?: Auth }): Promise<{ period: WithdrawalPeriod | null } | null> => {
    const entity = await allowedEntity(ctx, BILLING_ACCESS.change)
    if (!entity) return null
    return { period: lifecycle.withdrawal ? (await openWithdrawal(ctx, entity.userId))?.period ?? null : null }
  }

  /**
   * Withdraw from a purchase inside its 14 days: the subscription ends at
   * once at the provider, the withdrawal is recorded with its date and time,
   * and the caller gets a receipt by email. The refund is an
   * administrator's (`billing.refundOrder`), less what was used: the
   * `billing.contract_withdrawn` event tells them.
   */
  const withdraw = async (ctx: RunWriteCtx & { auth?: Auth }, options: SubscriptionTarget = {}): Promise<{ withdrawnAt: number }> => {
    // The caller in person, the subscription its own (`not_owner` else), never the free plan.
    const { userId: entityId, subscription } = await subscriptions.subscriptionToChange(ctx, 'withdrawal', options)
    const open = await openWithdrawal(ctx, entityId, { subscriptionId: subscription.id, now: Date.now() })
    if (!open) throw backendError('invalid_input', { field: 'subscriptionId', reason: 'withdrawal_closed' }, '[nuxt-backend] withdraw: no purchase of this billing account is inside its withdrawal period.')
    await throttle(ctx, entityId, 'withdrawals')
    const identity = await ctx.auth?.getUserIdentity()
    const caller = { userId: identity?.subject ?? entityId, email: typeof (identity as { email?: unknown } | null)?.email === 'string' ? (identity as unknown as { email: string }).email : '' }
    unwrapProvider(await subscriptionsUpdate(provider.polar, { id: open.subscription.id, subscriptionUpdate: { revoke: true } }), 'withdrawal')
    const withdrawnAt = Date.now()
    await ctx.runMutation(records.recordWithdrawal, { entityId, subscriptionId: open.subscription.id, userId: caller.userId, productId: open.subscription.productId, at: withdrawnAt })
    await recordEvent(ctx, entityId, { type: 'billing.contract_withdrawn', targetId: open.subscription.id, data: { productId: open.subscription.productId } })
    if (caller.email) {
      try {
        await config.email.sendTemplate(ctx, 'withdrawalReceipt', {
          email: caller.email,
          plan: await nameOf(ctx, open.subscription.productId),
          withdrawnAt,
        }, { senderId: caller.userId, idempotencyKey: `nuxt-backend:withdrawal:${open.subscription.id}` })
      }
      catch (error) {
        logBackend('error', 'billing.withdrawal_receipt_failed', 'A withdrawal went through, but its receipt email could not be sent; the activity trail holds its date and time.', error)
      }
    }
    return { withdrawnAt }
  }

  // ── Consent proof, reminders and abandoned checkouts ───────────────────

  /**
   * Keep what a renewing checkout showed, as it is made: the plan, the price
   * and its interval, the terms version the person agreed to and who. The
   * subscription it starts, or the free plan's it upgrades, confirms it.
   * Never fails the checkout: a lost proof is logged.
   */
  const recordConsent = async (ctx: RunWriteCtx & { auth?: Auth }, entityId: string, checkout: { id: string, amount?: number | null, currency?: string | null, productId?: string | null, product?: { recurringInterval?: string | null, recurringIntervalCount?: number | null } | null }): Promise<void> => {
    const interval = checkout.product?.recurringInterval
    if (!interval || !checkout.productId) return
    try {
      const userId = (await ctx.auth?.getUserIdentity())?.subject
      const terms = userId ? await ctx.runQuery(components.backend.consents.latest, { userId, kind: 'terms' }) : null
      await ctx.runMutation(records.recordConsent, {
        checkoutId: checkout.id,
        entityId,
        ...(userId ? { userId } : {}),
        productId: checkout.productId,
        amount: checkout.amount ?? 0,
        currency: checkout.currency ?? '',
        interval,
        intervalCount: checkout.product?.recurringIntervalCount ?? 1,
        ...(terms?.granted ? { termsVersion: terms.version } : {}),
      })
    }
    catch (error) {
      logBackend('error', 'billing.consent_unrecorded', 'A renewing checkout was created, but the proof of its renewal consent could not be kept.', error)
    }
  }

  /**
   * The subscription a checkout started or upgraded, or the order it paid,
   * arrived: the checkout's consent proof is confirmed, once, with when it
   * was given. A plan bought from the free plan upgrades the free plan's
   * subscription in place, which no `subscription.created` announces.
   */
  const confirmConsent = async (ctx: RunWriteCtx, { subscriptionId, checkoutId, at }: { subscriptionId?: unknown, checkoutId?: unknown, at?: unknown }): Promise<void> => {
    if (typeof subscriptionId !== 'string' || typeof checkoutId !== 'string') return
    await ctx.runMutation(records.confirmConsent, { checkoutId, subscriptionId, at: epochOf(at) ?? Date.now() })
  }

  /**
   * A subscription changed (each renewal updates it): once a year, on a cycle the
   * provider's reminder leaves out, its billing managers get the reminder of
   * its terms California's automatic renewal law asks for. Nothing for a
   * free plan, one set to end, or a purchase younger than eleven months.
   */
  const remindRenewal = async (ctx: RunWriteCtx, entityId: string, subscription: SyncedSubscription): Promise<void> => {
    if (!lifecycle.renewalReminders || subscription.status !== 'active' || subscription.cancelAtPeriodEnd || !subscription.amount) return
    if (remindsItself(subscription.recurringInterval, subscription.recurringIntervalCount ?? 1)) return
    const start = await purchaseOf(ctx, subscription)
    const site = readEnv('SITE_URL')
    if (start === null || Date.now() - start < RENEWAL_REMINDER_EVERY_MS || !site) return
    if (!await ctx.runMutation(records.markOnce, { key: `renewal:${subscription.id}`, every: RENEWAL_REMINDER_EVERY_MS })) return
    const name = await nameOf(ctx, subscription.productId)
    const year = new Date().getUTCFullYear()
    for (const manager of await passes.managersOf(ctx, entityId)) {
      await config.email.sendTemplate(ctx, 'renewalReminder', {
        email: manager.email,
        plan: name,
        amount: subscription.amount,
        currency: subscription.currency ?? '',
        interval: subscription.recurringInterval ?? 'month',
        intervalCount: subscription.recurringIntervalCount ?? 1,
        renewsAt: epochOf(subscription.currentPeriodEnd) ?? Date.now(),
        manageUrl: `${site}${settingsPath}`,
      }, { senderId: manager.userId, idempotencyKey: `nuxt-backend:renewal-reminder:${subscription.id}:${year}:${manager.userId}` })
    }
  }

  /**
   * A checkout expired unpaid: `billing.checkout_abandoned` once, for the
   * billing entity, with the person who opened it as its actor — what the
   * `checkoutAbandoned` lifecycle email starts from, for someone who
   * agreed to hear from the app. A free checkout records nothing.
   */
  const abandonCheckout = async (ctx: RunWriteCtx, checkout: { id?: unknown, externalCustomerId?: unknown, customerId?: unknown, productId?: unknown, amount?: unknown, metadata?: Record<string, unknown> }): Promise<void> => {
    if (!lifecycle.abandonedCheckout || typeof checkout.id !== 'string' || checkout.amount === 0) return
    const entityId = typeof checkout.externalCustomerId === 'string' && checkout.externalCustomerId
      ? checkout.externalCustomerId
      : typeof checkout.customerId === 'string' ? await ctx.runQuery(cache.userByCustomer, { customerId: checkout.customerId }) : null
    if (!entityId || !await ctx.runMutation(records.markOnce, { key: `checkout:${checkout.id}` })) return
    const openedBy = checkout.metadata?.openedBy
    await recordEvent(ctx, entityId, {
      type: 'billing.checkout_abandoned',
      actor: typeof openedBy === 'string' && openedBy ? { userId: openedBy } : null,
      targetId: checkout.id,
      data: { productId: typeof checkout.productId === 'string' ? checkout.productId : 'unknown' },
    })
  }

  // ── The reverse trial ──────────────────────────────────────────────────

  /** The plan whose trial is a reverse trial, with its pass product and length, if the catalog has one. */
  const trialPlan = Object.entries(catalogIds?.passes ?? {}).find(([, entry]) => entry.trialDays !== undefined)

  /**
   * A new workspace's free plan just started: with a reverse trial in the
   * catalog, it becomes the plan's pass for the trial's length, once per
   * address (plus tags and dots taken out). Never fails the free plan.
   */
  const startReverseTrial = async (ctx: RunWriteCtx, entityId: string, owner: { userId: string, email: string }, subscriptionId: string): Promise<boolean> => {
    if (!trialPlan || !owner.email) return false
    const [plan, entry] = trialPlan
    try {
      return await passes.startTrialPass(ctx, { entityId, owner, plan, passProductId: entry.pass, days: entry.trialDays!, address: await sha256(trialAddress(owner.email)), subscriptionId })
    }
    catch (error) {
      logBackend('error', 'billing.reverse_trial_failed', 'A new workspace stayed on the free plan: its reverse trial could not start.', error)
      return false
    }
  }

  // ── The admin console ──────────────────────────────────────────────────

  /**
   * The Billing tab of the admin console: the save offers, the
   * withdrawals and the confirmed renewal consent proofs, newest first, each
   * product named as the app sells it. With `entityId`, one billing
   * entity's. The caller checks the administrator.
   */
  const consoleOf = async (ctx: RunQueryCtx, entityId?: string): Promise<BillingConsole> => {
    const rows = await ctx.runQuery(records.lifecycleConsole, entityId ? { entityId } : {})
    const names = new Map<string, Promise<string>>()
    const name = (productId: string): Promise<string> => {
      let named = names.get(productId)
      if (!named) names.set(productId, named = nameOf(ctx, productId).catch(() => ''))
      return named
    }
    return {
      saveOffers: rows.saveOffers.map(row => ({
        id: row.id,
        entityId: row.entityId,
        subscriptionId: row.subscriptionId,
        reason: row.reason,
        kind: row.offer.kind,
        months: row.offer.months ?? null,
        plan: row.offer.plan ?? null,
        discount: row.offer.discount ?? null,
        madeAt: row.madeAt,
        acceptedAt: row.acceptedAt ?? null,
      })),
      withdrawals: await Promise.all(rows.withdrawals.map(async row => ({
        entityId: row.entityId,
        subscriptionId: row.subscriptionId,
        userId: row.userId,
        plan: (await name(row.productId)) || row.productId,
        at: row.at,
      }))),
      consents: await Promise.all(rows.consents.map(async row => ({
        entityId: row.entityId,
        subscriptionId: row.subscriptionId ?? null,
        userId: row.userId ?? null,
        plan: (await name(row.productId)) || row.productId,
        amount: row.amount,
        currency: row.currency,
        interval: row.interval,
        intervalCount: row.intervalCount,
        termsVersion: row.termsVersion ?? null,
        consentedAt: row.consentedAt,
      }))),
    }
  }

  // ── The soft opt-in ────────────────────────────────────────────────────

  /**
   * A paid order of a checkout that showed the soft opt-in's box
   * (`<PricingTable>`, `<BillingCheckoutLink>`): unless the person who
   * opened it ticked "Don't email me", they join every topic with
   * `softOptIn`, recorded on the consent ledger with the checkout. A sale
   * only: never a renewal, a plan change or a free order, and once per
   * checkout. Nothing without `email.preferences`.
   */
  const softOptIn = async (ctx: RunWriteCtx, order: { checkoutId?: unknown, billingReason?: unknown, totalAmount?: unknown, metadata?: Record<string, unknown> }): Promise<void> => {
    const box = order.metadata?.[EMAIL_OPT_OUT_METADATA]
    const openedBy = order.metadata?.openedBy
    const join = config.email.preferences?.softOptIn
    if (!join || box !== 'false' || typeof openedBy !== 'string' || !openedBy || typeof order.checkoutId !== 'string' || !order.checkoutId) return
    if ((order.billingReason !== 'purchase' && order.billingReason !== 'subscription_create') || order.totalAmount === 0) return
    if (!await ctx.runMutation(records.markOnce, { key: `soft-opt-in:${order.checkoutId}` })) return
    const user = await ctx.runQuery(components.backend.adapter.findOne as FunctionReference<'query', 'internal'>, { model: 'user', where: [{ field: '_id', value: openedBy }] }) as { email?: string } | null
    if (!user?.email) return
    await join(ctx, { email: user.email, userId: openedBy, objected: false, checkoutId: order.checkoutId })
  }

  return { cancel, acceptOffer, getWithdrawal, withdraw, recordConsent, confirmConsent, remindRenewal, abandonCheckout, startReverseTrial, consoleOf, softOptIn }
}

/** The billing lifecycle of one `setupBilling` call. */
export type BillingLifecycleOps = ReturnType<typeof createLifecycle>
