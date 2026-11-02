import { type FunctionReference, type GenericDataModel, type GenericQueryCtx, paginationOptsValidator, queryGeneric, type RegisteredQuery } from 'convex/server'
import { v } from 'convex/values'
import { DEFAULT_ADMIN_ROLES } from '../constants.js'
import { type AdapterFindOne, type Administrators, createAccessReads, isAdministrator, isAdministratorNow, requireAdministratorNow } from './access.js'
import type { FunnelReport } from '../funnel-rules.js'
import type { Email } from './email.js'
import { createReports, type ReportsApi, type ReportsOptions } from './reports.js'
import { type BackendPaths, resolveBackendPaths } from '../paths.js'

export { setupWebhooks } from './webhooks.js'
export type { SetupWebhooksOptions, WebhookDeliveryRow, WebhookOutcome, WebhookReplay, Webhooks, WebhooksApi, WebhooksComponents } from './webhooks.js'
export type { WebhookService } from './webhook-guard.js'
export type { FunnelBreakdownRow, FunnelCohort, FunnelDimension, FunnelReport, FunnelStep, PersonStep } from '../funnel-rules.js'

export type { AppealView, DescribedSubject, NoticeInput, ReportAppeal, ReportedSubject, ReportNotice, ReportReason, ReportsApi, ReportsConsole, ReportsOptions, ReportSubject } from './reports.js'

/**
 * How long an administrator's visit of an account lasts at most, in
 * seconds: thirty minutes. An app's own `admin.impersonationSessionDuration`
 * (`setupAuth`) may only shorten it.
 */
export { IMPERSONATION_SESSION_SECONDS } from '../constants.js'

// The admin console's reads: every account and every workspace, for an
// administrator. Accounts are written through the auth routes (ban, unban,
// set a role, sign devices out, impersonate), which the request guard holds
// to the sensitive-action table; these reads only look. Workspaces are
// read-only to an administrator: they act inside one only by impersonating
// a member.

/** One account, as the console lists it. Never a session token. */
export interface AdminUser {
  id: string
  email: string
  name: string
  image: string | null
  /** The app-wide role (several comma-separated); `'user'` when unset. */
  role: string
  /** Whether it is an administrator (one of the admin roles, or named by id): such an account is never impersonated. */
  administrator: boolean
  banned: boolean
  /** Why it was banned, as the administrator wrote it; `null` when not banned or none was given. */
  banReason: string | null
  /** When the ban lifts by itself, epoch ms; `null` for a ban until lifted. */
  banExpires: number | null
  emailVerified: boolean
  /** How the account last signed in (`passkey`, `email-otp`), or `null`. */
  lastSignInMethod: string | null
  /** Whether the account signs in with passkeys only, refusing sign-in codes. */
  passkeyOnly: boolean
  /** When the account was created, epoch ms. */
  createdAt: number
}

/** A page of accounts, newest first. */
export interface AdminUserPage {
  page: AdminUser[]
  isDone: boolean
  continueCursor: string
}

/** One workspace an account belongs to. */
export interface AdminMembership {
  workspaceId: string
  name: string
  slug: string
  /** The account's role in the workspace. */
  role: string
  /** When it joined, epoch ms. */
  joinedAt: number
}

/** One device session of an account: its id and when it signs in until, never its token. */
export interface AdminSession {
  id: string
  userAgent: string | null
  /** When it signed in, epoch ms. */
  createdAt: number
  /** When it was last extended, epoch ms. */
  updatedAt: number
  /** When it stops signing anyone in, epoch ms. Expired ones are listed until swept: compare with the clock. */
  expiresAt: number
  /** An administrator opened it by impersonating the account. */
  impersonated: boolean
}

/** An account in full, for the console's drawer. */
export interface AdminUserDetail {
  user: AdminUser
  workspaces: AdminMembership[]
  /** Latest expiry first. */
  sessions: AdminSession[]
  /** Whether the account has more workspaces or sessions than the first 100 of each listed here. */
  truncated: boolean
  /**
   * The ticket that admitted the account while the app was closed
   * (`setupAccess`): its kind (`invite-code`, `access-link`, `invitation`,
   * …) and the cohort's label; `null` for an account that needed none.
   */
  ticket: { kind: string, label?: string } | null
}

/** One workspace, as the console lists it. */
export interface AdminWorkspace {
  id: string
  name: string
  slug: string
  logo: string | null
  /** When it was created, epoch ms. */
  createdAt: number
}

/** A page of workspaces, newest first. */
export interface AdminWorkspacePage {
  page: AdminWorkspace[]
  isDone: boolean
  continueCursor: string
}

