import type { PropertyValidators } from 'convex/values'
import type { FinalizedCost, MeteredUsage } from './config.js'

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

/**
 * Credits actually spent, once the work is done — `undefined` when the cost
 * was fixed up front and the reservation settles as-is.
 */
export function finalizeCost(cost: unknown, result: unknown, usage: MeteredUsage): number | undefined {
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
