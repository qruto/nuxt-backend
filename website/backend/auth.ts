import { APIError, setupAuth } from 'nuxt-backend/auth'
import { isSandboxIdentity, SANDBOX_IDENTITY_HELP } from '../utils/testEmail'
import { components, internal } from './_generated/api'
import { markActive } from '../utils/activity'
import { query } from './_generated/server'
import { email } from './email'
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
  createAuth,
  getAuthUser,
  authConfig,
  listWorkspaces,
  listWorkspaceMembers,
  updateProfile,
  listSessions,
  revokeSession,
  // The agent token exchange (mounted at /mcp/exchange by http.ts).
  mcp,
} = setupAuth(components, query, {
  // The public playground is a sandbox: every account is a generated sandbox
  // identity (utils/testEmail.ts), never a real address. `canSignIn` below
  // guards sign-in and sign-up; these two guard the other ways an address gets
  // in: an email change, and an invitation.
  authOptions: {
    databaseHooks: {
      // Signing in and out keep an account off the idle sweep (utils/activity.ts).
      session: {
        create: { after: async (session, ctx) => markActive(session.userId, ctx) },
        delete: { after: async (session, ctx) => markActive(session.userId, ctx) },
      },
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
  canSignIn: async (_ctx, { email }) =>
    isSandboxIdentity(email) || { allowed: false, message: SANDBOX_IDENTITY_HELP },
  // Every auth email (sign-in and email-change codes, welcome, invitations)
  // goes out through email.ts, which holds the templates — the playground
  // brands its sign-in code there.
  email,
  // Throttle code sends and other auth-sensitive flows.
  rateLimiter,
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
})
