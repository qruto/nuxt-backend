/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// Verbatim copy of templates/starter/backend, present so the scaffolder finds
// every default file in place. Never built or typechecked (no codegen here).
import { setupAuth } from 'nuxt-backend/auth'
import { components, internal } from './_generated/api'
import { query } from './_generated/server'
import { account } from './account'
import { audit } from './audit'
import { email } from './email'
import { paths } from './paths.generated'
import { rateLimiter } from './rateLimiter'
import { workflow } from './workflows'

export const {
  authComponent,
  createAuth,
  getAuthUser,
  authConfig,
  updateProfile,
  listSessions,
  revokeSession,
  listSignInAlerts,
} = setupAuth(components, query, {
  // App-wide roles (admin plugin) and workspaces
  // come built in, with a personal workspace per user and emailed
  // workspace invitations with an /accept-invitation page. Customize them
  // with `admin: { … }` and `workspaces: { … }`: how long invitations
  // last, and onCreate / onMemberAdded / onMemberRemoved.
  //
  // The auth route and the pages the auth emails link to, as nuxt.config
  // declares them (`backend.authRoute`, `backend.pages`): the Nuxt module
  // writes them to paths.generated.ts.
  paths,
  // Every auth email (sign-in and email-change codes, welcome,
  // invitations) goes out through email.ts, which holds the templates.
  email,
  // Throttle code sends and other auth-sensitive flows.
  rateLimiter,
  // Record sign-ins, passkeys, workspace and administrator changes on the
  // activity trail through audit.ts, so they reach its onEvent too.
  audit,
  // Erase a deleted account everywhere through account.ts: the backend's
  // tables, the billing customer, the email contact and your sources.
  account,
  // Launching in phases (early access, invite only)? Add backend/access.ts
  // with setupAccess, and pass it here as `access`.
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
