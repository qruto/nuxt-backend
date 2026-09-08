/**
 * The rails for selling metered AI features — `nuxt-backend/ai`: wrap any
 * Convex action so it is rate-limited, prepaid-credit-metered (reserve → run →
 * settle — a failed run consumes nothing), and optionally token-streamed to
 * the browser with the text persisted server-side (reload mid-stream and it
 * continues).
 *
 * Composes the billing spend reservation (`setupBilling`), the rate limiter,
 * and the upstream persistent-text-streaming component — usage recording IS
 * the provider event, so per-customer usage shows up in the provider's own
 * portal and dashboard with no extra tables here.
 *
 * Experimental: the metering model (reserve/settle over provider meter
 * events) is the newest part of the package and may change shape in a minor
 * release; `useAiStream` on the Vue side is experimental with it.
 *
 * @module
 * @experimental
 */
import { actionGeneric, httpActionGeneric, queryGeneric, type Auth, type FunctionReference, type GenericActionCtx, type GenericDataModel } from 'convex/server'
import { v, type GenericId, type ObjectType, type PropertyValidators } from 'convex/values'
import { PersistentTextStreaming, type StreamId } from '@convex-dev/persistent-text-streaming'
import type { RateLimitConfig } from '@convex-dev/rate-limiter'
import type { Billing, SpendReservation } from './billing.js'

type RunCtx = Parameters<Billing['reserveCredits']>[0]

/** An action context that can also schedule (both metered shapes run in actions). */
type ActionRunCtx = RunCtx & GenericActionCtx<GenericDataModel>

/**
 * How long an abandoned stream may hold its reservation before the scheduled
 * auto-release hands the credits back. Deliberately under the component's
 * 10-minute `PENDING_SPEND_TTL_MS`: past the TTL the reservation is pruned
 * without re-crediting (only a provider sync restores it), so the release has
 * to land while the entry is still live.
 */
const DEFAULT_STREAM_TIMEOUT_MS = 5 * 60 * 1000

/**
 * The rate limiter shape `setupAi` consumes — satisfied by a
 * `setupRateLimiter(...)` instance, which seeds the `ai` and `aiBudget` limits
 * by default. Typed against the literal default names (the limiter's
 * conditional rest-tuple signature only resolves for known names — the same
 * pattern as `BillingRateLimiter`); custom `limit:` names pass through a cast
 * at the call site.
 */
export interface AiRateLimiter {
  limit: (
    ctx: RunCtx,
    name: 'ai' | 'aiBudget',
    options?: { key?: string, throws?: boolean, count?: number, config?: RateLimitConfig },
  ) => Promise<{ ok: boolean, retryAfter?: number }>
}

/** The component handles `setupAi` reads from your generated `components` object. */
export interface AiComponents {
  backend: {
    ai: {
      createRequest: FunctionReference<'mutation', 'internal', {
        streamId: string
        name: string
        entityId: string
        userId: string
        args: string
        meterId?: string
        cost: number
        externalId: string
      }, null>
      getByStream: FunctionReference<'query', 'internal', { streamId: string }, {
        streamId: string
        name: string
        entityId: string
        userId: string
        args: string
        meterId?: string
        cost: number
        externalId: string
        status: 'reserved' | 'settled' | 'released'
        createdAt: number
      } | null>
      markSettled: FunctionReference<'mutation', 'internal', { streamId: string }, null>
      markReleased: FunctionReference<'mutation', 'internal', { streamId: string }, null>
    }
    /**
     * The entitlement cache's reservation protocol. `setupAi` closes its own
     * spends here rather than through `settleSpend`: only `finalize` can drop
     * a reservation *and* hand back the unspent remainder atomically, and it
     * reports the balance the low-balance hooks read.
     */
    billing: {
      finalize: FunctionReference<'mutation', 'internal', {
        userId: string
        externalId: string
        finalAmount?: number
      }, {
        settled: boolean
        released: number
        balance: number
        balanceBefore: number
        releaseJobId?: string
      }>
      release: FunctionReference<'mutation', 'internal', { userId: string, externalId: string }, null>
      attachReleaseJob: FunctionReference<'mutation', 'internal', {
        userId: string
        externalId: string
        jobId: string
      }, null>
    }
  }
  persistentTextStreaming: ConstructorParameters<typeof PersistentTextStreaming>[0]
}

