<script setup lang="ts">
/**
 * The admin console's Moderation tab: what the safety classifier flagged
 * (`setupAi({ moderation })`), newest first or only the flags in a category
 * the policy escalates, a page at a time: when, who, what in the app's
 * words, the categories, and whether the content was blocked. Categories
 * only, never the content. The console shows it once `backend/ai.ts`
 * re-exports `listModerationFlags`.
 *
 * Internal: the console's tab.
 *
 * @internal
 */
import { computed } from 'vue'
import AdminTabStatus from './AdminTabStatus.vue'
import { useModerationTab } from './admin-moderation-tab'

const tab = useModerationTab()
const { t, escalated, pages, flags } = tab
const filters = computed(() => [
  { key: 'all', label: t('moderation.all'), pressed: !escalated.value, show: () => (escalated.value = false) },
  { key: 'escalated', label: t('moderation.escalated'), pressed: escalated.value, show: () => (escalated.value = true) },
])
</script>

<template>
  <section
    data-admin="moderation"
    :aria-busy="tab.isLoading.value || undefined"
  >
    <p
      v-if="tab.isRefused.value"
      data-admin="refused"
      role="status"
    >
      {{ t('moderation.refused') }}
    </p>
    <template v-else-if="flags">
      <p
        :id="`${tab.id}-intro`"
        data-admin="moderation-intro"
      >
        {{ t('moderation.intro') }}
      </p>
      <div
        role="group"
        :aria-label="t('moderation.filter')"
        data-admin="moderation-filter"
      >
        <button
          v-for="filter in filters"
          :key="filter.key"
          type="button"
          :aria-pressed="filter.pressed"
          @click="filter.show()"
        >
          {{ filter.label }}
        </button>
      </div>
      <p
        v-if="!flags.length"
        data-admin="moderation-empty"
        role="status"
      >
        {{ escalated ? t('moderation.emptyEscalated') : t('moderation.empty') }}
      </p>
      <table
        v-else
        data-admin="moderation-flags"
        :aria-describedby="`${tab.id}-intro`"
      >
        <caption>{{ t('moderation.caption') }}</caption>
        <thead>
          <tr>
            <th scope="col">
              {{ t('moderation.when') }}
            </th>
            <th scope="col">
              {{ t('moderation.who') }}
            </th>
            <th scope="col">
              {{ t('moderation.what') }}
            </th>
            <th scope="col">
              {{ t('moderation.categories') }}
            </th>
            <th scope="col">
              {{ t('moderation.outcome') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="flag in flags"
            :key="flag.id"
            data-admin="moderation-flag"
            :data-blocked="flag.blocked || undefined"
            :data-escalated="flag.escalate || undefined"
          >
            <th scope="row">
              {{ tab.when(flag.at) }}
            </th>
            <td>{{ flag.userId ?? t('moderation.nobody') }}</td>
            <td>{{ tab.what(flag) }}</td>
            <td>{{ flag.categories.join(', ') }}</td>
            <td>
              {{ tab.outcome(flag) }}
              <strong
                v-if="flag.escalate"
                data-admin="moderation-escalated"
              >{{ t('moderation.escalatedMark') }}</strong>
            </td>
          </tr>
        </tbody>
      </table>
      <nav
        v-if="pages.hasPrevious.value || pages.hasMore.value"
        data-admin="moderation-pages"
      >
        <button
          type="button"
          :disabled="!pages.hasPrevious.value"
          @click="pages.previous()"
        >
          {{ t('moderation.newer') }}
        </button>
        <button
          type="button"
          :disabled="!pages.hasMore.value"
          @click="pages.next()"
        >
          {{ t('moderation.older') }}
        </button>
      </nav>
    </template>
    <AdminTabStatus
      v-else-if="tab.error.value || tab.isLoading.value"
      :error="tab.error.value"
    />
  </section>
</template>