/** One member of a workspace, as the console shows it. */
export interface AdminWorkspaceMember {
  userId: string
  name: string
  email: string
  /** The member's role in the workspace. */
  role: string
  /** The member's account is an administrator's (one of the admin roles, or named by id): it cannot be impersonated. */
  administrator: boolean
  banned: boolean
  /** When they joined, epoch ms. */
  joinedAt: number
}

/** An invitation to a workspace that nobody answered yet. */
export interface AdminInvitation {
  id: string
  email: string
  role: string
  /** When it lapses, epoch ms. */
  expiresAt: number
}

/** A workspace in full, read-only. */
export interface AdminWorkspaceDetail {
  workspace: AdminWorkspace
  members: AdminWorkspaceMember[]
  invitations: AdminInvitation[]
  /** Whether the workspace has more members or invitations than the first 100 of each read here. */
  truncated: boolean
}

/** A page request, as `paginationOptsValidator` takes it. */
type PaginationArgs = typeof paginationOptsValidator.type

/** The public reads `backend/admin.ts` re-exports, behind `useAdmin` and the admin console. */
export interface AdminApi {
  /**
   * A page of accounts, newest first; `search` keeps those whose address
   * contains it, in lower case. `null` for anyone who is not an
   * administrator.
   */
  listUsers: RegisteredQuery<'public', { search?: string, paginationOpts: PaginationArgs }, Promise<AdminUserPage | null>>
  /** One account with its workspaces and device sessions. `null` for anyone who is not an administrator, and for an account that does not exist. */
  getUser: RegisteredQuery<'public', { userId: string }, Promise<AdminUserDetail | null>>
  /**
   * A page of workspaces, newest first; `search` keeps those whose name
   * contains it, as typed. `null` for anyone who is not an administrator.
   */
  listWorkspaces: RegisteredQuery<'public', { search?: string, paginationOpts: PaginationArgs }, Promise<AdminWorkspacePage | null>>
  /** One workspace with its members and open invitations. `null` for anyone who is not an administrator, and for a workspace that does not exist. */
  getWorkspace: RegisteredQuery<'public', { workspaceId: string }, Promise<AdminWorkspaceDetail | null>>
  /**
   * The growth funnel over the last `weeks` (1 to 26) up to the week
   * `until` falls in (default: the newest week anything was counted in):
   * each step's people, each person step broken down by invite, campaign,
   * referral, promotion and answer, and each sign-up week's cohort with the
   * people of it active in each week after. Counted inside the deployment
   * from the event path. Refused as `forbidden` (`admin_only`) for anyone
   * who is not an administrator, and (`impersonating`) during a visit.
   */
  getFunnel: RegisteredQuery<'public', { weeks: number, until?: number }, Promise<FunnelReport>>
}

/** The admin console's server half, from {@link setupAdmin}. */
export interface Admin {
  /** The public reads `backend/admin.ts` re-exports. */
  api: AdminApi
  /** The app-wide roles the reads let in. */
  adminRoles: readonly string[]
  /** The accounts the reads let in by id, whatever their role. */
  adminUserIds: readonly string[]
}

export interface SetupAdminOptions<DM extends GenericDataModel = GenericDataModel> {
  /**
   * The app-wide roles that read the console, read fresh on every call.
   * Default `['admin']`. Keep it equal to the admin plugin's `adminRoles`
   * (`setupAuth({ admin })`), which decides who may use its routes.
   */
  adminRoles?: string[]
  /**
   * The accounts that read the console by id, whatever their role. Keep it
   * equal to the admin plugin's `adminUserIds`: the console then marks
   * them as administrators, whom no one impersonates.
   */
  adminUserIds?: string[]
  /**
   * Content duties: how the Reports tab shows a reported thing and hides
   * it. Turns on `reportContent`, the public notice form (the `report`
   * page), statements of reasons with an appeal, and the Art. 18 flag.
   * Needs `email`. Pass the app's `DataModel` (`setupAdmin<DataModel>`)
   * and `describe`, `hide` and `restore` read your tables typed.
   */
  reports?: ReportsOptions<DM>
  /** The app's `setupEmail` instance, which the report emails go through: required with `reports`. */
  email?: Pick<Email, 'sendTemplate'>
  /**
   * The app's paths, from the `paths.generated.ts` the Nuxt module writes
   * from nuxt.config: a statement of reasons links its appeal to
   * `{SITE_URL}{paths.report}` (`pages.report`, `/report` by default).
   */
  paths?: Partial<BackendPaths>
}