/**
 * A per-entity spending cap, enforced through the rate limiter as a fixed
 * window over spend *value*: each metered call consumes its cost in tokens, so
 * `{ units: 500, period: DAY }` is "500 credits a day per workspace", not "500
 * calls a day".
 *
 * A cap, not a ledger — the window is the limiter's own state, there is no new
 * table, and (like every rate limit) consumption is never given back: a run
 * that fails, or finalizes under its estimate, still spent the estimate
 * against the window. Size the budget with that slack in mind.
 */
export interface AiBudget {
  /** Credits an entity may spend per window. */
  units: number
  /** Window length in ms — `HOUR` / `DAY` from `nuxt-backend/rate-limit`. */
  period: number
  /**
   * The named limit the window is recorded under. Default `'aiBudget'` (see
   * `DEFAULT_LIMITS`); name your own to keep separate budgets per feature.
   */
  limit?: string
}

/** What crossed a balance threshold, handed to the low-balance hooks. */
export interface CreditsBalanceEvent {
  /** The billing entity (workspace/user) charged. */
  entityId: string
  /** The member whose call spent the credits. */
  userId: string
  /** The configured meter name, when the spend named one. */
  meter?: string
  /** The provider meter id. */
  meterId?: string
  /** Balance after the spend settled (negative when overage is allowed). */
  balance: number
  /** Balance as of before the spend reserved. */
  previousBalance: number
  /** Credits this spend actually consumed. */
  spent: number
  /** The configured threshold, for `onCreditsLow`. */
  threshold?: number
}

/**
 * Credit-side reactions to a settled spend.
 *
 * The threshold lives here — on `setupAi` — rather than in
 * `appConfig.backend.*`: that is the client-side content layer (labels, plan
 * copy), and these hooks fire inside a Convex action where no Nuxt app config
 * exists. Keep them thin: send nothing from here (the lifecycle emails own
 * that), just record or hand off.
 */
export interface AiCreditsConfig {
  /**
   * Fire {@link onCreditsLow} when a settle takes the balance from above this
   * to at or below it. Omit to never fire it.
   */
  lowBalanceThreshold?: number
  /**
   * The balance just crossed {@link lowBalanceThreshold} downwards. Fires on
   * the crossing only — a second spend that stays below it is silent, so this
   * is safe to wire straight to a notification.
   */
  onCreditsLow?: (ctx: GenericActionCtx<GenericDataModel>, event: CreditsBalanceEvent) => void | Promise<void>
  /** The balance just went from positive to zero-or-below. Same crossing rule. */
  onCreditsExhausted?: (ctx: GenericActionCtx<GenericDataModel>, event: CreditsBalanceEvent) => void | Promise<void>
}

export interface SetupAiConfig {
  /** The `setupBilling(...)` instance — supplies entity resolution + the credit spend. */
  billing: Billing
  /**
   * Your `setupRateLimiter(...)` instance. Metered actions/streams check
   * their named limit (default `'ai'`) per billing entity before reserving.
   * Omit to leave them unthrottled.
   */
  rateLimiter?: AiRateLimiter
  /** CORS origin for the stream endpoint. Defaults to the `SITE_URL` env var. */
  cors?: { origin?: string }
  /**
   * A per-entity credit budget on top of the call-rate limit. Requires
   * `rateLimiter` (it is enforced through it).
   */
  budget?: AiBudget
  /** Low-balance reactions fired after a spend settles. */
  credits?: AiCreditsConfig
  /**
   * How long a started stream may hold its reservation before it is released
   * automatically (ms). Default 5 minutes; `false` disables the timer.
   */
  streamTimeout?: number | false
}

/** Usage details handed to metered handlers (`ctx.usage`). */
export interface MeteredUsage {
  /** The billing entity (workspace/user) charged. */
  entityId: string
  /** The signed-in caller. */
  userId: string
  /** Configured meter name, when metered. */
  meter?: string
  /** Credits this call costs — the estimate, for a finalized cost. */
  cost: number
}

/**
 * A cost that is only known once the work is done: reserve `estimate`, run,
 * then settle what `finalize` returns and hand the remainder back.
 *
 * The estimate is the *ceiling* — a final amount above it is clamped down (the
 * reservation is what made the spend safe against a concurrent one, so
 * settling beyond it would be a second, unguarded debit). Estimate high.
 *
 * Requires a sum meter (one with a `property`): the finalized amount rides in
 * the ingested event's metadata, and a count meter can only ever count 1 per
 * event.
 *
 * @example
 * ```ts
 * cost: {
 *   estimate: 500,
 *   finalize: result => priceTokens({ model: result.model, ...result.usage }, prices),
 * }
 * ```
 */
