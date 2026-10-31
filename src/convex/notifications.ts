// What becomes a notification: the policy of every kind of the event
// catalog, the channel matrix, the contract a delivery channel keeps, and
// the checks on an app's own `notify` option. Runtime-neutral (no Vue, no
// Convex runtime), so the component that delivers, the app that declares
// its own kinds, the inbox that words them and the docs that list them read
// one table. test/unit/notifications-catalog.test.ts holds every kind of
// the catalog that may notify in the app to a row here, and every billing
// kind to the app alone.

import { v } from 'convex/values'
import { logBackend } from './log.js'
import { BACKEND_EVENTS, type BackendEventType, type EventChannel, IN_APP_ONLY_AREAS, isBackendEventType } from './events.js'

/**
 * The channels a notification may take. `app` is the inbox; `email` and
 * `push` arrive with the preferences, behind {@link ChannelGate} and
 * {@link ChannelHandler}.
 */
export type NotificationChannel = 'app' | 'email' | 'push'

/** Every channel, in the order a notification goes out on them. */
export const NOTIFICATION_CHANNELS = ['app', 'email', 'push'] as const satisfies readonly NotificationChannel[]

/**
 * Who a kind notifies:
 * - `subject`: the account the event is about;
 * - `inviter`: whoever sent the invitation the event's `targetId` names, while
 *   they are still a member, else the owners and admins of the workspace it joined;
 * - `entity`: the owners and admins of the workspace the event names
 *   (`entityId`), else the account it is about. A billing entity is a
 *   workspace, or an account billed on its own.
 */
export type NotificationAudience = 'subject' | 'inviter' | 'entity'

/** The ready-made page a notification links to, resolved by `pages.<key>` in the app's config. */
export type NotificationDestination = 'profile' | 'security' | 'settings'

/** What one kind of the package's catalog does as a notification. */
export interface NotificationKind {
  audience: NotificationAudience
  /** Where it links: the page the person manages what the event is about on. */
  page: NotificationDestination
  /** Nobody hears of what they did themselves (a role they changed, a plan they switched). */
  skipSelf?: true
}

/** The kinds of the catalog that declare the `in-app` channel. */
type InAppKind = { [K in BackendEventType]: 'in-app' extends (typeof BACKEND_EVENTS)[K]['channels'][number] ? K : never }[BackendEventType]

const SUBJECT_SECURITY = { audience: 'subject', page: 'security' } as const
const BILLING_ENTITY = { audience: 'entity', page: 'settings' } as const

/**
 * The package's kinds that notify in the app, by event type. A kind of the
 * catalog that declares `in-app` has a row here, and a later unit that adds
 * one (a new-device alert, a payment past due, a plan pass ending) adds its
 * row with it: the catalog test fails until it does.
 */
export const NOTIFICATION_KINDS = {
  'auth.passkey_added': SUBJECT_SECURITY,
  'auth.passkey_removed': SUBJECT_SECURITY,
  'auth.passkey_only_changed': SUBJECT_SECURITY,
  'auth.email_changed': SUBJECT_SECURITY,
  'auth.new_device': SUBJECT_SECURITY,
  'workspace.invitation_accepted': { audience: 'inviter', page: 'settings', skipSelf: true },
  'workspace.member_removed': { audience: 'subject', page: 'settings', skipSelf: true },
  'workspace.member_role_changed': { audience: 'subject', page: 'settings', skipSelf: true },
  'admin.role_changed': { audience: 'subject', page: 'profile' },
  'billing.plan_changed': { ...BILLING_ENTITY, skipSelf: true },
  'billing.subscription_created': BILLING_ENTITY,
  'billing.subscription_canceled': BILLING_ENTITY,
  'billing.subscription_revoked': BILLING_ENTITY,
  'billing.subscription_past_due': BILLING_ENTITY,
  'billing.order_paid': BILLING_ENTITY,
  'billing.order_refunded': BILLING_ENTITY,
  'billing.credits_low': BILLING_ENTITY,
  'billing.credits_exhausted': BILLING_ENTITY,
  'billing.save_offer_accepted': { ...BILLING_ENTITY, skipSelf: true },
  'billing.contract_withdrawn': { ...BILLING_ENTITY, skipSelf: true },
  'billing.trial_pass_started': BILLING_ENTITY,
  'gift.purchased': BILLING_ENTITY,
  'gift.claimed': BILLING_ENTITY,
  'gift.pass_started': BILLING_ENTITY,
  'gift.pass_ending': BILLING_ENTITY,
  'gift.pass_ended': BILLING_ENTITY,
  'gift.refunded': BILLING_ENTITY,
  'referral.claimed': BILLING_ENTITY,
  'referral.rewarded': BILLING_ENTITY,
  'email.bounced': { audience: 'subject', page: 'profile' },
} as const satisfies Record<InAppKind, NotificationKind>

