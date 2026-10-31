import { createFunctionHandle, type FunctionReference, type GenericActionCtx, type GenericDataModel, type GenericMutationCtx, internalActionGeneric, makeFunctionReference, mutationGeneric, paginationOptsValidator, queryGeneric, type RegisteredAction, type RegisteredMutation, type RegisteredQuery } from 'convex/server'
import { v } from 'convex/values'
import { readEnv } from '../delivery.js'
import type { EmailMessage, EmailRenderContext } from '../email-templates.js'
import { backendError } from '../errors.js'
import { logBackend } from '../log.js'
import {
  declaredChannels,
  NOTIFICATION_DELIVERY_FUNCTION,
  NOTIFICATION_KINDS,
  type NotificationChannel,
  choosableChannels,
  notificationLabelKey,
  type NotificationPlan,
  type NotifyEvent,
  type NotifyOptions,
  notifyProblem,
  planNotification,
  vScheduledDelivery,
} from '../notifications.js'
import { type BackendPaths, resolveBackendPaths } from '../paths.js'
import { arePushKeys, isPushTarget, type PushKeys, sendPush } from '../web-push.js'
import { ownCaller } from './access.js'
import type { EmailPreferences } from './email-preferences.js'

// The in-app inbox, for the app: the reads and writes the inbox calls, and
// the `notify` option that turns events of the app's own into notifications.
// The package's own kinds need nothing from here: the backend component
// notifies in the transaction that records them.

export type {
  ChannelGate,
  ChannelHandler,
  Delivery,
  NotificationAudience,
  NotificationChannel,
  NotificationKind,
  NotificationDestination,
  NotificationPlan,
  NotifyEvent,
  NotifyKind,
  NotifyOptions,
} from '../notifications.js'

/** Someone a notification names. `administrator`: unnamed, to the account they acted on, and to everyone for what they did while acting as an account. `app`: nobody signed in. `erased`: an account since erased. */
export interface NotificationParty {
  kind: 'you' | 'user' | 'administrator' | 'app' | 'erased'
  name: string | null
}

/** One notification as the inbox reads it: ids and values, never the words (they are labels). */
export interface NotificationEntry {
  id: string
  /** The event's type: a kind of the package's catalog, or one of your own under `app.`. */
  type: string
  /** When it was recorded, epoch ms. */
  at: number
  /** When it was read; `null` while unread. */
  readAt: number | null
  /** The channels it went out on. */
  channels: string[]
  /** Who did it. */
  actor: NotificationParty
  /** The workspace it happened in, by its name now. */
  workspace: { id: string, name: string | null } | null
  /** The thing acted on. */
  targetId: string | null
  /** Where it links, for a kind of your own (`notify`'s `link`); `null` for a package kind, which links to a ready-made page by its type. */
  link: string | null
  /** The kind's own fields. */
  data: Record<string, string | number | boolean | string[]>
}

/** A page of notifications, newest first, as a paginated query answers. */
export interface NotificationsPage {
  page: NotificationEntry[]
  isDone: boolean
  continueCursor: string
  pageStatus?: 'SplitRecommended' | 'SplitRequired' | null
  splitCursor?: string | null
}

/** The unread count: exact up to 99, then `more`. */
export interface UnreadCount {
  count: number
  more: boolean
}

/** What marking read answers: how many changed, and whether more unread ones remain (mark all works in batches). */
export interface MarkedRead {
  marked: number
  done: boolean
}

type PaginationArgs = typeof paginationOptsValidator.type

/** One kind of notification on the profile: each channel it allows, on or off for the person. */
export interface NotificationKindChoice {
  /** The kind: an event type of the package's catalog, or one of your own under `app.`. */
  type: string
  /** The channels the kind allows, in order, each with the person's choice (on until they turn it off). */
  channels: Array<{ channel: NotificationChannel, enabled: boolean }>
}

/** What `usePushSubscription` needs from the deployment: the public key a device subscribes with, `null` while push is off. */
export interface PushConfig {
  publicKey: string | null
}

