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
// spendLimit is the most a UTC day of model calls may cost the whole app:
// past it, the pause_ai switch turns on until the day ends. Raise it as
// your app grows; a sandbox deployment, a public demo, refuses AI without one.
export const ai = setupAi(components, { billing, rateLimiter, spendLimit: { usdPerDay: 10 } })

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
