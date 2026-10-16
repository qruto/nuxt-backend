import type { Ai, AiComponents, SetupAiConfig } from './config.js'
import { createAiContext } from './context.js'
import { createMetering } from './metering.js'
import { createStreams } from './stream.js'

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
  const context = createAiContext(components, config)
  const metering = createMetering(context)
  const { stream, httpHandler } = createStreams(context, metering)
  const { meteredAction } = metering
  const { corsOrigin } = context

  return { meteredAction, stream, httpHandler, corsOrigin }
}
