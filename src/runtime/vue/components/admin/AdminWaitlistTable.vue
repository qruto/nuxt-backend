<script setup lang="ts">
/**
 * The waiting people, oldest first: a tick to choose them, when they were
 * verified, where they came from, their answers, the friends who joined
 * through them, whether they asked for launch news, and a note.
 *
 * Internal: a part of `AdminWaitlist.vue`.
 *
 * @internal
 */
import type { WaitlistTab } from './admin-waitlist-tab'

const props = defineProps<{ tab: WaitlistTab }>()
const { t, selected, entries } = props.tab
</script>

<template>
  <table data-admin="waitlist-table">
    <thead>
      <tr>
        <th scope="col">
          <input
            type="checkbox"
            :checked="tab.allSelected.value"
            :aria-label="t('waitlist.selectAll')"
            @change="tab.toggleAll(($event.target as HTMLInputElement).checked)"
          >
        </th>
        <th
          v-for="column in ['email', 'joinedAt', 'source', 'answers', 'boost', 'news', 'note'] as const"
          :key="column"
          scope="col"
        >
          {{ t(`waitlist.${column}`) }}
        </th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="entry in entries"
        :key="entry.id"
        :data-state="entry.status"
      >
        <td>
          <input
            type="checkbox"
            :checked="selected.includes(entry.id)"
            :aria-label="t('waitlist.select', { email: entry.email })"
            @change="tab.toggle(entry.id, ($event.target as HTMLInputElement).checked)"
          >
        </td>
        <th scope="row">
          {{ entry.email }}
        </th>
        <td>{{ tab.date(entry.verifiedAt) }}</td>
        <td>{{ entry.source }}</td>
        <td>{{ tab.answersText(entry) }}</td>
        <td>{{ entry.boost }}</td>
        <td :data-state="entry.mirror ?? 'none'">
          {{ entry.launchNews ? t('waitlist.newsYes') : t('waitlist.newsNo') }}
          <span v-if="entry.mirror === 'drift'">({{ t('waitlist.mirrorStates.drift') }})</span>
        </td>
        <td>
          <form
            data-admin="waitlist-note"
            @submit.prevent="tab.saveNote(entry.id, ($event.target as HTMLFormElement).note.value)"
          >
            <input
              name="note"
              type="text"
              maxlength="500"
              :value="entry.note ?? ''"
              :placeholder="t('waitlist.notePlaceholder')"
              :aria-label="t('waitlist.note')"
            >
            <button type="submit">
              {{ t('waitlist.saveNote') }}
            </button>
          </form>
        </td>
      </tr>
    </tbody>
  </table>
</template>
