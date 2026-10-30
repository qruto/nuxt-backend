import type { PropertyValidators } from 'convex/values'
import { logBackend } from '../../log.js'
import type { FinalizedCost, MeteredUsage, ReportedCost } from './config.js'
import type { ModelCall } from './models.js'

// The cost side of a metered call: what to reserve before it runs, what it
// actually spent, and the token arithmetic an app prices model calls with.

/**
 * Credits to reserve before running: a fixed number, one derived from the
 * args, or a {@link FinalizedCost}'s estimate. Defaults to 1.
 *
 * Typed loosely on purpose — the caller holds the precise `Args`/`Result`
 * generics, and threading them through here only fights variance (the same
 * reason the registered handlers cast).
 */
export function estimateCost(cost: unknown, args: Record<string, unknown>): number {
  if (cost === undefined || cost === null) return 1
  if (typeof cost === 'number') return cost
  if (typeof cost === 'function') return (cost as (args: unknown) => number)(args)
  const { estimate } = cost as FinalizedCost<PropertyValidators, unknown>
  return typeof estimate === 'function' ? (estimate as (args: unknown) => number)(args) : estimate
}

/** Whether a cost settles from what the model calls reported. */
export function isReportedCost(cost: unknown): cost is ReportedCost<PropertyValidators> {
  return typeof cost === 'object' && cost !== null && 'creditsPerUsd' in cost
}

/**
 * Refuse a reported cost whose rate is no price, where the action is
 * defined: a rate of zero would make every call free, a `NaN` would settle
 * at the reservation forever.
 */
export function requireReportedCost(cost: unknown, where: string): void {
  if (!isReportedCost(cost)) return
  if (!(typeof cost.creditsPerUsd === 'number' && Number.isFinite(cost.creditsPerUsd) && cost.creditsPerUsd > 0)) {
    throw new Error(`[nuxt-backend] ${where}: \`creditsPerUsd\` must be a finite number above zero — got ${String(cost.creditsPerUsd)}.`)
  }
}

/**
 * One call's credits: its reported cost at `creditsPerUsd`, else, once it
 * finished, its tokens at `prices` (keyed by the id the call was made with).
 * A refused call never answered and costs nothing. `undefined` for a call
 * that cannot be priced: one that finished with no cost and no price, or a
 * stream that broke or was left unread before it reported anything.
 */
function priceCall(call: ModelCall, cost: Pick<ReportedCost<PropertyValidators>, 'creditsPerUsd' | 'prices'>): number | undefined {
  if (call.state === 'refused') return 0
  if (call.usd !== undefined) return call.usd * cost.creditsPerUsd
  if (call.state === 'finished' && cost.prices?.[call.usage.model]) return priceTokens(call.usage, cost.prices)
  return undefined
}

/**
 * Credits for the model calls a run made, from the cost each one reported at
 * `creditsPerUsd`, or its tokens at `prices` when it reported none. A run
 * with no call costs nothing but the `minimum`. `undefined` when a call
 * cannot be priced (no cost, no price, or a stream that never reported one):
 * the caller then settles at the reservation, never at a guess.
 */
export function priceModelCalls(calls: readonly ModelCall[], cost: Pick<ReportedCost<PropertyValidators>, 'creditsPerUsd' | 'prices' | 'round' | 'minimum'>): number | undefined {
  let credits = 0
  for (const call of calls) {
    const priced = priceCall(call, cost)
    if (priced === undefined) return undefined
    credits += priced
  }
  // Dollars arrive as decimals; keep the float noise of their sum out of the balance.
  credits = Math.round(credits * 1e9) / 1e9
  const rounded = cost.round === 'up'
    ? Math.ceil(credits)
    : cost.round === 'nearest' ? Math.round(credits) : credits
  return Math.max(rounded, cost.minimum ?? 0)
}

/**
 * Credits actually spent, once the work is done — `undefined` when the cost
 * was fixed up front, or reported by no call it could be priced from, and the
 * reservation settles as-is.
 */
export function finalizeCost(cost: unknown, result: unknown, usage: MeteredUsage, calls: readonly ModelCall[] = []): number | undefined {
  if (isReportedCost(cost)) {
    const credits = priceModelCalls(calls, cost)
    if (credits === undefined) {
      logBackend('warn', 'ai.cost_unreported', `A model call reported no cost (no price covers its model, or its stream never reached its end): charging the ${usage.cost} credits reserved. Add the model to the cost's \`prices\`, and read a stream to its end.`)
    }
    return credits
  }
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
