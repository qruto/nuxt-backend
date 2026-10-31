<script setup lang="ts">
import { computed, resolveComponent } from 'vue'
import { formatBillingDate } from '../../composables/billing-format'
import type { NotificationInboxItemProps } from '../../parts'

/** One notification of `<NotificationInbox>`: its title, the line under it and when it happened. It links where it happened when it has a place to go, else it is a button that marks it read. */
defineOptions({ name: 'NotificationInboxItem' })
const props = defineProps<NotificationInboxItemProps>()
const { t, locale } = props.inbox.labels
const when = computed(() => formatBillingDate(props.notification.at, { dateStyle: 'medium', timeStyle: 'short' }, locale.value))
const iso = computed(() => new Date(props.notification.at).toISOString())
const link = resolveComponent('NuxtLink')

// What the row is, and what pressing it does. A link follows its notification
// and marks it read; one with nowhere to go is read where it is (a button that
// keeps the list open); one already read is only text.
const control = computed(() => {
  const { notification, inbox } = props
  if (notification.link) return { is: link, attributes: { to: notification.link }, press: () => inbox.follow(notification) }
  if (notification.read) return { is: 'div', attributes: {}, press: undefined }
  return { is: 'button', attributes: { type: 'button' }, press: () => inbox.notifications.markRead([notification.id]).catch(() => {}) }
})
</script>

<template>
  <li
    v-bind="inbox.bind.item(notification)"
    data-notifications="item"
  >
    <component
      :is="control.is"
      v-bind="control.attributes"
      data-notifications="link"
      @click="control.press?.()"
    >
      <span
        v-if="!notification.read"
        data-notifications="unread-mark"
      >{{ t('unreadMark') }}</span>
      <span data-notifications="title">{{ notification.title }}</span>
      <span
        v-if="notification.body"
        data-notifications="body"
      >{{ notification.body }}</span>
      <time
        data-notifications="time"
        :datetime="iso"
      >{{ when }}</time>
    </component>
  </li>
</template>
