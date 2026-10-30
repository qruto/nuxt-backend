import { setupAi } from 'nuxt-backend/ai'
import { v } from 'convex/values'
import { components } from './_generated/api'
import { billing } from './billing'
import { rateLimiter } from './rateLimiter'

// The rails for selling metered AI features: every metered action or
// stream is rate-limited (the 'ai' limit by default) and paid for in
// prepaid credits with reserve → run → settle, so a failed run consumes
// nothing. Usage lands in the billing provider as ingested events.
// Declare your credit meter in billing.catalog.ts.
// Moderation runs a safety classifier through the AI gateway: ai.requireSafe
// refuses a flagged photo (strips.ts). With provenance, each image a job
// step stores carries a signed C2PA manifest and the IPTC "trained
// algorithmic media" source type, as the EU AI Act asks of generated images.
// spendLimit is the most a UTC day of model calls may cost the whole app:
// past it, pause_ai turns on until the day ends. A strip costs cents, so 5
// dollars holds a busy demo day; the sandbox, the public demo, refuses AI
// without a limit.
export const ai = setupAi(components, {
  billing,
  rateLimiter,
  moderation: { model: 'meta-llama/llama-guard-4-12b' },
  provenance: { name: 'Panels' },
  spendLimit: { usdPerDay: 5 },
})

// What each person's AI calls cost: the admin console's Costs tab reads it,
// and it answers administrators only.
export const { getCosts } = ai.api

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
