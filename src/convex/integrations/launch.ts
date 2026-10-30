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
  admissionProblem,
  ADMIT_BATCH_MAX,
  effectivePhase,
  inDomains,
  INVITE_LABEL_MAX,
  INVITE_USES_MAX,
  inviteHash,
  type InviteKind,
  type InviteStatus,
  newInviteCode,
  newLinkToken,
} from '../access-tickets.js'
import { DEFAULT_ADMIN_ROLES } from '../constants.js'
import { DEFAULT_BOOST, statusToken } from '../waitlist-rules.js'
import { readEnv } from '../delivery.js'
import { authSecrets, liveSecrets } from '../auth-secrets.js'
import { backendError } from '../errors.js'
import type { Audit } from './audit.js'
import type { EmailMessage, EmailRenderContext } from '../email-templates.js'
import { logBackend } from '../log.js'
import { type BackendPaths, resolveBackendPaths } from '../paths.js'
import type { EmailPreferences } from './email-preferences.js'
import { type AdapterFindOne, type Administrators, createAccessReads, isAdministratorNow, requireAdministratorInPerson } from './access.js'
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
  /** The newest codes and links, at most 200. */
  invites: AccessInvite[]
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
  /** The Access tab: the phase, the codes and links, the invitations by address. `null` for anyone who is not an administrator now. */
  getAccessConsole: RegisteredQuery<'public', Record<string, never>, Promise<AccessConsole | null>>
  /** Move the app to a phase it lists. An administrator's, in person, with a recent sign-in; recorded as `access.phase_changed`. */
  setAccessPhase: RegisteredMutation<'public', { phase: AccessPhase }, Promise<null>>
  /**
   * Make an invite code (`kind: 'code'`) or an access link (`'link'`, which
   * needs `expiresAt`), answering it once: the database keeps only a hash.
   * An administrator's, in person, with a recent sign-in.
   */
  createInvite: RegisteredMutation<'public', { kind: InviteKind, label: string, maxUses: number, expiresAt?: number }, Promise<{ id: string, code: string }>>
  /** Close a code or a link at once, or delete an unused invitation by address; an id nothing has does nothing. An administrator's, in person, with a recent sign-in. */
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
    admission: FunctionReference<'query', 'internal', { email?: string, tokenHash?: string, workspaceInvitations?: number }, { phase: string | null, ticket: { kind: string, label?: string } | null, invite: { status: InviteStatus, kind?: InviteKind } | null }>
    redeem: FunctionReference<'mutation', 'internal', { email: string, tokenHash?: string, workspaceInvitations?: number }, { ticket: string, label?: string } | { refused: InviteStatus }>
    recordTicket: FunctionReference<'mutation', 'internal', { email: string, ticket: string }, null>
    attachUser: FunctionReference<'mutation', 'internal', { email: string, userId: string }, { ticket: string, label?: string } | null>
    createInvite: FunctionReference<'mutation', 'internal', { kind: InviteKind, tokenHash: string, label: string, maxUses: number, expiresAt?: number, createdBy?: string, keyVersion?: number }, string>
    revoke: FunctionReference<'mutation', 'internal', { id: string }, 'invite' | 'admission' | 'used' | null>
    rekeyInvite: FunctionReference<'mutation', 'internal', { from: string, to: string, keyVersion?: number }, boolean>
    admit: FunctionReference<'mutation', 'internal', { emails: string[], source: 'invitation' | 'waitlist', label?: string, expiresAt: number, createdBy?: string }, { admitted: string[], ids: string[], skipped: Array<{ email: string, reason: string }> }>
    admissionEmails: FunctionReference<'query', 'internal', { ids: string[] }, Array<{ id: string, email: string }>>
    bookInvitationEmails: FunctionReference<'mutation', 'internal', { count: number }, { start: number, gapMs: number }>
    consoleRows: FunctionReference<'query', 'internal', Record<string, never>, { invites: AccessInvite[], admissions: AccessAdmission[] }>
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

/** A pasted list as admissions take it: each address trimmed and lower-cased, the ones that take none set aside with why. */
function cleanAddresses(emails: readonly string[]): { clean: string[], skipped: AdmitResult['skipped'] } {
  const clean: string[] = []
  const skipped: AdmitResult['skipped'] = []
  for (const email of emails.map(admissionEmail).filter(Boolean)) {
    const problem = admissionProblem(email)
    if (problem) skipped.push({ email, reason: problem })
    else clean.push(email)
  }
  return { clean, skipped }
}

/** The tickets a sign-up records as they come: an address's own, and a code's or link's. */
const TICKETS: readonly AccessTicket[] = ['invite-code', 'access-link', 'invitation', 'waitlist', 'workspace-invitation', 'gift', 'domain', 'administrator']
const asTicket = (kind: string): AccessTicket => (TICKETS.includes(kind as AccessTicket) ? kind as AccessTicket : 'invitation')

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
      const read = await ctx.runQuery(refs.access.admission, { email: address, ...(tokenHash ? { tokenHash } : {}), workspaceInvitations: perInviter })
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
      const taken = await ctx.runMutation(refs.access.redeem, { email: address, ...(tokenHash ? { tokenHash } : {}), workspaceInvitations: perInviter })
      return 'refused' in taken ? taken : { ticket: asTicket(taken.ticket), ...(taken.label ? { label: taken.label } : {}) }
    },
    attach: async (ctx, { email, userId }) => {
      const row = await ctx.runMutation(refs.access.attachUser, { email: admissionEmail(email), userId })
      return row ? { ticket: asTicket(row.ticket), ...(row.label ? { label: row.label } : {}) } : null
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
      const read = await ctx.runQuery(refs.access.admission, { tokenHash })
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

  return {
    phases,
    phase,
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