/** The most people one event notifies: a workspace's owners and admins, up to this many. */
export const NOTIFICATION_RECIPIENTS_MAX = 25

/** A read notification is deleted this long after it was read. */
export const NOTIFICATION_READ_RETENTION_MS = 90 * 24 * 60 * 60 * 1000

/** An unread notification is deleted this long after it was recorded. */
export const NOTIFICATION_UNREAD_RETENTION_MS = 365 * 24 * 60 * 60 * 1000

/** The most notifications a page holds. */
export const NOTIFICATION_PAGE_MAX = 50

/** The unread count the inbox shows exactly; above it, "99+". */
export const UNREAD_COUNT_MAX = 99

/**
 * The kinds whose email the package sends itself, from where the event
 * happens, with details a notice cannot carry (a new device's place and
 * time): the email channel leaves them out, so a person gets one email.
 */
export const OWN_EMAIL_KINDS: readonly string[] = ['auth.new_device']

/** The channels a package kind declares, by the names notifications use. */
const CHANNEL_OF: Record<EventChannel, NotificationChannel> = { 'in-app': 'app', 'email': 'email' }

/** The channels an event type declares: the catalog's for a package kind, none for any other. */
export function declaredChannels(type: string): NotificationChannel[] {
  return isBackendEventType(type) ? BACKEND_EVENTS[type].channels.map(channel => CHANNEL_OF[channel]) : []
}

/**
 * The channel matrix: what a kind may use, whatever it declares. The inbox
 * takes every kind that declares it; email and push only a kind no
 * provider already tells the person about, so a billing, gift, referral or
 * email-bounce kind stays in the app. A kind whose email the package sends
 * itself ({@link OWN_EMAIL_KINDS}) takes no second one here.
 */
export function notificationChannels(type: string, declared: readonly NotificationChannel[]): NotificationChannel[] {
  const area = type.slice(0, type.indexOf('.'))
  const inAppOnly = IN_APP_ONLY_AREAS.includes(area)
  return NOTIFICATION_CHANNELS.filter(channel => declared.includes(channel) && (channel === 'app' || (!inAppOnly && !(channel === 'email' && OWN_EMAIL_KINDS.includes(type)))))
}

/**
 * The channels a person may turn on or off for a kind: the ones it is
 * delivered on ({@link notificationChannels}), and the email the package
 * sends itself for a kind of {@link OWN_EMAIL_KINDS} that declares one, which
 * the sender asks the same choice of before it goes.
 */
export function choosableChannels(type: string, declared: readonly NotificationChannel[]): NotificationChannel[] {
  const delivered = notificationChannels(type, declared)
  const ownEmail = OWN_EMAIL_KINDS.includes(type) && declared.includes('email')
  return NOTIFICATION_CHANNELS.filter(channel => delivered.includes(channel) || (ownEmail && channel === 'email'))
}

/** An event as a `notify` entry's `link` reads it: the row as recorded, before it has an id. */
export interface NotifyEvent {
  /** The event's type, under `app.`. */
  readonly type: string
  /** Who acted; absent for the app itself. */
  readonly actorId?: string
  /** The administrator behind an impersonated session. */
  readonly impersonatorId?: string
  /** The account it is about, who is notified. */
  readonly subjectId?: string
  /** The workspace it happened in. */
  readonly entityId?: string
  /** The thing acted on. */
  readonly targetId?: string
  /** The event's own flat values. */
  readonly data?: Readonly<Record<string, string | number | boolean | string[]>>
}

/** What one event of an app's own becomes. */
export interface NotifyKind {
  /** The channels it may use: `app` the inbox, `email` and `push` where the kind allows them. Narrowed by the channel matrix and by each person's choices. */
  channels: readonly NotificationChannel[]
  /** Where the notification links, from the event; a path of the app. Left out, it links nowhere. */
  link?: (event: NotifyEvent) => string | null | undefined
}

/** The events of an app's own that notify: each type under `app.`, with what it becomes. */
export type NotifyOptions = Readonly<Record<`app.${string}`, NotifyKind>>

/** What the component is told to do with an event of an app's own. */
export interface NotificationPlan {
  channels: NotificationChannel[]
  link?: string
}

/** The longest link a notification keeps. */
export const NOTIFICATION_LINK_MAX = 512

/** A link the inbox may follow: a path of the app, never an address of another site. */
export function isAppPath(link: string): boolean {
  return link.length <= NOTIFICATION_LINK_MAX && link.startsWith('/') && !link.startsWith('//') && !link.includes('\\') && ![...link].some(character => character.charCodeAt(0) < 32)
}

