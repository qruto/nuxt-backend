import type { actionGeneric, FunctionReference, GenericActionCtx, GenericDataModel, httpActionGeneric, queryGeneric, RegisteredQuery } from 'convex/server'
import type { ObjectType, PropertyValidators } from 'convex/values'
import type { PersistentTextStreaming } from '@convex-dev/persistent-text-streaming'
import type { RateLimitConfig } from '@convex-dev/rate-limiter'
import type { LanguageModel } from 'ai'
import type { Billing } from '../billing.js'
import type { BillingComponents } from '../billing/types/setup.js'
import type { Chat, ChatConfig } from './chat.js'
import type { Knowledge, KnowledgeConfig } from './knowledge.js'
import type { TokenPriceTable } from './pricing.js'
import type { ModerationConfig, ModerationCtx, ModerationInput, ModerationVerdict } from './moderation.js'
import type { ImageStoreContext, JobProvenance, ProvenanceConfig } from './provenance.js'

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
    name: 'ai' | 'aiBudget' | 'aiGlobal',
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
        status: 'reserved' | 'streaming' | 'settled' | 'released'
        createdAt: number
      } | null>
      claimRequest: FunctionReference<'mutation', 'internal', { streamId: string }, boolean>
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
      finalize: BillingComponents['backend']['billing']['finalize']
      /** Take a spend the provider has from the balance again, once its reservation lapsed. */
      debit: BillingComponents['backend']['billing']['debit']
      settle: BillingComponents['backend']['billing']['settle']
      release: FunctionReference<'mutation', 'internal', { userId: string, externalId: string }, null>
      attachReleaseJob: FunctionReference<'mutation', 'internal', {
        userId: string
        externalId: string
        jobId: string
      }, null>
    }
    /** What AI cost per person per day: each run's usage goes in, the Costs tab's summary comes out. */
    costs: {
      record: FunctionReference<'mutation', 'internal', {
        userId?: string
        owner: string
        usage: { usd?: number, input: number, output: number, cached: number }
        spendLimitUsd?: number
      }, null>
      summary: FunctionReference<'query', 'internal', { since: number }, AiCosts>
    }
    /** The auth tables, where `getCosts` reads whether its caller is an administrator now. */
    adapter: { findOne: FunctionReference<'query', 'internal'> }
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

/**
 * A ceiling on what AI costs the whole app in one UTC day, in US dollars, as
 * the gateway reports each call's cost. Once the day's spend reaches it, the
 * `pause_ai` kill switch turns on: every metered call, stream, job, chat
 * reply and safety check is refused (`unavailable`, reason `ai_paused`) until the next UTC
 * day begins, when the pause lifts by itself. An override of `pause_ai` an
 * administrator set (a pause, a targeted one, or a resume) is never written
 * over, and the lift leaves it. The `ai.spend_limit_reached`
 * event and the `ai_spend_limit` alert record it. A call already running
 * finishes, so the day can end a little over.
 */
export interface AiSpendLimit {
  /** The most the whole app may spend on model calls in a UTC day, in US dollars: above 0. */
  usdPerDay: number
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
   *
   * @guarantee
   * - Runs: in the action that settled the spend
   * - Delivery: once per crossing of the threshold downwards; a spend that stays below it is silent
   * - Order: after the spend settles
   * - When it throws: logged as `ai.balance_hook_failed` and swallowed; the spend stays settled
   * - Idempotency: none needed: safe to wire straight to a notification
   */
  onCreditsLow?: (ctx: GenericActionCtx<GenericDataModel>, event: CreditsBalanceEvent) => void | Promise<void>
  /**
   * The balance just went from positive to zero-or-below. Same crossing rule.
   *
   * @guarantee
   * - Runs: in the action that settled the spend
   * - Delivery: once per crossing from a positive balance to zero or below
   * - Order: after the spend settles
   * - When it throws: logged as `ai.balance_hook_failed` and swallowed; the spend stays settled
   * - Idempotency: none needed: safe to wire straight to a notification
   */
  onCreditsExhausted?: (ctx: GenericActionCtx<GenericDataModel>, event: CreditsBalanceEvent) => void | Promise<void>
}

