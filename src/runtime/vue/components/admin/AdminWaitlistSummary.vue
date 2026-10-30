<script setup lang="ts">
/**
 * The Waitlist tab's summary: a count per status, the room a wave has (the
 * sign-in codes left this hour and the email plan's quota today), and the
 * launch-news contacts that wait or drifted.
 *
 * Internal: a part of `AdminWaitlist.vue`.
 *
 * @internal
 */
import type { WaitlistConsole } from '../../composables/use-waitlist'
import type { WaitlistTab } from './admin-waitlist-tab'

defineProps<{ tab: WaitlistTab, data: WaitlistConsole }>()
</script>

<template>
  <ul
    data-admin="waitlist-counts"
    :aria-label="tab.t('waitlist.counts')"
  >
    <li
      v-for="status in tab.statuses"
      :key="status"
      :data-state="status"
    >
      <span data-admin="waitlist-count-name">{{ tab.statusName(status) }}</span>
      <strong data-admin="waitlist-count">{{ tab.t('waitlist.count', { count: data.counts[status] }) }}</strong>
    </li>
  </ul>

  <section
    data-admin="waitlist-caps"
    :aria-labelledby="`${tab.id}-caps`"
  >
    <h3 :id="`${tab.id}-caps`">
      {{ tab.t('waitlist.capsTitle') }}
    </h3>
    <p>{{ tab.t('waitlist.capsHint') }}</p>
    <p
      v-if="tab.caps.value?.codes"
      data-admin="waitlist-cap-codes"
    >
      {{ tab.t('waitlist.capCodes', { left: tab.caps.value.codes.left, limit: tab.caps.value.codes.limit }) }}
    </p>
    <p
      v-if="tab.caps.value?.emails"
      data-admin="waitlist-cap-emails"
    >
      {{ tab.t('waitlist.capEmails', { used: tab.caps.value.emails.used, limit: tab.caps.value.emails.limit ?? '∞' }) }}
    </p>
    <p
      v-else-if="tab.caps.value !== undefined"
      data-admin="waitlist-cap-unknown"
    >
      {{ tab.t('waitlist.capUnknown') }}
    </p>
    <p
      v-if="data.mirror.drift"
      data-admin="waitlist-drift"
      role="status"
    >
      {{ tab.t('waitlist.mirrorDrift', { count: data.mirror.drift }) }}
    </p>
    <p
      v-if="data.mirror.pending"
      data-admin="waitlist-pending"
    >
      {{ tab.t('waitlist.mirrorPending', { count: data.mirror.pending }) }}
    </p>
  </section>
</template>
