import { createClient } from '@convex-dev/better-auth'
import type { FunctionReference, GenericDataModel } from 'convex/server'
import { authSchema } from '../components/backend/schema.js'
import type { AuthComponentApi, AuthIntegrations, AuthSetupComponents, PublicAuthComponentRef } from './auth-types.js'
import type { AuthRuntime, UserExists } from './runtime.js'

// The `backend` component as auth setup reads it: the Better Auth client over
// its adapter, the adapter's function refs, and the integrations the component
// provides on its own (the email transport, the account lookup).

type DefaultAuthSchema = typeof authSchema

function toAuthComponentApi(componentRef: PublicAuthComponentRef): AuthComponentApi {
  return componentRef as AuthComponentApi
}

export function createAuthComponent<DM extends GenericDataModel>(componentRef: PublicAuthComponentRef) {
  return createClient<DM, DefaultAuthSchema>(
    toAuthComponentApi(componentRef),
    { local: { schema: authSchema } } as never,
  )
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