/** One notification's email or push, as the component hands it to `deliverNotification`. */
export type ScheduledDelivery = typeof vScheduledDelivery.type

/** The reads and writes `backend/notifications.ts` re-exports, behind `useNotifications` and `<NotificationInbox>`. */
export interface NotificationsApi {
  /** The caller's notifications, newest first, a page at a time: a paginated query. Refused for a caller who has none to read: signed out (`unauthenticated`), or an administrator acting as the account (`forbidden`). */
  listNotifications: RegisteredQuery<'public', { paginationOpts: PaginationArgs }, Promise<NotificationsPage>>
  /** How many the caller has not read. */
  getUnreadCount: RegisteredQuery<'public', Record<string, never>, Promise<UnreadCount>>
  /** Mark the caller's notifications read: the `ids` named, or `all`. Another account's id changes nothing. */
  markNotificationsRead: RegisteredMutation<'public', { ids?: string[], all?: boolean }, Promise<MarkedRead>>
  /** The caller's channels, kind by kind: every kind that notifies them, and each channel it allows, on or off. `null` signed out. */
  getNotificationChannels: RegisteredQuery<'public', Record<string, never>, Promise<NotificationKindChoice[] | null>>
  /** Turn one channel of one kind on or off for the caller. Refused for a channel the kind does not allow (`invalid_input`). */
  setNotificationChannel: RegisteredMutation<'public', { type: string, channel: NotificationChannel, enabled: boolean }, Promise<null>>
  /** The public key a device subscribes to web push with: `publicKey` is `null` until `PUSH_PUBLIC_KEY` and `PUSH_PRIVATE_KEY` are set. */
  getPushConfig: RegisteredQuery<'public', Record<string, never>, Promise<PushConfig>>
  /** Keep this device for the caller's push notifications: the browser's subscription, as `PushSubscription.toJSON()` gives its endpoint and keys. */
  subscribePush: RegisteredMutation<'public', { endpoint: string, p256dh: string, auth: string }, Promise<null>>
  /** Stop push notifications on this device, by its endpoint. */
  unsubscribePush: RegisteredMutation<'public', { endpoint: string }, Promise<null>>
  /**
   * Internal: words, renders and sends one notification by email or push,
   * scheduled by the transaction that recorded its event. Re-export it under
   * this name: the backend schedules it by name.
   */
  deliverNotification: RegisteredAction<'internal', ScheduledDelivery, Promise<null>>
}

/** What the inbox needs of the app's `setupAudit`: the plan for an event of the app's own. */
export interface Notifications {
  /**
   * What an event of your own becomes, by `notify`: the channels it may use
   * and where it links. `setupAudit({ notifications })` asks it as each event
   * is recorded; `null` for an event `notify` does not name.
   */
  plan: (event: NotifyEvent) => NotificationPlan | null
  /**
   * The handle the component schedules a notification's email and push
   * through (`deliverNotification`); `undefined` without an `email`
   * instance, when only the inbox delivers. `setupAudit` passes it on.
   */
  deliver: () => Promise<string | undefined>
  /**
   * Delete the notifications of one kind of your own about one target,
   * every recipient's, read or not, in your mutation's transaction: call it
   * where you delete the thing they point at, so no inbox keeps a link to a
   * page that is gone. `kind` is a type `notify` names, `target` the
   * `targetId` the events were recorded with. The events stay on the audit
   * trail. One call deletes up to 200: `done` is `false` while more are
   * left, so call again, or from a scheduled function, until it is `true`.
   */
  forget: (ctx: NotificationsWriteCtx, notifications: { kind: string, target: string }) => Promise<ForgottenNotifications>
  /** The public reads and writes `backend/notifications.ts` re-exports. */
  api: NotificationsApi
}

/** Where `forget` runs: a mutation or an action of yours. */
export type NotificationsWriteCtx = Pick<GenericMutationCtx<GenericDataModel>, 'runMutation'>