export interface FinalizedCost<Args extends PropertyValidators, Result> {
  /** Credits to reserve up front — a number or derived from the args. */
  estimate: number | ((args: ObjectType<Args>) => number)
  /** The credits actually consumed, from what the handler returned. */
  finalize: (result: Result, usage: MeteredUsage) => number
}

/** Credits per call: fixed, derived from the args, or estimated then finalized. */
export type MeteredCost<Args extends PropertyValidators, Result>
  = number
    | ((args: ObjectType<Args>) => number)
    | FinalizedCost<Args, Result>

export interface MeteredActionConfig<Args extends PropertyValidators, Result = unknown> {
  /**
   * The configured credit meter to charge (`setupBilling({ credits })` /
   * catalog key) — or `false` for a rate-limit-only action.
   */
  meter: string | false
  /** Credits per call. Default `1`. See {@link MeteredCost}. */
  cost?: MeteredCost<Args, Result>
  /**
   * Named rate limit (checked per billing entity via the configured
   * `rateLimiter`). Default `'ai'`; `false` disables the check.
   */
  limit?: string | false
  /**
   * Let this spend take the balance negative instead of refusing it — for a
   * pay-as-you-go meter with no credit benefit behind it, where every unit is
   * overage the provider invoices at the end of the cycle.
   */
  allowOverage?: boolean
  /**
   * When to charge: `'success'` (default) settles after the handler returns —
   * a failed run consumes nothing; `'start'` settles before running, for work
   * that is irrevocably consumed upstream the moment it starts. A finalized
   * cost needs the result, so it only applies to `'success'`.
   */
  charge?: 'success' | 'start'
  args: Args
  handler: (ctx: GenericActionCtx<GenericDataModel> & { usage: MeteredUsage }, args: ObjectType<Args>) => Promise<Result>
}

export interface MeteredStreamConfig<Args extends PropertyValidators, Result = unknown> {
  /** Registry key — unique per app; the HTTP dispatcher routes by it. */
  name: string
  /** The configured credit meter to charge, or `false` for limit-only. */
  meter: string | false
  /**
   * Credits per stream. Default `1`. A {@link FinalizedCost} prices what the
   * handler *returns* — return the model's token usage from it.
   */
  cost?: MeteredCost<Args, Result>
  /** Named rate limit. Default `'ai'`; `false` disables. */
  limit?: string | false
  /** Let this spend take the balance negative (pay-as-you-go meters). */
  allowOverage?: boolean
  args: Args
  /**
   * Produce the stream: `append(text)` pushes a chunk to the client AND
   * persists it. Credits settle when the handler finishes; an error or
   * disconnect releases them — an interrupted stream never charges.
   */
  handler: (
    ctx: GenericActionCtx<GenericDataModel> & { usage: MeteredUsage },
    args: ObjectType<Args>,
    stream: { append: (text: string) => Promise<void> },
  ) => Promise<Result>
}

export interface Ai {
  /**
   * A drop-in replacement for `action` that rate-limits, reserves prepaid
   * credits, runs your handler, then settles the spend (usage lands in the
   * billing provider as an ingested event). Failed runs release the
   * reservation — nothing charged.
   *
   * @example
   * ```ts
   * export const generate = ai.meteredAction({
   *   meter: 'credits',
   *   cost: args => args.long ? 5 : 1,
   *   args: { prompt: v.string(), long: v.optional(v.boolean()) },
   *   handler: async (ctx, { prompt }) => runModel(prompt),
   * })
   * ```
   *
   * @example Token pricing — reserve an estimate, settle the actual usage
   * ```ts
   * export const generate = ai.meteredAction({
   *   meter: 'credits',
   *   cost: {
   *     estimate: 200,
   *     finalize: result => priceTokens(result.usage, prices),
   *   },
   *   args: { prompt: v.string() },
   *   handler: async (ctx, { prompt }) => runModel(prompt),
   * })
   * ```
   */
  meteredAction: <Args extends PropertyValidators, Result>(config: MeteredActionConfig<Args, Result>) => ReturnType<typeof actionGeneric>
  /**
   * A metered, persisted token stream. Returns `{ start, body }` to re-export
   * from your module — `useAiStream` drives them: `start` reserves credits and
   * creates the stream, the HTTP endpoint (`registerBackendRoutes({ ai })`)
   * runs your handler and streams chunks, `body` serves the persisted text
   * reactively (reload mid-stream and it continues).
   *
   * A started stream that is never delivered (the browser closed before the
   * HTTP call, or it died mid-flight) holds its reservation until the
   * scheduled auto-release hands the credits back — `streamTimeout`.
   */
  stream: <Args extends PropertyValidators, Result>(config: MeteredStreamConfig<Args, Result>) => {
    start: ReturnType<typeof actionGeneric>
    body: ReturnType<typeof queryGeneric>
  }
  /** The stream endpoint for `registerBackendRoutes({ ai })` (POST + CORS preflight). */
  httpHandler: ReturnType<typeof httpActionGeneric>
  /** CORS headers for the stream route (used by `registerBackendRoutes`). */
  corsOrigin: string
}