/** {@link SetupAdminOptions} with content duties on. */
export interface SetupAdminReportsOptions<DM extends GenericDataModel = GenericDataModel> extends SetupAdminOptions<DM> {
  reports: ReportsOptions<DM>
  email: Pick<Email, 'sendTemplate'>
}

/** The admin console with content duties on: its `api` holds the report functions too. */
export interface AdminWithReports extends Admin {
  api: AdminApi & ReportsApi
}

/** The `backend` component as the console reads it: the auth adapter. */
export interface AdminComponents {
  backend: unknown
}

type Where = Array<{ field: string, value: string | number | boolean | null, operator?: 'eq' | 'contains' }>
type FindMany = FunctionReference<'query', 'internal', {
  model: string
  where?: Where
  sortBy?: { field: string, direction: 'asc' | 'desc' }
  paginationOpts: PaginationArgs
}, { page: unknown[], isDone: boolean, continueCursor: string }>
type FindOne = FunctionReference<'query', 'internal', { model: string, where?: Where }, unknown>

/**
 * The most rows a detail reads of one list (an account's workspaces and
 * sessions, a workspace's members and invitations): a bound, not
 * pagination. A detail with more says so (`truncated`).
 */
const DETAIL_ROWS = 100

/** The most rows a page of the console holds. */
const MAX_PAGE = 100

/** The rows the adapter returns, as far as the console reads them. */
interface UserRow {
  _id: string
  email: string
  name?: string | null
  image?: string | null
  role?: string | null
  banned?: boolean | null
  banReason?: string | null
  banExpires?: number | null
  emailVerified?: boolean | null
  lastLoginMethod?: string | null
  passkeyOnly?: boolean | null
  createdAt: number
}
interface OrganizationRow { _id: string, name: string, slug: string, logo?: string | null, createdAt: number }
interface MemberRow { organizationId: string, userId: string, role?: string | null, createdAt: number }
interface SessionRow { _id: string, userAgent?: string | null, createdAt: number, updatedAt: number, expiresAt: number, impersonatedBy?: string | null }
interface InvitationRow { _id: string, email: string, role?: string | null, status: string, expiresAt: number }

/**
 * What only a row of each model carries. A document id names its table only
 * to the database, and the adapter reads any id it is given: an id of
 * another table (an invitation's, which has an `email` too, a member's, a
 * session's) must read as no row.
 */
const OF_MODEL: Record<'user' | 'organization', (row: Record<string, unknown>) => boolean> = {
  user: row => typeof row.email === 'string' && typeof row.emailVerified === 'boolean',
  organization: row => typeof row.slug === 'string' && typeof row.name === 'string',
}

/** A search term as the adapter takes it: trimmed, and nothing at all for an empty one. */
function searchTerm(value: string | undefined, lowerCase: boolean): string | null {
  const term = value?.trim() ?? ''
  if (!term) return null
  return lowerCase ? term.toLowerCase() : term
}

/** A page request held to the console's page size. */
function boundedPage(options: PaginationArgs): PaginationArgs {
  return { ...options, numItems: Math.max(1, Math.min(Math.floor(options.numItems), MAX_PAGE)) }
}

/**
 * The admin console's reads: every account and every workspace, for an
 * administrator, read fresh from the auth tables. Each answers `null` to
 * anyone else: signed out, an account whose role (read fresh, never from
 * the token) is no administrator role, a banned or deleted one, a session
 * an administrator opened by impersonating someone.
 * The console's writes are the auth routes', held to the sensitive-action
 * table: banning, unbanning, setting a role and starting an impersonation
 * take a recent sign-in, and every one spends the per-caller `admin` limit.
 * Reads spend nothing: a query cannot write a bucket.
 *
 * Workspaces are read-only here: an administrator acts inside one only by
 * impersonating a member, and an administrator's own account is never
 * impersonated.
 *
 * @example
 * ```ts [backend/admin.ts]
 * import { setupAdmin } from 'nuxt-backend/admin'
 * import { components } from './_generated/api'
 *
 * const admin = setupAdmin(components)
 *
 * // The reads behind useAdmin and the admin console (/admin).
 * export const { listUsers, getUser, listWorkspaces, getWorkspace } = admin.api
 * ```
 *
 * @example With content duties: reports, the notice form and appeals
 * ```ts [backend/admin.ts]
 * import type { DataModel } from './_generated/dataModel'
 *
 * // The DataModel types the reported row: `table` narrows `id` to its table's.
 * const admin = setupAdmin<DataModel>(components, {
 *   email,
 *   reports: {
 *     describe: async (ctx, { table, id }) => {
 *       if (table !== 'strips') return null
 *       const strip = await ctx.db.get('strips', id)
 *       return strip && { title: strip.idea, url: `/strips/${id}`, authorId: strip.authorId, files: strip.photoId ? [strip.photoId] : [] }
 *     },
 *     hide: async (ctx, { id }) => ctx.db.patch('strips', id, { hidden: true }),
 *   },
 * })
 * ```
 */