/**
 * A model to call: a `provider/model` id (`'openai/gpt-5-mini'`), or a model
 * object from any AI SDK provider package, called with that provider's own
 * key. The AI SDK (`ai`) is an optional peer: install it to name one.
 *
 * An id goes to the Convex AI Gateway first, on Convex Cloud with a paid plan
 * (install `@convex-dev/ai-sdk-provider`, an optional peer too), then
 * through the Vercel AI Gateway with the deployment's `AI_GATEWAY_API_KEY`.
 * Without either, the call is refused, saying why: no model answers in their
 * place.
 */
export type AiModel = LanguageModel

/**
 * The model a metered handler calls (`ctx.model()`): an AI SDK language
 * model, so `generateText`, `streamText` and the rest of the SDK take it
 * as they take any other. Every call made through it counts toward the run's
 * cost.
 */
export type MeteredModel = Extract<LanguageModel, { specificationVersion: 'v4' }>

/**
 * Where calls to a model go on this deployment, as `ai.modelStatus()`
 * reports it: the state its app layer reads.
 */
export interface ModelStatus {
  /** The model's id (`openai/gpt-5-mini`, or a model object's own); `null` when none is configured. */
  model: string | null
  /**
   * - `live`: calls reach the model: through the Convex AI Gateway on
   *   Convex Cloud (a free plan refuses it when called, unless
   *   `AI_GATEWAY_API_KEY` is set to fall back on), through the Vercel AI
   *   Gateway with `AI_GATEWAY_API_KEY`, or with a model object's own
   *   provider key;
   * - `missing`: the key is not set on a deployment the Convex AI Gateway
   *   cannot serve, or no model is configured: calls are refused
   *   `unavailable` (reason `not_configured`).
   */
  state: 'live' | 'missing'
  /**
   * Where calls go first: `convex-gateway` (the Convex AI Gateway, where the
   * deployment can have it; the next route answers when it refuses),
   * `vercel-gateway` (`AI_GATEWAY_API_KEY`), `provider` (a model object's
   * own key), or `null` when calls are refused.
   */
  route: 'convex-gateway' | 'vercel-gateway' | 'provider' | null
}

export interface SetupAiConfig {
  /** The `setupBilling(...)` instance — supplies entity resolution + the credit spend. */
  billing: Billing
  /**
   * The model `ctx.model()` calls when an action names none: a
   * `provider/model` id or a model object. See {@link AiModel}.
   */
  model?: AiModel
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
  /** What happens to a visitor's guest jobs (`defineJobQueue({ guest })`) once they sign up. See {@link AiGuestConfig}. */
  guest?: AiGuestConfig
  /**
   * Pin every model call to providers' endpoints in one region. `'eu'`
   * sends every `provider/model` id through the Vercel AI Gateway with
   * `AI_GATEWAY_API_KEY` (the Convex AI Gateway documents no inference
   * region, so it is never tried), and adds the gateway's
   * `providerOptions.gateway.inferenceRegion: { scope: 'zone', geoRegion: 'eu' }`
   * to every call through `ctx.model()`. A model no provider serves in the
   * region is refused by the gateway, and the run's reservation released. A
   * call that reports running elsewhere logs `ai.region_mismatch`.
   *
   * The pin covers inference only: the deployment's data stays in its
   * Convex region.
   */
  inferenceRegion?: InferenceRegion
  /**
   * Content credentials on what a model made (EU AI Act Art. 50): every
   * image stored through `ctx.storeImage` gets a C2PA manifest signed with
   * `PROVENANCE_PRIVATE_KEY` and the IPTC `trainedAlgorithmicMedia` digital
   * source type, and a provenance record of the models, the time and its
   * inputs' ids; job results carry `provenance`. `true` for the defaults,
   * `{ name }` for the generator name each manifest shows.
   */
  provenance?: ProvenanceConfig
  /**
   * The safety classifier `ai.moderate`, `ai.requireSafe` and every
   * `moderate` option check content with: a model call through the
   * gateway, on the app's bill, never on the person's credits. Its cost
   * is recorded like any run's, so `spendLimit` counts it. Default
   * `{ model: 'meta-llama/llama-guard-4-12b' }`.
   */
  moderation?: ModerationConfig
  /**
   * The daily ceiling on what AI costs the whole app ({@link AiSpendLimit}).
   * A `sandbox` deployment, a public demo, refuses every metered call,
   * stream, job and chat reply without one (`not_ready`, reason
   * `no_budget`): anyone may sign up there, and the model calls are real.
   */
  spendLimit?: AiSpendLimit
}