/**
 * Credits to reserve before running: a fixed number, one derived from the
 * args, or a {@link FinalizedCost}'s estimate. Defaults to 1.
 *
 * Typed loosely on purpose — the caller holds the precise `Args`/`Result`
 * generics, and threading them through here only fights variance (the same
 * reason the registered handlers cast).
 */
function estimateCost(cost: unknown, args: Record<string, unknown>): number {
  if (cost === undefined || cost === null) return 1
  if (typeof cost === 'number') return cost
  if (typeof cost === 'function') return (cost as (args: unknown) => number)(args)
  const { estimate } = cost as FinalizedCost<PropertyValidators, unknown>
  return typeof estimate === 'function' ? (estimate as (args: unknown) => number)(args) : estimate
}

/**
 * Credits actually spent, once the work is done — `undefined` when the cost
 * was fixed up front and the reservation settles as-is.
 */
function finalizeCost(cost: unknown, result: unknown, usage: MeteredUsage): number | undefined {
  if (typeof cost !== 'object' || cost === null || !('finalize' in cost)) return undefined
  return (cost as FinalizedCost<PropertyValidators, unknown>).finalize(result, usage)
}

/** What one model charges, in credits per {@link ModelPrice.per} tokens. */
export interface ModelPrice {
  /** Credits per block of input (prompt) tokens. */
  input: number
  /** Credits per block of output (completion) tokens. */
  output: number
  /**
   * Credits per block of cache-read input tokens, when the model prices them
   * separately. Omit and cached tokens are billed as ordinary input.
   */
  cachedInput?: number
  /** Tokens each rate covers. Default 1; use `1_000_000` for per-million rates. */
  per?: number
}

/** The app's price list: model id → {@link ModelPrice}. */
export type TokenPriceTable = Record<string, ModelPrice>

/** A model call's token counts, as the SDKs report them. */
export interface TokenUsage {
  /** The model id — the key looked up in the price table. */
  model: string
  /** Input (prompt) tokens billed at the full rate. */
  input: number
  /** Output (completion) tokens. */
  output: number
  /** Cache-read input tokens, when the model reports them separately. */
  cachedInput?: number
}

/**
 * Price a model call in credits from its token usage and a price table the app
 * owns. No provider knows what a model costs you — rates change weekly and
 * only your margin decides the credit price — so the table is yours; this is
 * the arithmetic, pure and testable.
 *
 * Rates are credits per `per` tokens (default 1). Express per-million pricing
 * as `per: 1_000_000` on the entry or as a table-wide `options.per`.
 *
 * @example
 * ```ts
 * const prices = {
 *   'fast-1': { input: 3, output: 15, per: 1_000_000 },
 *   'deep-1': { input: 15, output: 75, cachedInput: 1.5, per: 1_000_000 },
 * }
 * priceTokens({ model: 'fast-1', input: 12_000, output: 800 }, prices) // → 0.048
 * ```
 *
 * @throws when the model is missing from the table — a silent 0 would be a
 * revenue leak, and an unpriced model is a deployment mistake worth surfacing.
 */