export function setupAdmin<DM extends GenericDataModel = GenericDataModel>(components: AdminComponents, options: SetupAdminReportsOptions<DM>): AdminWithReports
/** The admin console without content duties: the reads alone. */
export function setupAdmin<DM extends GenericDataModel = GenericDataModel>(components: AdminComponents, options?: SetupAdminOptions<DM>): Admin
/** The implementation of both. */
export function setupAdmin(components: AdminComponents, typedOptions: object = {}): Admin {
  const options = typedOptions as SetupAdminOptions
  const adapter = (components.backend as { adapter: { findOne: FindOne, findMany: FindMany } }).adapter
  // The launch access's ledger, in a component that has it.
  const ticketOf = (components.backend as { access?: { ticketOf?: FunctionReference<'query', 'internal', { userId: string }, { kind: string, label?: string } | null> } }).access?.ticketOf
  const reads = createAccessReads(adapter.findOne as unknown as AdapterFindOne)
  const adminRoles: readonly string[] = options.adminRoles ?? DEFAULT_ADMIN_ROLES
  const administrators: Administrators = { roles: adminRoles, userIds: options.adminUserIds ?? [] }

  /** Whether the caller may read the console: an administrator now, in person. */
  const administrator = (ctx: GenericQueryCtx<GenericDataModel>, what: string): Promise<boolean> => isAdministratorNow(ctx, reads, administrators, what)

  const userOf = (row: UserRow): AdminUser => {
    const role = row.role || 'user'
    return {
      id: row._id,
      email: row.email,
      name: row.name ?? '',
      image: row.image ?? null,
      role,
      administrator: isAdministrator({ id: row._id, role }, administrators),
      banned: row.banned === true,
      banReason: row.banned ? row.banReason ?? null : null,
      banExpires: row.banned && typeof row.banExpires === 'number' ? row.banExpires : null,
      emailVerified: row.emailVerified === true,
      lastSignInMethod: row.lastLoginMethod ?? null,
      passkeyOnly: row.passkeyOnly === true,
      createdAt: row.createdAt,
    }
  }

  const workspaceOf = (row: OrganizationRow): AdminWorkspace => ({ id: row._id, name: row.name, slug: row.slug, logo: row.logo ?? null, createdAt: row.createdAt })

  /** One row by its id, or `null`: no id at all reads as none, and so does an id of another table ({@link OF_MODEL}). */
  async function byId<T>(ctx: GenericQueryCtx<GenericDataModel>, model: 'user' | 'organization', id: string): Promise<T | null> {
    let row: unknown
    try {
      row = await ctx.runQuery(adapter.findOne, { model, where: [{ field: '_id', value: id }] })
    }
    catch {
      return null
    }
    return row && typeof row === 'object' && OF_MODEL[model](row as Record<string, unknown>) ? row as T : null
  }

  /** The first {@link DETAIL_ROWS} rows of a model where a field holds a value, and whether there are more. */
  async function rowsWhere<T>(ctx: GenericQueryCtx<GenericDataModel>, model: string, field: string, value: string): Promise<{ rows: T[], more: boolean }> {
    const result = await ctx.runQuery(adapter.findMany, { model, where: [{ field, value }], paginationOpts: { numItems: DETAIL_ROWS, cursor: null } })
    return { rows: result.page as T[], more: !result.isDone }
  }

  const listUsers = queryGeneric({
    args: { search: v.optional(v.string()), paginationOpts: paginationOptsValidator },
    handler: async (ctx, { search, paginationOpts }): Promise<AdminUserPage | null> => {
      if (!await administrator(ctx, 'listUsers')) return null
      const term = searchTerm(search, true)
      const result = await ctx.runQuery(adapter.findMany, {
        model: 'user',
        ...(term ? { where: [{ field: 'email', operator: 'contains', value: term }] } : {}),
        sortBy: { field: 'createdAt', direction: 'desc' },
        paginationOpts: boundedPage(paginationOpts),
      })
      return { page: (result.page as UserRow[]).map(userOf), isDone: result.isDone, continueCursor: result.continueCursor }
    },
  })

  const getUser = queryGeneric({
    args: { userId: v.string() },
    handler: async (ctx, { userId }): Promise<AdminUserDetail | null> => {
      if (!await administrator(ctx, 'getUser')) return null
      const row = await byId<UserRow>(ctx, 'user', userId)
      if (!row) return null
      const workspaces: AdminMembership[] = []
      const memberships = await rowsWhere<MemberRow>(ctx, 'member', 'userId', row._id)
      for (const membership of memberships.rows) {
        const workspace = await byId<OrganizationRow>(ctx, 'organization', membership.organizationId)
        if (!workspace) continue
        workspaces.push({ workspaceId: workspace._id, name: workspace.name, slug: workspace.slug, role: membership.role || 'member', joinedAt: membership.createdAt })
      }
      const devices = await rowsWhere<SessionRow>(ctx, 'session', 'userId', row._id)
      const sessions = devices.rows
        .sort((a, b) => b.expiresAt - a.expiresAt || b.createdAt - a.createdAt)
        .map(session => ({
          id: session._id,
          userAgent: session.userAgent ?? null,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          expiresAt: session.expiresAt,
          impersonated: Boolean(session.impersonatedBy),
        }))
      const ticket = ticketOf ? await ctx.runQuery(ticketOf, { userId: row._id }) : null
      return { user: userOf(row), workspaces, sessions, truncated: memberships.more || devices.more, ticket }
    },
  })

  const listWorkspaces = queryGeneric({
    args: { search: v.optional(v.string()), paginationOpts: paginationOptsValidator },
    handler: async (ctx, { search, paginationOpts }): Promise<AdminWorkspacePage | null> => {
      if (!await administrator(ctx, 'listWorkspaces')) return null
      const term = searchTerm(search, false)
      const result = await ctx.runQuery(adapter.findMany, {
        model: 'organization',
        ...(term ? { where: [{ field: 'name', operator: 'contains', value: term }] } : {}),
        sortBy: { field: 'createdAt', direction: 'desc' },
        paginationOpts: boundedPage(paginationOpts),
      })
      return { page: (result.page as OrganizationRow[]).map(workspaceOf), isDone: result.isDone, continueCursor: result.continueCursor }
    },
  })

  const getWorkspace = queryGeneric({
    args: { workspaceId: v.string() },
    handler: async (ctx, { workspaceId }): Promise<AdminWorkspaceDetail | null> => {
      if (!await administrator(ctx, 'getWorkspace')) return null
      const workspace = await byId<OrganizationRow>(ctx, 'organization', workspaceId)
      if (!workspace) return null
      const members: AdminWorkspaceMember[] = []
      const memberships = await rowsWhere<MemberRow>(ctx, 'member', 'organizationId', workspace._id)
      for (const membership of memberships.rows) {
        const user = await byId<UserRow>(ctx, 'user', membership.userId)
        const role = user?.role || 'user'
        members.push({
          userId: membership.userId,
          name: user?.name ?? '',
          email: user?.email ?? '',
          role: membership.role || 'member',
          administrator: isAdministrator({ id: membership.userId, role }, administrators),
          banned: user?.banned === true,
          joinedAt: membership.createdAt,
        })
      }
      const sent = await rowsWhere<InvitationRow>(ctx, 'invitation', 'organizationId', workspace._id)
      const invitations = sent.rows
        .filter(invitation => invitation.status === 'pending')
        .map(invitation => ({ id: invitation._id, email: invitation.email, role: invitation.role || 'member', expiresAt: invitation.expiresAt }))
      return { workspace: workspaceOf(workspace), members, invitations, truncated: memberships.more || sent.more }
    },
  })

  const funnelReport = (components.backend as { funnel: { report: FunctionReference<'query', 'internal', { weeks: number, until?: number }, FunnelReport> } }).funnel.report

  // Counted inside the deployment; the window comes from the caller, so the read stays a pure function of the data.
  const getFunnel = queryGeneric({
    args: { weeks: v.number(), until: v.optional(v.number()) },
    handler: async (ctx, { weeks, until }): Promise<FunnelReport> => {
      await requireAdministratorNow(ctx, reads, administrators, 'getFunnel')
      return ctx.runQuery(funnelReport, { weeks, ...(until === undefined ? {} : { until }) })
    },
  })

  const reports = options.reports
    ? createReports(components as never, options.reports, { email: options.email as Pick<Email, 'sendTemplate'>, administrators, reportPath: resolveBackendPaths(options.paths, 'setupAdmin').report })
    : undefined

  return {
    api: { listUsers, getUser, listWorkspaces, getWorkspace, getFunnel, ...reports } as AdminApi,
    adminRoles,
    adminUserIds: administrators.userIds,
  }
}
