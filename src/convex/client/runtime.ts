import type { GenericCtx } from '@convex-dev/better-auth'
import type { GenericActionCtx, GenericDataModel, GenericMutationCtx } from 'convex/server'
import type { AuthEmailSender, AuthEmailTemplates, AuthMutationCtx, AuthRateLimiter, CanSignIn, OnUserCreated, OnUserDeleted } from './auth-types.js'

// The per-request runtime every auth module reads: the request ctx with the
// resolved integrations, narrowed to one that can run functions, and the
// deployment's environment.

/** Whether an account exists for an email — the adapter read behind `canSignIn`'s `isNewUser`. */
export type UserExists = (ctx: AuthMutationCtx, email: string) => Promise<boolean>

/** Per-request runtime carrying the ctx and resolved integrations. */
export interface AuthRuntime<DM extends GenericDataModel = GenericDataModel> {
  ctx?: GenericCtx<DM>
  email?: AuthEmailSender
  rateLimiter?: AuthRateLimiter
  onUserCreated?: OnUserCreated<DM>
  canSignIn?: CanSignIn<DM>
  onUserDeleted?: OnUserDeleted<DM>
  userExists?: UserExists
  emailTemplates?: Partial<AuthEmailTemplates>
}

/** Narrow the request ctx to one that can run mutations, or `undefined`. */
export function asMutationCtx<DM extends GenericDataModel>(
  ctx?: GenericCtx<DM>,
): GenericMutationCtx<DM> | GenericActionCtx<DM> | undefined {
  return ctx && 'runMutation' in ctx ? ctx : undefined
}

type EnvHost = typeof globalThis & {
  process?: {
    env?: Record<string, string | undefined>
  }
}

export function readEnv(name: string) {
  return (globalThis as EnvHost).process?.env?.[name]
}
