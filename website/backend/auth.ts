import { APIError, setupAuth } from 'nuxt-backend/auth'
import { isSandboxIdentity, SANDBOX_IDENTITY_HELP } from '../utils/testEmail'
import { components, internal } from './_generated/api'
import { query } from './_generated/server'
import { rateLimiter } from './rateLimiter'
import { workflow } from './workflows'

/** Refuse an address that isn't a sandbox identity, with the reason the forms show. */
function requireSandboxIdentity(email: unknown): void {
  if (typeof email === 'string' && !isSandboxIdentity(email)) {
    throw new APIError('BAD_REQUEST', { message: SANDBOX_IDENTITY_HELP })
  }
}

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
  // The public playground is a sandbox: every account is a generated sandbox
  // identity (utils/testEmail.ts), never a real address. `canSignIn` below
  // guards sign-in and sign-up; these two guard the other ways an address gets
  // in: an email change, and an invitation.
  authOptions: {
    databaseHooks: {
      user: {
        update: {
          before: async (user) => {
            requireSandboxIdentity(user.email)
          },
        },
      },
    },
  },
  organization: {
    organizationHooks: {
      beforeCreateInvitation: async ({ invitation }) => {
        requireSandboxIdentity(invitation.email)
      },
    },
  },
  integrations: {
    canSignIn: async (_ctx, { email }) =>
      isSandboxIdentity(email) || { allowed: false, message: SANDBOX_IDENTITY_HELP },
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
