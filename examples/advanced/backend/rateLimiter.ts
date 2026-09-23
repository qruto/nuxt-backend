import { setupRateLimiter } from 'nuxt-backend/rate-limit'
import { components } from './_generated/api'

// Application rate limiting. Pre-seeded with the package defaults
// (DEFAULT_LIMITS in nuxt-backend/rate-limit) — add your own named limits here.
export const rateLimiter = setupRateLimiter(components)
