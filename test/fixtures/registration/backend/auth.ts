/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// Verbatim copy of templates/starter/backend, present so the scaffolder finds
// every default file in place. Never built or typechecked (no codegen here).
import { setupAuth } from 'nuxt-backend/auth'
import { components, internal } from './_generated/api'
import { query } from './_generated/server'
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
  // The agent token exchange (mounted at /mcp/exchange by http.ts) — the
  // app's OAuth-protected MCP endpoint calls Convex through it.
  mcp,
} = setupAuth(components, query, {
  // Roles/permissions (admin plugin) and workspaces (organization plugin)
  // come built in, with a personal workspace per user and emailed
  // workspace invitations with an /accept-invitation page. Customize them
  // with `admin: { … }` and `organization: { … }`.
  //
  // Email (sign-in and email-change codes, invitations) is delivered
  // automatically through the backend component — configured by the
  // EMAIL_* env vars. Throttle code sends and other auth-sensitive flows.
  rateLimiter,
  // Start the onboarding sequence (workflows.ts) when a user signs up. The
  // packaged welcome email has already gone out.
  onUserCreated: async (ctx, user) => {
    await workflow.start(ctx, internal.workflows.onSignup, {
      userId: user.id,
      email: user.email,
      name: user.name,
    })
  },
})
