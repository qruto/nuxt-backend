import type { GenericCtx } from '@convex-dev/better-auth'
import type { GenericActionCtx, GenericDataModel, GenericMutationCtx } from 'convex/server'
import type { AuthEmail, AuthMutationCtx, AuthRateLimiter, CanSignIn, OnUserCreated, OnUserDeleted } from './auth-types.js'

// The per-request runtime every auth module reads: the request ctx with the
// resolved integrations, narrowed to one that can run functions, and the
// deployment's environment.

/** Whether an account exists for an email — the adapter read behind `canSignIn`'s `isNewUser`. */
export type UserExists = (ctx: AuthMutationCtx, email: string) => Promise<boolean>

/** Per-request runtime carrying the ctx and resolved integrations. */
export interface AuthRuntime<DM extends GenericDataModel = GenericDataModel> {
  ctx?: GenericCtx<DM>
  email?: AuthEmail
  rateLimiter?: AuthRateLimiter
  onUserCreated?: OnUserCreated<DM>
  canSignIn?: CanSignIn<DM>
  onUserDeleted?: OnUserDeleted<DM>
  userExists?: UserExists
}

/** Narrow the request ctx to one that can run mutations, or `undefined`. */
export function asMutationCtx<DM extends GenericDataModel>(
  ctx?: GenericCtx<DM>,
): GenericMutationCtx<DM> | GenericActionCtx<DM> | undefined {
  return ctx && 'runMutation' in ctx ? ctx : undefined
}

type AdapterWhere = Array<{ field: string, value: unknown }>

/** The part of the Better Auth adapter the package's database hooks use. */
export interface AuthHookAdapter {
  findOne: (args: { model: string, where: AdapterWhere }) => Promise<unknown>
  create: (args: { model: string, data: Record<string, unknown> }) => Promise<unknown>
  deleteMany: (args: { model: string, where: AdapterWhere }) => Promise<unknown>
}

/** The adapter a database hook's endpoint context carries (`undefined` outside a request). */
export function hookAdapter(hookCtx: unknown): AuthHookAdapter | undefined {
  return (hookCtx as { context?: { adapter?: AuthHookAdapter } } | undefined)?.context?.adapter
}

type EnvHost = typeof globalThis & {
  process?: {
    env?: Record<string, string | undefined>
  }
}

/** A deployment environment variable, or `undefined` where `process.env` is absent. */
export function readEnv(name: string) {
  return (globalThis as EnvHost).process?.env?.[name]
}
