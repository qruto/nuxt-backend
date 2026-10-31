import type { Auth } from 'convex/server'
import { backendError } from '../../errors.js'
import { type CallerRule, refuseCaller } from '../access.js'
import type { BillingContext } from './context.js'
import type { RunQueryCtx } from './types/base.js'
import type { BillingAccessRule } from './types/setup.js'

/**
 * Who may buy and receive gifts. Buying and claiming are done in the
 * person's name, so never by an administrator impersonating them, and a
 * claim is the recipient's own. The entity a gift is bought
 * from and claimed into is one the person manages: what an app's own
 * `resolveEntity` is asked for.
 */
export const GIFT_ACCESS = {
  buy: { access: 'manage', impersonation: 'refused' },
  claim: { access: 'manage', impersonation: 'refused' },
} as const satisfies Record<string, BillingAccessRule>

/** The account as the user table holds it now (see `BillingContext.account`). */
type AccountReader = BillingContext['account']

/**
 * The caller's identity as a gift needs it, or the refusal: nobody signed
 * in, a token the rule refuses, or an account banned or deleted since its
 * token was minted (read fresh).
 */
export async function giftCaller(ctx: RunQueryCtx & { auth: Auth }, what: string, rule: CallerRule, account: AccountReader) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw backendError('unauthenticated', {}, `[nuxt-backend] ${what}: sign in first.`)
  const claims = identity as unknown as Record<string, unknown>
  refuseCaller(claims, rule, what)
  const stored = await account(ctx, identity.subject)
  if (!stored) throw backendError('unauthenticated', {}, `[nuxt-backend] ${what}: this account no longer exists.`)
  if (stored.banned) throw backendError('forbidden', { reason: 'banned' }, `[nuxt-backend] ${what}: this account is banned.`)
  return {
    claims,
    userId: identity.subject,
    email: typeof claims.email === 'string' ? claims.email.toLowerCase() : '',
    // Proven by a sign-in code: what lets an address claim what was sent to it.
    emailVerified: claims.emailVerified === true,
    name: typeof claims.name === 'string' ? claims.name : undefined,
  }
}
