import { createFunctionHandle, type FunctionReference, type GenericActionCtx, type GenericDataModel, type GenericQueryCtx, mutationGeneric, paginationOptsValidator, queryGeneric, type RegisteredMutation, type RegisteredQuery } from 'convex/server'
import { v } from 'convex/values'
import { vCampaignTouch, vRecordedEvent, vSourceView } from '../components/backend/schema.js'
import type { Activation, ActivationLookup, ActivationView } from '../activation-rules.js'
import { IMPERSONATED_BY_CLAIM } from '../constants.js'
import { backendError } from '../errors.js'
import { type AppEventType, type BackendEventData, type BackendEventType, type EventDeliveries, eventProblem, type EventRow } from '../events.js'
import { type CampaignTouch, isEventKind, SOURCE_DETAIL_MAX } from '../funnel-rules.js'
import { logBackend } from '../log.js'
import type { NotificationPlan, NotifyEvent } from '../notifications.js'
import { type AdapterFindOne, claimedSignInMethod, createAccessReads, hasAnyRole, passkeyOnlyAdminRefusal, refuseCaller } from './access.js'

// The shared event path, for the app: one call records an event on the
// audit trail, and the trail reads back as three pages of activity.

/** The activation checklist: `defineActivation` declares it, `setupAudit({ checklist })` serves it. */
export { defineActivation } from '../activation-rules.js'
/** The UTM values of a campaign link, as `recordSource` takes them. */
export type { CampaignTouch } from '../funnel-rules.js'
export type { Activation, ActivationScope, ActivationTask, ActivationTaskView, ActivationView } from '../activation-rules.js'

/** The event catalog: every kind the package records, with its fields, who reads it and what it derives. */
export { BACKEND_EVENTS } from '../events.js'
export type {
  AppEventType,
  BackendEventData,
  BackendEventDefinition,
  BackendEventType,
  EventChannel,
  EventDataValue,
  EventDeliveries,
  EventFieldsOf,
  EventFieldType,
  EventFieldValue,
  EventReader,
  EventScope,
} from '../events.js'

/**
 * The event `onEvent` receives: the row as recorded, with its id and when it
 * was recorded (epoch ms). Use it as your action's `args`:
 * `internalAction({ args: { event: vBackendEvent }, handler })`.
 */
export const vBackendEvent = vRecordedEvent

/** An event as `onEvent` receives it ({@link vBackendEvent}). */
export type RecordedBackendEvent = typeof vBackendEvent.type

/**
 * Your internal action that hears of every event once it is recorded: an
 * `internalAction` taking `{ event: vBackendEvent }`, passed by its
 * reference (`internal.audit.onEvent`).
 */
export type OnBackendEvent = FunctionReference<'action', 'internal', { event: RecordedBackendEvent }>

/** Who acted, when the event says it rather than the caller's identity. */
export interface BackendEventActor {
  /** The account that acted. */
  userId: string
  /** The administrator behind an impersonated session, when one acted as `userId`. */
  impersonatorId?: string
}

/** One event to record. */
export interface BackendEventInput<T extends BackendEventType | AppEventType> {
  /** A kind of the catalog (`BACKEND_EVENTS`), or one of your own under `app.`: `app.project_archived`. */
  type: T
  /**
   * Who acted. Left out, it is the caller's identity: the account, the
   * administrator impersonating it, from the token's claims. `null` for the app itself (a webhook, a job).
   */
  actor?: BackendEventActor | null
  /**
   * The account the event is about, whose own activity lists it. Left out,
   * it is the actor's; `null` for none.
   */
  subjectId?: string | null
  /** The workspace it happened in, whose activity lists it. A workspace kind requires it. */
  entityId?: string
  /** The thing acted on: a project's id, a passkey's, an invitation's. Never an address. */
  targetId?: string
  /**
   * The kind's own fields (a package kind's are typed and checked); for a
   * kind of your own, at most 16 flat values. Never an address, a name or a
   * secret: rows are kept for a year.
   */
  data?: BackendEventData<T>
}

