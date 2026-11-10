import { RateLimiter } from '@convex-dev/rate-limiter'
import { type Auth, type FunctionReference, type GenericActionCtx, type GenericDataModel, internalActionGeneric, makeFunctionReference, mutationGeneric, queryGeneric, type RegisteredAction, type RegisteredMutation, type RegisteredQuery } from 'convex/server'
import { v } from 'convex/values'
import {
  ACCESS_PHASES,
  type AccessGate,
  type AccessPhase,
  type AccessTicket,
  ADMISSION_TTL_MS,
  admissionEmail,
  ADMIT_BATCH_MAX,
  cleanAddresses,
  effectivePhase,
  inDomains,
  INVITE_LABEL_MAX,
  INVITE_USES_MAX,
  inviteHash,
  type InviteKind,
  memberTicketToken,
  type InviteStatus,
  newInviteCode,
  newLinkToken,
} from '../access-tickets.js'
import { DEFAULT_ADMIN_ROLES, IMPERSONATED_BY_CLAIM } from '../constants.js'
import { DEFAULT_BOOST, statusToken } from '../waitlist-rules.js'
import { readEnv } from '../delivery.js'
import { authSecrets, liveSecrets } from '../auth-secrets.js'
import { backendError } from '../errors.js'
import type { Audit } from './audit.js'
import type { Referrals } from './referrals.js'
import type { EmailMessage, EmailRenderContext } from '../email-templates.js'
import { logBackend } from '../log.js'
import { type BackendPaths, resolveBackendPaths } from '../paths.js'
import type { EmailPreferences } from './email-preferences.js'
import { type AdapterFindOne, type Administrators, createAccessReads, isAdministratorNow, ownCaller, requireAdministratorInPerson } from './access.js'
import { DEFAULT_LIMITS } from './rate-limit.js'

// Launch phases, invite codes, access links and invitations by address:
// what `backend/access.ts` builds with `setupAccess`, and what `setupAuth`
// asks while a new address signs up (`access`). The rows live in the
// `backend` component (`components/backend/access.ts`); the keyed hashes
// are computed here, where the auth secret is.

/** A context the phase is read in: any query, mutation or action. */
export interface AccessCtx {
  runQuery: GenericActionCtx<GenericDataModel>['runQuery']
  auth: Auth
}

/** A context that writes: a mutation or an action. */
export interface AccessWriteCtx extends AccessCtx {
  runMutation: GenericActionCtx<GenericDataModel>['runMutation']
}

/** The launch phase as `getAccessPhase` answers it. */
export interface AccessPhaseState {
  /** The phase the app is in now. */
  phase: AccessPhase
  /** The phases the app goes through, in order (`setupAccess`'s `phases`). */
  phases: AccessPhase[]
}

/** One invite code or access link as the Access tab lists it: never the code itself. */
export interface AccessInvite {
  id: string
  kind: InviteKind
  label: string
  maxUses: number
  uses: number
  status: InviteStatus
  /** When it stops admitting, epoch ms; `null` for a code with no expiry. */
  expiresAt: number | null
  createdAt: number
}

/** One member's ticket as the Access tab lists it: never its token. */
export interface AccessMemberTicket {
  id: string
  /** The member's account id. */
  holder: string
  /** The member's address; `null` once the account is gone. */
  email: string | null
  maxUses: number
  uses: number
  status: InviteStatus
  /** When it stops admitting, epoch ms. */
  expiresAt: number
  createdAt: number
}

/** One invitation by address as the Access tab lists it. */
export interface AccessAdmission {
  id: string
  email: string
  /** `invitation` for an administrator's, `waitlist` for an admitted waitlist entry. */
  source: 'invitation' | 'waitlist'
  label: string | null
  expiresAt: number
  /** When the address signed up with it; `null` while it waits. */
  usedAt: number | null
  createdAt: number
}

/** Everything the Access tab shows. */
export interface AccessConsole extends AccessPhaseState {
  /** The newest codes and links, at most 200: the administrators' and server code's, never a member's ticket. */
  invites: AccessInvite[]
  /** The member tickets that end last, at most 200 (`access.memberTickets`); none without the program. */
  memberTickets: AccessMemberTicket[]
  /** The newest invitations by address, at most 200. */
  admissions: AccessAdmission[]
}

/** What an admission did with each address it was given. */
export interface AdmitResult {
  /** The addresses that hold an invitation now. */
  admitted: string[]
  /** The addresses it skipped, and why: `malformed`, `reserved` (a documentation or test domain), `account` (an account exists). */
  skipped: Array<{ email: string, reason: 'malformed' | 'reserved' | 'account' }>
}

/** The public functions `backend/access.ts` re-exports. */
export interface AccessApi {
  /** The launch phase now, for `useAccessPhase`. Anyone may read it, signed in or not. */
  getAccessPhase: RegisteredQuery<'public', Record<string, never>, Promise<AccessPhaseState>>
  /**
   * How an invite code or an access link's token checks now, for
   * `useInvite`: `valid`, `expired`, `used-up`, `revoked` or `unknown`.
   * Uses nothing up. Anyone may call it, rate-limited (`inviteCheck` per
   * signed-in caller, `inviteCheckGlobal` across the deployment).
   */
  checkInvite: RegisteredMutation<'public', { code: string }, Promise<{ status: InviteStatus }>>
  /** The Access tab: the phase, the codes and links, the member tickets, the invitations by address. `null` for anyone who is not an administrator now. */
  getAccessConsole: RegisteredQuery<'public', Record<string, never>, Promise<AccessConsole | null>>
  /** Move the app to a phase it lists. An administrator's, in person, with a recent sign-in; recorded as `access.phase_changed`. */
  setAccessPhase: RegisteredMutation<'public', { phase: AccessPhase }, Promise<null>>
  /**
   * Make an invite code (`kind: 'code'`) or an access link (`'link'`, which
   * needs `expiresAt`), answering it once: the database keeps only a hash.
   * An administrator's, in person, with a recent sign-in.
   */
  createInvite: RegisteredMutation<'public', { kind: InviteKind, label: string, maxUses: number, expiresAt?: number }, Promise<{ id: string, code: string }>>
  /** Close a code, a link or a member's ticket at once, or delete an unused invitation by address; an id nothing has does nothing. An administrator's, in person, with a recent sign-in. */
  revokeInvite: RegisteredMutation<'public', { id: string }, Promise<null>>
  /**
   * Invite addresses (at most 500 at a time). No email unless `email` asks
   * for one: then each person gets a plain "You're invited" email with a
   * one-click unsubscribe, about a hundred an hour (`setupAccess({ email })`
   * needed). An administrator's, in person, with a recent sign-in.
   */
  admitEmails: RegisteredMutation<'public', { emails: string[], label?: string, email?: boolean }, Promise<AdmitResult>>
  /** Internal: sends the invitation emails "Email them" asked for, by the invitations' ids; scheduled by `admitEmails` under this name. */
  emailInvitations: RegisteredAction<'internal', { ids: string[] }, Promise<null>>
}

