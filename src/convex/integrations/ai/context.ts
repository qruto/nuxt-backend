import type { PropertyValidators } from 'convex/values'
import { PersistentTextStreaming } from '@convex-dev/persistent-text-streaming'
import type { Billing } from '../billing.js'
import type { AiComponents, AiRateLimiter, MeteredStreamConfig, SetupAiConfig } from './config.js'

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
  corsOrigin: string
  streamTimeout: number | false
  streamRegistry: Map<string, MeteredStreamConfig<PropertyValidators, unknown>>
}

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

  if (config.budget && !rateLimiter) {
    throw new Error('[nuxt-backend] setupAi({ budget }) needs a `rateLimiter` — the budget is a fixed window on it, not a table of its own.')
  }

  return { config, billing, rateLimiter, pts, requests, cache, corsOrigin, streamTimeout, streamRegistry }
}
