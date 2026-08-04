import { setupAuth } from 'nuxt-backend/convex'
import { components, internal } from './_generated/api'
import { query } from './_generated/server'
import { rateLimiter } from './rateLimiter'
import { workflow } from './workflows'

export const {
  authComponent,
  createAuthOptions,
  options,
  createAuth,
  getAuthUser,
} = setupAuth(components, query, {
  integrations: {
    // Email (OTP / verification / invitations) is wired automatically through
    // the backend component — configured by the EMAIL_* env vars.
    // Throttle OTP sends and other auth-sensitive flows.
    rateLimiter,
    // Kick off a durable welcome workflow when a user signs up.
    onUserCreated: async (ctx, user) => {
      await workflow.start(ctx, internal.workflows.onSignup, {
        userId: user.id,
        email: user.email,
        name: user.name,
      })
    },
  },
})
