import { computed, ref, useId, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue'
import { busyAttributes } from '../a11y'
import { type NotificationItem, type NotificationsApiRefs, useNotifications, type UseNotificationsReturn } from './use-notifications'
import { type LabelGroupOverrides, useLabels, type UseLabelsReturn } from './use-labels'

/**
 * Where the inbox is: nothing to read yet, nothing in it, notifications to
 * read, marking them read, a failed read, or a caller who has no inbox
 * (signed out, or an administrator acting as the account).
 */
export type NotificationInboxState = 'loading' | 'empty' | 'ready' | 'pending' | 'error' | 'refused'

export interface UseNotificationInboxOptions {
  /** Copy for this inbox, over app config and the translations. */
  labels?: MaybeRefOrGetter<LabelGroupOverrides<'notifications'> | undefined>
  /** Notifications per page (reactive), at most 50. Default 20. */
  limit?: MaybeRefOrGetter<number | undefined>
  /** Override the injected `api.notifications` namespace. */
  api?: NotificationsApiRefs
}

export interface UseNotificationInboxReturn {
  /** The notifications behind it: the list, the unread count and the actions. */
  notifications: UseNotificationsReturn
  /** Where the inbox is. */
  state: ComputedRef<NotificationInboxState>
  /** Whether the list is open. */
  open: Readonly<Ref<boolean>>
  /** The button's name, with the unread count in it: "Notifications, 3 unread". */
  bellName: ComputedRef<string>
  /** The count the button shows: `''` for none, "99+" past what is counted exactly. */
  countText: ComputedRef<string>
  /** Mark one read, then close the list: what following a notification does. */
  follow: (item: NotificationItem) => void
  /** The inbox's words, for markup of your own. */
  labels: UseLabelsReturn<'notifications'>
  /** Attribute bindings, with the accessibility attributes and the handlers, for markup of your own. */
  bind: {
    /** The wrapper: `data-notifications="root"`, `data-state`, busy while it loads or marks. */
    root: ComputedRef<Record<string, unknown>>
    /** The button that opens the list: `popovertarget`, and its name with the unread count. */
    bell: ComputedRef<Record<string, unknown>>
    /** The count on the button, hidden from assistive technology: the name already says it. */
    count: ComputedRef<Record<string, unknown>>
    /** The list's surface: a non-modal popover, named by its heading. */
    panel: ComputedRef<Record<string, unknown>>
    /** The list's heading. */
    heading: ComputedRef<Record<string, unknown>>
    /** The list element. */
    list: ComputedRef<Record<string, unknown>>
    /** One notification's row. */
    item: (item: NotificationItem) => Record<string, unknown>
    /** The mark-all-read button. */
    markAll: ComputedRef<Record<string, unknown>>
    /** The button that loads older notifications. */
    more: ComputedRef<Record<string, unknown>>
    /** The polite note while the first page loads. */
    loading: ComputedRef<Record<string, unknown>>
    /** The polite note when there is nothing to read. */
    empty: ComputedRef<Record<string, unknown>>
    /** The failure's alert. */
    error: ComputedRef<Record<string, unknown>>
  }
}

/**
 * `<NotificationInbox>` without its markup: the notifications, where the
 * inbox is, the button's name with the unread count in it, and the
 * bindings for a button and a list that open on the browser's own popover.
 * Escape closes the list and returns focus to the button, as the browser
 * does for any popover.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const inbox = useNotificationInbox()
 * </script>
 * <template>
 *   <button v-bind="inbox.bind.bell.value">{{ inbox.bellName.value }}</button>
 *   <div v-bind="inbox.bind.panel.value">
 *     <a v-for="item in inbox.notifications.items.value" :key="item.id" :href="item.link ?? undefined">{{ item.title }}</a>
 *   </div>
 * </template>
 * ```
 */
export function useNotificationInbox(options: UseNotificationInboxOptions = {}): UseNotificationInboxReturn {
  const notifications = useNotifications({ api: options.api, limit: options.limit, labels: options.labels })
  const labels = useLabels('notifications', options.labels)
  const { t } = labels
  const id = useId()
  const ids = { panel: `${id}-panel`, heading: `${id}-heading`, error: `${id}-error` }
  const open = ref(false)

  const state = computed<NotificationInboxState>(() => {
    if (!notifications.hasInbox.value && !notifications.isLoading.value) return 'refused'
    if (notifications.error.value) return 'error'
    if (notifications.isLoading.value) return 'loading'
    if (notifications.isPending.value) return 'pending'
    return notifications.items.value.length === 0 ? 'empty' : 'ready'
  })

  const bellName = computed(() => {
    const count = notifications.unreadCount.value
    if (count === 0) return t('bellName')
    return notifications.hasMoreUnread.value ? t('bellNameUnreadMore', { count }) : t('bellNameUnread', { count })
  })
  const countText = computed(() => {
    const count = notifications.unreadCount.value
    if (count === 0) return ''
    return notifications.hasMoreUnread.value ? t('countMore', { count }) : String(count)
  })
  const busy = computed(() => state.value === 'loading' || state.value === 'pending')

  // The popover's own toggle keeps `open` in step, however it was closed.
  const onToggle = (event: Event) => {
    open.value = (event as ToggleEvent).newState === 'open'
  }

  function follow(item: NotificationItem): void {
    if (!item.read) void notifications.markRead([item.id]).catch(() => {})
    open.value = false
    const panel = typeof document === 'undefined' ? null : document.getElementById(ids.panel)
    panel?.hidePopover?.()
  }

  const bind: UseNotificationInboxReturn['bind'] = {
    root: computed(() => ({
      'data-notifications': 'root',
      'data-state': state.value,
      'data-open': open.value || undefined,
      'aria-busy': busy.value || undefined,
    })),
    bell: computed(() => ({
      'type': 'button',
      'data-notifications': 'bell',
      'data-unread': notifications.unreadCount.value > 0 || undefined,
      'popovertarget': ids.panel,
      'aria-controls': ids.panel,
      'aria-haspopup': 'dialog',
      'aria-expanded': open.value,
    })),
    count: computed(() => ({ 'data-notifications': 'count', 'aria-hidden': 'true' })),
    panel: computed(() => ({
      'id': ids.panel,
      'popover': 'auto',
      'role': 'dialog',
      'aria-labelledby': ids.heading,
      'data-notifications': 'panel',
      'aria-busy': busy.value || undefined,
      'onToggle': onToggle,
    })),
    heading: computed(() => ({ 'id': ids.heading, 'data-notifications': 'heading' })),
    list: computed(() => ({ 'data-notifications': 'list', 'aria-labelledby': ids.heading })),
    item: item => ({
      'data-notifications': 'item',
      'data-state': item.read ? 'read' : 'unread',
      'data-type': item.type,
    }),
    markAll: computed(() => ({
      'type': 'button',
      'data-notifications': 'mark-all',
      ...busyAttributes(state.value === 'pending'),
      'aria-disabled': state.value === 'pending' || notifications.unreadCount.value === 0 ? 'true' : undefined,
      'onClick': () => {
        if (state.value !== 'pending' && notifications.unreadCount.value > 0) void notifications.markAllRead().catch(() => {})
      },
    })),
    more: computed(() => ({
      'type': 'button',
      'data-notifications': 'more',
      ...busyAttributes(notifications.isLoadingMore.value),
      'onClick': () => {
        if (!notifications.isLoadingMore.value) notifications.loadMore()
      },
    })),
    loading: computed(() => ({ 'role': 'status', 'aria-live': 'polite', 'data-notifications': 'loading' })),
    empty: computed(() => ({ 'role': 'status', 'aria-live': 'polite', 'data-notifications': 'empty' })),
    error: computed(() => ({ 'id': ids.error, 'role': 'alert', 'data-notifications': 'error' })),
  }

  return { notifications, state, open, bellName, countText, follow, labels, bind }
}
