<script setup lang="ts">
/**
 * The Waitlist tab's filter: the status listed, a domain, a source and one
 * answer, applied when the form is sent.
 *
 * Internal: a part of `AdminWaitlist.vue`.
 *
 * @internal
 */
import type { WaitlistTab } from './admin-waitlist-tab'

const props = defineProps<{ tab: WaitlistTab }>()
const { t, filter, questions } = props.tab
</script>

<template>
  <form
    data-admin="waitlist-filter"
    @submit.prevent="tab.applyFilter"
  >
    <label>
      {{ t('waitlist.status') }}
      <select v-model="filter.status">
        <option
          v-for="status in tab.statuses"
          :key="status"
          :value="status"
        >
          {{ tab.statusName(status) }}
        </option>
      </select>
    </label>
    <label>
      {{ t('waitlist.domain') }}
      <input
        v-model="filter.domain"
        type="text"
        spellcheck="false"
        autocomplete="off"
      >
    </label>
    <label>
      {{ t('waitlist.source') }}
      <input
        v-model="filter.source"
        type="text"
        spellcheck="false"
        autocomplete="off"
      >
    </label>
    <label v-if="Object.keys(questions).length">
      {{ t('waitlist.question') }}
      <select
        v-model="filter.question"
        @change="filter.answer = ''"
      >
        <option value="">{{ t('waitlist.anyQuestion') }}</option>
        <option
          v-for="question in Object.keys(questions)"
          :key="question"
          :value="question"
        >
          {{ question }}
        </option>
      </select>
    </label>
    <label v-if="filter.question">
      {{ t('waitlist.answer') }}
      <select v-model="filter.answer">
        <option value="" />
        <option
          v-for="choice in questions[filter.question]"
          :key="choice"
          :value="choice"
        >
          {{ choice }}
        </option>
      </select>
    </label>
    <button
      type="submit"
      data-admin="waitlist-filter-apply"
    >
      {{ t('waitlist.filter') }}
    </button>
    <button
      type="button"
      data-admin="waitlist-filter-clear"
      @click="tab.clearFilter"
    >
      {{ t('waitlist.clearFilter') }}
    </button>
  </form>
</template>
