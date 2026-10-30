<script setup lang="ts">
/**
 * The Announcements tab's composer: the notice, its link and expiry, and
 * the email that may go with it, published in one step.
 *
 * Internal: a part of `AdminAnnouncements.vue`.
 *
 * @internal
 */
import type { AnnouncementsTab } from './admin-announcements-tab'

const props = defineProps<{ tab: AnnouncementsTab }>()
const { t, draft, topics, running, busy, id } = props.tab
</script>

<template>
  <form
    data-admin="announcements-compose"
    :aria-labelledby="`${id}-compose`"
    @submit.prevent="tab.publish"
  >
    <h3 :id="`${id}-compose`">
      {{ t('announcements.composeTitle') }}
    </h3>
    <p data-admin="hint">
      {{ t('announcements.composeHint') }}
    </p>
    <label>
      {{ t('announcements.message') }}
      <textarea
        v-model="draft.message"
        required
        rows="2"
        :maxlength="tab.messageMax"
        :aria-describedby="`${id}-message-hint`"
      />
      <span
        :id="`${id}-message-hint`"
        data-admin="hint"
      >{{ t('announcements.messageHint', { max: tab.messageMax }) }}</span>
    </label>
    <div data-admin="announcements-row">
      <label>
        {{ t('announcements.linkUrl') }}
        <input
          v-model="draft.linkUrl"
          type="text"
          inputmode="url"
          :aria-describedby="`${id}-link-hint`"
        >
        <span
          :id="`${id}-link-hint`"
          data-admin="hint"
        >{{ t('announcements.linkUrlHint') }}</span>
      </label>
      <label>
        {{ t('announcements.linkLabel') }}
        <input
          v-model="draft.linkLabel"
          type="text"
          maxlength="40"
        >
      </label>
      <label>
        {{ t('announcements.expiresAt') }}
        <input
          v-model="draft.expiresAt"
          type="datetime-local"
          required
        >
      </label>
    </div>
    <label data-admin="announcements-toggle">
      <input
        v-model="draft.withBroadcast"
        type="checkbox"
      >
      {{ t('announcements.withBroadcast') }}
    </label>
    <fieldset
      v-if="draft.withBroadcast"
      data-admin="announcements-email"
    >
      <legend>{{ t('announcements.audience') }}</legend>
      <label
        v-for="audience in (['accounts', 'waitlist'] as const)"
        :key="audience"
      >
        <input
          v-model="draft.audience"
          type="radio"
          :value="audience"
          :name="`${id}-audience`"
        >
        {{ t(`announcements.audiences.${audience}`) }}
      </label>
      <label v-if="draft.audience === 'accounts'">
        {{ t('announcements.topic') }}
        <select v-model="draft.topic">
          <option
            v-for="topic in topics"
            :key="topic.key"
            :value="topic.key"
          >
            {{ topic.name }}
          </option>
        </select>
      </label>
      <label>
        {{ t('announcements.subject') }}
        <input
          v-model="draft.subject"
          type="text"
          required
          maxlength="150"
        >
      </label>
      <label>
        {{ t('announcements.body') }}
        <textarea
          v-model="draft.body"
          required
          rows="6"
          :aria-describedby="`${id}-body-hint`"
        />
        <span
          :id="`${id}-body-hint`"
          data-admin="hint"
        >{{ t('announcements.bodyHint') }}</span>
      </label>
    </fieldset>
    <button
      type="submit"
      data-admin="announcements-publish"
      :aria-disabled="busy('publish')"
    >
      {{ running === 'publish' ? t('announcements.publishing') : t('announcements.publish') }}
    </button>
  </form>
</template>