/**
 * A member's ticket as `getMemberTicket` answers it:
 *
 * - `open`: the app is public, and nobody needs a ticket;
 * - `off`: the program is off now (`memberTickets({ enabled })` said so), or
 *   for this member: one a member ticket admitted holds none, unless `chain`,
 *   and an administrator revoked theirs (until it would have ended);
 * - `none`: the member holds no ticket that works, and may ask for one of
 *   `uses` (after a retired `AUTH_SECRET`, the uses their ticket has left:
 *   asking gives it a new link);
 * - `issued`: the member's access link token, for `/invite#<token>`, how many
 *   new addresses it admits in all, how many it still admits, and when it
 *   stops. Asking again answers the same ticket until it expires, used up or not.
 */
export type MemberTicket
  = | { state: 'open' }
    | { state: 'off' }
    | { state: 'none', uses: number }
    | { state: 'issued', token: string, uses: number, left: number, expiresAt: number }

/** Options for {@link Access.memberTickets}. */
export interface MemberTicketsOptions {
  /** How many new addresses one member's ticket admits. Default `3`. */
  uses?: number
  /** How long a ticket works from when the member asks for it, in milliseconds. Default 60 days, at most a year. */
  lifetime?: number
  /**
   * Whether the program runs now, for a switch of the app's own (a flag,
   * say): `false` answers `off`, issues nothing, and the links already
   * shared admit nobody (`revoked`) until it is on again. Default: while
   * the app is closed.
   *
   * @guarantee
   * - Runs: in the query or mutation that reads or mints a member's ticket, and in each code check and sign-up that brings a code or link (nobody signed in), in its transaction
   * - Delivery: once per read, per mint and per code checked; a live read runs it again whenever what it read changes
   * - Order: a read or a mint asks it after the phase (a public app answers `open` without asking), before the member's ticket; a code check or a sign-up, before the code's row is read
   * - When it throws: the read, the mint, the check or the sign-up fails with its error, and nothing is minted or taken
   * - Idempotency: a read: it may run many times for one member or code, and writes nothing
   */
  enabled?: (ctx: AccessCtx) => boolean | Promise<boolean>
  /**
   * Let an account a member ticket admitted hold one of its own (default
   * `false`). Without it, such an account reads `off`, and a ticket it
   * held from before admits nobody: one member brings their friends, as a
   * workspace invitation does, not a chain of strangers past the waitlist.
   */
  chain?: boolean
  /**
   * The app's referral program (`setupReferrals`), so each friend a
   * member's ticket admits counts as the member's referral: it is claimed
   * for the member as the friend's account is made, whichever page, browser
   * or link the friend signed up from. The ticket decides, never the
   * address: the link carries nothing for it. The claim's own checks hold
   * (the first referral claimed wins, an address that is the member's is
   * refused), and the member's reward waits for the friend's first paid
   * order and the hold, as for any referral. A claim that cannot be made
   * never fails the sign-up. Default: none, and a member's ticket claims
   * nothing.
   */
  referrals?: Pick<Referrals, 'claimFor'>
}

/** The functions `backend/access.ts` re-exports for member tickets. */
export interface MemberTicketsApi {
  /** The signed-in member's ticket, for `useMemberTicket`: `null` for a visitor, a banned account, and an administrator acting as the member. Never mints one. */
  getMemberTicket: RegisteredQuery<'public', Record<string, never>, Promise<MemberTicket | null>>
  /** Mint the member's ticket, or answer the one they hold: the member's own, in person. */
  issueMemberTicket: RegisteredMutation<'public', Record<string, never>, Promise<MemberTicket>>
}

/** Member tickets, from {@link Access.memberTickets}. */
export interface MemberTickets {
  /** How many new addresses one ticket admits. */
  uses: number
  /** How long a ticket works, in milliseconds. */
  lifetime: number
  /** The functions `backend/access.ts` re-exports. */
  api: MemberTicketsApi
}

