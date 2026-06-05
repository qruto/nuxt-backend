import { createClient, type GenericCtx } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { passkey } from '@better-auth/passkey'
import { APIError, getSessionFromCtx } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import { betterAuth, type BetterAuthOptions } from 'better-auth/minimal'
import { emailOTP } from 'better-auth/plugins'
import type { AnyComponents, AuthConfig, GenericDataModel, GenericSchema, QueryBuilder, SchemaDefinition } from 'convex/server'
import authConfig from '../auth.config'
import { DEFAULT_AUTH_ROUTE } from '../component/constants'
import { authSchema } from '../component/schema'

/**
 * Client-supplied details for passkey-first registration.
 *
 * The Better Auth passkey endpoint forwards this as an opaque `context`
 * string. We default to a small JSON shape: `{ email, name }`.
 */
interface PasskeyRegistrationContext {
  email: string
  name: string
}

function parsePasskeyContext(context?: string | null): PasskeyRegistrationContext {
  if (!context) {
    throw APIError.from('BAD_REQUEST', {
      code: 'INVALID_PASSKEY_REGISTRATION',
      message: 'Passkey registration details are missing.',
    })
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(context)
  }
  catch {
    throw APIError.from('BAD_REQUEST', {
      code: 'INVALID_PASSKEY_REGISTRATION',
      message: 'Passkey registration details are invalid.',
    })
  }
  const { email, name } = (parsed ?? {}) as Partial<PasskeyRegistrationContext>
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  const normalizedName = typeof name === 'string' ? name.trim() : ''
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    throw APIError.from('BAD_REQUEST', {
      code: 'INVALID_PASSKEY_REGISTRATION',
      message: 'Enter a valid email address.',
    })
  }
  if (!normalizedName) {
    throw APIError.from('BAD_REQUEST', {
      code: 'INVALID_PASSKEY_REGISTRATION',
      message: 'Enter your name to register a passkey.',
    })
  }
  return { email: normalizedEmail, name: normalizedName }
}

function accountExistsError() {
  return APIError.from('UNPROCESSABLE_ENTITY', {
    code: 'PASSKEY_REGISTRATION_ACCOUNT_EXISTS',
    message: 'An account already exists for this email. Sign in first, then add a passkey.',
  })
}

/**
 * Default passkey plugin: enables passkey-first (pre-auth) registration so
 * users can create an account with just a passkey. When unauthenticated, the
 * client passes `{ email, name }` as the `context` argument when calling
 * `addPasskey`. When the user already has a session, the passkey is attached
 * to the current user and `context` is ignored.
 *
 * Override by passing your own `passkey(...)` plugin in `authOptions.plugins`.
 */
function defaultPasskey() {
  return passkey({
    registration: {
      requireSession: false,
      resolveUser: async ({ ctx, context }) => {
        const { email, name } = parsePasskeyContext(context)
        const existing = await ctx.context.internalAdapter.findUserByEmail(email)
        if (existing) throw accountExistsError()
        return { id: `passkey-registration:${email}`, name: email, displayName: name }
      },
      afterVerification: async ({ ctx, context }) => {
        // If a session already exists, this is an "add passkey to current
        // user" flow — the plugin will associate the new passkey with the
        // session user, so we have nothing to do here.
        const existingSession = await getSessionFromCtx(ctx)
        if (existingSession?.user?.id) return

        const { email, name } = parsePasskeyContext(context)
        const existing = await ctx.context.internalAdapter.findUserByEmail(email)
        if (existing) throw accountExistsError()
        const user = await ctx.context.internalAdapter.createUser({
          email,
          emailVerified: false,
          name,
        })
        const session = await ctx.context.internalAdapter.createSession(user.id)
        await setSessionCookie(ctx, { session, user })
        return { userId: user.id }
      },
    },
  })
}

type DefaultAuthSchema = typeof authSchema

export interface CreateBetterAuthOptions {
  /** Override the default auth config (e.g. to add custom providers) */
  authConfig?: AuthConfig
  /** Override Better Auth options (merged with defaults) */
  authOptions?: BetterAuthOptions
  /** Override Better Auth basePath and matching Convex auth route */
  basePath?: string
}

export interface SetupAuthOptions<Schema extends SchemaDefinition<GenericSchema, true> = DefaultAuthSchema> extends CreateBetterAuthOptions {
  /** Local Better Auth schema for hybrid/local component installs */
  schema?: Schema
  /** Enable verbose logs in the Better Auth Convex component client */
  verbose?: boolean
}

/** Component API shape expected by the Better Auth client. */
type AuthComponentApi = Parameters<typeof createClient>[0]
type PublicAuthComponentRef = AuthComponentApi | AnyComponents[string]

type EnvHost = typeof globalThis & {
  process?: {
    env?: Record<string, string | undefined>
  }
}

function toAuthComponentApi(componentRef: PublicAuthComponentRef): AuthComponentApi {
  return componentRef as AuthComponentApi
}

function readEnv(name: string) {
  return (globalThis as EnvHost).process?.env?.[name]
}

