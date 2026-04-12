import { createClient } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { betterAuth } from 'better-auth/minimal'
import { components } from './_generated/api'
import authConfig from './auth-config'
import { DEFAULT_AUTH_ROUTE } from './constants'

export const authComponent = createClient(components.betterAuth)

export function createComponentAuth(ctx: Parameters<typeof authComponent.adapter>[0]) {
  const siteUrl = process.env.SITE_URL!

  return betterAuth({
    baseURL: siteUrl,
    basePath: DEFAULT_AUTH_ROUTE,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    plugins: [
      convex({
        authConfig,
        options: {
          basePath: DEFAULT_AUTH_ROUTE,
        },
      }),
    ],
  })
}
