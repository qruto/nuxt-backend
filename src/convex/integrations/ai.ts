/**
 * The rails for selling metered AI features — `nuxt-backend/ai`: wrap any
 * Convex action so it is rate-limited, prepaid-credit-metered (reserve → run →
 * settle — a failed run consumes nothing), and optionally token-streamed to
 * the browser with the text persisted server-side (reload mid-stream and it
 * continues).
 *
 * Models are named as `provider/model` ids and called through the AI SDK (an
 * optional peer: install `ai` to call one), each call charged at the cost
 * the gateway reports. An id goes to the Convex AI Gateway first, on Convex
 * Cloud with a paid plan (install `@convex-dev/ai-sdk-provider`), then
 * through the Vercel AI Gateway with `AI_GATEWAY_API_KEY`. Without either, a
 * call is refused, saying why.
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
  AiSpendLimit,
  CreditsBalanceEvent,
  AiCreditsConfig,
  AiModel,
  InferenceRegion,
  MeteredModel,
  ModelStatus,
  SetupAiConfig,
  AiGuestConfig,
  GuestClaim,
  MeteredUsage,
  FinalizedCost,
  ReportedCost,
  MeteredCost,
  MeteredContext,
  MeteredActionConfig,
  MeteredStreamConfig,
  PersonCost,
  AiCosts,
  AiApi,
  Ai,
} from './ai/config.js'
export { type ModelPrice, type TokenPriceTable, type TokenUsage, priceTokens } from './ai/pricing.js'
export type { GeneratedImage, ImageStoreContext, JobProvenance, ProvenanceConfig, StoreImageOptions } from './ai/provenance.js'
export type { Chat, ChatConfig, ChatMessage, ChatReply, ChatThread } from './ai/chat.js'
export type { AiEmbeddingModel } from './ai/embeddings.js'
export type { Knowledge, KnowledgeAddCost, KnowledgeApi, KnowledgeConfig, KnowledgeDocument, KnowledgePassage } from './ai/knowledge.js'
export { setupAi } from './ai/setup.js'
export type { ModerationConfig, ModerationCtx, ModerationInput, ModerationVerdict } from './ai/moderation.js'
export type {
  AdminJobView,
  DefineJobQueueOptions,
  EnqueueOptions,
  GuestJobs,
  JobContext,
  JobDefinition,
  JobModelLimit,
  JobProgress,
  JobQueue,
  JobQueueApi,
  JobQueueComponents,
  JobStepContext,
  JobStepDefinition,
  JobTier,
  JobView,
  QueueChange,
  StepResult,
} from './ai/jobs.js'
export { defineJobQueue } from './ai/jobs.js'
