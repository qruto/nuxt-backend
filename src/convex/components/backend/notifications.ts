import { type FunctionHandle, paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'
import type { Doc } from './_generated/dataModel.js'
import { mutation, type MutationCtx, query, type QueryCtx } from './_generated/server.js'
import { normalizeLocale } from '../../locale.js'
import { administratorActs, nameReader, partyOf, vPartyKind } from './parties.js'
import { vEventData } from './schema.js'
import { type EventRow, isBackendEventType } from '../../events.js'
import { logBackend } from '../../log.js'
import {
  type ChannelGate,
  type ChannelHandler,
  declaredChannels,
  isAppPath,
  type Delivery,
  NOTIFICATION_KINDS,
  NOTIFICATION_PAGE_MAX,
  NOTIFICATION_RECIPIENTS_MAX,
  type NotificationChannel,
  type NotificationKind,
  type NotificationPlan,
  notificationChannels,
  UNREAD_COUNT_MAX,
  type vScheduledDelivery,
} from '../../notifications.js'

/**
 * Notifications: the component's half of `setupNotifications`. Recording an
 * event on the audit trail (`audit.record`) calls {@link notifyEvent} in the
 * same transaction: it decides who the event is for, which channels its kind
 * may use (the matrix in `notifications.ts` of the package's source), asks
 * the person's choices ({@link CHANNEL_GATES}) and hands the notification to
 * each channel: the inbox writes its row here, and email and push are each
 * a scheduled run of the app's `deliverNotification` action (a function
 * handle the app's `setupAudit` passes), which words, renders and sends it
 * under the app's own messages, brand and sending rules. A channel only
 * enqueues in this transaction: nothing is sent before the event commits.
 *
 * A row restates an event, never the words: they are labels, read in the
 * reader's language when it is shown. The reads and writes below trust their
 * caller, the app's `setupNotifications`, which decides who may call them.
 */

/** The audit event a notification restates, with the id and time `record` gave it. */
type RecordedRow = EventRow & { id: string, at: number }

// ── The channel contract ──────────────────────────────────────────────────

/** What a notification keeps of its event: who acted (an administrator's visit as a flag), where, on what, and its values. */
function eventFields(event: Delivery['event']) {
  return {
    ...(event.actorId ? { actorId: event.actorId } : {}),
    ...(event.impersonatorId ? { impersonated: true } : {}),
    ...(event.entityId ? { entityId: event.entityId } : {}),
    ...(event.targetId ? { targetId: event.targetId } : {}),
    ...(event.data && Object.keys(event.data).length > 0 ? { data: event.data } : {}),
  }
}

/** The inbox: one row in the transaction that recorded the event. */
const inbox: ChannelHandler<MutationCtx> = {
  async deliver(ctx, { userId, event, link }) {
    // An event handed over twice notifies a person once.
    const existing = await ctx.db.query('notifications').withIndex('eventId_userId', q => q.eq('eventId', event.id).eq('userId', userId)).first()
    if (existing) return true
    await ctx.db.insert('notifications', {
      userId,
      type: event.type,
      eventId: event.id,
      ...eventFields(event),
      ...(link ? { link } : {}),
      channels: ['app'],
      at: event.at,
    })
    return true
  },
}

/**
 * A channel the app delivers: the notification is handed to its
 * `deliverNotification` action by a scheduled run, with ids and the kind's
 * few values only (no address, no words), and marked as gone out on it.
 */
function scheduled(channel: 'email' | 'push', deliver: string): ChannelHandler<MutationCtx> {
  return {
    async deliver(ctx, { userId, event, link }) {
      const args: typeof vScheduledDelivery.type = {
        userId,
        channel,
        event: { id: event.id, type: event.type, at: event.at, ...eventFields(event) },
        link,
      }
      await ctx.scheduler.runAfter(0, deliver as FunctionHandle<'action'>, args)
      const row = await ctx.db.query('notifications').withIndex('eventId_userId', q => q.eq('eventId', event.id).eq('userId', userId)).first()
      if (row && !row.channels.includes(channel)) await ctx.db.patch('notifications', row._id, { channels: [...row.channels, channel] })
      return true
    },
  }
}

/**
 * The channels that deliver, by name: the inbox here, and email and push
 * through the app's `deliverNotification` once `setupAudit` hands its
 * handle over (`deliver`). Without one, a notification goes out in the app
 * alone.
 */
export const CHANNELS: Partial<Record<NotificationChannel, ChannelHandler<MutationCtx>>> = { app: inbox }

/** The channels for one event: the inbox, and the app's delivery when it has one. */
function channelsWith(deliver: string | undefined): Partial<Record<NotificationChannel, ChannelHandler<MutationCtx>>> {
  return deliver ? { ...CHANNELS, email: scheduled('email', deliver), push: scheduled('push', deliver) } : CHANNELS
}

/** A person's choice of one channel for one kind, or `null` when they made none. */
async function choiceOf(ctx: QueryCtx, userId: string, type: string, channel: NotificationChannel): Promise<boolean | null> {
  const row = await ctx.db.query('notificationChoices').withIndex('userId_type_channel', q => q.eq('userId', userId).eq('type', type).eq('channel', channel)).first()
  return row ? row.enabled : null
}

/**
 * Each person's channel choices: a channel they turned off for a kind is
 * skipped, the inbox included. Every channel the kind allows is on until
 * they do. The weekly cap and the quiet hours are the app's to apply as it
 * sends, and never hold the inbox back.
 */
const choices: ChannelGate<MutationCtx> = async (ctx, userId, type, channel) => await choiceOf(ctx, userId, type, channel) !== false

/**
 * The gates a notification passes before each channel, in order: a channel
 * delivers only when every gate says yes. The person's channel choices are
 * the one gate the component holds.
 */
export const CHANNEL_GATES: Array<ChannelGate<MutationCtx>> = [choices]

// ── Who an event is for ───────────────────────────────────────────────────

/** The roles that manage a workspace's billing. */
const MANAGER_ROLES = ['owner', 'admin']

/**
 * The owners and admins of a workspace, up to the most one event notifies.
 * Each role's own range of the member index, so the read stays the same
 * size however many members the workspace has, and a member joining never
 * conflicts with it. A range holds the role alone and a role list that
 * starts with it (`admin,member`); the package writes one role.
 */
async function managersOf(ctx: MutationCtx, workspaceId: string): Promise<string[]> {
  const managers = new Set<string>()
  for (const role of MANAGER_ROLES) {
    const members = await ctx.db.query('member')
      .withIndex('organizationId_role', q => q.eq('organizationId', workspaceId).gte('role', role).lt('role', `${role}-`))
      .take(NOTIFICATION_RECIPIENTS_MAX)
    for (const member of members) {
      if (member.role.split(',').some(held => held.trim() === role)) managers.add(member.userId)
    }
  }
  return [...managers].slice(0, NOTIFICATION_RECIPIENTS_MAX)
}

/** The account that sent the invitation an event names, while it is still a member of the workspace the invitation is for. */
async function inviterOf(ctx: MutationCtx, invitationId: string | undefined): Promise<string[]> {
  const id = invitationId ? ctx.db.normalizeId('invitation', invitationId) : null
  const invitation = id ? await ctx.db.get('invitation', id) : null
  if (!invitation) return []
  // Someone who left, or was taken out, hears nothing more of the workspace.
  const member = await ctx.db.query('member').withIndex('organizationId_userId', q => q.eq('organizationId', invitation.organizationId).eq('userId', invitation.inviterId)).first()
  return member ? [invitation.inviterId] : []
}

/** Who a kind notifies for one event. */
async function recipientsOf(ctx: MutationCtx, kind: Pick<NotificationKind, 'audience'>, event: EventRow): Promise<string[]> {
  switch (kind.audience) {
    case 'inviter': {
      // An invitation the event does not name (one made outside the invitation flow), or whose inviter is no longer a member, tells the workspace's managers instead.
      const inviters = await inviterOf(ctx, event.targetId)
      return inviters.length > 0 ? inviters : event.entityId ? managersOf(ctx, event.entityId) : []
    }
    case 'entity': return event.entityId ? managersOf(ctx, event.entityId) : event.subjectId ? [event.subjectId] : []
    default: return event.subjectId ? [event.subjectId] : []
  }
}

/** The kind of an event: the policy of a package kind, or the app's own (about its subject). */
function kindOf(type: string): NotificationKind | undefined {
  return Object.hasOwn(NOTIFICATION_KINDS, type) ? NOTIFICATION_KINDS[type as keyof typeof NOTIFICATION_KINDS] : undefined
}

/** What an event becomes, for its channels and its link: a package kind's own, else the plan the app's `notify` made. */
function planOf(type: string, plan: NotificationPlan | undefined): { audience: NotificationKind['audience'], skipSelf: boolean, channels: NotificationChannel[], link: string | null } | null {
  if (isBackendEventType(type)) {
    const kind = kindOf(type)
    if (!kind) return null
    const channels = notificationChannels(type, declaredChannels(type))
    return channels.length > 0 ? { audience: kind.audience, skipSelf: kind.skipSelf === true, channels, link: null } : null
  }
  return plan && plan.channels.length > 0 ? { audience: 'subject', skipSelf: false, channels: plan.channels, link: plan.link && isAppPath(plan.link) ? plan.link : null } : null
}

/** Whether every gate lets a channel deliver one notification. */
async function allowed(ctx: MutationCtx, gates: ReadonlyArray<ChannelGate<MutationCtx>>, userId: string, type: string, channel: NotificationChannel): Promise<boolean> {
  for (const gate of gates) {
    if (!await gate(ctx, userId, type, channel)) return false
  }
  return true
}

/**
 * Notify the people an event is for, on each channel its kind may use and
 * the person has not turned off. Called by `audit.record` in its
 * transaction, so a notification commits or rolls back with the event.
 * Returns how many people were notified on any channel. A channel that
 * throws is logged and the others still run; the event stands.
 *
 * `deliver` is the handle of the app's `deliverNotification`, which email
 * and push go through; `options` lets a test stand in for the channels and
 * the gates.
 */
export async function notifyEvent(
  ctx: MutationCtx,
  event: RecordedRow,
  plan?: NotificationPlan,
  options: { deliver?: string, channels?: Partial<Record<NotificationChannel, ChannelHandler<MutationCtx>>>, gates?: ReadonlyArray<ChannelGate<MutationCtx>> } = {},
): Promise<number> {
  const decided = planOf(event.type, plan)
  if (!decided) return 0
  const handlers = options.channels ?? channelsWith(options.deliver)
  const gates = options.gates ?? CHANNEL_GATES
  let notified = 0
  for (const userId of new Set(await recipientsOf(ctx, decided, event))) {
    // An administrator acting as the account did it, not the account: it hears of it.
    if (decided.skipSelf && event.actorId === userId && event.impersonatorId === undefined) continue
    if (await deliverTo(ctx, { userId, event, link: decided.link }, decided.channels, handlers, gates)) notified++
  }
  return notified
}

/** One person's notification on each channel: those a gate lets through and that have a handler. True when any delivered. A channel that throws is logged, and the others still run. */
async function deliverTo(
  ctx: MutationCtx,
  delivery: Delivery,
  channels: readonly NotificationChannel[],
  handlers: Partial<Record<NotificationChannel, ChannelHandler<MutationCtx>>>,
  gates: ReadonlyArray<ChannelGate<MutationCtx>>,
): Promise<boolean> {
  let delivered = false
  for (const channel of channels) {
    const handler = handlers[channel]
    if (!handler) continue
    try {
      if (await allowed(ctx, gates, delivery.userId, delivery.event.type, channel)) delivered = await handler.deliver(ctx, delivery) || delivered
    }
    catch (error) {
      logBackend('warn', 'notifications.deliver_failed', `A ${channel} notification for ${delivery.event.type} ${delivery.event.id} was not delivered; the event is recorded.`, error)
    }
  }
  return delivered
}

// ── Reading the inbox ─────────────────────────────────────────────────────

/** Someone a notification names. `you`: the reader. `user`: another account, by its name. `administrator`: an administrator, unnamed. `app`: nobody signed in. `erased`: an account since erased. */
const vParty = v.object({ kind: vPartyKind, name: v.union(v.string(), v.null()) })

/** One notification as the inbox reads it. */
export const vNotification = v.object({
  id: v.string(),
  type: v.string(),
  at: v.number(),
  readAt: v.union(v.number(), v.null()),
  channels: v.array(v.string()),
  actor: vParty,
  workspace: v.union(v.object({ id: v.string(), name: v.union(v.string(), v.null()) }), v.null()),
  targetId: v.union(v.string(), v.null()),
  link: v.union(v.string(), v.null()),
  data: vEventData,
})

/** One row, its ids put into words its reader may see. */
async function itemOf(row: Doc<'notifications'>, names: ReturnType<typeof nameReader>) {
  // An administrator who acted on the account, or as any account, is unnamed, and no id of another account leaves.
  const { kind, name } = row.impersonated
    ? { kind: 'administrator' as const, name: null }
    : await partyOf(names, row.actorId, row.userId, row.actorId !== undefined && administratorActs({ type: row.type, actorId: row.actorId, subjectId: row.userId }))
  return {
    id: row._id as string,
    type: row.type,
    at: row.at,
    readAt: row.readAt ?? null,
    channels: row.channels,
    actor: { kind, name },
    workspace: row.entityId === undefined ? null : { id: row.entityId, name: await names.workspace(row.entityId) },
    targetId: row.targetId ?? null,
    link: row.link ?? null,
    data: row.data ?? {},
  }
}

/**
 * A page of one person's notifications, newest first. The page size is
 * capped; the cursor is Convex's own, so a page holds still while newer
 * notifications arrive above it.
 */
export const list = query({
  args: { userId: v.string(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(vNotification),
  handler: async (ctx, { userId, paginationOpts }) => {
    const result = await ctx.db.query('notifications').withIndex('userId_at', q => q.eq('userId', userId)).order('desc')
      .paginate({ ...paginationOpts, numItems: Math.max(1, Math.min(Math.floor(paginationOpts.numItems), NOTIFICATION_PAGE_MAX)) })
    const names = nameReader(ctx)
    return { ...result, page: await Promise.all(result.page.map(row => itemOf(row, names))) }
  },
})

/** The unread rows of one person, counted up to one past what the inbox shows exactly. */
async function unreadRows(ctx: QueryCtx | MutationCtx, userId: string, limit: number): Promise<Doc<'notifications'>[]> {
  return ctx.db.query('notifications').withIndex('userId_readAt', q => q.eq('userId', userId).eq('readAt', undefined)).take(limit)
}

/** How many notifications a person has not read: exact up to {@link UNREAD_COUNT_MAX}, then `more`. */
export const unread = query({
  args: { userId: v.string() },
  returns: v.object({ count: v.number(), more: v.boolean() }),
  handler: async (ctx, { userId }) => {
    const rows = await unreadRows(ctx, userId, UNREAD_COUNT_MAX + 1)
    return { count: Math.min(rows.length, UNREAD_COUNT_MAX), more: rows.length > UNREAD_COUNT_MAX }
  },
})

// ── Marking read ──────────────────────────────────────────────────────────

/** The most ids one call marks, and the most rows one mark-all pass reads. */
export const MARK_BATCH = 200

/**
 * Mark the notifications named read, the person's own only: an id that is
 * another's, unknown or already read changes nothing. Returns how many
 * changed.
 */
export const markRead = mutation({
  args: { userId: v.string(), ids: v.array(v.string()) },
  returns: v.number(),
  handler: async (ctx, { userId, ids }) => {
    const readAt = Date.now()
    let marked = 0
    for (const raw of ids.slice(0, MARK_BATCH)) {
      const id = ctx.db.normalizeId('notifications', raw)
      const row = id ? await ctx.db.get('notifications', id) : null
      if (!row || row.userId !== userId || row.readAt !== undefined) continue
      await ctx.db.patch('notifications', row._id, { readAt })
      marked++
    }
    return marked
  },
})

/** Mark a batch of a person's unread notifications read: how many, and whether none are left. */
export const markAllRead = mutation({
  args: { userId: v.string() },
  returns: v.object({ marked: v.number(), done: v.boolean() }),
  handler: async (ctx, { userId }) => {
    const rows = await unreadRows(ctx, userId, MARK_BATCH + 1)
    const readAt = Date.now()
    for (const row of rows.slice(0, MARK_BATCH)) await ctx.db.patch('notifications', row._id, { readAt })
    return { marked: Math.min(rows.length, MARK_BATCH), done: rows.length <= MARK_BATCH }
  },
})

// ── Forgetting ────────────────────────────────────────────────────────────

/** The most notifications one `forget` call deletes. */
export const FORGET_BATCH = 200

/**
 * Delete a batch of the notifications of one kind about one target, every
 * recipient's, read or not: the app deleted the thing they point at. The
 * events they restate stay on the audit trail. Returns how many went, and
 * whether none are left.
 */
export const forget = mutation({
  args: { type: v.string(), targetId: v.string() },
  returns: v.object({ deleted: v.number(), done: v.boolean() }),
  handler: async (ctx, { type, targetId }) => {
    const rows = await ctx.db.query('notifications').withIndex('targetId_type', q => q.eq('targetId', targetId).eq('type', type)).take(FORGET_BATCH + 1)
    for (const row of rows.slice(0, FORGET_BATCH)) await ctx.db.delete('notifications', row._id)
    return { deleted: Math.min(rows.length, FORGET_BATCH), done: rows.length <= FORGET_BATCH }
  },
})

// ── Channel choices ───────────────────────────────────────────────────────

const vChannel = v.union(v.literal('app'), v.literal('email'), v.literal('push'))

/** The most choices one person keeps: a kind and a channel each. */
const CHOICES_MAX = 500

/** The channels a person turned on or off, kind by kind: only those that differ from the default. */
export const listChoices = query({
  args: { userId: v.string() },
  returns: v.array(v.object({ type: v.string(), channel: vChannel, enabled: v.boolean() })),
  handler: async (ctx, { userId }) => (await ctx.db.query('notificationChoices').withIndex('userId_type_channel', q => q.eq('userId', userId)).take(CHOICES_MAX))
    .map(({ type, channel, enabled }) => ({ type, channel, enabled })),
})

/**
 * Turn one channel of one kind on or off for a person. The caller, the
 * app's `setNotificationChannel`, checks the kind allows the channel.
 */
export const choose = mutation({
  args: { userId: v.string(), type: v.string(), channel: vChannel, enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { userId, type, channel, enabled }) => {
    const row = await ctx.db.query('notificationChoices').withIndex('userId_type_channel', q => q.eq('userId', userId).eq('type', type).eq('channel', channel)).first()
    if (row) await ctx.db.patch('notificationChoices', row._id, { enabled, at: Date.now() })
    else await ctx.db.insert('notificationChoices', { userId, type, channel, enabled, at: Date.now() })
    return null
  },
})

/**
 * Whether every channel gate ({@link CHANNEL_GATES}) lets one kind through
 * one channel for a person: what an email the package sends itself (a new
 * device's) asks before it goes, so the person's choice holds there too.
 */
export const channelOpen = mutation({
  args: { userId: v.string(), type: v.string(), channel: vChannel },
  returns: v.boolean(),
  handler: async (ctx, { userId, type, channel }) => await allowed(ctx, CHANNEL_GATES, userId, type, channel),
})

// ── What a delivery needs ─────────────────────────────────────────────────

/**
 * Who one notification by email or push goes to, read as it is sent: the
 * account's address and language now, the actor and the workspace by the
 * names they have now, and whether the person still wants this channel.
 * `null` for an account that is gone.
 */
export const recipient = query({
  args: { userId: v.string(), type: v.string(), channel: vChannel, actorId: v.optional(v.string()), impersonated: v.optional(v.boolean()), entityId: v.optional(v.string()) },
  returns: v.union(v.null(), v.object({
    email: v.union(v.string(), v.null()),
    locale: v.union(v.string(), v.null()),
    wanted: v.boolean(),
    actor: vParty,
    workspace: v.union(v.string(), v.null()),
  })),
  handler: async (ctx, { userId, type, channel, actorId, impersonated, entityId }) => {
    const id = ctx.db.normalizeId('user', userId)
    const user = id ? await ctx.db.get('user', id) : null
    if (!user) return null
    const names = nameReader(ctx)
    const { kind, name } = impersonated
      ? { kind: 'administrator' as const, name: null }
      : await partyOf(names, actorId, userId, actorId !== undefined && administratorActs({ type, actorId, subjectId: userId }))
    return {
      email: typeof user.email === 'string' && user.email ? user.email : null,
      locale: normalizeLocale((user as { locale?: unknown }).locale),
      wanted: await choiceOf(ctx, userId, type, channel) !== false,
      actor: { kind, name },
      workspace: entityId === undefined ? null : await names.workspace(entityId),
    }
  },
})

// ── Erasure and export ─────────────────────────────────────────

/**
 * An account's part of an erasure, one batch: the notifications for it are
 * deleted, and its id becomes the pseudonym in the ones it caused for
 * others. Returns whether rows may be left.
 */
export async function eraseNotifications(ctx: MutationCtx, { userId, alias }: { userId?: string, alias: string }, budget: number): Promise<boolean> {
  if (!userId) return false
  let left = budget
  for (const row of await ctx.db.query('notifications').withIndex('userId_at', q => q.eq('userId', userId)).take(left)) {
    await ctx.db.delete('notifications', row._id)
    left--
  }
  if (left <= 0) return true
  for (const row of await ctx.db.query('notificationChoices').withIndex('userId_type_channel', q => q.eq('userId', userId)).take(left)) {
    await ctx.db.delete('notificationChoices', row._id)
    left--
  }
  if (left <= 0) return true
  // A rewritten row leaves the index the next read starts from, so each batch reads from the start.
  for (const row of await ctx.db.query('notifications').withIndex('actorId', q => q.eq('actorId', userId)).take(left)) {
    await ctx.db.patch('notifications', row._id, { actorId: alias })
    left--
  }
  return left <= 0
}

/** The most notifications an export lists. */
export const EXPORT_NOTIFICATIONS_MAX = 1000

/** A person's notifications for their export: what happened, when, and whether they read it, and the channels they chose. */
export async function exportNotifications(ctx: QueryCtx, userId: string) {
  const rows = await ctx.db.query('notifications').withIndex('userId_at', q => q.eq('userId', userId)).order('desc').take(EXPORT_NOTIFICATIONS_MAX)
  const chosen = await ctx.db.query('notificationChoices').withIndex('userId_type_channel', q => q.eq('userId', userId)).take(CHOICES_MAX)
  return {
    notificationChoices: chosen.map(({ type, channel, enabled, at }) => ({ type, channel, enabled, at })),
    notifications: rows.map(row => ({
      type: row.type,
      at: row.at,
      readAt: row.readAt ?? null,
      channels: row.channels,
      ...(row.data ? { data: row.data } : {}),
    })),
  }
}
