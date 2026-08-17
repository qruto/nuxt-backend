import { setupAi } from 'nuxt-backend/ai'
import { v } from 'convex/values'
import { components } from './_generated/api'
import { billing } from './billing'
import { rateLimiter } from './rateLimiter'

// The rails for selling metered AI features: every metered action/stream is
// rate-limited (the 'ai' limit by default) and prepaid-credit-metered with
// reserve → run → settle — a failed run consumes nothing. Usage lands in
// the billing provider as ingested events (their portal shows it per
// customer). Declare your credit meter in billing.catalog.ts.
export const ai = setupAi(components, { billing, rateLimiter })

// A metered action — swap the echo for your model call. Costs 1 credit
// from the 'credits' meter per call (see billing.catalog.ts).
export const transform = ai.meteredAction({
  meter: 'credits',
  args: { prompt: v.string() },
  handler: async (ctx, { prompt }) => {
    // const completion = await yourModel(prompt)
    return { echo: prompt.toUpperCase(), chargedTo: ctx.usage.entityId }
  },
})

// A metered, persisted token stream — drive it client-side with
// `useAiStream({ start: api.ai.startEcho, body: api.ai.echoBody })`.
// Reload mid-stream and the persisted text continues reactively.
export const { start: startEcho, body: echoBody } = ai.stream({
  name: 'echo',
  meter: 'credits',
  args: { prompt: v.string() },
  handler: async (ctx, { prompt }, { append }) => {
    for (const word of prompt.split(' ')) {
      await append(word + ' ')
    }
  },
})
