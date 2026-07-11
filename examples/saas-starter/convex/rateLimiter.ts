import { setupRateLimiter } from 'nuxt-backend/convex/rate-limit'
import { components } from './_generated/api'

// Application rate limiting. Pre-seeded with the auth limits (emailOtp,
// signIn, signUp, passwordReset) — add your own named limits here.
export const rateLimiter = setupRateLimiter(components.rateLimiter)