/** What recording an event gives back: the row's id, and what the event derives by the channel matrix. */
export interface RecordedEventResult {
  id: string
  deliveries: EventDeliveries
}

/** Someone an activity entry names, as its reader may know them. */
export interface AuditParty {
  /**
   * `you`: the reader. `user`: another account, by its name.
   * `administrator`: an administrator, unnamed to the account they acted on.
   * `app`: nobody signed in (a webhook, a job). `erased`: an account since
   * erased.
   */
  kind: 'you' | 'user' | 'administrator' | 'app' | 'erased'
  id: string | null
  name: string | null
}

/** One entry of a page of activity. */
export interface AuditEntry {
  id: string
  type: string
  /** When it was recorded, epoch ms. */
  at: number
  /** Who acted. */
  actor: AuditParty
  /** The account it is about. */
  subject: AuditParty | null
  /** The workspace it happened in, by its name now. */
  workspace: { id: string, name: string | null } | null
  /** An administrator acted for the account, in a session they opened as it. */
  impersonated: boolean
  /** The thing acted on. */
  targetId: string | null
  /** The kind's own fields. */
  data: Record<string, string | number | boolean | string[]>
}

/** A page of activity, newest first. */
export interface AuditPage {
  page: AuditEntry[]
  isDone: boolean
  continueCursor: string
}

/** The reads behind `useAuditLog`, re-exported by `backend/audit.ts`. */
export interface AuditApi {
  /** The caller's own activity: what happened to their account, and in it. `null` for a caller who has none to read (signed out). */
  listActivity: RegisteredQuery<'public', { paginationOpts: PaginationArgs }, Promise<AuditPage | null>>
  /** The active workspace's activity, for its owners and admins (`workspaceRoles`). `null` for anyone else. */
  listWorkspaceActivity: RegisteredQuery<'public', { paginationOpts: PaginationArgs }, Promise<AuditPage | null>>
  /** Every event, for the app's administrators (`adminRoles`). `null` for anyone else. */
  listAllActivity: RegisteredQuery<'public', { paginationOpts: PaginationArgs }, Promise<AuditPage | null>>
  /**
   * The activation checklist as the caller reads it: each task with whether its event landed, the progress and whether it was dismissed. `null` when nobody is signed in; with no `checklist` set up, a view with no tasks. While an administrator visits the account, the progress reads but `readOnly` is `true`.
   */
  getActivation: RegisteredQuery<'public', Record<string, never>, Promise<ActivationView | null>>
  /** Dismiss the activation checklist for the caller. Refused as `forbidden` (reason `impersonating`) for an administrator's visit. */
  dismissActivation: RegisteredMutation<'public', Record<string, never>, Promise<null>>
  /**
   * Whether the caller was asked how they heard about the app, with their
   * answer and first campaign: what `<HowDidYouHear>` reads so nobody is
   * asked twice. `null` when nobody is signed in.
   */
  getSource: RegisteredQuery<'public', Record<string, never>, Promise<SourceView | null>>
  /**
   * Record how the caller found the app: `answer` (an option's name, or
   * `null` for "Skip", once), `detail` (an "Other" answer's own words) and
   * `touch` (the UTM values of the campaign link they arrived through, kept
   * as their first within a day of their sign-up). Refused as
   * `unauthenticated` for nobody signed in, and as `forbidden`
   * (`impersonating`) for an administrator's visit: it is the person's own.
   */
  recordSource: RegisteredMutation<'public', { answer?: string | null, detail?: string, touch?: CampaignTouch }, Promise<SourceView>>
}

/** Where a person stands with "How did you hear about us?". */
export interface SourceView {
  /** They answered or skipped it: it is not asked again. */
  asked: boolean
  /** Their answer's name; `null` for none or a skip. */
  answer: string | null
  /** The first campaign they arrived through; `null` for none. */
  campaign: string | null
}

/** A page request, as `paginationOptsValidator` takes it. */
type PaginationArgs = typeof paginationOptsValidator.type

