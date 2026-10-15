import { setupAuth } from 'nuxt-backend/auth'
import { components, internal } from './_generated/api'
import { query } from './_generated/server'
import { email } from './email'
import { rateLimiter } from './rateLimiter'
import { workflow } from './workflows'

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
  // CUSTOMIZATION: workspace invitations link to a custom page (/join, see
  // app/pages/join.vue + `backend: { pages: { acceptInvitation: '/join' } }` in nuxt.config).
  organization: {
    invitationPath: '/join',
  },
  // Restyled in email.ts, with the rest of the email this app sends.
  email,
  rateLimiter,
  onUserCreated: async (ctx, user) => {
    await workflow.start(ctx, internal.workflows.onSignup, {
      userId: user.id,
      email: user.email,
      name: user.name,
    })
  },
})
