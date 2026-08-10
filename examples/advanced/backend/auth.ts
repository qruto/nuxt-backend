import { setupAuth } from 'nuxt-backend/auth'
import { components, internal } from './_generated/api'
import { query } from './_generated/server'
import { authSchema } from './components/backend/schema'
import { rateLimiter } from './rateLimiter'
import { workflow } from './workflows'

export const {
  authComponent,
  createAuthOptions,
  options,
  createAuth,
  getAuthUser,
} = setupAuth(components, query, {
  // CUSTOMIZATION: the locally installed component's schema (see
  // components/backend/schema.ts) drives the Better Auth adapter.
  schema: authSchema,
  // CUSTOMIZATION: workspace invitations link to a custom page (/join, see
  // app/pages/join.vue + `backend: { pages: { acceptInvitation: false } }` in nuxt.config),
  // and workspaces are NOT auto-created per user.
  organization: {
    personal: true,
    invitationPath: '/join',
  },
  integrations: {
    rateLimiter,
    // CUSTOMIZATION: restyled email templates — the transport stays the
    // packaged one; only the message bodies change.
    emailTemplates: {
      otp: ({ email, otp, type }) => ({
        to: email,
        subject: `[Advanced example] Your ${type} code`,
        text: `Your code: ${otp}\n\n(Custom template from convex/auth.ts.)`,
      }),
      invite: ({ email, url, inviterName, organizationName, role }) => ({
        to: email,
        subject: `${inviterName} wants you on ${organizationName}`,
        text: `Join ${organizationName} as ${role}: ${url}\n\n(Custom template from convex/auth.ts.)`,
      }),
    },
    onUserCreated: async (ctx, user) => {
      await workflow.start(ctx, internal.workflows.onSignup, {
        userId: user.id,
        email: user.email,
        name: user.name,
      })
    },
  },
})
