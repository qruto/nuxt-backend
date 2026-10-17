import { actionGeneric, type Auth, type GenericActionCtx, type GenericDataModel } from 'convex/server'
import type { GenericId } from 'convex/values'
import type { SpendReservation } from '../billing.js'
import { requireCreditAmount } from '../billing/credits.js'
import type { Ai, CreditsBalanceEvent, MeteredUsage, RunCtx } from './config.js'
import type { AiContext } from './context.js'
import { estimateCost, finalizeCost } from './pricing.js'
import { logBackend } from '../../log.js'

/** An action context that can also schedule (both metered shapes run in actions). */
type ActionRunCtx = RunCtx & GenericActionCtx<GenericDataModel>

/**
 * Refuse a metered call whose cost is not a finite number above zero, before
 * anything is spent on it: a negative cost would hand tokens back to the
 * budget window and credit the balance, a `NaN` would pass every comparison.
 * An unmetered call's cost moves nothing, so it is left alone.
 */
function requireMeteredCost({ meter, cost }: { meter: string | false, cost: number }): void {
  if (meter !== false) requireCreditAmount(cost, 'setupAi: a metered call\'s `cost`')
}

/**
 * The amount a finished call settles at: its finalized cost, held to the
 * reservation. Above the estimate it is clamped down — settling beyond the
 * reservation would be a second, unguarded debit. A cost that is no amount
 * at all (`NaN`, an infinity, a negative from a buggy `finalize`) is refused
 * the same way: the work is done and its result belongs to the caller, so the
 * reservation is charged and the bug logged, never passed on to the balance.
 */
function settledAmount(reserved: number, finalAmount: number | undefined): number {
  if (finalAmount === undefined) return reserved
  if (!Number.isFinite(finalAmount) || finalAmount < 0) {
    logBackend('error', 'ai.cost_over_reservation', `Finalized cost ${finalAmount} is not an amount of zero or more — charging the ${reserved} credits reserved. Fix the cost's finalize.`)
    return reserved
  }
  if (finalAmount > reserved) {
    logBackend('warn', 'ai.cost_over_reservation', `Finalized cost ${finalAmount} exceeds the ${reserved} credits reserved — charging the reservation. Raise the estimate.`)
    return reserved
  }
  return finalAmount
}

/**
 * Metered calls over the billing spend reservation: reserve before running,
 * settle what was spent (or release on failure) after, and fire the balance
 * hooks once a settle lands.
 */
