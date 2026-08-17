import { setupAuth } from 'nuxt-backend/auth'
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
  authConfig,
} = setupAuth(components, query, {
  // Roles/permissions (admin plugin) and workspaces (organization plugin)
  // are on by default, including a personal workspace per user and emailed
  // workspace invitations with an /accept-invitation page. Customize or
  // disable: `admin: false`, `organization: { personal: false }`, ...
  integrations: {
    // Email (OTP / verification / invitations) is delivered automatically
    // through the backend component — configured by the EMAIL_* env vars.
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
