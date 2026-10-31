import { createClient, type CreateAuth, type GenericCtx } from '@convex-dev/better-auth'
import { type FunctionReference, type GenericDataModel, queryGeneric } from 'convex/server'
import { authSchema } from '../components/backend/schema.js'
import { backendError } from '../errors.js'
import { setupAccount } from '../integrations/account.js'
import { setupAudit } from '../integrations/audit.js'
import { identitySessionId } from './identity.js'
import type { AuthComponentApi, AuthIntegrations, AuthSetupComponents, PublicAuthComponentRef } from './auth-types.js'
import type { AuthRuntime, ChannelOpen, DeviceCheck, SeenDevice, SuppressionCheck, UserExists } from './runtime.js'
import { pauseCheck } from '../pauses.js'
import { componentGuests } from './guest-claim.js'

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
 * Upstream reads the caller through their session. The readers that start
 * from the identity keep its session check, so a revoked session still reads
 * as signed out, and an identity that names no session reads as signed out,
 * not as an error.
 */
export function createAuthComponent<DM extends GenericDataModel>(componentRef: PublicAuthComponentRef) {
  const client = createClient<DM, DefaultAuthSchema>(
    toAuthComponentApi(componentRef),
    { local: { schema: authSchema } } as never,
  )

  const safeGetAuthUser: typeof client.safeGetAuthUser = async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return undefined
    return identitySessionId(identity) ? client.safeGetAuthUser(ctx) : undefined
  }

  const getAuthUser: typeof client.getAuthUser = async (ctx) => {
    const user = await safeGetAuthUser(ctx)
    if (!user) throw backendError('unauthenticated', {}, 'Unauthenticated')
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
  // reads through the wrapper above.
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

/**
 * The audit trail the auth layer records on when the app passes no
 * `audit`: the component's own, with no `onEvent`. `undefined` without
 * the component's audit module (a component built before it).
 */
function componentAudit(components: AuthSetupComponents): AuthRuntime['audit'] {
  const backend = components.backend as { audit?: unknown, adapter?: unknown } | undefined
  return backend?.audit && backend.adapter ? setupAudit(components) : undefined
}

/**
 * What erases an account when the app passes no `account`: the
 * component's own participants, with nothing of the providers' or the
 * app's. `undefined` without the component's account module (a component
 * built before it).
 */
function componentAccount(components: AuthSetupComponents): AuthRuntime['account'] {
  const backend = components.backend as { account?: unknown, adapter?: unknown } | undefined
  if (!backend?.account || !backend.adapter) return undefined
  // No grace period without the app's own instance: the scheduled erasure runs the app's `eraseAccountData`, which only `backend/account.ts` exports.
  const { scheduleDeletion: _scheduleDeletion, ...immediate } = setupAccount(components)
  return immediate
}

/** The suppression copy's read, in a backend component that keeps one. */
function componentSuppressions(components: AuthSetupComponents): SuppressionCheck | undefined {
  const isSuppressed = (components.backend as { suppressions?: { isSuppressed?: FunctionReference<'query', 'internal', { email: string }, boolean> } } | undefined)?.suppressions?.isSuppressed
  if (!isSuppressed) return undefined
  return async (ctx, email) => await ctx.runQuery(isSuppressed, { email: email.trim().toLowerCase() })
}

/** The known devices' check, in a backend component that keeps them. */
function componentDevices(components: AuthSetupComponents): DeviceCheck | undefined {
  const see = (components.backend as { devices?: { see?: FunctionReference<'mutation', 'internal', SeenDevice & Record<string, unknown>, { alert: boolean, email: boolean }> } } | undefined)?.devices?.see
  if (!see) return undefined
  return async (ctx, device) => await ctx.runMutation(see, { ...device })
}

/** The notification channel gates, in a backend component that keeps the choices. */
function componentChannelOpen(components: AuthSetupComponents): ChannelOpen | undefined {
  const channelOpen = (components.backend as { notifications?: { channelOpen?: FunctionReference<'mutation', 'internal', { userId: string, type: string, channel: 'app' | 'email' | 'push' }, boolean> } } | undefined)?.notifications?.channelOpen
  if (!channelOpen) return undefined
  return async (ctx, userId, type, channel) => await ctx.runMutation(channelOpen, { userId, type, channel })
}

/** The consumer's integrations, plus the adapter-backed account lookup, the audit trail, the erasure and the kill switches. */
export function resolveIntegrations<DM extends GenericDataModel>(
  components: AuthSetupComponents,
  integrations: AuthIntegrations<DM>,
): Omit<AuthRuntime<DM>, 'ctx'> {
  const userExists = componentUserExists(components)
  const audit = integrations.audit ?? componentAudit(components)
  const account = integrations.account ?? componentAccount(components)
  const guests = componentGuests(components)
  const suppressed = componentSuppressions(components)
  const devices = componentDevices(components)
  const channelOpen = componentChannelOpen(components)
  return {
    ...(userExists ? { userExists } : {}),
    ...integrations,
    ...(audit ? { audit } : {}),
    ...(account ? { account } : {}),
    ...(guests ? { guests } : {}),
    ...(suppressed ? { suppressed } : {}),
    ...(devices ? { devices } : {}),
    ...(channelOpen ? { channelOpen } : {}),
    paused: pauseCheck(components.backend),
  }
}