/**
 * The label key of a kind's words: the type without its `app.` prefix, so
 * `app.strip_shared` reads `strip_shared` and a package kind its own type.
 */
export function notificationLabelKey(type: string): string {
  return type.startsWith('app.') ? type.slice('app.'.length) : type
}

/**
 * What is wrong with an app's `notify` option, or `null`: a type that is
 * not one of the app's own, a channel that does not exist, a kind with
 * none, or words that would sit where a package kind's do.
 */
export function notifyProblem(notify: NotifyOptions): string | null {
  const packageKeys = new Set(Object.keys(BACKEND_EVENTS).map(notificationLabelKey))
  for (const [type, kind] of Object.entries(notify)) {
    if (!/^app(?:\.[a-z][a-z0-9_]*)+$/.test(type)) return `${type}: a notify key is one of your own event types, under \`app.\` (\`app.strip_shared\`).`
    if (type.length > 128) return `${type}: at most 128 characters.`
    if (kind.channels.length === 0 || kind.channels.some(channel => !NOTIFICATION_CHANNELS.includes(channel))) {
      return `${type}: channels are ${NOTIFICATION_CHANNELS.map(channel => `\`${channel}\``).join(', ')}, and a kind uses at least one.`
    }
    if (packageKeys.has(notificationLabelKey(type))) return `${type}: its words (\`${notificationLabelKey(type)}\`) would replace a package kind's. Name it otherwise.`
  }
  return null
}

/**
 * What an event of an app's own becomes, or `null` for none: an entry of
 * `notify` for its type, an account it is about, and a channel the matrix
 * leaves. The link is read from the event here, once, where it happened.
 */
export function planNotification(notify: NotifyOptions, event: NotifyEvent): NotificationPlan | null {
  const kind = Object.hasOwn(notify, event.type) ? notify[event.type as `app.${string}`] : undefined
  if (!kind || !event.subjectId) return null
  const channels = notificationChannels(event.type, kind.channels)
  if (channels.length === 0) return null
  let link: string | null | undefined
  try {
    link = kind.link?.(event)
  }
  catch (error) {
    logBackend('warn', 'notifications.deliver_failed', `The link of a ${event.type} notification could not be made; it goes out without one.`, error)
  }
  return { channels, ...(link && isAppPath(link) ? { link } : {}) }
}

/** One notification's delivery: who it is for, the event behind it and where it links. */
export interface Delivery {
  userId: string
  event: NotifyEvent & { id: string, at: number }
  link: string | null
}

/**
 * The person's own choices and limits for one channel of one kind: `false`
 * skips it. Notifications ships the answer yes; the preferences replace it
 * with each person's channel choices, the weekly cap and the quiet hours.
 * The inbox never waits for a cap or quiet hours: only an explicit choice
 * turns it off.
 */
export type ChannelGate<Ctx> = (ctx: Ctx, userId: string, type: string, channel: NotificationChannel) => Promise<boolean>

/**
 * What a channel does to deliver one notification: the inbox writes its row
 * in the transaction that recorded the event, and email and push, once
 * they exist, enqueue their send there. It resolves `true` when the
 * notification was delivered (or enqueued), and never throws what would
 * roll the event back: the caller logs a failure and goes on.
 */
export interface ChannelHandler<Ctx> {
  deliver(ctx: Ctx, delivery: Delivery): Promise<boolean>
}

/** The flat values an event carries: strings, numbers, booleans and lists of strings. */
export const vEventData = v.record(v.string(), v.union(v.string(), v.number(), v.boolean(), v.array(v.string())))

/**
 * What the component hands the app's `deliverNotification` for one channel
 * of one notification: ids and the kind's few values, never an address or
 * words, which the app reads and writes as it sends. `attempt` and
 * `deviceId` are a push retried on one device.
 */
export const vScheduledDelivery = v.object({
  userId: v.string(),
  channel: v.union(v.literal('email'), v.literal('push')),
  event: v.object({
    id: v.string(),
    type: v.string(),
    at: v.number(),
    actorId: v.optional(v.string()),
    impersonated: v.optional(v.boolean()),
    entityId: v.optional(v.string()),
    targetId: v.optional(v.string()),
    data: v.optional(vEventData),
  }),
  link: v.union(v.string(), v.null()),
  attempt: v.optional(v.number()),
  deviceId: v.optional(v.string()),
})

/** The app function the component schedules a notification's email and push through: `deliverNotification` in `backend/notifications.ts`. */
export const NOTIFICATION_DELIVERY_FUNCTION = 'notifications:deliverNotification'
