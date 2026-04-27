import { setupAuth } from 'nuxt-backend/convex'
import { components } from './_generated/api'
import { query } from './_generated/server'

export const { authComponent, createAuth, getCurrentUser } = setupAuth(components.backend, query)
