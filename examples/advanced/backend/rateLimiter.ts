import { setupRateLimiter } from 'nuxt-backend/rate-limit'
import { components } from './_generated/api'

// Application rate limiting. Pre-seeded with the package defaults (emailOtp,
// billingSync, ai, mcp) — add your own named limits here.
export const rateLimiter = setupRateLimiter(components)
