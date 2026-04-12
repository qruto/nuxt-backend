import { createClient, type GenericCtx } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { betterAuth, type BetterAuthOptions } from 'better-auth/minimal'
import type { AuthConfig, GenericDataModel, QueryBuilder } from 'convex/server'
import authConfig from './auth-config'
import { DEFAULT_AUTH_ROUTE } from './constants'

export interface SetupAuthOptions {
  /** Override the default auth config (e.g. to add custom providers) */
  authConfig?: AuthConfig
  /** Override Better Auth options (merged with defaults) */
  authOptions?: BetterAuthOptions
  /** Override Better Auth basePath and matching Convex auth route */
  basePath?: string
}

/** Component API shape expected by the Better Auth client. */
type AuthComponentApi = Parameters<typeof createClient>[0]

/**
 * Factory to set up Better Auth on Convex with sensible defaults.
 *
 * @example
 * ```ts
 * import { setupAuth } from 'nuxt-backend/auth'
 * import { components } from './_generated/api'
 * import type { DataModel } from './_generated/dataModel'
 * import { query } from './_generated/server'
 *
 * export const { authComponent, createAuth, getCurrentUser } = setupAuth<DataModel>(
 *   components.backend, query,
 * )
 * ```
 */
export function setupAuth<DM extends GenericDataModel>(
  componentRef: AuthComponentApi,
  queryBuilder: QueryBuilder<DM, 'public'>,
  options?: SetupAuthOptions,
) {
  const resolvedAuthConfig = options?.authConfig ?? authConfig
  const resolvedBasePath = options?.basePath ?? DEFAULT_AUTH_ROUTE
  const resolvedAuthOptions = options?.authOptions ?? {}

  const authComponent = createClient<DM>(componentRef)

  const createAuth = (ctx: GenericCtx<DM>) => {
    const siteUrl = process.env.SITE_URL!
    return betterAuth({
      baseURL: siteUrl,
      ...resolvedAuthOptions,
      basePath: resolvedBasePath,
      database: authComponent.adapter(ctx),
      emailAndPassword: {
        enabled: true,
        requireEmailVerification: false,
        ...resolvedAuthOptions.emailAndPassword,
      },
      plugins: [
        convex({
          authConfig: resolvedAuthConfig,
          options: {
            basePath: resolvedBasePath,
          },
        }),
        ...(resolvedAuthOptions.plugins ?? []),
      ],
    })
  }

  const getCurrentUser = queryBuilder({
    args: {},
    handler: async (ctx) => {
      return authComponent.getAuthUser(ctx)
    },
  })

  return { authComponent, createAuth, getCurrentUser }
}
