import type { PropertyValidators } from 'convex/values'
import { PersistentTextStreaming } from '@convex-dev/persistent-text-streaming'
import type { Billing } from '../billing.js'
import type { AiComponents, AiRateLimiter, MeteredStreamConfig, SetupAiConfig } from './config.js'
import { costRecorder, type RecordCost } from './costs.js'
import { requireModelId } from './models.js'
import { createModeration, type Moderation } from './moderation.js'
import { backendEnvironment } from '../../delivery.js'
import { backendError } from '../../errors.js'
import { type PauseCheck, pauseCheck, refusePaused } from '../../pauses.js'

/**
 * How long an abandoned stream may hold its reservation before the scheduled
 * auto-release hands the credits back. Deliberately under the component's
 * 10-minute `PENDING_SPEND_TTL_MS`: past the TTL the reservation is pruned
 * without re-crediting (only a provider sync restores it), so the release has
 * to land while the entry is still live.
 */
const DEFAULT_STREAM_TIMEOUT_MS = 5 * 60 * 1000

/**
 * What the metering and streaming modules share, resolved once per `setupAi`
 * call: the configuration, the billing and rate-limiter instances it composes,
 * the streaming client and component handles, and the registry the HTTP
 * dispatcher routes streams by.
 */
export interface AiContext {
  config: SetupAiConfig
  billing: Billing
  rateLimiter: AiRateLimiter | undefined
  pts: PersistentTextStreaming
  requests: AiComponents['backend']['ai']
  cache: AiComponents['backend']['billing']
  /** The pause_ai kill switch, read on every metered call. */
  paused: PauseCheck
  /**
   * Refuse a model call the app may not make now: on a `sandbox` deployment
   * without a `spendLimit` (`not_ready`, reason `no_budget`), and while
   * `pause_ai` is on (`unavailable`, reason `ai_paused`).
   */
  refuseAi: (ctx: Parameters<PauseCheck>[0]) => Promise<void>
  corsOrigin: string
  streamTimeout: number | false
  streamRegistry: Map<string, MeteredStreamConfig<PropertyValidators, unknown>>
  /** The safety classifier's check (`setupAi({ moderation })`). */
  moderation: Moderation
  /** Record what a run's model calls cost, against who made it: the Costs tab and the AI spend alert read it. */
  recordCost: RecordCost
}

/** Each `setupAi` instance's context, for the job queue built on it (`defineJobQueue({ ai })`). */
export const AI_CONTEXTS = new WeakMap<object, AiContext>()

export function createAiContext(components: AiComponents, config: SetupAiConfig): AiContext {
  const { billing, rateLimiter } = config
  const pts = new PersistentTextStreaming(components.persistentTextStreaming)
  const requests = components.backend.ai
  const cache = components.backend.billing
  const corsOrigin = config.cors?.origin
    ?? (typeof process !== 'undefined' ? process.env.SITE_URL : undefined)
    ?? '*'
  const streamTimeout = config.streamTimeout ?? DEFAULT_STREAM_TIMEOUT_MS

  const streamRegistry = new Map<string, MeteredStreamConfig<PropertyValidators, unknown>>()

  requireModelId(config.model, 'setupAi')
  if (config.inferenceRegion !== undefined && config.inferenceRegion !== 'eu') {
    throw new Error(`[nuxt-backend] setupAi({ inferenceRegion }): '${String(config.inferenceRegion)}' is no region the gateway pins; use 'eu'.`)
  }
  const usdPerDay = config.spendLimit?.usdPerDay
  if (config.spendLimit !== undefined && !(typeof usdPerDay === 'number' && Number.isFinite(usdPerDay) && usdPerDay > 0)) {
    throw new TypeError(`[nuxt-backend] setupAi({ spendLimit }): \`usdPerDay\` is the most the app may spend on AI in a UTC day, in US dollars above 0, not ${String(usdPerDay)}.`)
  }
  if (config.budget && !rateLimiter) {
    throw new Error('[nuxt-backend] setupAi({ budget }) needs a `rateLimiter` — the budget is a fixed window on it, not a table of its own.')
  }

  // The component's storage, where an upload not yet claimed waits for the check.
  const storage = (components.backend as unknown as { storage?: Parameters<typeof createModeration>[1] }).storage
  const moderation = createModeration(config, storage)

  const paused = pauseCheck(components.backend)
  const refuseAi: AiContext['refuseAi'] = async (ctx) => {
    // A public demo pays for every call anyone makes: it makes none without a ceiling.
    if (usdPerDay === undefined && backendEnvironment() === 'sandbox') {
      throw backendError('not_ready', { reason: 'no_budget' }, '[nuxt-backend] AI is off on this sandbox deployment: setupAi needs a `spendLimit: { usdPerDay }` before a public demo makes model calls.')
    }
    await refusePaused(paused, ctx, 'ai')
  }

  return { config, billing, rateLimiter, pts, requests, cache, paused, refuseAi, corsOrigin, streamTimeout, streamRegistry, moderation, recordCost: costRecorder(components.backend.costs, usdPerDay) }
}