/** What `forget` answers: how many notifications went, and whether none of that kind about that target are left. */
export interface ForgottenNotifications {
  deleted: number
  done: boolean
}

/** What the notifications need of `setupEmail`'s instance: the layout and words, and the sending rules. */
export interface NotificationsEmail {
  compose: <Message extends EmailMessage | null>(build: (context: EmailRenderContext) => Message | Promise<Message>, options?: { locale?: string | null }) => Promise<Message>
  /**
   * The sending rules the email instance holds: the weekly cap and the quiet hours.
   *
   * @internal
   */
  preferences: Pick<EmailPreferences, 'prepare' | 'caps'>
}

export interface SetupNotificationsOptions {
  /**
   * What each event of your own (a type under `app.`) becomes: the channels
   * it may use and where it links. A type without an entry stays a row on
   * the activity trail.
   *
   * @guarantee
   * - Runs: `link`, in the mutation or action that records the event (`audit.recordBackendEvent`), before its row is written
   * - Delivery: once per event recorded; a notification is delivered in the transaction that records the event, and rolls back with it
   * - Order: before the event is written, and before `onEvent` is scheduled
   * - When it throws: the throw is logged as `notifications.deliver_failed` and the notification goes out without a link; the event is recorded either way
   * - Idempotency: a read only: it can run again for a retried mutation
   */
  notify?: NotifyOptions
  /**
   * The email instance (`setupEmail`), which email and push notifications
   * are worded and rendered with: your messages, your brand and layout,
   * and the weekly cap and quiet hours. Without it, notifications reach the
   * inbox alone. Re-export `deliverNotification` with it.
   */
  email?: NotificationsEmail
  /** The paths the Nuxt module writes to `paths.generated.ts`: a package kind's email links to its ready-made page there. */
  paths?: Partial<BackendPaths>
}

/** The `backend` component as the inbox reads it. */
export interface NotificationsComponents {
  backend: unknown
}

interface NotificationsRefs {
  notifications: {
    list: FunctionReference<'query', 'internal', { userId: string, paginationOpts: PaginationArgs }, NotificationsPage>
    unread: FunctionReference<'query', 'internal', { userId: string }, UnreadCount>
    markRead: FunctionReference<'mutation', 'internal', { userId: string, ids: string[] }, number>
    markAllRead: FunctionReference<'mutation', 'internal', { userId: string }, MarkedRead>
    forget: FunctionReference<'mutation', 'internal', { type: string, targetId: string }, ForgottenNotifications>
    listChoices: FunctionReference<'query', 'internal', { userId: string }, Array<{ type: string, channel: NotificationChannel, enabled: boolean }>>
    choose: FunctionReference<'mutation', 'internal', { userId: string, type: string, channel: NotificationChannel, enabled: boolean }, null>
    recipient: FunctionReference<'query', 'internal', { userId: string, type: string, channel: NotificationChannel, actorId?: string, impersonated?: boolean, entityId?: string }, Recipient | null>
  }
  push: {
    subscribe: FunctionReference<'mutation', 'internal', { userId: string, endpoint: string, p256dh: string, auth: string }, null>
    unsubscribe: FunctionReference<'mutation', 'internal', { userId: string, endpoint: string }, boolean>
    devices: FunctionReference<'query', 'internal', { userId: string }, Array<{ id: string, endpoint: string, p256dh: string, auth: string }>>
    drop: FunctionReference<'mutation', 'internal', { id: string }, null>
  }
  preferences: {
    quietUntil: FunctionReference<'query', 'internal', { userId: string, quietHours: { start: number, end: number } | null }, number | null>
  }
  email: {
    send: FunctionReference<'mutation', 'internal', Record<string, unknown>, string | null>
  }
}

/** What a delivery runs with: an action's reads, writes and scheduler. */
type DeliveryCtx = Pick<GenericActionCtx<GenericDataModel>, 'runQuery' | 'runMutation' | 'scheduler'>

