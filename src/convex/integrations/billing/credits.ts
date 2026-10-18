import { eventsIngest } from '@polar-sh/sdk/funcs/eventsIngest.js'
import type { Auth } from 'convex/server'
import type { BillingContext } from './context.js'
import type { BillingEntitlements } from './entitlements.js'
import type { EventsIngestRequest, ProviderCtx, RunWriteCtx } from './types/base.js'
import type { BillingEntityCtx } from './types/setup.js'
import type { Billing } from './types/surface.js'
import { backendError } from '../../errors.js'

/**
 * Refuse a credit amount that is not a finite number above zero (`orZero`:
 * zero or more), before it reaches the cached balance or the provider. A
 * negative spend would credit the balance and ingest a usage event that
 * grants credits; a `NaN` would leave the balance `NaN`, and every guard
 * comparison after that passes. `setupAi` checks a call's cost with it too,
 * before the budget window counts it.
 */
export function requireCreditAmount(value: unknown, label: string, { orZero = false } = {}): number {
  if (typeof value === 'number' && Number.isFinite(value) && (orZero ? value >= 0 : value > 0)) return value
  throw new Error(`[nuxt-backend] ${label} must be a finite number ${orZero ? 'of zero or more' : 'above zero'} — got ${String(value)}.`)
}

