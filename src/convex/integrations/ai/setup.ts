import { createChats } from './chat.js'
import type { Ai, AiComponents, SetupAiConfig } from './config.js'
import { AI_CONTEXTS, createAiContext } from './context.js'
import { costsApi } from './costs.js'
import { createKnowledge } from './knowledge.js'
import { createMetering } from './metering.js'
import { modelStatusOf } from './models.js'
import { provenanceReader, type ProvenanceRefs } from './provenance.js'
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
 * export const ai = setupAi(components, { billing, rateLimiter, model: 'openai/gpt-5-mini' })
 * export const generate = ai.meteredAction({ ... })
 * export const { start: startEcho, body: echoBody } = ai.stream({ name: 'echo', ... })
 * export const { getCosts } = ai.api
 * ```
 */
export function setupAi(components: AiComponents, config: SetupAiConfig): Ai {
  const context = createAiContext(components, config)
  const metering = createMetering(context)
  const { stream, httpHandler } = createStreams(context, metering)
  const { meteredAction } = metering
  const { corsOrigin } = context
  const modelStatus: Ai['modelStatus'] = model => modelStatusOf(model ?? config.model, undefined, config.inferenceRegion)

  // The Agent and RAG components are the app's own mounts, reached only when a chat or a store runs.
  const mounted = components as AiComponents & { agent?: unknown, rag?: unknown }
  const { chat } = createChats(context, metering, mounted.agent)
  const { knowledge } = createKnowledge(context, metering, mounted.rag, (components.backend as unknown as { storage: Parameters<typeof createKnowledge>[3] }).storage)

  const provenanceOf = provenanceReader(context.requests as unknown as ProvenanceRefs)

  // A check of the app's own is a model call like any other: refused on a
  // sandbox without a spendLimit and while pause_ai is on. A metered call's
  // or a job's check already passed both.
  const moderate: Ai['moderate'] = async (ctx, input) => {
    await context.refuseAi(ctx)
    return context.moderation.moderate(ctx, input)
  }
  const requireSafe: Ai['requireSafe'] = async (ctx, input) => {
    await context.refuseAi(ctx)
    await context.moderation.requireSafe(ctx, input)
  }

  const ai: Ai = { meteredAction, stream, httpHandler, corsOrigin, modelStatus, chat, knowledge, provenanceOf, moderate, requireSafe, api: costsApi(components) }
  AI_CONTEXTS.set(ai, context)
  return ai
}