/** The app's launch access, from {@link setupAccess}. */
export interface Access {
  /** The phases the app goes through, in order. */
  phases: readonly AccessPhase[]
  /** The phase the app is in now, read from the `backend` component. */
  phase: (ctx: Pick<AccessCtx, 'runQuery'>) => Promise<AccessPhase>
  invites: {
    /**
     * Make an invite code from server code and answer it, once: the
     * database keeps only a hash. `kind: 'link'` makes an access link's
     * token instead, for `/invite#<token>`. Recorded as `access.invite_created`.
     */
    create: (ctx: AccessWriteCtx, input: { label: string, maxUses: number, expiresAt?: number, kind?: InviteKind }) => Promise<string>
  }
  /**
   * Invite addresses from server code, with no email: each signs up while
   * the app is closed, for 30 days. Existing accounts, malformed addresses
   * and reserved domains are skipped. Recorded as `access.admitted`.
   */
  admit: (ctx: AccessWriteCtx, input: { emails: string[], label?: string }) => Promise<AdmitResult>
  /**
   * Member tickets: while the app is closed, every member can hold one
   * access link that admits `uses` new addresses for `lifetime`, minted the
   * first time they ask and read back after, to share with friends. A sign-up
   * through one is the `member-ticket` ticket, labelled `member:<userId>`,
   * and is checked against its member then: a banned member's link, or one
   * while the program is off, admits nobody. Declare it once, in
   * `backend/access.ts`, and re-export its `api` there for `useMemberTicket`.
   * Recorded as `access.invite_created` (label `member`) on each mint. With
   * `referrals`, each friend a ticket admits is claimed as its member's
   * referral when their account is made.
   *
   * @example
   * ```ts [backend/access.ts]
   * export const memberTickets = access.memberTickets({ uses: 3, lifetime: 60 * DAY })
   * export const { getMemberTicket, issueMemberTicket } = memberTickets.api
   * ```
   */
  memberTickets: (options?: MemberTicketsOptions) => MemberTickets
  /** The public functions `backend/access.ts` re-exports. */
  api: AccessApi
  /** What `setupAuth({ access })` asks while a new address signs up. */
  gate: AccessGate
  /**
   * What the waitlist (`setupWaitlist`) shares with the access it is
   * built on: its component functions, the secret statuses are signed with,
   * the audit trail, and the administrators' checks (who runs them is
   * `adminRoles` and `adminUserIds`).
   *
   * @internal
   */
  internals: {
    refs: unknown
    secret: () => string
    /** Every live auth secret, current first: what a signed status link is checked against. */
    secrets: () => string[]
    audit: Pick<Audit, 'recordBackendEvent'>
    administrators: {
      /** The caller's account id when an administrator now, in person and with a recent sign-in; else throws the refusal. */
      require: (ctx: AccessCtx, what: string) => Promise<string>
      /** Whether the caller is an administrator now (a read: no recent sign-in asked). */
      is: (ctx: AccessCtx, what: string) => Promise<boolean>
    }
  }
}

/** How many new addresses one member ticket admits, by default. */
const MEMBER_TICKET_USES = 3
/** How long a member ticket works, by default: 60 days. */
const MEMBER_TICKET_LIFETIME_MS = 60 * 24 * 60 * 60 * 1000
/** The longest a member ticket works: a year. */
const MEMBER_TICKET_LIFETIME_MAX_MS = 365 * 24 * 60 * 60 * 1000

/** How many new addresses one account's workspace invitations admit while the app is closed, by default. */
const WORKSPACE_INVITATIONS = 10

export interface SetupAccessOptions {
  /**
   * The phases the app goes through, in order: any of `early-access`,
   * `invite-only` and `public`. A new deployment starts on the first.
   * Default: all three.
   */
  phases?: readonly AccessPhase[]
  /** Domains whose every address signs up in any phase (the part after `@`, matched exactly): your own team's. */
  domains?: readonly string[]
  /**
   * How many new addresses one account's workspace invitations admit while
   * the app is closed. An account that a workspace invitation admitted
   * admits nobody by its own, so one admitted account can't open the phase
   * to a chain of others. `false`: a workspace invitation is no ticket.
   * Default `10`.
   */
  workspaceInvitations?: number | false
  /** The app's audit trail: phase changes, codes, links, invitations and used tickets are recorded on it. */
  audit: Pick<Audit, 'recordBackendEvent'>
  /**
   * Your `setupRateLimiter` instance, for the invite check's limits
   * (`inviteCheck`, `inviteCheckGlobal`). Default: the rate limiter
   * component mounted as `rateLimiter`, with the package's limits.
   */
  rateLimiter?: { limit: (ctx: Pick<AccessWriteCtx, 'runQuery' | 'runMutation'>, name: 'inviteCheck' | 'inviteCheckGlobal', options?: { key?: string, throws?: boolean }) => Promise<{ ok: boolean, retryAfter?: number }> }
  /** The app-wide roles that run the Access tab, read fresh. Default `['admin']`. */
  adminRoles?: readonly string[]
  /** Accounts that run the Access tab whatever their role, by id. */
  adminUserIds?: readonly string[]
  /**
   * The email instance (`setupEmail`), for "Email them": the invitation is
   * rendered in its layout, with the brand and a one-click unsubscribe,
   * under the weekly cap and quiet hours. Without it, invitations by
   * address send no email. Re-export `emailInvitations` with it.
   */
  email?: AccessEmail
  /** The paths the Nuxt module writes to `paths.generated.ts`: an invitation email links to the sign-in page and the privacy policy there. */
  paths?: Partial<BackendPaths>
}

/** What "Email them" needs of `setupEmail`'s instance: the layout and words, and the sending rules. */
export interface AccessEmail {
  compose: <Message extends EmailMessage | null>(build: (context: EmailRenderContext) => Message | Promise<Message>, options?: { locale?: string | null }) => Promise<Message>
  /**
   * The sending rules the email instance holds.
   *
   * @internal
   */
  preferences: Pick<EmailPreferences, 'prepare'>
}

/** The app function "Email them" schedules, by name: `emailInvitations` in `backend/access.ts`. */
const ACCESS_INVITATION_FUNCTION = 'access:emailInvitations'

/** The `backend` component (and the rate limiter) as access reads them. */
export interface AccessComponents {
  backend: unknown
  rateLimiter?: unknown
}

