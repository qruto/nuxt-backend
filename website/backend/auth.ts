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
  listWorkspaces,
  listWorkspaceMembers,
  updateProfile,
  // The agent token exchange (mounted at /mcp/exchange by http.ts).
  mcp,
} = setupAuth(components, query, {
  integrations: {
    // Email (OTP / verification / invitations) is wired automatically through
    // the backend component — configured by the EMAIL_* env vars.
    // Throttle OTP sends and other auth-sensitive flows.
    rateLimiter,
    // Branded OTP subject — a template override changes the message body while
    // the transport stays the packaged one (demoed on /playground/platform/email).
    emailTemplates: {
      otp: ({ email, otp, type }) => ({
        to: email,
        subject: `Your nuxt-backend playground ${type === 'sign-in' ? 'sign-in' : type} code`,
        text: `Your code: ${otp}\n\nSent by the nuxt-backend playground with a custom template from backend/auth.ts.`,
      }),
    },
    // Kick off a durable welcome workflow when a user signs up, and seed the
    // playground's demo data. The seed is scheduled (not run inline): this
    // hook fires mid-sign-up, before the session hook creates the personal
    // workspace, and seeding a second workspace that early would steal the
    // "first membership" slot the personal workspace claims.
    onUserCreated: async (ctx, user) => {
      await workflow.start(ctx, internal.workflows.onSignup, {
        userId: user.id,
        email: user.email,
        name: user.name,
      })
      await ctx.scheduler.runAfter(0, internal.seed.seedForUser, {
        userId: user.id,
        email: user.email,
        name: user.name,
      })
    },
  },
})
