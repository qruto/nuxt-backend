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

interface CreateBetterAuthOptions {
  authConfig?: AuthConfig
  authOptions?: BetterAuthOptions
  basePath?: string
}

type EnvHost = typeof globalThis & {
  process?: {
    env?: Record<string, string | undefined>
  }
}

/**
 * Shared factory that creates a Better Auth instance from a database adapter.
 *
 * Used internally by both the Convex component HTTP router and the
 * user-facing `setupAuth` helper to avoid duplicating config.
 */
export function createBetterAuth(
  database: ReturnType<ReturnType<typeof createClient>['adapter']>,
  options: CreateBetterAuthOptions = {},
) {
  const resolvedAuthConfig = options.authConfig ?? authConfig
  const resolvedBasePath = options.basePath ?? DEFAULT_AUTH_ROUTE
  const resolvedAuthOptions = options.authOptions ?? {}
  const siteUrl = (globalThis as EnvHost).process?.env?.SITE_URL

  if (!siteUrl) {
    throw new Error('SITE_URL environment variable is required to configure Better Auth.')
  }

  return betterAuth({
    baseURL: siteUrl,
    ...resolvedAuthOptions,
    basePath: resolvedBasePath,
    database,
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

/**
 * Factory to set up Better Auth on Convex with sensible defaults.
 *
 * @example
 * ```ts
 * import { setupAuth } from 'nuxt-backend/auth'
 * import { components } from './_generated/api'
 * import { query } from './_generated/server'
 *
 * export const { authComponent, createAuth, getCurrentUser } = setupAuth(
 *   components.backend, query,
 * )
 * ```
 */
export function setupAuth<DM extends GenericDataModel>(
  componentRef: AuthComponentApi,
  queryBuilder: QueryBuilder<DM, 'public'>,
  options?: SetupAuthOptions,
) {
  const authComponent = createClient<DM>(componentRef)

  const createAuth = (ctx: GenericCtx<DM>) => {
    return createBetterAuth(authComponent.adapter(ctx), {
      authConfig: options?.authConfig,
      authOptions: options?.authOptions,
      basePath: options?.basePath,
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
