import { backendEnvironment } from 'nuxt-backend/app'
import { APIError, setupAuth } from 'nuxt-backend/auth'
import { components, internal } from './_generated/api'
import { query } from './_generated/server'
import { account } from './account'
import { audit } from './audit'
import { email } from './email'
import { paths } from './paths.generated'
import { rateLimiter } from './rateLimiter'
import { workflow } from './workflows'

// The public demo (a `sandbox` deployment, backend/demo.ts) is open to
// anyone, so it holds no real address: every account there is a generated
// sandbox identity, the email provider's test inbox with a long random
// label (`delivered+<label>@resend.dev`), whose codes the sign-in page
// reads from the dev inbox. Anywhere else, any address signs in.

/** A sandbox identity: the delivered test inbox with a random label of 16+ characters. */
const SANDBOX_IDENTITY = /^delivered\+[a-z0-9]{16,}@resend\.dev$/

/** Why the demo refused an address: what the forms and the server say. */
export const SANDBOX_IDENTITY_HELP = 'The demo is a sandbox: accounts use a generated address (delivered+…@resend.dev), and its mail shows up on the sign-in page.'

/** Whether `email` may hold an account here: always, but on the public demo only a sandbox identity. */
export function admitsAddress(email: string): boolean {
  return backendEnvironment() !== 'sandbox' || SANDBOX_IDENTITY.test(email.trim().toLowerCase())
}

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
  // The demo's addresses: `canSignIn` guards sign-in and sign-up, the
  // invitation check and the update hook the other ways an address gets in.
  canSignIn: async (_ctx, { email }) => admitsAddress(email) || { allowed: false, message: SANDBOX_IDENTITY_HELP },
  workspaces: {
    canInvite: async (_ctx, { email }) => admitsAddress(email) || { allowed: false, message: SANDBOX_IDENTITY_HELP },
  },
  authOptions: {
    databaseHooks: {
      user: {
        update: {
          before: async (user) => {
            if (typeof user.email === 'string' && !admitsAddress(user.email)) throw new APIError('BAD_REQUEST', { message: SANDBOX_IDENTITY_HELP })
          },
        },
      },
    },
  },
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
