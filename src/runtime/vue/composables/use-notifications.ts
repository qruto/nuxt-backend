import type { FunctionReference } from 'convex/server'
import { computed, inject, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import { useBetterAuth } from 'nuxt-convex-module/better-auth/client'
import { ConvexAuthStateKey, useMutation, usePaginatedQuery_experimental } from 'nuxt-convex-module/client'
import type { MarkedRead, NotificationEntry, NotificationParty, NotificationsPage, UnreadCount } from '../../../convex/integrations/notifications'
import { NOTIFICATION_KINDS, NOTIFICATION_PAGE_MAX, notificationLabelKey } from '../../../convex/notifications'
import { useActionState } from '../utils/action-state'
import { type BackendError, failureOf } from '../utils/backend-error'
import { absentQuery, useLiveQuery } from '../utils/live-query'
import { useBackendNamespace } from '../utils/namespace'
import { formatBillingAmount } from './billing-format'
import { useBackendPagePath } from './use-backend-page-path'
import { type LabelGroupOverrides, useLabels } from './use-labels'

export type { NotificationEntry, NotificationParty } from '../../../convex/integrations/notifications'

/** One notification, worded for the person reading it. */
export interface NotificationItem {
  id: string
  /** The event's type: a kind of the package's catalog, or one of your own under `app.`. */
  type: string
  /** Its headline, in the active language. */
  title: string
  /** The line under it, in the active language; `null` for a kind with none. */
  body: string | null
  /** Where it links: the path your `notify` made, or the ready-made page a package kind belongs to. `null` for none. */
  link: string | null
  /** When it was recorded, epoch ms. */
  at: number
  /** Whether it was read. */
  read: boolean
  /** The channels it went out on: `app`, and later `email` and `push`. */
  channels: string[]
  /** Who did it, as the words name them. */
  actor: NotificationParty
  /** The workspace it happened in, by its name now. */
  workspace: { id: string, name: string | null } | null
  /** The kind's own fields. */
  data: NotificationEntry['data']
}

/** The notification functions re-exported from your `backend/notifications.ts`. */
export interface NotificationsApiRefs {
  listNotifications?: FunctionReference<'query', 'public', { paginationOpts: { numItems: number, cursor: string | null } }, NotificationsPage>
  getUnreadCount?: FunctionReference<'query', 'public', Record<string, never>, UnreadCount>
  markNotificationsRead?: FunctionReference<'mutation', 'public', { ids?: string[], all?: boolean }, MarkedRead>
}

export interface UseNotificationsOptions {
  /** How many notifications each page holds (reactive), at most 50. Default 20. */
  limit?: MaybeRefOrGetter<number | undefined>
  /** Words for the notifications, over app config and the translations: `{ strip_shared: { title: '…' } }`. */
  labels?: MaybeRefOrGetter<LabelGroupOverrides<'notifications'> | undefined>
  /** Override the injected `api.notifications` namespace. */
  api?: NotificationsApiRefs
}

export interface UseNotificationsReturn {
  /** The notifications loaded so far, newest first, live: a new one appears at the top. `[]` when signed out, and while the first page is read. */
  items: ComputedRef<NotificationItem[]>
  /** How many are unread, exact up to 99 (see `hasMoreUnread`). `0` when signed out. */
  unreadCount: ComputedRef<number>
  /** Whether more than `unreadCount` are unread: the count stops at 99. */
  hasMoreUnread: ComputedRef<boolean>
  /** Whether an account is signed in: without one there is no inbox. */
  isSignedIn: ComputedRef<boolean>
  /**
   * Whether there is an inbox to read: an account signed in, in person.
   * `false` signed out, and while an administrator acts as the account,
   * whose inbox the deployment keeps from them: nothing is read then.
   */
  hasInbox: ComputedRef<boolean>
  /** `true` while the first page is read. */
  isLoading: ComputedRef<boolean>
  /** `true` while marking read runs. */
  isPending: ComputedRef<boolean>
  /** `true` while an older page is read. */
  isLoadingMore: ComputedRef<boolean>
  /** Whether older notifications are left to load. */
  canLoadMore: ComputedRef<boolean>
  /** Why the last marking failed, else why a read failed, else `null`. Reads never reject. */
  error: ComputedRef<BackendError | null>
  /** Mark the ones named read. Rejects on failure. */
  markRead: (ids: readonly string[]) => Promise<void>
  /** Mark every notification read, in as many calls as it takes. Rejects on failure, and when a call marks none while some are left. */
  markAllRead: () => Promise<void>
  /** Load the next, older page. */
  loadMore: () => void
}

/** The default page size. */
const DEFAULT_LIMIT = 20

/**
 * The signed-in account's in-app notifications, live: newest first, paged
 * with `loadMore`, with the unread count and the actions that mark them
 * read. The words are labels, so each item reads in the active language
 * (`backend.notifications.<kind>.title` and `.body`, the package's for its
 * own kinds and yours for the kinds of your own).
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { items, unreadCount, markRead, loadMore } = useNotifications()
 * </script>
 * <template>
 *   <p>{{ unreadCount }} unread</p>
 *   <NuxtLink v-for="item in items" :key="item.id" :to="item.link" @click="markRead([item.id])">{{ item.title }}</NuxtLink>
 *   <button @click="loadMore()">Older</button>
 * </template>
 * ```
 */
export function useNotifications(options: UseNotificationsOptions = {}): UseNotificationsReturn {
  const api = useBackendNamespace<NotificationsApiRefs>('notifications', 'useNotifications', options.api)
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth == null || !auth.isAuthenticated.value)
  const { session } = useBetterAuth()
  // An administrator acting as the account reads nothing of its inbox: the deployment would refuse every read.
  const visiting = computed(() => Boolean((session?.value?.data?.session as { impersonatedBy?: unknown } | undefined)?.impersonatedBy))
  const noInbox = computed(() => signedOut.value || visiting.value)
  const authLoading = computed(() => auth != null && auth.isLoading.value)
  const limit = computed(() => Math.max(1, Math.min(Math.floor(toValue(options.limit) ?? DEFAULT_LIMIT), NOTIFICATION_PAGE_MAX)))

  const list = api.listNotifications
  const page = list
    ? usePaginatedQuery_experimental(computed(() => ({ query: list, args: noInbox.value ? 'skip' as const : {}, initialNumItems: limit.value })))
    : null
  const count = api.getUnreadCount
    ? useLiveQuery(api.getUnreadCount, () => (noInbox.value ? 'skip' : {}))
    : absentQuery<UnreadCount>()
  const runMark = api.markNotificationsRead ? useMutation(api.markNotificationsRead) : null
  const { isPending, failure, run } = useActionState(() => noInbox.value)
  const labels = useLabels('notifications', options.labels)
  const pages = { profile: useBackendPagePath('profile'), security: useBackendPagePath('security'), settings: useBackendPagePath('settings') }

  const entries = computed<NotificationEntry[]>(() => (noInbox.value ? [] : page?.value.data ?? []))
  const items = computed(() => entries.value.map(entry => worded(entry)))

  /** A label of the group, or `null` when nobody wrote it (an app's kind without words). */
  const words = (key: string, params: Record<string, string | number>): string | null => {
    const text = labels.t(key as never, params)
    return text === `notifications.${key}` ? null : text
  }

  function paramsOf(entry: NotificationEntry): Record<string, string | number> {
    const { actor, workspace, data } = entry
    const filled: Record<string, string | number> = {}
    for (const [name, value] of Object.entries(data)) filled[name] = Array.isArray(value) ? value.join(', ') : typeof value === 'string' || typeof value === 'number' ? value : String(value)
    // An amount is kept in the currency's smallest unit; the words read it as the person's currency writes it.
    if (typeof data.amount === 'number' && typeof data.currency === 'string') filled.amount = formatBillingAmount(data.amount, data.currency, labels.locale.value)
    filled.actor = actor.name ?? labels.t(({ you: 'actorSomeone', user: 'actorSomeone', administrator: 'actorAdministrator', app: 'actorApp', erased: 'actorErased' } as const)[actor.kind])
    filled.workspace = workspace?.name ?? labels.t('workspaceUnnamed')
    return filled
  }

  function linkOf(entry: NotificationEntry): string | null {
    if (entry.link) return entry.link
    const kind = Object.hasOwn(NOTIFICATION_KINDS, entry.type) ? NOTIFICATION_KINDS[entry.type as keyof typeof NOTIFICATION_KINDS] : undefined
    return kind ? pages[kind.page].value : null
  }

  function worded(entry: NotificationEntry): NotificationItem {
    const key = notificationLabelKey(entry.type)
    const params = paramsOf(entry)
    return {
      id: entry.id,
      type: entry.type,
      title: words(`${key}.title`, params) ?? labels.t('fallbackTitle'),
      body: words(`${key}.body`, params),
      link: linkOf(entry),
      at: entry.at,
      read: entry.readAt !== null,
      channels: entry.channels,
      actor: entry.actor,
      workspace: entry.workspace,
      data: entry.data,
    }
  }

  const needs = (name: string): never => {
    throw new Error(`[nuxt-backend] useNotifications() needs \`${name}\` re-exported from setupNotifications() in backend/notifications.ts (\`export const { ${name} } = notifications.api\`), or pass { api }.`)
  }

  return {
    items,
    unreadCount: computed(() => {
      if (noInbox.value) return 0
      // Without the counter, the loaded page is the best answer there is.
      return count.data.value?.count ?? (api.getUnreadCount ? 0 : entries.value.filter(entry => entry.readAt === null).length)
    }),
    hasMoreUnread: computed(() => !noInbox.value && count.data.value?.more === true),
    isSignedIn: computed(() => !signedOut.value),
    hasInbox: computed(() => !noInbox.value),
    isLoading: computed(() => authLoading.value || (!noInbox.value && Boolean(page) && page!.value.status === 'pending' && entries.value.length === 0)),
    isPending,
    isLoadingMore: computed(() => !noInbox.value && Boolean(page) && page!.value.status === 'pending' && entries.value.length > 0),
    canLoadMore: computed(() => !noInbox.value && Boolean(page) && page!.value.canLoadMore),
    error: computed(() => failure.value ?? (noInbox.value ? null : page?.value.status === 'error' ? failureOf(page.value.error) : count.error.value)),
    markRead: ids => run(async () => {
      if (ids.length === 0) return
      if (!runMark) needs('markNotificationsRead')
      for (let from = 0; from < ids.length; from += 200) await runMark!({ ids: ids.slice(from, from + 200) })
    }),
    markAllRead: () => run(async () => {
      if (!runMark) needs('markNotificationsRead')
      // Every one, however many: each call marks a batch. One that marks none and still finds more would loop forever, so it stops there.
      for (;;) {
        const { marked, done } = await runMark!({ all: true })
        if (done) return
        if (marked === 0) throw new Error('[nuxt-backend] markAllRead: a call marked no notification read and more are left; try again.')
      }
    }),
    loadMore: () => {
      if (page?.value.canLoadMore) page.value.loadMore(limit.value)
    },
  }
}
