import type { GenericDataModel } from 'convex/server'
import { AGE_FIELD, readAge, UNDER_AGE_SECONDS } from '../consent-rules.js'
import { logBackend } from '../log.js'
import { bodyOf, codeMatches, newAddressCheck } from './launch-gate.js'
import type { AuthHookCtx } from './request-session.js'
import { authRefusal } from './refusals.js'
import { type AuthRuntime, asMutationCtx } from './runtime.js'

// The minimum age on Better Auth's own routes (`setupAccount({ minimumAge })`).
// A new address gets its sign-in code like anyone; once that code checks, and
// only then, it learns it must say how old it is: the request's guard answers
// `forbidden` (`age_required`) before the route uses the code up, and the
// person sends the same code again with the age typed. An age under the
// minimum is refused for good (`under_age`), and the browser keeps the
// refusal for a day in an HttpOnly cookie, so a second answer cannot follow
// at once. The account's creation checks the age again on every route, and
// records only that the person passed the minimum, never the number.

/** The route an administrator creates an account through. */
const ADMIN_CREATE_PATH = '/admin/create-user'
/** The cookie that keeps an under-age answer in this browser, under Better Auth's prefix. */
const UNDER_AGE_COOKIE = 'under_age'

/** The refusal of an age under the minimum. */
const underAge = () => authRefusal('forbidden', { reason: 'under_age' })

/** The refusal of a new account that gave no age. */
const ageRequired = () => authRefusal('forbidden', { reason: 'age_required' })

/** The cookie as this request writes it: HttpOnly, on the auth route, for a day. */
function underAgeCookie(ctx: AuthHookCtx, maxAge: number) {
  return ctx.context.createAuthCookie(UNDER_AGE_COOKIE, { maxAge, path: ctx.context.options.basePath || '/' })
}

/** A `Set-Cookie` value: a refusal carries it itself, because a cookie set on the request is dropped when a before-hook throws. */
function setCookieHeader(name: string, value: string, attributes: { maxAge?: number, path?: string, secure?: boolean, httpOnly?: boolean, sameSite?: string }): string {
  const sameSite = attributes.sameSite ? attributes.sameSite.charAt(0).toUpperCase() + attributes.sameSite.slice(1).toLowerCase() : undefined
  return [
    `${name}=${encodeURIComponent(value)}`,
    attributes.maxAge !== undefined ? `Max-Age=${attributes.maxAge}` : '',
    attributes.path ? `Path=${attributes.path}` : '',
    attributes.httpOnly ? 'HttpOnly' : '',
    attributes.secure ? 'Secure' : '',
    sameSite ? `SameSite=${sameSite}` : '',
  ].filter(Boolean).join('; ')
}

/** Keep an under-age answer in this browser for a day: the refusal itself sets the cookie. */
function refuseBrowser(ctx: AuthHookCtx): never {
  const refusal = underAge()
  try {
    const { name, attributes } = underAgeCookie(ctx, UNDER_AGE_SECONDS)
    refusal.headers = { 'set-cookie': setCookieHeader(name, '1', attributes) }
  }
  catch (error) {
    logBackend('warn', 'consent.under_age_cookie_unset', 'An age under the minimum was refused, but the browser could not be told to remember it; the refusal stands.', error)
  }
  throw refusal
}

/**
 * The code check of a new address, when the app sets a minimum age: refused
 * as `forbidden` (`age_required`) once its code checks, until the age comes
 * with it; an age under the minimum is `under_age`, and so is anything from a
 * browser that answered under it today. A wrong code goes on to the route,
 * which refuses and counts it like any other, and an address with an account
 * is never asked.
 */
export async function assertAgeBeforeCode<DM extends GenericDataModel>(runtime: AuthRuntime<DM> | undefined, request: AuthHookCtx): Promise<void> {
  const minimum = runtime?.account?.gate?.minimumAge
  if (minimum === undefined) return
  const checked = await newAddressCheck(runtime, request)
  if (!checked) return
  const { address, otp } = checked
  // Only the mailbox holder learns of the question: the code has to check first.
  if (!await codeMatches(request, address, otp)) return
  if (request.getCookie(underAgeCookie(request, 0).name)) throw underAge()
  const given = bodyOf(request)[AGE_FIELD]
  if (given === undefined) throw ageRequired()
  const age = readAge(given)
  if (age === null) throw authRefusal('invalid_input', { field: 'age' })
  if (age < minimum) refuseBrowser(request)
}

/**
 * Before an account is created, on every route that creates one: the age
 * typed is a whole number and meets the minimum. Only a person's creation is
 * asked ({@link creationByPerson}); the other accounts are asked at their first visit.
 */
export function assertAgeOnCreate<DM extends GenericDataModel>(runtime: AuthRuntime<DM> | undefined, hookCtx: unknown): void {
  const minimum = runtime?.account?.gate?.minimumAge
  if (minimum === undefined || !creationByPerson(hookCtx)) return
  const given = bodyOf(hookCtx)[AGE_FIELD]
  if (given === undefined) throw ageRequired()
  const age = readAge(given)
  if (age === null) throw authRefusal('invalid_input', { field: 'age' })
  if (age < minimum) throw underAge()
}

/**
 * Whether a person is creating the account through a route (the code
 * sign-in, say): the only creation that is asked an age and agrees to
 * anything. An administrator's creation is not, and neither is one the app's
 * own server code makes outside any request; those accounts are asked at
 * their first visit.
 */
export function creationByPerson(hookCtx: unknown): boolean {
  const path = (hookCtx as { path?: unknown } | null | undefined)?.path
  return typeof path === 'string' && path !== ADMIN_CREATE_PATH
}

/**
 * Once an account exists: what it agreed to at sign-up (every required
 * consent at its current version, and that it passed the minimum age) goes
 * on the ledger, with the consents its address gave before. Never fails the
 * sign-up: the person is asked again at their next page for anything missing.
 * An account nobody asked (see {@link creationByPerson}) agreed to nothing yet: only the consents its address gave before are carried over.
 */
export async function recordSignUpConsents<DM extends GenericDataModel>(runtime: AuthRuntime<DM> | undefined, user: { id: string, email: string }, hookCtx: unknown): Promise<void> {
  const ctx = asMutationCtx(runtime?.ctx)
  const gate = runtime?.account?.gate
  if (!gate || !ctx) return
  try {
    await gate.signUp(ctx as never, { userId: user.id, email: user.email.trim().toLowerCase(), agreed: creationByPerson(hookCtx) })
  }
  catch (error) {
    logBackend('error', 'consent.signup_unrecorded', 'A new account was created, but what it agreed to at sign-up was not recorded on the ledger; the person is asked again.', error)
  }
}