/** Who a delivery is for, as the component reads them when it is sent. */
interface Recipient {
  email: string | null
  locale: string | null
  wanted: boolean
  actor: NotificationParty
  workspace: string | null
}

/** The VAPID pair on the deployment, or `null` while push is off. */
function pushKeys(): PushKeys | null {
  const keys = { publicKey: readEnv('PUSH_PUBLIC_KEY')?.trim(), privateKey: readEnv('PUSH_PRIVATE_KEY')?.trim() }
  return arePushKeys(keys) ? keys : null
}

/** How many devices one push goes to at a time. */
const PUSH_CONCURRENCY = 4

/** How many times one device is tried while its push service is busy. */
const PUSH_ATTEMPTS = 5

/** The longest wait between two tries of a busy push service. */
const PUSH_RETRY_MAX_MS = 60 * 60 * 1000

/** The words of a party, when the event names none by name. */
const ACTOR_WORDS = { you: 'actorSomeone', user: 'actorSomeone', administrator: 'actorAdministrator', app: 'actorApp', erased: 'actorErased' } as const

/** A notification's words in a reader's language: its title and body, the kind's own or the fallback. */
function notificationWords(t: EmailRenderContext['t'], type: string, recipient: Recipient, data: Record<string, string | number | boolean | string[]>): { title: string, body: string | null } {
  const params: Record<string, string | number> = {}
  for (const [name, value] of Object.entries(data)) params[name] = Array.isArray(value) ? value.join(', ') : typeof value === 'boolean' ? String(value) : value
  params.actor = recipient.actor.name ?? t(`notifications.${ACTOR_WORDS[recipient.actor.kind]}`)
  params.workspace = recipient.workspace ?? t('notifications.workspaceUnnamed')
  // A package kind's words sit under `backend.notifications` (packaged); an app's own kind's under the same key of its messages.
  const key = type.startsWith('app.') ? `backend.notifications.${notificationLabelKey(type)}` : `notifications.${notificationLabelKey(type)}`
  const read = (part: string) => {
    const text = t(`${key}.${part}`, params)
    return text === `${key}.${part}` ? null : text
  }
  return { title: read('title') ?? t('notifications.fallbackTitle'), body: read('body') }
}

/** The most ids one call marks. */
const IDS_MAX = 200

/**
 * The in-app inbox: what the backend recorded about a person, live, with
 * the unread count and marking read, and the `notify` option that turns
 * your own events into notifications.
 *
 * Every event of the package that concerns a person (a role, a passkey, an
 * invitation, a payment, a gift, a bounce) reaches the inbox with nothing
 * set up. Your own kinds join through `notify`, and pass the instance to
 * `setupAudit({ notifications })` so the events you record reach it.
 *
 * @example
 * ```ts [backend/notifications.ts]
 * import { setupNotifications } from 'nuxt-backend/notifications'
 * import { components } from './_generated/api'
 *
 * export const notifications = setupNotifications(components, {
 *   notify: { 'app.strip_ready': { channels: ['app'], link: event => `/strips/${event.targetId}` } },
 * })
 *
 * export const { listNotifications, getUnreadCount, markNotificationsRead } = notifications.api
 * ```
 */
