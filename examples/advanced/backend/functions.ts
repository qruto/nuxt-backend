import { createFunctions } from 'nuxt-backend/functions'
import { components } from './_generated/api'
import { action, mutation, query } from './_generated/server'
import { billing } from './billing'
import { rateLimiter } from './rateLimiter'

// Every access tier of your backend, from this one call. Each is a
// drop-in for query/mutation/action that checks the caller first:
//   authed.query({ ... })              ctx.user (signed in, not banned)
//   workspace.mutation({ ... })        + ctx.workspace (fresh membership)
//   admin.action({ ... })              the app-wide admin role
//   withRole('editor').query({ ... })  an app-wide role of yours
//   withFeature('reports').query(...)  workspace + a plan's feature
// setUserRole is the internal mutation `npx nuxt-backend doctor --fix`
// runs to make your first administrator.
export const { authed, workspace, admin, withRole, withFeature, setUserRole } = createFunctions(
  { query, mutation, action },
  // Every signed-in write spends the 'write' limit (rateLimiter.ts), per account.
  { components, billing, rateLimiter, limits: { authed: 'write', workspace: 'write' } },
)