/** A region the Vercel AI Gateway pins inference to (`setupAi({ inferenceRegion })`). */
export type InferenceRegion = 'eu'

/** What the guest jobs' claim at sign-up runs (`setupAi({ guest })`). */
export interface AiGuestConfig {
  /**
   * An internal mutation of yours that moves your own rows to the new
   * account when a visitor signs up in the browser that started guest jobs:
   * it receives the guest's job ids, the new account's workspace and the
   * account itself. The jobs have moved by then (`useJob` reads them for
   * the new account); your rows that name them are yours to move.
   */
  claim?: FunctionReference<'mutation', 'internal', GuestClaim>
}

/** What `setupAi({ guest: { claim } })`'s mutation receives. */
export type GuestClaim = {
  /** The visitor's jobs, now the new account's. */
  jobIds: string[]
  /** The new account's workspace: the one it signed up into. */
  workspaceId: string
  /** The new account. */
  userId: string
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
  /** Not here: a cost is finalized from the result or reported by the model ({@link ReportedCost}), never both. */
  creditsPerUsd?: never
}

/**
 * A cost the model reports: reserve `estimate`, run, then settle what the
 * model calls made through `ctx.model()` cost, at `creditsPerUsd`. A call
 * through the AI Gateway reports its cost in US dollars
 * (`providerMetadata.gateway.cost`).
 *
 * The estimate is the ceiling, as for a {@link FinalizedCost}: a cost above it
 * settles at the reservation. A call that reports no cost (a model object of
 * your own) is priced by its tokens from `prices` when the table has its
 * model; otherwise, and for a stream left unread or broken before it
 * reported one, the run settles at the reservation and the line
 * `ai.cost_unreported` is logged, so an unpriced call is never free. A run
 * that made no model call settles at `minimum`, zero by default; one whose
 * every call failed is a failed run, released.
 *
 * Needs a sum meter, like any cost settled after the run.
 *
 * @example
 * ```ts
 * // 1 credit per cent of model spend, at least 1 credit a call.
 * cost: { estimate: 20, creditsPerUsd: 100, round: 'up', minimum: 1 },
 * ```
 */
export interface ReportedCost<Args extends PropertyValidators> {
  /** Credits to reserve up front — a number or derived from the args. */
  estimate: number | ((args: ObjectType<Args>) => number)
  /** Credits per US dollar of reported model cost: your price, margin included. */
  creditsPerUsd: number
  /**
   * Token prices for calls that report no cost, as `priceTokens` reads them:
   * model id → credits per block of tokens. Keyed by the id the call was made
   * with: the `provider/model` id through the gateway, a model object's own
   * `modelId` (`gpt-5-mini` from `@ai-sdk/openai`) for your own provider.
   */
  prices?: TokenPriceTable
  /** Round the credits up, to the nearest whole credit, or not at all (the default). */
  round?: 'up' | 'nearest' | 'none'
  /** The fewest credits a run settles at. Default `0`. */
  minimum?: number
  /** Not here: a cost is reported by the model or finalized from the result ({@link FinalizedCost}), never both. */
  finalize?: never
}

/**
 * Credits per call: fixed, derived from the args, estimated then finalized,
 * or settled from the cost the model reports.
 */
export type MeteredCost<Args extends PropertyValidators, Result>
  = number
    | ((args: ObjectType<Args>) => number)
    | FinalizedCost<Args, Result>
    | ReportedCost<Args>