interface AccessRefs {
  access: {
    getPhase: FunctionReference<'query', 'internal', Record<string, never>, string | null>
    setPhase: FunctionReference<'mutation', 'internal', { phase: string }, string | null>
    admission: FunctionReference<'query', 'internal', { email?: string, tokenHash?: string, workspaceInvitations?: number, members?: { chain: boolean } }, { phase: string | null, ticket: { kind: string, label?: string } | null, invite: { status: InviteStatus, kind?: InviteKind } | null }>
    redeem: FunctionReference<'mutation', 'internal', { email: string, tokenHash?: string, workspaceInvitations?: number, members?: { chain: boolean } }, { ticket: string, label?: string } | { refused: InviteStatus }>
    recordTicket: FunctionReference<'mutation', 'internal', { email: string, ticket: string }, null>
    attachUser: FunctionReference<'mutation', 'internal', { email: string, userId: string }, { ticket: string, label?: string } | null>
    createInvite: FunctionReference<'mutation', 'internal', { kind: InviteKind, tokenHash: string, label: string, maxUses: number, expiresAt?: number, createdBy?: string, keyVersion?: number, holder?: string }, string>
    ticketOf: FunctionReference<'query', 'internal', { userId: string }, { kind: string, label?: string } | null>
    memberTicket: FunctionReference<'query', 'internal', { holder: string }, { id: string, tokenHash: string, maxUses: number, uses: number, expiresAt: number, status: InviteStatus } | null>
    revoke: FunctionReference<'mutation', 'internal', { id: string }, 'invite' | 'admission' | 'used' | null>
    rekeyInvite: FunctionReference<'mutation', 'internal', { from: string, to: string, keyVersion?: number }, boolean>
    admit: FunctionReference<'mutation', 'internal', { emails: string[], source: 'invitation' | 'waitlist', label?: string, expiresAt: number, createdBy?: string }, { admitted: string[], ids: string[], skipped: Array<{ email: string, reason: string }> }>
    admissionEmails: FunctionReference<'query', 'internal', { ids: string[] }, Array<{ id: string, email: string }>>
    bookInvitationEmails: FunctionReference<'mutation', 'internal', { count: number }, { start: number, gapMs: number }>
    consoleRows: FunctionReference<'query', 'internal', Record<string, never>, { invites: AccessInvite[], memberTickets: AccessMemberTicket[], admissions: AccessAdmission[] }>
  }
  waitlist: {
    verify: FunctionReference<'mutation', 'internal', { email: string, join?: string, locale?: string, boost: { cap: number, days: number } }, { id: string, created: boolean, source: string, referred: boolean, news: boolean }>
    place: FunctionReference<'query', 'internal', { id: string }, { position: number | null, total: number, shareCode: string } | null>
  }
  adapter: { findOne: AdapterFindOne }
  email: { send: FunctionReference<'mutation', 'internal', Record<string, unknown>, string | null> }
}

/** The auth secrets the hashes are keyed with, current first: the deployment's `AUTH_SECRET`, with a rotation's previous one while it verifies. */
function secrets(): string[] {
  const values = liveSecrets(authSecrets(readEnv('AUTH_SECRET')))
  if (values.length === 0) throw new Error('[nuxt-backend] AUTH_SECRET is not set, so an invite code cannot be hashed. Set it on the deployment.')
  return values
}

/** The version of the current `AUTH_SECRET` entry, `0` for a plain secret: what a row's hash is keyed with. */
function keyVersion(): number {
  return authSecrets(readEnv('AUTH_SECRET'))?.entries?.[0]?.version ?? 0
}

/** The auth secret new hashes and links are keyed with: the current one. */
function secret(): string {
  return secrets()[0]!
}

/** A label, trimmed; refused when empty or too long. */
function checkLabel(label: string, what: string): string {
  const trimmed = label.trim()
  if (!trimmed || trimmed.length > INVITE_LABEL_MAX) throw backendError('invalid_input', { field: 'label' }, `[nuxt-backend] ${what}: a label is 1-${INVITE_LABEL_MAX} characters.`)
  return trimmed
}

/** The uses and expiry of a new code or link, checked. */
function checkLimits(input: { maxUses: number, expiresAt?: number, kind: InviteKind }, what: string): void {
  if (!Number.isInteger(input.maxUses) || input.maxUses < 1 || input.maxUses > INVITE_USES_MAX) {
    throw backendError('invalid_input', { field: 'maxUses' }, `[nuxt-backend] ${what}: maxUses is a whole number from 1 to ${INVITE_USES_MAX}.`)
  }
  if (input.expiresAt === undefined && input.kind === 'link') throw backendError('invalid_input', { field: 'expiresAt' }, `[nuxt-backend] ${what}: an access link needs an expiry.`)
  if (input.expiresAt !== undefined && !(input.expiresAt > Date.now())) throw backendError('invalid_input', { field: 'expiresAt' }, `[nuxt-backend] ${what}: expiresAt is in the past.`)
}

/** The tickets a sign-up records as they come: an address's own, and a code's or link's. */
const TICKETS: readonly AccessTicket[] = ['invite-code', 'access-link', 'member-ticket', 'invitation', 'waitlist', 'workspace-invitation', 'gift', 'domain', 'administrator']
const asTicket = (kind: string): AccessTicket => (TICKETS.includes(kind as AccessTicket) ? kind as AccessTicket : 'invitation')

/** The cohort a member's ticket signs up under, on the activity trail and in the funnels. */
const MEMBER_COHORT = 'member'

/** The label a member's ticket keeps, and the ledger with it: `member:<userId>`, its member, until they are erased. */
const memberLabel = (holder: string) => `${MEMBER_COHORT}:${holder}`

/** The member whose ticket a ledger row took, from its label; `null` for any other ticket. */
const holderOf = (row: { ticket: string, label?: string }): string | null =>
  (row.ticket === 'member-ticket' && row.label?.startsWith(memberLabel('')) ? row.label.slice(memberLabel('').length) || null : null)

/**
 * A ticket taken, as the sign-up's hooks record it (the activity trail and
 * the growth funnel): a member's ticket by its kind's cohort, `member`,
 * never the member's id. The ledger keeps `member:<userId>` for the Users
 * tab, until the member is erased.
 */
const usedTicket = (row: { ticket: string, label?: string }): { ticket: AccessTicket, label?: string } => {
  const ticket = asTicket(row.ticket)
  const label = ticket === 'member-ticket' ? MEMBER_COHORT : row.label
  return { ticket, ...(label ? { label } : {}) }
}

