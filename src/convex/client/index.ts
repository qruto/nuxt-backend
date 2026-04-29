import { createClient, type GenericCtx } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { betterAuth, type BetterAuthOptions } from 'better-auth/minimal'
import type { AnyComponents, AuthConfig, GenericDataModel, QueryBuilder } from 'convex/server'
import authConfig from '../auth.config'
import { DEFAULT_AUTH_ROUTE } from '../component/constants'

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
type PublicAuthComponentRef = AuthComponentApi | AnyComponents[string]

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

function toAuthComponentApi(componentRef: PublicAuthComponentRef): AuthComponentApi {
  return componentRef as AuthComponentApi
}

/**
 * Shared factory that creates a Better Auth instance from a database adapter.
 *
 * Used by the public client bridge and by the component HTTP router so the
 * packaged component and app-facing wrapper stay aligned.
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
 * Simple wrapper around the packaged auth component that runs in the app
 * environment.
 *
 * This follows Convex's simple function wrapper pattern: app code can pass the
 * component reference and Convex context in directly, while this helper handles
 * the cross-boundary adapter wiring and environment-backed auth creation.
 */
export function createAuth<DM extends GenericDataModel>(
  ctx: GenericCtx<DM>,
  componentRef: PublicAuthComponentRef,
  options?: SetupAuthOptions,
) {
  const authComponent = createClient<DM>(toAuthComponentApi(componentRef))

  return createBetterAuth(authComponent.adapter(ctx), {
    authConfig: options?.authConfig,
    authOptions: options?.authOptions,
    basePath: options?.basePath,
  })
}

/**
 * Ready-made app query wrappers for re-exporting component functionality.
 *
 * This follows Convex's API remounting pattern for component client code.
 */
export function makeAuthApi<DM extends GenericDataModel>(
  componentRef: PublicAuthComponentRef,
  queryBuilder: QueryBuilder<DM, 'public'>,
) {
  const authComponent = createClient<DM>(toAuthComponentApi(componentRef))

  return {
    getCurrentUser: queryBuilder({
      args: {},
      handler: async (ctx) => {
        return authComponent.getAuthUser(ctx)
      },
    }),
  }
}

/**
 * App-facing client bridge for the packaged Convex component.
 *
 * This convenience helper composes the simple wrapper and API remounting
 * patterns exported from this module.
 *
 * @example
 * ```ts
 * import { setupAuth } from 'nuxt-backend/convex'
 * import { components } from './_generated/api'
 * import { query } from './_generated/server'
 *
 * export const { authComponent, createAuth, getCurrentUser } = setupAuth(
 *   components.backend, query,
 * )
 * ```
 */
export function setupAuth<DM extends GenericDataModel>(
  componentRef: PublicAuthComponentRef,
  queryBuilder: QueryBuilder<DM, 'public'>,
  options?: SetupAuthOptions,
) {
  const authComponent = createClient<DM>(toAuthComponentApi(componentRef))
  const { getCurrentUser } = makeAuthApi(componentRef, queryBuilder)

  const createAuthForContext = (ctx: GenericCtx<DM>) => {
    return createAuth(ctx, componentRef, options)
  }

  return { authComponent, createAuth: createAuthForContext, getCurrentUser }
}
