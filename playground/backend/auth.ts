import { setupAuth } from 'nuxt-backend/convex'
import { components } from './_generated/api'
import { query } from './_generated/server'

export const {
  authComponent,
  createAuthOptions,
  options,
  createAuth,
  getAuthUser,
} = setupAuth(components.backend, query)