/**
 * Launch your app in phases: early access with a waitlist, then invite
 * only, then public. Existing accounts always sign in. While the app is
 * closed, a new address needs a ticket: an invite code or an access link,
 * an invitation by address, an admitted waitlist entry, a pending
 * workspace invitation, a paid gift addressed to it, or a domain of
 * `domains`. Pass the result to `setupAuth({ access })`: its sign-in
 * hooks ask the phase and take the ticket. An administrator changes the
 * phase and hands out tickets from the admin console's Access tab.
 *
 * @example
 * ```ts [backend/access.ts]
 * import { setupAccess } from 'nuxt-backend/access'
 * import { components } from './_generated/api'
 * import { audit } from './audit'
 *
 * export const access = setupAccess(components, {
 *   phases: ['early-access', 'invite-only', 'public'],
 *   domains: ['panels.example'],
 *   audit,
 * })
 *
 * export const { getAccessPhase, checkInvite, getAccessConsole, setAccessPhase, createInvite, revokeInvite, admitEmails } = access.api
 * ```
 */
export function setupAccess(components: AccessComponents, options: SetupAccessOptions): Access {
  const refs = components.backend as AccessRefs
  const phases = [...(options.phases ?? ACCESS_PHASES)]
  const domains = options.domains ?? []
  // A workspace invitation's share of sign-ups per inviter; 0 turns them off as tickets.
  const perInviter = options.workspaceInvitations === false ? 0 : (options.workspaceInvitations ?? WORKSPACE_INVITATIONS)
  if (!Number.isInteger(perInviter) || perInviter < 0) throw new TypeError('[nuxt-backend] setupAccess: `workspaceInvitations` is a whole number of zero or more, or false.')
  if (!phases.length || phases.some(phase => !ACCESS_PHASES.includes(phase)) || new Set(phases).size !== phases.length) {
    throw new TypeError(`[nuxt-backend] setupAccess: phases lists each of ${ACCESS_PHASES.join(', ')} at most once, at least one.`)
  }
  if (typeof (options.audit as Partial<Audit> | undefined)?.recordBackendEvent !== 'function') {
    throw new TypeError('[nuxt-backend] setupAccess: `audit` is not a setupAudit instance. Pass the app\'s, from audit.ts: `setupAccess(components, { audit })`.')
  }
  const audit = options.audit
  const reads = createAccessReads(refs.adapter.findOne)
  const administrators: Administrators = { roles: options.adminRoles ?? DEFAULT_ADMIN_ROLES, userIds: options.adminUserIds ?? [] }
  const limiter = options.rateLimiter ?? (components.rateLimiter
    ? new RateLimiter(components.rateLimiter as never, { inviteCheck: DEFAULT_LIMITS.inviteCheck, inviteCheckGlobal: DEFAULT_LIMITS.inviteCheckGlobal })
    : undefined)

  const phase: Access['phase'] = async ctx => effectivePhase(await ctx.runQuery(refs.access.getPhase, {}), phases)
  const requireAdministrator = (ctx: AccessCtx, what: string) => requireAdministratorInPerson(ctx, reads, administrators, what)

  /** The member-ticket program, once `memberTickets` declared it: what a sign-up through a member's link is checked against. */
  let program: { enabled: MemberTicketsOptions['enabled'], chain: boolean, referrals?: MemberTicketsOptions['referrals'] } | null = null
  /**
   * The program as a code's check and a sign-up meet it now, for the
   * component to check a member's ticket against: none while it is off or
   * the app runs none, so a member's link admits nobody. Asks `enabled`
   * only when a code was given.
   */
  const membersNow = async (ctx: Pick<AccessCtx, 'runQuery'>, tokenHash: string | null): Promise<{ tokenHash?: string, members?: { chain: boolean } }> => {
    if (!tokenHash) return {}
    if (!program || (program.enabled && !await program.enabled(ctx as AccessCtx))) return { tokenHash }
    return { tokenHash, members: { chain: program.chain } }
  }

  /**
   * A friend a member's ticket admitted, claimed as the member's referral
   * with `memberTickets({ referrals })`: the ledger row names the member, so
   * no address can name another. Logged, never thrown: the account exists.
   */
  const claimForMember = async (ctx: Pick<AccessWriteCtx, 'runQuery' | 'runMutation'>, row: { ticket: string, label?: string }, userId: string): Promise<void> => {
    const holder = holderOf(row)
    if (!holder || !program?.referrals) return
    try {
      await program.referrals.claimFor(ctx, { referrerId: holder, userId })
    }
    catch (error) {
      logBackend('warn', 'access.referral_unclaimed', 'A friend a member\'s ticket admitted was not claimed as the member\'s referral; the account was created.', error)
    }
  }

  /** The hash a new code is stored by, or `null` for input that can be no ticket. */
  const hashOf = async (code: string | undefined) => (code ? await inviteHash(secret(), code) : null)

  /**
   * The hash a code is found by: under the current secret, or, while a
   * rotation keeps a previous one, under the one its row was stored with.
   * A row found under a previous secret is re-keyed with the current one
   * when `ctx` can write, so the code outlives that secret's retirement.
   */
  const lookupHash = async (ctx: { runQuery: AccessCtx['runQuery'], runMutation?: AccessWriteCtx['runMutation'] }, code: string | undefined): Promise<string | null> => {
    if (!code) return null
    const [current, ...previous] = secrets()
    const first = await inviteHash(current!, code)
    if (!first || previous.length === 0) return first
    // A hash no row holds still answers an invite, `unknown`: only a row found counts.
    const stored = async (hash: string) => (await ctx.runQuery(refs.access.admission, { tokenHash: hash })).invite?.status !== 'unknown'
    if (await stored(first)) return first
    for (const candidate of await Promise.all(previous.map(value => inviteHash(value, code)))) {
      if (!candidate || !await stored(candidate)) continue
      if (typeof ctx.runMutation !== 'function') return candidate
      return await ctx.runMutation(refs.access.rekeyInvite, { from: candidate, to: first, keyVersion: keyVersion() }) ? first : candidate
    }
    return first
  }

  async function createInviteRow(ctx: AccessWriteCtx, input: { label: string, maxUses: number, expiresAt?: number, kind: InviteKind }, createdBy: string | undefined, what: string) {
    const label = checkLabel(input.label, what)
    checkLimits(input, what)
    const code = input.kind === 'code' ? newInviteCode() : newLinkToken()
    const id = await ctx.runMutation(refs.access.createInvite, {
      kind: input.kind,
      tokenHash: (await hashOf(code))!,
      keyVersion: keyVersion(),
      label,
      maxUses: input.maxUses,
      ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
      ...(createdBy ? { createdBy } : {}),
    })
    await audit.recordBackendEvent(ctx, { type: 'access.invite_created', targetId: id, data: { kind: input.kind, label, maxUses: input.maxUses } })
    return { id, code }
  }

  async function admitRows(ctx: AccessWriteCtx & { scheduler?: { runAfter: (delay: number, fn: FunctionReference<'action', 'internal'>, args: { ids: string[] }) => Promise<unknown> } }, input: { emails: string[], label?: string, email?: boolean }, createdBy: string | undefined): Promise<AdmitResult> {
    if (input.email && !options.email) throw backendError('invalid_input', { field: 'email' }, '[nuxt-backend] admit: emailing invitations needs the email instance: setupAccess(components, { email }), with emailInvitations re-exported from backend/access.ts.')
    if (input.emails.length > ADMIT_BATCH_MAX) throw backendError('invalid_input', { field: 'emails', reason: 'too_many' }, `[nuxt-backend] admit: at most ${ADMIT_BATCH_MAX} addresses at a time.`)
    const label = input.label?.trim() ? checkLabel(input.label, 'admit') : undefined
    const { clean, skipped } = cleanAddresses(input.emails)
    const stored = clean.length
      ? await ctx.runMutation(refs.access.admit, { emails: clean, source: 'invitation', ...(label ? { label } : {}), expiresAt: Date.now() + ADMISSION_TTL_MS, ...(createdBy ? { createdBy } : {}) })
      : { admitted: [], ids: [], skipped: [] }
    const result = { admitted: stored.admitted, skipped: [...skipped, ...stored.skipped.map(row => ({ email: row.email, reason: 'account' as const }))] }
    if (result.admitted.length) await audit.recordBackendEvent(ctx, { type: 'access.admitted', data: { count: result.admitted.length, ...(label ? { label } : {}) } })
    // The emails go by the invitations' ids alone, from an action of their own: no address waits in a scheduled call.
    if (input.email && stored.ids.length && ctx.scheduler) await ctx.scheduler.runAfter(0, emailInvitationsRef, { ids: stored.ids })
    return result
  }

  const emailInvitationsRef = makeFunctionReference<'action', { ids: string[] }>(ACCESS_INVITATION_FUNCTION) as unknown as FunctionReference<'action', 'internal', { ids: string[] }>
  const { login: signInPath, privacy: privacyPath } = resolveBackendPaths(options.paths, 'setupAccess')

  /** One invitation email, in the layout: who invites, the sign-in link (no token, no address), why it came and the privacy page. */
  const invitationMessage = (to: string) => options.email!.compose(({ t, brand, link }) => {
    const site = brand.url.replace(/\/$/, '')
    return {
      to,
      subject: t('email.accessInvitation.subject', { brand: brand.name }),
      blocks: [
        { paragraph: t('email.accessInvitation.intro', { brand: brand.name }) },
        { button: { label: t('email.accessInvitation.action'), url: link(`${site}${signInPath}`) } },
        { note: t('email.accessInvitation.why', { brand: brand.name }) },
        { note: t('email.accessInvitation.privacy', { brand: brand.name, url: link(`${site}${privacyPath}`) }) },
      ],
    }
  })

  const emailInvitations = internalActionGeneric({
    args: { ids: v.array(v.string()) },
    handler: async (ctx, { ids }): Promise<null> => {
      if (!options.email) return null
      const people = await ctx.runQuery(refs.access.admissionEmails, { ids })
      if (!people.length) return null
      const { start, gapMs } = await ctx.runMutation(refs.access.bookInvitationEmails, { count: people.length })
      // The footer's link text, in the invitation's language, as the other lifecycle emails word it.
      const unsubscribe = (await options.email.compose(({ t }) => ({ to: '', subject: t('email.layout.unsubscribe') }))).subject
      for (const [index, person] of people.entries()) {
        try {
          // One-click unsubscribe from everything, the weekly cap and the quiet hours, as for any mail nobody asked for.
          const prepared = await options.email.preferences.prepare(ctx, await invitationMessage(person.email), undefined, async () => ({ unsubscribe }), { unsubscribeAll: true })
          if (!prepared) continue
          const slot = start + index * gapMs
          await ctx.runMutation(refs.email.send, { ...prepared, deliverAt: Math.max(slot, prepared.deliverAt ?? 0), idempotencyKey: `nuxt-backend:access-invitation:${person.id}` })
        }
        catch (error) {
          logBackend('warn', 'access.invitation_unsent', 'An invitation by address was made, but its email was not sent; the invitation stands.', error)
        }
      }
      return null
    },
  })

  const waitlist: AccessGate['waitlist'] = phases.includes('early-access')
    ? async (ctx, { email, locale, join }) => {
      const entry = await ctx.runMutation(refs.waitlist.verify, { email: admissionEmail(email), ...(join ? { join } : {}), ...(locale ? { locale } : {}), boost: DEFAULT_BOOST })
      const place = await ctx.runQuery(refs.waitlist.place, { id: entry.id })
      return {
        id: entry.id,
        created: entry.created,
        position: place?.position ?? null,
        total: place?.total ?? 0,
        token: await statusToken(secret(), entry.id),
        source: entry.source,
        referred: entry.referred,
        news: entry.news,
      }
    }
    : undefined

  const gate: AccessGate = {
    ...(waitlist ? { waitlist } : {}),
    admission: async (ctx, { email, code }) => {
      const tokenHash = await lookupHash(ctx, code)
      const address = admissionEmail(email)
      // An allowed domain needs no ticket row, and a public phase none at all.
      const read = await ctx.runQuery(refs.access.admission, { email: address, ...await membersNow(ctx, tokenHash), workspaceInvitations: perInviter })
      const current = effectivePhase(read.phase, phases)
      const invite = code ? (read.invite?.status ?? 'unknown') : null
      if (inDomains(address, domains)) return { phase: current, ticket: 'domain', invite }
      const held = read.ticket ? asTicket(read.ticket.kind) : null
      const ticket = held ?? (invite === 'valid' ? (read.invite?.kind === 'link' ? 'access-link' : 'invite-code') : null)
      return { phase: current, ticket, invite }
    },
    redeem: async (ctx, { email, code, ticket }) => {
      const address = admissionEmail(email)
      if (ticket === 'domain' || ticket === 'administrator') {
        await ctx.runMutation(refs.access.recordTicket, { email: address, ticket })
        return { ticket }
      }
      const tokenHash = await lookupHash(ctx, code)
      const taken = await ctx.runMutation(refs.access.redeem, { email: address, ...await membersNow(ctx, tokenHash), workspaceInvitations: perInviter })
      return 'refused' in taken ? taken : usedTicket(taken)
    },
    attach: async (ctx, { email, userId }) => {
      const row = await ctx.runMutation(refs.access.attachUser, { email: admissionEmail(email), userId })
      if (!row) return null
      await claimForMember(ctx, row, userId)
      return usedTicket(row)
    },
  }

  const getAccessPhase = queryGeneric({
    args: {},
    handler: async (ctx): Promise<AccessPhaseState> => ({ phase: await phase(ctx), phases }),
  })

  const checkInvite = mutationGeneric({
    args: { code: v.string() },
    handler: async (ctx, { code }): Promise<{ status: InviteStatus }> => {
      if (limiter) {
        const identity = await ctx.auth.getUserIdentity()
        if (identity) await limiter.limit(ctx, 'inviteCheck', { key: identity.subject, throws: true })
        await limiter.limit(ctx, 'inviteCheckGlobal', { throws: true })
      }
      const tokenHash = await lookupHash(ctx, code)
      if (!tokenHash) return { status: 'unknown' }
      const read = await ctx.runQuery(refs.access.admission, await membersNow(ctx, tokenHash))
      return { status: read.invite?.status ?? 'unknown' }
    },
  })

  const getAccessConsole = queryGeneric({
    args: {},
    handler: async (ctx): Promise<AccessConsole | null> => {
      if (!await isAdministratorNow(ctx, reads, administrators, 'getAccessConsole')) return null
      const rows = await ctx.runQuery(refs.access.consoleRows, {})
      return { phase: await phase(ctx), phases, ...rows }
    },
  })

  const setAccessPhase = mutationGeneric({
    args: { phase: v.union(...ACCESS_PHASES.map(name => v.literal(name))) },
    returns: v.null(),
    handler: async (ctx, { phase: next }) => {
      await requireAdministrator(ctx, 'setAccessPhase')
      if (!phases.includes(next)) throw backendError('invalid_input', { field: 'phase' }, `[nuxt-backend] setAccessPhase: this app goes through ${phases.join(', ')}.`)
      const from = await phase(ctx)
      if (from === next) return null
      await ctx.runMutation(refs.access.setPhase, { phase: next })
      await audit.recordBackendEvent(ctx, { type: 'access.phase_changed', data: { phase: next, from } })
      return null
    },
  })

  const createInvite = mutationGeneric({
    args: { kind: v.union(v.literal('code'), v.literal('link')), label: v.string(), maxUses: v.number(), expiresAt: v.optional(v.number()) },
    handler: async (ctx, input): Promise<{ id: string, code: string }> => {
      const adminId = await requireAdministrator(ctx, 'createInvite')
      return createInviteRow(ctx, input, adminId, 'createInvite')
    },
  })

  const revokeInvite = mutationGeneric({
    args: { id: v.string() },
    returns: v.null(),
    handler: async (ctx, { id }) => {
      await requireAdministrator(ctx, 'revokeInvite')
      const revoked = await ctx.runMutation(refs.access.revoke, { id })
      // Nothing has the id (revoked and deleted already, say): nothing to do.
      if (!revoked) return null
      if (revoked === 'used') throw backendError('invalid_input', { field: 'id', reason: 'used' }, '[nuxt-backend] revokeInvite: an account signed up with this invitation already; ban the account instead.')
      await audit.recordBackendEvent(ctx, { type: 'access.invite_revoked', targetId: id, data: { kind: revoked } })
      return null
    },
  })

  const admitEmails = mutationGeneric({
    args: { emails: v.array(v.string()), label: v.optional(v.string()), email: v.optional(v.boolean()) },
    handler: async (ctx, input): Promise<AdmitResult> => {
      const adminId = await requireAdministrator(ctx, 'admitEmails')
      return admitRows(ctx, input, adminId)
    },
  })

  /**
   * Member tickets over this access: each one an access link held by its
   * member, whose token is derived from the member and its expiry under the
   * auth secret, so the member reads it back and the database keeps only its
   * hash.
   */
  const memberTickets: Access['memberTickets'] = (ticketOptions = {}) => {
    const uses = ticketOptions.uses ?? MEMBER_TICKET_USES
    const lifetime = ticketOptions.lifetime ?? MEMBER_TICKET_LIFETIME_MS
    if (!Number.isInteger(uses) || uses < 1 || uses > INVITE_USES_MAX) throw new TypeError(`[nuxt-backend] access.memberTickets: \`uses\` is a whole number from 1 to ${INVITE_USES_MAX}.`)
    if (!Number.isInteger(lifetime) || lifetime < 60_000 || lifetime > MEMBER_TICKET_LIFETIME_MAX_MS) throw new TypeError('[nuxt-backend] access.memberTickets: `lifetime` is a whole number of milliseconds, from a minute to a year.')
    // One program per access: a sign-up checks a member's link against it.
    if (program) throw new TypeError('[nuxt-backend] access.memberTickets: the program is declared once, in backend/access.ts.')
    const referrals = ticketOptions.referrals
    if (referrals !== undefined && typeof (referrals as Partial<Referrals> | null)?.claimFor !== 'function') {
      throw new TypeError('[nuxt-backend] access.memberTickets: `referrals` is not a setupReferrals instance. Pass the app\'s, from referrals.ts: `access.memberTickets({ referrals })`.')
    }
    const chain = ticketOptions.chain === true
    program = { enabled: ticketOptions.enabled, chain, ...(referrals ? { referrals } : {}) }

    /** The ticket's token, found again: derived under a live secret, checked against the hash its row keeps under any live one. */
    const tokenOf = async (holder: string, row: { tokenHash: string, expiresAt: number }): Promise<string | null> => {
      const live = secrets()
      for (const candidate of live) {
        const token = await memberTicketToken(candidate, holder, row.expiresAt)
        for (const key of live) if (await inviteHash(key, token) === row.tokenHash) return token
      }
      return null
    }

    type TicketRow = { tokenHash: string, maxUses: number, uses: number, expiresAt: number }
    /**
     * Where a member stands: the phase, the program's switch, then their
     * ticket. `stale` is a ticket whose token came from a secret that has
     * retired since: asking again gives it a new token.
     */
    const standing = async (ctx: AccessCtx, holder: string): Promise<{ ticket: MemberTicket, stale?: TicketRow }> => {
      if (await phase(ctx) === 'public') return { ticket: { state: 'open' } }
      if (ticketOptions.enabled && !await ticketOptions.enabled(ctx)) return { ticket: { state: 'off' } }
      // One a member ticket admitted brings nobody of its own, unless the app asks for chains.
      if (!chain && (await ctx.runQuery(refs.access.ticketOf, { userId: holder }))?.kind === 'member-ticket') return { ticket: { state: 'off' } }
      const row = await ctx.runQuery(refs.access.memberTicket, { holder })
      // A revoked ticket keeps its member off until it would have ended: an administrator's revoke is no fresh start.
      if (row?.status === 'revoked' && row.expiresAt > Date.now()) return { ticket: { state: 'off' } }
      // An expired ticket is gone; a used-up one stays the member's until it expires.
      if (!row || (row.status !== 'valid' && row.status !== 'used-up')) return { ticket: { state: 'none', uses } }
      const left = Math.max(0, row.maxUses - row.uses)
      const token = await tokenOf(holder, row)
      if (token) return { ticket: { state: 'issued', token, uses: row.maxUses, left, expiresAt: row.expiresAt } }
      // The same ticket, with what it has left: a new token, never a second ticket beside the first.
      return { ticket: { state: 'none', uses: left }, stale: row }
    }

    const getMemberTicket = queryGeneric({
      args: {},
      handler: async (ctx): Promise<MemberTicket | null> => {
        const identity = await ctx.auth.getUserIdentity()
        // A visitor holds none, and an administrator acting as the member reads none of theirs.
        if (!identity || typeof (identity as unknown as Record<string, unknown>)[IMPERSONATED_BY_CLAIM] === 'string') return null
        // A banned account holds none: its link admits nobody, and asking is refused.
        const account = await reads.account(ctx, identity.subject)
        if (!account || account.banned) return null
        return (await standing(ctx, identity.subject)).ticket
      },
    })

    const issueMemberTicket = mutationGeneric({
      args: {},
      handler: async (ctx): Promise<MemberTicket> => {
        const holder = await ownCaller(ctx, 'issueMemberTicket')
        const account = await reads.account(ctx, holder)
        if (!account) throw backendError('unauthenticated', {}, '[nuxt-backend] issueMemberTicket: this account no longer exists.')
        if (account.banned) throw backendError('forbidden', { reason: 'banned' }, '[nuxt-backend] issueMemberTicket: this account is banned.')
        const { ticket, stale } = await standing(ctx, holder)
        if (ticket.state !== 'none') return ticket
        if (stale) {
          // A retired secret: the same ticket under the current one. The old link stops; its uses left and its end stay.
          const token = await memberTicketToken(secret(), holder, stale.expiresAt)
          if (await ctx.runMutation(refs.access.rekeyInvite, { from: stale.tokenHash, to: (await hashOf(token))!, keyVersion: keyVersion() })) {
            return { state: 'issued', token, uses: stale.maxUses, left: Math.max(0, stale.maxUses - stale.uses), expiresAt: stale.expiresAt }
          }
        }
        const expiresAt = Date.now() + lifetime
        const token = await memberTicketToken(secret(), holder, expiresAt)
        const id = await ctx.runMutation(refs.access.createInvite, { kind: 'link', tokenHash: (await hashOf(token))!, keyVersion: keyVersion(), label: memberLabel(holder), maxUses: uses, expiresAt, holder })
        // The member is the actor; the label names none, so their erasure leaves the row nobody's.
        await audit.recordBackendEvent(ctx, { type: 'access.invite_created', targetId: id, data: { kind: 'link', label: MEMBER_COHORT, maxUses: uses } })
        return { state: 'issued', token, uses, left: uses, expiresAt }
      },
    })

    return { uses, lifetime, api: { getMemberTicket, issueMemberTicket } as unknown as MemberTicketsApi }
  }

  return {
    phases,
    phase,
    memberTickets,
    invites: {
      create: async (ctx, input) => (await createInviteRow(ctx, { ...input, kind: input.kind ?? 'code' }, (await ctx.auth.getUserIdentity())?.subject, 'access.invites.create')).code,
    },
    admit: async (ctx, input) => admitRows(ctx, input, (await ctx.auth.getUserIdentity())?.subject),
    api: { getAccessPhase, checkInvite, getAccessConsole, setAccessPhase, createInvite, revokeInvite, admitEmails, emailInvitations } as unknown as AccessApi,
    gate,
    internals: {
      refs,
      secret,
      secrets,
      audit,
      administrators: {
        require: requireAdministrator,
        is: (ctx, what) => isAdministratorNow(ctx, reads, administrators, what),
      },
    },
  }
}

export { setupWaitlist } from './waitlist.js'
export type { SetupWaitlistOptions, Waitlist, WaitlistApi, WaitlistCaps, WaitlistConsole, WaitlistEntryRow, WaitlistPlace, WaitlistStatusView } from './waitlist.js'
export type { WaitlistQuestions, WaitlistStatus } from '../waitlist-rules.js'
export { ACCESS_PHASES } from '../access-tickets.js'
export type { AccessPhase, AccessTicket, InviteKind, InviteStatus } from '../access-tickets.js'
