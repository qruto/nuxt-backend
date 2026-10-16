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
// The entry only re-exports: the public types live in ai/config.ts and
// ai/pricing.ts, `setupAi` in ai/setup.ts. TypeDoc lists a page's symbols by
// declaring file, then position, and `ai.ts` sorts before every file under
// `ai/` — so the entry declares nothing itself, and those files are named to
// sort in the order the API reference has always listed them in.
export type {
  AiRateLimiter,
  AiComponents,
  AiBudget,
  CreditsBalanceEvent,
  AiCreditsConfig,
  SetupAiConfig,
  MeteredUsage,
  FinalizedCost,
  MeteredCost,
  MeteredActionConfig,
  MeteredStreamConfig,
  Ai,
} from './ai/config.js'
export { type ModelPrice, type TokenPriceTable, type TokenUsage, priceTokens } from './ai/pricing.js'
export { setupAi } from './ai/setup.js'
