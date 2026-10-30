<script setup lang="ts">
import type { NotificationInboxBellProps } from '../../parts'

/** The button of `<NotificationInbox>`: a bell, the unread count on it, and a name that says the count. */
defineOptions({ name: 'NotificationInboxBell' })
defineProps<NotificationInboxBellProps>()
</script>

<template>
  <button
    v-bind="inbox.bind.bell.value"
    data-notifications="bell"
  >
    <svg
      data-notifications="icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      focusable="false"
    >
      <path
        data-notifications="icon"
        d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6.5H4c.5-1 2-2.5 2-6.5Zm4 9.5a2 2 0 0 0 4 0"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
    <span data-notifications="name">{{ inbox.bellName.value }}</span>
    <span
      v-if="inbox.countText.value"
      v-bind="inbox.bind.count.value"
    >{{ inbox.countText.value }}</span>
  </button>
</template>