/** What a metered handler gets beside the action context. */
export interface MeteredContext extends ImageStoreContext {
  /** Who is charged, and the cost reserved. */
  usage: MeteredUsage
  /**
   * The model to call: the call's own (`model` on the action, else on
   * `setupAi`), or another by id or object. Every call made through what it
   * returns counts toward the run's cost: a {@link ReportedCost} settles from
   * what those calls report.
   *
   * @example
   * ```ts
   * const { text } = await generateText({ model: ctx.model(), prompt })
   * ```
   */
  model: (model?: AiModel) => MeteredModel
}

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
   * or reported cost needs the run, so it only applies to `'success'`: under
   * `'start'` the estimate settles.
   */
  charge?: 'success' | 'start'
  /**
   * The model `ctx.model()` calls, over `setupAi`'s. Naming one also
   * refuses the call before anything is counted when this deployment cannot
   * reach it.
   */
  model?: AiModel
  /**
   * What to check with the safety classifier before the reservation: the
   * args' text and images (file storage ids). A flagged call is refused
   * `invalid_input` with reason `content_blocked`, and nothing is
   * reserved, counted against the budget or charged.
   */
  moderate?: (args: ObjectType<Args>) => ModerationInput
  args: Args
  handler: (ctx: GenericActionCtx<GenericDataModel> & MeteredContext, args: ObjectType<Args>) => Promise<Result>
}

export interface MeteredStreamConfig<Args extends PropertyValidators, Result = unknown> {
  /** Registry key — unique per app; the HTTP dispatcher routes by it. */
  name: string
  /** The configured credit meter to charge, or `false` for limit-only. */
  meter: string | false
  /**
   * Credits per stream. Default `1`. A {@link FinalizedCost} prices what the
   * handler *returns* — return the model's token usage from it; a
   * {@link ReportedCost} settles from what the model calls through
   * `ctx.model()` reported once the stream ends.
   */
  cost?: MeteredCost<Args, Result>
  /** Named rate limit. Default `'ai'`; `false` disables. */
  limit?: string | false
  /** Let this spend take the balance negative (pay-as-you-go meters). */
  allowOverage?: boolean
  /** The model `ctx.model()` calls, over `setupAi`'s; refused at `start` when unreachable. */
  model?: AiModel
  /**
   * What to check with the safety classifier before the reservation: the
   * args' text and images (file storage ids). A flagged call is refused
   * `invalid_input` with reason `content_blocked`, and nothing is
   * reserved, counted against the budget or charged.
   */
  moderate?: (args: ObjectType<Args>) => ModerationInput
  args: Args
  /**
   * Produce the stream: `append(text)` pushes a chunk to the client AND
   * persists it. Credits settle when the handler finishes; an error or
   * disconnect releases them — an interrupted stream never charges.
   */
  handler: (
    ctx: GenericActionCtx<GenericDataModel> & MeteredContext,
    args: ObjectType<Args>,
    stream: { append: (text: string) => Promise<void> },
  ) => Promise<Result>
}

/** One person's AI costs over the Costs tab's window, the costliest first. */
export interface PersonCost {
  /** An account id, `guest` for visitors' jobs, or the billing entity a run was paid by without a member (`app` for the app's own). */
  who: string
  /** The account's name and address while it exists. */
  name?: string
  email?: string
  /** US dollars, as the gateway reported them: a call through a key of your own reports none. */
  usd: number
  input: number
  output: number
  /** Runs that ended in the window: jobs, metered calls, streams, chat replies and embeddings. */
  runs: number
}

/** What AI cost over a window (`getCosts`): the admin console's Costs tab. */
export interface AiCosts {
  /** The window's first UTC day, as its first millisecond. */
  since: number
  usd: number
  runs: number
  /** Each day's total, oldest first; a day without any is absent. */
  days: Array<{ day: number, usd: number, runs: number }>
  /** The 100 costliest people. */
  people: PersonCost[]
  /** `true` when the window held more rows than one read takes: the people cover its newest days. The totals are whole. */
  truncated: boolean
}