/** What records an event: a mutation or an action ctx (an HTTP action's too). */
export interface AuditCtx {
  runMutation: GenericActionCtx<GenericDataModel>['runMutation']
  auth: GenericActionCtx<GenericDataModel>['auth']
}

/** The shared event path for one app, from {@link setupAudit}. */
export interface Audit {
  /**
   * Record one event on the audit trail, in the caller's transaction when
   * the caller is a mutation: its row, one log line naming only its type
   * and id, and `onEvent`, scheduled once it commits. Refuses an event the
   * catalog does not allow (`invalid_input`, the field named).
   */
  recordBackendEvent: <T extends BackendEventType | AppEventType>(ctx: AuditCtx, event: BackendEventInput<T>) => Promise<RecordedEventResult>
  /**
   * The audit trail's part of an account's erasure: the account's own
   * record is removed (its personal workspace's with it), and its id becomes
   * a pseudonym in the rows that stay: a workspace's trail, what it did to
   * someone else, and every row an administrator took part in, which no
   * deletion removes. The auth layer runs it when an account is deleted.
   */
  forgetSubject: (ctx: Pick<AuditCtx, 'runMutation'>, userId: string) => Promise<void>
  /** The public reads `backend/audit.ts` re-exports. */
  api: AuditApi
}

export interface SetupAuditOptions {
  /**
   * Hear of every event once it is recorded, the package's own and yours:
   * an internal action of yours, by its reference, taking
   * `{ event: vBackendEvent }`. Forward an event to a chat channel, an
   * analytics pipeline, a SIEM. The auth layer's events reach it when
   * `setupAuth` gets this instance as `audit`.
   *
   * @guarantee
   * - Runs: in an action of its own, scheduled by the transaction that recorded the event, once it commits
   * - Delivery: once per event, fire and forget: nothing retries a run that fails, and the event stays recorded
   * - Order: scheduled in the order events are recorded; runs may overlap, so order across events is not kept
   * - When it throws: the failure is the action's own, in the deployment's logs; the event and what recorded it stand
   * - Idempotency: key what it writes on `event.id`
   */
  onEvent?: OnBackendEvent
  /**
   * The inbox (`setupNotifications`), so an event of your own that its `notify`
   * names reaches the people it is about as it is recorded, and email and
   * push notifications go out through its `deliverNotification`. The
   * package's own kinds reach the inbox without it.
   */
  notifications?: { plan: (event: NotifyEvent) => NotificationPlan | null, deliver?: () => Promise<string | undefined> }
  /** The workspace roles that read a workspace's activity (`listWorkspaceActivity`). Default `['owner', 'admin']`. */
  workspaceRoles?: string[]
  /** The app-wide roles that read every event (`listAllActivity`), read fresh. Default `['admin']`. */
  adminRoles?: string[]
  /**
   * The activation checklist `defineActivation` declares: three to seven
   * first tasks, each done when its event is recorded for the person.
   * `getActivation` serves it to `useActivation` and `<ActivationChecklist>`.
   */
  checklist?: Activation
  /**
   * The event kind that says a person got value from the app: the growth
   * funnel's activation step, recorded once per account as
   * `account.activated`, which starts the `reviewAsk` lifecycle email. One
   * of yours (`app.strip_published`) or one the package records. Default:
   * the account's first event of the app's own (`app.*`). An event
   * recorded while an administrator acts as the account never counts.
   */
  activation?: string
}

/** The `backend` component as the audit trail reads it. */
export interface AuditComponents {
  backend: unknown
}

