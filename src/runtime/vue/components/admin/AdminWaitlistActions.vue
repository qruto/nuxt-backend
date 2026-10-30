<script setup lang="ts">
/**
 * What an administrator does with the waiting people: admit the next N in
 * line, or approve, decline or remove as abuse the entries ticked.
 *
 * Internal: a part of `AdminWaitlist.vue`.
 *
 * @internal
 */
import type { WaitlistTab } from './admin-waitlist-tab'

const props = defineProps<{ tab: WaitlistTab }>()
const { t, running, selected, next } = props.tab

/** A button's `aria-disabled`: busy while its change runs, and unavailable until something is ticked. */
const state = (key: string) => props.tab.busy(key) ?? (selected.value.length ? undefined : 'true')
</script>

<template>
  <form
    data-admin="waitlist-wave"
    @submit.prevent="tab.approveNext"
  >
    <label>
      {{ t('waitlist.approveCount') }}
      <input
        v-model="next"
        type="number"
        min="1"
        :max="tab.waveMax"
        inputmode="numeric"
      >
    </label>
    <button
      type="submit"
      data-admin="waitlist-approve-next"
      :aria-disabled="tab.busy('next')"
    >
      {{ running === 'next' ? t('waitlist.approving') : t('waitlist.approveNext') }}
    </button>
  </form>
  <div data-admin="waitlist-actions">
    <button
      type="button"
      data-admin="waitlist-approve"
      :aria-disabled="state('approve')"
      @click="tab.approve"
    >
      {{ running === 'approve' ? t('waitlist.approving') : t('waitlist.approve') }}
    </button>
    <button
      type="button"
      data-admin="waitlist-decline"
      :aria-disabled="state('decline')"
      @click="tab.decline(false)"
    >
      {{ running === 'decline' ? t('waitlist.declining') : t('waitlist.decline') }}
    </button>
    <button
      type="button"
      data-admin="waitlist-abuse"
      :aria-disabled="state('abuse')"
      @click="tab.decline(true)"
    >
      {{ running === 'abuse' ? t('waitlist.declining') : t('waitlist.declineAbuse') }}
    </button>
  </div>
</template>
