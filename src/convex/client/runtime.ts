import type { GenericCtx } from '@convex-dev/better-auth'
import type { GenericActionCtx, GenericDataModel, GenericMutationCtx } from 'convex/server'
import type { AuthAccount, AuthAudit, AuthEmail, AuthMutationCtx, AuthRateLimiter, CanSignIn, OnUserCreated, OnUserDeleted } from './auth-types.js'
import type { PauseCheck } from '../pauses.js'
import type { EntityCreatedListener, EntityDeletionGuard } from './entities.js'
import type { AccessGate } from '../access-tickets.js'
import type { BackendPaths } from '../paths.js'
import type { AuthGuests } from './guest-claim.js'

export { readEnv } from '../delivery.js'

// The per-request runtime every auth module reads: the request ctx with the
// resolved integrations, narrowed to one that can run functions, and the
// deployment's environment.

/** Whether an account exists for an email — the adapter read behind `canSignIn`'s `isNewUser`. */
export type UserExists = (ctx: AuthMutationCtx, email: string) => Promise<boolean>

/** Whether the email provider suppressed an address, as the backend component's copy of its list knows it: one indexed read. */
export type SuppressionCheck = (ctx: AuthMutationCtx, email: string) => Promise<boolean>

/** A sign-in's device, as the new-device check notes it. */
export interface SeenDevice {
  userId: string
  /** HMAC of the browser, the system and the network range, bound to the account. */
  fingerprint: string
  /** HMAC of the browser and the system alone. */
  device: string
  browser?: string
  os?: string
  recovery?: boolean
  sessionId?: string
  /** The same hashes under the older live secrets, newest first, while a rotation's window runs. */
  previous?: Array<{ fingerprint: string, device: string }>
}

/** Note a sign-in's device on the account's known devices, and answer whether it is news (`alert`) and claims the day's email (`email`). */
export type DeviceCheck = (ctx: AuthMutationCtx, device: SeenDevice) => Promise<{ alert: boolean, email: boolean }>

/** Whether a person's channel choices let one kind through one channel: the notifications' gates, for an email the auth layer sends itself. */
export type ChannelOpen = (ctx: AuthMutationCtx, userId: string, type: string, channel: 'app' | 'email' | 'push') => Promise<boolean>

/** Per-request runtime carrying the ctx and resolved integrations. */
export interface AuthRuntime<DM extends GenericDataModel = GenericDataModel> {
  ctx?: GenericCtx<DM>
  email?: AuthEmail
  rateLimiter?: AuthRateLimiter
  onUserCreated?: OnUserCreated<DM>
  canSignIn?: CanSignIn<DM>
  onUserDeleted?: OnUserDeleted<DM>
  userExists?: UserExists
  /** Where the auth layer records its events: the app's audit instance, else one of its own over the component. */
  audit?: AuthAudit
  /** Whether a service is paused by its kill switch: `signups` refuses every new account. */
  paused?: PauseCheck
  /** What erases a deleted account and refuses deleting a workspace's only owner: the app's account instance, else one of its own over the component. */
  account?: AuthAccount
  /** The launch gate: the phase and the ticket a new address signs up with (`setupAuth({ access })`). */
  access?: AccessGate
  /** Who hears of each workspace or account made: billing, once `registerBackendRoutes` connects it. */
  entityCreated?: () => readonly EntityCreatedListener[]
  /** What may refuse the deletion of a workspace: billing, while it holds a paid subscription, once `registerBackendRoutes` connects it. */
  entityDeleting?: () => readonly EntityDeletionGuard[]
  /** The app's paths the auth emails link to (`setupAuth({ paths })`, resolved). */
  paths?: BackendPaths
  /** What claims a visitor's guest jobs for the account created in their browser: the component's job queue. */
  guests?: AuthGuests
  /** The email provider's suppression list, mirrored: a sign-in code to a suppressed address is refused before it is minted. */
  suppressed?: SuppressionCheck
  /** The account's known devices: a new one is alerted. */
  devices?: DeviceCheck
  /** The person's notification channel choices: the new-device email asks them before it goes. */
  channelOpen?: ChannelOpen
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