interface AuditRefs {
  audit: {
    record: FunctionReference<'mutation', 'internal', { event: EventRow, forward?: string, notify?: NotificationPlan, deliver?: string }, RecordedEventResult>
    list: FunctionReference<'query', 'internal', { view: unknown, paginationOpts: PaginationArgs }, AuditPage>
    forgetSubject: FunctionReference<'mutation', 'internal', { userId: string }, null>
    firstEvents: FunctionReference<'query', 'internal', { userId: string, workspaceId?: string, tasks: ActivationLookup[] }, Array<{ key: string, at: number | null }>>
  }
  funnel: {
    source: FunctionReference<'query', 'internal', { userId: string }, SourceView>
    recordSource: FunctionReference<'mutation', 'internal', { userId: string, answer?: string | null, detail?: string, touch?: CampaignTouch }, SourceView>
  }
  onboarding: {
    marks: FunctionReference<'query', 'internal', { userId: string }, { onboardedAt: number | null, activationDismissedAt: number | null }>
    dismissActivation: FunctionReference<'mutation', 'internal', { userId: string }, number | null>
  }
  adapter: { findOne: AdapterFindOne }
}

/** The default `workspaceRoles`: who manages a workspace. */
const WORKSPACE_ROLES = ['owner', 'admin']

/** Who acted, from the caller's token: the account, the administrator impersonating it. */
async function actorOf(ctx: AuditCtx): Promise<BackendEventActor | null> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return null
  const claims = identity as unknown as Record<string, unknown>
  const impersonatorId = claims[IMPERSONATED_BY_CLAIM]
  return {
    userId: identity.subject,
    ...(typeof impersonatorId === 'string' ? { impersonatorId } : {}),
  }
}

/** The row an input becomes: every id resolved, and nothing left `undefined`. */
function rowOf(event: BackendEventInput<BackendEventType | AppEventType>, actor: BackendEventActor | null): EventRow {
  const subjectId = event.subjectId === undefined ? actor?.userId : event.subjectId ?? undefined
  const fields: EventRow = {
    type: event.type,
    actorId: actor?.userId,
    impersonatorId: actor?.impersonatorId,
    subjectId,
    entityId: event.entityId,
    targetId: event.targetId,
    data: event.data as EventRow['data'],
  }
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as unknown as EventRow
}

/**
 * The shared event path: record an event of the package's catalog or of
 * your own, read the activity trail back, and hear of every event.
 *
 * Every sign-in and sign-out, passkey and email change, signed-out device,
 * workspace invitation, membership and role change, administrator
 * impersonation is recorded already; add your own with
 * `recordBackendEvent`. Rows are kept 365 days.
 *
 * @example
 * ```ts [backend/audit.ts]
 * import { setupAudit } from 'nuxt-backend/audit'
 * import { components } from './_generated/api'
 *
 * export const audit = setupAudit(components)
 * export const { listActivity, listWorkspaceActivity, listAllActivity } = audit.api
 * ```
 */