export function setupNotifications(components: NotificationsComponents, options: SetupNotificationsOptions = {}): Notifications {
  const refs = components.backend as NotificationsRefs
  const notify = options.notify ?? {}
  const problem = notifyProblem(notify)
  if (problem) throw new TypeError(`[nuxt-backend] setupNotifications({ notify }): ${problem}`)

  const listNotifications = queryGeneric({
    args: { paginationOpts: paginationOptsValidator },
    handler: async (ctx, { paginationOpts }): Promise<NotificationsPage> => {
      return ctx.runQuery(refs.notifications.list, { userId: await ownCaller(ctx, 'listNotifications'), paginationOpts })
    },
  })

  const getUnreadCount = queryGeneric({
    args: {},
    handler: async (ctx): Promise<UnreadCount> => {
      return ctx.runQuery(refs.notifications.unread, { userId: await ownCaller(ctx, 'getUnreadCount') })
    },
  })

  const markNotificationsRead = mutationGeneric({
    args: { ids: v.optional(v.array(v.string())), all: v.optional(v.boolean()) },
    handler: async (ctx, { ids, all }): Promise<MarkedRead> => {
      const userId = await ownCaller(ctx, 'markNotificationsRead')
      if (all) return ctx.runMutation(refs.notifications.markAllRead, { userId })
      if (!ids || ids.length === 0 || ids.length > IDS_MAX) {
        throw backendError('invalid_input', { field: 'ids', reason: `1 to ${IDS_MAX} ids, or all` }, `[nuxt-backend] markNotificationsRead: name 1 to ${IDS_MAX} ids, or pass all.`)
      }
      const marked = await ctx.runMutation(refs.notifications.markRead, { userId, ids })
      return { marked, done: true }
    },
  })

  // ── Channels, kind by kind ───────────────────────────────────────────

  /** The channels each kind may use, by the channel matrix, and the email the package sends itself for a new device: the package's kinds that notify, then the app's own. */
  const allowed = new Map<string, NotificationChannel[]>([
    ...Object.keys(NOTIFICATION_KINDS).map(type => [type, choosableChannels(type, declaredChannels(type))] as const),
    ...Object.entries(notify).map(([type, kind]) => [type, choosableChannels(type, kind.channels)] as const),
  ].filter(([, channels]) => channels.length > 0))

  const getNotificationChannels = queryGeneric({
    args: {},
    handler: async (ctx): Promise<NotificationKindChoice[] | null> => {
      const identity = await ctx.auth.getUserIdentity()
      if (!identity) return null
      const userId = await ownCaller(ctx, 'getNotificationChannels')
      const chosen = new Map((await ctx.runQuery(refs.notifications.listChoices, { userId })).map(row => [`${row.type} ${row.channel}`, row.enabled]))
      return [...allowed].map(([type, channels]) => ({ type, channels: channels.map(channel => ({ channel, enabled: chosen.get(`${type} ${channel}`) ?? true })) }))
    },
  })

  const setNotificationChannel = mutationGeneric({
    args: { type: v.string(), channel: v.union(v.literal('app'), v.literal('email'), v.literal('push')), enabled: v.boolean() },
    handler: async (ctx, { type, channel, enabled }): Promise<null> => {
      const userId = await ownCaller(ctx, 'setNotificationChannel')
      if (!allowed.get(type)?.includes(channel)) {
        throw backendError('invalid_input', { field: 'channel' }, `[nuxt-backend] setNotificationChannel: ${type} does not notify by ${channel}.`)
      }
      await ctx.runMutation(refs.notifications.choose, { userId, type, channel, enabled })
      return null
    },
  })

  // ── Web push devices ─────────────────────────────────────────────────

  const getPushConfig = queryGeneric({
    args: {},
    handler: async (): Promise<PushConfig> => ({ publicKey: pushKeys()?.publicKey ?? null }),
  })

  const subscribePush = mutationGeneric({
    args: { endpoint: v.string(), p256dh: v.string(), auth: v.string() },
    handler: async (ctx, target): Promise<null> => {
      const userId = await ownCaller(ctx, 'subscribePush')
      if (!pushKeys()) throw backendError('unavailable', { service: 'push', reason: 'not_configured' }, '[nuxt-backend] subscribePush: web push is off on this deployment: set PUSH_PUBLIC_KEY and PUSH_PRIVATE_KEY (npx nuxt-backend env push generates them).')
      if (!isPushTarget(target)) throw backendError('invalid_input', { field: 'endpoint' }, '[nuxt-backend] subscribePush: pass the browser\'s push subscription: an https endpoint and its p256dh and auth keys.')
      await ctx.runMutation(refs.push.subscribe, { userId, ...target })
      return null
    },
  })

  const unsubscribePush = mutationGeneric({
    args: { endpoint: v.string() },
    handler: async (ctx, { endpoint }): Promise<null> => {
      const userId = await ownCaller(ctx, 'unsubscribePush')
      await ctx.runMutation(refs.push.unsubscribe, { userId, endpoint: endpoint.slice(0, 1024) })
      return null
    },
  })

  // ── Delivery by email and push ───────────────────────────────────────

  const email = options.email
  const pages = resolveBackendPaths(options.paths, 'setupNotifications')
  const self = makeFunctionReference<'action', ScheduledDelivery>(NOTIFICATION_DELIVERY_FUNCTION)

  /** Where a notification opens, as an absolute URL of the app. */
  const target = (type: string, link: string | null): string => {
    const site = (readEnv('SITE_URL') ?? '').replace(/\/$/, '')
    if (link) return `${site}${link}`
    const kind = Object.hasOwn(NOTIFICATION_KINDS, type) ? NOTIFICATION_KINDS[type as keyof typeof NOTIFICATION_KINDS] : undefined
    const page = kind?.page === 'security' ? pages.security : kind?.page === 'settings' ? pages.settings : '/profile'
    return `${site}${page}`
  }

  /** The words and the link of one notification for its reader; `null` without an email instance to word it with. */
  const worded = async (delivery: ScheduledDelivery, recipient: Recipient) => {
    if (!email) return null
    let words: { title: string, body: string | null, url: string, locale: string } | null = null
    await email.compose((context) => {
      words = { ...notificationWords(context.t, delivery.event.type, recipient, delivery.event.data ?? {}), url: context.link(target(delivery.event.type, delivery.link)), locale: context.locale }
      return null
    }, { locale: recipient.locale })
    return words as { title: string, body: string | null, url: string, locale: string } | null
  }

  const deliverEmail = async (ctx: DeliveryCtx, delivery: ScheduledDelivery, recipient: Recipient) => {
    if (!email || !recipient.email) return
    const message = await email.compose(({ t }) => {
      const words = notificationWords(t, delivery.event.type, recipient, delivery.event.data ?? {})
      return {
        to: recipient.email!,
        subject: words.title,
        blocks: [
          { heading: words.title },
          ...(words.body ? [{ paragraph: words.body }] : []),
          { button: { label: t('notifications.emailOpen'), url: target(delivery.event.type, delivery.link) } },
          { note: t('notifications.emailNote') },
        ],
      }
    }, { locale: recipient.locale })
    // The weekly cap and the quiet hours, as for every non-transactional email; never the sunset rule.
    const prepared = await email.preferences.prepare(ctx, message, undefined, async () => ({ unsubscribe: '' }), { sunset: false })
    if (prepared) await ctx.runMutation(refs.email.send, prepared)
  }

  const deliverPush = async (ctx: DeliveryCtx, delivery: ScheduledDelivery, recipient: Recipient) => {
    const keys = pushKeys()
    if (!keys) return
    // The quiet hours hold a push to their end, on the person's own clock.
    if (delivery.attempt === undefined) {
      const until = await ctx.runQuery(refs.preferences.quietUntil, { userId: delivery.userId, quietHours: email?.preferences.caps.quietHours ?? null })
      if (until !== null && until > Date.now()) {
        await ctx.scheduler.runAt(until, self, { ...delivery, attempt: 1 })
        return
      }
    }
    const words = await worded(delivery, recipient)
    if (!words) return
    const subject = readEnv('SITE_URL') ?? 'https://localhost'
    const devices = (await ctx.runQuery(refs.push.devices, { userId: delivery.userId })).filter(device => delivery.deviceId === undefined || device.id === delivery.deviceId)
    const attempt = delivery.attempt ?? 1
    for (let start = 0; start < devices.length; start += PUSH_CONCURRENCY) {
      await Promise.all(devices.slice(start, start + PUSH_CONCURRENCY).map(async (device) => {
        const outcome = await sendPush(device, { title: words.title, ...(words.body ? { body: words.body } : {}), navigate: words.url, lang: words.locale }, keys, subject, { fallbackRetryMs: Math.min(60_000 * 2 ** (attempt - 1), PUSH_RETRY_MAX_MS) })
        switch (outcome.kind) {
          case 'gone':
            await ctx.runMutation(refs.push.drop, { id: device.id })
            logBackend('info', 'notifications.push_device_gone', `A device's push service said it is gone: it was dropped (${delivery.event.type} ${delivery.event.id}).`)
            break
          case 'too-large':
            logBackend('warn', 'notifications.push_too_large', `A ${delivery.event.type} push was too large for its push service and was dropped (${delivery.event.id}).`)
            break
          case 'retry':
            if (attempt < PUSH_ATTEMPTS) await ctx.scheduler.runAfter(Math.min(outcome.retryAfterMs, PUSH_RETRY_MAX_MS), self, { ...delivery, attempt: attempt + 1, deviceId: device.id })
            else logBackend('warn', 'notifications.push_failed', `A ${delivery.event.type} push was not delivered: its push service stayed busy (${delivery.event.id}).`)
            break
          case 'refused':
            logBackend('error', 'notifications.push_refused', `A push service refused a ${delivery.event.type} push with ${outcome.status} (${delivery.event.id}): PUSH_PUBLIC_KEY and PUSH_PRIVATE_KEY may not be one pair, or not the pair the device subscribed with.`)
            break
          default:
            break
        }
      }))
    }
  }

  const deliverNotification = internalActionGeneric({
    args: vScheduledDelivery.fields,
    handler: async (ctx, delivery): Promise<null> => {
      const { event } = delivery
      const recipient = await ctx.runQuery(refs.notifications.recipient, {
        userId: delivery.userId,
        type: event.type,
        channel: delivery.channel,
        ...(event.actorId ? { actorId: event.actorId } : {}),
        ...(event.impersonated ? { impersonated: true } : {}),
        ...(event.entityId ? { entityId: event.entityId } : {}),
      })
      // An account erased meanwhile, or a channel turned off since, gets nothing.
      if (!recipient || !recipient.wanted) return null
      try {
        if (delivery.channel === 'email') await deliverEmail(ctx, delivery, recipient)
        else await deliverPush(ctx, delivery, recipient)
      }
      catch (error) {
        logBackend('warn', 'notifications.deliver_failed', `A ${delivery.channel} notification for ${event.type} ${event.id} was not delivered; the event is recorded.`, error)
      }
      return null
    },
  })

  // A handle names the function, so one per isolate does.
  let handle: Promise<string> | undefined
  const deliver = async (): Promise<string | undefined> => {
    if (!email) return undefined
    try {
      return await (handle ??= createFunctionHandle(self))
    }
    catch (error) {
      handle = undefined
      logBackend('warn', 'notifications.deliver_failed', `No handle for deliverNotification: re-export it from backend/notifications.ts. Notifications reach the inbox alone.`, error)
      return undefined
    }
  }

  const forget: Notifications['forget'] = async (ctx, { kind, target }) => {
    if (!Object.hasOwn(notify, kind)) throw new TypeError(`[nuxt-backend] notifications.forget: ${JSON.stringify(kind)} is no kind setupNotifications({ notify }) names.`)
    if (typeof target !== 'string' || target === '') throw new TypeError('[nuxt-backend] notifications.forget: `target` is the targetId the events were recorded with.')
    return ctx.runMutation(refs.notifications.forget, { type: kind, targetId: target })
  }

  return {
    plan: event => planNotification(notify, event),
    deliver,
    forget,
    api: { listNotifications, getUnreadCount, markNotificationsRead, getNotificationChannels, setNotificationChannel, getPushConfig, subscribePush, unsubscribePush, deliverNotification } as NotificationsApi,
  }
}
