import { setupAuthorization } from 'nuxt-backend/convex/authorization'
import { createFunctions } from 'nuxt-backend/convex/functions'
import { components } from './_generated/api'
import { action, internalMutation, mutation, query } from './_generated/server'

// Authorization over identity claims (role, ban state, active workspace),
// with fresh reads where it matters. Bootstrap your first admin with:
//   npx convex run functions:setUserRole '{"email":"you@example.com","role":"admin"}'
export const authorization = setupAuthorization(components.backend, { internalMutation })
export const { setUserRole } = authorization

// Pre-authorized builders — drop-in replacements for query/mutation/action:
//   authed.query({ ... })            ctx.user (signed in, not banned)
//   org.mutation({ ... })            + ctx.organization (fresh workspace membership)
//   admin.action({ ... })            app-wide admin role
//   withRole('editor').query({ .. }) custom role tier
export const { authed, org, admin, withRole } = createFunctions(
  { query, mutation, action },
  authorization,
)
