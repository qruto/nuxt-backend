import { type GenericDataModel, makeFunctionReference, type Scheduler } from 'convex/server'
import { START_FREE_PLAN_FUNCTION } from '../constants.js'
import { logBackend } from '../log.js'
import type { AuthMutationCtx } from './auth-types.js'
import { asMutationCtx, type AuthRuntime } from './runtime.js'

// The billing entities the auth layer makes — a workspace (the organization
// plugin's, or the personal one a first sign-in gets), or an account — told
// to billing, which starts the catalog's free plan for each. Never part of
// the request's outcome: a start that can't be queued is logged, and the
// sign-in or the workspace stands.
//
// Where the auth routes are mounted, `registerBackendRoutes` connects billing
// as a listener: it knows the catalog and queues on the workpool. Anywhere
// else — an app's own function calling `createAuth(ctx).api.*` — nothing
// listens, so the entity is queued by name on the scheduler, and
// `billing:startFreePlan` decides (nothing without a free plan, or for the
// kind billing does not bill).

/** A billing entity the auth layer just made. */
export interface CreatedEntity {
  /** A workspace (an organization), or a user account. */
  kind: 'workspace' | 'user'
  id: string
}

/** What hears of every entity one `setupAuth` makes, in the request that made it. */
export type EntityCreatedListener = (ctx: AuthMutationCtx, entity: CreatedEntity) => Promise<void>

const listeners = new WeakMap<object, EntityCreatedListener[]>()

/**
 * Hear of every entity the auth instances `createAuth` builds make, from
 * the requests they serve. `registerBackendRoutes` connects billing here,
 * on the very `createAuth` it mounts the auth routes with.
 *
 * @internal
 */
export function onEntityCreated(createAuth: object, listener: EntityCreatedListener): void {
  listeners.set(createAuth, [...listeners.get(createAuth) ?? [], listener])
}

/**
 * The listeners of one `createAuth`, read when an entity is made: they are
 * connected after `setupAuth` returns.
 *
 * @internal
 */
export function entityListenersOf(createAuth: object): () => readonly EntityCreatedListener[] {
  return () => listeners.get(createAuth) ?? []
}

/**
 * Queue billing's free-plan start by its function's name, for an entity
 * made where no listener is connected. Nothing without a scheduler (a
 * context outside a Convex function).
 */
async function queueByName(ctx: AuthMutationCtx, entity: CreatedEntity): Promise<void> {
  const scheduler = (ctx as { scheduler?: Scheduler }).scheduler
  if (!scheduler) return
  await scheduler.runAfter(0, makeFunctionReference<'action'>(START_FREE_PLAN_FUNCTION), { entityId: entity.id, kind: entity.kind })
}

/** Tell billing that `entity` was made: its listeners, else its function by name; never failing the request. */
export async function announceEntity<DM extends GenericDataModel>(runtime: AuthRuntime<DM> | undefined, entity: CreatedEntity): Promise<void> {
  const ctx = asMutationCtx(runtime?.ctx) as AuthMutationCtx | undefined
  if (!ctx) return
  const connected = runtime?.entityCreated?.() ?? []
  for (const tell of connected.length > 0 ? connected : [queueByName]) {
    try {
      await tell(ctx, entity)
    }
    catch (error) {
      logBackend('warn', 'billing.free_plan_unqueued', `A new ${entity.kind === 'workspace' ? 'workspace' : 'account'} could not be queued for the free plan; it was created all the same.`, error)
    }
  }
}