/** Prepaid credits: reserve, settle, release, spend and refund. */
export function createCredits(
  { provider, cache, resolveMeter, resolveEntity, unwrapProvider }: BillingContext,
  { refreshEntitlements }: BillingEntitlements,
) {
  /**
   * The caller's billing entity, for a spend or refund without an explicit
   * `userId`, or the refusal: `unauthenticated` when nobody is signed in
   * (a hand-built context with no `auth` has no caller to resolve), else
   * `no_workspace`.
   */
  const callerEntityId = async (ctx: RunWriteCtx & { auth?: Auth }, what: string): Promise<string> => {
    const entityId = ctx.auth ? (await resolveEntity(ctx as BillingEntityCtx))?.userId : undefined
    if (entityId) return entityId
    const detail = `[nuxt-backend] ${what}: no billing entity — pass \`userId\` or call from an authenticated context.`
    if (!await ctx.auth?.getUserIdentity()) throw backendError('unauthenticated', {}, detail)
    throw backendError('no_workspace', {}, detail)
  }

  // Reserve → ingest → settle. The cached balance is the guard: `debit` is an
  // atomic conditional decrement (Convex mutations serialize), so two
  // concurrent spends can never both pass, and there is no live provider read
  // on the spend path at all. The provider event remains the only durable
  // record; a failed ingest releases the reservation, so a failed run never
  // consumes credits. Split into reserve/settle/release so `setupAi` (and the
  // streaming HTTP dispatcher, which settles in a different function than it
  // reserved in) compose the same semantics — `spendCredits` is the one-call
  // form.
  const reserveCredits: Billing['reserveCredits'] = async (ctx, event) => {
    const value = requireCreditAmount(event.value ?? 1, 'spendCredits: `value`')
    const entityId = event.userId ?? await callerEntityId(ctx, 'spendCredits')
    const meter = resolveMeter(event)
    const externalId = event.externalId ?? crypto.randomUUID()

    if (!meter) {
      return { entityId, externalId, reserved: false, value }
    }
    // Configured count meters count events — one event is one credit, so a
    // multi-credit spend has no representable event shape. Raw `meterId`
    // spends skip this: the caller owns the event shape there.
    if (meter.key && !meter.property && value !== 1) {
      throw new Error(
        `[nuxt-backend] spendCredits: meter '${meter.key}' counts events (no \`property\` configured) — `
        + 'spend value must be 1 per event, or configure a sum meter with a `property`.',
      )
    }
    const debitArgs = { userId: entityId, meterId: meter.meterId, amount: value, externalId, allowOverage: event.allowOverage }
    let result = await ctx.runMutation(cache.debit, debitArgs)
    if (!result.ok && (result.reason === 'no-row' || result.reason === 'no-meter') && event.allowRefresh !== false) {
      // Cold cache (granted but never synced) — self-heal once, then retry.
      // Needs an action ctx (the provider read fetches); mutation callers pass
      // `allowRefresh: false` and surface the sync hint instead.
      await refreshEntitlements(ctx as RunWriteCtx, entityId)
      result = await ctx.runMutation(cache.debit, debitArgs)
    }
    if (!result.ok && result.reason === 'insufficient') {
      throw backendError(
        'insufficient_credits',
        // A balance that is no number (the guard fails closed on one) reads as none left.
        { meter: meter.key, balance: Number.isFinite(result.balance) ? result.balance : 0, need: value },
        `[nuxt-backend] Insufficient credits — balance ${result.balance}, need ${value}. Top up to continue.`,
      )
    }
    if (!result.ok) {
      throw backendError(
        'not_ready',
        { reason: 'not_synced' },
        `[nuxt-backend] Credit balance not synced yet for ${entityId} — call syncEntitlements (or open a billing view) and retry.`,
      )
    }
    return { entityId, externalId, reserved: true, meter: meter.key, meterId: meter.meterId, value }
  }

  const settleSpend: Billing['settleSpend'] = async (ctx, reservation, options = {}) => {
    // A reservation is plain data that crosses function boundaries, so it is
    // checked like any other input before an event is ingested on its word.
    const reserved = requireCreditAmount(reservation.value, 'settleSpend: the reservation\'s `value`')
    const final = options.finalAmount === undefined
      ? reserved
      : requireCreditAmount(options.finalAmount, 'settleSpend: `finalAmount`', { orZero: true })
    const meter = resolveMeter(reservation)
    const name = options.name ?? meter?.eventName ?? meter?.key
    if (!name) {
      throw new Error('[nuxt-backend] settleSpend: pass `name`, or a configured `meter` whose key/eventName names the event.')
    }
    // The estimate is the ceiling: settling above it would be a second,
    // unguarded debit — the reservation is what made the spend safe against a
    // concurrent one.
    const value = Math.min(final, reserved)
    if (value === 0) {
      // Nothing was spent, so there is no event to ingest (on a count meter
      // one would bill a credit); closing at zero hands the reservation back.
      if (reservation.reserved) await ctx.runMutation(cache.settle, { userId: reservation.entityId, externalId: reservation.externalId, finalAmount: 0 })
      return
    }
    try {
      if (!await provider.getCustomerByUserId(ctx as unknown as ProviderCtx, reservation.entityId)) {
        throw backendError('not_ready', { reason: 'no_customer' }, `[nuxt-backend] No billing customer for ${reservation.entityId}. Start a checkout first.`)
      }
      const metadata = meter?.property
        ? { ...options.metadata, [meter.property]: value }
        : options.metadata
      // By the entity's id, never a member's: usage counts against the customer.
      const events: EventsIngestRequest['events'] = [{
        name,
        externalCustomerId: reservation.entityId,
        metadata,
        externalId: reservation.externalId,
        timestamp: options.timestamp,
      }]
      unwrapProvider(await eventsIngest(provider.polar, { events }), 'usage report')
    }
    catch (error) {
      if (reservation.reserved) await ctx.runMutation(cache.release, { userId: reservation.entityId, externalId: reservation.externalId })
      throw error
    }
    if (reservation.reserved) await ctx.runMutation(cache.settle, { userId: reservation.entityId, externalId: reservation.externalId, finalAmount: value })
  }

  const releaseSpend: Billing['releaseSpend'] = async (ctx, reservation) => {
    if (!reservation.reserved) return
    await ctx.runMutation(cache.release, { userId: reservation.entityId, externalId: reservation.externalId })
  }

  const spendCredits: Billing['spendCredits'] = async (ctx, event) => {
    const reservation = await reserveCredits(ctx, event)
    await settleSpend(ctx, reservation, { name: event.name, metadata: event.metadata, timestamp: event.timestamp })
  }

  /**
   * Give credits back on a sum meter (e.g. a generation the user rejected):
   * ingests a compensating negative-value event, then optimistically
   * re-credits the cache. Count meters cannot be compensated — their events
   * only count up.
   */
  const refundCredits: Billing['refundCredits'] = async (ctx, event) => {
    // A negative refund would ingest a positive event: a charge, not a refund.
    const value = requireCreditAmount(event.value, 'refundCredits: `value`')
    const entityId = event.userId ?? await callerEntityId(ctx, 'refundCredits')
    const meter = resolveMeter({ meter: event.meter })
    if (!meter?.property) {
      throw new Error(
        `[nuxt-backend] refundCredits: meter '${event.meter}' has no \`property\` (count meter) — only sum meters can be refunded.`,
      )
    }
    if (!await provider.getCustomerByUserId(ctx as unknown as ProviderCtx, entityId)) {
      throw backendError('not_ready', { reason: 'no_customer' }, `[nuxt-backend] No billing customer for ${entityId}.`)
    }
    const result = await eventsIngest(provider.polar, {
      events: [{
        name: meter.eventName ?? meter.key ?? event.meter,
        externalCustomerId: entityId,
        metadata: { ...event.metadata, [meter.property]: -value },
        externalId: event.externalId ?? crypto.randomUUID(),
      }],
    })
    unwrapProvider(result, 'usage refund')
    await ctx.runMutation(cache.credit, { userId: entityId, meterId: meter.meterId, amount: value })
  }

  return { reserveCredits, settleSpend, releaseSpend, spendCredits, refundCredits }
}