export function priceTokens(
  usage: TokenUsage,
  table: TokenPriceTable,
  options: { per?: number, round?: 'up' | 'nearest' | 'none', minimum?: number } = {},
): number {
  const price = table[usage.model]
  if (!price) {
    throw new Error(`[nuxt-backend] priceTokens: no price for model '${usage.model}' — add it to the table.`)
  }
  const per = price.per ?? options.per ?? 1
  if (!(per > 0)) {
    throw new Error(`[nuxt-backend] priceTokens: 'per' must be a positive number of tokens (got ${per}).`)
  }
  // Cached input is priced separately when the entry says so; otherwise those
  // tokens are ordinary input (the model just billed them cheaper upstream).
  const cached = usage.cachedInput ?? 0
  const input = price.cachedInput === undefined ? usage.input + cached : usage.input
  const cost = (input * price.input
    + (usage.output ?? 0) * price.output
    + cached * (price.cachedInput ?? 0)) / per
  const rounded = options.round === 'up'
    ? Math.ceil(cost)
    : options.round === 'nearest' ? Math.round(cost) : cost
  return Math.max(rounded, options.minimum ?? 0)
}

/**
 * Configure the AI rails over billing + rate limiting + streaming.
 *
 * @example
 * ```ts
 * // backend/ai.ts
 * import { setupAi } from 'nuxt-backend/ai'
 * import { components } from './_generated/api'
 * import { billing } from './billing'
 * import { rateLimiter } from './rateLimiter'
 *
 * export const ai = setupAi(components, { billing, rateLimiter })
 * export const generate = ai.meteredAction({ ... })
 * export const { start: startEcho, body: echoBody } = ai.stream({ name: 'echo', ... })
 * ```
 */
