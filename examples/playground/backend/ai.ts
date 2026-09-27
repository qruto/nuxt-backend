import { setupAi } from 'nuxt-backend/ai'
import { v } from 'convex/values'
import { components } from './_generated/api'
import { billing } from './billing'
import { rateLimiter } from './rateLimiter'

// The rails for selling metered AI features: every metered action/stream is
// rate-limited (the 'ai' limit — watch it drain on the Rate limiting page)
// and prepaid-credit-metered with reserve → run → settle, so a failed run
// consumes nothing. Usage lands in the billing provider as ingested events.
// The 'credits' meter is named in billing.ts.
export const ai = setupAi(components, { billing, rateLimiter })

/**
 * A metered action — the playground's stand-in for a model call: an artificial
 * delay, then a transformed echo. Costs 1 credit ('credits' counts events, so
 * each call is exactly one). `fail` simulates the model erroring mid-run: the
 * reservation is released and nothing is charged — watch the balance on
 * /playground/platform/credits stay put.
 */
export const transform = ai.meteredAction({
  meter: 'credits',
  args: {
    text: v.string(),
    fail: v.optional(v.boolean()),
  },
  handler: async (ctx, { text, fail }) => {
    await new Promise(resolve => setTimeout(resolve, 600))
    if (fail) {
      throw new Error('Model call failed (simulated) — the reserved credit was released, nothing charged.')
    }
    return {
      transformed: text.toUpperCase(),
      reversed: text.split('').reverse().join(''),
      chargedTo: ctx.usage.entityId,
      cost: ctx.usage.cost,
    }
  },
})

/**
 * A metered, persisted token stream — echoes the prompt word by word with a
 * small delay, standing in for model tokens. Drive it client-side with
 * `useAiStream({ start: api.ai.startEcho, body: api.ai.echoBody })`; reload
 * mid-stream and the persisted text continues reactively. Credits settle only
 * when the stream finishes — an interrupted stream never charges.
 */
export const { start: startEcho, body: echoBody } = ai.stream({
  name: 'echo',
  meter: 'credits',
  args: { prompt: v.string() },
  handler: async (_ctx, { prompt }, { append }) => {
    const words = prompt.split(/\s+/).filter(Boolean)
    for (const word of words) {
      await append(`${word} `)
      await new Promise(resolve => setTimeout(resolve, 150))
    }
  },
})
