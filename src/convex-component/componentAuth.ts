import { createClient } from '@convex-dev/better-auth'
import { components } from './_generated/api'
import { createBetterAuth } from './auth'
import authConfig from './authConfig'

export const authComponent = createClient(components.betterAuth)

export function createComponentAuth(ctx: Parameters<typeof authComponent.adapter>[0]) {
  return createBetterAuth(authComponent.adapter(ctx), { authConfig })
}
