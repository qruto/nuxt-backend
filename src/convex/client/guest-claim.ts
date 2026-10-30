import type { FunctionReference, GenericDataModel } from 'convex/server'
import { logBackend } from '../log.js'
import { requestVisitor } from '../visitor.js'
import { creationByPerson } from './age-gate.js'
import type { AuthMutationCtx, AuthSetupComponents } from './auth-types.js'
import { asMutationCtx, type AuthRuntime } from './runtime.js'

// The claim at sign-up: an account a person creates in a browser that
// started guest jobs signed out (`defineJobQueue({ guest })`) takes them.
// The browser is known by the visitor cookie the app's proof route set,
// which the auth proxy forwards with the sign-up request, and only a cookie
// whose MAC holds under PROTECTION_PROOF_SECRET names one: an id alone
// claims nothing. The component binds the visitor's unclaimed jobs to the
// account and wakes the app's queue, which moves them to the account's
// workspace once its first session made one, and runs the app's claim.

type ClaimVisitorRef = FunctionReference<'mutation', 'internal', { visitor: string, userId: string }, number>

/** What claims a visitor's guest jobs for a new account. */
export interface AuthGuests {
  claim: (ctx: AuthMutationCtx, claim: { visitor: string, userId: string }) => Promise<number>
}

/** The component's claim, when its jobs module exists (a component built before it has none). */
export function componentGuests(components: AuthSetupComponents): AuthGuests | undefined {
  const claimVisitor = (components.backend as { jobs?: { claimVisitor?: ClaimVisitorRef } } | undefined)?.jobs?.claimVisitor
  if (!claimVisitor) return undefined
  return { claim: (ctx, claim) => ctx.runMutation(claimVisitor, claim) }
}

/** A header of the request a database hook runs for, if any. */
function headerOf(hookCtx: unknown, name: string): string | null {
  const request = hookCtx as { headers?: Headers, request?: Request } | null | undefined
  return request?.headers?.get(name) ?? request?.request?.headers.get(name) ?? null
}

/**
 * The protocol the browser used, as the auth proxy forwards it: Better
 * Auth's own `x-better-auth-forwarded-proto`, which the base module's proxy
 * sends, else the first of `x-forwarded-proto` from a proxy of the app's.
 */
function forwardedProtocol(hookCtx: unknown): string | undefined {
  const forwarded = headerOf(hookCtx, 'x-better-auth-forwarded-proto') ?? headerOf(hookCtx, 'x-forwarded-proto')
  return forwarded?.split(',')[0]?.trim().toLowerCase()
}

/**
 * Once a person created an account: the guest jobs of the browser it was
 * created in, claimed. Never fails the sign-up: a claim that cannot run is
 * logged, and the jobs still run as they were.
 */
export async function claimGuestJobs<DM extends GenericDataModel>(runtime: AuthRuntime<DM> | undefined, user: { id: string }, hookCtx: unknown): Promise<void> {
  const ctx = asMutationCtx(runtime?.ctx) as AuthMutationCtx | undefined
  const guests = runtime?.guests
  if (!ctx || !guests || !creationByPerson(hookCtx)) return
  try {
    const visitor = await requestVisitor(headerOf(hookCtx, 'cookie'), forwardedProtocol(hookCtx))
    if (visitor) await guests.claim(ctx, { visitor, userId: user.id })
  }
  catch (error) {
    logBackend('error', 'ai.guest_claim_failed', 'A new account\'s browser had guest jobs, and they could not be claimed; the account was created all the same.', error)
  }
}
