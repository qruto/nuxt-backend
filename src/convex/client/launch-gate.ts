import { constantTimeEqual } from 'better-auth/crypto'
import type { GenericDataModel } from 'convex/server'
import type { AccessGate, AccessPhase, AccessTicket, WaitlistRecord } from '../access-tickets.js'
import { readEnv } from '../delivery.js'
import { DEFAULT_WAITLIST_PATH } from '../constants.js'
import { logBackend } from '../log.js'
import { requestLocale } from './request-origin.js'
import type { AuthMutationCtx, AuthRateLimitName } from './auth-types.js'
import { keyedCodeHash } from './codes.js'
import type { AuthHookCtx } from './request-session.js'
import { authRefusal } from './refusals.js'
import { type AuthLibrarySecretConfig, contextSecrets } from '../auth-secrets.js'
import { type AuthRuntime, asMutationCtx } from './runtime.js'

// The launch phase on Better Auth's own routes: a new address in a closed
// phase gets its sign-in code like anyone (the same answer, the same cookie),
// and only once the code checks does it learn whether it holds a ticket.
// The check's request guard answers `forbidden` (`ticket_required`) before
// the route uses the code up, so the person can type an invite code and
// send the same code again; the account's creation takes the ticket in one
// transaction (`user.create.before`), and names the account on its ledger
// row once it exists (`user.create.after`).

/** The route that signs in, or up, with a code. */
const SIGN_IN_PATH = '/sign-in/email-otp'
/** The route an administrator creates an account through. */
const ADMIN_CREATE_PATH = '/admin/create-user'
/** The emailOTP plugin's attempt limit, as the package sets it. */
const ALLOWED_ATTEMPTS = 3

/** The body field an invite code or an access link's token rides in, on the code check. */
export const INVITE_FIELD = 'inviteCode'

/** The body field a code check names its waitlist join by: the key `joinWaitlist` answered. */
export const WAITLIST_JOIN_FIELD = 'waitlistJoin'

/** The waitlist join a code check carries, if any. */
function waitlistJoinOf(ctx: unknown): string | undefined {
  const key = bodyOf(ctx)[WAITLIST_JOIN_FIELD]
  return typeof key === 'string' && key.trim() ? key.trim().slice(0, 64) : undefined
}

/** A hook context's JSON body, or nothing. */
export function bodyOf(ctx: unknown): Record<string, unknown> {
  const body = (ctx as { body?: unknown } | null | undefined)?.body
  return body && typeof body === 'object' ? body as Record<string, unknown> : {}
}

/** The invite code a request carries, if any. */
function inviteOf(ctx: unknown): string | undefined {
  const code = bodyOf(ctx)[INVITE_FIELD]
  return typeof code === 'string' && code.trim() ? code.trim() : undefined
}

/**
 * The refusal of a new address with no ticket: the step it meets, how its
 * invite code checked, and, in early access, the place its entry holds
 * (what the `waitlisted` step shows).
 */
function ticketRequired(phase: AccessPhase, invite: string | null, waitlist?: WaitlistRecord) {
  return authRefusal('forbidden', {
    reason: 'ticket_required',
    phase,
    ...(invite ? { invite } : {}),
    ...(waitlist?.position ? { waitlist: { position: waitlist.position, total: waitlist.total, token: waitlist.token } } : {}),
  })
}

/**
 * A new address's code checked in early access: its waitlist entry is
 * recorded (once), the join lands on the activity trail, and the first time
 * the person gets one email with the link that shows their place. Neither
 * the event nor the email can fail the check: the entry stands either way.
 */