export function createMetering({ config, billing, rateLimiter, cache }: AiContext) {
  /** Entity + caller + rate limit + budget + reservation — shared by both shapes. */
  const prepare = async (
    ctx: RunCtx & { auth?: Auth },
    options: { meter: string | false, limit?: string | false, cost: number, allowOverage?: boolean },
  ): Promise<{ usage: MeteredUsage, reservation: SpendReservation }> => {
    requireMeteredCost(options)
    const identity = await (ctx.auth?.getUserIdentity() ?? Promise.resolve(null))
    if (!identity) {
      throw new Error('[nuxt-backend] Sign in to use this feature.')
    }
    const entity = await billing.resolveEntity(ctx)
    if (!entity) {
      throw new Error('[nuxt-backend] No billing entity — sign in (a personal workspace is created automatically).')
    }

    const limitName = options.limit ?? 'ai'
    if (rateLimiter && limitName !== false) {
      const { ok, retryAfter } = await rateLimiter.limit(ctx as never, limitName as never, { key: entity.userId })
      if (!ok) {
        const wait = retryAfter ? ` Try again in ${Math.ceil(retryAfter / 1000)}s.` : ''
        throw new Error(`[nuxt-backend] Rate limit reached.${wait}`)
      }
    }

    // The budget is the same limiter, counting credits instead of calls: one
    // fixed window per billing entity, consuming `cost` tokens a spend.
    const budget = config.budget
    if (rateLimiter && budget && options.meter !== false) {
      if (options.cost > budget.units) {
        throw new Error(
          `[nuxt-backend] This call costs ${options.cost} credits but the budget is ${budget.units} per window — it can never fit.`,
        )
      }
      const { ok, retryAfter } = await rateLimiter.limit(ctx as never, (budget.limit ?? 'aiBudget') as never, {
        key: entity.userId,
        count: options.cost,
        config: { kind: 'fixed window', rate: budget.units, period: budget.period },
      })
      if (!ok) {
        const wait = retryAfter ? ` Resets in ${Math.ceil(retryAfter / 1000)}s.` : ''
        throw new Error(`[nuxt-backend] Credit budget reached — ${budget.units} credits per window.${wait}`)
      }
    }

    const reservation = options.meter === false
      ? { entityId: entity.userId, externalId: crypto.randomUUID(), reserved: false, value: options.cost } satisfies SpendReservation
      : await billing.reserveCredits(ctx, {
          meter: options.meter,
          value: options.cost,
          // Pay-as-you-go: a meter with no credit benefit behind it has nothing
          // prepaid to draw down, so the balance is allowed below zero and the
          // provider invoices the overage.
          allowOverage: options.allowOverage,
        })

    return {
      usage: {
        entityId: entity.userId,
        userId: identity.subject,
        meter: options.meter === false ? undefined : options.meter,
        cost: options.cost,
      },
      reservation,
    }
  }

  /**
   * Fire the balance hooks on the *crossing*, not the level: `balanceBefore`
   * is what the balance would be without this spend, so a threshold fires
   * exactly once — the next spend starts below the line and stays quiet until
   * a top-up lifts it back over. A hook that throws must not fail a spend the
   * provider has already recorded.
   *
   * The one exception is a burst of *concurrent* spends: each computes its own
   * counterfactual, so two settling across the line together can both report
   * the crossing. Dedupe on the receiving side if that matters — this is a
   * notification signal, not a ledger entry.
   */
  const fireBalanceHooks = async (
    ctx: GenericActionCtx<GenericDataModel>,
    usage: MeteredUsage,
    reservation: SpendReservation,
    outcome: { balance: number, balanceBefore: number },
  ): Promise<void> => {
    const hooks = config.credits
    if (!hooks) return
    const threshold = hooks.lowBalanceThreshold
    const event: CreditsBalanceEvent = {
      entityId: reservation.entityId,
      userId: usage.userId,
      meter: reservation.meter,
      meterId: reservation.meterId,
      balance: outcome.balance,
      previousBalance: outcome.balanceBefore,
      spent: outcome.balanceBefore - outcome.balance,
      threshold,
    }
    const crossedLow = threshold !== undefined && outcome.balanceBefore > threshold && outcome.balance <= threshold
    const crossedZero = outcome.balanceBefore > 0 && outcome.balance <= 0
    for (const hook of [
      crossedLow ? hooks.onCreditsLow : undefined,
      crossedZero ? hooks.onCreditsExhausted : undefined,
    ]) {
      if (!hook) continue
      try {
        await hook(ctx, event)
      }
      catch (error) {
        logBackend('error', 'ai.balance_hook_failed', 'Credit balance hook failed (the spend still settled).', error)
      }
    }
  }

  /**
   * Ingest the provider event and close the reservation at the amount actually
   * spent, handing back whatever the estimate over-reserved.
   *
   * The ingest runs with `reserved: false` so the billing layer does not close
   * the reservation itself: the cache side is one atomic `finalize` — drop the
   * entry, re-credit the remainder, report the balance and the auto-release
   * job to cancel. An ingest that fails releases the whole reservation, as
   * before: a provider event that never landed must not consume credits. A
   * final amount of zero ingests nothing and hands the whole reservation back.
   */
  const closeSpend = async (
    ctx: ActionRunCtx,
    usage: MeteredUsage,
    reservation: SpendReservation,
    options: { finalAmount?: number, metadata?: Record<string, string | number | boolean> } = {},
  ): Promise<void> => {
    const final = settledAmount(reservation.value, options.finalAmount)
    try {
      // The reservation travels as reserved; the amount spent goes as
      // `finalAmount`, which the billing layer checks against it.
      await billing.settleSpend(ctx, { ...reservation, reserved: false }, {
        finalAmount: final,
        // Member attribution: the acting user rides on every event, so
        // provider-side usage can be grouped per member of a workspace.
        metadata: { ...options.metadata, userId: usage.userId },
      })
    }
    catch (error) {
      await billing.releaseSpend(ctx, reservation)
      throw error
    }
    if (!reservation.reserved) return
    // Past this line the provider has the event and will invoice it: the spend
    // is charged whatever happens next. So the cache bookkeeping below must
    // never throw past the ingest — a caller that caught it would "release" a
    // spend the provider has already taken, handing back credits for free.
    // Failing here instead leaves the reservation to expire on its TTL, which
    // costs the entity nothing it did not spend and self-heals on the next
    // sync — the safe direction to be wrong in.
    try {
      const outcome = await ctx.runMutation(cache.finalize, {
        userId: reservation.entityId,
        externalId: reservation.externalId,
        finalAmount: final,
      })
      // The stream's abandon timer has nothing left to release.
      if (outcome.releaseJobId) {
        await ctx.scheduler.cancel(outcome.releaseJobId as GenericId<'_scheduled_functions'>)
      }
      if (outcome.settled) await fireBalanceHooks(ctx, usage, reservation, outcome)
    }
    catch (error) {
      logBackend(
        'error',
        'ai.reservation_close_failed',
        'The spend was ingested but its reservation could not be closed — the balance re-syncs from the provider on the next refresh.',
        error,
      )
    }
  }

  const meteredAction: Ai['meteredAction'] = definition => actionGeneric({
    args: definition.args,
    // Loose internal typing: precise arg types live on MeteredActionConfig;
    // the open `Args` generic fights Convex's conditional args-array types.
    handler: (async (ctx: GenericActionCtx<GenericDataModel>, args: Record<string, unknown>) => {
      const cost = estimateCost(definition.cost, args)
      const { usage, reservation } = await prepare(ctx as never, {
        meter: definition.meter,
        limit: definition.limit,
        cost,
        allowOverage: definition.allowOverage,
      })
      const metered = definition.meter !== false

      if (definition.charge === 'start') {
        // Irrevocable upstream work: charge first, no refund on failure.
        if (metered) await closeSpend(ctx as never, usage, reservation, { metadata: { charge: 'start' } })
        return definition.handler(Object.assign(ctx, { usage }) as never, args as never)
      }

      let result: unknown
      try {
        result = await definition.handler(Object.assign(ctx, { usage }) as never, args as never)
      }
      catch (error) {
        if (metered) await billing.releaseSpend(ctx as never, reservation)
        throw error
      }
      if (metered) {
        await closeSpend(ctx as never, usage, reservation, { finalAmount: finalizeCost(definition.cost, result, usage) })
      }
      return result
    }) as never,
  })

  return { prepare, closeSpend, meteredAction }
}

export type AiMetering = ReturnType<typeof createMetering>