/** The functions `setupAi` builds for the admin console, to re-export from `backend/ai.ts`. */
export interface AiApi {
  /**
   * What AI cost per person from `since` (a moment; its UTC day counts
   * whole, and 90 days are kept): the job queue, metered actions, streams,
   * chat replies and knowledge embeddings, for administrators; `null` for
   * anyone else. The caller passes the moment, so the query reads no clock.
   */
  getCosts: RegisteredQuery<'public', { since: number }, Promise<AiCosts | null>>
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
   * @example Settle what the model reported it cost
   * ```ts
   * export const summarize = ai.meteredAction({
   *   meter: 'credits',
   *   model: 'openai/gpt-5-mini',
   *   cost: { estimate: 20, creditsPerUsd: 100, round: 'up', minimum: 1 },
   *   args: { text: v.string() },
   *   handler: async (ctx, { text }) => {
   *     const { text: summary } = await generateText({ model: ctx.model(), prompt: `Summarize: ${text}` })
   *     return summary
   *   },
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
  /**
   * Where calls to a model go on this deployment — `setupAi`'s `model` when
   * none is passed: `live` or `missing`. Reads
   * only the env, so a query can show it.
   *
   * @example
   * ```ts
   * export const modelStatus = query({ args: {}, handler: async () => ai.modelStatus() })
   * ```
   */
  modelStatus: (model?: AiModel) => ModelStatus
  /**
   * A chat: threads each person keeps with a model that follows your
   * instructions, every reply streamed into the thread, kept on the server
   * and metered like a metered action (reserved in the send, settled at
   * what the model cost). Built on Convex's Agent component, which the app
   * installs and mounts (`app.use(agent)`). Export the five functions it
   * returns from the chat's module, under their names: `send` schedules
   * `reply` next to itself.
   *
   * @example
   * ```ts
   * // backend/chat.ts
   * export const { threads, messages, send, remove, reply } = ai.chat({
   *   name: 'helper',
   *   instructions: 'You help people plan comic strips.',
   *   meter: 'credits',
   *   cost: { estimate: 20, creditsPerUsd: 1000, round: 'up', minimum: 1 },
   * })
   * ```
   */
  chat: (config: ChatConfig) => Chat
  /**
   * A knowledge store: each billing entity's documents in a namespace of
   * their own, plus one the app owns, searched by meaning. Built on
   * Convex's RAG component, which the app installs and mounts
   * (`app.use(rag)`). Export its `api` from the store's module, under
   * their names: `add` schedules `embed` next to itself.
   *
   * @example
   * ```ts
   * // backend/knowledge.ts
   * export const knowledge = ai.knowledge({ model: 'openai/text-embedding-3-small', dimension: 1536, meter: 'credits' })
   * export const { documents, add, search, remove, embed } = knowledge.api
   * ```
   */
  knowledge: (config: KnowledgeConfig) => Knowledge
  /**
   * What made a stored file (`ctx.storeImage` recorded it): the models,
   * when, and the ids of its inputs; `null` for a file nothing recorded.
   * Reads in a query, a mutation or an action of your own.
   *
   * @example
   * ```ts
   * export const panelProvenance = query({
   *   args: { storageId: v.id('_storage') },
   *   handler: (ctx, { storageId }) => ai.provenanceOf(ctx, storageId),
   * })
   * ```
   */
  provenanceOf: (ctx: { runQuery: GenericActionCtx<GenericDataModel>['runQuery'] }, storageId: string) => Promise<JobProvenance | null>
  /**
   * Check text and images with the safety classifier
   * (`setupAi({ moderation })`) and answer its verdict: `flagged`, and
   * `categories`, the classifier's own codes (Llama Guard's `S1` to
   * `S14`). Images are file storage ids, an upload not yet claimed
   * included. In an action; the call is on the app's gateway bill, its
   * cost recorded against `spendLimit`, and it is refused while `pause_ai`
   * is on (`unavailable`, reason `ai_paused`).
   *
   * @example
   * ```ts
   * const { flagged, categories } = await ai.moderate(ctx, { text: caption, images: [photoId] })
   * ```
   */
  moderate: (ctx: ModerationCtx, input: ModerationInput) => Promise<ModerationVerdict>
  /**
   * {@link Ai.moderate}, refusing flagged content: `invalid_input` with
   * reason `content_blocked` (on `prompt` when there is text, else on
   * `images`). Call it where your code accepts an upload, before you keep it.
   *
   * @example
   * ```ts
   * export const attach = authed.action({
   *   args: { storageId: v.string() },
   *   handler: async (ctx, { storageId }) => {
   *     await ai.requireSafe(ctx, { images: [storageId] })
   *     // …now keep it
   *   },
   * })
   * ```
   */
  requireSafe: (ctx: ModerationCtx, input: ModerationInput) => Promise<void>
  /**
   * The admin console's functions, to re-export from `backend/ai.ts`:
   * `getCosts`, what each person's AI calls cost, which the Costs tab reads.
   *
   * @example
   * ```ts
   * export const { getCosts } = ai.api
   * ```
   */
  api: AiApi
}
