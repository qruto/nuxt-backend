<script setup lang="ts">
import { useNotificationInbox } from '../../composables/use-notification-inbox'
import type { LabelGroupOverrides } from '../../composables/use-labels'
import type { NotificationInboxSlots } from './notification-inbox'

/**
 * What the app told a person, in the app: a button whose accessible name
 * carries the unread count, and the list it opens on the browser's own
 * popover, newest first. Opening a notification marks it read; the list
 * marks every one read at once and loads older ones on request. Every
 * event the backend records about the person reaches it live, worded in the
 * active language, with nothing to wire per kind. Renders nothing for a
 * signed-out visitor, or while an administrator acts as the account. The
 * logic is `useNotificationInbox`, so markup of
 * your own can do the same with its bindings.
 *
 * @example
 * ```vue
 * <header>
 *   <NotificationInbox />
 * </header>
 * ```
 */
defineOptions({ name: 'NotificationInbox' })

const props = defineProps<{
  /** Notifications per page, at most 50. Default 20. */
  limit?: number
  /** Copy for this inbox, over app config and the translations. */
  labels?: LabelGroupOverrides<'notifications'>
}>()

defineEmits({})
defineSlots<NotificationInboxSlots>()

const inbox = useNotificationInbox({ labels: () => props.labels, limit: () => props.limit })
const { notifications, state, bind } = inbox
const { t, errorMessage } = inbox.labels
</script>

<template>
  <div
    v-if="state !== 'refused'"
    v-bind="bind.root.value"
  >
    <NotificationInboxBell :inbox="inbox" />
    <div v-bind="bind.panel.value">
      <div data-notifications="header">
        <h2 v-bind="bind.heading.value">
          {{ t('listName') }}
        </h2>
        <button v-bind="bind.markAll.value">
          {{ state === 'pending' ? t('markingRead') : t('markAllRead') }}
        </button>
      </div>
      <p
        v-if="state === 'loading'"
        v-bind="bind.loading.value"
      >
        {{ t('loadingInbox') }}
      </p>
      <p
        v-if="notifications.error.value"
        v-bind="bind.error.value"
      >
        {{ errorMessage(notifications.error.value) }}
      </p>
      <ul
        v-if="notifications.items.value.length > 0"
        v-bind="bind.list.value"
      >
        <template
          v-for="notification in notifications.items.value"
          :key="notification.id"
        >
          <slot
            name="notification"
            :notification="notification"
            :mark-read="() => notifications.markRead([notification.id])"
          >
            <NotificationInboxItem
              :inbox="inbox"
              :notification="notification"
            />
          </slot>
        </template>
      </ul>
      <slot
        v-else-if="state === 'empty'"
        name="empty"
      >
        <p v-bind="bind.empty.value">
          {{ t('emptyInbox') }}
        </p>
      </slot>
      <button
        v-if="notifications.canLoadMore.value"
        v-bind="bind.more.value"
      >
        {{ t('loadMore') }}
      </button>
    </div>
  </div>
</template>