async function recordWaitlistEntry<DM extends GenericDataModel>(runtime: AuthRuntime<DM> | undefined, ctx: AuthMutationCtx, request: AuthHookCtx, waitlist: NonNullable<AccessGate['waitlist']>, email: string): Promise<WaitlistRecord> {
  const locale = requestLocale(request) ?? undefined
  const join = waitlistJoinOf(request)
  const entry = await waitlist(ctx, { email, ...(join ? { join } : {}), ...(locale ? { locale } : {}) })
  if (!entry.created) return entry
  try {
    await runtime?.audit?.recordBackendEvent(ctx as never, { type: 'waitlist.joined', actor: null, data: { source: entry.source, referred: entry.referred, news: entry.news } })
  }
  catch (error) {
    logBackend('warn', 'waitlist.confirmation_unsent', 'A new waitlist entry was recorded, but its join event did not reach the activity trail; the entry stands.', error)
  }
  const site = readEnv('SITE_URL')?.replace(/\/+$/, '')
  try {
    if (!runtime?.email || !site) throw new Error(site ? 'no email instance is wired into setupAuth' : 'SITE_URL is not set')
    await runtime.email.sendTemplate(ctx, 'waitlistConfirmation', {
      email,
      statusUrl: `${site}${runtime?.paths?.waitlist ?? DEFAULT_WAITLIST_PATH}#${entry.token}`,
      ...(entry.position ? { position: entry.position, total: entry.total } : {}),
    }, { ...(locale ? { fallbackLocale: locale } : {}), idempotencyKey: `nuxt-backend:waitlist:${entry.id}` })
  }
  catch (error) {
    logBackend('warn', 'waitlist.confirmation_unsent', 'A new waitlist entry was recorded, but its confirmation email was not sent; the entry stands.', error)
  }
  return entry
}

/**
 * Whether `otp` is the live sign-in code of `address`, without using it
 * up or counting an attempt: the emailOTP plugin's own row
 * (`<keyed hash>:<attempts>`), checked as the plugin checks it.
 */
export async function codeMatches(request: AuthHookCtx, address: string, otp: unknown): Promise<boolean> {
  if (typeof otp !== 'string' || !otp) return false
  const row = await request.context.internalAdapter.findVerificationValue(`sign-in-otp-${address}`)
  if (!row || new Date(row.expiresAt).getTime() <= Date.now()) return false
  const at = row.value.lastIndexOf(':')
  const stored = at === -1 ? row.value : row.value.slice(0, at)
  const attempts = at === -1 ? 0 : Number.parseInt(row.value.slice(at + 1), 10)
  if (attempts >= ALLOWED_ATTEMPTS) return false
  // Stored under the oldest live secret, which a rotation keeps until it retires.
  const secrets = contextSecrets(request.context as { secret: string, secretConfig?: AuthLibrarySecretConfig })
  return constantTimeEqual(await keyedCodeHash(secrets.at(-1)).hash(otp.trim()), stored)
}

/**
 * The global limit a sign-in code request spends: `signUpOtpGlobal` for an
 * address with no account while the launch gate is wired, so a rush of
 * joins never holds up existing people's codes; else the route's own
 * (`fallback`). Says whether the address is new, when it was read.
 */
export async function codeRequestBudget<DM extends GenericDataModel>(runtime: AuthRuntime<DM>, ctx: AuthMutationCtx, type: unknown, email: string, fallback: AuthRateLimitName | undefined): Promise<{ newAddress?: boolean, global: AuthRateLimitName | undefined }> {
  if (!runtime.access || type !== 'sign-in' || !runtime.userExists) return { global: fallback }
  const newAddress = !(await runtime.userExists(ctx, email))
  return { newAddress, global: newAddress ? 'signUpOtpGlobal' : fallback }
}

/**
 * The address a code check is for, when it is a sign-in code check of an
 * address with no account (the only one the launch phase and the minimum
 * age ask anything of), with the code typed; `null` for any other request.
 */
export async function newAddressCheck<DM extends GenericDataModel>(runtime: AuthRuntime<DM> | undefined, request: AuthHookCtx): Promise<{ address: string, otp: unknown } | null> {
  const ctx = asMutationCtx(runtime?.ctx)
  if (request.path !== SIGN_IN_PATH || !ctx) return null
  const { email, otp } = bodyOf(request)
  if (typeof email !== 'string' || !email) return null
  const address = email.trim().toLowerCase()
  return runtime?.userExists && await runtime.userExists(ctx, address) ? null : { address, otp }
}

