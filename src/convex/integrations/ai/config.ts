import type { actionGeneric, FunctionReference, GenericActionCtx, GenericDataModel, httpActionGeneric, queryGeneric } from 'convex/server'
import type { ObjectType, PropertyValidators } from 'convex/values'
import type { PersistentTextStreaming } from '@convex-dev/persistent-text-streaming'
import type { RateLimitConfig } from '@convex-dev/rate-limiter'
import type { Billing } from '../billing.js'

// What `setupAi` is configured with and what it hands back: every public type
// of `nuxt-backend/ai` except the token-pricing ones (pricing.ts). Named to
// sort before pricing.ts — the API reference lists symbols by declaring file.

export type RunCtx = Parameters<Billing['reserveCredits']>[0]

/**
 * The rate limiter shape `setupAi` consumes — satisfied by a
 * `setupRateLimiter(...)` instance, which seeds the `ai` and `aiBudget` limits
 * by default. Typed against the literal default names (the limiter's
 * conditional rest-tuple signature only resolves for known names — the same
 * pattern as `BillingRateLimiter`); custom `limit:` names pass through a cast
 * at the call site.
 */
export interface AiRateLimiter {
  // A method signature, not a function-typed property: methods are compared
  // bivariantly, so a limiter whose `ctx` is upstream's own union of
  // mutation and action contexts still assigns to this shape.
  limit(
    ctx: RunCtx,
    name: 'ai' | 'aiBudget',
    options?: { key?: string, throws?: boolean, count?: number, config?: RateLimitConfig },
  ): Promise<{ ok: boolean, retryAfter?: number }>
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