function createAuthComponent<DM extends GenericDataModel, Schema extends SchemaDefinition<GenericSchema, true> = DefaultAuthSchema>(
  componentRef: PublicAuthComponentRef,
  options?: SetupAuthOptions<Schema>,
) {
  const schema = options?.schema ?? authSchema
  const config = {
    local: { schema },
    ...(options?.verbose !== undefined ? { verbose: options.verbose } : {}),
  }

  return createClient<DM, Schema>(
    toAuthComponentApi(componentRef),
    config as never,
  )
}

export function createBetterAuthOptions(
  database: ReturnType<ReturnType<typeof createClient>['adapter']>,
  options: CreateBetterAuthOptions = {},
) {
  const resolvedAuthConfig = options.authConfig ?? authConfig
  const resolvedAuthOptions = options.authOptions ?? {}
  const resolvedBasePath = options.basePath ?? resolvedAuthOptions.basePath ?? DEFAULT_AUTH_ROUTE
  const siteUrl = resolvedAuthOptions.baseURL ?? readEnv('SITE_URL') ?? readEnv('BETTER_AUTH_URL')
  const secret = resolvedAuthOptions.secret ?? readEnv('BETTER_AUTH_SECRET')

  const userPlugins = resolvedAuthOptions.plugins ?? []
  const userPluginIds = new Set(userPlugins.map(p => p.id))
  const defaultPlugins = [
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        console.warn(
          `[nuxt-backend] No sendVerificationOTP configured. Email OTP (${type}) for ${email}: ${otp}`,
        )
      },
    }),
    defaultPasskey(),
  ].filter(plugin => !userPluginIds.has(plugin.id))

  return {
    ...resolvedAuthOptions,
    ...(siteUrl ? { baseURL: siteUrl } : {}),
    ...(secret ? { secret } : {}),
    basePath: resolvedBasePath,
    database,
    emailAndPassword: {
      enabled: false,
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
      ...defaultPlugins,
      ...userPlugins,
    ],
  } satisfies BetterAuthOptions
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
  return betterAuth(createBetterAuthOptions(database, options))
}

export function createAuthOptions<
  DM extends GenericDataModel,
  Schema extends SchemaDefinition<GenericSchema, true> = DefaultAuthSchema,
>(
  ctx: GenericCtx<DM>,
  componentRef: PublicAuthComponentRef,
  options?: SetupAuthOptions<Schema>,
) {
  const authComponent = createAuthComponent<DM, Schema>(componentRef, options)
  return createBetterAuthOptions(authComponent.adapter(ctx), {
    authConfig: options?.authConfig,
    authOptions: options?.authOptions,
    basePath: options?.basePath,
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
export function createAuth<
  DM extends GenericDataModel,
  Schema extends SchemaDefinition<GenericSchema, true> = DefaultAuthSchema,
>(
  ctx: GenericCtx<DM>,
  componentRef: PublicAuthComponentRef,
  options?: SetupAuthOptions<Schema>,
) {
  return betterAuth(createAuthOptions(ctx, componentRef, options))
}

/**
 * Ready-made app query wrappers for re-exporting component functionality.
 *
 * This follows Convex's API remounting pattern for component client code.
 */
export function makeAuthApi<
  DM extends GenericDataModel,
  Schema extends SchemaDefinition<GenericSchema, true> = DefaultAuthSchema,
>(
  componentRef: PublicAuthComponentRef,
  queryBuilder: QueryBuilder<DM, 'public'>,
  options?: SetupAuthOptions<Schema>,
) {
  const authComponent = createAuthComponent<DM, Schema>(componentRef, options)

  const getAuthUser = queryBuilder({
    args: {},
    handler: async (ctx) => {
      return authComponent.getAuthUser(ctx)
    },
  })

  return {
    getAuthUser,
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
 * export const { authComponent, createAuth, getAuthUser } = setupAuth(
 *   components.backend, query,
 * )
 * ```
 */
export function setupAuth<
  DM extends GenericDataModel,
  Schema extends SchemaDefinition<GenericSchema, true> = DefaultAuthSchema,
>(
  componentRef: PublicAuthComponentRef,
  queryBuilder: QueryBuilder<DM, 'public'>,
  options?: SetupAuthOptions<Schema>,
) {
  const authComponent = createAuthComponent<DM, Schema>(componentRef, options)
  const { getAuthUser } = makeAuthApi(componentRef, queryBuilder, options)

  const createAuthOptionsForContext = (ctx: GenericCtx<DM>) => {
    return createBetterAuthOptions(authComponent.adapter(ctx), {
      authConfig: options?.authConfig,
      authOptions: options?.authOptions,
      basePath: options?.basePath,
    })
  }

  const createAuthForContext = (ctx: GenericCtx<DM>) => {
    return betterAuth(createAuthOptionsForContext(ctx))
  }

  return {
    authComponent,
    createAuthOptions: createAuthOptionsForContext,
    options: createAuthOptionsForContext({} as GenericCtx<DM>),
    createAuth: createAuthForContext,
    getAuthUser,
  }
}
