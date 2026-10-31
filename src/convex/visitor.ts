import { deploymentAudience, protectionEnv, readVisitor, visitorCookieOf } from './proof.js'

// The visitor on the deployment's side: the one a call's proof was bound to,
// as `verifyHuman` checked it, kept for `jobs.enqueue` in the same function;
// and the one the visitor cookie names on an auth request, which the account
// created by that request claims.

/** The visitor each function call proved, by its ctx (and its `db`, which a wrapped ctx keeps). */
const proven = new WeakMap<object, string>()

/** The `db` a ctx carries, when it is an object. */
function dbOf(ctx: object): object | undefined {
  const db = (ctx as { db?: unknown }).db
  return typeof db === 'object' && db !== null ? db : undefined
}

/**
 * Keep the visitor a proof was bound to, for this call only: `verifyHuman`
 * does, once the proof's signature held.
 *
 * @internal
 */
export function rememberVisitor(ctx: object, visitorId: string): void {
  proven.set(ctx, visitorId)
  const db = dbOf(ctx)
  if (db) proven.set(db, visitorId)
}

/**
 * The visitor `verifyHuman` proved in this call, or `undefined`: what
 * `jobs.enqueue` puts a signed-out caller's guest job under.
 *
 * @internal
 */
export function provenVisitor(ctx: object): string | undefined {
  const db = dbOf(ctx)
  return proven.get(ctx) ?? (db ? proven.get(db) : undefined)
}

/**
 * The visitor a request's cookie names, when its MAC holds under the
 * deployment's `PROTECTION_PROOF_SECRET` for this deployment; `null`
 * without a cookie, a secret, or a MAC that holds. `protocol` is the one
 * the browser used, as the auth proxy forwards it (`x-better-auth-forwarded-proto`):
 * only `http` reads the unprefixed cookie.
 *
 * @internal
 */
export async function requestVisitor(cookieHeader: string | null | undefined, protocol?: string | null): Promise<string | null> {
  const { proofSecret } = protectionEnv()
  const value = visitorCookieOf(cookieHeader, { secure: protocol !== 'http' })
  if (!proofSecret || !value) return null
  return await readVisitor(proofSecret, value, deploymentAudience())
}
