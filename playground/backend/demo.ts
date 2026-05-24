import { v } from 'convex/values'
import { action } from './_generated/server'

/**
 * A pretend "slow" action that simulates a network round-trip on the server
 * (which itself might be calling a third-party API). Useful for demoing
 * `useAction` from the client: you can show a pending spinner, errors, and
 * non-reactive results.
 */
export const echo = action({
  args: {
    text: v.string(),
    delayMs: v.optional(v.number()),
    failRate: v.optional(v.number()),
  },
  handler: async (_ctx, { text, delayMs, failRate }) => {
    const delay = Math.min(Math.max(delayMs ?? 800, 0), 5000)
    await new Promise(resolve => setTimeout(resolve, delay))

    if ((failRate ?? 0) > Math.random()) {
      throw new Error('Action failed (simulated)')
    }

    return {
      reversed: text.split('').reverse().join(''),
      length: text.length,
      receivedAt: new Date().toISOString(),
    }
  },
})