/**
 * The code check of a new address in a closed phase with no ticket:
 * refused as `forbidden` (`ticket_required`) once its code checks, before
 * the route uses it up. A wrong code goes on to the route, which refuses
 * and counts it like any other.
 */
export async function assertTicketBeforeCode<DM extends GenericDataModel>(runtime: AuthRuntime<DM> | undefined, request: AuthHookCtx): Promise<void> {
  const access = runtime?.access
  const ctx = asMutationCtx(runtime?.ctx)
  if (!access || !ctx) return
  const checked = await newAddressCheck(runtime, request)
  if (!checked) return
  const { address, otp } = checked
  const decision = await access.admission(ctx, { email: address, code: inviteOf(request) })
  if (decision.phase === 'public' || decision.ticket) return
  if (await codeMatches(request, address, otp)) {
    // In early access the verified address joins the waitlist (the double opt-in), and learns its place.
    const waiting = decision.phase === 'early-access' && access.waitlist ? await recordWaitlistEntry(runtime, ctx, request, access.waitlist, address) : undefined
    throw ticketRequired(decision.phase, decision.invite, waiting)
  }
}

/** How an account is being created: by an administrator, or by the person (anything else, failing closed). */
function creationOrigin(hookCtx: unknown): 'administrator' | 'person' {
  return (hookCtx as { path?: unknown } | null | undefined)?.path === ADMIN_CREATE_PATH ? 'administrator' : 'person'
}

/** What an account's creation decided: the ticket it holds, before it is taken. */
export interface CreationTicket {
  ticket: AccessTicket | null
  /** Take it: answers the ticket taken, or throws `ticket_required` when another sign-up took the last use. */
  take: () => Promise<{ ticket: AccessTicket, label?: string } | null>
}

/**
 * Before an account is created: the phase and the ticket that admits its
 * address, read once. An administrator's creation needs none. A closed
 * phase with no ticket refuses (`ticket_required`).
 */
export async function creationTicket(access: AccessGate, ctx: AuthMutationCtx, email: string, hookCtx: unknown): Promise<CreationTicket> {
  const code = inviteOf(hookCtx)
  if (creationOrigin(hookCtx) === 'administrator') {
    return { ticket: 'administrator', take: () => access.redeem(ctx, { email, ticket: 'administrator' }) as Promise<{ ticket: AccessTicket }> }
  }
  const decision = await access.admission(ctx, { email, code })
  if (decision.phase === 'public') return { ticket: null, take: async () => null }
  if (!decision.ticket) throw ticketRequired(decision.phase, decision.invite)
  const ticket = decision.ticket
  return {
    ticket,
    take: async () => {
      const taken = await access.redeem(ctx, { email, code, ticket })
      if ('refused' in taken) throw ticketRequired(decision.phase, taken.refused === 'valid' ? null : taken.refused)
      return taken
    },
  }
}

/**
 * Once an account exists: its ledger row names it, and the ticket lands on
 * the activity trail as `access.ticket_used`. Never fails the sign-up.
 * Returns what admitted it, as the growth funnel's invite: the ticket's
 * label, else its kind; `undefined` for no ticket.
 */
export async function recordTicketUsed<DM extends GenericDataModel>(runtime: AuthRuntime<DM> | undefined, user: { id: string, email: string }): Promise<string | undefined> {
  const ctx = asMutationCtx(runtime?.ctx)
  if (!runtime?.access || !ctx) return undefined
  try {
    const used = await runtime.access.attach(ctx, { email: user.email, userId: user.id })
    if (used && runtime.audit) {
      await runtime.audit.recordBackendEvent(ctx as never, { type: 'access.ticket_used', actor: { userId: user.id }, subjectId: user.id, data: { ticket: used.ticket, ...(used.label ? { label: used.label } : {}) } })
    }
    return used ? used.label || used.ticket : undefined
  }
  catch (error) {
    logBackend('warn', 'access.ticket_unrecorded', 'A new account\'s ticket was taken but not recorded against it; the account was created.', error)
    return undefined
  }
}