export function setupAudit(components: AuditComponents, options: SetupAuditOptions = {}): Audit {
  const refs = components.backend as AuditRefs
  const reads = createAccessReads(refs.adapter.findOne)
  const workspaceRoles = options.workspaceRoles ?? WORKSPACE_ROLES
  const adminRoles = options.adminRoles ?? ['admin']
  if (options.activation !== undefined && !isEventKind(options.activation)) {
    throw new TypeError(`[nuxt-backend] setupAudit: \`activation\` ${options.activation} is no event kind: one of yours under \`app.\` (app.strip_published), or one the package records.`)
  }
  const activation = options.activation
  // A handle names the function, so one per isolate does.
  let handle: Promise<string> | undefined

  /**
   * The handle the trail schedules `onEvent` by; none without one. A
   * handle that cannot be made is logged and tried again on the next event,
   * which is recorded all the same.
   */
  async function forward(type: string): Promise<string | undefined> {
    if (!options.onEvent) return undefined
    try {
      return await (handle ??= createFunctionHandle(options.onEvent))
    }
    catch (error) {
      handle = undefined
      logBackend('warn', 'audit.forward_failed', `No handle for the app's onEvent action: ${type} is recorded without it.`, error)
      return undefined
    }
  }

  const recordBackendEvent: Audit['recordBackendEvent'] = async (ctx, event) => {
    const actor = event.actor === undefined ? await actorOf(ctx) : event.actor
    const row = rowOf(event as BackendEventInput<BackendEventType | AppEventType>, actor)
    const problem = eventProblem(row)
    if (problem) throw backendError('invalid_input', { field: problem.field, reason: problem.reason }, `[nuxt-backend] recordBackendEvent: ${problem.field} must be ${problem.reason}.`)
    const forwardTo = await forward(row.type)
    const notify = options.notifications?.plan(row)
    // Email and push notifications go through the app's deliverNotification, by its handle.
    const deliver = await options.notifications?.deliver?.()
    return ctx.runMutation(refs.audit.record, { event: row, ...(forwardTo ? { forward: forwardTo } : {}), ...(notify ? { notify } : {}), ...(deliver ? { deliver } : {}), ...(activation ? { activation } : {}) })
  }

  /** The caller's account id and claims, or `null` when nobody is asking. */
  async function reader(ctx: GenericQueryCtx<GenericDataModel>) {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    const claims = identity as unknown as Record<string, unknown>
    return { userId: identity.subject, claims }
  }

  const page = (ctx: GenericQueryCtx<GenericDataModel>, view: unknown, paginationOpts: PaginationArgs) =>
    ctx.runQuery(refs.audit.list, { view, paginationOpts })

  const listActivity = queryGeneric({
    args: { paginationOpts: paginationOptsValidator },
    handler: async (ctx, { paginationOpts }): Promise<AuditPage | null> => {
      const caller = await reader(ctx)
      return caller ? page(ctx, { kind: 'subject', userId: caller.userId }, paginationOpts) : null
    },
  })

  // The active workspace's, read fresh: a member removed or demoted since
  // their token was minted reads nothing.
  const listWorkspaceActivity = queryGeneric({
    args: { paginationOpts: paginationOptsValidator },
    handler: async (ctx, { paginationOpts }): Promise<AuditPage | null> => {
      const caller = await reader(ctx)
      const workspaceId = caller?.claims.activeOrganizationId
      if (!caller || typeof workspaceId !== 'string' || !workspaceId) return null
      const role = await reads.memberRole(ctx, caller.userId, workspaceId)
      if (!role || !hasAnyRole(role, workspaceRoles)) return null
      return page(ctx, { kind: 'workspace', workspaceId, viewerId: caller.userId }, paginationOpts)
    },
  })

  // Every event, for an administrator whose role is read fresh, held on a
  // sandbox to the package's admin rule (a passkey-only account, signed in
  // to this session with a passkey).
  const listAllActivity = queryGeneric({
    args: { paginationOpts: paginationOptsValidator },
    handler: async (ctx, { paginationOpts }): Promise<AuditPage | null> => {
      const caller = await reader(ctx)
      const account = caller ? await reads.account(ctx, caller.userId) : null
      if (!caller || !account || account.banned || !hasAnyRole(account.role, adminRoles)) return null
      if (passkeyOnlyAdminRefusal(account, claimedSignInMethod(caller.claims), 'listAllActivity')) return null
      return page(ctx, { kind: 'all', viewerId: caller.userId }, paginationOpts)
    },
  })

  const checklist = options.checklist

  const vTaskView = v.object({
    key: v.string(),
    label: v.string(),
    to: v.union(v.string(), v.null()),
    scope: v.union(v.literal('person'), v.literal('workspace')),
    done: v.boolean(),
    doneAt: v.union(v.number(), v.null()),
  })
  const vActivationView = v.object({
    tasks: v.array(vTaskView),
    done: v.number(),
    total: v.number(),
    progress: v.number(),
    isComplete: v.boolean(),
    isDismissed: v.boolean(),
    readOnly: v.boolean(),
  })

  // The checklist as its caller reads it. An administrator's visit reads the
  // account's progress (the token's subject is the account) and is told it
  // is read-only; nobody signed in, and an app with no checklist, read nothing.
  const getActivation = queryGeneric({
    args: {},
    returns: v.union(vActivationView, v.null()),
    handler: async (ctx): Promise<ActivationView | null> => {
      const caller = await reader(ctx)
      if (!caller) return null
      const active = caller.claims.activeOrganizationId
      const readOnly = typeof caller.claims[IMPERSONATED_BY_CLAIM] === 'string'
      // An app with no checklist has no tasks to list; nothing is read.
      if (!checklist) return { tasks: [], done: 0, total: 0, progress: 0, isComplete: false, isDismissed: false, readOnly }
      // The active workspace's tasks, for a member read fresh: one removed
      // since their token was minted reads them open.
      const workspaceId = typeof active === 'string' && active && await reads.memberRole(ctx, caller.userId, active) ? active : undefined
      const [marks, firsts] = await Promise.all([
        ctx.runQuery(refs.onboarding.marks, { userId: caller.userId }),
        ctx.runQuery(refs.audit.firstEvents, {
          userId: caller.userId,
          ...(workspaceId ? { workspaceId } : {}),
          tasks: checklist.tasks.map(task => ({ key: task.key, kind: task.done, scope: task.scope ?? 'person' })),
        }),
      ])
      const at = new Map(firsts.map(first => [first.key, first.at]))
      const tasks = checklist.tasks.map((task) => {
        const doneAt = at.get(task.key) ?? null
        return { key: task.key, label: task.label, to: task.to ?? null, scope: task.scope ?? 'person', done: doneAt !== null, doneAt }
      })
      const done = tasks.filter(task => task.done).length
      return {
        tasks,
        done,
        total: tasks.length,
        progress: tasks.length ? done / tasks.length : 0,
        isComplete: done === tasks.length,
        isDismissed: marks.activationDismissedAt !== null,
        readOnly,
      }
    },
  })

  const dismissActivation = mutationGeneric({
    args: {},
    returns: v.null(),
    handler: async (ctx): Promise<null> => {
      const caller = await reader(ctx)
      if (!caller) throw backendError('unauthenticated', {}, '[nuxt-backend] dismissActivation: sign in first.')
      refuseCaller(caller.claims, { impersonation: 'refused' }, 'dismissActivation')
      if (checklist) await ctx.runMutation(refs.onboarding.dismissActivation, { userId: caller.userId })
      return null
    },
  })

  const getSource = queryGeneric({
    args: {},
    returns: v.union(vSourceView, v.null()),
    handler: async (ctx): Promise<SourceView | null> => {
      const caller = await reader(ctx)
      return caller ? ctx.runQuery(refs.funnel.source, { userId: caller.userId }) : null
    },
  })

  // The person's own answer and the link they came through: an
  // administrator's visit may not answer for them, and nobody signed in has no account to attribute.
  const recordSource = mutationGeneric({
    args: {
      answer: v.optional(v.union(v.string(), v.null())),
      detail: v.optional(v.string()),
      touch: v.optional(vCampaignTouch),
    },
    returns: vSourceView,
    handler: async (ctx, { answer, detail, touch }): Promise<SourceView> => {
      const caller = await reader(ctx)
      if (!caller) throw backendError('unauthenticated', {}, '[nuxt-backend] recordSource: sign in first.')
      refuseCaller(caller.claims, { impersonation: 'refused' }, 'recordSource')
      if (detail !== undefined && detail.length > SOURCE_DETAIL_MAX * 4) throw backendError('invalid_input', { field: 'detail' }, '[nuxt-backend] recordSource: the answer is too long.')
      return ctx.runMutation(refs.funnel.recordSource, {
        userId: caller.userId,
        ...(answer !== undefined ? { answer } : {}),
        ...(detail !== undefined ? { detail } : {}),
        ...(touch ? { touch } : {}),
      })
    },
  })

  return {
    recordBackendEvent,
    forgetSubject: async (ctx, userId) => {
      await ctx.runMutation(refs.audit.forgetSubject, { userId })
    },
    api: { listActivity, listWorkspaceActivity, listAllActivity, getActivation, dismissActivation, getSource, recordSource } as unknown as AuditApi,
  }
}
