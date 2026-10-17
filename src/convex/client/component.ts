import { createClient, type CreateAuth, type GenericCtx } from '@convex-dev/better-auth'
import { type FunctionReference, type GenericDataModel, queryGeneric } from 'convex/server'
import { ConvexError } from 'convex/values'
import { authSchema } from '../components/backend/schema.js'
import { identityClientId, identitySessionId } from './identity.js'
import type { AuthComponentApi, AuthIntegrations, AuthSetupComponents, PublicAuthComponentRef } from './auth-types.js'
import type { AuthRuntime, UserExists } from './runtime.js'

// The `backend` component as auth setup reads it: the Better Auth client over
// its adapter, the adapter's function refs, and the integrations the component
// provides on its own (the email transport, the account lookup).

type DefaultAuthSchema = typeof authSchema

function toAuthComponentApi(componentRef: PublicAuthComponentRef): AuthComponentApi {
  return componentRef as AuthComponentApi
}

/**
 * The Better Auth client over the `backend` component, with the auth schema
 * the component owns locally (the hybrid component pattern).
 *
 * Upstream reads the caller through their session, and an agent token from
 * the MCP exchange belongs to none: its lookup ran with no session id and
 * threw a validator error for every agent. So the readers that start from
 * the identity tell the two apart by the token's `clientId` claim. An agent
 * reads its account by the token's subject (a banned or deleted account
 * reads as signed out, as the exchange refuses one); a session caller keeps
 * upstream's session check, so a revoked session still reads as signed out;
 * and an identity with neither reads as signed out, not as an error.
 */
export function createAuthComponent<DM extends GenericDataModel>(componentRef: PublicAuthComponentRef) {
  const client = createClient<DM, DefaultAuthSchema>(
    toAuthComponentApi(componentRef),
    { local: { schema: authSchema } } as never,
  )

  const safeGetAuthUser: typeof client.safeGetAuthUser = async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return undefined
    if (identityClientId(identity)) {
      const user = await client.getAnyUserById(ctx, identity.subject)
      return user && !user.banned ? user : undefined
    }
    return identitySessionId(identity) ? client.safeGetAuthUser(ctx) : undefined
  }

  const getAuthUser: typeof client.getAuthUser = async (ctx) => {
    const user = await safeGetAuthUser(ctx)
    if (!user) throw new ConvexError('Unauthenticated')
    return user
  }

  // No session, no session token: Better Auth reads the call as signed out.
  const getHeaders: typeof client.getHeaders = async ctx =>
    identitySessionId(await ctx.auth.getUserIdentity()) ? client.getHeaders(ctx) : new Headers()

  const getAuth: typeof client.getAuth = async <T extends CreateAuth<DM>>(createAuth: T, ctx: GenericCtx<DM>) => ({
    auth: createAuth(ctx) as ReturnType<T>,
    headers: await getHeaders(ctx),
  })

  // Upstream's registered query closes over its own session reader; this one
  // reads through the wrapper above, so an app that registers it serves agents too.
  const clientApi: typeof client.clientApi = () => ({
    getAuthUser: queryGeneric({ args: {}, handler: async ctx => await getAuthUser(ctx as never) }),
  }) as ReturnType<typeof client.clientApi>

  return { ...client, safeGetAuthUser, getAuthUser, getHeaders, getAuth, clientApi }
}

/** The component adapter refs the workspace/profile functions query through. */
type AdapterWhere = Array<{ field: string, value: string | number | boolean | null }>
type AdapterFindOneRef = FunctionReference<'query', 'internal', { model: string, where?: AdapterWhere }, unknown>
type AdapterFindManyRef = FunctionReference<'query', 'internal', {
  model: string
  where?: AdapterWhere
  sortBy?: { field: string, direction: 'asc' | 'desc' }
  paginationOpts: { numItems: number, cursor: string | null }
}, { page: unknown[], isDone: boolean, continueCursor: string }>
type AdapterUpdateOneRef = FunctionReference<'mutation', 'internal', {
  input: { model: string, update: Record<string, unknown>, where?: AdapterWhere }
}, unknown>

export interface AdapterRefs {
  findOne: AdapterFindOneRef
  findMany: AdapterFindManyRef
  updateOne: AdapterUpdateOneRef
}

/**
 * Read the component's adapter function refs structurally: the loose
 * component-ref type doesn't surface them.
 */
export function componentAdapterRefs(components: AuthSetupComponents): AdapterRefs {
  return (components.backend as unknown as { adapter: AdapterRefs }).adapter
}

/**
 * The account-exists read behind `canSignIn`'s `isNewUser`, over the
 * `backend` component's adapter (`components.backend.adapter.findOne`, read
 * structurally like {@link componentAdapterRefs}). `undefined` without an
 * adapter module, in which case every sign-in request counts as a new user.
 */
function componentUserExists(components: AuthSetupComponents): UserExists | undefined {
  const findOne = (components.backend as { adapter?: { findOne?: AdapterFindOneRef } } | undefined)?.adapter?.findOne
  if (!findOne) return undefined
  return async (ctx, email) => {
    const user = await ctx.runQuery(findOne, {
      model: 'user',
      where: [{ field: 'email', value: email.trim().toLowerCase() }],
    })
    return user !== null && user !== undefined
  }
}

/** The consumer's integrations, plus the adapter-backed account lookup. */
export function resolveIntegrations<DM extends GenericDataModel>(
  components: AuthSetupComponents,
  integrations: AuthIntegrations<DM>,
): Omit<AuthRuntime<DM>, 'ctx'> {
  const userExists = componentUserExists(components)
  return {
    ...(userExists ? { userExists } : {}),
    ...integrations,
  }
}