export function setupAi(components: AiComponents, config: SetupAiConfig): Ai {
  const { billing, rateLimiter } = config
  const pts = new PersistentTextStreaming(components.persistentTextStreaming)
  const requests = components.backend.ai
  const cache = components.backend.billing
  const corsOrigin = config.cors?.origin
    ?? (typeof process !== 'undefined' ? process.env.SITE_URL : undefined)
    ?? '*'
  const streamTimeout = config.streamTimeout ?? DEFAULT_STREAM_TIMEOUT_MS

  const streamRegistry = new Map<string, MeteredStreamConfig<PropertyValidators, unknown>>()

  if (config.budget && !rateLimiter) {
    throw new Error('[nuxt-backend] setupAi({ budget }) needs a `rateLimiter` — the budget is a fixed window on it, not a table of its own.')
  }

  /** Entity + caller + rate limit + budget + reservation — shared by both shapes. */
  const prepare = async (
    ctx: RunCtx & { auth?: Auth },
    options: { meter: string | false, limit?: string | false, cost: number, allowOverage?: boolean },
  ): Promise<{ usage: MeteredUsage, reservation: SpendReservation }> => {
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
        console.error('[nuxt-backend] Credit balance hook failed (the spend still settled):', error)
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
   * before: a provider event that never landed must not consume credits.
   */
  const closeSpend = async (
    ctx: ActionRunCtx,
    usage: MeteredUsage,
    reservation: SpendReservation,
    options: { finalAmount?: number, metadata?: Record<string, string | number | boolean> } = {},
  ): Promise<void> => {
    let final = options.finalAmount ?? reservation.value
    if (final > reservation.value) {
      console.warn(
        `[nuxt-backend] Finalized cost ${final} exceeds the ${reservation.value} credits reserved — charging the reservation. Raise the estimate.`,
      )
      final = reservation.value
    }
    final = Math.max(0, final)
    try {
      await billing.settleSpend(ctx, { ...reservation, reserved: false, value: final }, {
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
      console.error(
        '[nuxt-backend] The spend was ingested but its reservation could not be closed — '
        + 'the balance re-syncs from the provider on the next refresh:',
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

  const stream: Ai['stream'] = (definition) => {
    if (streamRegistry.has(definition.name)) {
      throw new Error(`[nuxt-backend] Duplicate ai.stream name '${definition.name}'.`)
    }
    streamRegistry.set(definition.name, definition as unknown as MeteredStreamConfig<PropertyValidators, unknown>)

    const start = actionGeneric({
      args: definition.args,
      handler: (async (ctx: GenericActionCtx<GenericDataModel>, args: Record<string, unknown>) => {
        const cost = estimateCost(definition.cost, args)
        const { usage, reservation } = await prepare(ctx as never, {
          meter: definition.meter,
          limit: definition.limit,
          cost,
          allowOverage: definition.allowOverage,
        })
        const streamId = await pts.createStream(ctx as never)
        await ctx.runMutation(requests.createRequest, {
          streamId,
          name: definition.name,
          entityId: reservation.entityId,
          userId: usage.userId,
          args: JSON.stringify(args),
          meterId: reservation.meterId,
          cost,
          externalId: reservation.externalId,
        })
        // A stream that is started and never delivered (the browser closed
        // before the HTTP call, or died mid-flight) would otherwise hold its
        // credits until the TTL pruned the reservation — and a pruned
        // reservation is never re-credited, only re-synced. Schedule the
        // release now and cancel it when the stream settles.
        if (reservation.reserved && streamTimeout !== false) {
          try {
            const jobId = await ctx.scheduler.runAfter(streamTimeout, cache.release, {
              userId: reservation.entityId,
              externalId: reservation.externalId,
            })
            await ctx.runMutation(cache.attachReleaseJob, {
              userId: reservation.entityId,
              externalId: reservation.externalId,
              jobId,
            })
          }
          catch (error) {
            // The timer is an improvement on the reservation TTL, never a
            // precondition for streaming: a stream must not fail to start
            // because its safety net could not be armed.
            console.warn('[nuxt-backend] Could not schedule the stream reservation release — falling back to the pending-spend TTL:', error)
          }
        }
        return { streamId }
      }) as never,
    })

    const body = queryGeneric({
      args: { streamId: v.string() },
      handler: async (ctx, { streamId }) => {
        return pts.getStreamBody(ctx as never, streamId as StreamId)
      },
    })

    return { start, body }
  }

  const httpHandler = httpActionGeneric(async (ctx, request) => {
    const headers = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Vary': 'Origin',
    }
    let streamId: unknown
    try {
      streamId = ((await request.json()) as { streamId?: unknown }).streamId
    }
    catch {
      return new Response('Bad request', { status: 400, headers })
    }
    if (typeof streamId !== 'string') {
      return new Response('Bad request', { status: 400, headers })
    }
    // Possession of the unguessable stream id is the capability: it was
    // handed to this caller by the authenticated `start` action moments ago.
    const row = await ctx.runQuery(requests.getByStream, { streamId })
    if (!row || row.status !== 'reserved') {
      return new Response('Unknown or finished stream', { status: 404, headers })
    }
    const definition = streamRegistry.get(row.name)
    if (!definition) {
      return new Response('Unknown stream handler', { status: 404, headers })
    }

    const reservation: SpendReservation = {
      entityId: row.entityId,
      externalId: row.externalId,
      reserved: row.meterId !== undefined,
      meter: definition.meter === false ? undefined : definition.meter,
      meterId: row.meterId,
      value: row.cost,
    }
    const usage: MeteredUsage = {
      entityId: row.entityId,
      userId: row.userId,
      meter: definition.meter === false ? undefined : definition.meter,
      cost: row.cost,
    }

    let failed = false
    let result: unknown
    const response = await pts.stream(ctx, request, streamId as StreamId, async (streamCtx, _request, _id, append) => {
      try {
        result = await definition.handler(
          Object.assign(streamCtx, { usage }) as never,
          JSON.parse(row.args) as never,
          { append },
        )
      }
      catch (error) {
        failed = true
        throw error
      }
    })

    // Settle only a delivered stream; anything else releases — an interrupted
    // stream never charges (ingested provider events cannot be un-ingested,
    // so the charge happens strictly after success).
    if (failed) {
      await billing.releaseSpend(ctx as never, reservation)
      await ctx.runMutation(requests.markReleased, { streamId })
    }
    else {
      try {
        if (definition.meter !== false) {
          await closeSpend(ctx as never, usage, reservation, {
            finalAmount: finalizeCost(definition.cost, result, usage),
          })
        }
        await ctx.runMutation(requests.markSettled, { streamId })
      }
      catch (error) {
        // `closeSpend` only throws when the provider event never landed, and
        // it releases the reservation itself before rethrowing — so the stream
        // genuinely consumed nothing and `markReleased` is the truth.
        console.error('[nuxt-backend] Stream delivered but the spend never ingested — the reservation was released:', error)
        await ctx.runMutation(requests.markReleased, { streamId })
      }
    }

    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)
    return response
  })

  return { meteredAction, stream, httpHandler, corsOrigin }
}
